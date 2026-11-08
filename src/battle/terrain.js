import { getTileDef, isInfirmaryRecoveryWard } from '../levels/tiles.js';
import { cathedralElevation } from '../game/cathedral.js';

export function getTerrain(level, x, z) {
  const tile = getTileDef(level?.tileIds?.[z]?.[x]);
  if (level?.cathedral && tile.id !== 'unknown') return { ...tile, elevation: cathedralElevation(z) };
  if (!level?.infirmary || tile.id === 'unknown') return tile;
  return {
    ...tile,
    name: tile.id.startsWith('mans_wall') ? 'Infirmary Wall'
      : tile.id === 'mans_door_open' ? 'Ward Doorway'
        : isInfirmaryRecoveryWard(x, z) ? 'Recovery Ward' : 'Infirmary Tile Floor',
  };
}

export function getTileElevation(level, x, z) {
  return getTerrain(level, x, z).elevation;
}
