import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { readFile, readdir } from 'node:fs/promises';

let server, characters, inventory, combat, classes, staves, courtyard, stealing, grid, insight;
const previousImage = Object.getOwnPropertyDescriptor(globalThis, 'Image');
before(async () => {
  globalThis.Image = class { set src(value) { queueMicrotask(() => this.onload()); } };
  server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: 'custom' });
  [characters, inventory, combat, classes, staves, courtyard, stealing, grid, insight] = await Promise.all([
    '/src/characters/characters.js', '/src/characters/inventory.js', '/src/battle/combat.js',
    '/src/characters/classes.js', '/src/game/enemy-staves.js', '/src/game/courtyard.js',
    '/src/game/stealing.js', '/src/battle/grid.js', '/src/game/insight.js',
  ].map((path) => server.ssrLoadModule(path)));
});
after(async () => {
  await server?.close();
  if (previousImage) Object.defineProperty(globalThis, 'Image', previousImage);
  else delete globalThis.Image;
});
const rules = () => ({
  courtyard: {
    bossId: 'severin', recruit: { id: 'corvis', recruiterId: 'eveline', recruited: false, dead: false },
    triggers: [
      { id: 'courtyard-cavalry', thresholdZ: 15, warnedTurn: null },
      { id: 'courtyard-ravens', thresholdZ: 8, warnedTurn: null },
    ],
  },
  reinforcements: [
    { entranceId: 'courtyard-cavalry', turn: 999, spawned: false },
    { entranceId: 'courtyard-ravens', turn: 999, spawned: false },
  ],
});

test('courtyard priests use the generic pack and Severin has a complete separate General palette', async () => {
  const priest = characters.createEnemyUnit('church-freezer', 0, 0);
  const healer = characters.createEnemyUnit('church-healer', 0, 0);
  const severin = characters.createEnemyUnit('severin', 0, 0);
  assert.equal(priest.spriteSet, 'genericPriest');
  assert.equal(healer.spriteSet, 'genericPriest');
  assert.equal(severin.spriteSet, 'generalSeverin');
  const arlan = characters.createArlanAlly();
  classes.promoteUnit(arlan);
  assert.equal(arlan.spriteSet, 'generalArlan');
  for (const direction of ['north', 'north-east', 'east', 'south-east', 'south',
    'south-west', 'west', 'north-west']) {
    await readFile(new URL(`../assets/character/Generic_Priest/rotations/${direction}.png`, import.meta.url));
    assert.ok((await readdir(new URL(`../assets/character/Generic_Priest/animations/Walking/${direction}/`, import.meta.url))).length);
    if (direction !== 'north-west') {
      assert.ok((await readdir(new URL(`../assets/character/Generic_Priest/animations/Healing/${direction}/`, import.meta.url))).length);
    }
  }
  const original = new URL('../assets/character/General_Arlan/', import.meta.url);
  const variant = new URL('../assets/character/General_Severin/', import.meta.url);
  const files = (await readdir(original, { recursive: true })).filter((path) => path.endsWith('.png'));
  assert.deepEqual((await readdir(variant, { recursive: true })).filter((path) => path.endsWith('.png')).sort(),
    files.sort());
  for (const path of files) {
    const [source, recolor] = await Promise.all([
      readFile(new URL(path.replaceAll('\\', '/'), original)),
      readFile(new URL(path.replaceAll('\\', '/'), variant)),
    ]);
    assert.deepEqual(recolor.subarray(16, 24), source.subarray(16, 24), 'PNG dimensions remain unchanged');
  }
  assert.notDeepEqual(await readFile(new URL(severin.sprite, new URL('../', import.meta.url))),
    await readFile(new URL(arlan.sprite, new URL('../', import.meta.url))));
});

test('Corvis has Flux, recruits only through Eveline, and promotes using his supplied Dark Sage art', () => {
  const corvis = characters.createCorvisAlly();
  const level = rules();
  const eveline = { ...characters.createEvelineAlly(), x: 1, z: 0 };
  assert.equal(corvis.weapon.id, 'dark-tome');
  assert.equal(corvis.weapon.type, 'Dark');
  assert.equal(courtyard.canRecruitCorvis(level, eveline, corvis), true);
  assert.equal(courtyard.canRecruitCorvis(level, { ...eveline, id: 'rictor' }, corvis), false);
  assert.equal(courtyard.canRecruitCorvis(level, { ...eveline, acted: true }, corvis), false);
  corvis.hp = 13;
  corvis.inventory[0].uses = 9;
  courtyard.recruitCorvis(level, eveline, corvis);
  assert.equal(corvis.hp, 13);
  assert.equal(corvis.inventory[0].uses, 9);
  assert.equal(eveline.acted, true);
  assert.equal(courtyard.canRecruitCorvis(level, eveline, corvis), false);
  classes.promoteUnit(corvis);
  assert.equal(corvis.classId, 'dark-sage');
  assert.equal(corvis.spriteSet, 'darkSageCorvis');
  assert.ok(classes.canEquipWeapon(corvis, inventory.INVENTORY_ITEMS.get('heal-staff')));
});

test('Luna halves Resistance and Nosferatu heals half actual damage on attacks and counters', () => {
  inventory.setUnlockedSpells(['luna', 'nosferatu']);
  const caster = characters.createCorvisAlly();
  caster.weaponExp.Dark = 120;
  caster.weapon = inventory.INVENTORY_ITEMS.get('luna');
  caster.inventory[0].spells = { luna: 8, nosferatu: 4 };
  const target = { ...characters.createEnemyUnit('ward-knight', 1, 0), resistance: 11, hp: 43 };
  assert.equal(combat.getCombatDamage(caster, target), caster.magic + 8 - 5);
  caster.weapon = inventory.INVENTORY_ITEMS.get('nosferatu');
  caster.speed = 99;
  assert.equal(combat.getCombatDamage(caster, target), caster.magic + 12 - 11);
  assert.equal(combat.getAttackCount(caster, target), 2);
  assert.equal(caster.weapon.hit, 75);
  caster.hp = 1;
  assert.equal(combat.healDamageDealt(caster, 9), 4);
  assert.equal(caster.hp, 5);
  assert.equal(combat.healDamageDealt(caster, 0), 0);
  caster.hp = caster.maxHp - 1;
  assert.equal(combat.healDamageDealt(caster, 20), 1);
  caster.hp = 0;
  assert.equal(combat.healDamageDealt(caster, 20), 0);
  assert.equal(combat.isInWeaponRange(caster, target, 1), true);
  assert.equal(combat.isInWeaponRange(caster, target, 2), true);
  assert.equal(combat.isInWeaponRange(caster, target, 3), false);
  inventory.setUnlockedSpells([]);
});

test('attack choices put the equipped weapon first and choosing another persists the new equipment', () => {
  const troy = characters.createTroyAlly();
  const originalOrder = troy.inventory.map(({ id }) => id);
  assert.equal(inventory.attackWeapons(troy)[0].id, troy.weapon.id);
  inventory.equipAttackWeapon(troy, inventory.INVENTORY_ITEMS.get('javelin'));
  assert.equal(troy.weapon.id, 'javelin');
  assert.equal(inventory.attackWeapons(troy)[0].id, 'javelin');
  assert.deepEqual(troy.inventory.map(({ id }) => id), originalOrder, 'picker sorting does not rearrange inventory');
  const saved = troy.inventory.map(inventory.copyEntry);
  inventory.restoreMariaInventory(troy, saved, troy.weapon.id);
  assert.equal(troy.weapon.id, 'javelin');
  inventory.setUnlockedSpells(['luna']);
  const corvis = characters.createCorvisAlly();
  corvis.inventory[0].spells = { luna: 8 };
  inventory.equipAttackWeapon(corvis, inventory.INVENTORY_ITEMS.get('luna'));
  assert.equal(inventory.attackWeapons(corvis)[0].id, 'luna');
  corvis.inventory[0].spells.luna = 0;
  assert.throws(() => inventory.equipAttackWeapon(corvis, inventory.INVENTORY_ITEMS.get('luna')), /No uses/);
  assert.throws(() => inventory.equipAttackWeapon(troy, inventory.INVENTORY_ITEMS.get('heal-staff')));
  inventory.setUnlockedSpells([]);
});

test('dark tome spell progression uses the shared 6 then 12 Insight unlocks', () => {
  insight.restoreInsight({ insight: 18 });
  assert.equal(insight.nextSpellId('dark-tome'), 'luna');
  assert.equal(insight.nextSpellCost('dark-tome'), 6);
  assert.equal(insight.unlockSpell('dark-tome'), true);
  assert.equal(insight.nextSpellId('dark-tome'), 'nosferatu');
  assert.equal(insight.nextSpellCost('dark-tome'), 12);
  assert.equal(insight.unlockSpell('dark-tome'), true);
  assert.equal(insight.getInsight(), 0);
  insight.restoreInsight(null);
});

test('Dark Sage doubles every dark spell and staff capacity without refilling spent uses', () => {
  insight.restoreInsight({ spells: { 'dark-tome': 2, 'heal-staff': 2, 'freeze-staff': 2 } });
  const unit = characters.createCorvisAlly();
  unit.inventory.push(...inventory.createInventory(['heal-staff', 'freeze-staff']));
  inventory.refreshMagicUses(unit.inventory, unit);
  unit.inventory[0].uses -= 3;
  unit.inventory[0].spells.nosferatu = 1;
  const previous = classes.getUsesMultiplier(unit);
  classes.promoteUnit(unit);
  inventory.rescaleMagicUses(unit, previous);
  assert.equal(classes.getUsesMultiplier(unit), 2);
  for (const entry of unit.inventory) {
    const item = inventory.INVENTORY_ITEMS.get(entry.id);
    assert.equal(entry.uses, item.maxUses * 2 - (entry.id === 'dark-tome' ? 3 : 0));
    for (const spell of inventory.unlockedSpellsOf(entry.id)) {
      assert.equal(inventory.maxUsesFor(spell, unit), spell.maxUses * 2);
    }
  }
  assert.equal(unit.inventory[0].spells.nosferatu, 5, 'promotion adds capacity without erasing spending');
  inventory.refreshMagicUses(unit.inventory, unit);
  assert.equal(unit.inventory[0].spells.nosferatu, 8);
  insight.restoreInsight(null);
});

test('legacy Eclipse saves keep their unlock tier, equipped spell and remaining uses as Nosferatu', async () => {
  const saves = await server.ssrLoadModule('/src/game/save.js');
  const old = JSON.parse(await readFile(new URL('../saves/chapter16-level20.json', import.meta.url), 'utf8'));
  const corvis = old.allies.find(({ id }) => id === 'corvis');
  corvis.inventory[0].spells = { luna: 3, eclipse: 2 };
  corvis.equippedWeaponId = 'eclipse';
  old.insight.spells = { 'dark-tome': 2 };
  old.chapterStart.allies.find(({ id }) => id === 'corvis').inventory[0].spells = { eclipse: 1 };
  old.convoy.push({ id: 'dark-tome', uses: 5, spells: { eclipse: 0 } });
  const restored = saves.parseSave(JSON.stringify(old));
  const current = restored.allies.find(({ id }) => id === 'corvis');
  assert.equal(current.equippedWeaponId, 'nosferatu');
  assert.deepEqual(current.inventory[0].spells, { luna: 3, nosferatu: 2 });
  assert.equal(restored.chapterStart.allies.find(({ id }) => id === 'corvis').inventory[0].spells.nosferatu, 1);
  assert.equal(restored.convoy.at(-1).spells.nosferatu, 0);
  insight.restoreInsight(restored.insight);
  assert.ok(insight.unlockedSpellIds().includes('nosferatu'));
  insight.restoreInsight(null);
});
test('Freeze priest chooses closest unfrozen unit, spends a use on misses and roots without consuming actions', () => {
  const priest = characters.createEnemyUnit('church-freezer', 5, 5);
  const far = { ...characters.createTroyAlly(), x: 5, z: 8 };
  const near = { ...characters.createLenaAlly(), x: 5, z: 6, resistance: 0 };
  let action = staves.chooseEnemyStaffAction(priest, [priest], [far, near]);
  assert.equal(action.target, near);
  const result = staves.useEnemyStaff(priest, action, 4, () => 0);
  assert.equal(result.hit, true);
  assert.equal(near.frozen, 5);
  assert.equal(near.acted, false);
  assert.deepEqual([...grid.getMovementRange(near, {}, []).keys()], ['5,6']);
  assert.equal(priest.inventory[0].uses, 4);
  action = staves.chooseEnemyStaffAction(priest, [priest], [near, far]);
  assert.equal(action.target, far);
  staves.useEnemyStaff(priest, action, 4, () => 0.99);
  assert.equal(far.frozen, false);
  assert.equal(priest.inventory[0].uses, 3);
});

test('Heal priest targets lowest current HP within range, not the lowest ratio or a distant unit', () => {
  const priest = characters.createEnemyUnit('church-healer', 5, 5);
  const low = { ...characters.createEnemyUnit('ward-knight', 4, 5), hp: 12, maxHp: 20 };
  const ratio = { ...characters.createEnemyUnit('severin', 5, 4), hp: 20, maxHp: 100 };
  const distant = { ...low, x: 0, hp: 1 };
  const action = staves.chooseEnemyStaffAction(priest, [priest, ratio, low, distant], []);
  assert.equal(action.target, low);
  assert.equal(staves.useEnemyStaff(priest, action, 1).healed, 8);
  assert.equal(low.hp, low.maxHp);
  assert.equal(priest.inventory[0].uses, 9);
  priest.inventory[0].uses = 0;
  assert.equal(staves.chooseEnemyStaffAction(priest, [ratio], []), null);
});

test('Lena steals the actual partially spent staff; overflow preserves uses and disables enemy casting', () => {
  inventory.setConvoy([]);
  const priest = characters.createEnemyUnit('church-freezer', 5, 5);
  priest.inventory[0].uses = 2;
  const lena = { ...characters.createLenaAlly(), x: 5, z: 6 };
  const receipt = stealing.stealItem(lena, priest, 'freeze-staff');
  const entry = receipt.toConvoy ? inventory.convoy.at(-1) : lena.inventory.at(-1);
  assert.equal(entry.uses, 2);
  assert.deepEqual(priest.inventory, []);
  assert.equal(priest.weapon, null);
  assert.equal(staves.chooseEnemyStaffAction(priest, [], [lena]), null);
  lena.acted = false;
  assert.equal(stealing.canSteal(lena, priest, 'freeze-staff'), false);
  const healer = characters.createEnemyUnit('church-healer', 5, 5);
  healer.inventory[0].uses = 3;
  lena.inventory = Array.from({ length: 5 }, () => ({ id: 'potion', uses: 3 }));
  assert.equal(stealing.stealItem(lena, healer, 'heal-staff').toConvoy, true);
  assert.equal(inventory.convoy.at(-1).uses, 3);
});

test('progress warnings schedule each finite wave once for the following player turn, and restart resets triggers', () => {
  const level = rules();
  assert.equal(courtyard.courtyardWaveEnabled(level, level.reinforcements[0]), false);
  assert.deepEqual(courtyard.triggerCourtyardWaves(level, [{ hp: 10, z: 16 }], 1000), []);
  assert.equal(courtyard.courtyardWaveEnabled(level, level.reinforcements[0]), false);
  assert.deepEqual(courtyard.triggerCourtyardWaves(level, [{ hp: 10, z: 16 }], 3), []);
  assert.deepEqual(courtyard.triggerCourtyardWaves(level, [{ hp: 10, z: 15 }], 4), ['courtyard-cavalry']);
  assert.equal(courtyard.courtyardWaveEnabled(level, level.reinforcements[0]), true);
  assert.equal(courtyard.courtyardWaveEnabled(level, level.reinforcements[1]), false);
  assert.equal(level.reinforcements[0].turn, 5);
  assert.deepEqual(courtyard.triggerCourtyardWaves(level, [{ hp: 10, z: 8 }], 6), ['courtyard-ravens']);
  assert.equal(level.reinforcements[1].turn, 7);
  assert.deepEqual(courtyard.triggerCourtyardWaves(level, [{ hp: 10, z: 0 }], 8), []);
  assert.ok(courtyard.freshCourtyard(level.courtyard).triggers.every((entry) => entry.warnedTurn === null));
  assert.equal(courtyard.courtyardVictoryReady(level, [{ id: 'severin', hp: 1 }], { hp: 10 }), false);
  assert.equal(courtyard.courtyardVictoryReady(level, [{ id: 'raven', hp: 10 }], { hp: 10 }), true);
  const fastAdvance = rules();
  assert.deepEqual(courtyard.triggerCourtyardWaves(fastAdvance, [{ hp: 10, z: 7 }], 3), ['courtyard-cavalry']);
  assert.deepEqual(courtyard.triggerCourtyardWaves(fastAdvance, [{ hp: 10, z: 7 }], 4), ['courtyard-ravens']);
});

test('courtyard saves retain enemy staff uses, player Freeze and Corvis outcomes and reject inconsistent progress', async (t) => {
  const levels = await server.ssrLoadModule('/src/levels/level.js');
  const saves = await server.ssrLoadModule('/src/game/save.js');
  const level = levels.validateLevel(JSON.parse(await readFile(new URL('../data/levels/map_14_courtyard.json', import.meta.url), 'utf8')));
  const factories = { rictor: characters.createRictorAlly, lena: characters.createLenaAlly,
    arlan: characters.createArlanAlly, troy: characters.createTroyAlly };
  const allies = level.players.map((placement) => Object.assign(factories[placement.id](), placement));
  const enemies = level.enemies.map((placement) => characters.createEnemyUnit(placement.id, placement.x, placement.z, placement));
  const freezer = enemies.find((enemy) => enemy.id === 'church-freezer');
  freezer.inventory[0].uses = 2;
  allies[0].frozen = 1;
  const data = saves.createSaveData(level, characters.createMaria(), enemies,
    { turn: 1, phase: 'player', defeated: false }, { chapter: 13, playerReserve: true, allies });
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  globalThis.localStorage = { getItem: () => JSON.stringify(data) };
  t.after(() => {
    if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage);
    else delete globalThis.localStorage;
  });
  const restored = saves.readSave();
  assert.equal(restored.allies[0].frozen, 1);
  assert.equal(restored.enemies.find((enemy) => enemy.id === 'church-freezer').inventory[0].uses, 2);
  const worn = data.enemies.find((enemy) => enemy.id === 'church-freezer');
  worn.inventory = [];
  assert.deepEqual(saves.readSave().enemies.find((enemy) => enemy.id === 'church-freezer').inventory, []);
  worn.inventory = [{ id: 'freeze-staff', uses: 999 }];
  assert.throws(() => saves.readSave(), /enemy state/);
  worn.inventory = [];
  const corvisEnemy = data.enemies.find((enemy) => enemy.id === 'corvis');
  data.enemies = data.enemies.filter((enemy) => enemy !== corvisEnemy);
  assert.throws(() => saves.readSave(), /recruitment state/);
  data.level.courtyard.recruit.dead = true;
  assert.equal(saves.readSave().level.courtyard.recruit.dead, true);
  data.level.courtyard.recruit.dead = false;
  data.level.courtyard.recruit.recruited = true;
  const corvis = Object.assign(characters.createCorvisAlly(), { x: corvisEnemy.x, z: corvisEnemy.z, hp: 13 });
  corvis.inventory[0].uses = 7;
  data.allies.push(saves.serializeUnit(corvis));
  assert.equal(saves.readSave().allies.find((ally) => ally.id === 'corvis').stats.hp, 13);
  assert.equal(saves.readSave().allies.find((ally) => ally.id === 'corvis').inventory[0].uses, 7);
  data.level.courtyard.triggers[0].warnedTurn = 1;
  data.level.reinforcements[0].turn = 2;
  assert.equal(saves.readSave().level.reinforcements[0].turn, 2);
  data.level.courtyard.triggers[0].warnedTurn = null;
  assert.equal(saves.readSave().level.courtyard.triggers[0].warnedTurn, 1,
    'a scheduled next-turn arrival recovers its missing warning');
  data.level.reinforcements[0].turn = 3;
  assert.throws(() => saves.readSave(), /reinforcement timing/, 'unexplained future schedules remain invalid');
  data.level.reinforcements[0].turn = 2;
  data.level.courtyard.triggers[0].warnedTurn = 1;
  data.level.reinforcements[0].spawnedCount = 1;
  assert.throws(() => saves.readSave(), /reinforcement timing/);
  data.level.reinforcements[0].spawnedCount = 0;
  data.level.courtyard.triggers[0].warnedTurn = null;
  const storage = new Map([['blood-emblem-save', JSON.stringify(data)]]);
  globalThis.localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  };
  saves.copyCurrentSaveToSlot(2);
  const slot = JSON.parse(storage.get('blood-emblem-save-slot-2'));
  assert.equal(slot.level.courtyard.triggers[0].warnedTurn, 1, 'new slots store validated warning state');
  slot.level.courtyard.triggers[0].warnedTurn = null;
  storage.set('blood-emblem-save-slot-2', JSON.stringify(slot));
  saves.loadSlotIntoCurrentSave(2);
  assert.equal(JSON.parse(storage.get('blood-emblem-save')).level.courtyard.triggers[0].warnedTurn, 1,
    'loading an older slot persists recovery in autosave');
  assert.equal(saves.readSave().allies.find((ally) => ally.id === 'corvis').inventory[0].uses, 7);
  const beforeInvalidLoad = storage.get('blood-emblem-save');
  slot.level.reinforcements[0].turn = 100;
  storage.set('blood-emblem-save-slot-2', JSON.stringify(slot));
  assert.throws(() => saves.loadSlotIntoCurrentSave(2), /reinforcement timing/);
  assert.equal(storage.get('blood-emblem-save'), beforeInvalidLoad, 'invalid loads preserve current progress');
});
