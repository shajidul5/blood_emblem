import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import * as THREE from 'three';

let server, levels, grid, characters, battle, inventory, spells;
const priorImage = Object.getOwnPropertyDescriptor(globalThis, 'Image');
const priorDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
const raw = JSON.parse(await readFile(new URL('../data/levels/map_07_orders_camp.json', import.meta.url), 'utf8'));
const tutorials = JSON.parse(await readFile(new URL('../data/tutorials/chapter-7.json', import.meta.url), 'utf8'));
const key = ({ x, z }) => `${x},${z}`;

before(async () => {
  const context = { drawImage() {}, fillRect() {}, createRadialGradient() { return { addColorStop() {} }; } };
  globalThis.document = { createElement: () => ({ getContext: () => context }) };
  globalThis.Image = class {
    set src(url) {
      const forest = url.includes('forest.png') || url.includes('camp.png');
      this.width = forest ? 1536 : url.includes('village.png') ? 768 : 512;
      this.height = forest ? 672 : url.includes('village.png') ? 336 : 512;
      queueMicrotask(() => this.onload());
    }
  };
  server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: 'custom' });
  [levels, grid, characters, battle, inventory, spells] = await Promise.all([
    server.ssrLoadModule('/src/levels/level.js'), server.ssrLoadModule('/src/battle/grid.js'),
    server.ssrLoadModule('/src/characters/characters.js'), server.ssrLoadModule('/src/battle/battle-animation.js'),
    server.ssrLoadModule('/src/characters/inventory.js'), server.ssrLoadModule('/src/battle/spell-animation.js'),
  ]);
});
after(async () => {
  await server?.close();
  for (const [name, descriptor] of [['Image', priorImage], ['document', priorDocument]]) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete globalThis[name];
  }
});

function reachableFrom(level, start) {
  const seen = new Set([key(start)]), queue = [start];
  for (let i = 0; i < queue.length; i++) {
    const { x, z } = queue[i];
    for (const next of [{ x: x - 1, z }, { x: x + 1, z }, { x, z: z - 1 }, { x, z: z + 1 }]) {
      if (seen.has(key(next)) || !grid.isWalkable(level, next.x, next.z)) continue;
      seen.add(key(next));
      queue.push(next);
    }
  }
  return seen;
}

test('Chapter 7 renders enhanced Order camp art at 32 native pixels per unchanged tactical cell', async () => {
  const png = await readFile(new URL('../assets/maps/village/camp.png', import.meta.url));
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [1536, 672]);
  assert.equal(png.readUInt32BE(16) / raw.width, 32);
  assert.equal(png.readUInt32BE(20) / raw.height, 32);
  const group = new THREE.Group();
  const level = levels.buildLevel(THREE, group, raw);
  assert.equal(raw.villageScene.layout, 'camp');
  assert.deepEqual([level.width, level.height], [48, 21]);
  const artwork = group.getObjectByName('illustrated-camp');
  assert.ok(artwork);
  assert.equal(artwork.material.map.magFilter, THREE.NearestFilter);
  assert.equal(artwork.material.map.minFilter, THREE.NearestFilter);
  assert.equal(artwork.material.map.generateMipmaps, false);
  assert.deepEqual(artwork.material.map.repeat.toArray(), [1, 1]);
  assert.deepEqual(artwork.material.map.offset.toArray(), [0, 0]);
  assert.deepEqual(levels.validateLevel(JSON.parse(JSON.stringify(level))).villageScene, raw.villageScene);
  const extras = group.children.filter((mesh) => mesh.isMesh && mesh.name !== 'illustrated-camp');
  assert.equal(extras.length, level.houses.length, 'only the tent door markers sit over the art');
  assert.ok(extras.every((mesh) => mesh.userData.houseId));
  assert.equal(raw.trees, undefined);
});

test('Chapter 7 walkable cells, units, tents and waves are connected inside the cursor bounds', () => {
  const level = levels.validateLevel(raw);
  const reachable = reachableFrom(level, level.spawn);
  const [minX, minZ, maxX, maxZ] = level.villageScene.cursorBounds;
  for (let z = 0; z < level.height; z++) for (let x = 0; x < level.width; x++) {
    if (!grid.isWalkable(level, x, z)) continue;
    assert.ok(reachable.has(key({ x, z })), `walkable ${x},${z} is connected`);
    assert.ok(x >= minX && x <= maxX && z >= minZ && z <= maxZ, `walkable ${x},${z} is inside the cursor bounds`);
  }
  const waveUnits = level.reinforcements.flatMap((wave) => [...wave.units, ...(wave.allies ?? [])]);
  for (const unit of [...level.players, ...level.enemies, ...waveUnits, level.exit])
    assert.ok(reachable.has(key(unit)), `${unit.id ?? 'exit'} at ${key(unit)} is reachable`);
  for (const house of level.houses) {
    assert.ok(reachable.has(key(house.door)), `${house.id} door is reachable`);
    for (let z = house.z; z < house.z + house.height; z++) for (let x = house.x; x < house.x + house.width; x++)
      assert.equal(grid.isWalkable(level, x, z), false, `${house.id} canvas at ${x},${z} is solid`);
  }
  assert.deepEqual(level.houses.map((house) => house.rewardId).sort(), ['bloodroot-tonic', 'freeze-staff', 'master-emblem']);
});

test('Chapter 7 encounter keeps Orsen, the fallen Order, Stark and the chasing wolves', () => {
  const level = levels.validateLevel(raw);
  assert.equal(level.objective, 'defeat-boss');
  const orsen = level.enemies.find((enemy) => enemy.id === 'orsen');
  assert.deepEqual([orsen.x, orsen.z, orsen.ai, orsen.drop], [40, 10, 'stationary', 'orsen-journal']);
  assert.equal(level.enemies.filter((enemy) => enemy.id === 'order-cavalier').length, 8);
  assert.equal(level.enemies.filter((enemy) => enemy.id === 'order-archer').length, 6);
  const wave = (turn) => level.reinforcements.find((entry) => entry.turn === turn);
  assert.deepEqual(wave(4).allies, [{ id: 'stark', x: 15, z: 3 }]);
  for (const turn of [3, 5]) assert.ok(wave(turn).units.every((unit) => unit.id === 'feral-wolf' && unit.ai === 'mobile'));
  assert.ok(wave(3).units.some((unit) => unit.x === 2), 'the pack gives chase from the west gate');
});

test('Chapter 7 ravens scout twice, then the crows fall silent before the Omen arrives on turn 11', () => {
  const level = levels.validateLevel(raw);
  const ravens = level.reinforcements.filter((wave) => wave.units.some((unit) => unit.id === 'forest-raven'));
  assert.deepEqual(ravens.map((wave) => wave.turn), [6, 8]);
  const omen = level.reinforcements.find((wave) => wave.announce === 'crowOmen');
  assert.deepEqual([omen.turn, omen.units.length, omen.sound], [9, 0, 'crow-omen']);
  assert.ok(omen.turn > Math.max(...ravens.map((wave) => wave.turn)), 'the warning follows both raven waves');
  const arrival = level.reinforcements.find((wave) => wave.announce === 'crowmanArrival');
  assert.equal(arrival.turn, 11);
  assert.deepEqual(arrival.units.map(({ id, drop }) => [id, drop]), [['crowman', 'covenant-emblem']]);
  for (const id of ['crowOmen', 'crowmanArrival']) assert.ok(tutorials[id]?.pages.length, `${id} popup exists`);
  assert.equal(tutorials.crowmanArrival.pages.length, 1);
  assert.equal(tutorials.crowmanArrival.pages[0].title, 'The Omen');
  assert.match(JSON.stringify(tutorials.crowmanArrival), /Maria.*following you/);
  assert.doesNotMatch(JSON.stringify(tutorials.crowmanArrival), /Ansel Wren|Lantern Survey|Covenant|Blood Emblem/);
});

test('The Omen hunts Maria, flies, is not the chapter boss and has battle art', () => {
  const crowman = characters.createEnemyUnit('crowman', 2, 10, { level: 25, drop: 'covenant-emblem' });
  assert.equal(crowman.hunts, 'maria');
  assert.equal(crowman.name, 'The Omen');
  assert.equal(crowman.hp, 100);
  assert.equal(crowman.speed, 32);
  assert.equal(crowman.defense, 30);
  assert.equal(crowman.resistance, 26);
  assert.equal(crowman.type, 'flying');
  assert.equal(characters.isBossEnemy('crowman'), false, 'he must not block or replace the defeat-boss objective');
  assert.equal(crowman.weapon.id, 'crow-greatsword');
  assert.equal(battle.battleSpriteKey(crowman), 'crowman');
  for (const id of ['forest-raven', 'raven']) {
    const raven = characters.createEnemyUnit(id, 0, 0);
    assert.equal(raven.type, 'flying');
    assert.equal(battle.battleSpriteKey(raven), 'raven', `${id} uses raven battle art`);
  }
  assert.equal(characters.createEnemyUnit('forest-raven', 0, 0).level, 12);
  const emblem = inventory.INVENTORY_ITEMS.get('covenant-emblem');
  assert.deepEqual([emblem.name, emblem.effect], ['Covenant Emblem', 'promote']);
  assert.match(emblem.lore, /Omen.*Ansel Wren/);
});

test('Every fire, wind and thunder tome has a spell animation', () => {
  for (const id of ['fire-tome', 'blaze', 'inferno', 'wind-tome', 'gale', 'tempest', 'thunder-tome', 'elthunder', 'bolting']) {
    const weapon = inventory.INVENTORY_ITEMS.get(id);
    assert.ok(weapon, `${id} exists`);
    assert.ok(spells.spellEffectFor(weapon), `${id} has a spell animation`);
  }
});
