import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { createServer } from 'vite';
import * as THREE from 'three';
import { activateMechanism, availableMechanism, cityTideWarning, freshWaitingCity, prepareCityPulse, resolveCityPulse,
  waitingCityVictoryReady } from '../src/game/waiting-city.js';

let server, levels, tiles, characters, saves, scenery, raw;
const priorImage = Object.getOwnPropertyDescriptor(globalThis, 'Image');
before(async () => {
  const dimensions = new Map(await Promise.all((await readdir(new URL('../assets/tiles/Waiting_City/', import.meta.url)))
    .filter((name) => name.endsWith('.png')).map(async (name) => {
      const png = await readFile(new URL(`../assets/tiles/Waiting_City/${name}`, import.meta.url));
      return [name, [png.readUInt32BE(16), png.readUInt32BE(20)]];
    })));
  globalThis.Image = class {
    set src(value) {
      this.url = value;
      [this.width, this.height] = value.startsWith('data:image/svg+xml,') ? [32, 32]
        : dimensions.get(value.split('?')[0].split('/').pop()) ?? [64, 64];
      queueMicrotask(() => this.onload());
    }
  };
  server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: 'custom' });
  [levels, tiles, characters, saves, scenery] = await Promise.all([
    '/src/levels/level.js', '/src/levels/tiles.js', '/src/characters/characters.js', '/src/game/save.js',
    '/src/levels/waiting-city.js',
  ].map((path) => server.ssrLoadModule(path)));
  raw = JSON.parse(await readFile(new URL('../data/levels/map_18_waiting_city.json', import.meta.url), 'utf8'));
});
after(async () => {
  await server?.close();
  if (priorImage) Object.defineProperty(globalThis, 'Image', priorImage);
  else delete globalThis.Image;
});
const fresh = () => levels.validateLevel(structuredClone(raw));
function reachable(level, unit = { ...level.spawn }) {
  const queue = [unit], seen = new Set([`${unit.x},${unit.z}`]);
  for (let i = 0; i < queue.length; i++) {
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const { x, z } = queue[i], key = `${x + dx},${z + dz}`;
      if (!seen.has(key) && tiles.isLevelTileWalkable(level, x + dx, z + dz, unit)) {
        seen.add(key); queue.push({ x: x + dx, z: z + dz });
      }
    }
  }
  return seen;
}
function openApproach(level, turn = 3) {
  for (const entry of level.waitingCity.mechanisms) {
    activateMechanism(level, { hp: 1, acted: false, x: entry.x, z: entry.z + 1 }, turn);
  }
}
const boss = () => ({ id: 'bell-drowned', hp: 150 });

test('Chapter 18 connects both districts, optional stores and twelve allies before the sealed plaza', () => {
  const level = fresh(), seen = reachable(level);
  assert.equal(levels.CHAPTER_COUNT, 19);
  assert.equal(level.width, 42);
  assert.equal(level.height, 36);
  assert.equal(level.players.length, 12);
  assert.deepEqual(level.requiredUnits, ['maria', 'rictor']);
  assert.equal(level.reinforcements.length, 4);
  for (const entry of [...level.players, ...level.chests]) assert.ok(seen.has(`${entry.x},${entry.z}`));
  for (const entry of level.waitingCity.mechanisms) {
    assert.ok(seen.has(`${entry.x},${entry.z + 1}`), entry.id);
  }
  assert.equal(seen.has('20,6'), false);
  const flying = reachable(level, { ...level.spawn, type: 'flying' });
  assert.equal(flying.has('20,6'), false, 'flying cannot bypass the sealed sea wall');
  openApproach(level);
  assert.ok(reachable(level).has('20,6'));
  assert.ok(reachable(level, { ...level.spawn, type: 'flying' }).has('20,6'));
  const opened = reachable(level);
  for (let z = 0; z < level.height; z++) for (let x = 0; x < level.width; x++) {
    if (tiles.isLevelTileWalkable(level, x, z, {})) assert.ok(opened.has(`${x},${z}`), `walkable street ${x},${z} is connected`);
  }
  for (const unit of level.enemies.filter(({ id }) => id !== 'city-raven')) {
    assert.ok(opened.has(`${unit.x},${unit.z}`), `${unit.id} remains reachable at ${unit.x},${unit.z}`);
  }
});

test('Dense building districts retain the authored enemies and canals require two-tile bridges', () => {
  const level = fresh();
  assert.equal(level.waitingCity.structures.length, 35);
  assert.equal(level.enemies.length, 30);
  assert.ok(level.tileIds.flat().filter((id) => id === 'city_building').length >= 190);
  assert.equal(level.tileIds.flat().filter((id) => id === 'shore_bridge').length, 14);
  assert.deepEqual(level.enemies.filter(({ id }) => id === 'city-guardian').map(({ x, z }) => [x, z]),
    [[11, 28], [30, 28], [18, 15], [23, 15]]);
  for (const [row, target] of [[30, '10,28'], [23, '10,21'], [12, '20,6']]) {
    const sealed = fresh();
    openApproach(sealed);
    for (let x = 0; x < sealed.width; x++) {
      if (sealed.tileIds[row][x] === 'shore_bridge') sealed.tileIds[row][x] = 'shore_sea';
    }
    assert.equal(reachable(sealed).has(target), false, `canal ${row} cannot be bypassed on foot`);
  }
});

test('Ancient mechanisms require adjacency, life and an unused action, and only both open the gate', () => {
  const level = fresh(), entry = level.waitingCity.mechanisms[0];
  const unit = { hp: 1, acted: false, x: entry.x, z: entry.z + 1 };
  assert.equal(availableMechanism(level, { ...unit, acted: true }), undefined);
  assert.equal(availableMechanism(level, { ...unit, hp: 0 }), undefined);
  assert.equal(availableMechanism(level, { ...unit, z: unit.z + 1 }), undefined);
  assert.throws(() => activateMechanism(level, { ...unit, acted: true }, 3), /living, unacted/);
  activateMechanism(level, unit, 3);
  assert.equal(level.waitingCity.opened, false);
  assert.equal(availableMechanism(level, unit), undefined);
  const other = level.waitingCity.mechanisms[1];
  activateMechanism(level, { ...unit, x: other.x, z: other.z + 1 }, 4);
  assert.equal(level.waitingCity.opened, true);
  assert.equal(level.waitingCity.nextPulseTurn, 5);
  assert.equal(level.reinforcements.length, 4, 'mechanisms do not create extra waves');
});

test('Bell-Drowned gives a full player phase warning, alternating lanes and two quiet turns', () => {
  const level = fresh(), enemies = [boss()];
  assert.equal(prepareCityPulse(level, 1, enemies), null);
  openApproach(level, 3);
  assert.equal(prepareCityPulse(level, 3, enemies), null);
  const warning = prepareCityPulse(level, 4, enemies);
  assert.ok(warning.tiles.length > 10);
  assert.equal(prepareCityPulse(level, 4, enemies), null, 'cannot duplicate a pending warning');
  const hit = { ...warning.tiles[0], hp: 30, defense: 99, type: 'flying' };
  const dead = { ...hit, hp: 0 };
  const safe = { x: 20, z: 6, hp: 30 };
  assert.deepEqual(resolveCityPulse(level, 3, [hit], enemies), []);
  assert.equal(hit.hp, 30, 'warning alone never hurts');
  assert.equal(resolveCityPulse(level, 4, [hit, safe, dead], enemies).length, 1);
  assert.equal(hit.hp, 12, 'armor and flight do not prevent resonance');
  assert.equal(safe.hp, 30);
  assert.equal(dead.hp, 0);
  assert.deepEqual(resolveCityPulse(level, 4, [hit], enemies), []);
  assert.equal(prepareCityPulse(level, 5, enemies), null);
  assert.equal(prepareCityPulse(level, 6, enemies), null);
  const next = prepareCityPulse(level, 7, enemies);
  assert.notDeepEqual(next.tiles, warning.tiles);
  const fragile = { ...next.tiles[0], hp: 4 };
  assert.equal(resolveCityPulse(level, 7, [fragile], enemies)[0].damage, 4);
  assert.equal(fragile.hp, 0, 'resonance is lethal');
});

test('Only the Bell-Drowned decides victory after both mechanisms and its death cancels resonance', () => {
  const level = fresh();
  assert.equal(waitingCityVictoryReady(level, []), false);
  openApproach(level);
  assert.equal(waitingCityVictoryReady(level, [boss()]), false);
  prepareCityPulse(level, 4, [boss()]);
  const unit = { ...level.waitingCity.pulse.tiles[0], hp: 30 };
  assert.deepEqual(resolveCityPulse(level, 4, [unit], []), []);
  assert.equal(unit.hp, 30);
  assert.ok(waitingCityVictoryReady(level, [{ id: 'city-drowned', hp: 10 }]));
  assert.equal(prepareCityPulse(level, 7, []), null);
});

test('City enemies preserve roles and growth-based Dexterity rather than universal elite accuracy', async () => {
  const { getClass } = await server.ssrLoadModule('/src/characters/classes.js');
  const units = fresh().enemies.map((p) => characters.createEnemyUnit(p.id, p.x, p.z, p));
  assert.equal(units.filter(({ isBoss }) => isBoss).length, 1);
  assert.ok(units.filter(({ type }) => ['beast', 'flying', 'undead'].includes(type)).length > units.length / 2);
  for (const unit of units) {
    assert.ok(unit.weapon);
    assert.ok(!['soldier', 'knight', 'mage', 'priest'].includes(unit.classId));
    if (!unit.isBoss) assert.ok(unit.dexterity <= 24, `${unit.id} Dexterity`);
  }
  assert.equal(getClass('ancient-guardian').tier, 'advanced');
  assert.equal(units.find(({ id }) => id === 'city-guardian').spriteSet, 'ancientGuardian');
  assert.equal(units.find(({ isBoss }) => isBoss).spriteSet, 'bellDrowned');
  assert.equal(units.find(({ isBoss }) => isBoss).ai, 'stationary');
  const elite = units.find(({ isBoss }) => isBoss);
  assert.deepEqual([elite.maxHp, elite.defense, elite.resistance], [150, 28, 26]);
  for (const id of ['city-drowned', 'city-stalker', 'city-raven', 'city-sage', 'city-dark-sage', 'city-guardian']) {
    const profile = JSON.parse(await readFile(new URL(`../data/characters/${id}.json`, import.meta.url), 'utf8'));
    const scaled = characters.createEnemyUnit(id, 0, 0, { level: 30 });
    const base = characters.createEnemyUnit(id, 0, 0);
    assert.ok(profile.growthRates.hp >= 75);
    for (const [stat, rate] of Object.entries(profile.growthRates)) {
      const field = stat === 'hp' ? 'maxHp' : stat;
      assert.equal(scaled[field] - base[field], Math.round(rate * 4 / 100), `${id} ${stat} follows its own growth`);
    }
  }
});

test('Chapter 18 casters and guardians have modest role-specific stat increases at their authored level', async () => {
  const expected = {
    'city-sage': [47, 2, 25, 19, 13, 11, 21, 5],
    'city-dark-sage': [49, 2, 27, 20, 16, 12, 22, 6],
    'city-guardian': [54, 26, 0, 22, 16, 24, 11, 5],
  };
  const fields = ['maxHp', 'strength', 'magic', 'dexterity', 'speed', 'defense', 'resistance', 'movement'];
  for (const [id, stats] of Object.entries(expected)) {
    const placements = fresh().enemies.filter((placement) => placement.id === id);
    assert.ok(placements.length > 0);
    for (const placement of placements) {
      const unit = characters.createEnemyUnit(id, placement.x, placement.z, placement);
      assert.equal(unit.level, 26);
      assert.deepEqual(fields.map((field) => unit[field]), stats, id);
    }
    const profile = JSON.parse(await readFile(new URL(`../data/characters/${id}.json`, import.meta.url), 'utf8'));
    assert.deepEqual(profile.baseStats, profile.currentStats, 'authored base and current sheets remain consistent');
  }
});

test('Six Ward Sigils grant exactly two Defense and ten Avoid without healing or slowing movement', async () => {
  const level = fresh();
  const { getTerrain } = await server.ssrLoadModule('/src/battle/terrain.js');
  const combat = await server.ssrLoadModule('/src/battle/combat.js');
  const wards = [];
  for (let z = 0; z < level.height; z++) for (let x = 0; x < level.width; x++) {
    if (level.tileIds[z][x] === 'city_ward') wards.push({ x, z });
  }
  assert.deepEqual(wards, [{ x: 17, z: 13 }, { x: 24, z: 13 }, { x: 13, z: 22 },
    { x: 28, z: 22 }, { x: 10, z: 29 }, { x: 31, z: 29 }]);
  const ward = getTerrain(level, wards[0].x, wards[0].z);
  assert.equal(ward.name, 'Ward Sigil');
  assert.equal(ward.defense, 2);
  assert.equal(ward.avoid, 10);
  assert.equal(ward.moveCost, 1);
  assert.equal(ward.elevation, 0);
  assert.equal(ward.healPerTurn, undefined);
  assert.equal(ward.bonus, '+10 Avoid, +2 Defense');
  for (const point of wards) {
    assert.ok(tiles.isLevelTileWalkable(level, point.x, point.z, {}));
    assert.ok(![...level.players, ...level.enemies, ...level.chests].some(({ x, z }) => x === point.x && z === point.z));
  }
  const attacker = characters.createEnemyUnit('city-guardian', 0, 0);
  const defender = characters.createMaria();
  assert.equal(combat.getCombatDamage(attacker, defender, {}) - combat.getCombatDamage(attacker, defender, ward), 2);
  assert.equal(combat.getAvoid(defender, ward) - combat.getAvoid(defender, {}), 10);
  openApproach(level);
  prepareCityPulse(level, 4, [boss()]);
  const exposed = { ...level.waitingCity.pulse.tiles[0], hp: 30, defense: 100, terrain: ward };
  assert.equal(resolveCityPulse(level, 4, [exposed], [boss()])[0].damage, 18, 'sigils do not nullify resonance');
});

test('Ancient road and gravel artwork stays flat with restrained weathering and no baked lighting', async () => {
  for (const file of ['paving', 'plaza', 'bridge', 'ward', 'gravel']) {
    const svg = await readFile(new URL(`../assets/tiles/Waiting_City/${file}.svg`, import.meta.url), 'utf8');
    assert.match(svg, /width="32" height="32"/);
    assert.match(svg, /shape-rendering="crispEdges"/);
    const colors = new Set(svg.match(/#[0-9a-f]{6}/gi));
    assert.ok(colors.size >= 4 && colors.size <= 6, `${file} has restrained stone detail`);
    assert.doesNotMatch(svg, /gradient|filter|<image|opacity|transform/i);
    assert.ok((svg.match(/<path/g) ?? []).length >= 4, 'weathered stones replace featureless slabs');
  }
});

test('Ocean reuses the real nine-frame ripple animation with world tiling and an updating clock', () => {
  const strip = new THREE.Texture();
  const ocean = levels.createWaterMaterial(THREE, strip, { worldTiled: true, unlit: true });
  assert.equal(ocean.type, 'MeshBasicMaterial');
  assert.equal(ocean.map, strip);
  assert.equal(ocean.transparent, false, 'ocean draws before roof sprites, not over them in the transparent pass');
  const shader = { uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>',
    fragmentShader: '#include <common>\n#include <map_fragment>' };
  ocean.onBeforeCompile(shader);
  assert.match(shader.vertexShader, /vWaterPos = \(modelMatrix \* waterLocal\)\.xz/);
  assert.match(shader.fragmentShader, /vec2 rippleUv = fract\(wp\)/);
  assert.match(shader.fragmentShader, /\/ 9\.0/);
  assert.match(shader.fragmentShader, /floor\(uTime \* 5\.0 \+ phase\)/);
  levels.updateLevelAnimation(0);
  assert.equal(shader.uniforms.uTime.value, 0);
  levels.updateLevelAnimation(0.25);
  assert.equal(shader.uniforms.uTime.value, 0.25);
  levels.updateLevelAnimation(0.5);
  assert.equal(shader.uniforms.uTime.value, 0.5);
  const earlier = levels.createWaterMaterial(THREE, strip);
  assert.equal(earlier.type, 'MeshStandardMaterial', 'earlier chapters retain their lit water');
  assert.equal(earlier.transparent, true, 'earlier water keeps its existing blending');
  assert.notEqual(ocean.customProgramCacheKey(), earlier.customProgramCacheKey());
  const oldShader = { uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>',
    fragmentShader: '#include <common>\n#include <map_fragment>' };
  earlier.onBeforeCompile(oldShader);
  assert.match(oldShader.fragmentShader, /vec2 rippleUv = vTileUv/);
  ocean.dispose();
  earlier.dispose();
  strip.dispose();
});

test('Four finite coastal waves queue blocked arrivals, resume partial waves and never teleport inland', async () => {
  const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  const source = main.slice(main.indexOf('function spawnTurnReinforcements()'), main.indexOf('\nasync function endPlayerPhase()'));
  const infirmary = await server.ssrLoadModule('/src/game/infirmary.js');
  const level = fresh(), defenders = [{ x: 3, z: 25, hp: 10 }, { x: 38, z: 25, hp: 10 }];
  const state = { turn: 3 }, enemies = [boss()];
  const context = {
    activeLevel: level, gameState: state, enemies, defendingUnits: () => defenders,
    tileKey: (x, z) => `${x},${z}`, infirmaryWaveSealed: () => false,
    courtyardWaveEnabled: () => true, cathedralWaveEnabled: () => true,
    isWalkable: (map, x, z) => tiles.isLevelTileWalkable(map, x, z),
    infirmarySpawnTile: infirmary.infirmarySpawnTile,
    distanceBetween: (x, z, xx, zz) => Math.abs(x - xx) + Math.abs(z - zz),
    createEnemy: (x, z, id, placement) => characters.createEnemyUnit(id, x, z, placement),
    levelGroup: { userData: {} },
  };
  const spawn = runInNewContext(`${source}\nspawnTurnReinforcements`, context);
  assert.equal(spawn().units.length, 0);
  assert.match(cityTideWarning(level, state.turn), /arrive turn 4/);
  state.turn = 4;
  assert.equal(spawn().units.length, 0);
  assert.match(cityTideWarning(level, state.turn), /queued/);
  defenders.shift();
  const partial = spawn();
  assert.equal(partial.units.length, 1);
  assert.equal(partial.units[0].x, 3);
  assert.equal(level.reinforcements[0].spawnedCount, 1);
  assert.equal(level.reinforcements[0].spawned, false);
  defenders.length = 0;
  assert.equal(spawn().units[0].x, 38);
  assert.equal(level.reinforcements[0].spawned, true);
  for (const turn of [7, 10, 13]) {
    enemies.splice(1);
    state.turn = turn;
    const result = spawn();
    assert.equal(result.error, null);
    assert.equal(result.units.length, 2);
    for (const unit of result.units) {
      assert.ok([3, 38].includes(unit.x));
      assert.equal(unit.z, 25);
      assert.equal(unit.level, 28);
    }
  }
  assert.ok(level.reinforcements.every((wave) => wave.spawned && wave.spawnedCount === 2));
  state.turn = 100;
  assert.equal(spawn().units.length, 0);
  assert.equal(cityTideWarning(level, state.turn), 'No further water creatures');
  for (const wave of level.reinforcements) { wave.spawned = false; wave.spawnedCount = 0; }
  enemies.length = 0;
  assert.equal(spawn().units.length, 0, 'boss defeat stops even a queued tide');
  assert.ok(level.reinforcements.every((wave) => wave.spawned));
});

test('Older Chapter 18 saves without new footprint metadata or tides remain valid', () => {
  const map = structuredClone(raw);
  delete map.waitingCity.structures;
  map.reinforcements = [];
  const level = levels.validateLevel(map);
  assert.equal(level.waitingCity.structures, undefined);
  assert.deepEqual(level.reinforcements, []);
});

test('City mechanisms, telegraphs and roster survive real save parsing; restart clears them', async () => {
  const level = fresh();
  openApproach(level);
  level.waitingCity.revelationSeen = true;
  prepareCityPulse(level, 4, [boss()]);
  level.reinforcements[0].spawnedCount = 1;
  const fixture = saves.parseSave(await readFile(new URL('../saves/chapter16-level20.json', import.meta.url), 'utf8'));
  fixture.chapter = 17;
  fixture.level = level;
  fixture.turn = 4;
  const all = [fixture.player, ...fixture.allies];
  for (const unit of all) Object.assign(unit, level.players.find(({ id }) => id === unit.id));
  fixture.enemies = level.enemies.map((p) => {
    const enemy = characters.createEnemyUnit(p.id, p.x, p.z, p);
    return { ...p, hp: enemy.hp, maxHp: enemy.maxHp };
  });
  const loaded = saves.parseSave(JSON.stringify(fixture));
  assert.deepEqual(loaded.level.waitingCity, level.waitingCity);
  assert.deepEqual(loaded.level.tileIds, level.tileIds, 'save parsing retains all six wards and the new footprint tiles');
  const reset = freshWaitingCity(level.waitingCity);
  assert.equal(reset.opened, false);
  assert.equal(reset.pulse, null);
  assert.equal(reset.revelationSeen, false);
  assert.ok(reset.mechanisms.every(({ activated }) => !activated));
  assert.equal(level.waitingCity.opened, true, 'reset does not mutate prior state');
});

test('Invalid city mechanisms, sealed-state mismatches and invalid pulse tiles are rejected', () => {
  for (const change of [
    (map) => { map.waitingCity = null; },
    (map) => { map.waitingCity.opened = true; },
    (map) => { map.waitingCity.mechanisms[1].id = 'armory'; },
    (map) => { map.waitingCity.gates[0] = { x: 3, z: 3 }; },
    (map) => { map.enemies = map.enemies.filter(({ id }) => id !== 'bell-drowned'); },
    (map) => { map.reinforcements[0].turn = 5; },
    (map) => { map.reinforcements[1].units[0].x = 10; },
    (map) => { map.waitingCity.structures[0].x = 0; },
    (map) => { map.waitingCity.structures.push({ ...map.waitingCity.structures[0] }); },
    (map) => { map.waitingCity.pulse = { turn: 1, tiles: [{ x: -1, z: 1 }] }; },
  ]) {
    const map = structuredClone(raw); change(map);
    assert.throws(() => levels.validateLevel(map), /Waiting City|Bell-Drowned/);
  }
});

test('PixelLab whole buildings, black ocean, stars, mechanisms and warning overlays render', async () => {
  const level = fresh(), group = new THREE.Group();
  for (const [file, width, height] of [['armory', 192, 160], ['observatory', 192, 192], ['dwelling', 128, 128]]) {
    const png = await readFile(new URL(`../assets/tiles/Waiting_City/${file}.png`, import.meta.url));
    assert.equal(png.readUInt32BE(16), width);
    assert.equal(png.readUInt32BE(20), height);
  }
  const ocean = levels.createWaterMaterial(THREE, new THREE.Texture(), { worldTiled: true, unlit: true });
  scenery.addWaitingCity(THREE, group, level, ocean);
  const scene = group.userData.waitingCity;
  assert.equal(typeof scene.occlusion.update, 'function');
  assert.equal(group.getObjectByName('ancient-ocean').material, ocean);
  for (const floor of group.children.filter(({ userData }) => userData.terrain)) {
    assert.equal(floor.geometry.type, 'PlaneGeometry');
    assert.equal(floor.material.type, 'MeshBasicMaterial');
    assert.equal(floor.material.normalMap, undefined);
    floor.geometry.computeBoundingBox();
    assert.ok(Math.abs(floor.geometry.boundingBox.max.y - floor.geometry.boundingBox.min.y) < 1e-6);
    const positions = new THREE.Matrix4();
    for (let i = 0; i < floor.count; i++) {
      floor.getMatrixAt(i, positions);
      assert.equal(positions.elements[13], 0, 'floor tile lies directly on the ground');
    }
    const art = floor.userData.floorArt;
    assert.ok(['paving', 'plaza', 'bridge', 'ward', 'gravel'].includes(art));
    const expected = await readFile(new URL(`../assets/tiles/Waiting_City/${art}.svg`, import.meta.url), 'utf8');
    const svg = decodeURIComponent(floor.material.map.image.url.split(',')[1]);
    const canonical = (text) => text.replace(/"/g, "'").replace(/\s+/g, '');
    assert.equal(canonical(svg), canonical(expected), 'floor uses the authored flat artwork');
    const edges = floor.geometry.getAttribute('shoreEdges');
    assert.equal(edges.count, floor.count);
    for (let i = 0; i < floor.count; i++) {
      floor.getMatrixAt(i, positions);
      const x = positions.elements[12] + level.width / 2 - 0.5;
      const z = positions.elements[14] + level.height / 2 - 0.5;
      const expectedEdges = [[0, -1], [1, 0], [0, 1], [-1, 0]].map(([dx, dz]) =>
        floor.userData.terrain !== 'shore_bridge' &&
        (!level.tileIds[z + dz]?.[x + dx] || level.tileIds[z + dz][x + dx] === 'shore_sea') ? 1 : 0);
      assert.deepEqual([edges.getX(i), edges.getY(i), edges.getZ(i), edges.getW(i)], expectedEdges,
        'shore erosion follows water-facing edges only, with intact bridge decks');
    }
    const shader = { vertexShader: '#include <common>\n#include <begin_vertex>',
      fragmentShader: '#include <common>\n#include <map_fragment>' };
    floor.material.onBeforeCompile(shader);
    assert.match(shader.vertexShader, /vShoreEdges = shoreEdges/);
    assert.doesNotMatch(shader.vertexShader, /position\s*=/, 'shoreline never raises the ground');
    assert.match(shader.fragmentShader, /if \(shoreDistance < erosion\) discard/);
    assert.match(shader.fragmentShader, /float wet =/);
  }
  assert.ok(group.children.some(({ userData }) => userData.terrain === 'city_paving' && userData.floorArt === 'gravel'));
  const shore = group.children.find(({ userData }) => userData.cityShoreline);
  assert.ok(shore.count > 100, 'shore gravel follows the canals as well as the outer coast');
  assert.equal(shore.material.transparent, false, 'submerged shingle cannot paint over roofs in a later pass');
  assert.equal(shore.material.alphaTest, 0.5);
  assert.ok(shore.renderOrder < 0.2);
  const shorelineKeys = new Set();
  for (let i = 0; i < shore.count; i++) {
    const { x, z, dx, dz } = shore.userData.cityShoreline[i];
    assert.ok(!['shore_bridge', 'shore_sea'].includes(level.tileIds[z][x]));
    assert.ok(!level.tileIds[z + dz]?.[x + dx] || level.tileIds[z + dz][x + dx] === 'shore_sea');
    shorelineKeys.add(`${x},${z},${dx},${dz}`);
    const matrix = new THREE.Matrix4();
    shore.getMatrixAt(i, matrix);
    assert.ok(Math.abs(matrix.elements[13] + 0.03) < 1e-6, 'gravel remains flat just below the paving');
    const landSide = new THREE.Vector3(0, 0, -0.19).applyMatrix4(matrix);
    const seaSide = new THREE.Vector3(0, 0, 0.19).applyMatrix4(matrix);
    assert.ok((seaSide.x - landSide.x) * dx + (seaSide.z - landSide.z) * dz > 0.37,
      'loose gravel fades toward the sea on all four orientations');
  }
  for (let z = 0; z < level.height; z++) for (let x = 0; x < level.width; x++) {
    if (['shore_bridge', 'shore_sea'].includes(level.tileIds[z][x])) continue;
    for (const [dx, dz] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      if (!level.tileIds[z + dz]?.[x + dx] || level.tileIds[z + dz][x + dx] === 'shore_sea') {
        assert.ok(shorelineKeys.has(`${x},${z},${dx},${dz}`), 'every exposed land edge has a shingle fringe');
      }
    }
  }
  assert.equal(scene.stars.geometry.attributes.position.count, 220);
  const starPositions = scene.stars.geometry.attributes.position;
  for (let i = 0; i < starPositions.count; i++) {
    assert.ok(starPositions.getY(i) >= 0.6 && starPositions.getY(i) <= 2.2);
    assert.ok(starPositions.getZ(i) >= -25 && starPositions.getZ(i) <= -18, 'stars remain above the northern sea within the tactical camera view');
  }
  assert.equal(scene.mechanisms.size, 2);
  assert.equal(scene.portal.visible, true);
  assert.ok(group.children.some(({ userData }) => userData.citySprite === 'observatory'));
  assert.ok(group.children.some(({ userData }) => userData.citySprite === 'armory'));
  assert.ok(group.children.some(({ userData }) => userData.citySprite === 'dwelling'));
  assert.equal(group.children.filter(({ userData }) => userData.cityFootprint).length, 35);
  assert.ok(group.children.filter(({ userData }) => userData.citySprite).length >= 70);
  assert.ok(group.children.filter(({ userData }) => userData.cityBridgeRail).length >= 14);
  assert.equal(scene.tideMarkers.size, 2);
  for (const mesh of group.children.filter(({ userData }) => userData.citySprite)) {
    assert.equal(mesh.rotation.x, -Math.atan2(14, 10));
    assert.equal(mesh.rotation.y, 0);
    assert.equal(mesh.userData.facing, 'south');
    assert.equal(mesh.material.map.magFilter, THREE.NearestFilter);
    assert.ok(mesh.renderOrder > 0 && mesh.renderOrder < 1, 'scenery draws after ground and before the unit depth reset');
  }
  const sprites = group.children.filter(({ userData }) => userData.citySprite).sort((a, b) => a.position.z - b.position.z);
  for (let i = 1; i < sprites.length; i++) assert.ok(sprites[i - 1].renderOrder <= sprites[i].renderOrder,
    'nearby roofs draw after distant terraces instead of being clipped by them');
  for (const mesh of group.children.filter(({ userData }) => userData.cityFootprint)) {
    const bounds = new THREE.Box3().setFromObject(mesh);
    for (let z = 0; z < level.height; z++) for (let x = 0; x < level.width; x++) {
      const wx = x + 0.5 - level.width / 2, wz = z + 0.5 - level.height / 2;
      if (wx >= bounds.min.x && wx <= bounds.max.x && wz >= bounds.min.z && wz <= bounds.max.z) {
        assert.equal(level.tileIds[z][x], 'city_building', `${mesh.userData.citySprite} must not cover walkable tile ${x},${z}`);
      }
    }
  }
  for (const wave of level.reinforcements) { wave.spawned = true; wave.spawnedCount = 2; }
  scene.sync();
  assert.ok([...scene.tideMarkers.values()].every((marker) => !marker.visible));
  openApproach(level);
  prepareCityPulse(level, 4, [boss()]);
  scene.sync();
  assert.equal(scene.portal.visible, false);
  assert.equal(scene.warningGroup.children.length, level.waitingCity.pulse.tiles.length);
  for (const mesh of scene.warningGroup.children) assert.ok(mesh.renderOrder < 2, 'units remain visible above warnings');
  let disposed = 0;
  for (const resource of [scene.warningGroup.children[0].geometry, scene.warningGroup.children[0].material,
    scene.stars.geometry, scene.stars.material]) resource.addEventListener('dispose', () => { disposed++; });
  resolveCityPulse(level, 4, [], [boss()]);
  scene.sync();
  assert.equal(scene.warningGroup.children.length, 0);
  scene.dispose();
  assert.equal(disposed, 4, 'teardown frees even markers no longer attached to the scene');
});

test('Green interaction tiles mark exact usable standing positions and clear independently as objects are used', () => {
  const level = fresh(), group = new THREE.Group();
  scenery.addWaitingCity(THREE, group, level);
  const scene = group.userData.waitingCity;
  const expected = new Set(level.chests.map(({ x, z }) => `${x},${z}`));
  for (const entry of level.waitingCity.mechanisms) {
    for (const [dx, dz] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      if (tiles.isLevelTileWalkable(level, entry.x + dx, entry.z + dz)) expected.add(`${entry.x + dx},${entry.z + dz}`);
    }
  }
  assert.deepEqual(new Set(scene.interactionMarkers.keys()), expected);
  for (const [key, marker] of scene.interactionMarkers) {
    const { x, z, sources } = marker.userData.cityInteraction;
    assert.ok(marker.visible);
    assert.equal(marker.material.color.getHex(), 0x49df69);
    assert.equal(marker.geometry.type, 'PlaneGeometry');
    assert.ok(marker.material.opacity > 0 && marker.material.opacity < 0.5);
    assert.equal(marker.material.depthWrite, false);
    assert.ok(marker.renderOrder < 0.2, 'interaction tiles stay below buildings, units and hazard warnings');
    assert.ok(tiles.isLevelTileWalkable(level, x, z));
    for (const { entry, kind } of sources) {
      if (kind === 'mechanism') assert.equal(availableMechanism(level, { x, z, hp: 20, acted: false }), entry);
      else assert.equal(key, `${entry.x},${entry.z}`, 'chests are opened from their own tile, not beside them');
    }
  }
  level.waitingCity.mechanisms[0].activated = true;
  level.chests[0].opened = true;
  scene.sync();
  for (const marker of scene.interactionMarkers.values()) {
    assert.equal(marker.visible, marker.userData.cityInteraction.sources.some(({ entry, kind }) =>
      kind === 'mechanism' ? !entry.activated : !entry.opened));
  }
  assert.ok([...scene.interactionMarkers.values()].some((marker) => marker.visible), 'other unused objects remain highlighted');
  for (const mechanism of level.waitingCity.mechanisms) mechanism.activated = true;
  for (const chest of level.chests) chest.opened = true;
  scene.sync();
  assert.ok([...scene.interactionMarkers.values()].every((marker) => !marker.visible));
  scene.dispose();
});

test('Restored Chapter 18 object state starts with completed interaction highlights hidden', () => {
  const level = fresh(), group = new THREE.Group();
  openApproach(level);
  for (const chest of level.chests) chest.opened = true;
  const restored = levels.validateLevel(JSON.parse(JSON.stringify(level)));
  scenery.addWaitingCity(THREE, group, restored);
  assert.ok([...group.userData.waitingCity.interactionMarkers.values()].every((marker) => !marker.visible));
  group.userData.waitingCity.dispose();
});

test('New guardian and Bell-Drowned art has all eight rotations and directional animations', async () => {
  for (const folder of ['Ancient_Guardian', 'Bell_Drowned']) {
    const root = new URL(`../assets/character/${folder}/`, import.meta.url);
    for (const direction of ['south', 'south-east', 'east', 'north-east', 'north', 'north-west', 'west', 'south-west']) {
      assert.equal((await readFile(new URL(`rotations/${direction}.png`, root))).readUInt32BE(0), 0x89504e47);
      for (const action of folder === 'Ancient_Guardian' ? ['Walking', 'Attacking'] : ['Attacking']) {
        const frames = await readdir(new URL(`animations/${action}/${direction}/`, root));
        assert.ok(frames.filter((file) => /^frame_\d+\.png$/.test(file)).length >= 4, `${folder}/${action}/${direction}`);
      }
    }
  }
});
