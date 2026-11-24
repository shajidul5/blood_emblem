import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { createServer } from 'vite';
import * as THREE from 'three';
import { attachMapDrag } from '../src/game/map-drag.js';

let server, levels, grid, defense, characters, inventory, terrain, saves, raw, mainSource;
const previous = ['Image', 'document'].map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]);
const noop = () => {};
const key = ({ x, z }) => `${x},${z}`;
before(async () => {
  globalThis.Image = class {
    set src(value) {
      this.width = value.includes('infirmary.png') ? 1536 : 64;
      this.height = value.includes('infirmary.png') ? 1024 : 64;
      queueMicrotask(() => this.onload());
    }
  };
  const context = {
    drawImage: noop, fillRect: noop, strokeRect: noop, fillText: noop, strokeText: noop,
    measureText: () => ({ width: 100 }), createRadialGradient: () => ({ addColorStop: noop }),
  };
  globalThis.document = { createElement: () => ({ getContext: () => context }) };
  server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: 'custom' });
  [levels, grid, defense, characters, inventory, terrain, saves] = await Promise.all([
    '/src/levels/level.js', '/src/battle/grid.js', '/src/game/infirmary.js',
    '/src/characters/characters.js', '/src/characters/inventory.js', '/src/battle/terrain.js', '/src/game/save.js',
  ].map((file) => server.ssrLoadModule(file)));
  raw = JSON.parse(await readFile(new URL('./fixtures/infirmary-hd-legacy.json', import.meta.url), 'utf8'));
  mainSource = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
});
after(async () => {
  await server?.close();
  for (const [name, descriptor] of previous) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete globalThis[name];
  }
});
const fresh = () => levels.validateLevel(structuredClone(raw));
function source(from, to) {
  const start = mainSource.indexOf(from), end = mainSource.indexOf(to, start);
  assert.ok(start >= 0 && end > start);
  return mainSource.slice(start, end);
}
function neighbors(point) {
  return grid.DIRECTIONS.map((delta) => ({ x: point.x + delta.x, z: point.z + delta.z }));
}

test('HD infirmary renders one native cutaway with live patient, ledger and defense overlays, not duplicate furniture', async () => {
  const png = await readFile(new URL('../assets/maps/village/infirmary.png', import.meta.url));
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [1536, 1024]);
  const group = new THREE.Group(), level = levels.buildLevel(THREE, group, raw);
  assert.deepEqual([level.width, level.height], [36, 24]);
  const floor = group.getObjectByName('illustrated-infirmary');
  assert.ok(floor);
  assert.deepEqual(floor.material.map.repeat.toArray(), [1, 1]);
  assert.deepEqual(floor.material.map.offset.toArray(), [0, 0]);
  assert.equal(floor.material.map.magFilter, THREE.NearestFilter);
  assert.equal(floor.material.map.generateMipmaps, false);
  assert.equal(group.userData.infirmaryTown, undefined);
  assert.deepEqual(level.objects, []);
  assert.deepEqual(level.cells, []);
  assert.deepEqual(level.chests, []);
  assert.deepEqual(level.infirmary.gates, []);
  assert.ok(level.infirmary.patients.every((patient) => patient.mesh.visible));
  assert.equal(level.infirmary.ledger.mesh.material.opacity, 1);
  assert.equal(group.children.filter((node) => node.isMesh).length, 4, 'floor, ledger label, defense label and exact defense tile');
  const marker = group.children.find((node) => node.isMesh && node.material.opacity === 0.38);
  assert.equal(marker.position.x, level.infirmary.defensePoint.x + 0.5 - level.width / 2);
  assert.equal(marker.position.z, level.infirmary.defensePoint.z + 0.5 - level.height / 2);
  level.infirmary.patients[0].rescued = true;
  level.infirmary.ledger.collected = true;
  const restored = levels.buildLevel(THREE, group, JSON.parse(JSON.stringify(level)));
  assert.equal(restored.infirmary.patients[0].mesh.visible, false);
  assert.equal(restored.infirmary.patients[1].mesh.visible, true);
  assert.equal(restored.infirmary.ledger.mesh.material.opacity, 0.35);
  assert.doesNotMatch(JSON.stringify(restored.infirmary), /"mesh"/);
  assert.throws(() => levels.validateLevel({ ...raw, villageScene: undefined }), /metadata/);
});

test('each northern ward really funnels through its one-cell choke; southern patient loop stays connected behind both defenders', () => {
  const level = fresh(), point = level.infirmary.defensePoint;
  const visited = new Set([key(point)]), queue = [point];
  for (let index = 0; index < queue.length; index++) {
    for (const tile of neighbors(queue[index])) {
      if (!grid.isWalkable(level, tile.x, tile.z) || visited.has(key(tile))) continue;
      visited.add(key(tile));
      queue.push(tile);
    }
  }
  const isolated = [];
  for (let z = 0; z < level.height; z++) for (let x = 0; x < level.width; x++)
    if (grid.isWalkable(level, x, z) && !visited.has(`${x},${z}`)) isolated.push(`${x},${z}`);
  assert.deepEqual(isolated, [], 'all authored floor tiles belong to the connected evacuation route');
  for (const [start, choke] of [[{ x: 6, z: 5 }, { x: 10, z: 7 }], [{ x: 29, z: 5 }, { x: 25, z: 7 }]]) {
    const route = grid.findPath(start, [point], new Set(), level);
    assert.ok(route.some((tile) => key(tile) === key(choke)));
    assert.equal(grid.findPath(start, [point], new Set([key(choke)]), level).length, 0);
  }
  const blocked = new Set(level.players.filter((unit) => unit.id !== 'lena').map(key));
  const lena = level.players.find((unit) => unit.id === 'lena');
  for (const target of [...level.infirmary.patients, level.infirmary.ledger])
    assert.ok(grid.findPath(lena, neighbors(target), blocked, level).length, target.name);
  for (const [x, z] of [[14, 10], [21, 11], [17, 15], [12, 18], [3, 17], [32, 18]])
    assert.equal(grid.isWalkable(level, x, z), false, 'painted furniture blocks movement');
  assert.equal(grid.isWalkable(level, 14, 19), true, 'repaired records doorway is open');
  assert.equal(grid.isWalkable(level, 14, 18), false, 'stone jamb is not a second doorway');
  assert.equal(terrain.getTerrain(level, 3, 17).name, 'Infirmary Wall / Furnishings');
  assert.equal(terrain.getTerrain(level, 6, 17).name, 'Recovery Ward');
  assert.equal(grid.isWalkable(level, 3, 17, { type: 'flying' }), false);
});

test('Lena can rescue both patients and recover the ledger within eight real movement-and-action turns', () => {
  const level = fresh();
  const lena = Object.assign(characters.createLenaAlly(), level.players.find((unit) => unit.id === 'lena'));
  const blocked = new Set(level.players.filter((unit) => unit.id !== 'lena').map(key));
  const targets = [level.infirmary.patients[1], level.infirmary.patients[0], level.infirmary.ledger];
  let turn = 1;
  for (const target of targets) {
    while (true) {
      lena.acted = false;
      const path = grid.findPath(lena, neighbors(target).filter((tile) => tile.z >= 13), blocked, level, lena);
      assert.ok(path.length, target.name);
      const next = path[Math.min(lena.movement, path.length - 1)];
      assert.ok(grid.getMovementRange(lena, level, []).has(key(next)));
      Object.assign(lena, next);
      if (path.length - 1 <= lena.movement) {
        const action = defense.performInfirmaryAction(level, lena, target.id, [lena]);
        assert.ok(['ledger', 'patient'].includes(action.kind));
        assert.equal(lena.acted, true);
        break;
      }
      turn++;
      assert.ok(turn <= 8, `${target.name} exceeds the defense window`);
    }
    if (target !== targets.at(-1)) turn++;
  }
  assert.ok(turn <= level.infirmary.defendTurns, `all three objectives take ${turn} turns`);
  assert.equal(level.infirmary.ledger.collected, true);
  assert.ok(level.infirmary.patients.every((patient) => patient.rescued));
});

test('switching cursor focus while panning the HD map releases capture before clearing the camera target', () => {
  const element = new EventTarget(), captured = new Set(), calls = [];
  element.setPointerCapture = (id) => captured.add(id);
  element.hasPointerCapture = (id) => captured.has(id);
  element.releasePointerCapture = (id) => captured.delete(id);
  const context = {
    activeLevel: fresh(), draggingMap: false, manualCameraTarget: null,
    cursor: {}, cursorOutline: {}, enemies: [], gameState: { mode: 'move' },
    showTileInspection: noop, updateUnitHoverCard: noop, updateMovementRoute: noop,
    findEnemyAt: grid.findEnemyAt,
  };
  context.cancelMapDrag = attachMapDrag(element, {
    canPan: () => true,
    onStart: () => { context.draggingMap = true; context.manualCameraTarget = new THREE.Vector3(); },
    onPan: () => { context.manualCameraTarget.add(new THREE.Vector3(1, 0, 0)); calls.push('pan'); },
    onEnd: () => { context.draggingMap = false; calls.push('end'); },
  });
  const send = (type, x) => {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, { clientX: x, clientY: 0, pointerId: 1, button: 0 });
    element.dispatchEvent(event);
  };
  send('pointerdown', 0);
  send('pointermove', 10);
  runInNewContext(`${source('function setCursor(x, z)', 'function showTileInspection(x, z)')}\nsetCursor(25, 8)`, context);
  assert.equal(context.manualCameraTarget, null);
  assert.equal(context.draggingMap, false);
  assert.equal(captured.size, 0);
  send('pointermove', 20);
  assert.deepEqual(calls, ['pan', 'end']);
});

test('expanded finite waves apply pressure before evacuation; no waves can be sealed', () => {
  const level = fresh();
  assert.deepEqual(level.reinforcements.map(({ turn, entranceId }) => [turn, entranceId]),
    [[2, 'west'], [3, 'east'], [4, 'west'], [5, 'east'], [6, 'theater'], [7, 'carriage'], [8, 'carriage']]);
  const placements = [...level.enemies, ...level.reinforcements.flatMap((wave) => wave.units)];
  assert.equal(placements.length, 27);
  assert.equal(placements.filter((unit) => unit.id === 'infirmary-rider').length, 2);
  assert.equal(placements.some((unit) => unit.drop === 'chest-key'), false);
  const point = level.infirmary.defensePoint;
  for (const placement of placements) {
    const enemy = characters.createEnemyUnit(placement.id, placement.x, placement.z, placement);
    assert.equal(enemy.level, placement.level);
    assert.ok(grid.isWalkable(level, enemy.x, enemy.z, enemy));
    assert.ok(grid.findPath(enemy, [point], new Set(), level, enemy).length);
  }
  for (const wave of level.reinforcements) {
    assert.equal(defense.infirmaryWaveSealed(level, wave), false);
    const unit = wave.units[0];
    assert.equal(defense.infirmarySpawnTile(level, unit, [{ ...unit, hp: 1 }]), null);
    assert.deepEqual(defense.infirmarySpawnTile(level, unit, []), { x: unit.x, z: unit.z });
  }
  for (const placement of [level.enemies[0], level.enemies[2]]) {
    const enemy = characters.createEnemyUnit(placement.id, placement.x, placement.z, placement);
    const steps = grid.findPath(enemy, [point], new Set(), level, enemy).length - 1;
    assert.ok(Math.ceil(steps / enemy.movement) <= 6, 'ignoring the northern approaches loses before evacuation');
  }
  const rear = level.reinforcements.find((wave) => wave.turn === 7).units;
  assert.ok(rear.some((placement) => {
    const enemy = characters.createEnemyUnit(placement.id, placement.x, placement.z, placement);
    return grid.findPath(enemy, [point], new Set(), level, enemy).length - 1 <= enemy.movement * 2;
  }), 'turn-seven carriage wave can breach by the eighth enemy phase');
});

test('actual Ward Objective handler grants the two approved rewards exactly once and persists before popups', async () => {
  const level = levels.buildLevel(THREE, new THREE.Group(), raw);
  const lena = characters.createLenaAlly();
  const receipts = [];
  let saved = 0, insight = 0;
  const context = {
    activeLevel: level, player: lena, playerTeam: [lena], enemies: [],
    gameState: { phase: 'player', mode: 'heal' },
    infirmaryActions: defense.infirmaryActions, performInfirmaryAction: defense.performInfirmaryAction,
    healDialog: { close: noop }, awardExperience: () => ({}), grantItem: inventory.grantItem,
    addInsight: (amount) => { insight += amount; },
    refreshInsightLabel: noop, setMessage: noop, renderTacticalUi: noop,
    saveCurrentGame: () => { saved++; },
    showExperienceProgression: async () => {}, finishUnit: noop,
    tutorialPopup: { show: async () => { assert.ok(saved); } },
    itemPopup: { show: async (items) => { assert.ok(saved); receipts.push(...items); } },
  };
  for (const target of [...level.infirmary.patients, level.infirmary.ledger]) {
    Object.assign(lena, { x: target.x, z: target.z, acted: false });
    context.gameState.mode = 'heal';
    await runInNewContext(`${source('async function actInInfirmary(id)', 'async function completeInfirmaryDefense()')}\nactInInfirmary(${JSON.stringify(target.id)})`, context);
    assert.equal(lena.acted, true);
    lena.acted = false;
    context.gameState.mode = 'heal';
    await runInNewContext(`actInInfirmary(${JSON.stringify(target.id)})`, context);
  }
  assert.deepEqual(receipts.map(({ item }) => item.id), ['javelin', 'saints-ash']);
  assert.equal(saved, 3);
  assert.equal(insight, 10);
  assert.ok(level.infirmary.patients.every((patient) => !patient.mesh.visible));
  assert.equal(level.infirmary.ledger.mesh.material.opacity, 0.35);
  const ash = inventory.INVENTORY_ITEMS.get('saints-ash');
  assert.equal(ash.effect, 'resistance-up');
  assert.equal(ash.amount, 2);
  assert.equal(inventory.INVENTORY_ITEMS.get('javelin').maxRange, 2);
});

test('gate-free defense still takes exactly eight phases, detects breach and resets optional objectives', () => {
  const level = fresh();
  for (let turn = 1; turn <= 8; turn++) assert.equal(defense.finishInfirmaryEnemyPhase(level), turn === 8);
  assert.equal(defense.infirmaryBreached(level, [{ ...level.infirmary.defensePoint, hp: 1 }]), true);
  level.infirmary.ledger.collected = true;
  level.infirmary.patients[0].rescued = true;
  const reset = defense.freshInfirmary(level.infirmary);
  assert.deepEqual(reset.gates, []);
  assert.equal(reset.survivedTurns, 0);
  assert.equal(reset.ledger.collected, false);
  assert.ok(reset.patients.every((patient) => !patient.rescued));
  assert.throws(() => levels.validateLevel({ ...raw, infirmary: { ...raw.infirmary, gates: null } }), /gates/);
});

test('HD progress round-trips saves; explicit restart replaces the legacy map without mutating it', async (t) => {
  const priorStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const storage = new Map();
  globalThis.localStorage = { getItem: (name) => storage.get(name) ?? null, setItem: (name, value) => storage.set(name, value) };
  t.after(() => {
    if (priorStorage) Object.defineProperty(globalThis, 'localStorage', priorStorage);
    else delete globalThis.localStorage;
  });
  const level = fresh();
  level.infirmary.survivedTurns = 3;
  level.infirmary.patients[1].rescued = true;
  const team = [characters.createArlanAlly(), characters.createRictorAlly(), characters.createLenaAlly()]
    .map((unit) => Object.assign(unit, level.players.find((entry) => entry.id === unit.id)));
  saves.writeSave(saves.createSaveData(level, characters.createMaria(), [], { turn: 4, phase: 'player', defeated: false },
    { chapter: 11, playerReserve: true, allies: team }));
  const restored = saves.readSave();
  assert.equal(restored.level.villageScene.layout, 'infirmary');
  assert.equal(restored.level.infirmary.survivedTurns, 3);
  assert.deepEqual(restored.level.infirmary.gates, []);
  assert.equal(restored.level.infirmary.patients[1].rescued, true);
  const legacy = JSON.parse(await readFile(new URL('./fixtures/infirmary-legacy.json', import.meta.url), 'utf8'));
  assert.equal(levels.validateLevel(legacy).infirmary.gates.length, 2);
  const context = {
    activeLevel: legacy, currentChapter: 11, chapterStart: { prepared: true },
    loadChapterLevel: async (chapter, options) => {
      assert.equal(chapter, 11);
      assert.equal(options.reuseLoaded, true);
      return raw;
    },
    startLevel: (map) => { assert.equal(map, raw); context.started = true; },
  };
  await runInNewContext(`${source('async function restartLevel()', 'async function startNextChapter()')}\nrestartLevel()`, context);
  assert.equal(context.started, true);
  assert.equal(legacy.width, 24);
  assert.equal(legacy.infirmary.gates.length, 2);
});
