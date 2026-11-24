import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import * as THREE from 'three';
import { advanceCathedralStory, cathedralElevation, freshCathedral, cathedralWaveEnabled } from '../src/game/cathedral.js';

let server, levels, characters, inventory, combat, terrain, tiles, saves, interiors, grid, raw, legacyRaw, story;
let triggerProgressWaves;
const priorImage = Object.getOwnPropertyDescriptor(globalThis, 'Image');
const priorStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const storage = new Map();
before(async () => {
  const propSizes = new Map(await Promise.all(['throne', 'records'].map(async (key) => {
    const png = await readFile(new URL(`../assets/tiles/Cathedral_Interior/${key}.png`, import.meta.url));
    return [key, { width: png.readUInt32BE(16), height: png.readUInt32BE(20) }];
  })));
  globalThis.Image = class {
    set src(value) {
      this.width = value.includes('/altar.png') ? 192 : 64;
      this.height = value.includes('/altar.png') ? 160 : value.includes('banner') ? 128 : 64;
      const size = [...propSizes].find(([key]) => value.includes(`/${key}.png`))?.[1];
      if (size) Object.assign(this, size);
      queueMicrotask(() => this.onload());
    }
  };
  globalThis.localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  };
  server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: 'custom' });
  [levels, characters, inventory, combat, terrain, tiles, saves, interiors, grid] = await Promise.all([
    '/src/levels/level.js', '/src/characters/characters.js', '/src/characters/inventory.js',
    '/src/battle/combat.js', '/src/battle/terrain.js', '/src/levels/tiles.js',
    '/src/game/save.js', '/src/levels/cathedral-interior.js', '/src/battle/grid.js',
  ].map((path) => server.ssrLoadModule(path)));
  ({ triggerProgressWaves } = await server.ssrLoadModule('/src/game/courtyard.js'));
  raw = JSON.parse(await readFile(new URL('../data/levels/map_15_cathedral.json', import.meta.url), 'utf8'));
  legacyRaw = JSON.parse(await readFile(new URL('./fixtures/chapter-15-legacy.json', import.meta.url), 'utf8'));
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
const legacyLevel = () => levels.validateLevel(structuredClone(legacyRaw));

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
  assert.equal(levels.CHAPTER_COUNT, 19);
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
    ['steel-axe', 'killer-bow', 'killing-edge', 'master-emblem', 'giants-marrow'].sort());
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

test('Chapter 15 opens with a single brief message about the Cathedral and its objective', () => {
  assert.equal(story.cathedral.pages.length, 1);
  const [page] = story.cathedral.pages;
  assert.equal(page.paragraphs.length, 1);
  assert.match(page.paragraphs[0], /Cathedral.*Bishop Aurel Voss.*defeat Voss.*Rictor must survive/);
  assert.equal(page.button, 'Enter the Nave');
});

test('Every chest and tier is connected through two real stair routes with safe regroup landings', () => {
  const level = fresh(), seen = reachable(level, level.spawn);
  for (const chest of level.chests) {
    assert.ok(seen.has(`${chest.x},${chest.z}`));
    assert.ok(chest.z >= 11, 'all rewards precede the sanctuary');
  }
  assert.ok(seen.has(`${level.exit.x},${level.exit.z}`));
  const stairColumns = [7, 8, 17, 18];
  for (const z of [9, 10, 22, 23]) {
    for (let x = 0; x < level.width; x++) {
      if (stairColumns.includes(x)) {
        assert.ok(seen.has(`${x},${z}`));
        assert.equal(terrain.getTerrain(level, x, z).moveCost, 2);
      } else {
        assert.equal(tiles.isLevelTileWalkable(level, x, z, { type: 'flying' }), false);
      }
    }
  }
  for (const x of stairColumns) for (const z of [8, 11, 21, 24]) assert.ok(seen.has(`${x},${z}`));
  for (let z = 0; z < level.height; z++) for (let x = 0; x < level.width; x++) {
    if (tiles.isLevelTileWalkable(level, x, z)) assert.ok(seen.has(`${x},${z}`), `isolated walkable cell ${x},${z}`);
  }
  const placements = [...level.players, ...level.enemies, ...level.chests, ...level.reinforcements.flatMap((wave) => wave.units)];
  assert.equal(new Set(placements.map(({ x, z }) => `${x},${z}`)).size, placements.length);
  for (const { x, z } of placements) assert.ok(seen.has(`${x},${z}`));
  assert.equal(terrain.getTileElevation(level, 5, 33), 0);
  assert.equal(terrain.getTileElevation(level, 5, 18), 0.8);
  assert.equal(terrain.getTileElevation(level, 5, 5), 1.6);
  assert.deepEqual([8, 9, 10, 11, 21, 22, 23, 24].map((z) => terrain.getTileElevation(level, 7, z)),
    [1.6, 1.4, 1, 0.8, 0.8, 0.6, 0.2, 0]);
  assert.equal(tiles.isLevelTileWalkable(level, 0, 15, { type: 'flying' }), false);
});

test('Infantry can move into melee range of the eastern Storm Canon from either gallery aisle', () => {
  const level = fresh();
  const enemies = level.enemies.map((unit) => ({ ...unit, hp: 1 }));
  const canon = enemies.find((unit) => unit.id === 'cathedral-bolting' && unit.x > level.width / 2);
  const target = { x: canon.x - 1, z: canon.z };
  const key = grid.tileKey(target.x, target.z);
  for (const [start, cost] of [[{ x: 18, z: 21 }, 4], [{ x: 19, z: 16 }, 2]]) {
    const unit = { ...start, move: cost, type: 'infantry' };
    const range = grid.getMovementRange(unit, level, enemies);
    assert.equal(range.get(key), cost);
    assert.equal(range.has(grid.tileKey(canon.x, canon.z)), false, 'the enemy still occupies its own tile');
  }
  for (const x of [18, 21, 22]) assert.equal(grid.isWalkable(level, x, 19), false, 'furniture stays blocked');
});

test('All five rewards are grouped in two caches off the carpet and stairways', () => {
  const level = fresh();
  assert.deepEqual(level.chests.map(({ x, z }) => [x, z]), [[5, 33], [6, 33], [3, 11], [4, 11], [5, 11]]);
  for (const chest of level.chests) {
    assert.ok(grid.findPath({ ...level.spawn, type: 'infantry' }, [chest], new Set(), level).length);
    assert.equal(level.tileIds[chest.z][chest.x], 'cathedral_floor');
  }
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

test('Both Storm Canons and the Thunder-equipped Sanctuary Sage drop their base tome', () => {
  const level = fresh();
  const drops = level.enemies.map((p) => characters.createEnemyUnit(p.id, p.x, p.z, p))
    .filter((unit) => characters.enemyDropIds(unit).includes('thunder-tome'));
  assert.deepEqual(drops.map((unit) => unit.id), ['cathedral-bolting', 'cathedral-bolting', 'church-sage']);
  const recipient = characters.createRictorAlly();
  for (const unit of drops) {
    assert.deepEqual(characters.enemyDropIds(unit), ['thunder-tome']);
    const { item } = inventory.grantItem(recipient, unit.drop);
    assert.equal(item.id, 'thunder-tome');
  }
});

test('Story reveals need no chest, optional recruit or enemy death and persist through restart rules', () => {
  const level = fresh();
  assert.deepEqual(advanceCathedralStory(level, [{ hp: 1, z: 21 }]), ['summons', 'records']);
  assert.deepEqual(advanceCathedralStory(level, [{ hp: 1, z: 21 }]), []);
  assert.deepEqual(advanceCathedralStory(level, [{ hp: 0, z: 3 }]), []);
  assert.deepEqual(advanceCathedralStory(level, [{ hp: 1, z: 8 }]), ['sanctuary']);
  assert.ok(freshCathedral(level.cathedral).beats.every((beat) => !beat.seen));
  const text = story['cathedral-records'].pages[0].paragraphs.join(' ');
  assert.match(text, /predates the first public alarm/);
  assert.match(text, /treatments caused this/);
  assert.ok(story['cathedral-ending']);
});

test('Finite warned waves wait one full player phase and never enable the sentinel without a warning', () => {
  const level = fresh(), team = [{ hp: 1, z: 8 }];
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

test('The midpoint warning brings one optional elite Paladin from the east flank, carrying an Orders Emblem', async () => {
  const level = fresh();
  const wave = level.reinforcements[0];
  const [placement] = wave.units;
  assert.equal(placement.id, 'cathedral-commander');
  assert.equal(level.reinforcements.flatMap((entry) => entry.units).filter((unit) => unit.id === placement.id).length, 1);
  assert.deepEqual(triggerProgressWaves(level, [{ hp: 1, z: 22 }], 3), []);
  assert.deepEqual(triggerProgressWaves(level, [{ hp: 1, z: 21 }], 3), ['nave-paladins']);
  assert.equal(wave.turn, 4);
  assert.equal(cathedralWaveEnabled(level, wave), true);
  assert.match(story['cathedral-commander-warning'].pages[0].paragraphs[0], /Commander Aldren Cade/);
  const { infirmarySpawnTile } = await server.ssrLoadModule('/src/game/infirmary.js');
  assert.deepEqual(infirmarySpawnTile(level, placement, level.players), { x: 23, z: 24 });
  const commander = characters.createEnemyUnit(placement.id, placement.x, placement.z, placement);
  const regular = characters.createEnemyUnit('cathedral-paladin', 0, 0);
  for (const [stat, bonus] of [['hp', 20], ['strength', 6], ['defense', 6], ['speed', 4]]) {
    assert.ok(commander[stat] >= regular[stat] + bonus, stat);
  }
  assert.equal(commander.weapon.id, 'silver-lance');
  const ranks = await server.ssrLoadModule('/src/characters/weapon-levels.js');
  assert.equal(ranks.getWeaponRank(commander, commander.weapon).id, 'A');
  assert.deepEqual(characters.enemyDropIds(commander), ['master-emblem']);
  assert.equal(commander.isBoss, false, 'Voss remains the only required kill');
});

test('The illustration is a continuous surface registered to tile centers and movement elevation', () => {
  const level = fresh(), group = new THREE.Group();
  interiors.addCathedralInterior(THREE, group, level);
  const mesh = group.getObjectByName('cathedral-illustrated-interior');
  assert.ok(mesh.material.map);
  assert.deepEqual(group.children.map(({ name }) => name),
    ['cathedral-illustrated-interior', 'cathedral-scenic-foundation', 'cathedral-unit-depth-reset']);
  const ray = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0));
  for (let z = 0; z < level.height; z++) {
    for (const x of [0, 7, 12, 18, 25]) {
      ray.ray.origin.set(x + 0.5 - level.width / 2, 4, z + 0.5 - level.height / 2);
      const { uv, point } = ray.intersectObject(mesh)[0];
      assert.ok(Math.abs(point.y - terrain.getTileElevation(level, x, z)) < 1e-6);
      assert.ok(Math.abs(uv.x - (x + 0.5) / level.width) < 1e-6);
      assert.ok(Math.abs(uv.y - (1 - (z + 0.5) / level.height)) < 1e-6);
    }
  }
});

test('Legacy generated art covers every tile at gameplay height and keeps props off walkable routes', async () => {
  const level = legacyLevel(), group = new THREE.Group();
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
  const upgraded = group.children.filter((mesh) => ['throne', 'records'].includes(mesh.userData.cathedralProp?.key));
  assert.equal(upgraded.length, 5, 'the throne and four central archive cabinets use the upgraded art');
  for (const mesh of upgraded) {
    assert.equal(mesh.rotation.x, -Math.atan2(14, 10), 'props match the Chapter 1 object pitch');
    assert.equal(mesh.rotation.y, 0, 'front faces stay straight');
    assert.equal(mesh.material.map.magFilter, THREE.NearestFilter);
    if (mesh.userData.cathedralProp.key === 'throne') {
      assert.equal(mesh.material.depthTest, false, 'the altar cannot clip the chair back');
      assert.equal(mesh.renderOrder, 0.5, 'the throne draws after scenery but before units');
      assert.ok(Math.abs(mesh.geometry.parameters.height - 0.85) < 1e-6,
        'the throne matches the bishop infantry silhouette height');
      const { width, height } = mesh.geometry.parameters;
      const depth = height * Math.sin(-mesh.rotation.x);
      const tileX = 12 + 0.5 - level.width / 2;
      const tileZ = 3 + 0.5 - level.height / 2;
      assert.ok(mesh.position.x - width / 2 >= tileX - 0.5);
      assert.ok(mesh.position.x + width / 2 <= tileX + 0.5);
      assert.ok(mesh.position.z - depth >= tileZ - 0.5);
      assert.ok(mesh.position.z <= tileZ + 0.5, 'the entire throne fits its single tile');
    }
    mesh.geometry.computeBoundingBox();
    assert.ok(Math.abs(mesh.geometry.boundingBox.min.y) < 1e-6, 'props pivot at their bases');
    const prop = mesh.userData.cathedralProp;
    assert.equal(mesh.position.y, cathedralElevation(prop.z) + (prop.key === 'records' ? 1 : 0) + 0.08);
  }
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

test('HD Cathedral swatches and physical steps register to the exact tactical grid', async () => {
  const { CATHEDRAL_ATLAS_SIZE, cathedralMaterialKeys, cathedralMaterialRect, cathedralPlanMaterial } =
    await server.ssrLoadModule('/src/levels/cathedral-materials.js');
  const atlas = await readFile(new URL('../assets/tiles/cathedral-hd.png', import.meta.url));
  assert.equal(atlas.readUInt32BE(16), CATHEDRAL_ATLAS_SIZE);
  assert.equal(atlas.readUInt32BE(20), CATHEDRAL_ATLAS_SIZE);
  for (const key of cathedralMaterialKeys) {
    const [x, y, w, h] = cathedralMaterialRect(key);
    assert.ok(x >= 0 && y >= 0 && w > 0 && h > 0 && x + w <= CATHEDRAL_ATLAS_SIZE && y + h <= CATHEDRAL_ATLAS_SIZE);
  }
  const level = legacyLevel(), group = new THREE.Group();
  interiors.addCathedralInterior(THREE, group, level);
  const stairs = group.children.filter(({ name }) => name === 'cathedral-stair-riser');
  assert.equal(stairs.length, 32);
  for (const step of stairs) {
    const { x, z, width, depth } = step.userData.cathedralFootprint;
    const { height } = step.geometry.parameters;
    assert.equal(level.tileIds[z][x], 'cathedral_stairs');
    assert.equal(cathedralPlanMaterial(level.tileIds[z][x], x, z), 'stairs');
    assert.deepEqual([width, depth], [1, 1]);
    assert.ok(Math.abs(step.position.y + height / 2 - cathedralElevation(z) - 0.012) < 1e-8);
    assert.ok(Math.abs(step.position.y - height / 2 - cathedralElevation(z + 1)) < 1e-8);
  }
  const tread = group.getObjectByName('cathedral-ground-stairs');
  assert.equal(tread.count, stairs.length);
  assert.equal(tread.geometry.parameters.width, 1);
  assert.equal(tread.geometry.parameters.height, 1);
  for (const { userData: { cathedralFootprint: footprint } } of group.children) {
    if (!footprint) continue;
    const { x, z, width, depth } = footprint;
    const first = x + (1 - width) / 2;
    const last = x + (width - 1) / 2;
    assert.ok(depth <= 1);
    for (let col = Math.round(first); col <= Math.round(last); col++) {
      if (level.tileIds[z][col] !== 'cathedral_stairs')
        assert.equal(tiles.isLevelTileWalkable(level, col, z), false, `blocked scenery at ${col},${z}`);
    }
  }
});

test('Voss holds the Bishop\'s Throne: +3 Defense, +20 Avoid, 5 HP each turn, migrated into older saves', async () => {
  const level = fresh();
  const voss = level.enemies.find((unit) => unit.id === 'voss');
  assert.deepEqual([voss.x, voss.z], [12, 5]);
  const vossUnit = characters.createEnemyUnit('voss', voss.x, voss.z, voss);
  assert.equal(vossUnit.spriteSet, 'genericBishop');
  assert.equal(vossUnit.weapon.id, 'last-benediction');
  assert.equal(vossUnit.weapon.type, 'Light');
  assert.equal(vossUnit.weapon.requiredRank, 'S');
  assert.equal(inventory.weaponUseBlockReason(vossUnit, vossUnit.weapon), undefined);
  assert.deepEqual(characters.enemyDropIds(vossUnit), ['last-benediction']);
  const { readdir } = await import('node:fs/promises');
  for (const direction of ['south', 'north', 'east', 'west', 'south-east', 'south-west', 'north-east', 'north-west']) {
    await readFile(new URL(`../assets/character/Generic_Bishop/rotations/${direction}.png`, import.meta.url));
    for (const animation of ['Walking', 'The_figure_raises_their_right_hand_to_the_chest_to']) {
      assert.ok((await readdir(new URL(`../assets/character/Generic_Bishop/animations/${animation}/${direction}/`, import.meta.url))).length);
    }
  }
  const throne = terrain.getTerrain(level, 12, 5);
  assert.equal(level.tileIds[5][12], 'cathedral_throne');
  assert.equal(throne.defense, 3);
  assert.equal(throne.avoid, 20);
  assert.equal(throne.healPerTurn, 5);
  assert.equal(throne.walkable, true);
  assert.equal(level.tileIds.flat().filter((id) => id === 'cathedral_throne').length, 1);
  const legacy = structuredClone(legacyRaw);
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
  assert.equal(loaded.level.cathedral.artwork, 'illustrated');
  assert.equal(freshCathedral(loaded.level.cathedral).artwork, 'illustrated');
  const savedCanon = loaded.enemies.find((unit) => unit.id === bolting.id);
  assert.equal(savedCanon.drop, 'thunder-tome');
  assert.equal(savedCanon.inventory[0].spells.bolting, 3);
  const rebuilt = characters.createEnemyUnit(savedCanon.id, savedCanon.x, savedCanon.z, savedCanon);
  rebuilt.inventory = savedCanon.inventory.map(inventory.copyEntry);
  assert.ok(inventory.findWeaponEntry(rebuilt));
  assert.equal(combat.canAttack(rebuilt), true);
  advanceCathedralStory(data.level, [{ hp: 1, z: 21 }]);
  triggerProgressWaves(data.level, [{ hp: 1, z: 21 }], 1);
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
