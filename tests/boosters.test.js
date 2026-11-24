import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

let server;
let boosters;
let inventory;

before(async () => {
  server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: 'custom' });
  boosters = await server.ssrLoadModule('/src/characters/boosters.js');
  inventory = await server.ssrLoadModule('/src/characters/inventory.js');
});

after(async () => {
  await server?.close();
});

const STAT_ITEMS = {
  'giants-marrow': 'strength',
  'witchs-eye': 'magic',
  'surgeons-thread': 'dexterity',
  'gravediggers-coin': 'luck',
  'gargoyle-stone': 'defense',
  'saints-ash': 'resistance',
  'pilgrims-spur': 'movement',
  'pallbearers-burden': 'build',
};

const unit = (overrides = {}) => ({
  name: 'Maria', hp: 20, maxHp: 20, strength: 5, magic: 2, dexterity: 6, speed: 7, luck: 4,
  defense: 3, resistance: 1, movement: 5, build: 5, weaponExp: { Sword: 0 }, weapon: { type: 'Sword' }, ...overrides,
});

test('each stat booster is a one-use consumable that permanently adds 2 to its stat', () => {
  for (const [id, stat] of Object.entries(STAT_ITEMS)) {
    const item = inventory.INVENTORY_ITEMS.get(id);
    assert.equal(item?.itemType, 'consumable', id);
    assert.equal(item.maxUses, 1);
    assert.ok(item.spriteUrl, `${id} has a sprite`);
    assert.ok(boosters.isBooster(item));
    const target = unit();
    const before = target[stat];
    assert.equal(boosters.boosterBlockReason(target, item), null);
    assert.match(boosters.applyBooster(target, item), /\+2$/);
    assert.equal(target[stat], before + 2, id);
  }
});

test('Movement boosters work before or after either Rictor promotion and survive class restoration', async () => {
  const spur = inventory.INVENTORY_ITEMS.get('pilgrims-spur');
  const { applyClass, promoteUnit } = await server.ssrLoadModule('/src/characters/classes.js');
  for (const [classId, movement, emblem] of [['templar', 8, 'master-emblem'], ['oathbound', 6, 'covenant-emblem']]) {
    for (const boostFirst of [false, true]) {
      const target = unit({ id: 'rictor', classId: 'oathkeeper', level: 20, weapon: null });
      if (boostFirst) assert.equal(boosters.applyBooster(target, spur), 'Movement +2');
      promoteUnit(target, emblem);
      assert.equal(target.classId, classId);
      assert.equal(target.movement, movement + (boostFirst ? 2 : 0));
      if (!boostFirst) {
        assert.equal(boosters.boosterBlockReason(target, spur), null);
        assert.equal(boosters.applyBooster(target, spur), 'Movement +2');
      }
      applyClass(target, classId);
      assert.equal(target.movement, movement + 2);
    }
  }
});

test('the HP booster raises current HP alongside max HP', () => {
  const target = unit({ hp: 12 });
  boosters.applyBooster(target, inventory.INVENTORY_ITEMS.get('bloodroot-tonic'));
  assert.equal(target.maxHp, 27);
  assert.equal(target.hp, 19);
});

test("the Hunter's Codex raises the equipped weapon type by exactly one rank", () => {
  const codex = inventory.INVENTORY_ITEMS.get('hunters-codex');
  assert.ok(boosters.isBooster(codex));
  const target = unit({ weaponExp: { Sword: 45, Axe: 10 } });
  assert.equal(boosters.applyBooster(target, codex), 'Sword rank C');
  assert.deepEqual(target.weaponExp, { Sword: 70, Axe: 10 });
  const anima = unit({ weaponExp: { Tome: 200 }, weapon: { type: 'Anima' } });
  boosters.applyBooster(anima, codex);
  assert.equal(anima.weaponExp.Anima, 250);
});

test("the Hunter's Codex is blocked without a weapon, without weapon ranks, or at S rank", () => {
  const codex = inventory.INVENTORY_ITEMS.get('hunters-codex');
  assert.equal(boosters.boosterBlockReason(unit({ weapon: null }), codex), 'No weapon');
  assert.equal(boosters.boosterBlockReason(unit({ weaponExp: undefined }), codex), 'Cannot train');
  const master = unit({ weaponExp: { Sword: 250 } });
  assert.equal(boosters.boosterBlockReason(master, codex), 'Rank maxed');
  assert.equal(boosters.applyBooster(master, codex), null);
  assert.equal(master.weaponExp.Sword, 250);
});

test('every Insight item grants 10 Insight', () => {
  const insightItems = [...inventory.INVENTORY_ITEMS.values()].filter((item) => item.insight);
  assert.deepEqual(insightItems.map((item) => item.id).sort(), ['crossing-keepsake', 'orsen-journal', 'pocketwatch', 'treatment-ledger']);
  for (const item of insightItems) assert.equal(item.insight, 10, item.id);
});
