import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createServer } from 'vite';

let server;
let levels;
let characters;
let gate;
let grid;
let saves;
let combat;
let inventory;
let tutorials;
let rawMap;
const previousImage = Object.getOwnPropertyDescriptor(globalThis, 'Image');

before(async () => {
  globalThis.Image = class {
    set src(value) { this.url = value; queueMicrotask(() => this.onload()); }
  };
  server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: 'custom' });
  levels = await server.ssrLoadModule('/src/levels/level.js');
  characters = await server.ssrLoadModule('/src/characters/characters.js');
  gate = await server.ssrLoadModule('/src/game/gate-encounter.js');
  grid = await server.ssrLoadModule('/src/battle/grid.js');
  saves = await server.ssrLoadModule('/src/game/save.js');
  combat = await server.ssrLoadModule('/src/battle/combat.js');
  inventory = await server.ssrLoadModule('/src/characters/inventory.js');
  tutorials = await server.ssrLoadModule('/src/game/tutorial.js');
  rawMap = JSON.parse(await readFile(new URL('../data/levels/map_10_golden_threshold.json', import.meta.url), 'utf8'));
});

after(async () => {
  await server?.close();
  if (previousImage) Object.defineProperty(globalThis, 'Image', previousImage);
  else delete globalThis.Image;
});

const fresh = () => levels.validateLevel(structuredClone(rawMap));
const defenders = (level) => level.enemies.map((unit) => characters.createEnemyUnit(unit.id, unit.x, unit.z, unit));

test('every chapter has a registered opening, including the Golden Threshold lore card', async () => {
  assert.equal(tutorials.CHAPTER_INTROS.length, levels.CHAPTER_COUNT);
  for (const [chapter, id] of tutorials.CHAPTER_INTROS.entries()) {
    const data = JSON.parse(await readFile(new URL(`../data/tutorials/chapter-${chapter + 1}.json`, import.meta.url), 'utf8'));
    assert.ok(data[id]?.pages.length, `Chapter ${chapter + 1} opening`);
  }
  assert.equal(tutorials.CHAPTER_INTROS[9], 'goldenBridge');
});

test('Chapter 10 story popup displays both pages even with tutorials disabled', async () => {
  const previousDocument = globalThis.document;
  const enabled = tutorials.tutorialsEnabled();
  const elements = new Map();
  const shown = [];
  let onClose;
  const element = () => ({ textContent: '', hidden: false, replaceChildren() {}, addEventListener() {}, focus() {} });
  const dialog = {
    querySelector(id) {
      if (!elements.has(id)) elements.set(id, element());
      return elements.get(id);
    },
    classList: { toggle() {} },
    addEventListener(event, listener) { if (event === 'close') onClose = listener; },
    showModal() {
      shown.push(elements.get('#tutorial-title').textContent);
      queueMicrotask(() => onClose());
    },
  };
  globalThis.document = { createElement: element };
  try {
    tutorials.setTutorialsEnabled(false);
    const popup = tutorials.createTutorialPopup(dialog);
    await popup.show(tutorials.CHAPTER_INTROS[9], {}, { force: true });
    assert.deepEqual(shown, ['The Golden Threshold', 'Break the Golden Line']);
  } finally {
    tutorials.setTutorialsEnabled(enabled);
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});

test('all thirteen chapters validate, including legacy lighting and objectives', async () => {
  const files = await readdir(new URL('../data/levels/', import.meta.url));
  assert.equal(levels.CHAPTER_COUNT, 19);
  for (const file of files.filter((name) => name.endsWith('.json'))) {
    const raw = JSON.parse(await readFile(new URL(`../data/levels/${file}`, import.meta.url), 'utf8'));
    const validated = levels.validateLevel(raw);
    assert.ok(validated, file);
    assert.deepEqual(levels.validateLevel(validated), validated, `${file} can restart from its validated map`);
    assert.deepEqual(levels.validateLevel(JSON.parse(JSON.stringify(validated))), validated, `${file} can reload its saved map`);
  }
  const level = fresh();
  assert.equal(level.lighting, 'dusk');
  assert.equal(level.objective, 'seize-gate');
  assert.equal(level.width, 19);
  assert.equal(level.height, 36);
  assert.equal(level.enemies.length, 20);
  assert.ok(level.enemies.every((enemy) => enemy.ai === 'guard'));
  assert.equal(level.enemies.find((unit) => unit.id === 'golden-captain').drop, 'master-emblem');
});

test('the Quarantine Ward is a guarded Rictor and Lena escape with locked cells of undead', async () => {
  const raw = JSON.parse(await readFile(new URL('../data/levels/map_11_ward.json', import.meta.url), 'utf8'));
  const ward = levels.validateLevel(raw);
  assert.equal(ward.objective, 'escape');
  assert.equal(ward.leader, 'rictor');
  assert.deepEqual(ward.requiredUnits, ['rictor', 'lena']);
  assert.ok(ward.enemies.every((enemy) => enemy.ai === 'guard'));
  assert.ok(ward.enemies.some((enemy) => enemy.id === 'ward-warden'));
  assert.ok(ward.cells.some((cell) => cell.prisoners.length));
  const jailerReward = inventory.INVENTORY_ITEMS.get(ward.chests.find((chest) => chest.id === 'chest-ward-key').rewardId);
  assert.equal(jailerReward.id, 'pocketwatch');
  assert.equal(jailerReward.effect, 'strength-up');
  assert.equal(jailerReward.maxUses, 1);
  assert.ok(!ward.chests.some((chest) => chest.rewardId === 'chest-key'));
  const tiles = await server.ssrLoadModule('/src/levels/tiles.js');
  const cell = ward.cells[0];
  assert.equal(tiles.isLevelTileWalkable(ward, cell.door.x, cell.door.z), false);
  cell.opened = true;
  assert.equal(tiles.isLevelTileWalkable(ward, cell.door.x, cell.door.z), true);
  const undead = characters.createEnemyUnit('undead', 1, 1, {});
  assert.equal(undead.type, 'undead');
  const lena = characters.createLenaAlly();
  assert.equal(lena.party, 'rictor');
  assert.equal(characters.createRictorAlly().inventory[0].id, 'vigil-lance');
  assert.ok(lena.speed > characters.createEnemyUnit('ward-soldier', 1, 1, {}).speed);
});

test('sandbags block movement but leave a connected alternating route up the bridge', () => {
  const level = fresh();
  const path = grid.findPath(level.spawn, [{ x: level.exit.x, z: level.exit.z + 1 }], new Set(), level);
  assert.ok(path.length > 32);
  for (const [z, from, to, gap] of [[27, 5, 10, 12], [21, 8, 13, 6], [15, 5, 10, 12], [9, 8, 13, 6]]) {
    for (let x = from; x <= to; x++) assert.equal(grid.isWalkable(level, x, z), false);
    assert.equal(grid.isWalkable(level, gap, z), true);
    assert.ok(path.some((tile) => tile.z === z && (gap === 12 ? tile.x >= 11 : tile.x <= 7)));
  }
  assert.ok(path.every((tile) => grid.isWalkable(level, tile.x, tile.z)));
});

test('mages use their own assets and Fire behind every sandbag line', () => {
  const level = fresh();
  const mages = defenders(level).filter((unit) => unit.id === 'golden-mage');
  assert.equal(mages.length, 4);
  assert.equal(mages.filter((mage) => mage.weapon.id === 'blaze').length, 1);
  for (const mage of mages) {
    assert.equal(mage.spriteSet, 'genericMage');
    assert.equal(mage.weapon.damageType, 'magical');
    assert.equal(inventory.bookOf(mage.weapon), 'fire-tome');
    assert.equal(mage.weapon.minRange, 1);
    assert.equal(mage.weapon.maxRange, 2);
    assert.equal(level.tileIds[mage.z + 1][mage.x], 'bridge_sandbags');
    assert.equal(grid.findPath(mage, [{ x: mage.x, z: mage.z + 2 }], new Set(), level).length > 3, true);
  }
});

const firingPositions = (level, enemy, roster, target, party) => {
  const reach = grid.getMovementRange(enemy, level, [...party, target], roster.filter((unit) => unit !== enemy));
  return [...reach.keys()].filter((key) => {
    const [x, z] = key.split(',').map(Number);
    return combat.isInWeaponRange(enemy, target, grid.distanceBetween(x, z, target.x, target.z));
  });
};

test('new bridge infantry use generic assets and do not threaten the starting party tiles', () => {
  const level = fresh();
  const roster = defenders(level);
  const additions = roster.filter((unit) => ['golden-soldier', 'golden-archer'].includes(unit.id));
  assert.equal(additions.length, 6);
  const party = level.players.map((placement) => ({ ...characters.createMaria(), ...placement }));
  for (const enemy of additions) {
    assert.equal(enemy.ai, 'guard');
    assert.equal(enemy.spriteSet, enemy.id === 'golden-soldier' ? 'genericSoldier' : 'genericArcher');
    assert.equal(grid.isWalkable(level, enemy.x, enemy.z, enemy), true);
    assert.ok(enemy.hp < characters.createEnemyUnit('golden-knight', 0, 0).hp);
    for (const unit of party) {
      assert.equal(firingPositions(level, enemy, roster, unit, party).length, 0,
        `${enemy.id} at ${enemy.x},${enemy.z} should not reach the starting ${unit.id}`);
    }
    if (enemy.id === 'golden-archer') {
      assert.equal(enemy.weapon.minRange, 2);
      assert.equal(enemy.weapon.maxRange, 2);
    }
  }
  assert.equal(additions.find((unit) => unit.id === 'golden-soldier' && unit.z === 28).weapon.id, 'javelin');
});

test('four bridge approaches expose the same tile to two guards with distinct firing positions', () => {
  const level = fresh();
  const roster = defenders(level);
  const party = level.players.map((placement) => ({ ...characters.createMaria(), ...placement }));
  const formations = [
    { tile: { x: 12, z: 28 }, guards: [[11, 28], [12, 25]] },
    { tile: { x: 6, z: 22 }, guards: [[7, 22], [6, 19]] },
    { tile: { x: 12, z: 16 }, guards: [[11, 16], [12, 14]] },
    { tile: { x: 7, z: 9 }, guards: [[10, 7], [11, 8]] },
  ];
  for (const { tile, guards } of formations) {
    assert.equal(grid.isWalkable(level, tile.x, tile.z), true, `Approach tile ${tile.x},${tile.z}`);
    assert.ok(!roster.some((unit) => unit.x === tile.x && unit.z === tile.z));
    const target = { ...characters.createMaria(), ...tile };
    const positions = guards.map(([x, z]) => {
      const enemy = roster.find((unit) => unit.x === x && unit.z === z);
      assert.ok(enemy, `Missing formation guard at ${x},${z}`);
      const origins = firingPositions(level, enemy, roster, target, party);
      assert.ok(origins.length > 0, `${enemy.id} at ${x},${z} cannot cover ${tile.x},${tile.z}`);
      return origins;
    });
    assert.ok(positions[0].some((first) => positions[1].some((second) => first !== second)),
      `Both guards need different attack positions to cover ${tile.x},${tile.z}`);
  }
});

test('the gate is reserved until the captain falls, then the beast spawns only once', () => {
  const level = fresh();
  const enemies = defenders(level);
  assert.equal(grid.isWalkable(level, level.exit.x, level.exit.z), false);
  assert.equal(gate.shouldSpawnGateBeast(level, enemies), false);
  const remaining = enemies.filter((unit) => unit.id !== level.gateEncounter.captainId);
  assert.equal(gate.shouldSpawnGateBeast(level, remaining), true);
  level.gateEncounter.spawned = true;
  assert.equal(grid.isWalkable(level, level.exit.x, level.exit.z), true);
  assert.equal(gate.shouldSpawnGateBeast(level, remaining), false);
});

test('Blood Beast is stationary, powerful, beast-typed and threatens range one and two', () => {
  const beast = characters.createEnemyUnit('blood-beast', 9, 3);
  const captain = characters.createEnemyUnit('golden-captain', 9, 6);
  assert.equal(beast.ai, 'stationary');
  assert.equal(beast.movement, 0);
  assert.equal(beast.type, 'beast');
  assert.equal(beast.spriteSet, 'bloodBeast');
  assert.equal(beast.isBoss, true);
  assert.ok(beast.maxHp > captain.maxHp * 1.8);
  assert.ok(beast.strength > captain.strength);
  assert.equal(beast.weapon.minRange, 1);
  assert.equal(beast.weapon.maxRange, 2);
  assert.match(beast.weapon.lore, /high cleric/);
});

test('only living Maria on the gate after both bosses fall can win; other guards may remain', () => {
  const level = fresh();
  const maria = { hp: 30, ...level.exit };
  const enemies = defenders(level);
  assert.equal(gate.gateVictoryReady(level, maria, []), false);
  level.gateEncounter.spawned = true;
  assert.equal(gate.gateVictoryReady(level, maria, enemies), false);
  const remaining = enemies.filter((unit) => !unit.isBoss);
  const beast = characters.createEnemyUnit('blood-beast', level.exit.x, level.exit.z);
  assert.equal(gate.gateVictoryReady(level, maria, [...remaining, beast]), false);
  assert.equal(gate.gateVictoryReady(level, maria, remaining), true);
  assert.equal(gate.gateVictoryReady(level, { ...maria, hp: 0 }, remaining), false);
  assert.equal(gate.gateVictoryReady(level, { ...maria, z: maria.z + 1 }, remaining), false);
});

test('malformed encounter data cannot remove the required captain or reserve an occupied tile', () => {
  for (const mutate of [
    (map) => { delete map.gateEncounter; },
    (map) => { map.gateEncounter.spawned = 'yes'; },
    (map) => { map.gateEncounter.x++; },
    (map) => { map.enemies = map.enemies.filter((unit) => unit.id !== 'golden-captain'); },
    (map) => { map.enemies.push({ id: 'blood-beast', x: 9, z: 3 }); },
    (map) => { map.players[0] = { id: 'maria', x: 9, z: 3 }; },
  ]) {
    const map = structuredClone(rawMap);
    mutate(map);
    assert.throws(() => levels.validateLevel(map), /gate|Gate/);
  }
});

test('saves round-trip before arrival, with a wounded beast and after its defeat', (t) => {
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const storage = new Map();
  globalThis.localStorage = { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
  t.after(() => {
    if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage);
    else delete globalThis.localStorage;
  });
  const level = fresh();
  const maria = Object.assign(characters.createMaria(), level.spawn, { moved: false, acted: false });
  let enemies = defenders(level);
  const state = { turn: 8, phase: 'player', defeated: false };
  const roundTrip = () => {
    saves.writeSave(saves.createSaveData(level, maria, enemies, state, { chapter: 9, insight: { insight: 20 } }));
    return saves.readSave();
  };
  assert.equal(roundTrip().level.gateEncounter.spawned, false);
  level.gateEncounter.spawned = true;
  enemies = enemies.filter((unit) => unit.id !== 'golden-captain');
  enemies.push(Object.assign(characters.createEnemyUnit('blood-beast', 9, 3), { hp: 57 }));
  let restored = roundTrip();
  assert.equal(restored.level.gateEncounter.spawned, true);
  assert.equal(restored.enemies.find((unit) => unit.id === 'blood-beast').hp, 57);
  assert.equal(gate.shouldSpawnGateBeast(restored.level, restored.enemies), false);
  enemies = enemies.filter((unit) => unit.id !== 'blood-beast');
  restored = roundTrip();
  assert.equal(restored.enemies.some((unit) => unit.id === 'blood-beast'), false);
  assert.equal(gate.shouldSpawnGateBeast(restored.level, restored.enemies), false);
  Object.assign(maria, level.exit);
  state.phase = 'victory';
  assert.equal(roundTrip().phase, 'victory');
});

test('saved encounter state rejects duplicate, misplaced, premature and moving beasts', () => {
  const level = fresh();
  const enemies = defenders(level);
  const beast = characters.createEnemyUnit('blood-beast', 9, 3);
  assert.throws(() => gate.validateGateEncounterState(level, [], 'player'), /invalid/);
  assert.throws(() => gate.validateGateEncounterState(level, [...enemies, beast], 'player'), /invalid/);
  level.gateEncounter.spawned = true;
  const guards = enemies.filter((unit) => !unit.isBoss);
  assert.throws(() => gate.validateGateEncounterState(level, [...guards, beast, beast], 'player'), /invalid/);
  assert.throws(() => gate.validateGateEncounterState(level, [...guards, { ...beast, z: 4 }], 'player'), /invalid/);
  assert.throws(() => gate.validateGateEncounterState(level, [...guards, { ...beast, ai: 'guard' }], 'player'), /invalid/);
  assert.throws(() => gate.validateGateEncounterState(level, [...guards, beast], 'victory', { hp: 30, x: 9, z: 3 }), /invalid/);
  assert.throws(() => gate.validateGateEncounterState(level, guards, 'victory', { hp: 30, x: 9, z: 4 }), /invalid/);
  assert.doesNotThrow(() => gate.validateGateEncounterState(level, [...guards, beast], 'player'));
});

test('ravens fly over water, sandbags and parapets while ground units cannot', () => {
  const level = fresh();
  const raven = characters.createEnemyUnit('raven', 1, 26);
  const knight = characters.createEnemyUnit('golden-knight', 5, 26);
  for (const [x, z] of [[1, 26], [4, 26], [5, 27]]) {
    assert.equal(grid.isWalkable(level, x, z, raven), true);
    assert.equal(grid.isWalkable(level, x, z, knight), false);
  }
  assert.equal(grid.isWalkable(level, -1, 26, raven), false);
  assert.equal(grid.isWalkable(level, 4, 1, raven), false);
  const range = grid.getMovementRange(raven, level, []);
  assert.ok(range.has('6,26'));
  const path = grid.findPath(raven, [{ x: 6, z: 26 }], new Set(), level);
  assert.equal(path.length, 6);
  assert.equal(grid.terrainMoveCost(level, 5, 27, raven), 1);
  const blocked = new Set(['2,26']);
  const detour = grid.findPath(raven, [{ x: 6, z: 26 }], blocked, level);
  assert.ok(detour.length > path.length);
  assert.ok(!detour.some((tile) => tile.x === 2 && tile.z === 26));
  assert.equal(raven.weapon.name, 'Raven Beak');
  assert.equal(raven.weapon.minRange, 1);
  assert.equal(raven.weapon.maxRange, 1);
  assert.ok(raven.speed > 20);
  assert.ok(raven.maxHp < 30 && raven.defense < 8);
});

test('every bow and Wind deals exactly triple effective might to flying units, not Fire', () => {
  const raven = characters.createEnemyUnit('raven', 1, 8);
  for (const weapon of inventory.INVENTORY_ITEMS.values()) {
    if (weapon.type !== 'Bow' && weapon.id !== 'wind-tome') continue;
    const attacker = { classId: weapon.type === 'Bow' ? 'archer' : 'mage', weapon };
    assert.equal(combat.isWeaponEffective(attacker, raven), true, weapon.id);
    assert.equal(combat.getEffectiveMight(attacker, raven), weapon.might * 3);
    assert.equal(combat.isWeaponEffective(attacker, characters.createEnemyUnit('golden-knight', 5, 8)), false);
  }
  assert.equal(combat.isWeaponEffective(characters.createEnemyUnit('golden-mage', 7, 8), raven), false);
});

test('Wind is the lightest, most accurate and weakest anima tome, and unlocks Gale then Tempest', async () => {
  const insight = await server.ssrLoadModule('/src/game/insight.js');
  const tome = (id) => inventory.INVENTORY_ITEMS.get(id);
  const wind = tome('wind-tome');
  assert.equal(wind.name, 'Wind');
  for (const id of ['fire-tome', 'thunder-tome', 'light-tome']) {
    assert.ok(wind.might < tome(id).might && wind.weight < tome(id).weight && wind.hit > tome(id).hit, id);
  }
  assert.equal(wind.minRange, 1);
  assert.deepEqual(inventory.spellsOf('wind-tome').map((spell) => spell.id), ['gale', 'tempest']);
  insight.restoreInsight({ insight: 6 });
  assert.equal(insight.unlockSpell('wind-tome'), true);
  assert.equal(inventory.isSpellUnlocked('gale'), true);
  assert.equal(tome('wind-tome').might, 3);
  insight.restoreInsight(null);
  assert.equal(inventory.isSpellUnlocked('gale'), false);
});

test("a tome's final use still deals damage when the use is spent after the forecast", () => {
  const cypher = characters.createCypherAlly();
  const entry = cypher.inventory.find((candidate) => candidate.id === cypher.weapon.id);
  entry.uses = 1;
  const target = characters.createEnemyUnit('golden-knight', 0, 0);
  const damage = combat.getCombatDamage(cypher, target);
  assert.ok(damage > 0);
  inventory.spendWeaponUse(cypher);
  assert.equal(entry.uses, 0);
  assert.equal(combat.canAttack(cypher), false);
});

test('the Blood Beast is a beast: Fire, bows and Ravagers are effective, and build never adds attack speed', () => {
  const beast = characters.createEnemyUnit('blood-beast', 0, 0);
  assert.equal(beast.type, 'beast');
  assert.equal(combat.attackSpeed(beast), beast.speed);
  assert.equal(combat.attackSpeed({ speed: 10, build: 3, weapon: { weight: 7 } }), 6);
  assert.equal(combat.attackSpeed({ speed: 10, build: 9, weapon: { weight: 7 } }), 10);
  assert.equal(combat.isWeaponEffective(characters.createCypherAlly(), beast), true);
  assert.equal(combat.isWeaponEffective(characters.createStarkAlly(), beast), true);
  assert.equal(combat.isWeaponEffective({ ...characters.createMaria(), classId: 'ravager' }, beast), true);
  const bartz = { ...characters.createBartzAlly(), speed: 20 };
  assert.equal(combat.getAttackCount(beast, bartz), 1);
});

test('raven waves are relative to the Beast encounter: four initially, two at +2, +4, +6 and no more', () => {
  const level = fresh();
  const encounter = level.gateEncounter;
  assert.deepEqual(gate.planGateRavens(level, 20, []), []);
  encounter.spawned = true;
  const units = [];
  for (const [turn, expected] of [[20, 4], [21, 0], [22, 2], [23, 0], [24, 2], [25, 0], [26, 2], [28, 0], [100, 0]]) {
    const placements = gate.planGateRavens(level, turn, units);
    assert.equal(placements.length, expected, `turn ${turn}`);
    if (!expected) continue;
    assert.equal(placements.filter((tile) => tile.x < 4).length, expected / 2);
    assert.equal(placements.filter((tile) => tile.x >= level.width - 4).length, expected / 2);
    for (const tile of placements) {
      assert.match(level.tileIds[tile.z][tile.x], /^water_/);
      assert.ok(!units.some((unit) => unit.x === tile.x && unit.z === tile.z));
      units.push(characters.createEnemyUnit('raven', tile.x, tile.z));
    }
    encounter.ravenStartTurn ??= turn;
    encounter.ravenWavesSpawned++;
  }
  assert.equal(units.length, 10);
  assert.equal(encounter.ravenWavesSpawned, 4);
});

test('wave state validates and waterborne raven saves restore without permitting ground enemies on water', (t) => {
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const storage = new Map();
  globalThis.localStorage = { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
  t.after(() => {
    if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage);
    else delete globalThis.localStorage;
  });
  const level = fresh();
  Object.assign(level.gateEncounter, { spawned: true, ravenStartTurn: 7, ravenWavesSpawned: 2 });
  const maria = Object.assign(characters.createMaria(), level.spawn, { moved: false, acted: false });
  const enemies = [
    characters.createEnemyUnit('blood-beast', 9, 3),
    characters.createEnemyUnit('raven', 1, 8),
    characters.createEnemyUnit('raven', 17, 8),
  ];
  saves.writeSave(saves.createSaveData(level, maria, enemies, { turn: 9, phase: 'player', defeated: false }, { chapter: 9 }));
  const restored = saves.readSave();
  assert.equal(restored.level.gateEncounter.ravenStartTurn, 7);
  assert.equal(restored.level.gateEncounter.ravenWavesSpawned, 2);
  assert.deepEqual(gate.planGateRavens(restored.level, 10, restored.enemies), []);
  assert.equal(gate.planGateRavens(restored.level, 11, restored.enemies).length, 2);
  const corrupted = JSON.parse(storage.get('blood-emblem-save'));
  corrupted.enemies[1].id = 'golden-knight';
  storage.set('blood-emblem-save', JSON.stringify(corrupted));
  assert.throws(() => saves.readSave(), /enemy state/);
  for (const mutation of [
    { ravenStartTurn: 0 }, { ravenWavesSpawned: 5 }, { ravenWavesSpawned: 1.5 },
    { ravenStartTurn: null, ravenWavesSpawned: 1 },
  ]) {
    const map = structuredClone(rawMap);
    Object.assign(map.gateEncounter, { spawned: true }, mutation);
    assert.throws(() => levels.validateLevel(map), /Gate encounter/);
  }
});
