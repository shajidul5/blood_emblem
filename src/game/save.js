import { validateLevel, CHAPTER_COUNT } from '../levels/level.js';
import { isLevelTileWalkable } from '../levels/tiles.js';
import { INVENTORY_ITEMS } from '../characters/inventory.js';
import { ENEMY_IDS } from '../characters/characters.js';

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
    moved: player.moved,
    acted: player.acted,
    moveOrigin: player.moveOrigin ?? null,
    inventory: player.inventory.map(({ id, uses }) => ({ id, uses })),
    equippedWeaponId: player.weapon.id,
    stats: Object.fromEntries(PLAYER_STATS.map((stat) => [stat, player[stat]])),
  };
}

function validInventory(inventory, equippedWeaponId) {
  const inventoryIds = new Set();
  return Array.isArray(inventory) &&
    inventory.length <= 20 &&
    inventory.every((entry) => {
      const item = entry && INVENTORY_ITEMS.get(entry.id);
      if (!item || inventoryIds.has(entry.id)) return false;
      inventoryIds.add(entry.id);
      return item.itemType === 'weapon'
        ? entry.uses === null
        : Number.isInteger(entry.uses) && entry.uses > 0 && entry.uses <= item.maxUses;
    }) &&
    typeof equippedWeaponId === 'string' &&
    inventoryIds.has(equippedWeaponId) &&
    INVENTORY_ITEMS.get(equippedWeaponId)?.itemType === 'weapon';
}

export function createSaveData(level, player, enemies, gameState, extras = {}) {
  return {
    version: 1,
    level,
    player: serializeUnit(player),
    allies: (extras.allies ?? []).map(serializeUnit),
    chapter: extras.chapter ?? null,
    chapterStart: extras.chapterStart ?? null,
    enemies: enemies.map(({ id, x, z, hp, maxHp }) => ({ id, x, z, hp, maxHp })),
    turn: gameState.turn,
    phase: gameState.phase,
    defeated: gameState.defeated,
  };
}

export function writeSave(save) {
  localStorage.setItem(SAVE_KEY, JSON.stringify(save));
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
    const inventoryIds = new Set();
    if (
      player.inventory === undefined ||
      !Array.isArray(player.inventory) ||
      player.inventory.length > 20 ||
      !player.inventory.every((entry) => {
        const item = entry && INVENTORY_ITEMS.get(entry.id);
        if (!item || inventoryIds.has(entry.id)) return false;
        inventoryIds.add(entry.id);
        return item.itemType === 'weapon'
          ? entry.uses === null
          : Number.isInteger(entry.uses) && entry.uses > 0 && entry.uses <= item.maxUses;
      }) ||
      typeof player.equippedWeaponId !== 'string' ||
      !inventoryIds.has(player.equippedWeaponId) ||
      INVENTORY_ITEMS.get(player.equippedWeaponId)?.itemType !== 'weapon'
    ) {
      throw new Error('Saved player inventory is invalid.');
    }
  }

  const occupiedTiles = new Set(player.stats.hp > 0 ? [`${player.x},${player.z}`] : []);
  const allies = save.allies ?? [];
  if (!Array.isArray(allies) || allies.length > 3) throw new Error('Saved allies are invalid.');
  for (const ally of allies) {
    if (
      !ally || ally.id !== 'bartz' ||
      !isIntegerInRange(ally.x, 0, level.width - 1) ||
      !isIntegerInRange(ally.z, 0, level.height - 1) ||
      !isIntegerInRange(ally.level, 1, 999) ||
      !isIntegerInRange(ally.experience, 0, 99) ||
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
    if (ally.stats.hp > 0) {
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
    start.stats && PLAYER_STATS.every((stat) => Number.isInteger(start.stats[stat])) &&
    validInventory(start.inventory, start.equippedWeaponId)
    ? start : null;
  for (const enemy of save.enemies) {
    if (
      !enemy ||
      (enemy.id !== undefined && !ENEMY_IDS.has(enemy.id)) ||
      !isIntegerInRange(enemy.x, 0, level.width - 1) ||
      !isIntegerInRange(enemy.z, 0, level.height - 1) ||
      !isLevelTileWalkable(level, enemy.x, enemy.z) ||
      !isIntegerInRange(enemy.hp, 1, 999) ||
      !isIntegerInRange(enemy.maxHp, enemy.hp, 999) ||
      occupiedTiles.has(`${enemy.x},${enemy.z}`)
    ) {
      throw new Error('Saved enemy state is invalid.');
    }
    occupiedTiles.add(`${enemy.x},${enemy.z}`);
  }

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

  return { ...save, level, allies, chapter: save.chapter ?? null, chapterStart };
}
