import * as THREE from 'three';
import {
  getAttackCount,
  getAvoid,
  getCriticalRate,
  getCriticalDamage,
  getCombatExperience,
  getCombatDamage,
  getHitRate,
  isInWeaponRange,
  rollCritical,
  rollHit,
  weaponRangeLabel,
} from './battle/combat.js';
import {
  DIRECTIONS,
  distanceBetween,
  findEnemyAt,
  findPath,
  getAttackTargets,
  getFacing,
  getMovementRange,
  isWalkable,
  tileKey,
} from './battle/grid.js';
import { createBartz, createMaria, createRaider as createRaiderData } from './characters/characters.js';
import { createExperienceDisplay } from './characters/experience-display.js';
import { createLevelUpDialog } from './characters/level-up-dialog.js';
import { awardExperience } from './characters/progression.js';
import { createProfileDialog } from './characters/profile-dialog.js';
import { INVENTORY_ITEMS, restoreMariaInventory } from './characters/inventory.js';
import { loadCharacterSprites } from './characters/animation-loader.js';
import { createSaveData, readSave, writeSave } from './game/save.js';
import {
  buildLevel,
  loadInitialLevel,
  validateLevel,
  WALKABLE_TILES,
} from './levels/level.js';
import { getTerrain, getTileElevation } from './battle/terrain.js';
import { initializeAnimatedMenu } from './menu.js';

initializeAnimatedMenu();

// ---------------------------------------------------------------
// Blood-Emblem: minimal HD-2D style prototype
// Pixel-art sprites (nearest-neighbour) standing in a lit 3D scene.
// ---------------------------------------------------------------

function blobShadowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(0,0,0,0.55)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

// ---------- Renderer / scene / camera ----------

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0710);
scene.fog = new THREE.Fog(0x0b0710, 35, 85);

const camera = new THREE.PerspectiveCamera(
  28,
  window.innerWidth / window.innerHeight,
  0.1,
  100,
);
const pointerRaycaster = new THREE.Raycaster();
const pointerPosition = new THREE.Vector2();
const deckPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.11);
const CAM_OFFSET = new THREE.Vector3(0, 14, 10);

// ---------- Lighting ----------

scene.add(new THREE.AmbientLight(0x4a3a66, 0.9));

const moon = new THREE.DirectionalLight(0x9fb4ff, 0.8);
moon.position.set(-8, 14, 6);
moon.castShadow = true;
moon.shadow.mapSize.set(2048, 2048);
moon.shadow.camera.left = -16;
moon.shadow.camera.right = 16;
moon.shadow.camera.top = 16;
moon.shadow.camera.bottom = -16;
scene.add(moon);

const torch = new THREE.PointLight(0xff7a3c, 40, 12, 2);
torch.castShadow = true;
scene.add(torch);

// ---------- Level loading and world ----------

const levelStatus = document.querySelector('#level-status');
const phaseLabel = document.querySelector('#phase-label');
const objectiveLabel = document.querySelector('#objective-label');
const phaseBanner = document.querySelector('#phase-banner');
const tileInspection = document.querySelector('#tile-inspection');
const unitHoverCard = document.querySelector('#unit-hover-card');
const experiencePanel = document.querySelector('#exp-panel');
const unitListDialog = document.querySelector('#unit-list-dialog');
const actionPanel = document.querySelector('#action-panel');
const actionHelp = document.querySelector('#action-help');
const backActionButton = document.querySelector('#cancel-action');
const battleMessage = document.querySelector('#battle-message');
const mainMenu = document.querySelector('#main-menu');
const terminalScreen = document.querySelector('#terminal-screen');
const terminalHeading = document.querySelector('#terminal-heading');
const terminalMessage = document.querySelector('#terminal-message');
const menuStatus = document.querySelector('#menu-status');
const continueButton = document.querySelector('#continue-game');
const newGameButton = document.querySelector('#new-game');
const optionsDialog = document.querySelector('#options-dialog');
const combatForecastDialog = document.querySelector('#combat-forecast');
const actionButtons = [...actionPanel.querySelectorAll('button')];
const profileDialog = document.querySelector('#profile-dialog');
const inventoryDialog = document.querySelector('#inventory-dialog');
const experienceDisplay = createExperienceDisplay(document.querySelector('#exp-panel'));
const levelUpDialogUi = createLevelUpDialog(document.querySelector('#level-up-dialog'));
const profileDialogUi = createProfileDialog(profileDialog);
const player = createMaria();
const playerTeam = [player];
experienceDisplay.reset(player.level, player.experience);
let activeLevel;
let sessionStarted = false;
let levelGroup = new THREE.Group();
const tacticalOverlay = new THREE.Group();
scene.add(levelGroup);
scene.add(tacticalOverlay);
const gameState = { mode: 'cursor', phase: 'player', turn: 1, selected: false, defeated: false };
const cursor = { x: 0, z: 0 };
const UNIT_SPRITE_HEIGHT = 1.5;
const UNIT_SPRITE_WIDTH = UNIT_SPRITE_HEIGHT;

// Per-character scale adjustments to normalize visual sizes
const CHARACTER_SCALES = {
  maria: 1.0,
  bartz: 0.9,
  raider: 0.9,
};
let playerMovement;
let attackAnimation;
let enemyMovement;
let cameraFollowTarget;
let pendingCombatTarget;
const floatingCombatTexts = [];
let phaseBannerTimeout;
let terminalFocusTimeout;
let movementRange = new Map();
let enemies = [];
let cursorOutline;
let moveHighlights;
let targetHighlights;
let movementPathMeshes = [];
let movementPathMaterial;

function setLevelStatus(message, isError = false) {
  levelStatus.textContent = message;
  levelStatus.style.color = isError ? '#ed9292' : '#e8d9d9';
}

const initialLevel = await loadInitialLevel(setLevelStatus);
activeLevel = buildLevel(THREE, levelGroup, initialLevel);
player.x = initialLevel.spawn.x;
player.z = initialLevel.spawn.z;
cursor.x = player.x;
cursor.z = player.z;

// Player
const characterSprites = await loadCharacterSprites();
const hero = new THREE.Mesh(
  new THREE.PlaneGeometry(UNIT_SPRITE_WIDTH, UNIT_SPRITE_HEIGHT),
  new THREE.MeshBasicMaterial({
    map: characterSprites.maria.south,
    alphaTest: 0.5,
    side: THREE.DoubleSide,
  }),
);
hero.scale.set(CHARACTER_SCALES.maria, CHARACTER_SCALES.maria, 1);
const HERO_DECK_HEIGHT = 0.12;
function unitSpriteHeightAt(x, z) {
  return UNIT_SPRITE_HEIGHT / 2 + HERO_DECK_HEIGHT + getTileElevation(activeLevel, x, z);
}

hero.position.y = unitSpriteHeightAt(player.x, player.z);
scene.add(hero);

// Health bar layout: bright outline > dark backing > colored fill.
const HEALTH_BAR_WIDTH = 1.0;
const HEALTH_BAR_HEIGHT = 0.14;
const HEALTH_BAR_BORDER = 0.035;
const HEALTH_BAR_LINGER_SECONDS = 1.2;
// Units currently in combat; their bars stay visible until combat ends.
const combatants = new Set();

function healthBarMaterial(color) {
  // Transparent so the bars draw after the level's transparent layers.
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 1,
    depthTest: false,
    depthWrite: false,
    fog: false,
  });
}

function addUnitHealthBar(mesh, unit) {
  const innerWidth = HEALTH_BAR_WIDTH;
  const innerHeight = HEALTH_BAR_HEIGHT;
  const outline = new THREE.Mesh(
    new THREE.PlaneGeometry(innerWidth + HEALTH_BAR_BORDER * 2, innerHeight + HEALTH_BAR_BORDER * 2),
    healthBarMaterial(0xf5f0e6),
  );
  const background = new THREE.Mesh(
    new THREE.PlaneGeometry(innerWidth, innerHeight),
    healthBarMaterial(0x14101a),
  );
  const fillWidth = innerWidth - 0.04;
  const fill = new THREE.Mesh(
    new THREE.PlaneGeometry(fillWidth, innerHeight - 0.04),
    healthBarMaterial(0x42d66b),
  );
  const group = new THREE.Group();
  group.position.set(0, mesh.geometry.parameters.height / 2 + 0.2, 0.08);
  group.renderOrder = 8;
  outline.renderOrder = 8;
  background.renderOrder = 9;
  fill.renderOrder = 10;
  background.position.z = 0.001;
  fill.position.z = 0.002;
  group.add(outline, background, fill);
  group.visible = false;
  mesh.add(group);
  mesh.userData.healthBar = {
    group,
    fill,
    unit,
    width: fillWidth,
    displayRatio: undefined,
    revealUntil: 0,
  };
}

addUnitHealthBar(hero, player);

const raiderGeometry = new THREE.PlaneGeometry(UNIT_SPRITE_WIDTH, UNIT_SPRITE_HEIGHT);
const raiderMaterials = Object.fromEntries(
  Object.entries(characterSprites.raider).map(([direction, texture]) => [
    direction,
    new THREE.MeshBasicMaterial({ map: texture, alphaTest: 0.5, side: THREE.DoubleSide }),
  ]),
);
const cursorPlaneGeometry = new THREE.PlaneGeometry(1, 1);
const cursorMaterial = new THREE.MeshBasicMaterial({ 
  color: 0xffffff,
  transparent: true,
  opacity: 0.08,
  fog: false,
  depthTest: false,
  depthWrite: false,
  side: THREE.DoubleSide,
});
cursorOutline = new THREE.Mesh(cursorPlaneGeometry, cursorMaterial);
cursorOutline.rotation.x = -Math.PI / 2;
cursorOutline.renderOrder = 5;
cursorOutline.visible = false;
scene.add(cursorOutline);

// Bright L-shaped corner brackets. Positions are in the cursor plane's local XY
// axes (the plane is rotated flat), so they lie flat on the tile.
const CURSOR_CORNER_COLOR = 0x00f0ff;
const CURSOR_CORNER_LENGTH = 0.3;
const CURSOR_CORNER_THICKNESS = 0.09;
const CURSOR_CORNER_INSET = 0.5 - CURSOR_CORNER_THICKNESS / 2;
const cornerMaterial = new THREE.MeshBasicMaterial({
  color: CURSOR_CORNER_COLOR,
  // Must be transparent so it draws in the late pass, after the level's transparent layers.
  transparent: true,
  opacity: 1,
  fog: false,
  depthTest: false,
  depthWrite: false,
  side: THREE.DoubleSide,
});
const horizontalBarGeometry = new THREE.PlaneGeometry(CURSOR_CORNER_LENGTH, CURSOR_CORNER_THICKNESS);
const verticalBarGeometry = new THREE.PlaneGeometry(CURSOR_CORNER_THICKNESS, CURSOR_CORNER_LENGTH);
const cursorCorners = [];
for (const sx of [-1, 1]) {
  for (const sy of [-1, 1]) {
    const horizontal = new THREE.Mesh(horizontalBarGeometry, cornerMaterial);
    horizontal.position.set(
      sx * (0.5 - CURSOR_CORNER_LENGTH / 2),
      sy * CURSOR_CORNER_INSET,
      0.001,
    );
    const vertical = new THREE.Mesh(verticalBarGeometry, cornerMaterial);
    vertical.position.set(
      sx * CURSOR_CORNER_INSET,
      sy * (0.5 - CURSOR_CORNER_LENGTH / 2),
      0.001,
    );
    for (const bar of [horizontal, vertical]) {
      bar.renderOrder = 6;
      cursorOutline.add(bar);
      cursorCorners.push(bar);
    }
  }
}

const rangeGeometry = new THREE.BoxGeometry(0.92, 0.035, 0.92);
const rangeMaterial = new THREE.MeshBasicMaterial({
  color: 0x6eb6e8,
  transparent: true,
  opacity: 0.4,
  depthWrite: false,
});
const targetMaterial = new THREE.MeshBasicMaterial({
  color: 0xe45b61,
  transparent: true,
  opacity: 0.58,
  depthWrite: false,
});

function worldX(tileX) {
  return tileX - activeLevel.width / 2 + 0.5;
}

function worldZ(tileZ) {
  return tileZ - activeLevel.height / 2 + 0.5;
}

const bartzMaterials = Object.fromEntries(
  Object.entries(characterSprites.bartz).map(([direction, texture]) => [
    direction,
    new THREE.MeshBasicMaterial({ map: texture, alphaTest: 0.5, side: THREE.DoubleSide }),
  ]),
);
const bartzWalkingMaterials = Object.fromEntries(
  Object.entries(characterSprites.bartzWalkingFrames).map(([direction, frames]) => [
    direction,
    frames.map((texture) => new THREE.MeshBasicMaterial({
      map: texture,
      alphaTest: 0.5,
      side: THREE.DoubleSide,
    })),
  ]),
);
const raiderWalkingMaterials = Object.fromEntries(
  Object.entries(characterSprites.raiderWalkingFrames).map(([direction, frames]) => [
    direction,
    frames.map((texture) => new THREE.MeshBasicMaterial({
      map: texture,
      alphaTest: 0.5,
      side: THREE.DoubleSide,
    })),
  ]),
);
const bartzAttackMaterials = Object.fromEntries(
  Object.entries(characterSprites.bartzAttackFrames).map(([direction, frames]) => [
    direction,
    frames.map((texture) => new THREE.MeshBasicMaterial({
      map: texture,
      alphaTest: 0.5,
      side: THREE.DoubleSide,
    })),
  ]),
);
const raiderAttackMaterials = Object.fromEntries(
  Object.entries(characterSprites.raiderAttackFrames).map(([direction, frames]) => [
    direction,
    frames.map((texture) => new THREE.MeshBasicMaterial({
      map: texture,
      alphaTest: 0.5,
      side: THREE.DoubleSide,
    })),
  ]),
);

function createEnemy(tileX, tileZ, id = 'raider') {
  const enemyData = id === 'bartz'
    ? createBartz(tileX, tileZ)
    : createRaiderData(tileX, tileZ);
  const material = enemyData.isBoss ? bartzMaterials.south : raiderMaterials.south;
  const mesh = new THREE.Mesh(raiderGeometry, material);
  const characterScale = id === 'bartz' ? CHARACTER_SCALES.bartz : CHARACTER_SCALES.raider;
  mesh.scale.set(characterScale, characterScale, 1);
  mesh.position.set(
    worldX(tileX),
    unitSpriteHeightAt(tileX, tileZ),
    worldZ(tileZ),
  );
  mesh.renderOrder = 2;
  scene.add(mesh);
  const enemy = { ...enemyData, mesh, facing: 'south' };
  addUnitHealthBar(mesh, enemy);
  return enemy;
}

function resetEnemies() {
  for (const enemy of enemies) scene.remove(enemy.mesh);
  enemies = [];
  const exitZ = activeLevel.tiles.findIndex((row) => row.includes('e'));
  const exitX = exitZ < 0 ? -1 : activeLevel.tiles[exitZ].indexOf('e');
  if (exitX < 0) return;
  const candidates = [];
  for (let z = 0; z < activeLevel.height; z++) {
    for (let x = 0; x < activeLevel.width; x++) {
      if (
        isWalkable(activeLevel, WALKABLE_TILES, x, z) &&
        (x !== player.x || z !== player.z)
      ) {
        candidates.push({ x, z });
      }
    }
  }
  candidates.sort((first, second) =>
    distanceBetween(first.x, first.z, exitX, exitZ) -
    distanceBetween(second.x, second.z, exitX, exitZ));
  const spawnTiles = [];
  if (
      activeLevel.objective === 'defeat-all-enemies' &&
      isWalkable(activeLevel, WALKABLE_TILES, exitX, exitZ) &&
      (exitX !== player.x || exitZ !== player.z)
  ) {
    spawnTiles.push({ x: exitX, z: exitZ, id: 'bartz' });
  }
  for (const candidate of candidates) {
    if (
      (candidate.x !== exitX || candidate.z !== exitZ) &&
      spawnTiles.every((tile) =>
        distanceBetween(candidate.x, candidate.z, tile.x, tile.z) >= 2)) {
      spawnTiles.push({ ...candidate, id: 'raider' });
      if (spawnTiles.length === 4) break;
    }
  }
  for (const tile of spawnTiles) enemies.push(createEnemy(tile.x, tile.z, tile.id));
}

function showPhaseBanner(phase, turn) {
  phaseBanner.textContent = `${phase.toUpperCase()} PHASE · TURN ${turn}`;
  phaseBanner.classList.add('visible');
  window.clearTimeout(phaseBannerTimeout);
  phaseBannerTimeout = window.setTimeout(() => {
    phaseBanner.classList.remove('visible');
  }, 1200);
}

resetEnemies();

function saveCurrentGame() {
  if (!sessionStarted) return;
  try {
    writeSave(createSaveData(
      activeLevel,
      player,
      enemies,
      gameState,
    ));
    if (!mainMenu.hidden) menuStatus.textContent = 'Game saved in this browser.';
  } catch (error) {
    console.error('Unable to save game:', error);
    setLevelStatus(`Could not save game: ${error.message}`, true);
    menuStatus.textContent = `Could not save game: ${error.message}`;
  }
}

function refreshContinueButton() {
  try {
    const save = readSave();
    continueButton.disabled = !save;
    menuStatus.textContent = save ? 'A saved game is ready to continue.' : 'No saved game found.';
    return save;
  } catch (error) {
    continueButton.disabled = true;
    menuStatus.textContent = `Could not read saved game: ${error.message}`;
    setLevelStatus(`Could not read saved game: ${error.message}`, true);
    return null;
  }
}

function objectiveDescription(level = activeLevel) {
  return level.objective === 'escape' ? 'Escape through the marked exit' : 'Kill all enemies';
}

function hideTerminalScreen() {
  window.clearTimeout(terminalFocusTimeout);
  terminalScreen.classList.remove('visible');
  terminalScreen.hidden = true;
}

function showTerminalScreen(outcome, message) {
  terminalScreen.dataset.outcome = outcome;
  terminalHeading.textContent = outcome === 'victory' ? 'VICTORY' : 'GAME OVER';
  terminalMessage.textContent = message;
  terminalScreen.hidden = false;
  requestAnimationFrame(() => terminalScreen.classList.add('visible'));
  window.clearTimeout(terminalFocusTimeout);
  terminalFocusTimeout = window.setTimeout(() => {
    document.querySelector('#restart-level').focus({ preventScroll: true });
  }, 900);
}

function completeVictory(message) {
  if (gameState.phase === 'victory') return;
  gameState.phase = 'victory';
  gameState.mode = 'terminal';
  gameState.selected = false;
  cameraFollowTarget = undefined;
  setMessage(message);
  renderTacticalUi();
  showTerminalScreen('victory', message);
  saveCurrentGame();
}

function completeGameOver() {
  if (gameState.defeated || playerTeam.some((unit) => unit.hp > 0)) return;
  gameState.defeated = true;
  gameState.mode = 'terminal';
  gameState.selected = false;
  cameraFollowTarget = undefined;
  const message = 'The last light has died. The sea keeps what it claims.';
  setMessage(message);
  renderTacticalUi();
  showTerminalScreen('game-over', message);
  saveCurrentGame();
}

function checkEscapeObjective() {
  if (
    activeLevel.objective !== 'escape' ||
    activeLevel.tiles[player.z][player.x] !== 'e'
  ) return false;
  completeVictory(`${player.name} has escaped. The objective is complete.`);
  return true;
}

function hideMainMenu() {
  mainMenu.hidden = true;
  document.body.classList.remove('title-screen');
  menuStatus.textContent = '';
  document.activeElement.blur?.();
}

function startLevel(level) {
  hideTerminalScreen();
  const freshPlayer = createMaria();
  Object.assign(player, freshPlayer);
  player.moveOrigin = null;
  activeLevel = buildLevel(THREE, levelGroup, level);
  player.x = activeLevel.spawn.x;
  player.z = activeLevel.spawn.z;
  player.facing = 'south';
  playerMovement = undefined;
  enemyMovement = undefined;
  cameraFollowTarget = undefined;
  movementRange.clear();
  gameState.mode = 'cursor';
  gameState.phase = 'player';
  gameState.turn = 1;
  gameState.selected = false;
  gameState.defeated = false;
  cursor.x = player.x;
  cursor.z = player.z;
  cursorOutline.visible = true;
  setCursor(player.x, player.z);
  for (const enemy of enemies) scene.remove(enemy.mesh);
  enemies = [];
  resetEnemies();
  experienceDisplay.reset(player.level, player.experience);
  setLevelStatus(`Level: ${activeLevel.name}`);
  setMessage(`${activeLevel.name} · Objective: ${objectiveDescription()}. Select ${player.name} to begin.`);
  sessionStarted = true;
  hideMainMenu();
  showPhaseBanner('Player', gameState.turn);
  renderTacticalUi();
}

function newGame() {
  startLevel(initialLevel);
}

function restartLevel() {
  startLevel(activeLevel);
}

function continueGame() {
  const save = refreshContinueButton();
  if (!save) return;
  activeLevel = buildLevel(THREE, levelGroup, save.level);
  Object.assign(player, save.player.stats, {
    x: save.player.x,
    z: save.player.z,
    facing: save.player.facing,
    level: save.player.level,
    experience: save.player.experience,
    moved: save.player.moved,
    acted: save.player.acted,
    moveOrigin: save.player.moveOrigin ?? null,
  });
  restoreMariaInventory(
    player,
    save.player.inventory,
    save.player.equippedWeaponId,
  );
  for (const enemy of enemies) scene.remove(enemy.mesh);
  enemies = save.enemies.map((savedEnemy) => {
    const enemy = createEnemy(savedEnemy.x, savedEnemy.z, savedEnemy.id ?? 'raider');
    enemy.hp = savedEnemy.hp;
    enemy.maxHp = savedEnemy.maxHp;
    return enemy;
  });
  gameState.mode = 'cursor';
  gameState.phase = save.phase === 'victory' ? 'victory' : 'player';
  gameState.turn = save.turn;
  gameState.selected = false;
  gameState.defeated = save.defeated;
  playerMovement = undefined;
  enemyMovement = undefined;
  cameraFollowTarget = undefined;
  movementRange.clear();
  cursor.x = player.x;
  cursor.z = player.z;
  cursorOutline.visible = gameState.phase === 'player';
  if (gameState.phase === 'player') setCursor(player.x, player.z);
  experienceDisplay.reset(player.level, player.experience);
  setLevelStatus(`Level: ${activeLevel.name}`);
  setMessage(gameState.defeated
    ? `${player.name} was defeated. Start a new game to try again.`
    : `Game continued. Select ${player.name} to resume.`);
  sessionStarted = true;
  hideMainMenu();
  if (gameState.phase === 'player') showPhaseBanner('Player', gameState.turn);
  renderTacticalUi();
  if (gameState.defeated) {
    showTerminalScreen('game-over', 'The last light has died. The sea keeps what it claims.');
  } else if (gameState.phase === 'victory') {
    showTerminalScreen('victory', 'The objective is complete.');
  }
}

function returnToMainMenu() {
  if (!sessionStarted) {
    optionsDialog.close();
    document.querySelector('#title-options').focus();
    return;
  }
  saveCurrentGame();
  hideTerminalScreen();
  if (optionsDialog.open) optionsDialog.close();
  gameState.selected = false;
  gameState.mode = 'cursor';
  movementRange.clear();
  playerMovement = undefined;
  sessionStarted = false;
  renderTacticalUi();
  refreshContinueButton();
  mainMenu.hidden = false;
  document.body.classList.add('title-screen');
  (continueButton.disabled ? newGameButton : continueButton).focus();
}

function openTitleOptions() {
  if (sessionStarted || optionsDialog.open) return;
  document.querySelector('#open-unit-list').hidden = true;
  optionsDialog.showModal();
  document.querySelector('#resume-game').focus();
}

function openOptionsMenu() {
  if (!sessionStarted || gameState.mode === 'options' || gameState.mode === 'combat' || playerMovement) return;
  gameState.mode = 'options';
  document.querySelector('#open-unit-list').hidden = false;
  renderTacticalUi();
  optionsDialog.showModal();
}

function closeOptionsMenu() {
  if (optionsDialog.open) optionsDialog.close();
  if (sessionStarted && gameState.mode === 'options') {
    gameState.mode = 'cursor';
    renderTacticalUi();
  }
}

const blob = new THREE.Mesh(
  new THREE.PlaneGeometry(1.1, 1.1),
  new THREE.MeshBasicMaterial({
    map: blobShadowTexture(),
    transparent: true,
    depthWrite: false,
  }),
);
blob.rotation.x = -Math.PI / 2;
blob.position.y = 0.02;
scene.add(blob);
const levelFile = document.querySelector('#level-file');
document.querySelector('#load-level').addEventListener('click', () => levelFile.click());
levelFile.addEventListener('change', async () => {
  const [file] = levelFile.files;
  if (!file) return;
  try {
    const level = validateLevel(JSON.parse(await file.text()));
    activeLevel = buildLevel(THREE, levelGroup, level);
    player.x = level.spawn.x;
    player.z = level.spawn.z;
    player.facing = 'south';
    playerMovement = undefined;
    player.hp = player.maxHp;
    player.moved = false;
    player.acted = false;
    player.moveOrigin = null;
    cursor.x = player.x;
    cursor.z = player.z;
    gameState.mode = 'cursor';
    gameState.phase = 'player';
    gameState.turn = 1;
    gameState.selected = false;
    gameState.defeated = false;
    movementRange.clear();
    resetEnemies();
    hideTerminalScreen();
    sessionStarted = true;
    hideMainMenu();
    setLevelStatus(`Loaded ${level.name}`);
    setMessage(`${level.name} · Objective: ${objectiveDescription()}. Select ${player.name} to begin.`);
    renderTacticalUi();
  } catch (error) {
    console.error('Unable to import level:', error);
    setLevelStatus(`Could not import level: ${error.message}`, true);
  } finally {
    levelFile.value = '';
  }
});
setLevelStatus(`Level: ${activeLevel.name}`);

// ---------- Tactical turns ----------

function clearHighlights() {
  if (moveHighlights) {
    tacticalOverlay.remove(moveHighlights);
    moveHighlights.dispose();
    moveHighlights = undefined;
  }
  if (targetHighlights) {
    tacticalOverlay.remove(targetHighlights);
    targetHighlights.dispose();
    targetHighlights = undefined;
  }
}

function clearMovementRoute() {
  for (const mesh of movementPathMeshes) {
    scene.remove(mesh);
    mesh.geometry.dispose();
  }
  movementPathMeshes = [];
  movementPathMaterial?.dispose();
  movementPathMaterial = undefined;
}

function updateMovementRoute() {
  clearMovementRoute();
  if (
    gameState.mode !== 'move' ||
    movementRange.get(tileKey(cursor.x, cursor.z)) === undefined ||
    (cursor.x === player.x && cursor.z === player.z)
  ) return;

  const blocked = new Set(enemies.map((enemy) => tileKey(enemy.x, enemy.z)));
  const path = findPath(player, [cursor], blocked, activeLevel, WALKABLE_TILES);
  if (path.length < 2) return;
  movementPathMaterial = new THREE.MeshBasicMaterial({
    color: 0x168cff,
    depthTest: false,
    depthWrite: false,
  });
  for (let index = 0; index < path.length - 1; index++) {
    const from = path[index];
    const to = path[index + 1];
    const direction = new THREE.Vector3(to.x - from.x, 0, to.z - from.z);
    const isFinalSegment = index === path.length - 2;
    const elevation = Math.max(
      getTileElevation(activeLevel, from.x, from.z),
      getTileElevation(activeLevel, to.x, to.z),
    );
    const horizontal = direction.x !== 0;
    const segmentLength = isFinalSegment ? 0.72 : 1.08;
    const segment = new THREE.Mesh(
      new THREE.BoxGeometry(
        horizontal ? segmentLength : 0.2,
        0.07,
        horizontal ? 0.2 : segmentLength,
      ),
      movementPathMaterial,
    );
    segment.position.set(
      (worldX(from.x) + worldX(to.x)) / 2 - direction.x * (isFinalSegment ? 0.14 : 0),
      elevation + 0.25,
      (worldZ(from.z) + worldZ(to.z)) / 2 - direction.z * (isFinalSegment ? 0.14 : 0),
    );
    segment.renderOrder = 6;
    scene.add(segment);
    movementPathMeshes.push(segment);
  }

  const from = path[path.length - 2];
  const destination = path[path.length - 1];
  const direction = new THREE.Vector3(destination.x - from.x, 0, destination.z - from.z);
  const elevation = Math.max(
    getTileElevation(activeLevel, from.x, from.z),
    getTileElevation(activeLevel, destination.x, destination.z),
  );
  const tip = new THREE.Mesh(
    new THREE.ConeGeometry(0.2, 0.34, 4),
    movementPathMaterial,
  );
  tip.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
  tip.position.set(
    worldX(destination.x) - direction.x * 0.09,
    elevation + 0.3,
    worldZ(destination.z) - direction.z * 0.09,
  );
  tip.renderOrder = 7;
  scene.add(tip);
  movementPathMeshes.push(tip);
}

function makeHighlights(tiles, material) {
  if (!tiles.length) return undefined;
  const mesh = new THREE.InstancedMesh(rangeGeometry, material, tiles.length);
  const transform = new THREE.Object3D();
  tiles.forEach((tile, index) => {
    transform.position.set(worldX(tile.x), 0.2, worldZ(tile.z));
    transform.updateMatrix();
    mesh.setMatrixAt(index, transform.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.renderOrder = 4;
  tacticalOverlay.add(mesh);
  return mesh;
}

function refreshHighlights() {
  clearHighlights();
  updateMovementRoute();
  if (gameState.mode === 'move') {
    moveHighlights = makeHighlights(
      [...movementRange.keys()].map((key) => {
        const [x, z] = key.split(',').map(Number);
        return { x, z };
      }),
      rangeMaterial,
    );
  }
  if (gameState.mode === 'attack') {
    targetHighlights = makeHighlights(
      getAttackTargets(player, enemies).map(({ x, z }) => ({ x, z })),
      targetMaterial,
    );
  }
}

function setMessage(message) {
  battleMessage.textContent = message;
}

function showCombatResult(unit, text, type) {
  const canvas = document.createElement('canvas');
  canvas.width = 192;
  canvas.height = 64;
  const context = canvas.getContext('2d');
  context.font = `bold ${type === 'critical' ? 46 : 40}px sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.lineWidth = 7;
  context.strokeStyle = 'rgba(20, 12, 16, 0.9)';
  context.strokeText(text, 96, 32);
  context.fillStyle = type === 'critical' ? '#72101d' : type === 'miss' ? '#ffffff' : '#ffe14a';
  context.fillText(text, 96, 32);
  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  const unitPosition = unit.mesh ? unit.mesh.position : hero.position;
  sprite.position.set(unitPosition.x, unitPosition.y + 1.4, unitPosition.z);
  sprite.scale.set(type === 'critical' ? 1.6 : 1.25, type === 'critical' ? 0.55 : 0.44, 1);
  sprite.renderOrder = 10;
  scene.add(sprite);
  floatingCombatTexts.push({ sprite, material, texture, startedAt: clock.elapsedTime });
}

function openUnitProfile(unit, opponent) {
  const terrain = getTerrain(activeLevel, unit.x, unit.z);
  profileDialogUi.show(
    unit,
    opponent,
    terrain,
    opponent ? getTerrain(activeLevel, opponent.x, opponent.z) : terrain,
  );
}

function openCharacterProfile() {
  openUnitProfile(player);
}

function openInventory() {
  if (!gameState.selected || player.acted || gameState.mode !== 'unit') return;
  renderInventory();
  gameState.mode = 'inventory';
  renderTacticalUi();
  inventoryDialog.showModal();
  inventoryDialog.querySelector('button:not(:disabled)')?.focus();
}

function renderInventory() {
  const list = inventoryDialog.querySelector('#inventory-items');
  list.replaceChildren();
  for (const entry of player.inventory) {
    const item = INVENTORY_ITEMS.get(entry.id);
    const row = document.createElement('li');
    const details = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = item.name;
    const description = document.createElement('span');
    if (item.itemType === 'weapon') {
      description.textContent =
        `${item.type} · Might ${item.might} · Hit ${item.hit} · Crit ${item.critical} · Weight ${item.weight}`;
    } else {
      description.textContent = `Heals ${item.heal} HP · ${entry.uses}/${item.maxUses} uses remaining`;
    }
    details.append(name, description);
    const action = document.createElement('button');
    if (item.itemType === 'weapon') {
      const equipped = player.weapon.id === entry.id;
      action.textContent = equipped ? 'Equipped' : 'Equip';
      action.disabled = equipped;
      action.addEventListener('click', () => equipInventoryWeapon(entry.id));
    } else {
      action.textContent = 'Use';
      action.disabled = player.hp >= player.maxHp;
      action.addEventListener('click', () => useInventoryItem(entry.id));
    }
    row.append(details, action);
    list.append(row);
  }
  inventoryDialog.querySelector('#inventory-empty').hidden = player.inventory.length > 0;
}

function closeInventory() {
  if (inventoryDialog.open) inventoryDialog.close();
  if (gameState.mode === 'inventory') {
    gameState.mode = 'unit';
    renderTacticalUi();
    focusActionMenu();
  }
}

function equipInventoryWeapon(itemId) {
  const entry = player.inventory.find((item) => item.id === itemId);
  const weapon = INVENTORY_ITEMS.get(itemId);
  if (!entry || weapon?.itemType !== 'weapon') {
    throw new Error(`Cannot equip ${itemId}: weapon is not in Maria's inventory.`);
  }
  player.weapon = weapon;
  closeInventory();
  setMessage(`${player.name} equipped ${weapon.name}.`);
  renderTacticalUi();
}

async function useInventoryItem(itemId) {
  const index = player.inventory.findIndex((entry) => entry.id === itemId);
  const entry = player.inventory[index];
  const item = INVENTORY_ITEMS.get(itemId);
  if (!entry || item?.itemType !== 'consumable' || player.hp >= player.maxHp) return;

  closeInventory();
  // Combat mode keeps the bar visible and blocks input while the heal animates.
  gameState.mode = 'combat';
  combatants.add(player);
  renderTacticalUi();
  await wait(450);
  const healed = Math.min(item.heal, player.maxHp - player.hp);
  player.hp += healed;
  entry.uses--;
  if (entry.uses === 0) player.inventory.splice(player.inventory.indexOf(entry), 1);
  setMessage(`${player.name} used ${item.name} and recovered ${healed} HP${entry.uses === 0 ? '. The potion is gone.' : ` (${entry.uses} uses remain).`}`);
  await wait(1100);
  gameState.mode = 'unit';
  finishUnit();
}

function openEnemyProfile(enemy) {
  openUnitProfile(enemy, player);
}

function capitalize(text) {
  return `${text[0].toUpperCase()}${text.slice(1)}`;
}

function unitAtTile(x, z) {
  if (player.hp > 0 && player.x === x && player.z === z) return player;
  return findEnemyAt(enemies, x, z);
}

// Unit under the mouse pointer; falls back to the unit under the cursor.
let pointerHoveredUnit = null;

function currentHoverUnit() {
  return sessionStarted && gameState.mode !== 'combat'
    ? pointerHoveredUnit ?? unitAtTile(cursor.x, cursor.z)
    : null;
}

// Experience belongs to player units only; keep it up while a gain animates.
function updateExperiencePanel() {
  experiencePanel.hidden = !(
    sessionStarted &&
    (playerTeam.includes(currentHoverUnit()) || experiencePanel.classList.contains('gaining'))
  );
}

function updateUnitHoverCard() {
  const unit = currentHoverUnit();
  updateExperiencePanel();
  if (!unit) {
    unitHoverCard.hidden = true;
    return;
  }
  const rows = [
    ['HP', `${unit.hp}/${unit.maxHp}`],
    ['Weapon', unit.weapon?.name ?? 'None'],
  ];
  unitHoverCard.replaceChildren();
  const name = document.createElement('strong');
  name.className = 'unit-card-name';
  name.textContent = `${unit.name}${unit.isBoss ? ' (Boss)' : ''}`;
  const unitClass = document.createElement('span');
  unitClass.className = 'unit-card-class';
  unitClass.textContent = capitalize(unit.class);
  const list = document.createElement('dl');
  for (const [label, value] of rows) {
    const term = document.createElement('dt');
    term.textContent = label;
    const detail = document.createElement('dd');
    detail.textContent = value;
    list.append(term, detail);
  }
  unitHoverCard.append(name, unitClass, list);
  unitHoverCard.hidden = false;
}

const UNIT_LIST_STATS = [
  'strength', 'magic', 'dexterity', 'speed', 'luck', 'defense', 'resistance', 'movement',
];
const idleSpriteUrls = new Map();

function idleSpriteUrl(unit) {
  const texture = characterSprites[unit.id]?.south;
  if (!texture?.image) return undefined;
  if (!idleSpriteUrls.has(unit.id)) {
    const canvas = document.createElement('canvas');
    canvas.width = texture.image.width;
    canvas.height = texture.image.height;
    canvas.getContext('2d').drawImage(texture.image, 0, 0);
    idleSpriteUrls.set(unit.id, canvas.toDataURL());
  }
  return idleSpriteUrls.get(unit.id);
}

function renderUnitList() {
  const body = unitListDialog.querySelector('#unit-list-body');
  body.replaceChildren();
  for (const unit of [player, ...enemies]) {
    const row = document.createElement('tr');
    row.className = unit === player ? 'player' : 'enemy';
    const spriteCell = document.createElement('td');
    spriteCell.className = 'unit-list-sprite';
    const url = idleSpriteUrl(unit);
    if (url) {
      const image = document.createElement('img');
      image.src = url;
      image.alt = '';
      spriteCell.append(image);
    }
    const cells = [
      `${unit.name}${unit.isBoss ? ' (Boss)' : ''}`,
      capitalize(unit.class),
      unit.weapon?.name ?? 'None',
      unit.level,
      `${unit.hp}/${unit.maxHp}`,
      ...UNIT_LIST_STATS.map((stat) => unit[stat]),
    ];
    row.append(spriteCell, ...cells.map((value) => {
      const cell = document.createElement('td');
      cell.textContent = value;
      return cell;
    }));
    body.append(row);
  }
}

function openUnitList() {
  renderUnitList();
  unitListDialog.showModal();
  unitListDialog.querySelector('#unit-list-close').focus();
}

function renderTacticalUi() {
  phaseLabel.textContent = `${gameState.phase.toUpperCase()} PHASE - TURN ${gameState.turn}`;
  objectiveLabel.textContent = `OBJECTIVE · ${objectiveDescription()}`;
  const movementUnit = player.movement === 1 ? 'tile' : 'tiles';
  const rangeText = weaponRangeLabel(player.weapon);
  updateUnitHoverCard();
  backActionButton.textContent = player.moveOrigin && player.moved && !player.acted
    ? 'Back · Undo Move'
    : 'Back';
  actionPanel.hidden = !gameState.selected || gameState.mode !== 'unit';
  document.querySelector('#attack-action').disabled = player.acted;
  actionHelp.textContent = gameState.mode === 'move'
    ? `Choose a tile within ${player.movement} ${movementUnit}; the blue line previews the route.`
    : gameState.mode === 'attack'
      ? `Choose a target in weapon range ${rangeText}, then press Space or Enter.`
      : `${player.moved ? 'Movement complete' : 'Choose an action'} · ${player.moveOrigin && !player.acted ? 'Undo Move is available' : player.acted ? 'Acted' : 'Attack, inventory, profile, or end unit'}`;
  refreshHighlights();
  saveCurrentGame();
}

function focusActionMenu() {
  const nextButton = actionButtons.find((button) => !button.disabled && !button.hidden);
  nextButton?.focus({ preventScroll: true });
}

function moveActionFocus(container, direction) {
  const enabledButtons = [...container.querySelectorAll('button:not(:disabled):not([hidden])')];
  const focusedButton = enabledButtons.find((button) => button === document.activeElement);
  if (!enabledButtons.length) return;
  if (!focusedButton || focusedButton.disabled) {
    enabledButtons[0].focus({ preventScroll: true });
    return;
  }

  const directionVector = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
  }[direction];
  const current = focusedButton.getBoundingClientRect();
  const currentX = current.left + current.width / 2;
  const currentY = current.top + current.height / 2;
  let closest;
  let closestScore = Infinity;

  for (const button of enabledButtons) {
    if (button === focusedButton) continue;
    const rect = button.getBoundingClientRect();
    const dx = rect.left + rect.width / 2 - currentX;
    const dy = rect.top + rect.height / 2 - currentY;
    const primary = dx * directionVector.x + dy * directionVector.y;
    if (primary <= 0) continue;
    const secondary = Math.abs(dx * directionVector.y - dy * directionVector.x);
    const score = primary + secondary * 2;
    if (score < closestScore) {
      closest = button;
      closestScore = score;
    }
  }
  closest?.focus({ preventScroll: true });
}

function setCursor(x, z) {
  cursor.x = Math.max(0, Math.min(activeLevel.width - 1, x));
  cursor.z = Math.max(0, Math.min(activeLevel.height - 1, z));
  cursorOutline.visible = true;
  showTileInspection(cursor.x, cursor.z);
  updateUnitHoverCard();
  updateMovementRoute();
  const enemy = findEnemyAt(enemies, cursor.x, cursor.z);
  if (enemy && gameState.mode === 'cursor') {
    setMessage(`Raider · ${enemy.hp}/${enemy.maxHp} HP`);
  } else if (enemy && gameState.mode === 'attack') {
    const terrain = getTerrain(activeLevel, enemy.x, enemy.z);
    const hitRate = getHitRate(player, enemy, terrain);
    setMessage(`${enemy.name} · ${hitRate}% displayed Hit · Space / Enter to attack`);
  } else if (gameState.mode === 'cursor' && !gameState.selected) {
    setMessage(`WASD / Arrows move · Space / Enter select ${player.name} · Click an empty tile for options`);
  }
}

function showTileInspection(x, z) {
  if (x < 0 || x >= activeLevel.width || z < 0 || z >= activeLevel.height) {
    tileInspection.hidden = true;
    return;
  }
  const terrain = getTerrain(activeLevel, x, z);
  document.querySelector('#tile-inspection-name').textContent =
    `${terrain.name} · Tile ${x + 1}, ${z + 1}`;
  document.querySelector('#tile-inspection-details').textContent =
    `${terrain.walkable ? 'Walkable' : 'Impassable'} · ${terrain.bonus}`;
  tileInspection.hidden = false;
}

function finishUnit() {
  if (!gameState.selected || gameState.phase !== 'player' || gameState.defeated) return;
  player.moved = true;
  player.acted = true;
  player.moveOrigin = null;
  gameState.selected = false;
  gameState.mode = 'cursor';
  cursorOutline.visible = true;
  movementRange.clear();
  renderTacticalUi();
  if (playerTeam.every((unit) => unit.acted)) void endPlayerPhase();
}

function cyclePlayerUnits() {
  const availableUnits = playerTeam.filter((unit) => unit.hp > 0 && !unit.acted);
  if (!availableUnits.length) {
    setMessage('All available units have acted this turn.');
    return;
  }
  if (gameState.selected && availableUnits.length === 1) {
    setMessage(`${availableUnits[0].name} is the only available unit.`);
    return;
  }

  const currentIndex = availableUnits.findIndex(
    (unit) => unit.x === cursor.x && unit.z === cursor.z,
  );
  const nextUnit = availableUnits[(currentIndex + 1) % availableUnits.length];
  cursor.x = nextUnit.x;
  cursor.z = nextUnit.z;
  showTileInspection(cursor.x, cursor.z);
  if (nextUnit === player) selectMaria();
}

function selectMaria() {
  if (gameState.phase !== 'player' || gameState.defeated) return;
  if (cursor.x !== player.x || cursor.z !== player.z) {
    setMessage(`Move the cursor onto ${player.name}, then press Enter.`);
    return;
  }
  if (player.acted) {
    setMessage(`${player.name} has already acted this turn.`);
    return;
  }
  gameState.selected = true;
  if (player.moved) {
    gameState.mode = 'unit';
    setMessage(`Choose Attack, Inventory, Profile, or End Unit for ${player.name}.`);
    renderTacticalUi();
    focusActionMenu();
  } else {
    startMove();
  }
}

function openMariaActions() {
  if (!gameState.selected || player.acted) return;
  movementRange.clear();
  gameState.mode = 'unit';
  cursor.x = player.x;
  cursor.z = player.z;
  setMessage(`Choose Attack, Inventory, Profile, or End Unit for ${player.name}.`);
  renderTacticalUi();
  focusActionMenu();
}

function startMove() {
  if (!gameState.selected || player.moved || player.acted) return;
  movementRange = getMovementRange(player, activeLevel, WALKABLE_TILES, enemies);
  gameState.mode = 'move';
  setCursor(player.x, player.z);
  setMessage('Blue tiles are reachable; the thick blue line previews the route. Select a destination or press Escape.');
  renderTacticalUi();
}

function confirmMove() {
  const distance = movementRange.get(tileKey(cursor.x, cursor.z));
  if (distance === undefined || distance === 0) {
    setMessage(`Choose a reachable blue tile to move ${player.name}.`);
    return;
  }
  const destination = { x: cursor.x, z: cursor.z };
  const blocked = new Set(enemies.map((enemy) => tileKey(enemy.x, enemy.z)));
  const path = findPath(player, [destination], blocked, activeLevel, WALKABLE_TILES);
  if (path.length < 2) {
    setMessage(`Could not find a valid route for ${player.name}. Choose another reachable tile.`);
    return;
  }
  player.moveOrigin = { x: player.x, z: player.z };
  playerMovement = {
    path,
    startedAt: clock.elapsedTime,
    duration: (path.length - 1) * 0.18,
  };
  player.x = cursor.x;
  player.z = cursor.z;
  player.moved = true;
  movementRange.clear();
  gameState.mode = 'moving';
  setMessage(`${player.name} is moving to the selected tile.`);
  renderTacticalUi();
}

function undoMove() {
  if (!gameState.selected || !player.moved || player.acted || !player.moveOrigin) return;
  player.x = player.moveOrigin.x;
  player.z = player.moveOrigin.z;
  player.moveOrigin = null;
  player.moved = false;
  playerMovement = undefined;
  cursor.x = player.x;
  cursor.z = player.z;
  movementRange = getMovementRange(player, activeLevel, WALKABLE_TILES, enemies);
  gameState.mode = 'move';
  setMessage('Move undone. Choose a different destination or press Escape for actions.');
  renderTacticalUi();
}

function startAttack() {
  if (!gameState.selected || player.acted) return;
  const targets = getAttackTargets(player, enemies);
  if (!targets.length) {
    setMessage(`No enemies in weapon range (${player.weapon.minRange}-${player.weapon.maxRange}). Move closer or end the unit turn.`);
    return;
  }
  gameState.mode = 'attack';
  setCursor(targets[0].x, targets[0].z);
  const targetTerrain = getTerrain(activeLevel, targets[0].x, targets[0].z);
  setMessage(
    `Red tiles are in range. ${targets[0].name}: ${getHitRate(player, targets[0], targetTerrain)}% Hit · ${getCriticalRate(player, targets[0])}% Critical.`,
  );
  renderTacticalUi();
}

function showCombatForecast(target) {
  const targetDistance = distanceBetween(player.x, player.z, target.x, target.z);
  if (!isInWeaponRange(player, target, targetDistance)) {
    setMessage(`Choose a valid target within ${weaponRangeLabel(player.weapon)} range.`);
    return;
  }
  const [playerPanel, enemyPanel] = combatForecastDialog.querySelectorAll('.forecast-side');
  const fillPanel = (panel, unit, opponent, terrain) => {
    panel.replaceChildren();
    const heading = document.createElement('h3');
    heading.textContent = `${unit.name}${unit.isBoss ? ' (Boss)' : ''}`;
    const unitClass = document.createElement('div');
    unitClass.className = 'forecast-class';
    unitClass.textContent = capitalize(unit.class);
    panel.append(heading, unitClass);
    if (!opponent) {
      const note = document.createElement('p');
      note.className = 'forecast-note';
      note.textContent = 'Cannot counter at this range.';
      panel.append(note);
    }
    const list = document.createElement('dl');
    const attacks = opponent ? getAttackCount(unit, opponent) : 0;
    const damage = opponent ? getCombatDamage(unit, opponent, terrain) : 0;
    const rows = [
      ['HP', `${unit.hp}/${unit.maxHp}`],
      ['Weapon', unit.weapon?.name ?? 'None'],
      ['Damage', opponent ? `${damage} × ${attacks} (${damage * attacks} max)` : '—'],
      ['Hit', opponent ? `${getHitRate(unit, opponent, terrain)}%` : '—'],
      ['Crit', opponent ? `${getCriticalRate(unit, opponent)}%` : '—'],
    ];
    for (const [label, value] of rows) {
      const term = document.createElement('dt');
      term.textContent = label;
      const detail = document.createElement('dd');
      detail.textContent = value;
      list.append(term, detail);
    }
    panel.append(list);
  };
  fillPanel(playerPanel, player, target, getTerrain(activeLevel, target.x, target.z));
  const counterDistance = distanceBetween(target.x, target.z, player.x, player.z);
  const canCounter = isInWeaponRange(target, player, counterDistance);
  fillPanel(
    enemyPanel,
    target,
    canCounter ? player : null,
    getTerrain(activeLevel, player.x, player.z),
  );
  document.querySelector('#combat-forecast-matchup').textContent =
    `${player.name} vs. ${target.name} · ${canCounter ? `${target.name} can counter if they survive.` : `${target.name} cannot counter at this range.`}`;
  pendingCombatTarget = target;
  gameState.mode = 'forecast';
  cursorOutline.visible = false;
  renderTacticalUi();
  combatForecastDialog.showModal();
}

function wait(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

async function playAttackAnimation(unit, direction, followUp = false) {
  if (followUp) await wait(1000);
  
  let frames;
  if (unit === player) {
    // Player (Maria) uses marioAttackFrames
    frames = characterSprites.mariaAttackFrames[direction];
  } else if (unit.isBoss) {
    // Bartz uses bartzAttackFrames
    frames = characterSprites.bartzAttackFrames[direction];
  } else {
    // Raiders use raiderAttackFrames
    frames = characterSprites.raiderAttackFrames[direction];
  }
  
  if (frames && frames.length > 0) {
    for (let frameIndex = 0; frameIndex < frames.length; frameIndex++) {
      if (unit === player) {
        attackAnimation = { direction, frameIndex };
      } else {
        unit.attackAnimation = { direction: direction, frameIndex };
      }
      await wait(characterSprites.animationFrameDuration * 1000);
    }
  } else {
    await wait(300);
  }
  
  // Clear animation state
  if (unit === player) {
    attackAnimation = undefined;
  } else {
    unit.attackAnimation = undefined;
    // Restore idle texture/material
    if (unit.isBoss) {
      // Bartz: restore texture on material
      unit.mesh.material.map = characterSprites.bartz[direction];
      unit.mesh.material.needsUpdate = true;
    } else {
      // Raiders: restore material object
      unit.mesh.material = raiderMaterials[direction];
    }
  }
}

async function showExperienceProgression(progression, amount) {
  await experienceDisplay.showGain({
    level: progression.previousLevel,
    experience: progression.previousExperience,
    amount,
    levelUps: progression.levelUps,
    finalLevel: player.level,
    finalExperience: player.experience,
  });
  if (progression.levelUps) {
    await levelUpDialogUi.show(player.name, progression.growthRolls);
  }
}

async function attack(direction, followUp = false) {
  await playAttackAnimation(player, direction, followUp);
}

async function attackEnemy(enemy, followUp = false) {
  await playAttackAnimation(enemy, enemy.facing, followUp);
}

async function attackRaider(target = findEnemyAt(enemies, cursor.x, cursor.z)) {
  const range = target ? distanceBetween(player.x, player.z, target.x, target.z) : 0;
  if (!target || !isInWeaponRange(player, target, range)) {
    setMessage(`Choose a valid target within ${weaponRangeLabel(player.weapon)} range.`);
    return;
  }
  player.facing = getFacing(target.x - player.x, target.z - player.z);
  player.moveOrigin = null;
  gameState.mode = 'combat';
  cursorOutline.visible = false;
  combatants.add(player);
  combatants.add(target);
  renderTacticalUi();
  const terrain = getTerrain(activeLevel, target.x, target.z);
  const damage = getCombatDamage(player, target, terrain);
  const criticalDamage = getCriticalDamage(player, target, terrain);
  const playerAttackCount = getAttackCount(player, target);
  const hitRate = getHitRate(player, target, terrain);
  const criticalRate = getCriticalRate(player, target);
  const playerStrikeResults = Array.from({ length: playerAttackCount }, () => {
    const hit = rollHit(hitRate);
    return { hit, critical: hit && rollCritical(criticalRate) };
  });
  let playerHits = 0;
  let playerCriticalHits = 0;
  let playerTotalDamage = 0;
  
  // PLAYER'S FIRST ATTACK
  setMessage(`${player.name} attacks ${target.name} (1/${playerAttackCount}).`);
  await attack(player.facing, false);
  const firstResult = playerStrikeResults[0];
  if (firstResult.hit) {
    playerHits++;
    if (firstResult.critical) playerCriticalHits++;
    const strikeDamage = Math.min(target.hp, firstResult.critical ? criticalDamage : damage);
    target.hp -= strikeDamage;
    playerTotalDamage += strikeDamage;
    showCombatResult(target, `-${strikeDamage}`, firstResult.critical ? 'critical' : 'hit');
  } else {
    showCombatResult(target, 'MISS', 'miss');
  }
  
  await wait(400);
  const defeated = target.hp === 0;
  if (defeated) {
    scene.remove(target.mesh);
    enemies = enemies.filter((enemy) => enemy !== target);
    const experienceGained = getCombatExperience(target, true);
    const progression = awardExperience(player, experienceGained);
    await showExperienceProgression(progression, experienceGained);
    setMessage(`${player.name} defeats ${target.name}${target.isBoss ? ' (Boss)' : ''} (+${experienceGained} EXP${progression?.levelUps ? `, Level ${player.level}!` : ''}).`);
    player.acted = true;
    gameState.mode = 'unit';
    finishUnit();
    return;
  }
  
  // ENEMY RETALIATION
  const counterRange = distanceBetween(target.x, target.z, player.x, player.z);
  if (isInWeaponRange(target, player, counterRange)) {
    target.facing = getFacing(player.x - target.x, player.z - target.z);
    if (target.isBoss) target.mesh.material = bartzMaterials[target.facing];
    const counterTerrain = getTerrain(activeLevel, player.x, player.z);
    const counterDamage = getCombatDamage(target, player, counterTerrain);
    const counterCriticalDamage = getCriticalDamage(target, player, counterTerrain);
    const counterAttackCount = getAttackCount(target, player);
    const counterHitRate = getHitRate(target, player, counterTerrain);
    const counterCriticalRate = getCriticalRate(target, player);
    const counterResults = Array.from({ length: counterAttackCount }, () => {
      const hit = rollHit(counterHitRate);
      return { hit, critical: hit && rollCritical(counterCriticalRate) };
    });
    let counterHits = 0;
    let counterCriticalHits = 0;
    let counterTotalDamage = 0;
    
    setMessage(`${target.name} retaliates against ${player.name} (1/${counterAttackCount}).`);
    await attackEnemy(target, false);
    const retalResult = counterResults[0];
    if (retalResult.hit) {
      counterHits++;
      if (retalResult.critical) counterCriticalHits++;
      const strikeDamage = Math.min(player.hp, retalResult.critical ? counterCriticalDamage : counterDamage);
      player.hp -= strikeDamage;
      counterTotalDamage += strikeDamage;
      showCombatResult(player, `-${strikeDamage}`, retalResult.critical ? 'critical' : 'hit');
    } else {
      showCombatResult(player, 'MISS', 'miss');
    }
    
    await wait(400);
    renderTacticalUi();
    if (playerTeam.every((unit) => unit.hp <= 0)) {
      completeGameOver();
      return;
    }
    
    // PLAYER'S SECOND ATTACK (if eligible based on speed check)
    if (playerAttackCount >= 2) {
      setMessage(`${player.name} prepares another strike against ${target.name} (2/${playerAttackCount}).`);
      await attack(player.facing, true);
      const secondResult = playerStrikeResults[1];
      if (secondResult.hit) {
        playerHits++;
        if (secondResult.critical) playerCriticalHits++;
        const strikeDamage = Math.min(target.hp, secondResult.critical ? criticalDamage : damage);
        target.hp -= strikeDamage;
        playerTotalDamage += strikeDamage;
        showCombatResult(target, `-${strikeDamage}`, secondResult.critical ? 'critical' : 'hit');
      } else {
        showCombatResult(target, 'MISS', 'miss');
      }
      
      await wait(400);
      const defeatedAfterSecond = target.hp === 0;
      if (defeatedAfterSecond) {
        scene.remove(target.mesh);
        enemies = enemies.filter((enemy) => enemy !== target);
        const experienceGained = getCombatExperience(target, true);
        const progression = awardExperience(player, experienceGained);
        await showExperienceProgression(progression, experienceGained);
        setMessage(`${player.name} defeats ${target.name}${target.isBoss ? ' (Boss)' : ''} (${playerHits}/${playerAttackCount} hits${playerCriticalHits ? `, ${playerCriticalHits} critical` : ''}, +${experienceGained} EXP${progression?.levelUps ? `, Level ${player.level}!` : ''}).`);
        player.acted = true;
        gameState.mode = 'unit';
        finishUnit();
        return;
      }
      
      // ENEMY'S SECOND ATTACK (if eligible)
      if (counterAttackCount >= 2) {
        setMessage(`${target.name} prepares another strike against ${player.name} (2/${counterAttackCount}).`);
        await attackEnemy(target, true);
        const secondCounterResult = counterResults[1];
        if (secondCounterResult.hit) {
          counterHits++;
          if (secondCounterResult.critical) counterCriticalHits++;
          const strikeDamage = Math.min(player.hp, secondCounterResult.critical ? counterCriticalDamage : counterDamage);
          player.hp -= strikeDamage;
          counterTotalDamage += strikeDamage;
          showCombatResult(player, `-${strikeDamage}`, secondCounterResult.critical ? 'critical' : 'hit');
        } else {
          showCombatResult(player, 'MISS', 'miss');
        }
        
        await wait(400);
        renderTacticalUi();
        if (playerTeam.every((unit) => unit.hp <= 0)) {
          completeGameOver();
          return;
        }
      }
    }
  }
  
  const experienceGained = getCombatExperience(target, false);
  const progression = awardExperience(player, experienceGained);
  await showExperienceProgression(progression, experienceGained);
  setMessage(`${player.name} hits ${target.name} ${playerHits}/${playerAttackCount} times${playerCriticalHits ? ` (${playerCriticalHits} critical)` : ''} (${hitRate}% Hit, ${playerTotalDamage} damage, +${experienceGained} EXP).`);
  
  player.acted = true;
  gameState.mode = 'unit';
  finishUnit();
}

async function enemyPhase() {
  gameState.phase = 'enemy';
  gameState.selected = false;
  gameState.mode = 'cursor';
  renderTacticalUi();
  showPhaseBanner('Enemy', gameState.turn);
  await wait(900);
  for (const enemy of [...enemies]) {
    if (!enemies.includes(enemy)) continue;
    cameraFollowTarget = enemy.mesh.position;
    await wait(500);
    if (distanceBetween(enemy.x, enemy.z, player.x, player.z) > enemy.weapon.maxRange) {
      const blocked = new Set(enemies.filter((other) => other !== enemy).map((other) => tileKey(other.x, other.z)));
      const attackPositions = [];
      for (let z = player.z - enemy.weapon.maxRange; z <= player.z + enemy.weapon.maxRange; z++) {
        for (let x = player.x - enemy.weapon.maxRange; x <= player.x + enemy.weapon.maxRange; x++) {
          if (
            isInWeaponRange(
              enemy,
              player,
              distanceBetween(x, z, player.x, player.z),
            ) &&
            isWalkable(activeLevel, WALKABLE_TILES, x, z) &&
            !blocked.has(tileKey(x, z))
          ) {
            attackPositions.push({ x, z });
          }
        }
      }
      const path = findPath(enemy, attackPositions, blocked, activeLevel, WALKABLE_TILES);
      if (path.length > 1) {
        const destination = path[Math.min(enemy.movement, path.length - 1)];
        const movementPath = path.slice(0, path.indexOf(destination) + 1);
        enemyMovement = {
          enemy,
          path: movementPath,
          startedAt: clock.elapsedTime,
          duration: Math.max(0.35, (movementPath.length - 1) * 0.22),
        };
        await wait(enemyMovement.duration * 1000);
        enemyMovement = undefined;
        enemy.mesh.material = enemy.isBoss
          ? bartzMaterials[enemy.facing]
          : raiderMaterials[enemy.facing];
        enemy.x = destination.x;
        enemy.z = destination.z;
        enemy.mesh.position.set(
          worldX(enemy.x),
          unitSpriteHeightAt(enemy.x, enemy.z),
          worldZ(enemy.z),
        );
      }
    }
    const range = distanceBetween(enemy.x, enemy.z, player.x, player.z);
    if (isInWeaponRange(enemy, player, range)) {
      enemy.facing = getFacing(player.x - enemy.x, player.z - enemy.z);
      if (enemy.isBoss) enemy.mesh.material = bartzMaterials[enemy.facing];
      gameState.mode = 'combat';
      combatants.add(enemy);
      combatants.add(player);
      renderTacticalUi();
      const terrain = getTerrain(activeLevel, player.x, player.z);
      const damage = getCombatDamage(enemy, player, terrain);
      const criticalDamage = getCriticalDamage(enemy, player, terrain);
      const attacks = getAttackCount(enemy, player);
      const hitRate = getHitRate(enemy, player, terrain);
      const criticalRate = getCriticalRate(enemy, player);
      let hits = 0;
      let criticalHits = 0;
      let totalDamage = 0;
      const strikeResults = Array.from({ length: attacks }, () => {
        const hit = rollHit(hitRate);
        return { hit, critical: hit && rollCritical(criticalRate) };
      });
      
      // Play attack animation for each strike
      for (let strike = 0; strike < attacks && player.hp > 0; strike++) {
        await playAttackAnimation(enemy, enemy.facing, strike > 0);
        const result = strikeResults[strike];
        if (!result.hit) {
          showCombatResult(player, 'MISS', 'miss');
          continue;
        }
        hits++;
        if (result.critical) criticalHits++;
        const strikeDamage = Math.min(player.hp, result.critical ? criticalDamage : damage);
        player.hp -= strikeDamage;
        totalDamage += strikeDamage;
        showCombatResult(player, `-${strikeDamage}`, result.critical ? 'critical' : 'hit');
      }
      await wait(450);
      setMessage(hits === 0
        ? `${enemy.name} misses ${player.name} (${hitRate}% Hit).`
        : `${enemy.name} hits ${player.name} ${hits}/${attacks} times${criticalHits ? ` (${criticalHits} critical)` : ''} (${hitRate}% Hit, ${totalDamage} damage).`);
      renderTacticalUi();
      if (playerTeam.every((unit) => unit.hp <= 0)) {
        completeGameOver();
        return;
      }

      const counterRange = distanceBetween(enemy.x, enemy.z, player.x, player.z);
      if (isInWeaponRange(player, enemy, counterRange)) {
        player.facing = getFacing(enemy.x - player.x, enemy.z - player.z);
        const counterAttacks = getAttackCount(player, enemy);
        const counterDamage = getCombatDamage(player, enemy, getTerrain(activeLevel, enemy.x, enemy.z));
        const counterCriticalDamage = getCriticalDamage(player, enemy, getTerrain(activeLevel, enemy.x, enemy.z));
        const counterHitRate = getHitRate(player, enemy, getTerrain(activeLevel, enemy.x, enemy.z));
        const counterCriticalRate = getCriticalRate(player, enemy);
        const counterResults = Array.from({ length: counterAttacks }, () => {
          const hit = rollHit(counterHitRate);
          return { hit, critical: hit && rollCritical(counterCriticalRate) };
        });
        let counterHitCount = 0;
        let counterCriticalCount = 0;
        let counterTotalDamage = 0;
        for (let strike = 0; strike < counterAttacks && enemy.hp > 0; strike++) {
          setMessage(strike > 0
            ? `${player.name} prepares a counterattack against ${enemy.name}.`
            : `${player.name} counters ${enemy.name} (${strike + 1}/${counterAttacks}).`);
          await attack(player.facing, strike > 0);
          const result = counterResults[strike];
          if (!result.hit) {
            showCombatResult(enemy, 'MISS', 'miss');
            continue;
          }
          counterHitCount++;
          if (result.critical) counterCriticalCount++;
          const strikeDamage = Math.min(enemy.hp, result.critical ? counterCriticalDamage : counterDamage);
          enemy.hp -= strikeDamage;
          counterTotalDamage += strikeDamage;
          showCombatResult(enemy, `-${strikeDamage}`, result.critical ? 'critical' : 'hit');
        }
        await wait(350);
        if (enemy.hp === 0) {
          scene.remove(enemy.mesh);
          enemies = enemies.filter((unit) => unit !== enemy);
          const experienceGained = getCombatExperience(enemy, true);
          const progression = awardExperience(player, experienceGained);
          await showExperienceProgression(progression, experienceGained);
          setMessage(
            `${player.name} counters and defeats ${enemy.name}${enemy.isBoss ? ' (Boss)' : ''} (${counterHitCount}/${counterAttacks} hits${counterCriticalCount ? `, ${counterCriticalCount} critical` : ''}, ${counterTotalDamage} damage, +${experienceGained} EXP${progression.levelUps ? `, Level ${player.level}!` : ''}).`,
          );
        } else {
          const experienceGained = getCombatExperience(enemy, false);
          const progression = awardExperience(player, experienceGained);
          await showExperienceProgression(progression, experienceGained);
          setMessage(counterHitCount > 0
            ? `${player.name} counters ${enemy.name} ${counterHitCount}/${counterAttacks} times (${counterTotalDamage} damage, +${experienceGained} EXP).`
            : `${player.name} misses the counterattack against ${enemy.name} (+${experienceGained} EXP).`);
        }
      }
      gameState.mode = 'cursor';
      renderTacticalUi();
    } else {
      setMessage(`${enemy.name} advances across the ships.`);
    }
  }
  if (activeLevel.objective === 'defeat-all-enemies' && enemies.length === 0) {
    completeVictory('All enemies have fallen. The objective is complete.');
    return;
  }
  gameState.turn++;
  gameState.phase = 'player';
  for (const unit of playerTeam) {
    unit.moved = false;
    unit.acted = false;
    unit.moveOrigin = null;
  }
  gameState.mode = 'cursor';
  gameState.selected = false;
  cameraFollowTarget = undefined;
  cursor.x = player.x;
  cursor.z = player.z;
  cursorOutline.visible = true;
  setCursor(player.x, player.z);
  showPhaseBanner('Player', gameState.turn);
  renderTacticalUi();
}

async function endPlayerPhase() {
  if (gameState.phase !== 'player' || gameState.defeated || playerMovement) return;
  for (const unit of playerTeam) {
    unit.moved = true;
    unit.acted = true;
    unit.moveOrigin = null;
  }
  movementRange.clear();
  gameState.selected = false;
  gameState.mode = 'cursor';
  setMessage('Player phase ended.');
  renderTacticalUi();
  if (activeLevel.objective === 'defeat-all-enemies' && enemies.length === 0) {
    completeVictory('All enemies have fallen. The objective is complete.');
    return;
  }
  await enemyPhase();
}

function cancelAction() {
  if (playerMovement) return;
  if (gameState.mode === 'move' || gameState.mode === 'attack') {
    gameState.mode = 'unit';
    movementRange.clear();
    cursor.x = player.x;
    cursor.z = player.z;
    setMessage(`Choose Attack, Inventory, Profile, or End Unit for ${player.name}.`);
    renderTacticalUi();
    focusActionMenu();
  } else if (gameState.mode === 'unit') {
    gameState.mode = 'cursor';
    gameState.selected = false;
    setMessage(`${player.name} deselected. Move the cursor and press Enter to select her.`);
    renderTacticalUi();
  }
}

function cancelCombatForecast() {
  combatForecastDialog.close();
  pendingCombatTarget = undefined;
  gameState.mode = 'attack';
  setMessage('Choose an enemy target or cancel the attack.');
  renderTacticalUi();
}

function confirmCombatForecast() {
  const target = pendingCombatTarget;
  pendingCombatTarget = undefined;
  combatForecastDialog.close();
  if (target && enemies.includes(target)) void attackRaider(target);
  else {
    gameState.mode = 'attack';
    setMessage('That enemy is no longer available. Choose another target.');
    renderTacticalUi();
  }
}

function confirmCursor() {
  if (gameState.phase !== 'player' || gameState.defeated) return;
  if (gameState.mode === 'cursor') {
    const enemy = findEnemyAt(enemies, cursor.x, cursor.z);
    if (enemy) openEnemyProfile(enemy);
    else if (cursor.x === player.x && cursor.z === player.z) selectMaria();
    else openOptionsMenu();
  } else if (gameState.mode === 'move') {
    if (cursor.x === player.x && cursor.z === player.z) openMariaActions();
    else confirmMove();
  }
  else if (gameState.mode === 'attack') {
    const target = findEnemyAt(enemies, cursor.x, cursor.z);
    if (target) showCombatForecast(target);
  }
}

function clickBattlefield(event) {
  if (gameState.phase !== 'player' || gameState.defeated || playerMovement ||
      gameState.mode === 'combat') return;
  const bounds = renderer.domElement.getBoundingClientRect();
  pointerPosition.set(
    ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
    -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
  );
  pointerRaycaster.setFromCamera(pointerPosition, camera);
  // Sprite quads have transparent margins; only the central band counts as clicking the unit.
  const spriteHit = pointerRaycaster.intersectObjects(
    [hero, ...enemies.map((enemy) => enemy.mesh)],
    false,
  ).find((hit) => hit.uv && hit.uv.x > 0.3 && hit.uv.x < 0.7 && hit.uv.y < 0.9);
  const point = spriteHit
    ? spriteHit.object.position
    : pointerRaycaster.ray.intersectPlane(deckPlane, new THREE.Vector3());
  if (!point) return;
  const x = spriteHit?.object === hero
    ? player.x
    : spriteHit
      ? enemies.find((enemy) => enemy.mesh === spriteHit.object).x
      : Math.floor(point.x + activeLevel.width / 2);
  const z = spriteHit?.object === hero
    ? player.z
    : spriteHit
      ? enemies.find((enemy) => enemy.mesh === spriteHit.object).z
      : Math.floor(point.z + activeLevel.height / 2);
  if (x < 0 || x >= activeLevel.width || z < 0 || z >= activeLevel.height) return;
  setCursor(x, z);
  if (gameState.mode === 'cursor') {
    if (x === player.x && z === player.z) {
      selectMaria();
    } else if (spriteHit) {
      const enemy = enemies.find((unit) => unit.mesh === spriteHit.object);
      if (enemy) openEnemyProfile(enemy);
    } else {
      openOptionsMenu();
    }
  } else if (gameState.mode === 'move') {
    if (spriteHit?.object === hero) {
      openMariaActions();
    } else {
      confirmMove();
    }
  } else if (gameState.mode === 'attack') {
    const target = findEnemyAt(enemies, cursor.x, cursor.z);
    if (target) showCombatForecast(target);
  }
}

document.querySelector('#attack-action').addEventListener('click', startAttack);
document.querySelector('#inventory-action').addEventListener('click', openInventory);
document.querySelector('#confirm-combat').addEventListener('click', confirmCombatForecast);
document.querySelector('#cancel-combat').addEventListener('click', cancelCombatForecast);
document.querySelector('#profile-action').addEventListener('click', openCharacterProfile);
document.querySelector('#finish-action').addEventListener('click', finishUnit);
backActionButton.addEventListener('click', () => {
  if (player.moveOrigin && player.moved && !player.acted) undoMove();
  else cancelAction();
});
document.querySelector('#end-phase').addEventListener('click', endPlayerPhase);
document.querySelector('#close-profile').addEventListener('click', () => profileDialog.close());
document.querySelector('#inventory-close').addEventListener('click', closeInventory);
inventoryDialog.addEventListener('cancel', (event) => {
  event.preventDefault();
  closeInventory();
});
document.querySelector('#main-menu-action').addEventListener('click', openOptionsMenu);
document.querySelector('#title-options').addEventListener('click', openTitleOptions);
newGameButton.addEventListener('click', newGame);
continueButton.addEventListener('click', continueGame);
document.querySelector('#restart-level').addEventListener('click', restartLevel);
document.querySelector('#terminal-main-menu').addEventListener('click', returnToMainMenu);
document.querySelector('#resume-game').addEventListener('click', closeOptionsMenu);
document.querySelector('#return-to-menu').addEventListener('click', returnToMainMenu);
optionsDialog.addEventListener('cancel', () => {
  if (sessionStarted && gameState.mode === 'options') {
    gameState.mode = 'cursor';
    renderTacticalUi();
  }
});
combatForecastDialog.addEventListener('cancel', (event) => {
  event.preventDefault();
  cancelCombatForecast();
});
renderer.domElement.addEventListener('click', clickBattlefield);
renderer.domElement.addEventListener('pointermove', (event) => {
  const bounds = renderer.domElement.getBoundingClientRect();
  pointerPosition.set(
    ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
    -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
  );
  pointerRaycaster.setFromCamera(pointerPosition, camera);
  const unitHit = pointerRaycaster.intersectObjects(
    [hero, ...enemies.map((enemy) => enemy.mesh)],
    false,
  )[0];
  pointerHoveredUnit = unitHit
    ? unitHit.object === hero ? player : enemies.find((enemy) => enemy.mesh === unitHit.object) ?? null
    : null;
  updateUnitHoverCard();
  const point = pointerRaycaster.ray.intersectPlane(deckPlane, new THREE.Vector3());
  if (!point) {
    tileInspection.hidden = true;
    return;
  }
  showTileInspection(
    Math.floor(point.x + activeLevel.width / 2),
    Math.floor(point.z + activeLevel.height / 2),
  );
});
renderer.domElement.addEventListener('pointerleave', () => {
  pointerHoveredUnit = null;
  updateUnitHoverCard();
  showTileInspection(cursor.x, cursor.z);
});
document.querySelector('#open-unit-list').addEventListener('click', openUnitList);
document.querySelector('#unit-list-close').addEventListener('click', () => unitListDialog.close());
const savedGame = refreshContinueButton();
(savedGame ? continueButton : newGameButton).focus();

window.addEventListener('keydown', (event) => {
  if (event.repeat) return;
  const menuDirections = {
    ArrowUp: 'up',
    ArrowDown: 'down',
    ArrowLeft: 'left',
    ArrowRight: 'right',
    KeyW: 'up',
    KeyS: 'down',
    KeyA: 'left',
    KeyD: 'right',
  };
  if (menuDirections[event.code]) {
    const activeDialog = document.querySelector('dialog[open]');
    const activeMenu = activeDialog ?? [terminalScreen, actionPanel, mainMenu]
      .find((menu) => menu === mainMenu ? !mainMenu.hidden : !menu.hidden);
    if (activeMenu) {
      event.preventDefault();
      moveActionFocus(activeMenu, menuDirections[event.code]);
      return;
    }
  }
  if (!terminalScreen.hidden) {
    if (event.code === 'Enter' || event.code === 'Space') {
      event.preventDefault();
      if (terminalScreen.contains(document.activeElement)) document.activeElement.click();
    }
    return;
  }
  if (gameState.defeated) return;
  if (!mainMenu.hidden) return;
  if (gameState.phase !== 'player') return;
  if (playerMovement || gameState.mode === 'combat') return;
  if (profileDialog.open) return;
  if (inventoryDialog.open) return;
  if (optionsDialog.open) return;
  if (combatForecastDialog.open) return;
  if (event.code === 'Tab') {
    event.preventDefault();
    cyclePlayerUnits();
    return;
  }
  const directions = {
    ArrowUp: { x: 0, z: -1 },
    ArrowDown: { x: 0, z: 1 },
    ArrowLeft: { x: -1, z: 0 },
    ArrowRight: { x: 1, z: 0 },
    KeyW: { x: 0, z: -1 },
    KeyS: { x: 0, z: 1 },
    KeyA: { x: -1, z: 0 },
    KeyD: { x: 1, z: 0 },
  };
  if (
    gameState.phase === 'player' &&
    gameState.mode === 'unit' &&
    gameState.selected &&
    menuDirections[event.code]
  ) {
    event.preventDefault();
    moveActionFocus(actionPanel, menuDirections[event.code]);
  } else if (
    directions[event.code] &&
    !(event.target instanceof HTMLInputElement) &&
    !(event.target instanceof HTMLTextAreaElement)
  ) {
    event.preventDefault();
    if (gameState.phase !== 'player' || gameState.mode === 'unit') return;
    const direction = directions[event.code];
    setCursor(cursor.x + direction.x, cursor.z + direction.z);
  } else if (event.code === 'Enter' || event.code === 'Space') {
    event.preventDefault();
    if (gameState.mode === 'unit' && gameState.selected) {
      const activeButton = actionPanel.contains(document.activeElement) && !document.activeElement.disabled
        ? document.activeElement
        : actionButtons.find((button) => !button.disabled);
      activeButton?.click();
    } else {
      confirmCursor();
    }
  } else if (event.code === 'Escape') {
    if (gameState.mode === 'cursor') openOptionsMenu();
    else cancelAction();
  } else if (event.code === 'Backspace') {
    event.preventDefault();
    if (gameState.mode === 'unit' && gameState.selected) backActionButton.click();
    else cancelAction();
  } else if (event.code === 'KeyM') {
    startMove();
  } else if (event.code === 'KeyA') {
    startAttack();
  } else if (event.code === 'KeyF') {
    finishUnit();
  } else if (event.code === 'KeyE') {
    endPlayerPhase();
  }
});

function update(dt, t) {
  let playerWorldX = worldX(player.x);
  let playerWorldZ = worldZ(player.z);
  let playerWorldY = unitSpriteHeightAt(player.x, player.z);
  let moving = Boolean(playerMovement);
  if (playerMovement) {
    const stepCount = playerMovement.path.length - 1;
    const progress = Math.min(1, (t - playerMovement.startedAt) / playerMovement.duration);
    if (progress >= 1) {
      playerMovement = undefined;
      gameState.mode = 'unit';
      if (checkEscapeObjective()) return;
      setMessage(`${player.name} moved. You can still attack in range or end her unit turn.`);
      renderTacticalUi();
      focusActionMenu();
      moving = false;
    } else {
      const pathProgress = progress * stepCount;
      const stepIndex = Math.floor(pathProgress);
      const stepProgress = pathProgress - stepIndex;
      const from = playerMovement.path[stepIndex];
      const to = playerMovement.path[stepIndex + 1];
      player.facing = getFacing(to.x - from.x, to.z - from.z);
      playerWorldX = THREE.MathUtils.lerp(worldX(from.x), worldX(to.x), stepProgress);
      playerWorldZ = THREE.MathUtils.lerp(worldZ(from.z), worldZ(to.z), stepProgress);
      playerWorldY = THREE.MathUtils.lerp(
        unitSpriteHeightAt(from.x, from.z),
        unitSpriteHeightAt(to.x, to.z),
        stepProgress,
      );
    }
  }
  if (enemyMovement) {
    const { enemy, path, startedAt, duration } = enemyMovement;
    const stepCount = path.length - 1;
    const progress = Math.min(1, (t - startedAt) / duration);
    const pathProgress = progress * stepCount;
    const stepIndex = Math.min(stepCount - 1, Math.floor(pathProgress));
    const stepProgress = progress >= 1 ? 1 : pathProgress - stepIndex;
    const from = path[stepIndex];
    const to = path[stepIndex + 1];
    enemy.facing = getFacing(to.x - from.x, to.z - from.z);
    if (enemy.isBoss) {
      const frames = bartzWalkingMaterials[enemy.facing];
      const frameIndex = Math.floor((t - startedAt) / 0.09) % frames.length;
      enemy.mesh.material = frames[frameIndex];
    } else {
      const frames = raiderWalkingMaterials[enemy.facing];
      const frameIndex = Math.floor((t - startedAt) / 0.09) % frames.length;
      enemy.mesh.material = frames[frameIndex];
    }
    enemy.mesh.position.set(
      THREE.MathUtils.lerp(worldX(from.x), worldX(to.x), stepProgress),
      THREE.MathUtils.lerp(
        unitSpriteHeightAt(from.x, from.z),
        unitSpriteHeightAt(to.x, to.z),
        stepProgress),
      THREE.MathUtils.lerp(worldZ(from.z), worldZ(to.z), stepProgress),
    );
  }
  for (const enemy of enemies) {
    if (enemy.attackAnimation) {
      const { direction, frameIndex } = enemy.attackAnimation;
      if (enemy.isBoss) {
        // Bartz: use texture swapping like Maria
        const frames = characterSprites.bartzAttackFrames[direction];
        if (frames && frameIndex < frames.length) {
          enemy.mesh.material.map = frames[frameIndex];
          enemy.mesh.material.needsUpdate = true;
        }
      } else {
        // Raiders: use material swapping
        const attackMaterials = raiderAttackMaterials[direction];
        if (attackMaterials && frameIndex < attackMaterials.length) {
          enemy.mesh.material = attackMaterials[frameIndex];
        }
      }
    }
  }
  const attacking = Boolean(attackAnimation);
  for (let index = floatingCombatTexts.length - 1; index >= 0; index--) {
    const floatingText = floatingCombatTexts[index];
    const age = t - floatingText.startedAt;
    if (age >= 1.1) {
      scene.remove(floatingText.sprite);
      floatingText.material.map.dispose();
      floatingText.material.dispose();
      floatingCombatTexts.splice(index, 1);
      continue;
    }
    floatingText.sprite.position.y += dt * 0.8;
    floatingText.material.opacity = 1 - age / 1.1;
  }
  const pose = moving ? 'walking' : 'idle';
  const walkingFrames = characterSprites.mariaWalkingFrames[player.facing];
  const walkingTime = playerMovement ? t - playerMovement.startedAt : t;
  const walkingFrame = walkingFrames[Math.floor(walkingTime / 0.09) % walkingFrames.length];
  const attackFrames = attacking
    ? characterSprites.mariaAttackFrames[attackAnimation.direction]
    : undefined;
  const sprite = attacking ? attackFrames[attackAnimation.frameIndex]
    : moving ? walkingFrame
      : characterSprites.maria[player.facing];
  if (hero.material.map !== sprite) {
    hero.material.map = sprite;
    hero.material.needsUpdate = true;
  }
  const healthBarMeshes = [hero, ...enemies.map((enemy) => enemy.mesh)];
  updateExperiencePanel();
  if (gameState.mode !== 'combat' && combatants.size) {
    for (const mesh of healthBarMeshes) {
      const bar = mesh.userData.healthBar;
      if (combatants.has(bar.unit)) bar.revealUntil = t + HEALTH_BAR_LINGER_SECONDS;
    }
    combatants.clear();
  }
  for (const mesh of healthBarMeshes) {
    const healthBar = mesh.userData.healthBar;
    const targetRatio = THREE.MathUtils.clamp(
      healthBar.unit.hp / healthBar.unit.maxHp,
      0,
      1,
    );
    if (healthBar.displayRatio === undefined) healthBar.displayRatio = targetRatio;
    healthBar.group.visible =
      (gameState.mode === 'combat' && combatants.has(healthBar.unit)) || t < healthBar.revealUntil;
    if (!healthBar.group.visible) {
      healthBar.displayRatio = targetRatio;
      continue;
    }
    // Ease toward the real HP so damage visibly drains the bar.
    healthBar.displayRatio += (targetRatio - healthBar.displayRatio) * Math.min(1, dt * 6);
    if (Math.abs(targetRatio - healthBar.displayRatio) < 0.002) healthBar.displayRatio = targetRatio;
    const healthRatio = Math.max(healthBar.displayRatio, 0.001);
    healthBar.fill.scale.x = healthRatio;
    healthBar.fill.position.x = -(1 - healthRatio) * healthBar.width / 2;
    healthBar.fill.material.color.set(
      healthRatio > 0.6 ? 0x42d66b : healthRatio > 0.3 ? 0xf0c541 : 0xed4b4b,
    );
  }
  hero.position.set(
    playerWorldX,
    playerWorldY + (moving ? Math.abs(Math.sin(t * 28)) * 0.08 : 0),
    playerWorldZ,
  );
  blob.position.x = playerWorldX;
  blob.position.y = playerWorldY - UNIT_SPRITE_HEIGHT / 2 - HERO_DECK_HEIGHT + 0.02;
  blob.position.z = playerWorldZ;

  cursorOutline.visible =
    sessionStarted &&
    !gameState.defeated &&
    gameState.phase === 'player' &&
    gameState.mode !== 'combat' &&
    gameState.mode !== 'forecast';
  cursorOutline.position.set(
    worldX(cursor.x),
    getTileElevation(activeLevel, cursor.x, cursor.z) + 0.17,
    worldZ(cursor.z),
  );
  torch.position.set(playerWorldX + 1.2, 2.4, playerWorldZ + 0.8);
  torch.intensity = 38 + Math.sin(t * 17) * 3 + Math.sin(t * 5.3) * 2;

  const target = moving
    ? new THREE.Vector3(playerWorldX, 0.8, playerWorldZ)
    : cameraFollowTarget
      ? new THREE.Vector3(cameraFollowTarget.x, 0.8, cameraFollowTarget.z)
      : (gameState.selected || gameState.phase === 'player')
        ? new THREE.Vector3(worldX(cursor.x), 0.8, worldZ(cursor.z))
        : new THREE.Vector3(0, 0.8, 0);
  const cameraScale = Math.max(0.55, activeLevel.width / 21, activeLevel.height / 19);
  const desired = target.clone().addScaledVector(CAM_OFFSET, cameraScale);
  camera.position.lerp(desired, 1 - Math.pow(0.001, dt));
  camera.lookAt(target);
}

setMessage(`WASD / Arrows move · Enter inspects enemies · Select ${player.name} · Click empty tiles for options`);
renderTacticalUi();

// ---------- Main loop ----------

const clock = new THREE.Clock();
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  update(dt, clock.elapsedTime);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
