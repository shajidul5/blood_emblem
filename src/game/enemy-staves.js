import { distanceBetween } from '../battle/grid.js';
import { getStaffRangeBonus } from '../characters/classes.js';
import { INVENTORY_ITEMS, spellUses, findWeaponEntry, spendWeaponUse } from '../characters/inventory.js';
import { rollHit } from '../battle/combat.js';

export const freezeRange = (unit) => Math.max(1, unit.magic);
export const freezeHitRate = (unit, target, staff) =>
  Math.max(10, Math.min(100, staff.hit + (unit.magic - target.resistance) * 6));

export function chooseEnemyStaffAction(unit, friends, foes) {
  if (unit.hp <= 0 || unit.frozen) return null;
  for (const entry of unit.inventory ?? []) {
    const staff = INVENTORY_ITEMS.get(entry.id);
    if (staff?.type !== 'Staff' || spellUses(entry, staff) <= 0) continue;
    const range = staff.freeze ? freezeRange(unit) : staff.maxRange + getStaffRangeBonus(unit);
    const candidates = (staff.freeze ? foes : friends).filter((target) => {
      const distance = distanceBetween(unit.x, unit.z, target.x, target.z);
      return target !== unit && target.hp > 0 && distance >= staff.minRange && distance <= range &&
        (staff.freeze ? !target.frozen : staff.heal && target.hp < target.maxHp);
    });
    candidates.sort(staff.freeze
      ? (a, b) => distanceBetween(unit.x, unit.z, a.x, a.z) - distanceBetween(unit.x, unit.z, b.x, b.z)
      : (a, b) => a.hp - b.hp);
    if (candidates.length) return { staff, target: candidates[0] };
  }
  return null;
}

export function useEnemyStaff(unit, action, turn, random = Math.random) {
  const { staff, target } = action;
  const entry = findWeaponEntry(unit, staff);
  if (!entry || spellUses(entry, staff) <= 0) throw new Error(`${unit.name} has no remaining ${staff.name} uses.`);
  spendWeaponUse(unit, staff);
  if (staff.freeze) {
    const hit = rollHit(freezeHitRate(unit, target, staff), random);
    if (hit) target.frozen = turn + 1;
    return { hit, healed: 0 };
  }
  if (!staff.heal) throw new Error(`Unsupported enemy staff ${staff.id}.`);
  const healed = Math.min(target.maxHp - target.hp, staff.heal + unit.magic);
  target.hp += healed;
  return { hit: true, healed };
}
