import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { createServer } from 'vite';

let server;
let characters;
let inventory;
let insight;
let combat;
let classes;
const previousImage = Object.getOwnPropertyDescriptor(globalThis, 'Image');

before(async () => {
  globalThis.Image = class {
    set src(value) { this.url = value; queueMicrotask(() => this.onload()); }
  };
  server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: 'custom' });
  characters = await server.ssrLoadModule('/src/characters/characters.js');
  inventory = await server.ssrLoadModule('/src/characters/inventory.js');
  insight = await server.ssrLoadModule('/src/game/insight.js');
  combat = await server.ssrLoadModule('/src/battle/combat.js');
  classes = await server.ssrLoadModule('/src/characters/classes.js');
});

after(async () => {
  await server?.close();
  if (previousImage) Object.defineProperty(globalThis, 'Image', previousImage);
  else delete globalThis.Image;
});

beforeEach(() => {
  insight.restoreInsight(null);
  inventory.setConvoy([]);
});

const item = (id) => inventory.INVENTORY_ITEMS.get(id);
function gunner(id = 'evelynn', uses = item(id).maxUses) {
  const unit = characters.createMaria();
  classes.applyClass(unit, 'ravager');
  unit.weapon = item(id);
  unit.inventory = [{ id, uses }];
  return unit;
}

test('ancient relics are reliable rank-B weapons, with no killer or special-effect niche', async () => {
  for (const [id, type, classId, might, weight, hit, range] of [
    ['starless-edge', 'Sword', 'ravager', 13, 8, 85, 1],
    ['tidepiercer', 'Spear', 'paladin', 14, 10, 80, 1],
    ['keelbreaker', 'Axe', 'general', 16, 12, 75, 1],
    ['horizon-string', 'Bow', 'sniper', 12, 8, 85, 2],
  ]) {
    const weapon = item(id);
    assert.deepEqual([weapon.type, weapon.might, weapon.weight, weapon.hit, weapon.minRange, weapon.maxRange],
      [type, might, weight, hit, range, range], id);
    assert.equal(weapon.requiredRank, 'B');
    assert.equal(weapon.damageType, 'physical');
    assert.equal(weapon.critical, 0);
    assert.deepEqual(weapon.effect, []);
    assert.equal(weapon.maxUses, undefined);
    for (const effect of ['brave', 'reaves', 'halvesResistance', 'halvesCurrentHp', 'exclusiveTo']) {
      assert.equal(weapon[effect], undefined, `${id}: ${effect}`);
    }
    assert.match(weapon.lore, /drowned civilization/);
    const unit = characters.createMaria();
    classes.applyClass(unit, classId);
    unit.weaponExp = { [type]: 119 };
    inventory.grantItem(unit, id);
    assert.equal(inventory.weaponUseBlockReason(unit, weapon), `Needs ${type} rank B`);
    unit.weaponExp[type] = 120;
    assert.equal(inventory.weaponUseBlockReason(unit, weapon), undefined);
    inventory.equipAttackWeapon(unit, weapon);
    assert.equal(unit.weapon.id, id);
    assert.ok(inventory.attackWeapons(unit).includes(weapon));
    inventory.spendWeaponUse(unit);
    assert.equal(inventory.findWeaponEntry(unit).uses, null);
    const png = await readFile(new URL(`../${weapon.sprite}`, import.meta.url));
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
    assert.equal(png.readUInt32BE(16), 64);
    assert.equal(png.readUInt32BE(20), 64);
    assert.ok(weapon.spriteUrl);
  }
  for (const id of ['killing-edge', 'killer-axe', 'killer-bow']) assert.equal(item(id).critical, 30);
  const archer = gunner();
  archer.weapon = item('horizon-string');
  assert.equal(combat.isWeaponEffective(archer, { type: 'flying' }), true);
});

test('Evelynn changes only the pistol name, presentation, brave flag and capacity', async () => {
  const base = item('hunter-pistol');
  const evolved = item('evelynn');
  for (const key of ['type', 'damageType', 'might', 'weight', 'hit', 'critical', 'minRange', 'maxRange',
    'effect', 'sound', 'requiredRank', 'exclusiveTo']) assert.deepEqual(evolved[key], base[key], key);
  assert.equal(evolved.name, 'Evelynn');
  assert.equal(evolved.brave, true);
  assert.equal(evolved.maxUses, 20);
  assert.equal(base.maxUses, 10);
  assert.equal(classes.canEquipWeapon(characters.createMaria(), evolved), false);
  assert.equal(classes.canEquipWeapon(gunner(), evolved), true);
  const png = await readFile(new URL(`../${evolved.sprite}`, import.meta.url));
  assert.equal(png.readUInt32BE(16), 64);
  assert.equal(png.readUInt32BE(20), 64);
  assert.ok(evolved.spriteUrl);
});

test('pistol evolution spends exactly 20 Insight, requires ownership and refunds once across restore', () => {
  const unit = gunner('hunter-pistol', 7);
  insight.restoreInsight({ insight: 19 });
  assert.equal(insight.evolveWeapon('hunter-pistol', [unit]), false);
  insight.addInsight(1);
  assert.equal(insight.evolveWeapon('hunter-pistol', []), false);
  assert.equal(insight.getInsight(), 20);
  assert.equal(insight.evolveWeapon('hunter-pistol', [unit]), true);
  assert.equal(insight.getInsight(), 0);
  assert.equal(unit.weapon.id, 'evelynn');
  assert.deepEqual(unit.inventory, [{ id: 'evelynn', uses: 7 }]);
  assert.equal(insight.evolveWeapon('hunter-pistol', [unit]), false);
  insight.restoreInsight(JSON.parse(JSON.stringify(insight.snapshotInsight())));
  assert.equal(insight.isEvolved('hunter-pistol'), true);
  assert.equal(insight.revertEvolution('hunter-pistol', []), false);
  assert.equal(insight.getInsight(), 0);
  assert.equal(insight.revertEvolution('hunter-pistol', [unit]), true);
  assert.equal(insight.getInsight(), 20);
  assert.equal(unit.weapon.id, 'hunter-pistol');
  assert.equal(insight.revertEvolution('hunter-pistol', [unit]), false);
});

test('evolve/revert never reloads a pistol; refill uses the current capacity, including convoy copies', () => {
  const unit = gunner('hunter-pistol', 0);
  insight.restoreInsight({ insight: 20 });
  assert.equal(insight.evolveWeapon('hunter-pistol', [unit]), true);
  assert.equal(unit.inventory[0].uses, 0);
  assert.equal(combat.canAttack(unit), false);
  inventory.refreshMagicUses(unit.inventory, unit);
  assert.equal(unit.inventory[0].uses, 20);
  inventory.spendWeaponUse(unit);
  assert.equal(insight.revertEvolution('hunter-pistol', [unit]), true);
  assert.equal(unit.inventory[0].uses, 10);
  assert.equal(insight.evolveWeapon('hunter-pistol', [unit]), true);
  assert.equal(unit.inventory[0].uses, 10);
  assert.equal(insight.revertEvolution('hunter-pistol', [unit]), true);
  unit.inventory[0].uses = 3;
  inventory.setConvoy(unit.inventory);
  unit.inventory = [];
  unit.weapon = null;
  assert.equal(insight.evolveWeapon('hunter-pistol', [unit], inventory.convoy), true);
  assert.deepEqual(inventory.convoy, [{ id: 'evelynn', uses: 3 }]);
  inventory.refreshMagicUses(inventory.convoy);
  assert.equal(inventory.convoy[0].uses, 20);
  assert.equal(insight.revertEvolution('hunter-pistol', [], inventory.convoy), true);
  assert.equal(inventory.convoy[0].uses, 10);
});

test('finite reforging respects existing class capacity multipliers and legacy null ammo', () => {
  const unit = gunner('hunter-pistol', 18);
  classes.applyClass(unit, 'sage');
  insight.restoreInsight({ insight: 20 });
  assert.equal(insight.evolveWeapon('hunter-pistol', [unit]), true);
  assert.equal(unit.inventory[0].uses, 18);
  assert.equal(inventory.maxUsesFor(unit.weapon, unit), 40);
  inventory.refreshMagicUses(unit.inventory, unit);
  assert.equal(unit.inventory[0].uses, 40);
  assert.equal(insight.revertEvolution('hunter-pistol', [unit]), true);
  assert.equal(unit.inventory[0].uses, 20);
  unit.inventory[0].uses = null;
  assert.equal(insight.evolveWeapon('hunter-pistol', [unit]), true);
  assert.equal(unit.inventory[0].uses, 20);
  assert.equal(insight.revertEvolution('hunter-pistol', [unit]), true);
  assert.equal(unit.inventory[0].uses, 20);
});

test('new evolutions without a paid field refund their own cost rather than the old personal price', () => {
  const unit = gunner();
  insight.restoreInsight({ evolved: { 'hunter-pistol': true } });
  assert.equal(insight.revertEvolution('hunter-pistol', [unit]), true);
  assert.equal(insight.getInsight(), 20);
});

test('the existing Insight menu exposes Evelynn evolve and revert with its correct price and stats', async (t) => {
  class Element extends EventTarget {
    constructor(tag) {
      super();
      this.tag = tag;
      this.children = [];
      this.classList = new Set();
      this.textContent = '';
    }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    setAttribute() {}
    focus() {}
    showModal() { this.open = true; }
    close() { this.open = false; this.dispatchEvent(new Event('close')); }
    all() { return [this, ...this.children.flatMap((node) => node.all())]; }
    querySelector() { return this.all().find((node) => node.tag === 'button' && !node.disabled); }
  }
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  globalThis.document = { createElement: (tag) => new Element(tag) };
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else delete globalThis.document;
  });
  const { createPrepMenu } = await server.ssrLoadModule('/src/game/prep-menu.js');
  const unit = gunner('hunter-pistol', 6);
  const dialog = new Element('dialog');
  insight.restoreInsight({ insight: 20 });
  let changes = 0;
  const menu = createPrepMenu({
    dialog, getTeam: () => [unit], getConvoy: () => [], items: inventory.INVENTORY_ITEMS,
    statItems: {}, maxSize: 5, maxDeployed: 12, isDeployed: () => true,
    portrait: () => null, getInfo: () => ({ chapter: 'Test', objective: 'Test' }),
    onChange() { changes++; menu.refresh(); },
  });
  const click = (label) => {
    const node = dialog.all().find((node) => node.tag === 'button' && !node.disabled &&
      node.all().map((child) => child.textContent).join('') === label);
    assert.ok(node, label);
    node.dispatchEvent(new Event('click'));
  };
  const closed = menu.show();
  click('Insight (20)');
  assert.ok(dialog.all().some((node) => /Evelynn.*Mt 6.*Wt 4.*Hit 80.*Crit 5.*20 uses/.test(node.textContent)));
  click('Evolve (20 Insight)');
  assert.equal(unit.weapon.id, 'evelynn');
  assert.equal(unit.inventory[0].uses, 6);
  assert.equal(insight.getInsight(), 0);
  click('Revert');
  assert.equal(unit.weapon.id, 'hunter-pistol');
  assert.equal(insight.getInsight(), 20);
  assert.equal(changes, 2);
  dialog.close();
  await closed;
});

test('Evelynn brave volleys precede replies on initiation and counterattack, capped per shot', () => {
  const attacker = gunner();
  const counter = gunner('hunter-pistol');
  attacker.speed = counter.speed = 10;
  assert.equal(combat.getAttackCount(attacker, counter), 1);
  assert.equal(combat.getStrikesPerAttack(attacker), 2);
  assert.deepEqual(combat.getCombatStrikeOrder(attacker, counter, 1, 1), ['attacker', 'attacker', 'counter']);
  assert.deepEqual(combat.getCombatStrikeOrder(counter, attacker, 1, 1), ['attacker', 'counter', 'counter']);
  attacker.speed += 4;
  assert.equal(combat.getAttackCount(attacker, counter), 2);
  assert.deepEqual(combat.getCombatStrikeOrder(attacker, counter, 2, 1),
    ['attacker', 'attacker', 'counter', 'attacker', 'attacker']);
  for (const [uses, expected] of [
    [3, ['attacker', 'attacker', 'counter', 'attacker']],
    [1, ['attacker', 'counter']],
    [0, ['counter']],
  ]) {
    attacker.inventory[0].uses = uses;
    assert.equal(combat.getAvailableStrikeCount(attacker, 4), uses);
    assert.deepEqual(combat.getCombatStrikeOrder(attacker, counter, 2, 1), expected);
  }
  attacker.inventory[0].uses = 2;
  counter.inventory[0].uses = 1;
  for (const side of combat.getCombatStrikeOrder(attacker, counter, 1, 1)) {
    const unit = side === 'attacker' ? attacker : counter;
    assert.equal(combat.canAttack(unit), true);
    inventory.spendWeaponUse(unit);
  }
  assert.equal(attacker.inventory[0].uses, 0);
  assert.equal(counter.inventory[0].uses, 0);
  assert.equal(combat.canAttack(attacker), false);
  assert.equal(combat.canAttack(counter), false);
  const tome = characters.createCypherAlly();
  tome.inventory[0].uses = 1;
  assert.equal(combat.getAvailableStrikeCount(tome, 2), 2);
});

async function runMainCombat(phase, attacker, counter, hit = true) {
  const source = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  const start = phase === 'player'
    ? source.indexOf('  const terrain = getTerrain(activeLevel, target.x, target.z);', source.indexOf('async function attackRaider('))
    : source.indexOf('      const terrain = getTerrain(activeLevel, foe.x, foe.z);');
  const end = source.indexOf(phase === 'player' ? '\n  if (target.hp === 0) {' : '\n      setMessage(hits === 0', start);
  assert.ok(start > 0 && end > start, `${phase} combat body`);
  const shots = [];
  const noop = () => {};
  const context = {
    ...combat, player: attacker, target: counter, enemy: attacker, foe: counter,
    playerTeam: [counter], activeLevel: {},
    getTerrain: () => ({}), distanceBetween: () => 1, getFacing: () => 'south',
    rollHit: () => hit, rollCritical: () => false,
    spendWeaponUse: inventory.spendWeaponUse,
    setIdleSprite: noop, setMessage: noop, showCombatResult: noop,
    renderTacticalUi: noop, recordWeaponHit: noop, wait: noop,
    attack: () => shots.push('attacker'),
    attackEnemy: () => shots.push('counter'),
    playAttackAnimation: (unit) => shots.push(unit === attacker ? 'attacker' : 'counter'),
  };
  await runInNewContext(`(async () => { ${source.slice(start, end)} })()`, context);
  return shots;
}

test('Nosferatu drains on all four actual attack/counter paths, caps overkill and never heals on misses', async () => {
  inventory.setUnlockedSpells(['nosferatu']);
  const caster = () => {
    const unit = characters.createCorvisAlly();
    unit.weaponExp.Dark = 180;
    unit.weapon = inventory.INVENTORY_ITEMS.get('nosferatu');
    unit.inventory[0].spells = { nosferatu: 4 };
    Object.assign(unit, { hp: 20, maxHp: 100, magic: 30, resistance: 20, speed: 10, build: 20 });
    return unit;
  };
  for (const phase of ['player', 'enemy']) {
    const attacker = caster(), counter = caster();
    counter.hp = 30;
    assert.deepEqual(await runMainCombat(phase, attacker, counter), ['attacker', 'counter']);
    assert.equal(attacker.hp, 9);
    assert.equal(counter.hp, 19);
    const killer = caster(), victim = caster();
    victim.hp = 3;
    assert.deepEqual(await runMainCombat(phase, killer, victim), ['attacker']);
    assert.equal(killer.hp, 21, 'only three actual damage heals one HP');
    const missed = caster(), avoided = caster();
    await runMainCombat(phase, missed, avoided, false);
    assert.equal(missed.hp, 20);
    assert.equal(avoided.hp, 20);
  }
  inventory.setUnlockedSpells([]);
});

test('both actual main combat loops spend gun ammo per fired shot, including misses and final rounds', async () => {
  for (const phase of ['player', 'enemy']) {
    for (const hit of [true, false]) {
      const attacker = gunner('evelynn', 3);
      const counter = gunner('evelynn', 1);
      attacker.hp = counter.hp = 100;
      attacker.speed = counter.speed = 10;
      attacker.speed += 4;
      attacker.luck = counter.luck = 100;
      const attackerDamage = combat.getCombatDamage(attacker, counter);
      const counterDamage = combat.getCombatDamage(counter, attacker);
      assert.deepEqual(await runMainCombat(phase, attacker, counter, hit),
        ['attacker', 'attacker', 'counter', 'attacker'], phase);
      assert.equal(attacker.inventory[0].uses, 0);
      assert.equal(counter.inventory[0].uses, 0);
      assert.equal(counter.hp, 100 - (hit ? attackerDamage * 3 : 0));
      assert.equal(attacker.hp, 100 - (hit ? counterDamage : 0));
    }
  }
});

test('both main combat paths preserve unfired rounds when a brave first shot kills or its counter kills', async () => {
  for (const phase of ['player', 'enemy']) {
    const attacker = gunner('evelynn', 20);
    const counter = gunner('evelynn', 20);
    counter.hp = 1;
    assert.deepEqual(await runMainCombat(phase, attacker, counter), ['attacker']);
    assert.equal(attacker.inventory[0].uses, 19);
    assert.equal(counter.inventory[0].uses, 20);

    const loneShot = gunner('hunter-pistol', 1);
    const defender = gunner('evelynn', 20);
    loneShot.hp = 1;
    loneShot.speed = defender.speed = 10;
    defender.defense = 99;
    assert.deepEqual(await runMainCombat(phase, loneShot, defender), ['attacker', 'counter']);
    assert.equal(loneShot.inventory[0].uses, 0);
    assert.equal(defender.inventory[0].uses, 19);
  }
});

test('both main combat loops preserve tome per-combat spending and empty guns cannot retaliate', async () => {
  for (const phase of ['player', 'enemy']) {
    const attacker = characters.createCypherAlly();
    const counter = gunner('evelynn', 0);
    attacker.inventory[0].uses = 1;
    attacker.hp = counter.hp = 100;
    attacker.speed = 30;
    counter.speed = 5;
    const damage = combat.getCombatDamage(attacker, counter);
    assert.deepEqual(await runMainCombat(phase, attacker, counter), ['attacker', 'attacker']);
    assert.equal(attacker.inventory[0].uses, 0);
    assert.equal(counter.inventory[0].uses, 0);
    assert.equal(counter.hp, 100 - damage * 2);
  }
});

test('the actual main forecast caps both sides to loaded rounds and hides an empty counterattack', async () => {
  const source = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  const start = source.indexOf('function showCombatForecast(target) {');
  const end = source.indexOf('\nfunction wait(', start);
  class Element {
    constructor() { this.children = []; this.textContent = ''; }
    append(...children) { this.children.push(...children); }
    replaceChildren() { this.children = []; }
    all() { return [this, ...this.children.flatMap((child) => child.all())]; }
  }
  for (const [ammo, expectedCounter] of [[1, true], [0, false]]) {
    const player = gunner('evelynn', 3);
    const target = gunner('evelynn', ammo);
    player.speed = 30;
    target.speed = 5;
    const panels = [new Element(), new Element()];
    const context = {
      ...combat, player, activeLevel: {}, pendingCombatTarget: null,
      gameState: {}, cursorOutline: {},
      getTerrain: () => ({}), distanceBetween: () => 1, capitalize: (value) => value,
      setMessage() {}, renderTacticalUi() {},
      document: { createElement: () => new Element(), querySelector: () => new Element() },
      combatForecastDialog: { querySelectorAll: () => panels, showModal() {} },
    };
    const show = runInNewContext(`${source.slice(start, end)}; showCombatForecast`, context);
    show(target);
    const damageText = (panel) => {
      const nodes = panel.all();
      return nodes[nodes.findIndex((node) => node.textContent === 'Damage') + 1].textContent;
    };
    assert.match(damageText(panels[0]), /× 3 /);
    if (expectedCounter) assert.match(damageText(panels[1]), /× 1 /);
    else {
      assert.equal(damageText(panels[1]), '—');
      assert.ok(panels[1].all().some((node) => node.textContent === 'Cannot counter at this range.'));
    }
  }
});

test('saved Evelynn ammo, equipped ID, convoy and 20-Insight refund survive validated save reload', async (t) => {
  const saves = await server.ssrLoadModule('/src/game/save.js');
  const levels = await server.ssrLoadModule('/src/levels/level.js');
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const storage = new Map();
  globalThis.localStorage = { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
  t.after(() => {
    if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage);
    else delete globalThis.localStorage;
  });
  const raw = JSON.parse(await readFile(new URL('../data/levels/map_06_hollow_wood.json', import.meta.url), 'utf8'));
  const level = levels.validateLevel(raw);
  const unit = Object.assign(gunner('hunter-pistol', 4), level.spawn);
  insight.restoreInsight({ insight: 20 });
  insight.evolveWeapon('hunter-pistol', [unit]);
  saves.writeSave(saves.createSaveData(level, unit, [], { turn: 1, phase: 'player', defeated: false },
    { chapter: 6, insight: insight.snapshotInsight(), convoy: [{ id: 'starless-edge', uses: null }, { id: 'evelynn', uses: 40 }] }));
  const restored = saves.readSave();
  assert.ok(restored);
  assert.equal(restored.player.equippedWeaponId, 'evelynn');
  assert.deepEqual(restored.convoy, [{ id: 'starless-edge', uses: null }, { id: 'evelynn', uses: 40 }]);
  insight.restoreInsight(restored.insight);
  const loaded = gunner();
  inventory.restoreMariaInventory(loaded, restored.player.inventory, restored.player.equippedWeaponId);
  assert.equal(loaded.weapon.id, 'evelynn');
  assert.equal(inventory.findWeaponEntry(loaded).uses, 4);
  assert.equal(insight.revertEvolution('hunter-pistol', [loaded]), true);
  assert.equal(inventory.findWeaponEntry(loaded).uses, 4);
  assert.equal(insight.getInsight(), 20);
});
