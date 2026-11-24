import { cathedralElevation, illustratedCathedralSurface } from '../game/cathedral.js';
import cathedralIllustrationUrl from '../../assets/maps/cathedral-interior-hd.png?url';
import { STREET_CAMERA_PADDING } from '../game/camera-bounds.js';
import { cathedralAtlasUrl, cathedralFloorMaterial, cathedralMaterialKeys, cathedralMaterialRect,
  CATHEDRAL_ATLAS_SIZE } from './cathedral-materials.js';

const urls = import.meta.glob('../../assets/tiles/Cathedral_Interior/{altar,throne,window,candles,records,church_banner,order_banner}.png', {
  eager: true, query: '?url', import: 'default',
});
const images = new Map(await Promise.all([
  ...Object.entries(urls).map(([path, url]) => [path.split('/').pop().replace('.png', ''), url]),
  ['hd-atlas', cathedralAtlasUrl],
  ['illustrated', cathedralIllustrationUrl],
].map(async ([key, url]) => {
  const image = new Image();
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = () => reject(new Error(`Could not load Cathedral art ${key}.`));
    image.src = url;
  });
  return [key, image];
})));

export function addCathedralInterior(THREE, group, level) {
  if (level.cathedral.artwork === 'illustrated') {
    const geometry = new THREE.PlaneGeometry(level.width, level.height, 1, level.height);
    geometry.rotateX(-Math.PI / 2);
    const position = geometry.getAttribute('position');
    for (let i = 0; i < position.count; i++) {
      position.setY(i, illustratedCathedralSurface(position.getZ(i) + level.height / 2));
    }
    const map = new THREE.Texture(images.get('illustrated'));
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 8;
    map.needsUpdate = true;
    const interior = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map }));
    interior.name = 'cathedral-illustrated-interior';
    group.add(interior);
    addCathedralFoundation(THREE, group, level, new THREE.MeshBasicMaterial({ color: 0x10131c }));
    finishCathedralInterior(THREE, group);
    return;
  }
  const materials = new Map();
  const atlas = new THREE.Texture(images.get('hd-atlas'));
  const material = (key, transparent = false) => {
    if (materials.has(key)) return materials.get(key);
    const swatch = cathedralMaterialKeys.includes(key);
    if (!swatch && !images.has(key)) throw new Error(`Missing Cathedral texture ${key}.`);
    const texture = swatch ? atlas.clone() : new THREE.Texture(images.get(key));
    if (swatch) {
      const [x, y, w, h] = cathedralMaterialRect(key);
      texture.offset.set(x / CATHEDRAL_ATLAS_SIZE, 1 - (y + h) / CATHEDRAL_ATLAS_SIZE);
      texture.repeat.set(w / CATHEDRAL_ATLAS_SIZE, h / CATHEDRAL_ATLAS_SIZE);
    }
    texture.magFilter = texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    // Props are opaque cutouts so they finish drawing before the unit depth reset below.
    const result = new THREE.MeshBasicMaterial({
      map: texture, alphaTest: transparent ? 0.5 : 0,
      side: THREE.DoubleSide,
    });
    materials.set(key, result);
    return result;
  };
  const wx = (x) => x + 0.5 - level.width / 2;
  const wz = (z) => z + 0.5 - level.height / 2;
  const floorGroups = new Map();
  for (let z = 0; z < level.height; z++) {
    for (let x = 0; x < level.width; x++) {
      const id = level.tileIds[z][x];
      const key = cathedralFloorMaterial(id, x, z);
      if (!floorGroups.has(key)) floorGroups.set(key, []);
      floorGroups.get(key).push({ x, z });
    }
  }
  const plane = new THREE.PlaneGeometry(1, 1);
  plane.rotateX(-Math.PI / 2);
  const matrix = new THREE.Matrix4();
  const tone = new THREE.Color();
  for (const [key, cells] of floorGroups) {
    const mesh = new THREE.InstancedMesh(plane, material(key), cells.length);
    mesh.name = `cathedral-ground-${key}`;
    for (const [index, cell] of cells.entries()) {
      matrix.makeTranslation(wx(cell.x), cathedralElevation(cell.z) + 0.012, wz(cell.z));
      mesh.setMatrixAt(index, matrix);
      const { x, z } = cell;
      const edge = Math.min(x, level.width - 1 - x);
      const altarGlow = Math.max(0, 1 - Math.hypot((x - 12.5) * 0.22, (z - 3) * 0.2));
      const shade = edge < 3 ? 0.77 + edge * 0.055 : z < 11 ? 0.98 : z < 25 ? 0.83 : 0.89;
      tone.setRGB(shade + 0.13 * altarGlow, shade + 0.04 * altarGlow, shade - 0.10 * altarGlow);
      mesh.setColorAt(index, tone);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    mesh.renderOrder = -2;
    group.add(mesh);
  }
  const box = (x, z, w, h, d, top, side, offset = 0, tread = false) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [
      material(side), material(side), material(top), material(side), material(side), material(side),
    ]);
    mesh.position.set(wx(x), cathedralElevation(z) + offset + h / 2, wz(z));
    mesh.userData.cathedralFootprint = { x, z, width: w, depth: d };
    if (tread) {
      // The HD floor plane is the tread surface; this mesh supplies only the riser and sides.
      mesh.geometry.clearGroups();
      for (const index of [0, 1, 3, 4, 5]) mesh.geometry.addGroup(index * 6, 6, index);
      mesh.name = 'cathedral-stair-riser';
    }
    group.add(mesh);
    return mesh;
  };
  for (let z = 0; z < level.height; z++) {
    for (let x = 0; x < level.width; x++) {
      const id = level.tileIds[z][x];
      if (id === 'cathedral_wall') box(x, z, 1, 0.9, 1, 'wall_top', 'wall_side');
      if (id === 'cathedral_rail') box(x, z, 1, 0.5, 0.65, 'rail', 'wall_side');
      if (id === 'cathedral_pillar') {
        box(x, z, 0.96, 0.2, 0.96, 'pillar_top', 'wall_side');
        box(x, z, 0.65, 1.5, 0.65, 'pillar_top', 'pillar_side', 0.2);
        box(x, z, 0.9, 0.16, 0.9, 'pillar_top', 'wall_side', 1.7);
      }
      if (id === 'cathedral_pew' && level.tileIds[z][x - 1] !== id) {
        let width = 1;
        while (level.tileIds[z][x + width] === id) width++;
        box(x + (width - 1) / 2, z, width, 0.5, 0.88, 'pew_top', 'pew_side');
      }
      if (id === 'cathedral_stairs') {
        const rise = cathedralElevation(z) - cathedralElevation(z + 1);
        box(x, z, 1, rise + 0.012, 1, 'stairs', 'wall_side', -rise, true);
      }
    }
  }
  // Elevated tiers have visible risers at the stair walls, not floating floor planes.
  for (const [z, height] of [[12, 1.05], [24, 0.25]]) {
    for (let x = 1; x < level.width - 1; x++) {
      if (level.tileIds[z][x] === 'cathedral_wall') {
        box(x, z, 1, height, 1, 'wall_top', 'wall_side', -height);
      }
    }
  }
  const prop = (key, x, z, width, lift = 0) => {
    const image = images.get(key);
    const height = width * image.height / image.width;
    const geometry = new THREE.PlaneGeometry(width, height);
    geometry.translate(0, height / 2, 0);
    const mesh = new THREE.Mesh(geometry, material(key, true));
    mesh.position.set(wx(x), cathedralElevation(z) + lift + 0.08, wz(z));
    if (key === 'throne' || key === 'records') mesh.rotation.x = -Math.atan2(14, 10);
    if (key === 'throne') {
      // Keep the chair in front of the altar billboard and behind units.
      mesh.material.depthTest = false;
      mesh.renderOrder = 0.5;
    }
    mesh.name = `cathedral-prop-${key}`;
    mesh.userData.cathedralProp = { key, x, z, width };
    group.add(mesh);
  };
  prop('altar', 12.5, 1, 6);
  for (let z = 0; z < level.height; z++) {
    for (let x = 0; x < level.width; x++) {
      if (level.tileIds[z][x] === 'cathedral_throne') {
        const image = images.get('throne');
        prop('throne', x, z + 0.45, 0.85 * image.width / image.height);
      }
    }
  }
  for (const z of [5, 9, 15, 20, 27, 31]) {
    prop('window', 0, z, 0.96, 0.55);
    prop('window', 25, z, 0.96, 0.55);
  }
  for (const [x, z] of [[3, 4], [22, 4], [3, 7], [22, 7], [3, 15], [22, 15], [3, 20], [22, 20], [3, 26], [22, 26], [3, 29], [22, 29], [3, 32], [22, 32]]) {
    prop('candles', x, z, 0.45, 1.9);
  }
  for (const [x, z] of [[10, 16], [15, 17], [10, 19], [15, 20]]) prop('records', x, z, 0.85, 1);
  for (const z of [4, 14, 25, 33]) {
    prop('church_banner', 0, z, 0.85, 0.5);
    prop('order_banner', 25, z, 0.85, 0.5);
  }
  const foundation = material('wall_side').clone();
  foundation.color.set(0x24212b);
  addCathedralFoundation(THREE, group, level, foundation);
  finishCathedralInterior(THREE, group);
}

function addCathedralFoundation(THREE, group, level, material) {
  const surround = new THREE.Mesh(new THREE.PlaneGeometry(
    level.width + STREET_CAMERA_PADDING * 2, level.height + STREET_CAMERA_PADDING * 2),
  material);
  surround.rotation.x = -Math.PI / 2;
  surround.position.y = -0.06;
  surround.name = 'cathedral-scenic-foundation';
  group.add(surround);
}

function finishCathedralInterior(THREE, group) {
  // Unit sprites lean back toward the camera, so walls, pews and upper tiers north of a unit would
  // clip its head. Clearing depth once the Cathedral is drawn keeps every unit above the terrain,
  // while units still depth-sort among themselves.
  const depthReset = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
  depthReset.name = 'cathedral-unit-depth-reset';
  depthReset.frustumCulled = false;
  depthReset.renderOrder = 1;
  depthReset.onBeforeRender = (renderer) => renderer.clearDepth();
  group.add(depthReset);
  group.userData.streetCameraPadding = STREET_CAMERA_PADDING;
}
