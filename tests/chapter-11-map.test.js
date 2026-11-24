import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { createServer } from 'vite';
import * as THREE from 'three';

let server, levels, tiles, grid, characters, inventory, saves, raw, mainSource;
const priorImage = Object.getOwnPropertyDescriptor(globalThis, 'Image');
const priorDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
const noop = () => {};
const key = ({ x, z }) => `${x},${z}`;

before(async () => {
  globalThis.Image = class {
    set src(value) {
      this.width = value.includes('ward-compact.png') ? 1512 : value.includes('ward.png') ? 1536 : 64;
      this.height = value.includes('ward-compact.png') ? 1008 : value.includes('ward.png') ? 1024 : 64;
      this.url = value;
      queueMicrotask(() => this.onload());
    }
  };
  const context = {
    drawImage() {}, fillRect() {}, strokeRect() {}, fillText() {}, strokeText() {},
    measureText: () => ({ width: 100 }),
    createRadialGradient: () => ({ addColorStop() {} }),
  };
  globalThis.document = { createElement: () => ({ getContext: () => context }) };
  server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: 'custom' });
  [levels, tiles, grid, characters, inventory, saves] = await Promise.all([
    '/src/levels/level.js', '/src/levels/tiles.js', '/src/battle/grid.js',
    '/src/characters/characters.js', '/src/characters/inventory.js', '/src/game/save.js',
  ].map((path) => server.ssrLoadModule(path)));
  raw = JSON.parse(await readFile(new URL('../data/levels/map_11_ward.json', import.meta.url), 'utf8'));
  mainSource = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
});

after(async () => {
  await server?.close();
  for (const [name, descriptor] of [['Image', priorImage], ['document', priorDocument]]) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete globalThis[name];
  }
});

function source(from, to) {
  const start = mainSource.indexOf(from), end = mainSource.indexOf(to, start);
  assert.ok(start >= 0 && end > start);
  return mainSource.slice(start, end);
}

function reachable(level, start) {
  const seen = new Set([key(start)]), queue = [start];
  for (let i = 0; i < queue.length; i++) {
    for (const direction of grid.DIRECTIONS) {
      const point = { x: queue[i].x + direction.x, z: queue[i].z + direction.z };
      if (seen.has(key(point)) || !grid.isWalkable(level, point.x, point.z)) continue;
      seen.add(key(point));
      queue.push(point);
    }
  }
  return seen;
}

test('native HD prison has live bars and exactly two chests, without duplicate tile or building art', async () => {
  const png = await readFile(new URL('../assets/maps/village/ward-compact.png', import.meta.url));
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [1512, 1008]);
  assert.deepEqual([raw.width, raw.height], [36, 24]);
  assert.equal(raw.villageScene.artwork, 'compact');
  assert.ok(raw.width * raw.height <= 48 * 32 * .57, 'at least 43% fewer tactical tiles');
  assert.equal(raw.cells.length, 2, 'only detention and evidence cells remain');
  const group = new THREE.Group(), level = levels.buildLevel(THREE, group, raw);
  const floor = group.getObjectByName('illustrated-ward');
  assert.ok(floor);
  assert.deepEqual(floor.material.map.repeat.toArray(), [1, 1]);
  assert.deepEqual(floor.material.map.offset.toArray(), [0, 0]);
  assert.equal(floor.material.map.magFilter, THREE.NearestFilter);
  assert.equal(floor.material.map.generateMipmaps, false);
  assert.equal(group.userData.houseMarkers.length, 1);
  assert.ok(level.cells.every((cell) => cell.mesh.visible === !cell.opened));
  assert.ok(level.chests.every((chest) => chest.mesh && chest.glow));
  assert.equal(group.children.filter((node) => node.isMesh).length,
    2 + level.cells.length + 2 + 1 + level.exitTiles.length);
  assert.ok(group.getObjectByName('ward-dark-surround'), 'no sky outside an underground prison');
  assert.equal(level.objects.length, 0);
  assert.throws(() => levels.validateLevel({ ...raw, houses: [], villageScene: undefined }), /metadata/);
  assert.throws(() => levels.validateLevel({ ...raw, width: 47 }), /dimensions|width/i);
});

test('all painted entrances align to exact native 42px collision columns with no fractional tiles', async () => {
  const manifest = JSON.parse(await readFile(new URL('../assets/maps/village/manifest.json', import.meta.url), 'utf8'));
  const art = manifest.images['ward-compact'];
  assert.equal(art.width / raw.width, 42);
  assert.equal(art.height / raw.height, 42);
  const doorways = [[7, 8], [17, 8], [28, 8], [17, 16], [28, 16]];
  assert.equal(art.entranceBounds.length, doorways.length);
  for (const [i, [x, z]] of doorways.entries()) {
    const [left, top, width, height] = art.entranceBounds[i];
    assert.equal(left, x * 42);
    assert.equal(width, 42);
    assert.ok(z * 42 + 21 >= top && z * 42 + 21 < top + height);
    assert.equal(raw.tiles[z][x], 'ward_floor');
    assert.equal(raw.tiles[z][x - 1], 'ward_block');
    assert.equal(raw.tiles[z][x + 1], 'ward_block');
    assert.equal(raw.tiles[z - 1][x], 'ward_floor');
    assert.equal(raw.tiles[z + 1][x], 'ward_floor');
  }
  const gate = await readFile(new URL('../assets/tiles/Quarantine_Ward/gate-hd.png', import.meta.url));
  assert.deepEqual([gate.readUInt32BE(16), gate.readUInt32BE(20)], art.cellGate.sourceCrop.slice(2));
  assert.equal(gate[25], 6, 'gate includes an alpha channel for its open bars');
});

test('Iron Sword replaces the katana without stat changes or loss of old save equipment', () => {
  const sword = inventory.INVENTORY_ITEMS.get('iron-sword');
  assert.ok(sword);
  assert.equal(sword.name, 'Iron Sword');
  assert.equal(inventory.INVENTORY_ITEMS.has('iron-katana'), false, 'no duplicate in menus or gallery');
  for (const [stat, value] of Object.entries({
    type: 'Sword', damageType: 'physical', might: 5, weight: 3, hit: 90,
    critical: 0, minRange: 1, maxRange: 1, sound: 'slash',
  })) assert.equal(sword[stat], value, stat);
  assert.equal(inventory.currentItemId('iron-katana'), 'iron-sword');
  assert.equal(inventory.createInventory(['iron-katana'])[0].id, 'iron-sword');
  const lena = Object.assign(characters.createLenaAlly(), raw.players[1]);
  assert.equal(lena.weapon.id, 'iron-sword');
  assert.equal(lena.inventory[0].id, 'iron-sword');
  const maria = characters.createMaria();
  const snapshot = saves.serializeUnit(lena);
  const entry = { id: 'iron-sword', uses: null };
  const save = saves.createSaveData(levels.validateLevel(raw), maria, [],
    { turn: 1, phase: 'player', defeated: false }, {
      chapter: 10, playerReserve: true, allies: [lena], convoy: [entry],
      chapterStart: { ...saves.serializeUnit(maria), allies: [snapshot], convoy: [entry] },
    });
  const legacy = JSON.stringify(save).replaceAll('iron-sword', 'iron-katana');
  const restored = saves.parseSave(legacy);
  assert.equal(restored.allies[0].equippedWeaponId, 'iron-sword');
  assert.equal(restored.allies[0].inventory[0].id, 'iron-sword');
  assert.equal(restored.convoy[0].id, 'iron-sword');
  assert.equal(restored.chapterStart.allies[0].equippedWeaponId, 'iron-sword');
  assert.equal(restored.chapterStart.allies[0].inventory[0].id, 'iron-sword');
  assert.equal(restored.chapterStart.convoy[0].id, 'iron-sword');
  inventory.restoreMariaInventory(lena, restored.allies[0].inventory, restored.allies[0].equippedWeaponId);
  assert.equal(lena.weapon, sword);
  assert.deepEqual(saves.parseSave(JSON.stringify(restored)).allies[0].inventory,
    restored.allies[0].inventory, 'export/reimport does not change item counts or uses');
});

test('Lena must free Rictor; evidence detour is optional; both corridor loops really connect', () => {
  const level = levels.validateLevel(raw), [rictor, lena] = level.players;
  assert.equal(level.leader, 'rictor');
  assert.deepEqual(level.requiredUnits, ['rictor', 'lena']);
  const outside = reachable(level, lena);
  assert.equal(outside.has(key(rictor)), false);
  assert.equal(outside.has(key(level.houses[0].door)), true);
  assert.equal(outside.has(key(level.exit)), true);
  assert.ok(level.chests.every((chest) => !outside.has(key(chest))));
  assert.equal(grid.distanceBetween(lena.x, lena.z, level.cells[0].door.x, level.cells[0].door.z), 1);
  level.cells[0].opened = true;
  const freed = reachable(level, rictor);
  assert.ok(freed.has(key(lena)));
  assert.ok(level.chests.every((chest) => !freed.has(key(chest))));
  // Closing either north-south flank still leaves a complete route.
  for (const [left, right] of [[4, 11], [22, 31]]) {
    const copy = structuredClone(level);
    for (let z = 11; z <= 13; z++) for (let x = left; x <= right; x++) copy.tileIds[z][x] = 'ward_block';
    assert.ok(reachable(copy, rictor).has(key(level.exit)));
  }
  for (const cell of level.cells) cell.opened = true;
  const all = reachable(level, lena);
  for (let z = 0; z < level.height; z++) for (let x = 0; x < level.width; x++) {
    if (grid.isWalkable(level, x, z)) assert.ok(all.has(`${x},${z}`), `connected ${x},${z}`);
    else if (level.tileIds[z][x] === 'ward_block')
      assert.equal(grid.isWalkable(level, x, z, { type: 'flying' }), false);
  }
  const positions = [...level.players, ...level.enemies, ...level.chests,
    ...level.cells.flatMap((cell) => cell.prisoners), level.houses[0].door];
  assert.equal(new Set(positions.map(key)).size, positions.length);
  for (const point of [...positions, ...level.exitTiles]) assert.ok(all.has(key(point)), key(point));
});

test('embedded 48x32 prison saves retain their old artwork, gate size and progress', () => {
  const legacy = structuredClone(raw);
  legacy.width = 48;
  legacy.height = 32;
  legacy.villageScene = { version: 1, layout: 'ward' };
  legacy.tiles = Array.from({ length: 32 }, () => Array(48).fill('ward_floor'));
  for (const house of legacy.houses) {
    for (let z = house.z; z < house.z + house.height; z++)
      for (let x = house.x; x < house.x + house.width; x++) legacy.tiles[z][x] = 'ward_block';
  }
  legacy.cells = [{ id: 'rictor-cell', door: { x: 6, z: 10 }, opened: true, prisoners: [] }];
  legacy.chests[0].opened = true;
  const group = new THREE.Group(), level = levels.buildLevel(THREE, group, legacy);
  assert.equal(level.width, 48);
  assert.equal(level.height, 32);
  assert.equal(level.villageScene.artwork, undefined);
  assert.match(group.getObjectByName('illustrated-ward').material.map.image.url, /ward\.png/);
  assert.equal(level.cells[0].mesh.visible, false);
  assert.ok(level.cells[0].mesh.geometry.parameters.height > 2);
  assert.equal(level.chests[0].opened, true);
  assert.throws(() => levels.validateLevel({ ...legacy, villageScene: { ...legacy.villageScene, artwork: 'compact' } }),
    /dimensions/);
});

test('all HD prison bars stand above their thresholds and project into the painted openings', () => {
  const expected = [
    [294, 330, 42, 48], [714, 666, 42, 48],
  ];
  const pixelsPerTile = 1512 / raw.width;
  const group = new THREE.Group(), level = levels.buildLevel(THREE, group, raw);
  group.updateMatrixWorld(true);
  for (const [index, cell] of level.cells.entries()) {
    const mesh = cell.mesh, box = new THREE.Box3().setFromObject(mesh);
    const vertices = mesh.geometry.attributes.position;
    const projected = Array.from({ length: vertices.count }, (_, i) => {
      const point = new THREE.Vector3().fromBufferAttribute(vertices, i).applyMatrix4(mesh.matrixWorld);
      return new THREE.Vector2(point.x, point.z - point.y * 10 / 14);
    });
    const projection = new THREE.Box2().setFromPoints(projected);
    const actual = [
      (projection.min.x + level.width / 2) * pixelsPerTile,
      (projection.min.y + level.height / 2) * pixelsPerTile,
      (projection.max.x - projection.min.x) * pixelsPerTile,
      (projection.max.y - projection.min.y) * pixelsPerTile,
    ];
    assert.ok(actual.every((value, i) => Math.abs(value - expected[index][i]) < .00001), `${cell.id}: ${actual}`);
    assert.equal(mesh.rotation.x, 0);
    assert.match(mesh.material.map.image.url, /gate-hd\.png/);
    assert.equal(mesh.material.map.magFilter, THREE.NearestFilter);
    assert.equal(mesh.material.map.generateMipmaps, false);
    assert.equal(mesh.material.color.getHex(), 0xffffff, 'new ironwork retains its authored colors');
    assert.ok(box.max.y - box.min.y >= 1.5 && box.max.y - box.min.y <= 1.65,
      'human-height gate, not an oversized two-tile wall');
    assert.ok(Math.abs(box.max.x - box.min.x - 1) < 1e-8, 'gate is exactly one tile wide');
    assert.ok(Math.abs(box.min.x - (cell.door.x - level.width / 2)) < 1e-8,
      'left gate edge exactly matches left collision edge');
    assert.ok(Math.abs(box.max.x - (cell.door.x + 1 - level.width / 2)) < 1e-8,
      'right gate edge exactly matches right collision edge');
    assert.ok(Math.abs(box.max.z - box.min.z) < .00001, 'door does not lean along the floor');
    assert.ok(Math.abs(box.min.y - .05) < .00001, 'base stays planted at the threshold');
    assert.equal(mesh.visible, !cell.opened);
    assert.equal(tiles.isLevelTileWalkable(level, cell.door.x, cell.door.z), cell.opened);
    assert.ok((cell.door.x + .5) * pixelsPerTile >= expected[index][0] &&
      (cell.door.x + .5) * pixelsPerTile <= expected[index][0] + expected[index][2],
      'blocking tile is centered inside the visible opening');
  }
  const restored = levels.buildLevel(THREE, new THREE.Group(), JSON.parse(JSON.stringify(level)));
  for (const [index, cell] of restored.cells.entries()) {
    assert.deepEqual(cell.mesh.position.toArray(), level.cells[index].mesh.position.toArray());
    assert.equal(cell.mesh.visible, !cell.opened);
  }
});

test('prison gates sort by moving ally and enemy feet, ignore opened gates, and restore materials on rebuild', () => {
  const group = new THREE.Group(), level = levels.buildLevel(THREE, group, raw);
  const gate = level.cells[0].mesh;
  const occlusion = group.userData.cellOcclusion;
  assert.ok(occlusion);
  assert.equal(gate.material.depthTest, false);
  assert.equal(gate.material.depthWrite, false);
  const camera = new THREE.PerspectiveCamera(32, 1, .1, 100);
  camera.position.set(gate.position.x, 14, gate.position.z + 10);
  camera.lookAt(gate.position.x, 0, gate.position.z);
  const image = { width: 16, height: 24, data: new Uint8Array(16 * 24 * 4).fill(255) };
  gate.material.map.image.data = new Uint8Array(
    gate.material.map.image.width * gate.material.map.image.height * 4).fill(255);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(.8, 1.15),
    new THREE.MeshBasicMaterial({ map: new THREE.Texture(image), alphaTest: .5 }));
  mesh.rotation.x = -Math.atan2(14, 10);
  mesh.position.set(gate.position.x, .7, gate.position.z + .5);
  mesh.renderOrder = 2;
  const unit = { hp: 25, x: 7, z: 9, mesh };
  occlusion.update([unit], unit, camera);
  assert.ok(mesh.renderOrder > gate.renderOrder, 'ally outside the cell draws above the gate');
  assert.equal(mesh.userData.cityOccluded, false);
  assert.equal(gate.material.opacity, 1);
  mesh.position.z = gate.position.z - .3;
  occlusion.update([unit], unit, camera);
  assert.ok(mesh.renderOrder < gate.renderOrder, 'interpolated position, not unchanged grid coordinates, controls layering');
  assert.equal(mesh.userData.cityOccluded, true);
  assert.equal(gate.material.opacity, .28, 'behind-gate units remain readable');
  occlusion.update([unit], null, camera);
  assert.equal(mesh.userData.cityOccluded, true, 'unselected enemies use the same ordering');
  gate.visible = false;
  occlusion.update([unit], unit, camera);
  assert.equal(mesh.userData.cityOccluded, false, 'opened gate never obscures a unit');
  gate.visible = true;
  mesh.position.z = gate.position.z + .5;
  occlusion.update([unit], unit, camera);
  assert.ok(mesh.renderOrder > gate.renderOrder);
  assert.equal(gate.material.opacity, 1, 'walking back in front clears the fade');
  levels.buildLevel(THREE, group, { ...raw, cells: [] });
  assert.equal(group.userData.cellOcclusion, undefined);
  assert.equal(mesh.material.transparent, false);
  assert.equal(mesh.material.depthTest, true);
  assert.equal(mesh.material.depthWrite, true);
  assert.equal(mesh.renderOrder, 2);
  assert.equal(mesh.children.length, 0, 'chapter changes dispose only the temporary contour');
  assert.match(mainSource, /levelGroup\.userData\.cellOcclusion\?\.update\(\s*\[\.\.\.defendingUnits\(\), \.\.\.enemies\]/,
    'actual frame updates layering for both factions after movement');
});

test('only two meaningful treasures share the locked evidence room, separate from the lance rack', () => {
  const level = levels.validateLevel(raw), evidence = level.cells.find((cell) => cell.id === 'evidence-room');
  assert.deepEqual(level.chests.map((chest) => chest.rewardId), ['bloodroot-tonic', 'hunters-codex']);
  assert.equal(evidence.opened, false);
  assert.equal(evidence.prisoners.length, 2);
  assert.ok(evidence.prisoners.every((unit) => unit.id === 'undead' && unit.x >= 14 &&
    unit.x <= 20 && unit.z >= 18 && unit.z <= 20), 'undead share the treasure cell');
  for (const chest of level.chests) {
    assert.ok(chest.x >= 14 && chest.x <= 20 && chest.z >= 18 && chest.z <= 20);
    assert.ok(inventory.INVENTORY_ITEMS.has(chest.rewardId));
  }
  assert.equal(level.houses.length, 1);
  assert.equal(level.houses[0].rewardId, 'vigil-lance');
  assert.ok(level.enemies.some((enemy) => enemy.id === 'rotten' && enemy.ai === 'guard' && enemy.z < 10));
  assert.ok(level.enemies.some((enemy) => enemy.id === 'undead' && enemy.ai === 'mobile'));
  assert.deepEqual(level.cells.map((cell) => cell.id), ['rictor-cell', 'evidence-room']);
  assert.ok(level.enemies.some((enemy) => enemy.drop === 'chest-key'));
  for (const placement of [...level.enemies, ...level.cells.flatMap((cell) => cell.prisoners)]) {
    const enemy = characters.createEnemyUnit(placement.id, placement.x, placement.z, placement);
    assert.ok(enemy.hp > 0);
    assert.equal(enemy.level, placement.level);
  }
});

test('Lena can sneak to the weapons rack outside the relocated soldier movement-plus-attack reach', () => {
  const level = levels.validateLevel(raw);
  const placement = level.enemies.find((enemy) => enemy.drop === 'chest-key');
  const soldier = characters.createEnemyUnit(placement.id, placement.x, placement.z, placement);
  const lena = Object.assign(characters.createLenaAlly(), level.players.find((unit) => unit.id === 'lena'));
  const rack = level.houses.find((house) => house.id === 'ward-equipment-rack');
  assert.equal(soldier.ai, 'guard');
  assert.equal(soldier.level, 9);
  const reach = grid.getMovementRange(soldier, level, []);
  const danger = new Set(reach.keys());
  for (const origin of reach.keys()) {
    const [x, z] = origin.split(',').map(Number);
    for (const direction of grid.DIRECTIONS) danger.add(`${x + direction.x},${z + direction.z}`);
  }
  const route = grid.findPath(lena, [rack.door], danger, level, lena);
  assert.ok(route.length > 1, 'rack is reachable without entering soldier threat');
  assert.deepEqual(route.at(-1), rack.door);
  assert.ok(route.every((point) => !danger.has(key(point))), 'every intermediate and stopping tile is safe');
  assert.ok(route.length - 1 <= lena.movement * 3, 'no lengthy detour: reach rack in at most three moves');
  assert.ok(!danger.has(key(level.spawn)), 'Rictor can wait safely in his cell');
  assert.ok(!danger.has(key(level.cells[0].door)), 'freeing Rictor does not engage the soldier');
});

test('real lock and rack actions consume actions, recover one lance and persist through actual saves', async () => {
  const level = levels.buildLevel(THREE, new THREE.Group(), raw);
  const rictor = Object.assign(characters.createRictorAlly(), level.spawn);
  rictor.inventory = rictor.inventory.filter((entry) => entry.id !== 'vigil-lance');
  rictor.weapon = null;
  const lena = Object.assign(characters.createLenaAlly(), level.players[1]);
  const context = {
    activeLevel: level, player: lena, gameState: { selected: true, phase: 'player', mode: 'unit' },
    houseHasReward: (await server.ssrLoadModule('/src/game/streets.js')).houseHasReward,
    hasLockpick: (unit) => unit.id === 'lena', distanceBetween: grid.distanceBetween,
    getFacing: grid.getFacing, setIdleSprite: noop, playDoorCreak: noop, setMessage: noop,
    renderTacticalUi: noop, wait: async () => {}, prisonerSilhouettes: [], saveCurrentGame: noop,
    finishUnit: noop, grantItem: inventory.grantItem, equipAttackWeapon: inventory.equipAttackWeapon,
    itemPopup: { show: async () => {} },
  };
  const lockAvailability = source('function cellAvailableToUnlock(unit)', '// Hunched prisoners');
  const unlock = source('async function unlockCell()', 'function stealTargets(unit)');
  await runInNewContext(`${lockAvailability}\n${unlock}\nunlockCell()`, context);
  assert.equal(level.cells[0].opened, true);
  assert.equal(level.cells[0].mesh.visible, false);
  assert.equal(lena.acted, true);
  assert.equal(lena.inventory.some((entry) => entry.id === 'chest-key'), false);

  const maria = characters.createMaria();
  const save = () => saves.parseSave(JSON.stringify(saves.createSaveData(level, maria, [],
    { turn: 1, phase: 'player', defeated: false },
    { chapter: 10, playerReserve: true, allies: [rictor, lena] })));
  const before = save();
  assert.equal(before.allies.find((unit) => unit.id === 'rictor').equippedWeaponId, null);
  assert.equal(before.level.cells[0].opened, true);
  Object.assign(rictor, level.houses[0].door, { acted: false });
  context.player = rictor;
  const visit = source('async function visitHouse()', '// Nearest free walkable tile');
  const available = source('function houseAvailableToVisit(unit)', 'async function openChest()');
  await runInNewContext(`${available}\n${visit}\nvisitHouse()`, context);
  assert.equal(rictor.weapon.id, 'vigil-lance');
  assert.equal(rictor.inventory.filter((entry) => entry.id === 'vigil-lance').length, 1);
  assert.equal(rictor.acted, true);
  assert.equal(level.houses[0].visited, true);
  rictor.acted = false;
  await runInNewContext('visitHouse()', context);
  assert.equal(rictor.inventory.filter((entry) => entry.id === 'vigil-lance').length, 1);
  level.chests.forEach((chest) => { chest.opened = true; });
  const after = save();
  assert.equal(after.level.houses[0].visited, true);
  assert.ok(after.level.chests.every((chest) => chest.opened));
  assert.equal(after.allies.find((unit) => unit.id === 'rictor').equippedWeaponId, 'vigil-lance');
  const group = new THREE.Group();
  levels.buildLevel(THREE, group, after.level);
  assert.ok(group.userData.houseMarkers.every((marker) => !marker.visible));
});

test('opening the treasure cell reveals its two undead once and preserves both chest rewards', async () => {
  const level = levels.buildLevel(THREE, new THREE.Group(), raw);
  const cell = level.cells.find((entry) => entry.id === 'evidence-room');
  const lena = Object.assign(characters.createLenaAlly(), { x: cell.door.x, z: cell.door.z - 1 });
  const context = {
    activeLevel: level, player: lena, gameState: { selected: true, phase: 'player', mode: 'unit' },
    hasLockpick: () => true, distanceBetween: grid.distanceBetween, getFacing: grid.getFacing,
    setIdleSprite: noop, playDoorCreak: noop, setMessage: noop, renderTacticalUi: noop,
    wait: async () => {}, saveCurrentGame: noop, finishUnit: noop, showCombatResult: noop,
    playHitImpact: noop, scene: { remove: noop }, enemies: [],
    createEnemy: (x, z, id, options) => characters.createEnemyUnit(id, x, z, options),
    prisonerSilhouettes: cell.prisoners.map((unit) => ({
      ...unit, cellId: cell.id, mesh: { material: { dispose: noop } },
    })),
  };
  await runInNewContext(`${source('function cellAvailableToUnlock(unit)', '// Hunched prisoners')}
    ${source('async function unlockCell()', 'function stealTargets(unit)')}\nunlockCell()`, context);
  assert.equal(cell.opened, true);
  assert.equal(cell.mesh.visible, false);
  assert.equal(context.enemies.length, 2);
  assert.ok(context.enemies.every((enemy) => enemy.ai === 'guard' && enemy.hp > 0));
  assert.equal(context.prisonerSilhouettes.length, 0);
  assert.equal(lena.acted, true);
  assert.ok(level.chests.every((chest) => !chest.opened && reachable(level, lena).has(key(chest))));
  lena.acted = false;
  await runInNewContext('unlockCell()', context);
  assert.equal(context.enemies.length, 2, 'reopening never duplicates prisoners');
});

test('compact prison zoom is closer without changing other chapters, and follows every walkable tile', async () => {
  const { constrainInteriorCamera } = await import('../src/game/camera-bounds.js');
  const cameraSource = source('  const compactWard =', '  const offset = CAM_OFFSET');
  const scaleFor = (activeLevel) => runInNewContext(`${cameraSource}\ncameraScale`, { activeLevel });
  const scale = scaleFor(raw);
  const normal = Math.max(.55, raw.width / 21, raw.height / 19);
  assert.ok(Math.abs(scale / normal - .88) < 1e-10);
  assert.equal(scaleFor({ ...raw, villageScene: { layout: 'ward' } }), normal);
  assert.equal(scaleFor({ ...raw, villageScene: { layout: 'infirmary' }, infirmary: {} }),
    Math.max(1.45, raw.width / 21, raw.height / 19));
  const offset = new THREE.Vector3(0, 14 * scale, 10 * scale);
  for (const aspect of [.6, 1.26, 16 / 9, 21 / 9]) {
    for (let z = 0; z < raw.height; z++) for (let x = 0; x < raw.width; x++) {
      if (raw.tiles[z][x] === 'ward_block') continue;
      const target = new THREE.Vector3(x + .5 - raw.width / 2, .8, z + .5 - raw.height / 2);
      const fov = constrainInteriorCamera(target, offset, aspect, raw.width, raw.height, 0, .01, true);
      const camera = new THREE.PerspectiveCamera(fov, aspect, .1, 200);
      camera.position.copy(target).add(offset);
      camera.lookAt(target);
      camera.updateMatrixWorld(true);
      for (const dx of [0, 1]) for (const dz of [0, 1]) {
        const point = new THREE.Vector3(x + dx - raw.width / 2, .01, z + dz - raw.height / 2).project(camera);
        assert.ok(Math.abs(point.x) < .97 && Math.abs(point.y) < .97,
          `tile ${x},${z} stays visible at aspect ${aspect}: ${point.toArray()}`);
      }
    }
  }
});

test('fresh and legacy prepared restarts confiscate only the ward lance, not later chapter equipment', () => {
  const prefix = source('function buildChapter(level,', '  for (const unit of Object.values(roster))');
  for (const [ward, carry] of [[true, null], [true, { prepared: false }], [true, { prepared: true }], [false, null]]) {
    const context = {
      level: raw, carry, FIRST_PREP_CHAPTER: 2,
      validateLevel: () => ({ villageScene: { layout: ward ? 'ward' : 'crossing' } }),
      hideTerminalScreen: noop, pinnedEnemyRanges: new Set(), resetTutorials: noop,
      setConvoy: noop, restoreInsight: noop, refreshInsightLabel: noop, applyUnitSnapshot: noop,
      pendingPrep: false, roster: {},
      THREE: {}, levelGroup: {}, buildLevel: (_, __, level) => level, ensureRosterMeshes: noop,
    };
    for (const id of ['maria', 'bartz', 'cypher', 'seymour', 'stark', 'linus', 'leon', 'serra', 'rictor', 'lena', 'arlan', 'troy', 'eveline', 'corvis']) {
      context[id] = {};
      context[`create${id[0].toUpperCase()}${id.slice(1)}${id === 'maria' ? '' : 'Ally'}`] =
        id === 'rictor' ? characters.createRictorAlly : () => ({});
    }
    runInNewContext(`${prefix}}\nbuildChapter(level, { chapter: 10, carry });`, context);
    assert.equal(context.rictor.inventory.some((entry) => entry.id === 'vigil-lance'), !ward);
    assert.equal(context.rictor.weapon === null, ward);
    assert.equal(context.rictor.inventory.some((entry) => entry.id === 'potion'), true);
    assert.equal(context.pendingPrep, !ward);
  }
});

test('Restart loads authored prison without editing embedded saves; both allies must reach stairs', async () => {
  const carry = { allies: ['rictor', 'lena'] };
  const embedded = { name: 'Old Ward', cells: [{ opened: true }], chests: Array(7).fill({ opened: true }) };
  const context = {
    activeLevel: embedded, currentChapter: 10, chapterStart: carry,
    loadChapterLevel: async (chapter, options) => {
      assert.equal(chapter, 10);
      assert.equal(options.reuseLoaded, true);
      return raw;
    },
    startLevel: async (map, options) => {
      assert.equal(await map(), raw);
      assert.equal(options.carry, carry);
      context.started = true;
    },
  };
  await runInNewContext(`${source('async function restartLevel()', 'async function startNextChapter()')}\nrestartLevel()`, context);
  assert.equal(context.started, true);
  assert.equal(embedded.cells[0].opened, true);
  assert.equal(embedded.chests.length, 7);
  context.activeLevel = levels.validateLevel(raw);
  context.playerTeam = [{ ...raw.exit, hp: 32 }, { ...raw.players[1], hp: 25 }];
  context.completeVictory = () => { context.won = true; };
  context.requiredUnits = () => context.playerTeam;
  const escape = source('function checkEscapeObjective()', 'function checkStreetObjective()');
  assert.equal(runInNewContext(`${escape}\ncheckEscapeObjective()`, context), false);
  Object.assign(context.playerTeam[1], raw.exitTiles[0]);
  assert.equal(runInNewContext('checkEscapeObjective()', context), true);
  assert.equal(context.won, true);
});

test('chapter restart reuses pristine authored data without another request or retaining failed-run state', async () => {
  const priorFetch = globalThis.fetch;
  let requests = 0;
  try {
    globalThis.fetch = async () => {
      requests++;
      return { ok: true, json: async () => structuredClone(raw) };
    };
    const first = await levels.loadChapterLevel(10);
    first.cells[0].opened = true;
    first.chests[0].opened = true;
    first.houses[0].visited = true;
    first.enemies.length = 0;
    globalThis.fetch = async () => { throw new Error('Server unavailable'); };
    for (let attempt = 0; attempt < 2; attempt++) {
      const restarted = await levels.loadChapterLevel(10, { reuseLoaded: true });
      assert.equal(restarted.cells[0].opened, false);
      assert.equal(restarted.chests[0].opened, false);
      assert.equal(restarted.houses[0].visited, false);
      assert.equal(restarted.enemies.length, raw.enemies.length);
      restarted.cells[0].opened = true;
      restarted.enemies.length = 0;
    }
    assert.equal(requests, 1);
    await assert.rejects(levels.loadChapterLevel(10), /Server unavailable/,
      'ordinary chapter loads still report network errors rather than silently falling back');
  } finally {
    globalThis.fetch = priorFetch;
  }
});

test('a stale chapter URL reports how to recover instead of parsing the title page as JSON', async () => {
  const priorFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({
      ok: true, headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }),
      json: () => { throw new Error('HTML must not be parsed as JSON'); },
    });
    await assert.rejects(levels.loadChapterLevel(10), /older build.*Reload/);
  } finally {
    globalThis.fetch = priorFetch;
  }
});
