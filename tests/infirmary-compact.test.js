import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { inflateSync } from 'node:zlib';
import { runInNewContext } from 'node:vm';
import { createServer } from 'vite';
import * as THREE from 'three';

let server, levels, grid, defense, characters, inventory, saves, raw, patientRaw, main;
const previous = ['Image', 'document'].map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]);
const noop = () => {};
const key = ({ x, z }) => `${x},${z}`;
before(async () => {
  globalThis.Image = class {
    set src(value) {
      this.width = value.includes('infirmary-compact.png') ? 1152 : 64;
      this.height = value.includes('infirmary-compact.png') ? 864 : 64;
      queueMicrotask(() => this.onload());
    }
  };
  const context = {
    drawImage: noop, fillRect: noop, strokeRect: noop, fillText: noop, strokeText: noop,
    measureText: () => ({ width: 100 }), createRadialGradient: () => ({ addColorStop: noop }),
  };
  globalThis.document = { createElement: () => ({ getContext: () => context }) };
  server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: 'custom' });
  [levels, grid, defense, characters, inventory, saves] = await Promise.all([
    '/src/levels/level.js', '/src/battle/grid.js', '/src/game/infirmary.js',
    '/src/characters/characters.js', '/src/characters/inventory.js', '/src/game/save.js',
  ].map((file) => server.ssrLoadModule(file)));
  raw = JSON.parse(await readFile(new URL('../data/levels/map_12_infirmary.json', import.meta.url), 'utf8'));
  patientRaw = JSON.parse(await readFile(new URL('./fixtures/infirmary-compact-patients-legacy.json', import.meta.url), 'utf8'));
  main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
});
after(async () => {
  await server?.close();
  for (const [name, descriptor] of previous) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete globalThis[name];
  }
});
const fresh = () => levels.validateLevel(structuredClone(raw));
const freshPatients = () => levels.validateLevel(structuredClone(patientRaw));
const neighbors = (point) => grid.DIRECTIONS.map((delta) => ({ x: point.x + delta.x, z: point.z + delta.z }));
const team = (level) => [characters.createArlanAlly(), characters.createRictorAlly(), characters.createLenaAlly(), characters.createSerraAlly()]
  .map((unit) => Object.assign(unit, level.players.find((placement) => placement.id === unit.id)));
function source(from, to) {
  const start = main.indexOf(from), end = main.indexOf(to, start);
  assert.ok(start >= 0 && end > start);
  return main.slice(start, end);
}

test('compact 24x18 encounter renders native art and three live chests without patient overlays', () => {
  const group = new THREE.Group(), level = levels.buildLevel(THREE, group, raw);
  assert.deepEqual([level.width, level.height], [24, 18]);
  assert.equal(level.width * level.height, 36 * 24 / 2);
  const floor = group.getObjectByName('illustrated-infirmary');
  assert.deepEqual(floor.material.map.repeat.toArray(), [1, 1]);
  assert.deepEqual(floor.material.map.offset.toArray(), [0, 0]);
  assert.equal(floor.material.map.magFilter, THREE.NearestFilter);
  assert.ok(group.getObjectByName('infirmary-dark-surround'));
  assert.equal(level.infirmary.ledger, undefined);
  assert.equal(level.chests[0].rewardId, 'treatment-ledger');
  assert.ok(level.chests[0].mesh);
  assert.equal(defense.infirmaryLedgerSecured(level), false);
  assert.deepEqual(level.infirmary.patients, []);
  assert.deepEqual(level.chests.map((chest) => chest.rewardId), ['treatment-ledger', 'javelin', 'saints-ash']);
  assert.ok(level.chests.every((chest) => chest.mesh));
  level.chests[0].opened = true;
  const restored = levels.buildLevel(THREE, group, JSON.parse(JSON.stringify(level)));
  assert.deepEqual(restored.infirmary.patients, []);
  assert.equal(defense.infirmaryLedgerSecured(restored), true);
});

test('every walkable cell is connected and every room has a single-cell entrance', () => {
  const level = fresh(), point = level.infirmary.defensePoint;
  const seen = new Set([key(point)]), queue = [point];
  for (let i = 0; i < queue.length; i++) for (const tile of neighbors(queue[i])) {
    if (!grid.isWalkable(level, tile.x, tile.z) || seen.has(key(tile))) continue;
    seen.add(key(tile)); queue.push(tile);
  }
  for (let z = 0; z < level.height; z++) for (let x = 0; x < level.width; x++)
    if (grid.isWalkable(level, x, z)) assert.ok(seen.has(`${x},${z}`), `${x},${z}`);
  for (const [start, choke] of [
    [{ x: 3, z: 3 }, { x: 6, z: 6 }],
    [{ x: 20, z: 3 }, { x: 17, z: 6 }],
    [{ x: 12, z: 3 }, { x: 12, z: 6 }],
    [level.chests[0], { x: 5, z: 11 }],
    [{ x: 12, z: 16 }, { x: 12, z: 14 }],
  ]) {
    assert.ok(grid.findPath(start, [point], new Set(), level).some((tile) => key(tile) === key(choke)));
    assert.equal(grid.findPath(start, [point], new Set([key(choke)]), level).length, 0);
    const flanks = choke.x === 5
      ? [{ x: 5, z: 10 }, { x: 5, z: 12 }]
      : [{ x: choke.x - 1, z: choke.z }, { x: choke.x + 1, z: choke.z }];
    assert.ok(flanks.every((tile) => !grid.isWalkable(level, tile.x, tile.z)));
  }
});

test('painted entrance apertures contain exactly one 48px tile of clear floor, with native masonry jambs', async () => {
  const png = await readFile(new URL('../assets/maps/village/infirmary-compact.png', import.meta.url));
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [1152, 864]);
  assert.equal(png[24], 8);
  assert.equal(png[25], 6);
  const chunks = [];
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset);
    if (png.toString('ascii', offset + 4, offset + 8) === 'IDAT') chunks.push(png.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  const rows = inflateSync(Buffer.concat(chunks)), stride = 1152 * 4 + 1;
  const pixel = (x, y) => rows.subarray(y * stride + 1 + x * 4, y * stride + 5 + x * 4);
  for (let y = 0; y < 864; y++) assert.equal(rows[y * stride], 0, 'lossless unfiltered native assembly');
  for (const [x, z] of [[6, 6], [6, 7], [17, 6], [17, 7], [12, 6], [12, 7], [5, 11], [12, 14], [12, 15]]) {
    const rx = 6 + x % 2, rz = 8 + z % 4;
    for (let dy = 0; dy < 48; dy++) for (let dx = 0; dx < 48; dx++)
      assert.deepEqual(pixel(x * 48 + dx, z * 48 + dy), pixel(rx * 48 + dx, rz * 48 + dy), `${x},${z}: clear aperture`);
    if (x !== 5) {
      assert.notDeepEqual(pixel(x * 48 - 1, z * 48 + 24), pixel(rx * 48, rz * 48 + 24));
      assert.notDeepEqual(pixel((x + 1) * 48, z * 48 + 24), pixel(rx * 48 + 47, rz * 48 + 24));
    }
  }
});

test('older compact saves retain the original patient rescue timing', () => {
  for (const [id, patientIndex, enemyX] of [['arlan', 0, 8], ['rictor', 1, 15]]) {
    const level = freshPatients(), units = team(level), unit = units.find((unit) => unit.id === id);
    const patient = level.infirmary.patients[patientIndex];
    const route = grid.findPath(unit, neighbors(patient), new Set(units.filter((other) => other !== unit).map(key)), level, unit);
    assert.ok(route.length > 1 && route.length - 1 <= unit.movement * 2);
    assert.ok(route.length - 1 > unit.movement, 'rescue requires advancing beyond the starting choke');
    Object.assign(unit, route.at(-1), { acted: false });
    const action = defense.performInfirmaryAction(level, unit, patient.id, units);
    assert.equal(action.kind, 'patient');
    assert.equal(patient.rescued, true);
    assert.equal(action.target.rewardId, patientIndex ? 'saints-ash' : 'javelin');
    assert.equal(action.exp, 30);
    const enemy = characters.createEnemyUnit('undead', enemyX, 2, { level: 11, ai: 'mobile' });
    const unrescued = freshPatients(), target = unrescued.infirmary.patients[patientIndex];
    const enemyRoute = grid.findPath(enemy, [target], new Set(), unrescued, enemy);
    assert.ok(enemyRoute.length - 1 > enemy.movement * 2, 'two player actions precede unattended patient loss');
    assert.ok(enemyRoute.length - 1 <= enemy.movement * 3, 'a passive defense loses patients by enemy phase three');
  }
});

test('undead pursue northern patients, then the defense; attackable allies still take priority', () => {
  const level = freshPatients(), patient = level.infirmary.patients[0];
  const undead = characters.createEnemyUnit('undead', 8, 2, { level: 11, ai: 'mobile' });
  const goal = defense.infirmaryApproachTarget(level, undead, []);
  assert.deepEqual({ x: goal.x, z: goal.z }, { x: patient.x, z: patient.z });
  assert.equal(goal.objectiveTarget, true);
  const blocker = { ...grid.findPath(undead, [patient], new Set(), level)[1], hp: 10 };
  assert.equal(defense.infirmaryApproachTarget(level, undead, [blocker]), blocker);
  const ally = { x: 8, z: 3, hp: 10 };
  const choose = source('function chooseEnemyTarget(', '// Thrones and similar tiles');
  const result = runInNewContext(`${choose}\nchooseEnemyTarget(enemy, [ally])`, {
    enemy: undead, ally, activeLevel: level,
    courtyardDeliveryCourt: () => undefined,
    getEnemyReach: () => new Map([[key(undead), true]]), isInWeaponRange: () => true,
    enemyAttackWeapons: (unit) => [unit.weapon],
    distanceBetween: grid.distanceBetween, infirmaryApproachTarget: defense.infirmaryApproachTarget,
  });
  assert.equal(result, ally);
  for (const entry of level.infirmary.patients) entry.lost = true;
  assert.deepEqual(defense.infirmaryApproachTarget(level, undead, []), { ...level.infirmary.defensePoint, objectiveTarget: true });
  const southern = characters.createEnemyUnit('undead', 12, 16, { ai: 'mobile' });
  assert.deepEqual(defense.infirmaryApproachTarget(fresh(), southern, []), { ...level.infirmary.defensePoint, objectiveTarget: true });
});

test('patient loss requires exact living-undead occupancy, permanently forfeits rewards, and is not defeat', () => {
  const level = freshPatients(), patient = level.infirmary.patients[0], lena = characters.createLenaAlly();
  assert.deepEqual(defense.resolveInfirmaryPatients(level, [{ ...patient, x: patient.x + 1, type: 'undead', hp: 10 }]), []);
  assert.deepEqual(defense.resolveInfirmaryPatients(level, [{ ...patient, type: 'armor', hp: 10 }]), []);
  assert.deepEqual(defense.resolveInfirmaryPatients(level, [{ ...patient, type: 'undead', hp: 0 }]), []);
  const enemy = { ...patient, id: 'undead', hp: 10 };
  assert.deepEqual(defense.resolveInfirmaryPatients(level, [enemy]), [patient]);
  assert.equal(patient.lost, true);
  assert.deepEqual(defense.resolveInfirmaryPatients(level, [enemy]), []);
  Object.assign(lena, patient, { hp: 10, acted: false });
  assert.ok(!defense.infirmaryActions(level, lena, []).some((action) => action.id === patient.id));
  assert.throws(() => defense.performInfirmaryAction(level, lena, patient.id, []), /no longer available/);
  assert.equal(defense.infirmaryBreached(level, [enemy]), false);
  for (let turn = 0; turn < 8; turn++) defense.finishInfirmaryEnemyPhase(level);
  assert.equal(defense.infirmaryVictoryReady(level), true);
  assert.equal(defense.freshInfirmary(level.infirmary).patients[0].lost, false);
  const legacy = { ...fresh(), infirmary: { ...fresh().infirmary, patientsVulnerable: undefined } };
  assert.deepEqual(defense.resolveInfirmaryPatients(legacy, [enemy]), [], 'legacy patients remain safe');
});

test('smaller staggered waves allow two quiet turns and southern arrivals threaten the defense by phase seven', () => {
  const level = fresh();
  assert.equal(level.enemies.length + level.reinforcements.flatMap((wave) => wave.units).length, 13);
  assert.deepEqual(level.reinforcements.map((wave) => [wave.turn, wave.entranceId, wave.units.length]),
    [[3, 'west', 2], [5, 'east', 2], [6, 'carriage', 2], [7, 'theater', 1], [8, 'carriage', 2]]);
  assert.equal(level.reinforcements.find((wave) => wave.turn === 7).units[0].id, 'rotten');
  assert.equal(defense.infirmaryWarning(level, 1), 'No incoming wave next turn.');
  level.reinforcements[0].spawned = true;
  assert.equal(defense.infirmaryWarning(level, 3), 'No incoming wave next turn.');
  const south = level.reinforcements.filter((wave) => wave.entranceId === 'carriage');
  assert.deepEqual(south.map((wave) => wave.turn), [6, 8]);
  assert.match(defense.infirmaryWarning(level, 5), /carriage entrance, turn 6/);
  const placement = south[0].units.find((unit) => unit.x === 12);
  const enemy = characters.createEnemyUnit(placement.id, placement.x, placement.z, placement);
  const route = grid.findPath(enemy, [level.infirmary.defensePoint], new Set(), level, enemy);
  assert.ok(route.length - 1 > enemy.movement);
  assert.ok(route.length - 1 <= enemy.movement * 2);
  assert.equal(defense.infirmarySpawnTile(level, placement, [{ ...placement, hp: 1 }]), null);
  assert.deepEqual(defense.infirmarySpawnTile(level, placement, []), { x: placement.x, z: placement.z });
});

test('the real chest and Read handlers award one ledger, then exactly 10 Insight and lore, including convoy use', async () => {
  const level = levels.buildLevel(THREE, new THREE.Group(), raw), lena = characters.createLenaAlly();
  Object.assign(lena, level.chests[0], { acted: false });
  let insight = 0, popup = 0, saved = 0;
  const context = {
    activeLevel: level, player: lena, convoy: [], gameState: { selected: true, phase: 'player' },
    hasLockpick: () => true, grantItem: inventory.grantItem, levelGroup: { userData: {} },
    setMessage: noop, renderTacticalUi: noop, finishUnit: noop,
    itemPopup: {
      show: async () => {},
      showRead: async (item, total) => {
        assert.ok(saved, 'consumption and Insight persist before the reading popup');
        assert.equal(total, insight);
        assert.ok(item.lore);
        popup++;
      },
    }, INVENTORY_ITEMS: inventory.INVENTORY_ITEMS,
    getInsight: () => insight,
    gainInsight: (amount) => { insight += amount; },
    saveCurrentGame: () => { saved++; },
    tutorialPopup: { show: async (id) => { assert.equal(id, 'infirmaryRecords'); assert.ok(saved); popup++; } },
  };
  const open = source('function chestAvailableToOpen(unit)', 'const hasLockpick =');
  await runInNewContext(`${open}\nopenChest()`, context);
  assert.equal(insight, 0);
  assert.equal(lena.inventory.filter((entry) => entry.id === 'treatment-ledger').length, 1);
  lena.acted = false;
  await runInNewContext('openChest()', context);
  assert.equal(lena.inventory.filter((entry) => entry.id === 'treatment-ledger').length, 1);
  const entry = lena.inventory.find((entry) => entry.id === 'treatment-ledger');
  context.entry = entry;
  const read = source('function readInsightItem(unit, entry)', 'async function useInsightFromInventory');
  runInNewContext(`${read}\nreadInsightItem(player, entry); readInsightItem(player, entry);`, context);
  assert.equal(insight, 10);
  assert.equal(popup, 1);
  assert.ok(!lena.inventory.includes(entry));
  assert.equal(inventory.INVENTORY_ITEMS.get('treatment-ledger').maxUses, 1);
  assert.match(inventory.INVENTORY_ITEMS.get('treatment-ledger').lore, /Movement resumed/);
  context.convoy.push(entry);
  runInNewContext('readInsightItem(null, entry); readInsightItem(null, entry);', context);
  assert.equal(insight, 20);
  assert.equal(popup, 2);
  assert.deepEqual(context.convoy, []);
});

test('targeted starting supplies give Arlan and Rictor one key each without changing other allies or prepared restarts', () => {
  const level = fresh(), units = team(level);
  let saved = 0;
  const context = {
    activeLevel: level, units, grantItem: inventory.grantItem,
    window: { setTimeout: noop }, saveCurrentGame: () => { saved++; },
  };
  const grant = source('function grantStartingItems(team)', 'const profileDialogUi');
  runInNewContext(`${grant}\ngrantStartingItems(units);`, context);
  for (const unit of units) {
    assert.equal(unit.inventory.filter((entry) => entry.id === 'chest-key').length,
      ['arlan', 'rictor'].includes(unit.id) ? 1 : 0, unit.id);
  }
  const before = JSON.stringify(units.map((unit) => unit.inventory));
  assert.equal(saved, 1, 'starting keys persist before preparations or item popups');
  runInNewContext('grantStartingItems([])', context);
  assert.equal(JSON.stringify(units.map((unit) => unit.inventory)), before);
  assert.equal(saved, 1);
  assert.match(main, /grantStartingItems\(carry\?\.prepared \? \[\] : team\)/);
  for (const startingItems of ['chest-key', [null], ['']]) {
    const invalid = structuredClone(raw);
    invalid.players[0].startingItems = startingItems;
    assert.throws(() => levels.validateLevel(invalid), /players/);
  }
});

test('either frontliner can open their northern supply chest once with a key; enemy occupancy cannot destroy it', async () => {
  const level = levels.buildLevel(THREE, new THREE.Group(), raw), units = team(level);
  for (const [id, reward] of [['arlan', 'javelin'], ['rictor', 'saints-ash']]) {
    const unit = units.find((unit) => unit.id === id), chest = level.chests.find((chest) => chest.rewardId === reward);
    inventory.grantItem(unit, 'chest-key');
    const route = grid.findPath(unit, [chest], new Set(), level, unit);
    assert.ok(route.length > 1 && route.length - 1 <= unit.movement * 3);
    assert.deepEqual(defense.resolveInfirmaryPatients(level, [{ ...chest, id: 'undead', hp: 10 }]), []);
    assert.equal(chest.opened, false);
    Object.assign(unit, { x: chest.x, z: chest.z, acted: false });
    const context = {
      activeLevel: level, player: unit, gameState: { selected: true, phase: 'player' },
      hasLockpick: () => false, grantItem: inventory.grantItem, levelGroup: { userData: {} },
      setMessage: noop, renderTacticalUi: noop, finishUnit: noop, itemPopup: { show: async () => {} },
    };
    const open = source('function chestAvailableToOpen(unit)', 'const hasLockpick =');
    await runInNewContext(`${open}\nopenChest()`, context);
    assert.equal(chest.opened, true);
    assert.ok(unit.inventory.some((entry) => entry.id === reward));
    assert.ok(!unit.inventory.some((entry) => entry.id === 'chest-key'));
    unit.acted = false;
    await runInNewContext('openChest()', context);
    assert.equal(unit.inventory.filter((entry) => entry.id === reward).length, 1);
  }
  level.infirmary.survivedTurns = 2;
  const data = saves.createSaveData(level, characters.createMaria(), [], { turn: 3, phase: 'player', defeated: false },
    { chapter: 11, playerReserve: true, allies: units });
  const restored = saves.parseSave(JSON.stringify(data));
  assert.deepEqual(restored.level.infirmary.patients, []);
  assert.deepEqual(restored.level.chests.map((chest) => chest.opened), [false, true, true]);
  assert.deepEqual(restored.level.players[0].startingItems, ['chest-key']);
});

test('older compact patient progress and the ledger item still round-trip; malformed states are rejected', () => {
  const level = freshPatients(), units = team(level);
  level.infirmary.survivedTurns = 2;
  level.infirmary.patients[0].lost = true;
  level.infirmary.patients[1].rescued = true;
  level.chests[0].opened = true;
  inventory.grantItem(units[2], 'treatment-ledger');
  const data = saves.createSaveData(level, characters.createMaria(), [], { turn: 3, phase: 'player', defeated: false },
    { chapter: 11, playerReserve: true, allies: units });
  const restored = saves.parseSave(JSON.stringify(data));
  assert.equal(restored.level.infirmary.patients[0].lost, true);
  assert.equal(restored.level.infirmary.patients[1].rescued, true);
  assert.equal(defense.infirmaryLedgerSecured(restored.level), true);
  assert.ok(restored.allies.find((unit) => unit.id === 'lena').inventory.some((entry) => entry.id === 'treatment-ledger'));
  for (const mutate of [
    (map) => { map.infirmary.ledgerChestId = 'missing'; },
    (map) => { map.chests[0].rewardId = 'potion'; },
    (map) => { map.infirmary.patientsVulnerable = 'yes'; },
    (map) => { map.infirmary.patients[0].rescued = true; map.infirmary.patients[0].lost = true; },
  ]) {
    const invalid = structuredClone(patientRaw); mutate(invalid);
    assert.throws(() => levels.validateLevel(invalid), /Infirmary/);
  }
  const invalid = freshPatients(), patient = invalid.infirmary.patients[0];
  assert.throws(() => defense.validateInfirmaryState(invalid, [{ ...patient, id: 'undead', hp: 10 }], 'player', 1), /unresolved/);
});
