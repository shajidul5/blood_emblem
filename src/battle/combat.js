import triangle from '../../data/weapon-triangle.json';
import { CLASSES, getClassAbilities } from '../characters/classes.js';
import { getWeaponRank } from '../characters/weapon-levels.js';
import { emblemDamageBonus, emblemLifeSteal, leadershipBonus } from '../game/insight.js';
import { attackWeapons, bookOf, findWeaponEntry, spellUses, weaponUseBlockReason } from '../characters/inventory.js';

function getClassCritBonus(unit) {
  return getClassAbilities(unit).reduce((total, ability) => total + (ability.critBonus ?? 0), 0);
}

// Staves heal allies and passive weapons (Heartroots) never strike; neither can attack or counter.
// Magic that has run out of uses can't either.
export function canAttack(unit) {
  if (!unit.weapon || unit.weapon.type === 'Staff' || unit.weapon.passive) return false;
  if (unit.inventory && weaponUseBlockReason(unit, unit.weapon)) return false;
  const uses = spellUses(findWeaponEntry(unit), unit.weapon);
  return !(Number.isInteger(uses) && uses <= 0);
}

export function enemyAttackWeapons(unit) {
  if (!unit.inventory || unit.weapon?.damageType !== 'physical') return unit.weapon ? [unit.weapon] : [];
  return attackWeapons(unit).filter((weapon) => weapon.damageType === 'physical' && canAttack({ ...unit, weapon }));
}

export function bestEnemyWeapon(unit, target, distance, terrain = {}) {
  let best = null, damage = -1, hit = -1;
  for (const weapon of enemyAttackWeapons(unit)) {
    const attacker = { ...unit, weapon };
    if (!isInWeaponRange(attacker, target, distance) || !canAttack(attacker)) continue;
    const strikes = getAvailableStrikeCount(attacker, getAttackCount(attacker, target) * getStrikesPerAttack(attacker));
    const total = getCombatDamage(attacker, target, terrain) * strikes;
    const accuracy = getHitRate(attacker, target, terrain);
    if (total > damage || total === damage && accuracy > hit) {
      best = weapon; damage = total; hit = accuracy;
    }
  }
  return best;
}

// Drain from the weapon (Nosferatu) and from Blood Feast never stack; the stronger one applies.
export function lifeStealRate(unit) {
  return Math.max(unit?.weapon?.lifeSteal ?? 0, emblemLifeSteal(unit));
}

export function healDamageDealt(unit, damage) {
  const rate = lifeStealRate(unit);
  if (unit.hp <= 0 || !rate) return 0;
  const healed = Math.max(0, Math.min(unit.maxHp - unit.hp, Math.floor(damage * rate)));
  unit.hp += healed;
  return healed;
}

// Build only offsets weapon weight; it never adds speed beyond the unit's own Speed.
export function attackSpeed(unit) {
  return unit.speed - Math.max(0, (unit.weapon?.weight ?? 0) - (unit.build ?? 0));
}

// Physical and magic triangles are independent. Reavers only alter the physical triangle.
export function getTriangleAdvantage(weapon, opposing) {
  if (!weapon || !opposing || weapon.damageType !== opposing.damageType) return 0;
  const beats = weapon.damageType === 'physical' ? triangle.beats
    : weapon.damageType === 'magical' ? triangle.magicBeats : null;
  if (!beats) return 0;
  const normal = beats[weapon.type] === opposing.type ? 1
    : beats[opposing.type] === weapon.type ? -1 : 0;
  if (!normal || weapon.damageType !== 'physical') return normal;
  const reversals = Number(Boolean(weapon.reaves?.length)) + Number(Boolean(opposing.reaves?.length));
  return reversals === 1 ? normal * -2 : normal;
}

export function getAvoid(unit, terrain = {}, opposingWeapon = null) {
  return attackSpeed(unit) * 2 + unit.luck + (terrain.avoid ?? 0) + leadershipBonus(unit, 'avoid') +
    getWeaponRank(unit, unit.weapon).avoid +
    getTriangleAdvantage(unit.weapon, opposingWeapon) * triangle.avoid;
}

export function getHitRate(attacker, defender, defenderTerrain = {}) {
  if (!canAttack(attacker)) return 0;
  const baseHit = attacker.weapon.hit +
    attacker.dexterity * 2 +
    Math.floor(attacker.luck / 2) + leadershipBonus(attacker, 'hit') +
    getWeaponRank(attacker, attacker.weapon).hit +
    getTriangleAdvantage(attacker.weapon, defender.weapon) * triangle.hit;
  return Math.max(0, Math.min(100, baseHit - getAvoid(defender, defenderTerrain, attacker.weapon)));
}

export function getCriticalRate(attacker, defender) {
  if (!canAttack(attacker)) return 0;
  if (attacker.weapon.halvesCurrentHp) return 0;
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

export function rollStrikeResult(attacker, hitRate, criticalRate, random = Math.random) {
  const hit = rollHit(hitRate, random);
  const critical = hit && rollCritical(criticalRate, random);
  const chance = getClassAbilities(attacker).reduce((rate, ability) => Math.max(rate, ability.lethalityChance ?? 0), 0);
  return { hit, critical, lethality: critical && chance > 0 && random() < chance };
}

export function getCombatDamage(attacker, defender, defenderTerrain = {}) {
  if (!canAttack(attacker)) return 0;
  if (attacker.weapon.halvesCurrentHp) return Math.min(Math.floor(defender.hp / 2), Math.max(0, defender.hp - 1));
  const attackStat = attacker.weapon.damageType === 'magical'
    ? attacker.magic
    : attacker.strength;
  // Aureole pierces wards, halving the target's Resistance.
  const resistance = attacker.weapon.halvesResistance ? Math.floor(defender.resistance / 2) : defender.resistance;
  const defenseStat = attacker.weapon.damageType === 'magical'
    ? resistance
    : defender.defense + (defenderTerrain.defense ?? 0);
  const triangleDamage = getTriangleAdvantage(attacker.weapon, defender.weapon) * triangle.damage;
  return Math.max(0, attackStat + getEffectiveMight(attacker, defender) + emblemDamageBonus(attacker) + triangleDamage - defenseStat);
}

export const EFFECTIVE_MIGHT_MULTIPLIER = 3;

// Weapon effects name the defender's unit type (aqua, beast).
export function isWeaponEffective(attacker, defender) {
  if (!attacker.weapon || !defender.type) return false;
  if (defender.type === 'flying' &&
      (attacker.weapon.type === 'Bow' || bookOf(attacker.weapon) === 'wind-tome')) return true;
  return (attacker.weapon.effect ?? []).includes(defender.type) ||
    getClassAbilities(attacker).some((ability) => ability.effectiveAgainst?.includes(defender.type));
}

export function getEffectiveMight(attacker, defender) {
  const { might } = attacker.weapon;
  return isWeaponEffective(attacker, defender) ? might * EFFECTIVE_MIGHT_MULTIPLIER : might;
}

export function getCriticalDamage(attacker, defender, defenderTerrain = {}) {
  if (attacker.weapon?.halvesCurrentHp) return getCombatDamage(attacker, defender, defenderTerrain);
  return getCombatDamage(attacker, defender, defenderTerrain) * 3;
}

// Brave weapons strike twice in a row every time the wielder attacks.
export function getStrikesPerAttack(unit) {
  return unit.weapon?.brave ? 2 : 1;
}

export function getAttackCount(attacker, defender) {
  if (!canAttack(attacker)) return 0;
  if (attacker.weapon.halvesCurrentHp) return 1;
  return attackSpeed(attacker) >= attackSpeed(defender) + 4 ? 2 : 1;
}

// Guns spend ammo per shot, unlike tomes that spend a use per combat.
export function getAvailableStrikeCount(unit, plannedCount) {
  if (unit.weapon?.type !== 'Gun') return plannedCount;
  const uses = spellUses(findWeaponEntry(unit), unit.weapon);
  return Number.isInteger(uses) ? Math.min(plannedCount, Math.max(0, uses)) : plannedCount;
}

// Order of strikes in a fight: attacker volley, then counter volley, repeated. A volley is
// consecutive strikes by one side, so a brave weapon swings twice before the reply.
export function getStrikeOrder(attackerVolleys, attackerStrikes, counterVolleys, counterStrikes) {
  const order = [];
  for (let volley = 0; volley < Math.max(attackerVolleys, counterVolleys); volley++) {
    if (volley < attackerVolleys) for (let strike = 0; strike < attackerStrikes; strike++) order.push('attacker');
    if (volley < counterVolleys) for (let strike = 0; strike < counterStrikes; strike++) order.push('counter');
  }
  return order;
}

export function getCombatStrikeOrder(attacker, counter, attackerVolleys, counterVolleys) {
  const attackerStrikes = getStrikesPerAttack(attacker);
  const counterStrikes = getStrikesPerAttack(counter);
  const remaining = {
    attacker: getAvailableStrikeCount(attacker, attackerVolleys * attackerStrikes),
    counter: getAvailableStrikeCount(counter, counterVolleys * counterStrikes),
  };
  return getStrikeOrder(attackerVolleys, attackerStrikes, counterVolleys, counterStrikes)
    .filter((side) => remaining[side]-- > 0);
}

// Fire Emblem-style scaling: fighting enemies below your level pays less, tougher ones pay more.
// Each level of difference shifts the reward by 10%, with a 10% floor but no catch-up ceiling.
export function getExperienceMultiplier(attacker, defender) {
  if (!attacker?.level || !defender?.level) return 1;
  return Math.max(0.1, 1 + (defender.level - attacker.level) * 0.1);
}

export function getCombatExperience(defender, defeated, attacker) {
  const advanced = CLASSES.get(defender.classId)?.tier === 'advanced';
  let base;
  if (defeated && advanced && defender.isBoss) base = 100;
  else base = (defeated ? (advanced ? 100 : 30) : (advanced ? 15 : 10)) + (defeated && defender.isBoss ? 40 : 0);
  return Math.max(1, Math.round(base * getExperienceMultiplier(attacker, defender)));
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
