import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';

let server;
let levels;
let tiles;
let rawMap;
const previousImage = Object.getOwnPropertyDescriptor(globalThis, 'Image');

before(async () => {
  globalThis.Image = class {
    set src(value) { this.url = value; queueMicrotask(() => this.onload()); }
  };
  server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: 'custom' });
  levels = await server.ssrLoadModule('/src/levels/level.js');
  tiles = await server.ssrLoadModule('/src/levels/tiles.js');
  rawMap = JSON.parse(await readFile(new URL('../data/levels/map_12_infirmary.json', import.meta.url), 'utf8'));
});

after(async () => {
  await server?.close();
  if (previousImage) Object.defineProperty(globalThis, 'Image', previousImage);
  else delete globalThis.Image;
});

const fresh = () => levels.validateLevel(structuredClone(rawMap));

function reachable(level, start, target) {
  const queue = [start];
  const visited = new Set([`${start.x},${start.z}`]);
  while (queue.length) {
    const tile = queue.shift();
    if (tile.x === target.x && tile.z === target.z) return true;
    for (const [x, z] of [[tile.x + 1, tile.z], [tile.x - 1, tile.z], [tile.x, tile.z + 1], [tile.x, tile.z - 1]]) {
      const key = `${x},${z}`;
      if (!visited.has(key) && tiles.isLevelTileWalkable(level, x, z)) {
        visited.add(key);
        queue.push({ x, z });
      }
    }
  }
  return false;
}

test('Chapter 12 registers a readable three-unit infirmary defense map', () => {
  const level = fresh();
  assert.equal(levels.CHAPTER_COUNT, 15);
  assert.ok(levels.LEVEL_OBJECTIVES.has('defend-infirmary'));
  assert.equal(level.objective, 'defend-infirmary');
  assert.deepEqual([level.width, level.height], [24, 20]);
  assert.equal(level.leader, 'rictor');
  assert.deepEqual(level.requiredUnits, ['rictor', 'lena', 'arlan']);
  assert.deepEqual(level.players.map(({ id }) => id), ['arlan', 'rictor', 'lena']);
  assert.equal(level.startingItems.includes('potion'), true);
  for (const player of level.players) {
    assert.ok(level.tiles[player.z][player.x]);
    assert.equal(tiles.isLevelTileWalkable(level, player.x, player.z), true);
  }
  assert.equal(level.infirmary.defendTurns, 8);
  assert.deepEqual(level.infirmary.defensePoint, { x: 12, z: 14 });
  assert.equal(level.infirmary.completionExp, 100);
  assert.equal(level.infirmary.interactionExp, 60);
  assert.equal(level.infirmary.survivedTurns, 0);
  assert.equal(level.infirmary.rewardsClaimed, false);
  assert.equal(level.infirmary.breached, false);
});

test('the open gates permit a northern flank to Lena’s ledger side room', () => {
  const level = fresh();
  const lena = level.players.find(({ id }) => id === 'lena');
  const ledger = level.infirmary.ledger;
  assert.equal(tiles.isLevelTileWalkable(level, 6, 10), true);
  assert.ok(reachable(level, lena, ledger));
  for (const gate of level.infirmary.gates) gate.closed = true;
  for (const gate of level.infirmary.gates) {
    const block = gate.blocks[0];
    assert.equal(tiles.isLevelTileWalkable(level, block.x, block.z), false);
  }
  assert.ok(reachable(level, lena, ledger), 'the side room remains reachable around the sealed approach');
});

test('recovery wards are enclosed and reached through distinct southern doorways', () => {
  const level = fresh();
  assert.equal(level.extendEdges, false);
  for (const [patient, door] of [[level.infirmary.patients[0], { x: 3, z: 6 }], [level.infirmary.patients[1], { x: 20, z: 6 }]]) {
    assert.ok(tiles.isInfirmaryRecoveryWard(patient.x, patient.z));
    assert.equal(level.tileIds[door.z][door.x], 'mans_door_open');
    assert.ok(reachable(level, level.players[0], door));
    assert.ok(reachable(level, door, patient));
    assert.equal(tiles.isLevelTileWalkable(level, patient.x, 0), false);
    const nearestStart = Math.min(...level.players.map((unit) => Math.abs(unit.x - patient.x) + Math.abs(unit.z - patient.z)));
    assert.ok(nearestStart >= 10, `${patient.name} is at least two moves from the party`);
    assert.ok(level.enemies.some((enemy) => enemy.ai === 'guard' &&
      Math.abs(enemy.x - patient.x) + Math.abs(enemy.z - patient.z) <= 2), `${patient.name}'s ward is threatened`);
  }
  assert.equal(level.tileIds[14][12], 'mans_door_open');
  assert.equal(tiles.isLevelTileWalkable(level, 11, 14), false);
  assert.equal(tiles.isLevelTileWalkable(level, 13, 14), false);
  assert.ok(level.objects.filter((object) => object.id === 'infirmary_bed').length >= 4);
  assert.equal(level.objects.some((object) => object.id === 'infirmary_bed' && object.x === 18 && object.z === 3), false);
  const mara = level.infirmary.patients.find((patient) => patient.id === 'patient-mara');
  assert.ok(level.objects.some((object) => object.id === 'infirmary_bed' && object.x === mara.x && object.z === mara.z));
});

test('wave metadata, occupied spawn cells, and one-time patient rewards survive validation', () => {
  const level = fresh();
  assert.deepEqual(level.reinforcements.map(({ turn, entranceId }) => [turn, entranceId]), [
    [2, 'west'], [3, 'east'], [4, 'west'], [5, 'east'], [6, 'theater'], [7, 'carriage'], [8, 'carriage'],
  ]);
  assert.equal(level.enemies.length + level.reinforcements.reduce((count, wave) => count + wave.units.length, 0), 24);
  assert.equal(level.reinforcements.flatMap((wave) => wave.units).filter(({ id }) => id === 'infirmary-rider').length, 2);
  assert.equal(level.reinforcements.find(({ turn }) => turn === 6).units.find(({ id }) => id === 'rotten').level, 15);
  assert.deepEqual(level.infirmary.patients.map(({ rewardId }) => rewardId), ['potion', 'bloodroot-tonic']);
  assert.ok(level.enemies.every(({ x, z }) =>
    Math.abs(x - level.infirmary.defensePoint.x) + Math.abs(z - level.infirmary.defensePoint.z) > 6));

  level.infirmary.gates[0].closed = true;
  level.infirmary.ledger.collected = true;
  level.infirmary.patients[0].rescued = true;
  level.infirmary.survivedTurns = 3;
  const restored = levels.validateLevel(level);
  assert.equal(restored.infirmary.gates[0].closed, true);
  assert.equal(restored.infirmary.ledger.collected, true);
  assert.equal(restored.infirmary.patients[0].rescued, true);
  assert.equal(restored.infirmary.survivedTurns, 3);
  assert.equal(restored.reinforcements[4].entranceId, 'theater');
});

test('isolation controls and both gate passages are reachable from the central hall', () => {
  const level = fresh();
  const start = level.players.find((unit) => unit.id === 'lena');
  for (const gate of level.infirmary.gates) {
    assert.ok(reachable(level, start, gate), gate.name);
    assert.ok(reachable(level, start, gate.blocks[0]), `${gate.name} open passage`);
  }
  assert.equal(level.tileIds[10][16], 'mans_floor_oak_a');
});

test('infirmary supplies come from patients and a single reachable undead key carrier, without chests or a duplicate service door', () => {
  const level = fresh();
  assert.deepEqual(level.chests, []);
  const carriers = [...level.enemies, ...level.reinforcements.flatMap((wave) => wave.units)]
    .filter((enemy) => enemy.drop === 'chest-key');
  assert.equal(carriers.length, 1);
  assert.equal(carriers[0].id, 'undead');
  assert.ok(level.enemies.includes(carriers[0]), 'the key is available before reinforcements');
  assert.ok(reachable(level, level.players[0], carriers[0]));
  const restored = levels.validateLevel(JSON.parse(JSON.stringify(level)));
  assert.equal(restored.enemies.find((enemy) => enemy.drop === 'chest-key').id, 'undead');
  const door = level.infirmary.defensePoint;
  assert.equal(level.tileIds[door.z][door.x], 'mans_door_open');
  assert.equal(level.objects.some((object) => object.x === door.x && object.z === door.z), false);
});

test('door orientation follows wall runs, including one-sided central jambs and mirrored east doors', () => {
  const level = fresh();
  for (const [x, z] of [[3, 6], [20, 6], [10, 10], [14, 10], [12, 14], [11, 0], [12, 0], [10, 19], [11, 19], [12, 19]]) {
    assert.deepEqual(tiles.infirmaryDoorOrientation(level, x, z), { direction: 'front', mirrored: false }, `${x},${z}`);
  }
  assert.deepEqual(tiles.infirmaryDoorOrientation(level, 6, 10), { direction: 'side', mirrored: false });
  assert.deepEqual(tiles.infirmaryDoorOrientation(level, 17, 10), { direction: 'side', mirrored: true });
  for (const z of [9, 10, 11]) {
    assert.deepEqual(tiles.infirmaryDoorOrientation(level, 0, z), { direction: 'side', mirrored: false });
    assert.deepEqual(tiles.infirmaryDoorOrientation(level, 23, z), { direction: 'side', mirrored: true });
  }
});

test('infirmary rules reject malformed coordinates and state types', () => {
  const missingRules = structuredClone(rawMap);
  missingRules.infirmary = null;
  assert.throws(() => levels.validateLevel(missingRules), /requires infirmary rules/i);

  const badGate = structuredClone(rawMap);
  badGate.infirmary.gates[0].blocks[0].x = 24;
  assert.throws(() => levels.validateLevel(badGate), /coordinate|gate/i);

  const badProgress = structuredClone(rawMap);
  badProgress.infirmary.survivedTurns = -1;
  assert.throws(() => levels.validateLevel(badProgress), /survivedTurns/i);

  const badWave = structuredClone(rawMap);
  badWave.reinforcements[0].entranceId = '';
  assert.throws(() => levels.validateLevel(badWave), /reinforcements/i);
});

test('scene mesh references never persist in infirmary rules', () => {
  const legacy = structuredClone(rawMap);
  legacy.infirmary.ledger.mesh = { stale: 'scene reference' };
  legacy.infirmary.patients[0].mesh = { stale: 'scene reference' };
  const level = levels.validateLevel(legacy);
  Object.defineProperty(level.infirmary.ledger, 'mesh', { value: { current: 'scene reference' }, configurable: true });
  Object.defineProperty(level.infirmary.patients[0], 'mesh', { value: { current: 'scene reference' }, configurable: true });

  const savedRules = JSON.stringify(level.infirmary);
  assert.equal(savedRules.includes('"mesh"'), false);
  assert.equal(Object.keys(level.infirmary.ledger).includes('mesh'), false);
  assert.equal(Object.keys(level.infirmary.patients[0]).includes('mesh'), false);
});
