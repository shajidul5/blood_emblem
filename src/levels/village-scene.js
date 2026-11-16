export const MANOR_TILE_IDS = ['manor_floor', 'manor_block', 'manor_stairs'];
export const FOREST_TILE_IDS = ['forest_trail', 'forest_undergrowth', 'forest_thicket', 'forest_bridge', 'forest_block'];
export const CROSSING_TILE_IDS = ['crossing_lane', 'crossing_cover', 'crossing_block'];
export const THRESHOLD_TILE_IDS = ['crossing_deck', 'crossing_parapet', 'bridge_sandbags', 'water_a', 'city_wall', 'threshold_scenery'];
export const VILLAGE_TILE_IDS = ['village_path', 'village_block', ...MANOR_TILE_IDS, ...FOREST_TILE_IDS, ...CROSSING_TILE_IDS, 'threshold_scenery'];

export const VILLAGE_LAYOUTS = Object.freeze({
  harbor: { width: 21, height: 21, image: 'village', crop: [0, 0, 336, 336] },
  village: { width: 48, height: 21, image: 'village', crop: [0, 0, 768, 336] },
  // Legacy single-floor art, kept so older embedded Chapter 4 saves still render.
  mansion: { width: 32, height: 32, image: 'mansion', crop: [0, 0, 512, 512] },
  manor: { width: 24, height: 20, image: 'manor', crop: [0, 0, 384, 320], tint: 0x8c88a8 },
  forest: { width: 48, height: 21, image: 'forest', crop: [0, 0, 1536, 672] },
  camp: { width: 48, height: 21, image: 'camp', crop: [0, 0, 1536, 672] },
  heart: { width: 48, height: 32, image: 'heart', crop: [0, 0, 1536, 1024] },
  crossing: { width: 32, height: 32, image: 'crossing', crop: [0, 0, 1024, 1024], lighting: 'sunset' },
  threshold: { width: 23, height: 36, image: 'threshold', crop: [21, 0, 982, 1536], lighting: 'dusk' },
});
export const isForestLayout = (layout) => ['forest', 'camp', 'heart'].includes(layout);

const MANOR_LAYOUTS = ['mansion', 'manor'];
export const isManorLayout = (layout) => MANOR_LAYOUTS.includes(layout);
export const layoutTileIds = (layout) => isManorLayout(layout) ? MANOR_TILE_IDS
  : isForestLayout(layout) ? FOREST_TILE_IDS : layout === 'crossing' ? CROSSING_TILE_IDS
    : layout === 'threshold' ? THRESHOLD_TILE_IDS : ['village_path', 'village_block'];
export const layoutDefaultTile = (layout) => layoutTileIds(layout)[0];
const layoutBlockTile = (layout) => layout === 'threshold' ? 'threshold_scenery' : layoutTileIds(layout).find((id) => id.endsWith('_block'));

export function villageLayout(level) {
  const layout = VILLAGE_LAYOUTS[level.villageScene.layout];
  return level.villageScene.layout === 'harbor' && level.width === 24
    ? { ...layout, width: 24, crop: [0, 0, 384, 336] }
    : layout;
}

export function validateVillageScene(value, level) {
  const hasTiles = level.tileIds.some((row) => row.some((id) => VILLAGE_TILE_IDS.includes(id)));
  if (value === undefined || value === null) {
    if (hasTiles) throw new Error('Illustrated village terrain requires villageScene metadata.');
    return undefined;
  }
  const layout = VILLAGE_LAYOUTS[value?.layout];
  const legacyHarbor = value.layout === 'harbor' && level.width === 24;
  if (value.version !== 1 || !layout || (!legacyHarbor && level.width !== layout.width) || level.height !== layout.height ||
      level.lighting !== (layout.lighting ?? 'night') || level.objects.length ||
      level.tileIds.some((row) => row.some((id) => !layoutTileIds(value.layout).includes(id)))) {
    throw new Error('Village scenes require a version 1 layout, matching lighting, fixed artwork dimensions and matching collision terrain without duplicate props.');
  }
  if (value.playableWidth !== undefined &&
      (!Number.isInteger(value.playableWidth) || value.playableWidth < 1 || value.playableWidth > level.width ||
       level.tileIds.some((row) => row.slice(value.playableWidth).some((id) => id !== layoutBlockTile(value.layout))))) {
    throw new Error('Village playableWidth must fit the artwork and leave only blocked scenery outside it.');
  }
  const bounds = value.cursorBounds;
  if (bounds !== undefined) {
    const [minX, minZ, maxX, maxZ] = Array.isArray(bounds) ? bounds : [];
    if (bounds.length !== 4 || !bounds.every(Number.isInteger) || minX < 0 || minZ < 0 ||
        maxX >= level.width || maxZ >= level.height || minX > maxX || minZ > maxZ ||
        level.tileIds.some((row, z) => row.some((id, x) => id !== layoutBlockTile(value.layout) &&
          (x < minX || x > maxX || z < minZ || z > maxZ)))) {
      throw new Error('Village cursorBounds must fit the artwork and contain every non-scenery tile.');
    }
  }
  return { version: 1, layout: value.layout,
    ...(value.playableWidth === undefined ? {} : { playableWidth: value.playableWidth }),
    ...(bounds === undefined ? {} : { cursorBounds: [...bounds] }) };
}

export function addVillageScene(THREE, group, level, image) {
  const { crop, tint } = villageLayout(level);
  const texture = new THREE.Texture(image);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.repeat.set(crop[2] / image.width, crop[3] / image.height);
  texture.offset.set(crop[0] / image.width, 1 - (crop[1] + crop[3]) / image.height);
  texture.needsUpdate = true;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(level.width, level.height),
    new THREE.MeshBasicMaterial({ map: texture, color: tint ?? 0xffffff }));
  mesh.name = `illustrated-${level.villageScene.layout}`;
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = .01;
  group.add(mesh);
  if (level.villageScene.layout === 'manor') {
    // The manor camera shows past the side walls at the far edge; fill that with night, not empty space.
    const surround = new THREE.Mesh(new THREE.PlaneGeometry(level.width + 40, level.height + 40),
      new THREE.MeshBasicMaterial({ color: 0x0b0a12 }));
    surround.name = 'manor-night-surround';
    surround.rotation.x = -Math.PI / 2;
    surround.position.y = -.05;
    group.add(surround);
  }
}
