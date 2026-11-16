import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { createServer } from 'vite';
import * as THREE from 'three';
import { constrainInteriorCamera } from '../src/game/camera-bounds.js';

const raw = JSON.parse(await readFile(new URL('../data/levels/map_08_rotted_heart.json', import.meta.url), 'utf8'));
const tutorials = JSON.parse(await readFile(new URL('../data/tutorials/chapter-8.json', import.meta.url), 'utf8'));
const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
const priorImage = Object.getOwnPropertyDescriptor(globalThis, 'Image');
const priorDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
const key = ({ x, z }) => `${x},${z}`;
let server, levels, grid, characters, terrain;

before(async () => {
  const context = { drawImage() {}, fillRect() {}, createRadialGradient: () => ({ addColorStop() {} }) };
  globalThis.document = { createElement: () => ({ getContext: () => context }) };
  globalThis.Image = class {
    set src(url) {
      const forest = url.includes('forest.png') || url.includes('camp.png');
      this.width = url.includes('heart.png') || forest ? 1536 : 768;
      this.height = url.includes('heart.png') ? 1024 : forest ? 672 : 336;
      queueMicrotask(() => this.onload());
    }
  };
  server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: 'custom' });
  [levels, grid, characters, terrain] = await Promise.all([
    server.ssrLoadModule('/src/levels/level.js'), server.ssrLoadModule('/src/battle/grid.js'),
    server.ssrLoadModule('/src/characters/characters.js'), server.ssrLoadModule('/src/battle/terrain.js'),
  ]);
});

after(async () => {
  await server?.close();
  for (const [name, descriptor] of [['Image', priorImage], ['document', priorDocument]]) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete globalThis[name];
  }
});

function connected(level, blocked = new Set()) {
  const queue = [level.spawn], seen = new Set([key(level.spawn)]);
  for (let i = 0; i < queue.length; i++) {
    const { x, z } = queue[i];
    for (const next of [{ x: x - 1, z }, { x: x + 1, z }, { x, z: z - 1 }, { x, z: z + 1 }]) {
      if (seen.has(key(next)) || blocked.has(key(next)) || !grid.isWalkable(level, next.x, next.z)) continue;
      seen.add(key(next));
      queue.push(next);
    }
  }
  return seen;
}

function mainFunctions(start, end) {
  const first = main.indexOf(start), last = main.indexOf(end, first);
  assert.ok(first >= 0 && last > first);
  return main.slice(first, last);
}

function encounter() {
  const level = levels.validateLevel(structuredClone(raw));
  const create = (x, z, id, options) => characters.createEnemyUnit(id, x, z, { ...options, chapter: 7 });
  const context = {
    activeLevel: level,
    enemies: level.enemies.map((unit) => create(unit.x, unit.z, unit.id, unit)),
    gameState: { turn: 1 }, levelGroup: { userData: {} },
    defendingUnits: () => level.players.map((unit) => ({ ...unit, hp: 30 })),
    tileKey: (x, z) => `${x},${z}`, createEnemy: create,
    isWalkable: grid.isWalkable,
    enemyMovementType: characters.enemyMovementType,
    distanceBetween: (x1, z1, x2, z2) => Math.abs(x1 - x2) + Math.abs(z1 - z2),
    infirmaryWaveSealed: () => false, courtyardWaveEnabled: () => true, cathedralWaveEnabled: () => true,
    showCombatResult() {}, setMessage() {}, renderTacticalUi() {}, wait: async () => {},
    isBossEnemy: characters.isBossEnemy, completeVictory: () => { context.won = true; },
  };
  runInNewContext([
    mainFunctions('function heartrootBoss()', 'function hideTerminalScreen()'),
    mainFunctions('function spawnTurnReinforcements()', 'async function endPlayerPhase()'),
    mainFunctions('function checkDefeatAllVictory()', 'function objectiveDescription('),
  ].join('\n'), context);
  return context;
}

test('Chapter 8 renders native 32px cells without cropping, resampling or duplicate forest geometry', async () => {
  const png = await readFile(new URL('../assets/maps/village/heart.png', import.meta.url));
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [1536, 1024]);
  assert.equal(png.readUInt32BE(16) / raw.width, 32);
  assert.equal(png.readUInt32BE(20) / raw.height, 32);
  const group = new THREE.Group();
  levels.buildLevel(THREE, group, raw);
  const art = group.getObjectByName('illustrated-heart');
  assert.ok(art);
  assert.equal(group.children.filter((mesh) => mesh.isMesh).length, 1);
  assert.equal(art.material.map.magFilter, THREE.NearestFilter);
  assert.equal(art.material.map.minFilter, THREE.NearestFilter);
  assert.deepEqual(art.material.map.repeat.toArray(), [1, 1]);
  assert.equal(art.material.map.generateMipmaps, false);
  const { isForestLayout } = await server.ssrLoadModule('/src/levels/village-scene.js');
  assert.equal(isForestLayout('heart'), true, 'forest ambience including crow audio remains active');
});

test('all paths, roots, encounter units and reinforcement positions are connected inside the cursor bounds', () => {
  const level = levels.validateLevel(raw), reachable = connected(level);
  const walkable = [];
  const [minX, minZ, maxX, maxZ] = level.villageScene.cursorBounds;
  for (let z = 0; z < level.height; z++) for (let x = 0; x < level.width; x++) {
    if (!grid.isWalkable(level, x, z)) continue;
    walkable.push({ x, z });
    assert.ok(x >= minX && x <= maxX && z >= minZ && z <= maxZ);
    assert.ok(reachable.has(`${x},${z}`), `walkable ${x},${z} is connected`);
  }
  assert.equal(reachable.size, walkable.length);
  const placed = [...level.players, ...level.enemies];
  assert.equal(new Set(placed.map(key)).size, placed.length, 'starting units never overlap');
  for (const unit of [...placed, level.exit, ...level.reinforcements.flatMap((wave) => wave.units)])
    assert.ok(reachable.has(key(unit)), `${unit.id ?? 'exit'} at ${key(unit)} is reachable`);
  for (const point of [{ x: 40, z: 8 }, { x: 18, z: 10 }, { x: 20, z: 19 }])
    assert.equal(grid.isWalkable(level, point.x, point.z), false, 'lodge roof and dense tree islands stay solid');
  const cover = terrain.getTerrain(level, 21, 13);
  assert.deepEqual([cover.avoid, cover.defense, cover.moveCost], [20, 2, 2]);
  const withoutCenter = new Set([key({ x: 22, z: 14 }), key({ x: 22, z: 15 })]);
  assert.ok(connected(level, withoutCenter).has(key(level.exit)), 'flank loops bypass a blocked central choke');
});

test('every playable tile and standing sprite can be brought inside the camera across supported aspect ratios', () => {
  const level = levels.validateLevel(raw), cells = [...connected(level)].map((s) => s.split(',').map(Number));
  const scale = Math.max(.55, level.width / 21, level.height / 19);
  const offset = { y: 14 * scale, z: 10 * scale };
  const distance = Math.hypot(offset.y, offset.z), ny = offset.y / distance, nz = offset.z / distance;
  for (const aspect of [1.26, 16 / 9, 21 / 9]) {
    const visible = new Set();
    for (const [tx, tz] of cells) {
      const target = { x: tx - level.width / 2 + .5, y: .8, z: tz - level.height / 2 + .5 };
      const fov = constrainInteriorCamera(target, offset, aspect, level.width, level.height, 0, .01);
      const tangent = Math.tan(fov * Math.PI / 360);
      for (const [x, z] of cells) {
        const id = `${x},${z}`;
        if (visible.has(id)) continue;
        const points = [[-.5, 0, -.5], [.5, 0, -.5], [-.5, 0, .5], [.5, 0, .5], [0, 1.7, 0]];
        if (points.every(([ox, oy, oz]) => {
          const dx = x - level.width / 2 + .5 + ox - target.x;
          const dy = oy - target.y - offset.y;
          const dz = z - level.height / 2 + .5 + oz - target.z - offset.z;
          const depth = -(ny * dy + nz * dz);
          return Math.abs(dx / (depth * tangent * aspect)) <= .95 &&
            Math.abs((nz * dy - ny * dz) / (depth * tangent)) <= .95;
        })) visible.add(id);
      }
    }
    for (const [x, z] of cells) assert.ok(visible.has(`${x},${z}`), `${x},${z} visible at aspect ${aspect}`);
  }
});

test('Liam, four Heartroots, healing, frenzy, drops and the original encounter roster are preserved', async () => {
  const ctx = encounter(), boss = ctx.enemies.find((unit) => unit.id === 'liam');
  assert.equal(raw.objective, 'defeat-boss');
  assert.equal(raw.enemies.length, 22);
  assert.deepEqual(raw.heartroots, { bossId: 'liam', healPerRoot: 8, frenzyStrength: 2, frenzyMovement: 1 });
  assert.equal(raw.enemies.filter((unit) => unit.id === 'heartroot').length, 4);
  assert.equal(raw.enemies.filter((unit) => unit.id === 'root-warden').length, 4);
  assert.equal(raw.enemies.filter((unit) => unit.id === 'feral-wolf').length, 9);
  assert.equal(raw.enemies.filter((unit) => unit.id === 'order-archer').length, 2);
  assert.equal(raw.enemies.filter((unit) => unit.id === 'order-cavalier').length, 2);
  assert.deepEqual(boss.drop, ['steel-axe', 'pocketwatch']);
  assert.equal(boss.weapon.id, 'steel-axe');
  assert.equal(boss.level, 20);
  const original = { strength: boss.strength, movement: boss.movement };
  boss.hp = 1;
  await ctx.heartrootPhase();
  assert.equal(boss.hp, Math.min(boss.maxHp, 33));
  ctx.enemies = ctx.enemies.filter((unit) => unit.id !== 'heartroot' || unit.z === 6);
  boss.hp = 1;
  await ctx.heartrootPhase();
  assert.equal(boss.hp, 17);
  assert.equal(boss.strength, original.strength + 4);
  assert.equal(boss.movement, original.movement + 2);
  ctx.enemies = ctx.enemies.filter((unit) => unit.id !== 'heartroot');
  boss.hp = 1;
  await ctx.heartrootPhase();
  await ctx.heartrootPhase();
  assert.equal(boss.hp, 1);
  assert.equal(boss.strength, original.strength + 8);
  assert.equal(boss.movement, original.movement + 4, 'repeated phases never compound frenzy');
});

test('Chapter 8 steel weapons equip correctly and both Liam rewards survive saves and collection', async () => {
  const ctx = encounter();
  const inventory = await server.ssrLoadModule('/src/characters/inventory.js');
  const classes = await server.ssrLoadModule('/src/characters/classes.js');
  const saves = await server.ssrLoadModule('/src/game/save.js');
  const archers = ctx.enemies.filter((unit) => unit.id === 'order-archer');
  const archer = archers.find((unit) => unit.drop === 'steel-bow');
  assert.ok(archer);
  assert.equal(archers.filter((unit) => unit.drop === 'steel-bow').length, 1);
  assert.equal(archer.weapon.id, 'steel-bow');
  const stark = characters.createStarkAlly();
  const bow = inventory.INVENTORY_ITEMS.get('steel-bow');
  assert.ok(classes.canEquipWeapon(stark, bow));
  assert.ok(bow.spriteUrl);
  assert.deepEqual([bow.minRange, bow.maxRange], [2, 2]);
  assert.ok(bow.effect.includes('flying'));
  assert.ok(bow.might > inventory.INVENTORY_ITEMS.get('iron-bow').might);
  const player = Object.assign(characters.createMaria(), raw.spawn);
  const save = saves.parseSave(JSON.stringify(saves.createSaveData(ctx.activeLevel, player, ctx.enemies,
    { turn: 1, phase: 'player', defeated: false }, { chapter: 7 })));
  const savedBoss = save.enemies.find((unit) => unit.id === 'liam');
  assert.deepEqual(savedBoss.drop, ['steel-axe', 'pocketwatch']);
  assert.equal(savedBoss.weaponId, 'steel-axe');
  assert.equal(save.enemies.find((unit) => unit.drop === 'steel-bow').weaponId, 'steel-bow');
  assert.deepEqual(characters.createEnemyUnit('liam', savedBoss.x, savedBoss.z, savedBoss).drop,
    ['steel-axe', 'pocketwatch']);
  for (const drop of [[], ['steel-axe', 'unknown'], ['steel-axe', 'steel-axe'], 3]) {
    assert.equal(characters.validEnemyDrop(drop), false);
    assert.throws(() => characters.createEnemyUnit('liam', 40, 15, { drop }), /invalid drops/);
    const invalid = structuredClone(raw);
    invalid.enemies[0].drop = drop;
    assert.throws(() => levels.validateLevel(invalid));
    const invalidSave = structuredClone(save);
    invalidSave.enemies[0].drop = drop;
    assert.throws(() => saves.parseSave(JSON.stringify(invalidSave)));
  }
  const priorConvoy = [...inventory.convoy];
  try {
    inventory.setConvoy([]);
    for (const freeSlots of [2, 1, 0]) {
      inventory.setConvoy([]);
      stark.inventory = inventory.createInventory(Array(inventory.MAX_INVENTORY_SIZE - freeSlots).fill('potion'));
      const events = [];
      const context = {
        activeLevel: ctx.activeLevel, enemies: [], enemyDropIds: characters.enemyDropIds,
        releaseWagonCargo: () => null, shouldSpawnGateBeast: () => false,
        grantItem: inventory.grantItem, gainInsight: () => events.push('insight'), BOSS_INSIGHT: 1,
        saveCurrentGame: () => {
          const ids = [...stark.inventory, ...inventory.convoy].map((entry) => entry.id);
          assert.equal(ids.filter((id) => id === 'steel-axe').length, 1);
          assert.equal(ids.filter((id) => id === 'pocketwatch').length, 1);
          events.push('save');
        },
        getInsight: () => 1,
        itemPopup: {
          showInsight: async () => events.push('insight-popup'),
          show: async (receipts) => {
            assert.deepEqual(Array.from(receipts, ({ item }) => item.id), ['steel-axe', 'pocketwatch']);
            events.push('items-popup');
          },
        },
      };
      runInNewContext(mainFunctions('async function collectEnemyDrop(', '// Only opposing units block movement;'), context);
      await context.collectEnemyDrop(ctx.enemies.find((unit) => unit.id === 'liam'), stark);
      assert.deepEqual(events, ['insight', 'save', 'insight-popup', 'items-popup']);
      assert.equal(inventory.convoy.length, Math.max(0, 2 - freeSlots));
    }
  } finally {
    inventory.setConvoy(priorConvoy);
  }
});

test('root wolves remain on turns 3/5/7 while independent ravens and Omen still arrive after the roots die', () => {
  for (const rootsAlive of [true, false]) {
    const ctx = encounter(), arrivals = [], announcements = [];
    if (!rootsAlive) ctx.enemies = ctx.enemies.filter((unit) => unit.id !== 'heartroot');
    for (let turn = 1; turn <= 14; turn++) {
      ctx.gameState.turn = turn;
      const result = ctx.spawnTurnReinforcements();
      assert.equal(result.error, null);
      arrivals.push(...result.units.map((unit) => [turn, unit.id]));
      announcements.push(...result.announcements.map((wave) => [turn, wave.announce, wave.sound]));
      assert.equal(ctx.spawnTurnReinforcements().units.length, 0, 'waves do not spawn twice');
    }
    assert.deepEqual(arrivals.filter(([, id]) => id === 'feral-wolf').map(([turn]) => turn),
      rootsAlive ? [3, 3, 3, 3, 5, 5, 5, 5, 7, 7, 7, 7] : []);
    assert.deepEqual(arrivals.filter(([, id]) => id === 'forest-raven').map(([turn]) => turn), [6, 6, 9, 9]);
    assert.deepEqual(arrivals.filter(([, id]) => id === 'crowman').map(([turn]) => turn), [13]);
    assert.deepEqual(announcements, [[11, 'crowOmen', 'crow-omen'], [13, 'crowmanArrival', 'crow-omen']]);
    const omen = ctx.enemies.find((unit) => unit.id === 'crowman');
    assert.equal(omen.hunts, 'maria');
    assert.equal(omen.drop, 'covenant-emblem');
    assert.equal(omen.isBoss, false);
    for (const id of ['crowOmen', 'crowmanArrival']) assert.ok(tutorials[id]?.pages.length);
    assert.match(JSON.stringify(tutorials.crowOmen), /two turns/);
    assert.doesNotMatch(JSON.stringify(tutorials.crowmanArrival), /Ansel Wren|Lantern Survey/);
  }
});

test('Liam victory never waits for the Omen or surviving ravens, and real saves do not replay waves', async () => {
  const ctx = encounter();
  assert.equal(ctx.checkDefeatAllVictory(), false);
  ctx.gameState.turn = 13;
  ctx.spawnTurnReinforcements();
  const saves = await server.ssrLoadModule('/src/game/save.js');
  const player = Object.assign(characters.createMaria(), raw.spawn);
  const data = saves.createSaveData(ctx.activeLevel, player, ctx.enemies,
    { turn: 13, phase: 'player', defeated: false }, { chapter: 7 });
  const save = saves.parseSave(JSON.stringify(data));
  assert.equal(save.chapter, 7);
  assert.equal(save.turn, 13);
  assert.equal(save.enemies.find((unit) => unit.id === 'crowman').drop, 'covenant-emblem');
  const restored = save.level;
  assert.deepEqual(restored.villageScene, raw.villageScene);
  assert.ok(restored.reinforcements.every((wave) => wave.spawned));
  ctx.activeLevel = restored;
  assert.equal(ctx.spawnTurnReinforcements().units.length, 0);
  ctx.enemies = ctx.enemies.filter((unit) => unit.id !== 'liam');
  assert.equal(ctx.checkDefeatAllVictory(), true);
  assert.equal(ctx.won, true);
  const early = encounter();
  early.enemies = early.enemies.filter((unit) => unit.id !== 'liam');
  assert.equal(early.checkDefeatAllVictory(), true, 'no mandatory turn-13 survival objective');
});
