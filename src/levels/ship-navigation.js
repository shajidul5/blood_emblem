export function canTraverseShipEdge(level, from, to, unit) {
  if (!level.shipScene || unit?.type === 'flying' || from.x === to.x) return true;
  // The illustrated stair flights run north/south; their sides are not landings.
  return level.tileIds[from.z]?.[from.x] !== 'ship_steps' &&
    level.tileIds[to.z]?.[to.x] !== 'ship_steps';
}
