import { readFile, writeFile } from 'node:fs/promises';

const file = new URL('../data/levels/map_12_infirmary.json', import.meta.url);
const map = JSON.parse(await readFile(file, 'utf8'));
map.width = 24;
map.height = 18;
map.villageScene = { version: 1, layout: 'infirmary', artwork: 'compact', cursorBounds: [2, 2, 21, 16] };
map.objects = [];
map.tiles = Array.from({ length: map.height }, () => Array(map.width).fill('infirmary_block'));
const rect = (x1, z1, x2, z2, tile = 'infirmary_floor') => {
  for (let z = z1; z <= z2; z++) for (let x = x1; x <= x2; x++) map.tiles[z][x] = tile;
};

rect(2, 2, 8, 5, 'infirmary_recovery');
rect(15, 2, 21, 5, 'infirmary_recovery');
rect(10, 2, 13, 5);
rect(6, 6, 6, 7, 'infirmary_doorway');
rect(17, 6, 17, 7, 'infirmary_doorway');
rect(12, 6, 12, 7, 'infirmary_doorway');
rect(6, 8, 17, 12);
rect(2, 9, 4, 12);
rect(5, 11, 5, 11, 'infirmary_doorway');
rect(10, 13, 14, 13);
rect(12, 14, 12, 15, 'infirmary_doorway');
rect(11, 16, 13, 16);
for (const [x, z] of [[2, 2], [2, 3], [4, 2], [4, 3], [6, 2], [6, 3],
  [17, 2], [17, 3], [19, 2], [19, 3], [21, 2], [21, 3], [10, 2], [10, 3], [11, 2], [11, 3]])
  rect(x, z, x, z, 'infirmary_block');

map.spawn = { x: 12, z: 12 };
map.exit = { x: 12, z: 10 };
map.players = [
  { id: 'arlan', x: 6, z: 8, startingItems: ['chest-key'] },
  { id: 'rictor', x: 17, z: 8, startingItems: ['chest-key'] },
  { id: 'lena', x: 8, z: 11 },
  { id: 'serra', x: 14, z: 11 },
];
map.enemies = [
  { id: 'undead', level: 11, x: 8, z: 2, ai: 'mobile' },
  { id: 'undead', level: 11, x: 15, z: 2, ai: 'mobile' },
  { id: 'undead', level: 11, x: 13, z: 3, ai: 'mobile' },
  { id: 'undead', level: 11, x: 13, z: 4, ai: 'mobile' },
];
const waves = [
  [3, 'west', [['ward-knight', 7, 2], ['undead', 8, 3]]],
  [5, 'east', [['infirmary-rider', 16, 2], ['undead', 15, 3]]],
  [6, 'carriage', [['undead', 12, 16], ['undead', 13, 16]]],
  [7, 'theater', [['rotten', 12, 3]]],
  [8, 'carriage', [['undead', 11, 16], ['undead', 13, 16]]],
];
map.reinforcements = waves.map(([turn, entranceId, units]) => ({
  turn, entranceId,
  units: units.map(([id, x, z]) => ({
    id,
    level: id === 'rotten' ? 15 : id === 'infirmary-rider' ? 14 : id === 'ward-knight' || turn >= 4 ? 12 : 11,
    x, z, ai: 'mobile',
  })),
}));
map.chests = [
  { id: 'treatment-ledger-chest', name: 'Treatment Records', x: 3, z: 9, rewardId: 'treatment-ledger', opened: false },
  { id: 'west-ward-supplies', name: 'West Ward Supplies', x: 3, z: 3, rewardId: 'javelin', opened: false },
  { id: 'east-ward-reliquary', name: 'East Ward Reliquary', x: 20, z: 3, rewardId: 'saints-ash', opened: false },
];
map.infirmary = {
  defendTurns: 8,
  defensePoint: { x: 12, z: 10 },
  gates: [],
  ledgerChestId: 'treatment-ledger-chest',
  patients: [],
  completionExp: 100, interactionExp: 60,
  survivedTurns: 0, rewardsClaimed: false, breached: false,
};
await writeFile(file, `${JSON.stringify(map, null, 2)}\n`);
