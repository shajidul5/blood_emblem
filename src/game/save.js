import { validateLevel, CHAPTER_COUNT } from '../levels/level.js';
import { isLevelTileWalkable } from '../levels/tiles.js';
import { INVENTORY_ITEMS, MAX_INVENTORY_SIZE } from '../characters/inventory.js';
import { ENEMY_IDS } from '../characters/characters.js';
import { validWeaponExp } from '../characters/weapon-levels.js';
import { CLASSES, MAX_USES_MULTIPLIER } from '../characters/classes.js';
import { validateRescueState } from './rescue.js';

const validClassId = (classId) => classId === undefined || CLASSES.has(classId);

const SAVE_KEY = 'blood-emblem-save';
const PLAYER_STATS = [
  'hp',
  'maxHp',
  'strength',
  'magic',
  'dexterity',
  'speed',
  'luck',
  'defense',
  'resistance',
  'movement',
  'build',
];
const FACINGS = new Set([
  'north',
  'north-east',
  'east',
  'south-east',
  'south',
  'south-west',
  'west',
  'north-west',
]);

export function serializeUnit(player) {
  return {
    id: player.id,
    x: player.x,
    z: player.z,
    facing: player.facing,
    level: player.level,
    experience: player.experience,
    classId: player.classId,
    weaponExp: { ...player.weaponExp },
    moved: player.moved,
    acted: player.acted,
    moveOrigin: player.moveOrigin ?? null,
    inventory: player.inventory.map(({ id, uses }) => ({ id, uses })),
    equippedWeaponId: player.weapon?.id ?? null,
    stats: Object.fromEntries(PLAYER_STATS.map((stat) => [stat, player[stat]])),
  };
}

function validInventory(inventory, equippedWeaponId) {
  return Array.isArray(inventory) &&
    inventory.length <= MAX_INVENTORY_SIZE &&
    inventory.every(validInventoryEntry) &&
    (equippedWeaponId === null || (
      typeof equippedWeaponId === 'string' &&
      inventory.some((entry) => entry.id === equippedWeaponId) &&
      INVENTORY_ITEMS.get(equippedWeaponId)?.itemType === 'weapon'));
}

function validInventoryEntry(entry) {
  const item = entry && INVENTORY_ITEMS.get(entry.id);
  if (!item) return false;
  return item.itemType === 'weapon'
    ? (entry.uses === null || (item.maxUses && Number.isInteger(entry.uses) && entry.uses >= 0 && entry.uses <= item.maxUses * MAX_USES_MULTIPLIER))
    : Number.isInteger(entry.uses) && entry.uses > 0 && entry.uses <= item.maxUses;
}

function validConvoy(convoy) {
  return Array.isArray(convoy) && convoy.length <= 99 && convoy.every(validInventoryEntry)
    ? convoy.map(({ id, uses }) => ({ id, uses }))
    : [];
}

export function createSaveData(level, player, enemies, gameState, extras = {}) {
  return {
    version: 1,
    level,
    player: serializeUnit(player),
    allies: (extras.allies ?? []).map((unit) => ({
      ...serializeUnit(unit),
      ...(extras.isBenched?.(unit) ? { benched: true } : {}),
    })),
    convoy: (extras.convoy ?? []).map(({ id, uses }) => ({ id, uses })),
    chapter: extras.chapter ?? null,
    chapterStart: extras.chapterStart ?? null,
    insight: extras.insight ?? null,
    rescue: extras.rescue ?? null,
    enemies: enemies.map(({ id, x, z, hp, maxHp, level, ai, drop, frozen }) => ({ id, x, z, hp, maxHp, level, ai, ...(drop ? { drop } : {}), ...(frozen ? { frozen: true } : {}) })),
    turn: gameState.turn,
    phase: gameState.phase,
    defeated: gameState.defeated,
  };
}

export function writeSave(save) {
  localStorage.setItem(SAVE_KEY, JSON.stringify(save));
}

export const SAVE_SLOT_COUNT = 3;
const slotKey = (slot) => `${SAVE_KEY}-slot-${slot}`;

// Light summary for the slot list; the full validation happens when the slot is loaded.
export function describeSaveSlot(slot) {
  const raw = localStorage.getItem(slotKey(slot));
  if (raw === null) return null;
  try {
    const save = JSON.parse(raw);
    return {
      chapter: save.level?.name ?? 'Unknown chapter',
      turn: save.turn,
      level: save.player?.level,
      savedAt: save.savedAt ?? null,
    };
  } catch {
    return { chapter: 'Unreadable save', turn: null, level: null, savedAt: null };
  }
}

// Copies the current autosave into a slot, so later autosaves never overwrite it.
export function copyCurrentSaveToSlot(slot) {
  const raw = localStorage.getItem(SAVE_KEY);
  if (raw === null) throw new Error('There is no game in progress to save.');
  const save = JSON.parse(raw);
  localStorage.setItem(slotKey(slot), JSON.stringify({ ...save, savedAt: new Date().toISOString() }));
}

export function loadSlotIntoCurrentSave(slot) {
  const raw = localStorage.getItem(slotKey(slot));
  if (raw === null) throw new Error('That save slot is empty.');
  const previous = localStorage.getItem(SAVE_KEY);
  localStorage.setItem(SAVE_KEY, raw);
  try {
    readSave();
  } catch (error) {
    if (previous === null) localStorage.removeItem(SAVE_KEY);
    else localStorage.setItem(SAVE_KEY, previous);
    throw error;
  }
}

export function readSave() {
  const rawSave = localStorage.getItem(SAVE_KEY);
  if (rawSave === null) return null;

  let save;
  try {
    save = JSON.parse(rawSave);
  } catch (error) {
    throw new Error(`Saved game data is not valid JSON: ${error.message}`);
  }
  if (!save || save.version !== 1 || !save.player || !Array.isArray(save.enemies)) {
    throw new Error('Saved game data has an unsupported format.');
  }

  const level = validateLevel(save.level);
  const player = save.player;
  const isIntegerInRange = (value, min, max) =>
    Number.isInteger(value) && value >= min && value <= max;
  if (
    !isIntegerInRange(player.x, 0, level.width - 1) ||
    !isIntegerInRange(player.z, 0, level.height - 1) ||
    !isLevelTileWalkable(level, player.x, player.z) ||
    !isIntegerInRange(player.level, 1, 999) ||
    !isIntegerInRange(player.experience, 0, 99) ||
    !validWeaponExp(player.weaponExp) ||
    !validClassId(player.classId) ||
    !FACINGS.has(player.facing) ||
    typeof player.moved !== 'boolean' ||
    typeof player.acted !== 'boolean' ||
    typeof player.stats !== 'object' ||
    player.stats === null ||
    !PLAYER_STATS.every((stat) => Number.isInteger(player.stats[stat])) ||
    !isIntegerInRange(player.stats.hp, 0, player.stats.maxHp) ||
    !isIntegerInRange(player.stats.maxHp, 1, 999) ||
    !isIntegerInRange(save.turn, 1, 999999) ||
    !['player', 'victory', 'enemy'].includes(save.phase) ||
    typeof save.defeated !== 'boolean'
  ) {
    throw new Error('Saved player or game state is invalid.');
  }

  if (player.inventory !== undefined || player.equippedWeaponId !== undefined) {
    if (!validInventory(player.inventory, player.equippedWeaponId)) {
      throw new Error('Saved player inventory is invalid.');
    }
  }

  const occupiedTiles = new Set(player.stats.hp > 0 ? [`${player.x},${player.z}`] : []);
  const allies = save.allies ?? [];
  if (!Array.isArray(allies) || allies.length > 5) throw new Error('Saved allies are invalid.');
  for (const ally of allies) {
    if (
      !ally || !['bartz', 'cypher', 'seymour', 'stark', 'linus'].includes(ally.id) ||
      !isIntegerInRange(ally.x, 0, level.width - 1) ||
      !isIntegerInRange(ally.z, 0, level.height - 1) ||
      !isIntegerInRange(ally.level, 1, 999) ||
      !isIntegerInRange(ally.experience, 0, 99) ||
      !validWeaponExp(ally.weaponExp) ||
      !validClassId(ally.classId) ||
      !FACINGS.has(ally.facing) ||
      typeof ally.moved !== 'boolean' ||
      typeof ally.acted !== 'boolean' ||
      !ally.stats ||
      !PLAYER_STATS.every((stat) => Number.isInteger(ally.stats[stat])) ||
      !isIntegerInRange(ally.stats.hp, 0, ally.stats.maxHp) ||
      !isIntegerInRange(ally.stats.maxHp, 1, 999) ||
      !validInventory(ally.inventory, ally.equippedWeaponId)
    ) {
      throw new Error('Saved ally state is invalid.');
    }
    if (ally.stats.hp > 0 && !ally.benched) {
      const key = `${ally.x},${ally.z}`;
      if (!isLevelTileWalkable(level, ally.x, ally.z) || occupiedTiles.has(key)) {
        throw new Error('Saved ally state is invalid.');
      }
      occupiedTiles.add(key);
    }
  }
  if (
    save.chapter !== undefined && save.chapter !== null &&
    !isIntegerInRange(save.chapter, 0, CHAPTER_COUNT - 1)
  ) {
    throw new Error('Saved chapter is invalid.');
  }
  const start = save.chapterStart;
  const chapterStart = start &&
    isIntegerInRange(start.level, 1, 999) &&
    isIntegerInRange(start.experience, 0, 99) &&
    validWeaponExp(start.weaponExp) &&
    validClassId(start.classId) &&
    start.stats && PLAYER_STATS.every((stat) => Number.isInteger(start.stats[stat])) &&
    validInventory(start.inventory, start.equippedWeaponId)
    ? {
      ...start,
      convoy: validConvoy(start.convoy),
      allies: (Array.isArray(start.allies) ? start.allies : []).filter((ally) =>
        ally && ['bartz', 'cypher', 'seymour', 'stark', 'linus'].includes(ally.id) &&
        isIntegerInRange(ally.level, 1, 999) &&
        isIntegerInRange(ally.experience, 0, 99) &&
        validWeaponExp(ally.weaponExp) &&
        validClassId(ally.classId) &&
        ally.stats && PLAYER_STATS.every((stat) => Number.isInteger(ally.stats[stat])) &&
        validInventory(ally.inventory, ally.equippedWeaponId)),
    }
    : null;
  for (const enemy of save.enemies) {
    if (
      !enemy ||
      (enemy.id !== undefined && !ENEMY_IDS.has(enemy.id)) ||
      !isIntegerInRange(enemy.x, 0, level.width - 1) ||
      !isIntegerInRange(enemy.z, 0, level.height - 1) ||
      !isLevelTileWalkable(level, enemy.x, enemy.z) ||
      !isIntegerInRange(enemy.hp, 1, 999) ||
      !isIntegerInRange(enemy.maxHp, enemy.hp, 999) ||
      (enemy.level !== undefined && !isIntegerInRange(enemy.level, 1, 99)) ||
      (enemy.ai !== undefined && !['mobile', 'guard', 'stationary'].includes(enemy.ai)) ||
      (enemy.drop !== undefined && !INVENTORY_ITEMS.has(enemy.drop)) ||
      occupiedTiles.has(`${enemy.x},${enemy.z}`)
    ) {
      throw new Error('Saved enemy state is invalid.');
    }
    occupiedTiles.add(`${enemy.x},${enemy.z}`);
  }

  const rescue = validateRescueState(save.rescue, level, occupiedTiles, allies);
  if (rescue?.rewardsClaimed && save.phase !== 'victory') throw new Error('Saved rescue rewards require a completed chapter.');
  const moveOrigin = player.moveOrigin;
  if (
    moveOrigin !== undefined &&
    moveOrigin !== null &&
    (
      !isIntegerInRange(moveOrigin.x, 0, level.width - 1) ||
      !isIntegerInRange(moveOrigin.z, 0, level.height - 1) ||
      !isLevelTileWalkable(level, moveOrigin.x, moveOrigin.z) ||
      occupiedTiles.has(`${moveOrigin.x},${moveOrigin.z}`) ||
      !player.moved ||
      player.acted
    )
  ) {
    throw new Error('Saved movement undo state is invalid.');
  }

  return { ...save, level, allies, convoy: validConvoy(save.convoy), chapter: save.chapter ?? null, chapterStart, rescue };
}
