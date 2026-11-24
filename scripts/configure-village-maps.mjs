import { readFile, writeFile } from 'node:fs/promises';

function formatMap(map) {
  return `${JSON.stringify(map, null, 2).replace(
    /    \[\n((?:      "[a-z_]+",?\n)+)    \]/g,
    (_, row) => `    [${row.trim().split(',\n').map((id) => id.trim()).join(', ')}]`,
  )}\n`;
}
// Safe 16px cell centers in the approved village composition; all roofs, trees,
// furniture, seawalls and water remain blocked rather than repainted as floor.
const lanes = [
  [[4,4],[22,22]], [[4,4],[22,22]], [[4,4],[22,22]],
  [[3,4],[22,22]], [[3,4],[22,22]], [[3,4],[22,22]],
  [[3,4],[16,17],[22,22],[28,28]],
  [[3,4],[7,10],[12,17],[22,22],[28,30]],
  [[3,4],[7,17],[22,22],[28,30],[39,40]],
  [[3,4],[7,17],[22,22],[28,30],[35,35],[39,40]],
  [[3,45]],
  [[12,12],[17,17],[22,22],[31,31],[33,33],[39,40]],
  [[12,12],[17,17],[22,22],[31,31],[34,35],[38,40]],
  [[12,12],[17,17],[22,22],[31,31],[34,35],[38,40]],
  [[12,13],[17,17],[22,22],[31,31],[34,35],[38,40]],
  [[12,13],[17,17],[22,22],[31,31],[34,44]],
  [[13,14],[17,17],[22,22],[31,31]],
  [[14,17],[22,22],[31,31]],
  [[14,17],[22,22]],
  [[14,22]],
  [[14,22]],
];
const house = (id, name, x, z, width, height, dx, dz, rewardId, recruitId) => ({
  id, name, x, z, width, height, door: { x: dx, z: dz },
  ...(rewardId ? { rewardId } : { recruitId }),
});

for (const [file, layout, width] of [
  ['map_03_fishing_village', 'harbor', 24],
  ['map_05_escape', 'village', 48],
]) {
  const url = new URL(`../data/levels/${file}.json`, import.meta.url);
  const map = JSON.parse(await readFile(url, 'utf8'));
  const tiles = Array.from({ length: 21 }, () => Array(width).fill('village_block'));
  for (const [z, spans] of lanes.entries()) for (const [left, right] of spans)
    for (let x = left; x <= Math.min(right, width - 1); x++) tiles[z][x] = 'village_path';
  // Keep the eastern garden connected through its open northern entrance.
  if (width === 48) for (const [x,z] of [[33,12],[33,13],[33,14],[33,15],[38,11]])
    tiles[z][x] = 'village_path';
  map.width = width;
  map.height = 21;
  map.tiles = tiles;
  map.villageScene = { version: 1, layout };
  map.lighting = 'night';
  map.objects = [];
  map.decorativeHouses = [];
  map.extendEdges = false;
  map.forestEdges = false;
  map.noFence = true;
  if (layout === 'harbor') {
    map.villageScene.artwork = 'hd';
    for (let z = 11; z <= 13; z++) tiles[z][13] = 'village_path';
    for (let z = 11; z <= 12; z++)
      for (let x = 7; x <= 11; x++) tiles[z][x] = 'village_path';
    map.villageScene.playableWidth = 21;
    for (const row of tiles) row.fill('village_block', 21);
    map.objective = 'defend';
    map.defendTurns = 10;
    map.spawn = { x: 15, z: 18 };
    map.exit = { x: 4, z: 0 };
    map.players = [
      { id: 'maria', ...map.spawn }, { id: 'bartz', x: 16, z: 18 },
      { id: 'cypher', x: 17, z: 18 },
    ];
    map.houses = [
      house('fisher-cottage-1', "Fisher's Cottage", 9, 4, 2, 3, 10, 7, 'potion'),
      house('fisher-cottage-2', "Harbor Mage's House", 18, 11, 3, 4, 17, 14, 'thunder-tome'),
      house('fisher-cottage-3', "Netmaker's House", 12, 3, 3, 4, 13, 7, 'lancereaver'),
    ];
    const spots = [[7,8],[10,8],[13,8],[16,8],[17,8]];
    map.enemies = map.enemies.map((enemy, i) => ({ ...enemy, x: spots[i][0], z: spots[i][1] }));
    map.reinforcements = [2,4,6,8,10].map((turn) => ({
      turn,
      units: [
        { id: 'merfolk', level: turn < 6 ? 6 : turn < 10 ? 7 : 8, x: 20, z: 10 },
        { id: 'merfolk', level: turn < 6 ? 6 : turn < 10 ? 7 : 8, x: 20, z: 20 },
        ...(turn === 6 ? [{ id: 'merfolk-chieftain', x: 19, z: 10 }] : []),
      ],
    }));
  } else {
    map.villageScene.artwork = 'hd';
    for (let z = 11; z <= 13; z++) tiles[z][13] = 'village_path';
    for (let z = 11; z <= 12; z++)
      for (let x = 7; x <= 11; x++) tiles[z][x] = 'village_path';
    for (let x = 34; x <= 37; x++) tiles[11][x] = 'village_path';
    for (let z = 12; z <= 14; z++) tiles[z][36] = 'village_path';
    for (let z = 16; z <= 17; z++)
      for (let x = 34; x <= 35; x++) tiles[z][x] = 'village_path';
    map.spawn = { x: 35, z: 10 };
    map.exit = { x: 22, z: 0 };
    map.exitTiles = Array.from({ length: 5 }, (_, z) => ({ x: 22, z }));
    map.players = [
      { id: 'maria', ...map.spawn }, { id: 'bartz', x: 34, z: 10 }, { id: 'cypher', x: 35, z: 9 },
    ];
    map.houses = [
      house('fishermans-house', "Fisherman's House", 9, 4, 2, 3, 10, 7, 'hunter-pistol'),
      house('net-mender-house', "Net Mender's House", 27, 3, 3, 3, 28, 6, 'master-emblem'),
      house('herbalist-house', "Herbalist's House", 41, 11, 3, 4, 43, 15, null, 'seymour'),
    ];
    const spots = [[12,10],[17,15],[22,16],[22,12],[28,10],[28,8],[30,10],[32,10],
      [39,8],[39,10],[39,13],[38,15],[44,15],[45,10],[22,4],[22,7]];
    map.enemies = map.enemies.map((enemy, i) => ({ ...enemy, x: spots[i][0], z: spots[i][1] }));
    // Turn-10 Deep Merfolk come from the east ends of the two eastern lanes, behind a party heading west.
    const eastEntries = [[45, 10], [44, 15]];
    map.reinforcements = (Array.isArray(map.reinforcements) ? map.reinforcements : [map.reinforcements]).map((wave) => ({
      ...wave, units: wave.units.map((unit, i) => ({ ...unit, x: eastEntries[i][0], z: eastEntries[i][1] })),
    }));
  }
  await writeFile(url, formatMap(map));
}

{
  const url = new URL('../data/levels/map_04_mansion.json', import.meta.url);
  const map = JSON.parse(await readFile(url, 'utf8'));
  // Collision traced from the approved 24x20 manor art (16px cells). The ground-floor hall reaches
  // the raised wings only by the painted staircases at (6-7,15-16) and (16-17,10-11); balustrades,
  // furniture, the throne and decorative vault treasure stay blocked.
  const plan = [
    '########################',
    '########################',
    '##########.##.####....##',
    '##.##..##......###....##',
    '#.....###......###....##',
    '###.#######..#######.###',
    '#......................#',
    '###.################.###',
    '###.######....######.###',
    '#....###........##....##',
    '#.##..#.........SS..####',
    '##....#.#......#SS....##',
    '##...##..........#....##',
    '###.###..........###.###',
    '#.....#..#....#..#...###',
    '#.....SS.........#.....#',
    '##....SS.......#.#....##',
    '#.....#..........#...###',
    '#.....#.........####..##',
    '########################',
  ];
  if (plan.length !== 20 || plan.some((row) => row.length !== 24)) throw new Error('Manor plan must be 24x20.');
  const tiles = plan.map((row) => [...row].map((cell) =>
    cell === '#' ? 'manor_block' : cell === 'S' ? 'manor_stairs' : 'manor_floor'));
  map.width = 24;
  map.height = 20;
  map.tiles = tiles;
  map.villageScene = { version: 1, layout: 'manor', artwork: 'hd' };
  map.lighting = 'night';
  map.spawn = { x: 11, z: 17 };
  map.exit = { x: 11, z: 18 };
  map.players = [
    { id: 'maria', ...map.spawn }, { id: 'bartz', x: 12, z: 17 }, { id: 'cypher', x: 10, z: 17 },
  ];
  // Twenty Merfolk guard the hall, wings, gallery and upper rooms; key carriers sit beside each chest route.
  const spots = [[9,10],[14,10],[10,12],[13,12],[14,15],
    [2,9],[4,11],[2,12],[3,15],
    [19,9],[21,11],[19,12],[20,15],[19,17],
    [5,6],[8,6],[15,6],[18,6],
    [5,3],[9,3],
    [9,15],[20,3],[14,3]];
  map.enemies = map.enemies.map((enemy, i) => enemy.id === 'killian'
    ? { ...enemy, x: 12, z: 3, level: 10 }
    : { ...enemy, x: spots[i][0], z: spots[i][1] });
  const treasures = { 'chest-axe': [18,2], 'chest-emblem': [20,2], 'chest-lancereaver': [2,17] };
  map.chests = map.chests.map((chest) => ({
    ...chest, x: treasures[chest.id][0], z: treasures[chest.id][1],
    ...(chest.id === 'chest-lancereaver' ? { rewardId: 'zanbato' } : {}),
  }));
  map.objects = [];
  map.decorativeHouses = [];
  map.extendEdges = map.forestEdges = false;
  map.noFence = true;
  delete map.groundRing;
  await writeFile(url, formatMap(map));
}

{
  const url = new URL('../data/levels/map_06_hollow_wood.json', import.meta.url);
  const map = JSON.parse(await readFile(url, 'utf8'));
  // Collision traced from the approved 48x21 Hollow Wood art (16px cells). Every walkable cell sits
  // inside the camera's visible trapezoid; canopy, the blood-stained channel, the monolith and camp
  // props stay blocked. The channel is crossed only by three log bridges (the north one is two logs
  // wide) and the den is entered through the north and south ridge gaps or the bramble thicket at the end of the monolith lane.
  // . trail  " undergrowth  * bramble thicket  = log bridge  anything else blocked
  const plan = [
    '###############~~###############################',
    '###############~~###############################',
    '###############~~###############################',
    '###############~~.##..#..#....##################',
    '#########......==...............################',
    '######"""".....==...#########...################',
    '#####......."""~~#############............######',
    '####.ttt..tt.""~~##################......"######',
    '####.ttt..tt...~~######.R.#########......."#####',
    '####..........#~~#####."R"....*****......#.#####',
    '#####....t.....==......"R"....******......"#####',
    '#####ttt....t..~~####.......*******......."#####',
    '#####ttt.f..t."~~##################.......######',
    '#####..........~~#############............######',
    '######""...."""~~##########.....###.......######',
    '######..".....#~~".##..........#################',
    '######.""......==..............#################',
    '######.""....##~~.....##########################',
    '###############~~###############################',
    '###############~~###############################',
    '###############~~###############################',
  ];
  if (plan.length !== 21 || plan.some((row) => row.length !== 48)) throw new Error('Hollow Wood plan must be 48x21.');
  const terrain = { '.': 'forest_trail', '"': 'forest_undergrowth', '*': 'forest_thicket', '=': 'forest_bridge' };
  map.width = 48;
  map.height = 21;
  map.tiles = plan.map((row) => [...row].map((cell) => terrain[cell] ?? 'forest_block'));
  map.villageScene = { version: 1, layout: 'forest', cursorBounds: [4, 3, 43, 17] };
  map.lighting = 'night';
  map.spawn = { x: 7, z: 10 };
  map.exit = { x: 38, z: 10 };
  // Seymour (if recruited in Chapter 5) is placed by deployTeam on the nearest free camp tile.
  map.players = [{ id: 'maria', ...map.spawn }, { id: 'bartz', x: 8, z: 10 }, { id: 'cypher', x: 7, z: 9 }];
  const wolf = (x, z, ai = 'guard') => ({ id: 'feral-wolf', level: 16, x, z, ai });
  map.enemies = [
    { id: 'great-wolf', level: 20, x: 38, z: 10, ai: 'guard', drop: 'alpha-fang' },
    // North and south path packs hunt; the monolith lane, ridge gaps and den hold until approached.
    ...[[18,4],[23,4],[27,3],[18,16],[22,16],[26,15]].map(([x, z]) => wolf(x, z, 'mobile')),
    ...[[21,10],[23,9],[26,10],[32,6],[32,13],[36,8],[36,12],[41,7]].map(([x, z]) => wolf(x, z)),
  ];
  // Finite pressure: north flank, south flank, then the rear hunter trail behind the camp.
  map.reinforcements = [
    { turn: 3, units: [wolf(21, 3, 'mobile'), wolf(28, 3, 'mobile')] },
    { turn: 5, units: [wolf(18, 17, 'mobile'), wolf(21, 17, 'mobile')] },
    { turn: 8, units: [wolf(6, 16, 'mobile'), wolf(6, 17, 'mobile'), wolf(24, 3, 'mobile')] },
  ];
  map.objects = [];
  map.decorativeHouses = [];
  map.extendEdges = map.forestEdges = false;
  map.noFence = true;
  delete map.trees;
  await writeFile(url, formatMap(map));
}

{
  const url = new URL('../data/levels/map_07_orders_camp.json', import.meta.url);
  const map = JSON.parse(await readFile(url, 'utf8'));
  // Collision traced from the approved 48x21 Order's Camp art (16px cells). The palisade, tents,
  // wagons and canopy stay blocked; the walls are crossed only at the west gate and the burned
  // breaches. Undergrowth marks the bracken around the southwest hunter trail.
  // . trail  " undergrowth  anything else blocked
  const plan = [
    '################################################',
    '################################################',
    '################################################',
    '##############...".#.###########################',
    '#########........"...###.###.###################',
    '######"""...###...#......###.###...#############',
    '####......."....#.."...............#############',
    '####.......".###.....##..............###########',
    '####.........##...########..##.###...###########',
    '####.........#....########.#....##..#...########',
    '##.........................#.###............####',
    '##................#####.....#..####.....########',
    '####."......."..#.#######....#..###...##########',
    '####".......""............##............########',
    '####"""....""".###.#....####............########',
    '####"""""....#.###...#######.######..###########',
    '#####""""............###########################',
    '####"""""...####################################',
    '################################################',
    '################################################',
    '################################################',
  ];
  if (plan.length !== 21 || plan.some((row) => row.length !== 48)) throw new Error("Order's Camp plan must be 48x21.");
  const terrain = { '.': 'forest_trail', '"': 'forest_undergrowth' };
  map.width = 48;
  map.height = 21;
  map.tiles = plan.map((row) => [...row].map((cell) => terrain[cell] ?? 'forest_block'));
  map.villageScene = { version: 1, layout: 'camp', cursorBounds: [2, 3, 43, 17] };
  map.lighting = 'night';
  map.spawn = { x: 7, z: 10 };
  map.exit = { x: 40, z: 10 };
  // Seymour (if recruited in Chapter 5) is placed by deployTeam on the nearest free tile.
  map.players = [{ id: 'maria', ...map.spawn }, { id: 'bartz', x: 8, z: 10 }, { id: 'cypher', x: 7, z: 9 }];
  map.houses = [
    house('tent-freeze', "Surgeon's Tent", 25, 4, 3, 2, 26, 6, 'freeze-staff'),
    house('tent-commander', "Commander's Tent", 29, 4, 3, 2, 30, 6, 'master-emblem'),
    house('tent-tonic', "Quartermaster's Tent", 24, 14, 4, 2, 24, 13, 'bloodroot-tonic'),
  ];
  const guard = (id, x, z) => ({ id, level: 12, x, z, ai: 'guard' });
  map.enemies = [
    { id: 'orsen', level: 20, x: 40, z: 10, ai: 'stationary', drop: 'orsen-journal' },
    ...[[16,9],[16,11],[24,5],[25,13],[23,10],[34,6],[38,9],[38,11]].map(([x, z]) => guard('order-cavalier', x, z)),
    ...[[17,7],[28,4],[28,13],[34,9],[30,12],[36,14]].map(([x, z]) => guard('order-archer', x, z)),
  ];
  const wolf = (x, z, level = 16) => ({ id: 'feral-wolf', level, x, z, ai: 'mobile' });
  const raven = (x, z) => ({ id: 'forest-raven', level: 12, x, z, ai: 'mobile' });
  // The pack gives chase from behind, Stark arrives on the north trail, two raven flights scout
  // for the Crowman, then the crows fall silent and he arrives on turn 11 at the west gate.
  map.reinforcements = [
    { turn: 3, units: [wolf(2, 10), wolf(2, 11), wolf(10, 17), wolf(11, 17)] },
    { turn: 4, units: [], allies: [{ id: 'stark', x: 15, z: 3 }] },
    { turn: 5, units: [wolf(15, 3, 17), wolf(16, 3, 17), wolf(10, 17, 17), wolf(11, 17, 17)] },
    { turn: 6, units: [raven(14, 3), raven(18, 3), raven(4, 17)] },
    { turn: 8, units: [raven(4, 6), raven(2, 11), raven(9, 17)] },
    { turn: 9, units: [], announce: 'crowOmen', sound: 'crow-omen',
      message: 'The crows fall silent. Something is following Maria...' },
    { turn: 11, units: [{ id: 'crowman', level: 25, x: 2, z: 10, ai: 'mobile', drop: 'covenant-emblem' }],
      announce: 'crowmanArrival', sound: 'crow-omen', message: 'The Crowman has found Maria.' },
  ];
  map.objects = [];
  map.decorativeHouses = [];
  map.extendEdges = map.forestEdges = false;
  map.noFence = true;
  delete map.trees;
  await writeFile(url, formatMap(map));
}