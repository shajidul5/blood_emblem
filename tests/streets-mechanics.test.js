import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { createServer } from 'vite';

let server, characters, classes, inventory, combat, streets, stealing, saves, levels, rawMap;
const previousImage = Object.getOwnPropertyDescriptor(globalThis, 'Image');

before(async () => {
  globalThis.Image = class { set src(value) { queueMicrotask(() => this.onload()); } };
  server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: 'custom' });
  characters = await server.ssrLoadModule('/src/characters/characters.js');
  classes = await server.ssrLoadModule('/src/characters/classes.js');
  inventory = await server.ssrLoadModule('/src/characters/inventory.js');
  combat = await server.ssrLoadModule('/src/battle/combat.js');
  streets = await server.ssrLoadModule('/src/game/streets.js');
  stealing = await server.ssrLoadModule('/src/game/stealing.js');
  saves = await server.ssrLoadModule('/src/game/save.js');
  levels = await server.ssrLoadModule('/src/levels/level.js');
  rawMap = JSON.parse(await readFile(new URL('../data/levels/map_13_procession.json', import.meta.url), 'utf8'));
});

after(async () => {
  await server?.close();
  if (previousImage) Object.defineProperty(globalThis, 'Image', previousImage);
  else delete globalThis.Image;
});

test('Troy wields his three starting weapons and keeps supplied sword/lance art on promotion', () => {
  const troy = characters.createTroyAlly();
  assert.equal(troy.level, 13);
  assert.equal(troy.type, 'cavalry');
  assert.equal(troy.movement, 7);
  for (const id of ['steel-sword', 'steel-lance', 'javelin']) {
    assert.ok(troy.inventory.some((entry) => entry.id === id));
    assert.equal(inventory.weaponUseBlockReason(troy, inventory.INVENTORY_ITEMS.get(id)), undefined);
  }
  troy.weapon = inventory.INVENTORY_ITEMS.get('steel-sword');
  assert.equal(classes.weaponSpriteSet(troy), 'troySword');
  classes.promoteUnit(troy);
  assert.equal(troy.classId, 'paladin');
  assert.equal(troy.spriteSet, 'paladinTroy');
  assert.equal(classes.weaponSpriteSet(troy), 'paladinTroySword');
  troy.weapon = inventory.INVENTORY_ITEMS.get('steel-lance');
  assert.equal(classes.weaponSpriteSet(troy), 'paladinTroy');
});

test('Eveline is a mounted healer; Valkyrie gains magic without losing Staff access', () => {
  const healer = characters.createEvelineAlly();
  assert.equal(healer.classId, 'troubadour');
  assert.equal(healer.movement, 7);
  assert.equal(healer.weapon.id, 'heal-staff');
  assert.equal(inventory.weaponUseBlockReason(healer, healer.weapon), undefined);
  assert.equal(combat.canAttack(healer), false);
  classes.promoteUnit(healer);
  assert.equal(healer.classId, 'valkyrie');
  assert.equal(healer.spriteSet, 'valkyrieEveline');
  assert.equal(healer.movement, 8);
  assert.equal(healer.type, 'cavalry');
  assert.equal(inventory.weaponUseBlockReason(healer, healer.weapon), undefined);
  assert.equal(classes.getClass('valkyrie').weaponTypes.includes('Anima'), true);
});

test('rescue undead are dangerous without doubling or critically killing Eveline', () => {
  const healer = characters.createEvelineAlly();
  const attacker = characters.createEnemyUnit('street-undead', 0, 0);
  assert.equal(combat.getCombatDamage(attacker, healer), 8);
  assert.equal(combat.getAttackCount(attacker, healer), 1);
  assert.equal(combat.getCriticalRate(attacker, healer), 0);
});

test('only an adjacent living Rictor with an action can recruit the threatened healer', () => {
  const level = levels.validateLevel(structuredClone(rawMap));
  const healer = characters.createEvelineAlly();
  Object.assign(healer, level.streets.recruit, { hp: 7 });
  const rictor = characters.createRictorAlly();
  Object.assign(rictor, { x: healer.x - 1, z: healer.z, acted: false });
  assert.equal(streets.canRecruitEveline(level, rictor, healer), true);
  for (const changes of [{ id: 'troy' }, { acted: true }, { hp: 0 }, { x: healer.x - 2 }]) {
    assert.equal(streets.canRecruitEveline(level, { ...rictor, ...changes }, healer), false);
  }
  assert.equal(streets.canRecruitEveline(level, rictor, { ...healer, hp: 0 }), false);
  streets.recruitEveline(level, rictor, healer);
  assert.equal(rictor.acted, true);
  assert.equal(healer.hp, 7);
  assert.equal(healer.neutral, false);
  assert.throws(() => streets.recruitEveline(level, rictor, healer), /adjacent/);
  assert.equal(streets.canRecruitEveline(level, rictor, healer), false);
});

test('seizing requires living Rictor and defeated Veyr, not every enemy or recruited Eveline', () => {
  const level = levels.validateLevel(structuredClone(rawMap));
  const rictor = { id: 'rictor', hp: 30, ...level.streets.seizePoint };
  const boss = characters.createEnemyUnit('veyr', 13, 4);
  assert.equal(boss.ai, 'stationary');
  assert.equal(boss.classId, 'paladin');
  assert.equal(boss.weapon.id, 'silver-lance');
  assert.equal(streets.streetsVictoryReady(level, [boss], rictor), false);
  const undead = characters.createEnemyUnit('undead', 3, 4);
  assert.equal(streets.streetsVictoryReady(level, [undead], rictor), true);
  assert.equal(streets.streetsVictoryReady(level, [], { ...rictor, id: 'troy' }), false);
  assert.equal(streets.streetsVictoryReady(level, [], { ...rictor, hp: 0 }), false);
  assert.equal(streets.streetsVictoryReady(level, [], { ...rictor, x: rictor.x + 1 }), false);
});

test('rescue warns two turns ahead, releases only the northern patrol and schedules a finite last wave', () => {
  const level = levels.validateLevel(structuredClone(rawMap));
  const enemies = level.enemies.map((unit) => ({ ...unit, hp: 30 }));
  const pursuit = level.reinforcements.find((wave) => wave.entranceId === 'southern-pursuit');
  const officer = level.reinforcements.find((wave) => wave.entranceId === 'southern-officer');
  assert.equal(streets.streetWaveEnabled(level, pursuit), false);
  assert.deepEqual(streets.updateStreetPressure(level, 3, enemies), []);
  level.streets.recruit.recruited = true;
  assert.deepEqual(streets.updateStreetPressure(level, 4, enemies), ['streetPursuitWarning']);
  assert.equal(pursuit.turn, 6);
  assert.equal(officer.turn, 9);
  assert.equal(streets.streetWaveEnabled(level, pursuit), true);
  assert.deepEqual(streets.updateStreetPressure(level, 4, enemies), []);
  assert.deepEqual(streets.updateStreetPressure(level, 5, enemies), ['streetRaiderWarning']);
  assert.match(streets.streetWarning(level, 5), /Southern cavalry: turn 6/);
  assert.match(streets.streetWarning(level, 5), /Northern patrol advances: turn 6/);
  assert.deepEqual(streets.updateStreetPressure(level, 6, enemies), ['streetPatrolAdvance']);
  const advancing = enemies.filter((unit, index) => unit.ai !== level.enemies[index].ai);
  assert.equal(advancing.length, 2);
  assert.deepEqual(advancing.map(({ id }) => id), ['ward-soldier', 'golden-archer']);
  assert.equal(enemies.find((unit) => unit.id === 'veyr').ai, 'stationary');
  assert.ok(enemies.filter((unit) => unit.id === 'ward-knight').every((unit) => unit.ai === 'guard'));
  assert.deepEqual(streets.updateStreetPressure(level, 7, enemies), ['streetOfficerWarning']);
  assert.match(streets.streetWarning(level, 7), /Southern mounted officer: turn 9/);
  assert.deepEqual(streets.updateStreetPressure(level, 99, enemies), []);
  assert.equal(level.reinforcements.length, 4);
  for (const wave of level.reinforcements) wave.spawned = true;
  assert.match(streets.streetWarning(level, 99), /All finite/);
});

test('fallback pursuit works without recruiting Eveline, including when she dies', () => {
  for (const dead of [false, true]) {
    const level = levels.validateLevel(structuredClone(rawMap));
    if (dead) Object.assign(level.streets.recruit, { dead: true, hp: 0 });
    assert.deepEqual(streets.updateStreetPressure(level, 5, []), ['streetRaiderWarning']);
    assert.deepEqual(streets.updateStreetPressure(level, 7, []), []);
    assert.deepEqual(streets.updateStreetPressure(level, 8, []), ['streetPursuitWarning']);
    assert.deepEqual(level.reinforcements.slice(1, 3).map((wave) => wave.turn), [10, 13]);
    level.streets.recruit.recruited = !dead;
    assert.deepEqual(streets.updateStreetPressure(level, 9, []), []);
    assert.deepEqual(level.reinforcements.slice(1, 3).map((wave) => wave.turn), [10, 13]);
  }
});

test('pursuit state and partial arrivals survive validation; restart clears them; old saves remain unchanged', () => {
  const level = levels.validateLevel(structuredClone(rawMap));
  level.streets.recruit.recruited = true;
  streets.updateStreetPressure(level, 4, []);
  streets.updateStreetPressure(level, 7, []);
  level.reinforcements[1].spawnedCount = 1;
  const restored = levels.validateLevel(JSON.parse(JSON.stringify(level)));
  assert.deepEqual(restored.streets.pressure, level.streets.pressure);
  assert.equal(restored.reinforcements[1].spawnedCount, 1);
  assert.deepEqual(streets.updateStreetPressure(restored, 7, []), []);
  const reset = streets.freshStreets(restored.streets);
  assert.equal(reset.pressure.triggeredTurn, null);
  assert.equal(reset.pressure.officerWarned, false);
  assert.equal(reset.pressure.patrolReleased, false);
  assert.equal(reset.raiders.warned, false);
  assert.notEqual(reset.pressure.patrol, restored.streets.pressure.patrol);
  const legacy = JSON.parse(JSON.stringify(rawMap));
  delete legacy.streets.pressure;
  delete legacy.streets.raiders;
  legacy.reinforcements = legacy.reinforcements.slice(0, 1);
  const old = levels.validateLevel(legacy);
  assert.deepEqual(streets.updateStreetPressure(old, 99, []), []);
  assert.equal(streets.streetWaveEnabled(old, old.reinforcements[0]), true);
  assert.equal(old.reinforcements.length, 1);
});

test('malformed pressure schedules and patrol identities cannot enter a save', () => {
  for (const mutate of [
    (map) => { map.streets.pressure.fallbackTurn = 0; },
    (map) => { map.streets.pressure.triggeredTurn = '4'; },
    (map) => { map.streets.pressure.officerWarned = true; },
    (map) => { map.streets.pressure.patrol[0].id = 'veyr'; },
    (map) => { map.streets.pressure.patrol[0].x = 0; },
    (map) => { map.reinforcements.pop(); },
    (map) => { map.reinforcements[1].turn = 4; },
    (map) => { map.reinforcements[1].spawnedCount = 1; },
    (map) => { map.reinforcements[1].units[0].z = 25; },
  ]) {
    const map = structuredClone(rawMap);
    mutate(map);
    assert.throws(() => levels.validateLevel(map), /Street/);
  }
});

test('live spawner queues exact entrances, restores partial cavalry/raiders and stops after both finite groups', async () => {
  const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  const source = main.slice(main.indexOf('function spawnTurnReinforcements()'), main.indexOf('\nasync function endPlayerPhase()'));
  const infirmary = await server.ssrLoadModule('/src/game/infirmary.js');
  const tiles = await server.ssrLoadModule('/src/levels/tiles.js');
  const level = levels.validateLevel(structuredClone(rawMap));
  level.reinforcements[0].spawned = true;
  level.reinforcements[0].spawnedCount = level.reinforcements[0].units.length;
  const defenders = [{ x: 12, z: 26, hp: 10 }, { x: 15, z: 26, hp: 10 }];
  const enemies = [];
  const state = { turn: 1000 };
  const context = {
    activeLevel: level, gameState: state, enemies, defendingUnits: () => defenders,
    enemyMovementType: characters.enemyMovementType,
    tileKey: (x, z) => `${x},${z}`,
    infirmaryWaveSealed: infirmary.infirmaryWaveSealed,
    streetWaveEnabled: streets.streetWaveEnabled,
    courtyardWaveEnabled: () => true, cathedralWaveEnabled: () => true,
    isWalkable: (map, x, z) => tiles.isLevelTileWalkable(map, x, z),
    infirmarySpawnTile: infirmary.infirmarySpawnTile,
    distanceBetween: (x, z, xx, zz) => Math.abs(x - xx) + Math.abs(z - zz),
    createEnemy: (x, z, id, placement) => characters.createEnemyUnit(id, x, z, placement),
    levelGroup: { userData: {} },
  };
  const spawn = runInNewContext(`${source}\nspawnTurnReinforcements`, context);
  assert.equal(spawn().units.length, 0, 'untriggered pursuit never spawns even past its placeholder turn');
  level.streets.recruit.recruited = true;
  streets.updateStreetPressure(level, 4, enemies);
  state.turn = 5;
  assert.equal(spawn().units.length, 0);
  state.turn = 6;
  streets.updateStreetPressure(level, state.turn, enemies);
  assert.equal(spawn().units.length, 0, 'occupied first entrance queues the wave');
  defenders.shift();
  const first = spawn();
  assert.equal(first.error, null);
  assert.equal(first.units.length, 1);
  assert.equal(first.units[0].x, 12);
  assert.equal(first.units[0].z, 26);
  assert.equal(level.reinforcements[1].spawnedCount, 1);
  assert.equal(level.reinforcements[1].spawned, false);
  context.activeLevel = levels.validateLevel(JSON.parse(JSON.stringify(level)));
  defenders.length = 0;
  const second = spawn();
  assert.equal(second.units.length, 1, 'restoring the partial wave cannot duplicate the first cavalry');
  assert.equal(second.units[0].x, 15);
  assert.equal(second.units[0].z, 26);
  assert.equal(spawn().units.length, 0);
  for (const enemy of enemies) enemy.z--;
  state.turn = 7;
  streets.updateStreetPressure(context.activeLevel, state.turn, enemies);
  defenders.push({ x: 3, z: 22, hp: 10 }, { x: 22, z: 22, hp: 10 });
  assert.equal(spawn().units.length, 0, 'raiders also queue instead of teleporting');
  defenders.shift();
  const firstRaider = spawn();
  assert.equal(firstRaider.units.length, 1);
  assert.equal(firstRaider.units[0].id, 'street-raider');
  assert.equal(firstRaider.units[0].x, 3);
  assert.equal(firstRaider.units[0].z, 22);
  context.activeLevel = levels.validateLevel(JSON.parse(JSON.stringify(context.activeLevel)));
  defenders.length = 0;
  const secondRaider = spawn();
  assert.equal(secondRaider.units.length, 1);
  assert.equal(secondRaider.units[0].x, 22);
  assert.equal(secondRaider.units[0].z, 22);
  assert.equal(spawn().units.length, 0);
  state.turn = 9;
  const final = spawn();
  assert.equal(final.units.length, 2);
  assert.ok(final.units.every((unit) => [12, 15].includes(unit.x) && unit.z === 26 && unit.ai === 'mobile'));
  assert.equal(enemies.length, 6);
  state.turn = 100;
  assert.equal(spawn().units.length, 0);
  assert.ok(context.activeLevel.reinforcements.every((wave) => wave.spawned && wave.spawnedCount === wave.units.length));
});

test('Ridersbane is effective against every southern pursuer and the officer uses a Steel Lance', () => {
  const level = levels.validateLevel(structuredClone(rawMap));
  const arlan = characters.createArlanAlly();
  for (const placement of level.reinforcements.slice(1, 3).flatMap((wave) => wave.units)) {
    const enemy = characters.createEnemyUnit(placement.id, placement.x, placement.z, placement);
    assert.equal(combat.isWeaponEffective(arlan, enemy), true);
    assert.equal(enemy.type, 'cavalry');
    assert.equal(enemy.weapon.id, 'steel-lance');
  }
});

test('raiders prefer real house routes over combat distractions and can be stopped by defenders', async () => {
  const grid = await server.ssrLoadModule('/src/battle/grid.js');
  const level = levels.validateLevel(structuredClone(rawMap));
  const raider = characters.createEnemyUnit('street-raider', 3, 22);
  const distraction = { id: 'troy', hp: 30, x: 4, z: 22 };
  assert.equal(raider.weapon.type, 'Axe');
  assert.equal(raider.weapon.id, 'steel-axe');
  assert.equal(raider.movement, 5);
  assert.equal(streets.streetRaiderTarget(level, raider, [distraction]).houseId, 'coachman');
  level.houses[0].visited = true;
  assert.equal(streets.streetRaiderTarget(level, raider, [distraction]).houseId, 'bellkeeper');
  level.houses[1].destroyed = true;
  assert.equal(streets.streetRaiderTarget(level, raider, []).houseId, 'apothecary');
  const defender = { id: 'arlan', hp: 30, ...level.houses[2].door };
  assert.equal(streets.streetRaiderTarget(level, raider, [defender]), defender, 'a defended last door is attacked, not destroyed remotely');
  assert.equal(streets.destroyStreetHouse(level, raider), null);
  const route = grid.findPath(raider, [defender], new Set([grid.tileKey(defender.x, defender.z)]), level);
  assert.deepEqual(route, []);
  level.houses[2].visited = true;
  assert.equal(streets.streetRaiderTarget(level, raider, []), null, 'no rewards left: ordinary mobile combat takes over');
  level.houses[2].visited = false;
  for (const changes of [{ hp: 0 }, { frozen: true }, { ai: 'stationary' }, { id: 'raider' }]) {
    assert.equal(streets.streetRaiderTarget(level, { ...raider, ...changes }, []), null);
    assert.equal(streets.destroyStreetHouse(level, { ...raider, ...changes, ...level.houses[2].door }), null);
  }
  const arlan = characters.createArlanAlly();
  arlan.weapon = inventory.INVENTORY_ITEMS.get('axereaver');
  assert.equal(combat.getTriangleAdvantage(arlan.weapon, raider.weapon), 2);
});

test('turn-five house warning is persistent, names turn seven and never plays cavalry hooves', async () => {
  const level = levels.validateLevel(structuredClone(rawMap));
  assert.deepEqual(streets.updateStreetPressure(level, 4, []), []);
  const events = streets.updateStreetPressure(level, 5, []);
  assert.deepEqual(events, ['streetRaiderWarning']);
  const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  const source = main.slice(main.indexOf('async function showStreetPressure('), main.indexOf('async function recruitCourtyardShaman()'));
  let saved = false, shown = false;
  const context = {
    activeLevel: level, renderTacticalUi() {}, saveCurrentGame() { saved = true; },
    playCityPursuitWarning() { throw new Error('raider warnings must not play mounted pursuit hooves'); },
    tutorialPopup: { show(id, values, options) {
      assert.equal(saved, true);
      assert.equal(id, 'streetRaiderWarning');
      assert.equal(values.arrival, 7);
      assert.equal(options.force, true);
      shown = true;
    } },
    events,
  };
  await runInNewContext(`${source}\nshowStreetPressure(events)`, context);
  assert.equal(shown, true);
  const restored = levels.validateLevel(JSON.parse(JSON.stringify(level)));
  assert.deepEqual(streets.updateStreetPressure(restored, 5, []), []);
  assert.equal(streets.streetWaveEnabled(restored, restored.reinforcements[3]), true);
  assert.match(streets.streetWarning(restored, 5), /House raiders.*turn 7/);
});

test('both raider routes provide a response phase and destroy only an intact house at the reached door', async () => {
  const grid = await server.ssrLoadModule('/src/battle/grid.js');
  const level = levels.validateLevel(structuredClone(rawMap));
  const raiders = level.reinforcements[3].units.map((unit) => characters.createEnemyUnit(unit.id, unit.x, unit.z, unit));
  const losses = [];
  for (let turn = 7; turn <= 11; turn++) {
    for (const raider of raiders) {
      const target = streets.streetRaiderTarget(level, raider, []);
      if (!target?.objectiveTarget) continue;
      const path = grid.findPath(raider, [target], new Set(), level);
      Object.assign(raider, path[Math.min(path.length - 1, raider.movement)]);
      const lost = streets.destroyStreetHouse(level, raider);
      if (lost) {
        losses.push({ turn, id: lost.id });
        assert.equal(streets.houseHasReward(lost), false);
        assert.equal(lost.visited, false);
        assert.equal(streets.destroyStreetHouse(level, raider), null, 'each entrance is destroyed only once');
        assert.equal(grid.isWalkable(level, lost.door.x, lost.door.z, raider), true);
      }
    }
  }
  assert.deepEqual(losses, [
    { turn: 7, id: 'coachman' }, { turn: 10, id: 'bellkeeper' }, { turn: 10, id: 'apothecary' },
  ]);
  assert.ok(level.houses.every((house) => house.destroyed));
  const safe = levels.validateLevel(structuredClone(rawMap));
  safe.houses[0].visited = true;
  assert.equal(streets.destroyStreetHouse(safe, { ...raiders[0], ...safe.houses[0].door }), null);
  assert.equal(safe.houses[0].destroyed, undefined, 'visiting first permanently secures its reward');
});

test('real Visit flow secures a Silver Lance once and cannot reward a raided house', async () => {
  const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  const visit = main.slice(main.indexOf('async function visitHouse()'), main.indexOf('// Nearest free walkable tile'));
  const available = main.slice(main.indexOf('function houseAvailableToVisit(unit)'), main.indexOf('async function openChest()'));
  inventory.setConvoy([]);
  for (const raided of [false, true]) {
    const level = levels.validateLevel(structuredClone(rawMap));
    const house = level.houses[2];
    if (raided) house.destroyed = true;
    const player = Object.assign(characters.createArlanAlly(), house.door, { acted: false, inventory: [] });
    const context = {
      activeLevel: level, player, gameState: { selected: true, phase: 'player' },
      houseHasReward: streets.houseHasReward, grantItem: inventory.grantItem,
      setMessage() {}, renderTacticalUi() {}, finishUnit() {},
      itemPopup: { show() {} }, tutorialPopup: { show() {} },
    };
    await runInNewContext(`${available}\n${visit}\nvisitHouse()`, context);
    assert.equal(player.inventory.filter((item) => item.id === 'silver-lance').length, raided ? 0 : 1);
    assert.equal(house.visited, !raided);
    player.acted = false;
    await runInNewContext('visitHouse()', context);
    assert.equal(player.inventory.length, raided ? 0 : 1, 'repeated visits never duplicate a reward');
  }
});

test('enemy-phase raiding integration spends the action on wrecking the reached door, without combat', async () => {
  const grid = await server.ssrLoadModule('/src/battle/grid.js');
  const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  const from = main.indexOf('    const bellPursuer = ');
  assert.notEqual(from, -1, 'find the live enemy targeting block');
  const to = main.indexOf('    const lostPatients =', from);
  assert.ok(from > 0 && to > from);
  const level = levels.validateLevel(structuredClone(rawMap));
  const raider = characters.createEnemyUnit('street-raider', 3, 22);
  raider.mesh = { position: { set() {} } };
  let pursuedFighter = false, rendered = false;
  const context = {
    activeLevel: level, enemy: raider, enemies: [raider], livingTeam: [], defendingUnits: () => [],
    streetRaiderTarget: streets.streetRaiderTarget, destroyStreetHouse: streets.destroyStreetHouse,
    courtyardPatrolBlockers: () => [],
    enemyAttackWeapons: combat.enemyAttackWeapons, bestEnemyWeapon: combat.bestEnemyWeapon,
    chooseEnemyTarget() { pursuedFighter = true; }, wait: async () => {}, clock: { elapsedTime: 0 },
    ...grid, setIdleSprite() {}, worldX: (x) => x, worldZ: (z) => z, unitSpriteHeightAt: () => 0,
    showCombatResult(_unit, text) { assert.equal(text, 'RAIDED'); },
    setMessage(text) { assert.match(text, /Coachman.*permanently lost/); },
    renderTacticalUi() { rendered = true; },
  };
  await runInNewContext(`(async () => { for (let i = 0; i < 1; i++) { ${main.slice(from, to)} throw new Error('raiding must consume the action'); } })()`, context);
  assert.equal(pursuedFighter, false);
  assert.equal(rendered, true);
  assert.equal(level.houses[0].destroyed, true);
  assert.equal(raider.x, 7);
  assert.equal(raider.z, 21);
});

test('single reavers reverse both sides with double modifiers; two reavers cancel', () => {
  const types = ['Sword', 'Spear', 'Axe'];
  const ordinary = (type) => ({ type, damageType: 'physical' });
  for (const id of ['lancereaver', 'axereaver']) {
    const reaver = inventory.INVENTORY_ITEMS.get(id);
    for (const type of types) {
      const opposing = ordinary(type);
      const normal = combat.getTriangleAdvantage(ordinary(reaver.type), opposing);
      const expected = normal ? normal * -2 : 0;
      assert.equal(combat.getTriangleAdvantage(reaver, opposing), expected);
      assert.equal(combat.getTriangleAdvantage(opposing, reaver), expected ? -expected : 0);
    }
    assert.equal(combat.getTriangleAdvantage(reaver, { type: 'Bow', damageType: 'physical' }), 0);
    assert.equal(combat.getTriangleAdvantage(reaver, { type: 'Anima', damageType: 'magical' }), 0);
  }
  const axe = inventory.INVENTORY_ITEMS.get('axereaver');
  const lance = inventory.INVENTORY_ITEMS.get('lancereaver');
  assert.equal(combat.getTriangleAdvantage(axe, lance), 1);
  assert.equal(combat.getTriangleAdvantage(lance, axe), -1);
});

test('reavers double damage/hit/avoid triangle bonuses, not total damage', () => {
  const weapon = { ...inventory.INVENTORY_ITEMS.get('axereaver'), hit: 50 };
  const unit = { strength: 10, dexterity: 0, speed: 5, build: 20, luck: 0, defense: 5, resistance: 0, weapon };
  const foe = { ...unit, weapon: { ...weapon, type: 'Axe', reaves: undefined } };
  assert.equal(combat.getCombatDamage(unit, foe), 15);
  assert.equal(combat.getAvoid(unit, {}, foe.weapon), 30);
  assert.equal(combat.getHitRate(unit, foe), 80);
  foe.weapon.type = 'Sword';
  assert.equal(combat.getCombatDamage(unit, foe), 11);
  assert.equal(combat.getAvoid(unit, {}, foe.weapon), -10);
  assert.equal(combat.getHitRate(unit, foe), 0);
});

test('Armorslayer and Troy lances use existing armor/cavalry effectiveness', () => {
  const troy = characters.createTroyAlly();
  troy.inventory.push({ id: 'armorslayer', uses: null });
  troy.weapon = inventory.INVENTORY_ITEMS.get('armorslayer');
  const arlan = characters.createArlanAlly();
  assert.equal(combat.isWeaponEffective(troy, arlan), true);
  assert.equal(combat.getEffectiveMight(troy, arlan), troy.weapon.might * 3);
  assert.equal(combat.isWeaponEffective(arlan, troy), true);
});

test('Lena steals carried rewards once, preserving independent death drops and overflow', () => {
  const lena = characters.createLenaAlly();
  Object.assign(lena, { x: 2, z: 2, acted: false, speed: 20 });
  const enemy = characters.createEnemyUnit('undead', 3, 2, { drop: 'potion', stealable: ['master-emblem'] });
  assert.equal(stealing.canSteal(lena, enemy, 'master-emblem'), true);
  assert.equal(stealing.canSteal({ ...lena, speed: enemy.speed }, enemy, 'master-emblem'), false);
  assert.equal(stealing.canSteal({ ...lena, id: 'rictor', classId: 'oathkeeper' }, enemy, 'master-emblem'), false);
  const count = lena.inventory.length;
  const receipt = stealing.stealItem(lena, enemy, 'master-emblem');
  assert.equal(receipt.item.name, 'Orders Emblem');
  assert.equal(lena.inventory.length, count + 1);
  assert.deepEqual(enemy.stealable, []);
  assert.equal(enemy.drop, 'potion');
  assert.equal(lena.acted, true);
  assert.throws(() => stealing.stealItem(lena, enemy, 'master-emblem'), /cannot steal/);
  lena.acted = false;
  lena.inventory = Array.from({ length: inventory.MAX_INVENTORY_SIZE }, () => ({ id: 'potion', uses: 1 }));
  const convoy = [];
  inventory.setConvoy(convoy);
  const overflow = stealing.stealItem(lena, enemy, 'potion');
  assert.equal(overflow.toConvoy, true);
  assert.equal(inventory.convoy[0].id, 'potion');
  assert.equal(enemy.drop, undefined);
});

test('street saves preserve neutral/recruited/lost Eveline, used Potion and steal-only inventory', (t) => {
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const storage = new Map();
  globalThis.localStorage = { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
  t.after(() => {
    if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage);
    else delete globalThis.localStorage;
  });
  const level = levels.validateLevel(structuredClone(rawMap));
  const units = [characters.createRictorAlly(), characters.createLenaAlly(), characters.createArlanAlly(), characters.createTroyAlly()];
  for (const unit of units) Object.assign(unit, level.players.find((entry) => entry.id === unit.id));
  const maria = characters.createMaria();
  const point = level.enemies.find((entry) => entry.stealable?.length);
  const enemy = characters.createEnemyUnit(point.id, point.x, point.z, point);
  const enemies = [enemy];
  level.streets.recruit.hp = 12;
  level.streets.recruit.inventory = [{ id: 'heal-staff', uses: 8 }, { id: 'potion', uses: 1 }];
  const write = (turn = 3) => saves.writeSave(saves.createSaveData(level, maria, enemies, { turn, phase: 'player', defeated: false },
    { chapter: 12, playerReserve: true, allies: units }));
  write();
  let restored = saves.readSave();
  assert.ok(restored, 'neutral state is valid');
  assert.equal(restored.level.streets.recruit.hp, 12);
  assert.equal(restored.level.streets.recruit.inventory[1].uses, 1);
  assert.deepEqual(restored.enemies[0].stealable, ['master-emblem']);
  enemy.stealable = [];
  level.streets.recruit.recruited = true;
  const healer = characters.createEvelineAlly();
  Object.assign(healer, level.streets.recruit, { id: 'eveline', hp: 12 });
  units.push(healer);
  write();
  restored = saves.readSave();
  assert.ok(restored, 'recruited state is valid');
  assert.equal(restored.allies.find((unit) => unit.id === 'eveline').stats.hp, 12);
  assert.deepEqual(restored.enemies[0].stealable, []);
  const patrol = level.streets.pressure.patrol[0];
  const patrolPlacement = level.enemies.find((unit) => unit.id === patrol.id && unit.x === patrol.x && unit.z === patrol.z);
  enemies.push(characters.createEnemyUnit(patrol.id, patrol.x, patrol.z, patrolPlacement));
  streets.updateStreetPressure(level, 3, enemies);
  streets.updateStreetPressure(level, 5, enemies);
  level.reinforcements[1].spawnedCount = 1;
  write(5);
  restored = saves.readSave();
  assert.equal(restored.level.streets.pressure.triggeredTurn, 3);
  assert.equal(restored.level.streets.pressure.patrolReleased, true);
  assert.deepEqual(restored.level.reinforcements.slice(1, 3).map((wave) => wave.turn), [5, 8]);
  assert.equal(restored.level.reinforcements[1].spawnedCount, 1);
  assert.equal(restored.enemies.find((unit) => unit.id === patrol.id).ai, 'mobile');
  units.pop();
  level.streets.recruit.recruited = false;
  level.streets.recruit.dead = true;
  level.streets.recruit.hp = 0;
  write(6);
  restored = saves.readSave();
  assert.ok(restored, 'lost state is valid and still playable');
  assert.equal(restored.level.streets.recruit.dead, true);
  streets.updateStreetPressure(level, 8, enemies);
  const raider = characters.createEnemyUnit('street-raider', level.houses[0].door.x, level.houses[0].door.z);
  assert.equal(streets.destroyStreetHouse(level, raider), level.houses[0]);
  enemies.push(raider);
  level.reinforcements[3].spawnedCount = 1;
  write(8);
  restored = saves.readSave();
  assert.equal(restored.level.houses[0].destroyed, true);
  assert.equal(streets.houseHasReward(restored.level.houses[0]), false);
  assert.equal(restored.level.streets.raiders.warned, true);
  assert.equal(restored.level.reinforcements[3].spawnedCount, 1);
  const savedRaider = restored.enemies.find((unit) => unit.id === 'street-raider');
  assert.equal(characters.createEnemyUnit(savedRaider.id, savedRaider.x, savedRaider.z, savedRaider).weapon.id, 'steel-axe');
  const reset = streets.freshStreets(restored.level.streets);
  assert.equal(reset.recruit.hp, 28);
  assert.equal(reset.recruit.dead, false);
  assert.equal(reset.recruit.recruited, false);
  assert.equal(reset.recruit.inventory, undefined);
  Object.assign(units[0], level.streets.seizePoint);
  const victory = saves.createSaveData(level, maria, enemies, { turn: 8, phase: 'victory', defeated: false },
    { chapter: 12, playerReserve: true, allies: units });
  saves.writeSave(victory);
  assert.equal(saves.readSave().phase, 'victory');
  for (const mutate of [
    (save) => { save.allies[0].stats.hp = 0; },
    (save) => { save.allies[0].x++; },
    (save) => { save.enemies.push({ ...save.enemies[0], id: 'veyr', x: 13, z: 4, hp: 44, maxHp: 44, level: 16, ai: 'stationary' }); },
    (save) => { save.level.streets.recruit.dead = false; },
    (save) => { save.level.streets.recruit.inventory[0].uses = -1; },
    (save) => { save.turn = 6; },
    (save) => { save.level.houses[0].visited = true; },
  ]) {
    const invalid = structuredClone(victory);
    mutate(invalid);
    saves.writeSave(invalid);
    assert.throws(() => saves.readSave());
  }
});
