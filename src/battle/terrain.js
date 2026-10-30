const TERRAIN_BY_TILE = {
  '.': Object.freeze({ name: 'Water', avoid: 0, defense: 0, walkable: false, bonus: 'Blocks movement' }),
  h: Object.freeze({ name: 'Hull', avoid: 0, defense: 0, walkable: false, bonus: 'Blocks movement' }),
  d: Object.freeze({ name: 'Deck', avoid: 0, defense: 0, walkable: true, bonus: 'No combat bonuses' }),
  b: Object.freeze({ name: 'Bridge', avoid: 0, defense: 0, walkable: true, bonus: 'No combat bonuses' }),
  q: Object.freeze({
    name: 'Stairs',
    avoid: 10,
    defense: 0,
    walkable: true,
    bonus: '+10 Avoid',
  }),
  w: Object.freeze({
    name: 'Helm',
    avoid: 20,
    defense: 1,
    walkable: true,
    bonus: '+20 Avoid, +1 Defense',
  }),
  p: Object.freeze({
    name: 'Quarterdeck',
    avoid: 10,
    defense: 1,
    walkable: true,
    bonus: '+10 Avoid, +1 Defense',
  }),
  c: Object.freeze({
    name: 'Cover',
    avoid: 20,
    defense: 1,
    walkable: true,
    bonus: '+20 Avoid, +1 Defense',
  }),
  r: Object.freeze({ name: 'Railing', avoid: 0, defense: 0, walkable: false, bonus: 'Blocks movement' }),
  m: Object.freeze({ name: 'Mast', avoid: 0, defense: 0, walkable: false, bonus: 'Blocks movement' }),
  s: Object.freeze({ name: 'Start', avoid: 0, defense: 0, walkable: true, bonus: 'No combat bonuses' }),
  e: Object.freeze({ name: 'Exit', avoid: 0, defense: 0, walkable: true, bonus: 'No combat bonuses' }),
};
const UNKNOWN_TERRAIN = Object.freeze({
  name: 'Unknown',
  avoid: 0,
  defense: 0,
  walkable: false,
  bonus: 'No terrain data',
});

export function getTerrain(level, x, z) {
  const tile = level?.tiles[z]?.[x];
  return TERRAIN_BY_TILE[tile] ?? UNKNOWN_TERRAIN;
}

export function getTileElevation(level, x, z) {
  return TERRAIN_BY_TILE[level?.tiles[z]?.[x]]?.elevation ?? 0;
}
