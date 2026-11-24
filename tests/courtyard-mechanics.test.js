import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { readFile, readdir } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

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

test('reserve riders activate together on progress, damage, engagement or attack and reset independently', async () => {
  const raw = JSON.parse(await readFile(new URL('../data/levels/map_14_courtyard.json', import.meta.url), 'utf8'));
  const party = [{ hp: 20, z: 15 }];
  for (const reason of ['progress', 'damage', 'engagement', 'attack', 'casualty']) {
    const level = structuredClone(raw);
    const riders = level.enemies.filter((unit) => unit.id === 'golden-cavalier' && unit.ai === 'guard')
      .map((unit) => characters.createEnemyUnit(unit.id, unit.x, unit.z, unit));
    courtyard.activateCourtyardFormations(level, riders, party);
    assert.ok(riders.every((unit) => unit.ai === 'guard'));
    const options = {};
    if (reason === 'progress') party[0].z = 14;
    if (reason === 'damage') riders[0].hp--;
    if (reason === 'engagement') options.canEngage = (unit) => unit === riders[0];
    if (reason === 'attack') options.attacked = riders[0];
    if (reason === 'casualty') riders.shift();
    courtyard.activateCourtyardFormations(level, riders, party, options);
    assert.ok(riders.every((unit) => unit.ai === 'mobile'), reason);
    assert.equal(level.courtyard.tactics.formations[0].active, true);
    const reset = courtyard.freshCourtyard(level.courtyard);
    assert.equal(reset.tactics.formations[0].active, false);
    assert.equal(level.courtyard.tactics.formations[0].active, true);
    party[0].z = 15;
  }
  assert.doesNotThrow(() => courtyard.activateCourtyardFormations(rules(), [], party), 'legacy maps are unchanged');
});

test('live legacy guards stay court-bound while new Ravens pursue freely and the Envoy stays planted', async () => {
  const levels = await server.ssrLoadModule('/src/levels/level.js');
  const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  const terrain = await server.ssrLoadModule('/src/battle/terrain.js');
  const raw = JSON.parse(await readFile(new URL('../data/levels/map_14_courtyard.json', import.meta.url), 'utf8'));
  const current = levels.validateLevel(structuredClone(raw));
  delete raw.courtyard.tactics.ravenReinforcements;
  raw.reinforcements.length = 2;
  raw.reinforcements[1].units.forEach((unit) => { unit.ai = 'guard'; });
  const level = levels.validateLevel(raw);
  const enemies = level.reinforcements[1].units.map((unit) => characters.createEnemyUnit(unit.id, unit.x, unit.z, unit));
  const outside = Object.assign(characters.createRictorAlly(), { x: 17, z: 12 });
  const inside = Object.assign(characters.createTroyAlly(), { x: 20, z: 14 });
  const context = {
    activeLevel: level, enemies, defendingUnits: () => [outside],
    ...grid, courtyardDeliveryCourt: courtyard.courtyardDeliveryCourt,
    insideDeliveryCourt: courtyard.insideDeliveryCourt, courtyardPatrolBlockers: courtyard.courtyardPatrolBlockers,
    isInWeaponRange: combat.isInWeaponRange, getCombatDamage: combat.getCombatDamage,
    enemyAttackWeapons: combat.enemyAttackWeapons,
    protectedCombatDamage: (_unit, damage) => damage, getTerrain: terrain.getTerrain,
  };
  const source = main.slice(main.indexOf('function getEnemyReach(enemy)'), main.indexOf('// Thrones and similar tiles'));
  const live = runInNewContext(`${source}\n({getEnemyReach, getEnemyThreatTiles, chooseEnemyTarget})`, context);
  for (const enemy of enemies) {
    assert.equal(live.chooseEnemyTarget(enemy, [outside]), null);
    const court = courtyard.courtyardDeliveryCourt(level, enemy);
    const reach = live.getEnemyReach(enemy);
    for (const key of reach.keys()) {
      const [x, z] = key.split(',').map(Number);
      assert.equal(courtyard.insideDeliveryCourt(court, { x, z }), true);
    }
    assert.ok(live.getEnemyThreatTiles(enemy, reach).every((point) => courtyard.insideDeliveryCourt(court, point)));
  }
  const envoy = enemies[0];
  assert.equal(live.chooseEnemyTarget(envoy, [outside, inside]), inside);
  const blocked = new Set(courtyard.courtyardPatrolBlockers(level, envoy).map(({ x, z }) => grid.tileKey(x, z)));
  assert.deepEqual(grid.findPath(envoy, [{ x: 17, z: 12 }], blocked, level), []);
  const path = grid.findPath(envoy, [{ x: 20, z: 14 }], blocked, level);
  assert.ok(path.length > 1);
  assert.deepEqual({ ...path.at(-1) }, { x: 20, z: 14 });
  assert.ok(path.every((point) => courtyard.insideDeliveryCourt(level.courtyard.tactics.deliveryCourt, point)));
  context.activeLevel = current;
  enemies.splice(0, enemies.length, ...current.reinforcements[1].units.map((unit) =>
    characters.createEnemyUnit(unit.id, unit.x, unit.z, unit)));
  const [planted, raven] = enemies;
  assert.equal(live.getEnemyReach(planted).size, 1);
  assert.equal(live.chooseEnemyTarget(planted, [outside, inside]), null, 'Envoy cannot move to reach a target');
  inside.x = 20; inside.z = 13;
  assert.equal(live.chooseEnemyTarget(planted, [inside]), inside, 'stationary Envoy still attacks adjacent targets');
  assert.equal(live.chooseEnemyTarget(raven, [outside]), outside, 'Raven selects a target outside the court');
  assert.equal(courtyard.courtyardDeliveryCourt(current, raven), undefined);
  assert.deepEqual(courtyard.courtyardPatrolBlockers(current, raven), []);
  assert.ok([...live.getEnemyReach(raven).keys()].some((key) => key.startsWith('17,')));
  outside.x = 12; outside.z = 24;
  assert.equal(live.chooseEnemyTarget(raven, [outside]), outside, 'mobile Raven pursues even beyond attack range');
  for (const placement of current.enemies.filter((unit) => ['golden-mage', 'church-sage'].includes(unit.id))) {
    const caster = characters.createEnemyUnit(placement.id, placement.x, placement.z, placement);
    outside.x = 12; outside.z = 29;
    assert.equal(live.chooseEnemyTarget(caster, [outside]), null, 'guard caster does not chase a distant target');
    const nearby = { ...outside, x: caster.x, z: caster.z + 1 };
    assert.equal(live.chooseEnemyTarget(caster, [nearby]), nearby, 'guard caster engages an in-range target');
  }
  const boss = characters.createEnemyUnit('severin', 12, 5);
  boss.weapon = inventory.INVENTORY_ITEMS.get('silver-axe');
  enemies.push(boss);
  outside.x = 12; outside.z = 7;
  assert.equal(live.chooseEnemyTarget(boss, [outside]), outside, 'Spear remains a targeting option while axe is equipped');
  assert.ok(live.getEnemyThreatTiles(boss, live.getEnemyReach(boss)).some(({ x, z }) => x === 12 && z === 7),
    'threat overlay includes unequipped Spear range');
});

test('Severin drops Spear, opening mage drops Wind, Envoy awards 5 Insight and emblem, and legacy tags remain readable', async () => {
  const raw = JSON.parse(await readFile(new URL('../data/levels/map_14_courtyard.json', import.meta.url), 'utf8'));
  const placement = raw.enemies.find((unit) => unit.stealable?.includes('giants-marrow'));
  const sage = characters.createEnemyUnit(placement.id, placement.x, placement.z, { ...placement, chapter: 13 });
  const lena = Object.assign(characters.createLenaAlly(), { x: 8, z: 12, inventory: [] });
  const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  let total = 0, saved = 0, reads = 0;
  const savedRewards = [], insightNotices = [];
  const context = {
    activeLevel: raw, enemies: [], releaseWagonCargo: () => null, shouldSpawnGateBeast: () => false,
    enemyDropIds: characters.enemyDropIds, grantItem: inventory.grantItem,
    gainInsight: (amount) => { total += amount; }, BOSS_INSIGHT: 3, getInsight: () => total,
    saveCurrentGame: () => { saved++; savedRewards.push({ total, inventory: lena.inventory.map((item) => item.id) }); },
    itemPopup: { show: async () => {}, showInsight: async (name, amount) => {
      insightNotices.push([name, amount]);
      assert.equal(savedRewards.at(-1).total, total, 'Insight is persisted before showing the popup');
    }, showRead: async (item) => {
      assert.ok(saved);
      assert.match(item.lore, /receiving mark is still blank/);
      reads++;
    } },
    INVENTORY_ITEMS: inventory.INVENTORY_ITEMS, convoy: [], unit: lena,
  };
  const dropSource = main.slice(main.indexOf('async function collectEnemyDrop('), main.indexOf('// Only opposing units block movement'));
  const drop = runInNewContext(`${dropSource}\ncollectEnemyDrop`, context);
  const severin = raw.enemies.find((unit) => unit.id === 'severin');
  const defeatedBoss = characters.createEnemyUnit(severin.id, severin.x, severin.z, severin);
  defeatedBoss.weapon = inventory.INVENTORY_ITEMS.get('silver-axe');
  await drop(defeatedBoss, lena);
  assert.ok(lena.inventory.some((entry) => entry.id === 'spear'));
  assert.equal(characters.createEnemyUnit(severin.id, severin.x, severin.z, severin).weapon.id, severin.drop);
  assert.equal(total, 3);
  assert.deepEqual(characters.enemyDropIds(sage), []);
  assert.equal(stealing.canSteal(lena, sage, 'giants-marrow'), true);
  stealing.stealItem(lena, sage, 'giants-marrow');
  assert.ok(lena.inventory.some((entry) => entry.id === 'giants-marrow'));
  lena.acted = false;
  assert.equal(stealing.canSteal(lena, sage, 'giants-marrow'), false);
  lena.inventory = [];
  const envoy = raw.reinforcements[1].units[0];
  await drop(characters.createEnemyUnit(envoy.id, envoy.x, envoy.z, envoy), lena);
  assert.equal(total, 8, 'Envoy awards exactly 5 Insight without Read');
  assert.ok(lena.inventory.some((item) => item.id === 'covenant-emblem'));
  assert.ok(savedRewards.at(-1).inventory.includes('covenant-emblem'), 'drop is saved alongside Insight');
  assert.deepEqual(insightNotices.map(([, amount]) => amount), [3, 5], 'ordinary boss keeps standard reward; Envoy gets exactly five');
  assert.equal(lena.inventory.some((item) => item.id === 'sealed-transit-tag'), false);
  const mage = raw.enemies.find((unit) => unit.drop === 'wind-tome');
  await drop(characters.createEnemyUnit(mage.id, mage.x, mage.z, mage), lena);
  assert.ok(lena.inventory.some((item) => item.id === 'wind-tome'));
  assert.equal(total, 8, 'ordinary mage does not grant Insight');
  lena.inventory = inventory.createInventory(['sealed-transit-tag']);
  const entry = lena.inventory[0];
  const readSource = main.slice(main.indexOf('function readInsightItem('), main.indexOf('async function useInsightFromInventory('));
  const read = runInNewContext(`${readSource}\nreadInsightItem`, context);
  read(lena, entry); read(lena, entry);
  assert.equal(total, 18);
  assert.equal(reads, 1);
  assert.equal(lena.inventory.length, 0);
  context.convoy.push(inventory.createInventory(['sealed-transit-tag'])[0]);
  const stored = context.convoy[0];
  read(null, stored); read(null, stored);
  assert.equal(total, 28);
  assert.equal(reads, 2);
});

test('Wind and its upgrades use triple Might against flying crows without changing ordinary damage', () => {
  for (const id of ['wind-tome', 'gale', 'tempest']) {
    const attacker = { ...characters.createSerraAlly(), magic: 40, inventory: undefined, weapon: inventory.INVENTORY_ITEMS.get(id) };
    for (const enemyId of ['raven', 'forest-raven', 'envoy-raven', 'crowman', 'bell-envoy']) {
      const flyer = characters.createEnemyUnit(enemyId, 0, 0);
      assert.equal(flyer.type, 'flying', enemyId);
      assert.equal(combat.isWeaponEffective(attacker, flyer), true, `${id} vs ${enemyId}`);
      assert.equal(combat.getEffectiveMight(attacker, flyer), attacker.weapon.might * 3);
      const ordinary = { ...flyer, type: 'infantry' };
      assert.equal(combat.isWeaponEffective(attacker, ordinary), false);
      assert.equal(combat.getEffectiveMight(attacker, ordinary), attacker.weapon.might);
      assert.equal(combat.getCombatDamage(attacker, flyer) - combat.getCombatDamage(attacker, ordinary),
        attacker.weapon.might * 2, 'only Might is multiplied, not the whole attack');
    }
  }
});

test('Severin carries three weapons, selects maximum usable damage and can throw his Spear', async () => {
  const boss = characters.createEnemyUnit('severin', 12, 5);
  const spear = inventory.INVENTORY_ITEMS.get('spear'), javelin = inventory.INVENTORY_ITEMS.get('javelin');
  assert.equal(spear.name, 'Spear');
  for (const stat of ['might', 'weight', 'hit']) assert.ok(spear[stat] > javelin[stat], stat);
  assert.deepEqual([spear.minRange, spear.maxRange], [1, 2]);
  assert.equal(boss.weapon.id, 'spear');
  assert.equal(boss.ai, 'stationary');
  assert.deepEqual(boss.inventory.map((entry) => entry.id), ['spear', 'silver-axe', 'silver-lance']);
  const animations = await server.ssrLoadModule('/src/battle/battle-animation.js');
  const targets = ['steel-sword', 'steel-lance', 'steel-axe'].map((id) => ({
    ...characters.createRictorAlly(), weapon: inventory.INVENTORY_ITEMS.get(id),
  }));
  for (const target of targets) {
    const best = combat.bestEnemyWeapon(boss, target, 1);
    const damage = (weapon) => {
      const armed = { ...boss, weapon };
      return combat.getCombatDamage(armed, target) * combat.getAttackCount(armed, target);
    };
    assert.equal(damage(best), Math.max(...combat.enemyAttackWeapons(boss).map(damage)));
    assert.equal(combat.bestEnemyWeapon(boss, target, 2).id, 'spear');
    assert.equal(combat.bestEnemyWeapon(boss, target, 3), null);
  }
  assert.equal(combat.bestEnemyWeapon(boss, targets[0], 1).id, 'spear', 'accuracy breaks an equal-damage matchup');
  assert.equal(combat.bestEnemyWeapon(boss, targets[1], 1).id, 'silver-axe', 'axe advantage beats lance options');
  const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  const start = main.indexOf('    const bellPursuer = ');
  assert.notEqual(start, -1, 'find the live enemy targeting block');
  const end = main.indexOf('    cameraFollowTarget = enemy.mesh.position;', start);
  const target = { ...targets[1], x: 12, z: 6 };
  let sprites = 0;
  runInNewContext(`for (const enemy of [boss]) { ${main.slice(start, end)} }`, {
    boss, activeLevel: {}, livingTeam: [target], streetRaiderTarget: () => null,
    chooseEnemyTarget: () => target, enemyAttackWeapons: combat.enemyAttackWeapons,
    bestEnemyWeapon: combat.bestEnemyWeapon, distanceBetween: grid.distanceBetween,
    getTerrain: () => ({}), setIdleSprite: () => { sprites++; },
  });
  assert.equal(boss.weapon.id, 'silver-axe', 'real enemy phase equips its best attack weapon');
  assert.equal(boss.weaponId, 'silver-axe', 'weapon choice is persisted for counters and reloads');
  assert.equal(sprites, 1, 'map presentation is refreshed with the weapon choice');
  boss.weapon = spear;
  assert.equal(animations.battleThrow(boss, 2).key, 'thrown-spear');
  boss.weapon = inventory.INVENTORY_ITEMS.get('silver-axe');
  assert.equal(animations.battleSpriteKey(boss), 'generic-general-axe');
  assert.equal(combat.bestEnemyWeapon(boss, targets[0], 2).id, 'spear', 'switch back to ranged weapon');
  boss.inventory = boss.inventory.filter((entry) => entry.id !== 'spear');
  assert.equal(combat.bestEnemyWeapon(boss, targets[0], 1).id, 'silver-lance', 'uncarried spear is never chosen');
  assert.equal(combat.bestEnemyWeapon(boss, targets[0], 2), null);
});

test('live spawner honors two-turn rear warning, exact queued entrances, partial reload and a finite optional arrival', async () => {
  const levels = await server.ssrLoadModule('/src/levels/level.js');
  const infirmary = await server.ssrLoadModule('/src/game/infirmary.js');
  const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  const level = levels.validateLevel(JSON.parse(await readFile(new URL('../data/levels/map_14_courtyard.json', import.meta.url), 'utf8')));
  const state = { turn: 1000 }, enemies = [], defenders = [{ x: 12, z: 29, hp: 20 }];
  const context = {
    activeLevel: level, gameState: state, enemies, defendingUnits: () => defenders,
    enemyMovementType: characters.enemyMovementType, tileKey: grid.tileKey,
    distanceBetween: grid.distanceBetween,
    infirmaryWaveSealed: () => false, streetWaveEnabled: () => true,
    infirmarySpawnTile: infirmary.infirmarySpawnTile,
    courtyardWaveEnabled: courtyard.courtyardWaveEnabled, cathedralWaveEnabled: () => true,
    isWalkable: grid.isWalkable, levelGroup: { userData: {} },
    createEnemy: (x, z, id, placement) => characters.createEnemyUnit(id, x, z, placement),
  };
  const source = main.slice(main.indexOf('function spawnTurnReinforcements()'), main.indexOf('\nasync function endPlayerPhase()'));
  const spawn = runInNewContext(`${source}\nspawnTurnReinforcements`, context);
  assert.equal(spawn().units.length, 0, 'unwarned waves never spawn at their placeholder turn');
  assert.deepEqual(courtyard.triggerProgressWaves(level, [{ hp: 10, z: 13 }], 4), ['courtyard-cavalry']);
  assert.equal(level.reinforcements[0].turn, 6);
  state.turn = 5;
  assert.equal(spawn().units.length, 0);
  assert.deepEqual(courtyard.triggerProgressWaves(level, [{ hp: 10, z: 10 }], 5), ['courtyard-ravens']);
  state.turn = 6;
  assert.equal(spawn().units.filter((unit) => unit.id === 'bell-envoy').length, 1);
  assert.equal(level.reinforcements[0].spawnedCount, 0, 'blocked first cavalry entrance queues all later riders');
  defenders.length = 0;
  defenders.push({ ...level.reinforcements[0].units[1], hp: 10 });
  assert.equal(spawn().units.length, 1);
  assert.equal(level.reinforcements[0].spawnedCount, 1);
  context.activeLevel = levels.validateLevel(JSON.parse(JSON.stringify(level)));
  defenders.length = 0;
  assert.equal(spawn().units.length, 2);
  assert.equal(context.activeLevel.reinforcements[0].spawned, true);
  const laterRavens = enemies.filter((unit) => unit.id === 'envoy-raven');
  for (const [index, unit] of laterRavens.entries()) { unit.x = 17; unit.z = 10 + index; }
  assert.equal(level.courtyard.tactics.ravenReinforcements.arrivalTurn, 6);
  assert.deepEqual(level.reinforcements.slice(2).map((wave) => wave.turn), [8, 10]);
  state.turn = 7;
  assert.equal(spawn().units.length, 0, 'no reinforcements on intervening turns');
  state.turn = 8;
  assert.equal(spawn().units.length, 2);
  for (const [index, unit] of enemies.filter((unit) => unit.id === 'envoy-raven').entries()) {
    unit.x = 17; unit.z = 8 + index;
  }
  context.activeLevel = levels.validateLevel(JSON.parse(JSON.stringify(context.activeLevel)));
  state.turn = 9;
  assert.equal(spawn().units.length, 0);
  state.turn = 10;
  assert.equal(spawn().units.length, 2, 'last finite pair arrives after reloading');
  state.turn = 1001;
  assert.equal(spawn().units.length, 0);
  assert.equal(enemies.filter((unit) => unit.id === 'golden-cavalier').length, 3);
  assert.equal(enemies.filter((unit) => unit.id === 'envoy-raven').length, 6);
  const reset = courtyard.freshCourtyard(context.activeLevel.courtyard);
  assert.equal(reset.tactics.ravenReinforcements.arrivalTurn, null);
  assert.notEqual(reset.tactics.ravenReinforcements.waves, context.activeLevel.courtyard.tactics.ravenReinforcements.waves);

  context.activeLevel = levels.validateLevel(JSON.parse(await readFile(new URL('../data/levels/map_14_courtyard.json', import.meta.url), 'utf8')));
  enemies.length = 0;
  defenders.push({ x: 20, z: 12, hp: 20 });
  courtyard.triggerProgressWaves(context.activeLevel, [{ hp: 10, z: 13 }], 4);
  courtyard.triggerProgressWaves(context.activeLevel, [{ hp: 10, z: 10 }], 5);
  state.turn = 6;
  assert.equal(spawn().units.filter((unit) => unit.id === 'bell-envoy').length, 0);
  assert.equal(context.activeLevel.courtyard.tactics.ravenReinforcements.arrivalTurn, null);
  assert.ok(context.activeLevel.reinforcements.slice(2).every((wave) => wave.turn === 999));
  state.turn = 8;
  defenders.length = 0;
  assert.equal(spawn().units.length, 3);
  assert.deepEqual(context.activeLevel.reinforcements.slice(2).map((wave) => wave.turn), [10, 12],
    'follow-ups are anchored to actual appearance, not the originally blocked arrival turn');
  state.turn = 10;
  assert.equal(spawn().units.length, 0, 'occupied Raven entrance queues the pair');
  assert.equal(context.activeLevel.reinforcements[2].spawnedCount, 0);
  enemies.find((unit) => unit.id === 'envoy-raven' && unit.x === 20).x = 17;
  assert.equal(spawn().units.length, 1, 'a partially unblocked pair spawns exactly one unit');
  assert.equal(context.activeLevel.reinforcements[2].spawnedCount, 1);
  assert.equal(spawn().units.length, 0, 'partial pair cannot duplicate its first Raven');
});

test('pursuing Raven positions and finite arrival timing survive saves, while impossible schedules are rejected', async (t) => {
  const levels = await server.ssrLoadModule('/src/levels/level.js');
  const saves = await server.ssrLoadModule('/src/game/save.js');
  const level = levels.validateLevel(JSON.parse(await readFile(new URL('../data/levels/map_14_courtyard.json', import.meta.url), 'utf8')));
  level.courtyard.triggers[0].warnedTurn = 4;
  level.reinforcements[0].turn = 6;
  level.courtyard.triggers[1].warnedTurn = 5;
  Object.assign(level.reinforcements[1], { turn: 6, spawned: true, spawnedCount: 3 });
  level.courtyard.tactics.ravenReinforcements.arrivalTurn = 8;
  level.reinforcements[2].turn = 10;
  level.reinforcements[3].turn = 12;
  const enemies = [...level.enemies, ...level.reinforcements[1].units].map((placement) =>
    characters.createEnemyUnit(placement.id, placement.x, placement.z, placement));
  const raven = enemies.find((unit) => unit.id === 'envoy-raven');
  raven.x = 17; raven.z = 12;
  const factories = { rictor: characters.createRictorAlly, lena: characters.createLenaAlly,
    arlan: characters.createArlanAlly, troy: characters.createTroyAlly };
  const allies = level.players.map((placement) => Object.assign(factories[placement.id](), placement));
  const data = saves.createSaveData(level, characters.createMaria(), enemies,
    { turn: 9, phase: 'player', defeated: false }, { chapter: 13, playerReserve: true, allies });
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  globalThis.localStorage = { getItem: () => JSON.stringify(data) };
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else delete globalThis.localStorage;
  });
  const restored = saves.readSave();
  assert.equal(restored.enemies.find((unit) => unit.id === 'envoy-raven').x, 17, 'pursuit outside court is legal');
  assert.equal(restored.level.courtyard.tactics.ravenReinforcements.arrivalTurn, 8);
  assert.deepEqual(restored.level.reinforcements.slice(2).map((wave) => wave.turn), [10, 12]);
  for (const mutate of [
    (copy) => { copy.level.courtyard.tactics.ravenReinforcements.arrivalTurn = null; },
    (copy) => { copy.level.courtyard.tactics.ravenReinforcements.arrivalTurn = 10; },
    (copy) => { copy.level.reinforcements[2].turn = 9; },
    (copy) => { copy.level.reinforcements[2].spawnedCount = 1; },
    (copy) => { copy.enemies.find((unit) => unit.id === 'bell-envoy').ai = 'mobile'; },
    (copy) => { copy.enemies.find((unit) => unit.id === 'bell-envoy').x = 19; },
  ]) {
    const invalid = structuredClone(data);
    mutate(invalid);
    globalThis.localStorage.getItem = () => JSON.stringify(invalid);
    assert.throws(() => saves.readSave(), /raven arrival/);
  }
  globalThis.localStorage.getItem = () => JSON.stringify(data);
  data.enemies = data.enemies.filter((unit) => unit.id !== 'bell-envoy');
  assert.equal(saves.readSave().level.reinforcements[3].turn, 12, 'Envoy death does not erase the finite schedule');
  delete data.level.courtyard.tactics.ravenReinforcements;
  data.level.reinforcements.length = 2;
  data.level.reinforcements[1].units.forEach((unit) => { unit.ai = 'guard'; });
  data.enemies = data.enemies.filter((unit) => unit.id !== 'envoy-raven');
  assert.doesNotThrow(() => saves.readSave(), 'legacy tactical saves retain their old finite encounter');
});

test('Chapter 14 restart reloads authored layout and preserves the chapter-start party and supplies', async () => {
  const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  const raw = JSON.parse(await readFile(new URL('../data/levels/map_14_courtyard.json', import.meta.url), 'utf8'));
  const carry = { allies: [{ id: 'serra' }, { id: 'eveline' }], convoy: [{ id: 'potion', uses: 1 }] };
  let started;
  const context = {
    currentChapter: 13, activeLevel: { name: 'Old embedded courtyard' }, chapterStart: carry,
    loadChapterLevel: async (chapter, options) => {
      assert.equal(chapter, 13);
      assert.equal(options.reuseLoaded, true);
      return raw;
    },
    startLevel: (map, options) => { started = { map, options }; },
  };
  const source = main.slice(main.indexOf('async function restartLevel()'), main.indexOf('async function startNextChapter()'));
  await runInNewContext(`${source}\nrestartLevel()`, context);
  assert.equal(started.map, raw);
  assert.equal(started.options.carry, carry);
  assert.equal(started.options.chapter, 13);
});

test('eastern court treasure uses real Lockpick/key flow, grants each reward once and supports convoy overflow', async () => {
  const levels = await server.ssrLoadModule('/src/levels/level.js');
  const level = levels.validateLevel(JSON.parse(await readFile(new URL('../data/levels/map_14_courtyard.json', import.meta.url), 'utf8')));
  const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  const source = main.slice(main.indexOf('function chestAvailableToOpen(unit)'), main.indexOf('\nconst hasLockpick'));
  inventory.setConvoy([]);
  try {
    const lena = Object.assign(characters.createLenaAlly(), { x: 20, z: 9, acted: false,
      inventory: Array.from({ length: 5 }, () => ({ id: 'iron-sword', uses: 40 })) });
    const messages = [], popups = [];
    for (const chest of level.chests) {
      Object.defineProperty(chest, 'mesh', { value: { material: { opacity: 1 } }, enumerable: false });
      Object.defineProperty(chest, 'glow', { value: { intensity: .8 }, enumerable: false });
    }
    const context = {
      activeLevel: level, player: lena, gameState: { selected: true, phase: 'player' },
      hasLockpick: (unit) => classes.getClassAbilities(unit).some((ability) => ability.lockpick),
      grantItem: inventory.grantItem, setMessage: (message) => messages.push(message),
      levelGroup: { userData: {} }, renderTacticalUi() {}, finishUnit() {},
      itemPopup: { show: async (items) => popups.push(...items) },
    };
    const open = runInNewContext(`${source}\nopenChest`, context);
    await open();
    assert.equal(level.chests[0].opened, true);
    assert.equal(lena.acted, true);
    assert.equal(lena.inventory.length, 5, 'Lockpick consumes no item');
    assert.equal(popups[0].item.id, 'light-tome');
    assert.equal(popups[0].toConvoy, true);
    assert.equal(inventory.convoy.filter(({ id }) => id === 'light-tome').length, 1);
    lena.acted = false;
    await open();
    assert.equal(popups.length, 1, 'already-open chest cannot grant again');
    const rictor = Object.assign(characters.createRictorAlly(), { x: 21, z: 11, acted: false, inventory: [] });
    context.player = rictor;
    await open();
    assert.equal(level.chests[1].opened, false);
    assert.match(messages.at(-1), /needs a Chest Key/);
    rictor.inventory.push({ id: 'chest-key' });
    await open();
    assert.equal(level.chests[1].opened, true);
    assert.equal(rictor.acted, true);
    assert.deepEqual(rictor.inventory.map(({ id }) => id), ['master-emblem']);
    assert.equal(popups[1].item.name, 'Orders Emblem');
    for (const chest of level.chests) {
      assert.equal(chest.mesh.material.opacity, .35);
      assert.equal(chest.glow.intensity, 0);
    }
    const restored = levels.validateLevel(JSON.parse(JSON.stringify(level)));
    assert.ok(restored.chests.every(({ opened }) => opened));
    assert.ok(restored.chests.every((chest) => !('mesh' in chest)));
  } finally {
    inventory.setConvoy([]);
  }
});

test('live progress warnings describe the matching redesigned or legacy encounter', async () => {
  const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  const start = main.indexOf('  for (const id of triggerProgressWaves(activeLevel, playerTeam, gameState.turn))');
  const end = main.indexOf("  if (activeLevel.streets && gameState.turn === 5)", start);
  assert.ok(start > 0 && end > start);
  const raw = JSON.parse(await readFile(new URL('../data/levels/map_14_courtyard.json', import.meta.url), 'utf8'));
  const stories = JSON.parse(await readFile(new URL('../data/tutorials/chapter-14.json', import.meta.url), 'utf8'));
  const legacyTactics = structuredClone(raw);
  delete legacyTactics.courtyard.tactics.ravenReinforcements;
  legacyTactics.reinforcements.length = 2;
  legacyTactics.reinforcements[1].units.forEach((unit) => { unit.ai = 'guard'; });
  for (const level of [raw, legacyTactics, rules()]) {
    const shown = [], state = { turn: 4 };
    const context = {
      activeLevel: level, playerTeam: [{ hp: 10, z: 0 }], gameState: state,
      triggerProgressWaves: courtyard.triggerProgressWaves, saveCurrentGame() {},
      tutorialPopup: { show: async (id) => { assert.ok(stories[id]?.pages.length); shown.push(id); } },
    };
    await runInNewContext(`(async () => { ${main.slice(start, end)} })()`, context);
    state.turn++;
    await runInNewContext(`(async () => { ${main.slice(start, end)} })()`, context);
    const prefix = level.courtyard.tactics ? 'courtyard' : 'courtyardLegacy';
    assert.deepEqual(shown, [`${prefix}CavalryWarning`,
      level === legacyTactics ? 'courtyardGuardRavenWarning' : `${prefix}RavenWarning`]);
    assert.equal(level.reinforcements[0].turn, level.courtyard.tactics ? 6 : 5);
  }
});

test('courtyard saves retain enemy staff uses, player Freeze and Corvis outcomes and reject inconsistent progress', async (t) => {
  const levels = await server.ssrLoadModule('/src/levels/level.js');
  const saves = await server.ssrLoadModule('/src/game/save.js');
  const level = levels.validateLevel(JSON.parse(await readFile(new URL('../data/levels/map_14_courtyard.json', import.meta.url), 'utf8')));
  const factories = { rictor: characters.createRictorAlly, lena: characters.createLenaAlly,
    arlan: characters.createArlanAlly, troy: characters.createTroyAlly };
  const allies = level.players.map((placement) => Object.assign(factories[placement.id](), placement));
  const enemies = level.enemies.map((placement) => characters.createEnemyUnit(placement.id, placement.x, placement.z, placement));
  const armedBoss = enemies.find((unit) => unit.id === 'severin');
  armedBoss.weapon = inventory.INVENTORY_ITEMS.get('silver-axe');
  armedBoss.weaponId = 'silver-axe';
  const freezer = enemies.find((enemy) => enemy.id === 'church-freezer');
  freezer.inventory[0].uses = 2;
  level.chests[0].opened = true;
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
  const savedBoss = restored.enemies.find((unit) => unit.id === 'severin');
  const loadedBoss = characters.createEnemyUnit(savedBoss.id, savedBoss.x, savedBoss.z, savedBoss);
  assert.equal(loadedBoss.weapon.id, 'silver-axe', 'selected enemy weapon survives reload');
  assert.deepEqual(savedBoss.inventory.map((entry) => entry.id), ['spear', 'silver-axe', 'silver-lance']);
  assert.equal(savedBoss.drop, 'spear', 'selected weapon does not change the drop');
  assert.equal(restored.allies[0].frozen, 1);
  assert.equal(restored.enemies.find((enemy) => enemy.id === 'church-freezer').inventory[0].uses, 2);
  assert.equal(restored.level.courtyard.tactics.formations[0].active, false);
  assert.equal(restored.level.villageScene.artwork, 'redrawn');
  assert.deepEqual(restored.level.chests.map(({ opened }) => opened), [true, false]);
  data.enemies.push({ id: 'bell-envoy', x: 17, z: 12, hp: 46, maxHp: 46, level: 20, ai: 'guard', drop: 'sealed-transit-tag' });
  assert.throws(() => saves.readSave(), /raven arrival/);
  data.enemies.pop();
  const reserves = data.enemies.filter((enemy) => enemy.id === 'golden-cavalier' && enemy.ai === 'guard');
  const reserve = reserves[0];
  reserve.ai = 'mobile';
  assert.throws(() => saves.readSave(), /formation/);
  for (const unit of reserves) unit.ai = 'mobile';
  data.level.courtyard.tactics.formations[0].active = true;
  assert.equal(saves.readSave().level.courtyard.tactics.formations[0].active, true);
  assert.equal(saves.readSave().enemies.find((enemy) => enemy.id === reserve.id &&
    enemy.x === reserve.x && enemy.z === reserve.z).ai, 'mobile');
  for (const unit of reserves) unit.ai = 'guard';
  data.level.courtyard.tactics.formations[0].active = false;
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
  data.level.reinforcements[0].turn = 3;
  assert.equal(saves.readSave().level.reinforcements[0].turn, 3);
  data.level.courtyard.triggers[0].warnedTurn = null;
  assert.equal(saves.readSave().level.courtyard.triggers[0].warnedTurn, 1,
    'a scheduled two-turn arrival recovers its missing warning');
  data.level.reinforcements[0].turn = 4;
  assert.throws(() => saves.readSave(), /reinforcement timing/, 'unexplained future schedules remain invalid');
  data.level.reinforcements[0].turn = 3;
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
