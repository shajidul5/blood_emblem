import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { battleSpriteKey, battleThrow, idleFrameAt, supportsBattleScene } from '../src/battle/battle-animation.js';

const art = JSON.parse(await readFile(new URL('../assets/battle/manifest.json', import.meta.url)));
const maria = (distance = 1) => ({ id: 'maria', classId: 'hunter', x: distance, z: 0,
  weapon: { id: 'rapier', type: 'Sword', minRange: 1, maxRange: 1 } });
const cases = [
  ['lena', 'thief', 'lena', 'Sword', 'lena-thief'],
  ['lena', 'assassin', 'assassinLena', 'Sword', 'lena-assassin-sword'],
  ['lena', 'assassin', 'assassinLena', 'Bow', 'lena-assassin-bow'],
  ['undead', 'undead', 'genericUndead', 'Claw', 'generic-undead'],
  ['rotten', 'rotten', 'rotten', 'Claw', 'rotten'],
];

test('jailbreak actors choose their own class and weapon sets without granting new combat abilities', () => {
  for (const [id, classId, spriteSet, type, key] of cases) {
    const ranged = type === 'Bow' || id === 'rotten';
    const unit = { id, classId, spriteSet, x: 0, z: 0, weapon: { type, minRange: type === 'Bow' ? 2 : 1, maxRange: ranged ? 2 : 1 } };
    assert.equal(battleSpriteKey(unit), key);
    assert.ok(art.fighters[key]);
    assert.ok(supportsBattleScene(unit, maria()));
    assert.equal(supportsBattleScene(unit, maria(2)), ranged);
    assert.equal(supportsBattleScene(maria(2), unit), ranged);
    assert.equal(supportsBattleScene(unit, maria(3)), false);
    assert.equal(battleThrow(unit, 2), null);
    for (const wrong of ['Staff', 'Anima', 'Light', 'Dark', 'Gun', 'Axe', 'Spear'])
      assert.equal(battleSpriteKey({ ...unit, weapon: { type: wrong } }), null, `${key}: ${wrong}`);
    assert.equal(battleSpriteKey({ ...unit, classId: 'hunter' }), null);
    if (id === 'lena') assert.equal(battleSpriteKey({ ...unit, id: 'another-thief' }), null);
    else assert.equal(battleSpriteKey({ ...unit, spriteSet: 'genericWolfman' }), null);
  }
  assert.equal(battleSpriteKey({ id: 'lena', classId: 'thief', weapon: { type: 'Bow' } }), null);
  assert.equal(art.fighters['lena-assassin-bow'].casting, true, 'bow releases an independent arrow');
});

test('every undead and Rotten roster variant uses the matching shared art', async () => {
  const directory = new URL('../data/characters/', import.meta.url);
  const covered = new Set();
  for (const file of await readdir(directory)) {
    if (!file.endsWith('.json')) continue;
    const profile = JSON.parse(await readFile(new URL(file, directory)));
    if (!['genericUndead', 'rotten'].includes(profile.spriteSet)) continue;
    const weapon = JSON.parse(await readFile(new URL(`../data/weapons/${profile.weaponId}.json`, import.meta.url)));
    const expected = profile.spriteSet === 'rotten' ? 'rotten' : 'generic-undead';
    assert.equal(battleSpriteKey({ ...profile, weapon }), expected, file);
    covered.add(expected);
  }
  assert.equal(covered.size, 2);
});

test('new battle sheets preserve native frames, transparency, generation provenance and safe HUD scales', async () => {
  for (const [, , , , key] of cases) {
    const spec = art.fighters[key];
    assert.equal(spec.size, key === 'rotten' ? 160 : 128);
    assert.ok(spec.idleJob && Number.isInteger(spec.sourceIndex));
    const idle = await readFile(new URL(`../assets/battle/${spec.idle}`, import.meta.url));
    assert.equal(idle.readUInt32BE(16), spec.size);
    assert.equal(idle.readUInt32BE(20), spec.size);
    assert.equal(idle[25], 6, 'native RGBA transparency');
    for (const [name, clip] of [['idleLoop', spec.idleLoop], ['attack', spec.attack], ['critical', spec.critical]]) {
      assert.ok(clip.job);
      assert.equal(clip.frames, name === 'idleLoop' ? 9 : name === 'attack' ? 25 : 33);
      const sheet = await readFile(new URL(`../assets/battle/${clip.file}`, import.meta.url));
      assert.equal(sheet.readUInt32BE(16), spec.size * clip.frames, clip.file);
      assert.equal(sheet.readUInt32BE(20), spec.size, clip.file);
      assert.equal(sheet[25], 6);
      if (name !== 'idleLoop') {
        assert.ok(clip.impactFrame > 0 && clip.impactFrame < clip.frames - 1);
        assert.ok(clip.contact.x >= 0 && clip.contact.x < spec.size);
        if (!spec.casting) assert.equal(clip.advance + (clip.contact.x - spec.anchorX) * 2, 208);
      }
    }
    const hp = 80;
    const bottom = 56 + (Math.ceil(hp / 40) - 1) * 8;
    assert.ok(233 - spec.baseline * 2 * spec.scale >= bottom, key);
    assert.equal(idleFrameAt(spec.idleLoop, spec.idleLoop.frameMs), 1);
    assert.equal(idleFrameAt(spec.idleLoop, spec.idleLoop.frameMs, true), 0);
    assert.equal(spec.flurry, undefined, 'new visuals do not invent extra strikes or mechanics');
  }
});
