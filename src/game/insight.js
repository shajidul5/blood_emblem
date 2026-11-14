import data from '../../data/upgrades.json';
import { INVENTORY_ITEMS, maxUsesFor, setUnlockedSpells } from '../characters/inventory.js';

export const BOSS_INSIGHT = data.bossInsight;
export const MAX_LEADERSHIP = data.leadership.costs.length;
export const LEADERSHIP_HIT = data.leadership.hit;
export const LEADERSHIP_AVOID = data.leadership.avoid;
export const FIRST_PREP_CHAPTER = data.firstPrepChapter;
export const BLOOD_EMBLEM = data.bloodEmblem;

const freshState = () => ({ insight: 0, leadership: 0, leadershipPaid: [], spells: {}, evolved: {}, evolutionPaid: {}, bloodEmblem: 0, bloodEmblemEquipped: false });
// Star prices before the leadership rebalance; saves that predate leadershipPaid were charged these.
const LEGACY_LEADERSHIP_COSTS = [2, 3, 4, 5, 6];
let state = freshState();

const clampInt = (value, min, max) => (Number.isInteger(value) ? Math.max(min, Math.min(max, value)) : min);

export const getInsight = () => state.insight;
export const getLeadership = () => state.leadership;
// The Blood Emblem deepens in tiers: Blood Aura, then Ravage, then Blood Feast.
export const EMBLEM_TIERS = BLOOD_EMBLEM.tiers;
const [AURA, RAVAGE, FEAST] = EMBLEM_TIERS;
export const bloodEmblemTier = () => state.bloodEmblem;
export const isBloodEmblemUpgraded = () => state.bloodEmblem > 0;
export const isBloodEmblemEquipped = () => state.bloodEmblemEquipped;
export const nextEmblemTier = () => EMBLEM_TIERS[state.bloodEmblem];
// Chapters are zero-based: a tier opens in the preparations of chapter index `unlockChapter`.
export const emblemTierOpen = (tier, chapterIndex) => (chapterIndex ?? 0) >= tier.unlockChapter;

const carriesBloodEmblem = (unit) =>
  unit?.id === 'maria' && unit.inventory?.some((entry) => entry.id === 'blood-emblem');
const emblemActive = (unit, tierNumber) =>
  state.bloodEmblem >= tierNumber && state.bloodEmblemEquipped && carriesBloodEmblem(unit) && unit.hp > 0;

export function buyBloodEmblem(chapterIndex) {
  const tier = nextEmblemTier();
  if (!tier || !emblemTierOpen(tier, chapterIndex) || state.insight < tier.cost) return false;
  state.insight -= tier.cost;
  state.bloodEmblem++;
  return true;
}

export function refundBloodEmblem() {
  if (!state.bloodEmblem) return false;
  state.insight += EMBLEM_TIERS[--state.bloodEmblem].cost;
  if (!state.bloodEmblem) state.bloodEmblemEquipped = false;
  return true;
}

export function toggleBloodEmblem(unit) {
  if (!state.bloodEmblem || !carriesBloodEmblem(unit)) return false;
  state.bloodEmblemEquipped = !state.bloodEmblemEquipped;
  return true;
}

export function emblemTierDescription(tier) {
  if (tier === AURA) return `At the start of each player phase, Maria and allies next to her recover ${AURA.heal} HP.`;
  if (tier === RAVAGE) return `New command: Maria pays ${RAVAGE.hpCostPercent}% of her max HP for +${RAVAGE.damageBonus} Might until your next turn, counters included. Does not use her action.`;
  return `While Ravage is active, Maria's hits heal her for ${FEAST.lifeSteal === 0.5 ? 'half' : `${FEAST.lifeSteal * 100}% of`} the damage dealt.`;
}

export function bloodEmblemDescription() {
  if (!state.bloodEmblem) return `Dormant · Awaken it with Insight. ${emblemTierDescription(AURA)}`;
  const powers = EMBLEM_TIERS.slice(0, state.bloodEmblem).map((tier) => tier.name).join(', ');
  return `${state.bloodEmblemEquipped ? 'Equipped' : 'Unequipped'} · ${powers}.`;
}

// Blood Aura: heals Maria and every living ally orthogonally adjacent to her. Returns who recovered and by how much.
export function applyBloodAura(team) {
  const bearer = team.find((unit) => emblemActive(unit, 1));
  if (!bearer) return [];
  return team
    .filter((unit) => unit.hp > 0 && Math.abs(unit.x - bearer.x) + Math.abs(unit.z - bearer.z) <= 1)
    .map((unit) => {
      const healed = Math.max(0, Math.min(AURA.heal, unit.maxHp - unit.hp));
      unit.hp += healed;
      return { unit, healed };
    })
    .filter(({ healed }) => healed > 0);
}

export const ravageCost = (unit) => Math.max(1, Math.floor(unit.maxHp * RAVAGE.hpCostPercent / 100));

// Ravage never kills: Maria must have more HP than the price.
export function canRavage(unit) {
  return emblemActive(unit, 2) && !unit.ravaging && !unit.acted && unit.hp > ravageCost(unit);
}

export function activateRavage(unit) {
  if (!canRavage(unit)) return 0;
  const cost = ravageCost(unit);
  unit.hp -= cost;
  unit.ravaging = true;
  return cost;
}

export const emblemDamageBonus = (unit) => (unit?.ravaging && emblemActive(unit, 2) ? RAVAGE.damageBonus : 0);
export const emblemLifeSteal = (unit) => (unit?.ravaging && emblemActive(unit, 3) ? FEAST.lifeSteal : 0);

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
    // Saves from the single-unlock emblem become Blood Aura, refunding the price difference.
    if (snapshot.bloodEmblem === true) {
      state.bloodEmblem = 1;
      state.insight += BLOOD_EMBLEM.legacyCost - AURA.cost;
    } else {
      state.bloodEmblem = clampInt(snapshot.bloodEmblem, 0, EMBLEM_TIERS.length);
    }
    state.bloodEmblemEquipped = state.bloodEmblem > 0 && snapshot.bloodEmblemEquipped === true;
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
