import triangle from '../../data/weapon-triangle.json';
import { CLASSES, getClassAbilities } from '../characters/classes.js';
import { getWeaponRank } from '../characters/weapon-levels.js';

function getClassCritBonus(unit) {
  return getClassAbilities(unit).reduce((total, ability) => total + (ability.critBonus ?? 0), 0);
}

// Staves heal allies; they can't attack or counter. Magic that has run out of uses can't either.
export function canAttack(unit) {
  if (!unit.weapon || unit.weapon.heal) return false;
  const entry = unit.inventory?.find((candidate) => candidate.id === unit.weapon.id);
  return !(entry && Number.isInteger(entry.uses) && entry.uses <= 0);
}

export function attackSpeed(unit) {
  return unit.speed - (unit.weapon?.weight ?? 0) + unit.build;
}

// +1 when `weapon` beats `opposing`, -1 when it loses, 0 otherwise. Physical weapons only.
// A weapon that "reaves" the opposing weapon type always wins, with double the usual triangle bonuses.
export function getTriangleAdvantage(weapon, opposing) {
  if (!weapon || !opposing || weapon.damageType !== 'physical' || opposing.damageType !== 'physical') return 0;
  if (weapon.reaves?.includes(opposing.type)) return 2;
  if (opposing.reaves?.includes(weapon.type)) return -2;
  if (triangle.beats[weapon.type] === opposing.type) return 1;
  if (triangle.beats[opposing.type] === weapon.type) return -1;
  return 0;
}

export function getAvoid(unit, terrain = {}, opposingWeapon = null) {
  return attackSpeed(unit) * 2 + unit.luck + (terrain.avoid ?? 0) +
    getWeaponRank(unit, unit.weapon).avoid +
    getTriangleAdvantage(unit.weapon, opposingWeapon) * triangle.avoid;
}

export function getHitRate(attacker, defender, defenderTerrain = {}) {
  if (!canAttack(attacker)) return 0;
  const baseHit = attacker.weapon.hit +
    attacker.dexterity * 2 +
    Math.floor(attacker.luck / 2) +
    getWeaponRank(attacker, attacker.weapon).hit +
    getTriangleAdvantage(attacker.weapon, defender.weapon) * triangle.hit;
  return Math.max(0, Math.min(100, baseHit - getAvoid(defender, defenderTerrain, attacker.weapon)));
}

export function getCriticalRate(attacker, defender) {
  if (!canAttack(attacker)) return 0;
  return Math.max(
    0,
    Math.min(
      100,
      attacker.weapon.critical + Math.floor(attacker.dexterity / 2) - defender.luck + getClassCritBonus(attacker),
    ),
  );
}

export function rollHit(hitRate, random = Math.random) {
  const firstRoll = Math.floor(random() * 100);
  const secondRoll = Math.floor(random() * 100);
  return (firstRoll + secondRoll) / 2 < hitRate;
}

export function rollCritical(criticalRate, random = Math.random) {
  return Math.floor(random() * 100) < criticalRate;
}

export function getCombatDamage(attacker, defender, defenderTerrain = {}) {
  if (!canAttack(attacker)) return 0;
  const attackStat = attacker.weapon.damageType === 'magical'
    ? attacker.magic
    : attacker.strength;
  const defenseStat = attacker.weapon.damageType === 'magical'
    ? defender.resistance
    : defender.defense + (defenderTerrain.defense ?? 0);
  const triangleDamage = getTriangleAdvantage(attacker.weapon, defender.weapon) * triangle.damage;
  return Math.max(0, attackStat + getEffectiveMight(attacker, defender) + triangleDamage - defenseStat);
}

export const EFFECTIVE_MIGHT_MULTIPLIER = 3;

// Weapon effects name the defender's unit type (aqua, beast).
export function isWeaponEffective(attacker, defender) {
  if (!attacker.weapon || !defender.type) return false;
  return (attacker.weapon.effect ?? []).includes(defender.type) ||
    getClassAbilities(attacker).some((ability) => ability.effectiveAgainst?.includes(defender.type));
}

export function getEffectiveMight(attacker, defender) {
  const { might } = attacker.weapon;
  return isWeaponEffective(attacker, defender) ? might * EFFECTIVE_MIGHT_MULTIPLIER : might;
}

export function getCriticalDamage(attacker, defender, defenderTerrain = {}) {
  return getCombatDamage(attacker, defender, defenderTerrain) * 3;
}

export function getAttackCount(attacker, defender) {
  if (!canAttack(attacker)) return 0;
  return attackSpeed(attacker) >= attackSpeed(defender) + 4 ? 2 : 1;
}

export function getCombatExperience(defender, defeated) {
  const advanced = CLASSES.get(defender.classId)?.tier === 'advanced';
  if (defeated && advanced && defender.isBoss) return 100;
  const combatReward = defeated ? (advanced ? 60 : 30) : 10;
  const bossBonus = defeated && defender.isBoss ? 40 : 0;
  return combatReward + bossBonus;
}

export function isInWeaponRange(attacker, defender, distance) {
  return canAttack(attacker) && distance >= attacker.weapon.minRange && distance <= attacker.weapon.maxRange;
}

export function weaponRangeLabel(weapon) {
  if (!weapon) return '—';
  return weapon.minRange === weapon.maxRange
    ? `${weapon.minRange}`
    : `${weapon.minRange}-${weapon.maxRange}`;
}
