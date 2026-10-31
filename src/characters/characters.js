import mariaProfile from '../../data/characters/maria.json';
import raiderProfile from '../../data/characters/raider.json';
import bartzProfile from '../../data/characters/bartz.json';
import merfolkProfile from '../../data/characters/merfolk.json';
import merfolkBossProfile from '../../data/characters/merfolk-boss.json';
import ironKatana from '../../data/weapons/iron-katana.json';
import { createInventory, createMariaInventory, INVENTORY_ITEMS } from './inventory.js';

function createCharacter(profile) {
  const weapon = INVENTORY_ITEMS.get(profile.weaponId);
  if (weapon?.itemType !== 'weapon') {
    throw new Error(`Character ${profile.id} references unknown weapon ${profile.weaponId}.`);
  }
  return {
    ...profile.currentStats,
    name: profile.name,
    class: profile.class,
    type: profile.type,
    sprite: profile.sprite,
    spriteSet: profile.spriteSet ?? profile.id,
    scale: profile.scale,
    baseStats: profile.baseStats,
    growthRates: profile.growthRates,
    level: profile.level,
    experience: profile.experience,
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
  maria.weapon = INVENTORY_ITEMS.get(ironKatana.id);
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

const ENEMY_PROFILES = new Map([
  [raiderProfile.id, raiderProfile],
  [bartzProfile.id, bartzProfile],
  [merfolkProfile.id, merfolkProfile],
  [merfolkBossProfile.id, merfolkBossProfile],
]);

export const ENEMY_IDS = new Set(ENEMY_PROFILES.keys());

export function createEnemyUnit(id, x, z) {
  const profile = ENEMY_PROFILES.get(id);
  if (!profile) throw new Error(`Unknown enemy "${id}".`);
  return { ...createCharacter(profile), x, z };
}
