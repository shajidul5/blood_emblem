import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createServer } from 'vite';
import * as THREE from 'three';
import {
  advanceBellYardStory, bellYardVictoryReady, canReunite, dueDepartures, freshBellYard, isLiftTile, isTrackTile,
  planWagonMove, wagonRoute,
} from '../src/game/bell-yard.js';

let server, levels, characters, combat, tiles, saves, renderer, raw, story, tutorialScript;
const priorImage = Object.getOwnPropertyDescriptor(globalThis, 'Image');
const priorStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const storage = new Map();
before(async () => {
  globalThis.Image = class {
    set src(value) {
      this.width = this.height = 64;
      queueMicrotask(() => this.onload());
    }
  };
  globalThis.localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  };
  server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: 'custom' });
  [levels, characters, combat, tiles, saves, renderer, tutorialScript] = await Promise.all([
    '/src/levels/level.js', '/src/characters/characters.js', '/src/battle/combat.js', '/src/levels/tiles.js',
    '/src/game/save.js', '/src/levels/bell-yard.js', '/src/game/tutorial.js',
  ].map((path) => server.ssrLoadModule(path)));
  raw = JSON.parse(await readFile(new URL('../data/levels/map_16_bell_yard.json', import.meta.url), 'utf8'));
  story = JSON.parse(await readFile(new URL('../data/tutorials/chapter-16.json', import.meta.url), 'utf8'));
});
after(async () => {
  await server?.close();
  for (const [key, descriptor] of [['Image', priorImage], ['localStorage', priorStorage]]) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
});
const fresh = () => levels.validateLevel(structuredClone(raw));
const wagonsOf = (level) => level.enemies.filter((unit) => unit.id === level.bellYard.wagonId);

function reachable(level, start) {
  const seen = new Set([`${start.x},${start.z}`]), queue = [start];
  for (let i = 0; i < queue.length; i++) {
    const { x, z } = queue[i];
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const next = { x: x + dx, z: z + dz }, key = `${next.x},${next.z}`;
      if (!seen.has(key) && tiles.isLevelTileWalkable(level, next.x, next.z)) {
        seen.add(key); queue.push(next);
      }
    }
  }
  return seen;
}

test('Chapter 16 deploys both parties, requires Maria and Rictor and registers its story', () => {
  const level = fresh();
  assert.equal(levels.CHAPTER_COUNT, 16);
  assert.equal(level.objective, 'bell-lift');
  assert.deepEqual(level.requiredUnits, ['maria', 'rictor']);
  assert.equal(level.players.length, 12);
  assert.equal(new Set(level.players.map((unit) => unit.id)).size, 12);
  assert.throws(() => levels.validateLevel({ ...structuredClone(raw), bellYard: null }), /Bell Yard rules/);
  const enemies = level.enemies.map((unit) => characters.createEnemyUnit(unit.id, unit.x, unit.z, unit));
  const boss = enemies.find((unit) => unit.isBoss && unit.id === level.bellYard.bossId);
  assert.ok(boss);
  assert.ok(isLiftTile(level, boss.x, boss.z));
  assert.ok(enemies.length >= 28);
  for (const id of ['bellYard', 'bellYard-bell', 'bellYard-reunion', 'bellYard-lift', 'bellYard-ending']) {
    assert.ok(story[id]?.pages?.length, `${id} story`);
  }
  assert.equal(tutorialScript.CHAPTER_INTROS[15], 'bellYard');
});

test('Both parties can reach the lift, each other and every chest', () => {
  const level = fresh();
  const maria = level.players.find((unit) => unit.id === 'maria');
  const rictor = level.players.find((unit) => unit.id === 'rictor');
  const fromMaria = reachable(level, maria);
  assert.ok(fromMaria.has(`${rictor.x},${rictor.z}`), 'the parties are connected');
  const lift = level.tileIds.flatMap((row, z) => row.map((id, x) => ({ id, x, z }))).filter(({ id }) => id === 'bell_lift');
  assert.ok(lift.length >= 4);
  assert.ok(lift.some(({ x, z }) => fromMaria.has(`${x},${z}`)));
  for (const chest of level.chests) assert.ok(fromMaria.has(`${chest.x},${chest.z}`), `chest ${chest.id}`);
  for (const unit of level.enemies) assert.ok(tiles.isLevelTileWalkable(level, unit.x, unit.z, { type: 'flying' }), `${unit.id} placement`);
});

test('Chapter 16 combatants match a level-20+ party and its undead have meaningful combat stats', async () => {
  const level = fresh();
  const placements = [...level.enemies, ...level.reinforcements.flatMap((wave) => wave.units)];
  for (const placement of placements.filter((unit) => unit.id !== level.bellYard.wagonId)) {
    const enemy = characters.createEnemyUnit(placement.id, placement.x, placement.z, placement);
    assert.ok(enemy.level >= 22 && enemy.level <= 24, `${enemy.id}: level ${enemy.level}`);
  }
  const undead = characters.createEnemyUnit('bell-undead', 0, 0, { level: 22 });
  assert.equal(undead.hp, 50);
  assert.equal(undead.strength, 18);
  assert.equal(undead.dexterity, 14);
  assert.equal(undead.speed, 8);
  assert.equal(undead.defense, 10);
  assert.equal(undead.resistance, 5);
  assert.equal(undead.movement, 4);
  const old = characters.createEnemyUnit('street-undead', 0, 0);
  assert.equal(old.strength, 6, 'earlier chapters retain their original undead');
  assert.equal(old.speed, 2);
  const fixture = saves.parseSave(await readFile(new URL('../saves/chapter16-level20.json', import.meta.url), 'utf8'));
  const cypher = fixture.allies.find((unit) => unit.id === 'cypher');
  const defender = { ...characters.createCypherAlly(), ...cypher.stats };
  assert.ok(combat.getCombatDamage(undead, defender) >= 10, 'undead threaten a level-20 mage');
  assert.ok(combat.getHitRate(undead, defender) >= 50, 'undead have a meaningful hit rate');
  assert.equal(level.bellYard.cargo.id, 'bell-undead');
  assert.equal(level.bellYard.cargo.level, 22);
});

test('Maria can obtain three western Chest Keys and a wielded anima tome without a thief', async () => {
  const level = fresh();
  const west = reachable(level, level.players.find((unit) => unit.id === 'maria'));
  const chests = level.chests.filter((chest) => chest.x < 18);
  assert.equal(chests.length, 3);
  const keys = level.enemies.filter((unit) => unit.drop === 'chest-key');
  assert.equal(keys.length, chests.length);
  for (const placement of keys) {
    assert.ok(placement.x < 18 && west.has(`${placement.x},${placement.z}`));
  }
  assert.ok(keys.some((unit) => unit.x === 10 && unit.z === 29), 'first key is near Maria at deployment');
  const placement = level.enemies.find((unit) => unit.drop === 'wind-tome');
  assert.ok(placement && placement.x < 18 && west.has(`${placement.x},${placement.z}`));
  const mage = characters.createEnemyUnit(placement.id, placement.x, placement.z, placement);
  assert.equal(mage.weapon.id, mage.drop);
  assert.equal(mage.weapon.type, 'Anima');
  const inventory = await server.ssrLoadModule('/src/characters/inventory.js');
  const cypher = characters.createCypherAlly();
  inventory.grantItem(cypher, mage.drop);
  assert.ok(cypher.inventory.some((entry) => entry.id === 'wind-tome'));
  const fixture = saves.parseSave(await readFile(new URL('../saves/chapter16-level20.json', import.meta.url), 'utf8'));
  assert.deepEqual(fixture.level.enemies, level.enemies, 'portable fixture uses current balance and rewards');
  assert.deepEqual(fixture.level.chests, level.chests);
  assert.deepEqual(fixture.level.reinforcements, level.reinforcements);
  assert.equal(fixture.enemies.filter((unit) => unit.drop === 'chest-key').length, 3);
  assert.ok(fixture.enemies.some((unit) => unit.drop === 'wind-tome' && unit.weaponId === 'wind-tome'));
});

test('Treatment wagons follow the rails to the lift, stop at blockers and spill undead when broken', () => {
  const level = fresh();
  const wagons = wagonsOf(level).map((unit) => characters.createEnemyUnit(unit.id, unit.x, unit.z, unit));
  assert.equal(wagons.length, 2);
  for (const wagon of wagons) {
    assert.equal(wagon.type, 'armor');
    assert.equal(combat.canAttack(wagon), false, 'wagons never attack or counter');
    const route = wagonRoute(level, wagon);
    assert.ok(route.length > 1);
    assert.ok(isLiftTile(level, route.at(-1).x, route.at(-1).z));
    assert.ok(route.slice(1, -1).every(({ x, z }) => isTrackTile(level, x, z) || isLiftTile(level, x, z)));
    const move = planWagonMove(level, wagon, new Set());
    assert.equal(move.path.length, wagon.movement + 1);
    assert.equal(move.escapes, false);
    const blocker = route[2];
    const blocked = planWagonMove(level, wagon, new Set([`${blocker.x},${blocker.z}`]));
    assert.ok(blocked.path.every(({ x, z }) => x !== blocker.x || z !== blocker.z), 'units on the rails stop the wagon');
    const nearLift = { ...wagon, x: route.at(-3).x, z: route.at(-3).z };
    assert.equal(planWagonMove(level, nearLift, new Set()).escapes, true);
  }
  assert.ok(characters.createEnemyUnit(level.bellYard.cargo.id, 0, 0, { level: level.bellYard.cargo.level }));
  assert.equal(dueDepartures(level, 3).length, 0);
  assert.equal(dueDepartures(level, 4).length, 2);
  for (const entry of level.bellYard.departures) assert.ok(isTrackTile(level, entry.x, entry.z));
});

test('Reunion, story beats, victory and restart all track Bell Yard state', () => {
  const level = fresh();
  const maria = { id: 'maria', hp: 20, x: 10, z: 12 };
  const rictor = { id: 'rictor', hp: 20, x: 11, z: 12 };
  assert.equal(canReunite(level, maria, rictor), true);
  assert.equal(canReunite(level, maria, { ...rictor, x: 12 }), false);
  assert.equal(canReunite(level, maria, { id: 'troy', hp: 20, x: 11, z: 12 }), false);
  level.bellYard.reunited = true;
  assert.equal(canReunite(level, maria, rictor), false);
  assert.deepEqual(advanceBellYardStory(level, [maria], 1), []);
  assert.deepEqual(advanceBellYardStory(level, [maria], 2), ['bell']);
  assert.deepEqual(advanceBellYardStory(level, [{ hp: 1, z: 8 }], 3), ['lift']);
  const lift = level.tileIds.flatMap((row, z) => row.map((id, x) => ({ id, x, z }))).filter(({ id }) => id === 'bell_lift');
  const onLift = (unit, tile) => Object.assign(unit, { x: tile.x, z: tile.z });
  onLift(maria, lift[0]); onLift(rictor, lift[1]);
  assert.equal(bellYardVictoryReady(level, [{ id: level.bellYard.bossId }], maria, rictor), false);
  assert.equal(bellYardVictoryReady(level, [], maria, rictor), true);
  assert.equal(bellYardVictoryReady(level, [], maria, { ...rictor, hp: 0 }), false);
  level.bellYard.escaped = 2;
  level.bellYard.departures[0].departed = true;
  const reset = freshBellYard(level.bellYard);
  assert.equal(reset.reunited, false);
  assert.equal(reset.escaped, 0);
  assert.ok(reset.departures.every((entry) => !entry.departed));
  assert.ok(reset.beats.every((beat) => !beat.seen));
  assert.equal(level.bellYard.escaped, 2, 'restart copies rather than mutating');
});

test('Bell Yard state survives a save round-trip', () => {
  const level = fresh();
  const enemies = level.enemies.map((p) => characters.createEnemyUnit(p.id, p.x, p.z, p));
  level.bellYard.reunited = true;
  level.bellYard.escaped = 1;
  level.bellYard.departures[1].departed = true;
  const maria = Object.assign(characters.createMaria(), level.players.find((unit) => unit.id === 'maria'));
  const data = saves.createSaveData(level, maria, enemies,
    { turn: 5, phase: 'player', defeated: false }, { chapter: 15 });
  saves.writeSave(data);
  const loaded = saves.readSave().level.bellYard;
  assert.equal(loaded.reunited, true);
  assert.equal(loaded.escaped, 1);
  assert.equal(loaded.departures[1].departed, true);
});

test('The Bell Yard renderer builds terrain before clearing depth for both armies', async () => {
  const level = fresh(), group = new THREE.Group();
  renderer.addBellYard(THREE, group, level);
  let meshes = 0;
  group.traverse((child) => { if (child.isMesh) meshes++; });
  assert.ok(meshes > 40, `rendered ${meshes} meshes`);
  const surround = group.getObjectByName('bell-yard-rooftops');
  assert.ok(surround.position.y < -0.5, 'scenic rooftops stay below canals and the lift shaft');
  const props = group.children.filter((child) => child.userData.bellYardProp);
  for (const prop of props) {
    assert.equal(prop.rotation.x, -Math.atan2(14, 10), `${prop.name} shares the Chapter 1 object pitch`);
    assert.equal(prop.rotation.y, 0, `${prop.name} faces straight ahead`);
    assert.equal(prop.material.map.magFilter, THREE.NearestFilter);
    prop.geometry.computeBoundingBox();
    assert.ok(Math.abs(prop.geometry.boundingBox.min.y) < 1e-6, 'props pivot at their feet');
  }
  assert.ok(!props.some((prop) => prop.name === 'bell-yard-prop-warehouse_front'),
    'standalone warehouse gates are no longer rendered');
  const warehouses = props.filter((prop) => prop.name === 'bell-yard-prop-warehouse');
  assert.ok(warehouses.length > 0, 'warehouses use whole generated building sprites');
  assert.ok(warehouses.some((building) => {
    const { x, z, width, depth } = building.userData.bellYardFootprint;
    return x === 17 && z === 15 && width === 4 && depth === 3;
  }), 'central building near (18,18) also uses the complete warehouse sprite');
  const isBuildingTile = (id) => ['bell_warehouse', 'bell_tower'].includes(id);
  const covered = new Set();
  for (const building of warehouses) {
    assert.ok(building.geometry.isBufferGeometry && building.geometry.type === 'PlaneGeometry');
    assert.equal(building.material.depthTest, true, 'complete buildings use normal scenery depth');
    const footprint = building.userData.bellYardFootprint;
    const { x, z, width, depth } = footprint;
    assert.ok(building.geometry.parameters.width < width);
    const projectedDepth = building.geometry.parameters.height * Math.sin(-building.rotation.x);
    assert.ok(projectedDepth < depth, 'roof stays within the blocked footprint');
    assert.equal(building.userData.bellYardProp.x, x + (width - 1) / 2);
    assert.equal(building.userData.bellYardProp.z, z + depth - 0.52);
    for (let dz = 0; dz < depth; dz++) {
      for (let dx = 0; dx < width; dx++) {
        assert.ok(isBuildingTile(level.tileIds[z + dz][x + dx]));
        const key = `${x + dx},${z + dz}`;
        assert.ok(!covered.has(key), 'one complete building per warehouse footprint');
        covered.add(key);
      }
    }
  }
  assert.equal(covered.size, level.tileIds.flat().filter(isBuildingTile).length);
  assert.ok(!group.children.some((child) =>
    child.geometry?.type === 'BoxGeometry' && child.userData.bellYardFootprint &&
    isBuildingTile(level.tileIds[child.userData.bellYardFootprint.z][child.userData.bellYardFootprint.x])),
  'warehouse walls and roofs are not assembled from textured boxes');
  assert.ok(props.some((prop) => prop.name === 'bell-yard-prop-clocktower'));
  for (const child of group.children) {
    if (['bell-yard-prop-clocktower', 'bell-yard-prop-lift_headframe'].includes(child.name)) {
      assert.ok(child.userData.bellYardProp.z < 0, 'tall landmarks sit behind playable tiles');
    }
    const reset = group.getObjectByName('bell-yard-unit-depth-reset');
    assert.equal(reset.renderOrder, 1);
    assert.equal(reset.frustumCulled, false);
    assert.ok(group.children.every((child) => child === reset || child.renderOrder < reset.renderOrder));
    let cleared = false;
    reset.onBeforeRender({ clearDepth: () => { cleared = true; } });
    assert.equal(cleared, true);
    const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
    assert.match(main, /unit\.mesh\.renderOrder = activeLevel\.bellYard \|\| activeLevel\.cells\.length \? 2 : 0;/,
      'allied idle and moving sprites render after the reset, without changing earlier chapters');
  }
});

test('Campaign supplies twelve Orders Emblems by Chapter 16, with four reachable yard rewards', async () => {
  const files = await readdir(new URL('../data/levels/', import.meta.url));
  const counts = new Map();
  const countEmblems = (value) => {
    if (!value || typeof value !== 'object') return 0;
    return Object.entries(value).reduce((total, [key, entry]) => {
      if (['rewardId', 'drop'].includes(key) && entry === 'master-emblem') return total + 1;
      if (key === 'stealable' && Array.isArray(entry)) return total + entry.filter((id) => id === 'master-emblem').length;
      return total + countEmblems(entry);
    }, 0);
  };
  for (const file of files) {
    const match = /^map_(\d+)_/.exec(file);
    if (!match || Number(match[1]) > 16) continue;
    counts.set(Number(match[1]), countEmblems(JSON.parse(await readFile(new URL(`../data/levels/${file}`, import.meta.url), 'utf8'))));
  }
  assert.equal([...counts.values()].reduce((sum, count) => sum + count, 0), 12);
  assert.equal(counts.get(16), 4);
  const level = fresh();
  assert.equal(level.chests.length, 5);
  for (const chest of level.chests) {
    assert.ok(chest.z <= 8, `${chest.id} is beyond the canal`);
    assert.ok(!level.enemies.some((unit) => unit.x === chest.x && unit.z === chest.z), `${chest.id} is not occupied`);
  }
  assert.equal(level.chests.find((chest) => chest.id === 'yard-seal').rewardId, 'killer-axe');
});

test('Promoted freight guards threaten promoted level-20 allies even with maximum Leadership and cover', async () => {
  const fixture = saves.parseSave(await readFile(new URL('../saves/chapter16-level20.json', import.meta.url), 'utf8'));
  const insight = await server.ssrLoadModule('/src/game/insight.js');
  const classes = await server.ssrLoadModule('/src/characters/classes.js');
  const inventory = await server.ssrLoadModule('/src/characters/inventory.js');
  const factories = {
    maria: characters.createMaria, bartz: characters.createBartzAlly, cypher: characters.createCypherAlly,
    seymour: characters.createSeymourAlly, stark: characters.createStarkAlly, linus: characters.createLinusAlly,
    rictor: characters.createRictorAlly, lena: characters.createLenaAlly, arlan: characters.createArlanAlly,
    troy: characters.createTroyAlly, eveline: characters.createEvelineAlly, corvis: characters.createCorvisAlly,
  };
  const party = [fixture.player, ...fixture.allies].map((saved) => {
    const unit = Object.assign(factories[saved.id](), saved, saved.stats);
    if (classes.canPromote(unit)) classes.promoteUnit(unit);
    return unit;
  });
  const prior = insight.snapshotInsight();
  insight.restoreInsight({ leadership: insight.MAX_LEADERSHIP });
  try {
    const accuracy = [];
    const ids = ['bell-general', 'bell-paladin', 'bell-sage', 'bell-bolting', 'lift-keeper', 'bell-berserker', 'bell-rotten'];
    const placements = [...fresh().enemies.filter((unit) => ids.includes(unit.id)), { id: 'bell-rotten', level: 24 }];
    for (const placement of placements) {
      const { id } = placement;
      const enemy = characters.createEnemyUnit(id, 0, 0, placement);
      assert.ok(combat.canAttack(enemy), `${id} can use its weapon`);
      for (const ally of party) {
        const hit = combat.getHitRate(enemy, ally, { avoid: 20, defense: 1 });
        const minimum = ['bell-berserker', 'bell-rotten'].includes(id) || enemy.weapon.type === 'Axe' ? 30 :
          id === 'bell-bolting' ? 40 : 50;
        accuracy.push({ enemy: id, ally: ally.id, hit, minimum });
        assert.ok(combat.getHitRate(enemy, ally) >= 50, `${id} has a meaningful hit rate against ${ally.id} in the open`);
      }
      const target = party.find((unit) => unit.id === (id === 'bell-bolting' ? 'arlan' : 'cypher'));
      assert.ok(combat.getCombatDamage(enemy, target, { defense: 1 }) >= 12, `${id} threatens ${target.id}`);
    }
    assert.ok(accuracy.every(({ hit, minimum }) => hit >= minimum), JSON.stringify(accuracy.filter(({ hit, minimum }) => hit < minimum)));
    const paladin = characters.createEnemyUnit('bell-paladin', 0, 0);
    assert.equal(paladin.movement, 8);
    const storm = characters.createEnemyUnit('bell-bolting', 0, 0);
    assert.equal(storm.weapon.minRange, 3);
    assert.equal(storm.weapon.maxRange, 10);
    assert.equal(inventory.spellUses(inventory.findWeaponEntry(storm), storm.weapon), 4);
    assert.equal(characters.createEnemyUnit('cathedral-paladin', 0, 0).dexterity, 14, 'earlier chapters stay unchanged');
    const axe = inventory.INVENTORY_ITEMS.get('killer-axe');
    assert.equal(axe.type, 'Axe');
    assert.equal(axe.critical, 30);
    assert.equal(axe.requiredRank, 'D');
    const bartz = party.find((unit) => unit.id === 'bartz');
    inventory.grantItem(bartz, axe.id);
    assert.ok(classes.canEquipWeapon(bartz, axe), 'Bartz can wield the chest reward');
  } finally {
    insight.restoreInsight(prior);
  }
});

test('Southern pressure is finite, uses nonboss Rotten and waits at blocked entrances', async () => {
  const level = fresh();
  const spawn = await server.ssrLoadModule('/src/game/infirmary.js');
  const rear = level.reinforcements.filter((wave) => wave.units.some((unit) => unit.id === 'bell-rotten'));
  assert.deepEqual(rear.map((wave) => wave.turn), [4, 4, 7, 7]);
  assert.equal(level.enemies.filter((unit) => unit.id === 'bell-berserker').length, 2);
  for (const wave of rear) {
    assert.equal(wave.units.length, 2);
    assert.ok(wave.units.every((unit) => (unit.x < 18) === (wave.units[0].x < 18)), 'each gate queues independently');
    for (const placement of wave.units) {
      assert.equal(placement.z, 33);
      assert.ok(placement.x < 18 || placement.x > 19);
      assert.deepEqual(spawn.infirmarySpawnTile(level, placement, []), { x: placement.x, z: placement.z });
      assert.equal(spawn.infirmarySpawnTile(level, placement, [{ ...placement, hp: 1 }]), null);
      assert.equal(Boolean(characters.createEnemyUnit(placement.id, placement.x, placement.z, placement).isBoss), false);
    }
  }
  const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(main, /activeLevel\.cathedral \|\| activeLevel\.bellYard\s*\? infirmarySpawnTile/);
  assert.match(story.bellYard.pages[1].paragraphs.join(' '), /turns 4 and 7/);
});

test('Generic Berserkers have eight-direction idle, walking and attack art; Killer Axe has its own icon', async () => {
  const directions = ['south', 'north', 'east', 'west', 'south-east', 'south-west', 'north-east', 'north-west'];
  const root = '../assets/character/Generic_Berserker/';
  const files = directions.flatMap((direction) => [
    `${root}rotations/${direction}.png`,
    ...[['Walking', 6], ['Attacking', 9]].flatMap(([animation, count]) =>
      Array.from({ length: count }, (_, frame) =>
        `${root}animations/${animation}/${direction}/frame_${String(frame).padStart(3, '0')}.png`)),
  ]);
  files.push('../assets/weapons/Bell_Yard/killer_axe.png');
  await Promise.all(files.map(async (path) => {
    const png = await readFile(new URL(path, import.meta.url));
    assert.equal(png.subarray(1, 4).toString(), 'PNG', path);
    assert.ok(png.readUInt32BE(16) >= 64 && png.readUInt32BE(20) >= 64, path);
  }));
  assert.equal(characters.createEnemyUnit('bell-berserker', 0, 0).spriteSet, 'genericBerserker');
  const loader = await readFile(new URL('../src/characters/animation-loader.js', import.meta.url), 'utf8');
  assert.match(loader, /\['genericBerserker', 'Generic_Berserker', genericBerserkerIdleSprites, genericBerserkerWalkingFrames, genericBerserkerAttackFrames\]/);
});

test('Portable test save has twelve level-20 allies, four promotions and eight remaining emblems', async () => {
  const fixture = saves.parseSave(await readFile(new URL('../saves/chapter16-level20.json', import.meta.url), 'utf8'));
  const units = [fixture.player, ...fixture.allies];
  assert.equal(fixture.chapter, 15);
  assert.equal(fixture.turn, 1);
  assert.equal(fixture.phase, 'player');
  assert.equal(fixture.insight.insight, 115);
  assert.equal(fixture.chapterStart.insight.insight, 115);
  assert.equal(units.length, 12);
  assert.deepEqual(units.map((unit) => unit.id), fixture.level.players.map((unit) => unit.id));
  const promoted = { maria: 'ravager', rictor: 'templar', arlan: 'general', lena: 'assassin' };
  for (const unit of units) {
    assert.equal(unit.level, 20, unit.id);
    assert.equal(unit.stats.hp, unit.stats.maxHp, unit.id);
    assert.equal(unit.acted, false);
    assert.equal(unit.moved, false);
    if (promoted[unit.id]) assert.equal(unit.classId, promoted[unit.id]);
  }
  const classes = await server.ssrLoadModule('/src/characters/classes.js');
  assert.equal(units.filter((unit) => classes.getClass(unit.classId).tier === 'advanced').length, 4);
  const emblems = fixture.convoy.filter((item) => item.id === 'master-emblem');
  assert.equal(emblems.reduce((sum, item) => sum + item.uses, 0), 8);
  for (const unit of units.filter((unit) => classes.canPromote(unit))) {
    const rebuilt = structuredClone({ ...unit.stats, ...unit });
    classes.promoteUnit(rebuilt);
    assert.equal(classes.getClass(rebuilt.classId).tier, 'advanced');
  }
  assert.equal(fixture.chapterStart.prepared, true);
  assert.deepEqual(fixture.chapterStart.allies, fixture.allies);
  assert.deepEqual(fixture.chapterStart.convoy, fixture.convoy);
  assert.deepEqual(fixture.chapterStart.deployed, units.map((unit) => unit.id));
});

test('Save file export and import preserve slots, current save, state and migration validation', async () => {
  storage.clear();
  const text = await readFile(new URL('../saves/chapter16-level20.json', import.meta.url), 'utf8');
  const original = JSON.parse(text);
  storage.set('blood-emblem-save', text);
  storage.set('blood-emblem-save-slot-1', text);
  const exported = saves.exportSaveFile(1);
  assert.equal(JSON.parse(exported).allies.length, 11);
  assert.deepEqual(JSON.parse(saves.exportSaveFile()), JSON.parse(exported));
  const before = new Map(storage);
  const imported = saves.importSaveFile(exported, 2);
  assert.equal(imported.chapter, 15);
  assert.equal(storage.get('blood-emblem-save'), before.get('blood-emblem-save'));
  assert.equal(storage.get('blood-emblem-save-slot-1'), before.get('blood-emblem-save-slot-1'));
  const slot = JSON.parse(storage.get('blood-emblem-save-slot-2'));
  assert.ok(slot.savedAt);
  assert.deepEqual(slot.level.bellYard, original.level.bellYard);
  assert.deepEqual(slot.allies, original.allies);
  assert.equal(saves.describeSaveSlot(2).chapter, original.level.name);
  saves.loadSlotIntoCurrentSave(2);
  assert.equal(saves.readSave().player.level, 20);
});

test('Invalid imports and unavailable storage never replace existing saves', async () => {
  const text = await readFile(new URL('../saves/chapter16-level20.json', import.meta.url), 'utf8');
  const before = new Map(storage);
  for (const invalid of ['not json', 'null', '{}', JSON.stringify({ ...JSON.parse(text), version: 999 })]) {
    assert.throws(() => saves.importSaveFile(invalid, 2), /Saved game data/);
    assert.deepEqual(storage, before);
  }
  const badEnemy = JSON.parse(text);
  badEnemy.enemies[0].id = 'missing-enemy';
  assert.throws(() => saves.importSaveFile(JSON.stringify(badEnemy), 2), /Saved enemy state/);
  assert.deepEqual(storage, before);
  for (const slot of [0, 4, 1.5, '2', null]) {
    assert.throws(() => saves.importSaveFile(text, slot), /Choose a save slot/);
  }
  assert.throws(() => saves.exportSaveFile(3), /slot is empty/);
  const originalSet = globalThis.localStorage.setItem;
  globalThis.localStorage.setItem = () => { throw new Error('Storage quota exceeded'); };
  try {
    assert.throws(() => saves.importSaveFile(text, 2), /Storage quota exceeded/);
    assert.deepEqual(storage, before);
  } finally {
    globalThis.localStorage.setItem = originalSet;
  }
});
