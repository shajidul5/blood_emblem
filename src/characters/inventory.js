import ironKatana from '../../data/weapons/iron-katana.json';
import rapier from '../../data/weapons/rapier.json';
import zanbato from '../../data/weapons/zanbato.json';
import ironAxe from '../../data/weapons/iron-axe.json';
import ironSpear from '../../data/weapons/iron-spear.json';
import steelSpear from '../../data/weapons/steel-spear.json';
import potion from '../../data/items/potion.json';

const WEAPON_SPRITES = import.meta.glob('../../assets/weapons/**/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
});

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
  [potion.id, { ...potion, itemType: 'consumable' }],
]);

export function createMariaInventory() {
  return [
    { id: ironKatana.id, uses: null },
    { id: rapier.id, uses: null },
    { id: zanbato.id, uses: null },
    { id: potion.id, uses: potion.maxUses },
  ];
}

export function createInventory(itemIds) {
  return itemIds.map((id) => {
    const item = INVENTORY_ITEMS.get(id);
    if (!item) throw new Error(`Unknown inventory item ${id}.`);
    return { id, uses: item.itemType === 'weapon' ? null : item.maxUses };
  });
}

// Gives a fresh consumable, or refills the unit's existing stack.
export function grantItem(unit, itemId) {
  const item = INVENTORY_ITEMS.get(itemId);
  if (!item) throw new Error(`Unknown inventory item ${itemId}.`);
  const existing = unit.inventory.find((entry) => entry.id === itemId);
  if (existing) {
    if (item.itemType === 'consumable') existing.uses = item.maxUses;
  } else {
    unit.inventory.push({ id: itemId, uses: item.itemType === 'weapon' ? null : item.maxUses });
  }
}

export function restoreMariaInventory(unit, savedInventory, equippedWeaponId) {
  unit.inventory = savedInventory
    ? savedInventory.map((entry) => ({ ...entry }))
    : createMariaInventory();

  const weaponId = equippedWeaponId ?? ironKatana.id;
  const equippedEntry = unit.inventory.find((entry) => entry.id === weaponId);
  const equippedItem = INVENTORY_ITEMS.get(weaponId);
  if (!equippedEntry || equippedItem?.itemType !== 'weapon') {
    throw new Error(`Cannot equip ${weaponId}: it is not in ${unit.name}'s inventory.`);
  }
  unit.weapon = equippedItem;
}
