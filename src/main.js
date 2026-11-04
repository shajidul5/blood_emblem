import * as THREE from 'three';
import {
  getAttackCount,
  getAvoid,
  getCriticalRate,
  getCriticalDamage,
  canAttack,
  getCombatExperience,
  getCombatDamage,
  getHitRate,
  getTriangleAdvantage,
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
  terrainMoveCost,
  tileKey,
} from './battle/grid.js';
import { createBartzAlly, createCypherAlly, createEnemyUnit, createMaria, createSeymourAlly } from './characters/characters.js';
import { createExperienceDisplay } from './characters/experience-display.js';
import { applyClass, canEquipWeapon, equipBlockReason, canPromote, promoteUnit, getUsesMultiplier, getStaffRangeBonus } from './characters/classes.js';
import { awardWeaponExp } from './characters/weapon-levels.js';
import { createLevelUpDialog } from './characters/level-up-dialog.js';
import { createPromotionDialog, snapshotForPromotion } from './characters/promotion-dialog.js';
import { createItemPopup } from './characters/item-popup.js';
import { createTutorialPopup, PART_ONE_ENDING, setTutorialsEnabled, TRIANGLE_EFFECTS, tutorialsEnabled } from './game/tutorial.js';
import { awardExperience } from './characters/progression.js';
import { createProfileDialog, portraitUrl } from './characters/profile-dialog.js';
import { initializeUiSounds } from './audio/ui-sounds.js';
import { playHitImpact, playMissWhiff, playWeaponSwing } from './audio/combat-sounds.js';
import { convoy, grantItem, INVENTORY_ITEMS, MAX_INVENTORY_SIZE, maxUsesFor, refreshMagicUses, rescaleMagicUses, restoreMariaInventory, setConvoy, spendWeaponUse } from './characters/inventory.js';
import { loadCharacterSprites } from './characters/animation-loader.js';
import { createSaveData, readSave, serializeUnit, writeSave } from './game/save.js';
import {
  buildLevel,
  CHAPTER_COUNT,
  loadChapterLevel,
  loadInitialLevel,
  updateLevelAnimation,
  validateLevel,
} from './levels/level.js';
import { getTerrain, getTileElevation } from './battle/terrain.js';
import { initializeAnimatedMenu } from './menu.js';
import {
  initializeOceanSound,
  isOceanSoundEnabled,
  onOceanSoundChange,
  setOceanSoundEnabled,
} from './audio/ocean.js';

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

async function visitHouse() {
  if (!gameState.selected || gameState.phase !== 'player' || player.acted) return;
  const house = houseAvailableToVisit(player);
  if (!house) {
    setMessage(`${player.name} must stand in front of an unvisited house to visit it.`);
    return;
  }
  if (house.recruitId) {
    await recruitFromHouse(house);
    return;
  }
  const { item, toConvoy } = grantItem(player, house.rewardId);
  house.visited = true;
  player.acted = true;
  setMessage(toConvoy
    ? `${player.name} visited ${house.name}. Their inventory is full, so ${item.name} was sent to the convoy.`
    : `${player.name} visited ${house.name} and received ${item.name}.`);
  renderTacticalUi();
  await itemPopup.show([{ unit: player, item, toConvoy }]);
  finishUnit();
}

// Nearest free walkable tile to the house door, where a recruit steps out.
function recruitSpawnTile(house) {
  const taken = new Set([
    ...playerTeam.filter((unit) => unit.hp > 0).map((unit) => tileKey(unit.x, unit.z)),
    ...enemies.map((enemy) => tileKey(enemy.x, enemy.z)),
  ]);
  let best = null;
  for (let z = 0; z < activeLevel.height; z++) {
    for (let x = 0; x < activeLevel.width; x++) {
      if (!isWalkable(activeLevel, x, z) || taken.has(tileKey(x, z))) continue;
      const distance = distanceBetween(house.door.x, house.door.z, x, z);
      if (!best || distance < best.distance) best = { x, z, distance };
    }
  }
  return best;
}

async function recruitFromHouse(house) {
  const recruit = roster[house.recruitId];
  const tile = recruitSpawnTile(house);
  if (!recruit || !tile) throw new Error(`House ${house.id} cannot recruit "${house.recruitId}".`);
  house.visited = true;
  player.acted = true;
  Object.assign(recruit, { x: tile.x, z: tile.z, facing: 'south', hp: recruit.maxHp, moved: false, acted: false, moveOrigin: null });
  recruit.mesh.position.set(worldX(recruit.x), unitSpriteHeightAt(recruit.x, recruit.z), worldZ(recruit.z));
  playerTeam.push(recruit);
  setIdleSprite(recruit);
  setMessage(`${player.name} visited ${house.name}. ${recruit.name} joins the party!`);
  renderTacticalUi();
  await tutorialPopup.show(house.recruitId);
  finishUnit();
}

// ---------- Renderer / scene / camera ----------

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
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
const raisedPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

function createNightBackdrop() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not create the night-sky backdrop.');
  const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, '#10182d');
  gradient.addColorStop(0.55, '#26304a');
  gradient.addColorStop(1, '#51415a');
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  let seed = 120319;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  for (let index = 0; index < 220; index++) {
    const radius = random() > 0.94 ? 2 : 1;
    context.globalAlpha = 0.35 + random() * 0.65;
    context.fillStyle = random() > 0.35 ? '#e2e8ff' : '#f7d8b1';
    context.beginPath();
    context.arc(random() * canvas.width, random() * canvas.height * 0.78, radius, 0, Math.PI * 2);
    context.fill();
  }
  context.globalAlpha = 1;
  const moonGlow = context.createRadialGradient(790, 105, 10, 790, 105, 105);
  moonGlow.addColorStop(0, 'rgba(217, 229, 255, .42)');
  moonGlow.addColorStop(1, 'rgba(217, 229, 255, 0)');
  context.fillStyle = moonGlow;
  context.fillRect(680, 0, 220, 220);
  context.fillStyle = '#e1e8f4';
  context.beginPath();
  context.arc(790, 105, 34, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = 'rgba(95, 111, 143, .25)';
  for (const [x, y, radius] of [[778, 94, 5], [803, 113, 7], [785, 122, 3]]) {
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }
  for (const [y, alpha, width] of [[340, 0.22, 450], [390, 0.28, 380], [445, 0.34, 520]]) {
    const cloud = context.createLinearGradient(0, y - 25, 0, y + 32);
    cloud.addColorStop(0, 'rgba(181, 190, 218, 0)');
    cloud.addColorStop(0.5, `rgba(181, 190, 218, ${alpha})`);
    cloud.addColorStop(1, 'rgba(181, 190, 218, 0)');
    context.fillStyle = cloud;
    context.beginPath();
    context.ellipse(250 + random() * 500, y, width / 2, 28, 0, 0, Math.PI * 2);
    context.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const backdrop = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture,
    transparent: false,
    depthTest: false,
    depthWrite: false,
    fog: false,
  }));
  backdrop.renderOrder = -1000;
  scene.add(backdrop);
  return backdrop;
}

const nightBackdrop = createNightBackdrop();

// Picks the floor point under the pointer, preferring raised tiles (quarterdeck, stairs) that sit above the main deck.
function pickFloorPoint(ray) {
  for (const elevation of [0.5, 0.25]) {
    raisedPlane.constant = -(0.11 + elevation);
    const point = ray.intersectPlane(raisedPlane, new THREE.Vector3());
    if (!point || !activeLevel) continue;
    const x = Math.floor(point.x + activeLevel.width / 2);
    const z = Math.floor(point.z + activeLevel.height / 2);
    if (getTileElevation(activeLevel, x, z) === elevation) return point;
  }
  return ray.intersectPlane(deckPlane, new THREE.Vector3());
}
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
const terminalSubtitle = document.querySelector('#terminal-subtitle');
const menuStatus = document.querySelector('#menu-status');
const continueButton = document.querySelector('#continue-game');
const newGameButton = document.querySelector('#new-game');
const optionsDialog = document.querySelector('#options-dialog');
const combatForecastDialog = document.querySelector('#combat-forecast');
const actionButtons = [...actionPanel.querySelectorAll('button')];
const visitActionButton = document.querySelector('#visit-action');
const chestActionButton = document.querySelector('#chest-action');
const profileDialog = document.querySelector('#profile-dialog');
const inventoryDialog = document.querySelector('#inventory-dialog');
const enemyMenuDialog = document.querySelector('#enemy-menu-dialog');
const enemyInventoryDialog = document.querySelector('#enemy-inventory-dialog');
const experienceDisplay = createExperienceDisplay(document.querySelector('#exp-panel'));
const levelUpDialogUi = createLevelUpDialog(document.querySelector('#level-up-dialog'));
const promotionDialogUi = createPromotionDialog(document.querySelector('#promotion-dialog'));
const itemPopup = createItemPopup(document.querySelector('#item-popup-dialog'));
const tutorialPopup = createTutorialPopup(document.querySelector('#tutorial-dialog'), {
  itemSprite: (id) => INVENTORY_ITEMS.get(id)?.spriteUrl ?? null,
});
// Story and teaching popups for chapters 1 and 2. Each step shows once per run of the chapter.
const tutorialProgress = { active: false, running: false, intro: true, potion: true, stairs: true, houses: true, combatSeen: false };

function resetTutorials(chapter) {
  Object.assign(tutorialProgress, {
    active: chapter !== null && chapter <= 5,
    chapter,
    running: false,
    intro: false,
    potion: chapter !== 0,
    stairs: chapter >= 1,
    houses: chapter !== 2,
    combatSeen: false,
  });
}

function nearestStairs(unit) {
  let best = null;
  for (let z = 0; z < activeLevel.height; z++) {
    for (let x = 0; x < activeLevel.width; x++) {
      if (!String(activeLevel.tileIds[z][x]).startsWith('stairs')) continue;
      const distance = distanceBetween(unit.x, unit.z, x, z);
      if (!best || distance < best.distance) best = { x, z, distance };
    }
  }
  return best;
}

// Shows any tutorial step that is due, but only while the player has control of the cursor.
async function runTutorials() {
  const { active, running } = tutorialProgress;
  const inControl = gameState.phase === 'player' && gameState.mode === 'cursor' && !gameState.selected &&
    !gameState.defeated && !playerMovement && !itemPopup.open;
  if (!active || running || !inControl) return;
  tutorialProgress.running = true;
  try {
    if (!tutorialProgress.intro) {
      tutorialProgress.intro = true;
      await tutorialPopup.show(['intro', 'boarders', 'village', 'mansion', 'escape', 'forest'][tutorialProgress.chapter], TRIANGLE_EFFECTS);
    }
    if (!tutorialProgress.houses) {
      tutorialProgress.houses = true;
      const house = activeLevel.houses.filter((entry) => !entry.visited)
        .sort((a, b) => distanceBetween(player.x, player.z, a.door.x, a.door.z) - distanceBetween(player.x, player.z, b.door.x, b.door.z))[0];
      if (house) {
        setCursor(house.door.x, house.door.z);
        await tutorialPopup.show('houses');
        setCursor(player.x, player.z);
      }
    }
    if (tutorialProgress.combatSeen && !tutorialProgress.potion) {
      tutorialProgress.potion = true;
      const potion = INVENTORY_ITEMS.get('potion');
      await tutorialPopup.show('potion', { heal: potion?.heal, uses: potion?.maxUses });
    }
    const stairs = tutorialProgress.potion && !tutorialProgress.stairs ? nearestStairs(player) : null;
    if (stairs) {
      tutorialProgress.stairs = true;
      setCursor(stairs.x, stairs.z);
      await tutorialPopup.show('stairs', { bonus: getTerrain(activeLevel, stairs.x, stairs.z).bonus });
      setCursor(player.x, player.z);
    }
  } finally {
    tutorialProgress.running = false;
  }
}

// Hands the level's starting items to every unit and announces each pickup in turn.
function grantStartingItems(team) {
  const receipts = [];
  for (const itemId of activeLevel.startingItems) {
    for (const unit of team) receipts.push({ unit, ...grantItem(unit, itemId) });
  }
  window.setTimeout(async () => {
    await runTutorials();
    if (receipts.length) await itemPopup.show(receipts);
  }, 700);
}
const profileDialogUi = createProfileDialog(profileDialog);
const maria = createMaria();
const cypher = createCypherAlly();
const seymour = createSeymourAlly();
let player = maria;
const playerTeam = [maria];
experienceDisplay.reset(player.level, player.experience);
let activeLevel;
let sessionStarted = false;
let levelGroup = new THREE.Group();
const tacticalOverlay = new THREE.Group();
scene.add(levelGroup);
scene.add(tacticalOverlay);
const gameState = { mode: 'cursor', phase: 'player', turn: 1, selected: false, defeated: false };
const cursor = { x: 0, z: 0 };
const UNIT_SPRITE_HEIGHT = 1.15;
const UNIT_SPRITE_WIDTH = UNIT_SPRITE_HEIGHT;
// Tilt sprites to face the camera so the angled view doesn't squash them vertically.
const SPRITE_TILT = new THREE.Euler(-Math.atan2(CAM_OFFSET.y, CAM_OFFSET.z), 0, 0);

function createUnitSpriteGeometry() {
  const geometry = new THREE.PlaneGeometry(UNIT_SPRITE_WIDTH, UNIT_SPRITE_HEIGHT);
  // Keep the feet planted where they were when the sprite stood upright.
  const feet = new THREE.Vector3(0, -UNIT_SPRITE_HEIGHT / 2, 0);
  const tiltedFeet = feet.clone().applyEuler(SPRITE_TILT);
  const shift = feet.sub(tiltedFeet).applyQuaternion(
    new THREE.Quaternion().setFromEuler(SPRITE_TILT).invert(),
  );
  geometry.translate(shift.x, shift.y, shift.z);
  return geometry;
}

// Per-character scale adjustments to normalize visual sizes
const CHARACTER_SCALES = {
  maria: 1.0,
  bartz: 0.9,
  raider: 0.9,
  merfolk: 0.9,
  cypher: 0.85,
  seymour: 0.85,
  ravagerMaria: 1.0,
  berserkerBartz: 0.9,
  sageCypher: 0.85,
  bishopSeymour: 0.85,
};
let playerMovement;
let enemyMovement;
let cameraFollowTarget;
let pendingCombatTarget;
const floatingCombatTexts = [];
let phaseBannerTimeout;
let terminalFocusTimeout;
let movementRange = new Map();
let enemies = [];
let cursorOutline;
let showAllEnemyRanges = false;
let moveHighlights;
let targetHighlights;
let attackRangeHighlights;
let enemyRangeHighlights = [];
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
const unitGeometry = createUnitSpriteGeometry();
const HERO_DECK_HEIGHT = 0.12;
function unitSpriteHeightAt(x, z) {
  return UNIT_SPRITE_HEIGHT / 2 + HERO_DECK_HEIGHT + getTileElevation(activeLevel, x, z);
}

function unitTextures(unit) {
  const set = unit.spriteSet;
  return {
    idle: characterSprites[set],
    walking: characterSprites[`${set}WalkingFrames`],
    attack: characterSprites[`${set}AttackFrames`],
    staff: characterSprites[`${set}StaffFrames`],
    firearm: characterSprites[`${set}FirearmFrames`],
  };
}

// Each unit owns its material, so animation is just swapping the texture.
function setUnitSprite(unit, texture) {
  if (!texture || unit.mesh.material.map === texture) return;
  unit.mesh.material.map = texture;
  unit.mesh.material.needsUpdate = true;
}

function setIdleSprite(unit, direction = unit.facing) {
  setUnitSprite(unit, unitTextures(unit).idle[direction]);
}

function createUnitMesh(unit, renderOrder = 2) {
  const mesh = new THREE.Mesh(
    unitGeometry,
    new THREE.MeshBasicMaterial({
      map: unitTextures(unit).idle[unit.facing ?? 'south'],
      alphaTest: 0.5,
      side: THREE.DoubleSide,
    }),
  );
  const scale = unit.scale ?? CHARACTER_SCALES[unit.spriteSet] ?? 1;
  mesh.scale.set(scale, scale, 1);
  mesh.rotation.copy(SPRITE_TILT);
  mesh.renderOrder = renderOrder;
  mesh.position.set(worldX(unit.x), unitSpriteHeightAt(unit.x, unit.z), worldZ(unit.z));
  scene.add(mesh);
  unit.mesh = mesh;
  addUnitHealthBar(mesh, unit);
  return mesh;
}

// Re-syncs a unit's mesh with its current sprite set (after a promotion or a restored save).
function refreshUnitAppearance(unit) {
  if (!unit.mesh) return;
  const scale = unit.scale ?? CHARACTER_SCALES[unit.spriteSet] ?? 1;
  unit.mesh.scale.set(scale, scale, 1);
  setIdleSprite(unit);
}

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

createUnitMesh(maria, 0);
const bartz = createBartzAlly();
createUnitMesh(bartz, 0);
createUnitMesh(cypher, 0);
createUnitMesh(seymour, 0);
let currentChapter = 0;
let chapterStart = null;
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

function getAttackRangeTiles(unit) {
  const tiles = [];
  if (!canAttack(unit)) return tiles;
  for (let z = 0; z < activeLevel.height; z++) {
    for (let x = 0; x < activeLevel.width; x++) {
      const distance = distanceBetween(unit.x, unit.z, x, z);
      if (
        distance >= unit.weapon.minRange &&
        distance <= unit.weapon.maxRange &&
        isWalkable(activeLevel, x, z)
      ) tiles.push({ x, z });
    }
  }
  return tiles;
}

function createEnemy(tileX, tileZ, id = 'raider', options = {}) {
  const enemy = { ...createEnemyUnit(id, tileX, tileZ, options), facing: 'south' };
  createUnitMesh(enemy);
  if (enemy.drop) addDropMarker(enemy);
  return enemy;
}

let dropMarkerTexture;

// A pulsing gold gem above enemies that carry a drop, so the player knows who to hunt.
function addDropMarker(enemy) {
  if (!dropMarkerTexture) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const context = canvas.getContext('2d');
    context.translate(32, 32);
    context.shadowColor = '#ffd75e';
    context.shadowBlur = 10;
    context.fillStyle = '#f6c744';
    context.strokeStyle = '#fff3c4';
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(0, -20);
    context.lineTo(15, 0);
    context.lineTo(0, 20);
    context.lineTo(-15, 0);
    context.closePath();
    context.fill();
    context.stroke();
    dropMarkerTexture = new THREE.CanvasTexture(canvas);
    dropMarkerTexture.colorSpace = THREE.SRGBColorSpace;
  }
  const marker = new THREE.Sprite(new THREE.SpriteMaterial({
    map: dropMarkerTexture, transparent: true, depthTest: false, depthWrite: false, fog: false,
  }));
  marker.scale.set(0.3, 0.3, 1);
  marker.position.set(0, enemy.mesh.geometry.parameters.height / 2 + 0.5, 0.08);
  marker.renderOrder = 11;
  enemy.mesh.add(marker);
  enemy.mesh.userData.dropMarker = marker;
}

function resetEnemies() {
  for (const enemy of enemies) scene.remove(enemy.mesh);
  enemies = [];
  if (activeLevel.enemies.length) {
    enemies = activeLevel.enemies.map((entry) => createEnemy(entry.x, entry.z, entry.id, entry));
    return;
  }
  const { x: exitX, z: exitZ } = activeLevel.exit;
  const candidates = [];
  for (let z = 0; z < activeLevel.height; z++) {
    for (let x = 0; x < activeLevel.width; x++) {
      if (
        isWalkable(activeLevel, x, z) &&
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
      isWalkable(activeLevel, exitX, exitZ) &&
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
      maria,
      enemies,
      gameState,
      {
        allies: playerTeam.filter((unit) => unit !== maria),
        convoy,
        chapter: currentChapter,
        chapterStart,
      },
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

function hasPendingReinforcements() {
  return activeLevel.reinforcements.some((wave) => !wave.spawned);
}

function checkDefeatAllVictory() {
  if (activeLevel.objective === 'defeat-boss') {
    if (enemies.some((enemy) => enemy.isBoss)) return false;
    completeVictory('The boss has fallen. The objective is complete.');
    return true;
  }
  if (
    activeLevel.objective !== 'defeat-all-enemies' ||
    enemies.length > 0 ||
    hasPendingReinforcements()
  ) return false;
  completeVictory('All enemies have fallen. The objective is complete.');
  return true;
}

function objectiveDescription(level = activeLevel) {
  if (level.objective === 'escape') return 'Get every unit to the marked exit';
  return level.objective === 'defeat-boss' ? 'Defeat the boss' : 'Kill all enemies';
}

function hideTerminalScreen() {
  window.clearTimeout(terminalFocusTimeout);
  terminalScreen.classList.remove('visible');
  terminalScreen.hidden = true;
}

// At the end of part one the plain victory card comes first; its Continue button opens the ending card.
let showingPartOneVictory = false;

function showTerminalScreen(outcome, message, { ending = false } = {}) {
  terminalScreen.dataset.outcome = outcome;
  const partEnd = outcome === 'victory' && currentChapter === 4;
  showingPartOneVictory = partEnd && !ending;
  terminalHeading.textContent = ending ? PART_ONE_ENDING.heading : outcome === 'victory' ? 'VICTORY' : 'GAME OVER';
  terminalSubtitle.hidden = !ending;
  terminalSubtitle.textContent = ending ? PART_ONE_ENDING.welcome : '';
  terminalMessage.textContent = ending ? PART_ONE_ENDING.message : message;
  const nextChapterButton = document.querySelector('#next-chapter');
  nextChapterButton.hidden = !(outcome === 'victory' && (hasNextChapter() || showingPartOneVictory));
  nextChapterButton.textContent = ending ? 'Begin Part Two' : showingPartOneVictory ? 'Continue' : 'Next Chapter';
  terminalScreen.classList.remove('visible');
  terminalScreen.hidden = false;
  requestAnimationFrame(() => terminalScreen.classList.add('visible'));
  window.clearTimeout(terminalFocusTimeout);
  terminalFocusTimeout = window.setTimeout(() => {
    (nextChapterButton.hidden ? document.querySelector('#restart-level') : nextChapterButton)
      .focus({ preventScroll: true });
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
  if (activeLevel.objective !== 'escape') return false;
  const living = playerTeam.filter((unit) => unit.hp > 0);
  const escaped = living.filter((unit) =>
    activeLevel.exitTiles.some((tile) => tile.x === unit.x && tile.z === unit.z));
  if (!living.length || escaped.length < living.length) return false;
  completeVictory('Everyone has reached the exit. The objective is complete.');
  return true;
}

function hideMainMenu() {
  mainMenu.hidden = true;
  document.body.classList.remove('title-screen');
  menuStatus.textContent = '';
  document.activeElement.blur?.();
}

function applyUnitSnapshot(unit, snapshot) {
  Object.assign(unit, snapshot.stats, {
    level: snapshot.level,
    experience: snapshot.experience,
  });
  if (snapshot.weaponExp) unit.weaponExp = { ...snapshot.weaponExp };
  if (snapshot.classId) applyClass(unit, snapshot.classId);
  refreshUnitAppearance(unit);
  restoreMariaInventory(unit, snapshot.inventory, snapshot.equippedWeaponId);
  unit.hp = unit.maxHp;
}

const roster = { maria, bartz, cypher, seymour };

// Fields the level's listed player units (or Maria alone at the spawn point).
function deployTeam(level) {
  const placements = level.players.length
    ? level.players
    : [{ id: 'maria', x: level.spawn.x, z: level.spawn.z }];
  const team = placements.map((placement) => {
    const unit = roster[placement.id];
    if (!unit) throw new Error(`Unknown player unit "${placement.id}".`);
    Object.assign(unit, {
      x: placement.x,
      z: placement.z,
      facing: 'south',
      hp: unit.maxHp,
      moved: false,
      acted: false,
      moveOrigin: null,
    });
    return unit;
  });
  playerTeam.length = 0;
  playerTeam.push(...team);
  player = team[0];
  return team;
}

function serializeCarry() {
  const allies = new Map((chapterStart?.allies ?? []).map((ally) => [ally.id, ally]));
  for (const unit of playerTeam) {
    if (unit !== maria && roster[unit.id]) allies.set(unit.id, serializeUnit(unit));
  }
  return { ...serializeUnit(maria), allies: [...allies.values()], convoy: convoy.map(({ id, uses }) => ({ id, uses })) };
}

function startLevel(level, { chapter = null, carry = null } = {}) {
  hideTerminalScreen();
  currentChapter = chapter;
  chapterStart = carry;
  resetTutorials(chapter);
  Object.assign(maria, createMaria());
  Object.assign(bartz, createBartzAlly());
  Object.assign(cypher, createCypherAlly());
  Object.assign(seymour, createSeymourAlly());
  setConvoy(carry?.convoy);
  if (carry) {
    applyUnitSnapshot(maria, carry);
    for (const savedAlly of carry.allies ?? []) {
      if (roster[savedAlly.id] && roster[savedAlly.id] !== maria) applyUnitSnapshot(roster[savedAlly.id], savedAlly);
    }
  }
  for (const unit of [maria, bartz, cypher, seymour]) refreshMagicUses(unit.inventory, unit);
  refreshMagicUses(convoy);
  activeLevel = buildLevel(THREE, levelGroup, level);
  const team = deployTeam(activeLevel);
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
  grantStartingItems(team);
}

function newGame() {
  startLevel(initialLevel, { chapter: 0 });
}

function restartLevel() {
  startLevel({
    ...activeLevel,
    houses: activeLevel.houses.map((house) => ({ ...house, visited: false })),
    chests: activeLevel.chests.map((chest) => ({ ...chest, opened: false })),
    reinforcements: activeLevel.reinforcements.map((wave) => ({
      ...wave,
      spawned: false,
      spawnedCount: 0,
    })),
  }, { chapter: currentChapter, carry: chapterStart });
}

async function startNextChapter() {
  const next = (currentChapter ?? -1) + 1;
  if (next >= CHAPTER_COUNT) return;
  try {
    const level = await loadChapterLevel(next);
    startLevel(level, { chapter: next, carry: serializeCarry() });
  } catch (error) {
    console.error('Unable to start next chapter:', error);
    setLevelStatus(`Could not start next chapter: ${error.message}`, true);
  }
}

function hasNextChapter() {
  return currentChapter !== null && currentChapter + 1 < CHAPTER_COUNT;
}


function continueGame() {
  const save = refreshContinueButton();
  if (!save) return;
  activeLevel = buildLevel(THREE, levelGroup, save.level);
  const restoreUnit = (unit, saved) => {
    Object.assign(unit, saved.stats, {
      x: saved.x,
      z: saved.z,
      facing: saved.facing,
      level: saved.level,
      experience: saved.experience,
      moved: saved.moved,
      acted: saved.acted,
      moveOrigin: saved.moveOrigin ?? null,
    });
    if (saved.weaponExp) unit.weaponExp = { ...saved.weaponExp };
    if (saved.classId) applyClass(unit, saved.classId);
    refreshUnitAppearance(unit);
    restoreMariaInventory(unit, saved.inventory, saved.equippedWeaponId);
  };
  Object.assign(bartz, createBartzAlly());
  Object.assign(cypher, createCypherAlly());
  Object.assign(seymour, createSeymourAlly());
  restoreUnit(maria, save.player);
  const team = [maria];
  for (const savedAlly of save.allies) {
    const ally = roster[savedAlly.id];
    if (!ally) throw new Error(`Unknown saved ally "${savedAlly.id}".`);
    restoreUnit(ally, savedAlly);
    team.push(ally);
  }
  playerTeam.length = 0;
  playerTeam.push(...team);
  player = team.find((unit) => unit.hp > 0) ?? maria;
  currentChapter = save.chapter;
  chapterStart = save.chapterStart;
  resetTutorials(currentChapter);
  tutorialProgress.intro = true;
  tutorialProgress.combatSeen = save.turn > 1 || save.enemies.some((enemy) => enemy.hp < enemy.maxHp);
  setConvoy(save.convoy);
  for (const enemy of enemies) scene.remove(enemy.mesh);
  enemies = save.enemies.map((savedEnemy) => {
    const enemy = createEnemy(savedEnemy.x, savedEnemy.z, savedEnemy.id ?? 'raider', savedEnemy);
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
  if (!sessionStarted && !mainMenu.hidden) {
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
  try {
    renderTacticalUi();
  } catch (error) {
    console.error('Unable to refresh the battle UI before returning to the menu:', error);
  }
  refreshContinueButton();
  mainMenu.hidden = false;
  document.body.classList.add('title-screen');
  (continueButton.disabled ? newGameButton : continueButton).focus();
}

function openTitleOptions() {
  if (sessionStarted || optionsDialog.open) return;
  document.querySelector('#open-unit-list').hidden = true;
  document.querySelector('#options-end-phase').hidden = true;
  document.querySelector('#options-restart').hidden = true;
  optionsDialog.showModal();
  document.querySelector('#resume-game').focus();
}

function openOptionsMenu() {
  if (!sessionStarted || gameState.mode === 'options' || gameState.mode === 'combat' || playerMovement) return;
  gameState.mode = 'options';
  document.querySelector('#open-unit-list').hidden = false;
  document.querySelector('#options-end-phase').hidden = false;
  document.querySelector('#options-restart').hidden = false;
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

const blobGeometry = new THREE.PlaneGeometry(1.1, 1.1);
const blobMaterial = new THREE.MeshBasicMaterial({
  map: blobShadowTexture(),
  transparent: true,
  depthWrite: false,
});
for (const unit of [maria, bartz, cypher, seymour]) {
  unit.blob = new THREE.Mesh(blobGeometry, blobMaterial);
  unit.blob.rotation.x = -Math.PI / 2;
  unit.blob.position.y = 0.02;
  scene.add(unit.blob);
}
const levelFile = document.querySelector('#level-file');
document.querySelector('#load-level').addEventListener('click', () => levelFile.click());
const enemyRangeToggle = document.querySelector('#toggle-enemy-range');
enemyRangeToggle.addEventListener('click', () => {
  showAllEnemyRanges = !showAllEnemyRanges;
  enemyRangeToggle.setAttribute('aria-pressed', String(showAllEnemyRanges));
  enemyRangeToggle.blur();
  refreshHighlights();
});
levelFile.addEventListener('change', async () => {
  const [file] = levelFile.files;
  if (!file) return;
  try {
    const level = validateLevel(JSON.parse(await file.text()));
    activeLevel = buildLevel(THREE, levelGroup, level);
    currentChapter = null;
    chapterStart = null;
    const team = deployTeam(activeLevel);
    playerMovement = undefined;
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
    grantStartingItems(team);
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
  if (attackRangeHighlights) {
    tacticalOverlay.remove(attackRangeHighlights);
    attackRangeHighlights.dispose();
    attackRangeHighlights = undefined;
  }
  for (const mesh of enemyRangeHighlights) {
    tacticalOverlay.remove(mesh);
    mesh.dispose();
  }
  enemyRangeHighlights = [];
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

  const blocked = new Set(movementObstacles(player).map((unit) => tileKey(unit.x, unit.z)));
  const path = findPath(player, [cursor], blocked, activeLevel);
  if (path.length < 2) return;
  movementPathMaterial = new THREE.MeshBasicMaterial({
    color: 0x168cff,
    transparent: true,
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
    new THREE.ConeGeometry(0.32, 0.55, 4),
    movementPathMaterial,
  );
  tip.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
  tip.position.set(
    worldX(destination.x) - direction.x * 0.02,
    elevation + 0.3,
    worldZ(destination.z) - direction.z * 0.02,
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
    transform.position.set(worldX(tile.x), 0.2 + getTileElevation(activeLevel, tile.x, tile.z), worldZ(tile.z));
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
  const cursorInspecting = gameState.mode === 'cursor' && !gameState.selected;
  if (gameState.phase === 'player' && (showAllEnemyRanges || cursorInspecting)) {
    const inspected = cursorInspecting ? findEnemyAt(enemies, cursor.x, cursor.z) : undefined;
    const shown = showAllEnemyRanges ? enemies.filter((enemy) => enemy.hp > 0) : inspected ? [inspected] : [];
    const moveTiles = new Map();
    const threatTiles = new Map();
    for (const enemy of shown) {
      const reach = getEnemyReach(enemy);
      if (enemy.ai !== 'stationary') {
        for (const key of reach.keys()) {
          const [x, z] = key.split(',').map(Number);
          moveTiles.set(key, { x, z });
        }
      }
      for (const tile of getEnemyThreatTiles(enemy, reach)) threatTiles.set(tileKey(tile.x, tile.z), tile);
    }
    for (const key of moveTiles.keys()) threatTiles.delete(key);
    enemyRangeHighlights = [
      makeHighlights([...moveTiles.values()], rangeMaterial),
      makeHighlights([...threatTiles.values()], targetMaterial),
    ].filter(Boolean);
    for (const mesh of enemyRangeHighlights) mesh.renderOrder = 3;
  }
  if (gameState.mode === 'attack') {
    attackRangeHighlights = makeHighlights(getAttackRangeTiles(player), rangeMaterial);
    targetHighlights = makeHighlights(
      getAttackTargets(player, enemies).map(({ x, z }) => ({ x, z })),
      targetMaterial,
    );
  }
}

function setMessage(message) {
  battleMessage.textContent = message;
}

const hitEffects = [];
let cameraShake = { until: 0, strength: 0 };
const cameraShakeOffset = new THREE.Vector3();
let hitFlashTexture;

function getHitFlashTexture() {
  if (!hitFlashTexture) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const context = canvas.getContext('2d');
    const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.3, 'rgba(255,200,120,0.85)');
    gradient.addColorStop(1, 'rgba(255,80,40,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 64, 64);
    hitFlashTexture = new THREE.CanvasTexture(canvas);
  }
  return hitFlashTexture;
}

// Impact burst: a bright flash, flying sparks and a short camera jolt.
function spawnHitEffect(unit, critical) {
  const unitPosition = unit.mesh.position;
  const origin = new THREE.Vector3(unitPosition.x, unitPosition.y + 0.55, unitPosition.z + 0.2);
  const makeSprite = (color, scale) => {
    const material = new THREE.SpriteMaterial({
      map: getHitFlashTexture(),
      color,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const sprite = new THREE.Sprite(material);
    sprite.position.copy(origin);
    sprite.scale.setScalar(scale);
    sprite.renderOrder = 9;
    scene.add(sprite);
    return { sprite, material };
  };
  const born = clock.elapsedTime;
  hitEffects.push({ ...makeSprite(critical ? 0xff4a4a : 0xffffff, critical ? 2.2 : 1.5), born, life: 0.22, grow: 1.8 });
  const sparkCount = critical ? 14 : 8;
  for (let index = 0; index < sparkCount; index++) {
    const angle = (index / sparkCount) * Math.PI * 2 + Math.random() * 0.6;
    const speed = (critical ? 3.6 : 2.6) * (0.6 + Math.random() * 0.7);
    hitEffects.push({
      ...makeSprite(critical ? 0xff6a3a : 0xffd27a, 0.22 + Math.random() * 0.12),
      born,
      life: 0.3 + Math.random() * 0.2,
      grow: 0,
      velocity: new THREE.Vector3(Math.cos(angle) * speed, 1.2 + Math.random() * 1.6, Math.sin(angle) * speed * 0.6),
    });
  }
  cameraShake = { until: born + (critical ? 0.32 : 0.18), strength: critical ? 0.2 : 0.09 };
}

function showCombatResult(unit, text, type) {
  if (type === 'miss') {
    playMissWhiff();
  } else {
    if (type !== 'heal') {
      playHitImpact({ critical: type === 'critical' });
      spawnHitEffect(unit, type === 'critical');
    }
  }
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
  context.fillStyle = type === 'heal' ? '#5dff8a' : type === 'critical' ? '#72101d' : type === 'miss' ? '#ffffff' : '#ffe14a';
  context.fillText(text, 96, 32);
  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  const unitPosition = unit.mesh.position;
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

function itemInfoElement(entry) {
  const item = INVENTORY_ITEMS.get(entry.id);
  const details = document.createElement('div');
  const name = document.createElement('strong');
  name.textContent = item.name;
  const description = document.createElement('span');
  if (item.itemType === 'weapon') {
    description.textContent =
      `${item.type} · Might ${item.might} · Hit ${item.hit} · Crit ${item.critical} · Weight ${item.weight}`;
    if (item.heal) description.textContent = `${item.type} · Heals ${item.heal} + Magic HP · Range ${item.minRange}-${item.maxRange + getStaffRangeBonus(player)}`;
    if (item.maxUses && Number.isInteger(entry.uses)) description.textContent += ` · ${entry.uses}/${maxUsesFor(item, player)} uses`;
  } else if (item.heal) {
    description.textContent = `Heals ${item.heal} HP · ${entry.uses}/${item.maxUses} uses remaining`;
  } else {
    description.textContent = item.description ?? '';
  }
  details.append(name, description);
  if (Array.isArray(item.effect) && item.effect.length) {
    const effect = document.createElement('span');
    effect.className = 'item-effect';
    effect.textContent = `Effective vs ${item.effect.join(', ')}`;
    details.append(effect);
  }
  if (item.reaves?.length) {
    const reaves = document.createElement('span');
    reaves.className = 'item-effect';
    reaves.textContent = `Double triangle bonus vs ${item.reaves.join(', ')}`;
    details.append(reaves);
  }
  if (item.lore) {
    const lore = document.createElement('span');
    lore.className = 'item-lore';
    lore.textContent = item.lore;
    details.append(lore);
  }
  const icon = document.createElement('div');
  icon.className = 'item-icon';
  if (item.spriteUrl) {
    const image = document.createElement('img');
    image.src = item.spriteUrl;
    image.alt = '';
    icon.append(image);
  }
  const info = document.createElement('div');
  info.className = 'item-info';
  info.append(icon, details);
  return info;
}

function itemRow(entry, label, disabled, onClick) {
  const row = document.createElement('li');
  const action = document.createElement('button');
  action.textContent = label;
  action.disabled = disabled;
  if (onClick) action.addEventListener('click', onClick);
  row.append(itemInfoElement(entry), action);
  return row;
}

function renderInventory() {
  inventoryDialog.querySelector('#inventory-heading').textContent = `${player.name}'s Inventory`;
  const list = inventoryDialog.querySelector('#inventory-items');
  list.replaceChildren();
  const equippedIndex = player.inventory.findIndex((entry) => entry.id === player.weapon?.id);
  for (const [slot, entry] of player.inventory.entries()) {
    const item = INVENTORY_ITEMS.get(entry.id);
    if (item.type === 'Staff') {
      const blocked = equipBlockReason(player, item);
      const ready = !blocked && healTargets(player).length > 0;
      list.append(itemRow(entry, blocked ?? (ready ? 'Use' : 'No one to heal'), !ready, () => {
        closeInventory();
        openHeal();
      }));
    } else if (item.itemType === 'weapon') {
      const equipped = slot === equippedIndex;
      if (!equipped && !canEquipWeapon(player, item)) {
        list.append(itemRow(entry, equipBlockReason(player, item), true));
      } else {
        list.append(itemRow(entry, equipped ? 'Equipped' : 'Equip', equipped, () => equipInventoryWeapon(entry.id)));
      }
    } else if (item.effect === 'keepsake') {
      list.append(itemRow(entry, 'Keepsake', true));
    } else if (item.effect === 'key') {
      list.append(itemRow(entry, 'Opens chests', true));
    } else if (item.effect === 'promote') {
      const ready = player.level >= 10 && canPromote(player);
      list.append(itemRow(entry, ready ? 'Use' : canPromote(player) ? 'Needs level 10' : 'Already promoted', !ready, () => useMasterEmblem(entry)));
    } else if (item.effect === 'strength-up') {
      list.append(itemRow(entry, 'Use', false, () => usePocketwatch(entry)));
    } else {
      list.append(itemRow(entry, 'Use', player.hp >= player.maxHp, () => useInventoryItem(entry)));
    }
  }
  inventoryDialog.querySelector('#inventory-empty').hidden = player.inventory.length > 0;
  inventoryDialog.querySelector('#inventory-capacity').textContent =
    `${player.inventory.length}/${MAX_INVENTORY_SIZE} items · Convoy: ${convoy.length}`;

  // Maria carries the convoy, so she and anyone standing next to her can reach it.
  const convoySection = inventoryDialog.querySelector('#convoy-section');
  const access = canAccessConvoy(player);
  convoySection.hidden = !access;
  if (access) {
    for (const [slot, row] of [...list.children].entries()) {
      const entry = player.inventory[slot];
      const store = document.createElement('button');
      const bound = INVENTORY_ITEMS.get(entry.id).bound;
      store.textContent = 'Store';
      store.disabled = Boolean(bound);
      store.addEventListener('click', () => storeInConvoy(entry));
      row.append(store);
    }
  }
  const convoyList = convoySection.querySelector('#convoy-items');
  convoyList.replaceChildren();
  const full = player.inventory.length >= MAX_INVENTORY_SIZE;
  for (const entry of convoy) {
    convoyList.append(itemRow(entry, full ? 'Inventory full' : 'Take', full, () => withdrawFromConvoy(entry)));
  }
  convoySection.querySelector('#convoy-empty').hidden = convoy.length > 0;
}

function canAccessConvoy(unit) {
  return maria.hp > 0 && (unit === maria || Math.abs(unit.x - maria.x) + Math.abs(unit.z - maria.z) === 1);
}

function storeInConvoy(entry) {
  const index = player.inventory.indexOf(entry);
  if (!canAccessConvoy(player) || index < 0 || INVENTORY_ITEMS.get(entry.id).bound) return;
  player.inventory.splice(index, 1);
  convoy.push(entry);
  const note = settleTradedWeapons(player);
  renderInventory();
  inventoryDialog.querySelector('button:not(:disabled)')?.focus();
  setMessage(`${player.name} stored ${INVENTORY_ITEMS.get(entry.id).name} in the convoy.${note}`);
  saveCurrentGame();
}

function withdrawFromConvoy(entry) {
  const index = convoy.indexOf(entry);
  if (!canAccessConvoy(player) || index < 0 || player.inventory.length >= MAX_INVENTORY_SIZE) return;
  convoy.splice(index, 1);
  player.inventory.push(entry);
  const note = settleTradedWeapons(player, entry);
  renderInventory();
  inventoryDialog.querySelector('button:not(:disabled)')?.focus();
  setMessage(`${player.name} took ${INVENTORY_ITEMS.get(entry.id).name} from the convoy.${note}`);
  saveCurrentGame();
}

const tradeDialog = document.querySelector('#trade-dialog');
let tradePartner = null;
let pendingSwap = null;

// A unit that no longer holds its equipped weapon is unarmed until it equips another.
function settleTradedWeapons(unit, received) {
  let note = '';
  if (unit.weapon && !unit.inventory.some((held) => held.id === unit.weapon.id)) {
    unit.weapon = null;
    note = ` ${unit.name} is now unarmed.`;
  }
  const item = received && INVENTORY_ITEMS.get(received.id);
  if (item?.itemType === 'weapon' && !item.heal && !unit.weapon && canEquipWeapon(unit, item)) {
    unit.weapon = item;
    note += ` ${unit.name} equipped ${item.name}.`;
  }
  return note;
}

function swapItems(ownerA, entryA, ownerB, entryB) {
  const indexA = ownerA.inventory.indexOf(entryA);
  const indexB = ownerB.inventory.indexOf(entryB);
  pendingSwap = null;
  if (indexA < 0 || indexB < 0 || INVENTORY_ITEMS.get(entryA.id).bound || INVENTORY_ITEMS.get(entryB.id).bound) return;
  ownerA.inventory[indexA] = entryB;
  ownerB.inventory[indexB] = entryA;
  const note = settleTradedWeapons(ownerA, entryB) + settleTradedWeapons(ownerB, entryA);
  renderTrade();
  tradeDialog.querySelector('button:not(:disabled)')?.focus();
  setMessage(`${ownerA.name} swapped ${INVENTORY_ITEMS.get(entryA.id).name} for ${ownerB.name}'s ${INVENTORY_ITEMS.get(entryB.id).name}.${note}`);
  saveCurrentGame();
}

function adjacentAllies(unit) {
  return playerTeam.filter((ally) =>
    ally !== unit && ally.hp > 0 && Math.abs(ally.x - unit.x) + Math.abs(ally.z - unit.z) === 1);
}

function openTrade() {
  if (!gameState.selected || gameState.mode !== 'unit') return;
  const partners = adjacentAllies(player);
  if (!partners.length) return;
  tradePartner = partners.length === 1 ? partners[0] : null;
  gameState.mode = 'trade';
  renderTacticalUi();
  renderTrade();
  tradeDialog.showModal();
  tradeDialog.querySelector('button:not(:disabled)')?.focus();
}

function renderTradeColumn(side, owner, other) {
  tradeDialog.querySelector(`#trade-${side}-name`).textContent = `${owner.name}`;
  const list = tradeDialog.querySelector(`#trade-${side}-items`);
  list.replaceChildren();
  const equippedIndex = owner.inventory.findIndex((entry) => entry.id === owner.weapon?.id);
  const otherFull = other.inventory.length >= MAX_INVENTORY_SIZE;
  for (const [slot, entry] of owner.inventory.entries()) {
    const equipped = slot === equippedIndex;
    const bound = INVENTORY_ITEMS.get(entry.id).bound;
    let row;
    if (pendingSwap) {
      if (pendingSwap.entry === entry) {
        row = itemRow(entry, 'Cancel swap', false, () => { pendingSwap = null; renderTrade(); });
      } else if (pendingSwap.owner !== owner) {
        row = itemRow(entry, 'Swap for this', bound, () => swapItems(pendingSwap.owner, pendingSwap.entry, owner, entry));
      } else {
        row = itemRow(entry, 'Pick from other side', true);
      }
    } else {
      const label = bound ? 'Cannot be traded' : otherFull ? `${other.name} is full` : `Give to ${other.name}${equipped ? ' (equipped)' : ''}`;
      row = itemRow(entry, label, bound || otherFull, () => tradeItem(owner, other, entry));
      if (!bound) {
        const swap = document.createElement('button');
        swap.textContent = 'Swap';
        swap.disabled = other.inventory.length === 0;
        swap.addEventListener('click', () => { pendingSwap = { owner, entry }; renderTrade(); });
        row.append(swap);
      }
    }
    list.append(row);
  }
  tradeDialog.querySelector(`#trade-${side}-capacity`).textContent =
    `${owner.inventory.length}/${MAX_INVENTORY_SIZE} items`;
}

function renderTrade() {
  const partners = adjacentAllies(player);
  const choosing = !tradePartner;
  tradeDialog.querySelector('#trade-heading').textContent = choosing
    ? `Trade: choose who ${player.name} trades with`
    : `Trade: ${player.name} ↔ ${tradePartner.name}`;
  tradeDialog.querySelector('.trade-columns').hidden = choosing;
  tradeDialog.querySelector('#trade-note').hidden = choosing;
  let switcher = tradeDialog.querySelector('#trade-partners');
  if (!switcher) {
    switcher = document.createElement('div');
    switcher.id = 'trade-partners';
    tradeDialog.querySelector('.trade-columns').before(switcher);
  }
  switcher.replaceChildren();
  if (partners.length > 1) {
    for (const partner of partners) {
      const button = document.createElement('button');
      button.textContent = partner.name;
      button.disabled = partner === tradePartner;
      button.addEventListener('click', () => {
        tradePartner = partner;
        pendingSwap = null;
        renderTrade();
        tradeDialog.querySelector('.trade-columns button:not(:disabled)')?.focus();
      });
      switcher.append(button);
    }
  }
  if (choosing) return;
  renderTradeColumn('left', player, tradePartner);
  renderTradeColumn('right', tradePartner, player);
}

function tradeItem(from, to, entry) {
  const index = from.inventory.indexOf(entry);
  if (index < 0 || to.inventory.length >= MAX_INVENTORY_SIZE || INVENTORY_ITEMS.get(entry.id).bound) return;
  from.inventory.splice(index, 1);
  to.inventory.push(entry);
  const item = INVENTORY_ITEMS.get(entry.id);
  const note = settleTradedWeapons(from, null) + settleTradedWeapons(to, entry);
  renderTrade();
  tradeDialog.querySelector('button:not(:disabled)')?.focus();
  setMessage(`${from.name} gave ${item.name} to ${to.name}.${note}`);
  saveCurrentGame();
}

function closeTrade() {
  pendingSwap = null;
  if (tradeDialog.open) tradeDialog.close();
  if (gameState.mode === 'trade') {
    gameState.mode = 'unit';
    renderTacticalUi();
    focusActionMenu();
  }
}

const healDialog = document.querySelector('#heal-dialog');

// Staves are used from the action menu or inventory; the unit keeps its real weapon equipped.
function healStaffFor(unit) {
  for (const entry of unit.inventory) {
    const item = INVENTORY_ITEMS.get(entry.id);
    if (item?.type === 'Staff' && item.heal && entry.uses !== 0 && canEquipWeapon(unit, item)) return item;
  }
  return undefined;
}

function healTargets(unit) {
  const staff = healStaffFor(unit);
  if (!staff || unit.acted) return [];
  return playerTeam.filter((ally) => {
    const distance = distanceBetween(unit.x, unit.z, ally.x, ally.z);
    return ally !== unit && ally.hp > 0 && ally.hp < ally.maxHp &&
      distance >= staff.minRange && distance <= staff.maxRange + getStaffRangeBonus(unit);
  });
}
function openHeal() {
  if (!gameState.selected || gameState.mode !== 'unit') return;
  const targets = healTargets(player);
  if (!targets.length) return;
  gameState.mode = 'heal';
  renderTacticalUi();
  const list = healDialog.querySelector('#heal-targets');
  list.replaceChildren();
  for (const target of targets) {
    const row = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = `${target.name} · ${target.hp}/${target.maxHp} HP`;
    button.addEventListener('click', () => void useHealStaff(target));
    row.append(button);
    list.append(row);
  }
  healDialog.showModal();
  list.querySelector('button')?.focus();
}

function closeHeal() {
  if (healDialog.open) healDialog.close();
  if (gameState.mode === 'heal') {
    gameState.mode = 'unit';
    renderTacticalUi();
    focusActionMenu();
  }
}

async function useHealStaff(target) {
  const staff = healStaffFor(player);
  if (!staff || !healTargets(player).includes(target)) return;
  if (healDialog.open) healDialog.close();
  gameState.mode = 'combat';
  combatants.add(player);
  combatants.add(target);
  renderTacticalUi();
  player.facing = getFacing(target.x - player.x, target.z - player.z);
  const casting = playAttackAnimation(player, player.facing, false, true);
  await wait(450);
  const healed = Math.min(staff.heal + player.magic, target.maxHp - target.hp);
  target.hp += healed;
  showCombatResult(target, `+${healed}`, 'heal');
  const staffEntry = player.inventory.find((entry) => entry.id === staff.id && entry.uses !== 0);
  if (Number.isInteger(staffEntry?.uses)) staffEntry.uses--;
  const rankUps = [];
  const staffRank = awardWeaponExp(player, staff);
  if (staffRank) rankUps.push(`${player.name}'s Staff level rose to ${staffRank.id}!`);
  setMessage(withRankUps(`${player.name} healed ${target.name} for ${healed} HP.`, rankUps));
  await casting;
  await wait(1100);
  const experienceGained = staff.healExperience ?? 20;
  const progression = awardExperience(player, experienceGained);
  await showExperienceProgression(progression, experienceGained);
  gameState.mode = 'unit';
  finishUnit();
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
    throw new Error(`Cannot equip ${itemId}: weapon is not in ${player.name}'s inventory.`);
  }
  if (!canEquipWeapon(player, weapon)) {
    throw new Error(`${player.class} cannot equip ${weapon.type} weapons.`);
  }
  player.weapon = weapon;
  closeInventory();
  setMessage(`${player.name} equipped ${weapon.name}.`);
  renderTacticalUi();
}

async function useInventoryItem(entry) {
  const item = INVENTORY_ITEMS.get(entry.id);
  if (!player.inventory.includes(entry) || item?.itemType !== 'consumable' || player.hp >= player.maxHp) return;

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

let menuEnemy = null;

function openEnemyMenu(enemy) {
  menuEnemy = enemy;
  enemyMenuDialog.querySelector('#enemy-menu-heading').textContent = enemy.name;
  enemyMenuDialog.querySelector('#enemy-menu-summary').textContent =
    `${enemy.name} · Lv ${enemy.level} · HP ${enemy.hp}/${enemy.maxHp}`;
  enemyMenuDialog.showModal();
  enemyMenuDialog.querySelector('#enemy-menu-profile').focus();
}

function openEnemyInventory(enemy) {
  const list = enemyInventoryDialog.querySelector('#enemy-inventory-items');
  list.replaceChildren();
  enemyInventoryDialog.querySelector('#enemy-inventory-heading').textContent = `${enemy.name}'s Inventory`;
  const entries = [];
  if (enemy.weapon) entries.push({ entry: { id: enemy.weapon.id, uses: null }, label: 'Equipped' });
  if (enemy.drop) entries.push({ entry: { id: enemy.drop, uses: INVENTORY_ITEMS.get(enemy.drop)?.maxUses ?? null }, label: 'Drops on defeat' });
  for (const { entry, label } of entries) list.append(itemRow(entry, label, true));
  enemyInventoryDialog.querySelector('#enemy-inventory-note').textContent = enemy.drop
    ? 'Defeat this enemy to claim its drop.'
    : 'This enemy carries nothing of value.';
  enemyInventoryDialog.showModal();
  enemyInventoryDialog.querySelector('#enemy-inventory-close').focus();
}

function capitalize(text) {
  return `${text[0].toUpperCase()}${text.slice(1)}`;
}

function selectableMeshes() {
  return [...playerTeam.filter((unit) => unit.hp > 0), ...enemies].map((unit) => unit.mesh);
}

function unitForMesh(mesh) {
  return [...playerTeam, ...enemies].find((unit) => unit.mesh === mesh) ?? null;
}

function playerUnitAt(x, z) {
  return playerTeam.find((unit) => unit.hp > 0 && unit.x === x && unit.z === z) ?? null;
}

function houseAvailableToVisit(unit) {
  return activeLevel.houses.find((house) =>
    !house.visited &&
    unit.x === house.door.x && unit.z === house.door.z);
}

function chestAvailableToOpen(unit) {
  return activeLevel.chests.find((chest) =>
    !chest.opened && unit.x === chest.x && unit.z === chest.z);
}

async function openChest() {
  if (!gameState.selected || gameState.phase !== 'player' || player.acted) return;
  const chest = chestAvailableToOpen(player);
  if (!chest) return;
  const keyIndex = player.inventory.findIndex((entry) => entry.id === 'chest-key');
  if (keyIndex < 0) {
    setMessage(`${chest.name} is locked. ${player.name} needs a Chest Key.`);
    return;
  }
  player.inventory.splice(keyIndex, 1);
  const { item, toConvoy } = grantItem(player, chest.rewardId);
  chest.opened = true;
  chest.mesh.material.opacity = 0.35;
  if (chest.glow) chest.glow.intensity = 0;
  player.acted = true;
  setMessage(toConvoy
    ? `${player.name} unlocked the chest. Their inventory is full, so ${item.name} was sent to the convoy.`
    : `${player.name} unlocked the chest and found ${item.name}.`);
  renderTacticalUi();
  await itemPopup.show([{ unit: player, item, toConvoy }]);
  finishUnit();
}

// Golden aura that swells around the unit, with sparkles rising off it. Resolves at the
// moment of the sprite swap (the aura's peak); the aura then fades out on its own.
async function playPromotionGlow(unit, applyChange) {
  const position = unit.mesh.position;
  const origin = new THREE.Vector3(position.x, position.y + 0.1, position.z + 0.2);
  const born = clock.elapsedTime;
  const makeSprite = (color, scale) => {
    const material = new THREE.SpriteMaterial({
      map: getHitFlashTexture(),
      color,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0,
    });
    const sprite = new THREE.Sprite(material);
    sprite.position.copy(origin);
    sprite.scale.setScalar(scale);
    sprite.renderOrder = 9;
    scene.add(sprite);
    return { sprite, material };
  };
  hitEffects.push({
    ...makeSprite(0xffd45a, 1),
    born,
    life: 2.6,
    pulse: (p) => 1.3 + Math.min(p / 0.6, 1) * 1.1 + Math.sin(p * 40) * 0.08,
    opacity: (p) => (p < 0.6 ? 0.25 + (p / 0.6) * 0.75 : Math.max(0, 1 - (p - 0.6) / 0.4)),
  });
  hitEffects.push({
    ...makeSprite(0xfff6d0, 0.9),
    born,
    life: 2.6,
    pulse: (p) => 0.7 + Math.sin(p * 30) * 0.12 + p * 0.5,
    opacity: (p) => (p < 0.6 ? p / 0.6 : Math.max(0, 1 - (p - 0.6) / 0.4)),
  });
  for (let index = 0; index < 26; index++) {
    const angle = Math.random() * Math.PI * 2;
    const radius = 0.25 + Math.random() * 0.35;
    const spark = makeSprite(index % 2 ? 0xffe08a : 0xfff6d0, 0.16 + Math.random() * 0.12);
    spark.sprite.position.set(origin.x + Math.cos(angle) * radius, origin.y - 0.3, origin.z + Math.sin(angle) * radius * 0.6);
    hitEffects.push({
      ...spark,
      born: born + Math.random() * 1.1,
      life: 0.9 + Math.random() * 0.5,
      velocity: new THREE.Vector3(0, 0.9 + Math.random() * 0.9, 0),
      gravity: 0,
      opacity: (p) => Math.sin(p * Math.PI),
    });
  }
  await wait(1500);
  applyChange();
  hitEffects.push({
    ...makeSprite(0xffffff, 1.5),
    born: clock.elapsedTime,
    life: 0.45,
    pulse: (p) => 1.5 + p * 2.5,
    opacity: (p) => 1 - p,
  });
  cameraShake = { until: clock.elapsedTime + 0.2, strength: 0.07 };
  await wait(1100);
}

async function useMasterEmblem(entry) {
  if (player.level < 10 || !canPromote(player)) return;
  closeInventory();
  gameState.mode = 'combat';
  combatants.add(player);
  renderTacticalUi();
  setMessage(`${player.name} raises the Orders Emblem...`);
  let result;
  const before = snapshotForPromotion(player, portraitUrl(player));
  const previousMultiplier = getUsesMultiplier(player);
  await playPromotionGlow(player, () => {
    result = promoteUnit(player);
    rescaleMagicUses(player, previousMultiplier);
    refreshUnitAppearance(player);
    player.inventory.splice(player.inventory.indexOf(entry), 1);
  });
  await promotionDialogUi.show(player, before, portraitUrl(player));
  const gains = Object.entries(result.gains)
    .map(([stat, bonus]) => `${capitalize(stat)} +${bonus}`)
    .join(', ');
  setMessage(`${player.name} promoted from ${result.from} to ${result.to}! ${gains}.`);
  renderTacticalUi();
  await wait(1200);
  gameState.mode = 'unit';
  finishUnit();
}

async function usePocketwatch(entry) {
  closeInventory();
  gameState.mode = 'combat';
  combatants.add(player);
  renderTacticalUi();
  player.strength += 2;
  player.inventory.splice(player.inventory.indexOf(entry), 1);
  saveCurrentGame();
  setMessage(`${player.name} winds the pocketwatch. Strength +2!`);
  renderTacticalUi();
  await wait(1400);
  gameState.mode = 'unit';
  finishUnit();
}

// Defeated enemies carrying an item hand it to whoever landed the final blow.
async function collectEnemyDrop(enemy, recipient) {
  if (!enemy.drop) return;
  const { item, toConvoy } = grantItem(recipient, enemy.drop);
  await itemPopup.show([{ unit: recipient, item, toConvoy }]);
}

// Only opposing units block movement; teammates can be walked through.
function movementObstacles() {
  return enemies.filter((enemy) => enemy.hp > 0);
}

function unitAtTile(x, z) {
  const friendly = playerUnitAt(x, z);
  if (friendly) return friendly;
  return findEnemyAt(enemies, x, z);
}

// Unit under the mouse pointer; falls back to the unit under the cursor.
let pointerHoveredUnit = null;

function currentHoverUnit() {
  return sessionStarted && gameState.mode !== 'combat'
    ? pointerHoveredUnit ?? unitAtTile(cursor.x, cursor.z)
    : null;
}

let shownExperienceKey = '';

// Experience belongs to player units only; keep it up while a gain animates.
function updateExperiencePanel() {
  const hovered = currentHoverUnit();
  const gaining = experiencePanel.classList.contains('gaining');
  experiencePanel.hidden = !(sessionStarted && (playerTeam.includes(hovered) || gaining));
  if (!gaining && playerTeam.includes(hovered)) {
    const key = `${hovered.id}:${hovered.level}:${hovered.experience}`;
    if (key !== shownExperienceKey) {
      shownExperienceKey = key;
      experienceDisplay.reset(hovered.level, hovered.experience);
    }
  }
}

function updateUnitHoverCard() {
  const unit = currentHoverUnit();
  updateExperiencePanel();
  if (!unit) {
    unitHoverCard.hidden = true;
    return;
  }
  unitHoverCard.replaceChildren();
  const name = document.createElement('strong');
  name.className = 'unit-card-name';
  name.textContent = `${unit.name}${unit.isBoss ? ' (Boss)' : ''}`;
  const unitClass = document.createElement('span');
  unitClass.className = 'unit-card-class';
  unitClass.textContent = [capitalize(unit.class), unit.type && capitalize(unit.type)]
    .filter(Boolean)
    .join(' · ');

  const hpRatio = unit.maxHp > 0 ? Math.max(0, Math.min(1, unit.hp / unit.maxHp)) : 0;
  const hp = document.createElement('div');
  hp.className = 'unit-card-hp';
  const hpLabel = document.createElement('span');
  hpLabel.textContent = 'HP';
  const bar = document.createElement('div');
  bar.className = 'unit-card-hp-bar';
  bar.setAttribute('role', 'progressbar');
  bar.setAttribute('aria-valuemin', '0');
  bar.setAttribute('aria-valuemax', String(unit.maxHp));
  bar.setAttribute('aria-valuenow', String(unit.hp));
  const fill = document.createElement('div');
  fill.className = 'unit-card-hp-fill';
  fill.style.width = `${hpRatio * 100}%`;
  fill.dataset.level = hpRatio <= 0.25 ? 'low' : hpRatio <= 0.5 ? 'mid' : 'high';
  bar.append(fill);
  const hpValue = document.createElement('span');
  hpValue.className = 'unit-card-hp-value';
  hpValue.textContent = `${unit.hp}/${unit.maxHp}`;
  hp.append(hpLabel, bar, hpValue);

  const weapon = document.createElement('div');
  weapon.className = 'unit-card-weapon';
  if (unit.weapon?.spriteUrl) {
    const icon = document.createElement('img');
    icon.src = unit.weapon.spriteUrl;
    icon.alt = '';
    weapon.append(icon);
  }
  const weaponName = document.createElement('span');
  weaponName.textContent = unit.weapon?.name ?? 'Unarmed';
  weapon.append(weaponName);
  if (unit.weapon?.effect?.length) {
    const effect = document.createElement('small');
    effect.textContent = `Effective vs ${unit.weapon.effect.join(', ')}`;
    weapon.append(effect);
  }
  if (unit.weapon?.reaves?.length) {
    const reaves = document.createElement('small');
    reaves.textContent = `Double triangle bonus vs ${unit.weapon.reaves.join(', ')}`;
    weapon.append(reaves);
  }
  if (unit.drop) {
    const carries = document.createElement('small');
    carries.textContent = `Drops ${INVENTORY_ITEMS.get(unit.drop)?.name ?? unit.drop}`;
    weapon.append(carries);
  }
  unitHoverCard.append(name, unitClass, hp, weapon);
  unitHoverCard.hidden = false;
}

const UNIT_LIST_STATS = [
  'strength', 'magic', 'dexterity', 'speed', 'luck', 'defense', 'resistance', 'movement',
];
const idleSpriteUrls = new Map();

function idleSpriteUrl(unit) {
  const texture = characterSprites[unit.spriteSet]?.south;
  if (!texture?.image) return undefined;
  if (!idleSpriteUrls.has(unit.spriteSet)) {
    const canvas = document.createElement('canvas');
    canvas.width = texture.image.width;
    canvas.height = texture.image.height;
    canvas.getContext('2d').drawImage(texture.image, 0, 0);
    idleSpriteUrls.set(unit.spriteSet, canvas.toDataURL());
  }
  return idleSpriteUrls.get(unit.spriteSet);
}

function renderUnitList() {
  const body = unitListDialog.querySelector('#unit-list-body');
  body.replaceChildren();
  for (const unit of [...playerTeam, ...enemies]) {
    const row = document.createElement('tr');
    row.className = playerTeam.includes(unit) ? 'player' : 'enemy';
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
  actionPanel.querySelector('strong').textContent = player.name.toUpperCase();
  document.querySelector('#attack-action').disabled = player.acted || !canAttack(player);
  const house = houseAvailableToVisit(player);
  visitActionButton.hidden = !house;
  const chestHere = chestAvailableToOpen(player);
  chestActionButton.hidden = !chestHere;
  document.querySelector('#trade-action').hidden = !gameState.selected || adjacentAllies(player).length === 0;
  document.querySelector('#heal-action').hidden = !gameState.selected || healTargets(player).length === 0;
  actionHelp.textContent = gameState.mode === 'move'
    ? `Choose a tile within ${player.movement} ${movementUnit}; the blue line previews the route.`
    : gameState.mode === 'attack'
      ? `Choose a target in weapon range ${rangeText}, then press Space or Enter.`
      : `${player.moved ? 'Movement complete' : 'Choose an action'} · ${player.moveOrigin && !player.acted ? 'Undo Move is available' : player.acted ? 'Acted' : `Attack, inventory, profile${house ? ', visit house' : ''}${adjacentAllies(player).length ? ', trade' : ''}, or end unit`}`;
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

const AI_LABELS = {
  mobile: 'Aggressive',
  guard: 'Holds until approached',
  stationary: 'Stationary',
};

function setCursor(x, z) {
  cursor.x = Math.max(0, Math.min(activeLevel.width - 1, x));
  cursor.z = Math.max(0, Math.min(activeLevel.height - 1, z));
  cursorOutline.visible = true;
  showTileInspection(cursor.x, cursor.z);
  updateUnitHoverCard();
  updateMovementRoute();
  const enemy = findEnemyAt(enemies, cursor.x, cursor.z);
  if (gameState.mode === 'cursor') refreshHighlights();
  if (enemy && gameState.mode === 'cursor') {
    setMessage(`${enemy.name} · ${enemy.hp}/${enemy.maxHp} HP · ${AI_LABELS[enemy.ai]}`);
  } else if (enemy && gameState.mode === 'attack') {
    const terrain = getTerrain(activeLevel, enemy.x, enemy.z);
    const hitRate = getHitRate(player, enemy, terrain);
    const advantage = getTriangleAdvantage(player.weapon, enemy.weapon);
    const arrow = advantage > 0 ? ' ▲ Weapon advantage' : advantage < 0 ? ' ▼ Weapon disadvantage' : '';
    setMessage(`${enemy.name} · ${hitRate}% displayed Hit${arrow} · Space / Enter to attack`);
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
  if (checkDefeatAllVictory() || checkEscapeObjective()) return;
  if (playerTeam.every((unit) => unit.hp <= 0 || unit.acted)) void endPlayerPhase();
  else void runTutorials();
}

function cyclePlayerUnits() {
  const availableUnits = playerTeam.filter((unit) => unit.hp > 0 && !unit.acted);
  if (!availableUnits.length) {
    setMessage('All available units have acted this turn.');
    return;
  }
  if (gameState.selected) {
    setMessage('Finish or cancel the current unit first.');
    return;
  }

  const currentIndex = availableUnits.findIndex(
    (unit) => unit.x === cursor.x && unit.z === cursor.z,
  );
  const nextUnit = availableUnits[(currentIndex + 1) % availableUnits.length];
  cursor.x = nextUnit.x;
  cursor.z = nextUnit.z;
  showTileInspection(cursor.x, cursor.z);
  player = nextUnit;
  setMessage(`${nextUnit.name} highlighted. Press Enter to select.`);
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
  movementRange = getMovementRange(player, activeLevel, movementObstacles(), playerTeam);
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
  const path = findPath(player, [destination], blocked, activeLevel);
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
  movementRange = getMovementRange(player, activeLevel, movementObstacles(), playerTeam);
  gameState.mode = 'move';
  setMessage('Move undone. Choose a different destination or press Escape for actions.');
  renderTacticalUi();
}

function startAttack() {
  if (!gameState.selected || player.acted || !canAttack(player)) return;
  const targets = getAttackTargets(player, enemies);
  gameState.mode = 'attack';
  const firstTile = targets[0] ?? getAttackRangeTiles(player)[0];
  if (firstTile) setCursor(firstTile.x, firstTile.z);
  if (targets.length) {
    const targetTerrain = getTerrain(activeLevel, targets[0].x, targets[0].z);
    setMessage(
      `Blue tiles show range ${weaponRangeLabel(player.weapon)}; red tiles are targets. ${targets[0].name}: ${getHitRate(player, targets[0], targetTerrain)}% Hit · ${getCriticalRate(player, targets[0])}% Critical.`,
    );
  } else {
    setMessage(`Blue tiles show range ${weaponRangeLabel(player.weapon)}. No enemies are in range; move closer or press Escape.`);
  }
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
      if (label === 'Weapon' && opponent) {
        const advantage = getTriangleAdvantage(unit.weapon, opponent.weapon);
        if (advantage) {
          const arrow = document.createElement('span');
          arrow.className = `triangle-arrow ${advantage > 0 ? 'advantage' : 'disadvantage'}`;
          arrow.textContent = advantage > 0 ? ' ▲' : ' ▼';
          arrow.title = advantage > 0 ? 'Weapon triangle advantage' : 'Weapon triangle disadvantage';
          detail.append(arrow);
        }
      }
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

async function playAttackAnimation(unit, direction, followUp = false, staff = false) {
  if (followUp) await wait(1000);
  
  const textures = unitTextures(unit);
  const firearm = !staff && unit.weapon?.type === 'Gun' && textures.firearm?.[direction]?.length > 0;
  const kind = staff ? 'staff' : firearm ? 'firearm' : 'attack';
  const frames = textures[kind]?.[direction];
  if (frames && frames.length > 0) {
    const swingFrame = Math.floor(frames.length / 2);
    for (let frameIndex = 0; frameIndex < frames.length; frameIndex++) {
      if (frameIndex === swingFrame && !staff) playWeaponSwing(unit.weapon);
      unit.attackAnimation = { direction, frameIndex, kind };
      await wait(characterSprites.animationFrameDuration * 1000);
    }
  } else if (!staff) {
    playWeaponSwing(unit.weapon);
    await wait(300);
  }
  unit.attackAnimation = undefined;
  setIdleSprite(unit, direction);
}

async function showExperienceProgression(progression, amount, unit = player) {
  await experienceDisplay.showGain({
    level: progression.previousLevel,
    experience: progression.previousExperience,
    amount,
    levelUps: progression.levelUps,
    finalLevel: unit.level,
    finalExperience: unit.experience,
  });
  if (progression.levelUps) {
    await levelUpDialogUi.show(unit, progression.growthRolls);
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
  spendWeaponUse(player);
  player.facing = getFacing(target.x - player.x, target.z - player.z);
  player.moveOrigin = null;
  gameState.mode = 'combat';
  cursorOutline.visible = false;
  combatants.add(player);
  combatants.add(target);
  tutorialProgress.combatSeen = true;
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
  const rankUps = [];
  // Strikes alternate: attacker, then defender's counter, then the next pair.
  const counterRange = distanceBetween(target.x, target.z, player.x, player.z);
  const canCounter = isInWeaponRange(target, player, counterRange);
  let counterDamage = 0;
  let counterCriticalDamage = 0;
  let counterAttackCount = 0;
  let counterResults = [];
  if (canCounter) {
    target.facing = getFacing(player.x - target.x, player.z - target.z);
    setIdleSprite(target);
    const counterTerrain = getTerrain(activeLevel, player.x, player.z);
    counterDamage = getCombatDamage(target, player, counterTerrain);
    counterCriticalDamage = getCriticalDamage(target, player, counterTerrain);
    counterAttackCount = getAttackCount(target, player);
    const counterHitRate = getHitRate(target, player, counterTerrain);
    const counterCriticalRate = getCriticalRate(target, player);
    counterResults = Array.from({ length: counterAttackCount }, () => {
      const hit = rollHit(counterHitRate);
      return { hit, critical: hit && rollCritical(counterCriticalRate) };
    });
  }

  const rounds = Math.max(playerAttackCount, counterAttackCount);
  for (let round = 0; round < rounds && target.hp > 0 && player.hp > 0; round++) {
    if (round < playerAttackCount) {
      setMessage(`${player.name} attacks ${target.name} (${round + 1}/${playerAttackCount}).`);
      await attack(player.facing, round > 0);
      const result = playerStrikeResults[round];
      if (result.hit) {
        playerHits++;
        recordWeaponHit(player, rankUps);
        if (result.critical) playerCriticalHits++;
        const strikeDamage = Math.min(target.hp, result.critical ? criticalDamage : damage);
        target.hp -= strikeDamage;
        playerTotalDamage += strikeDamage;
        showCombatResult(target, `-${strikeDamage}`, result.critical ? 'critical' : 'hit');
      } else {
        showCombatResult(target, 'MISS', 'miss');
      }
      await wait(400);
      if (target.hp === 0) break;
    }
    if (round < counterAttackCount) {
      setMessage(`${target.name} retaliates against ${player.name} (${round + 1}/${counterAttackCount}).`);
      await attackEnemy(target, round > 0);
      const result = counterResults[round];
      if (result.hit) {
        const strikeDamage = Math.min(player.hp, result.critical ? counterCriticalDamage : counterDamage);
        player.hp -= strikeDamage;
        showCombatResult(player, `-${strikeDamage}`, result.critical ? 'critical' : 'hit');
      } else {
        showCombatResult(player, 'MISS', 'miss');
      }
      await wait(400);
      renderTacticalUi();
    }
  }

  if (target.hp === 0) {
    scene.remove(target.mesh);
    enemies = enemies.filter((enemy) => enemy !== target);
    const experienceGained = getCombatExperience(target, true);
    const progression = awardExperience(player, experienceGained);
    await showExperienceProgression(progression, experienceGained);
    await collectEnemyDrop(target, player);
    setMessage(withRankUps(`${player.name} defeats ${target.name}${target.isBoss ? ' (Boss)' : ''} (${playerHits}/${playerAttackCount} hits${playerCriticalHits ? `, ${playerCriticalHits} critical` : ''}, +${experienceGained} EXP${progression?.levelUps ? `, Level ${player.level}!` : ''}).`, rankUps));
    player.acted = true;
    gameState.mode = 'unit';
    finishUnit();
    return;
  }
  if (player.hp <= 0) {
    if (playerTeam.every((unit) => unit.hp <= 0)) {
      completeGameOver();
      return;
    }
    const fallen = player;
    player = playerTeam.find((unit) => unit.hp > 0);
    gameState.mode = 'cursor';
    gameState.selected = false;
    movementRange.clear();
    cursorOutline.visible = true;
    setCursor(player.x, player.z);
    setMessage(`${fallen.name} has fallen in battle.`);
    renderTacticalUi();
    if (playerTeam.every((unit) => unit.hp <= 0 || unit.acted)) void endPlayerPhase();
    return;
  }
  
  const experienceGained = getCombatExperience(target, false);
  const progression = awardExperience(player, experienceGained);
  await showExperienceProgression(progression, experienceGained);
  setMessage(withRankUps(`${player.name} hits ${target.name} ${playerHits}/${playerAttackCount} times${playerCriticalHits ? ` (${playerCriticalHits} critical)` : ''} (${hitRate}% Hit, ${playerTotalDamage} damage, +${experienceGained} EXP).`, rankUps));
  
  player.acted = true;
  gameState.mode = 'unit';
  finishUnit();
}

function recordWeaponHit(unit, rankUps) {
  const rank = awardWeaponExp(unit, unit.weapon);
  if (rank) rankUps.push(`${unit.name}'s ${unit.weapon.type} level rose to ${rank.id}!`);
}

function withRankUps(message, rankUps) {
  return rankUps.length ? `${message} ${rankUps.join(' ')}` : message;
}

// Tiles an enemy can stop on this turn. Stationary enemies never leave their tile.
function getEnemyReach(enemy) {
  if (enemy.ai === 'stationary') return new Map([[tileKey(enemy.x, enemy.z), 0]]);
  return getMovementRange(
    enemy,
    activeLevel,
    playerTeam.filter((unit) => unit.hp > 0),
    enemies.filter((other) => other !== enemy),
  );
}

// Walkable tiles the enemy could hit from any reachable tile, excluding the reachable tiles themselves.
function getEnemyThreatTiles(enemy, reach) {
  const threat = new Map();
  for (const key of reach.keys()) {
    const [originX, originZ] = key.split(',').map(Number);
    for (let z = originZ - enemy.weapon.maxRange; z <= originZ + enemy.weapon.maxRange; z++) {
      for (let x = originX - enemy.weapon.maxRange; x <= originX + enemy.weapon.maxRange; x++) {
        const tile = tileKey(x, z);
        if (
          !reach.has(tile) && !threat.has(tile) &&
          isWalkable(activeLevel, x, z) &&
          isInWeaponRange(enemy, enemy, distanceBetween(originX, originZ, x, z))
        ) threat.set(tile, { x, z });
      }
    }
  }
  return [...threat.values()];
}

// Picks who an enemy attacks this turn; null means it holds position.
function chooseEnemyTarget(enemy, livingTeam) {
  const reach = [...getEnemyReach(enemy).keys()].map((key) => key.split(',').map(Number));
  const attackable = livingTeam.filter((unit) =>
    reach.some(([x, z]) => isInWeaponRange(enemy, unit, distanceBetween(x, z, unit.x, unit.z))));
  if (attackable.length) {
    const damageTo = (unit) => getCombatDamage(enemy, unit, getTerrain(activeLevel, unit.x, unit.z));
    return attackable.reduce((best, unit) => {
      const difference = damageTo(unit) - damageTo(best);
      if (difference !== 0) return difference > 0 ? unit : best;
      return unit.hp < best.hp ? unit : best;
    });
  }
  if (enemy.ai !== 'mobile') return null;
  return livingTeam.reduce((nearest, unit) =>
    distanceBetween(enemy.x, enemy.z, unit.x, unit.z) < distanceBetween(enemy.x, enemy.z, nearest.x, nearest.z)
      ? unit : nearest);
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
    const livingTeam = playerTeam.filter((unit) => unit.hp > 0);
    if (!livingTeam.length) break;
    const foe = chooseEnemyTarget(enemy, livingTeam);
    if (!foe) continue;
    cameraFollowTarget = enemy.mesh.position;
    await wait(500);
    if (enemy.ai !== 'stationary' &&
        !isInWeaponRange(enemy, foe, distanceBetween(enemy.x, enemy.z, foe.x, foe.z))) {
      const blocked = new Set(livingTeam.map((other) => tileKey(other.x, other.z)));
      const occupied = new Set(enemies
        .filter((other) => other !== enemy)
        .map((other) => tileKey(other.x, other.z)));
      const attackPositions = [];
      for (let z = foe.z - enemy.weapon.maxRange; z <= foe.z + enemy.weapon.maxRange; z++) {
        for (let x = foe.x - enemy.weapon.maxRange; x <= foe.x + enemy.weapon.maxRange; x++) {
          if (
            isInWeaponRange(
              enemy,
              foe,
              distanceBetween(x, z, foe.x, foe.z),
            ) &&
            isWalkable(activeLevel, x, z) &&
            !blocked.has(tileKey(x, z)) &&
            !occupied.has(tileKey(x, z))
          ) {
            attackPositions.push({ x, z });
          }
        }
      }
      const path = findPath(enemy, attackPositions, blocked, activeLevel);
      if (path.length > 1) {
        let stop = 0;
        for (let spent = 0; stop < path.length - 1; stop++) {
          spent += terrainMoveCost(activeLevel, path[stop + 1].x, path[stop + 1].z);
          if (spent > enemy.movement) break;
        }
        while (stop > 0 && occupied.has(tileKey(path[stop].x, path[stop].z))) stop--;
        const destination = path[stop];
        const movementPath = path.slice(0, stop + 1);
        if (stop > 0) {
          enemyMovement = {
            enemy,
            path: movementPath,
            startedAt: clock.elapsedTime,
            duration: Math.max(0.35, (movementPath.length - 1) * 0.22),
          };
          await wait(enemyMovement.duration * 1000);
          enemyMovement = undefined;
          setIdleSprite(enemy);
          enemy.x = destination.x;
          enemy.z = destination.z;
          enemy.mesh.position.set(
            worldX(enemy.x),
            unitSpriteHeightAt(enemy.x, enemy.z),
            worldZ(enemy.z),
          );
        }
      }
    }
    const range = distanceBetween(enemy.x, enemy.z, foe.x, foe.z);
    if (isInWeaponRange(enemy, foe, range)) {
      enemy.facing = getFacing(foe.x - enemy.x, foe.z - enemy.z);
      setIdleSprite(enemy);
      gameState.mode = 'combat';
      combatants.add(enemy);
      combatants.add(foe);
      tutorialProgress.combatSeen = true;
      renderTacticalUi();
      const terrain = getTerrain(activeLevel, foe.x, foe.z);
      const damage = getCombatDamage(enemy, foe, terrain);
      const criticalDamage = getCriticalDamage(enemy, foe, terrain);
      const attacks = getAttackCount(enemy, foe);
      const hitRate = getHitRate(enemy, foe, terrain);
      const criticalRate = getCriticalRate(enemy, foe);
      let hits = 0;
      let criticalHits = 0;
      let totalDamage = 0;
      const strikeResults = Array.from({ length: attacks }, () => {
        const hit = rollHit(hitRate);
        return { hit, critical: hit && rollCritical(criticalRate) };
      });
      
      // Strikes alternate: enemy, then the player's counter, then the next pair.
      const counterRange = distanceBetween(enemy.x, enemy.z, foe.x, foe.z);
      const canCounter = isInWeaponRange(foe, enemy, counterRange);
      const counterTerrain = getTerrain(activeLevel, enemy.x, enemy.z);
      const counterAttacks = canCounter ? getAttackCount(foe, enemy) : 0;
      const counterDamage = canCounter ? getCombatDamage(foe, enemy, counterTerrain) : 0;
      const counterCriticalDamage = canCounter ? getCriticalDamage(foe, enemy, counterTerrain) : 0;
      const counterHitRate = canCounter ? getHitRate(foe, enemy, counterTerrain) : 0;
      const counterCriticalRate = canCounter ? getCriticalRate(foe, enemy) : 0;
      if (canCounter) {
        foe.facing = getFacing(enemy.x - foe.x, enemy.z - foe.z);
        spendWeaponUse(foe);
      }
      const counterResults = Array.from({ length: counterAttacks }, () => {
        const hit = rollHit(counterHitRate);
        return { hit, critical: hit && rollCritical(counterCriticalRate) };
      });
      let counterHitCount = 0;
      let counterCriticalCount = 0;
      let counterTotalDamage = 0;
      const rankUps = [];

      const rounds = Math.max(attacks, counterAttacks);
      for (let round = 0; round < rounds && foe.hp > 0 && enemy.hp > 0; round++) {
        if (round < attacks) {
          await playAttackAnimation(enemy, enemy.facing, round > 0);
          const result = strikeResults[round];
          if (result.hit) {
            hits++;
            if (result.critical) criticalHits++;
            const strikeDamage = Math.min(foe.hp, result.critical ? criticalDamage : damage);
            foe.hp -= strikeDamage;
            totalDamage += strikeDamage;
            showCombatResult(foe, `-${strikeDamage}`, result.critical ? 'critical' : 'hit');
          } else {
            showCombatResult(foe, 'MISS', 'miss');
          }
          await wait(400);
          renderTacticalUi();
          if (foe.hp <= 0) break;
        }
        if (round < counterAttacks) {
          setMessage(`${foe.name} counters ${enemy.name} (${round + 1}/${counterAttacks}).`);
          await playAttackAnimation(foe, foe.facing, round > 0);
          const result = counterResults[round];
          if (result.hit) {
            counterHitCount++;
            recordWeaponHit(foe, rankUps);
            if (result.critical) counterCriticalCount++;
            const strikeDamage = Math.min(enemy.hp, result.critical ? counterCriticalDamage : counterDamage);
            enemy.hp -= strikeDamage;
            counterTotalDamage += strikeDamage;
            showCombatResult(enemy, `-${strikeDamage}`, result.critical ? 'critical' : 'hit');
          } else {
            showCombatResult(enemy, 'MISS', 'miss');
          }
          await wait(350);
        }
      }
      setMessage(hits === 0
        ? `${enemy.name} misses ${foe.name} (${hitRate}% Hit).`
        : `${enemy.name} hits ${foe.name} ${hits}/${attacks} times${criticalHits ? ` (${criticalHits} critical)` : ''} (${hitRate}% Hit, ${totalDamage} damage).`);
      renderTacticalUi();
      if (foe.hp <= 0) {
        foe.mesh.visible = false;
        foe.acted = true;
      }
      if (playerTeam.every((unit) => unit.hp <= 0)) {
        completeGameOver();
        return;
      }

      if (canCounter && foe.hp > 0) {
        if (enemy.hp === 0) {
          scene.remove(enemy.mesh);
          enemies = enemies.filter((unit) => unit !== enemy);
          const experienceGained = getCombatExperience(enemy, true);
          const progression = awardExperience(foe, experienceGained);
          await showExperienceProgression(progression, experienceGained, foe);
          await collectEnemyDrop(enemy, foe);
          setMessage(withRankUps(
            `${foe.name} counters and defeats ${enemy.name}${enemy.isBoss ? ' (Boss)' : ''} (${counterHitCount}/${counterAttacks} hits${counterCriticalCount ? `, ${counterCriticalCount} critical` : ''}, ${counterTotalDamage} damage, +${experienceGained} EXP${progression.levelUps ? `, Level ${foe.level}!` : ''}).`,
            rankUps,
          ));
        } else {
          const experienceGained = getCombatExperience(enemy, false);
          const progression = awardExperience(foe, experienceGained);
          await showExperienceProgression(progression, experienceGained, foe);
          setMessage(withRankUps(counterHitCount > 0
            ? `${foe.name} counters ${enemy.name} ${counterHitCount}/${counterAttacks} times (${counterTotalDamage} damage, +${experienceGained} EXP).`
            : `${foe.name} misses the counterattack against ${enemy.name} (+${experienceGained} EXP).`, rankUps));
        }
      }
      gameState.mode = 'cursor';
      renderTacticalUi();
    } else {
      setMessage(`${enemy.name} advances across the ships.`);
    }
  }
  if (checkDefeatAllVictory()) return;
  gameState.turn++;
  gameState.phase = 'player';
  for (const unit of playerTeam) {
    unit.moved = false;
    unit.acted = false;
    unit.moveOrigin = null;
  }
  player = playerTeam.find((unit) => unit.hp > 0) ?? player;
  gameState.mode = 'cursor';
  gameState.selected = false;
  cameraFollowTarget = undefined;
  cursor.x = player.x;
  cursor.z = player.z;
  cursorOutline.visible = true;
  setCursor(player.x, player.z);
  const reinforcementResult = spawnTurnReinforcements();
  if (reinforcementResult.error) {
    console.error('Unable to spawn chapter reinforcements:', reinforcementResult.error);
    setLevelStatus(`Could not spawn reinforcements: ${reinforcementResult.error.message}`, true);
    setMessage(reinforcementResult.error.message);
  } else if (reinforcementResult.units.length) {
    const boss = reinforcementResult.units.find((unit) => unit.isBoss);
    setMessage(boss
      ? `${boss.name} has arrived with reinforcements!`
      : `${reinforcementResult.units.length} Merfolk reinforcements have arrived!`);
  }
  showPhaseBanner('Player', gameState.turn);
  renderTacticalUi();
  window.setTimeout(() => void runTutorials(), 1300);
}

function spawnTurnReinforcements() {
  const createdUnits = [];
  const occupied = new Set(
    [...playerTeam, ...enemies]
      .filter((unit) => unit.hp > 0)
      .map((unit) => tileKey(unit.x, unit.z)),
  );
  for (const wave of activeLevel.reinforcements) {
    if (wave.turn > gameState.turn || wave.spawned) continue;
    while (wave.spawnedCount < wave.units.length) {
      const placement = wave.units[wave.spawnedCount];
      const candidates = [];
      for (let z = 0; z < activeLevel.height; z++) {
        for (let x = 0; x < activeLevel.width; x++) {
          if (isWalkable(activeLevel, x, z) && !occupied.has(tileKey(x, z))) {
            candidates.push({ x, z });
          }
        }
      }
      candidates.sort((first, second) =>
        distanceBetween(first.x, first.z, placement.x, placement.z) -
        distanceBetween(second.x, second.z, placement.x, placement.z));
      const [spawnTile] = candidates;
      if (!spawnTile) {
        return {
          units: createdUnits,
          error: new Error(`No open tile is available for ${placement.id} reinforcements.`),
        };
      }
      const unit = createEnemy(spawnTile.x, spawnTile.z, placement.id, placement);
      enemies.push(unit);
      occupied.add(tileKey(unit.x, unit.z));
      wave.spawnedCount++;
      createdUnits.push(unit);
    }
    wave.spawned = true;
  }
  return { units: createdUnits, error: null };
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
  if (checkDefeatAllVictory()) return;
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
    setMessage(`${player.name} deselected. Move the cursor and press Enter to select that unit.`);
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
    if (enemy) openEnemyMenu(enemy);
    else if (playerUnitAt(cursor.x, cursor.z)) {
      player = playerUnitAt(cursor.x, cursor.z);
      selectMaria();
    } else openOptionsMenu();
  } else if (gameState.mode === 'move') {
    if (cursor.x === player.x && cursor.z === player.z) openMariaActions();
    else confirmMove();
  }
  else if (gameState.mode === 'attack') {
    const target = findEnemyAt(enemies, cursor.x, cursor.z);
    if (target) showCombatForecast(target);
    else setMessage(`Choose a red target tile within weapon range ${weaponRangeLabel(player.weapon)}, or press Escape.`);
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
    selectableMeshes(),
    false,
  ).find((hit) => hit.uv && hit.uv.x > 0.3 && hit.uv.x < 0.7 && hit.uv.y < 0.9);
  const point = spriteHit
    ? spriteHit.object.position
    : pickFloorPoint(pointerRaycaster.ray);
  if (!point) return;
  const hitUnit = spriteHit ? unitForMesh(spriteHit.object) : null;
  const x = hitUnit ? hitUnit.x : Math.floor(point.x + activeLevel.width / 2);
  const z = hitUnit ? hitUnit.z : Math.floor(point.z + activeLevel.height / 2);
  if (x < 0 || x >= activeLevel.width || z < 0 || z >= activeLevel.height) return;
  setCursor(x, z);
  if (gameState.mode === 'cursor') {
    if (playerUnitAt(x, z)) {
      player = playerUnitAt(x, z);
      selectMaria();
    } else if (spriteHit) {
      const enemy = enemies.find((unit) => unit.mesh === spriteHit.object);
      if (enemy) openEnemyMenu(enemy);
    } else {
      openOptionsMenu();
    }
  } else if (gameState.mode === 'move') {
    if (hitUnit === player) {
      openMariaActions();
    } else {
      confirmMove();
    }
  } else if (gameState.mode === 'attack') {
    const target = findEnemyAt(enemies, cursor.x, cursor.z);
    if (target) showCombatForecast(target);
    else setMessage(`Choose a red target tile within weapon range ${weaponRangeLabel(player.weapon)}, or press Escape.`);
  }
}

document.querySelector('#attack-action').addEventListener('click', startAttack);
document.querySelector('#inventory-action').addEventListener('click', openInventory);
document.querySelector('#trade-action').addEventListener('click', openTrade);
document.querySelector('#trade-close').addEventListener('click', closeTrade);
document.querySelector('#heal-action').addEventListener('click', openHeal);
document.querySelector('#heal-close').addEventListener('click', closeHeal);
healDialog.addEventListener('cancel', (event) => {
  event.preventDefault();
  closeHeal();
});
tradeDialog.addEventListener('cancel', (event) => {
  event.preventDefault();
  closeTrade();
});
document.querySelector('#confirm-combat').addEventListener('click', confirmCombatForecast);
document.querySelector('#cancel-combat').addEventListener('click', cancelCombatForecast);
document.querySelector('#profile-action').addEventListener('click', openCharacterProfile);
document.querySelector('#finish-action').addEventListener('click', finishUnit);
visitActionButton.addEventListener('click', () => void visitHouse());
chestActionButton.addEventListener('click', () => void openChest());
backActionButton.addEventListener('click', () => {
  if (player.moveOrigin && player.moved && !player.acted) undoMove();
  else cancelAction();
});
document.querySelector('#close-profile').addEventListener('click', () => profileDialog.close());
document.querySelector('#enemy-menu-profile').addEventListener('click', () => {
  enemyMenuDialog.close();
  openEnemyProfile(menuEnemy);
});
document.querySelector('#enemy-menu-inventory').addEventListener('click', () => {
  enemyMenuDialog.close();
  openEnemyInventory(menuEnemy);
});
document.querySelector('#enemy-menu-close').addEventListener('click', () => enemyMenuDialog.close());
document.querySelector('#enemy-inventory-close').addEventListener('click', () => enemyInventoryDialog.close());
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
document.querySelector('#next-chapter').addEventListener('click', () => {
  if (showingPartOneVictory) showTerminalScreen('victory', '', { ending: true });
  else void startNextChapter();
});
document.querySelector('#terminal-main-menu').addEventListener('click', returnToMainMenu);
const oceanToggle = document.querySelector('#toggle-ocean-sound');
onOceanSoundChange((on) => {
  oceanToggle.textContent = `Ocean Sound: ${on ? 'On' : 'Off'}`;
  oceanToggle.setAttribute('aria-pressed', String(on));
});
oceanToggle.addEventListener('click', () => setOceanSoundEnabled(!isOceanSoundEnabled()));
initializeOceanSound();
const tutorialToggle = document.querySelector('#toggle-tutorials');
function renderTutorialToggle() {
  tutorialToggle.textContent = `Tutorial Popups: ${tutorialsEnabled() ? 'On' : 'Off'}`;
  tutorialToggle.setAttribute('aria-pressed', String(tutorialsEnabled()));
}
renderTutorialToggle();
tutorialToggle.addEventListener('click', () => {
  setTutorialsEnabled(!tutorialsEnabled());
  renderTutorialToggle();
});
document.querySelector('#options-restart').addEventListener('click', () => {
  if (!window.confirm('Restart this chapter? Progress in it will be lost.')) return;
  closeOptionsMenu();
  restartLevel();
});
initializeUiSounds();
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
    selectableMeshes(),
    false,
  )[0];
  pointerHoveredUnit = unitHit
    ? unitForMesh(unitHit.object)
    : null;
  updateUnitHoverCard();
  const point = pickFloorPoint(pointerRaycaster.ray);
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
document.querySelector('#options-end-phase').addEventListener('click', () => {
  closeOptionsMenu();
  endPlayerPhase();
});
document.querySelector('#unit-list-close').addEventListener('click', () => unitListDialog.close());
const savedGame = refreshContinueButton();
(savedGame ? continueButton : newGameButton).focus();


// Universal back: closes the top dialog or steps out of the current tactical mode.
let backCtrlPending = false;

function goBack() {
  if (document.querySelector('#level-up-dialog')?.open || itemPopup.open || tutorialPopup.open) return false;
  if (combatForecastDialog.open) {
    cancelCombatForecast();
    return true;
  }
  if (inventoryDialog.open) {
    closeInventory();
    return true;
  }
  if (enemyInventoryDialog.open) {
    enemyInventoryDialog.close();
    return true;
  }
  if (enemyMenuDialog.open) {
    enemyMenuDialog.close();
    return true;
  }
  if (tradeDialog.open) {
    closeTrade();
    return true;
  }
  if (healDialog.open) {
    closeHeal();
    return true;
  }
  if (profileDialog.open) {
    profileDialog.close();
    return true;
  }
  if (unitListDialog.open) {
    unitListDialog.close();
    return true;
  }
  if (optionsDialog.open) {
    closeOptionsMenu();
    return true;
  }
  if (
    !sessionStarted || !mainMenu.hidden || !terminalScreen.hidden || gameState.defeated ||
    gameState.phase !== 'player' || playerMovement
  ) {
    return false;
  }
  if (gameState.mode === 'unit' && gameState.selected && player.moveOrigin && player.moved && !player.acted) {
    undoMove();
    return true;
  }
  if (['unit', 'move', 'attack'].includes(gameState.mode)) {
    cancelAction();
    return true;
  }
  return false;
}

window.addEventListener('contextmenu', (event) => {
  if (!sessionStarted) return;
  event.preventDefault();
  goBack();
});
window.addEventListener('keyup', (event) => {
  if ((event.code === 'ControlLeft' || event.code === 'ControlRight') && backCtrlPending) {
    backCtrlPending = false;
    goBack();
  }
});

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
  if (event.code === 'Escape' || event.code === 'Backspace') {
    if (goBack()) {
      event.preventDefault();
      return;
    }
  }
  if (event.code !== 'ControlLeft' && event.code !== 'ControlRight') backCtrlPending = false;
  else backCtrlPending = true;
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
  if (enemyMenuDialog.open || enemyInventoryDialog.open) return;
  if (itemPopup.open || tutorialPopup.open) return;
  if (inventoryDialog.open) return;
  if (tradeDialog.open || healDialog.open) return;
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
  for (const marker of levelGroup.userData.houseMarkers ?? []) {
    const house = activeLevel.houses.find((entry) => entry.id === marker.userData.houseId);
    marker.visible = Boolean(house) && !house.visited;
    marker.material.opacity = 0.75 + 0.2 * Math.sin(t * 3);
  }
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
      setMessage(`${player.name} moved. You can still attack in range or end their unit turn.`);
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
    const walkFrames = unitTextures(enemy).walking[enemy.facing];
    setUnitSprite(enemy, walkFrames[Math.floor((t - startedAt) / 0.09) % walkFrames.length]);
    enemy.mesh.position.set(
      THREE.MathUtils.lerp(worldX(from.x), worldX(to.x), stepProgress),
      THREE.MathUtils.lerp(
        unitSpriteHeightAt(from.x, from.z),
        unitSpriteHeightAt(to.x, to.z),
        stepProgress),
      THREE.MathUtils.lerp(worldZ(from.z), worldZ(to.z), stepProgress),
    );
  }
  for (const unit of enemies) {
    if (unit.attackAnimation) {
      const { direction, frameIndex } = unit.attackAnimation;
      setUnitSprite(unit, unitTextures(unit).attack[direction]?.[frameIndex]);
    }
  }
  for (let index = hitEffects.length - 1; index >= 0; index--) {
    const effect = hitEffects[index];
    const progress = (t - effect.born) / effect.life;
    if (progress < 0) {
      effect.sprite.visible = false;
      continue;
    }
    effect.sprite.visible = true;
    if (progress >= 1) {
      scene.remove(effect.sprite);
      effect.material.dispose();
      hitEffects.splice(index, 1);
      continue;
    }
    if (effect.velocity) {
      effect.velocity.y -= dt * (effect.gravity ?? 7);
      effect.sprite.position.addScaledVector(effect.velocity, dt);
    } else if (effect.pulse) {
      effect.sprite.scale.setScalar(effect.pulse(progress));
    } else {
      effect.sprite.scale.setScalar(effect.sprite.scale.x + dt * effect.grow * 4);
    }
    effect.material.opacity = effect.opacity ? effect.opacity(progress) : 1 - progress;
  }
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
  const walkingTime = playerMovement ? t - playerMovement.startedAt : t;
  for (const unit of [maria, bartz, cypher, seymour]) {
    const fielded = playerTeam.includes(unit) && unit.hp > 0;
    unit.mesh.visible = fielded;
    unit.blob.visible = fielded;
    if (!fielded) continue;
    const textures = unitTextures(unit);
    const unitMoving = unit === player && moving;
    let sprite = textures.idle[unit.facing];
    if (unit.attackAnimation) {
      sprite = textures[unit.attackAnimation.kind][unit.attackAnimation.direction]?.[unit.attackAnimation.frameIndex] ?? sprite;
    } else if (unitMoving) {
      const walkingFrames = textures.walking[unit.facing];
      sprite = walkingFrames[Math.floor(walkingTime / 0.09) % walkingFrames.length];
    }
    setUnitSprite(unit, sprite);
    const unitX = unit === player ? playerWorldX : worldX(unit.x);
    const unitY = unit === player ? playerWorldY : unitSpriteHeightAt(unit.x, unit.z);
    const unitZ = unit === player ? playerWorldZ : worldZ(unit.z);
    unit.mesh.position.set(unitX, unitY + (unitMoving ? Math.abs(Math.sin(t * 28)) * 0.08 : 0), unitZ);
    unit.blob.position.set(unitX, unitY - UNIT_SPRITE_HEIGHT / 2 - HERO_DECK_HEIGHT + 0.02, unitZ);
  }
  const healthBarMeshes = [...playerTeam, ...enemies].map((unit) => unit.mesh);
  for (const enemy of enemies) {
    const marker = enemy.mesh.userData.dropMarker;
    if (marker) marker.material.opacity = 0.75 + Math.sin(t * 4) * 0.25;
  }
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
  if (activeLevel.extendSides) {
    // Keep the view over the map so the sky edge never drops below the water.
    const limitZ = activeLevel.height / 2 - 3;
    target.z = THREE.MathUtils.clamp(target.z, -limitZ, limitZ);
  }
  const cameraScale = Math.max(0.55, activeLevel.width / 21, activeLevel.height / 19);
  const desired = target.clone().addScaledVector(CAM_OFFSET, cameraScale);
  camera.position.sub(cameraShakeOffset);
  camera.position.lerp(desired, 1 - Math.pow(0.001, dt));
  if (t < cameraShake.until) {
    const falloff = (cameraShake.until - t) / 0.3;
    cameraShakeOffset.set(
      (Math.random() - 0.5) * cameraShake.strength * Math.min(1, falloff),
      (Math.random() - 0.5) * cameraShake.strength * Math.min(1, falloff),
      0,
    );
  } else {
    cameraShakeOffset.set(0, 0, 0);
  }
  camera.position.add(cameraShakeOffset);
  camera.lookAt(target);
  const backdropDistance = 90;
  const backdropDirection = camera.getWorldDirection(new THREE.Vector3());
  const backdropHeight = 2 * backdropDistance * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  nightBackdrop.position.copy(camera.position).addScaledVector(backdropDirection, backdropDistance);
  nightBackdrop.scale.set(backdropHeight * camera.aspect, backdropHeight, 1);
}

setMessage(`WASD / Arrows move · Enter inspects enemies · Select ${player.name} · Click empty tiles for options`);
renderTacticalUi();

// ---------- Main loop ----------

const clock = new THREE.Clock();
function frame() {
  const dt = Math.min(clock.getDelta(), 0.1);
  update(dt, clock.elapsedTime);
  updateLevelAnimation(clock.elapsedTime);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Dev shortcut: ?chapter=2 jumps straight into that chapter with a fresh Maria;
// add &save=1 to bring along the roster and convoy from the current browser save.
const requestParams = new URLSearchParams(window.location.search);
const requestedChapter = Number(requestParams.get('chapter'));
if (Number.isInteger(requestedChapter) && requestedChapter >= 2 && requestedChapter <= CHAPTER_COUNT) {
  let carry = serializeUnit(createMaria());
  if (requestParams.get('save') === '1') {
    try {
      const save = readSave();
      if (save) carry = { ...save.player, allies: save.allies ?? [], convoy: save.convoy ?? [] };
    } catch (error) {
      console.error('Could not load save for chapter shortcut:', error);
    }
  }
  startLevel(await loadChapterLevel(requestedChapter - 1), {
    chapter: requestedChapter - 1,
    carry,
  });
}
