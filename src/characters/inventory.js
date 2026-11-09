import ironKatana from '../../data/weapons/iron-katana.json';
import rapier from '../../data/weapons/rapier.json';
import zanbato from '../../data/weapons/zanbato.json';
import ironAxe from '../../data/weapons/iron-axe.json';
import ironSpear from '../../data/weapons/iron-spear.json';
import steelSpear from '../../data/weapons/steel-spear.json';
import steelLance from '../../data/weapons/steel-lance.json';
import steelSword from '../../data/weapons/steel-sword.json';
import steelAxe from '../../data/weapons/steel-axe.json';
import killerAxe from '../../data/weapons/killer-axe.json';
import killerBow from '../../data/weapons/killer-bow.json';
import killingEdge from '../../data/weapons/killing-edge.json';
import silverLance from '../../data/weapons/silver-lance.json';
import axereaver from '../../data/weapons/axereaver.json';
import armorslayer from '../../data/weapons/armorslayer.json';
import javelin from '../../data/weapons/javelin.json';
import fireTome from '../../data/weapons/fire-tome.json';
import thunderTome from '../../data/weapons/thunder-tome.json';
import windTome from '../../data/weapons/wind-tome.json';
import bloodBeastClaws from '../../data/weapons/blood-beast-claws.json';
import ravenBeak from '../../data/weapons/raven-beak.json';
import handAxe from '../../data/weapons/hand-axe.json';
import hunterPistol from '../../data/weapons/hunter-pistol.json';
import lancereaver from '../../data/weapons/lancereaver.json';
import tentacle from '../../data/weapons/tentacle.json';
import wolfClaws from '../../data/weapons/wolf-claws.json';
import wolfmanClaws from '../../data/weapons/wolfman-claws.json';
import huntersHatchet from '../../data/weapons/hunters-hatchet.json';
import pocketwatch from '../../data/items/pocketwatch.json';
import lightTome from '../../data/weapons/light-tome.json';
import heartrootBark from '../../data/weapons/heartroot-bark.json';
import sealedCargo from '../../data/weapons/sealed-cargo.json';
import bloodletter from '../../data/weapons/bloodletter.json';
import longinus from '../../data/weapons/longinus.json';
import healStaff from '../../data/weapons/heal-staff.json';
import potion from '../../data/items/potion.json';
import chestKey from '../../data/items/chest-key.json';
import masterEmblem from '../../data/items/master-emblem.json';
import bloodEmblem from '../../data/items/blood-emblem.json';
import ironBow from '../../data/weapons/iron-bow.json';
import hunterBow from '../../data/weapons/hunter-bow.json';
import freezeStaff from '../../data/weapons/freeze-staff.json';
import bloodrootTonic from '../../data/items/bloodroot-tonic.json';
import alphaFang from '../../data/items/alpha-fang.json';
import orsenJournal from '../../data/items/orsen-journal.json';
import crossingKeepsake from '../../data/items/crossing-keepsake.json';
import vigilLance from '../../data/weapons/vigil-lance.json';
import undeadClaws from '../../data/weapons/undead-claws.json';
import ridersbane from '../../data/weapons/ridersbane.json';
import blightedTendrils from '../../data/weapons/blighted-tendrils.json';
import darkTome from '../../data/weapons/dark-tome.json';
import { canEquipWeapon, equipBlockReason, getUsesMultiplier } from './classes.js';

// Higher-tier spells (Blaze, Mend...) live in their own files and name the tome they are written in.
const SPELL_DATA = Object.values(import.meta.glob('../../data/weapons/*.json', { eager: true, import: 'default' }))
  .filter((weapon) => weapon.spellbook);

const WEAPON_SPRITES = import.meta.glob('../../assets/weapons/**/*.{png,svg}', {
  eager: true,
  query: '?url',
  import: 'default',
});

const ITEM_SPRITES = import.meta.glob('../../assets/items/**/*.{png,svg}', {
  eager: true,
  query: '?url',
  import: 'default',
});

function createConsumableItem(consumable) {
  const spriteUrl = consumable.sprite ? ITEM_SPRITES[`../../${consumable.sprite}`] : undefined;
  if (consumable.sprite && !spriteUrl) {
    throw new Error(`Item ${consumable.id} references missing sprite ${consumable.sprite}.`);
  }
  return { ...consumable, spriteUrl, itemType: 'consumable' };
}

function createWeaponItem(weapon) {
  const spriteUrl = weapon.sprite ? WEAPON_SPRITES[`../../${weapon.sprite}`] : undefined;
  if (weapon.sprite && !spriteUrl) {
    throw new Error(`Weapon ${weapon.id} references missing sprite ${weapon.sprite}.`);
  }
  return { ...weapon, effect: weapon.effect ?? [], spriteUrl, itemType: 'weapon' };
}

export const INVENTORY_ITEMS = new Map([
  [ironKatana.id, createWeaponItem(ironKatana)],
  [rapier.id, createWeaponItem(rapier)],
  [zanbato.id, createWeaponItem(zanbato)],
  [ironAxe.id, createWeaponItem(ironAxe)],
  [ironSpear.id, createWeaponItem(ironSpear)],
  [steelSpear.id, createWeaponItem(steelSpear)],
  [steelLance.id, createWeaponItem(steelLance)],
  [steelSword.id, createWeaponItem(steelSword)],
  [killerAxe.id, createWeaponItem(killerAxe)],
  [silverLance.id, createWeaponItem(silverLance)],
  [axereaver.id, createWeaponItem(axereaver)],
  [armorslayer.id, createWeaponItem(armorslayer)],
  [javelin.id, createWeaponItem(javelin)],
  [fireTome.id, createWeaponItem(fireTome)],
  [thunderTome.id, createWeaponItem(thunderTome)],
  [windTome.id, createWeaponItem(windTome)],
  [bloodBeastClaws.id, createWeaponItem(bloodBeastClaws)],
  [ravenBeak.id, createWeaponItem(ravenBeak)],
  [handAxe.id, createWeaponItem(handAxe)],
  [hunterPistol.id, createWeaponItem(hunterPistol)],
  [lancereaver.id, createWeaponItem(lancereaver)],
  [tentacle.id, createWeaponItem(tentacle)],
  [wolfClaws.id, createWeaponItem(wolfClaws)],
  [wolfmanClaws.id, createWeaponItem(wolfmanClaws)],
  [huntersHatchet.id, createWeaponItem(huntersHatchet)],
  [pocketwatch.id, createConsumableItem(pocketwatch)],
  [lightTome.id, createWeaponItem(lightTome)],
  [healStaff.id, createWeaponItem(healStaff)],
  [heartrootBark.id, createWeaponItem(heartrootBark)],
  [sealedCargo.id, createWeaponItem(sealedCargo)],
  [bloodletter.id, createWeaponItem(bloodletter)],
  [longinus.id, createWeaponItem(longinus)],
  [potion.id, createConsumableItem(potion)],
  [chestKey.id, createConsumableItem(chestKey)],
  [masterEmblem.id, createConsumableItem(masterEmblem)],
  [bloodEmblem.id, createConsumableItem(bloodEmblem)],
  [ironBow.id, createWeaponItem(ironBow)],
  [hunterBow.id, createWeaponItem(hunterBow)],
  [freezeStaff.id, createWeaponItem(freezeStaff)],
  [bloodrootTonic.id, createConsumableItem(bloodrootTonic)],
  [alphaFang.id, createConsumableItem(alphaFang)],
  [orsenJournal.id, createConsumableItem(orsenJournal)],
  [crossingKeepsake.id, createConsumableItem(crossingKeepsake)],
  [vigilLance.id, createWeaponItem(vigilLance)],
  [undeadClaws.id, createWeaponItem(undeadClaws)],
  [ridersbane.id, createWeaponItem(ridersbane)],
  [blightedTendrils.id, createWeaponItem(blightedTendrils)],
  [darkTome.id, createWeaponItem(darkTome)],
  ...[steelAxe, killerBow, killingEdge].map((weapon) => [weapon.id, createWeaponItem(weapon)]),
  ...SPELL_DATA.map((spell) => [spell.id, createWeaponItem(spell)]),
]);

// Item ids renamed since older saves were written.
export const LEGACY_ITEM_IDS = { raikiri: bloodletter.id };
export const currentItemId = (id) => LEGACY_ITEM_IDS[id] ?? id;

// Tome or staff id -> its unlockable spells, lowest tier first.
const SPELLBOOKS = new Map();
for (const spell of [...SPELL_DATA].sort((a, b) => a.tier - b.tier)) {
  if (!SPELLBOOKS.has(spell.spellbook)) SPELLBOOKS.set(spell.spellbook, []);
  SPELLBOOKS.get(spell.spellbook).push(INVENTORY_ITEMS.get(spell.id));
}
const unlockedSpells = new Set();

export const bookOf = (weapon) => weapon?.spellbook ?? weapon?.id;
export const spellsOf = (bookId) => SPELLBOOKS.get(bookId) ?? [];
export const isSpellUnlocked = (spellId) => unlockedSpells.has(spellId);
export const unlockedSpellsOf = (bookId) => spellsOf(bookId).filter((spell) => unlockedSpells.has(spell.id));

export function carriedWeapons(unit) {
  return [...new Set((unit.inventory ?? []).flatMap((entry) => {
    const item = INVENTORY_ITEMS.get(entry.id);
    const authored = (unit.authoredSpells ?? []).map((id) => INVENTORY_ITEMS.get(id))
      .filter((spell) => spell?.spellbook === entry.id);
    return item?.itemType === 'weapon' ? [item, ...unlockedSpellsOf(entry.id), ...authored] : [];
  }))];
}

export function attackWeapons(unit) {
  return carriedWeapons(unit).filter((weapon) => weapon.type !== 'Staff' && !weapon.passive)
    .sort((a, b) => Number(b.id === unit.weapon?.id) - Number(a.id === unit.weapon?.id));
}

export function equipAttackWeapon(unit, weapon) {
  const reason = weaponUseBlockReason(unit, weapon);
  if (reason || weapon.type === 'Staff' || weapon.passive) {
    throw new Error(reason ?? `${weapon.name} cannot be used to attack.`);
  }
  unit.weapon = weapon;
}

export function weaponUseBlockReason(unit, weapon) {
  const blocked = equipBlockReason(unit, weapon);
  if (blocked) return blocked;
  if (weapon.spellbook && !unit.authoredSpells?.includes(weapon.id) && !isSpellUnlocked(weapon.id)) return 'Unlock with Insight';
  const entry = findWeaponEntry(unit, weapon);
  if (!entry) return 'Not carried';
  return spellUses(entry, weapon) === 0 ? 'No uses left' : undefined;
}

// Insight owns which spells are unlocked; it reports them here so inventories can follow.
export function setUnlockedSpells(spellIds) {
  unlockedSpells.clear();
  for (const id of spellIds) unlockedSpells.add(id);
}

// Copies an inventory entry for saving or trading, keeping per-spell uses.
export function copyEntry({ id, uses, spells }) {
  return spells ? { id, uses, spells: { ...spells } } : { id, uses };
}

// A tome entry keeps each unlocked spell's uses in entry.spells; the book's own spell uses entry.uses.
export function spellUses(entry, weapon) {
  if (!entry) return undefined;
  return weapon?.spellbook ? entry.spells?.[weapon.id] ?? 0 : entry.uses;
}

function spendSpellUse(entry, weapon) {
  if (weapon?.spellbook) {
    if (Number.isInteger(entry.spells?.[weapon.id]) && entry.spells[weapon.id] > 0) entry.spells[weapon.id]--;
  } else if (Number.isInteger(entry.uses) && entry.uses > 0) entry.uses--;
}

// The inventory entry a weapon or spell is cast from, preferring one that still has uses.
export function findWeaponEntry(unit, weapon = unit?.weapon) {
  if (!weapon || !unit?.inventory) return undefined;
  const holders = unit.inventory.filter((entry) => entry.id === bookOf(weapon));
  return holders.find((entry) => {
    const uses = spellUses(entry, weapon);
    return !Number.isInteger(uses) || uses > 0;
  }) ?? holders[0];
}

// Adds newly unlocked spells (with full uses) and drops refunded ones. refill restores every spell.
export function syncSpellUses(entry, unit, refill = false) {
  const spells = unlockedSpellsOf(entry.id);
  if (!spells.length) {
    delete entry.spells;
    return;
  }
  entry.spells = Object.fromEntries(spells.map((spell) => {
    const current = entry.spells?.[spell.id];
    return [spell.id, refill || !Number.isInteger(current) ? maxUsesFor(spell, unit) : current];
  }));
}

// Keeps carried tomes in step with the unlocked spells; units holding a refunded spell fall back to the book.
export function syncSpellbooks(units, convoyEntries = convoy) {
  for (const unit of units) {
    for (const entry of unit.inventory ?? []) syncSpellUses(entry, unit);
    if (unit.weapon?.spellbook && !isSpellUnlocked(unit.weapon.id)) unit.weapon = INVENTORY_ITEMS.get(unit.weapon.spellbook);
  }
  for (const entry of convoyEntries) syncSpellUses(entry);
}

export function createMariaInventory() {
  return [
    { id: rapier.id, uses: null },
    { id: potion.id, uses: potion.maxUses },
    { id: bloodEmblem.id, uses: bloodEmblem.maxUses },
  ];
}

export function createInventory(itemIds) {
  return itemIds.map((id) => {
    const item = INVENTORY_ITEMS.get(id);
    if (!item) throw new Error(`Unknown inventory item ${id}.`);
    const entry = { id, uses: freshUses(item) };
    syncSpellUses(entry);
    return entry;
  });
}

// Consumables and magic (tomes, staves) have limited uses; other weapons never run out.
// Class abilities (Sage, Bishop) multiply the uses of tomes and staves.
function freshUses(item, unit) {
  if (item.itemType === 'weapon' && item.maxUses && unit) return item.maxUses * getUsesMultiplier(unit);
  return item.maxUses ?? null;
}

// Largest number of uses this unit can hold for the item.
export function maxUsesFor(item, unit) {
  return item.itemType === 'weapon' && item.maxUses && unit ? item.maxUses * getUsesMultiplier(unit) : item.maxUses;
}

// Refills every limited-use weapon, run at the start of each chapter.
export function refreshMagicUses(entries, unit) {
  for (const entry of entries) {
    const item = INVENTORY_ITEMS.get(entry.id);
    if (item?.itemType === 'weapon' && item.maxUses) entry.uses = maxUsesFor(item, unit);
    syncSpellUses(entry, unit, true);
  }
}

// After a class change, grants the extra uses the new class allows on tomes and staves.
export function rescaleMagicUses(unit, previousMultiplier) {
  const gain = getUsesMultiplier(unit) - previousMultiplier;
  if (gain <= 0) return;
  for (const entry of unit.inventory) {
    const item = INVENTORY_ITEMS.get(entry.id);
    if (item?.itemType === 'weapon' && item.maxUses && Number.isInteger(entry.uses)) entry.uses += item.maxUses * gain;
    for (const spell of unlockedSpellsOf(entry.id)) {
      if (Number.isInteger(entry.spells?.[spell.id])) entry.spells[spell.id] += spell.maxUses * gain;
    }
  }
}

// Spends one use of the unit's equipped weapon, if it is limited.
export function spendWeaponUse(unit, weapon = unit.weapon) {
  const entry = findWeaponEntry(unit, weapon);
  if (entry) spendSpellUse(entry, weapon);
}

export const MAX_INVENTORY_SIZE = 5;

// Items that did not fit in a unit's inventory. Shared by the whole party.
export const convoy = [];

export function setConvoy(entries) {
  convoy.length = 0;
  convoy.push(...(entries ?? []).map((entry) => legacyEntry(copyEntry(entry))));
  for (const entry of convoy) syncSpellUses(entry);
}

// Saves from before tomes and staves had limited uses stored null; treat that as full.
function legacyEntry(entry) {
  entry.id = currentItemId(entry.id);
  const item = INVENTORY_ITEMS.get(entry.id);
  if (item?.itemType === 'weapon' && item.maxUses && entry.uses === null) entry.uses = item.maxUses;
  return entry;
}

// Adds a fresh copy of the item (units may hold duplicates). When the unit already carries
// MAX_INVENTORY_SIZE items it goes to the convoy instead. Returns { item, toConvoy }.
export function grantItem(unit, itemId) {
  const item = INVENTORY_ITEMS.get(itemId);
  if (!item) throw new Error(`Unknown inventory item ${itemId}.`);
  const entry = { id: itemId, uses: freshUses(item, unit) };
  syncSpellUses(entry, unit, true);
  const toConvoy = unit.inventory.length >= MAX_INVENTORY_SIZE;
  (toConvoy ? convoy : unit.inventory).push(entry);
  return { item, toConvoy };
}

export function restoreMariaInventory(unit, savedInventory, equippedWeaponId) {
  unit.inventory = savedInventory
    ? savedInventory.map((entry) => legacyEntry(copyEntry(entry)))
    : createMariaInventory();
  for (const entry of unit.inventory) syncSpellUses(entry, unit);
  // Older saves predate the Blood Emblem; only Maria carries it (bound items can't be traded).
  if (unit.id === 'maria') {
    if (!unit.inventory.some((entry) => entry.id === bloodEmblem.id)) {
      unit.inventory.push({ id: bloodEmblem.id, uses: bloodEmblem.maxUses });
    }
  } else {
    unit.inventory = unit.inventory.filter((entry) => entry.id !== bloodEmblem.id);
  }

  // null means deliberately unarmed; undefined falls back to Maria's rapier.
  if (equippedWeaponId === null) {
    unit.weapon = null;
    return;
  }
  const weaponId = currentItemId(equippedWeaponId ?? rapier.id);
  let equippedItem = INVENTORY_ITEMS.get(weaponId);
  // A refunded spell falls back to the tome it was written in.
  if (equippedItem?.spellbook && (!isSpellUnlocked(equippedItem.id) || !canEquipWeapon(unit, equippedItem))) {
    equippedItem = INVENTORY_ITEMS.get(equippedItem.spellbook);
  }
  if (!findWeaponEntry(unit, equippedItem) || equippedItem?.itemType !== 'weapon') {
    throw new Error(`Cannot equip ${weaponId}: it is not in ${unit.name}'s inventory.`);
  }
  unit.weapon = equippedItem;
}
