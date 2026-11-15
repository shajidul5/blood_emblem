import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { createServer } from 'vite';
import * as THREE from 'three';

let server, levels, terrain, grid, characters, inventory, combat, mainSource;
const priorImage = Object.getOwnPropertyDescriptor(globalThis, 'Image');
const priorDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
const files = ['map_03_fishing_village', 'map_04_mansion', 'map_05_escape'];
const readMap = async (file) => JSON.parse(await readFile(new URL(`../data/levels/${file}.json`, import.meta.url), 'utf8'));
const key = ({ x, z }) => `${x},${z}`;
const noop = () => {};

before(async () => {
  const context = {
    drawImage() {}, fillRect() {},
    createRadialGradient() { return { addColorStop() {} }; },
  };
  globalThis.document = { createElement: () => ({ getContext: () => context }) };
  globalThis.Image = class {
    set src(url) {
      const manor = url.includes('manor.png');
      const wide = url.includes('village.png');
      const forest = url.includes('forest.png') || url.includes('camp.png');
      this.width = forest ? 1536 : wide ? 768 : manor ? 384 : 512;
      this.height = forest ? 672 : wide ? 336 : manor ? 320 : 512;
      queueMicrotask(() => this.onload());
    }
  };
  server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: 'custom' });
  [levels, terrain, grid, characters, inventory, combat] = await Promise.all([
    server.ssrLoadModule('/src/levels/level.js'), server.ssrLoadModule('/src/battle/terrain.js'),
    server.ssrLoadModule('/src/battle/grid.js'),
    server.ssrLoadModule('/src/characters/characters.js'), server.ssrLoadModule('/src/characters/inventory.js'),
    server.ssrLoadModule('/src/battle/combat.js'),
  ]);
  mainSource = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
});
after(async () => {
  await server?.close();
  for (const [name, descriptor] of [['Image', priorImage], ['document', priorDocument]]) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete globalThis[name];
  }
});

function distances(level, start) {
  const queue = [start], result = new Map([[key(start), 0]]);
  for (let i = 0; i < queue.length; i++) {
    const { x, z } = queue[i];
    for (const point of [{ x: x-1, z }, { x: x+1, z }, { x, z: z-1 }, { x, z: z+1 }]) {
      if (result.has(key(point)) || !grid.isWalkable(level, point.x, point.z) ||
          !grid.canTraverseEdge(level, { x, z }, point)) continue;
      result.set(key(point), result.get(key(queue[i])) + 1);
      queue.push(point);
    }
  }
  return result;
}

for (const [index, file] of files.entries()) {
  test(`${file}: illustrated floor, all interactions and encounter placements are connected`, async () => {
    const raw = await readMap(file);
    const group = new THREE.Group();
    const level = levels.buildLevel(THREE, group, raw);
    const reachable = distances(level, level.spawn);
    for (const point of [
      ...level.players, ...level.enemies, ...level.exitTiles, ...level.chests,
      ...level.houses.map((house) => house.door), ...level.reinforcements.flatMap((wave) => wave.units),
    ]) assert.ok(reachable.has(key(point)), `${point.id ?? 'exit/door'} at ${key(point)} is reachable`);
    const floorCount = level.tileIds.flat().filter((id) => id.endsWith('_path') || id === 'manor_floor' || id === 'manor_stairs').length;
    assert.equal(reachable.size, floorCount, 'no disconnected painted walkable islands');
    assert.equal(level.enemies.length, [5,24,16][index]);
    assert.ok(group.getObjectByName(`illustrated-${raw.villageScene.layout}`));
    const artwork = group.getObjectByName(`illustrated-${raw.villageScene.layout}`);
    assert.equal(artwork.material.map.magFilter, THREE.NearestFilter);
    assert.equal(artwork.material.map.repeat.x, index === 0 ? .5 : 1, 'harbor includes the scenery beyond the playable boundary');
    assert.equal(terrain.getTileElevation(level, level.spawn.x, level.spawn.z), 0);
    assert.equal(group.userData.houseMarkers.length, level.houses.length);
    assert.equal(group.children.filter((mesh) => mesh.isMesh).length,
      1 + (raw.villageScene.layout === 'manor' ? 1 : 0) + level.houses.length + level.chests.length + (level.objective === 'escape' ? level.exitTiles.length : 0),
      'artwork is not covered with duplicate tile/building/prop geometry');
    for (const house of level.houses) {
      for (let z=house.z; z<house.z+house.height; z++)
        for (let x=house.x; x<house.x+house.width; x++)
          assert.equal(grid.isWalkable(level, x, z), false, 'no walking through roofs');
      house.visited = true;
    }
    for (const chest of level.chests) chest.opened = true;
    const restored = levels.validateLevel(JSON.parse(JSON.stringify(level)));
    assert.deepEqual(restored.villageScene, raw.villageScene);
    assert.ok(restored.houses.every((house) => house.visited));
    assert.ok(restored.chests.every((chest) => chest.opened));
    const rebuilt = new THREE.Group();
    levels.buildLevel(THREE, rebuilt, restored);
    assert.ok(rebuilt.userData.houseMarkers.every((marker) => !marker.visible));
    assert.ok(restored.chests.every((chest) => !Object.keys(chest).includes('mesh')), 'meshes do not enter saves');
  });
}

test('all original rewards, recruitment, key supply and reinforcement roles remain', async () => {
  const [harbor, manor, village] = await Promise.all(files.map(readMap));
  assert.deepEqual(harbor.houses.map((h) => [h.id,h.rewardId]), [
    ['fisher-cottage-1','potion'], ['fisher-cottage-2','thunder-tome'], ['fisher-cottage-3','zanbato'],
  ]);
  assert.deepEqual(manor.chests.map((c) => [c.id,c.rewardId]), [
    ['chest-axe','hand-axe'], ['chest-emblem','master-emblem'], ['chest-lancereaver','lancereaver'],
  ]);
  assert.equal(manor.enemies.filter((enemy) => enemy.drop === 'chest-key').length, 3);
  assert.ok(manor.enemies.some((enemy) => enemy.id === 'killian'));
  assert.deepEqual(village.houses.map((h) => [h.id,h.rewardId ?? h.recruitId]), [
    ['fishermans-house','hunter-pistol'], ['net-mender-house','master-emblem'], ['herbalist-house','seymour'],
  ]);
  assert.deepEqual(harbor.reinforcements.map((w) => [w.turn,w.units.length]),
    [[2,2],[4,2],[6,3],[8,2],[10,2]]);
  assert.equal(harbor.width,24);
  assert.equal(harbor.villageScene.playableWidth,21);
  assert.equal(harbor.height,21);
  assert.equal(harbor.enemies.length,5);
  assert.ok(harbor.enemies.every((enemy)=>enemy.id==='merfolk'&&enemy.z<=9));
  assert.ok(Math.max(...harbor.enemies.map((e)=>e.x))-Math.min(...harbor.enemies.map((e)=>e.x))>=10,
    'initial Merfolk are spread across the northern lanes');
  for (const wave of harbor.reinforcements)
    assert.deepEqual(wave.units.map(({id,x,z})=>[id,x+1,z+1]),[['merfolk',21,11],['merfolk',21,21],
      ...(wave.turn === 6 ? [['merfolk-chieftain',20,11]] : [])]);
  assert.ok(grid.isWalkable(levels.validateLevel(harbor), 19, 10), 'the chieftain arrives on the right-edge road');
  assert.equal(JSON.parse(await readFile(new URL('../data/characters/merfolk-chieftain.json', import.meta.url), 'utf8')).isBoss, true);
  assert.equal(village.objective, 'escape');
  assert.equal(village.exitTiles.length, 5, 'everyone, including Seymour, fits simultaneously');
  const escapeDistances = distances(levels.validateLevel(village), village.spawn);
  assert.ok(escapeDistances.get(key(village.exit)) >= 20, 'escape starts at the manor, not beside the forest exit');
  assert.equal(village.tiles[7][35], 'village_block', 'the painted gate lintel is not a spawn or floor cell');
  assert.equal(village.enemies.filter((enemy) => enemy.id === 'deep-merfolk').length, 2);
  assert.equal(village.reinforcements[0].turn, 10);
  assert.ok(village.reinforcements[0].units.every((unit) => unit.id === 'deep-merfolk' && unit.level === 21));
  assert.deepEqual(village.reinforcements[0].units.map(({ x, z }) => [x, z]), [[45, 10], [44, 15]],
    'turn-10 Deep Merfolk arrive from the east, not beside the exit lane');
  const exitSteps = distances(levels.validateLevel(village), village.exit);
  for (const unit of village.reinforcements[0].units)
    assert.ok(exitSteps.get(key(unit)) >= 30, `${key(unit)} is far from the forest exit`);
});

test('Cyrus starts next to Bartz and can reach Thunder safely before using its effectiveness', async () => {
  const level = levels.validateLevel(await readMap(files[0]));
  const house = level.houses.find((entry) => entry.rewardId === 'thunder-tome');
  const cyrus = level.players.find((unit) => unit.id === 'cypher');
  const bartz = level.players.find((unit) => unit.id === 'bartz');
  assert.equal(Math.abs(cyrus.x-bartz.x)+Math.abs(cyrus.z-bartz.z),1);
  const paths = distances(level, house.door);
  assert.equal(paths.get(key(cyrus)), 4);
  assert.ok(paths.get(key(cyrus)) <= characters.createCypherAlly().movement,'Cyrus can move to the door on turn one');
  const merfolkData = JSON.parse(await readFile(new URL('../data/characters/merfolk.json', import.meta.url), 'utf8'));
  assert.ok(level.enemies.every((enemy) => paths.get(key(enemy)) > merfolkData.currentStats.movement + 1),
    'Cyrus cannot be hit by a starting Merfolk immediately after visiting');
  const target = level.enemies.at(-1);
  const fromTarget = distances(level, target);
  const unit = characters.createCypherAlly();
  assert.ok([...paths].some(([tile, steps]) =>
    steps <= unit.movement && fromTarget.get(tile) >= 1 && fromTarget.get(tile) <= 2),
  'a subsequent Cyrus move can reach Thunder range');
  const thunder = inventory.INVENTORY_ITEMS.get('thunder-tome');
  inventory.grantItem(unit, thunder.id);
  inventory.equipAttackWeapon(unit, thunder);
  assert.equal(unit.weapon.id, thunder.id);
  const foe = characters.createEnemyUnit('merfolk', target.x, target.z);
  const dryFoe = { ...foe, type: 'infantry' };
  assert.ok(combat.getCombatDamage(unit, foe) > combat.getCombatDamage(unit, dryFoe), 'Thunder actually deals effective aqua damage');
});

test('village collision excludes painted roofs and doorstep equipment, and rewards use actual entrances', async () => {
  for (const file of [files[0], files[2]]) {
    const level = levels.validateLevel(await readMap(file));
    for (const [left, top, right, bottom, label] of [
      [11,4,11,5,'northern roof'],
      [12,3,14,6,'Netmaker roof and facade'],
      [5,9,6,9,'western cottage facade'],
      [11,16,12,16,'southern cottage roof under the old arrival row'],
      [11,17,13,20,'southern cottage roof and facade'],
      [14,15,16,15,'bucket and rock below the opposite cottage'],
      [15,16,16,16,'equipment grass island'],
    ]) {
      for (let z=top; z<=bottom; z++) for (let x=left; x<=right; x++)
        assert.equal(grid.isWalkable(level, x, z), false, `${label} at ${x},${z}`);
    }
    for (const unit of [...level.players, ...level.enemies]) {
      const sourceX = unit.x * 16 + 8, sourceY = unit.z * 16 + 8;
      assert.ok(!(sourceX >= 184 && sourceX < 224 && sourceY >= 256 && sourceY < 336),
        `${unit.id} does not spawn on the southern cottage artwork`);
    }
  }
  const harbor = levels.validateLevel(await readMap(files[0]));
  const mage = harbor.houses.find((house) => house.rewardId === 'thunder-tome');
  assert.deepEqual(mage.door, { x: 17, z: 14 });
  assert.equal(mage.door.x, mage.x - 1, 'visit the visible side door of the right-hand cottage, not front windows');
  assert.ok(mage.door.z >= mage.z && mage.door.z < mage.z + mage.height);
  const netmaker = harbor.houses.find((house) => house.rewardId === 'zanbato');
  assert.deepEqual(netmaker.door, { x: 13, z: 7 }, 'Zanbato uses the northern visible front door');
  assert.equal(netmaker.door.z, netmaker.z + netmaker.height);
});

test('lower cottage passage and bottom road form distinct ground routes for allies and Merfolk', async () => {
  for (const file of [files[0], files[2]]) {
    const level = levels.validateLevel(await readMap(file));
    const passage = [[12,14],[12,15],[13,15],[13,16],[14,16],[14,17],[15,17],[15,18]];
    for (const [x,z] of passage) assert.equal(grid.isWalkable(level,x,z), true, `open cottage passage ${x},${z}`);
    for (const z of [19,20]) for (let x=14; x<=Math.min(22,(level.villageScene.playableWidth ?? level.width)-1); x++)
      assert.equal(grid.isWalkable(level,x,z), true, `bottom road ${x},${z}`);
    const lowerOnly = { ...level, tileIds: level.tileIds.map((row,z) => row.map((tile) =>
      z < 17 ? 'village_block' : tile)) };
    const rightX=Math.min(22,(level.villageScene.playableWidth ?? level.width)-1);
    const reachable = distances(lowerOnly, { x: rightX, z: 20 });
    assert.ok(reachable.has('15,18'), 'eastern Merfolk reach the starting lane entirely along the bottom road');
    assert.ok(reachable.get('15,18') <= 12, 'the lower route is competitive with the northern detour');
    const enemy = characters.createEnemyUnit('merfolk',rightX,20);
    const blocked = new Set(['15,18','16,18','17,14']);
    const path = grid.findPath(enemy,[{x:15,z:17},{x:14,z:18},{x:15,z:19}],blocked,level);
    assert.ok(path.length > 1 && path.some((point)=>point.z===19) && path.every((point)=>point.z>=17),
      'the real enemy pathfinder chooses the bottom road to an attack position');
  }
});

test('right-edge arrivals queue at occupied tiles instead of teleporting, with no upper-left waves', async () => {
  const level = levels.validateLevel(await readMap(files[0]));
  assert.ok(level.reinforcements.every((wave)=>wave.units.every((unit)=>unit.x===20||unit.id==='merfolk-chieftain')));
  const context = {
    activeLevel: level, gameState: { turn: 2 }, enemies: [{ x:20,z:10,hp:20 }],
    defendingUnits: () => [], tileKey: (x,z) => `${x},${z}`,
    isWalkable: grid.isWalkable, infirmaryWaveSealed: () => false,
    courtyardWaveEnabled: () => true, cathedralWaveEnabled: () => true,
    distanceBetween: (x,z,cx,cz) => Math.abs(x-cx)+Math.abs(z-cz),
    infirmarySpawnTile: (level, placement, units) =>
      units.some((unit) => unit.hp > 0 && key(unit) === key(placement)) ? null : placement,
    createEnemy: (x,z,id) => ({x,z,id,hp:20}),
    levelGroup: {userData:{}},
  };
  const source = mainFunction('function spawnTurnReinforcements()', 'async function endPlayerPhase()');
  const result = runInNewContext(`${source}\nspawnTurnReinforcements()`, context);
  assert.equal(result.error, null);
  assert.equal(result.units.length,0,'blocked main spawns never teleport inland');
  assert.equal(level.reinforcements[0].spawnedCount, 0);
  context.enemies=[];
  const retry=runInNewContext('spawnTurnReinforcements()',context);
  assert.deepEqual(Array.from(retry.units,({x,z})=>[x,z]),[[20,10],[20,20]]);
});

test('ten-turn defense wins after enemy phase ten even with enemies and waves left, never on a wipe', async () => {
  const level = levels.validateLevel(await readMap(files[0]));
  assert.equal(level.objective, 'defend');
  assert.equal(level.defendTurns, 10);
  for (const defendTurns of [undefined,0,-1,1.5,100,'10'])
    assert.throws(() => levels.validateLevel({...level,defendTurns}), /Defense duration/);
  const restored = levels.validateLevel(JSON.parse(JSON.stringify(level)));
  assert.equal(restored.defendTurns, 10);
  const context = { activeLevel:restored, gameState:{turn:1,defeated:false}, enemies:[{hp:20}],
    frozenEnemies:[], setEnemyFrozen:noop, partyDefeated:()=>false, checkDefeatAllVictory:()=>false,
    completeVictory: (message) => {context.won=message;} };
  const source = mainFunction('function checkDefenseVictory(', 'function checkDefeatAllVictory()');
  const description = mainFunction('function objectiveDescription(', 'function heartrootBoss()');
  runInNewContext(`${source}\n${description}`, context);
  assert.match(runInNewContext('objectiveDescription()', context), /Defend for 10 turns.*1\/10/);
  for (let turn=1;turn<=10;turn++) {
    context.gameState.turn=turn;
    assert.equal(runInNewContext('checkDefenseVictory(gameState.turn - 1)', context), false, 'player phase does not finish early');
    const postPhase = mainSource.slice(mainSource.indexOf('  for (const enemy of frozenEnemies)'),
      mainSource.indexOf('  gameState.turn++;', mainSource.indexOf('  for (const enemy of frozenEnemies)')));
    await runInNewContext(`(async()=>{${postPhase}})()`, context);
    assert.equal(Boolean(context.won), turn===10, 'the real enemy-phase tail completes exactly on ten');
  }
  assert.equal(context.enemies.length, 1);
  assert.ok(restored.reinforcements.some((wave)=>!wave.spawned), 'pending or blocked waves do not prevent timed victory');
  context.gameState.defeated=true;
  assert.equal(runInNewContext('checkDefenseVictory(10)', context), false);
  context.gameState.defeated=false;
  context.partyDefeated=()=>true;
  assert.equal(runInNewContext('checkDefenseVictory(10)', context), false);
});

test('defense duration, turn and partial waves persist in real saves; legacy Chapter 3 objective upgrades on continue', async (t) => {
  const saves = await server.ssrLoadModule('/src/game/save.js');
  const descriptor = Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  const storage = new Map();
  globalThis.localStorage = {getItem:(key)=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)};
  t.after(()=>{
    if(descriptor) Object.defineProperty(globalThis,'localStorage',descriptor);
    else delete globalThis.localStorage;
  });
  const level = levels.validateLevel(await readMap(files[0]));
  level.reinforcements[0].spawnedCount=1;
  const player = Object.assign(characters.createMaria(),level.spawn);
  saves.writeSave(saves.createSaveData(level,player,[],{turn:9,phase:'player',defeated:false},{chapter:2}));
  const restored = saves.readSave();
  assert.equal(restored.turn,9);
  assert.equal(restored.level.objective,'defend');
  assert.equal(restored.level.defendTurns,10);
  assert.equal(restored.level.reinforcements[0].spawnedCount,1);
  const legacy = {...restored,turn:15,level:{...restored.level,objective:'defeat-all-enemies'}};
  delete legacy.level.defendTurns;
  const start = mainSource.indexOf('function continueGame()');
  const end = mainSource.indexOf('  activeLevel = buildLevel',start);
  const upgraded = runInNewContext(`${mainSource.slice(start,end)} return save; }\ncontinueGame()`,
    {refreshContinueButton:()=>legacy});
  assert.equal(upgraded.level.objective,'defend');
  assert.equal(upgraded.level.defendTurns,10);
  assert.equal(upgraded.turn,15,'turns and party state are not reset by migration');
});

test('restarting an illustrated Chapter 3 reloads the authored routes and waves with the original party snapshot', async () => {
  const updated = await readMap(files[0]);
  const originalParty = {units:['maria','bartz','cypher']};
  const context = {
    currentChapter:2, activeLevel:{villageScene:{layout:'harbor'},objective:'defeat-all-enemies'},
    chapterStart:originalParty,
    loadChapterLevel:async(chapter)=>{assert.equal(chapter,2);return updated;},
    startLevel:(level,options)=>{
      assert.equal(level,updated);
      assert.equal(options.carry,originalParty);
      assert.equal(options.chapter,2);
      context.started=true;
    },
  };
  const source = mainFunction('async function restartLevel()', 'async function startNextChapter()');
  await runInNewContext(`${source}\nrestartLevel()`, context);
  assert.equal(context.started,true);
});

function mainFunction(start, end) {
  const from = mainSource.indexOf(start), to = mainSource.indexOf(end, from);
  assert.ok(from >= 0 && to > from);
  return mainSource.slice(from, to);
}
function interactionContext(level, player) {
  const messages = [];
  return {
    activeLevel: level, player, gameState: { selected: true, phase: 'player' },
    playerTeam: [player], enemies: [], fullTeam: [player], roster: {},
    grantItem: inventory.grantItem, hasLockpick: () => false,
    setMessage: (message) => messages.push(message), messages,
    renderTacticalUi: noop, itemPopup: { show: noop }, tutorialPopup: { show: noop }, finishUnit: noop,
    levelGroup: new THREE.Group(),
  };
}
const visitCode = () => mainFunction('async function visitHouse()', '// Nearest free walkable tile');
const availabilityCode = () => mainFunction('function houseAvailableToVisit(unit)', 'async function openChest()');

test('real Visit flow grants each reward once, clears availability and persists across load', async () => {
  inventory.setConvoy([]);
  for (const file of [files[0], files[2]]) {
    const level = levels.validateLevel(await readMap(file));
    for (const house of level.houses.filter((h) => h.rewardId)) {
      const player = Object.assign(characters.createCypherAlly(), house.door, { acted: false, inventory: [] });
      const context = interactionContext(level, player);
      await runInNewContext(`${availabilityCode()}\n${visitCode()}\nvisitHouse()`, context);
      assert.equal(player.inventory.filter((item) => item.id === house.rewardId).length, 1);
      assert.equal(house.visited, true);
      assert.equal(player.acted, true);
      context.activeLevel = levels.validateLevel(JSON.parse(JSON.stringify(level)));
      player.acted = false;
      await runInNewContext('visitHouse()', context);
      assert.equal(player.inventory.filter((item) => item.id === house.rewardId).length, 1);
      assert.match(context.messages.at(-1), /unvisited house/);
    }
  }
});

test('real chest flow opens visible treasure with keys once and preserves its opened art', async () => {
  const level = levels.buildLevel(THREE, new THREE.Group(), await readMap(files[1]));
  const openCode = mainFunction('async function openChest()', '\nconst hasLockpick');
  for (const chest of level.chests) {
    const player = Object.assign(characters.createMaria(), { x: chest.x, z: chest.z, acted: false, inventory: [] });
    const context = interactionContext(level, player);
    await runInNewContext(`${availabilityCode()}\n${openCode}\nopenChest()`, context);
    assert.equal(chest.opened, false, 'locked without a key');
    player.inventory.push({ id: 'chest-key' });
    await runInNewContext('openChest()', context);
    assert.equal(chest.opened, true);
    assert.equal(chest.mesh.material.opacity, .35);
    assert.equal(chest.glow.intensity, 0);
    assert.ok(player.inventory.some((entry) => entry.id === chest.rewardId));
    assert.ok(!player.inventory.some((entry) => entry.id === 'chest-key'));
    player.acted = false;
    await runInNewContext('openChest()', context);
    assert.equal(player.inventory.filter((entry) => entry.id === chest.rewardId).length, 1);
  }
});

test('real house recruitment places Seymour on reachable floor and cannot recruit twice', async () => {
  const level = levels.validateLevel(await readMap(files[2]));
  const house = level.houses.find((h) => h.recruitId === 'seymour');
  const player = Object.assign(characters.createMaria(), house.door, { acted: false, hp: 20 });
  const recruit = { name: 'Seymour', hp: 0, maxHp: 20, mesh: new THREE.Object3D() };
  const context = {
    ...interactionContext(level, player), roster: { seymour: recruit },
    tileKey: (x,z) => `${x},${z}`, isWalkable: grid.isWalkable,
    distanceBetween: (x,z,cx,cz) => Math.abs(x-cx)+Math.abs(z-cz),
    worldX: (x) => x, worldZ: (z) => z, unitSpriteHeightAt: () => 0, setIdleSprite: noop,
  };
  const recruitment = mainFunction('function recruitSpawnTile(house)', '// ---------- Renderer');
  await runInNewContext(`${availabilityCode()}\n${recruitment}\n${visitCode()}\nvisitHouse()`, context);
  assert.ok(distances(level, level.spawn).has(key(recruit)));
  assert.notEqual(key(recruit), key(player));
  assert.equal(recruit.hp, recruit.maxHp);
  assert.equal(context.playerTeam.length, 2);
  player.acted = false;
  await runInNewContext('visitHouse()', context);
  assert.equal(context.playerTeam.length, 2);
});

test('illustrated metadata is required while legacy embedded village saves still render', async () => {
  const raw = await readMap(files[0]);
  const wide = {...raw,villageScene:{version:1,layout:'harbor'}};
  const wideGroup = new THREE.Group();
  const oldHarbor = levels.buildLevel(THREE,wideGroup,wide);
  assert.equal(oldHarbor.width,24,'embedded 24-column saves remain valid');
  assert.equal(wideGroup.getObjectByName('illustrated-harbor').material.map.repeat.x,.5,'old saves keep their original crop');
  assert.throws(() => levels.validateLevel({ ...raw, houses: [], villageScene: undefined }), /villageScene/);
  assert.throws(() => levels.validateLevel({ ...raw, villageScene: { version: 1, layout: 'mansion' } }), /fixed artwork/);
  assert.throws(() => levels.validateLevel({ ...raw, houses: raw.houses.map((h) => ({ ...h, width: 0 })) }), /houses/);
  const legacy = { ...raw, villageScene: undefined, decorativeHouses: [],
    houses: [{ id: 'legacy-house', name: 'Legacy Cottage', x: 5, z: 5, width: 3, height: 2,
      door: { x: 6, z: 7 }, rewardId: 'potion' }],
    tiles: raw.tiles.map((row) => row.map(() => 'deck_a')) };
  for (let z = 5; z < 7; z++) for (let x = 5; x < 8; x++) legacy.tiles[z][x] = 'bulkhead_v';
  const group = new THREE.Group();
  assert.equal(levels.buildLevel(THREE, group, legacy).villageScene, undefined);
  assert.equal(group.getObjectByName('illustrated-harbor'), undefined);
  assert.equal(group.userData.houseMarkers.length, 1, 'legacy 3x2 house interaction remains available');
});

test('Chapter 4 manor: stairs are the only way upstairs, chests are reachable and Killian is toned down', async () => {
  const raw = await readMap(files[1]);
  assert.deepEqual([raw.width, raw.height, raw.villageScene.layout], [24, 20, 'manor']);
  const group = new THREE.Group();
  const level = levels.buildLevel(THREE, group, raw);
  const art = group.getObjectByName('illustrated-manor');
  assert.ok(group.getObjectByName('manor-night-surround').position.y < art.position.y, 'night surround sits beneath the artwork');
  assert.ok(art.material.color.r < .6 && art.material.color.b < .7, 'the manor art is tinted darker than daylight');
  assert.equal(art.material.map.repeat.x, 1);
  const stairs = ['6,15','7,15','6,16','7,16','16,10','17,10','16,11','17,11'];
  for (const cell of stairs) {
    const [sx, sz] = cell.split(',').map(Number);
    assert.equal(grid.isWalkable(level, sx, sz), true, `stair ${cell}`);
    assert.equal(level.tileIds[sz][sx], 'manor_stairs', `stair ${cell} uses the stair tile`);
  }
  assert.equal(terrain.getTerrain(level, 6, 15).avoid, 20, 'manor stairs grant +20 avoid in combat');
  assert.equal(terrain.getTerrain(level, 11, 17).avoid, 0, 'the hall floor stays neutral');
  assert.equal(level.tileIds.flat().filter((id) => id === 'manor_stairs').length, stairs.length);
  const noStairs = { ...level, tileIds: level.tileIds.map((row, z) =>
    row.map((id, x) => stairs.includes(`${x},${z}`) ? 'manor_block' : id)) };
  const groundOnly = distances(noStairs, level.spawn);
  for (const chest of level.chests)
    assert.equal(groundOnly.has(key(chest)), false, `${chest.id} is upstairs, not on the hall floor`);
  assert.ok(!groundOnly.has('12,3') && !groundOnly.has('3,15') && !groundOnly.has('20,10'),
    'the throne room and both wings require the stairs');
  const reach = distances(level, level.spawn);
  const steps = Object.fromEntries(level.chests.map((chest) => [chest.id, reach.get(key(chest))]));
  assert.ok(Object.values(steps).every(Number.isFinite), 'all three chests can be reached');
  assert.equal(level.chests.length, 3);
  assert.ok(steps['chest-lancereaver'] <= 11, 'Lancereaver is two turns from the start');
  assert.ok(steps['chest-lancereaver'] < Math.min(steps['chest-axe'], steps['chest-emblem']));
  const keyCarrier = level.enemies.filter((enemy) => enemy.drop === 'chest-key')
    .map((enemy) => reach.get(key(enemy))).sort((a, b) => a - b)[0];
  assert.ok(keyCarrier <= 6, 'a key carrier meets the party in the hall');
  const killianEntry = raw.enemies.find((enemy) => enemy.id === 'killian');
  assert.deepEqual([killianEntry.x, killianEntry.z, killianEntry.level], [12, 3, 10]);
  const killian = JSON.parse(await readFile(new URL('../data/characters/killian.json', import.meta.url), 'utf8'));
  assert.deepEqual([killian.level, killian.baseStats.hp, killian.baseStats.strength, killian.baseStats.defense],
    [10, 58, 14, 10]);
  assert.deepEqual(killian.baseStats, killian.currentStats);
  const legacyGroup = new THREE.Group();
  const legacy = levels.buildLevel(THREE, legacyGroup, { ...raw, width: 32, height: 32,
    villageScene: { version: 1, layout: 'mansion' },
    tiles: Array.from({ length: 32 }, (_, z) => Array.from({ length: 32 }, (_, x) => x === 0 || z === 0 ? 'manor_block' : 'manor_floor')),
    players: raw.players.map((p, i) => ({ ...p, x: 5 + i, z: 5 })), spawn: { x: 5, z: 5 }, exit: { x: 5, z: 6 },
    enemies: raw.enemies.map((e, i) => ({ ...e, x: 1 + (i % 20), z: 10 + Math.floor(i / 20) })),
    chests: raw.chests.map((c, i) => ({ ...c, x: 10 + i, z: 20 })) });
  assert.equal(legacy.width, 32, 'older embedded 32x32 Chapter 4 saves still render');
  assert.ok(legacyGroup.getObjectByName('illustrated-mansion'));
});

test('Chapter 3 cursor and units stop at column 21 while artwork extends to column 24', async () => {
  const level=levels.validateLevel(await readMap(files[0]));
  assert.equal(level.width,24);
  assert.equal(level.villageScene.playableWidth,21);
  const context={activeLevel:level,cursor:{},cursorOutline:{},gameState:{mode:'move'},enemies:[],
    showTileInspection:noop,updateUnitHoverCard:noop,updateMovementRoute:noop,
    findEnemyAt:()=>null};
  const source=mainFunction('function setCursor(', 'function showTileInspection(');
  runInNewContext(`${source}\nsetCursor(99,99)`,context);
  assert.equal(context.cursor.x,20);
  assert.equal(context.cursor.z,20);
  for(let z=0;z<21;z++)for(let x=21;x<24;x++) {
    assert.equal(grid.isWalkable(level,x,z),false);
    assert.equal(grid.isWalkable(level,x,z,{type:'flying'}),false);
  }
  assert.equal(grid.isWalkable(level,20,10),true);
  assert.equal(grid.isWalkable(level,20,20),true);
  assert.equal(levels.validateLevel(JSON.parse(JSON.stringify(level))).villageScene.playableWidth,21);
  assert.throws(()=>levels.validateLevel({...level,villageScene:{...level.villageScene,playableWidth:25}}),/playableWidth/);
});

test('real escape objective waits for every surviving ally, including recruited Seymour', async () => {
  const level = levels.validateLevel(await readMap(files[2]));
  const context = {
    activeLevel: level,
    playerTeam: Array.from({ length: 4 }, (_, i) => ({ ...level.exitTiles[i], hp: 20 })),
    completeVictory: () => { context.won = true; },
  };
  const source = mainFunction('function checkEscapeObjective()', 'function checkStreetObjective()');
  context.playerTeam[3].z = 6;
  assert.equal(runInNewContext(`${source}\ncheckEscapeObjective()`, context), false);
  assert.equal(context.won, undefined);
  context.playerTeam[3].z = 3;
  assert.equal(runInNewContext('checkEscapeObjective()', context), true);
  assert.equal(context.won, true);
});
