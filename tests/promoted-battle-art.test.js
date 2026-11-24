import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { battleSpriteKey, battleIdleKey, staffBattleKey, battleThrow, supportsBattleScene,
  supportsStaffScene, battleImpactTime, thrownReturnMs } from '../src/battle/battle-animation.js';

const json = async (file) => JSON.parse(await readFile(new URL(`../${file}`, import.meta.url), 'utf8'));
const art = await json('assets/battle/manifest.json');
const cases = [
  ['veyr', 'paladin', 'genericPaladin', 'steel-lance', 'generic-paladin'],
  ['veyr', 'paladin', 'genericPaladin', 'steel-sword', 'generic-paladin-sword'],
  ['veyr', 'paladin', 'genericPaladin', 'hand-axe', 'generic-paladin-axe'],
  ['cathedral-general', 'general', 'generalSeverin', 'silver-lance', 'generic-general-spear'],
  ['bell-general', 'general', 'generalSeverin', 'hand-axe', 'generic-general-axe'],
  ['orsen', 'general', 'genericKnight', 'silver-lance', 'generic-general-spear'],
  ['church-sage', 'sage', 'genericSage', 'inferno', 'generic-sage'],
  ['troy', 'cavalier', 'troy', 'steel-lance', 'troy-cavalier-lance'],
  ['troy', 'cavalier', 'troy', 'steel-sword', 'troy-cavalier-sword'],
  ['troy', 'paladin', 'paladinTroy', 'silver-lance', 'troy-paladin-lance'],
  ['troy', 'paladin', 'paladinTroy', 'steel-sword', 'troy-paladin-sword'],
  ['troy', 'paladin', 'paladinTroy', 'hand-axe', 'troy-paladin-axe'],
  ['corvis', 'shaman', 'corvis', 'dark-tome', 'corvis-shaman'],
  ['corvis', 'dark-sage', 'darkSageCorvis', 'dark-tome', 'corvis-dark-sage'],
];
const makeUnit = async ([id, classId, spriteSet, weapon]) => ({
  id, classId, spriteSet, x: 0, z: 0, weapon: await json(`data/weapons/${weapon}.json`),
});
const maria = (x) => ({ id: 'maria', classId: 'hunter', x, z: 0, weapon: { type: 'Sword', minRange: 1, maxRange: 1 } });
const newKeys = [...new Set(cases.map((entry) => entry[4]))].filter((key) => key !== 'generic-paladin')
  .concat(['linus-paladin-axe', 'linus-bloodsworn-sword', 'eveline-troubadour', 'eveline-valkyrie']);
// Head landmarks exclude weapon tips and transparent padding from rider sizing.
const mountedHeads = {
  'troy-cavalier-lance': [80, 46],
  'troy-cavalier-sword': [80, 46],
  'troy-paladin-lance': [75, 38],
  'troy-paladin-sword': [75, 52],
  'troy-paladin-axe': [75, 52],
  'linus-paladin-axe': [57, 58],
  'linus-bloodsworn-sword': [50, 56],
};

test('all requested identities, promoted classes and weapon types choose their own full battle sets', async () => {
  for (const entry of cases) {
    const unit = await makeUnit(entry);
    assert.equal(battleSpriteKey(unit), entry[4]);
    assert.equal(battleIdleKey(unit), entry[4]);
    assert.ok(art.fighters[entry[4]], entry[4]);
    assert.equal(supportsBattleScene(unit, maria(1)), true);
    assert.equal(supportsBattleScene(maria(1), unit), true);
    assert.equal(battleSpriteKey({ ...unit, classId: 'nonexistent' }), null);
    assert.equal(battleSpriteKey({ ...unit, weapon: { type: 'Gun' } }), null);
  }
  assert.equal(battleSpriteKey({ id: 'troy', classId: 'cavalier', weapon: { type: 'Axe' } }), null);
  assert.equal(battleSpriteKey({ id: 'corvis', classId: 'shaman', weapon: { type: 'Anima', id: 'fire-tome' } }), null);
  assert.equal(battleSpriteKey({ id: 'stranger', classId: 'shaman', weapon: { type: 'Dark', id: 'dark-tome' } }), null);
  for (const classId of ['shaman', 'dark-sage'])
    assert.equal(battleSpriteKey({ id: 'corvis', classId, weapon: { type: 'Dark', id: 'unknown' } }), null);
});

test('javelins and hand axes use actual release-and-catch clips; melee swords do not throw', async () => {
  for (const entry of cases.filter((entry) => !['sage', 'shaman', 'dark-sage'].includes(entry[1]))) {
    const unit = await makeUnit(entry);
    const canThrow = ['Spear', 'Axe'].includes(unit.weapon.type);
    unit.weapon = await json(`data/weapons/${unit.weapon.type === 'Spear' ? 'javelin' : unit.weapon.type === 'Axe' ? 'hand-axe' : 'steel-sword'}.json`);
    assert.equal(battleThrow(unit, 1), null);
    const effect = battleThrow(unit, 2);
    assert.equal(Boolean(effect), canThrow, entry[4]);
    assert.equal(supportsBattleScene(unit, maria(2)), canThrow, entry[4]);
    if (!canThrow) continue;
    for (const clip of Object.values(art.fighters[entry[4]].thrown)) {
      assert.equal(clip.advance, 0);
      assert.ok(clip.catchFrame > clip.impactFrame && clip.catchFrame < clip.frames);
      assert.ok(thrownReturnMs(clip, effect) > effect.impactMs);
    }
  }
});

test('Generic Sage and promoted Corvis support all staff tiers without granting Shaman staff art', async () => {
  for (const [id, classId, spriteSet, key] of [
    ['church-sage', 'sage', 'genericSage', 'generic-sage'],
    ['corvis', 'dark-sage', 'darkSageCorvis', 'corvis-dark-sage'],
  ]) {
    for (const staffId of ['heal-staff', 'mend', 'physic', 'freeze-staff', 'hold', 'stasis']) {
      const staff = await json(`data/weapons/${staffId}.json`);
      const unit = { id, classId, spriteSet, x: 0, z: 0, weapon: staff };
      assert.equal(staffBattleKey(unit, staff), key);
      assert.equal(battleSpriteKey(unit), null);
      assert.equal(battleIdleKey(unit), key);
      assert.equal(supportsStaffScene(unit, maria(10), staff), true);
      assert.equal(supportsBattleScene(maria(1), unit), true);
      assert.ok(art.fighters[key].staff.cast);
    }
  }
  assert.equal(staffBattleKey({ id: 'corvis', classId: 'shaman' }, await json('data/weapons/heal-staff.json')), null);
  const siege = await makeUnit(['church-sage', 'sage', 'genericSage', 'bolting']);
  assert.equal(supportsBattleScene(siege, maria(10)), true);
  assert.equal(staffBattleKey(siege, siege.weapon), null);
});

async function pixels(file) {
  const png = await readFile(new URL(`../assets/battle/${file}`, import.meta.url));
  assert.equal(png.toString('ascii', 1, 4), 'PNG');
  assert.equal(png[24], 8);
  assert.equal(png[25], 6);
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20), chunks = [];
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset);
    if (png.toString('ascii', offset + 4, offset + 8) === 'IDAT')
      chunks.push(png.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  const raw = inflateSync(Buffer.concat(chunks));
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    assert.equal(raw[y * (width * 4 + 1)], 0);
    raw.copy(data, y * width * 4, y * (width * 4 + 1) + 1, (y + 1) * (width * 4 + 1));
  }
  return { width, height, data };
}

test('mounted weapon sets match established rider size instead of fitting the tallest weapon', async () => {
  const paladin = art.fighters['linus-paladin-sword'];
  const referenceHeight = (paladin.baseline - 24) * 2 * paladin.scale;
  const bloodsworn = art.fighters['linus-bloodsworn'];
  const bloodswornHeight = (bloodsworn.baseline - 20) * 2 * bloodsworn.scale;
  const maria = art.fighters['maria-hunter'];
  const mariaHeight = (maria.baseline - 35) * 2 * (maria.scale ?? 1);
  const troyHeights = [];
  for (const [key, [x, y]] of Object.entries(mountedHeads)) {
    const spec = art.fighters[key];
    const idle = await pixels(spec.idle);
    assert.ok(idle.data[(y * idle.width + x) * 4 + 3] > 16, `${key}: visible head landmark`);
    const height = (spec.baseline - y) * 2 * spec.scale;
    const reference = key === 'linus-bloodsworn-sword' ? bloodswornHeight : referenceHeight;
    assert.ok(Math.abs(height / reference - 1) <= .045, `${key}: ${height}px vs ${reference}px rider`);
    assert.ok(233 - height >= 64, `${key}: rider clears the HUD`);
    if (key.startsWith('troy')) {
      assert.ok(height > mariaHeight * 1.04, `${key}: mounted rider is taller than Maria`);
      troyHeights.push(height);
    }
  }
  assert.ok(Math.max(...troyHeights) - Math.min(...troyHeights) < 2, 'Troy keeps his size across weapons and classes');
});

test('new native sheets have real varying transparent frames, grounded feet, safe bounds and complete provenance', async () => {
  for (const key of newKeys) {
    const spec = art.fighters[key];
    assert.ok(spec, key);
    assert.equal(spec.size, 160);
    assert.equal(spec.sourceSize, 128);
    assert.equal(spec.transparentPadding, 16);
    assert.ok(spec.idleJob && Number.isInteger(spec.sourceIndex));
    await readFile(new URL(`../${spec.mapReference}`, import.meta.url));
    const clips = [{ file: spec.idle, frames: 1, job: spec.idleJob }, spec.idleLoop,
      ...(spec.supportOnly ? [] : [spec.attack, spec.critical]),
      ...Object.values(spec.thrown ?? {}), ...(spec.staff ? [
        { file: spec.staff.idle, frames: 1, job: spec.staff.idleJob }, spec.staff.cast,
      ] : [])];
    if (!spec.supportOnly) assert.notEqual(spec.attack.job, spec.critical.job);
    for (const clip of clips) {
      assert.ok(clip.job, clip.file);
      const { width, height, data } = await pixels(clip.file);
      assert.deepEqual([width, height], [spec.size * clip.frames, spec.size], clip.file);
      const signatures = new Set();
      for (let i = 0; i < clip.frames; i++) {
        const frame = Buffer.alloc(spec.size * spec.size * 4);
        let top = spec.size, bottom = -1, solid = 0;
        for (let y = 0; y < spec.size; y++) {
          data.copy(frame, y * spec.size * 4, (y * width + i * spec.size) * 4, (y * width + (i + 1) * spec.size) * 4);
          for (let x = 0; x < spec.size; x++) if (frame[(y * spec.size + x) * 4 + 3] > 16) {
            top = Math.min(top, y); bottom = Math.max(bottom, y); solid++;
          }
        }
        assert.ok(solid > 200 && solid < spec.size * spec.size * .6, `${clip.file}/${i}: cut-out silhouette`);
        assert.equal(bottom, spec.baseline, `${clip.file}/${i}: grounded feet`);
        const renderedTop = 233 - (bottom - top) * 2 * spec.scale;
        // Cavalry weapon tips may pass behind the foreground HUD, never off-canvas.
        assert.ok(renderedTop >= (mountedHeads[key] ? 8 : 64), `${clip.file}/${i}: scene clearance`);
        signatures.add(createHash('sha256').update(frame).digest('hex'));
      }
      if (clip.frames > 1) assert.ok(signatures.size > 1, `${clip.file}: genuine motion`);
      if (clip.impactFrame !== undefined) {
        assert.ok(clip.impactFrame > 0 && clip.impactFrame < clip.frames - 1, clip.file);
        assert.ok(battleImpactTime(clip) > 0);
        if (!spec.casting && !clip.catchFrame)
          assert.equal(clip.advance + (clip.contact.x - spec.anchorX) * 2, 208);
      }
    }
  }
});
