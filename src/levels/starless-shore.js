import { STREET_CAMERA_PADDING } from '../game/camera-bounds.js';
import shoreFloorUrl from '../../assets/maps/starless-shore/floor.png?url&no-inline';
import shoreOceanUrl from '../../assets/maps/starless-shore/ocean.png?url&no-inline';
import shoreSceneUrl from '../../assets/maps/starless-shore/scene.png?url&no-inline';

const urls = import.meta.glob('../../assets/tiles/Starless_Shore/*.png', {
  eager: true, query: '?url', import: 'default',
});
const fixtureUrls = import.meta.glob('../../assets/maps/starless-shore/{drowned-bell,constellation-instrument}.png', {
  eager: true, query: '?url', import: 'default',
});
const images = new Map(await Promise.all(Object.entries({ ...urls, ...fixtureUrls }).map(([path, url]) =>
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
  const illustrated = level.shore.artwork === 'illustrated';
  const fullScene = level.shore.artwork === 'scene';
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
  let oceanMaterial;
  if (illustrated || fullScene) {
    const water = new THREE.TextureLoader().load(shoreOceanUrl);
    water.wrapS = water.wrapT = THREE.RepeatWrapping;
    water.repeat.set(18, 18);
    water.magFilter = THREE.NearestFilter;
    water.minFilter = THREE.LinearFilter;
    water.generateMipmaps = false;
    water.colorSpace = THREE.SRGBColorSpace;
    oceanMaterial = new THREE.MeshBasicMaterial({ map: water, color: 0x52657e });
  }
  const stars = addAncientBackdrop(THREE, group, texture('sea'), 17017, oceanMaterial);
  if (fullScene) {
    const sceneTexture = new THREE.TextureLoader().load(shoreSceneUrl);
    sceneTexture.magFilter = sceneTexture.minFilter = THREE.LinearFilter;
    sceneTexture.generateMipmaps = false;
    sceneTexture.colorSpace = THREE.SRGBColorSpace;
    const painting = new THREE.Mesh(new THREE.PlaneGeometry(level.width, level.height),
      new THREE.MeshBasicMaterial({ map: sceneTexture }));
    painting.rotation.x = -Math.PI / 2;
    painting.name = 'shore-hd-scene';
    group.add(painting);
    const beacons = new Map(level.shore.beacons.map((beacon) => [
      beacon.id, sprite(beacon.extinguished ? 'beacon_off' : 'beacon', beacon.x, beacon.z + .44, .85),
    ]));
    const trials = new Map((level.shore.trials ?? []).map((trial) => {
      const marker = new THREE.Mesh(new THREE.RingGeometry(.24, .35, 24),
        new THREE.MeshBasicMaterial({ color: 0xcbb3e6, side: THREE.DoubleSide }));
      marker.rotation.x = -Math.PI / 2;
      marker.position.set(wx(trial.x), .035, wz(trial.z));
      marker.userData.trialId = trial.id;
      group.add(marker);
      return [trial.id, marker];
    }));
    const syncTrials = () => {
      for (const trial of level.shore.trials ?? []) {
        trials.get(trial.id).material.color.setHex(trial.activated ? 0x657081 : 0xcbb3e6);
      }
    };
    syncTrials();
    const arrivals = new Map(level.reinforcements.flatMap((wave) => wave.units)
      .map(({ x, z }) => [`${x},${z}`, { x, z }]));
    const arrivalMarkers = [...arrivals.values()].map(({ x, z }) => {
      const marker = new THREE.Mesh(new THREE.RingGeometry(.25, .39, 20),
        new THREE.MeshBasicMaterial({ color: 0xb891dc, side: THREE.DoubleSide }));
      marker.rotation.x = -Math.PI / 2;
      marker.position.set(wx(x), .03, wz(z));
      marker.userData.arrival = { x, z };
      group.add(marker);
      return marker;
    });
    group.userData.shore = { beacons, unlitBeacon: texture('beacon_off'), trials, syncTrials,
      stars, arrivalMarkers, painting };
    group.userData.streetCameraPadding = STREET_CAMERA_PADDING;
    return;
  }

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
    shore_mooring: 0x819396, shore_trial: 0x6b568d,
  };
  const ground = new THREE.PlaneGeometry(1, 1);
  ground.rotateX(-Math.PI / 2);
  if (illustrated) {
    const floorTexture = new THREE.TextureLoader().load(shoreFloorUrl);
    floorTexture.magFilter = THREE.NearestFilter;
    floorTexture.minFilter = THREE.LinearFilter;
    floorTexture.generateMipmaps = false;
    floorTexture.colorSpace = THREE.SRGBColorSpace;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(level.width, level.height),
      new THREE.MeshBasicMaterial({ map: floorTexture, transparent: true, alphaTest: .1 }));
    floor.rotation.x = -Math.PI / 2;
    floor.name = 'shore-illustrated-floor';
    group.add(floor);
  } else for (const [id, cells] of floors) {
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

  const redesigned = Boolean(level.shore.trials);
  const armories = redesigned
    ? [[6,15.4,3],[14,25.4,3],[35,15.4,3],[41,25.4,3],[24,20.4,3],[20.5,26.4,2],[27.5,26.4,2]]
      .map(([x,z,width]) => sprite('armory', x, z, width, 0x8896ad))
    : [sprite('armory', 5, 16.9, 4.8), sprite('armory', 34, 16.9, 4.8)];
  for (const [x, z, width] of [[10, -5, 7], [29, -7, 8], [-7, 8, 8], [level.width + 6, 5, 9]]) {
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
  const gate = redesigned ? sprite('sea_gate', 23.5, 5.45, 4) : sprite('sea_gate', 19.5, 2.45, 6);
  const moorings = [];
  for (let z = 0; z < level.height; z++) for (let x = 0; x < level.width; x++) {
    if (level.tileIds[z][x] === 'shore_mooring' && z !== 2) moorings.push(sprite('mooring', x, z + 0.4, 1.15));
  }
  const fixtureWidth = (key) => Math.min(.85, .88 * images.get(key).width /
    (images.get(key).height * Math.abs(Math.sin(pitch))));
  const beacons = new Map(level.shore.beacons.map((beacon) => [
    beacon.id, sprite(beacon.extinguished ? 'beacon_off' : 'beacon', beacon.x, beacon.z + .44, fixtureWidth('beacon')),
  ]));
  const unlitBeacon = texture('beacon_off');
  const trials = new Map((level.shore.trials ?? []).map((trial) => {
    const key = trial.kind === 'bell' ? 'drowned-bell' : 'constellation-instrument';
    const mesh = sprite(key, trial.x, trial.z + .44, fixtureWidth(key));
    mesh.userData.trialId = trial.id;
    return [trial.id, mesh];
  }));
  const syncTrials = () => {
    for (const trial of level.shore.trials ?? []) {
      trials.get(trial.id).material.color.setHex(trial.activated ? 0x657081 : 0xffffff);
    }
  };
  syncTrials();
  const silhouette = sprite('bell_drowned', level.width / 2 - .5, -12, 16, 0x627787);
  // These markers are warnings, not arrival teleportation: occupied shore tiles queue their waves.
  const arrivals = new Map();
  for (const wave of level.reinforcements) for (const { x,z } of wave.units) arrivals.set(`${x},${z}`, { x,z });
  const arrivalMarkers = [];
  for (const { x,z } of arrivals.values()) {
    const marker = new THREE.Mesh(new THREE.RingGeometry(0.25, 0.39, 20),
      new THREE.MeshBasicMaterial({ color: 0xb891dc, side: THREE.DoubleSide }));
    marker.rotation.x = -Math.PI / 2;
    marker.position.set(wx(x), 0.03, wz(z));
    marker.userData.arrival = { x,z };
    group.add(marker);
    arrivalMarkers.push(marker);
  }
  const reset = new THREE.Mesh(new THREE.PlaneGeometry(0.001, 0.001),
    new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false }));
  reset.renderOrder = 1;
  reset.frustumCulled = false;
  reset.onBeforeRender = (renderer) => renderer.clearDepth();
  group.add(reset);
  group.userData.shore = { beacons, unlitBeacon, armories, gate, moorings, silhouette, stars, arrivalMarkers, trials, syncTrials };
  group.userData.streetCameraPadding = STREET_CAMERA_PADDING;
}
