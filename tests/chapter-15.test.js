import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import * as THREE from 'three';
import { advanceCathedralStory, cathedralElevation, freshCathedral, cathedralWaveEnabled } from '../src/game/cathedral.js';

let server, levels, characters, inventory, combat, terrain, tiles, saves, interiors, raw, story;
let triggerProgressWaves;
const priorImage = Object.getOwnPropertyDescriptor(globalThis, 'Image');
const priorStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const storage = new Map();
before(async () => {
  globalThis.Image = class {
    set src(value) {
      this.width = value.includes('/altar.png') ? 192 : 64;
      this.height = value.includes('/altar.png') ? 160 : value.includes('banner') ? 128 : 64;
      queueMicrotask(() => this.onload());
    }
  };
  globalThis.localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  };
  server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: 'custom' });
  [levels, characters, inventory, combat, terrain, tiles, saves, interiors] = await Promise.all([
    '/src/levels/level.js', '/src/characters/characters.js', '/src/characters/inventory.js',
    '/src/battle/combat.js', '/src/battle/terrain.js', '/src/levels/tiles.js',
    '/src/game/save.js', '/src/levels/cathedral-interior.js',
  ].map((path) => server.ssrLoadModule(path)));
  ({ triggerProgressWaves } = await server.ssrLoadModule('/src/game/courtyard.js'));
  raw = JSON.parse(await readFile(new URL('../data/levels/map_15_cathedral.json', import.meta.url), 'utf8'));
  story = JSON.parse(await readFile(new URL('../data/tutorials/chapter-15.json', import.meta.url), 'utf8'));
});
after(async () => {
  await server?.close();
  for (const [key, descriptor] of [['Image', priorImage], ['localStorage', priorStorage]]) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
});
const fresh = () => levels.validateLevel(structuredClone(raw));

function reachable(level, start, blocked = () => false) {
  const seen = new Set([`${start.x},${start.z}`]), queue = [start];
  for (let i = 0; i < queue.length; i++) {
    const { x, z } = queue[i];
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const next = { x: x + dx, z: z + dz }, key = `${next.x},${next.z}`;
      if (!seen.has(key) && tiles.isLevelTileWalkable(level, next.x, next.z) && !blocked(next)) {
        seen.add(key); queue.push(next);
      }
    }
  }
  return seen;
}

test('Chapter 15 has a valid promoted roster, sole Bishop objective and promotion-friendly rewards', async () => {
  const level = fresh();
  assert.equal(levels.CHAPTER_COUNT, 15);
  assert.equal(level.objective, 'defeat-boss');
  assert.throws(() => levels.validateLevel({ ...structuredClone(raw), cathedral: null }), /Cathedral battle rules/);
  assert.deepEqual(level.players.map((unit) => unit.id), ['rictor', 'lena', 'arlan', 'troy']);
  const enemies = level.enemies.map((unit) => characters.createEnemyUnit(unit.id, unit.x, unit.z, unit));
  assert.equal(enemies.filter((unit) => unit.isBoss).length, 1);
  assert.equal(enemies.find((unit) => unit.isBoss).id, 'voss');
  assert.ok(enemies.filter((unit) => ['general', 'paladin', 'sage', 'bishop'].includes(unit.classId)).length >= 22);
  assert.equal(enemies.filter((unit) => unit.classId === 'priest').length, 2);
  const classes = await server.ssrLoadModule('/src/characters/classes.js');
  assert.equal(classes.getClass('thief').promotionWeaponRanks.Bow, 'D');
  const arlan = characters.createArlanAlly(), lena = characters.createLenaAlly();
  arlan.classId = 'general'; arlan.weaponExp = { Spear: 70, Axe: 0 };
  lena.classId = 'assassin'; lena.weaponExp = { Sword: 30, Bow: 30 };
  assert.ok(classes.canEquipWeapon(arlan, inventory.INVENTORY_ITEMS.get('steel-axe')));
  for (const id of ['killer-bow', 'killing-edge']) {
    const weapon = inventory.INVENTORY_ITEMS.get(id);
    assert.ok(classes.canEquipWeapon(lena, weapon));
    assert.equal(weapon.critical, 30);
    assert.ok(weapon.spriteUrl);
  }
  assert.deepEqual(level.chests.map((chest) => chest.rewardId).sort(),
    ['steel-axe', 'killer-bow', 'killing-edge', 'master-emblem', 'master-emblem'].sort());
  for (const chest of level.chests) assert.ok(inventory.INVENTORY_ITEMS.has(chest.rewardId), chest.rewardId);
  const { readdir } = await import('node:fs/promises');
  const mapDir = new URL('../data/levels/', import.meta.url);
  for (const file of (await readdir(mapDir)).filter((name) => name.endsWith('.json'))) {
    const map = JSON.parse(await readFile(new URL(file, mapDir), 'utf8'));
    for (const chest of map.chests ?? []) assert.ok(inventory.INVENTORY_ITEMS.has(chest.rewardId), `${file}: ${chest.rewardId}`);
  }
  const legacy = structuredClone(raw);
  legacy.chests[1].rewardId = 'orders-emblem';
  assert.equal(levels.validateLevel(legacy).chests[1].rewardId, 'master-emblem');
});

test('Every chest and tier is connected through two real stair routes with safe regroup landings', () => {
  const level = fresh(), seen = reachable(level, level.spawn);
  for (const chest of level.chests) {
    assert.ok(seen.has(`${chest.x},${chest.z}`));
    assert.ok(chest.z >= 13, 'all rewards precede the sanctuary');
  }
  assert.ok(seen.has('12,3'));
  for (const x of [5, 20]) {
    for (const z of [10, 11, 12, 13, 22, 23, 24, 25]) assert.ok(seen.has(`${x},${z}`));
  }
  assert.equal(terrain.getTileElevation(level, 5, 33), 0);
  assert.equal(terrain.getTileElevation(level, 5, 18), 0.8);
  assert.equal(terrain.getTileElevation(level, 5, 5), 1.6);
  for (const z of [10, 11, 12, 13, 22, 23, 24, 25]) {
    assert.ok(Math.abs(cathedralElevation(z) - cathedralElevation(z + 1)) <= 0.3 + 1e-9);
  }
  assert.equal(terrain.getTerrain(level, 5, 24).moveCost, 2);
  assert.equal(tiles.isLevelTileWalkable(level, 0, 15, { type: 'flying' }), false);
});

test('Bolting has exactly four usable casts, range 3-10, no close counter and safe opening deployment', () => {
  const level = fresh();
  inventory.setUnlockedSpells([]);
  const placements = level.enemies.filter((unit) => unit.id === 'cathedral-bolting');
  assert.equal(placements.length, 2);
  assert.ok(Math.abs(placements[0].x - placements[1].x) + Math.abs(placements[0].z - placements[1].z) > 12);
  for (const p of placements) {
    const unit = characters.createEnemyUnit(p.id, p.x, p.z, p);
    assert.equal(inventory.spellUses(inventory.findWeaponEntry(unit), unit.weapon), 4);
    assert.equal(inventory.weaponUseBlockReason(unit, unit.weapon), undefined);
    assert.equal(unit.weapon.minRange, 3);
    assert.equal(unit.weapon.maxRange, 10);
    for (const player of level.players) {
      assert.ok(Math.abs(player.x - p.x) + Math.abs(player.z - p.z) > 10);
    }
    for (let i = 0; i < 4; i++) inventory.spendWeaponUse(unit);
    assert.equal(inventory.weaponUseBlockReason(unit, unit.weapon), 'No uses left');
    assert.equal(combat.canAttack(unit), false);
  }
});

test('Story reveals need no chest, optional recruit or enemy death and persist through restart rules', () => {
  const level = fresh();
  assert.deepEqual(advanceCathedralStory(level, [{ hp: 1, z: 22 }]), ['summons', 'records']);
  assert.deepEqual(advanceCathedralStory(level, [{ hp: 1, z: 22 }]), []);
  assert.deepEqual(advanceCathedralStory(level, [{ hp: 0, z: 3 }]), []);
  assert.deepEqual(advanceCathedralStory(level, [{ hp: 1, z: 10 }]), ['sanctuary']);
  assert.ok(freshCathedral(level.cathedral).beats.every((beat) => !beat.seen));
  const text = story['cathedral-records'].pages[0].paragraphs.join(' ');
  assert.match(text, /predates the first public alarm/);
  assert.match(text, /treatments caused this/);
  assert.ok(story['cathedral-ending']);
});

test('Finite warned waves wait one full player phase and never enable the sentinel without a warning', () => {
  const level = fresh(), team = [{ hp: 1, z: 10 }];
  assert.ok(level.reinforcements.every((wave) => !cathedralWaveEnabled(level, wave)));
  assert.deepEqual(triggerProgressWaves(level, team, 4), ['nave-paladins']);
  assert.equal(level.reinforcements[0].turn, 5);
  assert.equal(level.reinforcements[1].turn, 999);
  assert.deepEqual(triggerProgressWaves(level, team, 4), []);
  assert.deepEqual(triggerProgressWaves(level, team, 5), ['gallery-paladins']);
  assert.equal(level.reinforcements[1].turn, 6);
  assert.deepEqual(triggerProgressWaves(level, team, 1000), []);
  assert.equal(level.reinforcements.flatMap((wave) => wave.units).length, 5);
  assert.ok(freshCathedral(level.cathedral).triggers.every((trigger) => trigger.warnedTurn === null));
});

test('Occupied warned arrival tiles queue without moving Paladins elsewhere', async () => {
  const { infirmarySpawnTile } = await server.ssrLoadModule('/src/game/infirmary.js');
  const level = fresh(), placement = level.reinforcements[0].units[0];
  assert.equal(infirmarySpawnTile(level, placement, [{ ...placement, hp: 1 }]), null);
  assert.deepEqual(infirmarySpawnTile(level, placement, []), { x: placement.x, z: placement.z });
});

test('Generated art covers every tile at gameplay height and keeps props off walkable routes', async () => {
  const level = fresh(), group = new THREE.Group();
  interiors.addCathedralInterior(THREE, group, level);
  const floors = group.children.filter((child) => child.name.startsWith('cathedral-ground-'));
  assert.equal(floors.reduce((sum, mesh) => sum + mesh.count, 0), level.width * level.height);
  assert.ok(floors.length >= 8);
  for (const mesh of group.children) {
    if (mesh.name === 'cathedral-unit-depth-reset') continue;
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      assert.ok(material.map, `${mesh.name} needs generated art`);
      assert.equal(material.transparent, false, `${mesh.name} must draw before units`);
    }
    const prop = mesh.userData.cathedralProp;
    if (prop && !['altar', 'throne'].includes(prop.key)) assert.equal(tiles.isLevelTileWalkable(level, Math.floor(prop.x), Math.floor(prop.z)), false);
  }
  assert.ok(group.children.some((mesh) => mesh.userData.cathedralProp?.key === 'throne' && mesh.userData.cathedralProp.x === 12));
  const depthReset = group.getObjectByName('cathedral-unit-depth-reset');
  assert.ok(depthReset && !depthReset.frustumCulled, 'units must render above Cathedral walls and tiers');
  assert.ok(group.children.every((mesh) => mesh === depthReset || mesh.renderOrder < depthReset.renderOrder));
  let cleared = 0;
  depthReset.onBeforeRender({ clearDepth: () => cleared++ });
  assert.equal(cleared, 1);
  for (const key of ['marble', 'checker', 'carpet', 'stairs', 'wall_top', 'wall_side', 'pew_top', 'pew_side',
    'pillar_top', 'pillar_side', 'altar_floor', 'gallery', 'archive_floor', 'rail', 'blood_mosaic',
    'threshold', 'altar', 'throne', 'window', 'candles', 'records', 'church_banner', 'order_banner']) {
    const png = await readFile(new URL(`../assets/tiles/Cathedral_Interior/${key}.png`, import.meta.url));
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
    if (!['altar', 'throne', 'window', 'candles', 'records', 'church_banner', 'order_banner'].includes(key)) {
      assert.equal(png.readUInt32BE(16), 64);
      assert.equal(png.readUInt32BE(20), 64);
    }
  }
});

test('Voss holds the Bishop\'s Throne: +3 Defense, +20 Avoid, 5 HP each turn, migrated into older saves', async () => {
  const level = fresh();
  const voss = level.enemies.find((unit) => unit.id === 'voss');
  assert.deepEqual([voss.x, voss.z], [12, 3]);
  const vossUnit = characters.createEnemyUnit('voss', voss.x, voss.z, voss);
  assert.equal(vossUnit.spriteSet, 'genericBishop');
  const { readdir } = await import('node:fs/promises');
  for (const direction of ['south', 'north', 'east', 'west', 'south-east', 'south-west', 'north-east', 'north-west']) {
    await readFile(new URL(`../assets/character/Generic_Bishop/rotations/${direction}.png`, import.meta.url));
    for (const animation of ['Walking', 'The_figure_raises_their_right_hand_to_the_chest_to']) {
      assert.ok((await readdir(new URL(`../assets/character/Generic_Bishop/animations/${animation}/${direction}/`, import.meta.url))).length);
    }
  }
  const throne = terrain.getTerrain(level, 12, 3);
  assert.equal(level.tileIds[3][12], 'cathedral_throne');
  assert.equal(throne.defense, 3);
  assert.equal(throne.avoid, 20);
  assert.equal(throne.healPerTurn, 5);
  assert.equal(throne.walkable, true);
  assert.equal(level.tileIds.flat().filter((id) => id === 'cathedral_throne').length, 1);
  const legacy = structuredClone(raw);
  legacy.tiles[3] = legacy.tiles[3].replace('N', 'R');
  assert.equal(levels.validateLevel(legacy).tileIds[3][12], 'cathedral_throne');
});

test('Reliquary Priests are non-combat Priests whose Physic heals the weakest defender from Magic/2 tiles', async () => {
  const { chooseEnemyStaffAction, useEnemyStaff, healStaffRange } = await server.ssrLoadModule('/src/game/enemy-staves.js');
  const level = fresh();
  const placements = level.enemies.filter((unit) => unit.id === 'cathedral-bishop');
  assert.equal(placements.length, 2);
  const priest = characters.createEnemyUnit(placements[0].id, 10, 10, placements[0]);
  assert.equal(priest.classId, 'priest');
  assert.equal(priest.name, 'Reliquary Priest');
  assert.equal(combat.canAttack(priest), false);
  const physic = inventory.INVENTORY_ITEMS.get('physic');
  assert.equal(healStaffRange(priest, physic), Math.floor(priest.magic / 2));
  assert.ok(healStaffRange(priest, physic) >= 7);
  const far = { hp: 10, maxHp: 40, x: 10, z: 10 + healStaffRange(priest, physic) };
  const farther = { hp: 5, maxHp: 40, x: 10, z: 11 + healStaffRange(priest, physic) };
  const action = chooseEnemyStaffAction(priest, [priest, far, farther], []);
  assert.equal(action.staff.id, 'physic');
  assert.equal(action.target, far);
  assert.equal(useEnemyStaff(priest, action, 1).healed, Math.min(30, physic.heal + priest.magic));
  for (let i = 0; i < 4; i++) inventory.spendWeaponUse(priest, physic);
  far.hp = 10;
  assert.equal(chooseEnemyStaffAction(priest, [priest, far], []), null, 'Heal cannot reach once Physic is spent');
  far.z = 11;
  assert.equal(chooseEnemyStaffAction(priest, [priest, far], []).staff.id, 'heal-staff');
});

test('Cathedral saves round-trip finite enemy magic, warning progress and essential reveals', () => {
  const level = fresh();
  const factories = { rictor: characters.createRictorAlly, lena: characters.createLenaAlly,
    arlan: characters.createArlanAlly, troy: characters.createTroyAlly };
  const allies = level.players.map((p) => Object.assign(factories[p.id](), p));
  const enemies = level.enemies.map((p) => characters.createEnemyUnit(p.id, p.x, p.z, p));
  const bolting = enemies.find((unit) => unit.id === 'cathedral-bolting');
  inventory.spendWeaponUse(bolting);
  const data = saves.createSaveData(level, characters.createMaria(), enemies,
    { turn: 1, phase: 'player', defeated: false }, { chapter: 14, playerReserve: true, allies });
  saves.writeSave(data);
  const loaded = saves.readSave();
  const savedCanon = loaded.enemies.find((unit) => unit.id === bolting.id);
  assert.equal(savedCanon.inventory[0].spells.bolting, 3);
  const rebuilt = characters.createEnemyUnit(savedCanon.id, savedCanon.x, savedCanon.z, savedCanon);
  rebuilt.inventory = savedCanon.inventory.map(inventory.copyEntry);
  assert.ok(inventory.findWeaponEntry(rebuilt));
  assert.equal(combat.canAttack(rebuilt), true);
  advanceCathedralStory(data.level, [{ hp: 1, z: 22 }]);
  triggerProgressWaves(data.level, [{ hp: 1, z: 22 }], 1);
  saves.writeSave(data);
  assert.equal(saves.readSave().level.cathedral.beats[1].seen, true);
  data.level.reinforcements[0].turn = 3;
  saves.writeSave(data);
  assert.throws(() => saves.readSave(), /Cathedral reinforcement timing/);
  data.level.reinforcements[0].turn = 2;
  data.phase = 'victory';
  saves.writeSave(data);
  assert.throws(() => saves.readSave(), /Voss/);
  data.enemies = data.enemies.filter((enemy) => enemy.id !== 'voss');
  saves.writeSave(data);
  assert.equal(saves.readSave().phase, 'victory', 'no rout or wave completion requirement');
});
