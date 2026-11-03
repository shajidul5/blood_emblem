import initialMapUrl from '../../data/levels/map_01_two_ships.json?url&no-inline';
import chapterTwoMapUrl from '../../data/levels/map_02_boarders_from_the_deep.json?url&no-inline';
import chapterThreeMapUrl from '../../data/levels/map_03_fishing_village.json?url&no-inline';
import chapterFourMapUrl from '../../data/levels/map_04_mansion.json?url&no-inline';
import chapterFiveMapUrl from '../../data/levels/map_05_escape.json?url&no-inline';
import chestUrl from '../../assets/tiles/Chest/chest.png?url';
import shipTilesUrl from '../../assets/tiles/ship_oblique/ship_oblique_tiles.png?url';
import shipObjectsUrl from '../../assets/tiles/ship_oblique/ship_objects.png?url';
import waterRippleUrl from '../../assets/tiles/ocean_ripple/water_ripple.png?url';
import mastUrl from '../../assets/tiles/ship_oblique/mast.png?url';
import greyHouseUrl from '../../assets/tiles/Grey_house/rotations/Grey_house.png?url';
import greyHouseNoEntryUrl from '../../assets/tiles/Grey_house_No_entry/rotations/Grey_house_No_entry.png?url';
import shipTileset from '../../assets/tiles/ship_oblique/ship_oblique_tileset.json';
import { getTileDef, isTileWalkable, VILLAGE_GRAVEL_TILE_IDS } from './tiles.js';

const LEVEL_TILES = new Set(['.', 'h', 'd', 'b', 'q', 'w', 'p', 'c', 'r', 'm', 's', 'e', 'a', 'v', 'k', 'f', 'o', 'g', 'G', 'j', 'n', 'B']);
export const LEVEL_OBJECTIVES = new Set(['defeat-all-enemies', 'escape']);

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
const ATLAS_TILE_IDS = new Set([...ATLAS_TILES.keys(), ...VILLAGE_GRAVEL_TILE_IDS]);
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
};

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Could not load ship atlas: ${url}`));
    image.src = url;
  });
}

const [shipTilesImage, waterRippleImage, shipObjectsImage, mastImage, greyHouseImage, greyHouseNoEntryImage, chestImage] = await Promise.all([
  loadImage(shipTilesUrl),
  loadImage(waterRippleUrl),
  loadImage(shipObjectsUrl),
  loadImage(mastUrl),
  loadImage(greyHouseUrl),
  loadImage(greyHouseNoEntryUrl),
  loadImage(chestUrl),
]);

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
    throw new Error('Level objective must be defeat-all-enemies or escape.');
  }
  // Props removed from the tileset are dropped so older saves and levels still load.
  const objects = (value.objects ?? []).filter?.((object) => !RETIRED_OBJECT_IDS.has(object?.id)) ?? value.objects;
  if (!Array.isArray(objects) || !objects.every((object) => {
    const z = object?.z ?? object?.y;
    return object && Number.isInteger(object.x) && object.x >= 0 && object.x < width &&
      Number.isInteger(z) && z >= 0 && z < height &&
      SHIP_OBJECT_IDS.has(object.id) &&
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
        isTileWalkable(tileIds[entryZ][entry.x]) &&
        isValidUnitLevel(entry.level) &&
        isValidUnitAi(entry.ai) &&
        (entry.drop === undefined || typeof entry.drop === 'string');
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
      house.width !== 3 ||
      house.height !== 2 ||
      (typeof house.rewardId !== 'string' && typeof house.recruitId !== 'string') ||
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
    throw new Error('Level houses need unique IDs, a 3×2 walkable footprint, and valid reward and recipient IDs.');
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
    ...(house.recruitId ? { recruitId: house.recruitId } : {}),
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
      house.width !== 3 ||
      house.height !== 2 ||
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
    throw new Error('Decorative houses need unique IDs and a 3×2 non-walkable footprint.');
  }
  const normalizedDecorativeHouses = decorativeHouses.map((house) => ({
    id: house.id,
    x: house.x,
    z: house.z,
    width: house.width,
    height: house.height,
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
    rewardId: chest.rewardId,
    opened: chest.opened ?? false,
  }));
  const reinforcements = value.reinforcements ?? [];
  if (!Array.isArray(reinforcements) || !reinforcements.every((wave) =>
    wave &&
    Number.isInteger(wave.turn) && wave.turn > 1 &&
    Array.isArray(wave.units) && wave.units.length > 0 &&
    (wave.spawned === undefined || typeof wave.spawned === 'boolean') &&
    wave.units.every((unit) => {
      const z = unit?.z ?? unit?.y;
      return unit && typeof unit.id === 'string' &&
        Number.isInteger(unit.x) && unit.x >= 0 && unit.x < width &&
        Number.isInteger(z) && z >= 0 && z < height &&
        isTileWalkable(tileIds[z][unit.x]) &&
        isValidUnitLevel(unit.level) &&
        isValidUnitAi(unit.ai) &&
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
    })),
    spawned: wave.spawned ?? false,
    spawnedCount: wave.spawnedCount ?? 0,
  }));
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
  return {
    name: name.trim(),
    objective,
    extendEdges: value.extendEdges === true,
    forestEdges: value.forestEdges === true,
    noFence: value.noFence === true,
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
    tiles: tileIds,
    tileIds,
    objects: objects.map((object) => ({
      x: object.x,
      z: object.z ?? object.y,
      id: object.id,
      ox: object.ox,
      oz: object.oz,
      blocksMovement: BLOCKING_OBJECTS.has(object.id),
    })),
  };
}

const CHAPTER_URLS = [initialMapUrl, chapterTwoMapUrl, chapterThreeMapUrl, chapterFourMapUrl, chapterFiveMapUrl];
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

  const tileGroups = new Map();
  const elevatedCells = [];
  for (let z = 0; z < level.height; z++) {
    for (let x = 0; x < level.width; x++) {
      const atlasId = level.tileIds[z][x];
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
  if (level.extendEdges || level.extendSides) {
    const pad = 26;
    const padZ = level.extendSides ? 0 : pad;
    const padSouth = level.extendSides ? 14 : pad;
    for (let z = -padZ; z < level.height + padSouth; z++) {
      for (let x = -pad; x < level.width + pad; x++) {
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

  const geometry = new THREE.PlaneGeometry(1, 1);
  geometry.rotateX(-Math.PI / 2);
  for (const [atlasId, cells] of tileGroups) {
    const isWater = WATER_TILE_IDS.has(atlasId);
    const texture = isWater
      ? waterStripTexture(THREE)
      : VILLAGE_GRAVEL_TILE_IDS.has(atlasId)
        ? gravelTexture(THREE, atlasId)
        : atlasTexture(THREE, shipTilesImage, shipTileset.tiles, atlasId);
    const material = isWater
      ? createWaterMaterial(THREE, texture)
      : new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.9,
        transparent: true,
        alphaTest: 0.08,
        side: THREE.DoubleSide,
      });
    const instances = new THREE.InstancedMesh(geometry, material, cells.length);
    const transform = new THREE.Object3D();
    cells.forEach((cell, index) => {
      transform.position.set(cell.x, cell.y ?? 0, cell.z);
      transform.updateMatrix();
      instances.setMatrixAt(index, transform.matrix);
    });
    instances.receiveShadow = true;
    instances.instanceMatrix.needsUpdate = true;
    levelGroup.add(instances);
  }

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
    const atlasObject = shipTileset.objects.list.find((entry) => entry.id === object.id);
    const upright = atlasObject.upright ?? atlasObject.blocksMovement;
    const texture = atlasTexture(THREE, shipObjectsImage, shipTileset.objects, object.id);
    const centerX = object.x - level.width / 2 + 0.5;
    const centerZ = object.z - level.height / 2 + 0.5;
    const lift = getTileDef(level.tileIds[object.z][object.x]).elevation;
    let sprite;
    if (upright) {
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
    sprite.userData.blocksMovement = atlasObject.blocksMovement;
    levelGroup.add(sprite);
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
  for (const house of level.houses) {
    const houseSprite = new THREE.Mesh(houseGeometry, greyHouseMaterial);
    houseSprite.rotation.x = -OBJECT_TILT;
    houseSprite.position.set(
      house.x + house.width / 2 - level.width / 2,
      0.12,
      house.door.z - level.height / 2 - 0.5,
    );
    houseSprite.renderOrder = 1;
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
    const houseSprite = new THREE.Mesh(houseNoEntryGeometry, greyHouseNoEntryMaterial);
    houseSprite.rotation.x = -OBJECT_TILT;
    houseSprite.position.set(
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
      0.12 + getTileDef(level.tileIds[chest.z][chest.x]).elevation,
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
  if (level.objective === 'escape') {
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
  return level;
}
