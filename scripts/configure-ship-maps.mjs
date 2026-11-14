import { readFile, writeFile } from 'node:fs/promises';

// Each span describes safe deck cell centers in the approved 512px composition.
const left = [
  null, [3, 6], [3, 6], [3, 6], [3, 3], [3, 6], [3, 6],
  [3, 6], [3, 6], [3, 6], [3, 6], [3, 6], [3, 6], [3, 6],
  [3, 6], [3, 6], [4, 5], [4, 5], null, null, null,
];
const right = [
  null, null, [14, 14], [13, 15], [13, 15], [12, 15], [12, 15],
  [12, 15], [12, 15], [12, 15], [12, 15], [12, 15], [12, 15],
  [12, 15], [15, 15], [12, 15], [12, 15], [13, 15], null, null, null,
];
const cargo = [[3, 1], [6, 1], [4, 1], [4, 3], [6, 5], [6, 6], [4, 13], [6, 13], [6, 14], [5, 17]];
const enemyCargo = [[14, 5], [16, 7], [15, 8], [15, 10], [16, 10], [12, 13], [13, 16]];

for (const [filename, layout, width] of [
  ['map_01_two_ships', 'two-ships', 19],
  ['map_02_boarders_from_the_deep', 'lone-ship', 9],
]) {
  const url = new URL(`../data/levels/${filename}.json`, import.meta.url);
  const map = JSON.parse(await readFile(url, 'utf8'));
  const tiles = Array.from({ length: 21 }, () => Array(width).fill('water_a'));
  for (const [z, span] of left.entries()) {
    if (!span) continue;
    for (let x = span[0]; x <= span[1]; x++) tiles[z][x] = 'ship_deck';
  }
  for (const [x, z] of cargo) tiles[z][x] = 'ship_obstacle';
  for (const z of [4, 5, 6]) tiles[z][3] = 'ship_steps';
  if (layout === 'two-ships') {
    for (const [z, span] of right.entries()) {
      if (!span) continue;
      for (let x = span[0]; x <= span[1]; x++) tiles[z][x] = 'ship_deck';
    }
    for (const [x, z] of enemyCargo) tiles[z][x] = 'ship_obstacle';
    tiles[14][15] = 'ship_steps';
    for (const z of [9, 11]) for (let x = 7; x <= 11; x++) tiles[z][x] = 'ship_gangway';
    map.enemies = [
      { id: 'bartz', x: 14, z: 6 },
      { id: 'raider', x: 12, z: 6 },
      { id: 'raider', x: 15, z: 4 },
      { id: 'raider', x: 14, z: 8 },
    ];
  } else {
    map.spawn = { x: 3, z: 3 };
    map.exit = { x: 5, z: 3 };
    map.players = [{ id: 'maria', ...map.spawn }, { id: 'bartz', ...map.exit }];
    map.enemies = [
      { id: 'merfolk-boss', x: 4, z: 16 },
      { id: 'merfolk', x: 3, z: 15 },
      { id: 'merfolk', x: 5, z: 15 },
      { id: 'merfolk', x: 3, z: 14 },
      { id: 'merfolk', x: 5, z: 14 },
    ];
  }
  // Block the square-grid fringe between safe deck cells and water.
  const deck = tiles.map((row) => [...row]);
  for (let z = 0; z < 21; z++) for (let x = 0; x < width; x++) {
    if (deck[z][x] !== 'water_a') continue;
    if ([[x-1,z], [x+1,z], [x,z-1], [x,z+1]].some(([cx,cz]) =>
      deck[cz]?.[cx] && deck[cz][cx] !== 'water_a')) tiles[z][x] = 'ship_rail';
  }
  map.objects = [];
  map.shipScene = { version: 1, layout };
  map.lighting = 'night';
  map.tiles = tiles;
  delete map.bridge;
  delete map.ships;
  delete map.deployment;
  // Compact rows make it possible to review the collision grid next to the artwork.
  const json = JSON.stringify(map, null, 2).replace(
    /    \[\n((?:      "[a-z_]+",?\n)+)    \]/g,
    (_, row) => `    [${row.trim().split(',\n').map((id) => id.trim()).join(', ')}]`,
  );
  await writeFile(url, `${json}\n`);
}
