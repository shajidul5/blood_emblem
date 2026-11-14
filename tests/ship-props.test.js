import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import * as THREE from 'three';

let server, levels, terrain, grid;
const priorImage = Object.getOwnPropertyDescriptor(globalThis, 'Image');
const priorDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
before(async () => {
  const context = {
    drawImage() {}, fillRect() {},
    createRadialGradient() { return { addColorStop() {} }; },
  };
  globalThis.document = { createElement: () => ({ getContext: () => context }) };
  globalThis.Image = class {
    set src(value) {
      this.width = this.height = 128;
      queueMicrotask(() => this.onload());
    }
  };
  server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: 'custom' });
  [levels, terrain, grid] = await Promise.all([
    server.ssrLoadModule('/src/levels/level.js'), server.ssrLoadModule('/src/battle/terrain.js'),
    server.ssrLoadModule('/src/battle/grid.js'),
  ]);
});
after(async () => {
  await server?.close();
  if (priorImage) Object.defineProperty(globalThis, 'Image', priorImage);
  else delete globalThis.Image;
  if (priorDocument) Object.defineProperty(globalThis, 'document', priorDocument);
  else delete globalThis.document;
});

test('Legacy ship masts retain their original pitch and grounding for embedded saves', async () => {
  const raw = JSON.parse(await readFile(new URL('../data/levels/map_01_two_ships.json', import.meta.url), 'utf8'));
  delete raw.shipScene;
  raw.tiles = Array.from({ length: 21 }, () => Array(19).fill('deck_a'));
  raw.tiles[11][4] = raw.tiles[9][14] = 'mast_base';
  const group = new THREE.Group();
  const level = levels.buildLevel(THREE, group, raw);
  const bases = level.tileIds.flatMap((row, z) => row.flatMap((id, x) => id === 'mast_base' ? [{ x, z }] : []));
  const masts = group.children.filter((child) => child.name === 'ship-mast');
  assert.ok(masts.length > 0);
  assert.equal(masts.length, bases.length);
  for (const [index, mast] of masts.entries()) {
    const base = bases[index];
    assert.equal(mast.rotation.x, -Math.atan2(14, 10));
    assert.equal(mast.rotation.y, 0);
    assert.equal(mast.position.x, base.x - level.width / 2 + 0.5);
    assert.equal(mast.position.z, base.z - level.height / 2 + 0.5);
    const anchor = new THREE.Vector3(0, 0, 0);
    mast.updateMatrixWorld(true);
    mast.localToWorld(anchor);
    assert.equal(anchor.y, 0.12 + terrain.getTileElevation(level, base.x, base.z));
    mast.geometry.computeBoundingBox();
    assert.equal(mast.geometry.boundingBox.min.y, 0, 'mast geometry pivots at the deck, not its center');
    assert.equal(mast.geometry.boundingBox.max.y, 3);
    assert.equal(mast.material.map.magFilter, THREE.NearestFilter);
  }
});

test('Illustrated ship grids are connected, block cargo, and preserve chapter encounters', async () => {
  for (const [filename, enemyCount] of [['map_01_two_ships', 4], ['map_02_boarders_from_the_deep', 5]]) {
    const raw = JSON.parse(await readFile(new URL(`../data/levels/${filename}.json`, import.meta.url), 'utf8'));
    const group = new THREE.Group();
    const level = levels.buildLevel(THREE, group, raw);
    const walkable = (x, z) => ['ship_deck', 'ship_steps', 'ship_gangway'].includes(level.tileIds[z]?.[x]);
    const queue = [level.spawn];
    const visited = new Set([`${level.spawn.x},${level.spawn.z}`]);
    for (let i = 0; i < queue.length; i++) {
      const { x, z } = queue[i];
      for (const [cx, cz] of [[x-1,z], [x+1,z], [x,z-1], [x,z+1]]) {
        const key = `${cx},${cz}`;
        if (!visited.has(key) && walkable(cx, cz) && grid.canTraverseEdge(level, { x, z }, { x: cx, z: cz })) {
          visited.add(key);
          queue.push({ x: cx, z: cz });
        }
      }
    }
    assert.equal(visited.size, level.tileIds.flat().filter((id) => ['ship_deck', 'ship_steps', 'ship_gangway'].includes(id)).length);
    assert.equal(level.enemies.length, enemyCount);
    for (const point of [level.exit, ...level.players, ...level.enemies]) {
      assert.ok(visited.has(`${point.x},${point.z}`), 'all spawns and exits must be reachable');
    }
    assert.equal(terrain.getTerrain(level, 4, 3).walkable, false, 'wheel blocks its cell');
    assert.equal(terrain.getTerrain(level, 3, 5).avoid, 20);
    assert.equal(terrain.getTileElevation(level, 3, 5), 0, 'artwork and feet use one flat ground plane');
    assert.equal(group.getObjectByName('ship-mast'), undefined, 'no duplicate legacy mast');
    assert.ok(group.getObjectByName('illustrated-ships'));
    assert.ok(group.getObjectByName('ship-ocean'));
    assert.ok(group.getObjectByName('ship-hull-foam'));
    assert.equal(group.children.filter((mesh) => mesh.name === 'ship-wind-flag').length, level.width === 19 ? 2 : 1);
    assert.deepEqual(levels.validateLevel(JSON.parse(JSON.stringify(level))).shipScene, raw.shipScene, 'save round trip preserves layout');
    if (level.width === 19) {
      assert.equal(level.enemies[0].id, 'bartz');
      for (let x = 7; x <= 11; x++) {
        assert.equal(level.tileIds[9][x], 'ship_gangway');
        assert.equal(level.tileIds[11][x], 'ship_gangway');
        assert.equal(walkable(x, 10), false, 'open water separates the gangways');
      }
    } else {
      assert.equal(level.tileIds.flat().includes('ship_gangway'), false);
      assert.equal(level.enemies[0].id, 'merfolk-boss');
    }
  }
});

test('Both illustrated ship chapters route ground units through complete stair flights, not their sides', async () => {
  for (const filename of ['map_01_two_ships', 'map_02_boarders_from_the_deep']) {
    const raw = JSON.parse(await readFile(new URL(`../data/levels/${filename}.json`, import.meta.url), 'utf8'));
    const level = levels.validateLevel(raw);
    const unit = { x: 4, z: 5, movement: 2, hp: 24, type: 'infantry' };
    for (const z of [4, 5, 6]) {
      assert.equal(grid.canTraverseEdge(level, { x: 3, z }, { x: 4, z }, unit), false);
      assert.equal(grid.canTraverseEdge(level, { x: 4, z }, { x: 3, z }, unit), false);
    }
    for (const z of [3, 4, 5, 6]) {
      assert.equal(grid.canTraverseEdge(level, { x: 3, z }, { x: 3, z: z + 1 }, unit), true);
      assert.equal(grid.canTraverseEdge(level, { x: 3, z: z + 1 }, { x: 3, z }, unit), true);
    }
    const range = grid.getMovementRange(unit, level, []);
    assert.equal(range.has('3,5'), false, 'nearby sideways stair entry must not appear reachable in two steps');
    const path = grid.findPath(unit, [{ x: 3, z: 3 }], new Set(), level);
    assert.deepEqual(path, [
      { x: 4, z: 5 }, { x: 4, z: 6 }, { x: 4, z: 7 }, { x: 3, z: 7 },
      { x: 3, z: 6 }, { x: 3, z: 5 }, { x: 3, z: 4 }, { x: 3, z: 3 },
    ]);
    assert.deepEqual(grid.findPath({ x: 3, z: 3 }, [unit], new Set(), level), [...path].reverse());
    const flying = { ...unit, type: 'flying' };
    assert.equal(grid.getMovementRange(flying, level, []).get('3,5'), 1);
    assert.equal(grid.findPath(flying, [{ x: 3, z: 5 }], new Set(), level).length, 2);
    const roundTrip = levels.validateLevel(JSON.parse(JSON.stringify(level)));
    assert.deepEqual(grid.findPath(unit, [{ x: 3, z: 3 }], new Set(), roundTrip), path, 'existing illustrated saves receive the edge fix');
    if (level.width === 19) {
      const stern = grid.findPath({ x: 14, z: 13 }, [{ x: 14, z: 15 }], new Set(), level);
      assert.ok(stern.some(({ x, z }) => x === 15 && z === 14), 'raider stern is reached through its stair');
    }
  }
  const legacy = { tileIds: [['deck_a', 'stairs_n']] };
  assert.equal(grid.canTraverseEdge(legacy, { x: 0, z: 0 }, { x: 1, z: 0 }), true);
});

test('Ship flag animation deforms cloth, leaves attachment fixed, and stops updating disposed scenes', async () => {
  const raw = JSON.parse(await readFile(new URL('../data/levels/map_01_two_ships.json', import.meta.url), 'utf8'));
  const group = new THREE.Group();
  levels.buildLevel(THREE, group, raw);
  const state = group.userData.shipScene;
  const flag = state.flags[0];
  const before = flag.mesh.geometry.attributes.position.array.slice();
  levels.updateLevelAnimation(1);
  assert.notDeepEqual(flag.mesh.geometry.attributes.position.array, before);
  const uv = flag.mesh.geometry.attributes.uv;
  const positions = flag.mesh.geometry.attributes.position.array;
  for (let i = 0; i < uv.count; i++) {
    if (uv.getX(i) === 0) assert.deepEqual(positions.slice(i*3,i*3+3), before.slice(i*3,i*3+3));
  }
  const changed = positions.slice();
  const legacy = { ...raw, shipScene: undefined, tiles: Array.from({ length: 21 }, () => Array(19).fill('deck_a')) };
  levels.buildLevel(THREE, group, legacy);
  levels.updateLevelAnimation(2);
  assert.deepEqual(positions, changed);
  assert.equal(group.userData.shipScene, undefined);
});

test('Ship layout validation rejects missing, mismatched and malformed scene metadata', async () => {
  const raw = JSON.parse(await readFile(new URL('../data/levels/map_01_two_ships.json', import.meta.url), 'utf8'));
  for (const patch of [
    { shipScene: undefined },
    { shipScene: { version: 2, layout: 'two-ships' } },
    { shipScene: { version: 1, layout: 'lone-ship' } },
    { lighting: 'sunset' },
    { objects: [{ id: 'barrel', x: 3, y: 8 }] },
  ]) assert.throws(() => levels.validateLevel({ ...raw, ...patch }), /ship/i);
});
