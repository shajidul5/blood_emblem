import initialMapUrl from '../data/levels/map_01_two_ships.json?url&no-inline';
import shipTilesUrl from '../assets/tiles/ship_oblique/ship_oblique_tiles.png?url';
import shipObjectsUrl from '../assets/tiles/ship_oblique/ship_objects.png?url';
import mastUrl from '../assets/tiles/ship_oblique/mast.png?url';
import fenceHorizontalUrl from '../assets/tiles/Village_Fence/fence_horizontal.png?url';
import fenceVerticalUrl from '../assets/tiles/Village_Fence/fence_vertical.png?url';
import shipTileset from '../assets/tiles/ship_oblique/ship_oblique_tileset.json';

const TILE_TYPES = [
  ...shipTileset.tiles.list.map((tile) => ({ key: tile.id, name: tile.id, walkable: tile.walkable })),
  { key: '@spawn', name: 'Start', walkable: true },
  { key: '@exit', name: 'Exit', walkable: true },
];
const ATLAS_TILES = new Map(shipTileset.tiles.list.map((tile) => [tile.id, tile]));
const fenceImages = new Map(await Promise.all([
  ['village_fence_h', fenceHorizontalUrl], ['village_fence_v', fenceVerticalUrl],
].map(async ([id, url]) => [id, await loadImage(url, 'village fence')])));
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
const canvas = document.querySelector('#map');
const context = canvas.getContext('2d');
const status = document.querySelector('#status');
const nameInput = document.querySelector('#map-name');
const widthInput = document.querySelector('#map-width');
const heightInput = document.querySelector('#map-height');
const objectiveSelect = document.querySelector('#map-objective');
const fileInput = document.querySelector('#file-input');
const BLOCKING_OBJECTS = new Set(
  shipTileset.objects.list.filter((object) => object.blocksMovement).map((object) => object.id),
);
const SHIP_OBJECTS = new Map(shipTileset.objects.list.map((object) => [object.id, object]));

function loadImage(url, label) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Could not load ${label}.`));
    image.src = url;
  });
}

const [tileAtlas, objectAtlas, mastImage, initialMapResponse] = await Promise.all([
  loadImage(shipTilesUrl, 'ship tile atlas'),
  loadImage(shipObjectsUrl, 'ship object atlas'),
  loadImage(mastUrl, 'ship mast'),
  fetch(initialMapUrl),
]);
if (!initialMapResponse.ok) {
  throw new Error(`Could not load the first level (${initialMapResponse.status}).`);
}
const initialMapTemplate = await initialMapResponse.json();
let map;
let selectedTile = 'deck_a';
let drawing = false;

function readCoordinate(value, width, height, label) {
  const z = value?.z ?? value?.y;
  if (!value || !Number.isInteger(value.x) || !Number.isInteger(z) ||
      value.x < 0 || value.x >= width || z < 0 || z >= height) {
    throw new Error(`Place a valid ${label} tile on the map.`);
  }
  return { x: value.x, z };
}

function validateMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Level must be a JSON object.');
  }
  const { width, height, name } = value;
  const objective = value.objective ?? 'defeat-all-enemies';
  if (!Number.isInteger(width) || width < 8 || width > 48 ||
      !Number.isInteger(height) || height < 8 || height > 36) {
    throw new Error('Map dimensions must be 8–48 tiles wide and 8–36 tiles high.');
  }

  let tiles;
  if (Array.isArray(value.tiles) && Array.isArray(value.tiles[0])) {
    if (value.tiles.length !== height || value.tiles.some((row) =>
      !Array.isArray(row) || row.length !== width ||
      row.some((tileId) => typeof tileId !== 'string' || !ATLAS_TILES.has(tileId)))) {
      throw new Error('Map atlas tiles do not match the dimensions or contain an unknown tile ID.');
    }
    tiles = value.tiles.map((row) => [...row]);
  } else if (Array.isArray(value.tiles) && value.tiles.length === height &&
      value.tiles.every((row) => typeof row === 'string' && row.length === width &&
        [...row].every((tile) => Object.hasOwn(LEGACY_ATLAS_TILES, tile)))) {
    tiles = value.tiles.map((row) => [...row].map((tile) => LEGACY_ATLAS_TILES[tile]));
  } else {
    throw new Error('Map tiles do not match the selected dimensions or contain an unknown tile.');
  }

  const spawn = readCoordinate(value.spawn, width, height, 'Start');
  let exit = value.exit;
  if (!exit && Array.isArray(value.tiles) && !Array.isArray(value.tiles[0])) {
    const z = value.tiles.findIndex((row) => row.includes('e'));
    const x = z < 0 ? -1 : value.tiles[z].indexOf('e');
    if (x >= 0) exit = { x, z };
  }
  exit = readCoordinate(exit, width, height, 'Exit');
  if (spawn.x === exit.x && spawn.z === exit.z) {
    throw new Error('Start and Exit must use different tiles.');
  }
  if (!ATLAS_TILES.get(tiles[spawn.z][spawn.x]).walkable ||
      !ATLAS_TILES.get(tiles[exit.z][exit.x]).walkable) {
    throw new Error('Start and Exit must be placed on walkable tiles.');
  }
  if (typeof name !== 'string' || !name.trim()) {
    throw new Error('Give the level a name.');
  }
  if (!['defeat-all-enemies', 'defeat-boss', 'escape'].includes(objective)) {
    throw new Error('Choose a valid level objective.');
  }
  const objects = value.objects ?? [];
  if (!Array.isArray(objects) || !objects.every((object) => {
    const z = object?.z ?? object?.y;
    return object && Number.isInteger(object.x) && object.x >= 0 && object.x < width &&
      Number.isInteger(z) && z >= 0 && z < height &&
      SHIP_OBJECTS.has(object.id) && ATLAS_TILES.get(tiles[z][object.x]).walkable;
  })) {
    throw new Error('Objects need a known ID and must be placed on walkable tiles.');
  }
  if (objects.some((object) => {
    const z = object.z ?? object.y;
    return BLOCKING_OBJECTS.has(object.id) &&
      ((object.x === spawn.x && z === spawn.z) || (object.x === exit.x && z === exit.z));
  })) {
    throw new Error('Blocking objects cannot be placed on the Start or Exit tile.');
  }
  return {
    name: name.trim().slice(0, 48),
    objective,
    width,
    height,
    spawn,
    exit,
    tileset: '/tiles/ship_oblique/ship_oblique_tileset.json',
    tileSize: shipTileset.tileSize,
    tiles,
    objects: objects.map((object) => ({
      x: object.x,
      z: object.z ?? object.y,
      id: object.id,
      blocksMovement: BLOCKING_OBJECTS.has(object.id),
    })),
  };
}

function setStatus(message, isError = false) {
  status.textContent = message;
  status.style.color = isError ? '#ed9292' : '#c9bd9c';
}

function setMap(value) {
  map = validateMap(value);
  nameInput.value = map.name;
  widthInput.value = String(map.width);
  heightInput.value = String(map.height);
  objectiveSelect.value = map.objective;
  render();
  setStatus(`${map.name} — ${map.width} × ${map.height} tiles`);
}

function renderMarker(x, z, label, color, offsetX, offsetY, cell) {
  if (!Number.isInteger(x) || !Number.isInteger(z)) return;
  const px = offsetX + x * cell;
  const py = offsetY + z * cell;
  context.fillStyle = color;
  context.globalAlpha = 0.88;
  context.fillRect(px + cell * 0.2, py + cell * 0.2, cell * 0.6, cell * 0.6);
  context.globalAlpha = 1;
  context.fillStyle = '#fff';
  context.font = `bold ${Math.max(9, cell * 0.48)}px ui-monospace, monospace`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(label, px + cell / 2, py + cell / 2);
}

function render() {
  const bounds = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.round(bounds.width * ratio);
  canvas.height = Math.round(bounds.height * ratio);
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.imageSmoothingEnabled = false;
  context.clearRect(0, 0, bounds.width, bounds.height);
  if (!map) return;

  const cell = Math.min(bounds.width / map.width, bounds.height / map.height);
  const offsetX = (bounds.width - cell * map.width) / 2;
  const offsetY = (bounds.height - cell * map.height) / 2;
  const tileSize = shipTileset.tileSize;
  for (let z = 0; z < map.height; z++) {
    for (let x = 0; x < map.width; x++) {
      const tile = ATLAS_TILES.get(map.tiles[z][x]);
      const px = offsetX + x * cell;
      const py = offsetY + z * cell;
      context.drawImage(
        tileAtlas,
        tile.col * tileSize,
        tile.row * tileSize,
        tileSize,
        tileSize,
        px,
        py,
        cell,
        cell,
      );
      if (fenceImages.has(tile.id)) {
        const vertical = tile.id === 'village_fence_v';
        const image = fenceImages.get(tile.id);
        const width = vertical ? cell * image.width / image.height : cell;
        const height = vertical ? cell : cell * image.height / image.width;
        context.drawImage(image, px + (cell - width) / 2, py + (cell - height) / 2, width, height);
      } else if (tile.id === 'crossing_parapet') {
        context.strokeStyle = '#aaa09a';
        context.lineWidth = Math.max(3, cell * 0.18);
        context.beginPath();
        context.moveTo(px + cell / 2, py);
        context.lineTo(px + cell / 2, py + cell);
        context.stroke();
      }
      context.strokeStyle = 'rgba(10, 10, 16, 0.42)';
      context.lineWidth = 1;
      context.strokeRect(px, py, cell, cell);
    }
  }
  for (let z = 0; z < map.height; z++) {
    for (let x = 0; x < map.width; x++) {
      if (map.tiles[z][x] !== 'mast_base') continue;
      context.drawImage(
        mastImage,
        offsetX + (x - 0.5) * cell,
        offsetY + (z - 3) * cell,
        cell * 2,
        cell * 4,
      );
    }
  }
  const objectSize = shipTileset.objects.tileSize ?? tileSize;
  for (const object of map.objects ?? []) {
    const atlasObject = SHIP_OBJECTS.get(object.id);
    const px = offsetX + object.x * cell;
    const py = offsetY + object.z * cell;
    context.drawImage(
      objectAtlas,
      atlasObject.col * objectSize,
      atlasObject.row * objectSize,
      objectSize,
      objectSize,
      px + cell * 0.1,
      py + cell * 0.1,
      cell * 0.8,
      cell * 0.8,
    );
  }
  renderMarker(map.spawn.x, map.spawn.z, 'S', '#688847', offsetX, offsetY, cell);
  renderMarker(map.exit.x, map.exit.z, 'E', '#407d83', offsetX, offsetY, cell);

  for (const tool of document.querySelectorAll('.tool')) {
    tool.setAttribute('aria-pressed', String(tool.dataset.tile === selectedTile));
  }
}

function paintAt(event) {
  const bounds = canvas.getBoundingClientRect();
  const cell = Math.min(bounds.width / map.width, bounds.height / map.height);
  const offsetX = (bounds.width - cell * map.width) / 2;
  const offsetY = (bounds.height - cell * map.height) / 2;
  const x = Math.floor((event.clientX - bounds.left - offsetX) / cell);
  const z = Math.floor((event.clientY - bounds.top - offsetY) / cell);
  if (x < 0 || x >= map.width || z < 0 || z >= map.height) return;

  if (selectedTile === '@spawn' || selectedTile === '@exit') {
    if (!ATLAS_TILES.get(map.tiles[z][x]).walkable) {
      setStatus('Start and Exit must be placed on walkable tiles.', true);
      return;
    }
    if (selectedTile === '@spawn') map.spawn = { x, z };
    else map.exit = { x, z };
  } else {
    map.tiles[z][x] = selectedTile;
    const tile = ATLAS_TILES.get(selectedTile);
    if (!tile.walkable && map.spawn.x === x && map.spawn.z === z) {
      map.spawn = { x: -1, z: -1 };
    }
    if (!tile.walkable && map.exit.x === x && map.exit.z === z) {
      map.exit = { x: -1, z: -1 };
    }
    map.objects = map.objects.filter((object) =>
      object.x !== x || object.z !== z || tile.walkable);
  }
  render();
  setStatus(`${map.name} — ${map.width} × ${map.height} tiles`);
}

function resizeMap() {
  const width = Number(widthInput.value);
  const height = Number(heightInput.value);
  if (!Number.isInteger(width) || !Number.isInteger(height) ||
      width < 8 || width > 48 || height < 8 || height > 36) {
    setStatus('Map dimensions must be 8–48 wide and 8–36 high.', true);
    return;
  }
  const tiles = Array.from({ length: height }, (_, z) =>
    Array.from({ length: width }, (_, x) => map.tiles[z]?.[x] ?? 'water_a'));
  const nextMap = {
    ...map,
    name: nameInput.value || map.name,
    width,
    height,
    tiles,
    spawn: map.spawn.x < width && map.spawn.z < height ? map.spawn : undefined,
    exit: map.exit.x < width && map.exit.z < height ? map.exit : undefined,
    objects: map.objects.filter((object) => object.x < width && object.z < height),
  };
  try {
    setMap(nextMap);
  } catch (error) {
    map = nextMap;
    render();
    setStatus(error.message, true);
  }
}

function downloadMap() {
  try {
    map.name = nameInput.value.trim();
    map.objective = objectiveSelect.value;
    const validated = validateMap(map);
    const content = `${JSON.stringify(validated, null, 2)}\n`;
    const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${validated.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'level'}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus(`Exported ${link.download}`);
  } catch (error) {
    setStatus(error.message, true);
  }
}

for (const tile of TILE_TYPES) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'tool';
  button.dataset.tile = tile.key;
  button.setAttribute('aria-pressed', String(tile.key === selectedTile));
  const color = tile.key === '@spawn' ? '#688847' : tile.key === '@exit' ? '#407d83' : '#38323e';
  button.innerHTML = `<span class="swatch" style="background:${color}"></span>${tile.name}`;
  button.addEventListener('click', () => {
    selectedTile = tile.key;
    render();
  });
  document.querySelector('#palette').append(button);
}

canvas.addEventListener('pointerdown', (event) => {
  drawing = true;
  canvas.setPointerCapture(event.pointerId);
  paintAt(event);
});
canvas.addEventListener('pointermove', (event) => {
  if (drawing) paintAt(event);
});
canvas.addEventListener('pointerup', () => { drawing = false; });
canvas.addEventListener('pointercancel', () => { drawing = false; });
window.addEventListener('resize', render);

document.querySelector('#resize').addEventListener('click', resizeMap);
document.querySelector('#boat-template').addEventListener('click', () => {
  try {
    setMap({
      ...initialMapTemplate,
      name: nameInput.value || initialMapTemplate.name,
    });
  } catch (error) {
    setStatus(error.message, true);
  }
});
document.querySelector('#clear').addEventListener('click', () => {
  const width = map.width;
  const height = map.height;
  map = {
    name: nameInput.value || 'New Level',
    objective: objectiveSelect.value,
    width,
    height,
    spawn: { x: -1, z: -1 },
    exit: { x: -1, z: -1 },
    tiles: Array.from({ length: height }, () => Array(width).fill('water_a')),
    objects: [],
  };
  render();
  setStatus('Map cleared. Add a Start and Exit tile before exporting.');
});
document.querySelector('#export').addEventListener('click', downloadMap);
document.querySelector('#import').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', async () => {
  const [file] = fileInput.files;
  if (!file) return;
  try {
    setMap(JSON.parse(await file.text()));
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    fileInput.value = '';
  }
});
document.querySelector('#play').addEventListener('click', () => {
  try {
    map.name = nameInput.value.trim();
    map.objective = objectiveSelect.value;
    localStorage.setItem('blood-emblem-playtest-level', JSON.stringify(validateMap(map)));
    window.location.href = '/?playtest=1';
  } catch (error) {
    setStatus(error.message, true);
  }
});

setMap(initialMapTemplate);
