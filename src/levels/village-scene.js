export const MANOR_TILE_IDS = ['manor_floor', 'manor_block', 'manor_stairs'];
export const WARD_TILE_IDS = ['ward_floor', 'ward_block', 'ward_stairs'];
export const INFIRMARY_TILE_IDS = ['infirmary_floor', 'infirmary_block', 'infirmary_doorway', 'infirmary_recovery'];
export const FOREST_TILE_IDS = ['forest_trail', 'forest_undergrowth', 'forest_thicket', 'forest_bridge', 'forest_block'];
export const CROSSING_TILE_IDS = ['crossing_lane', 'crossing_cover', 'crossing_block'];
export const THRESHOLD_TILE_IDS = ['crossing_deck', 'crossing_parapet', 'bridge_sandbags', 'water_a', 'city_wall', 'threshold_scenery'];
export const STREET_SCENE_TILE_IDS = ['ground_cobble_a', 'ground_cobble_b', 'village_building', 'street_curb', 'street_lamp'];
export const COURTYARD_SCENE_TILE_IDS = ['courtyard_paving', 'courtyard_lawn', 'courtyard_hedge', 'courtyard_wall', 'courtyard_fountain', 'courtyard_cathedral'];
export const VILLAGE_TILE_IDS = ['village_path', 'village_block', ...MANOR_TILE_IDS, ...WARD_TILE_IDS, ...INFIRMARY_TILE_IDS, ...FOREST_TILE_IDS, ...CROSSING_TILE_IDS, 'threshold_scenery'];

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
  infirmary: { width: 36, height: 24, image: 'infirmary', crop: [0, 0, 1536, 1024] },
  streets: { width: 28, height: 28, image: 'streets', crop: [0, 0, 1232, 1232] },
  courtyard: { width: 26, height: 30, image: 'courtyard', crop: [0, 0, 1248, 1440], lighting: 'dusk' },
  ward: {
    width: 48, height: 32, image: 'ward', crop: [0, 0, 1536, 1024],
    // Native-pixel rectangles at the painted wall openings, keyed by blocking tile.
    cellDoorBounds: {
      '6,10': [199, 292, 36, 56],
      '23,10': [730, 292, 38, 56],
      '31,10': [995, 292, 38, 56],
      '15,23': [469, 719, 40, 56],
      '25,23': [803, 719, 40, 56],
    },
  },
});
const COMPACT_WARD = {
  width: 36, height: 24, image: 'ward-compact', crop: [0, 0, 1512, 1008],
  cellDoorBounds: {
    '7,8': [294, 330, 42, 48],
    '17,16': [714, 666, 42, 48],
  },
};
const COMPACT_INFIRMARY = {
  width: 24, height: 18, image: 'infirmary-compact', crop: [0, 0, 1152, 864],
};
export const isForestLayout = (layout) => ['forest', 'camp', 'heart'].includes(layout);

const MANOR_LAYOUTS = ['mansion', 'manor'];
export const isManorLayout = (layout) => MANOR_LAYOUTS.includes(layout);
export const layoutTileIds = (layout) => isManorLayout(layout) ? MANOR_TILE_IDS
  : isForestLayout(layout) ? FOREST_TILE_IDS : layout === 'crossing' ? CROSSING_TILE_IDS
    : layout === 'threshold' ? THRESHOLD_TILE_IDS : layout === 'ward' ? WARD_TILE_IDS
      : layout === 'infirmary' ? INFIRMARY_TILE_IDS
        : layout === 'streets' ? STREET_SCENE_TILE_IDS : layout === 'courtyard' ? COURTYARD_SCENE_TILE_IDS : ['village_path', 'village_block'];
export const layoutDefaultTile = (layout) => layoutTileIds(layout)[0];
const layoutBlockTile = (layout) => layout === 'threshold' ? 'threshold_scenery'
  : layout === 'courtyard' ? 'courtyard_cathedral' : layoutTileIds(layout).find((id) => id.endsWith('_block'));

export function villageLayout(level) {
  const layout = VILLAGE_LAYOUTS[level.villageScene.layout];
  if (level.villageScene.layout === 'courtyard' && ['depth', 'passage', 'redrawn'].includes(level.villageScene.artwork))
    return { ...layout, image: `courtyard-${level.villageScene.artwork}`, facadeRows: 4, facadeRise: 5.6, northCameraExtension: 8 };
  if (level.villageScene.layout === 'courtyard' && ['concept', 'aligned', 'repaired'].includes(level.villageScene.artwork))
    return { ...layout, image: `courtyard-${level.villageScene.artwork}` };
  if (level.villageScene.layout === 'ward' && level.villageScene.artwork === 'compact')
    return COMPACT_WARD;
  if (level.villageScene.layout === 'infirmary' && level.villageScene.artwork === 'compact')
    return COMPACT_INFIRMARY;
  if (level.villageScene.layout === 'streets' && level.villageScene.artwork === 'depth')
    return { ...layout, image: 'streets-depth', crop: [0, 264, 1232, 1232], northBackdrop: 6 };
  if (level.villageScene.layout === 'harbor' && level.villageScene.artwork === 'hd')
    return { ...layout, width: 24, image: 'harbor', crop: [0, 0, 1152, 1008] };
  if (level.villageScene.layout === 'manor' && level.villageScene.artwork === 'hd')
    return { ...layout, image: 'manor-hd', crop: [0, 0, 1152, 960], tint: 0xffffff };
  if (level.villageScene.layout === 'village' && level.villageScene.artwork === 'hd')
    return { ...layout, image: 'village-hd', crop: [0, 0, 2304, 1008] };
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
  const compactWard = value?.layout === 'ward' && value.artwork === 'compact';
  const compactInfirmary = value?.layout === 'infirmary' && value.artwork === 'compact';
  const deepStreets = value?.layout === 'streets' && value.artwork === 'depth';
  const conceptCourtyard = value?.layout === 'courtyard' && ['concept', 'aligned', 'repaired', 'depth', 'passage', 'redrawn'].includes(value.artwork);
  const layout = compactWard ? COMPACT_WARD : compactInfirmary ? COMPACT_INFIRMARY : VILLAGE_LAYOUTS[value?.layout];
  const legacyHarbor = value.layout === 'harbor' && level.width === 24;
  if (value.artwork !== undefined && !compactWard && !compactInfirmary && !deepStreets && !conceptCourtyard && (value.artwork !== 'hd' || (!legacyHarbor && !['manor', 'village'].includes(value.layout))))
    throw new Error('Artwork requires an HD harbor, manor or village, a compact ward or infirmary, depth streets, or a concept courtyard layout.');
  if (value.version !== 1 || !layout || (!legacyHarbor && level.width !== layout.width) || level.height !== layout.height ||
      level.lighting !== (layout.lighting ?? 'night') || level.objects.length ||
      level.tileIds.some((row) => row.some((id) => !layoutTileIds(value.layout).includes(id)))) {
    throw new Error('Village scenes require a version 1 layout, matching lighting, fixed artwork dimensions and matching collision terrain without duplicate props.');
  }
  if (value.layout === 'courtyard' && ['depth', 'passage', 'redrawn'].includes(value.artwork) &&
      level.tileIds.slice(0, 4).some((row) => row.some((id) => id !== 'courtyard_cathedral')))
    throw new Error('Raised courtyard facade rows 0..3 must remain blocked Cathedral scenery.');
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
    ...(value.artwork === undefined ? {} : { artwork: value.artwork }),
    ...(value.playableWidth === undefined ? {} : { playableWidth: value.playableWidth }),
    ...(bounds === undefined ? {} : { cursorBounds: [...bounds] }) };
}

export function addVillageScene(THREE, group, level, image) {
  const { crop, tint, northBackdrop = 0, facadeRows = 0, facadeRise = 0 } = villageLayout(level);
  const texture = new THREE.Texture(image);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.repeat.set(crop[2] / image.width, (crop[3] + northBackdrop * crop[3] / level.height) / image.height);
  texture.offset.set(crop[0] / image.width, 1 - (crop[1] + crop[3]) / image.height);
  texture.needsUpdate = true;
  const geometry = new THREE.PlaneGeometry(level.width, level.height + northBackdrop, 1, facadeRows ? level.height : 1);
  if (facadeRows) {
    // Lift only inaccessible facade rows; the doorway and every gameplay cell stay on the original grid.
    const positions = geometry.attributes.position, base = level.height / 2 - facadeRows;
    for (let i = 0; i < positions.count; i++)
      positions.setZ(i, Math.max(0, positions.getY(i) - base) * facadeRise / facadeRows);
    geometry.computeVertexNormals();
  }
  const mesh = new THREE.Mesh(geometry,
    new THREE.MeshBasicMaterial({ map: texture, color: tint ?? 0xffffff }));
  mesh.name = `illustrated-${level.villageScene.layout}`;
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = .01;
  mesh.position.z = -northBackdrop / 2;
  group.add(mesh);
  const compactInterior = ['ward', 'infirmary'].includes(level.villageScene.layout) && level.villageScene.artwork === 'compact';
  if (['manor', 'streets', 'courtyard'].includes(level.villageScene.layout) || compactInterior) {
    // Close framing can expose the far side of the illustration; keep underground edges dark.
    const surround = new THREE.Mesh(new THREE.PlaneGeometry(level.width + 40, level.height + 40),
      new THREE.MeshBasicMaterial({ color: compactInterior ? 0x080e13 : 0x0b0a12 }));
    surround.name = compactInterior || ['streets', 'courtyard'].includes(level.villageScene.layout)
      ? `${level.villageScene.layout}-dark-surround` : 'manor-night-surround';
    surround.rotation.x = -Math.PI / 2;
    surround.position.y = -.05;
    group.add(surround);
  }
}
