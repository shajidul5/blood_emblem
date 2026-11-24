import { isInWeaponRange } from './combat.js';
import { distanceBetween, findPath, terrainMoveCost, tileKey } from './grid.js';

export function planPursuit(enemy, targets, level, defenders, enemies) {
  if (enemy.frozen || enemy.ai !== 'mobile' || !enemy.weapon) return null;
  const blocked = new Set(defenders.filter(unit => unit.hp > 0).map(({ x, z }) => tileKey(x, z)));
  const occupied = new Set(enemies.filter(unit => unit !== enemy && unit.hp > 0).map(({ x, z }) => tileKey(x, z)));
  const avoidAllies = new Set([...blocked, ...occupied]);
  const pathTo = (target) => {
    const goals = [];
    const range = enemy.weapon.maxRange;
    for (let z = target.z - range; z <= target.z + range; z++) {
      for (let x = target.x - range; x <= target.x + range; x++) {
        if (!avoidAllies.has(tileKey(x, z)) &&
            isInWeaponRange(enemy, target, distanceBetween(x, z, target.x, target.z))) goals.push({ x, z });
      }
    }
    if (!goals.length) return null;
    const route = (obstacles) => {
      const path = findPath(enemy, goals, obstacles, level);
      let cost = 0, stop = 0;
      for (let i = 1; i < path.length; i++) {
        const { x, z } = path[i];
        cost += terrainMoveCost(level, x, z, enemy);
        if (cost <= enemy.movement && !occupied.has(tileKey(x, z))) stop = i;
      }
      return stop > 0 ? { target, path: path.slice(0, stop + 1), cost } : null;
    };
    // Allies can be crossed, but if the cheapest route has no legal stop this turn, try going around.
    return route(blocked) ?? route(avoidAllies);
  };

  const quarry = targets.find(unit => unit.id === enemy.hunts);
  const preferred = quarry && pathTo(quarry);
  if (preferred) return preferred;
  let best = null;
  for (const target of targets) {
    if (target === quarry) continue;
    const plan = pathTo(target);
    if (plan && (!best || plan.cost < best.cost)) best = plan;
  }
  return best;
}
