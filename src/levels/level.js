import initialMapUrl from '../../data/levels/map_01_two_ships.json?url&no-inline';
import chapterTwoMapUrl from '../../data/levels/map_02_boarders_from_the_deep.json?url&no-inline';
import chapterThreeMapUrl from '../../data/levels/map_03_fishing_village.json?url&no-inline';
import chapterFourMapUrl from '../../data/levels/map_04_mansion.json?url&no-inline';
import chapterFiveMapUrl from '../../data/levels/map_05_escape.json?url&no-inline';
import chapterSixMapUrl from '../../data/levels/map_06_hollow_wood.json?url&no-inline';
import chapterSevenMapUrl from '../../data/levels/map_07_orders_camp.json?url&no-inline';
import chapterEightMapUrl from '../../data/levels/map_08_rotted_heart.json?url&no-inline';
import chapterNineMapUrl from '../../data/levels/map_09_last_crossing.json?url&no-inline';
import chapterTenMapUrl from '../../data/levels/map_10_golden_threshold.json?url&no-inline';
import chapterElevenMapUrl from '../../data/levels/map_11_ward.json?url&no-inline';
import chapterTwelveMapUrl from '../../data/levels/map_12_infirmary.json?url&no-inline';
import chapterThirteenMapUrl from '../../data/levels/map_13_procession.json?url&no-inline';
import chapterFourteenMapUrl from '../../data/levels/map_14_courtyard.json?url&no-inline';
import chapterFifteenMapUrl from '../../data/levels/map_15_cathedral.json?url&no-inline';
import { validateCathedral } from '../game/cathedral.js';
import { addCathedralInterior } from './cathedral-interior.js';
import { getTileElevation } from '../battle/terrain.js';
import { STREET_CAMERA_PADDING } from '../game/camera-bounds.js';
import { validateRescueRules } from '../game/rescue.js';
import { validateGateEncounter } from '../game/gate-encounter.js';
import chestUrl from '../../assets/tiles/Chest/chest.png?url';
import shipTilesUrl from '../../assets/tiles/ship_oblique/ship_oblique_tiles.png?url';
import shipObjectsUrl from '../../assets/tiles/ship_oblique/ship_objects.png?url';
import waterRippleUrl from '../../assets/tiles/ocean_ripple/water_ripple.png?url';
import mastUrl from '../../assets/tiles/ship_oblique/mast.png?url';
import greyHouseUrl from '../../assets/tiles/Grey_house/rotations/Grey_house.png?url';
import orderTentUrl from '../../assets/tiles/Order_Tent/order_tent.png?url';
import fenceHorizontalUrl from '../../assets/tiles/Village_Fence/fence_horizontal.png?url';
import fenceVerticalUrl from '../../assets/tiles/Village_Fence/fence_vertical.png?url';
import sandbagsUrl from '../../assets/tiles/Golden_Bridge/sandbags.png?url';
import cityGateUrl from '../../assets/tiles/Golden_Bridge/city_gate.png?url';
import victorianCityUrl from '../../assets/tiles/Golden_Bridge/victorian_city.png?url';
import cityEmbankmentUrl from '../../assets/tiles/Golden_Bridge/city_embankment.png?url';
import greyHouseNoEntryUrl from '../../assets/tiles/Grey_house_No_entry/rotations/Grey_house_No_entry.png?url';
import infirmaryBedUrl from '../../assets/tiles/Infirmary/infirmary_bed.png?url';
import infirmaryBarricadeUrl from '../../assets/tiles/Infirmary/infirmary_barricade.png?url';
import infirmaryOperatingTableUrl from '../../assets/tiles/Infirmary/infirmary_operating_table.png?url';
import infirmaryRecordsCabinetUrl from '../../assets/tiles/Infirmary/infirmary_records_cabinet.png?url';
import infirmaryIsolationGateUrl from '../../assets/tiles/Infirmary/infirmary_isolation_gate.png?url';
import infirmaryEvacuationMarkerUrl from '../../assets/tiles/Infirmary/infirmary_evacuation_marker.png?url';
import infirmaryPatientUrl from '../../assets/character/Villager/rotations/south.png?url';
import infirmaryDoorFrontUrl from '../../assets/tiles/Infirmary/infirmary_door_front.png?url';
import infirmaryDoorSideUrl from '../../assets/tiles/Infirmary/infirmary_door_side.png?url';
import infirmaryDoorClosedUrl from '../../assets/tiles/Infirmary/infirmary_door_closed.png?url';
import infirmaryWallFaceUrl from '../../assets/tiles/Infirmary/infirmary_wall_face.png?url';
import infirmaryWallCapUrl from '../../assets/tiles/Infirmary/infirmary_wall_cap.png?url';
import streetLampUrl from '../../assets/tiles/Cathedral_Streets/gas_lamp_front.png?url';
import streetRowHouseUrl from '../../assets/tiles/Cathedral_Streets/gothic_row_house.png?url';
import streetShopUrl from '../../assets/tiles/Cathedral_Streets/gothic_shuttered_shop.png?url';
import streetClocktowerUrl from '../../assets/tiles/Cathedral_Streets/clocktower.png?url';
import courtyardFountainUrl from '../../assets/tiles/Cathedral_Courtyard/dry_fountain.png?url';
import courtyardDoorsUrl from '../../assets/tiles/Cathedral_Courtyard/cathedral_doors.png?url';
import courtyardTopiaryUrl from '../../assets/tiles/Cathedral_Courtyard/topiary.png?url';
const courtyardDetailUrls = import.meta.glob('../../assets/tiles/Cathedral_Courtyard/detail_*.png',
  { eager: true, query: '?url', import: 'default' });
const creepTreeUrls = import.meta.glob('../../assets/tiles/Creep_Trees/*.png', { eager: true, query: '?url', import: 'default' });
import shipTileset from '../../assets/tiles/ship_oblique/ship_oblique_tileset.json';
import { COURTYARD_TILE_IDS, getTileDef, infirmaryDoorOrientation, isInfirmaryRecoveryWard, isLevelTileWalkable, isTileWalkable, STREET_TILE_IDS, VILLAGE_GRAVEL_TILE_IDS } from './tiles.js';
import { enemyMovementType } from '../characters/characters.js';

const LEVEL_TILES = new Set(['.', 'h', 'd', 'b', 'q', 'w', 'p', 'c', 'r', 'm', 's', 'e', 'a', 'v', 'k', 'f', 'o', 'g', 'G', 'j', 'n', 'B', 'C', 'L', 'u', 'i', 'l', 't', 'x', 'y', 'z', 'P', 'A', 'H', 'W', 'F', 'D']);
for (const id of ['Q', 'R', 'E', 'O', 'T', 'V', 'U', 'I', 'N']) LEVEL_TILES.add(id);
export const LEVEL_OBJECTIVES = new Set(['defeat-all-enemies', 'defeat-boss', 'escape', 'rescue-villagers', 'seize-gate', 'defend-infirmary', 'seize-streets', 'defeat-courtyard-general']);

const TILE_SIZE = shipTileset.tileSize;
const WATER_TILE_IDS = new Set(['water_a', 'water_b', 'water_foam']);
const RETIRED_OBJECT_IDS = new Set([
  'rope_coil', 'cannon_e', 'cannon_w', 'anchor', 'chest', 'candelabra', 'coffin', 'chains', 'bones', 'blood_pool', 'torn_sail',
]);
// Matches the pitch of the tactical camera so upright props face it squarely.
const OBJECT_TILT = Math.atan2(14, 10);
const OBJECT_SIZE = 0.82;
const waterTime = { value: 0 };
const glowLights = [];
let glowTexture;

function getGlowTexture(THREE) {
  if (!glowTexture) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const context = canvas.getContext('2d');
    const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(255,255,255,0.95)');
    gradient.addColorStop(0.25, 'rgba(255,255,255,0.45)');
    gradient.addColorStop(0.6, 'rgba(255,255,255,0.12)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 128);
    glowTexture = new THREE.CanvasTexture(canvas);
  }
  return glowTexture;
}

export function updateLevelAnimation(elapsedSeconds) {
  waterTime.value = elapsedSeconds;
  for (const glow of glowLights) {
    const flicker = 0.85 + Math.sin(elapsedSeconds * 9 + glow.phase) * 0.07 + Math.sin(elapsedSeconds * 23 + glow.phase * 2) * 0.05;
    glow.sprite.material.opacity = glow.intensity * flicker;
    glow.sprite.scale.setScalar(glow.radius * (0.96 + 0.06 * flicker));
  }
}

// Water plays the Pixel Lab ripple frames back and forth; each tile starts at its own point in the loop.
const WATER_FRAMES = 9;
const WATER_STEPS = (WATER_FRAMES - 1) * 2;
const WATER_FPS = 5;
let waterStripTextureCache;

function waterStripTexture(THREE) {
  if (!waterStripTextureCache) {
    waterStripTextureCache = new THREE.Texture(waterRippleImage);
    waterStripTextureCache.magFilter = THREE.NearestFilter;
    waterStripTextureCache.minFilter = THREE.NearestFilter;
    waterStripTextureCache.generateMipmaps = false;
    waterStripTextureCache.colorSpace = THREE.SRGBColorSpace;
    waterStripTextureCache.needsUpdate = true;
  }
  return waterStripTextureCache;
}

function createWaterMaterial(THREE, texture) {
  const material = new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 0.9,
    transparent: true,
    alphaTest: 0.08,
    side: THREE.DoubleSide,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = waterTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        varying vec2 vTileUv;
        varying vec2 vWaterPos;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vTileUv = uv;
        vec4 waterLocal = vec4(position, 1.0);
        #ifdef USE_INSTANCING
          waterLocal = instanceMatrix * waterLocal;
        #endif
        vWaterPos = (modelMatrix * waterLocal).xz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uTime;
        varying vec2 vTileUv;
        varying vec2 vWaterPos;`)
      .replace('#include <map_fragment>', `
        vec2 wp = vWaterPos;
        vec2 cell = floor(wp);
        float phase = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453) * ${WATER_STEPS}.0;
        float loopStep = mod(floor(uTime * ${WATER_FPS}.0 + phase), ${WATER_STEPS}.0);
        float frame = loopStep < ${WATER_FRAMES}.0 ? loopStep : ${WATER_STEPS}.0 - loopStep;
        vec2 frameUv = vec2((clamp(vTileUv.x, 0.001, 0.999) + frame) / ${WATER_FRAMES}.0, vTileUv.y);
        vec4 sampledDiffuseColor = texture2D(map, frameUv);
        diffuseColor *= sampledDiffuseColor;`);
  };
  return material;
}
const ATLAS_TILES = new Map(shipTileset.tiles.list.map((tile) => [tile.id, tile]));
const ATLAS_TILE_IDS = new Set([...ATLAS_TILES.keys(), ...VILLAGE_GRAVEL_TILE_IDS, ...STREET_TILE_IDS, ...COURTYARD_TILE_IDS]);
for (const id of ['floor', 'carpet', 'stairs', 'altar', 'throne', 'pew', 'pillar', 'wall', 'rail']) ATLAS_TILE_IDS.add(`cathedral_${id}`);
const BLOCKING_OBJECTS = new Set(
  shipTileset.objects.list
    .filter((object) => object.blocksMovement)
    .map((object) => object.id),
);
const SHIP_OBJECT_IDS = new Set(shipTileset.objects.list.map((object) => object.id));
// Decor (such as hull railings) can sit on tiles units never enter.
const DECOR_OBJECT_IDS = new Set(shipTileset.objects.list.filter((object) => object.decor).map((object) => object.id));
const LEGACY_ATLAS_TILES = {
  '.': 'water_a',
  o: 'water_b',
  f: 'water_foam',
  g: 'village_gravel_a',
  G: 'village_gravel_b',
  j: 'village_gravel_c',
  n: 'village_gravel_a',
  B: 'village_building',
  C: 'street_curb',
  L: 'street_lamp',
  P: 'courtyard_paving',
  A: 'courtyard_lawn',
  H: 'courtyard_hedge',
  W: 'courtyard_wall',
  F: 'courtyard_fountain',
  D: 'courtyard_cathedral',
  Q: 'cathedral_floor',
  R: 'cathedral_carpet',
  E: 'cathedral_pew',
  O: 'cathedral_pillar',
  T: 'cathedral_wall',
  V: 'cathedral_stairs',
  U: 'cathedral_rail',
  I: 'cathedral_altar',
  N: 'cathedral_throne',
  h: 'hull_n',
  d: 'deck_a',
  a: 'deck_b',
  v: 'deck_worn',
  k: 'deck_dark',
  b: 'bridge_v_l',
  q: 'stairs_down',
  w: 'deck_c',
  p: 'deck_c',
  c: 'carpet',
  r: 'bulkhead_v',
  m: 'mast_base',
  s: 'deck_a',
  e: 'deck_a',
  u: 'mans_floor_oak_a',
  i: 'mans_marble_a',
  l: 'mans_flagstone',
  t: 'mans_carpet_c',
  x: 'mans_wall_stone',
  y: 'mans_wall_window',
  z: 'mans_door_open',
};

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Could not load ship atlas: ${url}`));
    image.src = url;
  });
}

const [shipTilesImage, waterRippleImage, shipObjectsImage, mastImage, greyHouseImage, greyHouseNoEntryImage, chestImage, orderTentImage] = await Promise.all([
  loadImage(shipTilesUrl),
  loadImage(waterRippleUrl),
  loadImage(shipObjectsUrl),
  loadImage(mastUrl),
  loadImage(greyHouseUrl),
  loadImage(greyHouseNoEntryUrl),
  loadImage(chestUrl),
  loadImage(orderTentUrl),
]);
const infirmaryObjectImages = new Map(await Promise.all([
  ['infirmary_bed', infirmaryBedUrl],
  ['infirmary_barricade', infirmaryBarricadeUrl],
  ['infirmary_operating_table', infirmaryOperatingTableUrl],
  ['infirmary_records_cabinet', infirmaryRecordsCabinetUrl],
  ['infirmary_isolation_gate', infirmaryIsolationGateUrl],
  ['infirmary_evacuation_marker', infirmaryEvacuationMarkerUrl],
  ['infirmary_patient', infirmaryPatientUrl],
  ['infirmary_door_front', infirmaryDoorFrontUrl],
  ['infirmary_door_side', infirmaryDoorSideUrl],
  ['infirmary_door_closed', infirmaryDoorClosedUrl],
  ['infirmary_wall_face', infirmaryWallFaceUrl],
  ['infirmary_wall_cap', infirmaryWallCapUrl],
].map(async ([id, url]) => [id, await loadImage(url)])));
const INFIRMARY_OBJECT_SIZES = new Map([
  ['infirmary_bed', 1.35],
  ['infirmary_barricade', 1.05],
  ['infirmary_operating_table', 1.3],
  ['infirmary_records_cabinet', 1.1],
  ['infirmary_isolation_gate', 1.3],
  ['infirmary_evacuation_marker', 0.9],
]);

const creepTreeImages = new Map(await Promise.all(Object.entries(creepTreeUrls).map(
  async ([path, url]) => [path.split('/').pop().replace('.png', ''), await loadImage(url)],
)));
const fenceImages = new Map(await Promise.all([
  ['village_fence_h', fenceHorizontalUrl],
  ['village_fence_v', fenceVerticalUrl],
  ['bridge_sandbags', sandbagsUrl],
].map(async ([id, url]) => [id, await loadImage(url)])));
const [cityGateImage, victorianCityImage, cityEmbankmentImage] = await Promise.all([
  loadImage(cityGateUrl),
  loadImage(victorianCityUrl),
  loadImage(cityEmbankmentUrl),
]);
const [streetLampImage, streetRowHouseImage, streetShopImage, streetClocktowerImage] = await Promise.all([
  loadImage(streetLampUrl),
  loadImage(streetRowHouseUrl), loadImage(streetShopUrl), loadImage(streetClocktowerUrl),
]);
const courtyardImages = new Map(await Promise.all([
  ['fountain', courtyardFountainUrl], ['doors', courtyardDoorsUrl],
  ['topiary', courtyardTopiaryUrl],
  ...Object.entries(courtyardDetailUrls).map(([path, url]) =>
    [path.split('/').at(-1).replace('detail_', '').replace('.png', ''), url]),
].map(async ([id, url]) => [id, await loadImage(url)])));

function atlasTexture(THREE, image, atlas, id) {
  const tile = atlas.list.find((entry) => entry.id === id);
  if (!tile) throw new Error(`Unknown ship atlas tile "${id}".`);
  const size = atlas.tileSize ?? TILE_SIZE;
  const smooth = atlas.filter === 'smooth';
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not create a canvas for the ship atlas.');
  context.drawImage(
    image,
    tile.col * size,
    tile.row * size,
    size,
    size,
    0,
    0,
    size,
    size,
  );
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = smooth ? THREE.LinearFilter : THREE.NearestFilter;
  texture.minFilter = smooth ? THREE.LinearMipmapLinearFilter : THREE.NearestFilter;
  texture.generateMipmaps = smooth;
  texture.anisotropy = smooth ? 4 : 1;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function gravelTexture(THREE, variant) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = TILE_SIZE;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not create a canvas for village gravel.');
  const palettes = [
    ['#756f62', '#918878', '#5f5a51', '#a09888'],
    ['#706d65', '#8c8578', '#55564f', '#9c978a'],
    ['#7a7469', '#999080', '#5d5955', '#a69d8c'],
  ];
  const paletteIndex = [...variant].reduce((sum, character) => sum + character.charCodeAt(0), 0) % palettes.length;
  const [base, light, dark, pale] = palettes[paletteIndex];
  context.fillStyle = base;
  context.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
  let seed = paletteIndex + 1;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  for (let index = 0; index < 38; index++) {
    const color = [light, dark, pale][Math.floor(random() * 3)];
    const x = Math.floor(random() * TILE_SIZE);
    const y = Math.floor(random() * TILE_SIZE);
    context.fillStyle = color;
    context.fillRect(x, y, random() > 0.72 ? 3 : 2, random() > 0.72 ? 2 : 1);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function readCoordinate(value, width, height, label) {
  const z = value?.z ?? value?.y;
  if (!value || !Number.isInteger(value.x) || !Number.isInteger(z) ||
      value.x < 0 || value.x >= width || z < 0 || z >= height) {
    throw new Error(`Level needs a valid ${label} coordinate.`);
  }
  return { x: value.x, z };
}

function validateInfirmary(value, context) {
  const { width, height, tileIds, objective, players, enemies, objects } = context;
  if (value === undefined || value === null) {
    if (objective === 'defend-infirmary') {
      throw new Error('Defend infirmary objective requires infirmary rules.');
    }
    return undefined;
  }
  const inside = (point, label) => {
    const coordinate = readCoordinate(point, width, height, label);
    if (!isTileWalkable(tileIds[coordinate.z][coordinate.x])) {
      throw new Error(`Infirmary ${label} must use a walkable tile.`);
    }
    return coordinate;
  };
  const ids = new Set();
  const addId = (id) => {
    if (typeof id !== 'string' || !id.trim() || ids.has(id)) return false;
    ids.add(id);
    return true;
  };
  const defendTurns = value.defendTurns;
  if (!Number.isInteger(defendTurns) || defendTurns < 1 || defendTurns > 99) {
    throw new Error('Infirmary defendTurns must be an integer from 1 to 99.');
  }
  if (!Array.isArray(value.gates) || value.gates.length < 2 || !value.gates.every((gate) => {
    if (!gate || !addId(gate.id) || typeof gate.name !== 'string' || !gate.name.trim() ||
        typeof gate.entranceId !== 'string' || !gate.entranceId.trim() ||
        (gate.closed !== undefined && typeof gate.closed !== 'boolean') ||
        !Array.isArray(gate.blocks) || !gate.blocks.length) return false;
    const control = inside(gate, `gate "${gate.id}" control`);
    const blockKeys = new Set();
    for (const block of gate.blocks) {
      const coordinate = inside(block, `gate "${gate.id}" block`);
      const key = `${coordinate.x},${coordinate.z}`;
      if (blockKeys.has(key) || Math.abs(control.x - coordinate.x) + Math.abs(control.z - coordinate.z) !== 1) return false;
      blockKeys.add(key);
    }
    return true;
  })) {
    throw new Error('Infirmary gates need unique IDs, names, entrance IDs, a walkable control, and adjacent walkable blocks.');
  }
  const occupiedGates = new Set(value.gates.flatMap((gate) =>
    gate.blocks.map(({ x, z }) => `${x},${z}`)));
  if (occupiedGates.size !== value.gates.reduce((count, gate) => count + gate.blocks.length, 0) ||
      [...players, ...enemies].some((unit) => occupiedGates.has(`${unit.x},${unit.z}`)) ||
      objects.some((object) => occupiedGates.has(`${object.x},${object.z ?? object.y}`))) {
    throw new Error('Infirmary gate blocks cannot overlap each other, units, or objects.');
  }
  if (!value.ledger || !addId(value.ledger.id) || typeof value.ledger.name !== 'string' ||
      !value.ledger.name.trim() || (value.ledger.collected !== undefined && typeof value.ledger.collected !== 'boolean')) {
    throw new Error('Infirmary ledger needs a unique ID, a name, and a collected state.');
  }
  const ledger = {
    id: value.ledger.id,
    name: value.ledger.name,
    ...inside(value.ledger, 'ledger'),
    collected: value.ledger.collected ?? false,
  };
  const defensePoint = inside(value.defensePoint, 'defense point');
  if (!Array.isArray(value.patients) || !value.patients.length || !value.patients.every((patient) =>
    patient && addId(patient.id) && typeof patient.name === 'string' && patient.name.trim() &&
    typeof patient.rewardId === 'string' && patient.rewardId.trim() &&
    (patient.rescued === undefined || typeof patient.rescued === 'boolean') &&
    (patient.lost === undefined || typeof patient.lost === 'boolean'))) {
    throw new Error('Infirmary patients need unique IDs, names, reward IDs, and valid rescue states.');
  }
  const patients = value.patients.map((patient) => ({
    id: patient.id,
    name: patient.name,
    rewardId: patient.rewardId,
    ...inside(patient, `patient "${patient.id}"`),
    rescued: patient.rescued ?? false,
    ...(patient.lost === undefined ? {} : { lost: patient.lost }),
  }));
  const survivedTurns = value.survivedTurns ?? 0;
  if (!Number.isInteger(survivedTurns) || survivedTurns < 0 || survivedTurns > defendTurns ||
      (value.rewardsClaimed !== undefined && typeof value.rewardsClaimed !== 'boolean') ||
      (value.breached !== undefined && typeof value.breached !== 'boolean')) {
    throw new Error('Infirmary progress needs bounded survivedTurns and boolean reward/breach states.');
  }
  const completionExp = value.completionExp ?? 100;
  const interactionExp = value.interactionExp ?? 60;
  if (!Number.isInteger(completionExp) || completionExp < 0 || completionExp > 9999 ||
      !Number.isInteger(interactionExp) || interactionExp < 0 || interactionExp > 9999) {
    throw new Error('Infirmary EXP rewards must be integers from 0 to 9999.');
  }
  return {
    defendTurns,
    defensePoint,
    gates: value.gates.map((gate) => ({
      id: gate.id,
      name: gate.name,
      ...inside(gate, `gate "${gate.id}" control`),
      blocks: gate.blocks.map((block) => inside(block, `gate "${gate.id}" block`)),
      entranceId: gate.entranceId,
      closed: gate.closed ?? false,
    })),
    ledger,
    patients,
    completionExp,
    interactionExp,
    survivedTurns,
    rewardsClaimed: value.rewardsClaimed ?? false,
    breached: value.breached ?? false,
  };
}

// Optional per-placement level; enemies are scaled up from their character sheet to this level.
function isValidUnitLevel(level) {
  return level === undefined || (Number.isInteger(level) && level >= 1 && level <= 99);
}

function isValidUnitAi(ai) {
  return ai === undefined || ['mobile', 'guard', 'stationary'].includes(ai);
}

function legacyTileIds(rows) {
  return rows.map((row) => [...row].map((tile) => LEGACY_ATLAS_TILES[tile]));
}

export function validateLevel(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Level must be a JSON object.');
  }
  const { name, width, height } = value;
  const objective = value.objective ?? 'defeat-all-enemies';
  const sourceTiles = value.tiles;
  if (typeof name !== 'string' || !name.trim() ||
      !Number.isInteger(width) || width < 8 || width > 48 ||
      !Number.isInteger(height) || height < 8 || height > 36) {
    throw new Error('Level needs a name and dimensions between 8×8 and 48×36 tiles.');
  }

  const atlasGrid = Array.isArray(sourceTiles) && Array.isArray(sourceTiles[0]);
  let tileIds;
  let rows = null;
  if (atlasGrid) {
    if (sourceTiles.length !== height || sourceTiles.some((row) =>
      !Array.isArray(row) || row.length !== width ||
      row.some((tileId) => typeof tileId !== 'string' || !ATLAS_TILE_IDS.has(tileId)))) {
      throw new Error('Level atlas tile rows must match the dimensions and use known tile IDs.');
    }
    tileIds = sourceTiles.map((row) => [...row]);
  } else {
    if (!Array.isArray(sourceTiles) || sourceTiles.length !== height ||
        sourceTiles.some((row) => typeof row !== 'string' || row.length !== width ||
          [...row].some((tile) => !LEVEL_TILES.has(tile)))) {
      throw new Error('Level tile rows must match the dimensions and use known tile types.');
    }
    rows = [...sourceTiles];
    tileIds = legacyTileIds(rows);
    if (value.streets) {
      tileIds = tileIds.map((row) => row.map((id) =>
        VILLAGE_GRAVEL_TILE_IDS.has(id) && id !== 'village_building'
          ? id === 'village_gravel_b' ? 'ground_cobble_b' : 'ground_cobble_a'
          : id));
    }
  }

  let spawn;
  if (value.spawn) {
    spawn = readCoordinate(value.spawn, width, height, 'Start');
  } else if (!atlasGrid) {
    const z = rows.findIndex((row) => row.includes('s'));
    const x = z < 0 ? -1 : rows[z].indexOf('s');
    if (x >= 0) spawn = { x, z };
  }
  if (!spawn || !isTileWalkable(tileIds[spawn.z][spawn.x])) {
    throw new Error('Level must have a walkable Start coordinate.');
  }

  let exit;
  if (value.exit) {
    exit = readCoordinate(value.exit, width, height, 'Exit');
  } else if (!atlasGrid) {
    const z = rows.findIndex((row) => row.includes('e'));
    const x = z < 0 ? -1 : rows[z].indexOf('e');
    if (x >= 0) exit = { x, z };
  }
  if (!exit || !isTileWalkable(tileIds[exit.z][exit.x])) {
    throw new Error('Level must have a walkable Exit coordinate.');
  }
  if (spawn.x === exit.x && spawn.z === exit.z) {
    throw new Error('Start and Exit must use different tiles.');
  }
  // Escape levels can mark extra exit tiles so every unit has room to stand in the zone.
  const extraExitTiles = value.exitTiles ?? [];
  if (!Array.isArray(extraExitTiles)) throw new Error('Level exitTiles must be a list of coordinates.');
  const exitZone = [exit];
  for (const tile of extraExitTiles) {
    const coordinate = readCoordinate(tile, width, height, 'Exit tile');
    if (!isTileWalkable(tileIds[coordinate.z][coordinate.x])) {
      throw new Error('Exit tiles must be walkable.');
    }
    if (!exitZone.some((entry) => entry.x === coordinate.x && entry.z === coordinate.z)) {
      exitZone.push(coordinate);
    }
  }

  if (!LEVEL_OBJECTIVES.has(objective)) {
    throw new Error(`Level objective must be one of: ${[...LEVEL_OBJECTIVES].join(', ')}.`);
  }
  // Props removed from the tileset are dropped so older saves and levels still load.
  const objects = (value.objects ?? []).filter?.((object) => !RETIRED_OBJECT_IDS.has(object?.id)) ?? value.objects;
  if (!Array.isArray(objects) || !objects.every((object) => {
    const z = object?.z ?? object?.y;
    return object && Number.isInteger(object.x) && object.x >= 0 && object.x < width &&
      Number.isInteger(z) && z >= 0 && z < height &&
      (SHIP_OBJECT_IDS.has(object.id) || INFIRMARY_OBJECT_SIZES.has(object.id)) &&
      (DECOR_OBJECT_IDS.has(object.id) || isTileWalkable(tileIds[z][object.x]));
  })) {
    throw new Error('Level objects need a known ID and must be placed on walkable tiles.');
  }
  if (objects.some((object) => {
    const z = object.z ?? object.y;
    return BLOCKING_OBJECTS.has(object.id) &&
      ((object.x === spawn.x && z === spawn.z) || (object.x === exit.x && z === exit.z));
  })) {
    throw new Error('Blocking objects cannot be placed on the Start or Exit tile.');
  }
  const readPlacements = (list, label, requireId) => {
    if (list === undefined) return [];
    if (!Array.isArray(list) || !list.every((entry) => {
      const entryZ = entry?.z ?? entry?.y;
      return entry && typeof entry.id === 'string' &&
        Number.isInteger(entry.x) && entry.x >= 0 && entry.x < width &&
        Number.isInteger(entryZ) && entryZ >= 0 && entryZ < height &&
        isLevelTileWalkable({ tileIds }, entry.x, entryZ, { type: label === 'enemies' ? enemyMovementType(entry.id) : undefined }) &&
        isValidUnitLevel(entry.level) &&
        isValidUnitAi(entry.ai) &&
        (entry.drop === undefined || typeof entry.drop === 'string') &&
        (entry.stealable === undefined || Array.isArray(entry.stealable) &&
          entry.stealable.every((id) => typeof id === 'string' && id.trim()) &&
          new Set(entry.stealable).size === entry.stealable.length) &&
        (entry.weaponId === undefined || typeof entry.weaponId === 'string');
    })) {
      throw new Error(`Level ${label} need an ID and must be placed on walkable tiles.`);
    }
    return list.map((entry) => ({
      id: entry.id,
      x: entry.x,
      z: entry.z ?? entry.y,
      ...(entry.level === undefined ? {} : { level: entry.level }),
      ...(entry.ai === undefined ? {} : { ai: entry.ai }),
      ...(entry.drop === undefined ? {} : { drop: entry.drop }),
      ...(entry.stealable === undefined ? {} : { stealable: [...entry.stealable] }),
      ...(entry.weaponId === undefined ? {} : { weaponId: entry.weaponId }),
    }));
  };
  const players = readPlacements(value.players, 'players');
  const enemyPlacements = readPlacements(value.enemies, 'enemies');
  const startingItems = value.startingItems ?? [];
  if (!Array.isArray(startingItems) || startingItems.some((id) => typeof id !== 'string')) {
    throw new Error('Level startingItems must be a list of item IDs.');
  }
  const houses = value.houses ?? [];
  const houseIds = new Set();
  const houseTiles = new Set();
  if (!Array.isArray(houses) || !houses.every((house) => {
    if (
      !house ||
      typeof house.id !== 'string' ||
      houseIds.has(house.id) ||
      typeof house.name !== 'string' ||
      !Number.isInteger(house.x) ||
      !Number.isInteger(house.z) ||
      (value.streets ? house.width !== 4 || ![3, 4].includes(house.height) : house.width !== 3 || house.height !== 2) ||
      (house.rewardCount !== undefined && (!Number.isInteger(house.rewardCount) || house.rewardCount < 1 || house.rewardCount > 9)) ||
      (typeof house.rewardId !== 'string' && typeof house.recruitId !== 'string' && typeof house.villagerId !== 'string') ||
      (house.visited !== undefined && typeof house.visited !== 'boolean')
    ) return false;
    houseIds.add(house.id);
    const door = house.door ?? house.entrance;
    const doorZ = door?.z ?? door?.y;
    if (
      house.x < 0 ||
      house.z < 0 ||
      house.x + house.width > width ||
      house.z + house.height > height ||
      !door ||
      !Number.isInteger(door.x) ||
      !Number.isInteger(doorZ) ||
      door.x < 0 ||
      door.x >= width ||
      doorZ < 0 ||
      doorZ >= height
    ) return false;
    for (let z = house.z; z < house.z + house.height; z++) {
      for (let x = house.x; x < house.x + house.width; x++) {
        const key = `${x},${z}`;
        if (isTileWalkable(tileIds[z][x]) || houseTiles.has(key)) return false;
        houseTiles.add(key);
      }
    }
    return true;
  })) {
    throw new Error('Level houses need unique IDs, a valid blocked footprint, and valid reward and recipient IDs.');
  }
  const normalizedHouses = houses.map((house) => ({
    id: house.id,
    name: house.name,
    x: house.x,
    z: house.z,
    width: house.width,
    height: house.height,
    door: {
      x: (house.door ?? house.entrance).x,
      z: (house.door ?? house.entrance).z ?? (house.door ?? house.entrance).y,
    },
    rewardId: house.rewardId,
    ...(house.rewardCount === undefined ? {} : { rewardCount: house.rewardCount }),
    ...(house.recruitId ? { recruitId: house.recruitId } : {}),
    ...(house.villagerId ? { villagerId: house.villagerId } : {}),
    ...(house.style === 'tent' ? { style: 'tent' } : {}),
    ...(value.streets && ['town-house', 'apothecary'].includes(house.style) ? { style: house.style } : {}),
    visited: house.visited ?? false,
  }));
  const decorativeHouses = value.decorativeHouses ?? [];
  if (!Array.isArray(decorativeHouses) || !decorativeHouses.every((house) => {
    if (
      !house ||
      typeof house.id !== 'string' ||
      houseIds.has(house.id) ||
      !Number.isInteger(house.x) ||
      !Number.isInteger(house.z) ||
      (value.streets
        ? !Number.isInteger(house.width) || house.width < 2 || house.width > 8 ||
          !Number.isInteger(house.height) || house.height < 2 || house.height > 9 ||
          (house.style !== undefined && !['row-house', 'shuttered-shop', 'clocktower'].includes(house.style))
        : house.width !== 3 || house.height !== 2) ||
      house.x < 0 ||
      house.z < 0 ||
      house.x + house.width > width ||
      house.z + house.height > height
    ) return false;
    houseIds.add(house.id);
    for (let z = house.z; z < house.z + house.height; z++) {
      for (let x = house.x; x < house.x + house.width; x++) {
        const key = `${x},${z}`;
        if (isTileWalkable(tileIds[z][x]) || houseTiles.has(key)) return false;
        houseTiles.add(key);
      }
    }
    return true;
  })) {
    throw new Error('Decorative houses need unique IDs and a valid non-walkable building footprint.');
  }
  const normalizedDecorativeHouses = decorativeHouses.map((house) => ({
    id: house.id,
    x: house.x,
    z: house.z,
    width: house.width,
    height: house.height,
    ...(value.streets && house.style ? { style: house.style } : {}),
  }));
  const isHouseFrontTile = (house, x, z) => {
    let distance = Infinity;
    for (let tileZ = house.z; tileZ < house.z + house.height; tileZ++) {
      for (let tileX = house.x; tileX < house.x + house.width; tileX++) {
        distance = Math.min(distance, Math.abs(tileX - x) + Math.abs(tileZ - z));
      }
    }
    return distance === 1;
  };
  const housesOverlapSpecialTiles = (x, z) => houseTiles.has(`${x},${z}`);
  if (
    normalizedHouses.some((house) => {
      const { x, z } = house.door;
      return !isHouseFrontTile(house, x, z) ||
        housesOverlapSpecialTiles(x, z) ||
        !isTileWalkable(tileIds[z][x]) ||
        objects.some((object) =>
          BLOCKING_OBJECTS.has(object.id) && object.x === x && (object.z ?? object.y) === z);
    }) ||
    normalizedHouses.some((house) =>
      objects.some((object) =>
        BLOCKING_OBJECTS.has(object.id) &&
        object.x === house.door.x && (object.z ?? object.y) === house.door.z)) ||
    housesOverlapSpecialTiles(spawn.x, spawn.z) ||
    housesOverlapSpecialTiles(exit.x, exit.z) ||
    [...players, ...enemyPlacements].some((unit) => housesOverlapSpecialTiles(unit.x, unit.z)) ||
    objects.some((object) =>
      BLOCKING_OBJECTS.has(object.id) && housesOverlapSpecialTiles(object.x, object.z ?? object.y))
  ) {
    throw new Error('House footprints and entrances cannot overlap units, blocked tiles, the Start, or the Exit.');
  }
  const chests = value.chests ?? [];
  const chestIds = new Set();
  if (!Array.isArray(chests) || !chests.every((chest) => {
    const z = chest?.z ?? chest?.y;
    if (
      !chest || typeof chest.id !== 'string' || chestIds.has(chest.id) ||
      typeof chest.name !== 'string' || typeof chest.rewardId !== 'string' ||
      !Number.isInteger(chest.x) || chest.x < 0 || chest.x >= width ||
      !Number.isInteger(z) || z < 0 || z >= height ||
      !isTileWalkable(tileIds[z][chest.x])
    ) return false;
    chestIds.add(chest.id);
    return true;
  })) {
    throw new Error('Level chests need unique IDs, a name, a reward, and a walkable tile.');
  }
  const normalizedChests = chests.map((chest) => ({
    id: chest.id,
    name: chest.name,
    x: chest.x,
    z: chest.z ?? chest.y,
    // Early Chapter 15 saves embedded a misspelled Orders Emblem item ID.
    rewardId: chest.rewardId === 'orders-emblem' ? 'master-emblem' : chest.rewardId,
    opened: chest.opened ?? false,
  }));
  const reinforcements = value.reinforcements ?? [];
  if (!Array.isArray(reinforcements) || !reinforcements.every((wave) =>
    wave &&
    Number.isInteger(wave.turn) && wave.turn > 1 &&
    (wave.entranceId === undefined || typeof wave.entranceId === 'string' && wave.entranceId.trim()) &&
    Array.isArray(wave.units) && (wave.units.length > 0 || wave.allies?.length > 0) &&
    (wave.allies === undefined || Array.isArray(wave.allies) && wave.allies.every((ally) =>
      ally && typeof ally.id === 'string' &&
      Number.isInteger(ally.x) && ally.x >= 0 && ally.x < width &&
      Number.isInteger(ally.z) && ally.z >= 0 && ally.z < height &&
      isTileWalkable(tileIds[ally.z][ally.x]))) &&
    (wave.spawned === undefined || typeof wave.spawned === 'boolean') &&
    wave.units.every((unit) => {
      const z = unit?.z ?? unit?.y;
      return unit && typeof unit.id === 'string' &&
        Number.isInteger(unit.x) && unit.x >= 0 && unit.x < width &&
        Number.isInteger(z) && z >= 0 && z < height &&
        isLevelTileWalkable({ tileIds }, unit.x, z, { type: enemyMovementType(unit.id) }) &&
        isValidUnitLevel(unit.level) &&
        isValidUnitAi(unit.ai) &&
        (unit.stealable === undefined || Array.isArray(unit.stealable) &&
          unit.stealable.every((id) => typeof id === 'string' && id.trim()) &&
          new Set(unit.stealable).size === unit.stealable.length) &&
        !housesOverlapSpecialTiles(unit.x, z);
    }) &&
    (wave.spawnedCount === undefined ||
      Number.isInteger(wave.spawnedCount) && wave.spawnedCount >= 0 && wave.spawnedCount <= wave.units.length)
  )) {
    throw new Error('Level reinforcements need a turn and valid unit placements.');
  }
  const normalizedReinforcements = reinforcements.map((wave) => ({
    turn: wave.turn,
    units: wave.units.map((unit) => ({
      id: unit.id,
      x: unit.x,
      z: unit.z ?? unit.y,
      ...(unit.level === undefined ? {} : { level: unit.level }),
      ...(unit.ai === undefined ? {} : { ai: unit.ai }),
      ...(unit.drop === undefined ? {} : { drop: unit.drop }),
      ...(unit.stealable === undefined ? {} : { stealable: [...unit.stealable] }),
      ...(unit.weaponId === undefined ? {} : { weaponId: unit.weaponId }),
    })),
    ...(wave.allies?.length ? { allies: wave.allies.map(({ id, x, z }) => ({ id, x, z })) } : {}),
    ...(wave.entranceId === undefined ? {} : { entranceId: wave.entranceId }),
    ...(wave.requiresHeartroots ? { requiresHeartroots: true } : {}),
    spawned: wave.spawned ?? false,
    spawnedCount: wave.spawnedCount ?? 0,
  }));
  const rawRoots = value.heartroots;
  const heartrootRules = rawRoots && typeof rawRoots.bossId === 'string' ? {
    bossId: rawRoots.bossId,
    healPerRoot: Math.max(0, Number(rawRoots.healPerRoot) || 0),
    frenzyStrength: Math.max(0, Number(rawRoots.frenzyStrength) || 0),
    frenzyMovement: Math.max(0, Number(rawRoots.frenzyMovement) || 0),
  } : null;
  const infirmary = validateInfirmary(value.infirmary, {
    width,
    height,
    tileIds,
    objective,
    players,
    enemies: enemyPlacements,
    objects,
  });
  const occupied = new Set();
  for (const unit of [...players, ...enemyPlacements]) {
    const key = `${unit.x},${unit.z}`;
    const blocked = objects.some((object) =>
      BLOCKING_OBJECTS.has(object.id) && object.x === unit.x && (object.z ?? object.y) === unit.z);
    if (occupied.has(key) || blocked) {
      throw new Error('Level units cannot share a tile or stand on blocking objects.');
    }
    occupied.add(key);
  }
  const level = {
    name: name.trim(),
    objective,
    extendEdges: value.extendEdges === true,
    forestEdges: value.forestEdges === true,
    noFence: value.noFence === true,
    lighting: value.lighting ?? 'night',
    groundRing: Number.isInteger(value.groundRing) ? Math.max(0, value.groundRing) : 0,
    extendSides: value.extendSides === true,
    width,
    height,
    spawn,
    exit,
    exitTiles: exitZone,
    players,
    enemies: enemyPlacements,
    startingItems,
    houses: normalizedHouses,
    decorativeHouses: normalizedDecorativeHouses,
    chests: normalizedChests,
    reinforcements: normalizedReinforcements,
    heartroots: heartrootRules,
    ...(infirmary ? { infirmary } : {}),
    tiles: tileIds,
    tileIds,
    trees: (Array.isArray(value.trees) ? value.trees : []).filter((tree) =>
      creepTreeImages.has(tree?.id) && Number.isInteger(tree.x) && Number.isInteger(tree.z) &&
      tree.x >= 0 && tree.x < width && tree.z >= 0 && tree.z < height),
    objects: objects.map((object) => ({
      x: object.x,
      z: object.z ?? object.y,
      id: object.id,
      ox: object.ox,
      oz: object.oz,
      blocksMovement: BLOCKING_OBJECTS.has(object.id),
    })),
  };
  if (!['night', 'sunset', 'dusk'].includes(level.lighting)) throw new Error('Level lighting must be night, sunset or dusk.');
  level.rescue = validateRescueRules(value.rescue, level);
  level.gateEncounter = validateGateEncounter(value.gateEncounter, level);
  if (objective === 'seize-gate' && !level.gateEncounter) throw new Error('Seize gate objective requires gate encounter rules.');
  if (objective === 'rescue-villagers' && !level.rescue) throw new Error('Rescue objective requires rescue rules.');
  if (value.leader !== undefined && typeof value.leader !== 'string') throw new Error('Level leader must be a unit ID.');
  level.leader = value.leader ?? 'maria';
  const required = value.requiredUnits ?? [level.leader];
  if (!Array.isArray(required) || !required.length || required.some((id) => typeof id !== 'string')) {
    throw new Error('Level requiredUnits must be a list of unit IDs.');
  }
  level.requiredUnits = [...required];
  level.cells = validateCells(value.cells, level);
  level.streets = validateStreets(value.streets, level);
  level.courtyard = validateCourtyard(value.courtyard, level);
  level.cathedral = validateCathedral(value.cathedral, level);
  return level;
}

function validateCourtyard(value, level) {
  if (value === undefined || value === null) {
    if (level.objective === 'defeat-courtyard-general') throw new Error('Courtyard objective requires courtyard rules.');
    return undefined;
  }
  const recruit = value.recruit;
  if (typeof value !== 'object' || Array.isArray(value) ||
      typeof value.bossId !== 'string' || !value.bossId.trim() ||
      !recruit || typeof recruit !== 'object' || Array.isArray(recruit) ||
      ['id', 'recruiterId'].some((id) => typeof recruit[id] !== 'string' || !recruit[id].trim()) ||
      (recruit.name !== undefined && (typeof recruit.name !== 'string' || !recruit.name.trim())) ||
      ['recruited', 'dead'].some((flag) => recruit[flag] !== undefined && typeof recruit[flag] !== 'boolean') ||
      (recruit.recruited === true && recruit.dead === true) ||
      !Array.isArray(value.triggers) || value.triggers.length !== 2) {
    throw new Error('Courtyard needs a boss, recruit identity and two finite progress triggers.');
  }
  const ids = new Set();
  const triggers = value.triggers.map((trigger) => {
    if (!trigger || typeof trigger.id !== 'string' || !trigger.id.trim() || ids.has(trigger.id) ||
        !Number.isInteger(trigger.thresholdZ) || trigger.thresholdZ < 0 || trigger.thresholdZ >= level.height ||
        (trigger.warnedTurn !== undefined && trigger.warnedTurn !== null &&
          (!Number.isInteger(trigger.warnedTurn) || trigger.warnedTurn < 1)) ||
        level.reinforcements.filter((wave) => wave.entranceId === trigger.id).length !== 1) {
      throw new Error('Courtyard triggers need unique IDs, in-map thresholds, valid warning turns and matching waves.');
    }
    ids.add(trigger.id);
    return { id: trigger.id, thresholdZ: trigger.thresholdZ, warnedTurn: trigger.warnedTurn ?? null };
  });
  if (triggers[0].thresholdZ <= triggers[1].thresholdZ) {
    throw new Error('Courtyard triggers must progress from the fountain toward the Cathedral.');
  }
  return {
    bossId: value.bossId,
    recruit: { ...recruit, recruited: recruit.recruited ?? false, dead: recruit.dead ?? false },
    triggers,
  };
}

function validateStreets(value, level) {
  if (value === undefined || value === null) {
    if (level.objective === 'seize-streets') throw new Error('Seize streets objective requires street rules.');
    return undefined;
  }
  const inside = (point, label) => {
    const coordinate = readCoordinate(point, level.width, level.height, label);
    if (!isLevelTileWalkable(level, coordinate.x, coordinate.z) ||
        level.objects.some((object) => object.blocksMovement && object.x === coordinate.x && object.z === coordinate.z)) {
      throw new Error(`Streets ${label} must use a walkable tile.`);
    }
    return coordinate;
  };
  const recruit = value.recruit;
  if (typeof value.bossId !== 'string' || !value.bossId.trim() ||
      !recruit || ['id', 'name', 'recruiterId'].some((key) => typeof recruit[key] !== 'string' || !recruit[key].trim()) ||
      (recruit.recruited !== undefined && typeof recruit.recruited !== 'boolean') ||
      (recruit.dead !== undefined && typeof recruit.dead !== 'boolean') ||
      (recruit.inventory !== undefined && (!Array.isArray(recruit.inventory) ||
        !recruit.inventory.every((item) => item && typeof item === 'object' && !Array.isArray(item) &&
          typeof item.id === 'string' && item.id.trim() &&
          (item.uses === undefined || Number.isInteger(item.uses) && item.uses >= 0)))) ||
      !Number.isInteger(recruit.hp) || recruit.hp < 0 ||
      (recruit.recruited === true && recruit.dead === true) ||
      (recruit.dead === true && recruit.hp !== 0)) {
    throw new Error('Streets need a boss ID and a recruit with valid identity, HP, and recruitment states.');
  }
  const seizePoint = inside(value.seizePoint, 'seize point');
  const coordinate = inside(recruit, 'recruit');
  if (coordinate.x === seizePoint.x && coordinate.z === seizePoint.z) {
    throw new Error('Streets recruit and seize point must use different tiles.');
  }
  return {
    seizePoint,
    bossId: value.bossId,
    recruit: {
      id: recruit.id, name: recruit.name, ...coordinate, recruiterId: recruit.recruiterId,
      recruited: recruit.recruited ?? false, dead: recruit.dead ?? false, hp: recruit.hp,
      ...(recruit.inventory === undefined ? {} : { inventory: recruit.inventory.map((item) => ({ ...item })) }),
    },
  };
}

// Locked cells: a closed door blocks its tile, and opening it releases the prisoners as enemies.
function validateCells(value, level) {
  if (value === undefined) return [];
  const inside = (x, z) => Number.isInteger(x) && Number.isInteger(z) && x >= 0 && z >= 0 && x < level.width && z < level.height;
  const ids = new Set();
  if (!Array.isArray(value) || !value.every((cell) => {
    if (!cell || typeof cell.id !== 'string' || ids.has(cell.id) || !inside(cell.door?.x, cell.door?.z) ||
      !isTileWalkable(level.tileIds[cell.door.z][cell.door.x]) ||
      (cell.opened !== undefined && typeof cell.opened !== 'boolean') ||
      !Array.isArray(cell.prisoners ?? []) ||
      !(cell.prisoners ?? []).every((prisoner) => prisoner && typeof prisoner.id === 'string' &&
        inside(prisoner.x, prisoner.z) && isTileWalkable(level.tileIds[prisoner.z][prisoner.x]) &&
        (prisoner.level === undefined || Number.isInteger(prisoner.level) && prisoner.level > 0))) return false;
    ids.add(cell.id);
    return true;
  })) {
    throw new Error('Level cells need unique IDs, a walkable door tile, and prisoners on walkable tiles.');
  }
  return value.map((cell) => ({
    id: cell.id,
    door: { x: cell.door.x, z: cell.door.z },
    opened: cell.opened ?? false,
    prisoners: (cell.prisoners ?? []).map(({ id, x, z, level: unitLevel }) => ({ id, x, z, ...(unitLevel ? { level: unitLevel } : {}) })),
  }));
}

const CHAPTER_URLS = [initialMapUrl, chapterTwoMapUrl, chapterThreeMapUrl, chapterFourMapUrl, chapterFiveMapUrl, chapterSixMapUrl, chapterSevenMapUrl, chapterEightMapUrl, chapterNineMapUrl, chapterTenMapUrl, chapterElevenMapUrl, chapterTwelveMapUrl, chapterThirteenMapUrl, chapterFourteenMapUrl];
CHAPTER_URLS.push(chapterFifteenMapUrl);
export const CHAPTER_COUNT = CHAPTER_URLS.length;

export async function loadChapterLevel(index) {
  const response = await fetch(CHAPTER_URLS[index]);
  if (!response.ok) throw new Error(`Could not load chapter ${index + 1} (${response.status}).`);
  return validateLevel(await response.json());
}

export async function loadInitialLevel(setStatus) {
  const status = (message) => setStatus(message, true);
  if (new URLSearchParams(window.location.search).get('playtest') === '1') {
    try {
      const savedLevel = localStorage.getItem('blood-emblem-playtest-level');
      if (!savedLevel) throw new Error('No map was sent from the editor.');
      return validateLevel(JSON.parse(savedLevel));
    } catch (error) {
      status(`Could not open the editor map: ${error.message}`);
      throw error;
    }
  }

  try {
    const response = await fetch(initialMapUrl);
    if (!response.ok) throw new Error(`Could not load the first level (${response.status}).`);
    return validateLevel(await response.json());
  } catch (error) {
    status(`Could not load level: ${error.message}`);
    throw error;
  }
}

// Corner heights in NW, NE, SW, SE order. A "rise" of n/s/w/e makes a ramp that climbs toward that side.
export function tileCornerHeights(def) {
  const top = def.elevation * 2;
  if (def.rise === 'w') return [top, 0, top, 0];
  if (def.rise === 'e') return [0, top, 0, top];
  if (def.rise === 'n') return [top, top, 0, 0];
  if (def.rise === 's') return [0, 0, top, top];
  return [def.elevation, def.elevation, def.elevation, def.elevation];
}

function addElevatedTiles(THREE, levelGroup, level, cells) {
  if (!cells.length) return;
  const sideMaterial = new THREE.MeshStandardMaterial({
    color: 0x4a2a18,
    roughness: 1,
    side: THREE.DoubleSide,
  });
  const sidePositions = [];
  const cornersAt = (x, z) => {
    const id = level.tileIds[z]?.[x];
    return id ? tileCornerHeights(getTileDef(id)) : [0, 0, 0, 0];
  };
  // [own corner a, own corner b, neighbour corner a, neighbour corner b, dx, dz, edge points]
  const edges = [
    { own: [0, 1], nb: [2, 3], dx: 0, dz: -1, p: [[0, 0], [1, 0]] },
    { own: [2, 3], nb: [0, 1], dx: 0, dz: 1, p: [[0, 1], [1, 1]] },
    { own: [0, 2], nb: [1, 3], dx: -1, dz: 0, p: [[0, 0], [0, 1]] },
    { own: [1, 3], nb: [0, 2], dx: 1, dz: 0, p: [[1, 0], [1, 1]] },
  ];
  const byAtlas = new Map();
  for (const cell of cells) {
    if (!byAtlas.has(cell.atlasId)) byAtlas.set(cell.atlasId, []);
    byAtlas.get(cell.atlasId).push(cell);
    const own = cornersAt(cell.x, cell.z);
    const baseX = cell.x - level.width / 2;
    const baseZ = cell.z - level.height / 2;
    for (const edge of edges) {
      const nb = cornersAt(cell.x + edge.dx, cell.z + edge.dz);
      const topA = own[edge.own[0]];
      const topB = own[edge.own[1]];
      const lowA = Math.min(topA, nb[edge.nb[0]]);
      const lowB = Math.min(topB, nb[edge.nb[1]]);
      if (topA - lowA < 0.001 && topB - lowB < 0.001) continue;
      const [[ax, az], [bx, bz]] = edge.p;
      const A = [baseX + ax, baseZ + az];
      const B = [baseX + bx, baseZ + bz];
      sidePositions.push(
        A[0], lowA, A[1], B[0], lowB, B[1], B[0], topB, B[1],
        A[0], lowA, A[1], B[0], topB, B[1], A[0], topA, A[1],
      );
    }
  }
  for (const [atlasId, group] of byAtlas) {
    const texture = atlasTexture(THREE, shipTilesImage, shipTileset.tiles, atlasId);
    const material = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.9,
      transparent: true,
      alphaTest: 0.08,
      side: THREE.DoubleSide,
    });
    const positions = [];
    const uvs = [];
    for (const cell of group) {
      const h = tileCornerHeights(getTileDef(atlasId));
      const x0 = cell.x - level.width / 2;
      const z0 = cell.z - level.height / 2;
      const nw = [x0, h[0], z0];
      const ne = [x0 + 1, h[1], z0];
      const sw = [x0, h[2], z0 + 1];
      const se = [x0 + 1, h[3], z0 + 1];
      positions.push(...nw, ...sw, ...se, ...nw, ...se, ...ne);
      uvs.push(0, 1, 0, 0, 1, 0, 0, 1, 1, 0, 1, 1);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;
    levelGroup.add(mesh);
  }
  if (sidePositions.length) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(sidePositions, 3));
    geometry.computeVertexNormals();
    levelGroup.add(new THREE.Mesh(geometry, sideMaterial));
  }
}

// Wooden fence along every land edge of an open-air map, marking where the playable area ends.
const FOREST_TILES = [
  'tree_a', 'tree_b', 'tree_c', 'tree_a', 'tree_b', 'tree_d', 'tree_c', 'tree_e',
  'bush', 'forest_floor_a', 'tree_a', 'tree_b', 'forest_floor_b', 'tree_c',
];

function forestTileAt(x, z) {
  const hash = (Math.imul(x + 101, 73856093) ^ Math.imul(z + 101, 19349663)) >>> 0;
  return FOREST_TILES[hash % FOREST_TILES.length];
}

const GROUND_RING_TILES = ['ground_a', 'ground_b', 'ground_c', 'ground_d', 'ground_cobble_a', 'ground_mix'];

function addBoundaryFence(THREE, levelGroup, level) {
  const wood = new THREE.MeshStandardMaterial({ color: 0x6b4a2b, roughness: 0.95 });
  const postGeometry = new THREE.BoxGeometry(0.14, 0.85, 0.14);
  const railX = new THREE.BoxGeometry(1, 0.09, 0.07);
  const railZ = new THREE.BoxGeometry(0.07, 0.09, 1);
  const edges = [];
  for (let i = 0; i < level.height; i++) {
    edges.push({ x: 0, z: i, side: 'w' }, { x: level.width - 1, z: i, side: 'e' });
  }
  for (let i = 0; i < level.width; i++) {
    edges.push({ x: i, z: 0, side: 'n' }, { x: i, z: level.height - 1, side: 's' });
  }
  for (const edge of edges) {
    if (WATER_TILE_IDS.has(level.tileIds[edge.z][edge.x])) continue;
    const cx = edge.x - level.width / 2 + 0.5;
    const cz = edge.z - level.height / 2 + 0.5;
    const alongZ = edge.side === 'w' || edge.side === 'e';
    const px = edge.side === 'w' ? cx - 0.5 : edge.side === 'e' ? cx + 0.5 : cx;
    const pz = edge.side === 'n' ? cz - 0.5 : edge.side === 's' ? cz + 0.5 : cz;
    for (const height of [0.3, 0.62]) {
      const rail = new THREE.Mesh(alongZ ? railZ : railX, wood);
      rail.position.set(px, height, pz);
      rail.castShadow = true;
      levelGroup.add(rail);
    }
    for (const offset of [-0.5, 0.5]) {
      const post = new THREE.Mesh(postGeometry, wood);
      post.position.set(alongZ ? px : px + offset, 0.42, alongZ ? pz + offset : pz);
      post.castShadow = true;
      levelGroup.add(post);
    }
  }
}

function addLaneBarriers(THREE, levelGroup, tileGroups) {
  const barriers = ['village_fence_h', 'village_fence_v', 'crossing_parapet', 'bridge_sandbags'];
  if (!barriers.some((id) => tileGroups.has(id))) return;
  const stone = new THREE.MeshStandardMaterial({ color: 0x858080, roughness: 0.95 });
  const parapet = new THREE.BoxGeometry(0.55, 0.7, 1);
  const cap = new THREE.BoxGeometry(0.7, 0.12, 1);
  for (const id of barriers) {
    let fenceGeometry;
    let fenceMaterial;
    if (fenceImages.has(id) && tileGroups.has(id)) {
      const vertical = id === 'village_fence_v';
      const image = fenceImages.get(id);
      const texture = new THREE.Texture(image);
      texture.magFilter = THREE.NearestFilter;
      texture.minFilter = THREE.NearestFilter;
      texture.generateMipmaps = false;
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.needsUpdate = true;
      fenceGeometry = new THREE.PlaneGeometry(
        vertical ? image.width / image.height : 1, vertical ? 1 : image.height / image.width);
      fenceGeometry.rotateX(-Math.PI / 2);
      fenceMaterial = new THREE.MeshStandardMaterial({
        map: texture, alphaTest: 0.5, roughness: 0.95, side: THREE.DoubleSide,
      });
    }
    for (const cell of tileGroups.get(id) ?? []) {
      const add = (geometry, material, dx, y, dz) => {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(cell.x + dx, y, cell.z + dz);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        levelGroup.add(mesh);
      };
      if (id === 'crossing_parapet') {
        add(parapet, stone, 0, 0.35, 0);
        add(cap, stone, 0, 0.76, 0);
      } else {
        // Keep the entire silhouette in its blocked tile, below neighboring unit sprites.
        add(fenceGeometry, fenceMaterial, 0, 0.13, 0);
      }
    }
  }
}

function infirmaryFloorTexture(THREE, kind) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 32;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not create infirmary floor tiles.');
  const ward = kind === 'infirmary_ward';
  context.fillStyle = kind === 'infirmary_wall' ? '#313f3b' : ward ? '#3d4a43' : '#303d3b';
  context.fillRect(0, 0, 32, 32);
  if (kind !== 'infirmary_wall') {
    context.fillStyle = ward ? '#586155' : '#47534f';
    context.fillRect(1, 1, 15, 15);
    context.fillRect(17, 17, 14, 14);
    context.strokeStyle = '#26302e';
    context.strokeRect(0.5, 0.5, 31, 31);
    context.fillStyle = '#392f2e';
    context.fillRect(5, 25, 3, 1);
    context.fillRect(23, 8, 2, 1);
  } else {
    context.strokeStyle = '#25322d';
    for (let y = 8; y < 32; y += 8) {
      context.fillRect(0, y, 32, 1);
      context.strokeRect(y % 16 ? 8 : 16, y - 8, 16, 8);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function infirmarySign(THREE, levelGroup, level, text, x, z, color = '#c8dbcf', width = 2.3) {
  const canvas = document.createElement('canvas');
  canvas.width = 384;
  canvas.height = 64;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not create infirmary objective sign.');
  context.fillStyle = '#20322d';
  context.fillRect(0, 0, 384, 64);
  context.strokeStyle = color;
  context.lineWidth = 3;
  context.strokeRect(2, 2, 380, 60);
  context.fillStyle = color;
  context.textAlign = 'center';
  context.font = 'bold 26px Georgia, serif';
  context.fillText(text, 192, 41, 366);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, width / 6),
    new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, depthTest: false }));
  mesh.rotation.x = -OBJECT_TILT;
  mesh.position.set(x - level.width / 2 + 0.5, 1.35, z - level.height / 2 + 0.5);
  mesh.renderOrder = 8;
  levelGroup.add(mesh);
  return mesh;
}

function addInfirmaryTown(THREE, levelGroup, level) {
  const padding = 8;
  const geometry = new THREE.PlaneGeometry(1, 1);
  geometry.rotateX(-Math.PI / 2);
  const material = new THREE.MeshBasicMaterial({
    map: atlasTexture(THREE, shipTilesImage, shipTileset.tiles, 'ground_cobble_a'),
    color: 0x66716b,
  });
  const count = (level.width + padding * 2) * (level.height + padding * 2) - level.width * level.height;
  const paving = new THREE.InstancedMesh(geometry, material, count);
  const transform = new THREE.Object3D();
  let index = 0;
  for (let z = -padding; z < level.height + padding; z++) {
    for (let x = -padding; x < level.width + padding; x++) {
      if (x >= 0 && x < level.width && z >= 0 && z < level.height) continue;
      transform.position.set(x - level.width / 2 + 0.5, -0.02, z - level.height / 2 + 0.5);
      transform.updateMatrix();
      paving.setMatrixAt(index++, transform.matrix);
    }
  }
  paving.renderOrder = -2;
  paving.instanceMatrix.needsUpdate = true;
  const town = new THREE.Group();
  town.add(paving);
  const texture = new THREE.Texture(greyHouseNoEntryImage);
  texture.magFilter = texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  const houseMaterial = new THREE.MeshBasicMaterial({
    map: texture, color: 0x8c9890, transparent: true, alphaTest: 0.1,
    depthWrite: false, side: THREE.DoubleSide,
  });
  const houseWidth = 2.8;
  const houseHeight = houseWidth * greyHouseNoEntryImage.height / greyHouseNoEntryImage.width;
  const houseGeometry = new THREE.PlaneGeometry(houseWidth, houseHeight);
  houseGeometry.translate(0, houseHeight / 2, 0);
  const addHouse = (x, z) => {
    const house = new THREE.Mesh(houseGeometry, houseMaterial);
    house.rotation.x = -OBJECT_TILT;
    house.position.set(x, 0.05, z);
    house.renderOrder = -1;
    town.add(house);
  };
  for (let z = -level.height / 2 + 1; z < level.height / 2; z += 5) {
    addHouse(-level.width / 2 - 2.6, z);
    addHouse(level.width / 2 + 2.6, z);
  }
  for (let x = -level.width / 2 + 2; x < level.width / 2; x += 5) {
    addHouse(x, -level.height / 2 - 3);
    addHouse(x, level.height / 2 + 5);
  }
  levelGroup.add(town);
  levelGroup.userData.infirmaryTown = town;
}

function streetMaterial(THREE, image, color = 0xffffff) {
  const texture = new THREE.Texture(image);
  texture.magFilter = texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return new THREE.MeshBasicMaterial({ map: texture, color, alphaTest: 0.1, side: THREE.DoubleSide });
}

function streetFacade(THREE, material, image, width, x, z, upright = true) {
  const height = width * image.height / image.width;
  const geometry = new THREE.PlaneGeometry(width, height);
  geometry.translate(0, height / 2, 0);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -OBJECT_TILT;
  if (upright) {
    // Camera-aligned facades keep off-center houses upright instead of perspective-skewed.
    mesh.onBeforeRender = (_renderer, _scene, camera) => mesh.quaternion.copy(camera.quaternion);
    mesh.userData.uprightFacade = true;
  }
  mesh.position.set(x, 0.12, z);
  return mesh;
}

function addStreetBlock(THREE, levelGroup, level, house) {
  const image = house.style === 'clocktower' ? streetClocktowerImage
    : house.style === 'shuttered-shop' ? streetShopImage : streetRowHouseImage;
  const material = streetMaterial(THREE, image);
  const ratio = image.height / image.width * Math.sin(OBJECT_TILT);
  const rows = house.style === 'clocktower' ? 1 : Math.max(1, Math.round(house.height / 3));
  const depth = house.height / rows;
  const columns = house.style === 'clocktower' ? 1 : Math.max(1, Math.ceil(house.width / (depth / ratio)));
  const cellWidth = house.width / columns;
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const width = Math.min(cellWidth - 0.08, depth * 0.98 / ratio);
      const facade = streetFacade(THREE, material, image, width,
        house.x + cellWidth * (column + 0.5) - level.width / 2,
        house.z + depth * (row + 1) - level.height / 2,
        house.style !== 'clocktower');
      facade.name = `street-building-${house.id}-${row}-${column}`;
      facade.userData.footprint = { x: house.x, z: house.z, width: house.width, height: house.height };
      facade.renderOrder = 1;
      levelGroup.add(facade);
      if (house.style === 'clocktower') {
        facade.name = 'street-clocktower';
        levelGroup.userData.clocktower = facade;
      }
    }
  }
}

function addStreetTown(THREE, levelGroup, level) {
  const town = new THREE.Group();
  town.name = 'cathedral-street-border';
  const geometry = new THREE.PlaneGeometry(1, 1);
  geometry.rotateX(-Math.PI / 2);
  const pavingMaterial = new THREE.MeshBasicMaterial({
    map: atlasTexture(THREE, shipTilesImage, shipTileset.tiles, 'ground_cobble_a'), color: 0x747982,
  });
  const count = (level.width + STREET_CAMERA_PADDING * 2) * (level.height + STREET_CAMERA_PADDING * 2) -
    level.width * level.height;
  const paving = new THREE.InstancedMesh(geometry, pavingMaterial, count);
  const transform = new THREE.Object3D();
  let index = 0;
  for (let z = -STREET_CAMERA_PADDING; z < level.height + STREET_CAMERA_PADDING; z++) {
    for (let x = -STREET_CAMERA_PADDING; x < level.width + STREET_CAMERA_PADDING; x++) {
      if (x >= 0 && x < level.width && z >= 0 && z < level.height) continue;
      transform.position.set(x - level.width / 2 + 0.5, -0.02, z - level.height / 2 + 0.5);
      transform.updateMatrix();
      paving.setMatrixAt(index++, transform.matrix);
    }
  }
  paving.instanceMatrix.needsUpdate = true;
  town.add(paving);
  const facadeMaterial = streetMaterial(THREE, streetShopImage, 0x818591);
  const addHouse = (x, z) => town.add(streetFacade(THREE, facadeMaterial, streetShopImage, 2.8, x, z));
  for (let z = -level.height / 2 - 2; z <= level.height / 2 + 6; z += 4) {
    for (const side of [-1, 1]) {
      addHouse(side * (level.width / 2 + 3), z);
      addHouse(side * (level.width / 2 + 6.5), z + 2);
    }
  }
  for (let x = -level.width / 2 + 1; x < level.width / 2; x += 4) {
    addHouse(x, level.height / 2 + 6);
    addHouse(x, -level.height / 2 - 2);
    addHouse(x + 2, -level.height / 2 - 5.5);
  }
  levelGroup.add(town);
  levelGroup.userData.streetTown = town;
  levelGroup.userData.streetCameraPadding = STREET_CAMERA_PADDING;

  const lampMaterial = streetMaterial(THREE, streetLampImage);
  const lamps = [];
  for (let z = 0; z < level.height; z++) {
    for (let x = 0; x < level.width; x++) {
      if (level.tileIds[z][x] !== 'street_lamp') continue;
      const lamp = streetFacade(THREE, lampMaterial, streetLampImage, 0.48,
        x + 0.5 - level.width / 2, z + 0.75 - level.height / 2, false);
      lamp.name = `curb-lamp-${x}-${z}`;
      levelGroup.add(lamp);
      lamps.push(lamp);
      const aura = new THREE.Sprite(new THREE.SpriteMaterial({
        map: getGlowTexture(THREE), color: 0xffd998, transparent: true,
        depthWrite: false, blending: THREE.AdditiveBlending,
      }));
      aura.position.copy(lamp.position);
      aura.position.y += 0.6;
      aura.position.z -= 0.65;
      aura.scale.setScalar(0.35);
      levelGroup.add(aura);
      glowLights.push({ sprite: aura, radius: 0.35, intensity: 0.3, phase: x + z * 1.7 });
    }
  }
  levelGroup.userData.streetLamps = lamps;
  const seizeGeometry = new THREE.PlaneGeometry(0.94, 0.94);
  seizeGeometry.rotateX(-Math.PI / 2);
  const seize = new THREE.Mesh(seizeGeometry, new THREE.MeshBasicMaterial({
    color: 0xe6bf70, transparent: true, opacity: 0.55, depthWrite: false,
  }));
  seize.position.set(level.streets.seizePoint.x + 0.5 - level.width / 2, 0.06,
    level.streets.seizePoint.z + 0.5 - level.height / 2);
  seize.name = 'street-seize-controls';
  levelGroup.add(seize);
  const marker = infirmarySign(THREE, levelGroup, level, 'QUARANTINE', 2, 17, '#e6bf70', 1.5);
  marker.name = 'western-quarantine-warning-marker';
}

function courtyardTexture(THREE, key) {
  const image = courtyardImages.get(key);
  if (!image) throw new Error(`Missing courtyard art "${key}".`);
  const texture = new THREE.Texture(image);
  texture.magFilter = texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function addCourtyardGround(THREE, levelGroup, level) {
  const groups = new Map();
  for (let z = 0; z < level.height; z++) {
    for (let x = 0; x < level.width; x++) {
      const id = level.tileIds[z][x];
      const variation = (Math.min(x, level.width - 1 - x) * 3 + z * 7) % 5;
      let art;
      if (id === 'courtyard_paving') {
        art = z === 3 && x >= 10 && x <= 15 ? 'steps'
          : [9, 19, 25].includes(z) && (x === 12 || x === 13) ? 'paving_medallion'
          : (x === 11 || x === 14) && z > 3 ? 'paving_border'
          : variation === 0 ? 'paving_moss' : 'paving';
      } else if (id === 'courtyard_lawn') {
        const bedEdge = [level.tileIds[z - 1]?.[x], level.tileIds[z + 1]?.[x]].includes('courtyard_hedge');
        art = bedEdge ? variation === 0 ? 'soil' : 'flowerbed'
          : variation < 2 ? 'lawn_flowers' : 'lawn';
      } else {
        art = { courtyard_hedge: variation < 2 ? 'hedge_alt' : 'hedge',
          courtyard_wall: 'wall', courtyard_cathedral: 'masonry', courtyard_fountain: 'basin' }[id];
      }
      if (!art) throw new Error(`Unsupported courtyard ground "${id}".`);
      if (!groups.has(art)) groups.set(art, []);
      groups.get(art).push({ x, z });
    }
  }
  const geometry = new THREE.PlaneGeometry(1, 1);
  geometry.rotateX(-Math.PI / 2);
  const transform = new THREE.Object3D();
  for (const [art, cells] of groups) {
    const material = new THREE.MeshBasicMaterial({ map: courtyardTexture(THREE, art) });
    let patchGeometry = geometry;
    let placements = cells;
    if (art === 'basin') {
      const xs = cells.map(({ x }) => x), zs = cells.map(({ z }) => z);
      const left = Math.min(...xs), right = Math.max(...xs);
      const north = Math.min(...zs), south = Math.max(...zs);
      patchGeometry = new THREE.PlaneGeometry(right - left + 1, south - north + 1);
      patchGeometry.rotateX(-Math.PI / 2);
      placements = [{ x: (left + right) / 2, z: (north + south) / 2 }];
    }
    const mesh = new THREE.InstancedMesh(patchGeometry, material, placements.length);
    mesh.name = `courtyard-ground-${art}`;
    mesh.userData.art = art;
    placements.forEach(({ x, z }, i) => {
      transform.position.set(x + 0.5 - level.width / 2, 0, z + 0.5 - level.height / 2);
      transform.updateMatrix();
      mesh.setMatrixAt(i, transform.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    levelGroup.add(mesh);
  }
}

function addCourtyardArchitecture(THREE, levelGroup, level) {
  const courtyard = new THREE.Group();
  courtyard.name = 'cathedral-courtyard-architecture';
  const pavingGeometry = new THREE.PlaneGeometry(1, 1);
  pavingGeometry.rotateX(-Math.PI / 2);
  const pavingMaterial = new THREE.MeshBasicMaterial({ map: courtyardTexture(THREE, 'paving'), color: 0xa3a4a6 });
  const count = (level.width + STREET_CAMERA_PADDING * 2) * (level.height + STREET_CAMERA_PADDING * 2) -
    level.width * level.height;
  const border = new THREE.InstancedMesh(pavingGeometry, pavingMaterial, count);
  border.name = 'courtyard-scenic-paving';
  const transform = new THREE.Object3D();
  let index = 0;
  for (let z = -STREET_CAMERA_PADDING; z < level.height + STREET_CAMERA_PADDING; z++) {
    for (let x = -STREET_CAMERA_PADDING; x < level.width + STREET_CAMERA_PADDING; x++) {
      if (x >= 0 && x < level.width && z >= 0 && z < level.height) continue;
      transform.position.set(x + 0.5 - level.width / 2, -0.03, z + 0.5 - level.height / 2);
      transform.updateMatrix();
      border.setMatrixAt(index++, transform.matrix);
    }
  }
  border.instanceMatrix.needsUpdate = true;
  courtyard.add(border);
  const materialFor = (id, color) => streetMaterial(THREE, courtyardImages.get(id), color);
  const hedgeTop = materialFor('hedge');
  const hedgeSide = materialFor('hedge_side');
  const wallTop = materialFor('wall');
  const wallSide = materialFor('wall_side');
  const cathedralSide = materialFor('masonry');
  for (const [id, height, top, side] of [
    ['courtyard_hedge', 0.38, hedgeTop, hedgeSide],
    ['courtyard_wall', 0.28, wallTop, wallSide],
    ['courtyard_cathedral', 0.75, wallTop, cathedralSide],
  ]) {
    const cells = [];
    for (let z = 0; z < level.height; z++) {
      for (let x = 0; x < level.width; x++) {
        if (level.tileIds[z][x] === id) cells.push({ x, z });
      }
    }
    const geometry = new THREE.BoxGeometry(1, height, 1);
    const mesh = new THREE.InstancedMesh(geometry, [side, side, top, side, side, side], cells.length);
    mesh.name = id;
    cells.forEach(({ x, z }, i) => {
      transform.position.set(x + 0.5 - level.width / 2, height / 2, z + 0.5 - level.height / 2);
      transform.updateMatrix();
      mesh.setMatrixAt(i, transform.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    courtyard.add(mesh);
  }
  const topiaryImage = courtyardImages.get('topiary');
  const topiaryMaterial = materialFor('topiary');
  for (const [north, south] of [[5, 8], [10, 14], [20, 24]]) {
    for (const x of [3, 8, 17, 22]) {
      for (const z of [north, south]) {
        const bush = streetFacade(THREE, topiaryMaterial, topiaryImage, 0.65,
          x + 0.5 - level.width / 2, z + 0.95 - level.height / 2, false);
        bush.position.y = 0.4;
        bush.name = `courtyard-topiary-${x}-${z}`;
        bush.userData.footprint = { x, z, width: 1, height: 1 };
        courtyard.add(bush);
      }
    }
  }
  const doorsImage = courtyardImages.get('doors');
  const doors = streetFacade(THREE, materialFor('doors'), doorsImage, 5.4,
    13 - level.width / 2, 2.8 - level.height / 2);
  doors.name = 'courtyard-cathedral-doors';
  doors.userData.footprint = { x: 10, z: -2, width: 6, height: 5 };
  courtyard.add(doors);
  const fountainImage = courtyardImages.get('fountain');
  const fountain = streetFacade(THREE, materialFor('fountain'), fountainImage, 3.2,
    13 - level.width / 2, 17.9 - level.height / 2, false);
  fountain.name = 'courtyard-dry-fountain';
  fountain.userData.footprint = { x: 11, z: 15, width: 4, height: 3 };
  courtyard.add(fountain);
  const lampMaterial = streetMaterial(THREE, streetLampImage);
  for (const [x, z] of [[9, 25], [16, 25], [9, 18], [16, 18], [9, 9], [16, 9]]) {
    const lamp = streetFacade(THREE, lampMaterial, streetLampImage, 0.32,
      x + 0.2 - level.width / 2, z + 0.9 - level.height / 2);
    lamp.name = `courtyard-lamp-${x}-${z}`;
    courtyard.add(lamp);
  }
  const entrances = [];
  for (const trigger of level.courtyard.triggers) {
    const wave = level.reinforcements.find((entry) => entry.entranceId === trigger.id);
    const entrance = new THREE.Group();
    entrance.name = `${trigger.id}-entrance`;
    entrance.userData.entranceId = trigger.id;
    for (const unit of wave.units) {
      const marker = new THREE.Mesh(pavingGeometry, new THREE.MeshBasicMaterial({
        color: trigger.id === 'courtyard-ravens' ? 0x777196 : 0xc0ad76,
        transparent: true, opacity: 0.4, depthWrite: false,
      }));
      marker.position.set(unit.x + 0.5 - level.width / 2, 0.045, unit.z + 0.5 - level.height / 2);
      marker.userData.arrivalTile = { x: unit.x, z: unit.z };
      entrance.add(marker);
    }
    courtyard.add(entrance);
    entrances.push(entrance);
  }
  levelGroup.add(courtyard);
  levelGroup.userData.courtyardCameraPadding = STREET_CAMERA_PADDING;
  levelGroup.userData.courtyardGeometry = {
    architecture: courtyard,
    fountain: fountain.userData.footprint,
    cathedral: doors.userData.footprint,
    entrances,
    cameraPadding: STREET_CAMERA_PADDING,
  };
}

function addInfirmaryArchitecture(THREE, levelGroup, level) {
  const wallTexture = (id) => {
    const texture = new THREE.Texture(infirmaryObjectImages.get(id));
    texture.magFilter = texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
  };
  // Cutaway partitions must not hide sprites standing on neighboring walkable tiles.
  const wall = new THREE.MeshBasicMaterial({ map: wallTexture('infirmary_wall_face'), depthWrite: false });
  const trim = new THREE.MeshBasicMaterial({ color: 0x203e34, depthWrite: false });
  const cap = new THREE.MeshBasicMaterial({ map: wallTexture('infirmary_wall_cap'), color: 0x83988a, depthWrite: false });
  const doorMaterials = new Map();
  for (const direction of ['front', 'side']) {
    const texture = new THREE.Texture(infirmaryObjectImages.get(`infirmary_door_${direction}`));
    texture.magFilter = texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    doorMaterials.set(direction, new THREE.MeshBasicMaterial({
      map: texture, transparent: true, alphaTest: 0.08, depthWrite: false, side: THREE.DoubleSide,
    }));
  }
  for (const gate of level.infirmary.gates) {
    Object.defineProperty(gate, 'openMeshes', { value: [], configurable: true });
  }
  const addBox = (x, z, w, h, d, y, material) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x - level.width / 2 + 0.5, y, z - level.height / 2 + 0.5);
    mesh.receiveShadow = true;
    mesh.renderOrder = -1;
    levelGroup.add(mesh);
    return mesh;
  };
  levelGroup.userData.infirmaryDoors = [];
  for (let z = 0; z < level.height; z++) {
    for (let x = 0; x < level.width; x++) {
      const id = level.tileIds[z][x];
      if (id.startsWith('mans_wall')) {
        addBox(x, z, 1, 0.6, 1, 0.3, wall);
        addBox(x, z, 1.02, 0.09, 1.02, 0.64, cap);
        addBox(x, z, 1.01, 0.16, 1.01, 0.1, trim);
      } else if (id === 'mans_door_open') {
        const { direction, mirrored } = infirmaryDoorOrientation(level, x, z);
        const geometry = new THREE.PlaneGeometry(direction === 'front' ? 1.08 : 0.675, 1.35);
        geometry.translate(0, 0.675, 0);
        const frame = new THREE.Mesh(geometry, doorMaterials.get(direction));
        frame.position.set(x - level.width / 2 + 0.5, 0.07, z - level.height / 2 + 0.7);
        frame.rotation.x = -OBJECT_TILT;
        if (mirrored) frame.scale.x = -1;
        frame.renderOrder = 1;
        const gate = level.infirmary.gates.find((entry) => entry.blocks.some((block) => block.x === x && block.z === z));
        if (gate) {
          gate.openMeshes.push(frame);
          frame.visible = !gate.closed;
        }
        frame.userData.doorTile = { x, z };
        frame.userData.doorDirection = direction;
        frame.userData.doorMirrored = mirrored;
        levelGroup.userData.infirmaryDoors.push(frame);
        levelGroup.add(frame);
      }
    }
  }
  infirmarySign(THREE, levelGroup, level, 'WEST ISOLATION', 3, 7);
  infirmarySign(THREE, levelGroup, level, 'EAST ISOLATION', 20, 7);
  for (const [index, patient] of level.infirmary.patients.entries()) {
    infirmarySign(THREE, levelGroup, level, `RECOVERY WARD ${index ? 'B' : 'A'}`, patient.x, patient.z - 2, '#c7cbb8');
  }
  infirmarySign(THREE, levelGroup, level, 'OPERATING THEATRE', 12, 3);
  infirmarySign(THREE, levelGroup, level, 'TREATMENT RECORDS', level.infirmary.ledger.x, level.infirmary.ledger.z - 1, '#e8cc83');
  const door = level.infirmary.defensePoint;
  infirmarySign(THREE, levelGroup, level, 'DEFEND / EVACUATION', door.x, door.z, '#8ff0b3', 3);
  infirmarySign(THREE, levelGroup, level, 'CARRIAGE ENTRANCE', 12, 19, '#ecb0a0', 3);
  for (const gate of level.infirmary.gates) {
    infirmarySign(THREE, levelGroup, level, 'SEAL ISOLATION', gate.x, gate.z, '#e8cc83', 1.9);
  }
}

export function buildLevel(THREE, levelGroup, value) {
  const level = validateLevel(value);
  for (const glow of glowLights) glow.sprite.material.dispose();
  glowLights.length = 0;
  levelGroup.traverse((object) => {
    if (!object.isMesh) return;
    object.geometry.dispose();
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      material.map?.dispose();
      material.dispose();
    }
  });
  levelGroup.clear();
  delete levelGroup.userData.cityBackdrop;
  delete levelGroup.userData.clocktower;
  delete levelGroup.userData.streetTown;
  delete levelGroup.userData.streetLamps;
  delete levelGroup.userData.streetCameraPadding;
  delete levelGroup.userData.infirmaryTown;

  const tileGroups = new Map();
  const elevatedCells = [];
  for (let z = 0; z < level.height; z++) {
    for (let x = 0; x < level.width; x++) {
      let atlasId = level.tileIds[z][x];
      if (level.gateEncounter && atlasId === 'city_wall') {
        if (z < level.exit.z - 1) continue;
        // Pave beneath the tilted gate, keeping its foundation impassable.
        atlasId = 'crossing_deck';
      }
      if (level.infirmary) {
        atlasId = atlasId.startsWith('mans_wall') ? 'infirmary_wall'
          : isInfirmaryRecoveryWard(x, z)
            ? 'infirmary_ward' : 'infirmary_floor';
      }
      if (getTileDef(atlasId).elevation > 0) {
        elevatedCells.push({ x, z, atlasId });
        continue;
      }
      if (!tileGroups.has(atlasId)) tileGroups.set(atlasId, []);
      tileGroups.get(atlasId).push({
        x: x - level.width / 2 + 0.5,
        z: z - level.height / 2 + 0.5,
      });
      // Diagonal hull tiles are partly transparent and need animated water beneath them.
      if (atlasId.startsWith('hull_diag_')) {
        if (!tileGroups.has('water_a')) tileGroups.set('water_a', []);
        tileGroups.get('water_a').push({
          x: x - level.width / 2 + 0.5,
          z: z - level.height / 2 + 0.5,
          y: -0.01,
        });
      }
    }
  }
  addElevatedTiles(THREE, levelGroup, level, elevatedCells);

  // Open-air levels repeat their edge terrain outward so the camera never sees past the map.
  if (!level.infirmary && (level.extendEdges || level.extendSides)) {
    const pad = 26;
    const padZ = level.extendSides ? 0 : pad;
    const padSouth = level.extendSides ? 14 : pad;
    for (let z = -padZ; z < level.height + padSouth; z++) {
      for (let x = -pad; x < level.width + pad; x++) {
        if (level.gateEncounter && z < 0) continue;
        if (x >= 0 && x < level.width && z >= 0 && z < level.height) continue;
        const edgeId = level.tileIds[Math.min(Math.max(z, 0), level.height - 1)][
          Math.min(Math.max(x, 0), level.width - 1)];
        let atlasId = getTileDef(edgeId).elevation > 0 || edgeId === 'village_building'
          ? 'village_gravel_a'
          : edgeId;
        if (level.forestEdges && !WATER_TILE_IDS.has(atlasId)) {
          const ringDistance = Math.max(-x, x - level.width + 1, -z, z - level.height + 1);
          atlasId = ringDistance <= level.groundRing
            ? GROUND_RING_TILES[((Math.imul(x + 101, 73856093) ^ Math.imul(z + 101, 19349663)) >>> 0) % GROUND_RING_TILES.length]
            : forestTileAt(x, z);
          // Only in-map cover tiles glow, so out-of-bounds undergrowth is drawn as plain trees.
          if (getTileDef(atlasId).moveCost > 1) atlasId = 'tree_c';
        }
        if (!tileGroups.has(atlasId)) tileGroups.set(atlasId, []);
        tileGroups.get(atlasId).push({
          x: x - level.width / 2 + 0.5,
          z: z - level.height / 2 + 0.5,
        });
      }
    }
  }

  if (level.extendEdges && !level.noFence) addBoundaryFence(THREE, levelGroup, level);
  addLaneBarriers(THREE, levelGroup, tileGroups);

  const geometry = new THREE.PlaneGeometry(1, 1);
  geometry.rotateX(-Math.PI / 2);
  if (level.courtyard) addCourtyardGround(THREE, levelGroup, level);
  if (level.cathedral) addCathedralInterior(THREE, levelGroup, level);
  for (const [atlasId, cells] of tileGroups) {
    if (level.courtyard || level.cathedral) continue;
    const isWater = WATER_TILE_IDS.has(atlasId);
    const texture = STREET_TILE_IDS.has(atlasId)
      ? atlasTexture(THREE, shipTilesImage, shipTileset.tiles, 'ground_cobble_b')
      : level.infirmary ? infirmaryFloorTexture(THREE, atlasId) : isWater
      ? waterStripTexture(THREE)
      : VILLAGE_GRAVEL_TILE_IDS.has(atlasId)
        ? gravelTexture(THREE, atlasId)
        : atlasTexture(THREE, shipTilesImage, shipTileset.tiles, atlasId);
    const cover = !isWater && !VILLAGE_GRAVEL_TILE_IDS.has(atlasId) && getTileDef(atlasId).moveCost > 1;
    const material = level.streets
      ? new THREE.MeshBasicMaterial({ map: texture,
        color: STREET_TILE_IDS.has(atlasId) ? 0xb8b5aa : atlasId === 'village_building' ? 0x535960 : 0x8d9299 })
      : level.infirmary
      ? new THREE.MeshBasicMaterial({ map: texture })
      : isWater
      ? createWaterMaterial(THREE, texture)
      : new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.9,
        transparent: true,
        alphaTest: 0.08,
        side: THREE.DoubleSide,
        // Cover tiles glow a sickly green so players can spot the avoid/defense ground at a glance.
        ...(cover ? { emissive: 0x39ff7a, emissiveMap: texture, emissiveIntensity: 0.85, color: 0x9dffb0 } : {}),
      });
    const instances = new THREE.InstancedMesh(geometry, material, cells.length);
    const transform = new THREE.Object3D();
    cells.forEach((cell, index) => {
      transform.position.set(cell.x, cell.y ?? 0, cell.z);
      transform.updateMatrix();
      instances.setMatrixAt(index, transform.matrix);
    });
    instances.receiveShadow = true;
    if (level.infirmary) instances.renderOrder = -2;
    instances.instanceMatrix.needsUpdate = true;
    levelGroup.add(instances);
  }
  if (level.infirmary) {
    addInfirmaryTown(THREE, levelGroup, level);
    addInfirmaryArchitecture(THREE, levelGroup, level);
  }
  if (level.streets) addStreetTown(THREE, levelGroup, level);
  if (level.courtyard) addCourtyardArchitecture(THREE, levelGroup, level);

  const mastTexture = new THREE.Texture(mastImage);
  const mastSmooth = shipTileset.tall?.[0]?.filter === 'smooth';
  mastTexture.magFilter = mastSmooth ? THREE.LinearFilter : THREE.NearestFilter;
  mastTexture.minFilter = mastSmooth ? THREE.LinearMipmapLinearFilter : THREE.NearestFilter;
  mastTexture.generateMipmaps = mastSmooth;
  mastTexture.anisotropy = mastSmooth ? 4 : 1;
  mastTexture.colorSpace = THREE.SRGBColorSpace;
  mastTexture.needsUpdate = true;
  const mastMaterial = new THREE.MeshBasicMaterial({
    map: mastTexture,
    transparent: true,
    alphaTest: 0.1,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mastBases = [];
  for (let z = 0; z < level.height; z++) {
    for (let x = 0; x < level.width; x++) {
      if (level.tileIds[z][x] === 'mast_base') mastBases.push({ x, z });
    }
  }
  for (const base of mastBases) {
    const mast = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), mastMaterial);
    mast.position.set(
      base.x - level.width / 2 + 0.5,
      1.5,
      base.z - level.height / 2 + 0.5,
    );
    mast.renderOrder = 2;
    levelGroup.add(mast);
  }

  // Solid props stand upright facing the camera; loose floor clutter (ropes, bones, blood) stays flat.
  // A tileset object can override this with an explicit "upright" flag.
  const standingGeometry = new THREE.PlaneGeometry(OBJECT_SIZE, OBJECT_SIZE);
  standingGeometry.translate(0, OBJECT_SIZE / 2, 0);
  const flatGeometry = new THREE.PlaneGeometry(OBJECT_SIZE, OBJECT_SIZE);
  const shadowGeometry = new THREE.CircleGeometry(0.4, 20);
  shadowGeometry.rotateX(-Math.PI / 2);
  const shadowMaterial = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.38,
    depthWrite: false,
  });
  for (const object of level.objects) {
    // Older saves place a second doorway prop on the authored service door.
    if (level.infirmary && object.id === 'infirmary_evacuation_marker' &&
      level.tileIds[object.z][object.x] === 'mans_door_open') continue;
    const atlasObject = shipTileset.objects.list.find((entry) => entry.id === object.id);
    const customImage = infirmaryObjectImages.get(object.id);
    const upright = atlasObject ? atlasObject.upright ?? atlasObject.blocksMovement : false;
    let texture;
    if (customImage) {
      texture = new THREE.Texture(customImage);
      texture.magFilter = THREE.NearestFilter;
      texture.minFilter = THREE.NearestFilter;
      texture.generateMipmaps = false;
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.needsUpdate = true;
    } else {
      texture = atlasTexture(THREE, shipObjectsImage, shipTileset.objects, object.id);
    }
    const centerX = object.x - level.width / 2 + 0.5;
    const centerZ = object.z - level.height / 2 + 0.5;
    const lift = getTileElevation(level, object.x, object.z);
    let sprite;
    if (customImage) {
      const size = INFIRMARY_OBJECT_SIZES.get(object.id);
      const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        alphaTest: 0.08,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const geometry = new THREE.PlaneGeometry(size * customImage.width / customImage.height, size);
      geometry.translate(0, size / 2, 0);
      sprite = new THREE.Mesh(geometry, material);
      sprite.rotation.x = -OBJECT_TILT;
      sprite.position.set(centerX, 0.12 + lift, centerZ + 0.25);
      sprite.renderOrder = 3;
      if (level.infirmary?.ledger.x === object.x && level.infirmary.ledger.z === object.z &&
          object.id === 'infirmary_records_cabinet') {
        Object.defineProperty(level.infirmary.ledger, 'mesh', { value: sprite, writable: true, configurable: true });
        sprite.visible = !level.infirmary.ledger.collected;
      }
      for (const patient of level.infirmary?.patients ?? []) {
        if (patient.x === object.x && patient.z === object.z && object.id === 'infirmary_bed') {
          const figureTexture = new THREE.Texture(infirmaryObjectImages.get('infirmary_patient'));
          figureTexture.magFilter = figureTexture.minFilter = THREE.NearestFilter;
          figureTexture.generateMipmaps = false;
          figureTexture.colorSpace = THREE.SRGBColorSpace;
          figureTexture.needsUpdate = true;
          const figure = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.85),
            new THREE.MeshBasicMaterial({ map: figureTexture, transparent: true, alphaTest: 0.08, depthWrite: false, depthTest: false, side: THREE.DoubleSide }));
          figure.rotation.x = -OBJECT_TILT;
          figure.position.set(centerX + 0.35, 0.8, centerZ + 0.45);
          figure.renderOrder = 5;
          const sign = infirmarySign(THREE, levelGroup, level, `RESCUE ${patient.name.toUpperCase()}`, patient.x, patient.z, '#8ff0b3', 1.65);
          const group = new THREE.Group();
          group.add(figure, sign);
          levelGroup.add(group);
          Object.defineProperty(patient, 'mesh', { value: group, writable: true, configurable: true });
          group.visible = !patient.rescued;
        }
      }
    } else if (upright) {
      const material = new THREE.MeshBasicMaterial({
        map: texture,
        color: 0xe4d6d2,
        transparent: true,
        alphaTest: 0.1,
        side: THREE.DoubleSide,
      });
      sprite = new THREE.Mesh(standingGeometry, material);
      sprite.rotation.x = -OBJECT_TILT;
      if (atlasObject.scale) sprite.scale.setScalar(atlasObject.scale);
      // Feet sit toward the front of the tile so the prop reads as resting on the deck.
      sprite.position.set(centerX + (object.ox ?? 0), 0.12 + lift, centerZ + 0.3 + (object.oz ?? 0));
      sprite.renderOrder = 3;
      const shadow = new THREE.Mesh(shadowGeometry, shadowMaterial);
      shadow.position.set(centerX, 0.12 + lift, centerZ + 0.3);
      shadow.renderOrder = 2;
      levelGroup.add(shadow);
      if (atlasObject.glow) {
        const material = new THREE.SpriteMaterial({
          map: getGlowTexture(THREE),
          color: atlasObject.glow.color ?? '#ffb347',
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        });
        const glowSprite = new THREE.Sprite(material);
        glowSprite.position.set(centerX, 0.12 + lift + (atlasObject.glow.height ?? 0.5), centerZ + 0.4);
        glowSprite.renderOrder = 4;
        levelGroup.add(glowSprite);
        glowLights.push({
          sprite: glowSprite,
          radius: atlasObject.glow.radius ?? 1.5,
          intensity: atlasObject.glow.intensity ?? 0.55,
          phase: object.x * 1.7 + object.z * 2.3,
        });
      }
    } else {
      const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        alphaTest: 0.1,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      sprite = new THREE.Mesh(flatGeometry, material);
      sprite.rotation.x = -Math.PI / 2;
      sprite.position.set(centerX, 0.15 + lift, centerZ);
      sprite.renderOrder = 3;
    }
    sprite.userData.blocksMovement = atlasObject?.blocksMovement ?? false;
    levelGroup.add(sprite);
  }

  levelGroup.userData.infirmaryGateMeshes = {};
  for (const gate of level.infirmary?.gates ?? []) {
    Object.defineProperty(gate, 'meshes', { value: [], writable: true, configurable: true });
    for (const block of gate.blocks) {
      const { direction, mirrored } = infirmaryDoorOrientation(level, block.x, block.z);
      const gateTexture = new THREE.Texture(infirmaryObjectImages.get('infirmary_door_closed'));
      gateTexture.magFilter = THREE.NearestFilter;
      gateTexture.minFilter = THREE.NearestFilter;
      gateTexture.generateMipmaps = false;
      gateTexture.colorSpace = THREE.SRGBColorSpace;
      gateTexture.needsUpdate = true;
      const material = new THREE.MeshBasicMaterial({
        map: gateTexture,
        transparent: true,
        alphaTest: 0.08,
        side: THREE.DoubleSide,
      });
      const geometry = new THREE.PlaneGeometry(direction === 'front' ? 1.08 : 0.675, 1.35);
      geometry.translate(0, 0.675, 0);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.rotation.x = -OBJECT_TILT;
      if (mirrored) mesh.scale.x = -1;
      mesh.position.set(block.x - level.width / 2 + 0.5, 0.07, block.z - level.height / 2 + 0.7);
      mesh.visible = gate.closed;
      mesh.renderOrder = 4;
      mesh.userData.infirmaryGateId = gate.id;
      mesh.userData.entranceId = gate.entranceId;
      mesh.userData.doorDirection = direction;
      mesh.userData.doorMirrored = mirrored;
      gate.meshes.push(mesh);
      (levelGroup.userData.infirmaryGateMeshes[gate.id] ??= []).push(mesh);
      levelGroup.add(mesh);
    }
  }

  // Creepy forest trees tower over their tile; the sprite's base sits at the front edge like other props.
  const treeMaterials = new Map();
  for (const tree of level.trees ?? []) {
    const image = creepTreeImages.get(tree.id);
    if (!treeMaterials.has(tree.id)) {
      const treeTexture = new THREE.Texture(image);
      treeTexture.magFilter = THREE.NearestFilter;
      treeTexture.minFilter = THREE.NearestFilter;
      treeTexture.generateMipmaps = false;
      treeTexture.colorSpace = THREE.SRGBColorSpace;
      treeTexture.needsUpdate = true;
      treeMaterials.set(tree.id, new THREE.MeshBasicMaterial({
        map: treeTexture,
        color: 0xd9c6c6,
        alphaTest: 0.1,
        side: THREE.DoubleSide,
      }));
    }
    const treeWidth = tree.width ?? 2.4;
    const treeGeometry = new THREE.PlaneGeometry(treeWidth, treeWidth * image.height / image.width);
    treeGeometry.translate(0, treeGeometry.parameters.height / 2, 0);
    const treeSprite = new THREE.Mesh(treeGeometry, treeMaterials.get(tree.id));
    treeSprite.rotation.x = -OBJECT_TILT;
    treeSprite.position.set(tree.x - level.width / 2 + 0.5, 0.12, tree.z - level.height / 2 + 0.85);
    treeSprite.renderOrder = 3;
    levelGroup.add(treeSprite);
  }

  const greyHouseTexture = new THREE.Texture(greyHouseImage);
  greyHouseTexture.magFilter = THREE.NearestFilter;
  greyHouseTexture.minFilter = THREE.NearestFilter;
  greyHouseTexture.generateMipmaps = false;
  greyHouseTexture.colorSpace = THREE.SRGBColorSpace;
  greyHouseTexture.needsUpdate = true;
  const greyHouseMaterial = new THREE.MeshBasicMaterial({
    map: greyHouseTexture,
    alphaTest: 0.1,
    depthTest: true,
    depthWrite: true,
    side: THREE.DoubleSide,
  });
  const houseWidth = 3.4;
  const houseGeometry = new THREE.PlaneGeometry(houseWidth, houseWidth * greyHouseImage.height / greyHouseImage.width);
  houseGeometry.translate(0, houseGeometry.parameters.height / 2, 0);
  const houseNoEntryGeometry = new THREE.PlaneGeometry(houseWidth, houseWidth * greyHouseNoEntryImage.height / greyHouseNoEntryImage.width);
  houseNoEntryGeometry.translate(0, houseNoEntryGeometry.parameters.height / 2, 0);
  const orderTentTexture = new THREE.Texture(orderTentImage);
  orderTentTexture.magFilter = THREE.NearestFilter;
  orderTentTexture.minFilter = THREE.NearestFilter;
  orderTentTexture.generateMipmaps = false;
  orderTentTexture.colorSpace = THREE.SRGBColorSpace;
  orderTentTexture.needsUpdate = true;
  const orderTentMaterial = new THREE.MeshBasicMaterial({
    map: orderTentTexture,
    alphaTest: 0.1,
    depthTest: true,
    depthWrite: true,
    side: THREE.DoubleSide,
  });
  const tentGeometry = new THREE.PlaneGeometry(houseWidth, houseWidth * orderTentImage.height / orderTentImage.width);
  tentGeometry.translate(0, tentGeometry.parameters.height / 2, 0);
  for (const house of level.houses) {
    const image = streetShopImage;
    const streetWidth = Math.min(
      2 * Math.min(house.door.x + 0.5 - house.x, house.x + house.width - house.door.x - 0.5),
      house.height * 0.98 / (image.height / image.width * Math.sin(OBJECT_TILT)),
    );
    const houseSprite = level.streets
      ? streetFacade(THREE, streetMaterial(THREE, image), image,
        streetWidth, house.door.x + 0.5 - level.width / 2, house.z + house.height - level.height / 2)
      : new THREE.Mesh(house.style === 'tent' ? tentGeometry : houseGeometry, house.style === 'tent' ? orderTentMaterial : greyHouseMaterial);
    if (!level.streets) houseSprite.rotation.x = -OBJECT_TILT;
    if (!level.streets) houseSprite.position.set(
      house.x + house.width / 2 - level.width / 2,
      0.12,
      house.door.z - level.height / 2 - 0.5,
    );
    houseSprite.renderOrder = 1;
    if (level.streets) {
      houseSprite.name = `street-visitable-${house.id}`;
      houseSprite.userData.footprint = { x: house.x, z: house.z, width: house.width, height: house.height };
    }
    levelGroup.add(houseSprite);
  }
  const greyHouseNoEntryTexture = new THREE.Texture(greyHouseNoEntryImage);
  greyHouseNoEntryTexture.magFilter = THREE.NearestFilter;
  greyHouseNoEntryTexture.minFilter = THREE.NearestFilter;
  greyHouseNoEntryTexture.generateMipmaps = false;
  greyHouseNoEntryTexture.colorSpace = THREE.SRGBColorSpace;
  greyHouseNoEntryTexture.needsUpdate = true;
  const greyHouseNoEntryMaterial = new THREE.MeshBasicMaterial({
    map: greyHouseNoEntryTexture,
    alphaTest: 0.1,
    depthTest: true,
    depthWrite: true,
    side: THREE.DoubleSide,
  });
  for (const house of level.decorativeHouses) {
    if (level.streets) {
      addStreetBlock(THREE, levelGroup, level, house);
      continue;
    }
    const houseSprite = new THREE.Mesh(houseNoEntryGeometry, greyHouseNoEntryMaterial);
    houseSprite.rotation.x = -OBJECT_TILT;
    if (!level.streets) houseSprite.position.set(
      house.x + house.width / 2 - level.width / 2,
      0.12,
      house.z + house.height - level.height / 2 - 0.5,
    );
    houseSprite.renderOrder = 1;
    levelGroup.add(houseSprite);
  }
  const chestTexture = new THREE.Texture(chestImage);
  chestTexture.colorSpace = THREE.SRGBColorSpace;
  chestTexture.needsUpdate = true;
  const chestGeometry = new THREE.PlaneGeometry(0.9, 0.9);
  chestGeometry.translate(0, 0.45, 0);
  for (const chest of level.chests) {
    const material = new THREE.MeshBasicMaterial({
      map: chestTexture,
      transparent: true,
      alphaTest: 0.1,
      opacity: chest.opened ? 0.35 : 1,
      side: THREE.DoubleSide,
    });
    const chestSprite = new THREE.Mesh(chestGeometry, material);
    chestSprite.rotation.x = -OBJECT_TILT;
    chestSprite.position.set(
      chest.x + 0.5 - level.width / 2,
      0.12 + getTileElevation(level, chest.x, chest.z),
      chest.z + 0.5 - level.height / 2 + 0.2,
    );
    chestSprite.renderOrder = 3;
    Object.defineProperty(chest, 'mesh', { value: chestSprite, enumerable: false });
    levelGroup.add(chestSprite);
    const aura = new THREE.Sprite(new THREE.SpriteMaterial({
      map: getGlowTexture(THREE),
      color: '#ffd24a',
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    aura.position.set(chestSprite.position.x, chestSprite.position.y + 0.4, chestSprite.position.z + 0.1);
    aura.renderOrder = 4;
    levelGroup.add(aura);
    const light = { sprite: aura, radius: 2.1, intensity: chest.opened ? 0 : 0.8, phase: chest.x * 1.3 + chest.z };
    glowLights.push(light);
    Object.defineProperty(chest, 'glow', { value: light, enumerable: false });
  }
  levelGroup.userData.houseMarkers = [];
  if (level.cells.length) {
    const barsTexture = atlasTexture(THREE, shipTilesImage, shipTileset.tiles, 'mans_gate');
    const barsGeometry = new THREE.PlaneGeometry(1, 1.15);
    barsGeometry.translate(0, 0.575, 0);
    for (const cell of level.cells) {
      const bars = new THREE.Mesh(barsGeometry, new THREE.MeshBasicMaterial({
        map: barsTexture, transparent: true, alphaTest: 0.1, side: THREE.DoubleSide, color: 0xb8b0a8,
      }));
      bars.rotation.x = -OBJECT_TILT;
      bars.position.set(
        cell.door.x + 0.5 - level.width / 2,
        0.05 + getTileDef(level.tileIds[cell.door.z][cell.door.x]).elevation,
        cell.door.z + 0.5 - level.height / 2,
      );
      bars.renderOrder = 3;
      bars.visible = !cell.opened;
      Object.defineProperty(cell, 'mesh', { value: bars, enumerable: false, configurable: true });
      levelGroup.add(bars);
    }
  }
  const doorGeometry = new THREE.PlaneGeometry(0.94, 0.94);
  doorGeometry.rotateX(-Math.PI / 2);
  const doorMaterial = new THREE.MeshBasicMaterial({
    color: 0x39ff6a,
    transparent: true,
    opacity: 0.6,
    depthWrite: false,
  });
  for (const house of level.houses) {
    const marker = new THREE.Mesh(doorGeometry, doorMaterial);
    marker.position.set(
      house.door.x + 0.5 - level.width / 2,
      0.1 + getTileDef(level.tileIds[house.door.z][house.door.x]).elevation,
      house.door.z + 0.5 - level.height / 2,
    );
    marker.renderOrder = 2;
    marker.userData.houseId = house.id;
    marker.visible = !house.visited;
    levelGroup.userData.houseMarkers.push(marker);
    levelGroup.add(marker);
  }
  if (level.gateEncounter) {
    const skylineTexture = new THREE.Texture(victorianCityImage);
    skylineTexture.magFilter = THREE.NearestFilter;
    skylineTexture.minFilter = THREE.NearestFilter;
    skylineTexture.generateMipmaps = false;
    skylineTexture.colorSpace = THREE.SRGBColorSpace;
    skylineTexture.needsUpdate = true;
    const skylineWidth = 28;
    const skylineHeight = skylineWidth * victorianCityImage.height / victorianCityImage.width;
    const skylineGeometry = new THREE.PlaneGeometry(skylineWidth, skylineHeight);
    skylineGeometry.translate(0, skylineHeight / 2, 0);
    const skyline = new THREE.Mesh(skylineGeometry, new THREE.MeshBasicMaterial({
      map: skylineTexture, transparent: true, alphaTest: 0.1, side: THREE.DoubleSide,
    }));
    skyline.name = 'victorian-city-backdrop';
    skyline.rotation.x = -OBJECT_TILT;
    skyline.position.set(level.exit.x + 0.5 - level.width / 2, 0.2, -level.height / 2 - 0.5);
    levelGroup.userData.cityBackdrop = {
      x: skyline.position.x, y: skyline.position.y, z: skyline.position.z,
      width: skylineWidth, height: skylineHeight,
    };
    levelGroup.add(skyline);
    const embankmentTexture = new THREE.Texture(cityEmbankmentImage);
    embankmentTexture.magFilter = THREE.NearestFilter;
    embankmentTexture.minFilter = THREE.NearestFilter;
    embankmentTexture.generateMipmaps = false;
    embankmentTexture.colorSpace = THREE.SRGBColorSpace;
    embankmentTexture.needsUpdate = true;
    const embankmentGeometry = new THREE.PlaneGeometry(14, 3.5);
    embankmentGeometry.translate(0, 1.75, 0);
    const embankmentMaterial = new THREE.MeshBasicMaterial({
      map: embankmentTexture, transparent: true, alphaTest: 0.05, side: THREE.DoubleSide,
    });
    // Overlap the skyline's base and the far water edge, leaving the bridge approach clear.
    for (const side of [-1, 1]) {
      const embankment = new THREE.Mesh(embankmentGeometry, embankmentMaterial);
      embankment.name = side < 0 ? 'city-embankment-west' : 'city-embankment-east';
      embankment.rotation.x = -OBJECT_TILT;
      embankment.position.set(skyline.position.x + side * 10.5, -0.1, -level.height / 2 + 1.5);
      levelGroup.add(embankment);
    }
    const texture = new THREE.Texture(cityGateImage);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    const geometry = new THREE.PlaneGeometry(10, 10);
    geometry.translate(0, 5, 0);
    const gate = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
      map: texture, transparent: true, alphaTest: 0.1, side: THREE.DoubleSide,
    }));
    gate.rotation.x = -OBJECT_TILT;
    gate.position.set(level.exit.x + 0.5 - level.width / 2, 0.2, level.exit.z - level.height / 2);
    const darknessGeometry = new THREE.PlaneGeometry(2.1, 2.6);
    darknessGeometry.translate(0, 1.7, 0);
    const darkness = new THREE.Mesh(darknessGeometry, new THREE.MeshBasicMaterial({ color: 0x09070a, side: THREE.DoubleSide }));
    darkness.rotation.copy(gate.rotation);
    darkness.position.copy(gate.position);
    darkness.position.z -= 0.05;
    levelGroup.add(darkness);
    levelGroup.add(gate);
  }
  if (level.objective === 'escape' || level.objective === 'seize-gate') {
    const exitGeometry = new THREE.PlaneGeometry(0.94, 0.94);
    exitGeometry.rotateX(-Math.PI / 2);
    const exitMaterial = new THREE.MeshBasicMaterial({
      color: 0x57e38a,
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
    });
    for (const tile of level.exitTiles) {
      const marker = new THREE.Mesh(exitGeometry, exitMaterial);
      marker.position.set(
        tile.x + 0.5 - level.width / 2,
        0.1 + getTileDef(level.tileIds[tile.z][tile.x]).elevation,
        tile.z + 0.5 - level.height / 2,
      );
      marker.renderOrder = 2;
      levelGroup.add(marker);
    }
  }
  if (level.rescue) {
    const markerGeometry = new THREE.PlaneGeometry(0.94, 0.94);
    markerGeometry.rotateX(-Math.PI / 2);
    const addMarker = (tile, color, opacity) => {
      const marker = new THREE.Mesh(markerGeometry, new THREE.MeshBasicMaterial({
        color, transparent: true, opacity, depthWrite: false,
      }));
      marker.position.set(tile.x + 0.5 - level.width / 2,
        0.11 + getTileDef(level.tileIds[tile.z][tile.x]).elevation, tile.z + 0.5 - level.height / 2);
      marker.renderOrder = 2;
      levelGroup.add(marker);
    };
    for (const tile of level.rescue.refuge) addMarker(tile, 0x57e38a, 0.55);
    const signCanvas = document.createElement('canvas');
    signCanvas.width = 384;
    signCanvas.height = 96;
    const signContext = signCanvas.getContext('2d');
    if (!signContext) throw new Error('Could not create the refuge label.');
    signContext.fillStyle = '#15291d';
    signContext.fillRect(0, 0, 384, 96);
    signContext.strokeStyle = '#85dca0';
    signContext.lineWidth = 6;
    signContext.strokeRect(3, 3, 378, 90);
    signContext.fillStyle = '#d7ffd0';
    signContext.textAlign = 'center';
    signContext.font = 'bold 38px Georgia, serif';
    signContext.fillText('REFUGE', 192, 44);
    signContext.font = '20px Georgia, serif';
    signContext.fillText('ESCORT DESTINATION', 192, 76);
    const signTexture = new THREE.CanvasTexture(signCanvas);
    signTexture.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(3, 0.75),
      new THREE.MeshBasicMaterial({ map: signTexture, side: THREE.DoubleSide }));
    const refugeCenterX = level.rescue.refuge.reduce((sum, tile) => sum + tile.x + 0.5, 0) / level.rescue.refuge.length;
    sign.position.set(refugeCenterX - level.width / 2, 0.9,
      Math.min(...level.rescue.refuge.map((tile) => tile.z)) - level.height / 2 - 0.3);
    sign.rotation.x = -OBJECT_TILT;
    levelGroup.add(sign);
    addMarker(level.exit, 0xe7c779, 0.55);
    const approaches = new Set();
    for (const wave of level.reinforcements) {
      for (const tile of wave.units) {
        const key = `${tile.x},${tile.z}`;
        if (approaches.has(key)) continue;
        approaches.add(key);
        addMarker(tile, 0xe45b61, 0.45);
      }
    }
  }
  return level;
}
