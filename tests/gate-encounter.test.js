import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createServer } from 'vite';
import * as THREE from 'three';
import { runInNewContext } from 'node:vm';

let server;
let levels;
let characters;
let gate;
let grid;
let saves;
let combat;
let inventory;
let tutorials;
let staves;
let rawMap;
const previousImage = Object.getOwnPropertyDescriptor(globalThis, 'Image');

before(async () => {
  globalThis.Image = class {
    set src(value) { this.url = value; this.width = 1024; this.height = 1536; queueMicrotask(() => this.onload()); }
  };
  server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: 'custom' });
  levels = await server.ssrLoadModule('/src/levels/level.js');
  characters = await server.ssrLoadModule('/src/characters/characters.js');
  gate = await server.ssrLoadModule('/src/game/gate-encounter.js');
  grid = await server.ssrLoadModule('/src/battle/grid.js');
  saves = await server.ssrLoadModule('/src/game/save.js');
  combat = await server.ssrLoadModule('/src/battle/combat.js');
  inventory = await server.ssrLoadModule('/src/characters/inventory.js');
  staves = await server.ssrLoadModule('/src/game/enemy-staves.js');
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

test('Chapter 10 opens with one short objective and an ominous hint even with tutorials disabled', async () => {
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
    assert.deepEqual(shown, ['The Golden Threshold']);
    const script = JSON.parse(await readFile(new URL('../data/tutorials/chapter-10.json', import.meta.url), 'utf8'));
    const opening = script.goldenBridge.pages[0].paragraphs.join(' ');
    assert.ok(opening.split(/\s+/).length <= 45);
    assert.match(opening, /Defeat Captain Aurelan.*Maria.*gate/);
    assert.match(opening, /distant shriek.*beyond the gate/);
    assert.doesNotMatch(JSON.stringify(script), /turn \d|next turn|incoming|advances|reinforcements/i);
    assert.equal(script.bloodBeastArrival.pages.length, 1);
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
  assert.equal(level.width, 23);
  assert.equal(level.height, 36);
  assert.equal(level.enemies.length, 24);
  assert.ok(level.enemies.filter((enemy) => enemy.id !== 'raven').every((enemy) => enemy.ai === 'guard'));
  assert.equal(level.enemies.find((unit) => unit.id === 'golden-captain').drop, 'master-emblem');
});

test('bridge priests heal their adjacent formation and exactly one drops a usable Heal staff', () => {
  const level = fresh(), enemies = defenders(level);
  const priests = enemies.filter((unit) => unit.id === 'golden-priest');
  assert.equal(priests.length, 2);
  assert.deepEqual(priests.map((unit) => characters.enemyDropIds(unit)), [['heal-staff'], []]);
  for (const priest of priests) {
    assert.equal(priest.weapon.id, 'heal-staff');
    assert.equal(priest.isBoss, false);
    const neighbor = enemies.find((unit) => unit !== priest &&
      Math.abs(unit.x - priest.x) + Math.abs(unit.z - priest.z) === 1);
    assert.ok(neighbor);
    neighbor.hp -= 20;
    const entry = priest.inventory.find((item) => item.id === 'heal-staff');
    const uses = entry.uses;
    const action = staves.chooseEnemyStaffAction(priest, enemies, []);
    assert.equal(action.target, neighbor);
    assert.equal(staves.useEnemyStaff(priest, action, 1).healed, 20);
    assert.equal(neighbor.hp, neighbor.maxHp);
    assert.equal(entry.uses, uses - 1);
    assert.equal(staves.chooseEnemyStaffAction(priest, enemies, []), null);
    const squad = level.gateEncounter.pressure.squads.find((formation) =>
      formation.members.some((member) => member.x === priest.x && member.z === priest.z));
    assert.ok(['crossfire', 'gatewatch'].includes(squad.id));
    gate.activateBridgeSquads(level, enemies, [], 1, { attacked: priest });
    assert.equal(squad.active, true);
  }
  const recipient = characters.createSeymourAlly();
  for (const id of characters.enemyDropIds(priests[0])) inventory.grantItem(recipient, id);
  assert.ok(recipient.inventory.some((entry) => entry.id === 'heal-staff' && entry.uses > 0));
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
  assert.equal(jailerReward.effect, 'insight');
  assert.equal(jailerReward.insight, 10);
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
  assert.ok(path.length > 27);
  for (const [z, from, to, gap] of [[28, 7, 12, 14], [21, 10, 13, 8], [16, 7, 12, 14], [10, 11, 15, 8]]) {
    for (let x = from; x <= to; x++) assert.equal(grid.isWalkable(level, x, z), false);
    assert.equal(grid.isWalkable(level, gap, z), true);
    assert.ok(path.some((tile) => tile.z === z && (tile.x < from || tile.x > to)));
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
  assert.equal(additions.find((unit) => unit.id === 'golden-soldier' && unit.z === 26).weapon.id, 'javelin');
});

test('four bridge approaches expose the same tile to two guards with distinct firing positions', () => {
  const level = fresh();
  const roster = defenders(level);
  const party = level.players.map((placement) => ({ ...characters.createMaria(), ...placement }));
  const formations = [
    { tile: { x: 14, z: 29 }, guards: [[13, 26], [14, 27]] },
    { tile: { x: 8, z: 22 }, guards: [[9, 24], [8, 20]] },
    { tile: { x: 14, z: 17 }, guards: [[14, 18], [14, 15]] },
    { tile: { x: 9, z: 10 }, guards: [[9, 8], [12, 9]] },
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

test('the real gate reveal gives the Blood Beast a saved Covenant Emblem drop and awards it before notifications', async () => {
  const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  const source = main.slice(main.indexOf('async function collectEnemyDrop('), main.indexOf('// Only opposing units block movement'));
  const level = fresh(), recipient = characters.createMaria();
  const captain = defenders(level).find((unit) => unit.id === 'golden-captain');
  const events = [];
  const context = {
    activeLevel: level, enemies: [], gameState: { turn: 8 },
    shouldSpawnGateBeast: gate.shouldSpawnGateBeast, beginGateBeastPressure: gate.beginGateBeastPressure,
    createEnemy(x, z, id, options) {
      return { ...characters.createEnemyUnit(id, x, z, options), mesh: { visible: true } };
    },
    releaseWagonCargo: () => null, enemyDropIds: characters.enemyDropIds, grantItem: inventory.grantItem,
    gainInsight() {}, BOSS_INSIGHT: 5, getInsight: () => 5,
    saveCurrentGame() { events.push('saved'); },
    itemPopup: { async showInsight() { events.push('notification'); }, async show() { events.push('notification'); } },
    async revealGateBeast() {},
  };
  runInNewContext(`${source}\nglobalThis.collect = collectEnemyDrop;`, context);
  await context.collect(captain, recipient);
  const beast = context.enemies[0];
  assert.deepEqual(characters.enemyDropIds(beast), ['covenant-emblem']);
  const player = Object.assign(characters.createMaria(), level.spawn);
  const save = saves.createSaveData(level, player, [beast], { turn: 8, phase: 'player', defeated: false }, { chapter: 9 });
  assert.equal(saves.parseSave(JSON.stringify(save)).enemies[0].drop, 'covenant-emblem');
  context.enemies.length = 0;
  events.length = 0;
  await context.collect(beast, recipient);
  assert.equal(events[0], 'saved');
  assert.ok(recipient.inventory.some((entry) => entry.id === 'covenant-emblem' && entry.uses === 1));
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
    (map) => { map.enemies.push({ id: 'blood-beast', ...map.exit }); },
    (map) => { map.players[0] = { id: 'maria', ...map.exit }; },
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
  const initial = roundTrip();
  assert.equal(initial.level.gateEncounter.spawned, false);
  assert.deepEqual(initial.enemies.filter((unit) => unit.id === 'golden-priest').map((unit) => unit.drop),
    ['heal-staff', undefined]);
  level.gateEncounter.spawned = true;
  enemies = enemies.filter((unit) => unit.id !== 'golden-captain');
  enemies.push(Object.assign(characters.createEnemyUnit('blood-beast', level.exit.x, level.exit.z), { hp: 57 }));
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
  const beast = characters.createEnemyUnit('blood-beast', level.exit.x, level.exit.z);
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
  const raven = characters.createEnemyUnit('raven', 2, 25);
  const knight = characters.createEnemyUnit('golden-knight', 5, 26);
  for (const [x, z] of [[2, 25], [6, 26], [7, 28]]) {
    assert.equal(grid.isWalkable(level, x, z, raven), true);
    assert.equal(grid.isWalkable(level, x, z, knight), false);
  }
  assert.equal(grid.isWalkable(level, -1, 26, raven), false);
  assert.equal(grid.isWalkable(level, 4, 1, raven), false);
  const range = grid.getMovementRange(raven, level, []);
  assert.ok(range.has('7,25'));
  const path = grid.findPath(raven, [{ x: 7, z: 25 }], new Set(), level);
  assert.equal(path.length, 6);
  assert.equal(grid.terrainMoveCost(level, 7, 28, raven), 1);
  const blocked = new Set(['3,25']);
  const detour = grid.findPath(raven, [{ x: 7, z: 25 }], blocked, level);
  assert.ok(detour.length > path.length);
  assert.ok(!detour.some((tile) => tile.x === 3 && tile.z === 25));
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
    characters.createEnemyUnit('blood-beast', level.exit.x, level.exit.z),
    characters.createEnemyUnit('raven', 2, 8),
    characters.createEnemyUnit('raven', 20, 8),
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

test('HD gate uses the approved native art, no duplicate skyline/gate and four live engagement lines', async () => {
  const png = await readFile(new URL('../assets/maps/village/threshold.png', import.meta.url));
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [1024, 1536]);
  const level = fresh(), group = new THREE.Group();
  levels.buildLevel(THREE, group, level);
  assert.ok(group.getObjectByName('illustrated-threshold'));
  assert.equal(group.getObjectByName('victorian-city-backdrop'), undefined);
  assert.equal(group.userData.cityBackdrop, undefined);
  assert.equal(group.userData.bridgeSquadMarkers.length, 4);
  assert.equal(level.objects.length, 0);
  assert.equal(level.extendEdges, false);
  assert.deepEqual(level.villageScene.cursorBounds, [2, 5, 20, 33]);
  const units = [...level.players, ...level.enemies, level.exit];
  assert.equal(new Set(units.map((unit) => grid.tileKey(unit.x, unit.z))).size, units.length);
});

test('attacking one guard, including a miss, mobilizes its whole squad but not the next squad', () => {
  const level = fresh(), enemies = defenders(level);
  const attacked = enemies[0];
  const active = gate.activateBridgeSquads(level, enemies, [], 1, { attacked });
  assert.deepEqual(active.map((squad) => squad.id), ['vanguard']);
  assert.equal(enemies.filter((unit) => unit.id !== 'raven' && unit.ai === 'mobile').length, 5);
  assert.ok(enemies.filter((unit) => unit.id !== 'raven').slice(5).every((unit) => unit.ai === 'guard'));
  assert.deepEqual(gate.activateBridgeSquads(level, enemies, [], 1, { attacked }), []);
});

test('lines, individual attack reach and timed advances trigger only the relevant formations', () => {
  for (const [options, party] of [
    [{}, [{ hp: 1, z: 31 }]],
    [{ canEngage: (unit) => unit.x === 9 && unit.z === 30 }, []],
  ]) {
    const level = fresh(), enemies = defenders(level);
    assert.deepEqual(gate.activateBridgeSquads(level, enemies, party, 1, options).map((s) => s.id), ['vanguard']);
  }
  const level = fresh(), enemies = defenders(level);
  assert.deepEqual(gate.activateBridgeSquads(level, enemies, [], 3), []);
  for (const [turn, id] of [[4, 'vanguard'], [7, 'crossfire'], [10, 'counterguard'], [13, 'gatewatch']]) {
    assert.deepEqual(gate.activateBridgeSquads(level, enemies, [], turn).map((s) => s.id), [id]);
  }
  assert.ok(enemies.every((enemy) => enemy.ai === 'mobile'));
  assert.deepEqual(gate.activateBridgeSquads({ gateEncounter: null }, [], [], 99), []);
});

test('opening ravens cannot attack a starting ally on the first enemy phase', () => {
  const level = fresh(), enemies = defenders(level);
  const ravens = enemies.filter((unit) => unit.id === 'raven');
  assert.equal(ravens.length, 2);
  const party = level.players.map((placement) => ({ ...characters.createMaria(), ...placement }));
  for (const raven of ravens) for (const target of party) {
    assert.equal(firingPositions(level, raven, enemies, target, party).length, 0);
  }
  assert.deepEqual(level.reinforcements.map((wave) => [wave.turn, wave.units.length]), [[4, 2], [8, 2]]);
});

test('boss reveal cancels unarrived bridge pairs and postpones its flock if a pair just arrived', () => {
  for (const partial of [false, true]) {
    const level = fresh();
    Object.assign(level.reinforcements[0], { spawned: !partial, spawnedCount: partial ? 1 : 2 });
    level.gateEncounter.spawned = true;
    gate.beginGateBeastPressure(level, 4);
    assert.equal(level.gateEncounter.ravenStartTurn, 5);
    assert.deepEqual(gate.planGateRavens(level, 4, []), []);
    assert.equal(gate.planGateRavens(level, 5, []).length, 4);
    assert.ok(level.reinforcements.every((wave) => wave.spawned && wave.spawnedCount === wave.units.length));
  }
  const level = fresh();
  gate.beginGateBeastPressure(level, 2);
  assert.equal(level.gateEncounter.ravenStartTurn, null);
  const delayed = fresh();
  delayed.gateEncounter.spawned = true;
  delayed.gateEncounter.pressure.ravenArrivalTurn = 6;
  Object.assign(delayed.reinforcements[0], { spawned: true, spawnedCount: 2 });
  gate.beginGateBeastPressure(delayed, 6);
  assert.equal(delayed.gateEncounter.ravenStartTurn, 7, 'late queued birds also postpone the reveal flock');
});

test('squad activation and moved guards survive a real save round-trip without reactivating', () => {
  const level = fresh(), enemies = defenders(level);
  gate.activateBridgeSquads(level, enemies, [], 1, { attacked: enemies[0] });
  enemies[0].x = 8;
  const player = Object.assign(characters.createMaria(), level.spawn);
  const data = saves.createSaveData(level, player, enemies, { turn: 2, phase: 'player', defeated: false }, { chapter: 9 });
  const restored = saves.parseSave(JSON.stringify(data));
  assert.equal(restored.level.gateEncounter.pressure.squads[0].active, true);
  assert.equal(restored.enemies[0].ai, 'mobile');
  assert.equal(restored.enemies[0].x, 8);
  assert.deepEqual(gate.activateBridgeSquads(restored.level, restored.enemies, [], 2), []);
  for (const mutate of [
    (map) => { map.gateEncounter.pressure.squads[0].active = 'yes'; },
    (map) => { map.gateEncounter.pressure.squads[1].id = 'vanguard'; },
    (map) => { map.gateEncounter.pressure.squads[0].members[0].x = 0; },
    (map) => { map.gateEncounter.pressure.squads[0].turn = 1; },
    (map) => { map.gateEncounter.pressure.ravenArrivalTurn = -1; },
  ]) {
    const map = structuredClone(rawMap);
    mutate(map);
    assert.throws(() => levels.validateLevel(map), /Bridge pressure/);
  }
  const legacy = structuredClone(rawMap);
  delete legacy.gateEncounter.pressure;
  assert.equal(levels.validateLevel(legacy).gateEncounter.pressure, undefined);
});

test('real reinforcement spawner uses water entrances, queues occupied birds and never duplicates partial waves', async () => {
  const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  const source = main.slice(main.indexOf('function spawnTurnReinforcements()'), main.indexOf('\nasync function endPlayerPhase()'));
  const { infirmarySpawnTile } = await server.ssrLoadModule('/src/game/infirmary.js');
  const level = fresh(), blocker = { hp: 20, x: 20, z: 22 };
  const context = {
    activeLevel: level, enemies: [], gameState: { turn: 4 },
    defendingUnits: () => [blocker], tileKey: grid.tileKey, isWalkable: grid.isWalkable,
    enemyMovementType: characters.enemyMovementType, distanceBetween: grid.distanceBetween,
    infirmarySpawnTile, infirmaryWaveSealed: () => false,
    courtyardWaveEnabled: () => true, cathedralWaveEnabled: () => true,
    createEnemy: (x, z, id, placement) => characters.createEnemyUnit(id, x, z, placement),
    levelGroup: { userData: {} },
  };
  const spawn = runInNewContext(`${source}\nspawnTurnReinforcements`, context);
  const result = spawn();
  assert.equal(result.error, null);
  assert.equal(result.units.length, 1);
  assert.deepEqual([result.units[0].x, result.units[0].z], [2, 22]);
  assert.equal(level.reinforcements[0].spawnedCount, 1);
  assert.equal(level.gateEncounter.pressure.ravenArrivalTurn, 4);
  assert.equal(level.reinforcements[0].spawned, false);
  assert.equal(spawn().units.length, 0);
  context.gameState.turn = 5;
  blocker.hp = 0;
  assert.equal(spawn().units.length, 1);
  assert.equal(level.gateEncounter.pressure.ravenArrivalTurn, 5);
  assert.equal(level.reinforcements[0].spawned, true);
  assert.equal(spawn().units.length, 0);
  context.gameState.turn = 8;
  assert.equal(spawn().units.length, 2);
  context.gameState.turn = 100;
  assert.equal(spawn().units.length, 0);
  assert.equal(context.enemies.length, 4);
});

test('editor import/export preserves pressure metadata and accepts flying water placements but rejects grounded ones', async () => {
  const editor = await readFile(new URL('../src/map-editor.js', import.meta.url), 'utf8');
  const start = editor.indexOf('function readCoordinate(');
  const end = editor.indexOf('\nfunction setStatus(');
  assert.ok(start >= 0 && end > start);
  const tiles = await server.ssrLoadModule('/src/levels/tiles.js');
  const village = await server.ssrLoadModule('/src/levels/village-scene.js');
  const ships = await server.ssrLoadModule('/src/levels/ship-scene.js');
  const validate = runInNewContext(`${editor.slice(start, end)}\nvalidateMap`, {
    ATLAS_TILES: tiles.TILE_DEFS, SHIP_OBJECTS: new Set(), BLOCKING_OBJECTS: new Set(),
    validateVillageScene: village.validateVillageScene, validateShipScene: ships.validateShipScene,
    isLevelTileWalkable: tiles.isLevelTileWalkable, enemyMovementType: characters.enemyMovementType,
    shipTileset: { tileSize: 16 },
  });
  const imported = validate(structuredClone(rawMap));
  assert.deepEqual(imported.gateEncounter, rawMap.gateEncounter);
  assert.deepEqual(imported.reinforcements, rawMap.reinforcements);
  const invalid = structuredClone(rawMap);
  invalid.enemies.find((unit) => unit.id === 'raven').id = 'golden-knight';
  assert.throws(() => validate(invalid), /movement type/);
});
