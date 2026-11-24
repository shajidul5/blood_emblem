import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { battleIdleKey, battleSpriteKey, battleThrow, staffBattleKey, supportsBattleScene,
  supportsStaffScene, THROWING_FIGHTERS } from '../src/battle/battle-animation.js';

const json = async (path) => JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), 'utf8'));
const art = await json('assets/battle/manifest.json');
const cases = [
  ['leon', 'mercenary', 'Sword', 'beast-killer', 'leon-mercenary'],
  ['leon', 'hero', 'Sword', 'steel-sword', 'leon-hero-sword'],
  ['leon', 'hero', 'Axe', 'hand-axe', 'leon-hero-axe'],
  ['serra', 'mage', 'Anima', 'fire-tome', 'serra-mage'],
  ['serra', 'sage', 'Anima', 'wind-tome', 'serra-sage'],
];
const maria = (x) => ({ id: 'maria', classId: 'hunter', x, z: 0,
  weapon: { type: 'Sword', minRange: 1, maxRange: 1 } });

async function png(file) {
  const data = await readFile(new URL(`../assets/battle/${file}`, import.meta.url));
  assert.equal(data.toString('ascii', 1, 4), 'PNG');
  assert.equal(data[24], 8);
  assert.equal(data[25], 6);
  const width = data.readUInt32BE(16), height = data.readUInt32BE(20), chunks = [];
  for (let offset = 8; offset < data.length;) {
    const length = data.readUInt32BE(offset);
    if (data.toString('ascii', offset + 4, offset + 8) === 'IDAT')
      chunks.push(data.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  const raw = inflateSync(Buffer.concat(chunks)), pixels = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    const start = y * (width * 4 + 1);
    assert.equal(raw[start], 0, 'native packer uses unfiltered RGBA rows');
    raw.copy(pixels, y * width * 4, start + 1, start + 1 + width * 4);
  }
  return { width, height, pixels };
}

test('Leon and Serra select only their implemented identity, class and equipment art', async () => {
  for (const [id, classId, type, weaponId, key] of cases) {
    const unit = { id, classId, x: 0, z: 0, weapon: await json(`data/weapons/${weaponId}.json`) };
    assert.equal(unit.weapon.type, type);
    assert.equal(battleSpriteKey(unit), key);
    assert.equal(battleIdleKey(unit), key);
    assert.equal(battleSpriteKey({ ...unit, id: 'someone-else' }), null);
    assert.equal(battleSpriteKey({ ...unit, classId: 'hunter' }), null);
    for (const wrong of ['Spear', 'Bow', 'Gun', 'Light', 'Dark', 'Staff'])
      assert.equal(battleSpriteKey({ ...unit, weapon: { ...unit.weapon, type: wrong } }), null);
    assert.equal(supportsBattleScene(unit, maria(1)), true);
    const ranged = type === 'Anima' || type === 'Axe';
    assert.equal(supportsBattleScene(unit, maria(2)), ranged);
    assert.equal(supportsBattleScene(maria(2), unit), ranged);
    assert.equal(supportsBattleScene(unit, maria(3)), false);
    assert.equal(battleThrow(unit, 1), null);
    assert.equal(battleThrow(unit, 2)?.key ?? null, type === 'Axe' ? 'thrown-axe' : null);
  }
  assert.ok(THROWING_FIGHTERS.has('leon-hero-axe'));
  assert.equal(battleSpriteKey({ id: 'leon', classId: 'mercenary', weapon: { type: 'Axe' } }), null);
  assert.equal(battleSpriteKey({ id: 'serra', classId: 'mage', weapon: { type: 'Anima', id: 'unknown' } }), null);
});

test('Sage Serra supports every real staff tier, staff-equipped recipients and long-range Anima without granting Mage staves', async () => {
  const sage = { id: 'serra', classId: 'sage', x: 0, z: 0 };
  for (const id of ['heal-staff', 'mend', 'physic', 'freeze-staff', 'hold', 'stasis']) {
    const staff = await json(`data/weapons/${id}.json`);
    const equipped = { ...sage, weapon: staff };
    assert.equal(staffBattleKey(sage, staff), 'serra-sage');
    assert.equal(staffBattleKey({ ...sage, classId: 'mage' }, staff), null);
    assert.equal(battleIdleKey(equipped), 'serra-sage');
    assert.equal(battleSpriteKey(equipped), null);
    assert.equal(supportsStaffScene(sage, { ...equipped, x: 10 }, staff), true);
    assert.equal(supportsBattleScene(maria(1), equipped), true);
  }
  const bolting = { ...sage, weapon: await json('data/weapons/bolting.json') };
  assert.equal(supportsBattleScene(bolting, maria(10)), true);
  assert.equal(staffBattleKey(sage, { type: 'Anima', heal: 10 }), null);
});

test('native recruit sheets retain transparent varying frames, grounded feet, safe HUD heights and generation provenance', async () => {
  for (const [, , , , key] of cases) {
    const spec = art.fighters[key];
    assert.equal(spec.size, spec.sourceSize + spec.transparentPadding * 2);
    assert.equal(spec.sourceSize, 128);
    assert.ok(spec.idleJob && Number.isInteger(spec.sourceIndex));
    await readFile(new URL(`../${spec.mapReference}`, import.meta.url));
    await readFile(new URL(`../${spec.styleReference}`, import.meta.url));
    const clips = [{ file: spec.idle, frames: 1, job: spec.idleJob }, spec.idleLoop, spec.attack, spec.critical,
      ...Object.values(spec.thrown ?? {}), ...(spec.staff ? [
        { file: spec.staff.idle, frames: 1, job: spec.staff.idleJob }, spec.staff.cast,
      ] : [])];
    for (const clip of clips) {
      assert.ok(clip.job, clip.file);
      if (clip.sourceFrames) assert.equal(clip.sourceFrames.length, clip.frames);
      const { width, height, pixels } = await png(clip.file), signatures = new Set();
      assert.equal(width, spec.size * clip.frames, clip.file);
      assert.equal(height, spec.size, clip.file);
      for (let index = 0; index < clip.frames; index++) {
        const frame = Buffer.alloc(spec.size * spec.size * 4);
        let top = spec.size, bottom = -1, transparent = 0;
        for (let y = 0; y < height; y++) {
          pixels.copy(frame, y * spec.size * 4, (y * width + index * spec.size) * 4,
            (y * width + (index + 1) * spec.size) * 4);
          for (let x = 0; x < spec.size; x++) {
            const alpha = frame[(y * spec.size + x) * 4 + 3];
            if (!alpha) transparent++;
            if (alpha > 16) { top = Math.min(top, y); bottom = Math.max(bottom, y); }
          }
        }
        assert.ok(transparent > spec.size * spec.size / 2);
        assert.equal(bottom, spec.baseline, `${clip.file} frame ${index}: planted boot baseline`);
        assert.ok(233 - (spec.baseline - top) * 2 * spec.scale >= 64, `${clip.file} clears the 80-HP HUD`);
        signatures.add(createHash('sha256').update(frame).digest('hex'));
        if (clip.catchFrame && index >= clip.impactFrame && index < clip.catchFrame)
          for (let y = 0; y < height; y++) for (let x = 120; x < spec.size; x++)
            assert.equal(frame[(y * spec.size + x) * 4 + 3], 0, `${clip.file}: no baked flying axe`);
      }
      if (clip.frames > 1) assert.ok(signatures.size > 1, `${clip.file}: actual animation, not repeated stills`);
      if (clip.impactFrame !== undefined) {
        assert.ok(clip.impactFrame > 0 && clip.impactFrame < clip.frames - 1);
        if (!spec.casting && !clip.catchFrame)
          assert.equal(clip.advance + (clip.contact.x - spec.anchorX) * 2, 208);
        if (clip.catchFrame) assert.ok(clip.catchFrame > clip.impactFrame && clip.catchFrame < clip.frames - 1);
      }
    }
    assert.notEqual(spec.attack.job, spec.critical.job);
  }
});

test('Beast Killer uses its unique generated transparent 64px icon while retaining its existing mechanics', async () => {
  const sword = await json('data/weapons/beast-killer.json');
  const icon = art.items['beast-killer'];
  assert.equal(sword.sprite, 'assets/weapons/Beast_Killer/beast-killer.png');
  assert.equal(icon.job, 'b08bd857-b4d8-4923-bb21-d30a7de8dea0');
  const image = await png(icon.file);
  assert.equal(image.width, 64);
  assert.equal(image.height, 64);
  assert.ok(image.pixels.some((value, i) => i % 4 === 3 && value === 0));
  assert.ok(image.pixels.some((value, i) => i % 4 === 3 && value === 255));
  assert.deepEqual([sword.type, sword.requiredRank, sword.might, sword.hit, sword.weight], ['Sword', 'D', 7, 85, 7]);
  assert.deepEqual(sword.effect, ['beast']);
});
