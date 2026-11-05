import classData from '../../data/classes.json';

const STAT_KEYS = [
  'hp', 'strength', 'magic', 'dexterity', 'speed', 'luck', 'defense', 'resistance', 'movement', 'build',
];
import { getWeaponExp, getWeaponRank, WEAPON_RANKS } from './weapon-levels.js';

const rankIndex = (id) => WEAPON_RANKS.findIndex((rank) => rank.id === id);
const TIERS = ['base', 'advanced', 'monster'];

export const CLASSES = new Map(classData.classes.map((entry) => [entry.id, entry]));

function validateClasses() {
  for (const entry of CLASSES.values()) {
    if (!TIERS.includes(entry.tier)) throw new Error(`Class ${entry.id} has unknown tier "${entry.tier}".`);
    if (!Array.isArray(entry.weaponTypes) || (!entry.weaponTypes.length && !entry.unarmed) ||
      (entry.unarmed && entry.weaponTypes.length)) {
      throw new Error(`Class ${entry.id} must list weapon types, or be explicitly unarmed with an empty list.`);
    }
    if (entry.promotesTo === undefined) {
      if (entry.promotionBonuses !== undefined) {
        throw new Error(`Class ${entry.id} has promotion bonuses but no promotesTo.`);
      }
      continue;
    }
    const target = CLASSES.get(entry.promotesTo);
    if (!target || target.tier !== 'advanced') {
      throw new Error(`Class ${entry.id} promotes to unknown advanced class "${entry.promotesTo}".`);
    }
    for (const stat of STAT_KEYS) {
      if (!Number.isInteger(entry.promotionBonuses?.[stat])) {
        throw new Error(`Class ${entry.id} needs an integer promotion bonus for ${stat}.`);
      }
    }
  }
}
validateClasses();

export function getClass(classId) {
  const entry = CLASSES.get(classId);
  if (!entry) throw new Error(`Unknown class "${classId}".`);
  return entry;
}

export function getClassAbilities(unit) {
  return (unit.classId && CLASSES.get(unit.classId)?.abilities) || [];
}

// Sage and Bishop abilities scale how many uses tomes and staves hold.
export function getUsesMultiplier(unit) {
  return getClassAbilities(unit).reduce((total, ability) => total * (ability.usesMultiplier ?? 1), 1);
}

export function getStaffRangeBonus(unit) {
  return getClassAbilities(unit).reduce((total, ability) => total + (ability.staffRangeBonus ?? 0), 0);
}

// Upper bound used when validating saved uses, since items can be traded between classes.
export const MAX_USES_MULTIPLIER = Math.max(1, ...[...CLASSES.values()].map(
  (entry) => (entry.abilities ?? []).reduce((total, ability) => total * (ability.usesMultiplier ?? 1), 1),
));

// Sets the unit's class and, when the class defines a look for this character, its sprites.
export function applyClass(unit, classId) {
  const unitClass = getClass(classId);
  unit.classId = classId;
  unit.class = unitClass.name;
  const look = unitClass.sprites?.[unit.id] ?? unitClass.sprites?.default;
  if (look) Object.assign(unit, look);
}

export function weaponSpriteSet(unit) {
  const swordVariants = { linus: 'linusSword', paladinLinus: 'paladinLinusSword', genericPaladin: 'genericPaladinSword' };
  return unit.weapon?.type === 'Sword' ? swordVariants[unit.spriteSet] ?? unit.spriteSet : unit.spriteSet;
}

export function canPromote(unit) {
  return Boolean(CLASSES.get(unit.classId)?.promotesTo);
}

// Adds the base class's promotion bonuses to the unit and switches it to the advanced class.
export function promoteUnit(unit) {
  const from = getClass(unit.classId);
  if (!from.promotesTo) throw new Error(`${unit.name}'s class ${from.name} cannot be promoted.`);
  const gains = {};
  for (const [stat, bonus] of Object.entries(from.promotionBonuses)) {
    if (!bonus) continue;
    unit[stat] += bonus;
    gains[stat] = bonus;
  }
  unit.maxHp = unit.hp = unit.maxHp + (gains.hp ?? 0);
  // Promotion can unlock a minimum rank in extra weapon types, never lowering existing progress.
  for (const [type, rank] of Object.entries(from.promotionWeaponRanks ?? {})) {
    unit.weaponExp ??= {};
    unit.weaponExp[type] = Math.max(getWeaponExp(unit, type), WEAPON_RANKS.find((entry) => entry.id === rank).exp);
  }
  applyClass(unit, from.promotesTo);
  return { from: from.name, to: unit.class, gains };
}

export function canEquipWeapon(unit, weapon) {
  if (!weapon || !getClass(unit.classId).weaponTypes.includes(weapon.type)) return false;
  if (weapon.exclusiveTo && unit.id !== weapon.exclusiveTo) return false;
  return !weapon.requiredRank || rankIndex(getWeaponRank(unit, weapon).id) >= rankIndex(weapon.requiredRank);
}

// Why the unit can't equip the weapon, for display; undefined when it can.
export function equipBlockReason(unit, weapon) {
  if (canEquipWeapon(unit, weapon)) return undefined;
  if (weapon.exclusiveTo) return `Only ${weapon.exclusiveTo[0].toUpperCase()}${weapon.exclusiveTo.slice(1)} can wield ${weapon.name}`;
  return getClass(unit.classId).weaponTypes.includes(weapon.type)
    ? `Needs ${weapon.type} rank ${weapon.requiredRank}`
    : `${unit.class} can't use ${weapon.type}`;
}
