import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { villageLayout, validateVillageScene } from '../src/levels/village-scene.js';

const load = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
const village = () => load('../data/levels/map_05_escape.json');
const validationLevel = (map) => ({ ...map, tileIds: map.tiles });

const correctedRoads = [
  ...Array.from({ length: 3 }, (_, i) => [13, 11 + i]),
  ...[11, 12].flatMap((z) => Array.from({ length: 5 }, (_, i) => [7 + i, z])),
  ...Array.from({ length: 4 }, (_, i) => [34 + i, 11]),
  ...Array.from({ length: 3 }, (_, i) => [36, 12 + i]),
  ...[16, 17].flatMap((z) => [34, 35].map((x) => [x, z])),
];

test('Chapter 5 HD upgrade preserves gameplay except the explicit road corrections', async () => {
  const map = await village();
  assert.deepEqual([map.width, map.height], [48, 21]);
  assert.equal(map.villageScene.artwork, 'hd');
  delete map.villageScene.artwork;
  for (const [x, z] of correctedRoads) {
    assert.equal(map.tiles[z][x], 'village_path', `displayed road tile ${x + 1},${z + 1}`);
    map.tiles[z][x] = 'village_block';
  }
  assert.equal(createHash('sha256').update(JSON.stringify(map)).digest('hex'),
    '6061306cea29531bf746298f42257f2f49e907e3a28b7e1d082d06220f0aeeca',
    'preserve all other collision, houses, rewards, Seymour recruitment, exit cells, party, enemies and waves');
});

test('Chapter 5 roads stay continuous without opening buildings, planters or water', async () => {
  const map = await village();
  const road = (x, z) => assert.equal(map.tiles[z][x], 'village_path', `road ${x + 1},${z + 1}`);
  for (let x = 3; x <= 45; x++) road(x, 10);
  for (let z = 0; z <= 20; z++) road(22, z);
  for (let z = 10; z <= 13; z++) road(13, z);
  for (let z = 10; z <= 17; z++) for (const x of [34, 35]) road(x, z);
  for (let z = 12; z <= 14; z++) road(36, z);
  for (let x = 34; x <= 44; x++) road(x, 15);
  for (const [x, z] of [[37,12], [37,13], [37,14], [41,12], [42,12],
    [35,7], [35,18], [34,18], [11,13], [15,12]]) {
    assert.equal(map.tiles[z][x], 'village_block', `obstacle ${x + 1},${z + 1}`);
  }
});

test('HD village has square native 48px cells and matches Chapter 3 unit scale without expanding the map', async () => {
  const map = await village();
  const layout = villageLayout(map);
  const png = await readFile(new URL('../assets/maps/village/village-hd.png', import.meta.url));
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
  assert.deepEqual([width, height], [2304, 1008]);
  assert.deepEqual(layout.crop, [0, 0, width, height]);
  assert.deepEqual([layout.width, layout.height], [48, 21]);
  assert.equal(width / map.width, 48);
  assert.equal(height / map.height, 48);
  const harbor = await load('../data/levels/map_03_fishing_village.json');
  assert.equal(villageLayout(harbor).crop[2] / harbor.width, width / map.width);
  const manifest = await load('../assets/maps/village/manifest.json');
  assert.equal(manifest.images['village-hd'].pixelCellSize, 48);
  assert.deepEqual(manifest.layouts['village-hd'].crop, layout.crop);
  assert.deepEqual(manifest.layouts['village-hd'].grid, [48, 21]);
  assert.deepEqual(map.houses.map(({ door, rewardId, recruitId }) => [door.x, door.z, rewardId ?? recruitId]),
    [[10, 7, 'hunter-pistol'], [28, 6, 'master-emblem'], [43, 15, 'seymour']]);
});

test('HD village scene round-trips and legacy embedded villages still select original art', async () => {
  const map = await village();
  assert.deepEqual(validateVillageScene(map.villageScene, validationLevel(map)), map.villageScene);
  assert.equal(villageLayout(map).image, 'village-hd');
  delete map.villageScene.artwork;
  assert.deepEqual(validateVillageScene(map.villageScene, validationLevel(map)), map.villageScene);
  assert.equal(villageLayout(map).image, 'village');
  assert.deepEqual(villageLayout(map).crop, [0, 0, 768, 336]);
  assert.throws(() => validateVillageScene({ ...map.villageScene, artwork: 'unknown' }, validationLevel(map)), /HD artwork/);
  for (const [width, height] of [[49, 21], [48, 22], [24, 21]])
    assert.throws(() => validateVillageScene({ ...map.villageScene, artwork: 'hd' },
      { ...validationLevel(map), width, height }), /fixed artwork dimensions/);
});
