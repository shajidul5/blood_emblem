import { addAncientBackdrop } from './starless-shore.js';
import { citySpriteOrder, createCityOcclusion } from './city-occlusion.js';
import { throneTileElevation, throneStairAt } from './throne-terraces.js';
import { STREET_CAMERA_PADDING } from '../game/camera-bounds.js';

const urls = import.meta.glob('../../assets/tiles/{Throne_Beneath_Stars,Starless_Shore}/*.png', {
  eager: true, query: '?url', import: 'default',
});
const images = new Map(await Promise.all(Object.entries(urls)
  .filter(([path]) => !path.endsWith('/map-preview.png'))
  .map(([path, url]) => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve([path.split('/').slice(-2).join('/'), image]);
    image.onerror = () => reject(new Error(`Could not load throne scenery ${path}.`));
    image.src = url;
  }))));

export function addAbyssalThrone(THREE, group, level, oceanMaterial) {
  const textures = new Map();
  const texture = (key) => {
    if (!textures.has(key)) {
      const image = images.get(key);
      if (!image) throw new Error(`Missing throne sprite ${key}.`);
      const map = new THREE.Texture(image);
      map.magFilter = map.minFilter = THREE.NearestFilter;
      map.generateMipmaps = false;
      map.colorSpace = THREE.SRGBColorSpace;
      map.needsUpdate = true;
      textures.set(key, map);
    }
    return textures.get(key);
  };
  const art = (key) => texture(`Throne_Beneath_Stars/${key}.png`);
  const wx = (x) => x + 0.5 - level.width / 2;
  const wz = (z) => z + 0.5 - level.height / 2;
  const pitch = Math.atan2(14, 10);
  const sprites = [];
  const sprite = (key, x, z, width) => {
    const map = art(key), height = width * map.image.height / map.image.width;
    const geometry = new THREE.PlaneGeometry(width, height);
    geometry.translate(0, height / 2, 0);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
      map, alphaTest: 0.1, transparent: true, side: THREE.DoubleSide, depthTest: false, depthWrite: false,
    }));
    mesh.rotation.x = -pitch;
    mesh.position.set(wx(x), throneTileElevation(level, x, Math.floor(z)) + 0.04, wz(z));
    mesh.renderOrder = citySpriteOrder(wz(z));
    mesh.userData.citySprite = key;
    mesh.userData.facing = 'south';
    sprites.push(mesh);
    group.add(mesh);
    return mesh;
  };
  const stars = addAncientBackdrop(THREE, group, texture('Starless_Shore/sea.png'), 19019, oceanMaterial);
  const positions = stars.geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    positions.setY(i, 0.15 + (positions.getY(i) - 4) / 22 * 1.2);
    positions.setZ(i, -18.5 - (-positions.getZ(i) - 30) / 30 * 6);
  }
  positions.needsUpdate = true;
  stars.geometry.computeBoundingSphere();
  stars.material.size = 0.18;
  stars.material.color.setHex(0xc9dce9);
  stars.material.transparent = true;
  const originalStars = positions.array.slice();
  const ocean = group.getObjectByName('ancient-ocean');
  const geometry = new THREE.PlaneGeometry(1, 1);
  geometry.rotateX(-Math.PI / 2);
  const floors = new Map(), edges = [], supports = [];
  const land = (x, z) => level.tileIds[z]?.[x] && level.tileIds[z][x] !== 'shore_sea';
  const floorArt = (x, z) => {
    const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => !land(x + dx, z + dz));
    const ceremonial = (x >= 20 && x <= 23) || (z >= 2 && z <= 9 && x >= 10 && x <= 33 &&
      (z <= 3 || z >= 8 || x <= 11 || x >= 32));
    if (ceremonial) return 'temple-mosaic';
    const patch = (Math.floor(x / 4) * 13 + Math.floor(z / 3) * 7) % 9;
    if (edge || patch === 0) return 'temple-gravel';
    return z <= 10 || patch === 1 ? 'temple-limestone' : 'temple-slate';
  };
  for (let z = 0; z < level.height; z++) for (let x = 0; x < level.width; x++) {
    if (!land(x, z)) continue;
    const elevation = throneTileElevation(level, x, z);
    const stair = throneStairAt(level, x, z);
    if (!stair) {
      const art = floorArt(x, z), u = x % 2, v = 1 - z % 2, key = `${elevation}:${art}:${u}:${v}`;
      if (!floors.has(key)) floors.set(key, { elevation, art, u, v, cells: [] });
      floors.get(key).cells.push({ x, z });
    }
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const neighbor = land(x + dx, z + dz)
        ? throneTileElevation(level, x + dx, z + dz) : level.abyssalThrone.stairs ? elevation - 0.35 : -0.5;
      if (elevation > neighbor) edges.push({ x, z, dx, dz, elevation, neighbor });
      if (level.abyssalThrone.stairs && !stair && dz === 1 && !land(x, z + 1) &&
          x % 3 === 0 && level.tileIds[z][x] !== 'throne_building') supports.push({ x, z, elevation });
    }
  }
  const matrix = new THREE.Matrix4();
  const floorMeshes = [];
  for (const { elevation, art: key, u, v, cells } of floors.values()) {
    const section = geometry.clone(), uv = section.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) + u) / 2, (uv.getY(i) + v) / 2);
    const mesh = new THREE.InstancedMesh(section, new THREE.MeshBasicMaterial({
      map: art(key), color: key === 'temple-mosaic' ? 0xb0b4bf : 0xb8bdc7,
    }), cells.length);
    cells.forEach(({ x, z }, i) => {
      mesh.setMatrixAt(i, matrix.makeTranslation(wx(x), elevation, wz(z)));
      const shade = ((x * 17 + z * 31) % 5) * 0.015;
      mesh.setColorAt(i, new THREE.Color().setRGB(0.94 + shade, 0.95 + shade / 2, 0.97));
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.userData.throneElevation = elevation;
    mesh.userData.throneFloorArt = key;
    floorMeshes.push(mesh);
    group.add(mesh);
  }
  const faces = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: art('temple-fascia'), color: 0x8795a3, side: THREE.DoubleSide }), edges.length);
  const dummy = new THREE.Object3D();
  edges.forEach(({ x, z, dx, dz, elevation, neighbor }, i) => {
    dummy.position.set(wx(x) + dx * 0.5, (elevation + neighbor) / 2, wz(z) + dz * 0.5);
    dummy.rotation.y = dx ? Math.PI / 2 : 0;
    dummy.scale.set(1, elevation - neighbor, 1);
    dummy.updateMatrix();
    faces.setMatrixAt(i, dummy.matrix);
  });
  faces.instanceMatrix.needsUpdate = true;
  group.add(faces);
  const stairMeshes = [];
  if (level.abyssalThrone.stairs) {
    const stepTexture = art('temple-limestone').clone();
    stepTexture.repeat.set(0.5, 0.125);
    stepTexture.needsUpdate = true;
    const stepMaterial = new THREE.MeshBasicMaterial({ map: stepTexture, color: 0xa2abb5 });
    const riserMaterial = new THREE.MeshBasicMaterial({ color: 0x435361, side: THREE.DoubleSide });
    const treadGeometry = new THREE.PlaneGeometry(1, 0.25);
    treadGeometry.rotateX(-Math.PI / 2);
    const riserGeometry = new THREE.PlaneGeometry(1, 0.1);
    for (const s of level.abyssalThrone.stairs) {
      const run = new THREE.Group();
      run.userData.throneStairs = s;
      for (let row = 0; row < 12; row++) for (let col = 0; col < 2; col++) {
        const height = s.lower + (11.5 - row) * 0.1;
        const tread = new THREE.Mesh(treadGeometry, stepMaterial);
        tread.position.set(wx(s.x + col), height, wz(s.z) - 0.5 + (row + 0.5) / 4);
        const riser = new THREE.Mesh(riserGeometry, riserMaterial);
        riser.position.set(tread.position.x, height - 0.05, tread.position.z + 0.125);
        run.add(tread, riser);
      }
      for (const side of [-0.5, 1.5]) {
        const sideGeometry = new THREE.BufferGeometry();
        const x = wx(s.x) + side, north = wz(s.z) - 0.5, south = north + 3;
        sideGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
          x, s.lower - 0.3, north, x, s.lower + 1.2, north, x, s.lower, south,
          x, s.lower - 0.3, north, x, s.lower, south, x, s.lower - 0.3, south,
        ], 3));
        run.add(new THREE.Mesh(sideGeometry, riserMaterial));
      }
      group.add(run);
      stairMeshes.push(run);
    }
  }
  const pillarMeshes = [];
  const pillarTexture = (y, height) => {
    const map = art('temple-column').clone();
    map.repeat.set(1, height / map.image.height);
    map.offset.set(0, 1 - (y + height) / map.image.height);
    map.needsUpdate = true;
    return map;
  };
  const pillarParts = [pillarTexture(0, 40), pillarTexture(40, 64), pillarTexture(104, 24)];
  for (const { x, z, elevation } of supports) {
    const height = (elevation + 1.1) * Math.cos(pitch);
    const pillar = new THREE.Group(), top = elevation - 0.22, cap = 0.35;
    for (const [i, partHeight, center] of [
      [0, cap, -cap / 2],
      [1, height - cap * 2, -height / 2],
      [2, cap, -height + cap / 2],
    ]) {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.95, partHeight),
        new THREE.MeshBasicMaterial({ map: pillarParts[i], color: 0x7d939a, alphaTest: 0.1,
          transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
      mesh.position.y = center;
      mesh.renderOrder = -1;
      pillar.add(mesh);
    }
    // Match the facade projection, anchoring the capital beneath the platform lip.
    pillar.rotation.x = -pitch;
    pillar.position.set(wx(x), top, wz(z) + 0.5);
    pillar.userData.supportPillar = { x, z, top, height };
    group.add(pillar);
    pillarMeshes.push(pillar);
  }
  ocean.renderOrder = -2;
  for (const [x, z] of [[6, 20], [15, 20], [28, 20], [37, 20], [9, 3], [34, 3], [14, 31], [29, 31]]) {
    if (!land(x, z)) continue;
    if (z === 3) continue;
    const column = sprite('temple-column', x, z + 0.4, 0.75);
    column.material.color.setHex(0xa6b2b9);
    column.userData.edgeColumn = true;
  }
  const colonnade = [];
  const addColumn = (x, z) => {
    const column = sprite('temple-column', x, z, 0.95);
    column.material.color.setHex(0xb8bec5);
    column.position.y = throneTileElevation(level, 22, 7) + 0.04;
    column.userData.throneColonnade = { x, z };
    colonnade.push(column);
  };
  for (const x of [10, 13, 16, 19, 22, 25, 28, 31, 34]) addColumn(x, 1.85);
  for (const z of [3.8, 6.2, 8.6, 10.5]) {
    addColumn(8.65, z);
    addColumn(35.35, z);
  }
  for (const x of [10, 17, 19, 25, 27, 32, 34]) addColumn(x, 10.7);
  for (const s of level.abyssalThrone.structures) {
    const map = art(s.sprite);
    const depth = map.image.height / map.image.width * Math.sin(pitch);
    const mesh = sprite(s.sprite, s.x + (s.width - 1) / 2, s.z + s.depth - 0.55,
      Math.min(s.width - 0.15, (s.depth - 0.1) / depth));
    mesh.userData.cityFootprint = s;
  }
  const worshippers = [], sockets = [];
  for (const p of level.abyssalThrone.props) {
    if (p.sprite === 'stairs' && level.abyssalThrone.stairs) continue;
    const mesh = sprite(p.sprite, p.x, p.z + 0.35,
      p.sprite === 'stairs' ? 2.8 : p.sprite === 'emblem-socket' ? 3.2 : p.sprite === 'abyss-anchor' ? 2.5 : 0.9);
    if (p.sprite === 'abyss-anchor') mesh.position.y = -0.25;
    if (p.sprite === 'stairs') {
      mesh.position.y = throneTileElevation(level, p.x, p.z + 1) + 0.04;
      mesh.userData.walkableStairs = true;
    }
    if (p.sprite === 'worshipper') worshippers.push(mesh);
    if (p.sprite === 'emblem-socket') sockets.push(mesh);
  }
  const throne = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.42, 24),
    new THREE.MeshBasicMaterial({ color: 0xc3a36a, side: THREE.DoubleSide }));
  throne.rotation.x = -Math.PI / 2;
  throne.position.set(wx(22), throneTileElevation(level, 22, 7) + 0.02, wz(7));
  group.add(throne);
  const warningGroup = new THREE.Group();
  group.add(warningGroup);
  const warningGeometry = new THREE.PlaneGeometry(0.94, 0.94);
  warningGeometry.rotateX(-Math.PI / 2);
  const warningMaterial = new THREE.MeshBasicMaterial({
    color: 0xe7a454, transparent: true, opacity: 0.7, depthTest: false, depthWrite: false,
  });
  const sync = () => {
    const seen = new Set(level.abyssalThrone.beats.filter((beat) => beat.seen).map((beat) => beat.id));
    ocean.position.y = seen.has('receding') ? -1.05 : -0.5;
    for (const mesh of worshippers) mesh.material.map = art(seen.has('congregation') ? 'worshipper-turned' : 'worshipper');
    for (const mesh of sockets) mesh.material.color.setHex(seen.has('emblem') ? 0xeea7a4 : 0x8d9da8);
    stars.material.opacity = seen.has('silence') ? 0.28 : 1;
    for (let i = 0; i < positions.count; i++) {
      const gather = seen.has('testament') ? 0.65 : 1;
      positions.setX(i, originalStars[i * 3] * gather);
    }
    positions.needsUpdate = true;
    stars.geometry.computeBoundingSphere();
    warningGroup.clear();
    for (const { x, z } of level.abyssalThrone.ruin?.tiles ?? []) {
      const marker = new THREE.Mesh(warningGeometry, warningMaterial);
      marker.position.set(wx(x), throneTileElevation(level, x, z) + 0.03, wz(z));
      marker.renderOrder = 0.15;
      warningGroup.add(marker);
    }
  };
  const reset = new THREE.Mesh(new THREE.PlaneGeometry(0.001, 0.001),
    new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false }));
  reset.renderOrder = 1;
  reset.frustumCulled = false;
  reset.onBeforeRender = (renderer) => renderer.clearDepth();
  group.add(reset);
  const occlusion = createCityOcclusion(THREE, sprites.filter((mesh) => !mesh.userData.walkableStairs));
  const dispose = () => {
    occlusion.dispose();
    warningGroup.clear();
    warningGeometry.dispose();
    warningMaterial.dispose();
  };
  group.userData.abyssalThrone = { stars, ocean, worshippers, sockets, warningGroup, occlusion,
    stairMeshes, pillarMeshes, floorMeshes, colonnade, sync, dispose };
  group.userData.streetCameraPadding = STREET_CAMERA_PADDING;
  sync();
}
