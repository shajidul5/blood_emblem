export function throneElevation(z) {
  if (z <= 10) return 1.8;
  if (z === 11) return 1.5;
  if (z <= 17) return 1.2;
  if (z === 18) return 0.9;
  if (z <= 27) return 0.6;
  if (z === 28) return 0.3;
  return 0;
}

export function throneStairAt(level, x, z) {
  return level.abyssalThrone?.stairs?.find((s) =>
    x >= s.x && x < s.x + s.width && z >= s.z && z < s.z + s.depth);
}

export function throneTileElevation(level, x, z) {
  if (!level.abyssalThrone?.stairs) return throneElevation(z);
  const stair = throneStairAt(level, x, z);
  if (stair) return stair.lower + (stair.z + stair.depth - z - 0.5) * 0.4;
  return z <= 11 ? 4.4 : z <= 18 ? 3.2 : z <= 28 ? 2 : 0.8;
}

export function throneFloorElevations(level) {
  const stairs = level.abyssalThrone?.stairs;
  const heights = stairs ? [0.8, 2, 3.2, 4.4, ...stairs.flatMap((s) =>
    Array.from({ length: s.depth }, (_, row) => throneTileElevation(level, s.x, s.z + row)))]
    : [0, 0.3, 0.6, 0.9, 1.2, 1.5, 1.8];
  return [...new Set(heights)].sort((a, b) => b - a);
}

export function canTraverseThroneEdge(level, from, to, unit) {
  if (!level.abyssalThrone?.stairs || unit?.type === 'flying') return true;
  const a = throneStairAt(level, from.x, from.z), b = throneStairAt(level, to.x, to.z);
  if (from.x !== to.x && (a || b)) return a !== undefined && a === b;
  const difference = Math.abs(throneTileElevation(level, from.x, from.z) - throneTileElevation(level, to.x, to.z));
  return difference < (a || b ? 0.401 : 0.001);
}
