import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

let server;
let profile;

before(async () => {
  server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: 'custom' });
  profile = await server.ssrLoadModule('/src/characters/profile-dialog.js');
});

after(async () => {
  await server?.close();
});

test('weapon levels list every class weapon type with rank progress toward the next rank', () => {
  const rows = profile.weaponLevelRows({
    classId: 'paladin',
    weapon: { type: 'Sword' },
    weaponExp: { Spear: 95, Sword: 250 },
  });
  assert.deepEqual(rows.map((row) => row.type), ['Spear', 'Sword', 'Axe']);
  const [spear, sword, axe] = rows;
  assert.equal(spear.rank.id, 'C');
  assert.equal(spear.next.id, 'B');
  assert.equal(spear.progress, (95 - 70) / (120 - 70));
  assert.equal(sword.rank.id, 'S');
  assert.equal(sword.next, undefined);
  assert.equal(sword.progress, 1);
  assert.ok(sword.equipped && !spear.equipped);
  assert.equal(axe.exp, 0);
  assert.equal(axe.rank.id, 'E');
  assert.ok(rows.every((row) => row.usable && row.tracked));
});

test('weapon types trained before a class change stay listed but marked unusable', () => {
  const rows = profile.weaponLevelRows({ classId: 'sage', weaponExp: { Anima: 40, Sword: 12, Tome: 5 } });
  assert.deepEqual(rows.map((row) => [row.type, row.usable]), [['Anima', true], ['Staff', true], ['Sword', false]]);
});

test('enemies without weapon EXP show their weapon types as untracked', () => {
  const rows = profile.weaponLevelRows({ classId: 'deep-merfolk', weapon: { type: 'Spear' } });
  assert.deepEqual(rows.map((row) => row.type), ['Axe', 'Spear']);
  assert.ok(rows.every((row) => !row.tracked && row.rank.id === 'E'));
});

test('each player weapon type has an icon', () => {
  for (const type of ['Sword', 'Spear', 'Axe', 'Bow', 'Gun', 'Anima', 'Light', 'Dark', 'Staff', 'Claw']) {
    assert.ok(profile.weaponTypeIcon(type), type);
  }
});

test('Veilstalker profile distinguishes phase movement from permanent stat gains', async (t) => {
  const { createStarkAlly } = await server.ssrLoadModule('/src/characters/characters.js');
  const { promoteUnit } = await server.ssrLoadModule('/src/characters/classes.js');
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  t.after(() => previous ? Object.defineProperty(globalThis, 'document', previous) : delete globalThis.document);
  const node = () => ({
    children: [], style: {}, title: '', classList: { add() {}, toggle() {} },
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = children; },
    setAttribute() {}, addEventListener() {}, focus() {}, showModal() {},
  });
  globalThis.document = { createElement: node };
  const nodes = new Map();
  const dialog = { ...node(), querySelectorAll: () => [], querySelector(selector) {
    if (!nodes.has(selector)) nodes.set(selector, node());
    return nodes.get(selector);
  } };
  const stark = { ...createStarkAlly(), level: 20 };
  promoteUnit(stark, 'covenant-emblem');
  stark.movement++;
  stark.bloodTrailBonus = 2;
  const ui = profile.createProfileDialog(dialog);
  const terrain = { name: 'Road', defense: 0, avoid: 0 };
  ui.show(stark, null, terrain, terrain);
  const movement = () => nodes.get('#profile-stats').children.find((row) => row.children[0].textContent === 'Movement').children[1];
  assert.equal(movement().textContent, '8');
  assert.equal(movement().title, 'Base 5 · +1 gained · +2 Blood Trail (this phase)');
  assert.equal(stark.movement, 6);
  delete stark.bloodTrailBonus;
  ui.show(stark, null, terrain, terrain);
  assert.equal(movement().textContent, '6');
  assert.equal(movement().title, 'Base 5 · +1 gained');
});
