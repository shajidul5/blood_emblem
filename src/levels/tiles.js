import shipTileset from '../../assets/tiles/ship_oblique/ship_oblique_tileset.json';

// Tile definitions are data-driven: add an entry to the tileset JSON and it is
// usable by the level loader, map editor and battle rules with no code changes.
const DEFAULTS = Object.freeze({
  walkable: false,
  avoid: 0,
  defense: 0,
  elevation: 0,
  moveCost: 1,
  ...shipTileset.tiles.defaults,
});

function titleCase(id) {
  return id.split('_').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

function describeBonus(tile) {
  if (!tile.walkable) return 'Blocks movement';
  const parts = [];
  if (tile.avoid) parts.push(`${tile.avoid > 0 ? '+' : ''}${tile.avoid} Avoid`);
  if (tile.defense) parts.push(`${tile.defense > 0 ? '+' : ''}${tile.defense} Defense`);
  if (tile.moveCost > 1) parts.push(`-${tile.moveCost - 1} Movement`);
  return parts.length ? parts.join(', ') : 'No combat bonuses';
}

function buildDefinition(entry) {
  const tile = { ...DEFAULTS, ...entry };
  tile.name = entry.name ?? titleCase(entry.id);
  tile.bonus = entry.bonus ?? describeBonus(tile);
  return Object.freeze(tile);
}

export const TILE_DEFS = new Map(shipTileset.tiles.list.map((entry) => [entry.id, buildDefinition(entry)]));
export const VILLAGE_GRAVEL_TILE_IDS = new Set([
  'village_gravel_a',
  'village_gravel_b',
  'village_gravel_c',
  'village_building',
]);
for (const id of VILLAGE_GRAVEL_TILE_IDS) {
  const building = id === 'village_building';
  TILE_DEFS.set(id, buildDefinition({
    id,
    name: building ? 'Building' : 'Village Gravel',
    walkable: !building,
  }));
}

export const UNKNOWN_TILE = Object.freeze({
  ...DEFAULTS,
  id: 'unknown',
  name: 'Unknown',
  bonus: 'No terrain data',
});

export function getTileDef(tileId) {
  return TILE_DEFS.get(tileId) ?? UNKNOWN_TILE;
}

export function isTileWalkable(tileId) {
  return getTileDef(tileId).walkable;
}

export function isLevelTileWalkable(level, x, z, unit) {
  const tileId = level?.tileIds?.[z]?.[x];
  const flying = unit?.type === 'flying';
  return Boolean(tileId) && (flying
    ? TILE_DEFS.has(tileId) && !['city_wall', 'village_building'].includes(tileId) && !tileId.startsWith('mans_wall')
    : isTileWalkable(tileId)) &&
    !(level?.gateEncounter && !level.gateEncounter.spawned &&
      level.gateEncounter.x === x && level.gateEncounter.z === z) &&
    ![...(level?.houses ?? []), ...(level?.decorativeHouses ?? [])].some((house) =>
      x >= house.x && x < house.x + house.width &&
      z >= house.z && z < house.z + house.height);
}
