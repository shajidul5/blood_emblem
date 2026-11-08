import { distanceBetween } from '../battle/grid.js';
import { getClassAbilities } from '../characters/classes.js';
import { convoy, copyEntry, grantItem, INVENTORY_ITEMS, MAX_INVENTORY_SIZE } from '../characters/inventory.js';

export function stealableItems(enemy) {
  return [...(enemy.stealable ?? []), ...(enemy.drop ? [enemy.drop] : []),
    ...(enemy.inventory ?? []).filter((entry) => INVENTORY_ITEMS.get(entry.id)?.type === 'Staff' && entry.uses > 0)
      .map((entry) => entry.id)];
}

export function canSteal(unit, enemy, itemId) {
  return Boolean(!unit.acted && unit.hp > 0 && enemy.hp > 0 &&
    getClassAbilities(unit).some((ability) => ability.steal) &&
    unit.speed > enemy.speed && distanceBetween(unit.x, unit.z, enemy.x, enemy.z) === 1 &&
    stealableItems(enemy).includes(itemId));
}

export function stealItem(unit, enemy, itemId) {
  if (!canSteal(unit, enemy, itemId)) throw new Error(`${unit.name} cannot steal ${itemId} from ${enemy.name}.`);
  const staffIndex = enemy.inventory?.findIndex((entry) => entry.id === itemId &&
    INVENTORY_ITEMS.get(entry.id)?.type === 'Staff' && entry.uses > 0) ?? -1;
  if (staffIndex >= 0) {
    const [entry] = enemy.inventory.splice(staffIndex, 1);
    const toConvoy = unit.inventory.length >= MAX_INVENTORY_SIZE;
    (toConvoy ? convoy : unit.inventory).push(copyEntry(entry));
    if (enemy.weapon?.id === itemId) enemy.weapon = null;
    unit.acted = true;
    return { item: INVENTORY_ITEMS.get(itemId), toConvoy };
  }
  const receipt = grantItem(unit, itemId);
  const index = enemy.stealable?.indexOf(itemId) ?? -1;
  if (index >= 0) enemy.stealable.splice(index, 1);
  else delete enemy.drop;
  unit.acted = true;
  return receipt;
}
