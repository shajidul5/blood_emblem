import { isInWeaponRange } from './combat.js';
import { getTileDef, isLevelTileWalkable } from '../levels/tiles.js';

export const DIRECTIONS = [
  { x: 0, z: -1 },
  { x: 1, z: 0 },
  { x: 0, z: 1 },
  { x: -1, z: 0 },
];

export function tileKey(x, z) {
  return `${x},${z}`;
}

export function isWalkable(level, x, z, unit) {
  return x >= 0 && x < level.width && z >= 0 && z < level.height &&
    isLevelTileWalkable(level, x, z, unit) &&
    (unit?.type === 'flying' || !level.objects?.some((object) =>
      object.x === x && object.z === z && object.blocksMovement));
}

export function findEnemyAt(enemies, x, z) {
  return enemies.find((enemy) => enemy.hp > 0 && enemy.x === x && enemy.z === z);
}

// Movement spent to step onto a tile; rough terrain such as dense forest costs more than 1.
export function terrainMoveCost(level, x, z, unit) {
  return unit?.type === 'flying' ? 1 : getTileDef(level.tileIds?.[z]?.[x]).moveCost ?? 1;
}

// `enemies` block movement; `allies` can be passed through but not stopped on.
export function getMovementRange(unit, level, enemies, allies = []) {
  const distances = new Map([[tileKey(unit.x, unit.z), 0]]);
  if (unit.frozen) return distances;
  const open = [{ x: unit.x, z: unit.z, cost: 0 }];
  while (open.length) {
    open.sort((a, b) => a.cost - b.cost);
    const current = open.shift();
    if (current.cost > distances.get(tileKey(current.x, current.z))) continue;
    for (const direction of DIRECTIONS) {
      const x = current.x + direction.x;
      const z = current.z + direction.z;
      const key = tileKey(x, z);
      if (!isWalkable(level, x, z, unit) || findEnemyAt(enemies, x, z)) continue;
      const cost = current.cost + terrainMoveCost(level, x, z, unit);
      if (cost > unit.movement || cost >= (distances.get(key) ?? Infinity)) continue;
      distances.set(key, cost);
      open.push({ x, z, cost });
    }
  }
  for (const ally of allies) {
    if (ally !== unit && ally.hp > 0) distances.delete(tileKey(ally.x, ally.z));
  }
  return distances;
}

export function distanceBetween(ax, az, bx, bz) {
  return Math.abs(ax - bx) + Math.abs(az - bz);
}

export function getFacing(dx, dz) {
  if (dx > 0) return dz < 0 ? 'north-east' : dz > 0 ? 'south-east' : 'east';
  if (dx < 0) return dz < 0 ? 'north-west' : dz > 0 ? 'south-west' : 'west';
  return dz < 0 ? 'north' : 'south';
}

export function findPath(start, goals, blocked, level, unit = start) {
  const startKey = tileKey(start.x, start.z);
  const goalKeys = new Set(goals.map(({ x, z }) => tileKey(x, z)));
  const previous = new Map([[startKey, null]]);
  const best = new Map([[startKey, 0]]);
  const open = [{ x: start.x, z: start.z, cost: 0 }];
  let found;
  while (open.length) {
    open.sort((a, b) => a.cost - b.cost);
    const current = open.shift();
    const key = tileKey(current.x, current.z);
    if (current.cost > best.get(key)) continue;
    if (goalKeys.has(key)) {
      found = key;
      break;
    }
    for (const direction of DIRECTIONS) {
      const x = current.x + direction.x;
      const z = current.z + direction.z;
      const nextKey = tileKey(x, z);
      if (blocked.has(nextKey) || !isWalkable(level, x, z, unit)) continue;
      const cost = current.cost + terrainMoveCost(level, x, z, unit);
      if (cost >= (best.get(nextKey) ?? Infinity)) continue;
      best.set(nextKey, cost);
      previous.set(nextKey, key);
      open.push({ x, z, cost });
    }
  }
  if (!found) return [];
  const path = [];
  for (let key = found; key !== null; key = previous.get(key)) {
    const [x, z] = key.split(',').map(Number);
    path.push({ x, z });
  }
  return path.reverse();
}

export function getAttackTargets(unit, enemies) {
  return enemies.filter((enemy) =>
    isInWeaponRange(unit, enemy, distanceBetween(unit.x, unit.z, enemy.x, enemy.z)));
}
