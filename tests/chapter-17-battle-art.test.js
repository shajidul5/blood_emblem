import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { battleBackdrop, battleSpriteKey, supportsBattleScene } from '../src/battle/battle-animation.js';

const art = JSON.parse(await readFile(new URL('../assets/battle/manifest.json', import.meta.url)));
const cases = [
  ['shore-unmoored-duelist', 'shore-duelist', 'Shore_Unmoored_Duelist'],
  ['shore-tidebound-sentinel', 'shore-sentinel', 'Shore_Tidebound_Sentinel'],
  ['shore-keelbreaker', 'shore-keelbreaker', 'Shore_Keelbreaker'],
  ['shore-horizon-watcher', 'shore-watcher', 'Shore_Horizon_Watcher'],
  ['shore-storm-custodian', 'shore-custodian', 'Shore_Storm_Custodian'],
  ['shore-horizon-keeper', 'shore-keeper', 'Shore_Horizon_Keeper'],
  ['shore-crowman', 'shore-crowman', 'Shore_Crowman'],
];
const directions = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];

function frameHashes(png, size, frames) {
  const chunks = [];
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset), type = png.toString('ascii', offset + 4, offset + 8);
    if (type === 'IDAT') chunks.push(png.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  const pixels = inflateSync(Buffer.concat(chunks));
  const stride = size * frames * 4 + 1;
  const hashes = Array.from({ length: frames }, () => createHash('sha256'));
  const bounds = Array.from({ length: frames }, () => ({ top: size, bottom: -1, left: size, right: -1 }));
  for (let y = 0; y < size; y++) {
    assert.equal(pixels[y * stride], 0);
    for (let i = 0; i < frames; i++) {
      const start = y * stride + 1 + i * size * 4;
      hashes[i].update(pixels.subarray(start, start + size * 4));
      for (let x = 0; x < size; x++) if (pixels[start + x * 4 + 3] > 16) {
        bounds[i].top = Math.min(bounds[i].top, y);
        bounds[i].bottom = Math.max(bounds[i].bottom, y);
        bounds[i].left = Math.min(bounds[i].left, x);
        bounds[i].right = Math.max(bounds[i].right, x);
      }
    }
  }
  return { hashes: hashes.map(hash => hash.digest('hex')), bounds };
}

test('shore designs have eight map directions, correctly routed unique custom battle sheets', async () => {
  const allJobs = new Set();
  for (const [id, key, folder] of cases) {
    const profile = JSON.parse(await readFile(new URL(`../data/characters/${id}.json`, import.meta.url)));
    const weapon = JSON.parse(await readFile(new URL(`../data/weapons/${profile.weaponId}.json`, import.meta.url)));
    const unit = { ...profile, weapon, x: 0, z: 0 };
    assert.equal(battleSpriteKey(unit), key);
    assert.equal(battleSpriteKey({ ...unit, weapon: { type: 'Staff' } }), null);
    const maria = { id: 'maria', classId: 'hunter', weapon: { type: 'Sword' }, x: 1, z: 0 };
    assert.ok(supportsBattleScene(unit, maria));
    const spec = art.fighters[key];
    assert.equal(spec.size, 224);
    assert.ok(spec.idleJob && !allJobs.has(spec.idleJob));
    allJobs.add(spec.idleJob);
    for (const [name, clip, count] of [['idleLoop', spec.idleLoop, 9], ['attack', spec.attack, 13], ['critical', spec.critical, 17]]) {
      assert.equal(clip.frames, count);
      assert.ok(clip.job && !allJobs.has(clip.job));
      allJobs.add(clip.job);
      const png = await readFile(new URL(`../assets/battle/${clip.file}`, import.meta.url));
      assert.equal(png.readUInt32BE(16), spec.size * count);
      assert.equal(png.readUInt32BE(20), spec.size);
      assert.equal(png[25], 6);
      const { hashes, bounds } = frameHashes(png, spec.size, count);
      assert.ok(new Set(hashes).size >= Math.ceil(count / 2), `${key} ${name} contains real motion`);
      for (const box of bounds) {
        assert.equal(box.bottom, spec.baseline);
        assert.ok(box.left > 0 && box.right < spec.size - 1);
        assert.ok(233 - (spec.baseline - box.top) * 2 * spec.scale >= 64, `${key} ${name} clears HP panel`);
      }
      if (name !== 'idleLoop') assert.ok(clip.impactFrame > 0 && clip.impactFrame < count);
    }
    const idle = await readFile(new URL(`../assets/battle/${spec.idle}`, import.meta.url));
    assert.equal(idle.readUInt32BE(16), spec.size);
    for (const direction of directions) {
      const path = new URL(`../assets/character/${folder}/rotations/${direction}.png`, import.meta.url);
      const png = await readFile(path);
      assert.equal(png.toString('ascii', 1, 4), 'PNG');
      const walk = await readdir(new URL(`../assets/character/${folder}/animations/Walking/${direction}/`, import.meta.url));
      assert.equal(walk.filter(file => /^frame_\d+\.png$/.test(file)).length, 6);
    }
    const rotations = await readdir(new URL(`../assets/character/${folder}/rotations/`, import.meta.url));
    assert.equal(rotations.length, 8);
  }
});

test('Chapter 17 alone selects the starless shore backdrop', async () => {
  assert.equal(battleBackdrop(16), 'shore');
  assert.equal(battleBackdrop(15), 'coast');
  assert.equal(battleBackdrop(17), 'coast');
  const png = await readFile(new URL(`../assets/battle/${art.backgrounds.shore}`, import.meta.url));
  assert.equal(png.readUInt32BE(16), 480);
  assert.equal(png.readUInt32BE(20), 240);
});
