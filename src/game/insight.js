import data from '../../data/upgrades.json';
import { INVENTORY_ITEMS } from '../characters/inventory.js';

export const BOSS_INSIGHT = data.bossInsight;
export const MAX_LEADERSHIP = data.leadership.costs.length;
export const MAX_WEAPON_TIER = data.weaponCosts.length;
export const FIRST_PREP_CHAPTER = data.firstPrepChapter;
export const AWAKEN = data.awaken;
export const BLOOD_EMBLEM = data.bloodEmblem;

const STAT_LABELS = { might: 'Might', hit: 'Hit', critical: 'Crit', heal: 'Heal', maxRange: 'Range' };
const BASE_FIELDS = ['name', 'might', 'hit', 'critical', 'heal', 'maxRange'];
const baseWeapons = new Map();

const freshState = () => ({ insight: 0, leadership: 0, tiers: {}, awakened: false, bloodEmblem: false, bloodEmblemEquipped: false });
let state = freshState();

const clampInt = (value, min, max) => (Number.isInteger(value) ? Math.max(min, Math.min(max, value)) : min);

export const getInsight = () => state.insight;
export const getLeadership = () => state.leadership;
export const isAwakened = () => state.awakened;
export const isBloodEmblemUpgraded = () => state.bloodEmblem;
export const isBloodEmblemEquipped = () => state.bloodEmblemEquipped;

const carriesBloodEmblem = (unit) =>
  unit?.id === 'maria' && unit.inventory?.some((entry) => entry.id === 'blood-emblem');

export function buyBloodEmblem() {
  if (state.bloodEmblem || state.insight < BLOOD_EMBLEM.cost) return false;
  state.insight -= BLOOD_EMBLEM.cost;
  state.bloodEmblem = true;
  return true;
}

export function refundBloodEmblem() {
  if (!state.bloodEmblem) return false;
  state.insight += BLOOD_EMBLEM.cost;
  state.bloodEmblem = false;
  state.bloodEmblemEquipped = false;
  return true;
}

export function toggleBloodEmblem(unit) {
  if (!state.bloodEmblem || !carriesBloodEmblem(unit)) return false;
  state.bloodEmblemEquipped = !state.bloodEmblemEquipped;
  return true;
}

export function bloodEmblemDescription() {
  return state.bloodEmblem
    ? `${state.bloodEmblemEquipped ? 'Equipped' : 'Unequipped'} · Restores ${BLOOD_EMBLEM.healOnKill} HP when Maria defeats a foe.`
    : `Unlock for ${BLOOD_EMBLEM.cost} Insight, then equip to restore ${BLOOD_EMBLEM.healOnKill} HP when Maria defeats a foe.`;
}

// Called only after a confirmed combat kill, for both attacks and counterattacks.
export function healBloodEmblemKill(unit) {
  if (!state.bloodEmblem || !state.bloodEmblemEquipped || !carriesBloodEmblem(unit) || unit.hp <= 0) return 0;
  const healed = Math.max(0, Math.min(BLOOD_EMBLEM.healOnKill, unit.maxHp - unit.hp));
  unit.hp += healed;
  return healed;
}

export function snapshotInsight() {
  return { ...state, tiers: { ...state.tiers } };
}

// Tolerates missing or hand-edited data: anything unrecognised falls back to nothing spent.
export function restoreInsight(snapshot) {
  state = freshState();
  if (snapshot && typeof snapshot === 'object') {
    state.insight = clampInt(snapshot.insight, 0, 9999);
    state.leadership = clampInt(snapshot.leadership, 0, MAX_LEADERSHIP);
    for (const id of Object.keys(data.weapons)) {
      const tier = clampInt(snapshot.tiers?.[id], 0, MAX_WEAPON_TIER);
      if (tier) state.tiers[id] = tier;
    }
    state.awakened = snapshot.awakened === true && state.tiers[AWAKEN.weaponId] === MAX_WEAPON_TIER;
    state.bloodEmblem = snapshot.bloodEmblem === true;
    state.bloodEmblemEquipped = state.bloodEmblem && snapshot.bloodEmblemEquipped === true;
  }
  applyWeaponUpgrades();
}

export function addInsight(amount) {
  state.insight += amount;
}

// Leadership aids recruited player units, not enemies or neutral villagers and riders.
export function leadershipBonus(unit, kind) {
  return unit?.ai === undefined && !unit?.neutral ? state.leadership * data.leadership[kind] : 0;
}

export const leadershipCost = () => data.leadership.costs[state.leadership];

export function buyLeadership() {
  const cost = leadershipCost();
  if (cost === undefined || state.insight < cost) return false;
  state.insight -= cost;
  state.leadership++;
  return true;
}

export function refundLeadership() {
  if (!state.leadership) return false;
  state.leadership--;
  state.insight += data.leadership.costs[state.leadership];
  return true;
}

export const upgradableWeaponIds = () => Object.keys(data.weapons);
export const isUpgradable = (id) => id in data.weapons;
export const weaponTier = (id) => state.tiers[id] ?? 0;
export const nextWeaponCost = (id) => data.weaponCosts[weaponTier(id)];

export function describeTierBonus(id, tier) {
  const bonus = data.weapons[id]?.[tier - 1];
  return bonus ? Object.entries(bonus).map(([stat, amount]) => `+${amount} ${STAT_LABELS[stat]}`).join(', ') : '';
}

export function upgradeWeapon(id) {
  const cost = nextWeaponCost(id);
  if (!isUpgradable(id) || cost === undefined || state.insight < cost) return false;
  state.insight -= cost;
  state.tiers[id] = weaponTier(id) + 1;
  applyWeaponUpgrades();
  return true;
}

export function refundWeapon(id) {
  const tier = weaponTier(id);
  if (!tier || (id === AWAKEN.weaponId && state.awakened)) return false;
  state.insight += data.weaponCosts[tier - 1];
  if (tier === 1) delete state.tiers[id];
  else state.tiers[id] = tier - 1;
  applyWeaponUpgrades();
  return true;
}

export const canAwaken = () =>
  !state.awakened && weaponTier(AWAKEN.weaponId) === MAX_WEAPON_TIER && state.insight >= AWAKEN.cost;

// Swaps the base weapon for its evolution in the owner's inventory; the caller picks the unit.
export function awaken(unit) {
  if (!canAwaken()) return false;
  const entry = unit.inventory.find((candidate) => candidate.id === AWAKEN.weaponId);
  if (!entry) return false;
  entry.id = AWAKEN.into;
  entry.uses = null;
  if (unit.weapon?.id === AWAKEN.weaponId) unit.weapon = INVENTORY_ITEMS.get(AWAKEN.into);
  state.insight -= AWAKEN.cost;
  state.awakened = true;
  return true;
}

export function revertAwakening(unit) {
  if (!state.awakened) return false;
  const entry = unit.inventory.find((candidate) => candidate.id === AWAKEN.into);
  if (!entry) return false;
  entry.id = AWAKEN.weaponId;
  entry.uses = null;
  if (unit.weapon?.id === AWAKEN.into) unit.weapon = INVENTORY_ITEMS.get(AWAKEN.weaponId);
  state.insight += AWAKEN.cost;
  state.awakened = false;
  return true;
}

// Weapon items are shared objects, so upgrades are written onto them from a pristine copy.
export function applyWeaponUpgrades() {
  for (const [id, tiers] of Object.entries(data.weapons)) {
    const item = INVENTORY_ITEMS.get(id);
    if (!item) continue;
    if (!baseWeapons.has(id)) baseWeapons.set(id, Object.fromEntries(BASE_FIELDS.map((field) => [field, item[field]])));
    const base = baseWeapons.get(id);
    for (const field of BASE_FIELDS) if (base[field] !== undefined) item[field] = base[field];
    const tier = weaponTier(id);
    for (const bonus of tiers.slice(0, tier)) {
      for (const [stat, amount] of Object.entries(bonus)) item[stat] = (item[stat] ?? 0) + amount;
    }
    if (tier) item.name = `${base.name} +${tier}`;
  }
}
