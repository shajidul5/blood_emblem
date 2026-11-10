import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createServer } from 'vite';
import * as THREE from 'three';
import { availableBeacon, extinguishBeacon, freshShore, shoreVictoryReady } from '../src/game/starless-shore.js';

let server, levels, characters, tiles, saves, scenery, raw;
const priorImage = Object.getOwnPropertyDescriptor(globalThis, 'Image');
before(async () => {
  globalThis.Image = class {
    set src(value) {
      this.width = this.height = 64;
      queueMicrotask(() => this.onload());
    }
  };
  server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: 'custom' });
  [levels, characters, tiles, saves, scenery] = await Promise.all([
    '/src/levels/level.js', '/src/characters/characters.js', '/src/levels/tiles.js', '/src/game/save.js', '/src/levels/starless-shore.js',
  ].map((path) => server.ssrLoadModule(path)));
  raw = JSON.parse(await readFile(new URL('../data/levels/map_17_starless_shore.json', import.meta.url), 'utf8'));
});
after(async () => {
  await server?.close();
  if (priorImage) Object.defineProperty(globalThis, 'Image', priorImage);
  else delete globalThis.Image;
});
const fresh = () => levels.validateLevel(structuredClone(raw));
function reachable(level) {
  const queue = [level.spawn], seen = new Set([`${level.spawn.x},${level.spawn.z}`]);
  for (let i = 0; i < queue.length; i++) {
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const { x, z } = queue[i], key = `${x + dx},${z + dz}`;
      if (!seen.has(key) && tiles.isLevelTileWalkable(level, x + dx, z + dz)) {
        seen.add(key); queue.push({ x: x + dx, z: z + dz });
      }
    }
  }
  return seen;
}

test('chapter 17 fields twelve allies in a connected forty-by-thirty-six ancient harbor', () => {
  const level = fresh(), seen = reachable(level);
  assert.equal(levels.CHAPTER_COUNT, 19);
  assert.equal(level.width, 40);
  assert.equal(level.height, 36);
  assert.equal(level.players.length, 12);
  assert.deepEqual(level.requiredUnits, ['maria', 'rictor']);
  assert.equal(level.objective, 'silence-beacons');
  for (const entry of [...level.players, ...level.chests, level.exit]) assert.ok(seen.has(`${entry.x},${entry.z}`));
  for (const beacon of level.shore.beacons) {
    assert.ok([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => seen.has(`${beacon.x + dx},${beacon.z + dz}`)));
  }
});

test('ancient armories offer all four relics and four reachable keys without Lena', () => {
  const level = fresh(), seen = reachable(level);
  assert.deepEqual(level.chests.map((chest) => chest.rewardId).sort(),
    ['starless-edge', 'horizon-string', 'tidepiercer', 'keelbreaker'].sort());
  const keys = level.enemies.filter((unit) => unit.drop === 'chest-key');
  assert.equal(keys.length, 4);
  for (const unit of keys) assert.ok(seen.has(`${unit.x},${unit.z}`));
  assert.equal(level.chests.filter((chest) => chest.x < 20).length, 2);
  assert.equal(level.chests.filter((chest) => chest.x > 20).length, 2);
});

test('only promoted covenant troops and eldritch creatures inhabit the shore, with no chapter 17 boss', async () => {
  const level = fresh();
  const { getClass } = await server.ssrLoadModule('/src/characters/classes.js');
  for (const placement of [...level.enemies, ...level.reinforcements.flatMap((wave) => wave.units)]) {
    assert.ok(placement.id.startsWith('shore-'));
    const unit = characters.createEnemyUnit(placement.id, placement.x, placement.z, placement);
    assert.equal(unit.isBoss, false);
    assert.ok(unit.weapon);
    assert.equal(getClass(unit.classId).tier, ['beast', 'flying'].includes(unit.type) ? 'monster' : 'advanced');
    assert.ok(unit.hp >= 46, `${unit.id} has promoted-tier durability`);
    assert.ok(unit.dexterity >= 36, `${unit.id} has late-game accuracy`);
  }
  assert.equal(level.enemies.filter((unit) => unit.id === 'shore-halberdier').length, 4);
  assert.ok(!level.enemies.some((unit) => /undead|soldier|church|golden/.test(unit.id)));
  const sage = characters.createEnemyUnit('shore-mage', 0, 0);
  assert.equal(sage.spriteSet, 'genericSage');
  assert.equal(sage.weapon.id, 'inferno');
  const halberdier = characters.createEnemyUnit('shore-halberdier', 0, 0);
  assert.equal(halberdier.spriteSet, 'genericHalberdier');
  assert.equal(halberdier.movement, 6);
  const raven = characters.createEnemyUnit('shore-gloam-raven', 0, 0);
  assert.equal(raven.type, 'flying');
  assert.ok(raven.hp > characters.createEnemyUnit('raven', 0, 0).hp);
  assert.equal(tiles.isLevelTileWalkable(level, 0, 0, raven), true);
  assert.equal(tiles.isLevelTileWalkable(level, 3, 14, raven), false);
});

test('every shore enemy threatens promoted level-20 allies through maximum Leadership and cover', async () => {
  const [classes, combat, insight] = await Promise.all([
    '/src/characters/classes.js', '/src/battle/combat.js', '/src/game/insight.js',
  ].map((path) => server.ssrLoadModule(path)));
  const fixture = saves.parseSave(await readFile(new URL('../saves/chapter16-level20.json', import.meta.url), 'utf8'));
  const factories = {
    maria: characters.createMaria, bartz: characters.createBartzAlly, rictor: characters.createRictorAlly,
    cypher: characters.createCypherAlly, seymour: characters.createSeymourAlly, stark: characters.createStarkAlly,
    linus: characters.createLinusAlly, lena: characters.createLenaAlly, arlan: characters.createArlanAlly,
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
    const placements = [...fresh().enemies, ...fresh().reinforcements.flatMap((wave) => wave.units)];
    for (const placement of placements) {
      const enemy = characters.createEnemyUnit(placement.id, placement.x, placement.z, placement);
      assert.ok(combat.canAttack(enemy), `${enemy.id} can wield its promoted loadout`);
      for (const ally of party) {
        assert.ok(combat.getHitRate(enemy, ally) >= 50, `${enemy.id} vs ${ally.id}: at least 50 Hit in the open`);
        assert.ok(combat.getHitRate(enemy, ally, { avoid: 20, defense: 1 }) >= 30,
          `${enemy.id} vs ${ally.id}: at least 30 Hit against cover and full Leadership`);
      }
      const target = party.find((unit) => unit.id === (enemy.weapon.damageType === 'magical' ? 'arlan' : 'cypher'));
      assert.ok(combat.getCombatDamage(enemy, target, { defense: 1 }) >= 12, `${enemy.id} deals at least 12 damage to ${target.id}`);
    }
    assert.equal(characters.createEnemyUnit('undead', 0, 0).classId, 'undead');
    assert.equal(characters.createEnemyUnit('street-undead', 0, 0).strength, 6, 'early chapters are not globally buffed');
  } finally {
    insight.restoreInsight(prior);
  }
});

test('an adjacent unacted unit silences only its beacon and its remaining finite summons', () => {
  const level = fresh(), beacon = level.shore.beacons[0];
  const unit = { hp: 1, acted: false, x: beacon.x, z: beacon.z + 1 };
  assert.equal(availableBeacon(level, { ...unit, acted: true }), undefined);
  assert.equal(availableBeacon(level, { ...unit, hp: 0 }), undefined);
  assert.equal(availableBeacon(level, { ...unit, z: beacon.z + 2 }), undefined);
  assert.equal(availableBeacon(level, unit), beacon);
  const wave = level.reinforcements.find((entry) => entry.entranceId === beacon.id);
  wave.spawned = true; wave.spawnedCount = wave.units.length;
  assert.equal(extinguishBeacon(level, unit), beacon);
  assert.ok(level.reinforcements.filter((entry) => entry.entranceId === beacon.id).every((entry) => entry.spawned));
  assert.ok(level.reinforcements.filter((entry) => entry.entranceId !== beacon.id).every((entry) => !entry.spawned));
  assert.throws(() => extinguishBeacon(level, unit), /beside/);
  assert.deepEqual([...new Set(level.reinforcements.map((entry) => entry.turn))].sort((a, b) => a - b), [5, 9]);
  assert.equal(level.reinforcements.length, 6);
});

test('three silenced beacons and both living leaders on the gate are required to advance', () => {
  const level = fresh(), maria = { hp: 1, x: 19, z: 2 }, rictor = { hp: 1, x: 20, z: 2 };
  assert.equal(shoreVictoryReady(level, maria, rictor), false);
  level.shore.beacons.forEach((beacon) => { beacon.extinguished = true; });
  assert.equal(shoreVictoryReady(level, maria, rictor), true);
  assert.equal(shoreVictoryReady(level, maria, { ...rictor, hp: 0 }), false);
  assert.equal(shoreVictoryReady(level, maria, { ...rictor, z: 5 }), false);
});

test('shore state survives level serialization and a restart resets beacons and story only', () => {
  const level = fresh();
  extinguishBeacon(level, { hp: 1, acted: false, x: 5, z: 24 });
  level.shore.silhouetteSeen = true;
  const loaded = levels.validateLevel(JSON.parse(JSON.stringify(level)));
  assert.deepEqual(loaded.shore, level.shore);
  assert.deepEqual(loaded.reinforcements, level.reinforcements);
  const reset = freshShore(loaded.shore);
  assert.equal(reset.silhouetteSeen, false);
  assert.ok(reset.beacons.every((beacon) => !beacon.extinguished));
  assert.equal(loaded.shore.beacons[0].extinguished, true);
  const malformed = structuredClone(raw);
  malformed.shore.beacons[1].id = malformed.shore.beacons[0].id;
  assert.throws(() => levels.validateLevel(malformed), /unique beacons/);
});

test('real save parsing retains relic chests, beacon cancellation and the reunited roster', () => {
  const level = fresh();
  extinguishBeacon(level, { hp: 1, acted: false, x: 5, z: 24 });
  level.shore.silhouetteSeen = true;
  const creators = {
    maria: characters.createMaria, bartz: characters.createBartzAlly, rictor: characters.createRictorAlly,
    cypher: characters.createCypherAlly, seymour: characters.createSeymourAlly, stark: characters.createStarkAlly,
    linus: characters.createLinusAlly, lena: characters.createLenaAlly, arlan: characters.createArlanAlly,
    troy: characters.createTroyAlly, eveline: characters.createEvelineAlly, corvis: characters.createCorvisAlly,
  };
  const team = level.players.map((placement) => Object.assign(creators[placement.id](), placement, { moved: false, acted: false }));
  const enemies = level.enemies.map((placement) => characters.createEnemyUnit(placement.id, placement.x, placement.z, placement));
  const data = saves.createSaveData(level, team.find((unit) => unit.id === 'maria'), enemies,
    { turn: 4, phase: 'player', defeated: false }, { chapter: 16, allies: team.filter((unit) => unit.id !== 'maria') });
  const restored = saves.parseSave(JSON.stringify(data));
  assert.equal(restored.chapter, 16);
  assert.equal(restored.allies.length, 11);
  assert.deepEqual(restored.level.shore, level.shore);
  assert.deepEqual(restored.level.reinforcements, level.reinforcements);
  assert.deepEqual(restored.level.chests, level.chests);
});

test('generated whole armories, beacons, impossible stars and distant noncombat silhouette render', () => {
  const group = new THREE.Group(), level = fresh();
  scenery.addStarlessShore(THREE, group, level);
  const scene = group.userData.shore;
  assert.equal(scene.armories.length, 2);
  assert.equal(scene.beacons.size, 3);
  assert.equal(scene.moorings.length, 12);
  assert.equal(scene.gate.rotation.x, -Math.atan2(14, 10));
  assert.equal(scene.stars.geometry.attributes.position.count, 220);
  assert.equal(scene.silhouette.renderOrder, 0.5);
  for (const mesh of [...scene.armories, ...scene.beacons.values()]) {
    assert.equal(mesh.rotation.x, -Math.atan2(14, 10));
    assert.equal(mesh.material.map.magFilter, THREE.NearestFilter);
    assert.equal(mesh.material.depthTest, false);
  }
  assert.equal(level.shore.beacons.length, 3);
});

test('new creature art supplies eight rotations plus real movement and attack frames', async () => {
  const directions = ['south', 'south-east', 'east', 'north-east', 'north', 'north-west', 'west', 'south-west'];
  for (const folder of ['Drowned_Beast', 'Tide_Stalker', 'Gloam_Raven']) {
    for (const direction of directions) {
      const base = new URL(`../assets/character/${folder}/`, import.meta.url);
      const png = await readFile(new URL(`rotations/${direction}.png`, base));
      assert.equal(png.readUInt32BE(0), 0x89504e47);
      const actions = folder === 'Gloam_Raven'
        ? ['Hovering_flying_raven_flapping_both_wings_in_a_ste', 'Flying_raven_pulls_its_wings_back_and_lunges_its_b']
        : ['Walking', 'Attacking'];
      for (const action of actions) {
        const frames = await readdir(new URL(`animations/${action}/${direction}/`, base));
        assert.ok(frames.filter((file) => /^frame_\d+\.png$/.test(file)).length >= 4, `${folder}/${action}/${direction}`);
      }
    }
  }
});

test('Generic Halberdier supplies eight directional idle, walking and attacking sprites', async () => {
  const base = new URL('../assets/character/Generic_Halberdier/', import.meta.url);
  for (const direction of ['south', 'south-east', 'east', 'north-east', 'north', 'north-west', 'west', 'south-west']) {
    const png = await readFile(new URL(`rotations/${direction}.png`, base));
    assert.equal(png.readUInt32BE(0), 0x89504e47);
    for (const action of ['walking', 'Attacking']) {
      const frames = await readdir(new URL(`animations/${action}/${direction}/`, base));
      assert.ok(frames.filter((file) => /^frame_\d+\.png$/.test(file)).length >= 4, `${action}/${direction}`);
    }
  }
  const loader = await readFile(new URL('../src/characters/animation-loader.js', import.meta.url), 'utf8');
  assert.match(loader, /\['genericHalberdier', 'Generic_Halberdier', genericHalberdierIdleSprites, genericHalberdierWalkingFrames, genericHalberdierAttackFrames\]/);
});
