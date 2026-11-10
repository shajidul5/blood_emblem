import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { runInNewContext } from 'node:vm';
import * as THREE from 'three';

let server, levels, tiles, characters, rules, terrain, saves, scenery, grid, terraces, raw;
const priorImage = Object.getOwnPropertyDescriptor(globalThis, 'Image');
before(async () => {
  const dimensions = new Map(await Promise.all((await readdir(new URL('../assets/tiles/Throne_Beneath_Stars/', import.meta.url)))
    .filter((name) => name.endsWith('.png')).map(async (name) => {
      const png = await readFile(new URL(`../assets/tiles/Throne_Beneath_Stars/${name}`, import.meta.url));
      return [name, [png.readUInt32BE(16), png.readUInt32BE(20)]];
    })));
  globalThis.Image = class {
    set src(value) {
      [this.width, this.height] = dimensions.get(value.split('?')[0].split('/').pop()) ?? [64, 64];
      queueMicrotask(() => this.onload());
    }
  };
  server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: 'custom' });
  [levels, tiles, characters, rules, terrain, saves, scenery, grid, terraces] = await Promise.all([
    '/src/levels/level.js', '/src/levels/tiles.js', '/src/characters/characters.js', '/src/game/abyssal-throne.js',
    '/src/battle/terrain.js', '/src/game/save.js', '/src/levels/abyssal-throne.js',
    '/src/battle/grid.js', '/src/levels/throne-terraces.js',
  ].map((path) => server.ssrLoadModule(path)));
  raw = JSON.parse(await readFile(new URL('../data/levels/map_19_abyssal_throne.json', import.meta.url), 'utf8'));
});
after(async () => {
  await server?.close();
  if (priorImage) Object.defineProperty(globalThis, 'Image', priorImage);
  else delete globalThis.Image;
});
const fresh = () => levels.validateLevel(structuredClone(raw));
const boss = () => characters.createEnemyUnit('throne-vael', 22, 7);
function reachable(level, start = level.spawn) {
  const queue = [start], seen = new Set();
  for (let i = 0; i < queue.length; i++) {
    const { x, z } = queue[i], key = `${x},${z}`;
    if (seen.has(key) || !tiles.isLevelTileWalkable(level, x, z)) continue;
    seen.add(key);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const next = { x: x + dx, z: z + dz };
      if (terraces.canTraverseThroneEdge(level, { x, z }, next)) queue.push(next);
    }
  }
  return seen;
}

test('Chapter 19 registers three connected approaches, twelve allies, Vael and finite elite enemies', () => {
  const level = fresh(), seen = reachable(level);
  assert.equal(levels.CHAPTER_COUNT, 19);
  assert.equal(level.players.length, 12);
  assert.equal(level.enemies.length, 31);
  assert.equal(level.enemies.filter((u) => u.id === 'throne-raven').length, 10);
  assert.equal(level.enemies.filter((u) => ['throne-scholar', 'throne-cantor', 'throne-confessor'].includes(u.id)).length, 9);
  assert.equal(level.enemies.filter((u) => u.id.startsWith('city-')).length, 11);
  assert.equal(level.reinforcements.length, 0);
  assert.equal(level.objective, 'defeat-boss');
  assert.deepEqual(level.requiredUnits, ['maria', 'rictor']);
  for (const p of [...level.players, ...level.enemies.filter((e) => e.id !== 'throne-raven'),
    { x: 13, z: 27 }, { x: 22, z: 20 }, { x: 29, z: 20 }]) {
    assert.ok(seen.has(`${p.x},${p.z}`), `reachable ${p.id ?? 'route'} at ${p.x},${p.z}`);
  }
  for (let z = 0; z < level.height; z++) for (let x = 0; x < level.width; x++) {
    if (tiles.isLevelTileWalkable(level, x, z)) assert.ok(seen.has(`${x},${z}`), `no isolated floor ${x},${z}`);
  }
});

test('Every enemy creates with legal classes, role-specific stats, high ranks and authored dark spells', () => {
  const level = fresh();
  for (const p of level.enemies) {
    const unit = characters.createEnemyUnit(p.id, p.x, p.z, p);
    assert.ok(unit.hp > 40);
    assert.ok(unit.dexterity < 40);
    if (p.id === 'throne-scholar') assert.equal(unit.weapon.id, 'luna');
    if (p.id === 'throne-confessor') assert.equal(unit.weapon.lifeSteal, 0.5);
    if (p.id === 'throne-cantor') {
      assert.equal(unit.weaponExp.Staff, 300);
      assert.equal(unit.inventory.find((i) => i.id === 'heal-staff').spells.physic, 6);
    }
  }
  const vael = boss();
  assert.equal(vael.classId, 'abyssal-hierophant');
  assert.equal(vael.spriteSet, 'highCantorVael');
  assert.equal(vael.weapon.might, 18);
  assert.equal(vael.weapon.hit, 100);
  assert.equal(vael.weapon.maxRange, 3);
  assert.equal(terrain.getTerrain(level, 22, 7).healPerTurn, 5);
});

test('Vael has dedicated eight-direction idle, walking and casting art plus a seated pose and unique tome icon', async () => {
  const directions = ['south', 'south-east', 'east', 'north-east', 'north', 'north-west', 'west', 'south-west'];
  const root = '../assets/character/High_Cantor_Vael/';
  const files = ['Seated/rotations/south.png'];
  for (const direction of directions) {
    files.push(`Idle/rotations/${direction}.png`);
    for (const [animation, count] of [['Walking', 6], ['Casting', 7]]) {
      for (let frame = 0; frame < count; frame++) {
        files.push(`Idle/animations/${animation}/${direction}/frame_${String(frame).padStart(3, '0')}.png`);
      }
    }
  }
  for (const file of files) {
    const png = await readFile(new URL(root + file, import.meta.url));
    assert.equal(png.toString('hex', 0, 8), '89504e470d0a1a0a', file);
    assert.equal(png[25], 6, `${file} has an alpha channel`);
    assert.ok(png.readUInt32BE(16) >= 64 && png.readUInt32BE(20) >= 64, file);
  }
  const weapon = JSON.parse(await readFile(new URL('../data/weapons/last-testament.json', import.meta.url), 'utf8'));
  assert.equal(weapon.sprite, 'assets/weapons/Dark_Tome/last-testament.png');
  const icon = await readFile(new URL(`../${weapon.sprite}`, import.meta.url));
  assert.equal(icon.readUInt32BE(16), 32);
  assert.equal(icon.readUInt32BE(20), 32);
});

test('Actual boss presentation uses his seated sprite before awakening and standing art after awakening or save restore', async () => {
  const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  const textureStart = main.indexOf('function unitTextures(unit)');
  const textureEnd = main.indexOf('// Each unit owns its material', textureStart);
  const syncStart = main.indexOf('function syncThronePresentation()');
  const syncEnd = main.indexOf('async function showThroneStory()', syncStart);
  const vael = { ...boss(), facing: 'south', mesh: {} };
  const characterSprites = { highCantorVael: { south: 'standing' },
    highCantorVaelSeated: { south: 'seated' }, highCantorVaelAttackFrames: { south: ['casting'] } };
  const context = { activeLevel: fresh(), characterSprites, weaponSpriteSet: (unit) => unit.spriteSet,
    enemies: [vael], levelGroup: { userData: {} }, setOceanAmbienceGain() {},
    setIdleSprite: (unit) => { unit.appearance = helpers.unitTextures(unit).idle.south; } };
  const helpers = runInNewContext(`${main.slice(textureStart, textureEnd)}
    ${main.slice(syncStart, syncEnd)}; ({unitTextures, syncThronePresentation})`, context);
  helpers.syncThronePresentation();
  assert.equal(vael.appearance, 'seated');
  assert.equal(vael.ai, 'stationary');
  context.activeLevel.abyssalThrone.awakened = true;
  helpers.syncThronePresentation();
  assert.equal(vael.appearance, 'standing');
  assert.equal(vael.ai, 'guard');
  assert.equal(helpers.unitTextures(vael).attack.south[0], 'casting');
  context.activeLevel.abyssalThrone.awakened = false;
  helpers.syncThronePresentation();
  assert.equal(vael.appearance, 'seated');
});

test('Terrace stairs and units share a smooth ascending height profile; structures stay blocked to flyers', () => {
  const level = fresh();
  assert.deepEqual([33, 30, 26, 16, 9].map((z) => terrain.getTileElevation(level, 22, z)),
    [0.8, 0.8, 2, 3.2, 4.4]);
  assert.equal(level.abyssalThrone.stairs.length, 9);
  assert.equal(level.tileIds.flat().filter((id) => id === 'throne_stairs').length, 54);
  for (const s of level.abyssalThrone.stairs) {
    assert.equal(s.width, 2);
    assert.equal(s.depth, 3);
    for (let dz = 0; dz < 3; dz++) for (let dx = 0; dx < 2; dx++) {
      assert.ok(tiles.isLevelTileWalkable(level, s.x + dx, s.z + dz));
      assert.ok(Math.abs(terrain.getTileElevation(level, s.x + dx, s.z + dz) -
        (s.lower + (2.5 - dz) * 0.4)) < 0.001);
    }
  }
  const s = level.abyssalThrone.structures[0];
  assert.equal(tiles.isLevelTileWalkable(level, s.x, s.z, { type: 'flying' }), false);
});

test('Infantry pathfinding and movement ranges use stair landings, not platform cliffs or stair sides', () => {
  const level = fresh(), unit = { x: 19, z: 30, movement: 2, hp: 10 };
  const range = grid.getMovementRange(unit, level, []);
  assert.equal(range.has('19,28'), false);
  const path = grid.findPath(unit, [{ x: 19, z: 26 }], new Set(), level);
  assert.ok(path.length > 5, 'cliff forces detour through stairs');
  for (let i = 1; i < path.length; i++) assert.ok(terraces.canTraverseThroneEdge(level, path[i - 1], path[i]));
  assert.equal(terraces.canTraverseThroneEdge(level, { x: 20, z: 28 }, { x: 21, z: 28 }), false);
  assert.equal(terraces.canTraverseThroneEdge(level, { x: 21, z: 28 }, { x: 22, z: 28 }), true);
  const flyer = { ...unit, type: 'flying' };
  assert.equal(grid.getMovementRange(flyer, level, []).has('19,28'), true);
  const removed = fresh();
  for (const s of removed.abyssalThrone.stairs) for (let z = s.z; z < s.z + s.depth; z++) {
    for (let x = s.x; x < s.x + s.width; x++) removed.tileIds[z][x] = 'shore_sea';
  }
  assert.equal(reachable(removed).has('22,7'), false);
});

test('Actual mouse floor picking matches raised terraces and every staircase row, including legacy saves', async () => {
  const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  const start = main.indexOf('function pickFloorPoint(ray)');
  const end = main.indexOf('const CAM_OFFSET', start);
  const context = { activeLevel: fresh(), THREE, throneFloorElevations: terraces.throneFloorElevations,
    getTileElevation: terrain.getTileElevation, CATHEDRAL_ELEVATIONS: [],
    raisedPlane: new THREE.Plane(new THREE.Vector3(0, 1, 0)),
    deckPlane: new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.11) };
  const pick = runInNewContext(`${main.slice(start, end)}; pickFloorPoint`, context);
  const check = (x, z) => {
    const height = terrain.getTileElevation(context.activeLevel, x, z);
    const target = new THREE.Vector3(x + 0.5 - raw.width / 2, height + 0.11, z + 0.5 - raw.height / 2);
    const origin = target.clone().add(new THREE.Vector3(0, 14, 10));
    const point = pick(new THREE.Ray(origin, target.clone().sub(origin).normalize()));
    assert.ok(point.distanceTo(target) < 0.001, `pointer at ${x},${z} and height ${height}`);
  };
  for (const [x, z] of [[22, 33], [22, 25], [22, 15], [22, 8]]) check(x, z);
  for (const s of context.activeLevel.abyssalThrone.stairs) {
    for (let row = 0; row < s.depth; row++) check(s.x, s.z + row);
  }
  delete context.activeLevel.abyssalThrone.stairs;
  for (const z of [33, 28, 27, 18, 17, 11, 10]) check(22, z);
});

test('Environmental beats advance once, respond to Maria without Insight and reset without mutating saves', () => {
  const level = fresh();
  assert.deepEqual(rules.advanceThroneStory(level, [{ id: 'maria', x: 22, z: 33, hp: 1 }]), []);
  assert.deepEqual(rules.advanceThroneStory(level, [{ id: 'maria', x: 22, z: 10, hp: 1 }]),
    ['receding', 'congregation', 'testament', 'emblem', 'silence']);
  assert.equal(level.abyssalThrone.awakened, true);
  assert.deepEqual(rules.advanceThroneStory(level, [{ id: 'maria', x: 22, z: 10, hp: 1 }]), []);
  assert.equal(rules.freshAbyssalThrone(level.abyssalThrone).awakened, false);
  assert.equal(level.abyssalThrone.awakened, true);
  const dead = fresh();
  assert.deepEqual(rules.advanceThroneStory(dead, [{ id: 'maria', x: 22, z: 10, hp: 0 }]), []);
});

test('Legacy embedded Chapter 19 maps retain their original heights, scenery and unrestricted height edges', () => {
  const value = structuredClone(raw);
  delete value.abyssalThrone.stairs;
  value.abyssalThrone.props.push({ sprite: 'stairs', x: 21, z: 28 });
  const level = levels.validateLevel(value), group = new THREE.Group();
  assert.deepEqual([33, 28, 27, 18, 17, 11, 10].map((z) => terrain.getTileElevation(level, 22, z)),
    [0, 0.3, 0.6, 0.9, 1.2, 1.5, 1.8]);
  assert.equal(terraces.canTraverseThroneEdge(level, { x: 19, z: 29 }, { x: 19, z: 28 }), true);
  scenery.addAbyssalThrone(THREE, group, level, new THREE.MeshBasicMaterial());
  const presentation = group.userData.abyssalThrone;
  assert.equal(presentation.stairMeshes.length, 0);
  assert.equal(presentation.pillarMeshes.length, 0);
  const stairs = group.children.find((mesh) => mesh.userData.walkableStairs);
  assert.equal(stairs.geometry.parameters.width, 2.8);
  assert.equal(stairs.position.y, 0.04);
  const maria = characters.createMaria();
  Object.assign(maria, level.spawn);
  const enemies = level.enemies.map((p) => characters.createEnemyUnit(p.id, p.x, p.z, p));
  const data = saves.createSaveData(level, maria, enemies, { turn: 1, phase: 'player', defeated: false }, { chapter: 18 });
  const restored = saves.parseSave(JSON.stringify(data));
  assert.equal(restored.level.abyssalThrone.stairs, undefined);
  assert.deepEqual(restored.level.tileIds, level.tileIds);
  presentation.dispose();
});

test('Foretold Ruin grants a full player turn, stays fixed, deals exactly 22 and cancels on boss death', () => {
  const level = fresh(), vael = boss();
  const unit = { id: 'maria', x: 22, z: 9, hp: 50 };
  assert.equal(rules.prepareForetoldRuin(level, 1, [unit], [vael]), null);
  level.abyssalThrone.awakened = true;
  assert.equal(rules.prepareForetoldRuin(level, 1, [{ x: 22, z: 0, hp: 100, type: 'flying' }], [vael]), null,
    'a flyer over open water cannot produce an empty, unsaveable floor warning');
  const warning = rules.prepareForetoldRuin(level, 1, [unit], [vael]);
  assert.equal(warning.tiles.length, 5);
  assert.equal(unit.hp, 50);
  assert.deepEqual(rules.resolveForetoldRuin(level, 0, [unit], [vael]), []);
  unit.x = 24;
  assert.deepEqual(rules.resolveForetoldRuin(level, 1, [unit], [vael]), []);
  unit.x = 22;
  assert.equal(rules.prepareForetoldRuin(level, 2, [unit], [vael]), null);
  rules.prepareForetoldRuin(level, 4, [unit], [vael]);
  assert.equal(rules.resolveForetoldRuin(level, 4, [unit], [vael])[0].damage, 22);
  assert.equal(unit.hp, 28);
  rules.prepareForetoldRuin(level, 7, [unit], [vael]);
  assert.deepEqual(rules.resolveForetoldRuin(level, 7, [unit], []), []);
  assert.equal(level.abyssalThrone.ruin, null);
});

test('Benediction is a third-phase action with no attack fallback, self-heal or out-of-range heal', () => {
  const level = fresh(), vael = boss(), friend = { x: 20, z: 8, hp: 10, maxHp: 60 };
  assert.equal(rules.performBenediction(level, vael, [vael, friend], 3), null);
  level.abyssalThrone.awakened = true;
  assert.equal(rules.performBenediction(level, vael, [vael, friend], 2), null);
  assert.equal(rules.performBenediction(level, vael, [vael, friend], 3).healed, 30);
  assert.equal(friend.hp, 40);
  assert.deepEqual(rules.performBenediction(level, vael, [vael], 6), { target: null, healed: 0 });
  friend.z = 30;
  assert.equal(rules.performBenediction(level, vael, [vael, friend], 6).healed, 0);
  vael.frozen = 1;
  assert.deepEqual(rules.performBenediction(level, vael, [vael, friend], 6), { target: null, healed: 0 },
    'Freeze stops movement, not the announced support action');
  assert.equal(rules.prepareForetoldRuin(level, 6, [{ x: 22, z: 9, hp: 1 }], [vael]), null);
});

test('Chapter state, warned tiles and enemy Physic uses survive normal save validation', () => {
  const level = fresh(), maria = characters.createMaria();
  Object.assign(maria, { x: 22, z: 10 });
  rules.advanceThroneStory(level, [maria]);
  rules.prepareForetoldRuin(level, 4, [maria], [boss()]);
  const enemies = level.enemies.map((p) => characters.createEnemyUnit(p.id, p.x, p.z, p));
  const cantor = enemies.find((e) => e.id === 'throne-cantor');
  cantor.inventory.find((i) => i.id === 'heal-staff').spells.physic = 2;
  const data = saves.createSaveData(level, maria, enemies, { turn: 4, phase: 'player', defeated: false }, { chapter: 18 });
  const saved = saves.parseSave(JSON.stringify(data));
  assert.deepEqual(saved.level.abyssalThrone, level.abyssalThrone);
  assert.equal(saved.enemies.find((e) => e.id === 'throne-cantor').inventory[1].spells.physic, 2);
  const future = structuredClone(data);
  future.level.abyssalThrone.ruin.turn = 5;
  assert.throws(() => saves.parseSave(JSON.stringify(future)), /current turn/);
  const falseVictory = structuredClone(data);
  falseVictory.phase = 'victory';
  assert.throws(() => saves.parseSave(JSON.stringify(falseVictory)), /Vael to be defeated/);
  falseVictory.enemies = falseVictory.enemies.filter((enemy) => enemy.id !== 'throne-vael');
  assert.throws(() => saves.parseSave(JSON.stringify(falseVictory)), /Maria and Rictor/);
  const rictor = characters.createRictorAlly();
  Object.assign(rictor, { x: 21, z: 10 });
  falseVictory.allies = [saves.serializeUnit(rictor)];
  assert.equal(saves.parseSave(JSON.stringify(falseVictory)).phase, 'victory');
  falseVictory.allies[0].stats.hp = 0;
  assert.throws(() => saves.parseSave(JSON.stringify(falseVictory)), /Maria and Rictor/);
});

test('Actual victory check ignores surviving cultists and clears Ruin when Vael falls', async () => {
  const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  const start = main.indexOf('function checkDefeatAllVictory()');
  const end = main.indexOf('function objectiveDescription(', start);
  let victories = 0, syncs = 0;
  const level = fresh(), enemies = [boss(), { id: 'throne-cantor', hp: 50 }];
  const context = { activeLevel: level, enemies,
    levelGroup: { userData: { abyssalThrone: { sync: () => syncs++ } } },
    completeVictory: () => victories++ };
  const check = runInNewContext(`${main.slice(start, end)}; checkDefeatAllVictory`, context);
  assert.equal(check(), false);
  level.abyssalThrone.ruin = { turn: 1, tiles: [{ x: 22, z: 9 }] };
  enemies.shift();
  assert.equal(check(), true);
  assert.equal(victories, 1);
  assert.equal(syncs, 1);
  assert.equal(level.abyssalThrone.ruin, null);
});

test('Actual party defeat rules require both Maria and Rictor even with other living allies', async () => {
  const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  const start = main.indexOf('function fallenRequiredUnit()');
  const end = main.indexOf('function completeGameOver()', start);
  const maria = { id: 'maria', name: 'Maria', hp: 24 }, rictor = { id: 'rictor', name: 'Rictor', hp: 32 };
  const context = { activeLevel: fresh(), maria, playerTeam: [maria, rictor, { hp: 20 }],
    requiredUnits: () => [maria, rictor] };
  const helpers = runInNewContext(`${main.slice(start, end)}; ({partyDefeated, gameOverMessage})`, context);
  assert.equal(helpers.partyDefeated(), false);
  maria.hp = 0;
  assert.equal(helpers.partyDefeated(), true);
  assert.match(helpers.gameOverMessage(), /Maria.*beneath the stars/);
  maria.hp = 24;
  rictor.hp = 0;
  assert.equal(helpers.partyDefeated(), true);
  assert.match(helpers.gameOverMessage(), /Rictor.*beneath the stars/);
});

test('Malformed boss, scenery, beats and ruin saves report explicit errors', () => {
  for (const mutate of [
    (r) => { r.bossId = 'wrong'; },
    (r) => { r.beats.pop(); },
    (r) => { r.structures[0].x = -1; },
    (r) => { r.props[0].sprite = 'missing'; },
    (r) => { r.stairs[0].width = 3; },
    (r) => { r.stairs[1] = { ...r.stairs[0] }; },
    (r) => { r.ruin = { turn: 1, tiles: [{ x: -1, z: 0 }] }; },
  ]) {
    const value = structuredClone(raw);
    mutate(value.abyssalThrone);
    assert.throws(() => levels.validateLevel(value), /Throne|throne|Ruin/);
  }
});

test('Renderer builds flat elevated floors, south-facing facades, stars and saved environmental changes', () => {
  const level = fresh(), group = new THREE.Group();
  scenery.addAbyssalThrone(THREE, group, level, new THREE.MeshBasicMaterial());
  const scene = group.userData.abyssalThrone;
  assert.equal(scene.stars.geometry.attributes.position.count, 220);
  const starPositions = scene.stars.geometry.attributes.position;
  for (let i = 0; i < starPositions.count; i++) {
    assert.ok(starPositions.getZ(i) >= -24.5 && starPositions.getZ(i) <= -18.5);
    assert.ok(starPositions.getY(i) >= 0.14 && starPositions.getY(i) <= 1.36);
  }
  assert.ok(group.children.filter((m) => m.userData.citySprite).every((m) => m.userData.facing === 'south'));
  assert.ok(group.children.some((m) => m.userData.throneElevation === 4.4));
  assert.equal(scene.stairMeshes.length, 9);
  for (const run of scene.stairMeshes) assert.equal(run.children.length, 50, '24 treads, 24 risers and two sidewalls');
  assert.ok(scene.pillarMeshes.length >= 10);
  assert.ok(scene.pillarMeshes.every((p) => p.userData.supportPillar.top > 0));
  rules.advanceThroneStory(level, [{ id: 'maria', x: 22, z: 10, hp: 1 }]);
  rules.prepareForetoldRuin(level, 1, [{ x: 22, z: 9, hp: 1 }], [boss()]);
  scene.sync();
  assert.equal(scene.ocean.position.y, -1.05);
  assert.equal(scene.stars.material.opacity, 0.28);
  assert.equal(scene.warningGroup.children.length, 5);
  scene.dispose();
});

test('Temple floors vary in coherent two-tile materials and the colonnade preserves all routes and unit positions', async () => {
  const level = fresh(), original = structuredClone(level), group = new THREE.Group();
  scenery.addAbyssalThrone(THREE, group, level, new THREE.MeshBasicMaterial());
  const presentation = group.userData.abyssalThrone;
  assert.deepEqual(level, original, 'visual detail never changes terrain, movement or placements');
  const materials = new Set(presentation.floorMeshes.map((mesh) => mesh.userData.throneFloorArt));
  assert.deepEqual([...materials].sort(), ['temple-gravel', 'temple-limestone', 'temple-mosaic', 'temple-slate']);
  const matrix = new THREE.Matrix4(), point = new THREE.Vector3();
  let floorTiles = 0;
  for (const mesh of presentation.floorMeshes) {
    assert.ok(mesh.instanceColor, 'subtle per-stone color variation');
    assert.equal(mesh.material.map.magFilter, THREE.NearestFilter);
    const uv = mesh.geometry.attributes.uv;
    const us = Array.from({ length: uv.count }, (_, i) => uv.getX(i));
    const vs = Array.from({ length: uv.count }, (_, i) => uv.getY(i));
    assert.equal(Math.max(...us) - Math.min(...us), 0.5);
    assert.equal(Math.max(...vs) - Math.min(...vs), 0.5);
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, matrix);
      point.set(0, 0, 0).applyMatrix4(matrix);
      const x = Math.round(point.x + level.width / 2 - 0.5);
      const z = Math.round(point.z + level.height / 2 - 0.5);
      assert.equal(Math.min(...us), (x % 2) / 2, 'artwork remains aligned across material batches');
      assert.equal(Math.min(...vs), (1 - z % 2) / 2);
      assert.ok(Math.abs(point.y - terrain.getTileElevation(level, x, z)) < 0.001);
      for (let v = 0; v < mesh.geometry.attributes.position.count; v++) {
        assert.ok(Math.abs(mesh.geometry.attributes.position.getY(v)) < 0.001, 'floor remains a flat plane');
      }
      floorTiles++;
    }
  }
  assert.equal(floorTiles, level.tileIds.flat().filter((id) => !['shore_sea', 'throne_stairs'].includes(id)).length);
  assert.equal(presentation.colonnade.length, 24);
  assert.equal(presentation.colonnade.filter((mesh) => mesh.userData.throneColonnade.z === 1.85).length, 9);
  assert.equal(presentation.colonnade.filter((mesh) => mesh.userData.throneColonnade.x === 8.65).length, 4);
  assert.equal(presentation.colonnade.filter((mesh) => mesh.userData.throneColonnade.x === 35.35).length, 4);
  for (const column of presentation.colonnade) {
    assert.equal(column.rotation.x, -Math.atan2(14, 10));
    assert.equal(column.rotation.y, 0);
    assert.equal(column.userData.facing, 'south');
    assert.equal(column.material.depthTest, false);
    const { x, z } = column.userData.throneColonnade;
    for (const stair of level.abyssalThrone.stairs.filter((s) => s.z === 10)) {
      assert.ok(z !== 10.7 || x + 0.475 < stair.x - 0.5 || x - 0.475 > stair.x + 1.5,
        'southern columns leave all three stair mouths open');
    }
  }
  for (const [file, width, height] of [['temple-column', 48, 128], ['temple-fascia', 64, 32],
    ...[...materials].map((name) => [name, 64, 64])]) {
    const png = await readFile(new URL(`../assets/tiles/Throne_Beneath_Stars/${file}.png`, import.meta.url));
    assert.equal(png.readUInt32BE(16), width);
    assert.equal(png.readUInt32BE(20), height);
  }
  presentation.dispose();
});

test('Under-platform pillars share facade projection and attach capitals directly beneath the platform lips', () => {
  const level = fresh(), group = new THREE.Group();
  scenery.addAbyssalThrone(THREE, group, level, new THREE.MeshBasicMaterial());
  const presentation = group.userData.abyssalThrone;
  group.updateMatrixWorld(true);
  for (const pillar of presentation.pillarMeshes) {
    const { x, z, top, height } = pillar.userData.supportPillar;
    assert.equal(pillar.rotation.x, -Math.atan2(14, 10));
    assert.equal(pillar.rotation.y, 0);
    assert.ok(Math.abs(top - (terrain.getTileElevation(level, x, z) - 0.22)) < 0.001);
    assert.equal(pillar.position.z, z + 1 - level.height / 2);
    assert.equal(pillar.children.length, 3);
    assert.ok(height > 0.7);
    let previousBottom = 0;
    for (const part of pillar.children) {
      const half = part.geometry.parameters.height / 2;
      assert.ok(Math.abs(part.position.y + half - previousBottom) < 0.001, 'no gaps between capital, shaft and base');
      previousBottom = part.position.y - half;
      assert.equal(part.material.depthWrite, false);
      assert.equal(part.material.depthTest, false);
      assert.ok(part.renderOrder > presentation.ocean.renderOrder && part.renderOrder < 0,
        'supports draw over the ocean but beneath platforms');
    }
    assert.ok(Math.abs(previousBottom + height) < 0.001);
  }
  presentation.dispose();
});
