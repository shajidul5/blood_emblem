import { WEAPON_RANKS, getWeaponExp, rankForExp } from './weapon-levels.js';

// Permanent stat boosters: item effect -> the unit stat it raises.
export const STAT_BOOSTERS = {
  'hp-up': { stat: 'maxHp', label: 'Max HP' },
  'strength-up': { stat: 'strength', label: 'Strength' },
  'magic-up': { stat: 'magic', label: 'Magic' },
  'dexterity-up': { stat: 'dexterity', label: 'Dexterity' },
  'speed-up': { stat: 'speed', label: 'Speed' },
  'luck-up': { stat: 'luck', label: 'Luck' },
  'defense-up': { stat: 'defense', label: 'Defense' },
  'resistance-up': { stat: 'resistance', label: 'Resistance' },
  'movement-up': { stat: 'movement', label: 'Movement' },
  'build-up': { stat: 'build', label: 'Build' },
};

export const WEAPON_RANK_UP = 'weapon-rank-up';

export const isBooster = (item) => Boolean(STAT_BOOSTERS[item?.effect]) || item?.effect === WEAPON_RANK_UP;

// The rank the unit's equipped weapon type would reach, or null when it cannot rank up.
export function nextWeaponRank(unit) {
  if (!unit?.weaponExp || !unit.weapon) return null;
  const current = rankForExp(getWeaponExp(unit, unit.weapon.type));
  return WEAPON_RANKS[WEAPON_RANKS.indexOf(current) + 1] ?? null;
}

// Why a unit cannot use a booster right now, or null when it can.
export function boosterBlockReason(unit, item) {
  if (item?.effect !== WEAPON_RANK_UP) return null;
  if (!unit?.weaponExp) return 'Cannot train';
  if (!unit.weapon) return 'No weapon';
  return nextWeaponRank(unit) ? null : 'Rank maxed';
}

// Applies a booster to the unit and returns a short description of the gain.
export function applyBooster(unit, item) {
  if (item.effect === WEAPON_RANK_UP) {
    const rank = nextWeaponRank(unit);
    if (!rank) return null;
    unit.weaponExp[unit.weapon.type] = rank.exp;
    return `${unit.weapon.type} rank ${rank.id}`;
  }
  const booster = STAT_BOOSTERS[item.effect];
  if (!booster) return null;
  const amount = item.amount ?? 2;
  unit[booster.stat] += amount;
  if (booster.stat === 'maxHp') unit.hp += amount;
  return `${booster.label} +${amount}`;
}
