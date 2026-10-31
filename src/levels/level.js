import initialMapUrl from '../../data/levels/map_01_two_ships.json?url&no-inline';
import chapterTwoMapUrl from '../../data/levels/map_02_boarders_from_the_deep.json?url&no-inline';
import shipTilesUrl from '../../assets/tiles/ship_oblique/ship_oblique_tiles.png?url';
import shipObjectsUrl from '../../assets/tiles/ship_oblique/ship_objects.png?url';
import mastUrl from '../../assets/tiles/ship_oblique/mast.png?url';
import shipTileset from '../../assets/tiles/ship_oblique/ship_oblique_tileset.json';
import { getTileDef, isTileWalkable } from './tiles.js';

const LEVEL_TILES = new Set(['.', 'h', 'd', 'b', 'q', 'w', 'p', 'c', 'r', 'm', 's', 'e']);
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

// Drifting ripples and a shimmer travel across the water using world position, so they flow across tiles seamlessly.
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
        vec2 wobble = vec2(
          sin(wp.y * 5.0 + uTime * 1.3) + sin(wp.x * 3.1 - uTime * 0.9),
          cos(wp.x * 4.3 + uTime * 1.1) + cos(wp.y * 2.7 + uTime * 0.7)
        ) * 0.025;
        vec4 sampledDiffuseColor = texture2D(map, clamp(vTileUv + wobble, 0.002, 0.998));
        float ripple = sin((wp.x * 2.0 + wp.y * 3.0) * 3.0 - uTime * 1.6)
                     * sin((wp.y * 1.5 - wp.x * 3.0) * 3.0 + uTime * 1.1);
        float crest = smoothstep(0.7, 0.98, ripple);
        sampledDiffuseColor.rgb += vec3(0.14, 0.22, 0.32) * crest;
        sampledDiffuseColor.rgb *= 0.93 + 0.07 * sin(uTime * 0.8 + wp.x * 0.7 + wp.y * 0.5);
        diffuseColor *= sampledDiffuseColor;`);
  };
  return material;
}
const ATLAS_TILES = new Map(shipTileset.tiles.list.map((tile) => [tile.id, tile]));
const ATLAS_TILE_IDS = new Set(ATLAS_TILES.keys());
const BLOCKING_OBJECTS = new Set(
  shipTileset.objects.list
    .filter((object) => object.blocksMovement)
    .map((object) => object.id),
);
const SHIP_OBJECT_IDS = new Set(shipTileset.objects.list.map((object) => object.id));
const LEGACY_ATLAS_TILES = {
  '.': 'water_a',
  h: 'hull_n',
  d: 'deck_a',
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

const [shipTilesImage, shipObjectsImage, mastImage] = await Promise.all([
  loadImage(shipTilesUrl),
  loadImage(shipObjectsUrl),
  loadImage(mastUrl),
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

function readCoordinate(value, width, height, label) {
  const z = value?.z ?? value?.y;
  if (!value || !Number.isInteger(value.x) || !Number.isInteger(z) ||
      value.x < 0 || value.x >= width || z < 0 || z >= height) {
    throw new Error(`Level needs a valid ${label} coordinate.`);
  }
  return { x: value.x, z };
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
      isTileWalkable(tileIds[z][object.x]);
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
        isTileWalkable(tileIds[entryZ][entry.x]);
    })) {
      throw new Error(`Level ${label} need an ID and must be placed on walkable tiles.`);
    }
    return list.map((entry) => ({ id: entry.id, x: entry.x, z: entry.z ?? entry.y }));
  };
  const players = readPlacements(value.players, 'players');
  const enemyPlacements = readPlacements(value.enemies, 'enemies');
  const startingItems = value.startingItems ?? [];
  if (!Array.isArray(startingItems) || startingItems.some((id) => typeof id !== 'string')) {
    throw new Error('Level startingItems must be a list of item IDs.');
  }
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
    width,
    height,
    spawn,
    exit,
    players,
    enemies: enemyPlacements,
    startingItems,
    tiles: tileIds,
    tileIds,
    objects: objects.map((object) => ({
      x: object.x,
      z: object.z ?? object.y,
      id: object.id,
      blocksMovement: BLOCKING_OBJECTS.has(object.id),
    })),
  };
}

const CHAPTER_URLS = [initialMapUrl, chapterTwoMapUrl];
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

// Corner heights in NW, NE, SW, SE order. A "rise" of w/e makes a ramp that climbs toward that side.
export function tileCornerHeights(def) {
  const top = def.elevation * 2;
  if (def.rise === 'w') return [top, 0, top, 0];
  if (def.rise === 'e') return [0, top, 0, top];
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
    }
  }
  addElevatedTiles(THREE, levelGroup, level, elevatedCells);

  const geometry = new THREE.PlaneGeometry(1, 1);
  geometry.rotateX(-Math.PI / 2);
  for (const [atlasId, cells] of tileGroups) {
    const texture = atlasTexture(THREE, shipTilesImage, shipTileset.tiles, atlasId);
    const material = WATER_TILE_IDS.has(atlasId)
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
      transform.position.set(cell.x, 0, cell.z);
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
    const mast = new THREE.Mesh(new THREE.PlaneGeometry(2, 4), mastMaterial);
    mast.position.set(
      base.x - level.width / 2 + 0.5,
      2,
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
      // Feet sit toward the front of the tile so the prop reads as resting on the deck.
      sprite.position.set(centerX, 0.12 + lift, centerZ + 0.3);
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
  return level;
}
