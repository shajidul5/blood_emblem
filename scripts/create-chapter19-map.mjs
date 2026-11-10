import { readFile, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const art = JSON.parse(await readFile(new URL('assets/tiles/Throne_Beneath_Stars/map-art.json', root), 'utf8'));
const tiles = Array.from({ length: art.height }, () => Array(art.width).fill('shore_sea'));
const paint = (x, z) => { tiles[z][x] = 'throne_road'; };
for (const r of art.roadRects) for (let z = r.z; z < r.z + r.depth; z++) {
  for (let x = r.x; x < r.x + r.width; x++) paint(x, z);
}
for (const path of art.roadPaths) for (let i = 1; i < path.points.length; i++) {
  const [a, b] = [path.points[i - 1], path.points[i]], radius = Math.floor(path.width / 2);
  for (let z = Math.min(a[1], b[1]) - radius; z <= Math.max(a[1], b[1]) + radius; z++) {
    for (let x = Math.min(a[0], b[0]) - radius; x <= Math.max(a[0], b[0]) + radius; x++) paint(x, z);
  }
}
const structures = [], props = [];
for (const p of art.placements) {
  if (['throne-sanctuary', 'mausoleum', 'scripture-hall'].includes(p.sprite)) {
    const width = p.sprite === 'throne-sanctuary' ? 6 : p.sprite === 'scripture-hall' ? 4 : 3;
    const depth = p.sprite === 'throne-sanctuary' ? 3 : 2;
    const s = { sprite: p.sprite, x: p.x - Math.floor(width / 2), z: p.z - depth, width, depth };
    for (let z = s.z; z < s.z + depth; z++) for (let x = s.x; x < s.x + width; x++) {
      if (tiles[z][x] === 'throne_building') throw new Error(`Overlapping structure at ${x},${z}`);
      tiles[z][x] = 'throne_building';
    }
    structures.push(s);
  } else {
    if (p.sprite === 'stairs') continue;
    props.push(p);
    if (p.sprite === 'worshipper') tiles[p.z][p.x] = 'throne_statue';
  }
}
const stairs = [];
for (const [z, lower, columns] of [[27, 0.8, [12, 21, 29]], [17, 2, [12, 21, 30]], [10, 3.2, [14, 21, 28]]]) {
  for (const x of columns) {
    stairs.push({ x, z, width: 2, depth: 3, lower });
    for (let dz = -1; dz <= 3; dz++) for (let dx = 0; dx < 2; dx++) {
      if (tiles[z + dz][x + dx] === 'throne_building' || tiles[z + dz][x + dx] === 'throne_statue') {
        throw new Error(`Stair landing obstructed at ${x + dx},${z + dz}`);
      }
      tiles[z + dz][x + dx] = dz >= 0 && dz < 3 ? 'throne_stairs' : 'throne_road';
    }
  }
}
for (const [x, z] of [[9, 17], [10, 17], [11, 17], [11, 18]]) tiles[z][x] = 'shore_sea';
tiles[7][22] = 'throne_seat';
const players = ['maria', 'rictor', 'bartz', 'cypher', 'seymour', 'stark', 'linus', 'lena', 'arlan', 'troy', 'eveline', 'corvis']
  .map((id, i) => ({ id, x: 19 + i % 6, z: 32 + Math.floor(i / 6) }));
const enemies = [];
const add = (id, x, z, extra = {}) => enemies.push({ id: `throne-${id}`, x, z, ...extra });
for (const [x, z] of [[19, 17], [25, 13], [14, 9], [29, 9]]) {
  add('scholar', x, z, { weaponId: 'luna' });
}
for (const [x, z] of [[14, 16], [19, 10]]) {
  add('confessor', x, z, { weaponId: 'nosferatu' });
}
for (const [x, z] of [[10, 12], [18, 7], [26, 7]]) add('cantor', x, z);
for (const [id, x, z] of [
  ['city-drowned', 11, 27], ['city-drowned', 14, 22], ['city-stalker', 29, 27],
  ['city-drowned', 29, 21], ['city-guardian', 14, 27], ['city-guardian', 29, 24],
  ['city-stalker', 29, 16], ['city-guardian', 25, 10], ['city-drowned', 7, 24],
  ['city-stalker', 36, 24], ['city-guardian', 30, 12],
]) enemies.push({ id, x, z, level: 30, ai: 'guard' });
for (const [x, z] of [[5, 28], [38, 28], [4, 21], [39, 21], [7, 15], [37, 15], [16, 5], [27, 5], [20, 20], [24, 20]]) add('raven', x, z);
add('vael', 22, 7);
const map = {
  name: art.name, width: art.width, height: art.height, objective: 'defeat-boss',
  leader: 'maria', requiredUnits: ['maria', 'rictor'], lighting: 'night', noFence: true,
  spawn: { x: 22, z: 33 }, exit: { x: 22, z: 8 }, tiles, players, enemies,
  reinforcements: [], chests: [], startingItems: [],
  abyssalThrone: { bossId: 'throne-vael', awakened: false, nextRuinTurn: 1, ruin: null,
    beats: ['receding', 'congregation', 'testament', 'emblem', 'silence'].map((id) => ({ id, seen: false })), structures, props, stairs },
};
await writeFile(new URL('data/levels/map_19_abyssal_throne.json', root), `${JSON.stringify(map, null, 2)}\n`);
console.log(`Created Chapter 19: ${structures.length} structures, ${enemies.length} enemies, ${players.length} allies.`);
