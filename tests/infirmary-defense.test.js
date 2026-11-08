import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';

let server, levels, characters, defense, inventory, combat, classes, progression, saves, grid, rawMap;
const previousImage = Object.getOwnPropertyDescriptor(globalThis, 'Image');

before(async () => {
  globalThis.Image = class { set src(value) { this.url = value; queueMicrotask(() => this.onload()); } };
  server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: 'custom' });
  levels = await server.ssrLoadModule('/src/levels/level.js');
  characters = await server.ssrLoadModule('/src/characters/characters.js');
  defense = await server.ssrLoadModule('/src/game/infirmary.js');
  inventory = await server.ssrLoadModule('/src/characters/inventory.js');
  combat = await server.ssrLoadModule('/src/battle/combat.js');
  classes = await server.ssrLoadModule('/src/characters/classes.js');
  progression = await server.ssrLoadModule('/src/characters/progression.js');
  saves = await server.ssrLoadModule('/src/game/save.js');
  grid = await server.ssrLoadModule('/src/battle/grid.js');
  rawMap = JSON.parse(await readFile(new URL('../data/levels/map_12_infirmary.json', import.meta.url), 'utf8'));
});

after(async () => {
  await server?.close();
  if (previousImage) Object.defineProperty(globalThis, 'Image', previousImage);
  else delete globalThis.Image;
});

const fresh = () => levels.validateLevel(structuredClone(rawMap));
const team = (level) => [characters.createRictorAlly(), characters.createLenaAlly(), characters.createArlanAlly()].map((unit) =>
  Object.assign(unit, level.players.find((entry) => entry.id === unit.id)));
const approach = (unit, target) => Object.assign(unit, { x: target.x, z: target.z, acted: false });
const noGrowth = () => 0.999;

test('Arlan anchors the defense with supplied Knight/General art and a cavalry-effective spear', () => {
  const arlan = characters.createArlanAlly();
  assert.equal(arlan.level, 11);
  assert.equal(arlan.type, 'armor');
  assert.equal(arlan.spriteSet, 'arlan');
  assert.equal(arlan.weapon.id, 'ridersbane');
  const rider = characters.createEnemyUnit('infirmary-rider', 1, 1);
  const damage = combat.getCombatDamage(arlan, rider, {});
  arlan.weapon = inventory.INVENTORY_ITEMS.get('iron-spear');
  assert.ok(damage > combat.getCombatDamage(arlan, rider, {}));
  const undead = characters.createEnemyUnit('undead', 1, 1, { level: 12 });
  assert.ok(combat.getCombatDamage(undead, arlan, {}) <= 6);
  classes.promoteUnit(arlan);
  assert.equal(arlan.spriteSet, 'generalArlan');
  assert.equal(arlan.type, 'armor');
  assert.equal(arlan.classId, 'general');
  assert.equal(characters.createEnemyUnit('rotten', 1, 1).weapon.maxRange, 2);
});

test('victory requires eight completed enemy phases, not turn eight or clearing the roster', () => {
  const level = fresh();
  assert.equal(defense.infirmaryVictoryReady(level), false);
  assert.throws(() => defense.claimInfirmaryCompletion(level, team(level)), /not complete/);
  for (let phase = 1; phase < 8; phase++) {
    assert.equal(defense.finishInfirmaryEnemyPhase(level), false);
    assert.equal(level.infirmary.survivedTurns, phase);
  }
  assert.equal(defense.finishInfirmaryEnemyPhase(level), true);
  assert.equal(defense.infirmaryVictoryReady(level), true);
  assert.equal(defense.finishInfirmaryEnemyPhase(level), false);
  assert.equal(level.infirmary.survivedTurns, 8);
  assert.equal(level.infirmary.ledger.collected, false);
  assert.ok(level.infirmary.patients.every((patient) => !patient.rescued));
});

test('an undefended door is pursued all the way onto its tile; a distant blocker is approached', () => {
  const level = fresh();
  const point = level.infirmary.defensePoint;
  const neighbor = grid.DIRECTIONS.map((delta) => ({ x: point.x + delta.x, z: point.z + delta.z }))
    .find((tile) => grid.isWalkable(level, tile.x, tile.z));
  const enemy = characters.createEnemyUnit('undead', neighbor.x, neighbor.z);
  assert.equal(defense.infirmaryApproachTarget(level, enemy, []).objectiveTarget, true);
  assert.equal(defense.infirmaryBreached(level, [enemy]), false);
  Object.assign(enemy, point);
  assert.equal(defense.infirmaryBreached(level, [enemy]), true);
  level.infirmary.breached = true;
  assert.equal(defense.finishInfirmaryEnemyPhase(level), false);
  assert.equal(defense.infirmaryVictoryReady(level), false);
  const arlan = Object.assign(characters.createArlanAlly(), point);
  Object.assign(enemy, neighbor);
  assert.equal(defense.infirmaryApproachTarget(level, enemy, [arlan]), arlan);
});

test('gates consume an action and a key, while Lena lockpicks; occupied barriers cannot be sealed', () => {
  const level = fresh();
  const [rictor, lena, arlan] = team(level);
  const [west, east] = level.infirmary.gates;
  approach(lena, west);
  const occupant = Object.assign(arlan, west.blocks[0]);
  assert.throws(() => defense.performInfirmaryAction(level, lena, west.id, [lena, occupant]), /Clear the gate/);
  assert.equal(west.closed, false);
  const action = defense.performInfirmaryAction(level, lena, west.id, [lena]);
  assert.equal(action.exp, 45);
  assert.equal(lena.acted, true);
  assert.equal(west.closed, true);
  assert.equal(grid.isWalkable(level, west.blocks[0].x, west.blocks[0].z), false);
  lena.acted = false;
  assert.throws(() => defense.performInfirmaryAction(level, lena, west.id, [lena]), /no longer available/);
  approach(rictor, east);
  assert.throws(() => defense.performInfirmaryAction(level, rictor, east.id, [rictor]), /Chest Key/);
  rictor.inventory.push({ id: 'chest-key', uses: 1 });
  defense.performInfirmaryAction(level, rictor, east.id, [rictor]);
  assert.equal(rictor.inventory.some((entry) => entry.id === 'chest-key'), false);
  assert.equal(east.closed, true);
});

test('ledger and patient objectives are one-time, adjacent, action-consuming rewards', () => {
  const level = fresh();
  const unit = characters.createRictorAlly();
  for (const target of [level.infirmary.ledger, ...level.infirmary.patients]) {
    approach(unit, target);
    const action = defense.performInfirmaryAction(level, unit, target.id, [unit]);
    assert.equal(action.exp, action.kind === 'ledger' ? 60 : 30);
    assert.equal(action.insight, action.kind === 'ledger' ? 5 : undefined);
    assert.equal(unit.acted, true);
    unit.acted = false;
    assert.throws(() => defense.performInfirmaryAction(level, unit, target.id, [unit]), /no longer available/);
  }
  assert.equal(level.infirmary.ledger.collected, true);
  assert.ok(level.infirmary.patients.every((patient) => patient.rescued));
});

test('sealed waves are cancelled; occupied entrances queue rather than teleporting', () => {
  const level = fresh();
  const gate = level.infirmary.gates[0];
  const wave = level.reinforcements.find((entry) => entry.entranceId === gate.entranceId);
  const placement = wave.units[0];
  assert.deepEqual(defense.infirmarySpawnTile(level, placement, []), { x: placement.x, z: placement.z });
  assert.equal(defense.infirmarySpawnTile(level, placement, [{ ...placement, hp: 1 }]), null);
  assert.match(defense.infirmaryWarning(level, wave.turn - 1), /WARNING/);
  assert.match(defense.infirmaryWarning(level, wave.turn), /QUEUED/);
  gate.closed = true;
  assert.equal(defense.infirmaryWaveSealed(level, wave), true);
  assert.equal(defense.infirmaryWaveSealed(level, { entranceId: 'carriage' }), false);
});

test('completion EXP is granted once, only to living deployed units; restart clears objectives', () => {
  const level = fresh();
  const units = team(level);
  units[2].hp = 0;
  level.infirmary.survivedTurns = 8;
  const rewards = defense.claimInfirmaryCompletion(level, units, noGrowth);
  assert.equal(rewards.length, 2);
  assert.ok(rewards.every((entry) => entry.progression.levelUps === 1));
  assert.equal(units[2].level, 11);
  assert.equal(defense.claimInfirmaryCompletion(level, units).length, 0);
  level.infirmary.gates[0].closed = true;
  level.infirmary.ledger.collected = true;
  level.infirmary.patients[0].rescued = true;
  const restarted = defense.freshInfirmary(level.infirmary);
  assert.equal(restarted.survivedTurns, 0);
  assert.equal(restarted.rewardsClaimed, false);
  assert.ok(restarted.gates.every((gate) => !gate.closed));
  assert.equal(restarted.ledger.collected, false);
  assert.ok(restarted.patients.every((patient) => !patient.rescued));
  assert.equal(level.infirmary.ledger.collected, true);
});

test('a split-objective route provides two to three levels without killing the Rotten', () => {
  const level = fresh();
  const units = team(level);
  // Rictor and Lena enter after gaining two levels in Chapter 11; Arlan is newly recruited.
  units[0].level += 2;
  units[1].level += 2;
  const starting = units.map((unit) => unit.level);
  const kills = [5, 3, 5];
  for (const [index, unit] of units.entries()) {
    for (let count = 0; count < kills[index]; count++) {
      const enemy = characters.createEnemyUnit('undead', 1, 1, { level: 12 });
      progression.awardExperience(unit, combat.getCombatExperience(enemy, true, unit), noGrowth);
    }
  }
  progression.awardExperience(units[0], 60, noGrowth);
  progression.awardExperience(units[1], 45 * 2 + 30, noGrowth);
  progression.awardExperience(units[2], 30, noGrowth);
  level.infirmary.survivedTurns = 8;
  defense.claimInfirmaryCompletion(level, units, noGrowth);
  for (const [index, unit] of units.entries()) {
    assert.ok(unit.level - starting[index] >= 2 && unit.level - starting[index] <= 3, `${unit.name}: ${unit.level - starting[index]} levels`);
  }
  const undeadCount = [...level.enemies, ...level.reinforcements.flatMap((wave) => wave.units)].filter((entry) => entry.id === 'undead').length;
  assert.ok(undeadCount >= kills.reduce((sum, count) => sum + count, 0));
  assert.equal(classes.getClass('oathkeeper').promotesTo, 'templar');
});

test('Arlan and defense progress round-trip through saves, including optional-boss survival', (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const storage = new Map();
  globalThis.localStorage = { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else delete globalThis.localStorage;
  });
  const level = fresh();
  const units = team(level);
  const maria = characters.createMaria();
  level.infirmary.survivedTurns = 7;
  level.infirmary.ledger.collected = true;
  level.infirmary.patients[0].rescued = true;
  level.infirmary.gates[0].closed = true;
  const save = saves.createSaveData(level, maria, [], { turn: 8, phase: 'player', defeated: false },
    { chapter: 11, playerReserve: true, allies: units });
  saves.writeSave(save);
  let restored = saves.readSave();
  assert.equal(restored.level.infirmary.survivedTurns, 7);
  assert.equal(restored.level.infirmary.gates[0].closed, true);
  assert.ok(restored.allies.some((unit) => unit.id === 'arlan'));
  level.infirmary.survivedTurns = 8;
  defense.claimInfirmaryCompletion(level, units, noGrowth);
  const point = level.enemies.find((entry) => entry.id === 'undead');
  const enemy = characters.createEnemyUnit('undead', point.x, point.z);
  // Optional surviving undead do not invalidate the completed defense.
  saves.writeSave(saves.createSaveData(level, maria, [enemy], { turn: 8, phase: 'victory', defeated: false },
    { chapter: 11, playerReserve: true, allies: units }));
  restored = saves.readSave();
  assert.equal(restored.phase, 'victory');
  assert.equal(restored.level.infirmary.rewardsClaimed, true);
  assert.equal(restored.enemies.length, 1);
  assert.throws(() => defense.validateInfirmaryState(level, [{ ...enemy, ...level.infirmary.defensePoint }], 'victory', 8), /invalid/);
  assert.throws(() => defense.validateInfirmaryState(level, [], 'player', 1), /invalid/);
});
