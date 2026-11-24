import classData from '../../data/classes.json';

const STAT_KEYS = [
  'hp', 'strength', 'magic', 'dexterity', 'speed', 'luck', 'defense', 'resistance', 'movement', 'build',
];
import { getWeaponExp, getWeaponRank, WEAPON_RANKS, weaponTypeLabel } from './weapon-levels.js';

const rankIndex = (id) => WEAPON_RANKS.findIndex((rank) => rank.id === id);
const TIERS = ['base', 'advanced', 'monster'];

export const CLASSES = new Map(classData.classes.map((entry) => [entry.id, entry]));

function validateClasses() {
  for (const entry of CLASSES.values()) {
    if (!TIERS.includes(entry.tier)) throw new Error(`Class ${entry.id} has unknown tier "${entry.tier}".`);
    for (const [stat, bonus] of Object.entries(entry.promotionBonusAdjustments ?? {})) {
      if (entry.tier !== 'advanced' || !STAT_KEYS.includes(stat) || !Number.isInteger(bonus)) {
        throw new Error(`Class ${entry.id} has an invalid promotion adjustment for ${stat}.`);
      }
    }
    for (const [type, rank] of Object.entries(entry.promotionWeaponRanks ?? {})) {
      if (rankIndex(rank) < 0 ||
          !getClassWeaponTypes(entry).includes(type)) {
        throw new Error(`Class ${entry.id} has an invalid promotion rank for ${type}.`);
      }
    }
    if (entry.minimumMovement !== undefined && (!Number.isInteger(entry.minimumMovement) || entry.minimumMovement < 1)) {
      throw new Error(`Class ${entry.id} needs a positive integer minimumMovement.`);
    }
    if (!Array.isArray(entry.weaponTypes) || (!entry.weaponTypes.length && !entry.unarmed) ||
      (entry.unarmed && entry.weaponTypes.length)) {
      throw new Error(`Class ${entry.id} must list weapon types, or be explicitly unarmed with an empty list.`);
    }
    for (const targetId of Object.values(entry.covenantPromotions ?? {})) {
      if (entry.tier !== 'base' || CLASSES.get(targetId)?.tier !== 'advanced' || !entry.promotesTo) {
        throw new Error(`Class ${entry.id} has an invalid Covenant promotion "${targetId}".`);
      }
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
function getClassWeaponTypes(entry) {
  return entry.tier === 'base' ? CLASSES.get(entry.promotesTo)?.weaponTypes ?? [] : entry.weaponTypes;
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

// Class movement floors also bring old saves up to date without reapplying promotion bonuses.
export function applyClass(unit, classId) {
  if (unit.id === 'rictor' && classId === 'soldier') classId = 'oathkeeper';
  const unitClass = getClass(classId);
  unit.classId = classId;
  unit.class = unitClass.name;
  if (unitClass.type) unit.type = unitClass.type;
  if (unitClass.minimumMovement !== undefined) unit.movement = Math.max(unit.movement, unitClass.minimumMovement);
  if (unitClass.tier === 'advanced') unlockWeaponRanks(unit, unitClass.promotionWeaponRanks);
  const look = unitClass.sprites?.[unit.id] ?? unitClass.sprites?.default;
  if (look) Object.assign(unit, look);
}

function unlockWeaponRanks(unit, ranks = {}) {
  for (const [type, rank] of Object.entries(ranks)) {
    unit.weaponExp ??= {};
    unit.weaponExp[type] = Math.max(getWeaponExp(unit, type), WEAPON_RANKS.find((entry) => entry.id === rank).exp);
  }
}

export function getPromotionBonuses(classId, targetId = getClass(classId).promotesTo) {
  const bonuses = { ...getClass(classId).promotionBonuses };
  if (targetId) for (const [stat, extra] of Object.entries(getClass(targetId).promotionBonusAdjustments ?? {})) {
    bonuses[stat] = (bonuses[stat] ?? 0) + extra;
  }
  return bonuses;
}

export function weaponSpriteSet(unit) {
  const variants = {
    Sword: { linus: 'linusSword', paladinLinus: 'paladinLinusSword', genericPaladin: 'genericPaladinSword', troy: 'troySword', paladinTroy: 'paladinTroySword', oathboundRictor: 'oathboundRictorSword' },
    Dark: { oathboundRictor: 'oathboundRictorDark' },
    Axe: { heroLeon: 'heroLeonAxe' },
    Light: { templarRictor: 'templarRictorHoly' },
    Bow: { assassinLena: 'assassinLenaBow' },
    Staff: { darkSageCorvis: 'darkSageCorvisStaff' },
  };
  return variants[unit.weapon?.type]?.[unit.spriteSet] ?? unit.spriteSet;
}

function promotionTarget(unit, emblemId) {
  const entry = CLASSES.get(unit.classId);
  return emblemId === 'covenant-emblem' ? entry?.covenantPromotions?.[unit.id] : entry?.promotesTo;
}

export function canPromote(unit, emblemId = 'master-emblem') {
  return Boolean(promotionTarget(unit, emblemId));
}

export function promotionBlockReason(unit, emblemId = 'master-emblem') {
  if (!canPromote(unit, emblemId)) {
    return CLASSES.get(unit.classId)?.tier === 'advanced' ? 'Already promoted'
      : emblemId === 'covenant-emblem' ? 'Only Cavalier Linus, Archer Stark or Oathkeeper Rictor' : 'Cannot promote';
  }
  return unit.level < 20 ? 'Needs level 20' : undefined;
}

// Branch adjustments apply only during promotion, never when restoring a saved class.
export function promoteUnit(unit, emblemId = 'master-emblem') {
  const from = getClass(unit.classId);
  const target = promotionTarget(unit, emblemId);
  if (!target) throw new Error(`${unit.name}'s class ${from.name} cannot use this promotion.`);
  if (emblemId === 'covenant-emblem' && unit.level < 20) throw new Error('Covenant promotion requires level 20.');
  const gains = {};
  for (const [stat, bonus] of Object.entries(getPromotionBonuses(from.id, target))) {
    if (!bonus) continue;
    unit[stat] += bonus;
    gains[stat] = bonus;
  }
  unit.maxHp = unit.hp = unit.maxHp + (gains.hp ?? 0);
  // Promotion can unlock a minimum rank in extra weapon types, never lowering existing progress.
  unlockWeaponRanks(unit, getClass(target).promotionWeaponRanks ?? from.promotionWeaponRanks);
  applyClass(unit, target);
  if (unit.weapon && !canEquipWeapon(unit, unit.weapon)) unit.weapon = null;
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
    ? `Needs ${weaponTypeLabel(weapon.type)} rank ${weapon.requiredRank}`
    : `${unit.class} can't use ${weaponTypeLabel(weapon.type)}`;
}
