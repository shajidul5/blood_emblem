import { readFile, writeFile } from 'node:fs/promises';

const file = new URL('../data/levels/map_11_ward.json', import.meta.url);
const map = JSON.parse(await readFile(file, 'utf8'));
map.width = 36;
map.height = 24;
map.extendEdges = false;
map.villageScene = { version: 1, layout: 'ward', artwork: 'compact', cursorBounds: [4, 3, 31, 20] };
map.objects = [];
map.tiles = Array.from({ length: map.height }, () => Array(map.width).fill('ward_block'));
const rect = (x1, z1, x2, z2, tile = 'ward_floor') => {
  for (let z = z1; z <= z2; z++) for (let x = x1; x <= x2; x++) map.tiles[z][x] = tile;
};

// Trace the four-room cutaway at 128/3 native pixels per tactical tile.
rect(4, 9, 31, 10);
rect(4, 14, 31, 15);
rect(4, 11, 11, 13);
rect(22, 11, 31, 13);
for (const [left, right, door] of [[4, 9, 7], [13, 20, 17], [25, 31, 28]]) {
  rect(left, 3, right, 7);
  rect(door, 8, door, 8);
}
rect(12, 17, 21, 20);
rect(17, 16, 17, 16);
rect(28, 16, 28, 18);
rect(30, 3, 31, 5, 'ward_stairs');
for (const [x1, z1, x2, z2] of [
  [4, 4, 4, 6], [13, 3, 13, 5], [19, 3, 20, 3], [20, 4, 20, 5],
  [26, 4, 26, 5], [31, 6, 31, 6],
  [12, 17, 13, 19], [14, 17, 15, 17], [18, 17, 21, 17], [21, 18, 21, 19],
]) rect(x1, z1, x2, z2, 'ward_block');

map.spawn = { x: 7, z: 5 };
map.players = [{ id: 'rictor', ...map.spawn }, { id: 'lena', x: 7, z: 9 }];
map.exit = { x: 31, z: 3 };
map.exitTiles = [{ x: 30, z: 3 }, { x: 31, z: 4 }, { x: 30, z: 4 }];
map.houses = [{
  id: 'ward-equipment-rack', name: 'Confiscated Equipment', x: 19, z: 3, width: 2, height: 1,
  door: { x: 19, z: 4 }, rewardId: 'vigil-lance', visited: false,
}];
map.chests = [
  { id: 'ward-tonic', name: 'Seized Medical Supplies', x: 15, z: 20, rewardId: 'bloodroot-tonic', opened: false },
  { id: 'ward-codex', name: 'Confiscated Training Manual', x: 19, z: 20, rewardId: 'hunters-codex', opened: false },
];
map.cells = [
  { id: 'rictor-cell', door: { x: 7, z: 8 }, opened: false, prisoners: [] },
  { id: 'evidence-room', door: { x: 17, z: 16 }, opened: false,
    prisoners: [{ id: 'undead', level: 9, x: 16, z: 18 }, { id: 'undead', level: 10, x: 19, z: 18 }] },
];
map.enemies = [
  { id: 'ward-soldier', level: 9, x: 25, z: 10, ai: 'guard', drop: 'chest-key' },
  { id: 'ward-soldier', level: 9, x: 9, z: 15, ai: 'guard', drop: 'potion' },
  { id: 'ward-soldier', level: 10, x: 22, z: 13, ai: 'guard' },
  { id: 'undead', level: 9, x: 29, z: 14, ai: 'mobile' },
  { id: 'ward-soldier', level: 10, x: 30, z: 10, ai: 'guard', drop: 'potion' },
  { id: 'rotten', level: 15, x: 28, z: 6, ai: 'guard' },
];
await writeFile(file, `${JSON.stringify(map, null, 2)}\n`);
