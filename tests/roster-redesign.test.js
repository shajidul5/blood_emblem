import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const root = new URL('../', import.meta.url);
const json = async (file) => JSON.parse(await readFile(new URL(file, root), 'utf8'));
const catalog = await json('assets/character/roster-redesign.json');
const directions = ['south', 'south-east', 'east', 'north-east', 'north', 'north-west', 'west', 'south-west'];

async function nativeSprite(file, size) {
  const png = await readFile(new URL(file, root));
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', file);
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
  assert.equal(width, height, `${file}: square native canvas`);
  assert.ok(size ? width === size : [48, 60, 64, 68].includes(width), `${file}: native frame size`);
  assert.equal(png[24], 8, `${file}: 8-bit art`);
  assert.equal(png[25], 6, `${file}: RGBA transparency`);
  return createHash('sha256').update(png).digest('hex');
}

for (const [name, entry] of Object.entries(catalog.characters)) {
  test(`${name} redesign has eight native facings and complete matching action cycles`, async () => {
    assert.ok(entry.characterId || entry.source === 'user-supplied');
    const rotations = await readdir(new URL(`${entry.root}/rotations/`, root));
    assert.deepEqual(rotations.filter(file => file.endsWith('.png')).sort(), directions.map(d => `${d}.png`).sort());
    for (const direction of directions) {
      await nativeSprite(`${entry.root}/rotations/${direction}.png`, entry.nativeRotationSize ?? 48);
      for (const clip of Object.values(entry.animations)) {
        const directory = `${entry.root}/animations/${clip.directory}/${direction}/`;
        const frames = (await readdir(new URL(directory, root))).filter(file => /^frame_\d+\.png$/.test(file)).sort();
        assert.deepEqual(frames, Array.from({ length: clip.frames }, (_, i) => `frame_${String(i).padStart(3, '0')}.png`));
        const size = typeof clip.nativeSize === 'number' ? clip.nativeSize : clip.nativeSize?.[direction];
        const hashes = await Promise.all(frames.map(file => nativeSprite(directory + file, size)));
        assert.ok(new Set(hashes).size > 1, `${name} ${clip.directory} ${direction}: actual animation`);
      }
    }
  });
}

test('all approved roster battle artwork remains byte-identical through map-only revisions', async () => {
  for (const [file, hash] of Object.entries(catalog.preservedBattleHashes)) {
    const png = await readFile(new URL(`assets/battle/${file}`, root));
    assert.equal(createHash('sha256').update(png).digest('hex'), hash, file);
  }
});

test('map revisions retain Maria and Bartz native reference art and declare style references', async () => {
  assert.equal(catalog.nativeRotationSize, 48);
  assert.equal(catalog.resampling, false);
  assert.deepEqual(catalog.styleReferences, ['Maria', 'Bartz']);
  const anchors = ['assets/character/Maria/Idle/rotations/south.png', 'assets/character/Bartz/Idle/rotations/south.png'];
  for (const [file, hash] of Object.entries(catalog.preservedReferenceHashes)) {
    const png = await readFile(new URL(file, root));
    assert.equal(createHash('sha256').update(png).digest('hex'), hash, file);
    await nativeSprite(file, 48);
  }
  assert.equal(Object.keys(catalog.preservedReferenceHashes).length, 16);
  for (const entry of Object.values(catalog.characters)) {
    if (entry.source === 'user-supplied') continue;
    assert.ok(anchors.includes(entry.styleAnchor ?? entry.styleReference));
    assert.ok(entry.sourceImageJob);
  }
  const { fighters } = await json('assets/battle/manifest.json');
  for (const key of ['stark-archer', 'stark-sniper', 'seymour-priest', 'seymour-bishop',
    'lena-thief', 'lena-assassin-sword', 'lena-assassin-bow', 'rictor-oathkeeper',
    'rictor-templar-lance', 'rictor-templar-light']) {
    const fighter = fighters[key];
    for (const file of [fighter.idle, fighter.idleLoop?.file, fighter.attack?.file, fighter.critical?.file,
      fighter.staff?.idle, fighter.staff?.cast.file, ...Object.values(fighter.thrown ?? {}).map(clip => clip.file)].filter(Boolean))
      assert.ok(catalog.preservedBattleHashes[file], `${key}: protect ${file}`);
  }
});

test('Lena and supplied Rictor sets retain all class-specific map actions and native sizing', () => {
  for (const [name, size, actions] of [
    ['lena', 48, ['Walking', 'Sword Attack']],
    ['assassin', 48, ['Walking', 'Sword Attack', 'Bow Attack']],
    ['rictor', 48, ['Walking', 'Spear Attack']],
    ['templar', 48, ['Walking', 'Spear Attack', 'Holy Attack']],
    ['oathbound', 48, ['Walking', 'Spear Attack', 'Dark Attack', 'Sword Attack']],
  ]) {
    const entry = catalog.characters[name];
    assert.equal(entry.nativeRotationSize, size, name);
    if (entry.source !== 'user-supplied')
      assert.equal(entry.styleAnchor, 'assets/character/Maria/Idle/rotations/south.png');
    assert.deepEqual(Object.keys(entry.animations), actions);
    for (const clip of Object.values(entry.animations)) {
      assert.ok(clip.group || entry.source === 'user-supplied');
      assert.deepEqual(Object.keys(clip.nativeSize).sort(), [...directions].sort());
    }
  }
});

test('Sniper and the redesigned Veilstalker use distinct outfits and authored release cues', async () => {
  const { fighters } = await json('assets/battle/manifest.json');
  const covenant = (await json('assets/covenant/manifest.json')).fighters.veilstalker;
  assert.equal(covenant.activeMapRoot, catalog.characters.veilstalker.root);
  assert.equal(covenant.map.archived, true);
  for (const [mapName, battleName] of [['stark', 'archer'], ['sniper', 'sniper'], ['veilstalker', 'veilstalker']]) {
    const entry = catalog.characters[mapName];
    assert.equal(entry.battleReference, `assets/battle/${fighters[`stark-${battleName}`].idle}`);
    assert.deepEqual(Object.keys(entry.animations), ['Walking', 'Bow Attack']);
    assert.equal(entry.animations.Walking.frames, 8);
    assert.equal(entry.animations['Bow Attack'].frames, 9);
  }
  for (const [key, cue, criticalCue] of [['stark-sniper', 15, 23], ['stark-veilstalker', 5, 8]]) {
    const fighter = fighters[key];
    assert.ok(fighter.casting);
    assert.equal(fighter.attack.impactFrame, cue);
    assert.equal(fighter.critical.impactFrame, criticalCue);
    for (const clip of [fighter.idleLoop, fighter.attack, fighter.critical].filter(Boolean)) {
      const png = await readFile(new URL(`assets/battle/${clip.file}`, root));
      assert.equal(png.readUInt32BE(16), 128 * clip.frames);
      assert.equal(png.readUInt32BE(20), 128);
    }
  }
  assert.notEqual(fighters['stark-sniper'].idleJob, fighters['stark-veilstalker'].idleJob);
  assert.notEqual(covenant.battle.attack.job, fighters['stark-veilstalker'].attack.job, 'original Covenant art remains archived');
});
