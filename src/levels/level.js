import initialMapUrl from '../../data/levels/map_01_two_ships.json?url&no-inline';
import shipTilesUrl from '../../assets/tiles/ship_oblique/ship_oblique_tiles.png?url';
import shipObjectsUrl from '../../assets/tiles/ship_oblique/ship_objects.png?url';
import mastUrl from '../../assets/tiles/ship_oblique/mast.png?url';
import shipTileset from '../../assets/tiles/ship_oblique/ship_oblique_tileset.json';

const LEVEL_TILES = new Set(['.', 'h', 'd', 'b', 'q', 'w', 'p', 'c', 'r', 'm', 's', 'e']);
export const LEVEL_OBJECTIVES = new Set(['defeat-all-enemies', 'escape']);
export const WALKABLE_TILES = new Set(['d', 'b', 'q', 'w', 'p', 'c', 's', 'e']);

const TILE_SIZE = shipTileset.tileSize;
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
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = TILE_SIZE;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not create a canvas for the ship atlas.');
  context.drawImage(
    image,
    tile.col * TILE_SIZE,
    tile.row * TILE_SIZE,
    TILE_SIZE,
    TILE_SIZE,
    0,
    0,
    TILE_SIZE,
    TILE_SIZE,
  );
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function gameplayTile(tileId) {
  if (tileId.startsWith('water_')) return '.';
  if (tileId.startsWith('hull_')) return 'h';
  if (tileId.startsWith('bridge_')) return 'b';
  if (tileId === 'stairs_down') return 'q';
  if (tileId === 'mast_base') return 'm';
  if (tileId.startsWith('bulkhead_')) return 'r';
  return ATLAS_TILES.get(tileId)?.walkable ? 'd' : 'r';
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
  let rows;
  if (atlasGrid) {
    if (sourceTiles.length !== height || sourceTiles.some((row) =>
      !Array.isArray(row) || row.length !== width ||
      row.some((tileId) => typeof tileId !== 'string' || !ATLAS_TILE_IDS.has(tileId)))) {
      throw new Error('Level atlas tile rows must match the dimensions and use known tile IDs.');
    }
    tileIds = sourceTiles.map((row) => [...row]);
    rows = tileIds.map((row) => row.map(gameplayTile).join(''));
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
  if (!spawn || !WALKABLE_TILES.has(rows[spawn.z][spawn.x])) {
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
  if (!exit || !WALKABLE_TILES.has(rows[exit.z][exit.x])) {
    throw new Error('Level must have a walkable Exit coordinate.');
  }
  if (spawn.x === exit.x && spawn.z === exit.z) {
    throw new Error('Start and Exit must use different tiles.');
  }
  rows[spawn.z] = `${rows[spawn.z].slice(0, spawn.x)}s${rows[spawn.z].slice(spawn.x + 1)}`;
  rows[exit.z] = `${rows[exit.z].slice(0, exit.x)}e${rows[exit.z].slice(exit.x + 1)}`;

  if (!LEVEL_OBJECTIVES.has(objective)) {
    throw new Error('Level objective must be defeat-all-enemies or escape.');
  }
  const objects = value.objects ?? [];
  if (!Array.isArray(objects) || !objects.every((object) => {
    const z = object?.z ?? object?.y;
    return object && Number.isInteger(object.x) && object.x >= 0 && object.x < width &&
      Number.isInteger(z) && z >= 0 && z < height &&
      SHIP_OBJECT_IDS.has(object.id) &&
      WALKABLE_TILES.has(rows[z][object.x]);
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
  return {
    name: name.trim(),
    objective,
    width,
    height,
    spawn,
    exit,
    tiles: rows,
    tileIds,
    objects: objects.map((object) => ({
      x: object.x,
      z: object.z ?? object.y,
      id: object.id,
      blocksMovement: BLOCKING_OBJECTS.has(object.id),
    })),
  };
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

export function buildLevel(THREE, levelGroup, value) {
  const level = validateLevel(value);
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
  for (let z = 0; z < level.height; z++) {
    for (let x = 0; x < level.width; x++) {
      const atlasId = level.tileIds[z][x];
      if (!tileGroups.has(atlasId)) tileGroups.set(atlasId, []);
      tileGroups.get(atlasId).push({
        x: x - level.width / 2 + 0.5,
        z: z - level.height / 2 + 0.5,
      });
    }
  }

  const geometry = new THREE.PlaneGeometry(1, 1);
  geometry.rotateX(-Math.PI / 2);
  for (const [atlasId, cells] of tileGroups) {
    const texture = atlasTexture(THREE, shipTilesImage, shipTileset.tiles, atlasId);
    const material = new THREE.MeshStandardMaterial({
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
  mastTexture.magFilter = THREE.NearestFilter;
  mastTexture.minFilter = THREE.NearestFilter;
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

  for (const object of level.objects) {
    const atlasObject = shipTileset.objects.list.find((entry) => entry.id === object.id);
    const texture = atlasTexture(THREE, shipObjectsImage, shipTileset.objects, object.id);
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      alphaTest: 0.1,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const sprite = new THREE.Mesh(new THREE.PlaneGeometry(0.82, 0.82), material);
    sprite.rotation.x = -Math.PI / 2;
    sprite.position.set(
      object.x - level.width / 2 + 0.5,
      0.15,
      object.z - level.height / 2 + 0.5,
    );
    sprite.renderOrder = 3;
    sprite.userData.blocksMovement = atlasObject.blocksMovement;
    levelGroup.add(sprite);
  }
  return level;
}
