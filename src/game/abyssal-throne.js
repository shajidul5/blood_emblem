import { isLevelTileWalkable } from '../levels/tiles.js';
export { throneElevation } from '../levels/throne-terraces.js';

export const THRONE_BEATS = ['receding', 'congregation', 'testament', 'emblem', 'silence'];

export function validateAbyssalThrone(rules, level) {
  const hasTerrain = level.tileIds.some((row) => row.some((id) => id.startsWith('throne_')));
  if (!rules) {
    if (hasTerrain) throw new Error('Throne terrain requires Abyssal Throne rules.');
    return undefined;
  }
  const point = (p) => Number.isInteger(p?.x) && Number.isInteger(p?.z) &&
    p.x >= 0 && p.x < level.width && p.z >= 0 && p.z < level.height;
  if (level.objective !== 'defeat-boss' || rules.bossId !== 'throne-vael' ||
      level.enemies.filter((unit) => unit.id === rules.bossId).length !== 1 ||
      level.reinforcements.length !== 0 || typeof rules.awakened !== 'boolean' ||
      !Number.isInteger(rules.nextRuinTurn) || rules.nextRuinTurn < 1 ||
      !Array.isArray(rules.beats) || rules.beats.length !== THRONE_BEATS.length ||
      !rules.beats.every((beat, i) => beat.id === THRONE_BEATS[i] && typeof beat.seen === 'boolean') ||
      !Array.isArray(rules.structures) || !Array.isArray(rules.props)) {
    throw new Error('Abyssal Throne needs Vael, five story beats, structures and finite ruin state; no summons.');
  }
  const covered = new Set();
  if (rules.stairs !== undefined) {
    const stairTiles = new Set();
    if (!Array.isArray(rules.stairs) || rules.stairs.length !== 9 ||
        !rules.stairs.every((s) => point(s) && s.width === 2 && s.depth === 3 &&
          s.x + s.width <= level.width && s.z + s.depth <= level.height &&
          [[27, 0.8], [17, 2], [10, 3.2]].some(([z, lower]) => s.z === z && s.lower === lower))) {
      throw new Error('Throne stairs require nine two-wide, three-long ascending runs.');
    }
    for (const s of rules.stairs) for (let z = s.z; z < s.z + 3; z++) for (let x = s.x; x < s.x + 2; x++) {
      const key = `${x},${z}`;
      if (stairTiles.has(key) || level.tileIds[z][x] !== 'throne_stairs') {
        throw new Error('Throne stair runs must uniquely cover their walkable stair terrain.');
      }
      stairTiles.add(key);
    }
    if (stairTiles.size !== level.tileIds.flat().filter((id) => id === 'throne_stairs').length) {
      throw new Error('Every throne stair tile must belong to a stair run.');
    }
  }
  if (rules.awakened !== rules.beats.find((beat) => beat.id === 'silence').seen) {
    throw new Error('Throne awakening must match the final story beat.');
  }
  for (const s of rules.structures) {
    if (!['throne-sanctuary', 'mausoleum', 'scripture-hall'].includes(s?.sprite) ||
        !point(s) || !Number.isInteger(s.width) || s.width < 1 || s.width > 8 ||
        !Number.isInteger(s.depth) || s.depth < 1 || s.depth > 6 ||
        s.x + s.width > level.width || s.z + s.depth > level.height) {
      throw new Error('Invalid south-facing throne structure.');
    }
    for (let z = s.z; z < s.z + s.depth; z++) for (let x = s.x; x < s.x + s.width; x++) {
      const key = `${x},${z}`;
      if (covered.has(key) || level.tileIds[z][x] !== 'throne_building') {
        throw new Error('Throne structures must uniquely cover blocked building footprints.');
      }
      covered.add(key);
    }
  }
  if (covered.size !== level.tileIds.flat().filter((id) => id === 'throne_building').length ||
      !rules.props.every((p) => point(p) &&
        ['stairs', 'worshipper', 'abyss-anchor', 'emblem-socket'].includes(p.sprite))) {
    throw new Error('Throne scenery must match the authored map.');
  }
  if (rules.ruin !== null && (!rules.awakened || !Number.isInteger(rules.ruin?.turn) ||
      rules.ruin.turn < 1 || !Array.isArray(rules.ruin.tiles) || rules.ruin.tiles.length < 1 ||
      rules.ruin.tiles.length > 5 || !rules.ruin.tiles.every((p) => point(p) &&
        isLevelTileWalkable(level, p.x, p.z)))) {
    throw new Error('Foretold Ruin requires at most five valid marked floor tiles and a player turn.');
  }
  return structuredClone(rules);
}

export function freshAbyssalThrone(rules) {
  return rules ? { ...structuredClone(rules), awakened: false, nextRuinTurn: 1, ruin: null,
    beats: rules.beats.map((beat) => ({ ...beat, seen: false })) } : undefined;
}

export function advanceThroneStory(level, team) {
  const rules = level.abyssalThrone;
  if (!rules) return [];
  const living = team.filter((unit) => unit.hp > 0 && !unit.benched && unit.mesh?.visible !== false);
  const triggers = [
    living.some((u) => u.z <= 28),
    living.some((u) => u.z <= 23),
    living.some((u) => u.z <= 18),
    living.some((u) => u.id === 'maria' && Math.abs(u.x - 36) + Math.abs(u.z - 28) <= 5) ||
      living.some((u) => u.id === 'maria' && u.z <= 11),
    living.some((u) => u.z <= 11),
  ];
  const beats = [];
  for (const [i, beat] of rules.beats.entries()) {
    if (triggers[i] && !beat.seen) { beat.seen = true; beats.push(beat.id); }
  }
  if (triggers[4]) rules.awakened = true;
  return beats;
}

export const isBenedictionTurn = (level, turn) => Boolean(level.abyssalThrone?.awakened && turn % 3 === 0);

export function performBenediction(level, boss, enemies, turn) {
  if (!isBenedictionTurn(level, turn) || boss.id !== level.abyssalThrone.bossId ||
      boss.hp <= 0) return null;
  const target = enemies.filter((u) => u !== boss && u.hp > 0 && u.hp < u.maxHp &&
    Math.abs(u.x - boss.x) + Math.abs(u.z - boss.z) <= 6)
    .sort((a, b) => (b.maxHp - b.hp) - (a.maxHp - a.hp))[0];
  if (!target) return { target: null, healed: 0 };
  const healed = Math.min(30, target.maxHp - target.hp);
  target.hp += healed;
  return { target, healed };
}

export function prepareForetoldRuin(level, turn, team, enemies) {
  const rules = level.abyssalThrone;
  const boss = enemies.find((unit) => unit.id === rules?.bossId && unit.hp > 0);
  if (!boss || !rules.awakened || rules.ruin || turn < rules.nextRuinTurn ||
      isBenedictionTurn(level, turn)) return null;
  const target = team.filter((u) => u.hp > 0 && !u.benched && u.mesh?.visible !== false &&
    isLevelTileWalkable(level, u.x, u.z) &&
    Math.abs(u.x - boss.x) + Math.abs(u.z - boss.z) <= 9)
    .sort((a, b) => b.hp - a.hp)[0];
  if (!target) return null;
  const tiles = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]
    .map(([dx, dz]) => ({ x: target.x + dx, z: target.z + dz }))
    .filter(({ x, z }) => isLevelTileWalkable(level, x, z));
  rules.ruin = { turn, tiles };
  return rules.ruin;
}

export function resolveForetoldRuin(level, turn, team, enemies) {
  const rules = level.abyssalThrone;
  if (!rules?.ruin || turn < rules.ruin.turn) return [];
  const marked = new Set(rules.ruin.tiles.map(({ x, z }) => `${x},${z}`));
  rules.ruin = null;
  rules.nextRuinTurn = turn + 3;
  if (!enemies.some((u) => u.id === rules.bossId && u.hp > 0)) return [];
  return team.filter((u) => u.hp > 0 && marked.has(`${u.x},${u.z}`)).map((unit) => {
    const damage = Math.min(22, unit.hp);
    unit.hp -= damage;
    return { unit, damage };
  });
}
