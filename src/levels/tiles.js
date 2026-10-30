import shipTileset from '../../assets/tiles/ship_oblique/ship_oblique_tileset.json';

// Tile definitions are data-driven: add an entry to the tileset JSON and it is
// usable by the level loader, map editor and battle rules with no code changes.
const DEFAULTS = Object.freeze({
  walkable: false,
  avoid: 0,
  defense: 0,
  elevation: 0,
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
  return parts.length ? parts.join(', ') : 'No combat bonuses';
}

function buildDefinition(entry) {
  const tile = { ...DEFAULTS, ...entry };
  tile.name = entry.name ?? titleCase(entry.id);
  tile.bonus = entry.bonus ?? describeBonus(tile);
  return Object.freeze(tile);
}

export const TILE_DEFS = new Map(shipTileset.tiles.list.map((entry) => [entry.id, buildDefinition(entry)]));

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

export function isLevelTileWalkable(level, x, z) {
  return isTileWalkable(level?.tileIds?.[z]?.[x]);
}
