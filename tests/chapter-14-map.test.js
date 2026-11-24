import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { inflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { createServer } from 'vite';
import * as THREE from 'three';
import { STREET_CAMERA_PADDING, constrainInteriorCamera } from '../src/game/camera-bounds.js';
import { battleSpriteKey, battleIdleKey, supportsBattleScene } from '../src/battle/battle-animation.js';

let server, levels, tiles, characters, grid, courtyard, rawMap, story;
const profiles = new Map();
const weapons = new Map();
const previousImage = Object.getOwnPropertyDescriptor(globalThis, 'Image');
const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');

before(async () => {
  const topiaryPng = await readFile(new URL('../assets/tiles/Cathedral_Courtyard/topiary.png', import.meta.url));
  const topiarySize = { width: topiaryPng.readUInt32BE(16), height: topiaryPng.readUInt32BE(20) };
  const buildingPng = await readFile(new URL('../assets/tiles/Cathedral_Courtyard/cathedral_building.png', import.meta.url));
  const portalPng = await readFile(new URL('../assets/tiles/Cathedral_Courtyard/entrance_portal.png', import.meta.url));
  globalThis.Image = class {
    set src(value) {
      this.url = value;
      this.width = value.includes('cathedral_doors') ? 192 : value.includes('dry_fountain') ? 160 : 32;
      this.height = this.width;
      if (value.includes('topiary')) Object.assign(this, topiarySize);
      if (value.includes('cathedral_building')) {
        this.width = buildingPng.readUInt32BE(16);
        this.height = buildingPng.readUInt32BE(20);
      }
      if (value.includes('entrance_portal')) {
        this.width = portalPng.readUInt32BE(16);
        this.height = portalPng.readUInt32BE(20);
      }
      if (/\/maps\/village\/courtyard(?:-concept|-aligned|-repaired|-depth|-passage|-redrawn)?\.png/.test(value)) { this.width = 1248; this.height = 1440; }
      queueMicrotask(() => this.onload());
    }
  };
  server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: 'custom' });
  levels = await server.ssrLoadModule('/src/levels/level.js');
  tiles = await server.ssrLoadModule('/src/levels/tiles.js');
  characters = await server.ssrLoadModule('/src/characters/characters.js');
  grid = await server.ssrLoadModule('/src/battle/grid.js');
  courtyard = await server.ssrLoadModule('/src/game/courtyard.js');
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
  const unit = characters.createEnemyUnit(enemy.id, enemy.x, enemy.z, { ...enemy, chapter: 13 });
  const weapon = unit.weapon;
  const result = new Set();
  const reach = unit.ai === 'stationary' ? new Map([[keyOf(unit), 0]]) :
    grid.getMovementRange(unit, level, courtyard.courtyardPatrolBlockers(level, unit));
  const court = courtyard.courtyardDeliveryCourt(level, unit);
  for (const key of reach.keys()) {
    const [x, z] = key.split(',').map(Number);
    for (let tz = 0; tz < level.height; tz++) {
      for (let tx = 0; tx < level.width; tx++) {
        const range = distance({ x, z }, { x: tx, z: tz });
        if ((!court || courtyard.insideDeliveryCourt(court, { x: tx, z: tz })) &&
            range >= weapon.minRange && range <= (weapon.freeze ? unit.magic : weapon.maxRange)) result.add(`${tx},${tz}`);
      }
    }
  }
  return result;
}

async function courtyardPixels(file) {
  const png = await readFile(new URL(`../assets/maps/village/${file}.png`, import.meta.url));
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20), chunks = [];
  assert.deepEqual([width, height, png[24], png[25]], [1248, 1440, 8, 6]);
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset);
    if (png.toString('ascii', offset + 4, offset + 8) === 'IDAT')
      chunks.push(png.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  const rows = inflateSync(Buffer.concat(chunks)), stride = width * 4 + 1;
  for (let y = 0; y < height; y++) assert.equal(rows[y * stride], 0, 'authored PNG uses unfiltered RGBA rows');
  return (x, y) => rows.subarray(y * stride + 1 + x * 4, y * stride + 1 + x * 4 + 4);
}

test('Chapter 14 loads the courtyard with four core allies and only Severin as the objective', async () => {
  const level = fresh();
  assert.equal(levels.CHAPTER_COUNT, 19);
  assert.deepEqual([level.width, level.height], [26, 30]);
  assert.equal(level.objective, 'defeat-courtyard-general');
  assert.equal(level.courtyard.bossId, 'severin');
  assert.equal(level.streets, undefined);
  assert.equal(level.rescue, null);
  assert.equal(level.gateEncounter, null);
  assert.deepEqual(level.requiredUnits, ['rictor', 'lena', 'arlan', 'troy']);
  assert.deepEqual(level.players.map(({ id }) => id), level.requiredUnits);
  for (const key of ['houses', 'decorativeHouses', 'objects', 'startingItems']) assert.deepEqual(level[key], []);
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
  for (const x of [2, 17]) {
    for (const z of [11, 12, 13]) assert.ok(reachable.has(`${x},${z}`), 'both fountain bypasses remain open');
  }
  for (const id of ['courtyard_hedge', 'courtyard_wall', 'courtyard_fountain', 'courtyard_cathedral']) {
    assert.equal(tiles.isTileWalkable(id), false);
  }
  assert.equal(tiles.getTileDef('courtyard_lawn').avoid, 10);
  assert.equal(tiles.getTileDef('courtyard_lawn').defense, 1);
  assert.equal(tiles.getTileDef('courtyard_paving').avoid, 0);
  assert.equal(tiles.isLevelTileWalkable(level, 11, 11, { type: 'flying' }), false);
  assert.equal(tiles.isLevelTileWalkable(level, 10, 1, { type: 'flying' }), false);
});

test('authored enemies instantiate without scaling below their base levels and use staggered defensive roles', () => {
  const level = fresh();
  for (const [id, count, minimum, ai] of [
    ['golden-cavalier', 4, 18], ['ward-knight', 5, 14, 'guard'],
    ['golden-mage', 2, 18, 'guard'], ['church-sage', 2, 20, 'guard'],
  ]) {
    const placements = level.enemies.filter((enemy) => enemy.id === id);
    assert.equal(placements.length, count);
    assert.ok(placements.every((enemy) => enemy.level >= minimum && (!ai || enemy.ai === ai)));
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
  assert.equal(level.enemies.filter((enemy) => enemy.id === 'golden-cavalier' && enemy.ai === 'mobile').length, 2);
  assert.equal(level.enemies.filter((enemy) => enemy.id === 'golden-cavalier' && enemy.ai === 'guard').length, 2);
  assert.ok(level.enemies.some((enemy) => enemy.id === 'ward-knight' && distance(enemy, freezer) <= 4));
  assert.equal(characters.createEnemyUnit(freezer.id, freezer.x, freezer.z, freezer).magic, 5, 'Freeze remains a manageable five-tile reach');
});

test('guard spellcasters pressure approaches without threatening deployment on the opening phase', () => {
  const level = fresh();
  const corvis = level.enemies.find(({ id }) => id === 'corvis');
  assert.deepEqual(corvis, { id: 'corvis', x: 5, z: 14, level: 17, ai: 'guard' });
  assert.equal(level.courtyard.recruit.recruiterId, 'eveline');
  assert.equal(level.requiredUnits.includes('eveline'), false);
  assert.equal(level.requiredUnits.includes('corvis'), false);
  for (const player of level.players) assert.equal(coverage(level, corvis).has(keyOf(player)), false);
  const casters = level.enemies.filter(({ id }) => ['golden-mage', 'church-sage'].includes(id));
  const sage = casters.find((enemy) => enemy.stealable?.includes('giants-marrow'));
  assert.deepEqual(sage.stealable, ['giants-marrow']);
  assert.equal(sage.drop, undefined, 'the Strength booster is steal-only');
  const allCoverage = casters.map((enemy) => coverage(level, enemy));
  for (const range of allCoverage) {
    for (const player of level.players) assert.equal(range.has(keyOf(player)), false, 'no opening mage attack');
  }
  const blocked = new Set();
  for (let z = 0; z < level.height; z++) {
    for (let x = 0; x < level.width; x++) {
      if (allCoverage.filter((range) => range.has(`${x},${z}`)).length > 1) blocked.add(`${x},${z}`);
    }
  }
  const flanks = distances(level, level.spawn, blocked);
  for (const point of ['2,10', '17,11']) {
    assert.ok(flanks.has(point), `garden flank ${point} avoids overlapping initial magic`);
  }
  assert.ok(distances(level, level.spawn).has('5,15'), 'Corvis remains reachable, but guard casters must be dealt with');
});

test('two uniquely marked finite waves wait for ordered progress and retain warning and partial arrival state', () => {
  const level = fresh();
  assert.deepEqual(level.courtyard.triggers, [
    { id: 'courtyard-cavalry', thresholdZ: 13, delay: 2, warnedTurn: null },
    { id: 'courtyard-ravens', thresholdZ: 10, delay: 1, warnedTurn: null },
  ]);
  assert.equal(level.reinforcements.length, 4);
  for (const [index, wave] of level.reinforcements.entries()) {
    assert.equal(wave.entranceId, index < 2 ? level.courtyard.triggers[index].id :
      level.courtyard.tactics.ravenReinforcements.waves[index - 2]);
    assert.equal(wave.turn, 999);
    assert.equal(wave.spawned, false);
    assert.equal(wave.spawnedCount, 0);
    assert.equal(new Set(wave.units.map(keyOf)).size, wave.units.length);
  }
  assert.deepEqual(level.reinforcements.map(({ units }) => units.length), [3, 3, 2, 2]);
  level.courtyard.triggers[0].warnedTurn = 5;
  level.reinforcements[0].turn = 7;
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
    (map) => { map.courtyard.triggers[0].delay = 0; },
    (map) => { map.courtyard.triggers[0].delay = 3; },
    (map) => { map.courtyard.tactics.deliveryCourt.maxX = 26; },
    (map) => { map.courtyard.tactics.formations[0].active = 'yes'; },
    (map) => { map.courtyard.tactics.formations[0].members[0].x = 0; },
    (map) => { map.courtyard.tactics.formations[0].members[1] = map.courtyard.tactics.formations[0].members[0]; },
    (map) => { map.reinforcements[1].units[0].drop = null; },
    (map) => { map.courtyard.tactics.ravenReinforcements.arrivalTurn = -1; },
    (map) => { map.courtyard.tactics.ravenReinforcements.waves.pop(); },
    (map) => { map.courtyard.tactics.ravenReinforcements.waves[1] = 'courtyard-ravens-2'; },
    (map) => { map.reinforcements[2].units[0].ai = 'guard'; },
    (map) => { map.reinforcements[1].units[0].ai = 'mobile'; },
  ]) {
    const map = structuredClone(rawMap);
    mutate(map);
    assert.throws(() => levels.validateLevel(map));
  }
});

test('legacy embedded courtyards retain their procedural renderer and entrance markers', () => {
  const context = {
    drawImage() {}, fillRect() {}, strokeRect() {}, fillText() {},
    createRadialGradient() { return { addColorStop() {} }; },
  };
  globalThis.document = { createElement() { return { width: 0, height: 0, getContext() { return context; } }; } };
  const group = new THREE.Group();
  const legacy = structuredClone(rawMap);
  legacy.chests = [];
  delete legacy.villageScene;
  delete legacy.courtyard.tactics;
  legacy.tiles = [
    'DDDDDDDDDDDDDDDDDDDDDDDDDD', 'WPPPPPPPPPDDDDDDPPPPPPPPPW', 'WPPPPPPPPPDDDDDDPPPPPPPPPW',
    'WPPPPPPPPPPPPPPPPPPPPPPPPW', 'WPPPPPPPPPPPPPPPPPPPPPPPPW', 'WPPHHHHHHPPPPPPPPHHHHHHPPW',
    'WPPHAAAAPPPPPPPPPPAAAAHPPW', 'WPPHAAAAPPPPPPPPPPAAAAHPPW', 'WPPHHPPHHPPPPPPPPHHPPHHPPW',
    'WPPPPPPPPPPPPPPPPPPPPPPPPW', 'WPPHHHHHHPPPPPPPPHHHHHHPPW', 'WPPHAAAAPPPPPPPPPPAAAAHPPW',
    'WPPHAAAAPPPPPPPPPPAAAAHPPW', 'WPPHAAAAPPPPPPPPPPAAAAHPPW', 'WPPHHPPHHPPPPPPPPHHPPHHPPW',
    'WPPPPPPPPPPFFFFPPPPPPPPPPW', 'WPPPPPPPPPPFFFFPPPPPPPPPPW', 'WPPPPPPPPPPFFFFPPPPPPPPPPW',
    'WPPPPPPPPPPPPPPPPPPPPPPPPW', 'WPPPPPPPPPPPPPPPPPPPPPPPPW', 'WPPHHHHHHPPPPPPPPHHHHHHPPW',
    'WPPHAAAAPPPPPPPPPPAAAAHPPW', 'WPPHAAAAPPPPPPPPPPAAAAHPPW', 'WPPHAAAAPPPPPPPPPPAAAAHPPW',
    'WPPHHPPHHPPPPPPPPHHPPHHPPW', 'WPPPPPPPPPPPPPPPPPPPPPPPPW', 'WPPPPPPPPPPPPPPPPPPPPPPPPW',
    'WPPPPPPPPPPPPPPPPPPPPPPPPW', 'WPPPPPPPPPPPPPPPPPPPPPPPPW', 'WWWWWWWWWWPPPPPPWWWWWWWWWW',
  ];
  legacy.reinforcements[1].units = [1, 2, 23, 24].map((x) => ({ id: 'raven', x, z: 3, level: 18, ai: 'mobile' }));
  const legacyPositions = [[8,23],[17,22],[8,13],[16,10],[16,16],[10,12],[16,8],[9,7],[14,6],
    [15,20],[10,5],[10,8],[15,11],[9,6],[13,4],[5,17],[12,4]];
  legacy.enemies.forEach((unit, i) => { [unit.x, unit.z] = legacyPositions[i]; });
  const level = levels.buildLevel(THREE, group, legacy);
  assert.equal(group.userData.courtyardCameraPadding, STREET_CAMERA_PADDING);
  assert.equal(group.userData.courtyardGeometry.cameraPadding, STREET_CAMERA_PADDING);
  assert.equal(group.userData.streetTown, undefined);
  assert.equal(group.userData.cityBackdrop, undefined);
  const cityPaving = group.getObjectByName('courtyard-lower-city-paving');
  assert.equal(cityPaving.count, 42 * 46 - 26 * 30);
  const cityMatrix = new THREE.Matrix4();
  cityPaving.getMatrixAt(0, cityMatrix);
  assert.ok(cityMatrix.elements[13] < -4, 'city streets lie below the playable terrace');
  const terrace = group.getObjectByName('courtyard-raised-terrace');
  assert.equal(terrace.geometry.parameters.height, 4);
  assert.ok(terrace.position.y + terrace.geometry.parameters.height / 2 < 0);
  const stairs = group.getObjectByName('courtyard-city-staircase');
  assert.equal(stairs.children.length, 16);
  for (const [index, step] of stairs.children.entries()) {
    assert.equal(step.geometry.parameters.width, 8);
    assert.ok(step.position.z - 0.25 >= level.height / 2, 'stairs remain outside gameplay');
    assert.ok(Math.abs(step.position.y + step.geometry.parameters.height / 2 + 0.04 + index * 0.25) < 1e-6);
  }
  const building = group.getObjectByName('courtyard-cathedral-building');
  assert.equal(building.position.x, 0, 'full cathedral aligns with the northern entry');
  assert.ok(building.position.z < 3 - level.height / 2);
  assert.equal(building.rotation.x, -Math.atan2(14, 10));
  assert.equal(building.rotation.y, 0);
  assert.equal(building.material.map.magFilter, THREE.NearestFilter);
  const city = group.getObjectByName('courtyard-lower-city');
  assert.ok(city.children.length >= 40);
  for (const house of city.children) {
    assert.ok(house.position.y < -3.9);
    const halfWidth = house.geometry.parameters.width / 2;
    const depth = house.geometry.parameters.height * Math.sin(-house.rotation.x);
    assert.ok(Math.abs(house.position.x) - halfWidth > level.width / 2 ||
      house.position.z - depth > level.height / 2, 'city houses never overlap the battlefield');
  }
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
    assert.equal(width, 0.92, 'fuller bushes are larger than the original 0.65-tile props');
    assert.equal(bush.rotation.x, -Math.atan2(14, 10), 'bushes share the Chapter 1 object pitch');
    assert.equal(bush.rotation.y, 0, 'planters face straight ahead');
    assert.equal(bush.material.map.magFilter, THREE.NearestFilter);
    bush.geometry.computeBoundingBox();
    assert.ok(Math.abs(bush.geometry.boundingBox.min.y) < 1e-6, 'planters stay anchored at their base');
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

test('opening safety, regrouping space, theft and multi-sided boss access use actual movement and chapter stats', () => {
  const level = fresh();
  for (const enemy of level.enemies) for (const player of level.players) {
    assert.equal(coverage(level, enemy).has(keyOf(player)), false, `${enemy.id} threatens deployment ${keyOf(player)}`);
  }
  const opening = new Set(level.enemies.filter((enemy) => enemy.z >= 16));
  for (const enemy of level.enemies.filter((enemy) => !opening.has(enemy))) {
    const threat = coverage(level, enemy);
    for (let x = 11; x <= 14; x++) for (let z = 16; z <= 17; z++) {
      assert.equal(threat.has(`${x},${z}`), false, `${enemy.id} threatens regroup ${x},${z}`);
    }
  }
  const sage = level.enemies.find((enemy) => enemy.stealable?.includes('giants-marrow'));
  const freezer = level.enemies.find((enemy) => enemy.id === 'church-freezer');
  assert.ok(distances(level, level.spawn).has('8,12'));
  assert.equal(coverage(level, freezer).has('8,12'), false);
  assert.ok(characters.createLenaAlly().speed >
    characters.createEnemyUnit(sage.id, sage.x, sage.z, { ...sage, chapter: 13 }).speed);
  const boss = level.enemies.find((enemy) => enemy.id === 'severin');
  assert.equal(boss.drop, 'spear');
  assert.ok([{ x: 11, z: 5 }, { x: 13, z: 5 }, { x: 12, z: 6 }]
    .every((point) => distances(level, level.spawn).has(keyOf(point))));
  for (const enemy of level.reinforcements[1].units) {
    const threat = coverage(level, enemy);
    if (enemy.id === 'bell-envoy') {
      for (let z = 8; z <= 15; z++) assert.equal(threat.has(`17,${z}`), false, 'planted Envoy cannot reach the bypass');
    } else assert.ok([...threat].some((key) => key.startsWith('17,')), 'Ravens pressure beyond the court');
    const unit = characters.createEnemyUnit(enemy.id, enemy.x, enemy.z, { ...enemy, chapter: 13 });
    assert.equal(unit.hunts, undefined);
    assert.equal(unit.isBoss, false, 'optional lore does not award automatic boss Insight');
    assert.equal(unit.weapon.critical, 0, 'the optional encounter does not stack high critical weapons');
  }
});

test('both fountain hedge crossings have a full paved tile and connect side lanes to the fountain loop', async () => {
  const level = fresh(), pixels = await courtyardPixels('courtyard-passage');
  for (const [x, sourceX, laneX, loopX] of [[9, 10, 8, 10], [16, 15, 17, 15]]) {
    assert.equal(tiles.isLevelTileWalkable(level, x, 12), true);
    assert.equal(tiles.isLevelTileWalkable(level, x, 11), false, 'adjacent hedge remains blocked');
    assert.equal(tiles.isLevelTileWalkable(level, x, 13), false, 'adjacent hedge remains blocked');
    const allowed = new Set([`${laneX},12`, `${x},12`, `${loopX},12`]), blocked = new Set();
    for (let z = 0; z < level.height; z++) for (let tx = 0; tx < level.width; tx++)
      if (!allowed.has(`${tx},${z}`)) blocked.add(`${tx},${z}`);
    assert.equal(distances(level, { x: laneX, z: 12 }, blocked).get(`${loopX},12`), 2);
    for (let py = 0; py < 48; py++) for (let px = 0; px < 48; px++)
      assert.ok(pixels(x * 48 + px, 576 + py).equals(pixels(sourceX * 48 + px, 576 + py)),
        'entire opening is real paving, not a walkable hedge');
  }
});

test('HD courtyard is one unlit continuous map with a raised facade and collision-sized entrances', async () => {
  const group = new THREE.Group();
  const level = levels.buildLevel(THREE, group, structuredClone(rawMap));
  const illustration = group.getObjectByName('illustrated-courtyard');
  assert.equal(level.villageScene.artwork, 'redrawn');
  assert.match(illustration.material.map.image.url, /courtyard-redrawn/);
  assert.deepEqual([illustration.geometry.parameters.width, illustration.geometry.parameters.height], [26, 30]);
  assert.equal(illustration.material.type, 'MeshBasicMaterial');
  assert.equal(illustration.material.map.magFilter, THREE.NearestFilter);
  assert.equal(illustration.material.map.generateMipmaps, false);
  assert.equal(group.getObjectByName('cathedral-courtyard-architecture'), undefined);
  assert.equal(group.getObjectByName('courtyard-ground-paving'), undefined);
  assert.ok(group.getObjectByName('courtyard-dark-surround'));
  for (const [i, entrance] of group.userData.courtyardEntrances.entries()) {
    assert.deepEqual(entrance.children.map(({ userData }) => userData.arrivalTile),
      level.reinforcements[i].units.map(({ x, z }) => ({ x, z })));
  }
  assert.deepEqual(illustration.material.map.repeat.toArray(), [1, 1]);
  const png = await readFile(new URL('../assets/maps/village/courtyard-redrawn.png', import.meta.url));
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [1248, 1440]);
  const manifest = JSON.parse(await readFile(new URL('../assets/maps/village/manifest.json', import.meta.url), 'utf8')).images['courtyard-depth'];
  for (const [name, [px, py, width, height]] of Object.entries(manifest.entrances)) {
    assert.equal(height, 48);
    assert.equal(width, 48);
    const x = px / 48, z = py / 48;
    for (let dx = 0; dx < width / 48; dx++) assert.equal(level.tileIds[z][x + dx],
      name === 'cathedral' ? 'courtyard_cathedral' : 'courtyard_paving', name);
    if (name === 'eastCourt') {
      assert.equal(tiles.isLevelTileWalkable(level, x, z - 1), false, name);
      assert.equal(tiles.isLevelTileWalkable(level, x, z + 1), false, name);
    } else if (name !== 'cathedral') {
      assert.equal(tiles.isLevelTileWalkable(level, x - 1, z), false, name);
      assert.equal(tiles.isLevelTileWalkable(level, x + width / 48, z), false, name);
    }
  }
  group.traverse((node) => node.geometry?.dispose());
});

test('cohesive redraw preserves the complete picture while older illustrated saves select their original art', async () => {
  const scene = await server.ssrLoadModule('/src/levels/village-scene.js');
  const level = fresh();
  assert.equal(scene.villageLayout(level).image, 'courtyard-redrawn');
  assert.deepEqual(scene.villageLayout(level).crop, [0, 0, 1248, 1440], 'do not crop away cathedral or burning city');
  level.villageScene.artwork = 'passage';
  assert.equal(scene.villageLayout(level).image, 'courtyard-passage');
  assert.equal(levels.validateLevel(level).villageScene.artwork, 'passage');
  level.villageScene.artwork = 'depth';
  assert.equal(scene.villageLayout(level).image, 'courtyard-depth');
  assert.equal(levels.validateLevel(level).villageScene.artwork, 'depth');
  level.villageScene.artwork = 'repaired';
  assert.equal(scene.villageLayout(level).image, 'courtyard-repaired');
  assert.equal(levels.validateLevel(level).villageScene.artwork, 'repaired');
  const legacyGroup = new THREE.Group();
  const legacyRaw = structuredClone(rawMap);
  legacyRaw.villageScene.artwork = 'repaired';
  const repaired = levels.buildLevel(THREE, legacyGroup, legacyRaw);
  const oldArt = legacyGroup.getObjectByName('illustrated-courtyard');
  assert.equal(repaired.villageScene.artwork, 'repaired');
  assert.ok([...oldArt.geometry.attributes.position.array].every((v, i) => i % 3 !== 2 || v === 0),
    'earlier repaired saves retain flat geometry');
  legacyGroup.traverse((node) => node.geometry?.dispose());
  level.villageScene.artwork = 'aligned';
  assert.equal(scene.villageLayout(level).image, 'courtyard-aligned');
  assert.equal(levels.validateLevel(level).villageScene.artwork, 'aligned');
  level.villageScene.artwork = 'concept';
  assert.equal(scene.villageLayout(level).image, 'courtyard-concept');
  assert.equal(levels.validateLevel(level).villageScene.artwork, 'concept');
  delete level.villageScene.artwork;
  assert.equal(scene.villageLayout(level).image, 'courtyard');
  assert.equal(levels.validateLevel(level).villageScene.artwork, undefined);
  const old = await readFile(new URL('../assets/maps/village/courtyard.png', import.meta.url));
  const concept = await readFile(new URL('../assets/maps/village/courtyard-concept.png', import.meta.url));
  assert.notDeepEqual(old, concept);
  const manifest = JSON.parse(await readFile(new URL('../assets/maps/village/manifest.json', import.meta.url), 'utf8')).images;
  assert.match(manifest['courtyard-concept'].processing, /Full-image/);
  assert.match(manifest['courtyard-concept'].processing, /no patch assembly/);
  assert.equal(manifest['courtyard-concept'].conceptImage,
    'sha256:73ee8273e25bdf5cded2c9278526571624885163e1da66da2e51e4c6227c88c2');
});

test('cohesive redraw matches the finalized collision grid and clears every full walkable footprint', async () => {
  const level = fresh(), pixels = await courtyardPixels('courtyard-redrawn');
  const { images } = JSON.parse(await readFile(new URL('../assets/maps/village/manifest.json', import.meta.url), 'utf8'));
  const art = images['courtyard-redrawn'];
  assert.equal(createHash('sha256').update(JSON.stringify(rawMap.tiles)).digest('hex'), art.collisionSha256,
    'the redraw must stay registered to the approved collision layout');
  assert.deepEqual(art.facade, { rows: 4, rise: 5.6, northCameraExtension: 8 });
  assert.deepEqual(art.fountainFootprint, [528, 528, 192, 144]);
  const vegetation = ([r, g, b]) => g > r * 1.12 && g > b * 1.12 && g > 25;
  const roof = ([r, g, b]) => b > r * 1.2 && b > g * 1.12 && b > 35;
  assert.ok(vegetation(pixels(450, 410)), 'positive control identifies the painted hedge');
  let roofPixels = 0;
  for (let y = 1248; y < 1296; y++) for (let x = 192; x < 240; x++)
    if (roof(pixels(x, y))) roofPixels++;
  assert.ok(roofPixels > 200, 'positive control identifies the painted city roof');
  for (let z = 0; z < level.height; z++) for (let x = 0; x < level.width; x++) {
    if (!tiles.isLevelTileWalkable(level, x, z)) continue;
    for (let py = 0; py < 48; py++) for (let px = 0; px < 48; px++) {
      const color = pixels(x * 48 + px, z * 48 + py);
      assert.equal(vegetation(color), false, `foliage in full walkable tile ${x},${z}`);
      assert.equal(roof(color), false, `roof in full walkable tile ${x},${z}`);
      assert.equal(color[3], 255, 'the paving is opaque artwork, not a transparent hole');
    }
  }
  for (const [name, bounds] of Object.entries(art.entrances)) {
    const [x, z, width, height] = bounds.map((value) => value / 48);
    assert.ok([x, z].every(Number.isInteger), name);
    assert.deepEqual([width, height], [1, 1], name);
    if (name !== 'cathedral') assert.ok(tiles.isLevelTileWalkable(level, x, z), name);
  }
});

test('painted entrance pixels, not just metadata, occupy exactly one centered 48px cell', async () => {
  const [source, aligned] = await Promise.all(['courtyard-concept', 'courtyard-aligned'].map(courtyardPixels));
  const manifest = JSON.parse(await readFile(new URL('../assets/maps/village/manifest.json', import.meta.url), 'utf8')).images['courtyard-aligned'];
  for (const [name, [sx, sy, sw, sh]] of Object.entries(manifest.sourceEntranceBounds)) {
    const [dx, dy, width, height] = manifest.entrances[name];
    assert.deepEqual([width, height, dx % 48, dy % 48], [48, 48, 0, 0]);
    let leavesCleared = 0;
    for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) {
      const expected = source(Math.floor(sx + (x + .5) * sw / 48), Math.floor(sy + (y + .5) * sh / 48));
      const actual = aligned(dx + x, dy + y), [r, g, b] = expected;
      if (name === 'corvisGarden' && g > r * 1.12 && g > b * 1.12 && g > 25) {
        leavesCleared++;
        const [red, green, blue] = actual;
        assert.ok(Math.abs(red - green) < 30 && Math.abs(green - blue) < 30,
          'encroaching leaves are replaced by stone from the same stair tread');
      } else assert.deepEqual(actual, expected, `${name}: incorrect entrance pixel ${x},${y}`);
    }
    if (name === 'corvisGarden') assert.ok(leavesCleared > 0 && leavesCleared < 48 * 48 * .2);
  }
});

test('every walkable footprint is free of painted bushes and roofs, including all deployments and arrivals', async () => {
  const pixels = await courtyardPixels('courtyard-passage'), level = fresh();
  const vegetation = ([r, g, b]) => g > r * 1.12 && g > b * 1.12 && g > 25;
  const roof = ([r, g, b]) => b > r * 1.2 && b > g * 1.12 && b > 35;
  const fraction = (x, z, predicate) => {
    let count = 0;
    // Leave only the four-pixel tile-edge trim outside the standing footprint.
    for (let py = 4; py < 44; py++) for (let px = 4; px < 44; px++)
      if (predicate(pixels(x * 48 + px, z * 48 + py))) count++;
    return count / 1600;
  };
  assert.ok(fraction(9, 8, vegetation) > .2, 'positive control identifies actual hedges');
  assert.ok(fraction(15, 25, roof) > .2, 'positive control identifies actual scenic rooftops');
  const open = [];
  for (let z = 0; z < level.height; z++) for (let x = 0; x < level.width; x++) {
    if (!tiles.isLevelTileWalkable(level, x, z)) continue;
    open.push(`${x},${z}`);
    assert.ok(fraction(x, z, vegetation) < .015, `painted vegetation overlaps ${x},${z}`);
    assert.ok(fraction(x, z, roof) < .015, `painted roof overlaps ${x},${z}`);
  }
  for (const { x, z } of [level.spawn, level.exit, ...level.players, ...level.enemies,
    ...level.reinforcements.flatMap(({ units }) => units)]) assert.ok(open.includes(`${x},${z}`));
  for (const [minX, minZ, maxX, maxZ] of [
    [3, 10, 6, 11], [18, 8, 22, 8], [19, 9, 19, 14], [22, 9, 22, 10],
    [22, 12, 22, 14], [6, 17, 8, 18], [17, 17, 19, 18],
    [6, 20, 8, 21], [17, 20, 19, 21], [19, 22, 19, 22],
    [11, 11, 14, 13],
  ]) {
    for (let z = minZ; z <= maxZ; z++) for (let x = minX; x <= maxX; x++)
      assert.equal(tiles.isLevelTileWalkable(level, x, z), false, `painted prop/rim ${x},${z}`);
  }
});

test('redrawn western hedge gaps are traversable through-routes, not painted dead ends', () => {
  const level = fresh(), reach = distances(level, level.spawn);
  for (const z of [9, 12, 16]) for (let x = 2; x <= 8; x++) {
    assert.ok(tiles.isLevelTileWalkable(level, x, z), `western crosswalk ${x},${z}`);
    assert.ok(reach.has(`${x},${z}`));
  }
  for (let z = 17; z <= 22; z++) for (const x of [4, 5]) {
    assert.ok(tiles.isLevelTileWalkable(level, x, z), `lower western passage ${x},${z}`);
    assert.ok(reach.has(`${x},${z}`));
  }
  for (let z = 17; z <= 22; z++) for (const x of [20, 21])
    assert.ok(tiles.isLevelTileWalkable(level, x, z), `lower eastern passage ${x},${z}`);
  for (const [x, z] of [[3, 7], [3, 8], [5, 14], [5, 15]]) assert.ok(reach.has(`${x},${z}`));
});

test('local redraw preserves every pixel outside its western and eastern stair repair regions', async () => {
  const [previous, repaired] = await Promise.all(['courtyard-aligned', 'courtyard-repaired'].map(courtyardPixels));
  const manifest = JSON.parse(await readFile(new URL('../assets/maps/village/manifest.json', import.meta.url), 'utf8')).images['courtyard-repaired'];
  let changed = 0;
  for (let y = 0; y < 1440; y++) for (let x = 0; x < 1248; x++) {
    const inside = manifest.repairRegions.some(([left, top, width, height]) =>
      x >= left && x < left + width && y >= top && y < top + height);
    if (!inside) assert.ok(previous(x, y).equals(repaired(x, y)), `unrelated artwork changed at ${x},${y}`);
    else if (!previous(x, y).equals(repaired(x, y))) changed++;
  }
  assert.ok(changed > 300000, 'repair is an actual local redraw, not the old warped image');
});

test('eastern supply chests are visible, reachable, and distinct from every defender and arrival', () => {
  const group = new THREE.Group(), level = levels.buildLevel(THREE, group, structuredClone(rawMap));
  assert.deepEqual(level.chests.map(({ x, z, rewardId }) => [x, z, rewardId]),
    [[20, 9, 'light-tome'], [21, 11, 'master-emblem']]);
  const reach = distances(level, level.spawn), court = level.courtyard.tactics.deliveryCourt;
  const occupied = new Set([...level.enemies, ...level.reinforcements.flatMap(({ units }) => units)].map(keyOf));
  for (const chest of level.chests) {
    assert.ok(reach.has(keyOf(chest)));
    assert.ok(courtyard.insideDeliveryCourt(court, chest));
    assert.equal(occupied.has(keyOf(chest)), false, 'no reinforcement or starting unit occupies treasure');
    assert.ok(chest.mesh?.parent === group);
    assert.equal(chest.mesh.material.opacity, 1);
    assert.equal(chest.opened, false);
  }
  group.traverse((node) => node.geometry?.dispose());
});

test('cathedral has actual height while the doorway and all playable geometry keep their tile coordinates', async () => {
  const group = new THREE.Group(), level = levels.buildLevel(THREE, group, structuredClone(rawMap));
  const art = group.getObjectByName('illustrated-courtyard');
  const layout = (await server.ssrLoadModule('/src/levels/village-scene.js')).villageLayout(level);
  group.updateMatrixWorld(true);
  const position = art.geometry.attributes.position, uv = art.geometry.attributes.uv;
  for (let i = 0; i < position.count; i++) {
    const row = (1 - uv.getY(i)) * level.height;
    const point = new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(art.matrixWorld);
    assert.ok(Math.abs(point.z - (row - level.height / 2)) < .00001);
    const expectedHeight = .01 + Math.max(0, layout.facadeRows - row) * layout.facadeRise / layout.facadeRows;
    assert.ok(Math.abs(point.y - expectedHeight) < .00001);
    if (row < layout.facadeRows)
      assert.ok(level.tileIds[Math.round(row)].every((id) => id === 'courtyard_cathedral'));
  }
  const base = new THREE.Vector3(0, .01, -11), top = new THREE.Vector3(0, 5.61, -15);
  for (const aspect of [9 / 16, 1, 16 / 9]) {
    const target = new THREE.Vector3(0, .8, -100), offset = new THREE.Vector3(0, 14, 10);
    const fov = constrainInteriorCamera(target, offset, aspect, 26, 30, 0, .01, false, layout.northCameraExtension);
    const camera = new THREE.PerspectiveCamera(fov, aspect, .1, 200);
    camera.position.copy(target).add(offset);
    camera.lookAt(target);
    camera.updateMatrixWorld();
    const projectedBase = base.clone().project(camera), projectedTop = top.clone().project(camera);
    assert.ok(projectedTop.y > projectedBase.y + .3, 'facade rises visibly instead of lying on the paving');
    assert.ok(projectedTop.y <= 1 && projectedTop.y >= -1, 'north pan exposes the raised cathedral');
  }
  const invalid = structuredClone(rawMap);
  invalid.tiles[3] = `P${invalid.tiles[3].slice(1)}`;
  assert.throws(() => levels.validateLevel(invalid), /facade rows 0\.\.3 must remain blocked/);
  group.traverse((node) => node.geometry?.dispose());
});

test('treasure court has clear connected south and east entrances without opening its hedges', () => {
  const level = fresh(), reach = distances(level, level.spawn);
  for (const z of [15, 16]) for (let x = 17; x <= 23; x++)
    assert.ok(reach.has(`${x},${z}`), `southern approach ${x},${z}`);
  for (let z = 6; z <= 16; z++) assert.ok(reach.has(`23,${z}`), `eastern perimeter 23,${z}`);
  for (let x = 20; x <= 23; x++)
    assert.ok(reach.has(`${x},11`), `east gateway ${x},11`);
  assert.equal(tiles.isLevelTileWalkable(level, 22, 10), false);
  assert.equal(tiles.isLevelTileWalkable(level, 22, 12), false);
  const court = level.courtyard.tactics.deliveryCourt;
  assert.equal(courtyard.insideDeliveryCourt(court, { x: 23, z: 11 }), false);
  assert.equal(courtyard.insideDeliveryCourt(court, { x: 22, z: 11 }), true);
  const withoutSouthEntry = distances(level, level.spawn, new Set(['20,14']));
  for (const chest of level.chests) assert.ok(withoutSouthEntry.has(keyOf(chest)),
    'eastern gateway remains usable if the south door is occupied');
});

test('perspective redraw leaves the approved central court and all unaffected pixels unchanged', async () => {
  const [previous, current] = await Promise.all(['courtyard-repaired', 'courtyard-depth'].map(courtyardPixels));
  const { repairRegions } = JSON.parse(await readFile(new URL('../assets/maps/village/manifest.json', import.meta.url), 'utf8')).images['courtyard-depth'];
  let changed = 0;
  for (let y = 0; y < 1440; y++) for (let x = 0; x < 1248; x++) {
    const inside = repairRegions.some(([left, top, width, height]) =>
      x >= left && x < left + width && y >= top && y < top + height);
    if (!inside) assert.ok(previous(x, y).equals(current(x, y)), `unrelated artwork changed at ${x},${y}`);
    else if (!previous(x, y).equals(current(x, y))) changed++;
  }
  assert.ok(changed > 500000);
});

test('fountain has a full 48px paved loop on every side, with the entire basin and rim kept inside blocked cells', async () => {
  const level = fresh(), ring = new Set();
  for (let z = 10; z <= 14; z++) for (let x = 10; x <= 15; x++) {
    if (z !== 10 && z !== 14 && x !== 10 && x !== 15) {
      assert.equal(tiles.isLevelTileWalkable(level, x, z), false);
      continue;
    }
    assert.ok(tiles.isLevelTileWalkable(level, x, z), `fountain perimeter ${x},${z}`);
    ring.add(`${x},${z}`);
  }
  const blocked = new Set();
  for (let z = 0; z < level.height; z++) for (let x = 0; x < level.width; x++)
    if (!ring.has(`${x},${z}`)) blocked.add(`${x},${z}`);
  assert.equal(distances(level, { x: 10, z: 10 }, blocked).size, ring.size, 'one continuous loop, not separate pockets');
  for (const point of [{ x: 10, z: 12 }, { x: 15, z: 12 }, { x: 12, z: 10 }, { x: 12, z: 14 }])
    assert.ok(distances(level, level.spawn).has(keyOf(point)), 'every side connects to the broader map');
  const [previous, current] = await Promise.all(['courtyard-depth', 'courtyard-passage'].map(courtyardPixels));
  for (const key of ring) {
    const [x, z] = key.split(',').map(Number);
    for (let py = 4; py < 44; py++) for (let px = 4; px < 44; px++)
      assert.ok(current(x * 48 + px, z * 48 + py).equals(previous(x * 48 + px, z * 48 + py + 384)),
        `the full standing footprint is actual clear paving, not fountain masonry at ${key}`);
  }
  for (let y = 0; y < 1440; y++) for (let x = 0; x < 1248; x++)
    if ((x < 480 || x >= 768 || y < 480 || y >= 720) &&
        !(y >= 576 && y < 624 && (x >= 432 && x < 480 || x >= 768 && x < 816)))
      assert.ok(previous(x, y).equals(current(x, y)), `unrelated artwork changed at ${x},${y}`);
});

test('feral Envoy uses its own complete map animations and stat-equivalent physical claws without affecting the Omen', async () => {
  const envoy = characters.createEnemyUnit('bell-envoy', 20, 12);
  const sword = JSON.parse(await readFile(new URL('../data/weapons/steel-sword.json', import.meta.url), 'utf8'));
  assert.equal(envoy.spriteSet, 'bellEnvoy');
  assert.equal(envoy.weapon.id, 'envoy-claws');
  assert.equal(envoy.weapon.type, 'Claw');
  assert.equal(envoy.weapon.damageType, 'physical');
  assert.equal(envoy.isBoss, false);
  for (const stat of ['might', 'weight', 'hit', 'critical', 'minRange', 'maxRange'])
    assert.equal(envoy.weapon[stat], sword[stat], `unchanged encounter balance: ${stat}`);
  const classes = await server.ssrLoadModule('/src/characters/classes.js');
  assert.equal(classes.canEquipWeapon(envoy, envoy.weapon), true);
  assert.equal(classes.canEquipWeapon(envoy, sword), false);
  assert.equal(characters.createEnemyUnit('crowman', 0, 0).weapon.type, 'Sword');
  const directions = ['south', 'south-east', 'east', 'north-east', 'north', 'north-west', 'west', 'south-west'];
  for (const direction of directions) {
    const idle = await readFile(new URL(`../assets/character/Bell_Envoy/rotations/${direction}.png`, import.meta.url));
    assert.deepEqual([idle.readUInt32BE(16), idle.readUInt32BE(20)], [64, 64]);
    for (const [animation, count] of [['Walking', 6], ['Attacking', 9]]) {
      const images = await Promise.all(Array.from({ length: count }, (_, frame) =>
        readFile(new URL(`../assets/character/Bell_Envoy/animations/${animation}/${direction}/frame_${String(frame).padStart(3, '0')}.png`, import.meta.url))));
      assert.ok(images.some((image) => !image.equals(images[0])), `${direction} ${animation} has real animation`);
    }
  }
  assert.equal(battleSpriteKey(envoy), 'bell-envoy');
  assert.equal(battleIdleKey(envoy), 'bell-envoy');
  assert.equal(supportsBattleScene(envoy, { ...characters.createRictorAlly(), x: 20, z: 13 }), true);
  const spec = JSON.parse(await readFile(new URL('../assets/battle/manifest.json', import.meta.url), 'utf8')).fighters['bell-envoy'];
  assert.ok(spec.idleLoop, 'lost-humanity battle stance has its own twitching idle animation');
  assert.notEqual(spec.attack.job, spec.critical.job, 'frantic critical is separately generated');
  assert.equal(spec.design, 'lost-humanity');
  const idlePng = await readFile(new URL(`../assets/battle/${spec.idle}`, import.meta.url));
  assert.deepEqual([idlePng.readUInt32BE(16), idlePng.readUInt32BE(20)], [spec.size, spec.size]);
  for (const clip of [spec.idleLoop, spec.attack, spec.critical]) {
    const png = await readFile(new URL(`../assets/battle/${clip.file}`, import.meta.url)), chunks = [];
    assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [spec.size * clip.frames, spec.size]);
    if (clip.impactFrame !== undefined) assert.ok(clip.impactFrame > 0 && clip.impactFrame < clip.frames - 1);
    for (let offset = 8; offset < png.length;) {
      const length = png.readUInt32BE(offset);
      if (png.toString('ascii', offset + 4, offset + 8) === 'IDAT') chunks.push(png.subarray(offset + 8, offset + 8 + length));
      offset += length + 12;
    }
    const raw = inflateSync(Buffer.concat(chunks)), stride = spec.size * clip.frames * 4 + 1;
    if (clip.impactFrame !== undefined) {
      const { x, y } = clip.contact;
      assert.ok(raw[y * stride + 1 + (clip.impactFrame * spec.size + x) * 4 + 3] > 16,
        'damage contact is on the visible fully extended claw, not empty padding');
    }
    const signatures = new Set();
    for (let frame = 0; frame < clip.frames; frame++) {
      let top = spec.size, bottom = -1;
      const pixels = Buffer.alloc(spec.size * spec.size * 4);
      for (let y = 0; y < spec.size; y++) raw.copy(pixels, y * spec.size * 4,
        y * stride + 1 + frame * spec.size * 4, y * stride + 1 + (frame + 1) * spec.size * 4);
      signatures.add(pixels.toString('base64'));
      for (let y = 0; y < spec.size; y++) for (let x = 0; x < spec.size; x++)
        if (raw[y * stride + 1 + (frame * spec.size + x) * 4 + 3] > 16) {
          top = Math.min(top, y); bottom = Math.max(bottom, y);
          assert.ok(x > 0 && x < spec.size - 1, 'wings and talons are not clipped');
        }
      assert.equal(bottom, spec.baseline, 'feet remain grounded through the entire claw motion');
      assert.ok(233 - (bottom - top) * 2 * spec.scale >= 64, 'beast stays clear of battle HUD');
    }
    assert.ok(signatures.size >= Math.ceil(clip.frames / 2), 'real generated poses, not duplicated stills');
  }
});
