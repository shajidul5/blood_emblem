import mariaProfile from '../../data/characters/maria.json';
import raiderProfile from '../../data/characters/raider.json';
import bartzProfile from '../../data/characters/bartz.json';
import merfolkProfile from '../../data/characters/merfolk.json';
import merfolkBossProfile from '../../data/characters/merfolk-boss.json';
import cypherProfile from '../../data/characters/cypher.json';
import seymourProfile from '../../data/characters/seymour.json';
import merfolkChieftainProfile from '../../data/characters/merfolk-chieftain.json';
import killianProfile from '../../data/characters/killian.json';
import deepMerfolkProfile from '../../data/characters/deep-merfolk.json';
import rapier from '../../data/weapons/rapier.json';
import { canEquipWeapon, getClass } from './classes.js';
import { createInventory, createMariaInventory, INVENTORY_ITEMS } from './inventory.js';

function createCharacter(profile) {
  const weapon = INVENTORY_ITEMS.get(profile.weaponId);
  if (weapon?.itemType !== 'weapon') {
    throw new Error(`Character ${profile.id} references unknown weapon ${profile.weaponId}.`);
  }
  const unitClass = getClass(profile.classId);
  if (!canEquipWeapon({ classId: profile.classId }, weapon)) {
    throw new Error(`Character ${profile.id} (${unitClass.name}) cannot equip ${weapon.type} weapon ${weapon.id}.`);
  }
  return {
    ...profile.currentStats,
    name: profile.name,
    classId: profile.classId,
    class: unitClass.name,
    type: profile.type,
    sprite: profile.sprite,
    spriteSet: profile.spriteSet ?? profile.id,
    scale: profile.scale,
    baseStats: profile.baseStats,
    growthRates: profile.growthRates,
    level: profile.level,
    experience: profile.experience,
    weaponExp: profile.weaponExp ? { ...profile.weaponExp } : undefined,
    isBoss: profile.isBoss ?? false,
    id: profile.id,
    weapon,
    x: 0,
    z: 0,
    hp: profile.currentStats.hp,
    maxHp: profile.currentStats.hp,
    moved: false,
    acted: false,
  };
}

export function createMaria() {
  const maria = { ...createCharacter(mariaProfile), facing: 'south' };
  maria.inventory = createMariaInventory();
  maria.weapon = INVENTORY_ITEMS.get(rapier.id);
  return maria;
}

export function createRaider(x, z) {
  return { ...createCharacter(raiderProfile), x, z };
}

export function createBartz(x, z) {
  return { ...createCharacter(bartzProfile), x, z };
}

// Bartz fights beside Maria from chapter 2 on, so he is a controllable unit with an inventory.
export function createBartzAlly() {
  return {
    ...createCharacter(bartzProfile),
    isBoss: false,
    facing: 'south',
    moveOrigin: null,
    inventory: createInventory(bartzProfile.inventory ?? [bartzProfile.weaponId]),
  };
}

export function createCypherAlly() {
  return {
    ...createCharacter(cypherProfile),
    isBoss: false,
    facing: 'south',
    moveOrigin: null,
    inventory: createInventory(cypherProfile.inventory),
  };
}

export function createSeymourAlly() {
  return {
    ...createCharacter(seymourProfile),
    isBoss: false,
    facing: 'south',
    moveOrigin: null,
    inventory: createInventory(seymourProfile.inventory),
  };
}

const ENEMY_PROFILES = new Map([
  [raiderProfile.id, raiderProfile],
  [bartzProfile.id, bartzProfile],
  [merfolkProfile.id, merfolkProfile],
  [merfolkBossProfile.id, merfolkBossProfile],
  [merfolkChieftainProfile.id, merfolkChieftainProfile],
  [killianProfile.id, killianProfile],
[deepMerfolkProfile.id, deepMerfolkProfile],
]);

export const ENEMY_IDS = new Set(ENEMY_PROFILES.keys());

// The profile's stats are its stats at profile.level. Each level above that adds
// growthRate% of a point per stat (rounded), so the same sheet scales into later chapters.
function scaleProfileToLevel(profile, level) {
  if (level === undefined || level === profile.level) return profile;
  if (level < profile.level) {
    throw new Error(`Enemy ${profile.id} cannot be scaled below its base level ${profile.level}.`);
  }
  const gainedLevels = level - profile.level;
  const currentStats = { ...profile.currentStats };
  for (const [stat, rate] of Object.entries(profile.growthRates)) {
    currentStats[stat] += Math.round((rate / 100) * gainedLevels);
  }
  return { ...profile, level, currentStats };
}

export const ENEMY_AI_MODES = ['mobile', 'guard', 'stationary'];

// ai: mobile always advances, guard only moves once a player is within move + attack reach,
// stationary never moves. A placement's ai overrides the character sheet's default.
export function createEnemyUnit(id, x, z, { level, ai, drop } = {}) {
  const profile = ENEMY_PROFILES.get(id);
  if (!profile) throw new Error(`Unknown enemy "${id}".`);
  const mode = ai ?? profile.ai ?? 'mobile';
  if (!ENEMY_AI_MODES.includes(mode)) throw new Error(`Enemy ${id} has unknown ai "${mode}".`);
  const enemy = { ...createCharacter(scaleProfileToLevel(profile, level)), ai: mode, x, z };
  if (drop) enemy.drop = drop;
  return enemy;
}
