import mariaProfile from '../../data/characters/maria.json';
import raiderProfile from '../../data/characters/raider.json';
import bartzProfile from '../../data/characters/bartz.json';
import ironKatana from '../../data/weapons/iron-katana.json';
import raiderAxe from '../../data/weapons/raider-axe.json';
import bartzCutlass from '../../data/weapons/bartz-cutlass.json';
import { createMariaInventory, INVENTORY_ITEMS } from './inventory.js';

function createCharacter(profile, weapon) {
  return {
    ...profile.currentStats,
    name: profile.name,
    class: profile.class,
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
  const maria = { ...createCharacter(mariaProfile, ironKatana), facing: 'south' };
  maria.inventory = createMariaInventory();
  maria.weapon = INVENTORY_ITEMS.get(ironKatana.id);
  return maria;
}

export function createRaider(x, z) {
  return { ...createCharacter(raiderProfile, raiderAxe), x, z };
}

export function createBartz(x, z) {
  return { ...createCharacter(bartzProfile, bartzCutlass), x, z };
}
