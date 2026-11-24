import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { inflateSync } from 'node:zlib';
import { createServer } from 'vite';
import * as THREE from 'three';
import { activateShoreTrial, availableBeacon, availableShoreTrial, extinguishBeacon, freshShore,
  shoreVictoryReady, shoreWarning, shoreWaveEnabled } from '../src/game/starless-shore.js';

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

test('chapter 17 fields fourteen allies and 44 enemies on the approved connected 48x40 harbor', () => {
  const level = fresh(), seen = reachable(level);
  assert.equal(levels.CHAPTER_COUNT, 19);
  assert.equal(level.width, 48);
  assert.equal(level.height, 40);
  assert.equal(level.players.length, 14);
  assert.equal(level.enemies.length, 44);
  assert.ok(level.players.some((unit) => unit.id === 'leon'));
  assert.ok(level.players.some((unit) => unit.id === 'serra'));
  assert.deepEqual(level.requiredUnits, ['maria', 'rictor']);
  assert.equal(level.objective, 'silence-beacons');
  for (const entry of [...level.players, ...level.enemies, ...level.reinforcements.flatMap((wave) => wave.units), level.exit]) {
    assert.ok(seen.has(`${entry.x},${entry.z}`), `${entry.id ?? 'exit'} is reachable on foot`);
  }
  for (const fixture of [...level.shore.beacons, ...level.shore.trials]) {
    assert.ok(!tiles.isLevelTileWalkable(level, fixture.x, fixture.z), 'interaction occupies exactly one blocked tile');
    assert.ok([[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dz]) =>
      seen.has(`${fixture.x + dx},${fixture.z + dz}`)).length >= 2);
  }
  const resized = structuredClone(raw);
  resized.width = 47;
  resized.tiles.forEach((row) => row.pop());
  assert.throws(() => levels.validateLevel(resized), /fixed 48x40/);
});

test('four named guardians wield and drop the ancient relics; no relic chests or key drops remain', () => {
  const level = fresh(), seen = reachable(level);
  assert.deepEqual(level.enemies.filter((unit) => unit.drop).map((unit) => unit.drop).sort(),
    ['starless-edge', 'horizon-string', 'tidepiercer', 'keelbreaker'].sort());
  assert.equal(level.chests.length, 0);
  for (const placement of level.enemies.filter((unit) => unit.drop)) {
    const unit = characters.createEnemyUnit(placement.id, placement.x, placement.z, placement);
    assert.equal(unit.weapon.id, placement.drop);
    assert.ok(seen.has(`${unit.x},${unit.z}`));
    assert.equal(level.shore.beacons.filter((beacon) => beacon.guardians.includes(unit.id)).length, 1);
  }
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
  assert.equal(level.enemies.filter((unit) => unit.id === 'shore-halberdier').length, 6);
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
  assert.equal(tiles.isLevelTileWalkable(level, 8, 15, raven), false);
  assert.equal(tiles.isLevelTileWalkable(level, 8, 9, raven), false);
  assert.equal(level.enemies.filter((unit) => unit.id === 'shore-crowman').length, 4);
  const crowman = characters.createEnemyUnit('shore-crowman', 0, 0);
  assert.equal(crowman.type, 'infantry');
  assert.equal(crowman.hunts, undefined, 'crowmen do not inherit the Omen character lock');
  assert.equal(tiles.isLevelTileWalkable(level, 0, 0, crowman), false);
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
  assert.equal(availableBeacon(level, unit), undefined, 'living guardian locks its flame');
  const guardian = characters.createEnemyUnit(beacon.guardians[0], 0, 0);
  assert.equal(availableBeacon(level, unit, [guardian]), undefined);
  assert.equal(availableBeacon(level, unit, [{ ...guardian, hp: 0 }]), beacon);
  assert.equal(availableBeacon(level, unit, []), beacon);
  const wave = level.reinforcements.find((entry) => entry.entranceId === beacon.id);
  wave.spawned = true; wave.spawnedCount = wave.units.length;
  assert.equal(extinguishBeacon(level, unit, []), beacon);
  assert.ok(level.reinforcements.filter((entry) => entry.entranceId === beacon.id).every((entry) => entry.spawned));
  assert.ok(level.reinforcements.filter((entry) => entry.entranceId !== beacon.id).every((entry) => !entry.spawned));
  assert.throws(() => extinguishBeacon(level, unit), /beside/);
  assert.deepEqual([...new Set(level.reinforcements.filter((wave) => wave.turn !== 999).map((entry) => entry.turn))]
    .sort((a, b) => a - b), [5, 9, 13]);
  assert.equal(level.reinforcements.length, 11);
});

test('central flame needs both named guardians, not the ordinary escorts', () => {
  const level = fresh(), beacon = level.shore.beacons[1];
  const unit = { hp: 10, acted: false, x: beacon.x, z: beacon.z + 1 };
  for (const id of beacon.guardians) {
    assert.equal(availableBeacon(level, unit, [{ id, hp: 1 }]), undefined);
    assert.throws(() => extinguishBeacon(level, unit, [{ id, hp: 1 }]), /guardians/);
  }
  assert.equal(availableBeacon(level, unit, [{ id: 'shore-dark-sage', hp: 50 }]), beacon);
});

test('optional instruments accept any ally, schedule a one-time next-player-turn wave, and never expire', () => {
  for (const turn of [1, 27, 1001]) {
    const level = fresh(), trial = level.shore.trials[0];
    const unit = { id: 'leon', hp: 10, acted: false, x: trial.x, z: trial.z + 1 };
    const wave = level.reinforcements.find((entry) => entry.entranceId === trial.id);
    assert.equal(shoreWaveEnabled(level, wave), false);
    assert.equal(availableShoreTrial(level, { ...unit, hp: 0 }), undefined);
    assert.equal(availableShoreTrial(level, { ...unit, acted: true }), undefined);
    assert.equal(availableShoreTrial(level, { ...unit, z: trial.z + 2 }), undefined);
    assert.equal(availableShoreTrial(level, unit), trial);
    assert.equal(activateShoreTrial(level, unit, turn), trial);
    assert.equal(wave.turn, turn + 1);
    assert.equal(wave.spawnedCount, 0);
    assert.equal(shoreWaveEnabled(level, wave), true);
    assert.equal(availableShoreTrial(level, unit), undefined);
    assert.throws(() => activateShoreTrial(level, unit, turn + 1), /unused/);
    const loaded = levels.validateLevel(JSON.parse(JSON.stringify(level)));
    assert.equal(loaded.shore.trials[0].activatedTurn, turn);
    assert.equal(loaded.reinforcements.find((entry) => entry.entranceId === trial.id).turn, turn + 1);
    const reset = freshShore(loaded.shore);
    assert.equal(reset.trials[0].activated, false);
    assert.equal(reset.trials[0].activatedTurn, null);
  }
});

test('trial keepers wield and drop the missing S-rank Anima tomes with finite uses', () => {
  const level = fresh();
  for (const [trialId, keeperId, weaponId] of [
    ['storm-bell', 'shore-storm-custodian', 'heavenfall'],
    ['first-sky', 'shore-horizon-keeper', 'the-last-horizon'],
  ]) {
    const wave = level.reinforcements.find((entry) => entry.entranceId === trialId);
    assert.equal(wave.units.length, 3);
    assert.equal(wave.units[0].id, keeperId);
    assert.equal(wave.units[0].drop, weaponId);
    const unit = characters.createEnemyUnit(keeperId, wave.units[0].x, wave.units[0].z, wave.units[0]);
    assert.equal(unit.weapon.id, weaponId);
    assert.equal(unit.weapon.requiredRank, 'S');
    assert.equal(unit.weapon.type, 'Anima');
    assert.equal(unit.weapon.maxUses, 8);
    assert.equal(unit.inventory[0].id, weaponId);
    assert.ok(!level.enemies.some((enemy) => enemy.id === keeperId));
  }
});

test('the compendium exposes all seven new enemy designs with their actual wielded weapons and battle sets', async () => {
  const catalog = await server.ssrLoadModule('/src/gallery/catalog.js');
  const profiles = catalog.adversaries.filter((profile) => profile.id.startsWith('shore-'));
  assert.equal(profiles.length, 7);
  const keys = new Set();
  for (const profile of profiles) {
    const weapons = catalog.weaponsFor(profile, profile.classId);
    assert.deepEqual(weapons.map((weapon) => weapon.id), [profile.weaponId]);
    const sets = catalog.battleSetsFor(profile, profile.classId);
    assert.equal(sets.length, 1);
    keys.add(sets[0].key);
    assert.notEqual(sets[0].spec.attack.file, sets[0].spec.critical.file);
    const unit = catalog.unitFor(profile, profile.classId, weapons[0]);
    assert.equal(unit.spriteSet, profile.spriteSet);
  }
  assert.equal(keys.size, 7, 'no new enemy shares a generic or another guardian battle set');
});

test('actual turn-spawn path gates optional trials and queues occupied exact entrance tiles', async () => {
  const level = fresh(), enemies = [], party = level.players.map((unit) => ({ ...unit, hp: 1 }));
  const { infirmarySpawnTile } = await server.ssrLoadModule('/src/game/infirmary.js');
  const gameState = { turn: 3 };
  const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  const start = main.indexOf('function spawnTurnReinforcements()');
  const end = main.indexOf('\nasync function endPlayerPhase()', start);
  assert.ok(start >= 0 && end > start);
  const spawn = runInNewContext(`${main.slice(start, end)}\nspawnTurnReinforcements`, {
    activeLevel: level, enemies, gameState, defendingUnits: () => party,
    tileKey: (x,z) => `${x},${z}`,
    infirmaryWaveSealed: () => false, streetWaveEnabled: () => true,
    courtyardWaveEnabled: () => true, cathedralWaveEnabled: () => true,
    shoreWaveEnabled, enemyMovementType: characters.enemyMovementType, infirmarySpawnTile,
    isWalkable: tiles.isLevelTileWalkable, distanceBetween: (ax,az,bx,bz) => Math.abs(ax-bx)+Math.abs(az-bz),
    createEnemy: (x,z,id,placement) => characters.createEnemyUnit(id,x,z,placement),
    levelGroup: { userData: {} },
  });
  assert.equal(spawn().units.length, 0);
  activateShoreTrial(level, { hp: 1, acted: false, x: 8, z: 10 }, 3);
  assert.equal(spawn().units.length, 0, 'never spawn on the activation turn');
  gameState.turn = 4;
  const blocker = { hp: 1, x: 10, z: 7 };
  party.push(blocker);
  assert.equal(spawn().units.length, 0, 'occupied keeper arrival queues the finite wave');
  assert.equal(level.reinforcements.find((wave) => wave.entranceId === 'storm-bell').spawnedCount, 0);
  party.pop();
  const arrived = spawn().units;
  assert.deepEqual(Array.from(arrived, ({id,x,z}) => ({id,x,z})), [
    { id:'shore-storm-custodian', x:10, z:7 }, { id:'shore-drowned', x:5, z:9 }, { id:'shore-drowned', x:10, z:9 },
  ]);
  assert.equal(spawn().units.length, 0, 'completed trial wave cannot spawn twice');
  assert.equal(level.reinforcements.find((wave) => wave.entranceId === 'first-sky').spawned, false);
});

test('beacon cancellation excludes optional waves and dormant trials never appear in arrival warnings', () => {
  const level = fresh();
  assert.match(shoreWarning(level, 1), /turn 5/);
  for (const beacon of level.shore.beacons) {
    extinguishBeacon(level, { hp: 1, acted: false, x: beacon.x, z: beacon.z + 1 }, []);
  }
  assert.equal(shoreWarning(level, 1), 'No further summons');
  const wave = level.reinforcements.find((entry) => entry.entranceId === 'storm-bell');
  assert.equal(wave.spawned, false);
  activateShoreTrial(level, { hp: 1, acted: false, x: 8, z: 10 }, 13);
  assert.match(shoreWarning(level, 13), /turn 14/);
});

test('legacy embedded Shore rules without guardian locks or trials still load and play', () => {
  const legacy = structuredClone(raw);
  delete legacy.shore.trials;
  for (const beacon of legacy.shore.beacons) delete beacon.guardians;
  legacy.reinforcements = legacy.reinforcements.filter((wave) => wave.turn !== 999);
  const level = levels.validateLevel(legacy);
  const beacon = level.shore.beacons[0];
  assert.equal(availableBeacon(level, { hp: 1, acted: false, x: beacon.x, z: beacon.z + 1 }), beacon);
});

test('three silenced beacons and both living leaders on the gate are required to advance', () => {
  const level = fresh(), maria = { hp: 1, x: 22, z: 8 }, rictor = { hp: 1, x: 24, z: 8 };
  assert.equal(shoreVictoryReady(level, maria, rictor), false);
  level.shore.beacons.forEach((beacon) => { beacon.extinguished = true; });
  assert.equal(shoreVictoryReady(level, maria, rictor), true);
  assert.equal(shoreVictoryReady(level, maria, { ...rictor, hp: 0 }), false);
  assert.equal(shoreVictoryReady(level, maria, { ...rictor, z: 9 }), false);
  assert.ok(level.shore.trials.every((trial) => !trial.activated), 'victory never requires optional trials');
});

test('shore state survives level serialization and a restart resets beacons and story only', () => {
  const level = fresh();
  extinguishBeacon(level, { hp: 1, acted: false, x: 12, z: 20 }, []);
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

test('real save parsing retains guardian defeat, beacon cancellation, trials and the fourteen-unit roster', () => {
  const level = fresh();
  extinguishBeacon(level, { hp: 1, acted: false, x: 12, z: 20 }, []);
  activateShoreTrial(level, { hp: 1, acted: false, x: 8, z: 10 }, 4);
  level.shore.silhouetteSeen = true;
  const creators = {
    maria: characters.createMaria, bartz: characters.createBartzAlly, rictor: characters.createRictorAlly,
    cypher: characters.createCypherAlly, seymour: characters.createSeymourAlly, stark: characters.createStarkAlly,
    linus: characters.createLinusAlly, lena: characters.createLenaAlly, arlan: characters.createArlanAlly,
    troy: characters.createTroyAlly, eveline: characters.createEvelineAlly, corvis: characters.createCorvisAlly,
    leon: characters.createLeonAlly, serra: characters.createSerraAlly,
  };
  const team = level.players.map((placement) => Object.assign(creators[placement.id](), placement, { moved: false, acted: false }));
  const enemies = level.enemies.filter((placement) => placement.id !== 'shore-unmoored-duelist')
    .map((placement) => characters.createEnemyUnit(placement.id, placement.x, placement.z, placement));
  const data = saves.createSaveData(level, team.find((unit) => unit.id === 'maria'), enemies,
    { turn: 4, phase: 'player', defeated: false }, { chapter: 16, allies: team.filter((unit) => unit.id !== 'maria') });
  const restored = saves.parseSave(JSON.stringify(data));
  assert.equal(restored.chapter, 16);
  assert.equal(restored.allies.length, 13);
  assert.deepEqual(restored.level.shore, level.shore);
  assert.deepEqual(restored.level.reinforcements, level.reinforcements);
  assert.deepEqual(restored.level.chests, level.chests);
  const future = structuredClone(data);
  future.level.shore.trials[0].activatedTurn = 7;
  future.level.reinforcements.find((wave) => wave.entranceId === 'storm-bell').turn = 8;
  assert.throws(() => saves.parseSave(JSON.stringify(future)), /trial progress/);
  const premature = structuredClone(data);
  premature.level.reinforcements.find((wave) => wave.entranceId === 'storm-bell').spawnedCount = 1;
  assert.throws(() => saves.parseSave(JSON.stringify(premature)), /before their activation/);
  const livingGuardian = structuredClone(data);
  const guardian = characters.createEnemyUnit('shore-unmoored-duelist', 12, 17);
  livingGuardian.enemies.push({ id:guardian.id, x:12, z:17, hp:guardian.hp, maxHp:guardian.maxHp });
  assert.throws(() => saves.parseSave(JSON.stringify(livingGuardian)), /guardian or trial progress/);
});

test('the full HD scene replaces tiled floors and duplicate structures, with live one-tile controls', (t) => {
  t.mock.method(THREE.TextureLoader.prototype, 'load', () => new THREE.Texture());
  const group = new THREE.Group(), level = fresh();
  scenery.addStarlessShore(THREE, group, level);
  const scene = group.userData.shore;
  assert.equal(scene.armories, undefined, 'ruins are already painted, not generic overlays');
  assert.equal(scene.beacons.size, 3);
  assert.equal(scene.trials.size, 2);
  assert.ok(group.getObjectByName('shore-hd-scene'));
  assert.equal(group.getObjectByName('shore-illustrated-floor'), undefined);
  assert.equal(scene.painting.geometry.parameters.width, 48);
  assert.equal(scene.painting.geometry.parameters.height, 40);
  assert.equal(scene.painting.rotation.x, -Math.PI / 2);
  assert.equal(scene.gate, undefined, 'the gate and large trial structures are painted');
  assert.equal(scene.stars.geometry.attributes.position.count, 220);
  assert.equal(scene.silhouette, undefined);
  assert.equal(scene.arrivalMarkers.length, 12);
  assert.deepEqual(scene.arrivalMarkers.map((marker) => marker.userData.arrival).sort((a,b) => a.x-b.x || a.z-b.z),
    [...new Map(level.reinforcements.flatMap((wave) => wave.units).map(({x,z}) => [`${x},${z}`,{x,z}])).values()]
      .sort((a,b) => a.x-b.x || a.z-b.z));
  for (const mesh of scene.beacons.values()) {
    assert.equal(mesh.rotation.x, -Math.atan2(14, 10));
    assert.equal(mesh.material.map.magFilter, THREE.NearestFilter);
    assert.equal(mesh.material.depthTest, false);
  }
  assert.equal(level.shore.beacons.length, 3);
  const trial = level.shore.trials[0];
  trial.activated = true;
  scene.syncTrials();
  assert.equal(scene.trials.get(trial.id).material.color.getHex(), 0x657081);
});

test('collision follows the clean HD scene rather than the obsolete approval grid', async () => {
  const art = JSON.parse(await readFile(new URL('../assets/maps/starless-shore/art.json', import.meta.url), 'utf8'));
  const inside = (x, y, [left, top, right, bottom]) => x >= left && x < right && y >= top && y < bottom;
  assert.equal(raw.shore.artwork, 'scene');
  for (let z = 0; z < raw.height; z++) for (let x = 0; x < raw.width; x++) {
    const px = (x + .5) * art.alignmentWidth / raw.width, py = (z + .5) * art.alignmentHeight / raw.height;
    const land = art.groundAreas.some((area) => inside(px, py, area));
    assert.equal(raw.tiles[z][x] !== 'shore_sea', land, `scene land at ${x},${z}`);
    if (land && art.blockedAreas.some((area) => inside(px, py, area))) {
      assert.equal(raw.tiles[z][x], 'shore_ruin', `painted architecture at ${x},${z} blocks movement`);
    }
  }
  assert.deepEqual(raw.shore.trials.map(({ x, z }) => [x, z]), [[8,9],[39,10]]);
  assert.deepEqual(raw.shore.beacons.map(({ x, z }) => [x, z]), [[12,19],[23,15],[35,19]]);
});

test('the native HD painting is preserved except for removing baked objective fires', async () => {
  const art = JSON.parse(await readFile(new URL('../assets/maps/starless-shore/art.json', import.meta.url), 'utf8'));
  const paeth = (a,b,c) => {
    const p = a+b-c, da = Math.abs(p-a), db = Math.abs(p-b), dc = Math.abs(p-c);
    return da <= db && da <= dc ? a : db <= dc ? b : c;
  };
  const decode = async (file) => {
    const png = await readFile(new URL(`../assets/maps/starless-shore/${file}`, import.meta.url));
    assert.equal(png.readUInt32BE(16), art.sceneWidth);
    assert.equal(png.readUInt32BE(20), art.sceneHeight);
    assert.equal(png[24], 8);
    assert.ok([2,6].includes(png[25]));
    assert.equal(png[28], 0);
    const channels = png[25] === 6 ? 4 : 3, chunks = [];
    for (let offset = 8; offset < png.length;) {
      const length = png.readUInt32BE(offset);
      if (png.toString('ascii', offset + 4, offset + 8) === 'IDAT') chunks.push(png.subarray(offset + 8, offset + 8 + length));
      offset += length + 12;
    }
    const data = inflateSync(Buffer.concat(chunks)), stride = art.sceneWidth * channels;
    const pixels = Buffer.alloc(art.sceneWidth * art.sceneHeight * 3);
    let previous = Buffer.alloc(stride), offset = 0;
    for (let y = 0; y < art.sceneHeight; y++) {
      const filter = data[offset++], row = Buffer.from(data.subarray(offset, offset + stride));
      assert.ok(filter <= 4);
      offset += stride;
      for (let x = 0; x < stride; x++) {
        const left = x >= channels ? row[x-channels] : 0, up = previous[x],
          upperLeft = x >= channels ? previous[x-channels] : 0;
        const prediction = filter === 0 ? 0 : filter === 1 ? left : filter === 2 ? up
          : filter === 3 ? Math.floor((left+up)/2) : paeth(left,up,upperLeft);
        row[x] = (row[x]+prediction) & 255;
      }
      for (let x = 0; x < art.sceneWidth; x++) row.copy(pixels, (y*art.sceneWidth+x)*3, x*channels, x*channels+3);
      previous = row;
    }
    return pixels;
  };
  const [scene, source] = await Promise.all([decode(art.scene), decode(art.sceneSource)]);
  for (let y = 0; y < art.sceneHeight; y++) for (let x = 0; x < art.sceneWidth; x++) {
    const patch = art.scenePatches.find(({ target: [px,py,w,h] }) => x >= px && x < px+w && y >= py && y < py+h);
    const sx = patch ? x - patch.target[0] + patch.source[0] : x;
    const sy = patch ? y - patch.target[1] + patch.source[1] : y;
    const target = (y*art.sceneWidth+x)*3, expected = (sy*art.sceneWidth+sx)*3;
    for (let channel = 0; channel < 3; channel++) assert.equal(scene[target+channel], source[expected+channel]);
  }
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
