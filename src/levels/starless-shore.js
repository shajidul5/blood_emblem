import { STREET_CAMERA_PADDING } from '../game/camera-bounds.js';

const urls = import.meta.glob('../../assets/tiles/Starless_Shore/*.png', {
  eager: true, query: '?url', import: 'default',
});
const images = new Map(await Promise.all(Object.entries(urls).map(([path, url]) =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve([path.split('/').pop().replace('.png', ''), image]);
    image.onerror = () => reject(new Error(`Could not load ancient harbor art ${path}.`));
    image.src = url;
  }))));

export function addAncientBackdrop(THREE, group, texture, seed = 17017, oceanMaterial) {
  if (!oceanMaterial) {
    const seaTexture = texture.clone();
    seaTexture.wrapS = seaTexture.wrapT = THREE.RepeatWrapping;
    seaTexture.repeat.set(90, 90);
    seaTexture.needsUpdate = true;
    oceanMaterial = new THREE.MeshBasicMaterial({ map: seaTexture, color: 0x536d88 });
  }
  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(180, 180),
    oceanMaterial);
  ocean.name = 'ancient-ocean';
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.y = -0.5;
  group.add(ocean);
  const starPositions = [];
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 220; i++) starPositions.push((random() - 0.5) * 110, 4 + random() * 22, -30 - random() * 30);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
  const stars = new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0xb6d5e0, size: 0.09, sizeAttenuation: true }));
  group.add(stars);
  return stars;
}

export function addStarlessShore(THREE, group, level) {
  const textures = new Map();
  const texture = (key) => {
    if (textures.has(key)) return textures.get(key);
    const image = images.get(key);
    if (!image) throw new Error(`Missing ancient harbor art ${key}.`);
    const result = new THREE.Texture(image);
    result.magFilter = result.minFilter = THREE.NearestFilter;
    result.generateMipmaps = false;
    result.colorSpace = THREE.SRGBColorSpace;
    result.needsUpdate = true;
    textures.set(key, result);
    return result;
  };
  const wx = (x) => x + 0.5 - level.width / 2;
  const wz = (z) => z + 0.5 - level.height / 2;
  const pitch = -Math.atan2(14, 10);
  const sprite = (key, x, z, width, tint = 0xffffff) => {
    const image = images.get(key);
    const geometry = new THREE.PlaneGeometry(width, width * image.height / image.width);
    geometry.translate(0, width * image.height / image.width / 2, 0);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
      map: texture(key), color: tint, alphaTest: 0.1, side: THREE.DoubleSide,
      depthTest: false, depthWrite: false,
    }));
    mesh.rotation.x = pitch;
    mesh.position.set(wx(x), 0.05, wz(z));
    mesh.renderOrder = 0.5;
    group.add(mesh);
    return mesh;
  };
  const stars = addAncientBackdrop(THREE, group, texture('sea'));

  const floors = new Map();
  const land = (x, z) => level.tileIds[z]?.[x] && level.tileIds[z][x] !== 'shore_sea';
  for (let z = 0; z < level.height; z++) for (let x = 0; x < level.width; x++) {
    const id = level.tileIds[z][x];
    if (!land(x, z)) continue;
    if (!floors.has(id)) floors.set(id, []);
    floors.get(id).push({ x, z });
  }
  const colors = {
    shore_stone: 0xc3cdd1, shore_bridge: 0x899daa, shore_lift: 0x829092,
    shore_gate: 0xb9a16c, shore_rubble: 0x749182, shore_ruin: 0x717e83, shore_beacon: 0x9681aa,
    shore_mooring: 0x819396,
  };
  const ground = new THREE.PlaneGeometry(1, 1);
  ground.rotateX(-Math.PI / 2);
  for (const [id, cells] of floors) {
    const mesh = new THREE.InstancedMesh(ground,
      new THREE.MeshBasicMaterial({ map: texture('stone'), color: colors[id] }), cells.length);
    const matrix = new THREE.Matrix4();
    cells.forEach(({ x, z }, index) => mesh.setMatrixAt(index, matrix.makeTranslation(wx(x), 0, wz(z))));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.userData.terrain = id;
    group.add(mesh);
  }
  const edges = [];
  for (const cells of floors.values()) for (const { x, z } of cells) {
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (!land(x + dx, z + dz)) edges.push({ x: wx(x) + dx * 0.48, z: wz(z) + dz * 0.48, dx });
    }
  }
  const edgeMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.48, 0.08),
    new THREE.MeshBasicMaterial({ color: 0x25383e }), edges.length);
  const dummy = new THREE.Object3D();
  edges.forEach(({ x, z, dx }, index) => {
    dummy.position.set(x, -0.25, z);
    dummy.rotation.y = dx ? Math.PI / 2 : 0;
    dummy.updateMatrix();
    edgeMesh.setMatrixAt(index, dummy.matrix);
  });
  edgeMesh.instanceMatrix.needsUpdate = true;
  group.add(edgeMesh);

  const armories = [sprite('armory', 5, 16.9, 4.8), sprite('armory', 34, 16.9, 4.8)];
  for (const [x, z, width] of [[10, -5, 7], [29, -7, 8], [-7, 8, 8], [46, 5, 9]]) {
    const shoalTexture = texture('stone').clone();
    shoalTexture.wrapS = shoalTexture.wrapT = THREE.RepeatWrapping;
    shoalTexture.repeat.set(width + 1, 4);
    shoalTexture.needsUpdate = true;
    const shoal = new THREE.Mesh(new THREE.PlaneGeometry(width + 1, 4),
      new THREE.MeshBasicMaterial({ map: shoalTexture, color: 0x243b44 }));
    shoal.rotation.x = -Math.PI / 2;
    shoal.position.set(wx(x), -0.3, wz(z - 1));
    group.add(shoal);
    sprite('armory', x, z, width, 0x3c5965);
  }
  const gate = sprite('sea_gate', 19.5, 2.45, 6);
  const moorings = [];
  for (let z = 0; z < level.height; z++) for (let x = 0; x < level.width; x++) {
    if (level.tileIds[z][x] === 'shore_mooring' && z !== 2) moorings.push(sprite('mooring', x, z + 0.4, 1.15));
  }
  const beacons = new Map(level.shore.beacons.map((beacon) => [
    beacon.id, sprite(beacon.extinguished ? 'beacon_off' : 'beacon', beacon.x, beacon.z + 0.35, 0.85),
  ]));
  const unlitBeacon = texture('beacon_off');
  const silhouette = sprite('bell_drowned', 19.5, -12, 16, 0x627787);
  // These markers are warnings, not arrival teleportation: occupied shore tiles queue their waves.
  for (const [x, z] of [[3, 20], [36, 20], [20, 3]]) {
    const marker = new THREE.Mesh(new THREE.RingGeometry(0.25, 0.39, 20),
      new THREE.MeshBasicMaterial({ color: 0xb891dc, side: THREE.DoubleSide }));
    marker.rotation.x = -Math.PI / 2;
    marker.position.set(wx(x), 0.03, wz(z));
    group.add(marker);
  }
  const reset = new THREE.Mesh(new THREE.PlaneGeometry(0.001, 0.001),
    new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false }));
  reset.renderOrder = 1;
  reset.frustumCulled = false;
  reset.onBeforeRender = (renderer) => renderer.clearDepth();
  group.add(reset);
  group.userData.shore = { beacons, unlitBeacon, armories, gate, moorings, silhouette, stars };
  group.userData.streetCameraPadding = STREET_CAMERA_PADDING;
}
