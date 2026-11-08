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
import feralWolfProfile from '../../data/characters/feral-wolf.json';
import liamProfile from '../../data/characters/liam.json';
import orsenProfile from '../../data/characters/orsen.json';
import orderCavalierProfile from '../../data/characters/order-cavalier.json';
import orderArcherProfile from '../../data/characters/order-archer.json';
import greatWolfProfile from '../../data/characters/great-wolf.json';
import rootWardenProfile from '../../data/characters/root-warden.json';
import heartrootProfile from '../../data/characters/heartroot.json';
import starkProfile from '../../data/characters/stark.json';
import linusProfile from '../../data/characters/linus.json';
import bridgeCaptainProfile from '../../data/characters/bridge-captain.json';
import bridgeKnightProfile from '../../data/characters/bridge-knight.json';
import villagerProfile from '../../data/characters/villager.json';
import goldenCaptainProfile from '../../data/characters/golden-captain.json';
import goldenCavalierProfile from '../../data/characters/golden-cavalier.json';
import goldenKnightProfile from '../../data/characters/golden-knight.json';
import goldenMageProfile from '../../data/characters/golden-mage.json';
import goldenSoldierProfile from '../../data/characters/golden-soldier.json';
import goldenArcherProfile from '../../data/characters/golden-archer.json';
import bloodBeastProfile from '../../data/characters/blood-beast.json';
import ravenProfile from '../../data/characters/raven.json';
import rictorProfile from '../../data/characters/rictor.json';
import lenaProfile from '../../data/characters/lena.json';
import wardSoldierProfile from '../../data/characters/ward-soldier.json';
import wardKnightProfile from '../../data/characters/ward-knight.json';
import wardWardenProfile from '../../data/characters/ward-warden.json';
import undeadProfile from '../../data/characters/undead.json';
import arlanProfile from '../../data/characters/arlan.json';
import rottenProfile from '../../data/characters/rotten.json';
import infirmaryRiderProfile from '../../data/characters/infirmary-rider.json';
import troyProfile from '../../data/characters/troy.json';
import evelineProfile from '../../data/characters/eveline.json';
import veyrProfile from '../../data/characters/veyr.json';
import streetUndeadProfile from '../../data/characters/street-undead.json';
import corvisProfile from '../../data/characters/corvis.json';
import churchSageProfile from '../../data/characters/church-sage.json';
import churchFreezerProfile from '../../data/characters/church-freezer.json';
import churchHealerProfile from '../../data/characters/church-healer.json';
import severinProfile from '../../data/characters/severin.json';
const cathedralProfiles = Object.values(import.meta.glob('../../data/characters/cathedral-*.json', { eager: true, import: 'default' }));
import vossProfile from '../../data/characters/voss.json';
import rapier from '../../data/weapons/rapier.json';
import { canEquipWeapon, getClass } from './classes.js';
import { createInventory, createMariaInventory, INVENTORY_ITEMS } from './inventory.js';

function createCharacter(profile) {
  const weapon = profile.weaponId === null ? null : INVENTORY_ITEMS.get(profile.weaponId);
  if (profile.weaponId !== null && weapon?.itemType !== 'weapon') {
    throw new Error(`Character ${profile.id} references unknown weapon ${profile.weaponId}.`);
  }
  const unitClass = getClass(profile.classId);
  const look = unitClass.sprites?.[profile.id] ?? unitClass.sprites?.default;
  if (!weapon && !unitClass.unarmed) throw new Error(`Character ${profile.id} needs a weapon for class ${unitClass.name}.`);
  if (weapon && !canEquipWeapon({ id: profile.id, classId: profile.classId, weaponExp: profile.weaponExp }, weapon)) {
    throw new Error(`Character ${profile.id} (${unitClass.name}) cannot equip ${weapon.type} weapon ${weapon.id}.`);
  }
  return {
    ...profile.currentStats,
    name: profile.name,
    classId: profile.classId,
    class: unitClass.name,
    type: unitClass.type ?? profile.type,
    movement: Math.max(profile.currentStats.movement, unitClass.minimumMovement ?? 0),
    sprite: look?.sprite ?? profile.sprite,
    spriteSet: look?.spriteSet ?? profile.spriteSet ?? profile.id,
    scale: look?.scale ?? profile.scale,
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
    frozen: false,
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

export function createStarkAlly() {
  return {
    ...createCharacter(starkProfile),
    isBoss: false,
    facing: 'south',
    moveOrigin: null,
    inventory: createInventory(starkProfile.inventory),
  };
}

export function createLinusAlly() {
  return {
    ...createCharacter(linusProfile),
    neutral: false,
    facing: 'south',
    moveOrigin: null,
    inventory: createInventory(linusProfile.inventory),
  };
}

export function createVillager(id, name) {
  return { ...createCharacter(villagerProfile), id, name, civilian: true, neutral: true, facing: 'south', inventory: [] };
}

// Part 3 opens on Rictor's party, a separate squad that fights without Maria.
function createPartThreeAlly(profile) {
  return {
    ...createCharacter(profile),
    party: 'rictor',
    facing: 'south',
    moveOrigin: null,
    inventory: createInventory(profile.inventory),
  };
}

export const createRictorAlly = () => createPartThreeAlly(rictorProfile);
export const createLenaAlly = () => createPartThreeAlly(lenaProfile);
export const createArlanAlly = () => createPartThreeAlly(arlanProfile);
export const createTroyAlly = () => createPartThreeAlly(troyProfile);
export const createEvelineAlly = () => createPartThreeAlly(evelineProfile);
export const createCorvisAlly = () => createPartThreeAlly(corvisProfile);

const ENEMY_PROFILES = new Map([
  [corvisProfile.id, corvisProfile],
  [churchSageProfile.id, churchSageProfile],
  [churchFreezerProfile.id, churchFreezerProfile],
  [churchHealerProfile.id, churchHealerProfile],
  [severinProfile.id, severinProfile],
  [veyrProfile.id, veyrProfile],
  [streetUndeadProfile.id, streetUndeadProfile],
  [rottenProfile.id, rottenProfile],
  [infirmaryRiderProfile.id, infirmaryRiderProfile],
  [wardSoldierProfile.id, wardSoldierProfile],
  [wardKnightProfile.id, wardKnightProfile],
  [wardWardenProfile.id, wardWardenProfile],
  [undeadProfile.id, undeadProfile],
  [ravenProfile.id, ravenProfile],
  [goldenCaptainProfile.id, goldenCaptainProfile],
  [goldenCavalierProfile.id, goldenCavalierProfile],
  [goldenKnightProfile.id, goldenKnightProfile],
  [goldenMageProfile.id, goldenMageProfile],
  [goldenSoldierProfile.id, goldenSoldierProfile],
  [goldenArcherProfile.id, goldenArcherProfile],
  [bloodBeastProfile.id, bloodBeastProfile],
  [bridgeCaptainProfile.id, bridgeCaptainProfile],
  [bridgeKnightProfile.id, bridgeKnightProfile],
  [orsenProfile.id, orsenProfile],
  [orderCavalierProfile.id, orderCavalierProfile],
  [orderArcherProfile.id, orderArcherProfile],
  [greatWolfProfile.id, greatWolfProfile],
  [raiderProfile.id, raiderProfile],
  [bartzProfile.id, bartzProfile],
  [merfolkProfile.id, merfolkProfile],
  [merfolkBossProfile.id, merfolkBossProfile],
  [merfolkChieftainProfile.id, merfolkChieftainProfile],
  [killianProfile.id, killianProfile],
[deepMerfolkProfile.id, deepMerfolkProfile],
  [feralWolfProfile.id, feralWolfProfile],
  [liamProfile.id, liamProfile],
  [heartrootProfile.id, heartrootProfile],
  [rootWardenProfile.id, rootWardenProfile],
]);

for (const profile of [...cathedralProfiles, vossProfile]) ENEMY_PROFILES.set(profile.id, profile);
export const ENEMY_IDS = new Set(ENEMY_PROFILES.keys());
export const enemyMovementType = (id) => ENEMY_PROFILES.get(id)?.type;

export function isBossEnemy(id) {
  return ENEMY_PROFILES.get(id)?.isBoss === true;
}

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
// stationary never moves. A placement's ai overrides the character sheet's default, and weaponId its weapon
// (late-game mages casting higher-tier spells).
export function createEnemyUnit(id, x, z, { level, ai, drop, weaponId, stealable } = {}) {
  const profile = ENEMY_PROFILES.get(id);
  if (!profile) throw new Error(`Unknown enemy "${id}".`);
  const mode = ai ?? profile.ai ?? 'mobile';
  if (!ENEMY_AI_MODES.includes(mode)) throw new Error(`Enemy ${id} has unknown ai "${mode}".`);
  const enemy = { ...createCharacter(scaleProfileToLevel(profile, level)), ai: mode, x, z };
  if (profile.inventory) enemy.inventory = createInventory(profile.inventory);
  if (profile.spellUses) {
    enemy.authoredSpells = Object.keys(profile.spellUses);
    for (const entry of enemy.inventory) {
      const spells = Object.fromEntries(Object.entries(profile.spellUses)
        .filter(([id]) => INVENTORY_ITEMS.get(id)?.spellbook === entry.id));
      if (Object.keys(spells).length) entry.spells = spells;
    }
  }
  if (profile.staffUses) {
    for (const entry of enemy.inventory) {
      if (profile.staffUses[entry.id] !== undefined) entry.uses = profile.staffUses[entry.id];
    }
  }
  if (drop) enemy.drop = drop;
  if (stealable !== undefined) {
    if (!Array.isArray(stealable) || !stealable.every((item) => INVENTORY_ITEMS.has(item))) {
      throw new Error(`Enemy ${id} has invalid stealable items.`);
    }
    enemy.stealable = [...stealable];
  }
  if (weaponId) {
    const weapon = INVENTORY_ITEMS.get(weaponId);
    // Enemy spell loadouts are authored directly, rather than unlocked through player rank progression.
    if (weapon?.itemType !== 'weapon' || !canEquipWeapon(enemy, { ...weapon, requiredRank: undefined })) {
      throw new Error(`Enemy ${id} cannot wield ${weaponId}.`);
    }
    enemy.weapon = weapon;
    enemy.weaponId = weaponId;
  }
  return enemy;
}
