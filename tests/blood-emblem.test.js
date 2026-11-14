import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

let server;
let insight;
let combat;
let save;
const previousImage = Object.getOwnPropertyDescriptor(globalThis, 'Image');

before(async () => {
  globalThis.Image = class { set src(value) { queueMicrotask(() => this.onload()); } };
  server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: 'custom' });
  insight = await server.ssrLoadModule('/src/game/insight.js');
  combat = await server.ssrLoadModule('/src/battle/combat.js');
  save = await server.ssrLoadModule('/src/game/save.js');
  const inventory = await server.ssrLoadModule('/src/characters/inventory.js');
  sword = inventory.INVENTORY_ITEMS.get('iron-katana');
});

after(async () => {
  await server?.close();
  if (previousImage) Object.defineProperty(globalThis, 'Image', previousImage);
  else delete globalThis.Image;
});

beforeEach(() => insight.restoreInsight(null));

let sword;
const maria = (overrides = {}) => ({
  id: 'maria', classId: 'hunter', x: 5, z: 5, hp: 30, maxHp: 40, strength: 10, magic: 0, defense: 5, resistance: 2,
  dexterity: 8, speed: 8, luck: 5, weapon: sword, inventory: [{ id: 'iron-katana', uses: 40 }, { id: 'blood-emblem' }], ...overrides,
});
const foe = () => ({ id: 'foe', classId: 'soldier', hp: 40, maxHp: 40, strength: 5, magic: 0, defense: 4, resistance: 0, weapon: null });

function awaken(tiers) {
  insight.restoreInsight({ insight: 500, bloodEmblem: tiers, bloodEmblemEquipped: true });
}

test('tiers are bought in order, gated by chapter, and refunded from the top', () => {
  insight.restoreInsight({ insight: 120 });
  assert.equal(insight.buyBloodEmblem(5), true);
  assert.equal(insight.bloodEmblemTier(), 1);
  assert.equal(insight.getInsight(), 100);
  assert.equal(insight.buyBloodEmblem(5), false, 'Ravage is sealed until after Chapter 6');
  assert.equal(insight.buyBloodEmblem(6), true);
  assert.equal(insight.getInsight(), 60);
  assert.equal(insight.buyBloodEmblem(9), false, 'Blood Feast is sealed until Chapter 11');
  assert.equal(insight.buyBloodEmblem(10), true);
  assert.equal(insight.getInsight(), 0);
  assert.equal(insight.buyBloodEmblem(20), false);

  assert.equal(insight.toggleBloodEmblem(maria()), true);
  assert.equal(insight.refundBloodEmblem(), true);
  assert.equal(insight.bloodEmblemTier(), 2);
  assert.equal(insight.getInsight(), 60);
  insight.refundBloodEmblem();
  insight.refundBloodEmblem();
  assert.equal(insight.bloodEmblemTier(), 0);
  assert.equal(insight.getInsight(), 120);
  assert.equal(insight.isBloodEmblemEquipped(), false);
});

test('cannot afford a tier without enough Insight', () => {
  insight.restoreInsight({ insight: 19 });
  assert.equal(insight.buyBloodEmblem(10), false);
});

test('legacy single-unlock saves become Blood Aura with a 10 Insight refund', () => {
  insight.restoreInsight({ insight: 3, bloodEmblem: true, bloodEmblemEquipped: true });
  assert.equal(insight.bloodEmblemTier(), 1);
  assert.equal(insight.getInsight(), 13);
  assert.equal(insight.isBloodEmblemEquipped(), true);
  insight.restoreInsight({ bloodEmblem: 9, bloodEmblemEquipped: true });
  assert.equal(insight.bloodEmblemTier(), 3);
  insight.restoreInsight({ bloodEmblem: 0, bloodEmblemEquipped: true });
  assert.equal(insight.isBloodEmblemEquipped(), false);
});

test('Blood Aura heals Maria and adjacent allies only while equipped', () => {
  const bearer = maria();
  const near = { id: 'bartz', x: 5, z: 6, hp: 10, maxHp: 30 };
  const diagonal = { id: 'cypher', x: 6, z: 6, hp: 10, maxHp: 30 };
  const nearlyFull = { id: 'seymour', x: 4, z: 5, hp: 27, maxHp: 30 };
  assert.deepEqual(insight.applyBloodAura([bearer, near]), []);

  awaken(1);
  const healed = insight.applyBloodAura([bearer, near, diagonal, nearlyFull]);
  assert.deepEqual(healed.map(({ unit, healed: hp }) => [unit.id, hp]), [['maria', 10], ['bartz', 10], ['seymour', 3]]);
  assert.equal(diagonal.hp, 10);

  insight.toggleBloodEmblem(bearer);
  assert.deepEqual(insight.applyBloodAura([maria(), { ...near, hp: 1 }]), []);
});

test('Ravage costs 20% max HP, never kills, and needs Tier 2 and an unspent turn', () => {
  awaken(1);
  assert.equal(insight.canRavage(maria()), false);

  awaken(2);
  const unit = maria();
  assert.equal(insight.ravageCost(unit), 8);
  assert.equal(insight.activateRavage(unit), 8);
  assert.equal(unit.hp, 22);
  assert.equal(unit.ravaging, true);
  assert.equal(insight.canRavage(unit), false, 'once per turn');
  assert.equal(insight.canRavage(maria({ hp: 8 })), false, 'cannot pay with her last HP');
  assert.equal(insight.canRavage(maria({ acted: true })), false);
  assert.equal(insight.canRavage(maria({ inventory: [] })), false);
});

test('Ravage adds +5 damage before defense, and only while the emblem is active', () => {
  awaken(2);
  const unit = maria();
  const target = foe();
  const base = combat.getCombatDamage(unit, target);
  insight.activateRavage(unit);
  assert.equal(combat.getCombatDamage(unit, target), base + 5);
  insight.toggleBloodEmblem(unit);
  assert.equal(combat.getCombatDamage(unit, target), base);
});

test('Blood Feast drains half damage only while ravaging, without stacking with Nosferatu', () => {
  awaken(2);
  const unit = maria({ hp: 10, ravaging: true });
  assert.equal(combat.healDamageDealt(unit, 10), 0, 'Ravage alone does not drain');

  awaken(3);
  assert.equal(combat.healDamageDealt(maria({ hp: 10 }), 10), 0, 'Feast needs Ravage');
  assert.equal(combat.healDamageDealt(unit, 11), 5);
  assert.equal(unit.hp, 15);
  assert.equal(combat.lifeStealRate(maria({ ravaging: true, weapon: { ...sword, lifeSteal: 1 } })), 1);
});

test('ravaging is saved only when set', () => {
  assert.equal(save.serializeUnit(maria({ ravaging: true })).ravaging, true);
  assert.equal('ravaging' in save.serializeUnit(maria()), false);
});
