import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { createServer } from 'vite';
import { drawLethality, LETHALITY_IMPACT_MS } from '../src/battle/battle-effects.js';
import { battleImpactTime, battleStrikePose } from '../src/battle/battle-animation.js';
import { LETHALITY_HITSTOP_MS } from '../src/battle/battle-effects.js';

let server, combat, characters, classes, inventory, covenant, main;
before(async () => {
  server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: 'custom' });
  [combat, characters, classes, inventory, covenant] = await Promise.all([
    '/src/battle/combat.js', '/src/characters/characters.js', '/src/characters/classes.js',
    '/src/characters/inventory.js', '/src/game/covenant.js',
  ].map(path => server.ssrLoadModule(path)));
  main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
});
after(async () => { await server?.close(); });

function assassin(weaponId = 'iron-sword') {
  const unit = characters.createLenaAlly();
  classes.applyClass(unit, 'assassin');
  unit.weapon = inventory.INVENTORY_ITEMS.get(weaponId);
  unit.inventory = inventory.createInventory([weaponId]);
  return unit;
}

function sequence(values) {
  let index = 0;
  return () => {
    assert.ok(index < values.length, 'unexpected extra RNG roll');
    return values[index++];
  };
}

test('Assassins keep Lockpick, Pickpocket and +15 Crit while Thieves never gain Lethality', () => {
  const lena = assassin();
  const abilities = classes.getClassAbilities(lena);
  assert.ok(abilities.some(ability => ability.lockpick));
  assert.ok(abilities.some(ability => ability.steal));
  const lethality = abilities.find(ability => ability.id === 'lethality');
  assert.equal(lethality.critBonus, 15);
  assert.equal(lethality.lethalityChance, .5);
  assert.ok(!classes.getClassAbilities(characters.createLenaAlly()).some(ability => ability.lethalityChance));
});

test('Lethality is exactly 50% of landed criticals, never misses or normal hits, for swords and bows', () => {
  for (const weaponId of ['iron-sword', 'iron-bow']) {
    const lena = assassin(weaponId);
    for (const roll of [0, .499999, .5, .999999]) {
      const result = combat.rollStrikeResult(lena, 100, 100, sequence([0, 0, 0, roll]));
      assert.deepEqual(result, { hit: true, critical: true, lethality: roll < .5 });
    }
    let triggered = 0;
    for (let index = 0; index < 1000; index++) {
      triggered += Number(combat.rollStrikeResult(lena, 100, 100, sequence([0, 0, 0, index / 1000])).lethality);
    }
    assert.equal(triggered, 500);
    assert.deepEqual(combat.rollStrikeResult(lena, 0, 100, sequence([.99, .99])),
      { hit: false, critical: false, lethality: false });
    assert.deepEqual(combat.rollStrikeResult(lena, 100, 0, sequence([0, 0, .99])),
      { hit: true, critical: false, lethality: false });
  }
  for (const unit of [characters.createLenaAlly(), characters.createMaria(), characters.createEnemyUnit('bell-berserker', 0, 0)]) {
    assert.deepEqual(combat.rollStrikeResult(unit, 100, 100, sequence([0, 0, 0])),
      { hit: true, critical: true, lethality: false });
  }
});

test('Lethality kills bosses through zero normal damage and Blood Oath, returns actual HP lost for lifesteal', () => {
  const lena = assassin();
  const boss = characters.createEnemyUnit('voss', 1, 0);
  Object.assign(boss, { hp: 1000, maxHp: 1000, defense: 1000, resistance: 1000, bloodOath: true, isBoss: true });
  assert.equal(combat.getCriticalDamage(lena, boss), 0);
  const damage = covenant.applyCombatDamage(boss, 0, { lethal: true });
  assert.equal(damage, 1000);
  assert.equal(boss.hp, 0);
  assert.equal(boss.bloodOath, undefined);
  assert.equal(covenant.applyCombatDamage(boss, 0, { lethal: true }), 0);
  Object.assign(lena, { hp: 5, maxHp: 30, weapon: { ...lena.weapon, lifeSteal: .5 } });
  assert.equal(combat.healDamageDealt(lena, damage), 25);
  const ordinary = { hp: 100, bloodOath: true };
  assert.equal(covenant.applyCombatDamage(ordinary, 9, { lethal: false }), 5);
  assert.equal(ordinary.hp, 95);
});

test('A failed Lethality roll remains an ordinary triple-damage critical', () => {
  const lena = assassin();
  const target = characters.createEnemyUnit('bell-berserker', 1, 0);
  Object.assign(lena, { strength: 20 });
  Object.assign(target, { hp: 100, maxHp: 100, defense: 5 });
  const result = combat.rollStrikeResult(lena, 100, 100, sequence([0, 0, 0, .5]));
  assert.equal(result.critical, true);
  assert.equal(result.lethality, false);
  const normal = combat.getCombatDamage(lena, target);
  assert.ok(normal > 0 && normal * 3 < 100);
  const critical = combat.getCriticalDamage(lena, target);
  assert.equal(critical, normal * 3);
  assert.equal(covenant.applyCombatDamage(target, critical, { lethal: result.lethality }), critical);
  assert.equal(target.hp, 100 - critical);
});

test('Both live combat loops resolve Lethality on initiation and counterattack, once at impact and stop followups', async () => {
  const playerStart = main.indexOf('  const terrain = getTerrain(activeLevel, target.x, target.z);', main.indexOf('async function attackRaider('));
  const playerEnd = main.indexOf('\n  if (target.hp === 0) {\n    scene.remove', playerStart);
  const enemyStart = main.indexOf('      const terrain = getTerrain(activeLevel, foe.x, foe.z);', main.indexOf('async function enemyPhase('));
  const enemyEnd = main.indexOf('\n      setMessage(hits === 0', enemyStart);
  assert.ok(playerStart > 0 && playerEnd > playerStart && enemyStart > 0 && enemyEnd > enemyStart);
  for (const weaponId of ['iron-sword', 'iron-bow']) for (const phase of ['player', 'enemy']) for (const counter of [false, true]) {
    const lena = assassin(weaponId);
    const victim = characters.createEnemyUnit('bell-berserker', 1, 0);
    Object.assign(victim, { hp: 1000, maxHp: 1000, defense: 1000, bloodOath: true, isBoss: true });
    const initiator = counter ? victim : lena;
    const defender = counter ? lena : victim;
    const shown = [], strikes = [], uses = [];
    let impacts = 0, ended = 0;
    const context = {
      ...combat, ...covenant,
      player: initiator, target: defender, enemy: initiator, foe: defender,
      activeLevel: {}, playerTeam: [lena], gameState: {}, getTerrain: () => ({}), distanceBetween: () => 1,
      isInWeaponRange: () => true, getAttackCount: () => 2,
      rollStrikeResult: unit => unit === lena
        ? combat.rollStrikeResult(unit, 100, 100, sequence([0, 0, 0, .49]))
        : { hit: false, critical: false, lethality: false },
      spendWeaponUse: unit => uses.push(unit), getFacing: () => 'east', setIdleSprite() {},
      recordWeaponHit() {}, setMessage() {}, refreshUnitTint() {}, renderTacticalUi() {},
      beginCombatScene: async () => {}, battleScreen: { end: async () => { ended++; } },
      playCombatStrike: async (unit, result, _, applyImpact) => {
        strikes.push({ unit, result });
        if (result.lethality) assert.equal(victim.hp, 1000, 'not killed before animation contact');
        applyImpact();
        if (result.lethality) impacts++;
      },
      showCombatResult: (unit, text, type) => shown.push({ unit, text, type }),
    };
    const source = phase === 'player' ? main.slice(playerStart, playerEnd) : main.slice(enemyStart, enemyEnd);
    await runInNewContext(`(async () => {${source}\n})()`, context);
    assert.equal(victim.hp, 0, `${phase}, counter=${counter}, ${weaponId}`);
    assert.equal(lena.hp > 0, true);
    assert.equal(impacts, 1);
    assert.equal(ended, 1);
    assert.equal(strikes.length, counter ? 2 : 1);
    assert.equal(shown.filter(entry => entry.type === 'lethality').length, 1);
    assert.equal(shown.find(entry => entry.type === 'lethality').text, '-1000');
    assert.equal(uses.length, 2, 'ordinary weapon-use flow is unchanged');
  }
});

test('Lethality effect is target-centered, finite and uses no expanding ring or particles with reduced motion', () => {
  for (const reducedMotion of [false, true]) {
    const calls = [];
    const ctx = new Proxy({}, { set: () => true, get: (_, name) => (...args) => calls.push([name, ...args]) });
    for (const elapsed of [-1, LETHALITY_IMPACT_MS]) {
      drawLethality(ctx, { x: 350, y: 167, elapsed, width: 480, height: 270, reducedMotion });
      assert.equal(calls.length, 0);
    }
    drawLethality(ctx, { x: 350, y: 167, elapsed: 150, width: 480, height: 270, reducedMotion });
    assert.ok(calls.some(([name, x, y]) => name === 'translate' && x === 350 && y === 167));
    assert.equal(calls.filter(([name]) => name === 'fillRect').length, reducedMotion ? 1 : 13);
    assert.equal(calls.filter(([name]) => name === 'rotate').length, 2);
    assert.equal(calls.filter(([name]) => name === 'save').length, calls.filter(([name]) => name === 'restore').length);
    const radius = calls.find(([name]) => name === 'arc')[3];
    if (reducedMotion) assert.equal(radius, 30);
  }
});

test('Lethality holds the contact pose for 110ms, but normal criticals and reduced motion never freeze', async () => {
  const source = await readFile(new URL('../src/battle/battle-screen.js', import.meta.url), 'utf8');
  const start = source.indexOf('  function strikeState(elapsed)');
  const end = source.indexOf('\n  // The multi-hit critical', start);
  assert.ok(start > 0 && end > start);
  const clip = { frames: 10, impactFrame: 3, frameMs: 40, holdMs: 0, advance: 50 };
  for (const lethality of [false, true]) for (const reducedMotion of [false, true]) {
    let sampled;
    const context = {
      strike: { result: { lethality }, clip, spell: null },
      state: { reducedMotion }, battleImpactTime, LETHALITY_HITSTOP_MS,
      battleStrikePose: (_, elapsed) => { sampled = elapsed; return battleStrikePose(clip, elapsed); },
    };
    const contact = battleImpactTime(clip, null);
    for (const after of [-1, 0, 50, 110, 150]) {
      runInNewContext(`${source.slice(start, end)}\nstrikeState(${contact + after})`, context);
      assert.equal(sampled, contact + after - (lethality && !reducedMotion ? Math.min(110, Math.max(0, after)) : 0));
    }
  }
});

test('Compendium offers a forced Lethality preview only for Assassins and resets it on other branches', async () => {
  const source = await readFile(new URL('../src/gallery/character-gallery.js', import.meta.url), 'utf8');
  const start = source.indexOf('function updateCombat()');
  const end = source.indexOf('\nasync function render()', start);
  const elements = Object.fromEntries(['range', 'play', 'result', 'side', 'combat-note'].map(id =>
    [id, { value: id === 'result' ? 'lethality' : '1', options: [] }]));
  const context = {
    selectedWeapon: () => ({ type: 'Sword', minRange: 1, maxRange: 1 }),
    profile: {}, classId: 'assassin', busy: false,
    unitFor: (_, classId) => ({ classId }),
    getClassAbilities: classes.getClassAbilities, staffBattleKey: () => null, battleSpriteKey: () => 'sword',
    $: id => elements[id],
    options: (element, values) => { element.options = values; element.value = values[0].value; },
  };
  runInNewContext(`${source.slice(start, end)}\nupdateCombat()`, context);
  assert.equal(elements.result.value, 'lethality');
  assert.ok(elements.result.options.some(option => option.value === 'lethality'));
  context.classId = 'thief';
  runInNewContext('updateCombat()', context);
  assert.ok(!elements.result.options.some(option => option.value === 'lethality'));
  assert.equal(elements.result.value, 'normal');
});
