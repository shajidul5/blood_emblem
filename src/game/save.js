import { validateLevel, CHAPTER_COUNT } from '../levels/level.js';
import { isLevelTileWalkable } from '../levels/tiles.js';
import { bookOf, copyEntry, currentItemId, INVENTORY_ITEMS, MAX_INVENTORY_SIZE } from '../characters/inventory.js';
import { ENEMY_IDS, enemyMovementType } from '../characters/characters.js';
import { validWeaponExp } from '../characters/weapon-levels.js';
import { CLASSES, MAX_USES_MULTIPLIER } from '../characters/classes.js';
import { validateRescueState } from './rescue.js';
import { validateGateEncounterState } from './gate-encounter.js';
import { validateInfirmaryState } from './infirmary.js';

const validClassId = (classId) => classId === undefined || CLASSES.has(classId);

const SAVE_KEY = 'blood-emblem-save';
const ALLY_IDS = ['bartz', 'cypher', 'seymour', 'stark', 'linus', 'rictor', 'lena', 'arlan', 'troy', 'eveline', 'corvis'];
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
    ...(player.frozen ? { frozen: player.frozen } : {}),
    inventory: player.inventory.map(copyEntry),
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
      inventory.some((entry) => entry.id === bookOf(INVENTORY_ITEMS.get(equippedWeaponId))) &&
      INVENTORY_ITEMS.get(equippedWeaponId)?.itemType === 'weapon'));
}

const validUses = (item, uses) =>
  Number.isInteger(uses) && uses >= 0 && uses <= item.maxUses * MAX_USES_MULTIPLIER;

// Per-spell uses on a tome: only spells written in that tome.
const validSpells = (entry) => entry.spells === undefined || (
  entry.spells !== null && typeof entry.spells === 'object' &&
  Object.entries(entry.spells).every(([spellId, uses]) => {
    const spell = INVENTORY_ITEMS.get(spellId);
    return spell?.spellbook === entry.id && validUses(spell, uses);
  }));

function validInventoryEntry(entry) {
  const item = entry && INVENTORY_ITEMS.get(entry.id);
  if (!item || item.spellbook || !validSpells(entry)) return false;
  return item.itemType === 'weapon'
    ? (entry.uses === null || (item.maxUses && validUses(item, entry.uses)))
    : Number.isInteger(entry.uses) && entry.uses > 0 && entry.uses <= item.maxUses;
}

function validConvoy(convoy) {
  return Array.isArray(convoy) && convoy.length <= 99 && convoy.every(validInventoryEntry)
    ? convoy.map(copyEntry)
    : [];
}

// Renamed items (Raikiri is now the Bloodletter) are rewritten before validation.
function migrateItemIds(save) {
  const fixEntries = (entries) => {
    if (!Array.isArray(entries)) return;
    for (const entry of entries) if (entry && typeof entry.id === 'string') entry.id = currentItemId(entry.id);
  };
  const fixUnit = (unit) => {
    if (!unit || typeof unit !== 'object') return;
    fixEntries(unit.inventory);
    if (typeof unit.equippedWeaponId === 'string') unit.equippedWeaponId = currentItemId(unit.equippedWeaponId);
  };
  for (const unit of [save.player, ...(save.allies ?? []), save.chapterStart, ...(save.chapterStart?.allies ?? [])]) fixUnit(unit);
  fixEntries(save.convoy);
  fixEntries(save.chapterStart?.convoy);
}

export function createSaveData(level, player, enemies, gameState, extras = {}) {
  return {
    version: 1,
    level,
    player: { ...serializeUnit(player), ...(extras.playerReserve ? { reserve: true } : {}) },
    allies: (extras.allies ?? []).map((unit) => ({
      ...serializeUnit(unit),
      ...(extras.isBenched?.(unit) ? { benched: true } : {}),
    })),
    convoy: (extras.convoy ?? []).map(copyEntry),
    chapter: extras.chapter ?? null,
    chapterStart: extras.chapterStart ?? null,
    insight: extras.insight ?? null,
    rescue: extras.rescue ?? null,
    enemies: enemies.map(({ id, x, z, hp, maxHp, level, ai, drop, weaponId, frozen, stealable, inventory }) => ({
      id, x, z, hp, maxHp, level, ai,
      ...(drop ? { drop } : {}),
      ...(weaponId ? { weaponId } : {}),
      ...(frozen ? { frozen } : {}),
      ...(stealable ? { stealable: [...stealable] } : {}),
      ...(inventory ? { inventory: inventory.map(copyEntry) } : {}),
    })),
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

function validateSlot(slot) {
  if (!Number.isInteger(slot) || slot < 1 || slot > SAVE_SLOT_COUNT) {
    throw new Error(`Choose a save slot from 1 to ${SAVE_SLOT_COUNT}.`);
  }
}

export function exportSaveFile(slot = null) {
  if (slot !== null) validateSlot(slot);
  const raw = localStorage.getItem(slot === null ? SAVE_KEY : slotKey(slot));
  if (raw === null) throw new Error(slot === null ? 'There is no current save to export.' : 'That save slot is empty.');
  return JSON.stringify(parseSave(raw), null, 2);
}

export function importSaveFile(text, slot) {
  validateSlot(slot);
  const save = parseSave(text);
  localStorage.setItem(slotKey(slot), JSON.stringify({ ...save, savedAt: new Date().toISOString() }));
  return save;
}

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
  const save = readSave();
  if (save === null) throw new Error('There is no game in progress to save.');
  localStorage.setItem(slotKey(slot), JSON.stringify({ ...save, savedAt: new Date().toISOString() }));
}

export function loadSlotIntoCurrentSave(slot) {
  const raw = localStorage.getItem(slotKey(slot));
  if (raw === null) throw new Error('That save slot is empty.');
  const previous = localStorage.getItem(SAVE_KEY);
  localStorage.setItem(SAVE_KEY, raw);
  try {
    writeSave(readSave());
  } catch (error) {
    if (previous === null) localStorage.removeItem(SAVE_KEY);
    else localStorage.setItem(SAVE_KEY, previous);
    throw error;
  }
}

export function readSave() {
  const rawSave = localStorage.getItem(SAVE_KEY);
  if (rawSave === null) return null;
  return parseSave(rawSave);
}

export function parseSave(rawSave) {
  let save;
  try {
    save = JSON.parse(rawSave);
  } catch (error) {
    throw new Error(`Saved game data is not valid JSON: ${error.message}`);
  }
  if (!save || save.version !== 1 || !save.player || !Array.isArray(save.enemies)) {
    throw new Error('Saved game data has an unsupported format.');
  }
  migrateItemIds(save);

  const level = validateLevel(save.level);
  const player = save.player;
  // A reserve Maria waits off the map (Rictor's chapters), so she has no tile to validate.
  const reserve = player.reserve === true;
  const isIntegerInRange = (value, min, max) =>
    Number.isInteger(value) && value >= min && value <= max;
  if (
    (!reserve && (
      !isIntegerInRange(player.x, 0, level.width - 1) ||
      !isIntegerInRange(player.z, 0, level.height - 1) ||
      !isLevelTileWalkable(level, player.x, player.z))) ||
    !isIntegerInRange(player.level, 1, 999) ||
    !isIntegerInRange(player.experience, 0, 99) ||
    !validWeaponExp(player.weaponExp) ||
    !validClassId(player.classId) ||
    !FACINGS.has(player.facing) ||
    typeof player.moved !== 'boolean' ||
    typeof player.acted !== 'boolean' ||
    (player.frozen !== undefined && (!isIntegerInRange(player.frozen, save.turn, save.turn + 1))) ||
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

  const occupiedTiles = new Set(player.stats.hp > 0 && !reserve ? [`${player.x},${player.z}`] : []);
  const allies = save.allies ?? [];
  if (!Array.isArray(allies) || allies.length > ALLY_IDS.length) throw new Error('Saved allies are invalid.');
  for (const ally of allies) {
    if (
      !ally || !ALLY_IDS.includes(ally.id) ||
      !isIntegerInRange(ally.x, 0, level.width - 1) ||
      !isIntegerInRange(ally.z, 0, level.height - 1) ||
      !isIntegerInRange(ally.level, 1, 999) ||
      !isIntegerInRange(ally.experience, 0, 99) ||
      !validWeaponExp(ally.weaponExp) ||
      !validClassId(ally.classId) ||
      !FACINGS.has(ally.facing) ||
      typeof ally.moved !== 'boolean' ||
      typeof ally.acted !== 'boolean' ||
      (ally.frozen !== undefined && (!isIntegerInRange(ally.frozen, save.turn, save.turn + 1))) ||
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
        ally && ALLY_IDS.includes(ally.id) &&
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
      !isLevelTileWalkable(level, enemy.x, enemy.z, { type: enemyMovementType(enemy.id) }) ||
      !isIntegerInRange(enemy.hp, 1, 999) ||
      !isIntegerInRange(enemy.maxHp, enemy.hp, 999) ||
      (enemy.level !== undefined && !isIntegerInRange(enemy.level, 1, 99)) ||
      (enemy.ai !== undefined && !['mobile', 'guard', 'stationary'].includes(enemy.ai)) ||
      (enemy.drop !== undefined && !INVENTORY_ITEMS.has(enemy.drop)) ||
      (enemy.stealable !== undefined && (!Array.isArray(enemy.stealable) ||
        !enemy.stealable.every((id) => INVENTORY_ITEMS.has(id)))) ||
      (enemy.inventory !== undefined && !validInventory(enemy.inventory, null)) ||
      (enemy.weaponId !== undefined && INVENTORY_ITEMS.get(enemy.weaponId)?.itemType !== 'weapon') ||
      (enemy.frozen !== undefined && enemy.frozen !== true && !isIntegerInRange(enemy.frozen, 1, 9)) ||
      occupiedTiles.has(`${enemy.x},${enemy.z}`)
    ) {
      throw new Error('Saved enemy state is invalid.');
    }
    occupiedTiles.add(`${enemy.x},${enemy.z}`);
  }

  validateGateEncounterState(level, save.enemies, save.phase, { ...player.stats, x: player.x, z: player.z });
  validateInfirmaryState(level, save.enemies, save.phase, save.turn);
  if (level.cathedral) {
    for (const [index, trigger] of level.cathedral.triggers.entries()) {
      const wave = level.reinforcements.find((entry) => entry.entranceId === trigger.id);
      if (trigger.warnedTurn === null
        ? wave.turn !== 999 || wave.spawned || wave.spawnedCount > 0
        : trigger.warnedTurn > save.turn || wave.turn !== trigger.warnedTurn + 1 ||
          wave.turn > save.turn + 1 || (wave.spawnedCount > 0 && wave.turn > save.turn) ||
          index > 0 && (level.cathedral.triggers[index - 1].warnedTurn === null ||
            level.cathedral.triggers[index - 1].warnedTurn >= trigger.warnedTurn)) {
        throw new Error('Saved Cathedral reinforcement timing is inconsistent.');
      }
    }
    if (save.phase === 'victory' && save.enemies.some((enemy) => enemy.id === level.cathedral.bossId)) {
      throw new Error('Saved Cathedral victory requires Voss to be defeated.');
    }
  }
  if (level.courtyard) {
    // Older slots could retain a scheduled arrival but omit its warning turn.
    // The arrival is always exactly one turn after that warning.
    for (const trigger of level.courtyard.triggers) {
      const wave = level.reinforcements.find((entry) => entry.entranceId === trigger.id);
      if (trigger.warnedTurn === null && wave.turn !== 999 &&
        wave.turn >= 2 && wave.turn <= save.turn + 1) {
        trigger.warnedTurn = wave.turn - 1;
        console.warn(`Recovered missing ${trigger.id} warning from saved arrival turn ${wave.turn}.`);
      }
    }
    const recruit = level.courtyard.recruit;
    const ally = allies.find((unit) => unit.id === recruit.id);
    const enemy = save.enemies.find((unit) => unit.id === recruit.id);
    if (recruit.recruited !== Boolean(ally) || (recruit.recruited && (enemy || recruit.dead)) ||
      (!recruit.recruited && recruit.dead !== !enemy)) {
      throw new Error('Saved courtyard recruitment state is inconsistent.');
    }
    const leader = player.id === level.leader ? player : allies.find((unit) => unit.id === level.leader);
    if (save.phase === 'victory' && (!leader || leader.stats.hp <= 0 ||
      save.enemies.some((unit) => unit.id === level.courtyard.bossId))) {
      throw new Error('Saved courtyard victory requires Severin to be defeated.');
    }
    for (const [index, trigger] of level.courtyard.triggers.entries()) {
      const wave = level.reinforcements.find((entry) => entry.entranceId === trigger.id);
      if (trigger.warnedTurn === null ? wave.spawned || wave.spawnedCount > 0 || wave.turn !== 999
        : trigger.warnedTurn > save.turn || wave.turn !== trigger.warnedTurn + 1 ||
          wave.spawnedCount > 0 && save.turn < wave.turn ||
          index > 0 && (level.courtyard.triggers[index - 1].warnedTurn === null ||
            level.courtyard.triggers[index - 1].warnedTurn >= trigger.warnedTurn)) {
        throw new Error('Saved courtyard reinforcement timing is inconsistent.');
      }
    }
  }
  if (level.streets) {
    const recruit = level.streets.recruit;
    const ally = allies.find((unit) => unit.id === recruit.id);
    if (recruit.recruited !== Boolean(ally) || (!recruit.recruited && recruit.dead !== (recruit.hp === 0)) || (recruit.recruited && recruit.dead) ||
      (!recruit.recruited && !recruit.dead &&
      occupiedTiles.has(`${recruit.x},${recruit.z}`))) {
      throw new Error('Saved street recruitment state is inconsistent.');
    }
    if (recruit.inventory !== undefined && !validInventory(recruit.inventory, null)) {
      throw new Error('Saved street healer inventory is invalid.');
    }
    const leader = player.id === 'rictor' ? player : allies.find((unit) => unit.id === 'rictor');
    if (save.phase === 'victory' && (!leader || leader.stats.hp <= 0 ||
      leader.x !== level.streets.seizePoint.x || leader.z !== level.streets.seizePoint.z ||
      save.enemies.some((enemy) => enemy.id === level.streets.bossId))) {
      throw new Error('Saved Cathedral approach victory is invalid.');
    }
  }
  const rescue = validateRescueState(save.rescue, level, occupiedTiles, allies);
  if (rescue?.rewardsClaimed && save.phase !== 'victory') throw new Error('Saved rescue rewards require a completed chapter.');
  const moveOrigin = player.moveOrigin;
  if (
    !reserve &&
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
