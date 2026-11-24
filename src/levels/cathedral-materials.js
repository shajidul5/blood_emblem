import atlasUrl from '../../assets/tiles/cathedral-hd.png?url';

export { atlasUrl as cathedralAtlasUrl };

const edges = [0, 313, 627, 941, 1254];
const keys = [
  'marble', 'checker', 'carpet', 'stairs',
  'wall_top', 'wall_side', 'pew_top', 'pew_side',
  'pillar_top', 'pillar_side', 'altar_floor', 'gallery',
  'archive_floor', 'rail', 'blood_mosaic', 'threshold',
];

export const CATHEDRAL_ATLAS_SIZE = edges.at(-1);
export const cathedralMaterialKeys = Object.freeze([...keys, 'carpet-west', 'carpet-east']);

export function cathedralMaterialRect(key) {
  const carpetHalf = key === 'carpet-west' || key === 'carpet-east';
  const index = keys.indexOf(carpetHalf ? 'carpet' : key);
  if (index < 0) throw new Error(`Unknown Cathedral material: ${key}`);
  const col = index % 4, row = Math.floor(index / 4);
  const left = edges[col] + 2, top = edges[row] + 2;
  const width = edges[col + 1] - left - 2, height = edges[row + 1] - top - 2;
  if (carpetHalf) return [left + (key === 'carpet-east' ? width / 2 : 0), top, width / 2, height];
  // Sample one stone tread; the visible step height comes from the actual terrain mesh.
  if (key === 'stairs') return [left, top + 44, width, 54];
  return [left, top, width, height];
}

export function cathedralFloorMaterial(id, x, z) {
  if (id === 'cathedral_carpet' || id === 'cathedral_throne') return x <= 12 ? 'carpet-west' : 'carpet-east';
  if (id === 'cathedral_stairs') return 'stairs';
  if (id === 'cathedral_altar') return 'altar_floor';
  if (z >= 13 && z <= 22) {
    if (x <= 3 || x >= 22) return 'archive_floor';
    return (x === 9 || x === 16) && (z === 15 || z === 20) ? 'blood_mosaic' : 'gallery';
  }
  if (z <= 10) return x === 2 || x === 23 ? 'threshold' : 'marble';
  if (z === 25 || z === 34) return 'threshold';
  return x >= 8 && x <= 17 ? 'checker' : 'marble';
}

const blockedMaterials = {
  cathedral_wall: 'wall_top',
  cathedral_pew: 'pew_top',
  cathedral_pillar: 'pillar_top',
  cathedral_rail: 'rail',
};

export function cathedralPlanMaterial(id, x, z) {
  return blockedMaterials[id] ?? cathedralFloorMaterial(id, x, z);
}
