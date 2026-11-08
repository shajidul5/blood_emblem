import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
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
  level.streets.recruit.hp = 12;
  level.streets.recruit.inventory = [{ id: 'heal-staff', uses: 8 }, { id: 'potion', uses: 1 }];
  const write = () => saves.writeSave(saves.createSaveData(level, maria, [enemy], { turn: 3, phase: 'player', defeated: false },
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
  units.pop();
  level.streets.recruit.recruited = false;
  level.streets.recruit.dead = true;
  level.streets.recruit.hp = 0;
  write();
  restored = saves.readSave();
  assert.ok(restored, 'lost state is valid and still playable');
  assert.equal(restored.level.streets.recruit.dead, true);
  const reset = streets.freshStreets(restored.level.streets);
  assert.equal(reset.recruit.hp, 28);
  assert.equal(reset.recruit.dead, false);
  assert.equal(reset.recruit.recruited, false);
  assert.equal(reset.recruit.inventory, undefined);
  Object.assign(units[0], level.streets.seizePoint);
  const victory = saves.createSaveData(level, maria, [enemy], { turn: 4, phase: 'victory', defeated: false },
    { chapter: 12, playerReserve: true, allies: units });
  saves.writeSave(victory);
  assert.equal(saves.readSave().phase, 'victory');
  for (const mutate of [
    (save) => { save.allies[0].stats.hp = 0; },
    (save) => { save.allies[0].x++; },
    (save) => { save.enemies.push({ ...save.enemies[0], id: 'veyr', x: 13, z: 4, hp: 44, maxHp: 44, level: 16, ai: 'stationary' }); },
    (save) => { save.level.streets.recruit.dead = false; },
    (save) => { save.level.streets.recruit.inventory[0].uses = -1; },
  ]) {
    const invalid = structuredClone(victory);
    mutate(invalid);
    saves.writeSave(invalid);
    assert.throws(() => saves.readSave());
  }
});
