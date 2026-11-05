import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';

let server;
let rescue;
let characters;
let insight;
let level;
let grid;
let tiles;
let classes;

before(async () => {
  server = await createServer({ server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom' });
  rescue = await server.ssrLoadModule('/src/game/rescue.js');
  characters = await server.ssrLoadModule('/src/characters/characters.js');
  insight = await server.ssrLoadModule('/src/game/insight.js');
  grid = await server.ssrLoadModule('/src/battle/grid.js');
  tiles = await server.ssrLoadModule('/src/levels/tiles.js');
  classes = await server.ssrLoadModule('/src/characters/classes.js');
  const map = JSON.parse(await readFile(new URL('../data/levels/map_09_last_crossing.json', import.meta.url), 'utf8'));
  level = { ...map, tileIds: map.tiles };
  level.rescue = rescue.validateRescueRules(map.rescue, level);
});

after(async () => { await server?.close(); });

test('three villagers start sheltered and Linus starts wounded, unrecruited', () => {
  const state = rescue.freshRescueState(level);
  assert.equal(state.villagers.length, 3);
  assert.ok(state.villagers.every((unit) => unit.status === 'sheltered' && unit.hp === 26));
  assert.equal(state.linus.hp, 28);
  assert.equal(state.recruited, false);
  assert.equal(state.rewardsClaimed, false);
});

test('Linus is a balanced cavalry unit carrying a Steel Lance and Potion', () => {
  const unit = characters.createLinusAlly();
  assert.equal(unit.classId, 'cavalier');
  assert.equal(unit.movement, 7);
  assert.equal(unit.strength, 15);
  assert.equal(unit.defense, 12);
  assert.deepEqual(unit.inventory.map((entry) => entry.id), ['steel-lance', 'potion']);
});

test('villagers use their own sprite set and portrait instead of Seymour', () => {
  const villager = characters.createVillager('ada', 'Ada');
  assert.equal(villager.spriteSet, 'villager');
  assert.equal(villager.sprite, 'assets/character/Villager/rotations/south.png');
  assert.equal(villager.scale, 1);
  assert.equal(villager.weapon, null);
});

test('Linus promotion and restored class select his personal Paladin sprites', () => {
  const linus = characters.createLinusAlly();
  classes.promoteUnit(linus);
  assert.equal(linus.classId, 'paladin');
  assert.equal(linus.spriteSet, 'paladinLinus');
  assert.equal(linus.sprite, 'assets/character/Paladin_Linus/rotations/south.png');
  assert.equal(linus.movement, 8);
  assert.equal(classes.weaponSpriteSet(linus), 'paladinLinus');
  linus.weapon = { type: 'Sword' };
  assert.equal(classes.weaponSpriteSet(linus), 'paladinLinusSword');
  const restored = characters.createLinusAlly();
  classes.applyClass(restored, linus.classId);
  restored.weapon = { type: 'Sword' };
  assert.equal(classes.weaponSpriteSet(restored), 'paladinLinusSword');
});

test('generic Paladins switch lance and sword sprites without affecting Cavalier Linus', () => {
  const generic = characters.createEnemyUnit('bridge-captain', 0, 0);
  classes.applyClass(generic, 'paladin');
  assert.equal(generic.spriteSet, 'genericPaladin');
  assert.equal(generic.sprite, 'assets/character/Generic_Paladin/rotations/south.png');
  assert.equal(classes.weaponSpriteSet(generic), 'genericPaladin');
  generic.weapon = { type: 'Sword' };
  assert.equal(classes.weaponSpriteSet(generic), 'genericPaladinSword');
  generic.weapon = { type: 'Spear' };
  assert.equal(classes.weaponSpriteSet(generic), 'genericPaladin');
  const linus = characters.createLinusAlly();
  linus.weapon = { type: 'Sword' };
  assert.equal(classes.weaponSpriteSet(linus), 'linusSword');
});

test('captain carries a range 1-2 Javelin and knights hold position', () => {
  const placement = level.enemies.find((unit) => unit.id === level.rescue.captainId);
  const captain = characters.createEnemyUnit(placement.id, placement.x, placement.z, placement);
  assert.equal(captain.weapon.minRange, 1);
  assert.equal(captain.weapon.maxRange, 2);
  assert.equal(captain.drop, 'javelin');
  assert.equal(captain.classId, 'cavalier');
  assert.ok(level.enemies.filter((unit) => unit.id === 'bridge-knight').every((unit) => unit.ai === 'stationary'));
});

test('rescue rewards are cumulative for zero through three survivors', () => {
  assert.deepEqual(rescue.rescueRewardIds(level.rescue, 0), []);
  assert.deepEqual(rescue.rescueRewardIds(level.rescue, 1), ['potion', 'potion']);
  assert.deepEqual(rescue.rescueRewardIds(level.rescue, 2), ['potion', 'potion', 'bloodroot-tonic']);
  assert.deepEqual(rescue.rescueRewardIds(level.rescue, 3), ['potion', 'potion', 'bloodroot-tonic', 'crossing-keepsake']);
});

test('only adjacent Maria can recruit living, unrecruited Linus', () => {
  const state = rescue.freshRescueState(level);
  const linus = { ...state.linus };
  const maria = { id: 'maria', hp: 24, x: linus.x - 1, z: linus.z };
  assert.ok(rescue.canRecruitLinus(maria, linus, state));
  assert.ok(!rescue.canRecruitLinus({ ...maria, id: 'bartz' }, linus, state));
  assert.ok(!rescue.canRecruitLinus({ ...maria, x: 0 }, linus, state));
  assert.ok(!rescue.canRecruitLinus(maria, { ...linus, hp: 0 }, state));
  assert.ok(!rescue.canRecruitLinus(maria, linus, { ...state, recruited: true }));
});

test('escort paths respect three movement and occupied tiles', () => {
  const door = level.houses[0].door;
  const unit = { ...characters.createVillager('ada', 'Ada'), ...door, status: 'escorting' };
  const blocker = { x: door.x - 1, z: door.z, hp: 1 };
  const path = rescue.escortPath(unit, level.rescue.refuge, [unit, blocker], level);
  assert.ok(path.length > 1 && path.length <= unit.movement + 1);
  assert.ok(path.every((tile) => tile.x !== blocker.x || tile.z !== blocker.z));
});

test('a blocked escort waits instead of teleporting through units', () => {
  const unit = { ...characters.createVillager('ada', 'Ada'), ...level.houses[0].door };
  const blockers = [[-1, 0], [1, 0], [0, -1], [0, 1]]
    .map(([dx, dz]) => ({ x: unit.x + dx, z: unit.z + dz, hp: 1 }));
  assert.deepEqual(rescue.escortPath(unit, level.rescue.refuge, [unit, ...blockers], level), []);
});

test('rescued and fallen civilians are no longer active targets', () => {
  assert.ok(rescue.isActiveVillager({ hp: 1, status: 'sheltered' }));
  assert.ok(rescue.isActiveVillager({ hp: 1, status: 'escorting' }));
  assert.ok(!rescue.isActiveVillager({ hp: 1, status: 'rescued' }));
  assert.ok(!rescue.isActiveVillager({ hp: 0, status: 'dead' }));
  assert.deepEqual(rescue.rescueProgress({ villagers: [
    { hp: 20, status: 'rescued' }, { hp: 0, status: 'dead' }, { hp: 20, status: 'escorting' },
  ] }), { rescued: 1, lost: 1, remaining: 1 });
});

test('party leadership does not apply to neutral civilians or unrecruited Linus', () => {
  insight.restoreInsight({ leadership: 2 });
  const linus = characters.createLinusAlly();
  assert.equal(insight.leadershipBonus(linus, 'avoid'), 10);
  assert.equal(insight.leadershipBonus({ ...linus, neutral: true }, 'avoid'), 0);
  assert.equal(insight.leadershipBonus(characters.createVillager('ada', 'Ada'), 'avoid'), 0);
  insight.restoreInsight(null);
});

test('rescue save state round-trips and rejects negative HP, overlaps and duplicate villagers', () => {
  const state = rescue.freshRescueState(level);
  assert.deepEqual(rescue.validateRescueState(state, level, new Set(), []), state);
  const negative = structuredClone(state);
  negative.villagers[0].hp = -1;
  assert.throws(() => rescue.validateRescueState(negative, level, new Set(), []), /villager state/);
  const duplicate = structuredClone(state);
  duplicate.villagers[1] = { ...duplicate.villagers[0] };
  assert.throws(() => rescue.validateRescueState(duplicate, level, new Set(), []), /villager state/);
  const occupied = grid.tileKey(state.villagers[0].x, state.villagers[0].z);
  assert.throws(() => rescue.validateRescueState(state, level, new Set([occupied]), []), /overlap/);
});

test('Linus recruitment and increased promoted HP validate against the saved party', () => {
  const state = rescue.freshRescueState(level);
  state.recruited = true;
  state.linus.hp = 43;
  assert.throws(() => rescue.validateRescueState(state, level, new Set(), []), /Linus/);
  assert.ok(rescue.validateRescueState(state, level, new Set(), [{ id: 'linus', stats: { maxHp: 43 } }]).recruited);
});

test('chapter waves end at turn seven and invalid rescue metadata fails explicitly', () => {
  assert.deepEqual(level.reinforcements.map((wave) => wave.turn), [3, 5, 7]);
  assert.deepEqual(level.reinforcements.map((wave) => wave.units.length), [2, 2, 3]);
  assert.throws(() => rescue.validateRescueRules({ ...level.rescue, villagers: [] }, level), /three unique villagers/);
});

test('sunset bridge is seven tiles wide, reaches the northern edge and has no far bank', () => {
  assert.equal(level.lighting, 'sunset');
  for (let z = 0; z < 8; z++) {
    assert.equal(level.tiles[z].filter((id) => id === 'crossing_deck').length, 7);
    assert.equal(level.tiles[z][10], 'crossing_parapet');
    assert.equal(level.tiles[z][18], 'crossing_parapet');
    assert.ok(level.tiles[z].every((id) => ['water_a', 'water_b', 'crossing_deck', 'crossing_parapet'].includes(id)));
  }
  assert.equal(level.extendEdges, true);
});

test('all villagers are near Linus and have unblocked escort routes through the fenced village', () => {
  const blocks = new Set(level.objects.filter((object) => object.id !== 'lantern')
    .map((object) => grid.tileKey(object.x, object.z)));
  for (const house of level.houses) {
    assert.ok(grid.distanceBetween(house.door.x, house.door.z, level.rescue.recruit.x, level.rescue.recruit.z) <= 7);
    const path = grid.findPath(house.door, level.rescue.refuge, blocks, level);
    assert.ok(path.length > 1, `${house.id} needs a clear escort route`);
    assert.ok(path.every((tile) => tiles.isLevelTileWalkable(level, tile.x, tile.z)));
  }
  const recruitmentGoals = [[-1, 0], [1, 0], [0, -1], [0, 1]]
    .map(([dx, dz]) => ({ x: level.rescue.recruit.x + dx, z: level.rescue.recruit.z + dz }));
  const approach = grid.findPath(level.spawn, recruitmentGoals, blocks, level);
  assert.ok(approach.length > 1, 'Maria must be able to reach Linus');
  assert.ok(approach.length - 1 > grid.distanceBetween(level.spawn.x, level.spawn.z,
    approach.at(-1).x, approach.at(-1).z), 'Fenced lanes should require a detour');
  for (const [i, house] of level.houses.entries()) {
    for (const other of level.houses.slice(i + 1)) {
      assert.ok(grid.distanceBetween(house.door.x, house.door.z, other.door.x, other.door.z) >= 7,
        'House spacing should reward cavalry movement');
    }
  }
});

test('wolves lead the attack, then mobile wolfmen arrive from the southern forest', () => {
  const beasts = level.enemies.filter((unit) => !unit.id.startsWith('bridge-'));
  assert.ok(beasts.every((unit) => unit.id === 'feral-wolf' && unit.z > level.height / 2));
  assert.ok(level.reinforcements[0].units.every((unit) => unit.id === 'feral-wolf'));
  const wolfmen = level.reinforcements.flatMap((wave) =>
    wave.units.filter((unit) => unit.id === 'root-warden').map((unit) => ({ ...unit, turn: wave.turn })));
  assert.equal(wolfmen.length, 3);
  assert.ok(wolfmen.every((unit) => unit.turn >= 5 && unit.ai === 'mobile' && unit.z >= 23));
});

test('opening wolves cannot reach civilians before the party has time to approach Linus', () => {
  const blocked = new Set(level.objects.filter((object) => object.id !== 'lantern')
    .map((object) => grid.tileKey(object.x, object.z)));
  const neighbors = ({ x, z }) => [[-1, 0], [1, 0], [0, -1], [0, 1]]
    .map(([dx, dz]) => ({ x: x + dx, z: z + dz }))
    .filter((tile) => tiles.isLevelTileWalkable(level, tile.x, tile.z));
  const cost = (path) => path.slice(1).reduce((sum, tile) =>
    sum + grid.terrainMoveCost(level, tile.x, tile.z), 0);
  const approach = grid.findPath(level.spawn, neighbors(level.rescue.recruit), blocked, level);
  assert.ok(approach.length > 1 && cost(approach) <= 3 * characters.createMaria().movement);
  for (const wolf of level.enemies.filter((unit) => unit.id === 'feral-wolf')) {
    const unit = characters.createEnemyUnit(wolf.id, wolf.x, wolf.z, wolf);
    for (const house of level.houses) {
      const path = grid.findPath(wolf, neighbors(house.door), blocked, level);
      assert.ok(path.length > 1 && cost(path) > unit.movement * 2,
        'Initial wolves should not reach unrescued civilians during the first two enemy phases');
    }
  }
});

test('fences and bridge parapets block movement, without blocking units or wave spawns', () => {
  for (const id of ['village_fence_h', 'village_fence_v', 'crossing_parapet']) {
    assert.equal(tiles.isTileWalkable(id), false);
  }
  assert.ok(level.tiles.flat().filter((id) => id.startsWith('village_fence_')).length >= 45);
  for (const unit of [...level.players, ...level.enemies, level.rescue.recruit,
    ...level.reinforcements.flatMap((wave) => wave.units)]) {
    assert.ok(tiles.isLevelTileWalkable(level, unit.x, unit.z), `${unit.id} must stand on accessible terrain`);
  }
  for (const object of level.objects) {
    assert.ok(tiles.isLevelTileWalkable(level, object.x, object.z), `${object.id} must not overlap a fence or house`);
  }
});
