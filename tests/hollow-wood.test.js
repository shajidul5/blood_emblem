import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import * as THREE from 'three';
import { constrainInteriorCamera } from '../src/game/camera-bounds.js';

let server, levels, grid, terrain;
const priorImage = Object.getOwnPropertyDescriptor(globalThis, 'Image');
const priorDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
const raw = JSON.parse(await readFile(new URL('../data/levels/map_06_hollow_wood.json', import.meta.url), 'utf8'));
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
  [levels, grid, terrain] = await Promise.all([
    server.ssrLoadModule('/src/levels/level.js'), server.ssrLoadModule('/src/battle/grid.js'),
    server.ssrLoadModule('/src/battle/terrain.js'),
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

// Mirrors the tactical camera: a cell (plus a standing sprite) must fit in the view at some clamped pan.
function visibleCells(width, height) {
  const scale = Math.max(0.55, width / 21, height / 19);
  const offset = { y: 14 * scale, z: 10 * scale };
  const distance = Math.hypot(offset.y, offset.z), ny = offset.y / distance, nz = offset.z / distance;
  const visible = new Set(Array.from({ length: width * height }, (_, i) => `${i % width},${Math.floor(i / width)}`));
  for (const aspect of [1.26, 16 / 9, 21 / 9]) {
    const seen = new Set();
    for (let tz = 0; tz < height; tz++) for (let tx = 0; tx < width; tx++) {
      const target = { x: tx - width / 2 + 0.5, y: 0.8, z: tz - height / 2 + 0.5 };
      const fov = constrainInteriorCamera(target, offset, aspect, width, height, 0, 0.01);
      const tangent = Math.tan(fov * Math.PI / 360);
      const project = (p) => {
        const dx = p.x - target.x, dy = p.y - (target.y + offset.y), dz = p.z - (target.z + offset.z);
        const depth = -(ny * dy + nz * dz);
        return [dx / (depth * tangent * aspect), (nz * dy - ny * dz) / (depth * tangent)];
      };
      for (const cell of visible) {
        if (seen.has(cell)) continue;
        const [x, z] = cell.split(',').map(Number);
        const cx = x - width / 2 + 0.5, cz = z - height / 2 + 0.5;
        const points = [[-.5, 0, -.5], [.5, 0, -.5], [-.5, 0, .5], [.5, 0, .5], [0, 1.7, 0]]
          .map(([ox, oy, oz]) => ({ x: cx + ox, y: oy, z: cz + oz }));
        if (points.every((p) => project(p).every((v) => Math.abs(v) <= 0.95))) seen.add(cell);
      }
    }
    for (const cell of [...visible]) if (!seen.has(cell)) visible.delete(cell);
  }
  return visible;
}

test('Chapter 6 renders enhanced Hollow Wood art at 32 native pixels per unchanged tactical cell', async () => {
  const png = await readFile(new URL('../assets/maps/village/forest.png', import.meta.url));
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [1536, 672]);
  assert.equal(png.readUInt32BE(16) / raw.width, 32);
  assert.equal(png.readUInt32BE(20) / raw.height, 32);
  const group = new THREE.Group();
  const level = levels.buildLevel(THREE, group, raw);
  assert.equal(raw.villageScene.layout, 'forest');
  assert.equal(level.width, 48);
  assert.equal(level.height, 21);
  const artwork = group.getObjectByName('illustrated-forest');
  assert.ok(artwork);
  assert.equal(artwork.material.map.magFilter, THREE.NearestFilter);
  assert.equal(artwork.material.map.minFilter, THREE.NearestFilter);
  assert.equal(artwork.material.map.generateMipmaps, false);
  assert.deepEqual(artwork.material.map.repeat.toArray(), [1, 1], 'the complete enhanced map is shown, not its upper-left quarter');
  assert.deepEqual(artwork.material.map.offset.toArray(), [0, 0]);
  assert.equal(group.children.filter((mesh) => mesh.isMesh).length, 1, 'no tile, tree or prop geometry over the art');
  assert.deepEqual(levels.validateLevel(JSON.parse(JSON.stringify(level))).villageScene, raw.villageScene);
});

test('Chapter 6 walkable cells, units and reinforcement spawns are all connected and inside the camera view', () => {
  const level = levels.validateLevel(raw);
  const reachable = reachableFrom(level, level.spawn);
  const walkable = [];
  for (let z = 0; z < level.height; z++) for (let x = 0; x < level.width; x++)
    if (grid.isWalkable(level, x, z)) walkable.push({ x, z });
  assert.equal(reachable.size, walkable.length, 'no disconnected walkable islands');
  const visible = visibleCells(level.width, level.height);
  for (const cell of walkable) assert.ok(visible.has(key(cell)), `walkable ${key(cell)} is inside the camera view`);
  for (const unit of [...level.players, ...level.enemies, ...level.reinforcements.flatMap((wave) => wave.units)]) {
    assert.ok(reachable.has(key(unit)), `${unit.id} at ${key(unit)} is reachable`);
    assert.ok(unit.z > 2, `${unit.id} at ${key(unit)} is below the HUD rows`);
  }
});

test('Chapter 6 cursor stays on the playable forest while the art beyond it remains scenery', () => {
  const level = levels.validateLevel(raw);
  const [minX, minZ, maxX, maxZ] = level.villageScene.cursorBounds;
  assert.deepEqual([minX, minZ, maxX, maxZ], [4, 3, 43, 17]);
  const visible = visibleCells(level.width, level.height);
  for (let z = minZ; z <= maxZ; z++) for (let x = minX; x <= maxX; x++) {
    if (grid.isWalkable(level, x, z)) assert.ok(visible.has(key({ x, z })));
  }
  const tight = { ...raw, villageScene: { ...raw.villageScene, cursorBounds: [5, 3, 43, 17] } };
  assert.throws(() => levels.validateLevel(JSON.parse(JSON.stringify(tight))), /cursorBounds/);
});

test('Chapter 6 chokepoints: the channel is crossed only by log bridges and the den by two ridge gaps and the thicket', () => {
  const level = levels.validateLevel(raw);
  for (let z = 0; z < level.height; z++) for (const x of [15, 16])
    assert.equal(grid.isWalkable(level, x, z), level.tileIds[z][x] === 'forest_bridge', `channel ${x},${z}`);
  assert.deepEqual([...new Set(level.tileIds.flatMap((row, z) => row[15] === 'forest_bridge' ? [z] : []))], [4, 5, 10, 16]);
  const gaps = [];
  for (let z = 0; z < level.height; z++) if ([32, 33, 34].every((x) => grid.isWalkable(level, x, z))) gaps.push(z);
  assert.deepEqual(gaps, [6, 9, 10, 11, 13]);
  for (const z of [9, 10, 11]) for (const x of [32, 33, 34])
    assert.equal(level.tileIds[z][x], 'forest_thicket', `monolith lane reaches the den through bramble at ${x},${z}`);
  const bramble = terrain.getTerrain(level, 32, 10);
  assert.deepEqual([bramble.name, bramble.avoid, bramble.defense, bramble.moveCost], ['Bramble Thicket', 30, 0, 2]);
  for (let z = 0; z < level.height; z++) if (!gaps.includes(z))
    assert.ok([32, 33, 34].some((x) => !grid.isWalkable(level, x, z)), `ridge row ${z} is closed`);
  const undergrowth = { x: 23, z: 9 };
  assert.equal(level.tileIds[undergrowth.z][undergrowth.x], 'forest_undergrowth');
  const cover = terrain.getTerrain(level, undergrowth.x, undergrowth.z);
  assert.deepEqual([cover.avoid, cover.defense, cover.moveCost], [20, 2, 2]);
  assert.equal(terrain.getTerrain(level, 15, 10).name, 'Log Footbridge');
});

test('Chapter 6 encounter: Great Wolf den boss, fourteen guards and finite flank and rear waves', () => {
  const level = levels.validateLevel(raw);
  assert.equal(level.objective, 'defeat-boss');
  const boss = level.enemies.find((enemy) => enemy.id === 'great-wolf');
  assert.deepEqual([boss.x, boss.z, boss.drop], [38, 10, 'alpha-fang']);
  assert.equal(level.enemies.filter((enemy) => enemy.id === 'feral-wolf').length, 14);
  const aiAt = (x, z) => level.enemies.find((enemy) => enemy.x === x && enemy.z === z).ai;
  for (const [x, z] of [[18, 4], [23, 4], [27, 3], [18, 16], [22, 16], [26, 15]]) assert.equal(aiAt(x, z), 'mobile', `path wolf ${x},${z} hunts`);
  for (const [x, z] of [[21, 10], [23, 9], [26, 10]]) assert.equal(aiAt(x, z), 'guard', `lane wolf ${x},${z} holds`);
  assert.deepEqual(level.reinforcements.map((wave) => [wave.turn, wave.units.length]), [[3, 2], [5, 2], [8, 3]]);
  assert.ok(level.reinforcements[0].units.every((unit) => unit.z === 3), 'turn 3 hits the north flank');
  assert.ok(level.reinforcements[1].units.every((unit) => unit.z === 17), 'turn 5 hits the south flank');
  assert.ok(level.reinforcements[2].units.some((unit) => unit.x < 15), 'turn 8 comes up behind the camp');
  const taken = new Set([...level.players, ...level.enemies].map(key));
  const free = [];
  for (let z = level.spawn.z - 2; z <= level.spawn.z + 2; z++) for (let x = level.spawn.x - 2; x <= level.spawn.x + 2; x++)
    if (grid.isWalkable(level, x, z) && !taken.has(key({ x, z }))) free.push({ x, z });
  assert.ok(free.length >= 4, 'room in camp for Seymour and later recruits');
});
