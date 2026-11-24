import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { villageLayout, validateVillageScene } from '../src/levels/village-scene.js';

const load = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
const manor = () => load('../data/levels/map_04_mansion.json');
const validationLevel = (map) => ({ ...map, tileIds: map.tiles });

test('Chapter 4 HD upgrade changes artwork metadata only, preserving exact map size and every gameplay field', async () => {
  const map = await manor();
  assert.deepEqual([map.width, map.height], [24, 20]);
  assert.equal(map.villageScene.artwork, 'hd');
  delete map.villageScene.artwork;
  assert.equal(createHash('sha256').update(JSON.stringify(map)).digest('hex'),
    '326ce49ffa9506c406c91382ab842eccf8b315374353fcdfe51a20ce18527722',
    'no changes to collision, stairs, chests, rewards, enemies, party, objective or framing');
});

test('HD manor uses its full native 1152x960 image at exactly 48 square pixels per tile', async () => {
  const map = await manor();
  const layout = villageLayout(map);
  const png = await readFile(new URL('../assets/maps/village/manor-hd.png', import.meta.url));
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
  assert.deepEqual([width, height], [1152, 960]);
  assert.deepEqual(layout.crop, [0, 0, width, height]);
  assert.deepEqual([layout.width, layout.height], [map.width, map.height]);
  assert.equal(width / map.width, 48);
  assert.equal(height / map.height, 48);
  assert.equal(layout.image, 'manor-hd');
  assert.equal(layout.tint, 0xffffff, 'night-authored pixels are not tinted a second time');
  const manifest = await load('../assets/maps/village/manifest.json');
  assert.equal(manifest.images['manor-hd'].pixelCellSize, 48);
  assert.deepEqual(manifest.layouts['manor-hd'].crop, layout.crop);
  assert.deepEqual(manifest.layouts['manor-hd'].grid, [24, 20]);
  assert.deepEqual(manifest.layouts['manor-hd'].stairBounds, [[288, 720, 96, 96], [768, 480, 96, 96]]);
  for (const [left, top, width, height] of manifest.layouts['manor-hd'].stairBounds)
    for (let z = top / 48; z < (top + height) / 48; z++)
      for (let x = left / 48; x < (left + width) / 48; x++)
        assert.equal(map.tiles[z][x], 'manor_stairs');
  for (const [x, z] of [[3, 5], [20, 5], [3, 7], [20, 7], [3, 13], [20, 13]])
    assert.equal(map.tiles[z][x], 'manor_floor', `doorway ${x},${z} stays open`);
  assert.deepEqual(map.chests.map(({ x, z, rewardId }) => [x, z, rewardId]),
    [[18, 2, 'hand-axe'], [20, 2, 'master-emblem'], [2, 17, 'zanbato']]);
});

test('HD manor metadata round-trips but existing embedded manor and mansion saves keep original artwork', async () => {
  const map = await manor();
  assert.deepEqual(validateVillageScene(map.villageScene, validationLevel(map)), map.villageScene);
  delete map.villageScene.artwork;
  assert.deepEqual(validateVillageScene(map.villageScene, validationLevel(map)), map.villageScene);
  assert.equal(villageLayout(map).image, 'manor');
  assert.deepEqual(villageLayout(map).crop, [0, 0, 384, 320]);
  assert.equal(villageLayout(map).tint, 0x8c88a8);
  const legacy = { villageScene: { version: 1, layout: 'mansion' }, width: 32, height: 32 };
  assert.equal(villageLayout(legacy).image, 'mansion');
  assert.deepEqual(villageLayout(legacy).crop, [0, 0, 512, 512]);
  assert.throws(() => validateVillageScene({ ...map.villageScene, artwork: 'unknown' }, validationLevel(map)), /HD artwork/);
  for (const [width, height] of [[25, 20], [24, 21], [48, 40]])
    assert.throws(() => validateVillageScene({ ...map.villageScene, artwork: 'hd' },
      { ...validationLevel(map), width, height }), /fixed artwork dimensions/);
});
