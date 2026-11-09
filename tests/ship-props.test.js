import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import * as THREE from 'three';

let server, levels, terrain;
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
  [levels, terrain] = await Promise.all([
    server.ssrLoadModule('/src/levels/level.js'), server.ssrLoadModule('/src/battle/terrain.js'),
  ]);
});
after(async () => {
  await server?.close();
  if (priorImage) Object.defineProperty(globalThis, 'Image', priorImage);
  else delete globalThis.Image;
  if (priorDocument) Object.defineProperty(globalThis, 'document', priorDocument);
  else delete globalThis.document;
});

test('Chapter 1 masts and flags match the deck props pitch and remain anchored to their mast bases', async () => {
  const raw = JSON.parse(await readFile(new URL('../data/levels/map_01_two_ships.json', import.meta.url), 'utf8'));
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
