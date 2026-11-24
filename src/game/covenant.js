import { getClassAbilities } from '../characters/classes.js';

export const BLOOD_OATH_COST = 6;
export const BLOOD_OATH = Object.freeze({ id: 'blood-oath', name: 'Blood Oath', type: 'Blood Rite' });
const hasAbility = (unit, flag) => getClassAbilities(unit).some((ability) => ability[flag]);

export function bloodOathBlockReason(caster, target) {
  if (caster.hp <= 0 || !hasAbility(caster, 'bloodOath')) return 'Bloodsworn ability required';
  if (caster.acted) return 'Already acted';
  if (caster.hp <= BLOOD_OATH_COST) return 'Needs at least 7 HP';
  if (!target || target === caster || target.hp <= 0) return 'Choose another living ally';
  if (Math.abs(caster.x - target.x) + Math.abs(caster.z - target.z) !== 1) return 'Ally must be adjacent';
  return target.bloodOath ? 'Already protected by Blood Oath' : undefined;
}

// The caller supplies its allied roster; enemies can never enter the target picker.
export function bloodOathTargets(caster, allies) {
  return allies.filter((target) => !bloodOathBlockReason(caster, target));
}

export function applyBloodOath(caster, target) {
  const blocked = bloodOathBlockReason(caster, target);
  if (blocked) throw new Error(blocked);
  caster.hp -= BLOOD_OATH_COST;
  caster.acted = true;
  caster.moveOrigin = null;
  target.bloodOath = true;
}

export function protectedCombatDamage(target, damage) {
  return target.bloodOath && damage > 0 ? Math.ceil(damage / 2) : damage;
}

// Mitigate before capping to HP so a lethal hit cannot be halved after the cap.
export function applyCombatDamage(target, damage, { lethal = false } = {}) {
  if (lethal) {
    const dealt = Math.max(0, target.hp);
    target.hp = 0;
    delete target.bloodOath;
    return dealt;
  }
  const dealt = Math.min(target.hp, Math.max(0, protectedCombatDamage(target, damage)));
  if (damage > 0 && target.bloodOath) delete target.bloodOath;
  target.hp -= dealt;
  return dealt;
}

export function bloodTrailBonus(unit, enemies = []) {
  return unit.hp > 0 && hasAbility(unit, 'bloodTrail') &&
    enemies.some((enemy) => enemy.hp > 0 && enemy.hp < enemy.maxHp &&
      Math.abs(unit.x - enemy.x) + Math.abs(unit.z - enemy.z) <= 10) ? 4 : 0;
}

export function movementAllowance(unit, enemies) {
  return unit.movement + bloodTrailBonus(unit, enemies);
}

export function clearCovenantState(units) {
  for (const unit of units) {
    delete unit.bloodOath;
    delete unit.bloodTrailBonus;
  }
}

export function startCovenantPlayerPhase(allies) {
  clearCovenantState(allies);
}

export function validCovenantState(saved) {
  return (saved.bloodOath === undefined || saved.bloodOath === true) &&
    (saved.bloodTrailBonus === undefined ||
      saved.id === 'stark' && saved.classId === 'veilstalker' && [0, 2].includes(saved.bloodTrailBonus));
}
