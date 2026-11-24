import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';

let server, combat;
const weapon = (type, damageType = 'magical') => ({
  type, damageType, might: 5, hit: 60, critical: 0, weight: 0, minRange: 1, maxRange: 2,
});
const unit = (type) => ({
  hp: 30, maxHp: 30, strength: 10, magic: 10, dexterity: 0, luck: 0,
  speed: 10, build: 10, defense: 5, resistance: 5, weapon: weapon(type),
});

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: 'custom',
  });
  combat = await server.ssrLoadModule('/src/battle/combat.js');
});
after(async () => { await server?.close(); });

test('all magic schools form the requested cycle in both attack directions', () => {
  const beats = { Anima: 'Light', Light: 'Dark', Dark: 'Anima' };
  for (const first of Object.keys(beats)) for (const second of Object.keys(beats)) {
    const expected = first === second ? 0 : beats[first] === second ? 1 : -1;
    assert.equal(combat.getTriangleAdvantage(weapon(first), weapon(second)), expected, `${first} vs ${second}`);
  }
});

test('magic advantage applies existing damage, Hit and Avoid modifiers symmetrically', () => {
  for (const [winner, loser] of [['Anima', 'Light'], ['Light', 'Dark'], ['Dark', 'Anima']]) {
    const attacker = unit(winner), defender = unit(loser), neutral = unit(winner);
    assert.equal(combat.getCombatDamage(attacker, neutral), 10);
    assert.equal(combat.getCombatDamage(attacker, defender), 11);
    assert.equal(combat.getCombatDamage(defender, attacker), 9, 'counterattacker has disadvantage');
    assert.equal(combat.getAvoid(attacker, {}, defender.weapon), 30);
    assert.equal(combat.getAvoid(defender, {}, attacker.weapon), 10);
    assert.equal(combat.getHitRate(attacker, neutral), 40);
    assert.equal(combat.getHitRate(attacker, defender), 60, 'Hit plus opposing Avoid uses existing triangle behavior');
    assert.equal(combat.getHitRate(defender, attacker), 20);
    assert.equal(combat.getCriticalRate(attacker, defender), combat.getCriticalRate(attacker, neutral));
    assert.equal(combat.getAttackCount(attacker, defender), combat.getAttackCount(attacker, neutral));
  }
});

test('physical weapons, staves, unarmed units and unsupported magic remain neutral to magic', () => {
  for (const type of ['Anima', 'Light', 'Dark']) {
    for (const other of [null, weapon('Staff'), weapon('Unknown'),
      ...['Sword', 'Spear', 'Axe', 'Bow', 'Gun', 'Claw'].map((physical) => weapon(physical, 'physical'))]) {
      assert.equal(combat.getTriangleAdvantage(weapon(type), other), 0);
      assert.equal(combat.getTriangleAdvantage(other, weapon(type)), 0);
    }
  }
  assert.equal(combat.getTriangleAdvantage(weapon('Sword', 'physical'), weapon('Axe', 'physical')), 1);
  assert.equal(combat.getTriangleAdvantage({ ...weapon('Anima'), reaves: ['Light'] }, weapon('Light')), 1,
    'physical reaver mechanics never reverse or double magic');
});

test('actual spell upgrades retain their school, including neutral elemental matchups', async () => {
  const spells = await Promise.all(['fire-tome', 'thunder-tome', 'wind-tome', 'light-tome', 'dark-tome',
    'inferno', 'luna', 'nosferatu'].map(async (id) =>
    JSON.parse(await readFile(new URL(`../data/weapons/${id}.json`, import.meta.url), 'utf8'))));
  for (const first of spells) for (const second of spells) {
    const expected = first.type === second.type ? 0 :
      { Anima: 'Light', Light: 'Dark', Dark: 'Anima' }[first.type] === second.type ? 1 : -1;
    assert.equal(combat.getTriangleAdvantage(first, second), expected, `${first.id} vs ${second.id}`);
  }
});

test('magic modifiers preserve damage/hit floors and special spell damage rules', () => {
  const attacker = unit('Dark'), defender = unit('Light');
  attacker.magic = 0;
  assert.equal(combat.getCombatDamage(attacker, defender), 0);
  attacker.weapon.hit = 0;
  assert.equal(combat.getHitRate(attacker, defender), 0);
  attacker.weapon.hit = 200;
  assert.equal(combat.getHitRate(attacker, defender), 100);
  attacker.weapon.halvesCurrentHp = true;
  assert.equal(combat.getCombatDamage(attacker, defender), 15, 'fixed half-HP magic is not altered');
  delete attacker.weapon.halvesCurrentHp;
  attacker.magic = 10;
  attacker.weapon.halvesResistance = true;
  assert.equal(combat.getCombatDamage(attacker, defender), 12, 'Resistance piercing still applies before triangle damage');
});

test('tutorial renders the magic cycle using Holy labels without altering the physical diagram', async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const element = () => ({ children: [], textContent: '', hidden: false,
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = children; },
    addEventListener() {}, focus() {} });
  const nodes = new Map(['kicker', 'title', 'body', 'visual', 'continue'].map((key) => [`#tutorial-${key}`, element()]));
  const shown = [];
  const dialog = {
    querySelector: (key) => nodes.get(key),
    classList: { toggle() {} },
    addEventListener(_name, listener) { this.onClose = listener; },
    showModal() {
      shown.push({ title: nodes.get('#tutorial-title').textContent,
        rows: nodes.get('#tutorial-visual').children.map((row) => row.children.map((child) => child.textContent)) });
      this.onClose();
    },
  };
  globalThis.document = { createElement: element };
  try {
    const tutorial = await server.ssrLoadModule('/src/game/tutorial.js');
    const popup = tutorial.createTutorialPopup(dialog);
    await popup.show('intro', tutorial.TRIANGLE_EFFECTS, { force: true });
    assert.deepEqual(shown.find((page) => page.title === 'The Magic Triangle').rows,
      [['Anima', 'beats', 'Holy (Light)'], ['Holy (Light)', 'beats', 'Dark'], ['Dark', 'beats', 'Anima']]);
    assert.deepEqual(shown.find((page) => page.title === 'The Weapon Triangle').rows,
      [['Lance', 'beats', 'Sword'], ['Sword', 'beats', 'Axe'], ['Axe', 'beats', 'Lance']]);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else delete globalThis.document;
  }
});
