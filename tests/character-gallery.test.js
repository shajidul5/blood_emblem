import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { createServer } from 'vite';

let server, gallery, urls;
before(async () => {
  server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: 'custom' });
  gallery = await server.ssrLoadModule('/src/gallery/catalog.js');
  const paths = await readdir(new URL('../assets/', import.meta.url), { recursive: true });
  urls = Object.fromEntries(paths.filter((path) => path.endsWith('.png')).map((path) => {
    const key = `../../assets/${path.replaceAll('\\', '/')}`;
    return [key, key];
  }));
});
after(async () => { await server?.close(); });

test('gallery covers all 12 playable characters and exactly their implemented promotion branches', () => {
  assert.deepEqual(gallery.roster.map((profile) => profile.id),
    ['maria', 'bartz', 'cypher', 'seymour', 'stark', 'linus', 'rictor', 'lena', 'arlan', 'troy', 'eveline', 'corvis']);
  let count = 0;
  for (const profile of gallery.roster) {
    const branches = gallery.branchesFor(profile);
    assert.equal(branches.length, ['linus', 'stark'].includes(profile.id) ? 3 : 2);
    for (const branch of branches) {
      count++;
      const unit = gallery.unitFor(profile, branch.classId);
      assert.equal(unit.classId, branch.classId);
      assert.equal(unit.class, branch.definition.name);
      assert.ok(urls[`../../${unit.sprite}`], `${profile.name} ${unit.class}: portrait exists`);
      assert.ok(gallery.weaponsFor(profile, branch.classId).length);
      assert.equal(unit.maxHp, unit.hp);
    }
    assert.throws(() => gallery.unitFor(profile, 'nonexistent'), /Unknown promotion branch/);
  }
  assert.equal(count, 26);
});

test('every branch has its actual eight facings and walking frames, including weapon and support variants', () => {
  for (const profile of gallery.roster) for (const branch of gallery.branchesFor(profile)) {
    const unit = gallery.unitFor(profile, branch.classId);
    const clips = gallery.mapClipsFor(unit, urls);
    assert.equal(clips[0].name, 'Idle');
    const walking = clips.find((clip) => /walking/i.test(clip.name));
    assert.ok(walking, `${profile.name} ${branch.classId} walking`);
    for (const direction of gallery.directions) {
      assert.equal(clips[0].directions[direction].length, 1, `${unit.class} ${direction} idle`);
      assert.ok(walking.directions[direction].length > 1, `${unit.class} ${direction} walk`);
    }
    if (branch.classId === 'bloodsworn') assert.equal(walking.directions.south.length, 8);
    if (branch.classId === 'veilstalker') assert.equal(walking.directions.south.length, 6);
  }
  const maria = gallery.roster[0];
  const attacks = gallery.mapClipsFor(gallery.unitFor(maria, 'hunter'), urls);
  assert.ok(attacks.some((clip) => clip.name === 'Katana / Attack'));
  const linus = gallery.roster.find((profile) => profile.id === 'linus');
  assert.ok(gallery.mapClipsFor(gallery.unitFor(linus, 'cavalier'), urls).some((clip) => /sword/i.test(clip.name)));
});

test('battle catalogs reference complete native sheets and distinguish missing art from supported sets', async () => {
  for (const profile of gallery.roster) for (const branch of gallery.branchesFor(profile)) {
    const sets = gallery.battleSetsFor(profile, branch.classId);
    if (['seymour', 'arlan', 'troy', 'eveline', 'corvis'].includes(profile.id)) assert.equal(sets.length, 0);
    else assert.ok(sets.length, `${profile.name} ${branch.classId}`);
    for (const set of sets) {
      const clips = gallery.clipsFor(set.spec);
      assert.ok(clips.some((clip) => clip.name === 'Attack'));
      assert.ok(clips.some((clip) => clip.name === 'Critical'));
      for (const clip of clips) {
        const path = new URL(`../assets/battle/${clip.file}`, import.meta.url);
        const png = await readFile(path);
        assert.equal(png.readUInt32BE(16), set.spec.size * clip.frames, clip.file);
        assert.equal(png.readUInt32BE(20), set.spec.size, clip.file);
        assert.ok(clip.frameMs > 0);
      }
    }
  }
  const linus = gallery.roster.find((profile) => profile.id === 'linus');
  const bloodsworn = gallery.battleSetsFor(linus, 'bloodsworn')[0];
  assert.ok(gallery.clipsFor(bloodsworn.spec).some((clip) => clip.name === 'Support cast'));
  assert.ok(gallery.clipsFor(bloodsworn.spec).some((clip) => clip.name === 'Throw / critical'));
  const maria = gallery.roster[0];
  assert.ok(gallery.clipsFor(gallery.battleSetsFor(maria, 'ravager').find((set) => set.weapon.type === 'Sword').spec)
    .some((clip) => clip.name === 'Critical / plunge'));
});

test('effects include spell upgrades, promoted Light, staff magic and the Covenant rite without granting illegal weapons', async () => {
  const find = (id) => gallery.roster.find((profile) => profile.id === id);
  assert.deepEqual(gallery.effectsFor(find('rictor'), 'oathkeeper'), []);
  assert.deepEqual(gallery.effectsFor(find('rictor'), 'templar').map((entry) => entry.effect.key).sort(),
    ['aureole', 'light', 'lumen']);
  assert.ok(gallery.effectsFor(find('cypher'), 'sage').length >= 11);
  assert.ok(gallery.effectsFor(find('linus'), 'bloodsworn').some((entry) => entry.name === 'Blood Oath'));
  assert.deepEqual([...new Set(gallery.weaponsFor(find('linus'), 'bloodsworn').map((weapon) => weapon.type))],
    ['Spear', 'Blood Rite']);
  assert.ok(gallery.weaponsFor(find('maria'), 'ravager').some((weapon) => weapon.type === 'Gun'));
  for (const profile of gallery.roster) for (const branch of gallery.branchesFor(profile))
    for (const effect of gallery.effectsFor(profile, branch.classId))
      assert.ok((await stat(new URL(`../assets/battle/${effect.spec.file}`, import.meta.url))).isFile());
});

test('gallery is a separate build entry and never imports the game, Insight or save systems', async () => {
  const source = await readFile(new URL('../src/gallery/character-gallery.js', import.meta.url), 'utf8');
  const catalog = await readFile(new URL('../src/gallery/catalog.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source + catalog, /localStorage|sessionStorage|game\/save|game\/insight|main\.js/);
  const config = await readFile(new URL('../vite.config.js', import.meta.url), 'utf8');
  assert.match(config, /characterGallery: resolve\(root, 'character-gallery.html'\)/);
});

test('featured jailbreak enemies remain separate from the playable roster and expose their own battle art', () => {
  const lena = gallery.roster.find((profile) => profile.id === 'lena');
  assert.deepEqual(gallery.battleSetsFor(lena, 'thief').map((set) => set.key), ['lena-thief']);
  assert.deepEqual(gallery.battleSetsFor(lena, 'assassin').map((set) => set.key).sort(),
    ['lena-assassin-bow', 'lena-assassin-sword']);
  assert.deepEqual(gallery.adversaries.map((profile) => profile.id), ['undead', 'rotten']);
  for (const profile of gallery.adversaries) {
    assert.ok(!gallery.roster.includes(profile));
    assert.equal(gallery.branchesFor(profile).length, 1);
    assert.equal(gallery.weaponsFor(profile, profile.classId).length, 1);
    assert.equal(gallery.weaponsFor(profile, profile.classId)[0].id, profile.weaponId);
    const sets = gallery.battleSetsFor(profile, profile.classId);
    assert.equal(sets.length, 1);
    assert.ok(sets[0].spec.idleLoop);
    assert.equal(gallery.mapClipsFor(gallery.unitFor(profile, profile.classId), urls)[0].name, 'Idle');
  }
});
