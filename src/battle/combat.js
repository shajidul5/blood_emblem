export function attackSpeed(unit) {
  return unit.speed - unit.weapon.weight + unit.build;
}

export function getAvoid(unit, terrain = {}) {
  return attackSpeed(unit) * 2 + unit.luck + (terrain.avoid ?? 0);
}

export function getHitRate(attacker, defender, defenderTerrain = {}) {
  const baseHit = attacker.weapon.hit +
    attacker.dexterity * 2 +
    Math.floor(attacker.luck / 2);
  return Math.max(0, Math.min(100, baseHit - getAvoid(defender, defenderTerrain)));
}

export function getCriticalRate(attacker, defender) {
  return Math.max(
    0,
    Math.min(100, attacker.weapon.critical + Math.floor(attacker.dexterity / 2) - defender.luck),
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
  const attackStat = attacker.weapon.damageType === 'magical'
    ? attacker.magic
    : attacker.strength;
  const defenseStat = attacker.weapon.damageType === 'magical'
    ? defender.resistance
    : defender.defense + (defenderTerrain.defense ?? 0);
  return Math.max(0, attackStat + getEffectiveMight(attacker.weapon, defender) - defenseStat);
}

export const EFFECTIVE_MIGHT_MULTIPLIER = 3;

export function isWeaponEffective(weapon, defender) {
  return Boolean(defender.type) && (weapon.effect ?? []).includes(defender.type);
}

export function getEffectiveMight(weapon, defender) {
  return isWeaponEffective(weapon, defender) ? weapon.might * EFFECTIVE_MIGHT_MULTIPLIER : weapon.might;
}

export function getCriticalDamage(attacker, defender, defenderTerrain = {}) {
  return getCombatDamage(attacker, defender, defenderTerrain) * 3;
}

export function getAttackCount(attacker, defender) {
  return attackSpeed(attacker) >= attackSpeed(defender) + 4 ? 2 : 1;
}

export function getCombatExperience(defender, defeated) {
  const combatReward = defeated ? 30 : 10;
  const bossBonus = defeated && defender.isBoss ? 40 : 0;
  return combatReward + bossBonus;
}

export function isInWeaponRange(attacker, defender, distance) {
  return distance >= attacker.weapon.minRange && distance <= attacker.weapon.maxRange;
}

export function weaponRangeLabel(weapon) {
  return weapon.minRange === weapon.maxRange
    ? `${weapon.minRange}`
    : `${weapon.minRange}-${weapon.maxRange}`;
}
