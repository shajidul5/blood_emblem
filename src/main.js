import * as THREE from 'three';
import {
  getAttackCount,
  getAvailableStrikeCount,
  getCombatStrikeOrder,
  healDamageDealt,
  getStrikesPerAttack,
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
import { createArlanAlly, createBartzAlly, createCorvisAlly, createCypherAlly, createEnemyUnit, createEvelineAlly, createLenaAlly, createLinusAlly, createMaria, createRictorAlly, createSeymourAlly, createStarkAlly, createTroyAlly, createVillager, isBossEnemy } from './characters/characters.js';
import { createExperienceDisplay } from './characters/experience-display.js';
import { applyClass, canEquipWeapon, equipBlockReason, canPromote, getClassAbilities, promoteUnit, getUsesMultiplier, getStaffRangeBonus, weaponSpriteSet } from './characters/classes.js';
import { awardWeaponExp } from './characters/weapon-levels.js';
import { createLevelUpDialog } from './characters/level-up-dialog.js';
import { createRankUpDialog } from './characters/rank-up-dialog.js';
import { createPromotionDialog, snapshotForPromotion } from './characters/promotion-dialog.js';
import { createItemPopup } from './characters/item-popup.js';
import { CHAPTER_INTROS, createTutorialPopup, PART_ONE_ENDING, PART_TWO_ENDING, setTutorialsEnabled, TRIANGLE_EFFECTS, tutorialsEnabled } from './game/tutorial.js';
import { awardExperience } from './characters/progression.js';
import { createProfileDialog, portraitUrl } from './characters/profile-dialog.js';
import { initializeUiSounds } from './audio/ui-sounds.js';
import { playBloodBeastRoar, playDoorCreak, playGateRumble, playHitImpact, playMissWhiff, playWeaponSwing } from './audio/combat-sounds.js';
import {
  attackWeapons, equipAttackWeapon, bookOf, carriedWeapons, convoy, copyEntry, findWeaponEntry, grantItem, INVENTORY_ITEMS, isSpellUnlocked, MAX_INVENTORY_SIZE, maxUsesFor, refreshMagicUses,
  rescaleMagicUses, restoreMariaInventory, setConvoy, spellUses, spendWeaponUse, syncSpellbooks, unlockedSpellsOf, weaponUseBlockReason,
} from './characters/inventory.js';
import {
  addInsight, bloodEmblemDescription, BOSS_INSIGHT, FIRST_PREP_CHAPTER, getInsight, healBloodEmblemKill,
  isBloodEmblemEquipped, isBloodEmblemUpgraded, restoreInsight, snapshotInsight, toggleBloodEmblem,
} from './game/insight.js';
import { createPrepMenu } from './game/prep-menu.js';
import { constrainCityCamera, constrainInteriorCamera, constrainStreetCamera, TACTICAL_FOV } from './game/camera-bounds.js';
import { renderInsightLabel } from './game/insight-display.js';
import { gateVictoryReady, planGateRavens, shouldSpawnGateBeast } from './game/gate-encounter.js';
import { claimInfirmaryCompletion, finishInfirmaryEnemyPhase, freshInfirmary, infirmaryActions, infirmaryApproachTarget, infirmaryBreached, infirmarySpawnTile, infirmaryVictoryReady, infirmaryWarning, infirmaryWaveSealed, performInfirmaryAction } from './game/infirmary.js';
import { canRecruitLinus, escortPath, freshRescueState, isActiveVillager, rescueProgress, rescueRewardIds } from './game/rescue.js';
import { canRecruitEveline, recruitEveline, freshStreets, streetWarning, streetsVictoryReady } from './game/streets.js';
import { canSteal, stealableItems, stealItem } from './game/stealing.js';
import { canRecruitCorvis, recruitCorvis, courtyardVictoryReady, freshCourtyard, triggerProgressWaves, courtyardWaveEnabled } from './game/courtyard.js';
import { advanceCathedralStory, CATHEDRAL_ELEVATIONS, cathedralWaveEnabled, freshCathedral } from './game/cathedral.js';
import { advanceBellYardStory, bellYardVictoryReady, canReunite, dueDepartures, freshBellYard, planWagonMove } from './game/bell-yard.js';
import { availableBeacon, extinguishBeacon, freshShore, shoreVictoryReady } from './game/starless-shore.js';
import { activateMechanism, availableMechanism, cityTideWarning, freshWaitingCity, prepareCityPulse, resolveCityPulse, waitingCityVictoryReady } from './game/waiting-city.js';
import { advanceThroneStory, freshAbyssalThrone, isBenedictionTurn, performBenediction,
  prepareForetoldRuin, resolveForetoldRuin } from './game/abyssal-throne.js';
import { chooseEnemyStaffAction, freezeHitRate, freezeRange, healStaffRange, useEnemyStaff } from './game/enemy-staves.js';
import { loadCharacterSprites } from './characters/animation-loader.js';
import { unitSpriteScale } from './characters/sprite-size.js';
import { throneFloorElevations } from './levels/throne-terraces.js';
import {
  SAVE_SLOT_COUNT, copyCurrentSaveToSlot, createSaveData, describeSaveSlot, loadSlotIntoCurrentSave,
  exportSaveFile, importSaveFile, parseSave, readSave, serializeUnit, writeSave,
} from './game/save.js';
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
  setOceanAmbienceGain,
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

const insightLabel = document.querySelector('#insight-label');

function refreshInsightLabel() {
  renderInsightLabel(insightLabel, `Insight: ${getInsight()}`);
  insightLabel.hidden = currentChapter === null || currentChapter < FIRST_PREP_CHAPTER;
}

function gainInsight(amount, source) {
  addInsight(amount);
  refreshInsightLabel();
  insightLabel.classList.remove('gain');
  void insightLabel.offsetWidth;
  insightLabel.classList.add('gain');
  setMessage(`Insight +${amount} (${source}).`);
}

// Reading an Insight item (Orsen's Journal) consumes it and pays out its Insight.
function readInsightItem(unit, entry) {
  const item = INVENTORY_ITEMS.get(entry.id);
  const holder = unit ? unit.inventory : convoy;
  const index = holder.indexOf(entry);
  if (index < 0) return;
  holder.splice(index, 1);
  gainInsight(item.insight, item.name);
  saveCurrentGame();
}

async function useInsightFromInventory(entry) {
  readInsightItem(player, entry);
  renderInventory();
  inventoryDialog.querySelector('button:not(:disabled)')?.focus();
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
  if (house.villagerId) {
    const villager = rescueState.villagers.find((unit) => unit.id === house.villagerId);
    if (!villager || !isActiveVillager(villager) || villager.status !== 'sheltered') return;
    house.visited = true;
    villager.status = 'escorting';
    player.acted = true;
    setMessage(`${player.name} reaches ${villager.name}. They will walk to the labeled green refuge on the west edge: up to 3 tiles before each enemy phase, then leave the map safely.`);
    finishUnit();
    return;
  }
  const receipts = Array.from({ length: house.rewardCount ?? 1 }, () => ({ unit: player, ...grantItem(player, house.rewardId) }));
  const { item } = receipts[0];
  const sentToConvoy = receipts.filter((receipt) => receipt.toConvoy).length;
  house.visited = true;
  player.acted = true;
  setMessage(`${player.name} visited ${house.name} and received ${receipts.length > 1 ? `${receipts.length}x ` : ''}${item.name}.${
    sentToConvoy ? ` Inventory overflow: ${sentToConvoy} sent to the convoy.` : ''}`);
  renderTacticalUi();
  await itemPopup.show(receipts);
  if (activeLevel.streets) await tutorialPopup.show(house.id, {}, { force: true });
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
  recruit.mesh.position.set(worldX(recruit.x), unitSpriteHeightAt(recruit.x, recruit.z, recruit), worldZ(recruit.z));
  playerTeam.push(recruit);
  if (!fullTeam.includes(recruit)) fullTeam.push(recruit);
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
  TACTICAL_FOV,
  window.innerWidth / window.innerHeight,
  0.1,
  100,
);
const pointerRaycaster = new THREE.Raycaster();
const pointerPosition = new THREE.Vector2();
const deckPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.11);
const raisedPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

function createNightBackdrop(sunset = false, dusk = false) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not create the night-sky backdrop.');
  const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, dusk ? '#302536' : sunset ? '#7698b6' : '#10182d');
  gradient.addColorStop(0.55, dusk ? '#82544b' : sunset ? '#e9b87f' : '#26304a');
  gradient.addColorStop(1, dusk ? '#c77b4a' : sunset ? '#f49055' : '#51415a');
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  let seed = 120319;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  for (let index = 0; index < (sunset ? 0 : 220); index++) {
    const radius = random() > 0.94 ? 2 : 1;
    context.globalAlpha = 0.35 + random() * 0.65;
    context.fillStyle = random() > 0.35 ? '#e2e8ff' : '#f7d8b1';
    context.beginPath();
    context.arc(random() * canvas.width, random() * canvas.height * 0.78, radius, 0, Math.PI * 2);
    context.fill();
  }
  context.globalAlpha = 1;
  const orbY = sunset ? 330 : 105;
  const moonGlow = context.createRadialGradient(790, orbY, 10, 790, orbY, 105);
  moonGlow.addColorStop(0, sunset ? 'rgba(255, 202, 125, .65)' : 'rgba(217, 229, 255, .42)');
  moonGlow.addColorStop(1, 'rgba(217, 229, 255, 0)');
  context.fillStyle = moonGlow;
  context.fillRect(680, orbY - 105, 220, 220);
  context.fillStyle = sunset ? '#ffe4a0' : '#e1e8f4';
  context.beginPath();
  context.arc(790, orbY, 34, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = 'rgba(95, 111, 143, .25)';
  for (const [x, y, radius] of sunset ? [] : [[778, 94, 5], [803, 113, 7], [785, 122, 3]]) {
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
const sunsetBackdrop = createNightBackdrop(true);
sunsetBackdrop.visible = false;
const duskBackdrop = createNightBackdrop(true, true);
duskBackdrop.visible = false;
let activeBackdrop = nightBackdrop;

// Picks the floor point under the pointer, preferring raised tiles (quarterdeck, stairs) that sit above the main deck.
function pickFloorPoint(ray) {
  const elevations = activeLevel?.abyssalThrone ? throneFloorElevations(activeLevel)
    : activeLevel?.cathedral ? CATHEDRAL_ELEVATIONS : [0.5, 0.25];
  for (const elevation of elevations) {
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

const ambient = new THREE.AmbientLight(0x4a3a66, 0.9);
scene.add(ambient);

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

function applyLevelLighting() {
  const dusk = activeLevel.lighting === 'dusk';
  const sunset = dusk || activeLevel.lighting === 'sunset';
  ambient.color.setHex(dusk ? 0xc59da2 : sunset ? 0xffdfbb : 0x4a3a66);
  ambient.intensity = dusk ? 0.95 : sunset ? 1.5 : 0.9;
  moon.color.setHex(sunset ? 0xffae68 : 0x9fb4ff);
  moon.intensity = dusk ? 1.3 : sunset ? 1.8 : 0.8;
  moon.position.set(sunset ? -18 : -8, sunset ? 10 : 14, 6);
  scene.background.setHex(activeLevel.shore || activeLevel.waitingCity || activeLevel.abyssalThrone ? 0x03070e : dusk ? 0x8e645b : sunset ? 0xe9b87f : 0x0b0710);
  scene.fog.color.copy(scene.background);
  scene.fog.near = activeLevel.shore || activeLevel.waitingCity || activeLevel.abyssalThrone ? 100 : 35;
  scene.fog.far = activeLevel.shore || activeLevel.waitingCity || activeLevel.abyssalThrone ? 220 : 85;
  camera.far = activeLevel.shore || activeLevel.waitingCity || activeLevel.abyssalThrone ? 220 : 100;
  camera.updateProjectionMatrix();
  nightBackdrop.visible = !sunset && !activeLevel.shore && !activeLevel.waitingCity && !activeLevel.abyssalThrone;
  syncThronePresentation();
  sunsetBackdrop.visible = sunset && !dusk;
  duskBackdrop.visible = dusk;
  activeBackdrop = dusk ? duskBackdrop : sunset ? sunsetBackdrop : nightBackdrop;
}

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
const experienceDisplay = createExperienceDisplay(document.querySelector('#exp-panel'));
const levelUpDialogUi = createLevelUpDialog(document.querySelector('#level-up-dialog'));
const pendingRankUps = [];
const weaponTypeIcon = (type) => [...INVENTORY_ITEMS.values()]
  .find((item) => item.itemType === 'weapon' && item.type === type && item.spriteUrl)?.spriteUrl;
const rankUpDialogUi = createRankUpDialog(document.querySelector('#rank-up-dialog'), weaponTypeIcon);
const promotionDialogUi = createPromotionDialog(document.querySelector('#promotion-dialog'));
const itemPopup = createItemPopup(document.querySelector('#item-popup-dialog'));
const tutorialPopup = createTutorialPopup(document.querySelector('#tutorial-dialog'), {
  itemSprite: (id) => INVENTORY_ITEMS.get(id)?.spriteUrl ?? null,
});
// Each story and teaching step shows once per run of the chapter.
const tutorialProgress = { active: false, running: false, intro: true, potion: true, stairs: true, houses: true, combatSeen: false };

function resetTutorials(chapter) {
  Object.assign(tutorialProgress, {
    active: Boolean(CHAPTER_INTROS[chapter]),
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
      const intro = CHAPTER_INTROS[tutorialProgress.chapter];
      await tutorialPopup.show(intro, TRIANGLE_EFFECTS, { force: ['goldenBridge', 'ward', 'infirmary', 'courtyard', 'cathedral', 'bellYard', 'shore', 'waitingCity', 'abyssalThrone'].includes(intro) });
    }
    await showCathedralStory();
    if (activeLevel.bellYard) await showBellYardStory();
    if (activeLevel.abyssalThrone) await showThroneStory();
    if (activeLevel.waitingCity?.opened && !activeLevel.waitingCity.revelationSeen) {
      activeLevel.waitingCity.revelationSeen = true;
      saveCurrentGame();
      await tutorialPopup.show('waitingCity-revelation', {}, { force: true });
    }
    if (activeLevel.shore && !activeLevel.shore.silhouetteSeen && playerTeam.some((unit) => unit.hp > 0 && unit.z <= 12)) {
      activeLevel.shore.silhouetteSeen = true;
      saveCurrentGame();
      await tutorialPopup.show('shore-silhouette', {}, { force: true });
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

let pendingPrep = false;
let prepMenu = null;
let mapViewActive = false;
const MAX_DEPLOYED = 12;
// Every unit available this chapter; playerTeam holds only the ones deployed to fight.
let fullTeam = [];
const MAP_VIEW_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyI', 'KeyR']);

function isDeployed(unit) {
  return playerTeam.includes(unit);
}

function setDeployed(unit, on) {
  if (isRequiredUnit(unit) || on === isDeployed(unit) || (on && playerTeam.length >= MAX_DEPLOYED)) return;
  const next = fullTeam.filter((member) => (member === unit ? on : isDeployed(member)));
  playerTeam.length = 0;
  playerTeam.push(...next);
  player = playerTeam[0];
  setCursor(player.x, player.z);
  renderTacticalUi();
}

function startMapView() {
  mapViewActive = true;
  setCursor(player.x, player.z);
  setMessage('Viewing the map. Move the cursor to look around, I for unit info, R for enemy ranges. Press Esc to return.');
  renderTacticalUi();
}

function endMapView() {
  mapViewActive = false;
  setCursor(player.x, player.z);
  prepMenu.resume();
}

async function openPrepMenu() {
  prepMenu ??= createPrepMenu({
    dialog: document.querySelector('#prep-dialog'),
    getTeam: () => fullTeam,
    isRequired: (unit) => isRequiredUnit(unit),
    getConvoy: () => convoy,
    items: INVENTORY_ITEMS,
    statItems: STAT_ITEM_EFFECTS,
    readInsight: readInsightItem,
    maxSize: MAX_INVENTORY_SIZE,
    maxDeployed: MAX_DEPLOYED,
    settle: settleTradedWeapons,
    isDeployed,
    setDeployed,
    portrait: portraitUrl,
    getInfo: () => ({ chapter: activeLevel.name, objective: objectiveDescription() }),
    onProfile: (unit) => openUnitProfile(unit),
    onPromote: (unit, before) => {
      refreshUnitAppearance(unit);
      void promotionDialogUi.show(unit, before, portraitUrl(unit));
    },
    onSave: () => saveCurrentGame(),
    onOptions: () => openOptionsMenu(),
    onViewMap: startMapView,
    onChange: () => {
      syncSpellbooks(Object.values(roster));
      prepMenu.refresh();
      refreshInsightLabel();
      renderTacticalUi();
      saveCurrentGame();
    },
  });
  await prepMenu.show();
  refreshInsightLabel();
  renderTacticalUi();
}

// Hands the level's starting items to every unit and announces each pickup in turn.
function grantStartingItems(team) {
  const receipts = [];
  for (const itemId of activeLevel.startingItems) {
    for (const unit of team) receipts.push({ unit, ...grantItem(unit, itemId) });
  }
  window.setTimeout(async () => {
    if (pendingPrep) {
      pendingPrep = false;
      await openPrepMenu();
      if (!sessionStarted) return;
      // Restart Chapter resumes from the finished preparations, not the pre-prep roster.
      chapterStart = { ...serializeCarry(), prepared: true, deployed: playerTeam.map((unit) => unit.id) };
      saveCurrentGame();
    }
    await runTutorials();
    if (receipts.length) await itemPopup.show(receipts);
  }, 700);
}
const profileDialogUi = createProfileDialog(profileDialog);
const maria = createMaria();
const cypher = createCypherAlly();
const seymour = createSeymourAlly();
const stark = createStarkAlly();
const linus = createLinusAlly();
const rictor = createRictorAlly();
const lena = createLenaAlly();
const arlan = createArlanAlly();
const troy = createTroyAlly();
const eveline = createEvelineAlly();
const corvis = createCorvisAlly();
let player = maria;
const playerTeam = [maria];
experienceDisplay.reset(player.level, player.experience);
let activeLevel;
let rescueState = null;
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
  geometry.computeBoundingBox();
  return geometry;
}

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
const pinnedEnemyRanges = new Set();
let movementPathMeshes = [];
let movementPathMaterial;

function setLevelStatus(message, isError = false) {
  levelStatus.textContent = message;
  levelStatus.style.color = isError ? '#ed9292' : '#e8d9d9';
}

const initialLevel = await loadInitialLevel(setLevelStatus);
activeLevel = buildLevel(THREE, levelGroup, initialLevel);
applyLevelLighting();
player.x = initialLevel.spawn.x;
player.z = initialLevel.spawn.z;
cursor.x = player.x;
cursor.z = player.z;

// Player
const characterSprites = await loadCharacterSprites();
const unitGeometry = createUnitSpriteGeometry();
const HERO_DECK_HEIGHT = 0.12;
function unitSpriteHeightAt(x, z, unit) {
  const scale = unitSpriteScale(unit, unit.mesh?.material.map ?? unitTextures(unit).idle[unit.facing ?? 'south']);
  return UNIT_SPRITE_HEIGHT * scale / 2 + HERO_DECK_HEIGHT + getTileElevation(activeLevel, x, z) +
    (unit?.type === 'flying' ? 0.85 : 0);
}

function unitTextures(unit) {
  const set = weaponSpriteSet(unit);
  return {
    idle: set === 'highCantorVael' && activeLevel.abyssalThrone && !activeLevel.abyssalThrone.awakened
      ? characterSprites.highCantorVaelSeated : characterSprites[set],
    walking: characterSprites[`${set}WalkingFrames`],
    attack: characterSprites[`${set}AttackFrames`],
    staff: characterSprites[`${set}StaffFrames`],
    firearm: characterSprites[`${set}FirearmFrames`],
  };
}

// Each unit owns its material, so animation is just swapping the texture.
function setUnitSprite(unit, texture) {
  if (!texture) return;
  const scale = unitSpriteScale(unit, texture);
  unit.mesh.position.y += UNIT_SPRITE_HEIGHT * (scale - unit.mesh.scale.x) / 2;
  unit.mesh.scale.set(scale, scale, 1);
  const bar = unit.mesh.userData.healthBar?.group;
  const marker = unit.mesh.userData.dropMarker;
  const top = unit.mesh.geometry.boundingBox.min.y + UNIT_SPRITE_HEIGHT * texture.userData.idleHeightRatio;
  if (bar) {
    bar.scale.set(1 / scale, 1 / scale, 1);
    bar.position.y = top + 0.2 / scale;
  }
  if (marker) marker.position.y = top + 0.5 / scale;
  if (unit.mesh.material.map === texture) return;
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
  const scale = unitSpriteScale(unit, mesh.material.map);
  mesh.scale.set(scale, scale, 1);
  mesh.rotation.copy(SPRITE_TILT);
  mesh.renderOrder = renderOrder;
  mesh.position.set(worldX(unit.x), unitSpriteHeightAt(unit.x, unit.z, unit), worldZ(unit.z));
  scene.add(mesh);
  unit.mesh = mesh;
  addUnitHealthBar(mesh, unit);
  return mesh;
}

// Re-syncs a unit's mesh with its current sprite set (after a promotion or a restored save).
function refreshUnitAppearance(unit) {
  if (!unit.mesh) return;
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
createUnitMesh(stark, 0);
createUnitMesh(linus, 0);
createUnitMesh(rictor, 0);
createUnitMesh(lena, 0);
createUnitMesh(arlan, 0);
createUnitMesh(troy, 0);
createUnitMesh(eveline, 0);
createUnitMesh(corvis, 0);
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
        (isWalkable(activeLevel, x, z, unit) || Boolean(findEnemyAt(enemies, x, z)))
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
  if (!sessionStarted) return false;
  try {
    writeSave(createSaveData(
      activeLevel,
      maria,
      enemies,
      gameState,
      {
        allies: fullTeam.filter((unit) => unit !== maria),
        playerReserve: !fullTeam.includes(maria),
        isBenched: (unit) => !playerTeam.includes(unit),
        convoy,
        chapter: currentChapter,
        chapterStart,
        insight: snapshotInsight(),
        rescue: snapshotRescue(),
      },
    ));
    if (!mainMenu.hidden) menuStatus.textContent = 'Game saved in this browser.';
    return true;
  } catch (error) {
    console.error('Unable to save game:', error);
    setLevelStatus(`Could not save game: ${error.message}`, true);
    menuStatus.textContent = `Could not save game: ${error.message}`;
    return false;
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
  if (activeLevel.abyssalThrone) {
    if (enemies.some((enemy) => enemy.id === activeLevel.abyssalThrone.bossId && enemy.hp > 0)) return false;
    activeLevel.abyssalThrone.ruin = null;
    levelGroup.userData.abyssalThrone?.sync();
    completeVictory('The Last Custodian falls. The Blood Emblem answers the empty seal, and the way into the deep opens.');
    return true;
  }
  if (activeLevel.waitingCity) {
    if (!waitingCityVictoryReady(activeLevel, enemies)) return false;
    activeLevel.waitingCity.pulse = null;
    levelGroup.userData.waitingCity?.sync();
    completeVictory('The Bell-Drowned falls. The ocean withdraws, revealing a stair beneath the ancient city.');
    return true;
  }
  if (activeLevel.shore) {
    if (!shoreVictoryReady(activeLevel, maria, rictor)) return false;
    completeVictory('The offering beacons are silent. Maria and Rictor cross the sea gate into the ancient city.');
    return true;
  }
  if (activeLevel.bellYard) return checkBellYardObjective();
  if (activeLevel.courtyard) return checkCourtyardObjective();
  if (activeLevel.streets) return checkStreetObjective();
  if (activeLevel.infirmary) return false;
  if (activeLevel.objective === 'seize-gate') return checkGateObjective();
  if (activeLevel.objective === 'rescue-villagers') return checkRescueVictory();
  if (activeLevel.objective === 'defeat-boss') {
    if (enemies.some((enemy) => enemy.isBoss)) return false;
    if (activeLevel.reinforcements.some((wave) => !wave.spawned && wave.units.some((unit) => isBossEnemy(unit.id)))) return false;
    completeVictory(activeLevel.cathedral
      ? 'Bishop Aurel Voss falls. The Church requested the Order, concealed the failed treatments, and continued the scourge. Part Three is complete.'
      : 'The boss has fallen. The objective is complete.');
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
  if (level.abyssalThrone) return [
    'Defeat High Cantor Vael - no switches or seals',
    level.abyssalThrone.awakened
      ? isBenedictionTurn(level, gameState.turn) ? 'THIS enemy phase: Benediction instead of attacking'
        : `Benediction in ${3 - gameState.turn % 3} enemy phase(s)`
      : 'Vael waits on the northern throne; he rises at the final stairs',
    level.abyssalThrone.ruin ? 'GOLD tiles: 22 damage next enemy phase - move away!' : 'No Foretold Ruin marked',
    'Maria and Rictor must survive',
  ].join(' · ');
  if (level.waitingCity) {
    const rules = level.waitingCity;
    return [`Mechanisms ${rules.mechanisms.filter((entry) => entry.activated).length}/2`,
      rules.opened ? 'Defeat the Bell-Drowned' : 'Open the central approach',
      rules.pulse ? 'GOLD tiles: 18 damage next enemy phase - move away!' : 'No lanes resonating',
      cityTideWarning(level, gameState.turn),
      'Maria and Rictor must survive'].join(' · ');
  }
  if (level.shore) {
    const lit = level.shore.beacons.filter((beacon) => !beacon.extinguished).length;
    const waves = level.reinforcements.filter((wave) => !wave.spawned);
    const next = waves.length ? Math.min(...waves.map((wave) => wave.turn)) : null;
    return [`Beacons extinguished ${3 - lit}/3`, 'Then Maria AND Rictor reach the northern sea gate',
      next === null ? 'No further summons' : `Summons ${next <= gameState.turn ? 'queued at marked shores' : `on turn ${next}`} (final turn 9)`].join(' · ');
  }
  if (level.bellYard) {
    const rules = level.bellYard;
    const keeper = enemies.some((enemy) => enemy.id === rules.bossId) ? 'Defeat the Lift-Keeper' : 'Lift-Keeper defeated';
    return [keeper, 'then Maria and Rictor board the Bell Lift',
      rules.reunited ? 'Parties reunited' : 'Maria and Rictor: Talk to reunite',
      `Wagons escaped ${rules.escaped}`].join(' · ');
  }
  if (level.cathedral) {
    const incoming = level.reinforcements.filter((wave) => !wave.spawned && cathedralWaveEnabled(level, wave))
      .map((wave) => `Paladins ${wave.turn <= gameState.turn ? 'queued' : `arrive turn ${wave.turn}`}`);
    return ['Defeat Bishop Aurel Voss', 'Three Cathedral tiers', 'Chests optional', ...incoming].join(' · ');
  }
  if (level.courtyard) return 'Defeat General Severin to enter the Cathedral';
  if (level.streets) {
    const recruit = level.streets.recruit;
    return `Rictor must seize the gate controls after Marshal Veyr falls · Eveline ${recruit.recruited ? 'recruited' : recruit.dead ? 'lost' : 'awaits Rictor'} · Houses ${level.houses.filter((house) => house.visited).length}/3`;
  }
  if (level.infirmary) {
    const rules = level.infirmary;
    return `Defend the evacuation door: ${rules.survivedTurns}/${rules.defendTurns} enemy phases held · Patients ${rules.patients.filter((patient) => patient.rescued).length}/${rules.patients.length} · Ledger ${rules.ledger.collected ? 'secured' : 'missing'}`;
  }
  if (level.objective === 'seize-gate') {
    if (!level.gateEncounter.spawned) return 'Defeat the Golden Order captain; Maria must reach the gate';
    return enemies.some((enemy) => enemy.id === level.gateEncounter.beastId)
      ? 'Defeat the Blood Beast blocking the gate; Maria must survive'
      : 'Move Maria onto the marked gate tile';
  }
  if (level.objective === 'rescue-villagers') {
    const progress = rescueState ? rescueProgress(rescueState) : { rescued: 0, lost: 0 };
    return `Rescue villagers (${progress.rescued}/3 safe, ${progress.lost} lost), clear beasts, defeat captain, Maria to bridge`;
  }
  if (level.objective === 'escape') {
    return level.leader === 'maria'
      ? 'Get every unit to the marked exit'
      : `Escape: ${requiredUnits().map((unit) => unit.name).join(' and ')} must reach the marked stairs`;
  }
  if (level.objective === 'defeat-boss') {
    const roots = level.heartroots ? enemies.filter((enemy) => enemy.id === 'heartroot').length : 0;
    return roots ? `Defeat the boss (Heartroots left: ${roots})` : 'Defeat the boss';
  }
  return 'Kill all enemies';
}

function heartrootBoss() {
  const rules = activeLevel.heartroots;
  return rules ? enemies.find((enemy) => enemy.id === rules.bossId) : undefined;
}

// Idempotent: the boss gains strength and movement for every Heartroot destroyed so far.
function syncHeartrootFrenzy() {
  const rules = activeLevel.heartroots;
  const boss = heartrootBoss();
  if (!rules || !boss) return false;
  const total = activeLevel.enemies.filter((entry) => entry.id === 'heartroot').length;
  const destroyed = total - enemies.filter((enemy) => enemy.id === 'heartroot').length;
  const applied = boss.frenzyLevel ?? 0;
  if (destroyed === applied) return false;
  boss.strength += (destroyed - applied) * rules.frenzyStrength;
  boss.movement += (destroyed - applied) * rules.frenzyMovement;
  boss.frenzyLevel = destroyed;
  return destroyed > applied;
}

async function heartrootPhase() {
  const rules = activeLevel.heartroots;
  const boss = heartrootBoss();
  if (!rules || !boss) return;
  if (syncHeartrootFrenzy()) {
    showCombatResult(boss, 'FRENZY', 'critical');
    setMessage(`${boss.name} howls as a Heartroot dies. He is in a frenzy!`);
    await wait(700);
  }
  const roots = enemies.filter((enemy) => enemy.id === 'heartroot').length;
  const healed = Math.min(boss.maxHp - boss.hp, roots * rules.healPerRoot);
  if (healed > 0) {
    boss.hp += healed;
    showCombatResult(boss, `+${healed}`, 'heal');
    setMessage(`The Heartroots feed ${boss.name}. He recovers ${healed} HP.`);
    renderTacticalUi();
    await wait(700);
  }
}

function hideTerminalScreen() {
  window.clearTimeout(terminalFocusTimeout);
  terminalScreen.classList.remove('visible');
  terminalScreen.hidden = true;
}

// Part finales show the victory card before their story ending.
let showingPartVictory = false;

function showTerminalScreen(outcome, message, { ending = false } = {}) {
  terminalScreen.dataset.outcome = outcome;
  const partTwoEnd = outcome === 'victory' && activeLevel.objective === 'seize-gate';
  const endingText = partTwoEnd ? PART_TWO_ENDING : PART_ONE_ENDING;
  const partEnd = outcome === 'victory' && (currentChapter === 4 || partTwoEnd);
  showingPartVictory = partEnd && !ending;
  terminalHeading.textContent = ending ? endingText.heading : outcome === 'victory'
    ? activeLevel.cathedral ? 'PART THREE COMPLETE' : 'VICTORY' : 'GAME OVER';
  terminalSubtitle.hidden = !ending;
  terminalSubtitle.textContent = ending ? endingText.welcome : '';
  terminalMessage.textContent = ending ? endingText.message : message;
  const nextChapterButton = document.querySelector('#next-chapter');
  nextChapterButton.hidden = !(outcome === 'victory' && (hasNextChapter() || showingPartVictory));
  nextChapterButton.textContent = ending ? (partTwoEnd ? 'Begin Part Three' : 'Begin Part Two')
    : showingPartVictory ? 'Continue' : activeLevel.cathedral ? 'Begin Part Four' : 'Next Chapter';
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
  if (activeLevel.cathedral) void showCathedralEnding();
  if (activeLevel.bellYard) void showBellYardEnding();
  if (activeLevel.shore) void tutorialPopup.show('shore-ending', {}, { force: true });
  if (activeLevel.waitingCity) void tutorialPopup.show('waitingCity-ending', {}, { force: true });
  if (activeLevel.abyssalThrone) void tutorialPopup.show('abyssalThrone-ending', {}, { force: true });
}

function syncThronePresentation() {
  const rules = activeLevel.abyssalThrone;
  levelGroup.userData.abyssalThrone?.sync();
  setOceanAmbienceGain(rules?.beats.some((beat) => beat.id === 'silence' && beat.seen) ? 0
    : rules?.beats.some((beat) => beat.id === 'receding' && beat.seen) ? 0.45 : 1);
  if (!rules) return;
  const boss = enemies.find((unit) => unit.id === rules.bossId);
  if (boss) {
    boss.ai = rules.awakened ? 'guard' : 'stationary';
    if (boss.mesh) setIdleSprite(boss);
  }
}

async function showThroneStory() {
  const beats = advanceThroneStory(activeLevel, playerTeam);
  syncThronePresentation();
  for (const id of beats) {
    saveCurrentGame();
    await tutorialPopup.show(`abyssalThrone-${id}`, {}, { force: true });
  }
}

async function showBellYardStory() {
  for (const id of advanceBellYardStory(activeLevel, playerTeam, gameState.turn)) {
    saveCurrentGame();
    await tutorialPopup.show(`bellYard-${id}`, {}, { force: true });
  }
}

async function showBellYardEnding() {
  const escaped = activeLevel.bellYard.escaped;
  await tutorialPopup.show('bellYard-ending', {
    cargo: escaped === 0 ? 'Not one treatment wagon reached the lift. Whatever waits below will be hungry.'
      : `${escaped} treatment wagon${escaped === 1 ? '' : 's'} went down ahead of them. Whatever waits below has been fed.`,
  }, { force: true });
}

function checkBellYardObjective() {
  if (gameState.phase === 'victory') return true;
  if (!bellYardVictoryReady(activeLevel, enemies, maria, rictor)) return false;
  completeVictory('Maria throws the brake. The Bell Lift drops into the dark with both parties aboard.');
  return true;
}

async function reuniteParties() {
  const REUNION_INSIGHT = 5;
  const other = player === maria ? rictor : maria;
  if (!gameState.selected || gameState.mode !== 'unit' || gameState.phase !== 'player' ||
    !canReunite(activeLevel, player, other)) return;
  activeLevel.bellYard.reunited = true;
  for (const unit of [maria, rictor]) {
    const healed = unit.maxHp - unit.hp;
    unit.hp = unit.maxHp;
    if (healed > 0) showCombatResult(unit, `+${healed}`, 'heal');
  }
  gainInsight(REUNION_INSIGHT, 'the parties reunite');
  finishUnit();
  saveCurrentGame();
  await tutorialPopup.show('bellYard-reunion', { insight: REUNION_INSIGHT }, { force: true });
}

// Wagons roll along the rails toward the Bell Lift; any unit on the rails stops them.
async function advanceTreatmentWagon(wagon) {
  const occupied = new Set([...defendingUnits(), ...enemies]
    .filter((unit) => unit !== wagon && unit.hp > 0)
    .map((unit) => tileKey(unit.x, unit.z)));
  const { path, escapes } = planWagonMove(activeLevel, wagon, occupied);
  if (path.length < 2) return;
  cameraFollowTarget = wagon.mesh.position;
  enemyMovement = { enemy: wagon, path, startedAt: clock.elapsedTime, duration: Math.max(0.35, (path.length - 1) * 0.24) };
  await wait(enemyMovement.duration * 1000);
  enemyMovement = undefined;
  const end = path[path.length - 1];
  Object.assign(wagon, { x: end.x, z: end.z });
  wagon.mesh.position.set(worldX(end.x), unitSpriteHeightAt(end.x, end.z, wagon), worldZ(end.z));
  setIdleSprite(wagon);
  if (!escapes) return;
  activeLevel.bellYard.escaped++;
  scene.remove(wagon.mesh);
  enemies = enemies.filter((unit) => unit !== wagon);
  showPhaseBanner('Wagon escaped', gameState.turn);
  setMessage(`A treatment wagon rolls onto the Bell Lift and is lowered into the dark (${activeLevel.bellYard.escaped} escaped).`);
  renderTacticalUi();
  saveCurrentGame();
  await wait(700);
}

function departTreatmentWagons() {
  const rules = activeLevel.bellYard;
  if (!rules) return [];
  const occupied = new Set([...defendingUnits(), ...enemies].filter((unit) => unit.hp > 0).map((unit) => tileKey(unit.x, unit.z)));
  const departed = [];
  for (const entry of dueDepartures(activeLevel, gameState.turn)) {
    // A unit parked on the depot siding holds the wagon in its shed.
    if (occupied.has(tileKey(entry.x, entry.z))) continue;
    entry.departed = true;
    const wagon = createEnemy(entry.x, entry.z, rules.wagonId);
    enemies.push(wagon);
    occupied.add(tileKey(entry.x, entry.z));
    departed.push(wagon);
  }
  return departed;
}

// A broken wagon spills its "treated" cargo back onto the cobbles.
function releaseWagonCargo(wagon) {
  const rules = activeLevel.bellYard;
  if (!rules || wagon.id !== rules.wagonId) return null;
  rules.released++;
  const cargo = createEnemy(wagon.x, wagon.z, rules.cargo.id, { level: rules.cargo.level, ai: 'mobile' });
  enemies.push(cargo);
  return cargo;
}

async function showCathedralStory() {
  for (const id of advanceCathedralStory(activeLevel, playerTeam)) {
    saveCurrentGame();
    await tutorialPopup.show(`cathedral-${id}`, {}, { force: true });
    if (id === 'records') {
      if (fullTeam.some((unit) => unit.id === 'eveline' && unit.hp > 0)) {
        await tutorialPopup.show('cathedral-eveline', {}, { force: true });
      }
      if (fullTeam.some((unit) => unit.id === 'corvis' && unit.hp > 0)) {
        await tutorialPopup.show('cathedral-corvis', {}, { force: true });
      }
    }
  }
}

async function showCathedralEnding() {
  await showCathedralStory();
  await tutorialPopup.show('cathedral-ending', {}, { force: true });
  if (fullTeam.some((unit) => unit.id === 'corvis' && unit.hp > 0)) {
    await tutorialPopup.show('cathedral-bell', {}, { force: true });
  }
}

function fallenRequiredUnit() {
  if (activeLevel.rescue || activeLevel.gateEncounter) return maria.hp <= 0 ? maria : undefined;
  if (activeLevel.bellYard || activeLevel.abyssalThrone) return requiredUnits().find((unit) => unit.hp <= 0);
  return activeLevel.requiredUnits.length && activeLevel.leader !== 'maria'
    ? requiredUnits().find((unit) => unit.hp <= 0)
    : undefined;
}

function partyDefeated() {
  return Boolean(activeLevel.infirmary?.breached) || playerTeam.every((unit) => unit.hp <= 0) || Boolean(fallenRequiredUnit());
}

function gameOverMessage() {
  if (activeLevel.infirmary?.breached) return 'The evacuation ward has been breached. The service passage is lost.';
  const fallen = fallenRequiredUnit();
  if (fallen && activeLevel.abyssalThrone) return `${fallen.name} has fallen beneath the stars. The last seal is lost.`;
  if (fallen === maria) return 'Maria has fallen. The road to Aldermere is lost.';
  if (fallen && activeLevel.bellYard) return `${fallen.name} has fallen in the freight yard. The two parties never meet again.`;
  if (fallen) return `${fallen.name} has fallen. The ward keeps its prisoners.`;
  return 'The last light has died. The sea keeps what it claims.';
}

function completeGameOver() {
  if (gameState.defeated || !partyDefeated()) return;
  gameState.defeated = true;
  gameState.mode = 'terminal';
  gameState.selected = false;
  cameraFollowTarget = undefined;
  const message = gameOverMessage();
  setMessage(message);
  renderTacticalUi();
  showTerminalScreen('game-over', message);
  saveCurrentGame();
}

function checkEscapeObjective() {
  if (activeLevel.streets) return checkStreetObjective();
  if (activeLevel.objective === 'seize-gate') return checkGateObjective();
  if (activeLevel.objective !== 'escape') return false;
  const living = playerTeam.filter((unit) => unit.hp > 0);
  const escaped = living.filter((unit) =>
    activeLevel.exitTiles.some((tile) => tile.x === unit.x && tile.z === unit.z));
  if (!living.length || escaped.length < living.length) return false;
  completeVictory(activeLevel.leader === 'maria'
    ? 'Everyone has reached the exit. The objective is complete.'
    : `${requiredUnits().map((unit) => unit.name).join(' and ')} slip out of the ward. The objective is complete.`);
  return true;
}

function checkStreetObjective() {
  if (gameState.phase === 'victory') return true;
  if (!streetsVictoryReady(activeLevel, enemies, rictor)) return false;
  completeVictory('Rictor opens the Cathedral approach. The clocktower rings above the smoke; the Church will answer for the ward.');
  const recruit = activeLevel.streets.recruit;
  const recruitment = recruit.recruited
    ? 'Eveline rides with the party, carrying testimony from the quarantined wards.'
    : recruit.dead ? 'Eveline did not survive the streets. Her empty saddle is another debt the Church must answer for.'
      : 'Eveline remains behind in the quarantine district; her chance to join has passed.';
  void tutorialPopup.show('streetsEnding', { recruitment }, { force: true });
  return true;
}

function checkCourtyardObjective() {
  if (gameState.phase === 'victory') return true;
  if (!courtyardVictoryReady(activeLevel, enemies, partyLeader())) return false;
  completeVictory('General Severin falls. The Cathedral doors open; the Bishop waits within.');
  void tutorialPopup.show('courtyardEnding', {}, { force: true });
  return true;
}

function checkGateObjective() {
  if (!gateVictoryReady(activeLevel, maria, enemies)) return false;
  completeVictory('Maria opens the gate of Aldermere. The Golden Threshold is crossed.');
  return true;
}

async function revealGateBeast(beast) {
  const previousTarget = cameraFollowTarget;
  const landing = beast.mesh.position.clone();
  cameraFollowTarget = landing;
  setMessage('The bridge falls silent...');
  await wait(650);
  playGateRumble();
  setMessage('A deep rumble rolls through the gatehouse.');
  for (let frame = 0; frame < 36; frame++) {
    cameraFollowTarget = landing.clone().add(new THREE.Vector3(Math.sin(frame * 2.4) * 0.12, 0, Math.cos(frame * 2.1) * 0.08));
    await wait(35);
  }
  cameraFollowTarget = landing;
  playBloodBeastRoar();
  setMessage('A shrieking roar tears through the dusk!');
  await wait(1050);
  beast.mesh.position.y = landing.y + 7;
  beast.mesh.visible = true;
  for (let frame = 1; frame <= 30; frame++) {
    beast.mesh.position.y = landing.y + 7 * (1 - (frame / 30) ** 2);
    await wait(20);
  }
  beast.mesh.position.copy(landing);
  playHitImpact({ critical: true });
  showCombatResult(beast, 'BLOOD BEAST', 'critical');
  setMessage('The Blood Beast blocks the gate. Torn white vestments and a high cleric\'s golden chain cling to its hide.');
  renderTacticalUi();
  await wait(650);
  await tutorialPopup.show('bloodBeastArrival', {}, { force: true });
  spawnGateRavens();
  renderTacticalUi();
  cameraFollowTarget = previousTarget;
}

function spawnGateRavens() {
  const encounter = activeLevel.gateEncounter;
  const placements = planGateRavens(activeLevel, gameState.turn, [...defendingUnits(), ...enemies]);
  if (!placements.length) return [];
  const ravens = placements.map(({ x, z }) => createEnemy(x, z, 'raven', { ai: 'mobile' }));
  enemies.push(...ravens);
  encounter.ravenStartTurn ??= gameState.turn;
  encounter.ravenWavesSpawned++;
  setMessage(`${ravens.length} ravens sweep in over the water! Flying units are weak to bows and wind magic.`);
  saveCurrentGame();
  return ravens;
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

const roster = { maria, bartz, cypher, seymour, stark, linus, rictor, lena, arlan, troy, eveline, corvis };

const partyOf = (unit) => unit.party ?? 'maria';
const partyLeader = () => roster[activeLevel?.leader ?? 'maria'];
const requiredUnits = () => (activeLevel?.requiredUnits ?? ['maria']).map((id) => roster[id]).filter(Boolean);
const isRequiredUnit = (unit) => requiredUnits().includes(unit);

function neutralUnits() {
  if (activeLevel?.streets && !activeLevel.streets.recruit.recruited && !activeLevel.streets.recruit.dead && eveline.hp > 0) return [eveline];
  if (!rescueState) return [];
  return [
    ...rescueState.villagers.filter(isActiveVillager),
    ...(!rescueState.recruited && linus.hp > 0 ? [linus] : []),
  ];
}

function initializeStreets() {
  if (!activeLevel.streets) return;
  const recruit = activeLevel.streets.recruit;
  if (fullTeam.includes(eveline)) recruit.recruited = true;
  if (!recruit.recruited) {
    Object.assign(eveline, { x: recruit.x, z: recruit.z, hp: recruit.hp, neutral: true, facing: 'south' });
    if (recruit.inventory) restoreMariaInventory(eveline, recruit.inventory, 'heal-staff');
    setIdleSprite(eveline);
  } else eveline.neutral = false;
}

async function recruitStreetHealer() {
  if (!gameState.selected || gameState.mode !== 'unit' || gameState.phase !== 'player' ||
    !canRecruitEveline(activeLevel, player, eveline)) return;
  recruitEveline(activeLevel, player, eveline);
  eveline.moved = false;
  eveline.acted = false;
  playerTeam.push(eveline);
  fullTeam.push(eveline);
  gameState.mode = 'combat';
  setMessage('Eveline joins! Her wounds remain, but her Heal staff is ready to help.');
  renderTacticalUi();
  await tutorialPopup.show('eveline', {}, { force: true });
  gameState.mode = 'unit';
  finishUnit();
}

async function recruitCourtyardShaman() {
  const target = enemies.find((enemy) => enemy.id === 'corvis');
  if (!gameState.selected || gameState.mode !== 'unit' || gameState.phase !== 'player' ||
    !canRecruitCorvis(activeLevel, player, target)) return;
  recruitCorvis(activeLevel, player, target);
  Object.assign(corvis, createCorvisAlly(), {
    x: target.x, z: target.z, hp: target.hp, maxHp: target.maxHp,
    level: target.level, inventory: target.inventory.map(copyEntry), facing: target.facing,
  });
  scene.remove(target.mesh);
  enemies = enemies.filter((enemy) => enemy !== target);
  playerTeam.push(corvis);
  fullTeam.push(corvis);
  corvis.mesh.position.set(worldX(corvis.x), unitSpriteHeightAt(corvis.x, corvis.z, corvis), worldZ(corvis.z));
  setIdleSprite(corvis);
  finishUnit();
  saveCurrentGame();
  await tutorialPopup.show('corvis', {}, { force: true });
}

function initializeCourtyard() {
  if (!activeLevel.courtyard || !fullTeam.includes(corvis)) return;
  activeLevel.courtyard.recruit.recruited = true;
  activeLevel.courtyard.recruit.dead = false;
  for (const enemy of enemies.filter((unit) => unit.id === 'corvis')) scene.remove(enemy.mesh);
  enemies = enemies.filter((unit) => unit.id !== 'corvis');
}

function defendingUnits() {
  return [...playerTeam, ...neutralUnits()].filter((unit) => unit.hp > 0);
}

function snapshotRescue() {
  if (!rescueState) return null;
  return {
    recruited: rescueState.recruited,
    rewardsClaimed: rescueState.rewardsClaimed,
    linus: { x: linus.x, z: linus.z, hp: linus.hp },
    villagers: rescueState.villagers.map(({ id, x, z, hp, status }) => ({ id, x, z, hp, status })),
  };
}

function initializeRescue(saved = null) {
  pointerHoveredUnit = null;
  for (const unit of rescueState?.villagers ?? []) {
    scene.remove(unit.mesh);
    unit.mesh.material.dispose();
  }
  rescueState = null;
  if (!activeLevel.rescue) return;
  const state = saved ?? freshRescueState(activeLevel);
  rescueState = { ...state, villagers: [] };
  if (!fullTeam.includes(linus)) Object.assign(linus, state.linus, { facing: 'south', neutral: true });
  else rescueState.recruited = true;
  for (const entry of state.villagers) {
    const rule = activeLevel.rescue.villagers.find((villager) => villager.id === entry.id);
    const unit = Object.assign(createVillager(entry.id, rule.name), entry);
    createUnitMesh(unit);
    unit.mesh.visible = isActiveVillager(unit);
    rescueState.villagers.push(unit);
  }
  setIdleSprite(linus);
}

async function recruitLinus() {
  if (!gameState.selected || gameState.mode !== 'unit' || gameState.phase !== 'player' ||
    player.acted || !canRecruitLinus(player, linus, rescueState)) return;
  rescueState.recruited = true;
  linus.neutral = false;
  linus.moved = false;
  linus.acted = false;
  playerTeam.push(linus);
  fullTeam.push(linus);
  player.acted = true;
  gameState.mode = 'combat';
  setMessage('Linus joins the party! His wounds remain; heal him before returning to the fight.');
  renderTacticalUi();
  await tutorialPopup.show('linus');
  gameState.mode = 'unit';
  finishUnit();
}

async function advanceVillagers() {
  if (!rescueState) return;
  for (const unit of rescueState.villagers.filter((villager) => villager.status === 'escorting')) {
    const path = escortPath(unit, activeLevel.rescue.refuge, [...defendingUnits(), ...enemies], activeLevel);
    if (path.length > 1) {
      enemyMovement = { enemy: unit, path, startedAt: clock.elapsedTime, duration: (path.length - 1) * 0.18 };
      await wait(enemyMovement.duration * 1000);
      enemyMovement = undefined;
      const tile = path.at(-1);
      unit.x = tile.x;
      unit.z = tile.z;
      unit.mesh.position.set(worldX(unit.x), unitSpriteHeightAt(unit.x, unit.z, unit), worldZ(unit.z));
      setIdleSprite(unit);
    }
    if (activeLevel.rescue.refuge.some((tile) => tile.x === unit.x && tile.z === unit.z)) {
      unit.status = 'rescued';
      unit.mesh.visible = false;
      showCombatResult(unit, 'SAFE', 'heal');
      setMessage(activeLevel.rescue.villagers.find((entry) => entry.id === unit.id).farewell);
      await wait(850);
    } else if (path.length <= 1) {
      setMessage(`${unit.name}'s escape route is blocked. Clear the path to the green refuge.`);
      await wait(500);
    }
  }
}

function checkRescueVictory() {
  if (!rescueState) return false;
  if (gameState.phase === 'victory') return true;
  const { rescued, lost, remaining } = rescueProgress(rescueState);
  const bridge = activeLevel.exit;
  if (remaining || hasPendingReinforcements() || enemies.some((unit) =>
    unit.type === 'beast' || unit.id === activeLevel.rescue.captainId) ||
    maria.hp <= 0 || maria.x !== bridge.x || maria.z !== bridge.z) return false;
  const rewards = rescueState.rewardsClaimed ? [] : rescueRewardIds(activeLevel.rescue, rescued);
  for (const id of rewards) grantItem(maria, id);
  rescueState.rewardsClaimed = true;
  const rewardNames = rewards.map((id) => INVENTORY_ITEMS.get(id).name).join(', ');
  completeVictory(`The crossing is secured. ${rescued}/3 villagers rescued${lost ? `, ${lost} lost` : ''}. ${
    rewardNames ? `Rescue rewards: ${rewardNames} (sent to the convoy if Maria's inventory was full). ` : ''
  }Aldermere's gates wait beyond the bridge.`);
  return true;
}

// Fields the level's listed player units (or Maria alone at the spawn point).
function deployTeam(level, carry = null) {
  const carried = new Set((carry?.allies ?? []).map((ally) => ally.id));
  // The reunion map lists both full parties; units never recruited (or left behind) stay off the field.
  const listed = (level.bellYard || level.shore || level.waitingCity || level.abyssalThrone) && Array.isArray(carry?.allies)
    ? level.players.filter((placement) => level.requiredUnits.includes(placement.id) || carried.has(placement.id))
    : level.players;
  const placements = [...(listed.length
    ? listed
    : [{ id: 'maria', x: level.spawn.x, z: level.spawn.z }])];
  const taken = new Set(placements.map((placement) => tileKey(placement.x, placement.z)));
  const origin = placements[0];
  const party = partyOf(roster[origin.id] ?? maria);
  // Carried-over allies the map doesn't list (e.g. recruited mid-game) still join their own party, beside the first unit.
  for (const saved of carry?.allies ?? []) {
    if (roster[saved.id] && partyOf(roster[saved.id]) !== party) continue;
    if (!roster[saved.id] || placements.some((placement) => placement.id === saved.id)) continue;
    let best = null;
    for (let z = 0; z < level.height; z++) {
      for (let x = 0; x < level.width; x++) {
        if (!isWalkable(level, x, z) || taken.has(tileKey(x, z))) continue;
        const distance = distanceBetween(origin.x, origin.z, x, z);
        if (!best || distance < best.distance) best = { x, z, distance };
      }
    }
    if (!best) continue;
    taken.add(tileKey(best.x, best.z));
    placements.push({ id: saved.id, x: best.x, z: best.z });
  }
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
  for (const unit of new Set([...fullTeam, ...playerTeam])) {
    if (unit !== maria && roster[unit.id]) allies.set(unit.id, serializeUnit(unit));
  }
  return { ...serializeUnit(maria), allies: [...allies.values()], convoy: convoy.map(copyEntry), insight: snapshotInsight() };
}

function startLevel(level, { chapter = null, carry = null } = {}) {
  const validatedLevel = validateLevel(level);
  hideTerminalScreen();
  currentChapter = chapter;
  chapterStart = carry;
  pinnedEnemyRanges.clear();
  resetTutorials(chapter);
  Object.assign(maria, createMaria());
  Object.assign(bartz, createBartzAlly());
  Object.assign(cypher, createCypherAlly());
  Object.assign(seymour, createSeymourAlly());
  Object.assign(stark, createStarkAlly());
  Object.assign(linus, createLinusAlly());
  Object.assign(rictor, createRictorAlly());
  Object.assign(lena, createLenaAlly());
  Object.assign(arlan, createArlanAlly());
  Object.assign(troy, createTroyAlly());
  Object.assign(eveline, createEvelineAlly());
  Object.assign(corvis, createCorvisAlly());
  setConvoy(carry?.convoy);
  restoreInsight(carry?.insight);
  refreshInsightLabel();
  pendingPrep = chapter !== null && chapter >= FIRST_PREP_CHAPTER;
  if (carry) {
    applyUnitSnapshot(maria, carry);
    for (const savedAlly of carry.allies ?? []) {
      if (roster[savedAlly.id] && roster[savedAlly.id] !== maria) applyUnitSnapshot(roster[savedAlly.id], savedAlly);
    }
  }
  for (const unit of Object.values(roster)) {
    refreshMagicUses(unit.inventory, unit);
    unit.mesh.material.color.set(0xffffff);
  }
  refreshMagicUses(convoy);
  activeLevel = buildLevel(THREE, levelGroup, validatedLevel);
  applyLevelLighting();
  refreshPrisonerSilhouettes();
  const team = deployTeam(activeLevel, carry);
  fullTeam = [...team];
  if (carry?.prepared && Array.isArray(carry.deployed)) {
    const chosen = team.filter((unit) => isRequiredUnit(unit) || carry.deployed.includes(unit.id));
    if (chosen.length) {
      playerTeam.length = 0;
      playerTeam.push(...chosen);
      player = chosen[0];
    }
  }
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
  initializeRescue();
  initializeStreets();
  initializeCourtyard();
  experienceDisplay.reset(player.level, player.experience);
  setLevelStatus(`Level: ${activeLevel.name}`);
  setMessage(`${activeLevel.name} · Objective: ${objectiveDescription()}. Select ${player.name} to begin.`);
  sessionStarted = true;
  hideMainMenu();
  showPhaseBanner('Player', gameState.turn);
  renderTacticalUi();
  // A prepared snapshot already holds this chapter's starting items.
  grantStartingItems(carry?.prepared ? [] : team);
}

function newGame() {
  startLevel(initialLevel, { chapter: 0 });
}

function restartLevel() {
  startLevel({
    ...activeLevel,
    gateEncounter: activeLevel.gateEncounter ? { ...activeLevel.gateEncounter, spawned: false, ravenStartTurn: null, ravenWavesSpawned: 0 } : null,
    houses: activeLevel.houses.map((house) => ({ ...house, visited: false })),
    chests: activeLevel.chests.map((chest) => ({ ...chest, opened: false })),
    cells: activeLevel.cells.map((cell) => ({ ...cell, opened: false })),
    infirmary: freshInfirmary(activeLevel.infirmary),
    streets: freshStreets(activeLevel.streets),
    courtyard: freshCourtyard(activeLevel.courtyard),
    cathedral: freshCathedral(activeLevel.cathedral),
    bellYard: freshBellYard(activeLevel.bellYard),
    shore: freshShore(activeLevel.shore),
    waitingCity: freshWaitingCity(activeLevel.waitingCity),
    abyssalThrone: freshAbyssalThrone(activeLevel.abyssalThrone),
    reinforcements: activeLevel.reinforcements.map((wave) => ({
      ...wave,
      turn: activeLevel.cathedral ? 999 : wave.turn,
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
  applyLevelLighting();
  refreshPrisonerSilhouettes();
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
      frozen: saved.frozen ?? false,
    });
    if (saved.weaponExp) unit.weaponExp = { ...saved.weaponExp };
    if (saved.classId) applyClass(unit, saved.classId);
    refreshUnitAppearance(unit);
    restoreMariaInventory(unit, saved.inventory, saved.equippedWeaponId);
    unit.mesh.material.color.set(unit.frozen ? 0x8fd4ff : 0xffffff);
  };
  Object.assign(bartz, createBartzAlly());
  Object.assign(cypher, createCypherAlly());
  Object.assign(seymour, createSeymourAlly());
  Object.assign(stark, createStarkAlly());
  Object.assign(linus, createLinusAlly());
  Object.assign(rictor, createRictorAlly());
  Object.assign(lena, createLenaAlly());
  Object.assign(arlan, createArlanAlly());
  Object.assign(troy, createTroyAlly());
  Object.assign(eveline, createEvelineAlly());
  Object.assign(corvis, createCorvisAlly());
  // Insight first: it decides which spells the restored tomes (and equipped weapons) may hold.
  setConvoy(save.convoy);
  restoreInsight(save.insight);
  restoreUnit(maria, save.player);
  const team = save.player.reserve ? [] : [maria];
  const benched = new Set();
  for (const savedAlly of save.allies) {
    const ally = roster[savedAlly.id];
    if (!ally) throw new Error(`Unknown saved ally "${savedAlly.id}".`);
    restoreUnit(ally, savedAlly);
    team.push(ally);
    if (savedAlly.benched) benched.add(ally);
  }
  playerTeam.length = 0;
  playerTeam.push(...team.filter((unit) => !benched.has(unit)));
  fullTeam = [...team];
  player = team.find((unit) => unit.hp > 0) ?? team[0] ?? maria;
  currentChapter = save.chapter;
  chapterStart = save.chapterStart;
  resetTutorials(currentChapter);
  tutorialProgress.intro = true;
  tutorialProgress.combatSeen = save.turn > 1 || save.enemies.some((enemy) => enemy.hp < enemy.maxHp);
  refreshInsightLabel();
  for (const enemy of enemies) scene.remove(enemy.mesh);
  enemies = save.enemies.map((savedEnemy) => {
    const enemy = createEnemy(savedEnemy.x, savedEnemy.z, savedEnemy.id ?? 'raider', savedEnemy);
    enemy.hp = savedEnemy.hp;
    enemy.maxHp = savedEnemy.maxHp;
    if (savedEnemy.inventory) {
      const authored = enemy.inventory;
      enemy.inventory = savedEnemy.inventory.map(copyEntry);
      // Saves from before an enemy learned an authored spell (e.g. Physic) gain its fresh uses.
      for (const entry of enemy.inventory) {
        const fresh = authored?.find((candidate) => candidate.id === entry.id && candidate.spells);
        if (fresh && !entry.spells) entry.spells = { ...fresh.spells };
      }
      if (!enemy.inventory.some((entry) => entry.id === bookOf(enemy.weapon))) enemy.weapon = null;
    }
    if (savedEnemy.frozen) setEnemyFrozen(enemy, savedEnemy.frozen === true ? 1 : savedEnemy.frozen);
    return enemy;
  });
  syncHeartrootFrenzy();
  syncThronePresentation();
  initializeRescue(save.rescue);
  initializeStreets();
  initializeCourtyard();
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
  if (!gameState.defeated && partyDefeated()) {
    completeGameOver();
    return;
  }
  if (gameState.phase === 'player') showPhaseBanner('Player', gameState.turn);
  if (gameState.phase === 'player' && !gameState.defeated) spawnGateRavens();
  renderTacticalUi();
  if (gameState.defeated) {
    showTerminalScreen('game-over', gameOverMessage());
  } else if (gameState.phase === 'victory') {
    showTerminalScreen('victory', 'The objective is complete.');
  }
}

function returnToMainMenu() {
  setOceanAmbienceGain(1);
  if (!sessionStarted && !mainMenu.hidden) {
    optionsDialog.close();
    document.querySelector('#title-options').focus();
    return;
  }
  saveCurrentGame();
  hideTerminalScreen();
  if (optionsDialog.open) optionsDialog.close();
  mapViewActive = false;
  const prepDialog = document.querySelector('#prep-dialog');
  if (prepDialog?.open) prepDialog.close();
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

const saveSlotsDialog = document.querySelector('#save-slots-dialog');
const saveSlotsList = document.querySelector('#save-slots-list');
const saveSlotsStatus = document.querySelector('#save-slots-status');
const importSaveInput = document.querySelector('#import-save-file');
let saveSlotsMode = 'load';
let importSaveSlot = null;

function renderSaveSlots() {
  saveSlotsList.replaceChildren();
  const saving = saveSlotsMode === 'save';
  for (let slot = 1; slot <= SAVE_SLOT_COUNT; slot++) {
    const info = describeSaveSlot(slot);
    const button = document.createElement('button');
    button.type = 'button';
    const title = document.createElement('span');
    title.textContent = `Slot ${slot}`;
    const detail = document.createElement('small');
    detail.textContent = info
      ? `${info.chapter}${info.turn ? ` · Turn ${info.turn}` : ''}${info.level ? ` · Maria Lv ${info.level}` : ''}${info.savedAt ? ` · ${new Date(info.savedAt).toLocaleString()}` : ''}`
      : 'Empty';
    button.append(title, detail);
    button.disabled = !saving && !info;
    button.addEventListener('click', () => chooseSaveSlot(slot, info));
    const row = document.createElement('div');
    row.className = 'save-slot-row';
    const exportButton = document.createElement('button');
    exportButton.type = 'button';
    exportButton.textContent = 'Export';
    exportButton.setAttribute('aria-label', `Export slot ${slot}`);
    exportButton.disabled = !info;
    exportButton.addEventListener('click', () => downloadSaveFile(slot));
    const importButton = document.createElement('button');
    importButton.type = 'button';
    importButton.textContent = 'Import';
    importButton.setAttribute('aria-label', `Import into slot ${slot}`);
    importButton.addEventListener('click', () => {
      importSaveSlot = slot;
      importSaveInput.value = '';
      importSaveInput.click();
    });
    row.append(button, exportButton, importButton);
    saveSlotsList.append(row);
  }
}

function downloadSaveFile(slot = null) {
  let url;
  try {
    if (slot === null && sessionStarted && !saveCurrentGame()) {
      throw new Error('The current game could not be saved.');
    }
    const text = exportSaveFile(slot);
    const save = JSON.parse(text);
    url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `blood-emblem-${slot === null ? 'current' : `slot-${slot}`}-chapter-${(save.chapter ?? 0) + 1}-turn-${save.turn}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    saveSlotsStatus.textContent = 'Save file exported. Keep the downloaded JSON somewhere safe.';
  } catch (error) {
    console.error('Save export failed:', error);
    saveSlotsStatus.textContent = `Could not export save: ${error.message}`;
  } finally {
    if (url) window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

importSaveInput.addEventListener('change', async () => {
  const slot = importSaveSlot;
  const file = importSaveInput.files[0];
  if (!file || slot === null) return;
  try {
    const text = await file.text();
    parseSave(text);
    if (describeSaveSlot(slot) && !window.confirm(`Overwrite slot ${slot} with ${file.name}?`)) return;
    importSaveFile(text, slot);
    renderSaveSlots();
    saveSlotsStatus.textContent = `Imported into slot ${slot}. Choose that slot in Load Game to play. Your current game was not changed.`;
  } catch (error) {
    console.error('Save import failed:', error);
    saveSlotsStatus.textContent = `Could not import save: ${error.message}`;
  }
});
document.querySelector('#export-current-save').addEventListener('click', () => downloadSaveFile());

function openSaveSlots(mode) {
  saveSlotsMode = mode;
  document.querySelector('#save-slots-heading').textContent = mode === 'save' ? 'Save Game' : 'Load Game';
  saveSlotsStatus.textContent = mode === 'save' ? 'Choose a slot to save the current game.' : 'Choose a slot to load.';
  renderSaveSlots();
  saveSlotsDialog.showModal();
  saveSlotsList.querySelector('button:not(:disabled)')?.focus();
}

function chooseSaveSlot(slot, info) {
  try {
    if (saveSlotsMode === 'save') {
      if (info && !window.confirm(`Overwrite slot ${slot}?`)) return;
      if (!saveCurrentGame()) throw new Error('the current game could not be written. Check the message above.');
      copyCurrentSaveToSlot(slot);
      readSave();
      renderSaveSlots();
      saveSlotsStatus.textContent = `Saved to slot ${slot}.`;
      return;
    }
    loadSlotIntoCurrentSave(slot);
    saveSlotsDialog.close();
    continueGame();
  } catch (error) {
    console.error('Save slot action failed:', error);
    saveSlotsStatus.textContent = `Could not ${saveSlotsMode} slot ${slot}: ${error.message}`;
  }
}

document.querySelector('#load-game').addEventListener('click', () => openSaveSlots('load'));
document.querySelector('#open-save-game').addEventListener('click', () => {
  closeOptionsMenu();
  openSaveSlots('save');
});
document.querySelector('#save-slots-close').addEventListener('click', () => saveSlotsDialog.close());

function openTitleOptions() {
  if (sessionStarted || optionsDialog.open) return;
  document.querySelector('#options-objective').hidden = true;
  document.querySelector('#options-objective').setAttribute('aria-expanded', 'false');
  document.querySelector('#objective-panel').hidden = true;
  document.querySelector('#open-unit-list').hidden = true;
  document.querySelector('#open-save-game').hidden = true;
  document.querySelector('#options-end-phase').hidden = true;
  document.querySelector('#options-restart').hidden = true;
  optionsDialog.showModal();
  document.querySelector('#resume-game').focus();
}

function openOptionsMenu() {
  if (!sessionStarted || gameState.mode === 'options' || gameState.mode === 'combat' || playerMovement) return;
  gameState.mode = 'options';
  document.querySelector('#options-objective').hidden = false;
  document.querySelector('#options-objective').setAttribute('aria-expanded', 'false');
  document.querySelector('#objective-panel').hidden = true;
  document.querySelector('#open-unit-list').hidden = false;
  document.querySelector('#open-save-game').hidden = false;
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
for (const unit of Object.values(roster)) {
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
    applyLevelLighting();
    refreshPrisonerSilhouettes();
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
  const planningMove = gameState.selected && (gameState.mode === 'move' || gameState.mode === 'unit');
  for (const enemy of pinnedEnemyRanges) if (!enemies.includes(enemy) || enemy.hp <= 0) pinnedEnemyRanges.delete(enemy);
  if (gameState.phase === 'player' && (showAllEnemyRanges || ((cursorInspecting || planningMove) && pinnedEnemyRanges.size))) {
    const shown = showAllEnemyRanges ? enemies.filter((enemy) => enemy.hp > 0) : [...pinnedEnemyRanges];
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
    // While a unit moves, its own reach is blue, so show every enemy-covered tile as danger.
    if (gameState.mode === 'move') {
      for (const [key, tile] of moveTiles) threatTiles.set(key, tile);
      moveTiles.clear();
    }
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
    if (type !== 'heal' && type !== 'freeze') {
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
  context.fillStyle = type === 'heal' ? '#5dff8a' : type === 'freeze' ? '#8fdcff' : type === 'critical' ? '#72101d' : type === 'miss' ? '#ffffff' : '#ffe14a';
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
  document.querySelector('#profile-enemy-inventory').hidden = true;
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

function itemInfoElement(entry, showLore = true, showSpells = true) {
  const item = INVENTORY_ITEMS.get(entry.id);
  const details = document.createElement('div');
  const name = document.createElement('strong');
  name.textContent = item.name;
  const description = document.createElement('span');
  if (item.itemType === 'weapon') {
    description.textContent =
      `${item.type} · Might ${item.might} · Hit ${item.hit} · Crit ${item.critical} · Weight ${item.weight}` +
      (item.maxRange > 1 ? ` · Range ${item.minRange}-${item.maxRange}` : '');
    if (item.heal) description.textContent = `${item.type} · Heals ${item.heal} + Magic HP · Range ${item.minRange}-${staffMaxRange(player, item)}`;
    if (item.freeze) {
      const turns = item.freezeTurns ?? 1;
      description.textContent = `${item.type} · Freezes a foe for ${turns === 1 ? 'a turn' : `${turns} turns`} · Range 1-Magic · Hit ${item.hit} + Magic vs Resistance`;
    }
    if (item.requiredRank) description.textContent += ` · Requires ${item.type} rank ${item.requiredRank}`;
    if (item.maxUses && Number.isInteger(entry.uses)) description.textContent += ` · ${entry.uses}/${maxUsesFor(item, player)} uses`;
  } else if (item.id === 'blood-emblem') {
    description.textContent = bloodEmblemDescription();
  } else if (item.heal) {
    description.textContent = `Heals ${item.heal} HP · ${entry.uses}/${item.maxUses} uses remaining`;
  } else {
    description.textContent = item.description ?? '';
  }
  details.append(name, description);
  if (item.itemType === 'weapon' && item.description) {
    const note = document.createElement('span');
    note.className = 'item-effect';
    note.textContent = item.description;
    details.append(note);
  }
  if (showSpells && entry.spells) {
    const spells = document.createElement('span');
    spells.className = 'item-effect';
    spells.textContent = `Spells: ${Object.entries(entry.spells)
      .map(([id, uses]) => `${INVENTORY_ITEMS.get(id).name} (${uses})`).join(' · ')}`;
    details.append(spells);
  }
  if (Array.isArray(item.effect) && item.effect.length) {
    const effect = document.createElement('span');
    effect.className = 'item-effect';
    effect.textContent = `Effective vs ${item.effect.join(', ')}`;
    details.append(effect);
  }
  if (item.reaves?.length) {
    const reaves = document.createElement('span');
    reaves.className = 'item-effect';
    reaves.textContent = `Reverses and doubles triangle: strong vs ${item.reaves.join(', ')}, weak vs ${item.type === 'Spear' ? 'Sword' : 'Axe'}`;
    details.append(reaves);
  }
  if (showLore && item.lore) {
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

function itemRow(entry, label, disabled, onClick, showLore = true, showSpells = true) {
  const row = document.createElement('li');
  const action = document.createElement('button');
  action.textContent = label;
  action.disabled = disabled;
  if (onClick) action.addEventListener('click', onClick);
  row.append(itemInfoElement(entry, showLore, showSpells), action);
  return row;
}

// A tome or staff lists itself plus one row per spell unlocked in it, each showing that spell's own uses.
function spellRows(entry, rowFor) {
  const book = INVENTORY_ITEMS.get(entry.id);
  const rows = [book, ...unlockedSpellsOf(entry.id)].map((spell) => {
    const shown = spell === book ? entry : { id: spell.id, uses: spellUses(entry, spell) };
    const row = rowFor(spell, shown);
    if (spell !== book) row.classList.add('spell-row');
    return row;
  });
  return rows;
}

function renderInventory() {
  inventoryDialog.querySelector('#inventory-heading').textContent = `${player.name}'s Inventory`;
  const list = inventoryDialog.querySelector('#inventory-items');
  list.replaceChildren();
  const equippedEntry = findWeaponEntry(player);
  // The first row of each entry carries its convoy Store button.
  const entryRows = [];
  const append = (entry, ...rows) => {
    entryRows.push([entry, rows[0]]);
    list.append(...rows);
  };
  for (const entry of player.inventory) {
    const item = INVENTORY_ITEMS.get(entry.id);
    if (item.type === 'Staff') {
      const freeze = Boolean(item.freeze);
      append(entry, ...spellRows(entry, (spell, shown) => {
        const blocked = weaponUseBlockReason(player, spell);
        const empty = shown.uses === 0;
        const ready = !blocked && !empty && (freeze ? freezeTargets(player, spell) : healTargets(player, spell)).length > 0;
        const label = blocked ?? (empty ? 'No uses left' : ready ? 'Use' : freeze ? 'No target in range' : 'No one to heal');
        return itemRow(shown, label, !ready, () => {
          closeInventory();
          if (freeze) openFreeze(spell);
          else openHeal(spell);
        }, true, false);
      }));
    } else if (item.itemType === 'weapon') {
      append(entry, ...spellRows(entry, (spell, shown) => {
        const equipped = entry === equippedEntry && player.weapon === spell;
        if (!equipped && !canEquipWeapon(player, spell)) return itemRow(shown, equipBlockReason(player, spell), true, undefined, true, false);
        return itemRow(shown, equipped ? 'Equipped' : 'Equip', equipped, () => equipInventoryWeapon(spell.id), true, false);
      }));
    } else if (item.id === 'blood-emblem') {
      append(entry, itemRow(entry, isBloodEmblemUpgraded()
        ? isBloodEmblemEquipped() ? 'Unequip' : 'Equip'
        : 'Unlock with Insight', !isBloodEmblemUpgraded() || player.id !== 'maria', () => {
        if (!toggleBloodEmblem(player)) return;
        renderInventory();
        setMessage(`Blood Emblem ${isBloodEmblemEquipped() ? 'equipped' : 'unequipped'}.`);
        saveCurrentGame();
      }));
    } else if (item.insight) {
      append(entry, itemRow(entry, 'Read', false, () => useInsightFromInventory(entry)));
    } else if (item.effect === 'key') {
      append(entry, itemRow(entry, 'Opens chests', true));
    } else if (item.effect === 'promote') {
      const ready = player.level >= 20 && canPromote(player);
      append(entry, itemRow(entry, ready ? 'Use' : canPromote(player) ? 'Needs level 20' : 'Already promoted', !ready, () => useMasterEmblem(entry)));
    } else if (STAT_ITEM_EFFECTS[item.effect]) {
      append(entry, itemRow(entry, 'Use', false, () => usePocketwatch(entry)));
    } else {
      append(entry, itemRow(entry, 'Use', player.hp >= player.maxHp, () => useInventoryItem(entry)));
    }
  }
  inventoryDialog.querySelector('#inventory-empty').hidden = player.inventory.length > 0;
  inventoryDialog.querySelector('#inventory-capacity').textContent =
    `${player.inventory.length}/${MAX_INVENTORY_SIZE} items · Convoy: ${convoy.length}`;

  // Maria and Rictor both carry convoy access, so they and anyone standing next to them can reach it.
  const convoySection = inventoryDialog.querySelector('#convoy-section');
  const access = canAccessConvoy(player);
  convoySection.hidden = !access;
  if (access) {
    for (const [entry, row] of entryRows) {
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

function convoyKeepers() {
  return [roster.maria, roster.rictor].filter((keeper) => keeper?.hp > 0 && playerTeam.includes(keeper));
}

function canAccessConvoy(unit) {
  return convoyKeepers().some((keeper) =>
    unit === keeper || Math.abs(unit.x - keeper.x) + Math.abs(unit.z - keeper.z) === 1);
}

function openConvoy() {
  if (!canAccessConvoy(player)) return;
  openInventory();
  inventoryDialog.querySelector('#convoy-section').scrollIntoView({ block: 'nearest' });
  inventoryDialog.querySelector('#convoy-items button:not(:disabled)')?.focus();
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
  if (unit.weapon && !findWeaponEntry(unit)) {
    unit.weapon = null;
    note = ` ${unit.name} is now unarmed.`;
  }
  const item = received && INVENTORY_ITEMS.get(received.id);
  if (item?.itemType === 'weapon' && item.type !== 'Staff' && !unit.weapon && canEquipWeapon(unit, item)) {
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
  const equippedIndex = owner.inventory.indexOf(findWeaponEntry(owner));
  const otherFull = other.inventory.length >= MAX_INVENTORY_SIZE;
  for (const [slot, entry] of owner.inventory.entries()) {
    const equipped = slot === equippedIndex;
    const bound = INVENTORY_ITEMS.get(entry.id).bound;
    let row;
    if (pendingSwap) {
      if (pendingSwap.entry === entry) {
        row = itemRow(entry, 'Cancel swap', false, () => { pendingSwap = null; renderTrade(); }, false);
      } else if (pendingSwap.owner !== owner) {
        row = itemRow(entry, 'Swap for this', bound, () => swapItems(pendingSwap.owner, pendingSwap.entry, owner, entry), false);
      } else {
        row = itemRow(entry, 'Pick from other side', true, undefined, false);
      }
    } else {
      const label = bound ? 'Cannot be traded' : otherFull ? `${other.name} is full` : `Give to ${other.name}${equipped ? ' (equipped)' : ''}`;
      row = itemRow(entry, label, bound || otherFull, () => tradeItem(owner, other, entry), false);
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
// Each staff also casts the spells unlocked for it with Insight (Mend, Physic, Hold, Stasis), each with its own uses.
function castableStaffSpells(unit, kind) {
  return carriedWeapons(unit).filter((spell) => spell.type === 'Staff' && spell[kind] && !weaponUseBlockReason(unit, spell));
}

// Physic reaches Magic / 2 tiles; class abilities (Bishop) add to every staff.
const staffMaxRange = (unit, staff) =>
  Math.max(staff.maxRange, staff.rangeFromMagic ? Math.floor(unit.magic / staff.rangeFromMagic) : 0) + getStaffRangeBonus(unit);

function healTargets(unit, staff) {
  if (unit.acted) return [];
  const staves = staff ? [staff] : castableStaffSpells(unit, 'heal');
  return defendingUnits().filter((ally) => {
    const distance = distanceBetween(unit.x, unit.z, ally.x, ally.z);
    return ally !== unit && ally.hp > 0 && ally.hp < ally.maxHp &&
      staves.some((spell) => distance >= spell.minRange && distance <= staffMaxRange(unit, spell));
  });
}

// One dialog serves both steps: pick a staff spell (when several apply), then pick the target.
function showStaffDialog(heading, rows) {
  healDialog.querySelector('#heal-heading').textContent = heading;
  const list = healDialog.querySelector('#heal-targets');
  list.replaceChildren();
  for (const { label, onClick, weapon, disabled = false } of rows) {
    if (weapon) {
      list.append(itemRow({ id: weapon.id, uses: spellUses(findWeaponEntry(player, weapon), weapon) },
        label, disabled, onClick, false, false));
      continue;
    }
    const row = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.disabled = disabled;
    button.textContent = label;
    button.addEventListener('click', onClick);
    row.append(button);
    list.append(row);
  }
  if (!healDialog.open) healDialog.showModal();
  (list.querySelector('button:not(:disabled)') ?? healDialog.querySelector('#heal-close'))?.focus();
}

// choice is a staff spell picked from the inventory; the action button passes a click event instead.
function openStaff(kind, choice) {
  if (!gameState.selected || gameState.mode !== 'unit') return;
  const targetsFor = kind === 'heal' ? healTargets : freezeTargets;
  const spells = castableStaffSpells(player, kind).filter((spell) => targetsFor(player, spell).length);
  if (!spells.length) return;
  gameState.mode = 'heal';
  renderTacticalUi();
  const showTargets = kind === 'heal' ? showHealTargets : showFreezeTargets;
  const picked = spells.includes(choice) ? choice : null;
  if (picked) {
    showTargets(picked);
    return;
  }
  showStaffDialog('Cast which spell?', carriedWeapons(player)
    .filter((spell) => spell.type === 'Staff' && spell[kind])
    .map((spell) => {
      const blocked = weaponUseBlockReason(player, spell) ??
        (!targetsFor(player, spell).length ? 'No target in range' : undefined);
      return { weapon: spell, label: blocked ?? 'Use', disabled: Boolean(blocked), onClick: () => showTargets(spell) };
    }));
}

const openHeal = (choice) => openStaff('heal', choice);
const openFreeze = (choice) => openStaff('freeze', choice);

function showHealTargets(staff) {
  showStaffDialog(`${staff.name}: heal who?`, healTargets(player, staff).map((target) => ({
    label: `${target.name} · ${target.hp}/${target.maxHp} HP`,
    onClick: () => void useHealStaff(target, staff),
  })));
}

function closeHeal() {
  if (healDialog.open) healDialog.close();
  if (gameState.mode === 'heal') {
    gameState.mode = 'unit';
    renderTacticalUi();
    focusActionMenu();
  }
}

async function useHealStaff(target, staff) {
  if (!castableStaffSpells(player, 'heal').includes(staff) || !healTargets(player, staff).includes(target)) return;
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
  spendWeaponUse(player, staff);
  const rankUps = [];
  recordRankUp(player, staff, rankUps);
  setMessage(withRankUps(`${player.name} cast ${staff.name} and healed ${target.name} for ${healed} HP.`, rankUps));
  await casting;
  await wait(1100);
  const experienceGained = staff.healExperience ?? 20;
  const progression = awardExperience(player, experienceGained);
  await showExperienceProgression(progression, experienceGained);
  gameState.mode = 'unit';
  finishUnit();
}

function freezeTargets(unit, staff) {
  if (unit.acted || !(staff ? [staff] : castableStaffSpells(unit, 'freeze')).length) return [];
  return enemies.filter((enemy) => {
    const distance = distanceBetween(unit.x, unit.z, enemy.x, enemy.z);
    return enemy.hp > 0 && !enemy.frozen && distance >= 1 && distance <= freezeRange(unit);
  });
}

// frozen counts the enemy phases the foe still sits out (Stasis lasts two); 0 thaws it.
function setEnemyFrozen(enemy, turns) {
  enemy.frozen = turns > 0 ? turns : false;
  enemy.mesh.material.color.set(enemy.frozen ? 0x8fd4ff : 0xffffff);
}

function showFreezeTargets(staff) {
  showStaffDialog(`${staff.name}: freeze who?`, freezeTargets(player, staff).map((target) => ({
    label: `${target.name} · ${target.hp}/${target.maxHp} HP · ${freezeHitRate(player, target, staff)}% Hit`,
    onClick: () => void useFreezeStaff(target, staff),
  })));
}

async function useFreezeStaff(target, staff) {
  if (!castableStaffSpells(player, 'freeze').includes(staff) || !freezeTargets(player, staff).includes(target)) return;
  if (healDialog.open) healDialog.close();
  gameState.mode = 'combat';
  combatants.add(player);
  combatants.add(target);
  renderTacticalUi();
  player.facing = getFacing(target.x - player.x, target.z - player.z);
  const casting = playAttackAnimation(player, player.facing, false, true);
  await wait(450);
  const turns = staff.freezeTurns ?? 1;
  const frozen = rollHit(freezeHitRate(player, target, staff));
  if (frozen) setEnemyFrozen(target, turns);
  showCombatResult(target, frozen ? 'FROZEN' : 'Miss', frozen ? 'freeze' : 'miss');
  spendWeaponUse(player, staff);
  const rankUps = [];
  recordRankUp(player, staff, rankUps);
  setMessage(withRankUps(frozen
    ? `${player.name}'s ${staff.name} freezes ${target.name}. It cannot move for ${turns === 1 ? 'the next enemy phase' : `the next ${turns} enemy phases`}.`
    : `${target.name} resists ${player.name}'s ${staff.name}.`, rankUps));
  await casting;
  await wait(1100);
  const experienceGained = staff.freezeExperience ?? 20;
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

// itemId may be a spell (Blaze), cast from the tome it is written in.
function equipInventoryWeapon(itemId) {
  const weapon = INVENTORY_ITEMS.get(itemId);
  const entry = findWeaponEntry(player, weapon);
  if (!entry || weapon?.itemType !== 'weapon' || (weapon.spellbook && !isSpellUnlocked(weapon.id))) {
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
  if (!player.inventory.includes(entry) || item?.itemType !== 'consumable' || !item.heal || player.hp >= player.maxHp) return;

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

// One combined view: the stat profile plus what the enemy carries.
function openEnemyProfile(enemy) {
  openUnitProfile(enemy, player);
  const list = document.querySelector('#profile-enemy-items');
  list.replaceChildren();
  const entries = [];
  if (enemy.weapon && !enemy.inventory) entries.push({ entry: { id: enemy.weapon.id, uses: null }, label: 'Equipped' });
  for (const entry of enemy.inventory ?? []) {
    entries.push({ entry, label: INVENTORY_ITEMS.get(entry.id)?.type === 'Staff'
      ? 'Active staff · can be stolen · does not drop' : 'Equipped tome' });
    for (const [spellId, uses] of Object.entries(entry.spells ?? {})) {
      const spell = INVENTORY_ITEMS.get(spellId);
      if (spell?.heal) entries.push({ entry: { id: spellId, uses }, label: `Cast from ${INVENTORY_ITEMS.get(entry.id).name} · range ${healStaffRange(enemy, spell)}` });
    }
  }
  if (enemy.drop) entries.push({ entry: { id: enemy.drop, uses: INVENTORY_ITEMS.get(enemy.drop)?.maxUses ?? null }, label: 'Drops on defeat' });
  for (const id of enemy.stealable ?? []) entries.push({ entry: { id, uses: INVENTORY_ITEMS.get(id).maxUses ?? null }, label: 'Can be stolen · does not drop' });
  for (const { entry, label } of entries) list.append(itemRow(entry, label, true, undefined, false));
  document.querySelector('#profile-enemy-note').textContent = enemy.drop
    ? 'Defeat this enemy to claim its drop.'
    : stealableItems(enemy).length ? 'Lena can steal a carried item when faster. Stolen staves retain remaining uses and cannot be cast by the priest afterward.' : 'This enemy carries nothing of value.';
  document.querySelector('#profile-enemy-inventory').hidden = false;
}

function toggleEnemyRange(enemy) {
  if (pinnedEnemyRanges.has(enemy)) pinnedEnemyRanges.delete(enemy);
  else pinnedEnemyRanges.add(enemy);
  refreshHighlights();
  setMessage(pinnedEnemyRanges.has(enemy)
    ? `Showing ${enemy.name}'s range. Press Space on it again to hide, or I for details.`
    : `Hid ${enemy.name}'s range.`);
}

function capitalize(text) {
  return `${text[0].toUpperCase()}${text.slice(1)}`;
}

function selectableMeshes() {
  return [...defendingUnits(), ...enemies].map((unit) => unit.mesh);
}

function unitForMesh(mesh) {
  return [...defendingUnits(), ...enemies].find((unit) => unit.mesh === mesh) ?? null;
}

function playerUnitAt(x, z) {
  return playerTeam.find((unit) => unit.hp > 0 && unit.x === x && unit.z === z) ?? null;
}

function houseAvailableToVisit(unit) {
  return activeLevel.houses.find((house) =>
    !house.visited &&
    (house.villagerId
      ? rescueState?.villagers.some((villager) => villager.id === house.villagerId && villager.status === 'sheltered' && villager.hp > 0) &&
        distanceBetween(unit.x, unit.z, house.door.x, house.door.z) <= 1
      : unit.x === house.door.x && unit.z === house.door.z));
}

function chestAvailableToOpen(unit) {
  return activeLevel.chests.find((chest) =>
    !chest.opened && unit.x === chest.x && unit.z === chest.z);
}

async function openChest() {
  if (!gameState.selected || gameState.phase !== 'player' || player.acted) return;
  const chest = chestAvailableToOpen(player);
  if (!chest) return;
  const picksLock = hasLockpick(player);
  const keyIndex = player.inventory.findIndex((entry) => entry.id === 'chest-key');
  if (!picksLock && keyIndex < 0) {
    setMessage(`${chest.name} is locked. ${player.name} needs a Chest Key.`);
    return;
  }
  if (!picksLock) player.inventory.splice(keyIndex, 1);
  const { item, toConvoy } = grantItem(player, chest.rewardId);
  chest.opened = true;
  levelGroup.userData.waitingCity?.sync();
  chest.mesh.material.opacity = 0.35;
  if (chest.glow) chest.glow.intensity = 0;
  player.acted = true;
  const opened = picksLock ? `${player.name} picked the lock` : `${player.name} unlocked the chest`;
  setMessage(toConvoy
    ? `${opened}. Their inventory is full, so ${item.name} was sent to the convoy.`
    : `${opened} and found ${item.name}.`);
  renderTacticalUi();
  await itemPopup.show([{ unit: player, item, toConvoy }]);
  finishUnit();
}

const hasLockpick = (unit) => getClassAbilities(unit).some((ability) => ability.lockpick);
const hasPickpocket = (unit) => getClassAbilities(unit).some((ability) => ability.steal);

function openInfirmaryActions() {
  if (!gameState.selected || gameState.phase !== 'player' || gameState.mode !== 'unit' || player.acted) return;
  const actions = infirmaryActions(activeLevel, player, [...playerTeam, ...enemies]);
  if (!actions.length) return;
  gameState.mode = 'heal';
  healDialog.querySelector('#heal-heading').textContent = 'Infirmary Objectives';
  const list = healDialog.querySelector('#heal-targets');
  list.replaceChildren();
  for (const action of actions) {
    const row = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = `${action.name} · ${action.blockedReason ?? `+${action.exp} EXP${action.insight ? ` · +${action.insight} Insight` : ''} · Uses action`}`;
    button.disabled = Boolean(action.blockedReason);
    button.addEventListener('click', () => void actInInfirmary(action.id));
    row.append(button);
    list.append(row);
  }
  renderTacticalUi();
  healDialog.showModal();
  list.querySelector('button:not(:disabled)')?.focus();
}

async function actInInfirmary(id) {
  if (gameState.phase !== 'player' || gameState.mode !== 'heal' || player.acted) return;
  const available = infirmaryActions(activeLevel, player, [...playerTeam, ...enemies]).find((action) => action.id === id);
  if (!available || available.blockedReason) {
    setMessage(available?.blockedReason ?? 'This objective is no longer available.');
    return;
  }
  const action = performInfirmaryAction(activeLevel, player, id, [...playerTeam, ...enemies]);
  healDialog.close();
  gameState.mode = 'combat';
  const progression = awardExperience(player, action.exp);
  const receipts = [];
  if (action.insight) addInsight(action.insight);
  if (action.kind === 'patient') {
    receipts.push({ unit: player, ...grantItem(player, action.target.rewardId ?? 'potion') });
    if (action.target.mesh) action.target.mesh.visible = false;
  }
  if (action.kind === 'ledger' && action.target.mesh) action.target.mesh.material.opacity = 0.35;
  if (action.kind === 'gate') {
    for (const mesh of action.target.meshes ?? []) mesh.visible = true;
    for (const mesh of action.target.openMeshes ?? []) mesh.visible = false;
    playGateRumble();
  }
  refreshInsightLabel();
  setMessage(`${player.name}: ${action.name}. +${action.exp} EXP${action.kind === 'ledger' ? `, +${action.insight} Insight. The records expose the Church experiments.` : action.kind === 'gate' ? '. This entrance will send no more reinforcements.' : '. The patient reaches the service passage safely.'}`);
  renderTacticalUi();
  saveCurrentGame();
  await showExperienceProgression(progression, action.exp);
  if (action.kind === 'ledger') await tutorialPopup.show('infirmaryRecords', {}, { force: true });
  if (receipts.length) await itemPopup.show(receipts);
  gameState.mode = 'unit';
  finishUnit();
}

async function completeInfirmaryDefense() {
  const rules = activeLevel.infirmary;
  if (!infirmaryVictoryReady(activeLevel)) return false;
  const rewards = claimInfirmaryCompletion(activeLevel, playerTeam);
  const message = `The ward held for ${rules.defendTurns} turns. ${rules.patients.filter((patient) => patient.rescued).length}/${rules.patients.length} stranded patients rescued. ${rules.ledger.collected ? 'The treatment ledger is secured.' : 'The ledger is lost in the flames.'} Each surviving deployed ally earns ${rules.completionExp} EXP.`;
  completeVictory(message);
  hideTerminalScreen();
  for (const reward of rewards) await showExperienceProgression(reward.progression, rules.completionExp, reward.unit);
  await tutorialPopup.show('infirmaryEnding', { evidence: rules.ledger.collected ? 'The ledger names a crimson emblem used to stabilize the treatment. Rictor recognizes the crest he gave Maria.' : 'Without the ledger, Rictor has only what he witnessed: the Church sealed living patients inside with the dead.' }, { force: true });
  experienceDisplay.reset(player.level, player.experience);
  showTerminalScreen('victory', message);
  return true;
}

function cellAvailableToUnlock(unit) {
  if (unit.acted || (!hasLockpick(unit) && !unit.inventory.some((entry) => entry.id === 'chest-key'))) return undefined;
  return activeLevel.cells.find((cell) =>
    !cell.opened && distanceBetween(unit.x, unit.z, cell.door.x, cell.door.z) === 1);
}

// Hunched prisoners wait in the dark behind closed doors. They are drawn as villagers until the door opens.
let prisonerSilhouettes = [];

function refreshPrisonerSilhouettes() {
  for (const figure of prisonerSilhouettes) {
    scene.remove(figure.mesh);
    figure.mesh.material.dispose();
  }
  prisonerSilhouettes = [];
  for (const cell of activeLevel.cells) {
    if (cell.opened) continue;
    for (const prisoner of cell.prisoners) {
      const figure = { ...prisoner, cellId: cell.id, spriteSet: 'villager', facing: 'south', hp: 1, maxHp: 1 };
      createUnitMesh(figure);
      figure.mesh.material.color.set(0x5d5866);
      prisonerSilhouettes.push(figure);
    }
  }
}

async function unlockCell() {
  if (!gameState.selected || gameState.mode !== 'unit' || gameState.phase !== 'player' || player.acted) return;
  const cell = cellAvailableToUnlock(player);
  if (!cell) return;
  const picksLock = hasLockpick(player);
  if (!picksLock) {
    const keyIndex = player.inventory.findIndex((entry) => entry.id === 'chest-key');
    if (keyIndex < 0) return;
    player.inventory.splice(keyIndex, 1);
  }
  cell.opened = true;
  if (cell.mesh) cell.mesh.visible = false;
  player.acted = true;
  player.facing = getFacing(cell.door.x - player.x, cell.door.z - player.z);
  setIdleSprite(player);
  gameState.mode = 'combat';
  playDoorCreak();
  setMessage(`${player.name} ${picksLock ? 'picks the lock' : 'turns a Chest Key in the lock'}. The cell door swings open.`);
  renderTacticalUi();
  await wait(600);
  const figures = prisonerSilhouettes.filter((figure) => figure.cellId === cell.id);
  prisonerSilhouettes = prisonerSilhouettes.filter((figure) => figure.cellId !== cell.id);
  const revealed = [];
  for (const figure of figures) {
    scene.remove(figure.mesh);
    figure.mesh.material.dispose();
    const undead = createEnemy(figure.x, figure.z, figure.id, { level: figure.level, ai: 'guard' });
    enemies.push(undead);
    revealed.push(undead);
    showCombatResult(undead, 'UNDEAD!', 'critical');
  }
  if (revealed.length) {
    playHitImpact({ critical: true });
    setMessage(`The prisoner${revealed.length > 1 ? 's lurch' : ' lurches'} upright. ${revealed.length > 1 ? 'They are' : 'It is'} not alive anymore!`);
    await wait(1100);
  }
  saveCurrentGame();
  gameState.mode = 'unit';
  finishUnit();
}

function stealTargets(unit) {
  if (!hasPickpocket(unit) || unit.acted) return [];
  return enemies.filter((enemy) =>
    enemy.hp > 0 && stealableItems(enemy).length && distanceBetween(unit.x, unit.z, enemy.x, enemy.z) === 1);
}

function openSteal() {
  if (!gameState.selected || gameState.mode !== 'unit') return;
  const targets = stealTargets(player);
  if (!targets.length) return;
  gameState.mode = 'heal';
  renderTacticalUi();
  healDialog.querySelector('#heal-heading').textContent = 'Steal from whom?';
  const list = healDialog.querySelector('#heal-targets');
  list.replaceChildren();
  for (const target of targets) {
    for (const itemId of stealableItems(target)) {
      const row = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      const faster = player.speed > target.speed;
      button.textContent = `${target.name} · ${INVENTORY_ITEMS.get(itemId).name} · ${faster ? 'Steal' : `Too slow (Spd ${player.speed} vs ${target.speed})`}`;
      button.disabled = !faster;
      button.addEventListener('click', () => void stealFrom(target, itemId));
      row.append(button);
      list.append(row);
    }
  }
  healDialog.showModal();
  list.querySelector('button:not(:disabled)')?.focus();
}

async function stealFrom(target, itemId) {
  if (!canSteal(player, target, itemId)) return;
  if (healDialog.open) healDialog.close();
  gameState.mode = 'combat';
  player.facing = getFacing(target.x - player.x, target.z - player.z);
  setIdleSprite(player);
  const { item, toConvoy } = stealItem(player, target, itemId);
  const marker = !target.drop && target.mesh.userData.dropMarker;
  if (marker) {
    target.mesh.remove(marker);
    marker.material.dispose();
    delete target.mesh.userData.dropMarker;
  }
  player.acted = true;
  showCombatResult(target, 'STOLEN', 'freeze');
  setMessage(toConvoy
    ? `${player.name} lifts ${item.name} from ${target.name}. Her hands are full, so it goes to the convoy.`
    : `${player.name} lifts ${item.name} from ${target.name} without a sound.`);
  renderTacticalUi();
  await itemPopup.show([{ unit: player, item, toConvoy }]);
  gameState.mode = 'unit';
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
  if (player.level < 20 || !canPromote(player)) return;
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

const STAT_ITEM_EFFECTS = {
  'strength-up': { stat: 'strength', verb: 'winds the pocketwatch' },
  'speed-up': { stat: 'speed', verb: 'takes the fang' },
  'hp-up': { stat: 'maxHp', verb: 'drinks the tonic' },
};

async function usePocketwatch(entry) {
  const item = INVENTORY_ITEMS.get(entry.id);
  const { stat, verb } = STAT_ITEM_EFFECTS[item.effect];
  const amount = item.amount ?? 2;
  closeInventory();
  gameState.mode = 'combat';
  combatants.add(player);
  renderTacticalUi();
  player[stat] += amount;
  if (stat === 'maxHp') player.hp += amount;
  player.inventory.splice(player.inventory.indexOf(entry), 1);
  saveCurrentGame();
  setMessage(`${player.name} ${verb}. ${stat === 'maxHp' ? 'Max HP' : capitalize(stat)} +${amount}!`);
  renderTacticalUi();
  await wait(1400);
  gameState.mode = 'unit';
  finishUnit();
}

// Defeated enemies carrying an item hand it to whoever landed the final blow.
async function collectEnemyDrop(enemy, recipient) {
  if (enemy.id === 'corvis' && activeLevel.courtyard && !activeLevel.courtyard.recruit.recruited) {
    activeLevel.courtyard.recruit.dead = true;
    saveCurrentGame();
    await tutorialPopup.show('corvisLost', {}, { force: true });
  }
  const cargo = releaseWagonCargo(enemy);
  if (cargo) setMessage('The wagon splits open, and its "patient" climbs out of the straw.');
  let gateBeast;
  if (shouldSpawnGateBeast(activeLevel, enemies)) {
    const encounter = activeLevel.gateEncounter;
    encounter.spawned = true;
    gateBeast = createEnemy(encounter.x, encounter.z, encounter.beastId, { ai: 'stationary' });
    gateBeast.mesh.visible = false;
    enemies.push(gateBeast);
  }
  const receipt = enemy.drop ? { unit: recipient, ...grantItem(recipient, enemy.drop) } : null;
  if (enemy.isBoss) gainInsight(BOSS_INSIGHT, `${enemy.name} defeated`);
  // Persist both rewards before waiting so reloading the notification cannot lose the drop.
  if (enemy.isBoss || receipt) saveCurrentGame();
  if (enemy.isBoss) await itemPopup.showInsight(enemy.name, BOSS_INSIGHT, getInsight());
  if (receipt) await itemPopup.show([receipt]);
  if (gateBeast) await revealGateBeast(gateBeast);
}

// Only opposing units block movement; teammates can be walked through.
function movementObstacles() {
  return [...enemies.filter((enemy) => enemy.hp > 0), ...neutralUnits()];
}

function unitAtTile(x, z) {
  const friendly = playerUnitAt(x, z);
  if (friendly) return friendly;
  const neutral = neutralUnits().find((unit) => unit.x === x && unit.z === z);
  if (neutral) return neutral;
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
  if (unit.civilian || neutralUnits().includes(unit)) {
    const note = document.createElement('small');
    note.textContent = unit.civilian
      ? unit.status === 'sheltered' ? 'Visit this house to begin an escort.' : 'Escorting to the green refuge. Keep the route clear.'
      : unit === eveline ? 'Move Rictor adjacent and choose Talk to recruit. Undead can attack her.' : 'Move Maria adjacent and choose Talk to recruit.';
    weapon.append(note);
  }
  if (unit.id === 'corvis' && enemies.includes(unit) && activeLevel.courtyard) {
    const note = document.createElement('small');
    note.textContent = 'Move Eveline adjacent and choose Talk to recruit.';
    weapon.append(note);
  }
  if (unit.frozen && playerTeam.includes(unit)) {
    const note = document.createElement('small');
    note.textContent = 'Frozen: movement blocked this player phase; actions available.';
    weapon.append(note);
  }
  if (unit.weapon?.effect?.length) {
    const effect = document.createElement('small');
    effect.textContent = `Effective vs ${unit.weapon.effect.join(', ')}`;
    weapon.append(effect);
  }
  if (unit.weapon?.reaves?.length) {
    const reaves = document.createElement('small');
    reaves.textContent = `Double triangle: strong vs ${unit.weapon.reaves.join(', ')}, weak vs ${unit.weapon.type === 'Spear' ? 'Sword' : 'Axe'}`;
    weapon.append(reaves);
  }
  if (unit.drop) {
    const carries = document.createElement('small');
    carries.textContent = `Drops ${INVENTORY_ITEMS.get(unit.drop)?.name ?? unit.drop}`;
    weapon.append(carries);
  }
  for (const id of unit.stealable ?? []) {
    const carries = document.createElement('small');
    carries.textContent = `Can be stolen: ${INVENTORY_ITEMS.get(id).name} · no drop`;
    weapon.append(carries);
  }
  if (enemies.includes(unit)) for (const entry of unit.inventory ?? []) {
    if (INVENTORY_ITEMS.get(entry.id)?.type !== 'Staff') continue;
    const carries = document.createElement('small');
    carries.textContent = `Can be stolen: ${INVENTORY_ITEMS.get(entry.id).name} · ${entry.uses} uses · no drop`;
    weapon.append(carries);
    for (const [spellId, uses] of Object.entries(entry.spells ?? {})) {
      const spell = INVENTORY_ITEMS.get(spellId);
      if (!spell?.heal) continue;
      const cast = document.createElement('small');
      cast.textContent = `Casts ${spell.name} · range ${healStaffRange(unit, spell)} · ${uses} uses`;
      weapon.append(cast);
    }
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
  for (const unit of [...playerTeam, ...neutralUnits(), ...enemies]) {
    const row = document.createElement('tr');
    row.className = playerTeam.includes(unit) ? 'player' : enemies.includes(unit) ? 'enemy' : 'neutral';
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
  if (activeLevel.courtyard && !activeLevel.courtyard.recruit.recruited &&
    !enemies.some((enemy) => enemy.id === 'corvis' && enemy.hp > 0)) {
    activeLevel.courtyard.recruit.dead = true;
  }
  if (activeLevel.streets && !activeLevel.streets.recruit.recruited) {
    activeLevel.streets.recruit.hp = Math.max(0, eveline.hp);
    activeLevel.streets.recruit.dead = eveline.hp <= 0;
    activeLevel.streets.recruit.inventory = eveline.inventory.map(copyEntry);
  }
  phaseLabel.textContent = `${gameState.phase.toUpperCase()} PHASE - TURN ${gameState.turn}`;
  objectiveLabel.textContent = `OBJECTIVE · ${objectiveDescription()}`;
  const rescueStatus = document.querySelector('#rescue-status');
  rescueStatus.hidden = !rescueState && !activeLevel.infirmary && !activeLevel.streets;
  const rescueDestination = document.querySelector('#rescue-destination');
  rescueDestination.hidden = !rescueState;
  if (rescueState) {
    const wave = activeLevel.reinforcements.find((entry) => !entry.spawned);
    const warning = wave
      ? `${wave.turn === gameState.turn + 1 ? 'WARNING: ' : ''}Next forest wave: turn ${wave.turn}`
      : 'All forest waves have arrived';
    rescueStatus.textContent = `${rescueState.villagers.map((unit) => `${unit.name}: ${unit.status} (${unit.hp} HP)`).join(' · ')}. ${warning}.`;
    rescueDestination.textContent = 'REFUGE: green tiles on the west edge. Escorts walk up to 3 tiles before each enemy phase, then leave safely.';
  }
  if (activeLevel.infirmary) {
    rescueStatus.textContent = infirmaryWarning(activeLevel, gameState.turn);
    rescueDestination.hidden = false;
    rescueDestination.textContent = 'DEFEND: the marked service door. Adjacent Ward Objectives seal gates, rescue patients, and recover the ledger. Each can be completed once.';
  }
  if (activeLevel.streets) {
    rescueStatus.hidden = false;
    rescueStatus.textContent = streetWarning(activeLevel, gameState.turn);
    rescueDestination.hidden = false;
    rescueDestination.textContent = 'RECRUIT: Troy can clear the eastern street, but Rictor must Talk to Eveline. Visit three houses; Lena can steal the attendant’s emblem. Defeat Veyr, then move Rictor onto the gate controls.';
  }
  if (activeLevel.courtyard) {
    rescueStatus.hidden = false;
    rescueStatus.textContent = activeLevel.courtyard.triggers.map((trigger) => {
      const wave = activeLevel.reinforcements.find((entry) => entry.entranceId === trigger.id);
      const name = trigger.id === 'courtyard-ravens' ? 'Ravens' : 'Cavalry';
      return `${name}: ${wave.spawned ? 'arrived' : trigger.warnedTurn === null ? 'not signaled' : `WARNING: turn ${wave.turn}`}`;
    }).join(' · ');
  }
  const movementUnit = player.movement === 1 ? 'tile' : 'tiles';
  const rangeText = weaponRangeLabel(player.weapon);
  updateUnitHoverCard();
  backActionButton.textContent = player.moveOrigin && player.moved && !player.acted
    ? 'Back · Undo Move'
    : 'Back';
  actionPanel.hidden = !gameState.selected || gameState.mode !== 'unit';
  actionPanel.querySelector('strong').textContent = player.name.toUpperCase();
  document.querySelector('#attack-action').disabled = player.acted || !attackWeapons(player).some((weapon) => !weaponUseBlockReason(player, weapon));
  const house = houseAvailableToVisit(player);
  visitActionButton.hidden = !house;
  visitActionButton.textContent = house?.villagerId ? 'Rescue Villager' : 'Visit';
  visitActionButton.title = house?.villagerId
    ? 'Begin this villager\'s automatic escort to the western refuge. Uses this unit\'s action.'
    : 'Visit this house.';
  const streetTalk = canRecruitEveline(activeLevel, player, eveline);
  const corvisTalk = canRecruitCorvis(activeLevel, player, enemies.find((enemy) => enemy.id === 'corvis'));
  const reunionTalk = canReunite(activeLevel, player, player === maria ? rictor : maria);
  document.querySelector('#talk-action').hidden = !reunionTalk && !streetTalk && !corvisTalk && !canRecruitLinus(player, linus, rescueState);
  document.querySelector('#talk-action').textContent = reunionTalk ? `Talk to ${player === maria ? 'Rictor' : 'Maria'}`
    : corvisTalk ? 'Talk to Corvis' : streetTalk ? 'Talk to Eveline' : 'Talk to Linus';
  const chestHere = chestAvailableToOpen(player);
  chestActionButton.hidden = !chestHere;
  const unlockButton = document.querySelector('#unlock-action');
  unlockButton.hidden = !gameState.selected || !cellAvailableToUnlock(player);
  unlockButton.textContent = hasLockpick(player) ? 'Pick Lock' : 'Unlock Cell (Key)';
  document.querySelector('#steal-action').hidden = !gameState.selected || stealTargets(player).length === 0;
  document.querySelector('#infirmary-action').hidden = !gameState.selected || infirmaryActions(activeLevel, player, [...playerTeam, ...enemies]).length === 0;
  document.querySelector('#beacon-action').hidden = !gameState.selected || !availableBeacon(activeLevel, player);
  document.querySelector('#mechanism-action').hidden = !gameState.selected || !availableMechanism(activeLevel, player);
  document.querySelector('#trade-action').hidden = !gameState.selected || adjacentAllies(player).length === 0;
  document.querySelector('#convoy-action').hidden = !gameState.selected || player.acted || !canAccessConvoy(player);
  document.querySelector('#heal-action').hidden = !gameState.selected || healTargets(player).length === 0;
  document.querySelector('#freeze-action').hidden = !gameState.selected || freezeTargets(player).length === 0;
  actionHelp.textContent = gameState.mode === 'move'
    ? `Choose a tile within ${player.movement} ${movementUnit}; the blue line previews the route.`
    : gameState.mode === 'attack'
      ? `Choose a target in weapon range ${rangeText}, then press Space or Enter.`
      : house?.villagerId && !player.acted
        ? 'Rescue Villager starts an automatic escort to the western refuge and uses this unit\'s action.'
        : `${player.moved ? 'Movement complete' : 'Choose an action'} · ${player.moveOrigin && !player.acted ? 'Undo Move is available' : player.acted ? 'Acted' : `Attack, inventory, profile${house ? ', visit house' : ''}${adjacentAllies(player).length ? ', trade' : ''}, or end unit`}`;
  refreshHighlights();
  saveCurrentGame();
}

function focusActionMenu() {
  const nextButton = actionButtons.find((button) => !button.disabled && !button.hidden);
  nextButton?.focus({ preventScroll: true });
}

function moveTradeFocus(direction) {
  const columns = ['left', 'right'].map((side) =>
    [...tradeDialog.querySelectorAll(`#trade-${side}-items button:not(:disabled)`)]);
  const done = tradeDialog.querySelector('#trade-close');
  const partners = [...tradeDialog.querySelectorAll('#trade-partners button:not(:disabled)')];
  const focused = document.activeElement;
  const side = columns.findIndex((buttons) => buttons.includes(focused));
  if (side < 0) {
    const all = [...partners, ...columns[0], ...columns[1], done];
    if (!all.includes(focused)) all[0]?.focus();
    else if (focused === done && direction === 'up') (columns[0].at(-1) ?? columns[1].at(-1))?.focus();
    else if (partners.includes(focused) && direction === 'down') (columns[0][0] ?? columns[1][0] ?? done).focus();
    else if (partners.includes(focused) && (direction === 'left' || direction === 'right')) {
      const next = partners[partners.indexOf(focused) + (direction === 'right' ? 1 : -1)];
      next?.focus();
    }
    document.activeElement?.scrollIntoView({ block: 'nearest' });
    return;
  }
  const buttons = columns[side];
  const index = buttons.indexOf(focused);
  let target;
  if (direction === 'down') target = buttons[index + 1] ?? done;
  else if (direction === 'up') target = buttons[index - 1] ?? partners[0] ?? buttons[index];
  else {
    const other = columns[1 - side];
    const targetSide = direction === 'right' ? 1 : 0;
    if (targetSide === side || !other.length) return;
    const rowTop = focused.getBoundingClientRect().top;
    target = other.reduce((best, button) =>
      Math.abs(button.getBoundingClientRect().top - rowTop) < Math.abs(best.getBoundingClientRect().top - rowTop) ? button : best);
  }
  target?.focus({ preventScroll: true });
  target?.scrollIntoView({ block: 'nearest' });
}

function moveActionFocus(container, direction) {
  if (container === tradeDialog) {
    moveTradeFocus(direction);
    return;
  }
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
  closest?.scrollIntoView({ block: 'nearest' });
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
  if (activeLevel.rescue) {
    const here = (tile) => tile.x === x && tile.z === z;
    if (activeLevel.rescue.refuge.some(here)) {
      document.querySelector('#tile-inspection-name').textContent = 'Refuge';
      document.querySelector('#tile-inspection-details').textContent = 'Escorted villagers become safe here.';
    } else if (here(activeLevel.exit)) {
      document.querySelector('#tile-inspection-name').textContent = 'Bridge Entrance';
      document.querySelector('#tile-inspection-details').textContent = 'Bring Maria here after the rescues, beast waves, and captain are resolved.';
    } else {
      const turns = activeLevel.reinforcements.filter((wave) => wave.units.some(here)).map((wave) => wave.turn);
      if (turns.length) {
        document.querySelector('#tile-inspection-name').textContent = 'Forest Approach';
        document.querySelector('#tile-inspection-details').textContent = `Beasts arrive on turn${turns.length > 1 ? 's' : ''} ${turns.join(', ')}.`;
      }
    }
  }
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
  if (!gameState.selected || player.moved || player.acted || player.frozen) return;
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
  const blocked = new Set(movementObstacles().map((unit) => tileKey(unit.x, unit.z)));
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
  if (!gameState.selected || gameState.mode !== 'unit' || player.acted) return;
  gameState.mode = 'heal';
  renderTacticalUi();
  showStaffDialog('Choose a weapon or spell', attackWeapons(player).map((weapon) => {
    const blocked = weaponUseBlockReason(player, weapon);
    return {
      weapon, label: blocked ?? 'Use', disabled: Boolean(blocked),
      onClick: () => {
        const reason = weaponUseBlockReason(player, weapon);
        if (reason) {
          setMessage(reason);
          return;
        }
        healDialog.close();
        equipAttackWeapon(player, weapon);
        setIdleSprite(player);
        saveCurrentGame();
        beginAttackTargeting();
      },
    };
  }));
}

function beginAttackTargeting() {
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
    const attacks = opponent ? getAvailableStrikeCount(unit, getAttackCount(unit, opponent) * getStrikesPerAttack(unit)) : 0;
    const damage = opponent ? getCombatDamage(unit, opponent, terrain) : 0;
    const rows = [
      ['HP', `${unit.hp}/${unit.maxHp}`],
      ['Weapon', unit.weapon?.name ?? 'None'],
      ['Damage', opponent ? `${damage} × ${attacks} (${damage * attacks} max)` : '—'],
      ['Hit', opponent ? `${getHitRate(unit, opponent, terrain)}%` : '—'],
      ['Crit', opponent ? `${getCriticalRate(unit, opponent)}%` : '—'],
    ];
    if (unit.weapon?.lifeSteal) rows.push(['Drain', 'Heals half actual damage on each hit']);
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
  while (pendingRankUps.length) await rankUpDialogUi.show(pendingRankUps.shift());
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
  tutorialProgress.combatSeen = true;
  renderTacticalUi();
  const terrain = getTerrain(activeLevel, target.x, target.z);
  const damage = getCombatDamage(player, target, terrain);
  const criticalDamage = getCriticalDamage(player, target, terrain);
  const playerVolleys = getAttackCount(player, target);
  const playerAttackCount = getAvailableStrikeCount(player, playerVolleys * getStrikesPerAttack(player));
  const hitRate = getHitRate(player, target, terrain);
  const criticalRate = getCriticalRate(player, target);
  // Spend the use only after the forecast is locked in, so a tome's final use still strikes.
  if (player.weapon.type !== 'Gun') spendWeaponUse(player);
  const playerStrikeResults = Array.from({ length: playerAttackCount }, () => {
    const hit = rollHit(hitRate);
    return { hit, critical: hit && rollCritical(criticalRate) };
  });
  let playerHits = 0;
  let playerCriticalHits = 0;
  let playerTotalDamage = 0;
  const rankUps = [];
  // Brave volleys stay consecutive, with gunshots capped to the loaded rounds.
  const counterRange = distanceBetween(target.x, target.z, player.x, player.z);
  const canCounter = isInWeaponRange(target, player, counterRange);
  let counterDamage = 0;
  let counterCriticalDamage = 0;
  let counterAttackCount = 0;
  let counterVolleys = 0;
  let counterResults = [];
  if (canCounter) {
    target.facing = getFacing(player.x - target.x, player.z - target.z);
    setIdleSprite(target);
    const counterTerrain = getTerrain(activeLevel, player.x, player.z);
    counterDamage = getCombatDamage(target, player, counterTerrain);
    counterCriticalDamage = getCriticalDamage(target, player, counterTerrain);
    counterVolleys = getAttackCount(target, player);
    counterAttackCount = getAvailableStrikeCount(target, counterVolleys * getStrikesPerAttack(target));
    const counterHitRate = getHitRate(target, player, counterTerrain);
    const counterCriticalRate = getCriticalRate(target, player);
    counterResults = Array.from({ length: counterAttackCount }, () => {
      const hit = rollHit(counterHitRate);
      return { hit, critical: hit && rollCritical(counterCriticalRate) };
    });
    if (target.weapon.type !== 'Gun') spendWeaponUse(target);
  }

  const strikeOrder = getCombatStrikeOrder(player, target, playerVolleys, counterVolleys);
  let playerStrike = 0;
  let counterStrike = 0;
  for (const side of strikeOrder) {
    if (target.hp <= 0 || player.hp <= 0) break;
    if (side === 'attacker') {
      if (player.weapon.type === 'Gun') {
        if (!canAttack(player)) continue;
        spendWeaponUse(player);
      }
      const round = playerStrike++;
      setMessage(`${player.name} attacks ${target.name} (${round + 1}/${playerAttackCount}).`);
      await attack(player.facing, round > 0);
      const result = playerStrikeResults[round];
      if (result.hit) {
        playerHits++;
        recordWeaponHit(player, rankUps);
        if (result.critical) playerCriticalHits++;
        const strikeDamage = Math.min(target.hp, result.critical ? criticalDamage : damage);
        target.hp -= strikeDamage;
        const drained = healDamageDealt(player, strikeDamage);
        if (drained > 0) showCombatResult(player, `+${drained}`, 'heal');
        playerTotalDamage += strikeDamage;
        showCombatResult(target, `-${strikeDamage}`, result.critical ? 'critical' : 'hit');
      } else {
        showCombatResult(target, 'MISS', 'miss');
      }
      await wait(400);
      if (target.hp === 0) break;
    } else {
      if (target.weapon.type === 'Gun') {
        if (!canAttack(target)) continue;
        spendWeaponUse(target);
      }
      const round = counterStrike++;
      setMessage(`${target.name} retaliates against ${player.name} (${round + 1}/${counterAttackCount}).`);
      await attackEnemy(target, round > 0);
      const result = counterResults[round];
      if (result.hit) {
        const strikeDamage = Math.min(player.hp, result.critical ? counterCriticalDamage : counterDamage);
        player.hp -= strikeDamage;
        const drained = healDamageDealt(target, strikeDamage);
        if (drained > 0) showCombatResult(target, `+${drained}`, 'heal');
        showCombatResult(player, `-${strikeDamage}`, result.critical ? 'critical' : 'hit');
      } else {
        showCombatResult(player, 'MISS', 'miss');
      }
      await wait(400);
      renderTacticalUi();
    }
  }

  if (target.hp === 0) {
    const healed = healBloodEmblemKill(player);
    if (healed > 0) showCombatResult(player, `+${healed}`, 'heal');
    scene.remove(target.mesh);
    enemies = enemies.filter((enemy) => enemy !== target);
    const experienceGained = getCombatExperience(target, true, player);
    const progression = awardExperience(player, experienceGained);
    await collectEnemyDrop(target, player);
    await showExperienceProgression(progression, experienceGained);
    setMessage(withRankUps(`${player.name} defeats ${target.name}${target.isBoss ? ' (Boss)' : ''} (${playerHits}/${playerAttackCount} hits${playerCriticalHits ? `, ${playerCriticalHits} critical` : ''}, +${experienceGained} EXP${progression?.levelUps ? `, Level ${player.level}!` : ''}).`, rankUps));
    player.acted = true;
    gameState.mode = 'unit';
    finishUnit();
    return;
  }
  if (player.hp <= 0) {
    if (partyDefeated()) {
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
  
  const experienceGained = getCombatExperience(target, false, player);
  const progression = awardExperience(player, experienceGained);
  await showExperienceProgression(progression, experienceGained);
  setMessage(withRankUps(`${player.name} hits ${target.name} ${playerHits}/${playerAttackCount} times${playerCriticalHits ? ` (${playerCriticalHits} critical)` : ''} (${hitRate}% Hit, ${playerTotalDamage} damage, +${experienceGained} EXP).`, rankUps));
  
  player.acted = true;
  gameState.mode = 'unit';
  finishUnit();
}

function recordRankUp(unit, weapon, rankUps) {
  const rank = awardWeaponExp(unit, weapon);
  if (!rank) return;
  rankUps.push(`${unit.name}'s ${weapon.type} level rose to ${rank.id}!`);
  pendingRankUps.push({ unit, type: weapon.type, rank });
}

function recordWeaponHit(unit, rankUps) {
  recordRankUp(unit, unit.weapon, rankUps);
}

function withRankUps(message, rankUps) {
  return rankUps.length ? `${message} ${rankUps.join(' ')}` : message;
}

// Tiles an enemy can stop on this turn. Stationary enemies never leave their tile.
function getEnemyReach(enemy) {
  if (enemy.ai === 'stationary' || enemy.frozen) return new Map([[tileKey(enemy.x, enemy.z), 0]]);
  return getMovementRange(
    enemy,
    activeLevel,
    defendingUnits(),
    enemies.filter((other) => other !== enemy),
  );
}

// Walkable tiles the enemy could hit from any reachable tile, excluding the reachable tiles themselves.
function getEnemyThreatTiles(enemy, reach) {
  const threat = new Map();
  if (!enemy.weapon || enemy.weapon.type === 'Staff' && !enemy.weapon.freeze) return [];
  if (enemy.weapon.freeze && !enemy.inventory?.some((entry) => entry.id === enemy.weapon.id && entry.uses > 0)) return [];
  const maxRange = enemy.weapon.freeze ? freezeRange(enemy) : enemy.weapon.maxRange;
  for (const key of reach.keys()) {
    const [originX, originZ] = key.split(',').map(Number);
    for (let z = originZ - maxRange; z <= originZ + maxRange; z++) {
      for (let x = originX - maxRange; x <= originX + maxRange; x++) {
        const tile = tileKey(x, z);
        if (
          !reach.has(tile) && !threat.has(tile) &&
          isWalkable(activeLevel, x, z, enemy) &&
          (enemy.weapon.freeze
            ? distanceBetween(originX, originZ, x, z) >= 1 && distanceBetween(originX, originZ, x, z) <= maxRange
            : isInWeaponRange(enemy, enemy, distanceBetween(originX, originZ, x, z)))
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
  if (enemy.ai !== 'mobile' || enemy.frozen) return null;
  if (activeLevel.infirmary) return infirmaryApproachTarget(activeLevel, enemy, livingTeam);
  if (enemy.id === 'street-undead' && livingTeam.includes(eveline)) return eveline;
  return livingTeam.reduce((nearest, unit) =>
    distanceBetween(enemy.x, enemy.z, unit.x, unit.z) < distanceBetween(enemy.x, enemy.z, nearest.x, nearest.z)
      ? unit : nearest);
}

// Thrones and similar tiles restore their occupant at the start of that unit's phase.
async function healOnRestorativeTiles(units) {
  let healedAny = false;
  for (const unit of units) {
    const heal = getTerrain(activeLevel, unit.x, unit.z).healPerTurn;
    if (!heal || unit.hp <= 0 || unit.hp >= unit.maxHp) continue;
    const healed = Math.min(heal, unit.maxHp - unit.hp);
    unit.hp += healed;
    showCombatResult(unit, `+${healed}`, 'heal');
    setMessage(`${unit.name} recovers ${healed} HP on the ${getTerrain(activeLevel, unit.x, unit.z).name}.`);
    healedAny = true;
  }
  if (!healedAny) return;
  renderTacticalUi();
  await wait(700);
}

async function enemyPhase() {
  gameState.phase = 'enemy';
  gameState.selected = false;
  gameState.mode = 'cursor';
  renderTacticalUi();
  showPhaseBanner('Enemy', gameState.turn);
  await wait(900);
  if (activeLevel.abyssalThrone) await showThroneStory();
  const resonance = [
    ...resolveCityPulse(activeLevel, gameState.turn, playerTeam, enemies),
    ...resolveForetoldRuin(activeLevel, gameState.turn, playerTeam, enemies),
  ];
  levelGroup.userData.waitingCity?.sync();
  levelGroup.userData.abyssalThrone?.sync();
  for (const { unit, damage } of resonance) {
    showCombatResult(unit, `-${damage}`, 'hit');
    if (unit.hp <= 0) { unit.mesh.visible = false; unit.acted = true; }
  }
  if (resonance.length) {
    setMessage(`${activeLevel.abyssalThrone ? 'Foretold Ruin' : "The Bell-Drowned's resonance"} strikes: ${resonance.map(({ unit, damage }) => `${unit.name} -${damage} HP${unit.hp <= 0 ? ' (fallen)' : ''}`).join(', ')}.`);
    renderTacticalUi();
    await wait(700);
    if (partyDefeated()) { completeGameOver(); return; }
    if (player.hp <= 0) player = playerTeam.find((unit) => unit.hp > 0);
  }
  await showCathedralStory();
  if (activeLevel.bellYard) await showBellYardStory();
  for (const id of triggerProgressWaves(activeLevel, playerTeam, gameState.turn)) {
    await tutorialPopup.show(activeLevel.cathedral ? `cathedral-${id}` :
      id === 'courtyard-ravens' ? 'courtyardRavenWarning' : 'courtyardCavalryWarning', {}, { force: true });
    saveCurrentGame();
  }
  if (activeLevel.streets && gameState.turn === 5) {
    await tutorialPopup.show('streetsWarning', {}, { force: true });
  }
  if (neutralUnits().includes(eveline) && eveline.hp < eveline.maxHp) {
    const potion = eveline.inventory.find((entry) => entry.id === 'potion' && entry.uses > 0);
    if (potion) {
      const healed = Math.min(INVENTORY_ITEMS.get(potion.id).heal, eveline.maxHp - eveline.hp);
      eveline.hp += healed;
      potion.uses--;
      if (!potion.uses) eveline.inventory.splice(eveline.inventory.indexOf(potion), 1);
      showCombatResult(eveline, `+${healed}`, 'heal');
      renderTacticalUi();
    }
  }
  await advanceVillagers();
  await heartrootPhase();
  await healOnRestorativeTiles(enemies);
  const frozenEnemies = [];
  for (const enemy of [...enemies]) {
    if (!enemies.includes(enemy)) continue;
    const livingTeam = activeLevel.rescue && enemy.type !== 'beast' || activeLevel.streets && enemy.type !== 'undead'
      ? playerTeam.filter((unit) => unit.hp > 0)
      : defendingUnits();
    if (!livingTeam.length) break;
    if (activeLevel.bellYard && enemy.id === activeLevel.bellYard.wagonId) {
      if (!enemy.frozen) await advanceTreatmentWagon(enemy);
      else frozenEnemies.push(enemy);
      continue;
    }
    if (enemy.frozen) frozenEnemies.push(enemy);
    if (enemy.id === activeLevel.abyssalThrone?.bossId) {
      const blessing = performBenediction(activeLevel, enemy, enemies, gameState.turn);
      if (blessing) {
        cameraFollowTarget = enemy.mesh.position;
        if (blessing.target) showCombatResult(blessing.target, `+${blessing.healed}`, 'heal');
        showCombatResult(enemy, 'BENEDICTION', 'heal');
        setMessage(blessing.target
          ? `Vael spends his action on Profane Benediction: ${blessing.target.name} recovers ${blessing.healed} HP.`
          : 'Vael channels Profane Benediction into the empty congregation. He does not attack this phase.');
        renderTacticalUi();
        await wait(850);
        continue;
      }
    }
    if (enemy.inventory?.some((entry) => INVENTORY_ITEMS.get(entry.id)?.type === 'Staff')) {
      const action = chooseEnemyStaffAction(enemy, enemies, livingTeam);
      if (action) {
        cameraFollowTarget = enemy.mesh.position;
        enemy.facing = getFacing(action.target.x - enemy.x, action.target.z - enemy.z);
        gameState.mode = 'combat';
        combatants.add(enemy);
        combatants.add(action.target);
        renderTacticalUi();
        await playAttackAnimation(enemy, enemy.facing, false, true);
        const result = useEnemyStaff(enemy, action, gameState.turn);
        if (action.staff.freeze && result.hit) action.target.mesh.material.color.set(0x8fd4ff);
        showCombatResult(action.target, action.staff.freeze ? result.hit ? 'FROZEN' : 'MISS' : `+${result.healed}`,
          action.staff.freeze ? result.hit ? 'freeze' : 'miss' : 'heal');
        setMessage(action.staff.freeze
          ? result.hit ? `${enemy.name} freezes ${action.target.name}. Movement is blocked next player phase; actions remain available.`
            : `${action.target.name} resists ${enemy.name}'s Freeze.`
          : `${enemy.name} heals ${action.target.name} for ${result.healed} HP with ${action.staff.name}.`);
        await wait(650);
        gameState.mode = 'cursor';
        renderTacticalUi();
      }
      if (action || enemy.weapon?.type === 'Staff') continue;
    }
    const foe = chooseEnemyTarget(enemy, livingTeam);
    if (!foe) continue;
    cameraFollowTarget = enemy.mesh.position;
    await wait(500);
    if (enemy.ai !== 'stationary' && !enemy.frozen &&
        (foe.objectiveTarget || !isInWeaponRange(enemy, foe, distanceBetween(enemy.x, enemy.z, foe.x, foe.z)))) {
      const blocked = new Set(defendingUnits().map((other) => tileKey(other.x, other.z)));
      const occupied = new Set(enemies
        .filter((other) => other !== enemy)
        .map((other) => tileKey(other.x, other.z)));
      const attackPositions = foe.objectiveTarget ? [{ x: foe.x, z: foe.z }] : [];
      for (let z = foe.z - enemy.weapon.maxRange; !foe.objectiveTarget && z <= foe.z + enemy.weapon.maxRange; z++) {
        for (let x = foe.x - enemy.weapon.maxRange; x <= foe.x + enemy.weapon.maxRange; x++) {
          if (
            isInWeaponRange(
              enemy,
              foe,
              distanceBetween(x, z, foe.x, foe.z),
            ) &&
            isWalkable(activeLevel, x, z, enemy) &&
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
          spent += terrainMoveCost(activeLevel, path[stop + 1].x, path[stop + 1].z, enemy);
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
            unitSpriteHeightAt(enemy.x, enemy.z, enemy),
            worldZ(enemy.z),
          );
        }
      }
    }
    const range = distanceBetween(enemy.x, enemy.z, foe.x, foe.z);
    if (infirmaryBreached(activeLevel, enemies)) {
      activeLevel.infirmary.breached = true;
      completeGameOver();
      return;
    }
    if (!foe.objectiveTarget && isInWeaponRange(enemy, foe, range)) {
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
      const enemyVolleys = getAttackCount(enemy, foe);
      const attacks = getAvailableStrikeCount(enemy, enemyVolleys * getStrikesPerAttack(enemy));
      const hitRate = getHitRate(enemy, foe, terrain);
      const criticalRate = getCriticalRate(enemy, foe);
      if (enemy.weapon.type !== 'Gun') spendWeaponUse(enemy);
      let hits = 0;
      let criticalHits = 0;
      let totalDamage = 0;
      const strikeResults = Array.from({ length: attacks }, () => {
        const hit = rollHit(hitRate);
        return { hit, critical: hit && rollCritical(criticalRate) };
      });
      
      // Brave volleys stay consecutive, with gunshots capped to the loaded rounds.
      const counterRange = distanceBetween(enemy.x, enemy.z, foe.x, foe.z);
      const canCounter = isInWeaponRange(foe, enemy, counterRange);
      const counterTerrain = getTerrain(activeLevel, enemy.x, enemy.z);
      const counterVolleys = canCounter ? getAttackCount(foe, enemy) : 0;
      const counterAttacks = getAvailableStrikeCount(foe, counterVolleys * getStrikesPerAttack(foe));
      const counterDamage = canCounter ? getCombatDamage(foe, enemy, counterTerrain) : 0;
      const counterCriticalDamage = canCounter ? getCriticalDamage(foe, enemy, counterTerrain) : 0;
      const counterHitRate = canCounter ? getHitRate(foe, enemy, counterTerrain) : 0;
      const counterCriticalRate = canCounter ? getCriticalRate(foe, enemy) : 0;
      if (canCounter) {
        foe.facing = getFacing(enemy.x - foe.x, enemy.z - foe.z);
        if (foe.weapon.type !== 'Gun') spendWeaponUse(foe);
      }
      const counterResults = Array.from({ length: counterAttacks }, () => {
        const hit = rollHit(counterHitRate);
        return { hit, critical: hit && rollCritical(counterCriticalRate) };
      });
      let counterHitCount = 0;
      let counterCriticalCount = 0;
      let counterTotalDamage = 0;
      const rankUps = [];

      const strikeOrder = getCombatStrikeOrder(enemy, foe, enemyVolleys, counterVolleys);
      let enemyStrike = 0;
      let foeStrike = 0;
      for (const side of strikeOrder) {
        if (foe.hp <= 0 || enemy.hp <= 0) break;
        if (side === 'attacker') {
          if (enemy.weapon.type === 'Gun') {
            if (!canAttack(enemy)) continue;
            spendWeaponUse(enemy);
          }
          const round = enemyStrike++;
          await playAttackAnimation(enemy, enemy.facing, round > 0);
          const result = strikeResults[round];
          if (result.hit) {
            hits++;
            if (result.critical) criticalHits++;
            const strikeDamage = Math.min(foe.hp, result.critical ? criticalDamage : damage);
            foe.hp -= strikeDamage;
            const drained = healDamageDealt(enemy, strikeDamage);
            if (drained > 0) showCombatResult(enemy, `+${drained}`, 'heal');
            totalDamage += strikeDamage;
            showCombatResult(foe, `-${strikeDamage}`, result.critical ? 'critical' : 'hit');
          } else {
            showCombatResult(foe, 'MISS', 'miss');
          }
          await wait(400);
          renderTacticalUi();
          if (foe.hp <= 0) break;
        } else {
          if (foe.weapon.type === 'Gun') {
            if (!canAttack(foe)) continue;
            spendWeaponUse(foe);
          }
          const round = foeStrike++;
          setMessage(`${foe.name} counters ${enemy.name} (${round + 1}/${counterAttacks}).`);
          await playAttackAnimation(foe, foe.facing, round > 0);
          const result = counterResults[round];
          if (result.hit) {
            counterHitCount++;
            if (playerTeam.includes(foe)) recordWeaponHit(foe, rankUps);
            if (result.critical) counterCriticalCount++;
            const strikeDamage = Math.min(enemy.hp, result.critical ? counterCriticalDamage : counterDamage);
            enemy.hp -= strikeDamage;
            const drained = healDamageDealt(foe, strikeDamage);
            if (drained > 0) showCombatResult(foe, `+${drained}`, 'heal');
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
        if (foe.civilian) {
          foe.status = 'dead';
          setMessage(`${foe.name} has been lost. The chapter can still be completed, but the rescue reward is reduced.`);
        } else if (foe === linus && rescueState && !rescueState.recruited) {
          setMessage('Linus has fallen defending the village before he could join you.');
        } else if (foe === eveline && activeLevel.streets && !activeLevel.streets.recruit.recruited) {
          activeLevel.streets.recruit.dead = true;
          activeLevel.streets.recruit.hp = 0;
          setMessage('Eveline has fallen before Rictor could recruit her. The gatehouse can still be seized.');
          await tutorialPopup.show('evelineLost', {}, { force: true });
        }
      }
      if (partyDefeated()) {
        completeGameOver();
        return;
      }

      if (canCounter && foe.hp > 0) {
        if (enemy.hp === 0) {
          const healed = healBloodEmblemKill(foe);
          if (healed > 0) showCombatResult(foe, `+${healed}`, 'heal');
          scene.remove(enemy.mesh);
          enemies = enemies.filter((unit) => unit !== enemy);
          if (!playerTeam.includes(foe)) {
            await collectEnemyDrop(enemy, maria);
            setMessage(`${foe.name} holds the village and defeats ${enemy.name}. Reach him with Maria before he is overwhelmed.`);
            gameState.mode = 'cursor';
            renderTacticalUi();
            continue;
          }
          const experienceGained = getCombatExperience(enemy, true, foe);
          const progression = awardExperience(foe, experienceGained);
          await collectEnemyDrop(enemy, foe);
          await showExperienceProgression(progression, experienceGained, foe);
          setMessage(withRankUps(
            `${foe.name} counters and defeats ${enemy.name}${enemy.isBoss ? ' (Boss)' : ''} (${counterHitCount}/${counterAttacks} hits${counterCriticalCount ? `, ${counterCriticalCount} critical` : ''}, ${counterTotalDamage} damage, +${experienceGained} EXP${progression.levelUps ? `, Level ${foe.level}!` : ''}).`,
            rankUps,
          ));
        } else if (playerTeam.includes(foe)) {
          const experienceGained = getCombatExperience(enemy, false, foe);
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
      setMessage(`${enemy.name} advances${activeLevel.infirmary ? ' toward the evacuation door' : activeLevel.streets ? ' through the city streets' : ' across the ships'}.`);
    }
  }
  for (const enemy of frozenEnemies) setEnemyFrozen(enemy, enemy.frozen - 1);
  if (activeLevel.infirmary && finishInfirmaryEnemyPhase(activeLevel)) {
    if (await completeInfirmaryDefense()) return;
  }
  if (checkDefeatAllVictory()) return;
  gameState.turn++;
  gameState.phase = 'player';
  const cityWarning = prepareCityPulse(activeLevel, gameState.turn, enemies);
  levelGroup.userData.waitingCity?.sync();
  const throneWarning = prepareForetoldRuin(activeLevel, gameState.turn, playerTeam, enemies);
  levelGroup.userData.abyssalThrone?.sync();
  for (const unit of playerTeam) {
    unit.moved = Boolean(unit.frozen);
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
  spawnGateRavens();
  const departedWagons = departTreatmentWagons();
  const reinforcementResult = spawnTurnReinforcements();
  if (reinforcementResult.error) {
    console.error('Unable to spawn chapter reinforcements:', reinforcementResult.error);
    setLevelStatus(`Could not spawn reinforcements: ${reinforcementResult.error.message}`, true);
    setMessage(reinforcementResult.error.message);
  } else if (reinforcementResult.units.length) {
    const boss = reinforcementResult.units.find((unit) => unit.isBoss);
    setMessage(boss
      ? `${boss.name} has arrived with reinforcements!`
      : activeLevel.waitingCity
        ? `${reinforcementResult.units.length} ${reinforcementResult.units.length === 1 ? 'creature climbs' : 'creatures climb'} from the black water at the glowing shores!`
        : `${reinforcementResult.units.length} reinforcements have arrived!`);
  }
  if (departedWagons.length) setMessage('Treatment wagons leave the depots! Block the rails or break them before they reach the lift.');
  if (cityWarning) setMessage('The Bell-Drowned draws back its chains. GOLD lanes will erupt for 18 damage next enemy phase. Move off them!');
  if (throneWarning) setMessage('Vael writes a name in The Last Testament. GOLD tiles take 22 damage next enemy phase. Move away!');
  if (isBenedictionTurn(activeLevel, gameState.turn)) setMessage('Vael begins Profane Benediction. This enemy phase he heals a nearby cultist instead of attacking. Press the opening!');
  showPhaseBanner('Player', gameState.turn);
  renderTacticalUi();
  await healOnRestorativeTiles(playerTeam);
  if (activeLevel.infirmary && reinforcementResult.units.some((unit) => unit.id === 'rotten')) {
    await tutorialPopup.show('rottenArrival', {}, { force: true });
  }
  for (const ally of reinforcementResult.allies ?? []) await tutorialPopup.show(ally.id);
  window.setTimeout(() => void runTutorials(), 1300);
}

function spawnTurnReinforcements() {
  const createdUnits = [];
  const joinedAllies = [];
  const occupied = new Set(
    [...defendingUnits(), ...enemies]
      .filter((unit) => unit.hp > 0)
      .map((unit) => tileKey(unit.x, unit.z)),
  );
  for (const wave of activeLevel.reinforcements) {
    if (activeLevel.waitingCity && !enemies.some((unit) => unit.id === activeLevel.waitingCity.bossId && unit.hp > 0)) {
      wave.spawned = true;
      wave.spawnedCount = wave.units.length;
      continue;
    }
    if (infirmaryWaveSealed(activeLevel, wave)) {
      wave.spawned = true;
      wave.spawnedCount = wave.units.length;
      continue;
    }
    if (wave.requiresHeartroots && !wave.spawned && !enemies.some((enemy) => enemy.id === 'heartroot')) {
      wave.spawned = true;
      continue;
    }
    if (wave.turn > gameState.turn || wave.spawned || !courtyardWaveEnabled(activeLevel, wave) ||
        !cathedralWaveEnabled(activeLevel, wave)) continue;
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
      const spawnTile = activeLevel.infirmary || activeLevel.streets || activeLevel.courtyard || activeLevel.cathedral || activeLevel.bellYard || activeLevel.shore || activeLevel.waitingCity
        ? infirmarySpawnTile(activeLevel, placement, [...defendingUnits(), ...enemies])
        : candidates[0];
      if (!spawnTile && (activeLevel.infirmary || activeLevel.streets || activeLevel.courtyard || activeLevel.cathedral || activeLevel.bellYard || activeLevel.shore || activeLevel.waitingCity)) break;
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
    wave.spawned = wave.spawnedCount === wave.units.length;
    if (!wave.spawned) continue;
    for (const placement of wave.allies ?? []) {
      const ally = roster[placement.id];
      if (!ally || fullTeam.includes(ally)) continue;
      const open = [];
      for (let z = 0; z < activeLevel.height; z++) {
        for (let x = 0; x < activeLevel.width; x++) {
          if (isWalkable(activeLevel, x, z) && !occupied.has(tileKey(x, z))) open.push({ x, z });
        }
      }
      open.sort((first, second) =>
        distanceBetween(first.x, first.z, placement.x, placement.z) -
        distanceBetween(second.x, second.z, placement.x, placement.z));
      if (!open.length) continue;
      Object.assign(ally, { x: open[0].x, z: open[0].z, facing: 'south', hp: ally.maxHp, moved: false, acted: false, moveOrigin: null });
      ally.mesh.position.set(worldX(ally.x), unitSpriteHeightAt(ally.x, ally.z, ally), worldZ(ally.z));
      playerTeam.push(ally);
      if (!fullTeam.includes(ally)) fullTeam.push(ally);
      setIdleSprite(ally);
      occupied.add(tileKey(ally.x, ally.z));
      joinedAllies.push(ally);
    }
  }
  levelGroup.userData.waitingCity?.sync();
  return { units: createdUnits, allies: joinedAllies, error: null };
}

async function endPlayerPhase() {
  if (gameState.phase !== 'player' || gameState.defeated || playerMovement) return;
  for (const unit of playerTeam) {
    if (unit.frozen && unit.frozen <= gameState.turn) {
      delete unit.frozen;
      unit.mesh.material.color.set(0xffffff);
    }
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
    if (enemy) toggleEnemyRange(enemy);
    else if (playerUnitAt(cursor.x, cursor.z)) {
      player = playerUnitAt(cursor.x, cursor.z);
      selectMaria();
    } else if (unitAtTile(cursor.x, cursor.z)) openUnitProfile(unitAtTile(cursor.x, cursor.z));
    else openOptionsMenu();
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
      gameState.mode === 'combat' || mapViewActive) return;
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
      if (enemy) toggleEnemyRange(enemy);
      else if (hitUnit) openUnitProfile(hitUnit);
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
document.querySelector('#convoy-action').addEventListener('click', openConvoy);
document.querySelector('#trade-action').addEventListener('click', openTrade);
document.querySelector('#trade-close').addEventListener('click', closeTrade);
document.querySelector('#heal-action').addEventListener('click', openHeal);
document.querySelector('#freeze-action').addEventListener('click', openFreeze);
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
document.querySelector('#talk-action').addEventListener('click', () => void (activeLevel.bellYard ? reuniteParties() : activeLevel.courtyard ? recruitCourtyardShaman() : activeLevel.streets ? recruitStreetHealer() : recruitLinus()));
chestActionButton.addEventListener('click', () => void openChest());
document.querySelector('#unlock-action').addEventListener('click', () => void unlockCell());
document.querySelector('#steal-action').addEventListener('click', openSteal);
document.querySelector('#infirmary-action').addEventListener('click', openInfirmaryActions);
document.querySelector('#beacon-action').addEventListener('click', () => {
  if (gameState.phase !== 'player' || gameState.mode !== 'unit' || !gameState.selected ||
      !availableBeacon(activeLevel, player)) return;
  const beacon = extinguishBeacon(activeLevel, player);
  const mesh = levelGroup.userData.shore?.beacons.get(beacon.id);
  if (mesh) {
    mesh.material.map = levelGroup.userData.shore.unlitBeacon;
    mesh.material.needsUpdate = true;
  }
  setMessage(`${player.name} extinguishes the offering beacon. Its remaining summons are silenced.`);
  saveCurrentGame();
  finishUnit();
});
document.querySelector('#mechanism-action').addEventListener('click', () => {
  if (gameState.phase !== 'player' || gameState.mode !== 'unit' || !gameState.selected ||
      !availableMechanism(activeLevel, player)) return;
  activateMechanism(activeLevel, player, gameState.turn);
  levelGroup.userData.waitingCity?.sync();
  setMessage(activeLevel.waitingCity.opened
    ? 'Both mechanisms turn. The central approach opens. Defeat the Bell-Drowned!'
    : `${player.name} activates the ancient mechanism. One remains.`);
  finishUnit();
  saveCurrentGame();
  void runTutorials();
});
backActionButton.addEventListener('click', () => {
  if (player.moveOrigin && player.moved && !player.acted) undoMove();
  else cancelAction();
});
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
document.querySelector('#next-chapter').addEventListener('click', () => {
  if (showingPartVictory) showTerminalScreen('victory', '', { ending: true });
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
document.querySelector('#options-objective').addEventListener('click', () => {
  const panel = document.querySelector('#objective-panel');
  panel.hidden = !panel.hidden;
  document.querySelector('#options-objective').setAttribute('aria-expanded', String(!panel.hidden));
});
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
  if (document.querySelector('#level-up-dialog')?.open || document.querySelector('#rank-up-dialog')?.open || itemPopup.open || tutorialPopup.open) return false;
  if (combatForecastDialog.open) {
    cancelCombatForecast();
    return true;
  }
  if (inventoryDialog.open) {
    closeInventory();
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
  if (saveSlotsDialog.open) {
    saveSlotsDialog.close();
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
  if (prepMenu?.open) return prepMenu.back();
  if (mapViewActive) {
    endMapView();
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
  if (event.code !== 'ControlLeft' && event.code !== 'ControlRight') backCtrlPending = false;
  else if (!event.repeat) backCtrlPending = true;
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
  if (itemPopup.open || tutorialPopup.open) return;
  if (document.querySelector('#prep-dialog')?.open) return;
  if (inventoryDialog.open) return;
  if (tradeDialog.open || healDialog.open) return;
  if (optionsDialog.open) return;
  if (combatForecastDialog.open) return;
  if (mapViewActive) {
    if (event.code === 'Escape' || event.code === 'Backspace') {
      event.preventDefault();
      endMapView();
      return;
    }
    if (!MAP_VIEW_KEYS.has(event.code)) {
      event.preventDefault();
      return;
    }
  }
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
  } else if (event.code === 'KeyI') {
    if (gameState.mode !== 'cursor' || gameState.selected) return;
    const enemy = findEnemyAt(enemies, cursor.x, cursor.z);
    if (enemy) openEnemyProfile(enemy);
    else if (unitAtTile(cursor.x, cursor.z)) openUnitProfile(unitAtTile(cursor.x, cursor.z));
  } else if (event.code === 'KeyM') {
    startMove();
  } else if (event.code === 'KeyA') {
    startAttack();
  } else if (event.code === 'KeyF') {
    finishUnit();
  } else if (event.code === 'KeyE') {
    endPlayerPhase();
  } else if (event.code === 'KeyR') {
    enemyRangeToggle.click();
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
  let playerWorldY = unitSpriteHeightAt(player.x, player.z, player);
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
        unitSpriteHeightAt(from.x, from.z, player),
        unitSpriteHeightAt(to.x, to.z, player),
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
    const walkFrames = unitTextures(enemy).walking?.[enemy.facing];
    setUnitSprite(enemy, walkFrames?.length
      ? walkFrames[Math.floor((t - startedAt) / 0.09) % walkFrames.length]
      : unitTextures(enemy).idle[enemy.facing]);
    enemy.mesh.position.set(
      THREE.MathUtils.lerp(worldX(from.x), worldX(to.x), stepProgress),
      THREE.MathUtils.lerp(
        unitSpriteHeightAt(from.x, from.z, enemy),
        unitSpriteHeightAt(to.x, to.z, enemy),
        stepProgress),
      THREE.MathUtils.lerp(worldZ(from.z), worldZ(to.z), stepProgress),
    );
  }
  for (const unit of enemies) {
    if (unit.attackAnimation) {
      const { direction, frameIndex, kind } = unit.attackAnimation;
      setUnitSprite(unit, unitTextures(unit)[kind]?.[direction]?.[frameIndex]);
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
  for (const unit of Object.values(roster)) {
    const fielded = (playerTeam.includes(unit) || neutralUnits().includes(unit)) && unit.hp > 0;
    // Bell Yard clears building depth at order 1; allies must render after it, just like enemies.
    unit.mesh.renderOrder = activeLevel.bellYard || activeLevel.shore || activeLevel.waitingCity || activeLevel.abyssalThrone || activeLevel.cells.length ? 2 : 0;
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
    const previousScale = unit.mesh.scale.x;
    setUnitSprite(unit, sprite);
    const unitX = unit === player ? playerWorldX : worldX(unit.x);
    const unitY = unit === player
      ? playerWorldY + UNIT_SPRITE_HEIGHT * (unit.mesh.scale.x - previousScale) / 2
      : unitSpriteHeightAt(unit.x, unit.z, unit);
    const unitZ = unit === player ? playerWorldZ : worldZ(unit.z);
    unit.mesh.position.set(unitX, unitY + (unitMoving ? Math.abs(Math.sin(t * 28)) * 0.08 : 0), unitZ);
    const scale = unitSpriteScale(unit, sprite);
    unit.blob.position.set(unitX, unitY - UNIT_SPRITE_HEIGHT * scale / 2 - HERO_DECK_HEIGHT + 0.02, unitZ);
  }
  const healthBarMeshes = [...defendingUnits(), ...enemies].map((unit) => unit.mesh);
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
      mesh.userData.cityOccluded ||
      (healthBar.unit === eveline && neutralUnits().includes(eveline)) ||
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
  torch.intensity = (38 + Math.sin(t * 17) * 3 + Math.sin(t * 5.3) * 2) *
    (activeLevel.lighting === 'dusk' ? 0.35 : activeLevel.lighting === 'sunset' ? 0.15 : 1);

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
  const cameraScale = Math.max(activeLevel.infirmary ? 1.45 : 0.55, activeLevel.width / 21, activeLevel.height / 19);
  const offset = CAM_OFFSET.clone().multiplyScalar(cameraScale);
  const cityBackdrop = levelGroup.userData.cityBackdrop;
  const northLimit = worldZ(activeLevel.exit.z);
  if (activeLevel.streets || activeLevel.courtyard || activeLevel.bellYard || activeLevel.shore || activeLevel.waitingCity || activeLevel.abyssalThrone) constrainStreetCamera(target, cityBackdrop, offset, camera.aspect, activeLevel.width, activeLevel.height);
  else if (cityBackdrop) constrainCityCamera(target, cityBackdrop, offset, camera.aspect, northLimit);
  if (activeLevel.infirmary) constrainInteriorCamera(target, offset, camera.aspect, activeLevel.width, activeLevel.height);
  const desired = target.clone().add(offset);
  camera.position.sub(cameraShakeOffset);
  camera.position.lerp(desired, 1 - Math.pow(0.001, dt));
  let fov = TACTICAL_FOV;
  if (activeLevel.streets || activeLevel.courtyard || activeLevel.bellYard || activeLevel.shore || activeLevel.waitingCity || activeLevel.abyssalThrone) {
    target.copy(camera.position).sub(offset);
    fov = constrainStreetCamera(target, cityBackdrop, offset, camera.aspect, activeLevel.width, activeLevel.height);
    camera.position.copy(target).add(offset);
  } else if (cityBackdrop) {
    // Keep camera easing parallel to the skyline, including while following enemies or cutscenes.
    target.copy(camera.position).sub(offset);
    fov = constrainCityCamera(target, cityBackdrop, offset, camera.aspect, northLimit);
    camera.position.copy(target).add(offset);
  }
  if (activeLevel.infirmary) {
    target.copy(camera.position).sub(offset);
    fov = constrainInteriorCamera(target, offset, camera.aspect, activeLevel.width, activeLevel.height);
    camera.position.copy(target).add(offset);
  }
  if (camera.fov !== fov) {
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }
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
  activeBackdrop.position.copy(camera.position).addScaledVector(backdropDirection, backdropDistance);
  activeBackdrop.scale.set(backdropHeight * camera.aspect, backdropHeight, 1);
}

setMessage(`WASD / Arrows move · Enter inspects enemies · Select ${player.name} · Click empty tiles for options`);
renderTacticalUi();

// ---------- Main loop ----------

const clock = new THREE.Clock();
function frame() {
  const dt = Math.min(clock.getDelta(), 0.1);
  update(dt, clock.elapsedTime);
  levelGroup.userData.waitingCity?.occlusion.update(
    [...defendingUnits(), ...enemies], gameState.selected ? player : null, camera);
  levelGroup.userData.abyssalThrone?.occlusion.update(
    [...defendingUnits(), ...enemies], gameState.selected ? player : null, camera);
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
const DEV_RESUME_KEY = 'blood-emblem-dev-resume';
// A dev-server reload during play resumes the autosave instead of dropping to the main menu.
if (import.meta.hot) {
  import.meta.hot.on('vite:beforeFullReload', () => {
    if (sessionStarted) sessionStorage.setItem(DEV_RESUME_KEY, '1');
  });
}
const resumeAfterDevReload = sessionStorage.getItem(DEV_RESUME_KEY) === '1';
sessionStorage.removeItem(DEV_RESUME_KEY);
if (Number.isInteger(requestedChapter) && requestedChapter >= 2 && requestedChapter <= CHAPTER_COUNT) {
  let carry = serializeUnit(createMaria());
  if (requestParams.get('save') === '1') {
    try {
      const save = readSave();
      if (save) carry = { ...save.player, allies: save.allies ?? [], convoy: save.convoy ?? [], insight: save.insight };
    } catch (error) {
      console.error('Could not load save for chapter shortcut:', error);
    }
  }
  startLevel(await loadChapterLevel(requestedChapter - 1), {
    chapter: requestedChapter - 1,
    carry,
  });
} else if (resumeAfterDevReload) {
  try {
    continueGame();
  } catch (error) {
    console.error('Could not resume after dev reload:', error);
  }
}
