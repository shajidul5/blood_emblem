import ironKatana from '../../data/weapons/iron-katana.json';
import rapier from '../../data/weapons/rapier.json';
import zanbato from '../../data/weapons/zanbato.json';
import ironAxe from '../../data/weapons/iron-axe.json';
import ironSpear from '../../data/weapons/iron-spear.json';
import steelSpear from '../../data/weapons/steel-spear.json';
import fireTome from '../../data/weapons/fire-tome.json';
import thunderTome from '../../data/weapons/thunder-tome.json';
import handAxe from '../../data/weapons/hand-axe.json';
import hunterPistol from '../../data/weapons/hunter-pistol.json';
import lancereaver from '../../data/weapons/lancereaver.json';
import tentacle from '../../data/weapons/tentacle.json';
import lightTome from '../../data/weapons/light-tome.json';
import healStaff from '../../data/weapons/heal-staff.json';
import potion from '../../data/items/potion.json';
import chestKey from '../../data/items/chest-key.json';
import masterEmblem from '../../data/items/master-emblem.json';
import bloodEmblem from '../../data/items/blood-emblem.json';
import { getUsesMultiplier } from './classes.js';

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
  [fireTome.id, createWeaponItem(fireTome)],
  [thunderTome.id, createWeaponItem(thunderTome)],
  [handAxe.id, createWeaponItem(handAxe)],
  [hunterPistol.id, createWeaponItem(hunterPistol)],
  [lancereaver.id, createWeaponItem(lancereaver)],
  [tentacle.id, createWeaponItem(tentacle)],
  [lightTome.id, createWeaponItem(lightTome)],
  [healStaff.id, createWeaponItem(healStaff)],
  [potion.id, createConsumableItem(potion)],
  [chestKey.id, createConsumableItem(chestKey)],
  [masterEmblem.id, createConsumableItem(masterEmblem)],
  [bloodEmblem.id, createConsumableItem(bloodEmblem)],
]);

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
    return { id, uses: freshUses(item) };
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
  }
}

// After a class change, grants the extra uses the new class allows on tomes and staves.
export function rescaleMagicUses(unit, previousMultiplier) {
  const gain = getUsesMultiplier(unit) - previousMultiplier;
  if (gain <= 0) return;
  for (const entry of unit.inventory) {
    const item = INVENTORY_ITEMS.get(entry.id);
    if (item?.itemType === 'weapon' && item.maxUses && Number.isInteger(entry.uses)) entry.uses += item.maxUses * gain;
  }
}

// Spends one use of the unit's equipped weapon, if it is limited.
export function spendWeaponUse(unit) {
  const entry = unit.inventory?.find((candidate) => candidate.id === unit.weapon?.id);
  if (entry && Number.isInteger(entry.uses) && entry.uses > 0) entry.uses--;
}

export const MAX_INVENTORY_SIZE = 5;

// Items that did not fit in a unit's inventory. Shared by the whole party.
export const convoy = [];

export function setConvoy(entries) {
  convoy.length = 0;
  convoy.push(...(entries ?? []).map(({ id, uses }) => legacyEntry({ id, uses })));
}

// Saves from before tomes and staves had limited uses stored null; treat that as full.
function legacyEntry(entry) {
  const item = INVENTORY_ITEMS.get(entry.id);
  return item?.itemType === 'weapon' && item.maxUses && entry.uses === null
    ? { id: entry.id, uses: item.maxUses }
    : entry;
}

// Adds a fresh copy of the item (units may hold duplicates). When the unit already carries
// MAX_INVENTORY_SIZE items it goes to the convoy instead. Returns { item, toConvoy }.
export function grantItem(unit, itemId) {
  const item = INVENTORY_ITEMS.get(itemId);
  if (!item) throw new Error(`Unknown inventory item ${itemId}.`);
  const entry = { id: itemId, uses: freshUses(item, unit) };
  const toConvoy = unit.inventory.length >= MAX_INVENTORY_SIZE;
  (toConvoy ? convoy : unit.inventory).push(entry);
  return { item, toConvoy };
}

export function restoreMariaInventory(unit, savedInventory, equippedWeaponId) {
  unit.inventory = savedInventory
    ? savedInventory.map((entry) => legacyEntry({ ...entry }))
    : createMariaInventory();
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
  const weaponId = equippedWeaponId ?? rapier.id;
  const equippedEntry = unit.inventory.find((entry) => entry.id === weaponId);
  const equippedItem = INVENTORY_ITEMS.get(weaponId);
  if (!equippedEntry || equippedItem?.itemType !== 'weapon') {
    throw new Error(`Cannot equip ${weaponId}: it is not in ${unit.name}'s inventory.`);
  }
  unit.weapon = equippedItem;
}
