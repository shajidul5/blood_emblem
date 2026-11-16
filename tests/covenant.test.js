import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { createServer } from 'vite';

let server, classes, covenant, characters, inventory, saves, grid, combat, profile, createPrepMenu;
let main;
const previousImage = Object.getOwnPropertyDescriptor(globalThis, 'Image');

before(async () => {
  globalThis.Image = class { set src(value) { queueMicrotask(() => this.onload()); } };
  server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: 'custom' });
  [classes, covenant, characters, inventory, saves, grid, combat, profile, { createPrepMenu }] = await Promise.all(
    ['characters/classes', 'game/covenant', 'characters/characters', 'characters/inventory', 'game/save',
      'battle/grid', 'battle/combat', 'characters/profile-dialog', 'game/prep-menu']
      .map((file) => server.ssrLoadModule(`/src/${file}.js`)));
  main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
});

after(async () => {
  await server?.close();
  if (previousImage) Object.defineProperty(globalThis, 'Image', previousImage);
  else delete globalThis.Image;
});

function promote(id) {
  const unit = id === 'linus' ? characters.createLinusAlly() : characters.createStarkAlly();
  unit.level = 20;
  classes.promoteUnit(unit, 'covenant-emblem');
  return unit;
}

test('Covenant promotions are exclusive level-20 base branches, preserving Orders promotions and stat gains', () => {
  for (const [factory, target, original, type, sprite] of [
    ['createLinusAlly', 'bloodsworn', 'paladin', 'cavalry', 'bloodswornLinus'],
    ['createStarkAlly', 'veilstalker', 'sniper', 'infantry', 'veilstalkerStark'],
  ]) {
    const unit = characters[factory](), orders = characters[factory]();
    assert.equal(classes.promotionBlockReason(unit, 'covenant-emblem'), 'Needs level 20');
    assert.throws(() => classes.promoteUnit(unit, 'covenant-emblem'), /level 20/);
    unit.level = orders.level = 20;
    const exp = structuredClone(unit.weaponExp), items = structuredClone(unit.inventory);
    const movement = unit.movement;
    const normal = classes.promoteUnit(orders);
    const alternate = classes.promoteUnit(unit, 'covenant-emblem');
    assert.equal(unit.classId, target);
    assert.equal(orders.classId, original);
    assert.deepEqual(alternate.gains, normal.gains);
    assert.equal(unit.type, type);
    assert.equal(unit.spriteSet, sprite);
    assert.equal(unit.level, 20);
    assert.equal(unit.hp, unit.maxHp);
    assert.equal(unit.movement, movement + (normal.gains.movement ?? 0));
    assert.deepEqual(unit.weaponExp, exp);
    assert.deepEqual(unit.inventory, items);
    assert.equal(classes.canPromote(unit, 'covenant-emblem'), false);
    assert.equal(classes.promotionBlockReason(orders, 'covenant-emblem'), 'Already promoted');
    const once = structuredClone(unit);
    assert.throws(() => classes.promoteUnit(unit, 'covenant-emblem'), /cannot/);
    classes.applyClass(unit, unit.classId);
    assert.deepEqual(unit, once, 'restoring the class never reapplies bonuses');
    assert.ok(profile.portraitUrl(unit));
  }
  for (const unit of [characters.createMaria(), characters.createCypherAlly(), characters.createTroyAlly()]) {
    unit.level = 20;
    const before = structuredClone(unit);
    assert.equal(classes.promotionBlockReason(unit, 'covenant-emblem'), 'Only Cavalier Linus or Archer Stark');
    assert.throws(() => classes.promoteUnit(unit, 'covenant-emblem'), /cannot/);
    assert.deepEqual(unit, before);
    assert.equal(classes.canPromote(unit), true);
  }
});

test('Bloodsworn keeps Spears, not Swords, magic or ordinary staves; Veilstalker does not inherit Deadeye', () => {
  const linus = promote('linus'), stark = promote('stark');
  for (const id of ['iron-spear', 'javelin'])
    assert.ok(classes.canEquipWeapon(linus, inventory.INVENTORY_ITEMS.get(id)));
  for (const id of ['iron-katana', 'heal-staff', 'fire-tome', 'light-tome'])
    assert.equal(classes.canEquipWeapon(linus, inventory.INVENTORY_ITEMS.get(id)), false);
  assert.ok(classes.canEquipWeapon(stark, inventory.INVENTORY_ITEMS.get('iron-bow')));
  const sniper = characters.createStarkAlly();
  classes.promoteUnit(sniper);
  const target = characters.createRaider(1, 0);
  assert.equal(combat.getCriticalRate(sniper, target) - combat.getCriticalRate(stark, target), 15);
  const swordLinus = characters.createLinusAlly();
  swordLinus.level = 20;
  swordLinus.weapon = inventory.INVENTORY_ITEMS.get('iron-katana');
  swordLinus.inventory.push(...inventory.createInventory(['iron-katana']));
  classes.promoteUnit(swordLinus, 'covenant-emblem');
  assert.equal(swordLinus.weapon, null);
  assert.ok(swordLinus.inventory.some((entry) => entry.id === 'iron-katana'), 'unusable gear is retained');
});

test('Blood Oath costs 6 HP and an action; targeting rejects self, dead, distant, protected and low-HP cases', () => {
  const caster = { ...promote('linus'), x: 4, z: 4, hp: 7 };
  const ally = { ...characters.createMaria(), x: 5, z: 4 };
  const others = [
    caster, { ...ally, hp: 0 }, { ...ally, x: 6 }, { ...ally, bloodOath: true },
  ];
  assert.deepEqual(covenant.bloodOathTargets(caster, [...others, ally]), [ally]);
  assert.ok(covenant.bloodOathBlockReason({ ...caster, hp: 6 }, ally));
  assert.ok(covenant.bloodOathBlockReason({ ...caster, acted: true }, ally));
  assert.ok(covenant.bloodOathBlockReason(characters.createLinusAlly(), ally));
  const fullHp = ally.hp;
  caster.moveOrigin = { x: 3, z: 4 };
  covenant.applyBloodOath(caster, ally);
  assert.equal(caster.hp, 1);
  assert.equal(caster.acted, true);
  assert.equal(caster.moveOrigin, null);
  assert.equal(ally.hp, fullHp);
  assert.equal(ally.bloodOath, true);
  assert.throws(() => covenant.applyBloodOath(caster, ally), /Already acted/);
});

test('the first positive hit is halved once, rounded up before HP capping; misses and zero damage preserve the oath', () => {
  for (const damage of [1, 2, 3, 10, 11, 99]) {
    const target = { hp: 100, maxHp: 100, bloodOath: true };
    assert.equal(covenant.protectedCombatDamage(target, damage), Math.ceil(damage / 2));
    assert.equal(target.bloodOath, true, 'forecast is read-only');
    assert.equal(covenant.applyCombatDamage(target, 0), 0);
    assert.equal(target.bloodOath, true);
    assert.equal(covenant.applyCombatDamage(target, damage), Math.ceil(damage / 2));
    assert.equal(target.bloodOath, undefined);
    const remaining = target.hp;
    assert.equal(covenant.applyCombatDamage(target, damage), Math.min(remaining, damage));
  }
  const lethal = { hp: 5, bloodOath: true };
  assert.equal(covenant.applyCombatDamage(lethal, 20), 5, '20 halves to 10, then caps at 5, not 3');
  assert.equal(lethal.hp, 0);
  for (const weaponId of ['iron-spear', 'fire-tome']) {
    const attacker = { ...characters.createCypherAlly(), weapon: inventory.INVENTORY_ITEMS.get(weaponId) };
    const defender = { ...characters.createMaria(), hp: 60, maxHp: 60, bloodOath: true };
    const raw = combat.getCriticalDamage(attacker, defender);
    assert.equal(covenant.applyCombatDamage(defender, raw), Math.min(60, Math.ceil(raw / 2)));
    assert.equal(defender.bloodOath, raw > 0 ? undefined : true);
  }
  const multi = { hp: 100, bloodOath: true };
  assert.deepEqual([10, 10, 10, 10].map((damage) => covenant.applyCombatDamage(multi, damage)), [5, 10, 10, 10]);
  const drainer = { hp: 1, maxHp: 100, weapon: { lifeSteal: 0.5 } };
  const warded = { hp: 100, bloodOath: true };
  assert.equal(combat.healDamageDealt(drainer, covenant.applyCombatDamage(warded, 19)), 5);
});

test('Blood Trail checks wounded living enemies within Manhattan 6 once, without stacking or changing base Movement', () => {
  const unit = { ...promote('stark'), x: 5, z: 5 };
  const baseMovement = unit.movement;
  for (const [x, z, hp, maxHp, expected] of [
    [11, 5, 9, 10, 2], [8, 8, 9, 10, 2], [9, 8, 9, 10, 0],
    [6, 5, 10, 10, 0], [6, 5, 0, 10, 0],
  ]) {
    const enemy = { x, z, hp, maxHp };
    covenant.startCovenantPlayerPhase([unit], [enemy]);
    assert.equal(unit.bloodTrailBonus, expected);
    assert.equal(covenant.movementAllowance(unit), baseMovement + expected);
    enemy.hp = 0;
    unit.x = 0;
    assert.equal(covenant.movementAllowance(unit), baseMovement + expected, 'no mid-phase recalculation');
    unit.x = 5;
    assert.equal(unit.movement, baseMovement);
  }
  const wounded = { x: 5, z: 6, hp: 1, maxHp: 10 };
  covenant.startCovenantPlayerPhase([unit], [wounded, { ...wounded }]);
  covenant.startCovenantPlayerPhase([unit], [wounded]);
  assert.equal(covenant.movementAllowance(unit), baseMovement + 2);
  covenant.endCovenantPlayerPhase([unit]);
  assert.equal(covenant.movementAllowance(unit), baseMovement);
  unit.bloodOath = true;
  covenant.startCovenantPlayerPhase([unit], []);
  assert.equal(unit.bloodOath, undefined);
  assert.equal(unit.bloodTrailBonus, 0);
  unit.hp = 0;
  covenant.startCovenantPlayerPhase([unit], [wounded]);
  assert.equal(covenant.movementAllowance(unit), baseMovement);
  const archer = { ...characters.createStarkAlly(), bloodTrailBonus: 2 };
  assert.equal(covenant.movementAllowance(archer), archer.movement);
});

test('Blood Trail expands real movement ranges while preserving terrain, obstacles and freeze restrictions', () => {
  const level = { width: 15, height: 15, tileIds: Array.from({ length: 15 }, () => Array(15).fill('courtyard_lawn')) };
  const unit = { ...promote('stark'), x: 1, z: 1 };
  const enemy = { x: 2, z: 1, hp: 2, maxHp: 10 };
  const base = unit.movement;
  assert.equal(grid.getMovementRange(unit, level, []).has(`${1 + base + 2},1`), false);
  covenant.startCovenantPlayerPhase([unit], [enemy]);
  const range = grid.getMovementRange(unit, level, [enemy]);
  assert.ok(range.has(`1,${1 + base + 2}`));
  assert.equal(range.has('2,1'), false);
  assert.equal(range.has(`1,${1 + base + 3}`), false);
  const rough = { ...level, tileIds: level.tileIds.map((row) => row.map(() => 'forest_undergrowth')) };
  assert.equal(grid.getMovementRange(unit, rough, []).has(`1,${1 + base + 2}`), false);
  const frozen = grid.getMovementRange({ ...unit, frozen: true }, level, []);
  assert.equal(frozen.size, 1);
  assert.equal(unit.movement, base);
});

test('Covenant class and temporary effects survive real save/export parsing without inflating Movement or altering legacy saves', async () => {
  const level = JSON.parse(await readFile(new URL('../data/levels/map_01_two_ships.json', import.meta.url)));
  const maria = Object.assign(characters.createMaria(), level.spawn);
  const linus = { ...promote('linus'), x: maria.x + 1, z: maria.z, bloodOath: true };
  const stark = { ...promote('stark'), x: maria.x + 2, z: maria.z, bloodTrailBonus: 2 };
  // Benched units still serialize, without imposing this test's positions on the authored map.
  const save = saves.createSaveData(level, maria, [], { phase: 'player', turn: 3, defeated: false },
    { allies: [linus, stark], isBenched: () => true });
  const restored = saves.parseSave(JSON.stringify(save));
  assert.equal(restored.allies[0].classId, 'bloodsworn');
  assert.equal(restored.allies[0].bloodOath, true);
  assert.equal(restored.allies[1].classId, 'veilstalker');
  assert.equal(restored.allies[1].bloodTrailBonus, 2);
  assert.equal(restored.allies[1].stats.movement, stark.movement);
  const resume = { ...stark, ...restored.allies[1].stats, bloodTrailBonus: restored.allies[1].bloodTrailBonus };
  assert.equal(covenant.movementAllowance(resume), stark.movement + 2);
  const snapshot = saves.serializeUnit(stark);
  const chapterUnit = { ...stark, bloodOath: true };
  const snapshotContext = {
    clearCovenantState: covenant.clearCovenantState, applyClass: classes.applyClass,
    refreshUnitAppearance() {}, restoreMariaInventory() {},
  };
  const snapshotSource = main.slice(main.indexOf('function applyUnitSnapshot('), main.indexOf('\nconst roster ='));
  runInNewContext(`${snapshotSource}\nglobalThis.apply = applyUnitSnapshot;`, snapshotContext);
  snapshotContext.apply(chapterUnit, snapshot);
  assert.equal(chapterUnit.bloodOath, undefined);
  assert.equal(chapterUnit.bloodTrailBonus, undefined);
  assert.equal(chapterUnit.movement, stark.movement);
  const old = structuredClone(save);
  old.allies = [];
  assert.doesNotThrow(() => saves.parseSave(JSON.stringify(old)));
  for (const invalid of [-2, 1, 3, '2', true]) {
    const broken = structuredClone(save);
    broken.allies[1].bloodTrailBonus = invalid;
    assert.throws(() => saves.parseSave(JSON.stringify(broken)), /ally state/);
  }
  const broken = structuredClone(save);
  broken.allies[0].bloodOath = 'yes';
  assert.throws(() => saves.parseSave(JSON.stringify(broken)), /ally state/);
  const wrongUnit = structuredClone(save);
  wrongUnit.allies[0].bloodTrailBonus = 2;
  assert.throws(() => saves.parseSave(JSON.stringify(wrongUnit)), /ally state/);
});

test('all four actual combat impact callbacks respect Blood Oath, misses, criticals and actual-damage lifesteal', async () => {
  const impacts = [...main.matchAll(/await playCombatStrike\((player|target|enemy|foe), result, round > 0, \(\) => \{([\s\S]*?)\n\s*\},?(?: 350)?\);/g)];
  assert.equal(impacts.length, 4, 'player attack, enemy counter, enemy attack and player counter');
  for (const [source, actor] of impacts) for (const [hit, critical, damage] of [
    [false, false, 11], [true, false, 0], [true, false, 11], [true, true, 11],
  ]) {
    const units = Object.fromEntries(['player', 'target', 'enemy', 'foe'].map((id) =>
      [id, { id, hp: 100, maxHp: 100, bloodOath: true, weapon: { lifeSteal: 0.5 } }]));
    const defender = units[{ player: 'target', target: 'player', enemy: 'foe', foe: 'enemy' }[actor]];
    const drained = [];
    const context = {
      ...units, result: { hit, critical }, round: 0, damage, criticalDamage: damage * 3,
      counterDamage: damage, counterCriticalDamage: damage * 3, rankUps: [],
      playerHits: 0, playerCriticalHits: 0, playerTotalDamage: 0,
      hits: 0, criticalHits: 0, totalDamage: 0, counterHitCount: 0, counterCriticalCount: 0, counterTotalDamage: 0,
      playerTeam: [units.foe], applyCombatDamage: covenant.applyCombatDamage,
      healDamageDealt(unit, dealt) { drained.push(dealt); return 0; },
      recordWeaponHit() {}, refreshUnitTint() {}, showCombatResult() {},
      async playCombatStrike(unit, result, repeat, impact) { impact(); },
    };
    await runInNewContext(`(async () => { ${source} })()`, context);
    const expected = hit ? Math.ceil(damage * (critical ? 3 : 1) / 2) : 0;
    assert.equal(defender.hp, 100 - expected, actor);
    assert.equal(defender.bloodOath, expected > 0 ? undefined : true);
    assert.deepEqual(drained, hit ? [expected] : []);
  }
});

class Element extends EventTarget {
  constructor(tag) { super(); this.tag = tag; this.children = []; this.textContent = ''; this.classList = new Set(); }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute() {}
  focus() {}
  showModal() { this.open = true; }
  close() { this.open = false; this.dispatchEvent(new Event('close')); }
  all() { return [this, ...this.children.flatMap((node) => node.all())]; }
  querySelector() { return this.all().find((node) => node.tag === 'button' && !node.disabled); }
}

test('preparations use Covenant Emblems from inventory and convoy, consume exactly one, and preserve action state', async (t) => {
  const old = Object.getOwnPropertyDescriptor(globalThis, 'document');
  globalThis.document = { createElement: (tag) => new Element(tag) };
  t.after(() => old ? Object.defineProperty(globalThis, 'document', old) : delete globalThis.document);
  for (const id of ['linus', 'stark']) for (const source of ['carried', 'convoy']) {
    const unit = id === 'linus' ? characters.createLinusAlly() : characters.createStarkAlly();
    unit.level = 20;
    const emblem = { id: 'covenant-emblem', uses: 1 }, convoy = source === 'convoy' ? [emblem] : [];
    if (source === 'carried') unit.inventory.push(emblem);
    const dialog = new Element('dialog');
    let changes = 0, promotions = 0;
    const menu = createPrepMenu({
      dialog, getTeam: () => [unit], getConvoy: () => convoy, items: inventory.INVENTORY_ITEMS,
      maxSize: 5, maxDeployed: 12, isDeployed: () => true, portrait: () => null,
      getInfo: () => ({ chapter: 'Test', objective: 'Test' }), settle: () => '',
      onChange() { changes++; menu.refresh(); }, onPromote() { promotions++; },
    });
    const click = (text) => {
      const node = dialog.all().find((node) => node.tag === 'button' && !node.disabled &&
        node.all().map((entry) => entry.textContent).join('') === text);
      assert.ok(node, text);
      node.dispatchEvent(new Event('click'));
      return node;
    };
    const closed = menu.show();
    click('Inventory');
    dialog.all().find((node) => node.className === 'prep-card').dispatchEvent(new Event('click'));
    click(source === 'carried' ? 'Use Item' : 'Convoy');
    const use = dialog.all().find((node) => node.tag === 'button' && !node.disabled && node.textContent === 'Use');
    assert.ok(use);
    unit.level = 19;
    use.dispatchEvent(new Event('click'));
    assert.equal(changes, 0, 'stale buttons revalidate the level requirement');
    assert.ok([...unit.inventory, ...convoy].includes(emblem));
    unit.level = 20;
    menu.refresh();
    click('Use');
    assert.equal(unit.classId, id === 'linus' ? 'bloodsworn' : 'veilstalker');
    assert.equal(changes, 1);
    assert.equal(promotions, 1);
    assert.ok(![...unit.inventory, ...convoy].includes(emblem));
    assert.equal(unit.acted, false);
    assert.equal(unit.moved, false);
    use.dispatchEvent(new Event('click'));
    assert.equal(changes, 1);
    dialog.close();
    await closed;
  }
});

test('the real map Blood Oath action validates allies and cancellation, then applies the cost and protection at cast impact', async () => {
  const caster = { ...promote('linus'), x: 0, z: 0, hp: 20 };
  const target = { ...characters.createMaria(), x: 1, z: 0 };
  const gameState = { phase: 'player', selected: true, mode: 'unit' };
  let rows, finished = 0, message;
  const context = {
    ...covenant, player: caster, playerTeam: [caster, target], gameState, getFacing: grid.getFacing,
    combatants: new Set(), renderTacticalUi() {}, refreshUnitTint() {}, showCombatResult() {},
    setMessage(value) { message = value; }, healDialog: { open: true, close() { this.open = false; } },
    showStaffDialog(heading, choices) { rows = choices; },
    async castStaff(unit, ally, rite, hit, impact) {
      assert.equal(unit.hp, 20);
      assert.equal(ally.bloodOath, undefined);
      assert.equal(rite, covenant.BLOOD_OATH);
      assert.equal(hit, true);
      impact();
    },
    finishUnit() { finished++; },
  };
  const source = main.slice(main.indexOf('function openBloodOath()'), main.indexOf('function showHealTargets('));
  runInNewContext(`${source}\nglobalThis.open = openBloodOath; globalThis.use = useBloodOath;`, context);
  context.open();
  assert.equal(rows.length, 1);
  assert.equal(caster.hp, 20, 'opening/canceling the picker is free');
  assert.equal(caster.acted, false);
  await context.use({ ...target, id: 'enemy' });
  assert.equal(caster.hp, 20);
  assert.match(message, /no longer available/);
  await context.use(target);
  assert.equal(caster.hp, 14);
  assert.equal(caster.acted, true);
  assert.equal(target.bloodOath, true);
  assert.equal(finished, 1);
  await context.use(target);
  assert.equal(caster.hp, 14);
  assert.equal(finished, 1);
});

test('the actual inventory promotion action accepts Covenant Emblems, blocks stale uses and spends the battle action', async () => {
  for (const id of ['linus', 'stark']) {
    const unit = id === 'linus' ? characters.createLinusAlly() : characters.createStarkAlly();
    unit.level = 20;
    const emblem = { id: 'covenant-emblem', uses: 1 };
    unit.inventory.push(emblem);
    const gameState = { selected: true, mode: 'inventory' };
    let finished = 0;
    const context = {
      ...classes, ...inventory, player: unit, gameState, combatants: new Set(),
      closeInventory() { gameState.mode = 'unit'; }, renderTacticalUi() {}, setMessage() {},
      snapshotForPromotion: () => ({}), portraitUrl: profile.portraitUrl,
      refreshUnitAppearance() {}, async playPromotionGlow(unit, impact) { impact(); },
      promotionDialogUi: { async show() {} }, capitalize: (value) => value, async wait() {},
      finishUnit() { unit.acted = true; finished++; },
    };
    const source = main.slice(main.indexOf('async function useMasterEmblem('), main.indexOf('async function useBoosterItem('));
    runInNewContext(`${source}\nglobalThis.use = useMasterEmblem;`, context);
    await context.use(emblem);
    assert.equal(unit.classId, id === 'linus' ? 'bloodsworn' : 'veilstalker');
    assert.ok(!unit.inventory.includes(emblem));
    assert.equal(finished, 1);
    await context.use(emblem);
    assert.equal(finished, 1);
  }
});
