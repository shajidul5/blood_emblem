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
for (const [id, name, walkable, bonuses] of [
  ['cathedral_floor', 'Cathedral Marble', true, {}],
  ['cathedral_carpet', 'Processional Carpet', true, {}],
  ['cathedral_stairs', 'Cathedral Stairs', true, { moveCost: 2 }],
  ['cathedral_altar', 'Consecrated Marble', true, { avoid: 10, defense: 2 }],
  ['cathedral_throne', 'Bishop\'s Throne', true, { avoid: 20, defense: 3, healPerTurn: 5, bonus: '+20 Avoid, +3 Defense, heals 5 HP each turn' }],
  ['cathedral_pew', 'Oak Pew', false, {}],
  ['cathedral_pillar', 'Ribbed Pillar', false, {}],
  ['cathedral_wall', 'Cathedral Wall', false, {}],
  ['cathedral_rail', 'Gallery Balustrade', false, {}],
  ['bell_cobble', 'Freight Yard Cobbles', true, {}],
  ['bell_plaza', 'Clocktower Plaza', true, {}],
  ['bell_track', 'Wagon Rails', true, {}],
  ['bell_track_bridge', 'Rail Bridge', true, {}],
  ['bell_bridge', 'Canal Footbridge', true, {}],
  ['bell_canal', 'Freight Canal', false, {}],
  ['bell_crates', 'Freight Crates', true, { avoid: 20, defense: 1, moveCost: 2 }],
  ['bell_lift', 'Bell Lift Platform', true, {}],
  ['bell_shaft', 'Lift Shaft', false, {}],
  ['bell_winch', 'Lift Winch', false, {}],
  ['bell_warehouse', 'Bonded Warehouse', false, {}],
  ['bell_tower', 'Clocktower', false, {}],
  ['shore_stone', 'Ancient Quay', true, {}],
  ['shore_bridge', 'Drowned Causeway', true, {}],
  ['shore_lift', 'Lower Lift Landing', true, {}],
  ['shore_gate', 'Sea Gate', true, {}],
  ['shore_rubble', 'Salt-Worn Rubble', true, { avoid: 20, defense: 1, moveCost: 2 }],
  ['shore_sea', 'Starless Sea', false, {}],
  ['shore_ruin', 'Ancient Armory', false, {}],
  ['shore_beacon', 'Offering Beacon', false, {}],
  ['shore_mooring', 'Ancient Mooring', false, {}],
]) TILE_DEFS.set(id, buildDefinition({ id, name, walkable, ...bonuses }));
for (const [id, label, walkable, extras] of [
  ['city_paving', 'Ancient Processional Street', true, {}],
  ['city_cover', 'Sunken Masonry', true, { avoid: 20, defense: 1, moveCost: 2 }],
  ['city_plaza', 'Drowned Bell Plaza', true, {}],
  ['city_ward', 'Ward Sigil', true, { defense: 2, avoid: 10 }],
  ['city_seal', 'Ancient Approach Seal', true, {}],
  ['city_mechanism', 'Celestial Mechanism', false, {}],
  ['city_building', 'Ancient Building', false, {}],
  ['city_statue', 'Ancient Astronomer Statue', false, {}],
  ['city_rampart', 'Ancient Sea Wall', false, {}],
]) TILE_DEFS.set(id, buildDefinition({ id, name: label, walkable, ...extras }));
for (const [id, name, walkable, extras] of [
  ['throne_road', 'Ancient Processional Road', true, {}],
  ['throne_stairs', 'Terrace Stairs', true, {}],
  ['throne_seat', 'Custodian Throne', true, { avoid: 15, defense: 2, healPerTurn: 5 }],
  ['throne_building', 'Custodian Sanctuary', false, {}],
  ['throne_statue', 'Petrified Congregation', false, {}],
]) TILE_DEFS.set(id, buildDefinition({ id, name, walkable, ...extras }));
export const SHORE_TILE_IDS = new Set([...TILE_DEFS.keys()].filter((id) => id.startsWith('shore_') || id.startsWith('throne_') ||
  ['city_paving', 'city_cover', 'city_plaza', 'city_ward', 'city_seal', 'city_mechanism', 'city_building', 'city_statue', 'city_rampart'].includes(id)));
export const BELL_YARD_TILE_IDS = new Set([...TILE_DEFS.keys()].filter((id) => id.startsWith('bell_')));
export const VILLAGE_GRAVEL_TILE_IDS = new Set([
  'village_gravel_a',
  'village_gravel_b',
  'village_gravel_c',
  'village_building',
]);
export const STREET_TILE_IDS = new Set(['street_curb', 'street_lamp']);
export const COURTYARD_TILE_IDS = new Set([
  'courtyard_paving', 'courtyard_lawn', 'courtyard_hedge', 'courtyard_wall',
  'courtyard_fountain', 'courtyard_cathedral',
]);
for (const [id, name, walkable, bonuses] of [
  ['courtyard_paving', 'Pale Paving', true, {}],
  ['courtyard_lawn', 'Formal Garden', true, { avoid: 10, defense: 1 }],
  ['courtyard_hedge', 'Clipped Hedge', false, {}],
  ['courtyard_wall', 'Low Limestone Wall', false, {}],
  ['courtyard_fountain', 'Dry Fountain', false, {}],
  ['courtyard_cathedral', 'Cathedral Wall', false, {}],
]) {
  TILE_DEFS.set(id, buildDefinition({ id, name, walkable, ...bonuses }));
}
for (const id of STREET_TILE_IDS) {
  TILE_DEFS.set(id, buildDefinition({
    id,
    name: id === 'street_lamp' ? 'Gas Lamp' : 'Raised Curb',
    walkable: false,
  }));
}
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

export function isInfirmaryRecoveryWard(x, z) {
  return (((x >= 1 && x <= 5) || (x >= 18 && x <= 22)) && z >= 2 && z <= 6) ||
    (((x >= 7 && x <= 10) || (x >= 14 && x <= 16)) && z >= 7 && z <= 10);
}

export function infirmaryDoorOrientation(level, x, z) {
  const wallAt = (dx, dz) => {
    const id = level.tileIds[z + dz]?.[x + dx];
    return id?.startsWith('mans_wall') || id === 'mans_door_open' ? 1 : 0;
  };
  const horizontal = wallAt(-1, 0) + wallAt(1, 0);
  const vertical = wallAt(0, -1) + wallAt(0, 1);
  const side = vertical > horizontal;
  return { direction: side ? 'side' : 'front', mirrored: side && x >= level.width / 2 };
}

export function isLevelTileWalkable(level, x, z, unit) {
  const tileId = level?.tileIds?.[z]?.[x];
  const flying = unit?.type === 'flying';
  return Boolean(tileId) && (flying
    ? TILE_DEFS.has(tileId) && !['throne_building', 'throne_statue', 'city_wall', 'city_building', 'city_statue', 'city_rampart', 'city_mechanism', 'village_building', 'courtyard_cathedral', 'courtyard_fountain', 'cathedral_wall', 'cathedral_pillar', 'bell_warehouse', 'bell_tower', 'bell_winch', 'shore_ruin', 'shore_beacon', 'shore_mooring'].includes(tileId) && !STREET_TILE_IDS.has(tileId) && !tileId.startsWith('mans_wall')
    : isTileWalkable(tileId)) &&
    !(level?.waitingCity && !level.waitingCity.opened && tileId === 'city_seal') &&
    !(level?.gateEncounter && !level.gateEncounter.spawned &&
      level.gateEncounter.x === x && level.gateEncounter.z === z) &&
    !(level?.cells ?? []).some((cell) => !cell.opened && cell.door.x === x && cell.door.z === z) &&
    !(level?.infirmary?.gates ?? []).some((gate) => gate.closed &&
      (gate.blocks ?? []).some((block) => block.x === x && block.z === z)) &&
    ![...(level?.houses ?? []), ...(level?.decorativeHouses ?? [])].some((house) =>
      x >= house.x && x < house.x + house.width &&
      z >= house.z && z < house.z + house.height);
}
