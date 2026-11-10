import { addAncientBackdrop } from './starless-shore.js';
import { STREET_CAMERA_PADDING } from '../game/camera-bounds.js';
import { citySpriteOrder, createCityOcclusion } from './city-occlusion.js';
import { isLevelTileWalkable } from './tiles.js';

const urls = import.meta.glob('../../assets/tiles/{Waiting_City,Starless_Shore}/*.{png,svg}', {
  eager: true, query: '?url', import: 'default',
});
const images = new Map(await Promise.all(Object.entries(urls).map(([path, url]) =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve([path.split('/').slice(-2).join('/'), image]);
    image.onerror = () => reject(new Error(`Could not load ancient city sprite ${path}.`));
    image.src = url;
  }))));

export function addWaitingCity(THREE, group, level, oceanMaterial) {
  const textures = new Map();
  const texture = (key) => {
    if (!textures.has(key)) {
      const image = images.get(key);
      if (!image) throw new Error(`Missing ancient city art ${key}.`);
      const map = new THREE.Texture(image);
      map.magFilter = map.minFilter = THREE.NearestFilter;
      map.generateMipmaps = false;
      map.colorSpace = THREE.SRGBColorSpace;
      map.needsUpdate = true;
      textures.set(key, map);
    }
    return textures.get(key);
  };
  const wx = (x) => x + 0.5 - level.width / 2;
  const wz = (z) => z + 0.5 - level.height / 2;
  const sprite = (key, x, z, width, tint = 0xffffff) => {
    const map = texture(`Waiting_City/${key}.png`);
    const height = width * map.image.height / map.image.width;
    const geometry = new THREE.PlaneGeometry(width, height);
    geometry.translate(0, height / 2, 0);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
      map, color: tint, alphaTest: 0.1, transparent: true, side: THREE.DoubleSide, depthTest: false, depthWrite: false,
    }));
    mesh.rotation.x = -Math.atan2(14, 10);
    mesh.position.set(wx(x), 0.05, wz(z));
    // North-to-south painter order keeps distant arcades behind nearby roofs.
    mesh.renderOrder = citySpriteOrder(wz(z));
    mesh.userData.citySprite = key;
    mesh.userData.facing = 'south';
    group.add(mesh);
    return mesh;
  };
  const stars = addAncientBackdrop(THREE, group, texture('Starless_Shore/sea.png'), 18018, oceanMaterial);
  // The fixed tactical camera cannot see the shore's high, distant star field.
  const starPositions = stars.geometry.attributes.position;
  for (let i = 0; i < starPositions.count; i++) {
    starPositions.setY(i, 0.6 + (starPositions.getY(i) - 4) / 22 * 1.6);
    starPositions.setZ(i, -18 - (-starPositions.getZ(i) - 30) / 30 * 7);
  }
  starPositions.needsUpdate = true;
  stars.geometry.computeBoundingSphere();
  const floors = new Map();
  const colors = { city_cover: 0xaab8b0, city_building: 0x8996a1,
    city_rampart: 0x72818c, city_seal: 0x9dbfc7 };
  for (let z = 0; z < level.height; z++) for (let x = 0; x < level.width; x++) {
    const id = level.tileIds[z][x];
    if (id === 'shore_sea') continue;
    const art = id === 'shore_bridge' ? 'bridge' : id === 'city_plaza' ? 'plaza' : id === 'city_ward' ? 'ward'
      : id === 'city_cover' || (id === 'city_paving' && (x * 13 + z * 7) % 11 < 3) ? 'gravel' : 'paving';
    const key = `${id}:${art}`;
    if (!floors.has(key)) floors.set(key, { id, art, cells: [] });
    floors.get(key).cells.push({ x, z });
  }
  const ground = new THREE.PlaneGeometry(1, 1);
  ground.rotateX(-Math.PI / 2);
  for (const { id, art, cells } of floors.values()) {
    const geometry = ground.clone();
    const edges = cells.flatMap(({ x, z }) => [[0, -1], [1, 0], [0, 1], [-1, 0]].map(([dx, dz]) =>
      id !== 'shore_bridge' && (!level.tileIds[z + dz]?.[x + dx] || level.tileIds[z + dz][x + dx] === 'shore_sea') ? 1 : 0));
    geometry.setAttribute('shoreEdges', new THREE.InstancedBufferAttribute(new Float32Array(edges), 4));
    const material = new THREE.MeshBasicMaterial({ map: texture(`Waiting_City/${art}.svg`), color: colors[id] ?? 0xffffff });
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
          attribute vec4 shoreEdges;
          varying vec4 vShoreEdges;
          varying vec2 vShoreUv;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vShoreEdges = shoreEdges;
          vShoreUv = uv;`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          varying vec4 vShoreEdges;
          varying vec2 vShoreUv;`)
        .replace('#include <map_fragment>', `#include <map_fragment>
          vec4 edgeDistance = vec4(1.0 - vShoreUv.y, 1.0 - vShoreUv.x, vShoreUv.y, vShoreUv.x);
          edgeDistance = mix(vec4(1.0), edgeDistance, vShoreEdges);
          float shoreDistance = min(min(edgeDistance.x, edgeDistance.y), min(edgeDistance.z, edgeDistance.w));
          vec2 shorePixel = floor(vShoreUv * 32.0);
          float grain = fract(sin(dot(shorePixel, vec2(127.1, 311.7))) * 43758.5453);
          float erosion = (1.0 + floor(grain * 2.0)) / 32.0;
          if (shoreDistance < erosion) discard;
          float wet = 1.0 - smoothstep(0.06, 0.35, shoreDistance);
          diffuseColor.rgb *= 1.0 - wet * 0.48;
          float shingle = wet * step(0.72, grain);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.22, 0.26, 0.25), shingle * 0.65);`);
    };
    material.customProgramCacheKey = () => 'waiting-city-shore';
    const mesh = new THREE.InstancedMesh(geometry, material, cells.length);
    const matrix = new THREE.Matrix4();
    cells.forEach(({ x, z }, i) => mesh.setMatrixAt(i, matrix.makeTranslation(wx(x), 0, wz(z))));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.userData.terrain = id;
    mesh.userData.floorArt = art;
    group.add(mesh);
  }
  ground.dispose();
  const shoreline = [];
  for (let z = 0; z < level.height; z++) for (let x = 0; x < level.width; x++) {
    if (['shore_sea', 'shore_bridge'].includes(level.tileIds[z][x])) continue;
    for (const [dx, dz, angle] of [[0, -1, Math.PI], [1, 0, Math.PI / 2], [0, 1, 0], [-1, 0, -Math.PI / 2]]) {
      if (!level.tileIds[z + dz]?.[x + dx] || level.tileIds[z + dz][x + dx] === 'shore_sea') shoreline.push({ x, z, dx, dz, angle });
    }
  }
  const shoreGeometry = new THREE.PlaneGeometry(1, 0.38);
  shoreGeometry.rotateX(-Math.PI / 2);
  const shore = new THREE.InstancedMesh(shoreGeometry, new THREE.MeshBasicMaterial({
    map: texture('Waiting_City/shore.svg'), alphaTest: 0.5,
  }), shoreline.length);
  const shoreMatrix = new THREE.Matrix4();
  shoreline.forEach(({ x, z, dx, dz, angle }, i) => {
    shoreMatrix.makeRotationY(angle);
    shoreMatrix.setPosition(wx(x) + dx * 0.58, -0.03, wz(z) + dz * 0.58);
    shore.setMatrixAt(i, shoreMatrix);
  });
  shore.instanceMatrix.needsUpdate = true;
  shore.renderOrder = 0.05;
  shore.userData.cityShoreline = shoreline;
  group.add(shore);
  const legacyBuildings = [
    ['armory', 7, 24.7, 4.6], ['observatory', 34, 24.7, 3.8],
    ['dwelling', 6, 33.6, 2.2], ['dwelling', 12, 31.7, 2.2],
    ['dwelling', 29, 33.6, 2.2], ['dwelling', 35, 31.7, 2.2],
    ['dwelling', 9, 15.6, 2.2], ['dwelling', 32, 15.6, 2.2],
  ];
  if (level.waitingCity.structures) {
    for (const structure of level.waitingCity.structures) {
      const { sprite: key, x, z, width, depth } = structure;
      const map = texture(`Waiting_City/${key}.png`);
      const imageDepth = map.image.height / map.image.width * Math.sin(Math.atan2(14, 10));
      const size = Math.min(width - 0.25, (depth - 0.2) / imageDepth);
      const building = sprite(key, x + (width - 1) / 2, z + depth - 0.65, size);
      building.userData.cityFootprint = structure;
    }
  } else {
    for (const [key, x, z, width] of legacyBuildings) sprite(key, x, z, width);
  }
  for (let z = 0; z < level.height; z++) for (let x = 0; x < level.width; x++) {
    if (level.tileIds[z][x] === 'city_statue') sprite('statue', x, z + 0.35, 0.85);
  }
  let railGeometry, railMaterial;
  for (let z = 0; z < level.height; z++) for (let x = 0; x < level.width; x++) {
    if (level.tileIds[z][x] !== 'shore_bridge') continue;
    for (const dx of [-1, 1]) {
      if (level.tileIds[z][x + dx] !== 'shore_sea') continue;
      railGeometry ??= new THREE.BoxGeometry(0.08, 0.2, 0.94);
      railMaterial ??= new THREE.MeshBasicMaterial({ color: 0x768f9b });
      const rail = new THREE.Mesh(railGeometry, railMaterial);
      rail.position.set(wx(x) + dx * 0.45, 0.1, wz(z));
      rail.userData.cityBridgeRail = true;
      group.add(rail);
    }
  }
  const terraceMaterial = new THREE.MeshBasicMaterial({ color: 0x172b38 });
  const terrace = (x, z, width, depth) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, 0.6, depth), terraceMaterial);
    mesh.position.set(wx(x), -0.5, wz(z));
    group.add(mesh);
    const map = texture('Waiting_City/paving.svg').clone();
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(width, depth);
    map.needsUpdate = true;
    const paving = new THREE.Mesh(new THREE.PlaneGeometry(width, depth),
      new THREE.MeshBasicMaterial({ map, color: 0x1d303e }));
    paving.rotation.x = -Math.PI / 2;
    paving.position.set(wx(x), -0.19, wz(z));
    group.add(paving);
  };
  for (const [x, z, width] of [[5, -0.75, 12], [20, -1.5, 13], [36, -0.75, 12],
    [-5, 7, 7], [-5, 22, 7], [47, 7, 7], [47, 25, 7]]) {
    terrace(x, z - 1, width + 1, 5);
    sprite('colonnade', x, z, width, 0x476171);
    for (const dx of [-width / 3, 0, width / 3]) {
      sprite(dx === 0 ? 'observatory' : 'dwelling', x + dx, z - 3.5, width / 3, 0x395261);
    }
  }
  for (let i = 0; i < 10; i++) {
    const x = -8 + i * 6.4;
    sprite(i % 3 === 0 ? 'observatory' : 'shrine', x, -8 - i % 2 * 3, 6, 0x233d50);
  }
  const portal = sprite('portal', 20.5, 18.5, 5.2);
  const mechanisms = new Map(level.waitingCity.mechanisms.map((entry) =>
    [entry.id, sprite('mechanism', entry.x, entry.z + 0.4, 1)]));
  const interactionMarkers = new Map();
  const interactionGeometry = new THREE.PlaneGeometry(0.9, 0.9);
  interactionGeometry.rotateX(-Math.PI / 2);
  const interactionMaterial = new THREE.MeshBasicMaterial({
    color: 0x49df69, transparent: true, opacity: 0.32, depthTest: false, depthWrite: false,
  });
  const markInteraction = (x, z, entry, kind) => {
    if (!isLevelTileWalkable(level, x, z)) return;
    const key = `${x},${z}`;
    if (!interactionMarkers.has(key)) {
      const marker = new THREE.Mesh(interactionGeometry, interactionMaterial);
      marker.position.set(wx(x), 0.025, wz(z));
      marker.renderOrder = 0.12;
      marker.userData.cityInteraction = { x, z, sources: [] };
      interactionMarkers.set(key, marker);
      group.add(marker);
    }
    interactionMarkers.get(key).userData.cityInteraction.sources.push({ entry, kind });
  };
  for (const entry of level.waitingCity.mechanisms) {
    for (const [dx, dz] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      markInteraction(entry.x + dx, entry.z + dz, entry, 'mechanism');
    }
  }
  for (const chest of level.chests) markInteraction(chest.x, chest.z, chest, 'chest');
  const tideMarkers = new Map();
  for (const wave of level.reinforcements) for (const { x, z } of wave.units) {
    const key = `${x},${z}`;
    if (tideMarkers.has(key)) continue;
    const marker = new THREE.Mesh(new THREE.RingGeometry(0.26, 0.43, 24),
      new THREE.MeshBasicMaterial({ color: 0x69d7d0, side: THREE.DoubleSide, depthTest: false }));
    marker.rotation.x = -Math.PI / 2;
    marker.position.set(wx(x), 0.06, wz(z));
    marker.renderOrder = 0.6;
    marker.userData.tideArrival = { x, z };
    tideMarkers.set(key, marker);
    group.add(marker);
  }
  const warningGroup = new THREE.Group();
  group.add(warningGroup);
  const markerGeometry = new THREE.PlaneGeometry(0.94, 0.94);
  markerGeometry.rotateX(-Math.PI / 2);
  const markerMaterial = new THREE.MeshBasicMaterial({
    color: 0xe9a455, transparent: true, opacity: 0.65, depthTest: false, depthWrite: false,
  });
  const sync = () => {
    portal.visible = !level.waitingCity.opened;
    for (const entry of level.waitingCity.mechanisms) mechanisms.get(entry.id).material.color.setHex(entry.activated ? 0x75edce : 0xffffff);
    for (const marker of interactionMarkers.values()) {
      marker.visible = marker.userData.cityInteraction.sources.some(({ entry, kind }) =>
        kind === 'mechanism' ? !entry.activated : !entry.opened);
    }
    for (const [key, marker] of tideMarkers) {
      marker.visible = level.reinforcements.some((wave) => !wave.spawned &&
        wave.units.slice(wave.spawnedCount).some(({ x, z }) => `${x},${z}` === key));
    }
    warningGroup.clear();
    for (const { x, z } of level.waitingCity.pulse?.tiles ?? []) {
      const marker = new THREE.Mesh(markerGeometry, markerMaterial);
      marker.position.set(wx(x), 0.04, wz(z));
      marker.renderOrder = 0.7;
      warningGroup.add(marker);
    }
  };
  const reset = new THREE.Mesh(new THREE.PlaneGeometry(0.001, 0.001),
    new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false }));
  reset.renderOrder = 1;
  reset.frustumCulled = false;
  reset.onBeforeRender = (renderer) => renderer.clearDepth();
  group.add(reset);
  const occlusion = createCityOcclusion(THREE, group.children.filter(({ userData }) => userData.citySprite));
  const dispose = () => {
    occlusion.dispose();
    warningGroup.clear();
    markerGeometry.dispose();
    markerMaterial.dispose();
    stars.geometry.dispose();
    stars.material.dispose();
  };
  group.userData.waitingCity = { mechanisms, portal, stars, warningGroup, tideMarkers, interactionMarkers, sync, occlusion, dispose };
  group.userData.streetCameraPadding = STREET_CAMERA_PADDING;
  sync();
}
