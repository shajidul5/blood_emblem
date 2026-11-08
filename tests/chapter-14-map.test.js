import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import * as THREE from 'three';
import { STREET_CAMERA_PADDING } from '../src/game/camera-bounds.js';

let server, levels, tiles, characters, rawMap, story;
const profiles = new Map();
const weapons = new Map();
const previousImage = Object.getOwnPropertyDescriptor(globalThis, 'Image');
const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');

before(async () => {
  globalThis.Image = class {
    set src(value) {
      this.width = value.includes('cathedral_doors') ? 192 : value.includes('dry_fountain') ? 160 : 32;
      if (value.includes('topiary')) this.width = 96;
      this.height = value.includes('topiary') ? 112 : this.width;
      queueMicrotask(() => this.onload());
    }
  };
  server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: 'custom' });
  levels = await server.ssrLoadModule('/src/levels/level.js');
  tiles = await server.ssrLoadModule('/src/levels/tiles.js');
  characters = await server.ssrLoadModule('/src/characters/characters.js');
  rawMap = JSON.parse(await readFile(new URL('../data/levels/map_14_courtyard.json', import.meta.url), 'utf8'));
  story = JSON.parse(await readFile(new URL('../data/tutorials/chapter-14.json', import.meta.url), 'utf8'));
  for (const { id, weaponId } of [...rawMap.enemies, ...rawMap.reinforcements.flatMap(({ units }) => units)]) {
    const profile = JSON.parse(await readFile(new URL(`../data/characters/${id}.json`, import.meta.url), 'utf8'));
    profiles.set(id, profile);
    const weapon = weaponId ?? profile.weaponId;
    weapons.set(weapon, JSON.parse(await readFile(new URL(`../data/weapons/${weapon}.json`, import.meta.url), 'utf8')));
  }
});

after(async () => {
  await server?.close();
  for (const [key, descriptor] of [['Image', previousImage], ['document', previousDocument]]) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
});

const fresh = () => levels.validateLevel(structuredClone(rawMap));
const keyOf = ({ x, z }) => `${x},${z}`;
const distance = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.z - b.z);
function distances(level, start, blocked = new Set()) {
  const result = new Map([[keyOf(start), 0]]);
  const queue = [start];
  for (let i = 0; i < queue.length; i++) {
    const { x, z } = queue[i];
    for (const next of [{ x: x - 1, z }, { x: x + 1, z }, { x, z: z - 1 }, { x, z: z + 1 }]) {
      const key = keyOf(next);
      if (result.has(key) || blocked.has(key) || !tiles.isLevelTileWalkable(level, next.x, next.z)) continue;
      result.set(key, result.get(keyOf(queue[i])) + 1);
      queue.push(next);
    }
  }
  return result;
}
function coverage(level, enemy) {
  const profile = profiles.get(enemy.id);
  const weapon = weapons.get(enemy.weaponId ?? profile.weaponId);
  const result = new Set();
  for (const [key, cost] of distances(level, enemy)) {
    if (cost > (enemy.ai === 'stationary' ? 0 : profile.currentStats.movement)) continue;
    const [x, z] = key.split(',').map(Number);
    for (let tz = 0; tz < level.height; tz++) {
      for (let tx = 0; tx < level.width; tx++) {
        const range = distance({ x, z }, { x: tx, z: tz });
        if (range >= weapon.minRange && range <= weapon.maxRange) result.add(`${tx},${tz}`);
      }
    }
  }
  return result;
}

test('Chapter 14 loads the courtyard with four core allies and only Severin as the objective', async () => {
  const level = fresh();
  assert.equal(levels.CHAPTER_COUNT, 15);
  assert.deepEqual([level.width, level.height], [26, 30]);
  assert.equal(level.objective, 'defeat-courtyard-general');
  assert.equal(level.courtyard.bossId, 'severin');
  assert.equal(level.streets, undefined);
  assert.equal(level.rescue, null);
  assert.equal(level.gateEncounter, null);
  assert.deepEqual(level.requiredUnits, ['rictor', 'lena', 'arlan', 'troy']);
  assert.deepEqual(level.players.map(({ id }) => id), level.requiredUnits);
  for (const key of ['houses', 'decorativeHouses', 'chests', 'objects', 'startingItems']) assert.deepEqual(level[key], []);
  const previousFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url) => {
      assert.match(String(url), /map_14_courtyard\.json/);
      return { ok: true, json: async () => structuredClone(rawMap) };
    };
    assert.equal((await levels.loadChapterLevel(13)).name, rawMap.name);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('the entire paving and formal-garden network connects both fountain bypasses and every placement', () => {
  const level = fresh();
  const reachable = distances(level, level.spawn);
  for (let z = 0; z < level.height; z++) {
    for (let x = 0; x < level.width; x++) {
      if (tiles.isLevelTileWalkable(level, x, z)) assert.ok(reachable.has(`${x},${z}`), `isolated tile ${x},${z}`);
    }
  }
  for (const point of [level.exit, ...level.enemies, ...level.reinforcements.flatMap(({ units }) => units)]) {
    assert.ok(reachable.has(keyOf(point)), `unreachable placement ${keyOf(point)}`);
  }
  for (const x of [10, 15]) {
    for (const z of [15, 16, 17]) assert.ok(reachable.has(`${x},${z}`), 'both fountain bypasses remain open');
  }
  for (const id of ['courtyard_hedge', 'courtyard_wall', 'courtyard_fountain', 'courtyard_cathedral']) {
    assert.equal(tiles.isTileWalkable(id), false);
  }
  assert.equal(tiles.getTileDef('courtyard_lawn').avoid, 10);
  assert.equal(tiles.getTileDef('courtyard_lawn').defense, 1);
  assert.equal(tiles.getTileDef('courtyard_paving').avoid, 0);
  assert.equal(tiles.isLevelTileWalkable(level, 11, 15, { type: 'flying' }), false);
  assert.equal(tiles.isLevelTileWalkable(level, 10, 1, { type: 'flying' }), false);
});

test('authored enemies instantiate without scaling below their base levels and use staggered defensive roles', () => {
  const level = fresh();
  for (const [id, count, minimum, ai] of [
    ['golden-cavalier', 6, 18, 'mobile'], ['ward-knight', 5, 14, 'guard'],
    ['golden-mage', 4, 18, 'guard'], ['church-sage', 2, 20, 'guard'],
  ]) {
    const placements = level.enemies.filter((enemy) => enemy.id === id);
    assert.equal(placements.length, count);
    assert.ok(placements.every((enemy) => enemy.level >= minimum && enemy.ai === ai));
  }
  for (const placement of [...level.enemies, ...level.reinforcements.flatMap(({ units }) => units)]) {
    assert.ok(placement.level >= profiles.get(placement.id).level, placement.id);
    const unit = characters.createEnemyUnit(placement.id, placement.x, placement.z, placement);
    assert.equal(unit.level, placement.level);
    assert.equal(unit.ai, placement.ai);
    if (placement.id === 'church-sage') assert.equal(unit.weapon.id, 'inferno');
  }
  const boss = level.enemies.find(({ id }) => id === 'severin');
  const healer = level.enemies.find(({ id }) => id === 'church-healer');
  const freezer = level.enemies.find(({ id }) => id === 'church-freezer');
  assert.equal(boss.ai, 'stationary');
  assert.equal(healer.ai, 'stationary');
  assert.equal(freezer.ai, 'stationary');
  assert.equal(distance(healer, boss), 1, 'the in-place healer can support Severin immediately');
  assert.ok(level.enemies.some((enemy) => enemy.id === 'ward-knight' && distance(enemy, freezer) === 1));
  assert.equal(characters.createEnemyUnit(freezer.id, freezer.x, freezer.z, freezer).magic, 5, 'Freeze remains a manageable five-tile reach');
});

test('central spellcasters pressure the aisle without opening attacks or cutting off the garden flanks', () => {
  const level = fresh();
  const corvis = level.enemies.find(({ id }) => id === 'corvis');
  assert.deepEqual(corvis, { id: 'corvis', x: 5, z: 17, level: 17, ai: 'guard' });
  assert.equal(level.courtyard.recruit.recruiterId, 'eveline');
  assert.equal(level.requiredUnits.includes('eveline'), false);
  assert.equal(level.requiredUnits.includes('corvis'), false);
  for (const player of level.players) assert.equal(coverage(level, corvis).has(keyOf(player)), false);
  const casters = level.enemies.filter(({ id }) => ['golden-mage', 'church-sage'].includes(id));
  assert.ok(casters.every(({ x }) => x >= 10 && x <= 15), 'every mage holds a central lane');
  const allCoverage = casters.map((enemy) => coverage(level, enemy));
  for (const range of allCoverage) {
    for (const player of level.players) assert.equal(range.has(keyOf(player)), false, 'no opening mage attack');
    assert.equal(range.has('5,18'), false, 'Corvis has a safe southern Talk tile');
  }
  const blocked = new Set();
  for (let z = 0; z < level.height; z++) {
    for (let x = 0; x < level.width; x++) {
      if (allCoverage.filter((range) => range.has(`${x},${z}`)).length > 1) blocked.add(`${x},${z}`);
    }
  }
  const flanks = distances(level, level.spawn, blocked);
  for (const point of ['2,8', '23,11']) {
    assert.ok(flanks.has(point), `garden flank ${point} avoids overlapping initial magic`);
  }
  const entirelySafe = new Set(allCoverage.flatMap((range) => [...range]));
  assert.ok(distances(level, level.spawn, entirelySafe).has('5,18'), 'Eveline can approach Corvis without crossing another initial magic range');
});

test('two uniquely marked finite waves wait for ordered progress and retain warning and partial arrival state', () => {
  const level = fresh();
  assert.deepEqual(level.courtyard.triggers, [
    { id: 'courtyard-cavalry', thresholdZ: 15, warnedTurn: null },
    { id: 'courtyard-ravens', thresholdZ: 8, warnedTurn: null },
  ]);
  assert.equal(level.reinforcements.length, 2);
  for (const [index, wave] of level.reinforcements.entries()) {
    assert.equal(wave.entranceId, level.courtyard.triggers[index].id);
    assert.equal(wave.turn, 999);
    assert.equal(wave.spawned, false);
    assert.equal(wave.spawnedCount, 0);
    assert.equal(new Set(wave.units.map(keyOf)).size, wave.units.length);
  }
  assert.deepEqual(level.reinforcements.map(({ units }) => units.length), [3, 4]);
  level.courtyard.triggers[0].warnedTurn = 5;
  level.reinforcements[0].turn = 6;
  level.reinforcements[0].spawnedCount = 1;
  const restored = levels.validateLevel(JSON.parse(JSON.stringify(level)));
  assert.deepEqual(restored.courtyard, level.courtyard);
  assert.deepEqual(restored.reinforcements, level.reinforcements);
  assert.notEqual(restored.courtyard.recruit, level.courtyard.recruit);
});

test('courtyard validation rejects malformed identity, triggers and missing matching waves', () => {
  for (const mutate of [
    (map) => { delete map.courtyard; },
    (map) => { map.courtyard = []; },
    (map) => { map.courtyard.bossId = ''; },
    (map) => { map.courtyard.recruit.id = ''; },
    (map) => { map.courtyard.recruit.dead = 'yes'; },
    (map) => { map.courtyard.recruit.dead = map.courtyard.recruit.recruited = true; },
    (map) => { map.courtyard.triggers.pop(); },
    (map) => { map.courtyard.triggers[0].thresholdZ = 30; },
    (map) => { map.courtyard.triggers[0].thresholdZ = 0.5; },
    (map) => { map.courtyard.triggers[0].warnedTurn = -1; },
    (map) => { map.courtyard.triggers[1].id = map.courtyard.triggers[0].id; },
    (map) => { map.courtyard.triggers.reverse(); },
    (map) => { map.reinforcements[0].entranceId = 'wrong-gate'; },
  ]) {
    const map = structuredClone(rawMap);
    mutate(map);
    assert.throws(() => levels.validateLevel(map));
  }
});

test('courtyard art stays axis-aligned and inside blocked footprints with bounded scenery and two entrance markers', () => {
  const context = {
    drawImage() {}, fillRect() {}, strokeRect() {}, fillText() {},
    createRadialGradient() { return { addColorStop() {} }; },
  };
  globalThis.document = { createElement() { return { width: 0, height: 0, getContext() { return context; } }; } };
  const group = new THREE.Group();
  const level = levels.buildLevel(THREE, group, structuredClone(rawMap));
  assert.equal(group.userData.courtyardCameraPadding, STREET_CAMERA_PADDING);
  assert.equal(group.userData.courtyardGeometry.cameraPadding, STREET_CAMERA_PADDING);
  assert.equal(group.userData.streetTown, undefined);
  assert.equal(group.userData.cityBackdrop, undefined);
  assert.equal(group.getObjectByName('courtyard-scenic-paving').count, 42 * 46 - 26 * 30);
  assert.equal(group.getObjectByName('courtyard_hedge').geometry.parameters.height, 0.38);
  assert.equal(group.getObjectByName('courtyard_wall').geometry.parameters.height, 0.28);
  const ground = group.children.filter(({ name }) => name.startsWith('courtyard-ground-'));
  assert.equal(ground.reduce((count, mesh) =>
    count + mesh.count * mesh.geometry.parameters.width * mesh.geometry.parameters.height, 0),
  level.width * level.height);
  const basin = group.getObjectByName('courtyard-ground-basin');
  assert.equal(basin.count, 1, 'one continuous basin rather than a separate bowl on each tile');
  assert.equal(basin.geometry.parameters.width, 4);
  assert.equal(basin.geometry.parameters.height, 3);
  for (const art of ['paving', 'paving_moss', 'paving_medallion', 'paving_border', 'steps',
    'lawn', 'lawn_flowers', 'flowerbed', 'soil', 'hedge', 'hedge_alt', 'wall', 'masonry', 'basin']) {
    const mesh = group.getObjectByName(`courtyard-ground-${art}`);
    assert.ok(mesh?.count > 0, `${art} is actually used on the map`);
    assert.ok(mesh.material.map?.image, `${art} uses generated art`);
    assert.equal(mesh.material.color.getHex(), 0xffffff, 'terrain keeps the generated palette');
    assert.equal(mesh.material.map.magFilter, THREE.NearestFilter);
  }
  assert.equal(new Set(ground.map(({ material }) => material.map.image)).size, ground.length);
  for (const id of ['courtyard_hedge', 'courtyard_wall', 'courtyard_cathedral']) {
    assert.ok(group.getObjectByName(id).material.every((material) => material.map?.image),
      `${id} has generated art on every face, not flat-color sides`);
  }
  const bushes = group.getObjectByName('cathedral-courtyard-architecture').children
    .filter(({ name }) => name.startsWith('courtyard-topiary-'));
  assert.equal(bushes.length, 24);
  for (const bush of bushes) {
    const { x, z } = bush.userData.footprint;
    assert.equal(level.tileIds[z][x], 'courtyard_hedge', 'garden props never obstruct walkable tiles');
    assert.ok(bush.position.y > 0.38, 'planters sit above the hedge rather than being buried inside it');
    const width = bush.geometry.parameters.width;
    const depth = bush.geometry.parameters.height * Math.sin(Math.abs(bush.rotation.x));
    assert.ok(bush.position.x - width / 2 >= x - level.width / 2);
    assert.ok(bush.position.x + width / 2 <= x + 1 - level.width / 2);
    assert.ok(bush.position.z - depth >= z - level.height / 2);
    assert.ok(bush.position.z <= z + 1 - level.height / 2);
  }
  for (const name of ['courtyard-cathedral-doors', 'courtyard-dry-fountain']) {
    const prop = group.getObjectByName(name);
    const footprint = prop.userData.footprint;
    const width = prop.geometry.parameters.width;
    const depth = prop.geometry.parameters.height * Math.sin(Math.abs(prop.rotation.x));
    assert.equal(prop.rotation.y, 0);
    assert.ok(prop.position.x - width / 2 >= footprint.x - level.width / 2);
    assert.ok(prop.position.x + width / 2 <= footprint.x + footprint.width - level.width / 2);
    assert.ok(prop.position.z - depth >= footprint.z - level.height / 2);
    assert.ok(prop.position.z <= footprint.z + footprint.height - level.height / 2);
  }
  for (const [i, entrance] of group.userData.courtyardGeometry.entrances.entries()) {
    assert.equal(entrance.userData.entranceId, level.reinforcements[i].entranceId);
    assert.deepEqual(entrance.children.map(({ userData }) => userData.arrivalTile),
      level.reinforcements[i].units.map(({ x, z }) => ({ x, z })));
  }
  group.traverse((node) => { node.geometry?.dispose(); });
});

test('required courtyard stories describe warned arrivals without revealing the mystery inside', () => {
  for (const key of ['courtyard', 'corvis', 'corvisLost', 'courtyardCavalryWarning', 'courtyardRavenWarning', 'courtyardEnding']) {
    assert.ok(story[key]?.pages.length, key);
    assert.ok(story[key].pages.every(({ title, paragraphs }) => title && paragraphs?.length));
  }
  assert.match(JSON.stringify(story.courtyardCavalryWarning), /finite wave.*three/i);
  assert.match(JSON.stringify(story.courtyardRavenWarning), /envoy/i);
  assert.match(JSON.stringify(story.courtyardRavenWarning), /expected/);
  assert.match(JSON.stringify(story.courtyardEnding), /Bishop is still inside/);
  assert.doesNotMatch(JSON.stringify(story), /{recruitment}|Church (created|caused) the scourge/i);
});
