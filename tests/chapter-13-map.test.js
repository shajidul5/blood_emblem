import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { inflateSync } from 'node:zlib';
import { runInNewContext } from 'node:vm';
import { createServer } from 'vite';
import * as THREE from 'three';
import { STREET_CAMERA_PADDING } from '../src/game/camera-bounds.js';

let server, levels, tiles, characters, rawMap, legacyMap, story;
const profiles = new Map();
const weapons = new Map();
const previousImage = Object.getOwnPropertyDescriptor(globalThis, 'Image');
const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');

before(async () => {
  const buildingSizes = new Map(await Promise.all(
    ['complete_townhouse.png', 'complete_shop.png', 'complete_apothecary.png'].map(async (name) => {
      const png = await readFile(new URL(`../assets/tiles/Cathedral_Streets/${name}`, import.meta.url));
      return [name, { width: png.readUInt32BE(16), height: png.readUInt32BE(20) }];
    }),
  ));
  globalThis.Image = class {
    set src(value) {
      const size = [...buildingSizes].find(([name]) => value.includes(name))?.[1];
      this.width = value.includes('clocktower') ? 59 : value.includes('gothic_row_house') ? 86
        : value.includes('gothic_shuttered_shop') ? 112 : value.includes('gas_lamp') ? 32 : 96;
      this.height = value.includes('clocktower') ? 256 : value.includes('gothic_row_house') ? 161
        : value.includes('gothic_shuttered_shop') ? 169 : value.includes('gas_lamp') ? 80 : 112;
      if (size) Object.assign(this, size);
      if (value.includes('/streets.png')) this.width = this.height = 1232;
      if (value.includes('/streets-depth.png')) { this.width = 1232; this.height = 1496; }
      this.url = value;
      queueMicrotask(() => this.onload());
    }
  };
  server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: 'custom' });
  levels = await server.ssrLoadModule('/src/levels/level.js');
  tiles = await server.ssrLoadModule('/src/levels/tiles.js');
  characters = await server.ssrLoadModule('/src/characters/characters.js');
  rawMap = JSON.parse(await readFile(new URL('../data/levels/map_13_procession.json', import.meta.url), 'utf8'));
  legacyMap = JSON.parse(await readFile(new URL('./fixtures/streets-legacy.json', import.meta.url), 'utf8'));
  story = JSON.parse(await readFile(new URL('../data/tutorials/chapter-13.json', import.meta.url), 'utf8'));
  for (const id of new Set([...rawMap.enemies, ...rawMap.reinforcements.flatMap((wave) => wave.units)].map((enemy) => enemy.id))) {
    const profile = JSON.parse(await readFile(new URL(`../data/characters/${id}.json`, import.meta.url), 'utf8'));
    profiles.set(id, profile);
    weapons.set(profile.weaponId, JSON.parse(await readFile(new URL(`../data/weapons/${profile.weaponId}.json`, import.meta.url), 'utf8')));
  }
});

after(async () => {
  await server?.close();
  for (const [key, descriptor] of [['Image', previousImage], ['document', previousDocument]]) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
});

const fresh = () => levels.validateLevel(structuredClone(rawMap));
test('dimensional HD artwork preserves authored terrain, footprints and initial placements', () => {
  const map = structuredClone(rawMap);
  assert.deepEqual(map.villageScene, { version: 1, layout: 'streets', artwork: 'depth' });
  delete map.villageScene;
  delete map.streets.pressure;
  delete map.streets.raiders;
  map.houses[2].rewardId = legacyMap.houses[2].rewardId;
  map.houses[2].rewardCount = legacyMap.houses[2].rewardCount;
  map.reinforcements = map.reinforcements.slice(0, 1);
  assert.deepEqual(map, legacyMap);
  const restored = levels.validateLevel(JSON.parse(JSON.stringify(fresh())));
  assert.deepEqual(restored.villageScene, rawMap.villageScene);
  assert.equal(levels.validateLevel(legacyMap).villageScene, undefined);
});

test('one native HD illustration has square cells and pixel-measured one-cell entrances', async () => {
  const { villageLayout } = await server.ssrLoadModule('/src/levels/village-scene.js');
  const manifest = JSON.parse(await readFile(new URL('../assets/maps/village/manifest.json', import.meta.url), 'utf8'));
  const asset = manifest.images['streets-depth'];
  const png = await readFile(new URL('../assets/maps/village/streets-depth.png', import.meta.url));
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
  assert.deepEqual([width, height], [1232, 1496]);
  assert.deepEqual(villageLayout(fresh()).crop, [0, 264, width, 1232]);
  assert.deepEqual(manifest.layouts.streets.grid, [28, 28]);
  assert.equal(width / rawMap.width, asset.pixelCellSize);
  assert.equal((height - 264) / rawMap.height, 44);
  assert.equal(png[24], 8);
  assert.equal(png[25], 6);
  const chunks = [];
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset);
    if (png.toString('ascii', offset + 4, offset + 8) === 'IDAT')
      chunks.push(png.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  const rows = inflateSync(Buffer.concat(chunks)), stride = width * 4 + 1;
  const brightness = (x, y) => {
    assert.equal(rows[y * stride], 0);
    const index = y * stride + 1 + x * 4;
    return Math.max(...rows.subarray(index, index + 3));
  };
  for (const house of rawMap.houses) {
    const [x, y, w, h] = asset.entrances[house.id];
    assert.equal(w, 44);
    assert.equal(x, house.door.x * 44);
    assert.equal(x + w / 2, (house.door.x + .5) * 44);
    assert.equal(y + h, 264 + (house.door.z + .5) * 44);
    const crossSection = y + h - 25;
    assert.ok(brightness(x - 1, crossSection) >= 40, 'left stone jamb');
    assert.ok(brightness(x + w, crossSection) >= 40, 'right stone jamb');
    for (let column = x; column < x + w; column++)
      assert.ok(brightness(column, crossSection) < 40, '44 native dark doorway pixels');
  }
});

test('HD streets draw the whole map once with live objectives and no duplicate building or lamp assets', () => {
  const context = {
    drawImage() {}, fillRect() {}, strokeRect() {}, fillText() {},
    createRadialGradient() { return { addColorStop() {} }; },
  };
  globalThis.document = { createElement: () => ({ getContext: () => context }) };
  const group = new THREE.Group(), level = levels.buildLevel(THREE, group, rawMap);
  const art = group.getObjectByName('illustrated-streets');
  assert.match(art.material.map.image.url, /\/maps\/village\/streets-depth.png/);
  assert.deepEqual([art.geometry.parameters.width, art.geometry.parameters.height], [28, 34]);
  assert.equal(art.position.z, -3, 'six skyline rows are north of, not inside, the tactical grid');
  assert.equal(art.material.map.repeat.x, 1);
  assert.equal(art.material.map.repeat.y, 1);
  assert.equal(art.material.map.magFilter, THREE.NearestFilter);
  assert.equal(art.material.map.minFilter, THREE.NearestFilter);
  assert.equal(art.material.map.generateMipmaps, false);
  assert.ok(group.getObjectByName('streets-dark-surround'));
  assert.ok(group.getObjectByName('street-seize-controls'));
  assert.ok(group.getObjectByName('western-quarantine-warning-marker'));
  assert.ok(group.getObjectByName('southern-pursuit-warning-marker'));
  assert.equal(group.userData.streetTown, undefined);
  assert.equal(group.userData.streetLamps, undefined);
  assert.equal(group.getObjectByName('street-clocktower'), undefined);
  for (const house of level.houses) {
    assert.equal(group.getObjectByName(`street-visitable-${house.id}`), undefined);
    const marker = group.userData.houseMarkers.find((marker) => marker.userData.houseId === house.id);
    assert.ok(marker, 'Visit remains a live marker over the painted doorway');
    assert.equal(marker.position.x, house.door.x + .5 - level.width / 2);
    assert.equal(marker.position.z, house.door.z + .5 - level.height / 2);
    assert.equal(tiles.isLevelTileWalkable(level, house.door.x, house.door.z), true);
  }
  let illustrations = 0;
  group.traverse((node) => {
    assert.equal(Boolean(node.isPointLight), false);
    assert.equal(node.userData.footprint, undefined);
    assert.equal(Boolean(node.isInstancedMesh), false);
    if (node.material?.map?.image?.url?.includes('/maps/village/streets-depth.png')) illustrations++;
    assert.equal(Boolean(node.material?.map?.image?.url?.includes('/Cathedral_Streets/')), false);
  });
  assert.equal(illustrations, 1);
});

test('Restart Chapter reloads authored HD streets from either legacy or HD saves without losing chapter-start carry', async () => {
  const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  const source = main.slice(main.indexOf('async function restartLevel()'), main.indexOf('async function startNextChapter()'));
  const raidedMap = structuredClone(rawMap);
  raidedMap.houses[0].destroyed = true;
  raidedMap.streets.raiders.warned = true;
  raidedMap.reinforcements[3].spawnedCount = 1;
  for (const activeLevel of [legacyMap, rawMap, raidedMap]) {
    const chapterStart = { player: { id: 'rictor', level: 13 }, insight: 57, convoy: [{ id: 'potion' }] };
    let started = 0;
    const context = {
      activeLevel, currentChapter: 12, chapterStart,
      loadChapterLevel: async (chapter, options) => {
        assert.equal(chapter, 12);
        assert.equal(options.reuseLoaded, true);
        return rawMap;
      },
      startLevel: (map, options) => {
        started++;
        assert.equal(map, rawMap);
        assert.equal(options.chapter, 12);
        assert.equal(options.carry, chapterStart);
        assert.ok(map.houses.every((house) => !house.destroyed && !house.visited));
        assert.equal(map.streets.raiders.warned, false);
        assert.equal(map.reinforcements[3].spawnedCount, 0);
      },
    };
    await runInNewContext(`${source}\nrestartLevel()`, context);
    assert.equal(started, 1);
    const error = new Error('test map unavailable');
    context.loadChapterLevel = async () => { throw error; };
    context.console = { error: (_message, actual) => assert.equal(actual, error) };
    context.setLevelStatus = (message, failed) => {
      assert.match(message, /Could not restart Chapter 13: test map unavailable/);
      assert.equal(failed, true);
    };
    await runInNewContext('restartLevel()', context);
    assert.equal(started, 1, 'a failed reload never starts or overwrites the active game');
  }
});

test('the editor imports, edits and exports illustrated streets with encounter data intact', async () => {
  const editor = await readFile(new URL('../src/map-editor.js', import.meta.url), 'utf8');
  const { validateVillageScene, layoutTileIds } = await server.ssrLoadModule('/src/levels/village-scene.js');
  const { validateShipScene } = await server.ssrLoadModule('/src/levels/ship-scene.js');
  const legacyMapping = editor.slice(editor.indexOf('const LEGACY_ATLAS_TILES ='), editor.indexOf('const canvas ='));
  const validators = editor.slice(editor.indexOf('function readCoordinate('), editor.indexOf('function setStatus('));
  const atlas = new Map(layoutTileIds('streets').map((id) => [id, tiles.getTileDef(id)]));
  const context = {
    rawMap: structuredClone(rawMap), ATLAS_TILES: atlas,
    SHIP_OBJECTS: new Map(), BLOCKING_OBJECTS: new Set(), shipTileset: { tileSize: 16 },
    validateShipScene, validateVillageScene, isLevelTileWalkable: tiles.isLevelTileWalkable,
    enemyMovementType: characters.enemyMovementType,
  };
  const edited = runInNewContext(`${legacyMapping}\n${validators}\nvalidateMap(rawMap)`, context);
  assert.deepEqual(levels.validateLevel(edited).tileIds, fresh().tileIds);
  assert.deepEqual(JSON.parse(JSON.stringify(edited.streets)), rawMap.streets);
  assert.deepEqual(JSON.parse(JSON.stringify(edited.houses)), rawMap.houses);
  assert.deepEqual(JSON.parse(JSON.stringify(edited.reinforcements)), rawMap.reinforcements);
  assert.match(editor, /\['streets', streetsArtUrl\]/);
  const html = await readFile(new URL('../map-editor.html', import.meta.url), 'utf8');
  assert.match(html, /option value="seize-streets"/);
  edited.tiles[15][6] = 'street_curb';
  const restored = levels.validateLevel(JSON.parse(JSON.stringify(edited)));
  assert.equal(restored.tileIds[15][6], 'street_curb');
  assert.equal(restored.villageScene.layout, 'streets');
  edited.houses[0].destroyed = true;
  edited.streets.raiders.warned = true;
  const raided = runInNewContext('validateMap(rawMap)', { ...context, rawMap: edited });
  assert.equal(levels.validateLevel(JSON.parse(JSON.stringify(raided))).houses[0].destroyed, true);
});

test('raided entrances replace Visit markers with centered wreckage without changing terrain', () => {
  const map = structuredClone(rawMap);
  map.houses[0].destroyed = true;
  map.streets.raiders.warned = true;
  const group = new THREE.Group();
  const level = levels.buildLevel(THREE, group, map);
  assert.equal(group.userData.houseRuins.length, 3);
  for (const [index, house] of level.houses.entries()) {
    const ruin = group.getObjectByName(`house-ruin-${house.id}`);
    const marker = group.userData.houseMarkers.find((item) => item.userData.houseId === house.id);
    assert.equal(ruin.visible, index === 0);
    assert.equal(marker.visible, index !== 0);
    assert.equal(ruin.children.length, 6);
    assert.equal(ruin.position.x, house.door.x + 0.5 - level.width / 2);
    assert.equal(ruin.position.z, house.door.z + 0.5 - level.height / 2);
    assert.ok(tiles.isLevelTileWalkable(level, house.door.x, house.door.z));
  }
  assert.ok(group.getObjectByName('street-raider-warning-3'));
  assert.ok(group.getObjectByName('street-raider-warning-22'));
  for (const mutate of [
    (value) => { value.houses[0].destroyed = 'yes'; },
    (value) => { value.houses[0].visited = true; },
    (value) => { value.streets.raiders.warningTurn = 7; },
    (value) => { value.reinforcements[3].turn = 6; },
    (value) => { value.reinforcements[3].units.pop(); },
  ]) {
    const invalid = structuredClone(map);
    mutate(invalid);
    assert.throws(() => levels.validateLevel(invalid), /house|raider/i);
  }
});

const keyOf = ({ x, z }) => `${x},${z}`;
const adjacent = ({ x, z }) => [{ x: x - 1, z }, { x: x + 1, z }, { x, z: z - 1 }, { x, z: z + 1 }];
const distance = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.z - b.z);
function distances(level, start, occupied = []) {
  const blocked = new Set(occupied.map(keyOf));
  const result = new Map([[keyOf(start), 0]]);
  const queue = [start];
  for (let index = 0; index < queue.length; index++) {
    const point = queue[index];
    for (const next of adjacent(point)) {
      const key = keyOf(next);
      if (result.has(key) || blocked.has(key) || !tiles.isLevelTileWalkable(level, next.x, next.z) ||
          level.objects.some((object) => object.blocksMovement && keyOf(object) === key)) continue;
      result.set(key, result.get(keyOf(point)) + 1);
      queue.push(next);
    }
  }
  return result;
}
function attackCoverage(level, enemy) {
  const profile = profiles.get(enemy.id);
  const weapon = weapons.get(enemy.weaponId ?? profile.weaponId);
  const result = new Set();
  for (const [key, cost] of distances(level, enemy)) {
    if (cost > (enemy.ai === 'stationary' ? 0 : profile.currentStats.movement)) continue;
    const [x, z] = key.split(',').map(Number);
    for (let tz = 0; tz < level.height; tz++) {
      for (let tx = 0; tx < level.width; tx++) {
        const range = distance({ x, z }, { x: tx, z: tz });
        if (range >= weapon.minRange && range <= weapon.maxRange) result.add(`${tx},${tz}`);
      }
    }
  }
  return result;
}

test('Chapter 13 registers four watch-route allies and a separate boss-then-seize objective', () => {
  const level = fresh();
  assert.equal(levels.CHAPTER_COUNT, 19);
  assert.ok(levels.LEVEL_OBJECTIVES.has('seize-streets'));
  assert.deepEqual([level.width, level.height], [28, 28]);
  assert.equal(level.objective, 'seize-streets');
  assert.equal(level.leader, 'rictor');
  assert.deepEqual(level.startingItems, [], 'Chapter 13 grants no automatic starting supplies');
  assert.deepEqual(level.players.map(({ id }) => id), ['rictor', 'lena', 'arlan', 'troy']);
  assert.deepEqual(level.requiredUnits, ['rictor', 'lena', 'arlan', 'troy']);
  assert.deepEqual(level.streets, {
    seizePoint: { x: 13, z: 2 }, bossId: 'veyr',
    raiders: rawMap.streets.raiders,
    pressure: rawMap.streets.pressure,
    recruit: { id: 'eveline', name: 'Eveline', x: 20, z: 16, recruiterId: 'rictor', recruited: false, dead: false, hp: 28 },
  });
  assert.equal(level.enemies.find(({ id }) => id === 'veyr').drop, 'master-emblem');
  assert.equal(level.enemies.find(({ id }) => id === 'veyr').ai, 'stationary');
});

test('every initial and reinforcement enemy instantiates at or above its profile base level', () => {
  const level = fresh();
  for (const placement of [...level.enemies, ...level.reinforcements.flatMap(({ units }) => units)]) {
    const profile = profiles.get(placement.id);
    assert.ok(placement.level >= profile.level, `${placement.id}: ${placement.level} >= ${profile.level}`);
    const enemy = characters.createEnemyUnit(placement.id, placement.x, placement.z, placement);
    assert.equal(enemy.id, placement.id);
    assert.equal(enemy.level, placement.level);
    assert.equal(enemy.ai, placement.ai);
    assert.deepEqual(enemy.stealable, placement.stealable);
    assert.equal(enemy.drop, placement.drop);
  }
});

test('extra undead pressure is staggered between the market, middle streets and warned turn-six wave', () => {
  const level = fresh();
  assert.equal(level.enemies.length, 19);
  const rotten = level.enemies.find(({ id }) => id === 'rotten');
  assert.deepEqual(rotten, { id: 'rotten', x: 9, z: 14, level: 15, ai: 'guard' });
  const range = attackCoverage(level, rotten);
  assert.ok(range.has('7,14'), 'the Rotten threatens the Bellkeeper door');
  assert.equal(range.has(keyOf(level.streets.recruit)), false);
  for (const player of level.players) assert.equal(range.has(keyOf(player)), false);
  for (const [x, z] of [[3, 12], [10, 16], [14, 11]]) {
    assert.ok(level.enemies.some((enemy) => enemy.id === 'undead' && enemy.level === 12 &&
      enemy.ai === 'mobile' && enemy.x === x && enemy.z === z));
  }
  assert.equal(level.enemies.filter(({ id }) => id === 'street-undead').length, 2);
  const wave = level.reinforcements[0];
  assert.equal(wave.turn, 6);
  assert.deepEqual(wave.units.map(({ id }) => id), ['undead', 'rotten', 'undead']);
  assert.match(story.streetsWarning.pages[0].paragraphs.join(' '), /Two undead and a Rotten/);
});

test('all roads, objectives, entrances and house doors share a single connected street network', () => {
  const level = fresh();
  const reachable = distances(level, level.spawn);
  for (let z = 0; z < level.height; z++) {
    for (let x = 0; x < level.width; x++) {
      if (tiles.isLevelTileWalkable(level, x, z)) {
        assert.ok(reachable.has(`${x},${z}`), `isolated road ${x},${z}`);
        assert.match(level.tileIds[z][x], /^ground_cobble_/);
      }
    }
  }
  for (const point of [level.streets.seizePoint, level.streets.recruit, ...level.houses.map(({ door }) => door),
    ...level.reinforcements.flatMap(({ units }) => units)]) {
    assert.ok(reachable.has(keyOf(point)), keyOf(point));
  }
  for (const house of [...level.houses, ...level.decorativeHouses]) {
    for (let z = house.z; z < house.z + house.height; z++) {
      for (let x = house.x; x < house.x + house.width; x++) {
        assert.equal(tiles.isLevelTileWalkable(level, x, z), false);
        assert.equal(tiles.isLevelTileWalkable(level, x, z, { type: 'flying' }), false);
      }
    }
  }
});

test('three accessible south-facing houses offer exactly the authored supplies', () => {
  const level = fresh();
  assert.deepEqual(level.houses.map(({ id, rewardId, rewardCount }) => [id, rewardId, rewardCount ?? 1]), [
    ['coachman', 'axereaver', 1], ['bellkeeper', 'armorslayer', 1], ['apothecary', 'silver-lance', 1],
  ]);
  assert.deepEqual(level.houses.map(({ x, z, width, height, door }) => [x, z, width, height, door]), [
    [5, 18, 4, 3, { x: 7, z: 21 }], [5, 11, 4, 3, { x: 7, z: 14 }], [19, 3, 4, 4, { x: 21, z: 7 }],
  ]);
  for (const house of level.houses) {
    assert.equal(house.door.z, house.z + house.height);
    assert.ok(adjacent(house.door).filter(({ x, z }) => tiles.isLevelTileWalkable(level, x, z)).length >= 2);
    house.visited = true;
  }
  assert.ok(levels.validateLevel(JSON.parse(JSON.stringify(level))).houses.every(({ visited }) => visited));
});

test('building blocks define narrow alleys and eliminate empty open street expanses', () => {
  const level = fresh();
  const roadCount = level.tileIds.flat().filter((id) => tiles.isTileWalkable(id)).length;
  assert.ok(roadCount <= 280, `${roadCount} road tiles exceeds the compact district budget`);
  const buildingArea = [...level.houses, ...level.decorativeHouses]
    .reduce((total, house) => total + house.width * house.height, 0);
  assert.ok(buildingArea >= 400, 'most non-playable space must read as occupied buildings, not empty paving');
  for (let z = 0; z < level.height - 4; z++) {
    for (let x = 0; x < level.width - 4; x++) {
      const square = Array.from({ length: 25 }, (_, i) =>
        tiles.isLevelTileWalkable(level, x + i % 5, z + Math.floor(i / 5)));
      assert.equal(square.every(Boolean), false, `empty 5x5 plaza at ${x},${z}`);
    }
  }
  for (const [x, z] of [[3, 12], [9, 12], [3, 19], [9, 19]]) {
    assert.ok(tiles.isLevelTileWalkable(level, x, z));
    assert.ok(tiles.isLevelTileWalkable(level, x + 1, z));
    assert.equal(tiles.isLevelTileWalkable(level, x - 1, z), false);
    assert.equal(tiles.isLevelTileWalkable(level, x + 2, z), false);
  }
});

test('Eveline has clear mounted space and real turn-two interception / turn-three Talk routes', () => {
  const level = fresh();
  const recruit = level.streets.recruit;
  for (const point of [recruit, ...adjacent(recruit)]) {
    assert.ok(tiles.isLevelTileWalkable(level, point.x, point.z));
    assert.equal(level.objects.some((object) => keyOf(object) === keyOf(point)), false);
    assert.equal(level.enemies.some((enemy) => keyOf(enemy) === keyOf(point)), false);
  }
  for (const [id, movement, expected] of [['troy', 7, 9], ['rictor', 5, 13]]) {
    const player = level.players.find((unit) => unit.id === id);
    const routes = distances(level, player, [...level.players.filter((unit) => unit !== player), ...level.enemies, recruit]);
    const shortest = Math.min(...adjacent(recruit).map((point) => routes.get(keyOf(point)) ?? Infinity));
    assert.equal(shortest, expected);
    assert.equal(Math.ceil(shortest / movement), id === 'troy' ? 2 : 3);
  }
  const troy = level.players.find(({ id }) => id === 'troy');
  assert.ok(distances(level, troy, [...level.enemies, recruit]).get('20,15') <= 14,
    'Troy can hold the north-adjacent tile by turn two, intercepting the incoming undead');
  for (const enemy of level.enemies.filter(({ id }) => id === 'street-undead')) {
    const path = distances(level, enemy, [recruit]);
    const approach = Math.min(...adjacent(recruit).map((point) => path.get(keyOf(point)) ?? Infinity));
    assert.equal(approach, 7);
    assert.equal(Math.ceil(approach / profiles.get(enemy.id).currentStats.movement), 3);
    const profile = profiles.get(enemy.id);
    const weapon = weapons.get(profile.weaponId);
    assert.ok(profile.currentStats.strength + weapon.might - 5 <= 8);
    assert.equal(weapon.critical, 0);
    assert.ok(28 - 2 * (profile.currentStats.strength + weapon.might - 5) > 0);
  }
});

test('combined movement-plus-attack coverage is safe at deployment and staggered on the rescue route', () => {
  const level = fresh();
  const coverage = new Map(level.enemies.map((enemy) => [enemy, attackCoverage(level, enemy)]));
  for (const player of level.players) {
    assert.equal([...coverage.values()].some((range) => range.has(keyOf(player))), false, player.id);
  }
  const avenue = level.enemies.filter((enemy) => ['ward-soldier', 'golden-archer'].includes(enemy.id) && enemy.z >= 14);
  assert.ok(avenue.filter((enemy) => coverage.get(enemy).has('14,18')).length >= 2,
    'visible overlapping avenue ranges reward the flank');
  const northern = level.enemies.filter((enemy) => enemy.z <= 10 && enemy.id !== 'street-undead' && enemy.id !== 'undead');
  for (const point of ['20,17', '20,16', '20,15']) {
    assert.equal(northern.filter((enemy) => coverage.get(enemy).has(point)).length, 0, point);
  }
  const rictor = level.players.find(({ id }) => id === 'rictor');
  const churchCoverage = new Map();
  for (const enemy of level.enemies.filter((enemy) => !['undead', 'street-undead'].includes(enemy.id))) {
    for (const key of coverage.get(enemy)) churchCoverage.set(key, (churchCoverage.get(key) ?? 0) + 1);
  }
  const blocked = [...churchCoverage].filter(([, count]) => count > 1).map(([key]) => {
    const [x, z] = key.split(',').map(Number);
    return { x, z };
  });
  assert.ok(distances(level, rictor, [...blocked, ...level.enemies, level.streets.recruit]).has('20,17'),
    'Rictor can reach Talk from the southern/eastern alternative without entering overlapping Church threat');
});

test('steal-only inventory and neutral HP, consumable uses and outcomes survive validation and JSON', () => {
  const level = fresh();
  const attendant = level.enemies.find(({ stealable }) => stealable);
  assert.deepEqual(attendant.stealable, ['master-emblem']);
  assert.equal(attendant.drop, undefined);
  attendant.stealable = [];
  level.streets.recruit.hp = 12;
  level.streets.recruit.inventory = [{ id: 'heal-staff', uses: 17 }, { id: 'potion', uses: 1 }];
  level.reinforcements[0].spawnedCount = 1;
  const restored = levels.validateLevel(JSON.parse(JSON.stringify(level)));
  assert.deepEqual(restored.enemies.find(({ x, z }) => x === 8 && z === 9).stealable, []);
  assert.deepEqual(restored.streets.recruit.inventory, level.streets.recruit.inventory);
  assert.notEqual(restored.streets.recruit.inventory[0], level.streets.recruit.inventory[0]);
  assert.equal(restored.streets.recruit.hp, 12);
  assert.equal(restored.reinforcements[0].spawnedCount, 1);
  for (const outcome of [{ recruited: true, dead: false, hp: 12 }, { recruited: false, dead: true, hp: 0 }]) {
    Object.assign(level.streets.recruit, outcome);
    assert.deepEqual(levels.validateLevel(level).streets.recruit, level.streets.recruit);
  }
});

test('street rules reject malformed recruitment, blocked coordinates and stealable inventories', () => {
  for (const mutate of [
    (map) => { map.villageScene.layout = 'unknown'; },
    (map) => { map.villageScene.artwork = 'unknown'; },
    (map) => { map.tiles[14] = `.${map.tiles[14].slice(1)}`; },
    (map) => { delete map.streets; },
    (map) => { map.streets.seizePoint = { x: 0, z: 0 }; },
    (map) => { map.streets.recruit.x = 19; map.streets.recruit.z = 4; },
    (map) => { map.streets.bossId = ''; },
    (map) => { map.streets.recruit.hp = -1; },
    (map) => { map.streets.recruit.recruited = 'yes'; },
    (map) => { map.streets.recruit.dead = true; },
    (map) => { map.streets.recruit.inventory = [{ id: 'potion', uses: -1 }]; },
    (map) => { map.enemies[0].stealable = 'master-emblem'; },
    (map) => { map.enemies[0].stealable = ['master-emblem', 'master-emblem']; },
    (map) => { map.reinforcements[0].units[0].stealable = [null]; },
  ]) {
    const map = structuredClone(rawMap);
    mutate(map);
    assert.throws(() => levels.validateLevel(map));
  }
});

test('the warnings name four finite, marked waves and all stories are registered', () => {
  const level = fresh();
  assert.equal(level.reinforcements.length, 4);
  assert.equal(level.reinforcements[0].turn, 6);
  assert.equal(level.reinforcements[0].entranceId, 'western-quarantine');
  assert.equal(level.reinforcements[0].units.length, 3);
  assert.equal(level.reinforcements[0].spawned, false);
  for (const id of ['streets', 'eveline', 'evelineLost', 'streetsWarning', 'streetsEnding',
    'streetPursuitWarning', 'streetPatrolAdvance', 'streetOfficerWarning', 'streetRaiderWarning', ...level.houses.map(({ id }) => id)]) {
    assert.ok(story[id]?.pages.length, id);
    assert.ok(story[id].pages.every(({ title, paragraphs }) => title && paragraphs?.length));
  }
  assert.match(JSON.stringify(story.streetsWarning), /Turn 5/);
});

test('dense streets use individual Gothic buildings, a blocked clocktower and curb lamps rather than a panorama', async () => {
  const context = {
    drawImage() {}, fillRect() {}, strokeRect() {}, fillText() {},
    createRadialGradient() { return { addColorStop() {} }; },
  };
  globalThis.document = { createElement() { return { width: 0, height: 0, getContext() { return context; } }; } };
  const group = new THREE.Group();
  const level = levels.buildLevel(THREE, group, legacyMap);
  assert.equal(group.userData.cityBackdrop, undefined);
  assert.equal(group.getObjectByName('clocktower-cathedral-skyline'), undefined);
  const clocktower = group.getObjectByName('street-clocktower');
  assert.equal(group.userData.clocktower, clocktower);
  const footprint = level.decorativeHouses.find((house) => house.style === 'clocktower');
  assert.equal(clocktower.position.x, footprint.x + footprint.width / 2 - level.width / 2);
  assert.equal(clocktower.position.z, footprint.z + footprint.height - level.height / 2);
  assert.ok(clocktower.geometry.parameters.height > 7, 'the tower is taller than the neighbouring houses');
  assert.ok(group.userData.streetTown.children.filter((child) => !child.isInstancedMesh)
    .every((child) => Math.abs(child.position.x) > 14 || Math.abs(child.position.z) > 14),
  'scenic border buildings stay outside the playable grid');
  for (const facade of group.userData.streetTown.children.filter((child) => !child.isInstancedMesh)) {
    assert.equal(facade.userData.uprightFacade, true, 'exterior houses render upright');
    assert.match(facade.material.map.image.url, /complete_shop/);
  }
  assert.equal(group.userData.streetCameraPadding, STREET_CAMERA_PADDING);
  const paving = group.userData.streetTown.children.find((child) => child.isInstancedMesh);
  assert.equal(paving.count, 44 * 44 - 28 * 28);
  assert.ok(group.userData.streetLamps.length >= 28);
  assert.equal(group.getObjectByName('cathedral-skyline-opaque-foundation'), undefined);
  for (const house of level.houses) {
    const facade = group.getObjectByName(`street-visitable-${house.id}`);
    assert.equal(facade.position.x, house.door.x + 0.5 - level.width / 2,
      'visitable front doors align with the marked door tile');
    assert.equal(facade.userData.uprightFacade, true, 'visitable houses render upright');
    assert.match(facade.material.map.image.url,
      house.style === 'apothecary' ? /complete_apothecary/ : /complete_townhouse/,
      'visitable houses use complete buildings with centered doors and a distinct apothecary');
  }
  const buildings = [];
  group.traverse((node) => { if (node.userData.footprint) buildings.push(node); });
  assert.ok(buildings.length >= 40, 'individual facades fill the blocked street blocks');
  for (const building of buildings) {
    const bounds = building.userData.footprint;
    const width = building.geometry.parameters.width;
    const tilt = Math.abs(building.rotation.x);
    const projectedDepth = building.geometry.parameters.height * Math.sin(tilt);
    if (building !== clocktower) assert.equal(building.userData.uprightFacade, true);
    if (building !== clocktower) assert.match(building.material.map.image.url, /complete_(townhouse|shop|apothecary)/);
    assert.ok(building.position.x - width / 2 >= bounds.x - level.width / 2);
    assert.ok(building.position.x + width / 2 <= bounds.x + bounds.width - level.width / 2);
    assert.ok(building.position.z - projectedDepth >= bounds.z - level.height / 2,
      `${building.name} must not cover the street behind it`);
    assert.ok(building.position.z <= bounds.z + bounds.height - level.height / 2);
    assert.equal(building.rotation.y, 0);
    assert.equal(building.material.depthWrite, true);
  }
  const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 200);
  camera.position.set(4, 21, 17);
  camera.lookAt(4, 0.8, 2);
  camera.updateMatrixWorld();
  const facades = [...buildings.filter((building) => building !== clocktower),
    ...group.userData.streetTown.children.filter((child) => !child.isInstancedMesh)];
  for (const facade of facades) {
    facade.onBeforeRender(null, null, camera);
    facade.updateMatrixWorld();
    const halfWidth = facade.geometry.parameters.width / 2;
    const height = facade.geometry.parameters.height;
    const corner = (x, y) => new THREE.Vector3(x, y, 0).applyMatrix4(facade.matrixWorld).project(camera);
    const left = corner(-halfWidth, 0);
    const leftTop = corner(-halfWidth, height);
    const right = corner(halfWidth, 0);
    assert.ok(Math.abs(left.x - leftTop.x) < 1e-8, `${facade.name}: vertical screen edges`);
    assert.ok(Math.abs(left.y - right.y) < 1e-8, `${facade.name}: level screen base`);
  }
  assert.ok(group.getObjectByName('western-quarantine-warning-marker'));
  assert.ok(group.getObjectByName('street-seize-controls'));
  assert.equal(level.width, 28);
  const lights = [];
  group.traverse((node) => { if (node.isPointLight) lights.push(node); });
  assert.equal(lights.length, 0);
  for (const lamp of group.userData.streetLamps) {
    const [, x, z] = /curb-lamp-(\d+)-(\d+)/.exec(lamp.name);
    assert.equal(tiles.isLevelTileWalkable(level, Number(x), Number(z)), false);
    assert.equal(tiles.isLevelTileWalkable(level, Number(x), Number(z), { type: 'flying' }), false);
    assert.equal(lamp.rotation.y, 0);
    assert.equal(lamp.scale.x, 1);
  }
  const ward = JSON.parse(await readFile(new URL('../data/levels/map_11_ward.json', import.meta.url), 'utf8'));
  levels.buildLevel(THREE, group, ward);
  for (const key of ['clocktower', 'streetTown', 'streetLamps', 'streetCameraPadding']) {
    assert.equal(group.userData[key], undefined, `${key} must not survive a chapter change`);
  }
});
