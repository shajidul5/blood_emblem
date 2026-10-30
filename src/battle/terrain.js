import { getTileDef } from '../levels/tiles.js';

export function getTerrain(level, x, z) {
  return getTileDef(level?.tileIds?.[z]?.[x]);
}

export function getTileElevation(level, x, z) {
  return getTerrain(level, x, z).elevation;
}
