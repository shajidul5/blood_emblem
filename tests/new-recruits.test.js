import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { createServer } from 'vite';

let server, characters, classes, levels, saves, combat, inventory, grid, progression, defense, rescue, main;
const previousImage = Object.getOwnPropertyDescriptor(globalThis, 'Image');
const json = async (path) => JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), 'utf8'));

before(async () => {
  globalThis.Image = class {
    set src(value) { queueMicrotask(() => this.onload()); }
  };
  server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: 'custom' });
  [characters, classes, levels, saves, combat, inventory, grid, progression, defense, rescue] = await Promise.all([
    '/src/characters/characters.js', '/src/characters/classes.js', '/src/levels/level.js',
    '/src/game/save.js', '/src/battle/combat.js', '/src/characters/inventory.js',
    '/src/battle/grid.js', '/src/characters/progression.js', '/src/game/infirmary.js', '/src/game/rescue.js',
  ].map((file) => server.ssrLoadModule(file)));
  main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
});
after(async () => {
  await server?.close();
  if (previousImage) Object.defineProperty(globalThis, 'Image', previousImage);
  else delete globalThis.Image;
});

function roster() {
  return Object.fromEntries([
    characters.createMaria(), characters.createBartzAlly(), characters.createCypherAlly(),
    characters.createSeymourAlly(), characters.createStarkAlly(), characters.createLinusAlly(),
    characters.createLeonAlly(), characters.createRictorAlly(), characters.createLenaAlly(),
    characters.createArlanAlly(), characters.createSerraAlly(), characters.createTroyAlly(),
    characters.createEvelineAlly(), characters.createCorvisAlly(),
  ].map((unit) => [unit.id, unit]));
}

function deployment(units) {
  const context = {
    roster: units, maria: units.maria, playerTeam: [],
    partyOf: (unit) => unit.party ?? 'maria',
    isWalkable: grid.isWalkable, tileKey: grid.tileKey, distanceBetween: grid.distanceBetween,
  };
  const source = main.slice(main.indexOf('function deployTeam('), main.indexOf('\nfunction serializeCarry('));
  return runInNewContext(`${source}\ndeployTeam`, context);
}

test('both village defenders deploy immediately, remain controllable and survive save/load and prepared restart snapshots', async () => {
  const level = levels.validateLevel(await json('data/levels/map_09_last_crossing.json'));
  const units = roster(), team = deployment(units)(level);
  assert.equal(team.length, 7);
  assert.ok(team.includes(units.linus) && team.includes(units.leon));
  assert.equal(units.linus.hp, 40);
  assert.ok(!units.linus.neutral && !units.leon.neutral);
  const state = rescue.freshRescueState(level);
  assert.equal(state.recruited, true);
  assert.equal(rescue.canRecruitLinus(units.maria, units.linus, state), false);
  const allies = team.filter((unit) => unit.id !== 'maria');
  const chapterStart = { ...saves.serializeUnit(units.maria), allies: allies.map(saves.serializeUnit), prepared: true, deployed: team.map((unit) => unit.id) };
  const data = saves.createSaveData(level, units.maria, [],
    { turn: 1, phase: 'player', defeated: false }, { chapter: 8, allies, rescue: state, chapterStart });
  const saved = saves.parseSave(JSON.stringify(data));
  assert.ok(saved.allies.some((unit) => unit.id === 'leon' && unit.classId === 'mercenary'));
  assert.ok(saved.allies.some((unit) => unit.id === 'linus'));
  assert.equal(saved.rescue.recruited, true);
  assert.deepEqual(saved.allies.find((unit) => unit.id === 'leon').inventory.map((entry) => entry.id),
    ['steel-sword', 'beast-killer', 'potion']);
  assert.ok(saved.chapterStart.allies.some((unit) => unit.id === 'leon'));
  assert.ok(saved.chapterStart.deployed.includes('leon'));
});

test('Beast Killer replaces Leon\'s Iron Sword and triples might only against beasts without altering EXP rules', async () => {
  const leon = characters.createLeonAlly();
  const sword = inventory.INVENTORY_ITEMS.get('beast-killer');
  assert.deepEqual(leon.inventory.map((entry) => entry.id), ['steel-sword', 'beast-killer', 'potion']);
  assert.equal(leon.weapon.id, 'steel-sword');
  assert.equal(sword.name, 'Beast Killer');
  assert.ok(sword.spriteUrl);
  assert.equal(classes.canEquipWeapon(leon, sword), true);
  assert.equal(classes.canEquipWeapon(characters.createSerraAlly(), sword), false);
  leon.weapon = sword;
  assert.equal(classes.weaponSpriteSet(leon), 'leon');
  const level = levels.validateLevel(await json('data/levels/map_09_last_crossing.json'));
  for (const id of ['feral-wolf', 'root-warden', 'bridge-knight']) {
    const placement = level.enemies.find((unit) => unit.id === id);
    const enemy = characters.createEnemyUnit(id, placement.x, placement.z, placement);
    const beast = enemy.type === 'beast';
    assert.equal(combat.isWeaponEffective(leon, enemy), beast);
    assert.equal(combat.getEffectiveMight(leon, enemy), beast ? 21 : 7);
    const reward = combat.getCombatExperience(enemy, true, leon);
    const damage = combat.getCombatDamage(leon, enemy);
    leon.weapon = { ...sword, effect: [] };
    assert.equal(damage - combat.getCombatDamage(leon, enemy), beast ? 14 : 0);
    assert.equal(combat.getCombatExperience(enemy, true, leon), reward);
    if (beast) assert.ok(reward > 45);
    leon.weapon = sword;
  }
});

test('Leon promotes with Orders Emblem at level 20, retaining Sword progress and gaining D axes and personal Hero artwork', () => {
  const leon = characters.createLeonAlly();
  assert.equal(leon.level, 9);
  assert.equal(leon.classId, 'mercenary');
  assert.ok(leon.growthRates.strength >= 65 && leon.growthRates.dexterity >= 65 && leon.growthRates.speed >= 65);
  const axe = inventory.INVENTORY_ITEMS.get('iron-axe');
  assert.equal(classes.canEquipWeapon(leon, axe), false);
  assert.equal(classes.promotionBlockReason(leon, 'master-emblem'), 'Needs level 20');
  leon.level = 20;
  assert.equal(classes.promotionBlockReason(leon, 'master-emblem'), undefined);
  const swordExp = leon.weaponExp.Sword;
  classes.promoteUnit(leon, 'master-emblem');
  assert.equal(leon.classId, 'hero');
  assert.equal(leon.weaponExp.Sword, swordExp);
  assert.equal(leon.weaponExp.Axe, 30);
  assert.equal(classes.canEquipWeapon(leon, axe), true);
  assert.equal(classes.weaponSpriteSet(leon), 'heroLeon');
  assert.equal(leon.sprite, 'assets/character/Hero_Leon/rotations/south.png');
  leon.weapon = axe;
  assert.equal(classes.weaponSpriteSet(leon), 'heroLeonAxe');
  const restored = characters.createLeonAlly();
  classes.applyClass(restored, 'hero');
  restored.weapon = axe;
  assert.equal(classes.weaponSpriteSet(restored), 'heroLeonAxe');
});

test('Serra starts protected at level 3 and can finish a real armored target from range two for more than 45 EXP', async () => {
  const level = levels.validateLevel(await json('data/levels/map_12_infirmary.json'));
  const serra = Object.assign(characters.createSerraAlly(), level.players.find((unit) => unit.id === 'serra'));
  assert.equal(serra.party, 'rictor');
  assert.equal(serra.level, 3);
  assert.equal(serra.growthRates.magic, 80);
  assert.equal(serra.growthRates.dexterity, 75);
  assert.equal(serra.growthRates.speed, 75);
  assert.ok(!level.requiredUnits.includes('serra'));
  const blocked = new Set(level.players.filter((unit) => unit.id !== 'serra').map((unit) => grid.tileKey(unit.x, unit.z)));
  for (const placement of level.enemies) {
    const enemy = characters.createEnemyUnit(placement.id, placement.x, placement.z, placement);
    const goals = grid.DIRECTIONS.map(({ x, z }) => ({ x: serra.x + x, z: serra.z + z }));
    const path = grid.findPath(enemy, goals, blocked, level, enemy);
    assert.ok(!path.length || path.slice(1).reduce((cost, tile) => cost + grid.terrainMoveCost(level, tile.x, tile.z), 0) > enemy.movement);
  }
  const placement = level.reinforcements.find((wave) => wave.turn === 3 && wave.entranceId === 'west').units.find((unit) => unit.id === 'ward-knight');
  const knight = characters.createEnemyUnit(placement.id, placement.x, placement.z, placement);
  assert.ok(knight.defense > knight.resistance);
  const damage = combat.getCombatDamage(serra, knight);
  assert.ok(damage >= 8, 'Fire can finish a weakened armored knight');
  knight.hp = damage;
  serra.x = knight.x;
  serra.z = knight.z + 2;
  assert.equal(combat.isInWeaponRange(serra, knight, 2), true);
  assert.equal(combat.isInWeaponRange(knight, serra, 2), false);
  assert.equal(knight.hp - combat.getCombatDamage(serra, knight), 0);
  const reward = combat.getCombatExperience(knight, true, serra);
  assert.equal(reward, 57);
  serra.experience = 50;
  const result = progression.awardExperience(serra, reward, () => .5);
  assert.equal(result.levelUps, 1);
  assert.equal(serra.experience, 7);
  assert.equal(serra.magic, 9);
  assert.equal(serra.dexterity, 9);
  assert.equal(serra.speed, 9);
});

test('Sage Serra gains staves, Arcane Mastery and supplied promoted artwork without changing Cyrus', () => {
  const serra = characters.createSerraAlly();
  serra.level = 20;
  classes.promoteUnit(serra, 'master-emblem');
  assert.equal(serra.classId, 'sage');
  assert.equal(serra.spriteSet, 'sageSerra');
  assert.equal(serra.sprite, 'assets/character/Sage_Serra/rotations/south.png');
  assert.equal(classes.canEquipWeapon(serra, inventory.INVENTORY_ITEMS.get('heal-staff')), true);
  assert.equal(classes.getUsesMultiplier(serra), 2);
  const cyrus = characters.createCypherAlly();
  classes.promoteUnit(cyrus);
  assert.equal(cyrus.spriteSet, 'sageCypher');
});

test('both recruits follow only their own parties until the reunion, then persist across every combined chapter', async () => {
  const units = roster(), deploy = deployment(units);
  const carry = { allies: [units.leon, units.serra].map(saves.serializeUnit) };
  for (const [file, include, exclude] of [
    ['map_10_golden_threshold.json', 'leon', 'serra'],
    ['map_11_ward.json', null, 'leon'],
    ['map_12_infirmary.json', 'serra', 'leon'],
    ['map_13_procession.json', 'serra', 'leon'],
    ['map_14_courtyard.json', 'serra', 'leon'],
    ['map_15_cathedral.json', 'serra', 'leon'],
  ]) {
    const level = levels.validateLevel(await json(`data/levels/${file}`));
    const team = deploy(level, carry);
    if (include) assert.ok(team.includes(units[include]), file);
    assert.ok(!team.includes(units[exclude]), file);
  }
  for (const file of ['map_16_bell_yard.json', 'map_17_starless_shore.json', 'map_18_waiting_city.json', 'map_19_abyssal_throne.json']) {
    const level = levels.validateLevel(await json(`data/levels/${file}`));
    const team = deploy(level, carry);
    assert.ok(team.includes(units.leon) && team.includes(units.serra), file);
    assert.equal(new Set(team.map((unit) => `${unit.x},${unit.z}`)).size, team.length, file);
    assert.ok(team.every((unit) => grid.isWalkable(level, unit.x, unit.z)), file);
    if (level.bellYard) {
      assert.ok(units.leon.x < level.width / 2 && units.serra.x > level.width / 2, 'reunion retains each party on its own side');
    }
    const without = deploy(level, { allies: [] });
    assert.ok(!without.includes(units.leon) && !without.includes(units.serra), 'old campaigns do not gain phantom recruits');
  }
});

test('Serra and promoted Leon survive save round-trips with equipment, bench state and restart snapshots', async () => {
  const level = levels.validateLevel(await json('data/levels/map_16_bell_yard.json'));
  const units = roster(), team = deployment(units)(level);
  for (const unit of [units.leon, units.serra]) {
    unit.level = 20;
    classes.promoteUnit(unit);
    unit.experience = 68;
  }
  inventory.grantItem(units.leon, 'iron-axe');
  units.leon.weapon = inventory.INVENTORY_ITEMS.get('iron-axe');
  const allies = team.filter((unit) => unit.id !== 'maria');
  const chapterStart = { ...saves.serializeUnit(units.maria), allies: allies.map(saves.serializeUnit) };
  const data = saves.createSaveData(level, units.maria, [],
    { turn: 1, phase: 'player', defeated: false },
    { chapter: 15, allies, chapterStart, isBenched: (unit) => unit.id === 'serra' });
  const saved = saves.parseSave(JSON.stringify(data));
  for (const [id, classId] of [['leon', 'hero'], ['serra', 'sage']]) {
    const unit = saved.allies.find((ally) => ally.id === id);
    assert.equal(unit.classId, classId);
    assert.equal(unit.experience, 68);
    assert.equal(saved.chapterStart.allies.find((ally) => ally.id === id).classId, classId);
  }
  assert.equal(saved.allies.find((unit) => unit.id === 'serra').benched, true);
  assert.equal(saved.allies.find((unit) => unit.id === 'leon').equippedWeaponId, 'iron-axe');
});

test('added pressure stays finite, warned in advance, and queues blocked arrivals instead of teleporting', async () => {
  const level = levels.validateLevel(await json('data/levels/map_12_infirmary.json'));
  for (const [turn, side, enemy] of [[3, 'west', 'ward-knight'], [5, 'east', 'infirmary-rider']]) {
    const wave = level.reinforcements.find((wave) => wave.turn === turn && wave.entranceId === side);
    assert.equal(wave.entranceId, side);
    assert.equal(wave.units.length, 2);
    assert.equal(wave.units.filter((unit) => unit.id === enemy).length, 1);
    assert.match(defense.infirmaryWarning(level, turn - 1), new RegExp(`${side} entrance, turn ${turn}`));
  }
  const rear = level.reinforcements.find((wave) => wave.turn === 8);
  assert.equal(rear.units.length, 2);
  assert.ok(rear.units.every((unit) => unit.id === 'undead' && unit.z === 16));
  assert.equal(level.reinforcements.find((wave) => wave.entranceId === 'carriage').turn, 6);
  for (const wave of level.reinforcements) for (const unit of wave.units) {
    assert.ok(wave.turn >= 2 && wave.turn <= 8);
    assert.ok(grid.isWalkable(level, unit.x, unit.z));
    assert.equal(defense.infirmarySpawnTile(level, unit, [{ ...unit, hp: 1 }]), null);
  }
  assert.match(main, /show\('infirmaryWarning'.*force: true/);
});

test('all supplied recruit forms have eight native facings and complete movement, attack and Sage staff cycles', async () => {
  const loader = await readFile(new URL('../src/characters/animation-loader.js', import.meta.url), 'utf8');
  for (const [folder, actions] of [
    ['Leon', ['walking', 'Attacking']], ['Hero_Leon', ['walking', 'Attacking']],
    ['Hero_Leon/Hero_Axe_leon', ['Attacking']],
    ['Serra', ['walking', 'The_character_holds_a_tome_in_the_left_hand_while']],
    ['Sage_Serra', ['Walking', 'Attacking', 'Staff']],
  ]) {
    for (const direction of ['south', 'south-east', 'east', 'north-east', 'north', 'north-west', 'west', 'south-west']) {
      const base = `assets/character/${folder}`;
      const png = await readFile(new URL(`../${base}/rotations/${direction}.png`, import.meta.url));
      assert.ok(png.readUInt32BE(16) >= 48 && png.readUInt32BE(20) >= 48, folder);
      for (const action of actions) {
        assert.ok(loader.includes(`${folder}/animations/${action}/*/frame_*.png`), `${folder}/${action} registered`);
        const frames = (await readdir(new URL(`../${base}/animations/${action}/${direction}/`, import.meta.url)))
          .filter((name) => /^frame_\d+\.png$/.test(name)).sort();
        assert.ok(frames.length >= 4, `${folder}/${action}/${direction} animates`);
        assert.equal(new Set(frames).size, frames.length);
      }
    }
  }
  assert.match(loader, /result.sageSerraStaffFrames = sageSerraStaffData.attacking/);
});
