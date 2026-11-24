import { readFile, writeFile } from 'node:fs/promises';

const file = new URL('../data/levels/map_09_last_crossing.json', import.meta.url);
const map = JSON.parse(await readFile(file, 'utf8'));
map.width = map.height = 32;
map.lighting = 'sunset';
map.extendEdges = false;
map.forestEdges = false;
map.villageScene = { version: 1, layout: 'crossing', cursorBounds: [2, 4, 29, 29] };
map.objects = [];
map.trees = [];
map.tiles = Array.from({ length: 32 }, () => Array(32).fill('crossing_block'));
const rect = (x1, z1, x2, z2, id = 'crossing_lane') => {
  for (let z = z1; z <= z2; z++) for (let x = x1; x <= x2; x++) map.tiles[z][x] = id;
};
rect(11, 4, 19, 7);
rect(15, 8, 17, 12);
rect(9, 11, 10, 13);
rect(10, 12, 14, 14);
rect(8, 14, 17, 16);
rect(17, 14, 24, 15);
rect(17, 13, 18, 19);
rect(24, 10, 25, 21);
rect(25, 10, 29, 10);
rect(29, 10, 29, 21);
rect(25, 17, 29, 18);
rect(24, 20, 29, 21);
rect(17, 20, 24, 21);
rect(7, 16, 8, 21);
rect(2, 15, 8, 16);
rect(2, 14, 6, 15);
rect(2, 21, 8, 22);
rect(7, 22, 16, 23);
rect(15, 20, 17, 24);
rect(16, 23, 24, 24);
rect(24, 22, 25, 25);
rect(24, 25, 24, 29);
rect(8, 24, 9, 29);
rect(8, 24, 15, 24);
rect(9, 27, 9, 28, 'crossing_cover');
rect(24, 27, 24, 28, 'crossing_cover');
rect(17, 17, 18, 18, 'crossing_cover');
rect(25, 17, 26, 18, 'crossing_cover');
rect(12, 21, 14, 21, 'crossing_cover');
rect(15, 13, 16, 14, 'crossing_block');
rect(13, 14, 13, 15, 'crossing_block');
rect(29, 0, 29, 31, 'crossing_block');
rect(8, 26, 8, 29, 'crossing_block');
for (const [x, z] of [[2, 21], [2, 22], [3, 22]]) map.tiles[z][x] = 'crossing_block';
map.houses = [
  { id: 'miller-house', name: "Miller's House", x: 11, z: 8, width: 4, height: 4, door: { x: 12, z: 12 }, villagerId: 'ada' },
  { id: 'weaver-house', name: "Weaver's House", x: 19, z: 10, width: 5, height: 4, door: { x: 21, z: 14 }, villagerId: 'tomas' },
  { id: 'orchard-house', name: 'Orchard House', x: 18, z: 16, width: 6, height: 4, door: { x: 20, z: 20 }, villagerId: 'nell' },
];
for (const house of map.houses) rect(house.x, house.z, house.x + house.width - 1, house.z + house.height - 1, 'crossing_block');
map.spawn = { x: 9, z: 16 };
map.players = ['maria', 'bartz', 'cypher', 'seymour', 'stark'].map((id, i) => ({
  id, x: [9, 8, 6, 7, 8][i], z: [16, 16, 16, 17, 17][i],
}));
map.players.push({ id: 'linus', x: 17, z: 18 }, { id: 'leon', x: 17, z: 20 });
map.exit = { x: 15, z: 6 };
map.enemies = [
  { id: 'bridge-captain', x: 15, z: 6, ai: 'stationary', drop: 'javelin' },
  ...[12, 15, 18].map((x) => ({ id: 'bridge-knight', x, z: 7, ai: 'stationary' })),
  ...[{ x: 8, z: 24 }, { x: 9, z: 25 }, { x: 24, z: 29 }]
    .map((point) => ({ id: 'feral-wolf', level: 17, ...point, ai: 'mobile' })),
  { id: 'root-warden', level: 16, x: 10, z: 24, ai: 'mobile' },
];
map.rescue.recruit = { id: 'linus', x: 17, z: 18, hp: 40 };
map.rescue.bridgeAdvance = { turn: 5, units: [{ x: 12, z: 7 }, { x: 18, z: 7 }] };
map.rescue.refuge = [{ x: 3, z: 15 }, { x: 4, z: 15 }, { x: 3, z: 16 }, { x: 4, z: 16 }];
const reward = map.rescue.rewards.find((entry) => entry.rescued === 2);
reward.items = ['wind-tome', 'master-emblem'];
const beast = (id, level, x, z) => ({ id, level, x, z, ai: 'mobile' });
map.reinforcements = [
  { turn: 2, units: [beast('feral-wolf', 18, 9, 27), beast('feral-wolf', 18, 9, 28), beast('feral-wolf', 18, 9, 29)] },
  { turn: 4, units: [beast('feral-wolf', 19, 24, 27), beast('feral-wolf', 19, 24, 28), beast('root-warden', 16, 24, 29)] },
  { turn: 6, units: [beast('feral-wolf', 19, 9, 26), beast('feral-wolf', 19, 9, 27), beast('root-warden', 16, 9, 28), beast('root-warden', 17, 9, 29)] },
  { turn: 8, units: [beast('feral-wolf', 19, 24, 26), beast('root-warden', 16, 24, 27), beast('root-warden', 17, 24, 28), beast('root-warden', 18, 24, 29)] },
];
await writeFile(file, `${JSON.stringify(map, null, 2)}\n`);
