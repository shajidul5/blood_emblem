import data from '../../data/upgrades.json';
import { INVENTORY_ITEMS, maxUsesFor, setUnlockedSpells } from '../characters/inventory.js';

export const BOSS_INSIGHT = data.bossInsight;
export const MAX_LEADERSHIP = data.leadership.costs.length;
export const LEADERSHIP_HIT = data.leadership.hit;
export const LEADERSHIP_AVOID = data.leadership.avoid;
export const FIRST_PREP_CHAPTER = data.firstPrepChapter;
export const BLOOD_EMBLEM = data.bloodEmblem;

const freshState = () => ({ insight: 0, leadership: 0, leadershipPaid: [], spells: {}, evolved: {}, evolutionPaid: {}, bloodEmblem: false, bloodEmblemEquipped: false });
// Star prices before the leadership rebalance; saves that predate leadershipPaid were charged these.
const LEGACY_LEADERSHIP_COSTS = [2, 3, 4, 5, 6];
let state = freshState();

const clampInt = (value, min, max) => (Number.isInteger(value) ? Math.max(min, Math.min(max, value)) : min);

export const getInsight = () => state.insight;
export const getLeadership = () => state.leadership;
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
  return { ...state, leadershipPaid: [...state.leadershipPaid], spells: { ...state.spells }, evolved: { ...state.evolved }, evolutionPaid: { ...state.evolutionPaid } };
}

// Tolerates missing or hand-edited data: anything unrecognised falls back to nothing spent.
export function restoreInsight(snapshot) {
  state = freshState();
  if (snapshot && typeof snapshot === 'object') {
    state.insight = clampInt(snapshot.insight, 0, 9999);
    state.leadership = clampInt(snapshot.leadership, 0, MAX_LEADERSHIP);
    const paid = Array.isArray(snapshot.leadershipPaid) ? snapshot.leadershipPaid : LEGACY_LEADERSHIP_COSTS;
    state.leadershipPaid = Array.from({ length: state.leadership }, (_, i) =>
      clampInt(paid[i], 0, data.leadership.costs[i]));
    for (const [bookId, spells] of Object.entries(data.spellbooks)) {
      const tier = clampInt(snapshot.spells?.[bookId], 0, spells.length);
      if (tier) state.spells[bookId] = tier;
    }
    for (const baseId of Object.keys(EVOLUTIONS)) {
      if (snapshot.evolved?.[baseId] !== true) continue;
      state.evolved[baseId] = true;
      const defaultPaid = data.legacy.evolutionIds.includes(baseId) ? data.legacy.evolutionCost : EVOLUTIONS[baseId].cost;
      state.evolutionPaid[baseId] = clampInt(snapshot.evolutionPaid?.[baseId] ?? defaultPaid, 0, EVOLUTIONS[baseId].cost);
    }
    // Old saves: refund the retired weapon tiers. An awakened Rapier is already the Bloodletter, so keep it evolved.
    state.insight += legacyRefund(snapshot);
    if (snapshot.awakened === true && !state.evolved.rapier) {
      state.evolved.rapier = true;
      state.evolutionPaid.rapier = Math.min(state.insight, data.legacy.evolutionCost);
      state.insight -= state.evolutionPaid.rapier;
    }
    state.bloodEmblem = snapshot.bloodEmblem === true;
    state.bloodEmblemEquipped = state.bloodEmblem && snapshot.bloodEmblemEquipped === true;
  }
  publishSpells();
}

export function addInsight(amount) {
  state.insight += amount;
}

// Leadership aids Maria's recruited units, not enemies, neutral villagers and riders, or Rictor's separate party.
export function leadershipBonus(unit, kind) {
  return unit?.ai === undefined && !unit?.neutral && (unit?.party ?? 'maria') === 'maria'
    ? state.leadership * data.leadership[kind]
    : 0;
}

export const leadershipCost = () => data.leadership.costs[state.leadership];

export function buyLeadership() {
  const cost = leadershipCost();
  if (cost === undefined || state.insight < cost) return false;
  state.insight -= cost;
  state.leadershipPaid.push(cost);
  state.leadership++;
  return true;
}

export function refundLeadership() {
  if (!state.leadership) return false;
  state.leadership--;
  state.insight += state.leadershipPaid.pop() ?? 0;
  return true;
}

// Spellbooks: each Insight unlock in a tome or staff teaches the next spell, shared by the whole party.
export const SPELL_COSTS = data.spellCosts;
export const SPELLBOOK_IDS = Object.keys(data.spellbooks);
export const spellTier = (bookId) => state.spells[bookId] ?? 0;
export const nextSpellId = (bookId) => data.spellbooks[bookId]?.[spellTier(bookId)];
export const nextSpellCost = (bookId) => (nextSpellId(bookId) ? SPELL_COSTS[spellTier(bookId)] : undefined);
export const unlockedSpellIds = () =>
  Object.entries(state.spells).flatMap(([bookId, tier]) => data.spellbooks[bookId].slice(0, tier));

const publishSpells = () => setUnlockedSpells(unlockedSpellIds());

export function unlockSpell(bookId) {
  const cost = nextSpellCost(bookId);
  if (cost === undefined || state.insight < cost) return false;
  state.insight -= cost;
  state.spells[bookId] = spellTier(bookId) + 1;
  publishSpells();
  return true;
}

// Refunds the highest spell learned from the book.
export function refundSpell(bookId) {
  const tier = spellTier(bookId);
  if (!tier) return false;
  state.insight += SPELL_COSTS[tier - 1];
  if (tier === 1) delete state.spells[bookId];
  else state.spells[bookId] = tier - 1;
  publishSpells();
  return true;
}

// Evolutions reforge a carried weapon or a convoy copy into its upgraded form.
export const EVOLUTIONS = data.evolutions;
export const EVOLVING_WEAPON_IDS = Object.keys(EVOLUTIONS);
export const isEvolved = (baseId) => state.evolved[baseId] === true;

// Finds the carried copy of an item: on a unit (who may have it equipped) or in the convoy.
function findHolder(itemId, units, convoyEntries) {
  for (const unit of units) {
    const entry = unit.inventory?.find((candidate) => candidate.id === itemId);
    if (entry) return { unit, entry };
  }
  const entry = convoyEntries.find((candidate) => candidate.id === itemId);
  return entry ? { unit: null, entry } : null;
}

function reforge(fromId, toId, units, convoyEntries) {
  const holder = findHolder(fromId, units, convoyEntries);
  if (!holder) return false;
  const weapon = INVENTORY_ITEMS.get(toId);
  const capacity = maxUsesFor(weapon, holder.unit);
  // Reforging never refills ammo; reverting clamps it to the base weapon's capacity.
  const uses = holder.entry.uses ?? maxUsesFor(INVENTORY_ITEMS.get(fromId), holder.unit);
  holder.entry.id = toId;
  holder.entry.uses = capacity ? Math.min(uses ?? capacity, capacity) : null;
  if (holder.unit?.weapon?.id === fromId) holder.unit.weapon = weapon;
  return true;
}

export const canEvolve = (baseId) =>
  Boolean(EVOLUTIONS[baseId]) && !isEvolved(baseId) && state.insight >= EVOLUTIONS[baseId].cost;

export function evolveWeapon(baseId, units, convoyEntries = []) {
  if (!canEvolve(baseId) || !reforge(baseId, EVOLUTIONS[baseId].into, units, convoyEntries)) return false;
  state.insight -= EVOLUTIONS[baseId].cost;
  state.evolved[baseId] = true;
  state.evolutionPaid[baseId] = EVOLUTIONS[baseId].cost;
  return true;
}

export function revertEvolution(baseId, units, convoyEntries = []) {
  if (!isEvolved(baseId) || !reforge(EVOLUTIONS[baseId].into, baseId, units, convoyEntries)) return false;
  state.insight += state.evolutionPaid[baseId];
  delete state.evolved[baseId];
  delete state.evolutionPaid[baseId];
  return true;
}

// Insight spent under the old incremental weapon tiers (and the Raikiri awakening), returned in full.
function legacyRefund(snapshot) {
  const { weaponCosts, awaken } = data.legacy;
  let refund = 0;
  for (const tier of Object.values(snapshot.tiers ?? {})) {
    refund += weaponCosts.slice(0, clampInt(tier, 0, weaponCosts.length)).reduce((sum, cost) => sum + cost, 0);
  }
  if (snapshot.awakened === true) refund += awaken.cost;
  return refund;
}
