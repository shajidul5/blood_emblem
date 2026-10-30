import mariaProfile from '../../data/characters/maria.json';
import raiderProfile from '../../data/characters/raider.json';
import bartzProfile from '../../data/characters/bartz.json';
import ironKatana from '../../data/weapons/iron-katana.json';
import { createMariaInventory, INVENTORY_ITEMS } from './inventory.js';

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
