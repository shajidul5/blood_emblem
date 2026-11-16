import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import * as THREE from 'three';
import { constrainInteriorCamera } from '../src/game/camera-bounds.js';

const raw = JSON.parse(await readFile(new URL('../data/levels/map_09_last_crossing.json', import.meta.url), 'utf8'));
const threshold = JSON.parse(await readFile(new URL('../data/levels/map_10_golden_threshold.json', import.meta.url), 'utf8'));
const priorImage = Object.getOwnPropertyDescriptor(globalThis, 'Image');
const priorDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
let server, levels, grid, rescue, characters, saves;
before(async () => {
  globalThis.document = { createElement: () => ({ getContext: () => ({
    fillRect() {}, strokeRect() {}, fillText() {}, strokeText() {}, measureText: () => ({ width: 100 }),
  }) }) };
  globalThis.Image = class {
    set src(url) {
      this.width = this.height = 1024;
      queueMicrotask(() => this.onload());
    }
  };
  server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: 'custom' });
  [levels, grid, rescue, characters, saves] = await Promise.all([
    '/src/levels/level.js', '/src/battle/grid.js', '/src/game/rescue.js',
    '/src/characters/characters.js', '/src/game/save.js',
  ].map((path) => server.ssrLoadModule(path)));
});
after(async () => {
  await server?.close();
  for (const [name, descriptor] of [['Image', priorImage], ['document', priorDocument]]) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete globalThis[name];
  }
});

test('Chapter 9 renders native 32px sunset art without duplicate buildings or forest ambience', async () => {
  const png = await readFile(new URL('../assets/maps/village/crossing.png', import.meta.url));
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [1024, 1024]);
  const level = levels.validateLevel(raw), group = new THREE.Group();
  levels.buildLevel(THREE, group, level);
  const floor = group.getObjectByName('illustrated-crossing');
  assert.ok(floor);
  assert.deepEqual(floor.material.map.repeat.toArray(), [1, 1]);
  assert.deepEqual(floor.material.map.offset.toArray(), [0, 0]);
  assert.equal(floor.material.map.magFilter, THREE.NearestFilter);
  assert.equal(floor.material.map.generateMipmaps, false);
  assert.equal(level.objects.length, 0);
  assert.equal(level.trees.length, 0);
  assert.equal(group.userData.houseMarkers.length, 3);
  const layouts = await server.ssrLoadModule('/src/levels/village-scene.js');
  assert.equal(layouts.isForestLayout('crossing'), false);
  assert.equal(level.forestEdges, false);
});

test('all village lanes, rescue positions and wave entrances share one connected playable region', () => {
  const level = levels.validateLevel(raw), seen = new Set(), queue = [level.spawn];
  const key = ({ x, z }) => `${x},${z}`;
  seen.add(key(level.spawn));
  for (let i = 0; i < queue.length; i++) {
    const { x, z } = queue[i];
    for (const point of [{ x: x - 1, z }, { x: x + 1, z }, { x, z: z - 1 }, { x, z: z + 1 }]) {
      if (seen.has(key(point)) || !grid.isWalkable(level, point.x, point.z)) continue;
      seen.add(key(point));
      queue.push(point);
    }
  }
  for (let z = 0; z < level.height; z++) for (let x = 0; x < level.width; x++) {
    if (!grid.isWalkable(level, x, z)) continue;
    assert.ok(seen.has(`${x},${z}`), `tile ${x},${z} connected`);
    const [minX, minZ, maxX, maxZ] = level.villageScene.cursorBounds;
    assert.ok(x >= minX && x <= maxX && z >= minZ && z <= maxZ);
  }
  const units = [...level.players, ...level.enemies, level.rescue.recruit, ...level.houses.map((house) => house.door)];
  assert.equal(new Set(units.map(key)).size, units.length);
  for (const point of [...units, level.exit, ...level.rescue.refuge, ...level.reinforcements.flatMap((wave) => wave.units)])
    assert.ok(seen.has(key(point)), `${point.id ?? 'goal'} ${key(point)} connected`);
});

test('escorts can complete all routes and real saves retain map, reward and recruitment state', () => {
  const level = levels.validateLevel(raw);
  for (const house of level.houses) {
    const villager = { ...characters.createVillager(house.villagerId, house.name), ...house.door };
    let turns = 0;
    while (!level.rescue.refuge.some((point) => point.x === villager.x && point.z === villager.z)) {
      const path = rescue.escortPath(villager, level.rescue.refuge, [villager], level);
      assert.ok(path.length > 1);
      assert.ok(path.length <= 4);
      Object.assign(villager, path.at(-1));
      assert.ok(++turns < 16, 'escort must complete without stalls');
    }
  }
  const player = Object.assign(characters.createMaria(), level.spawn);
  const enemies = level.enemies.map((unit) => characters.createEnemyUnit(unit.id, unit.x, unit.z, { ...unit, chapter: 8 }));
  const state = rescue.freshRescueState(level);
  const data = saves.createSaveData(level, player, enemies,
    { turn: 1, phase: 'player', defeated: false }, { chapter: 8, rescue: state });
  const save = saves.parseSave(JSON.stringify(data));
  assert.deepEqual(save.level.villageScene, raw.villageScene);
  assert.deepEqual(save.level.rescue.rewards, raw.rescue.rewards);
  assert.deepEqual(save.level.rescue.bridgeAdvance, raw.rescue.bridgeAdvance);
  assert.deepEqual(save.rescue, state);
});

test('advancing guards retain mobile AI and positions through saves, and blocked beast entrances queue', async () => {
  const level = levels.validateLevel(raw);
  const player = Object.assign(characters.createMaria(), level.spawn);
  const enemies = level.enemies.map((unit) => characters.createEnemyUnit(unit.id, unit.x, unit.z, unit));
  const advancing = rescue.advanceRescueGuards(level, enemies, 5);
  advancing[0].z = 14;
  advancing[0].x = 17;
  const data = saves.createSaveData(level, player, enemies,
    { turn: 5, phase: 'player', defeated: false }, { chapter: 8, rescue: rescue.freshRescueState(level) });
  const saved = saves.parseSave(JSON.stringify(data));
  assert.equal(saved.enemies.filter((unit) => unit.id === 'bridge-knight' && unit.ai === 'mobile').length, 2);
  assert.ok(saved.enemies.some((unit) => unit.x === 17 && unit.z === 14 && unit.ai === 'mobile'));
  assert.deepEqual(rescue.advanceRescueGuards(saved.level, saved.enemies, 5), []);
  const { infirmarySpawnTile } = await server.ssrLoadModule('/src/game/infirmary.js');
  for (const wave of level.reinforcements) for (const unit of wave.units) {
    assert.deepEqual(infirmarySpawnTile(level, unit, []), { x: unit.x, z: unit.z });
    assert.equal(infirmarySpawnTile(level, unit, [{ ...unit, hp: 1 }]), null);
    assert.deepEqual(infirmarySpawnTile(level, unit, [{ ...unit, hp: 0 }]), { x: unit.x, z: unit.z });
  }
});

test('every walkable tile and mounted silhouette in Chapters 9/10 fits desktop and phone cameras', () => {
  for (const map of [raw, threshold]) {
    const level = levels.validateLevel(map), cells = [];
    for (let z = 0; z < level.height; z++) for (let x = 0; x < level.width; x++)
      if (grid.isWalkable(level, x, z, map === threshold ? { type: 'flying' } : undefined)) cells.push([x, z]);
    const scale = Math.max(.55, level.width / 21, level.height / 19);
    const offset = { y: 14 * scale, z: 10 * scale };
    const distance = Math.hypot(offset.y, offset.z), ny = offset.y / distance, nz = offset.z / distance;
    for (const aspect of [390 / 844, 1.26, 16 / 9, 844 / 390]) {
      const visible = new Set();
      for (const [tx, tz] of cells) {
        const target = { x: tx - level.width / 2 + .5, y: .8, z: tz - level.height / 2 + .5 };
        const fov = constrainInteriorCamera(target, offset, aspect, level.width, level.height, 0, .01);
        const tangent = Math.tan(fov * Math.PI / 360);
        for (const [x, z] of cells) {
          const key = `${x},${z}`;
          if (visible.has(key)) continue;
          if ([[-.5, 0, -.5], [.5, 0, -.5], [-.5, 0, .5], [.5, 0, .5], [0, 1.7, 0]].every(([ox, oy, oz]) => {
            const dx = x - level.width / 2 + .5 + ox - target.x;
            const dy = oy - target.y - offset.y;
            const dz = z - level.height / 2 + .5 + oz - target.z - offset.z;
            const depth = -(ny * dy + nz * dz);
            return Math.abs(dx / (depth * tangent * aspect)) <= .97 &&
              Math.abs((nz * dy - ny * dz) / (depth * tangent)) <= .97;
          })) visible.add(key);
        }
      }
      const clipped = cells.filter(([x, z]) => !visible.has(`${x},${z}`));
      assert.deepEqual(clipped, [], `${level.name}: clipped cells at aspect ${aspect}`);
    }
  }
});
