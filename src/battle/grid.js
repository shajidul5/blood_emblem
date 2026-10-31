import { isInWeaponRange } from './combat.js';
import { isLevelTileWalkable } from '../levels/tiles.js';

export const DIRECTIONS = [
  { x: 0, z: -1 },
  { x: 1, z: 0 },
  { x: 0, z: 1 },
  { x: -1, z: 0 },
];

export function tileKey(x, z) {
  return `${x},${z}`;
}

export function isWalkable(level, x, z) {
  return x >= 0 && x < level.width && z >= 0 && z < level.height &&
    isLevelTileWalkable(level, x, z) &&
    !level.objects?.some((object) =>
      object.x === x && object.z === z && object.blocksMovement);
}

export function findEnemyAt(enemies, x, z) {
  return enemies.find((enemy) => enemy.hp > 0 && enemy.x === x && enemy.z === z);
}

// `enemies` block movement; `allies` can be passed through but not stopped on.
export function getMovementRange(unit, level, enemies, allies = []) {
  const distances = new Map([[tileKey(unit.x, unit.z), 0]]);
  const queue = [{ x: unit.x, z: unit.z }];
  while (queue.length) {
    const current = queue.shift();
    const distance = distances.get(tileKey(current.x, current.z));
    if (distance >= unit.movement) continue;
    for (const direction of DIRECTIONS) {
      const x = current.x + direction.x;
      const z = current.z + direction.z;
      const key = tileKey(x, z);
      if (
        distances.has(key) ||
        !isWalkable(level, x, z) ||
        findEnemyAt(enemies, x, z)
      ) continue;
      distances.set(key, distance + 1);
      queue.push({ x, z });
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

export function findPath(start, goals, blocked, level) {
  const startKey = tileKey(start.x, start.z);
  const goalKeys = new Set(goals.map(({ x, z }) => tileKey(x, z)));
  const previous = new Map([[startKey, null]]);
  const queue = [start];
  let found;
  while (queue.length) {
    const current = queue.shift();
    const key = tileKey(current.x, current.z);
    if (goalKeys.has(key)) {
      found = key;
      break;
    }
    for (const direction of DIRECTIONS) {
      const x = current.x + direction.x;
      const z = current.z + direction.z;
      const nextKey = tileKey(x, z);
      if (
        previous.has(nextKey) ||
        blocked.has(nextKey) ||
        !isWalkable(level, x, z)
      ) continue;
      previous.set(nextKey, key);
      queue.push({ x, z });
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
