import ironKatana from '../../data/weapons/iron-katana.json';
import rapier from '../../data/weapons/rapier.json';
import potion from '../../data/items/potion.json';

export const INVENTORY_ITEMS = new Map([
  [ironKatana.id, { ...ironKatana, itemType: 'weapon' }],
  [rapier.id, { ...rapier, itemType: 'weapon' }],
  [potion.id, { ...potion, itemType: 'consumable' }],
]);

export function createMariaInventory() {
  return [
    { id: ironKatana.id, uses: null },
    { id: rapier.id, uses: null },
    { id: potion.id, uses: potion.maxUses },
  ];
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
