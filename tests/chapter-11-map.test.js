import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import * as THREE from 'three';

let server, levels, tiles, raw;
const priorImage = Object.getOwnPropertyDescriptor(globalThis, 'Image');
const priorDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');

before(async () => {
  const png = await readFile(new URL('../assets/tiles/Quarantine_Ward/open_cell.png', import.meta.url));
  globalThis.Image = class {
    set src(value) {
      this.width = value.includes('open_cell') ? png.readUInt32BE(16) : 64;
      this.height = value.includes('open_cell') ? png.readUInt32BE(20) : 64;
      this.url = value;
      queueMicrotask(() => this.onload());
    }
  };
  const context = {
    drawImage() {}, fillRect() {}, strokeRect() {}, fillText() {},
    createRadialGradient() { return { addColorStop() {} }; },
  };
  globalThis.document = { createElement: () => ({ getContext: () => context }) };
  server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: 'custom' });
  levels = await server.ssrLoadModule('/src/levels/level.js');
  tiles = await server.ssrLoadModule('/src/levels/tiles.js');
  raw = JSON.parse(await readFile(new URL('../data/levels/map_11_ward.json', import.meta.url), 'utf8'));
});

after(async () => {
  await server?.close();
  for (const [key, descriptor] of [['Image', priorImage], ['document', priorDocument]]) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
});

test('all seven Chapter 11 rewards occupy exactly two empty locked cells', () => {
  const level = levels.validateLevel(raw);
  const cells = ['cell-n2', 'cell-s2'].map((id) => level.cells.find((cell) => cell.id === id));
  assert.ok(cells.every((cell) => !cell.opened && cell.prisoners.length === 0));
  assert.deepEqual(level.chests.map((chest) => chest.rewardId).sort(),
    ['light-tome', 'bloodroot-tonic', 'javelin', 'alpha-fang', 'potion', 'pocketwatch', 'pocketwatch'].sort());
  assert.equal(new Set(level.chests.map(({ x, z }) => `${x},${z}`)).size, 7);
  const counts = [0, 0];
  for (const chest of level.chests) {
    assert.ok(chest.x >= 6 && chest.x <= 9);
    const index = chest.z >= 1 && chest.z <= 4 ? 0 : chest.z >= 11 && chest.z <= 14 ? 1 : -1;
    assert.notEqual(index, -1, 'no chests remain in other cells or the hall');
    counts[index]++;
    assert.ok(tiles.isLevelTileWalkable(level, chest.x, chest.z));
    assert.ok(![...level.players, ...level.enemies].some((unit) => unit.x === chest.x && unit.z === chest.z));
  }
  assert.deepEqual(counts, [4, 3]);
  for (const cell of cells) {
    assert.equal(tiles.isLevelTileWalkable(level, cell.door.x, cell.door.z), false);
    cell.opened = true;
    assert.equal(tiles.isLevelTileWalkable(level, cell.door.x, cell.door.z), true);
  }
});

test('Rictor has a straight-on open barred doorway instead of the mansion door atlas art', () => {
  const group = new THREE.Group();
  const level = levels.buildLevel(THREE, group, raw);
  const frame = group.getObjectByName('ward-open-cell-2-5');
  assert.ok(frame);
  assert.match(frame.material.map.image.url, /Quarantine_Ward.*open_cell/);
  assert.equal(frame.rotation.x, -Math.atan2(14, 10));
  assert.equal(frame.rotation.y, 0);
  assert.equal(frame.geometry.parameters.width, 0.96);
  assert.equal(frame.material.map.magFilter, THREE.NearestFilter);
  assert.equal(frame.material.depthTest, false, 'raised adjacent walls cannot hide the open cell frame');
  assert.equal(frame.material.transparent, false, 'the frame draws in the same pass as characters');
  assert.equal(frame.material.depthWrite, false, 'the frame cannot clip characters rendered afterward');
  assert.equal(frame.renderOrder, 0.5, 'the frame draws after terrain but before allied and enemy units');
  assert.equal(level.tileIds[5][2], 'mans_door_open', 'terrain and escape route are preserved');
  assert.ok(tiles.isLevelTileWalkable(level, 2, 5));
  assert.ok(level.cells.every((cell) => cell.mesh.visible && !cell.opened), 'other cell gates stay locked');
  let doorwayFloor = false;
  const matrix = new THREE.Matrix4();
  group.traverse((mesh) => {
    if (!mesh.isInstancedMesh || mesh.geometry.type !== 'PlaneGeometry') return;
    assert.equal(mesh.material.transparent, false, 'ward terrain draws before the cell frame');
    for (let index = 0; index < mesh.count; index++) {
      mesh.getMatrixAt(index, matrix);
      if (matrix.elements[12] === 2.5 - level.width / 2 &&
          matrix.elements[14] === 5.5 - level.height / 2 && matrix.elements[13] === 0) doorwayFloor = true;
    }
  });
  assert.ok(doorwayFloor, 'plain ground replaces the old elevated mansion-door tile');
});
