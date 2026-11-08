import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createServer } from 'vite';

let server;
let characters;
let combat;
let inventory;
let insight;
let saves;
let levels;
let classes;
let weaponLevels;
const previousImage = Object.getOwnPropertyDescriptor(globalThis, 'Image');

before(async () => {
  globalThis.Image = class {
    set src(value) { this.url = value; queueMicrotask(() => this.onload()); }
  };
  server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: 'custom' });
  characters = await server.ssrLoadModule('/src/characters/characters.js');
  combat = await server.ssrLoadModule('/src/battle/combat.js');
  inventory = await server.ssrLoadModule('/src/characters/inventory.js');
  insight = await server.ssrLoadModule('/src/game/insight.js');
  saves = await server.ssrLoadModule('/src/game/save.js');
  levels = await server.ssrLoadModule('/src/levels/level.js');
  classes = await server.ssrLoadModule('/src/characters/classes.js');
  weaponLevels = await server.ssrLoadModule('/src/characters/weapon-levels.js');
});

after(async () => {
  await server?.close();
  if (previousImage) Object.defineProperty(globalThis, 'Image', previousImage);
  else delete globalThis.Image;
});

beforeEach(() => insight.restoreInsight(null));

const item = (id) => inventory.INVENTORY_ITEMS.get(id);
const fireEntry = (unit) => unit.inventory.find((entry) => entry.id === 'fire-tome');

test('every tome and staff has two unlockable spells that cost 6 then 12 Insight', () => {
  for (const bookId of insight.SPELLBOOK_IDS) {
    const spells = inventory.spellsOf(bookId);
    assert.equal(spells.length, 2, bookId);
    for (const spell of spells) {
      assert.equal(spell.spellbook, bookId);
      assert.equal(spell.type, item(bookId).type);
      assert.ok(spell.maxUses > 0 && spell.lore, spell.id);
    }
  }
  insight.restoreInsight({ insight: 18 });
  assert.equal(insight.nextSpellCost('fire-tome'), 6);
  assert.equal(insight.unlockSpell('fire-tome'), true);
  assert.equal(insight.nextSpellCost('fire-tome'), 12);
  assert.equal(insight.unlockSpell('fire-tome'), true);
  assert.equal(insight.nextSpellId('fire-tome'), undefined);
  assert.equal(insight.unlockSpell('fire-tome'), false);
  assert.equal(insight.getInsight(), 0);
  assert.ok(item('inferno').might > item('blaze').might && item('blaze').might > item('fire-tome').might);
  assert.ok(item('inferno').weight > item('blaze').weight && item('blaze').weight > item('fire-tome').weight);
});

test('unlocking writes the spell into carried tomes with its own uses, refunding removes it', () => {
  const cypher = characters.createCypherAlly();
  const entry = fireEntry(cypher);
  insight.restoreInsight({ insight: 6 });
  insight.unlockSpell('fire-tome');
  inventory.syncSpellbooks([cypher], []);
  assert.deepEqual(entry.spells, { blaze: item('blaze').maxUses });
  cypher.weapon = item('blaze');
  assert.equal(inventory.findWeaponEntry(cypher), entry);
  inventory.spendWeaponUse(cypher);
  assert.equal(entry.spells.blaze, item('blaze').maxUses - 1);
  assert.equal(entry.uses, item('fire-tome').maxUses);

  insight.refundSpell('fire-tome');
  inventory.syncSpellbooks([cypher], []);
  assert.equal(entry.spells, undefined);
  assert.equal(cypher.weapon.id, 'fire-tome');
  assert.equal(insight.getInsight(), 6);
});

test('a spell with no uses left cannot attack even while its tome still has uses', () => {
  const cypher = characters.createCypherAlly();
  cypher.weaponExp.Anima = 30;
  insight.restoreInsight({ insight: 6 });
  insight.unlockSpell('fire-tome');
  inventory.syncSpellbooks([cypher], []);
  cypher.weapon = item('blaze');
  assert.equal(combat.canAttack(cypher), true);
  fireEntry(cypher).spells.blaze = 0;
  assert.equal(combat.canAttack(cypher), false);
  cypher.weapon = item('fire-tome');
  assert.equal(combat.canAttack(cypher), true);
});

test('each unlocked spell requires its declared weapon rank, exactly at the rank threshold', () => {
  const ranks = {
    blaze: 'D', gale: 'D', elthunder: 'D', lumen: 'D', mend: 'D', hold: 'D',
    inferno: 'B', tempest: 'B', aureole: 'B', physic: 'B', stasis: 'B', bolting: 'A',
  };
  insight.restoreInsight({ insight: 200 });
  for (const bookId of insight.SPELLBOOK_IDS) {
    insight.unlockSpell(bookId);
    insight.unlockSpell(bookId);
  }
  for (const [id, rank] of Object.entries(ranks)) {
    const spell = item(id);
    assert.equal(spell.requiredRank, rank, id);
    const unit = characters.createCypherAlly();
    classes.applyClass(unit, spell.type === 'Light' ? 'bishop' : 'sage');
    unit.inventory = inventory.createInventory([spell.spellbook]);
    const threshold = weaponLevels.WEAPON_RANKS.find((entry) => entry.id === rank).exp;
    unit.weaponExp[spell.type] = threshold - 1;
    assert.equal(classes.canEquipWeapon(unit, spell), false, id);
    assert.equal(inventory.weaponUseBlockReason(unit, spell), `Needs ${spell.type} rank ${rank}`, id);
    unit.weaponExp[spell.type] = threshold;
    assert.equal(classes.canEquipWeapon(unit, spell), true, id);
    assert.equal(inventory.weaponUseBlockReason(unit, spell), undefined, id);
  }
});

test('the weapon picker includes all carried weapons and unlocked spells, including blocked choices', () => {
  const cypher = characters.createCypherAlly();
  insight.restoreInsight({ insight: 18 });
  insight.unlockSpell('fire-tome');
  insight.unlockSpell('fire-tome');
  cypher.inventory.push(...inventory.createInventory(['iron-axe', 'wind-tome']));
  inventory.syncSpellbooks([cypher], []);
  assert.deepEqual(inventory.carriedWeapons(cypher).map((weapon) => weapon.id),
    ['fire-tome', 'blaze', 'inferno', 'iron-axe', 'wind-tome']);
  assert.equal(inventory.weaponUseBlockReason(cypher, item('blaze')), 'Needs Anima rank D');
  assert.ok(inventory.weaponUseBlockReason(cypher, item('iron-axe')));
  cypher.weaponExp.Anima = 30;
  fireEntry(cypher).uses = 0;
  assert.equal(combat.canAttack(cypher), false);
  assert.equal(inventory.weaponUseBlockReason(cypher, item('blaze')), undefined);
  cypher.weapon = item('blaze');
  assert.equal(combat.canAttack(cypher), true);
  assert.equal(inventory.weaponUseBlockReason(cypher, item('tempest')), 'Needs Anima rank B');
});

test('low-rank saved spells fall back to the base tome without losing unlocks or uses', () => {
  insight.restoreInsight({ spells: { 'fire-tome': 2 } });
  const cypher = characters.createCypherAlly();
  inventory.restoreMariaInventory(cypher, [{ id: 'fire-tome', uses: 7, spells: { blaze: 3, inferno: 2 } }], 'inferno');
  assert.equal(cypher.weapon.id, 'fire-tome');
  assert.deepEqual(fireEntry(cypher).spells, { blaze: 3, inferno: 2 });
  cypher.weaponExp.Anima = 120;
  inventory.restoreMariaInventory(cypher, cypher.inventory, 'inferno');
  assert.equal(cypher.weapon.id, 'inferno');
});

test('authored enemy spells do not require player Insight unlocks or rank progression', () => {
  const mage = characters.createEnemyUnit('golden-mage', 0, 0, { weaponId: 'blaze' });
  assert.equal(combat.canAttack(mage), true);
  const priest = characters.createSeymourAlly();
  assert.equal(combat.canAttack(priest), false);
});

test('carried physical weapons use the same choices and rank does not bypass locked spells', () => {
  const maria = characters.createMaria();
  maria.inventory.push(...inventory.createInventory(['iron-katana']));
  assert.deepEqual(inventory.carriedWeapons(maria).map((weapon) => weapon.id), ['rapier', 'iron-katana']);
  for (const weapon of inventory.carriedWeapons(maria)) {
    assert.equal(inventory.weaponUseBlockReason(maria, weapon), undefined);
  }
  const cypher = characters.createCypherAlly();
  cypher.weaponExp.Anima = 250;
  assert.equal(inventory.weaponUseBlockReason(cypher, item('blaze')), 'Unlock with Insight');
  cypher.weapon = item('blaze');
  assert.equal(combat.canAttack(cypher), false);
});

test('Gale and Tempest are wind magic and stay effective against flying units', () => {
  const raven = characters.createEnemyUnit('raven', 0, 0);
  const cypher = characters.createCypherAlly();
  for (const id of ['wind-tome', 'gale', 'tempest']) {
    cypher.weapon = item(id);
    assert.equal(combat.isWeaponEffective(cypher, raven), true, id);
  }
  cypher.weapon = item('blaze');
  assert.equal(combat.isWeaponEffective(cypher, raven), false);
});

test('Aureole halves the target Resistance', () => {
  const caster = Object.assign(characters.createEnemyUnit('golden-mage', 0, 0), { magic: 20 });
  const target = Object.assign(characters.createEnemyUnit('golden-knight', 1, 0), { resistance: 10 });
  caster.weapon = { ...item('aureole'), halvesResistance: false };
  const plain = combat.getCombatDamage(caster, target);
  caster.weapon = item('aureole');
  assert.equal(combat.getCombatDamage(caster, target), plain + 5);
});

test('Rapier evolves into the Bloodletter and the Vigil Lance into Longinus, both refundable', () => {
  const maria = characters.createMaria();
  const rictor = characters.createRictorAlly();
  insight.restoreInsight({ insight: 60 });
  assert.equal(insight.EVOLUTIONS.rapier.cost, 30);
  assert.equal(insight.EVOLUTIONS['vigil-lance'].cost, 30);
  assert.equal(insight.evolveWeapon('rapier', [maria], []), true);
  assert.equal(maria.weapon.id, 'bloodletter');
  assert.ok(maria.inventory.some((entry) => entry.id === 'bloodletter'));
  assert.equal(item('bloodletter').name, 'Bloodletter');
  assert.equal(insight.evolveWeapon('vigil-lance', [rictor], []), true);
  assert.equal(rictor.weapon.id, 'longinus');
  for (const kind of ['undead', 'cavalry', 'armor']) assert.ok(item('longinus').effect.includes(kind), kind);
  assert.equal(insight.getInsight(), 0);
  assert.equal(insight.revertEvolution('rapier', [maria], []), true);
  assert.equal(maria.weapon.id, 'rapier');
  assert.equal(insight.getInsight(), 30);
});

test('personal evolutions require 30 Insight and refunds preserve the amount paid across saves', () => {
  const maria = characters.createMaria();
  insight.restoreInsight({ insight: 29 });
  assert.equal(insight.evolveWeapon('rapier', [maria]), false);
  assert.equal(insight.getInsight(), 29);
  insight.addInsight(1);
  assert.equal(insight.evolveWeapon('rapier', [maria]), true);
  insight.restoreInsight(insight.snapshotInsight());
  assert.equal(insight.revertEvolution('rapier', [maria]), true);
  assert.equal(insight.getInsight(), 30);

  maria.weapon = item('bloodletter');
  maria.inventory[0].id = 'bloodletter';
  insight.restoreInsight({ insight: 0, evolved: { rapier: true } });
  assert.equal(insight.revertEvolution('rapier', [maria]), true);
  assert.equal(insight.getInsight(), 15);
});

test('Rictor is an Oathkeeper who promotes to Templar while soldiers become Halberdiers', () => {
  const rictor = characters.createRictorAlly();
  assert.equal(rictor.classId, 'oathkeeper');
  assert.equal(rictor.type, 'infantry');
  assert.equal(rictor.movement, 5);
  assert.equal(rictor.sprite, 'assets/character/Rictor_Templar/rotations/south.png');
  assert.equal(classes.canEquipWeapon(rictor, item('light-tome')), false);
  classes.applyClass(rictor, 'soldier');
  assert.equal(rictor.classId, 'oathkeeper');
  assert.equal(rictor.spriteSet, 'rictor');
  const promotion = classes.promoteUnit(rictor);
  assert.equal(rictor.classId, 'templar');
  assert.equal(promotion.gains.movement, 3);
  assert.equal(rictor.type, 'cavalry');
  assert.equal(rictor.movement, 8);
  assert.equal(rictor.scale, 1.2);
  assert.equal(rictor.sprite, 'assets/character/Rictor_Mounted_Templar/rotations/south.png');
  assert.equal(rictor.spriteSet, 'templarRictor');
  assert.equal(classes.canEquipWeapon(rictor, item('light-tome')), true);
  assert.equal(rictor.weaponExp.Light, 30);
  const soldier = characters.createEnemyUnit('ward-soldier', 1, 1, {});
  classes.applyClass(soldier, 'soldier');
  assert.equal(soldier.classId, 'soldier');
  classes.promoteUnit(soldier);
  assert.equal(soldier.classId, 'halberdier');
  assert.equal(classes.canEquipWeapon(soldier, item('light-tome')), false);
});

test('mounted Templars are weak to anti-cavalry weapons but Oathkeepers remain infantry', () => {
  const rictor = characters.createRictorAlly();
  const maria = characters.createMaria();
  maria.inventory.push(...inventory.createInventory(['zanbato']));
  maria.weapon = item('zanbato');
  assert.equal(combat.isWeaponEffective(maria, rictor), false);
  classes.promoteUnit(rictor);
  assert.equal(combat.isWeaponEffective(maria, rictor), true);
  assert.equal(combat.getEffectiveMight(maria, rictor), maria.weapon.might * 3);
  rictor.weapon = item('light-tome');
  assert.equal(classes.weaponSpriteSet(rictor), 'templarRictorHoly');
  const undead = characters.createEnemyUnit('undead', 1, 1, {});
  assert.equal(combat.isWeaponEffective(rictor, undead), true);
});

test('old foot-Templar saves restore mounted with eight movement, without stacking gains', () => {
  const rictor = characters.createRictorAlly();
  const oldStats = { ...saves.serializeUnit(rictor).stats, movement: 6 };
  Object.assign(rictor, oldStats);
  classes.applyClass(rictor, 'templar');
  assert.equal(rictor.type, 'cavalry');
  assert.equal(rictor.movement, 8);
  assert.equal(rictor.spriteSet, 'templarRictor');
  const strength = rictor.strength;
  classes.applyClass(rictor, 'templar');
  assert.equal(rictor.movement, 8);
  assert.equal(rictor.strength, strength);
  rictor.movement = 9;
  classes.applyClass(rictor, 'templar');
  assert.equal(rictor.movement, 9);
});

test('old saves refund retired weapon tiers and keep an awakened Rapier as the Bloodletter', () => {
  insight.restoreInsight({ insight: 2, tiers: { 'fire-tome': 2, rapier: 3 }, awakened: true });
  // 2 + (3+5) + (3+5+8) + awaken 1 - Bloodletter 15
  assert.equal(insight.getInsight(), 12);
  assert.equal(insight.isEvolved('rapier'), true);
  assert.equal(inventory.currentItemId('raikiri'), 'bloodletter');
});

test('Rictor has complete replacement rotations and animations, including Templar light attacks', async () => {
  const directions = ['south', 'north', 'east', 'west', 'south-east', 'south-west', 'north-east', 'north-west'];
  for (const [folder, size, animations] of [
    ['Rictor_Templar', 48, { Walking: 6, Attacking: 9 }],
    ['Rictor_Mounted_Templar', 64, { Walking: 9, Attacking: 9, Holy_Attack: 9 }],
  ]) {
    const root = new URL(`../assets/character/${folder}/`, import.meta.url);
    for (const direction of directions) {
      const rotation = await readFile(new URL(`rotations/${direction}.png`, root));
      assert.equal(rotation.readUInt32BE(16), size);
      assert.equal(rotation.readUInt32BE(20), size);
      for (const [animation, count] of Object.entries(animations)) {
        const path = new URL(`animations/${animation}/${direction}/`, root);
        const frames = (await readdir(path)).filter((file) => /^frame_\d+\.png$/.test(file)).sort();
        assert.equal(frames.length, count, `${folder} ${animation} ${direction}`);
        for (let i = 0; i < count; i++) {
          assert.equal(frames[i], `frame_${String(i).padStart(3, '0')}.png`);
          const png = await readFile(new URL(frames[i], path));
          assert.equal(png.subarray(1, 4).toString(), 'PNG');
          assert.ok(png.readUInt32BE(16) <= 256 && png.readUInt32BE(20) <= 256);
        }
      }
    }
  }
  const lanceIcon = await readFile(new URL(`../${item('vigil-lance').sprite}`, import.meta.url));
  assert.equal(lanceIcon.readUInt32BE(16), 48);
  assert.equal(lanceIcon.readUInt32BE(20), 48);
});

test('per-spell uses survive a save round-trip', async (t) => {
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const storage = new Map();
  globalThis.localStorage = { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
  t.after(() => {
    if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage);
    else delete globalThis.localStorage;
  });
  const raw = JSON.parse(await readFile(new URL('../data/levels/map_06_hollow_wood.json', import.meta.url), 'utf8'));
  const level = levels.validateLevel(raw);
  const maria = Object.assign(characters.createMaria(), level.spawn, { moved: false, acted: false });
  maria.inventory.push({ id: 'fire-tome', uses: 20, spells: { blaze: 3, inferno: 1 } });
  saves.writeSave(saves.createSaveData(level, maria, [], { turn: 1, phase: 'player', defeated: false },
    { chapter: 6, insight: { insight: 0, spells: { 'fire-tome': 2 } } }));
  const restored = saves.readSave();
  const tome = restored.player.inventory.find((entry) => entry.id === 'fire-tome');
  assert.deepEqual(tome.spells, { blaze: 3, inferno: 1 });
  assert.deepEqual(restored.insight.spells, { 'fire-tome': 2 });
});
