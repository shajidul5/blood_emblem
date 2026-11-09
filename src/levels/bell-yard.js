import { STREET_CAMERA_PADDING } from '../game/camera-bounds.js';

const urls = import.meta.glob('../../assets/tiles/Bell_Yard/*.png', {
  eager: true, query: '?url', import: 'default',
});
const loadImage = (key, url) => new Promise((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve([key, image]);
  image.onerror = () => reject(new Error(`Could not load Bell Yard art ${key}.`));
  image.src = url;
});
const images = new Map(await Promise.all([
  ...Object.entries(urls).map(([path, url]) => loadImage(path.split('/').pop().replace('.png', ''), url)),
]));

const CANAL_DEPTH = 0.32;
const hash = (x, z) => ((Math.imul(x + 31, 73856093) ^ Math.imul(z + 17, 19349663)) >>> 0) % 100;

export function addBellYard(THREE, group, level) {
  const materials = new Map();
  const material = (key, transparent = false) => {
    const id = `${key}:${transparent}`;
    if (materials.has(id)) return materials.get(id);
    const image = images.get(key);
    if (!image) throw new Error(`Missing Bell Yard texture ${key}.`);
    const texture = new THREE.Texture(image);
    texture.magFilter = texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    const result = new THREE.MeshBasicMaterial({ map: texture, alphaTest: transparent ? 0.5 : 0, side: THREE.DoubleSide });
    materials.set(id, result);
    return result;
  };
  const tile = (x, z) => level.tileIds[z]?.[x];
  const wx = (x) => x + 0.5 - level.width / 2;
  const wz = (z) => z + 0.5 - level.height / 2;
  const isRail = (x, z) => ['bell_track', 'bell_track_bridge'].includes(tile(x, z));
  const isWater = (id) => id === 'bell_canal' || id === 'bell_bridge' || id === 'bell_track_bridge';

  const floors = new Map();
  const addFloor = (key, x, z, y = 0) => {
    if (!floors.has(key)) floors.set(key, []);
    floors.get(key).push({ x, z, y });
  };
  for (let z = 0; z < level.height; z++) {
    for (let x = 0; x < level.width; x++) {
      const id = tile(x, z);
      if (isWater(id)) addFloor('canal', x, z, -CANAL_DEPTH);
      if (id === 'bell_track' || id === 'bell_track_bridge') {
        const ew = isRail(x - 1, z) || isRail(x + 1, z);
        const ns = isRail(x, z - 1) || isRail(x, z + 1);
        addFloor(ew && ns ? 'track_cross' : ew ? 'track_ew' : 'track_ns', x, z, id === 'bell_track_bridge' ? 0.02 : 0);
      } else if (id === 'bell_bridge') addFloor('bridge', x, z, 0.02);
      else if (id === 'bell_plaza') addFloor('plaza', x, z);
      else if (id === 'bell_lift') addFloor('lift_floor', x, z, 0.04);
      else if (id === 'bell_shaft') addFloor('shaft', x, z, -0.5);
      else if (id !== 'bell_canal') {
        const roll = hash(x, z);
        addFloor(roll < 12 ? 'cobble_stain' : roll < 40 ? 'cobble_worn' : 'cobble', x, z);
      }
    }
  }
  const plane = new THREE.PlaneGeometry(1, 1);
  plane.rotateX(-Math.PI / 2);
  const matrix = new THREE.Matrix4();
  for (const [key, cells] of floors) {
    const mesh = new THREE.InstancedMesh(plane, material(key), cells.length);
    mesh.name = `bell-yard-ground-${key}`;
    for (const [index, cell] of cells.entries()) {
      matrix.makeTranslation(wx(cell.x), cell.y + 0.012, wz(cell.z));
      mesh.setMatrixAt(index, matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.renderOrder = -2;
    group.add(mesh);
  }

  const box = (x, z, w, h, d, top, side, offset = 0) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [
      material(side), material(side), material(top), material(side), material(side), material(side),
    ]);
    mesh.position.set(wx(x), offset + h / 2, wz(z));
    mesh.userData.bellYardFootprint = { x, z, width: w, depth: d };
    group.add(mesh);
    return mesh;
  };
  for (let z = 0; z < level.height; z++) {
    for (let x = 0; x < level.width; x++) {
      const id = tile(x, z);
      // Granite quay walls line every canal and shaft edge.
      if (!isWater(id) && id !== 'bell_shaft' &&
          [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => tile(x + dx, z + dz) === 'bell_canal')) {
        box(x, z, 1, CANAL_DEPTH, 1, 'quay', 'quay', -CANAL_DEPTH);
      }
      if (id === 'bell_lift') box(x, z, 1, 0.5, 1, 'lift_floor', 'brick_wall', -0.46);
    }
  }

  const prop = (key, x, z, width, lift = 0) => {
    const image = images.get(key);
    const height = width * image.height / image.width;
    const geometry = new THREE.PlaneGeometry(width, height);
    geometry.translate(0, height / 2, 0);
    const mesh = new THREE.Mesh(geometry, material(key, true));
    mesh.position.set(wx(x), lift + 0.04, wz(z));
    mesh.rotation.x = -Math.atan2(14, 10);
    mesh.name = `bell-yard-prop-${key}`;
    mesh.userData.bellYardProp = { key, x, z, width };
    group.add(mesh);
    return mesh;
  };

  const lift = [];
  for (let z = 0; z < level.height; z++) {
    for (let x = 0; x < level.width; x++) {
      const id = tile(x, z);
      if (id === 'bell_lift') lift.push({ x, z });
      if (id === 'bell_crates') prop('crates', x, z + 0.2, 0.92);
      if (id === 'bell_winch') prop('winch', x, z + 0.3, 1.05);
    }
  }
  const centre = (cells) => ({
    x: cells.reduce((sum, cell) => sum + cell.x, 0) / cells.length,
    z: cells.reduce((sum, cell) => sum + cell.z, 0) / cells.length,
  });
  if (lift.length) {
    const { x } = centre(lift);
    prop('lift_headframe', x, Math.min(...lift.map((cell) => cell.z)) - 2, 4.2);
  }
  // Tall landmarks stand north of the map so their billboards never hide a playable tile.
  prop('clocktower', level.width - 7, -2.5, 2.1);

  // Whole generated buildings replace separate wall, roof and door layers.
  const seen = new Set();
  for (let z = 0; z < level.height; z++) {
    for (let x = 0; x < level.width; x++) {
      const buildingTile = tile(x, z);
      if (!['bell_warehouse', 'bell_tower'].includes(buildingTile) || seen.has(`${x},${z}`)) continue;
      const cells = [];
      const queue = [{ x, z }];
      seen.add(`${x},${z}`);
      while (queue.length) {
        const cell = queue.pop();
        cells.push(cell);
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const next = { x: cell.x + dx, z: cell.z + dz };
          if (tile(next.x, next.z) === buildingTile && !seen.has(`${next.x},${next.z}`)) {
            seen.add(`${next.x},${next.z}`);
            queue.push(next);
          }
        }
      }
      const south = Math.max(...cells.map((cell) => cell.z));
      const north = Math.min(...cells.map((cell) => cell.z));
      const west = Math.min(...cells.map((cell) => cell.x));
      const east = Math.max(...cells.map((cell) => cell.x));
      const width = east - west + 1;
      const depth = south - north + 1;
      const image = images.get('warehouse');
      const projectedDepthRatio = image.height / image.width * Math.sin(Math.atan2(14, 10));
      const building = prop('warehouse', (west + east) / 2, south + 0.48,
        Math.min(width - 0.08, (depth - 0.08) / projectedDepthRatio));
      building.userData.bellYardFootprint = { x: west, z: north, width, depth };
      if (south < level.height - 1) prop('gas_lamp', west - 0.05, south + 0.5, 0.22, 0.1);
    }
  }
  // Canal furniture sits on water tiles units never enter.
  for (let x = 0; x < level.width; x++) {
    if (tile(x, 9) === 'bell_canal' && tile(x, 10) === 'bell_canal' && (x === 0 || x === level.width - 1)) {
      prop('lock_gate', x, 10.4, 1.4, -CANAL_DEPTH);
    }
  }
  for (const [x, z] of [[17.5, 33.4], [17.5, 22.2]]) {
    if (tile(Math.ceil(x), Math.floor(z)) === 'bell_canal') prop('lock_gate', x + 0.5, z, 1.6, -CANAL_DEPTH);
  }
  for (const [x, z] of [[-0.9, 8.6], [level.width - 0.1, 8.6]]) prop('crane', x, z, 2.2);
  for (const [x, z] of [[13.6, 13.7], [23.4, 13.7], [13.6, 20.6], [23.4, 20.6], [15.6, 5.5], [21.4, 5.5]]) {
    prop('gas_lamp', x, z, 0.22);
  }

  const surroundWidth = level.width + STREET_CAMERA_PADDING * 2;
  const surroundDepth = level.height + STREET_CAMERA_PADDING * 2;
  const roofTexture = material('roof').map.clone();
  roofTexture.wrapS = roofTexture.wrapT = THREE.RepeatWrapping;
  roofTexture.repeat.set(surroundWidth, surroundDepth);
  roofTexture.needsUpdate = true;
  const surround = new THREE.Mesh(new THREE.PlaneGeometry(surroundWidth, surroundDepth),
    new THREE.MeshBasicMaterial({ map: roofTexture, color: 0xc4bccc }));
  surround.rotation.x = -Math.PI / 2;
  surround.position.y = -0.6;
  surround.name = 'bell-yard-rooftops';
  group.add(surround);
  // Clear depth after the yard is drawn so warehouses and the headframe never hide a unit's head.
  const depthReset = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
  depthReset.name = 'bell-yard-unit-depth-reset';
  depthReset.frustumCulled = false;
  depthReset.renderOrder = 1;
  depthReset.onBeforeRender = (renderer) => renderer.clearDepth();
  group.add(depthReset);
  group.userData.streetCameraPadding = STREET_CAMERA_PADDING;
}
