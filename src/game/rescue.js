import { distanceBetween, findPath, isWalkable, terrainMoveCost, tileKey } from '../battle/grid.js';
import { createLinusAlly, createVillager } from '../characters/characters.js';
import { INVENTORY_ITEMS } from '../characters/inventory.js';

const STATUSES = new Set(['sheltered', 'escorting', 'rescued', 'dead']);
export const isActiveVillager = (unit) => unit.hp > 0 && ['sheltered', 'escorting'].includes(unit.status);

export function validateRescueRules(value, level) {
  if (value === undefined || value === null) return null;
  const validTile = (tile) => tile && Number.isInteger(tile.x) && Number.isInteger(tile.z) &&
    isWalkable(level, tile.x, tile.z);
  const ids = new Set();
  const homes = new Set();
  if (
    !value || level.objective !== 'rescue-villagers' ||
    !level.enemies.some((unit) => unit.id === value.captainId) ||
    value.recruit?.id !== 'linus' || !validTile(value.recruit) ||
    !Number.isInteger(value.recruit.hp) || value.recruit.hp < 1 || value.recruit.hp > createLinusAlly().maxHp ||
    !Array.isArray(value.refuge) || !value.refuge.length || !value.refuge.every(validTile) ||
    !Array.isArray(value.villagers) || value.villagers.length !== 3 ||
    !value.villagers.every((villager) => {
      if (!villager || typeof villager.id !== 'string' || ids.has(villager.id) ||
        typeof villager.name !== 'string' || typeof villager.farewell !== 'string' ||
        homes.has(villager.houseId) ||
        !level.houses.some((house) => house.id === villager.houseId && house.villagerId === villager.id)) return false;
      ids.add(villager.id);
      homes.add(villager.houseId);
      return true;
    }) ||
    !Array.isArray(value.rewards) || !value.rewards.every((reward) =>
      Number.isInteger(reward.rescued) && reward.rescued >= 1 && reward.rescued <= value.villagers.length &&
      Array.isArray(reward.items) && reward.items.every((id) => INVENTORY_ITEMS.has(id)))
  ) throw new Error('Rescue chapter needs three unique villagers and houses, a captain, Linus, refuge tiles, and valid rewards.');
  const occupied = new Set([...level.players, ...level.enemies].map((unit) => tileKey(unit.x, unit.z)));
  const positions = [value.recruit, ...value.villagers.map((villager) =>
    level.houses.find((house) => house.id === villager.houseId).door)];
  for (const tile of positions) {
    const key = tileKey(tile.x, tile.z);
    if (occupied.has(key)) throw new Error('Rescue units cannot share a starting tile with another unit.');
    occupied.add(key);
  }
  return {
    captainId: value.captainId,
    recruit: { ...value.recruit },
    refuge: value.refuge.map(({ x, z }) => ({ x, z })),
    villagers: value.villagers.map((villager) => ({ ...villager })),
    rewards: value.rewards.map(({ rescued, items }) => ({ rescued, items: [...items] })),
  };
}

export function freshRescueState(level) {
  const rules = level.rescue;
  if (!rules) return null;
  return {
    recruited: false,
    rewardsClaimed: false,
    linus: { x: rules.recruit.x, z: rules.recruit.z, hp: rules.recruit.hp },
    villagers: rules.villagers.map(({ id, houseId }) => ({
      id,
      ...level.houses.find((house) => house.id === houseId).door,
      hp: createVillager(id, '').maxHp,
      status: 'sheltered',
    })),
  };
}

export function validateRescueState(snapshot, level, occupied, allies) {
  if (!level.rescue) {
    if (snapshot != null) throw new Error('Saved rescue state has no matching chapter rules.');
    return null;
  }
  if (!snapshot || typeof snapshot.recruited !== 'boolean' || typeof snapshot.rewardsClaimed !== 'boolean' ||
    !Array.isArray(snapshot.villagers) || snapshot.villagers.length !== level.rescue.villagers.length) {
    throw new Error('Saved rescue state is invalid.');
  }
  const validUnit = (unit, maxHp) => unit && Number.isInteger(unit.x) && Number.isInteger(unit.z) &&
    isWalkable(level, unit.x, unit.z) && Number.isInteger(unit.hp) && unit.hp >= 0 && unit.hp <= maxHp;
  const reserve = (unit) => {
    if (unit.hp <= 0) return;
    const key = tileKey(unit.x, unit.z);
    if (occupied.has(key)) throw new Error('Saved rescue units overlap another unit.');
    occupied.add(key);
  };
  const ids = new Set();
  const villagers = snapshot.villagers.map((unit) => {
    const rule = level.rescue.villagers.find((entry) => entry.id === unit?.id);
    if (!rule || ids.has(unit.id) || !validUnit(unit, createVillager(unit.id, rule.name).maxHp) ||
      !STATUSES.has(unit.status) || (unit.status === 'dead') !== (unit.hp === 0) ||
      (unit.status === 'rescued' && !level.rescue.refuge.some((tile) => tile.x === unit.x && tile.z === unit.z))) {
      throw new Error('Saved villager state is invalid.');
    }
    ids.add(unit.id);
    const house = level.houses.find((entry) => entry.id === rule.houseId);
    if ((unit.status === 'sheltered' && (house.visited || unit.x !== house.door.x || unit.z !== house.door.z)) ||
      (['escorting', 'rescued'].includes(unit.status) && !house.visited)) {
      throw new Error('Saved villager and house progress do not match.');
    }
    if (isActiveVillager(unit)) reserve(unit);
    return { id: unit.id, x: unit.x, z: unit.z, hp: unit.hp, status: unit.status };
  });
  const ally = allies.find((unit) => unit.id === 'linus');
  if (!validUnit(snapshot.linus, ally?.stats.maxHp ?? createLinusAlly().maxHp)) throw new Error('Saved Linus state is invalid.');
  if (snapshot.recruited !== Boolean(ally)) throw new Error('Saved Linus recruitment does not match the party.');
  if (!snapshot.recruited) reserve(snapshot.linus);
  return {
    recruited: snapshot.recruited,
    rewardsClaimed: snapshot.rewardsClaimed,
    linus: { x: snapshot.linus.x, z: snapshot.linus.z, hp: snapshot.linus.hp },
    villagers,
  };
}

export function escortPath(villager, refuge, occupied, level) {
  const blocked = new Set(occupied.filter((unit) => unit !== villager && unit.hp > 0).map((unit) => tileKey(unit.x, unit.z)));
  const goals = refuge.filter((tile) => !blocked.has(tileKey(tile.x, tile.z)));
  const path = findPath(villager, goals, blocked, level);
  let spent = 0;
  let last = 0;
  while (last + 1 < path.length) {
    const next = path[last + 1];
    spent += terrainMoveCost(level, next.x, next.z);
    if (spent > villager.movement) break;
    last++;
  }
  return path.slice(0, last + 1);
}

export function rescueProgress(state) {
  const rescued = state.villagers.filter((unit) => unit.status === 'rescued').length;
  const lost = state.villagers.filter((unit) => unit.hp <= 0).length;
  return { rescued, lost, remaining: state.villagers.length - rescued - lost };
}

export function rescueRewardIds(rules, rescued) {
  return rules.rewards.filter((reward) => rescued >= reward.rescued).flatMap((reward) => reward.items);
}

export function canRecruitLinus(maria, linus, state) {
  return Boolean(state && !state.recruited && maria.id === 'maria' && maria.hp > 0 && linus.hp > 0 &&
    distanceBetween(maria.x, maria.z, linus.x, linus.z) === 1);
}
