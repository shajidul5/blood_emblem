import data from '../../data/weapon-levels.json';

export const WEAPON_RANKS = data.ranks;
export const MAX_WEAPON_EXP = WEAPON_RANKS[WEAPON_RANKS.length - 1].exp;

export function rankForExp(exp) {
  let rank = WEAPON_RANKS[0];
  for (const candidate of WEAPON_RANKS) if (exp >= candidate.exp) rank = candidate;
  return rank;
}

export function getWeaponExp(unit, weaponType) {
  // Saves from before anima magic was named kept its progress under "Tome".
  const legacy = weaponType === 'Anima' ? unit.weaponExp?.Tome : undefined;
  return unit.weaponExp?.[weaponType] ?? legacy ?? 0;
}

export function getWeaponRank(unit, weapon) {
  return rankForExp(weapon ? getWeaponExp(unit, weapon.type) : 0);
}

// Awards weapon exp for one hit. Only units that track weaponExp (the player party) progress.
// Returns the new rank when the hit ranked the weapon type up, otherwise null.
export function awardWeaponExp(unit, weapon, amount = data.expPerHit) {
  if (!unit.weaponExp || !weapon) return null;
  const before = getWeaponExp(unit, weapon.type);
  if (before >= MAX_WEAPON_EXP) return null;
  const after = Math.min(MAX_WEAPON_EXP, before + amount);
  unit.weaponExp[weapon.type] = after;
  const rank = rankForExp(after);
  return rank.id !== rankForExp(before).id ? rank : null;
}

export function validWeaponExp(value) {
  return value === undefined || (
    value !== null && typeof value === 'object' &&
    Object.values(value).every((exp) => Number.isInteger(exp) && exp >= 0 && exp <= MAX_WEAPON_EXP)
  );
}
