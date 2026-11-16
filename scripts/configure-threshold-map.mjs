import { readFile, writeFile } from 'node:fs/promises';

const file = new URL('../data/levels/map_10_golden_threshold.json', import.meta.url);
const map = JSON.parse(await readFile(file, 'utf8'));
map.width = 23;
map.height = 36;
map.extendEdges = false;
map.forestEdges = false;
map.lighting = 'dusk';
map.villageScene = { version: 1, layout: 'threshold', cursorBounds: [2, 5, 20, 33] };
map.spawn = { x: 11, z: 32 };
map.exit = { x: 11, z: 5 };
map.players = [
  { id: 'maria', x: 11, z: 32 }, { id: 'bartz', x: 10, z: 33 },
  { id: 'cypher', x: 12, z: 33 }, { id: 'seymour', x: 11, z: 33 },
  { id: 'stark', x: 9, z: 32 },
];
map.objects = [];
map.trees = [];
map.tiles = Array.from({ length: map.height }, (_, z) =>
  Array.from({ length: map.width }, (_, x) => {
    if (z < 5 || z > 33 || x < 2 || x > 20 ||
      z >= 26 && (x === 2 || x === 20) || z === 33 && (x === 3 || x === 19)) return 'threshold_scenery';
    if (x === 6 || x === 16) return 'crossing_parapet';
    return x >= 7 && x <= 15 ? 'crossing_deck' : 'water_a';
  }));
for (let x = 7; x <= 15; x++) if (x !== 11) map.tiles[5][x] = 'city_wall';
// Trace the approved art, including the two open flanks of the middle sandbag island.
for (const [z, from, to] of [[28, 7, 12], [21, 10, 13], [16, 7, 12], [10, 11, 15]]) {
  for (let x = from; x <= to; x++) map.tiles[z][x] = 'bridge_sandbags';
}
const guard = (id, x, z, extras = {}) => ({ id: `golden-${id}`, x, z, ai: 'guard', ...extras });
const formations = [
  { id: 'vanguard', name: 'Vanguard', line: 31, turn: 4, units: [
    guard('cavalier', 9, 30), guard('cavalier', 13, 30),
    guard('soldier', 13, 26, { weaponId: 'javelin' }),
    guard('archer', 14, 27), guard('mage', 9, 27),
  ] },
  { id: 'crossfire', name: 'Crossfire Company', line: 25, turn: 7, units: [
    guard('soldier', 9, 24), guard('cavalier', 11, 24),
    guard('knight', 14, 20), guard('mage', 12, 20), guard('archer', 8, 20),
    guard('priest', 13, 20, { drop: 'heal-staff' }),
  ] },
  { id: 'counterguard', name: 'Counterguard', line: 19, turn: 10, units: [
    guard('soldier', 14, 18), guard('cavalier', 9, 18), guard('cavalier', 13, 18),
    guard('knight', 14, 15), guard('mage', 9, 15),
  ] },
  { id: 'gatewatch', name: "Aurelan's Gatewatch", line: 11, turn: 13, units: [
    guard('knight', 8, 9), guard('knight', 14, 9),
    guard('mage', 12, 9, { weaponId: 'blaze' }), guard('archer', 9, 8),
    guard('captain', 11, 7, { drop: 'master-emblem' }),
    guard('priest', 13, 9),
  ] },
];
map.enemies = [
  ...formations.flatMap((squad) => squad.units),
  ...[2, 20].map((x) => ({ id: 'raven', x, z: 23, ai: 'mobile' })),
];
map.gateEncounter = {
  captainId: 'golden-captain', beastId: 'blood-beast', ...map.exit, spawned: false,
  pressure: {
    ravenArrivalTurn: null,
    squads: formations.map(({ units, ...squad }) => ({
      ...squad, active: false, members: units.map(({ id, x, z }) => ({ id, x, z })),
    })),
  },
};
map.reinforcements = [4, 8].map((turn, i) => ({
  turn,
  entranceId: 'bridge-ravens',
  units: [2, 20].map((x) => ({ id: 'raven', x, z: i ? 14 : 22, ai: 'mobile' })),
}));
await writeFile(file, `${JSON.stringify(map, null, 2)}\n`);
