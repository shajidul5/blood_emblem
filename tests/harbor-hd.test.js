import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { villageLayout, validateVillageScene } from '../src/levels/village-scene.js';

const load = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
const harbor = () => load('../data/levels/map_03_fishing_village.json');
const validationLevel = (map) => ({ ...map, tileIds: map.tiles });

test('Chapter 3 preserves gameplay except the explicit path correction and reward swap', async () => {
  const map = await harbor();
  assert.equal(map.villageScene.artwork, 'hd');
  delete map.villageScene.artwork;
  const netmaker = map.houses.find((house) => house.id === 'fisher-cottage-3');
  assert.equal(netmaker.rewardId, 'lancereaver');
  netmaker.rewardId = 'zanbato';
  for (let z = 11; z <= 13; z++) {
    assert.equal(map.tiles[z][13], 'village_path', `displayed road tile 14,${z + 1}`);
    map.tiles[z][13] = 'village_block';
  }
  for (let z = 11; z <= 12; z++) for (let x = 7; x <= 11; x++) {
    assert.equal(map.tiles[z][x], 'village_path', `displayed dirt tile ${x + 1},${z + 1}`);
    map.tiles[z][x] = 'village_block';
  }
  assert.equal(createHash('sha256').update(JSON.stringify(map)).digest('hex'),
    '859f1a9344a80aa887e29afa8a576613fd87e45b9c5c7af0796a7dd1d0b69c38',
    'all other collision, houses, rewards, party, enemies and waves remain unchanged');
});

test('native HD harbor has square 48px cells with no padding, stretching or fractional crop', async () => {
  const map = await harbor();
  const layout = villageLayout(map);
  const png = await readFile(new URL('../assets/maps/village/harbor.png', import.meta.url));
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
  assert.deepEqual([width, height], [1152, 1008]);
  assert.deepEqual(layout.crop, [0, 0, width, height]);
  assert.equal(width / map.width, 48);
  assert.equal(height / map.height, 48);
  assert.equal(layout.image, 'harbor');
  const manifest = await load('../assets/maps/village/manifest.json');
  assert.equal(manifest.images.harbor.pixelCellSize, 48);
  assert.deepEqual(manifest.layouts['harbor-hd'].crop, layout.crop);
  assert.deepEqual(manifest.layouts['harbor-hd'].grid, [map.width, map.height]);
});

test('HD art selection round-trips while legacy harbors and villages keep their original art', async () => {
  const map = await harbor();
  assert.deepEqual(validateVillageScene(map.villageScene, validationLevel(map)), map.villageScene);
  delete map.villageScene.artwork;
  assert.deepEqual(validateVillageScene(map.villageScene, validationLevel(map)), map.villageScene);
  assert.equal(villageLayout(map).image, 'village');
  assert.deepEqual(villageLayout(map).crop, [0, 0, 384, 336]);
  map.width = 21;
  map.tiles = map.tiles.map((row) => row.slice(0, 21));
  assert.deepEqual(validateVillageScene(map.villageScene, validationLevel(map)), map.villageScene);
  assert.deepEqual(villageLayout(map).crop, [0, 0, 336, 336]);
  assert.throws(() => validateVillageScene({ ...map.villageScene, artwork: 'hd' }, validationLevel(map)), /24x21 harbor/);
  const village = await load('../data/levels/map_05_escape.json');
  delete village.villageScene.artwork;
  assert.equal(villageLayout(village).image, 'village');
  assert.deepEqual(villageLayout(village).crop, [0, 0, 768, 336]);
  assert.equal(villageLayout({ ...village, villageScene: { ...village.villageScene, artwork: 'hd' } }).image, 'village-hd');
  const hd = await harbor();
  assert.throws(() => validateVillageScene({ ...hd.villageScene, artwork: 'unknown' }, validationLevel(hd)), /24x21 harbor/);
});
