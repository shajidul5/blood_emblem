export function citySpriteOrder(z) {
  return 0.2 + (z + 32) / 160;
}

export function createCityOcclusion(THREE, scenery) {
  const records = new Map();
  const masks = new WeakMap();
  const mask = (texture) => {
    const image = texture.image;
    if (masks.has(image)) return masks.get(image);
    let data = image.data;
    if (!data) {
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(image, 0, 0);
      data = context.getImageData(0, 0, image.width, image.height).data;
    }
    const alpha = new Uint8Array(image.width * image.height);
    for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3];
    const result = { alpha, width: image.width, height: image.height };
    masks.set(image, result);
    return result;
  };
  const overlapsArt = (unitBounds, unitMap, buildingBounds, buildingMap) => {
    // Both sprites face the fixed tactical camera; screen bounds map directly to image pixels.
    const a = mask(unitMap), b = mask(buildingMap);
    const step = Math.max(1, Math.floor(Math.min(a.width, a.height) / 24));
    for (let y = 0; y < a.height; y += step) for (let x = 0; x < a.width; x += step) {
      if (a.alpha[y * a.width + x] < 128) continue;
      const screenX = unitBounds.left + (x + 0.5) / a.width * (unitBounds.right - unitBounds.left);
      const screenY = unitBounds.top - (y + 0.5) / a.height * (unitBounds.top - unitBounds.bottom);
      const bx = Math.floor((screenX - buildingBounds.left) / (buildingBounds.right - buildingBounds.left) * b.width);
      const by = Math.floor((buildingBounds.top - screenY) / (buildingBounds.top - buildingBounds.bottom) * b.height);
      if (bx >= 0 && bx < b.width && by >= 0 && by < b.height && b.alpha[by * b.width + bx] >= 128) return true;
    }
    return false;
  };
  const point = new THREE.Vector3();
  const bounds = (mesh, camera) => {
    mesh.geometry.computeBoundingBox();
    const box = mesh.geometry.boundingBox;
    const result = { left: Infinity, right: -Infinity, top: -Infinity, bottom: Infinity };
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) {
      point.set(x, y, box.min.z).applyMatrix4(mesh.matrixWorld).project(camera);
      result.left = Math.min(result.left, point.x);
      result.right = Math.max(result.right, point.x);
      result.top = Math.max(result.top, point.y);
      result.bottom = Math.min(result.bottom, point.y);
    }
    return result;
  };
  const restore = (mesh, record) => {
    Object.assign(mesh.material, record.original);
    mesh.material.needsUpdate = true;
    mesh.renderOrder = record.order;
    delete mesh.userData.cityOccluded;
    mesh.remove(record.outline);
    record.outline.material.dispose();
    records.delete(mesh);
  };
  const register = (mesh) => {
    const original = {
      transparent: mesh.material.transparent,
      depthTest: mesh.material.depthTest,
      depthWrite: mesh.material.depthWrite,
    };
    const material = new THREE.ShaderMaterial({
      uniforms: { map: { value: mesh.material.map }, texel: { value: new THREE.Vector2() } },
      transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform sampler2D map;
        uniform vec2 texel;
        varying vec2 vUv;
        void main() {
          float body = texture2D(map, vUv).a;
          float edge = max(max(texture2D(map, vUv + vec2(texel.x, 0.0)).a,
                               texture2D(map, vUv - vec2(texel.x, 0.0)).a),
                           max(texture2D(map, vUv + vec2(0.0, texel.y)).a,
                               texture2D(map, vUv - vec2(0.0, texel.y)).a));
          if (body >= 0.5 || edge < 0.5) discard;
          gl_FragColor = vec4(0.64, 0.82, 0.80, 0.45);
        }`,
    });
    const outline = new THREE.Mesh(mesh.geometry, material);
    outline.renderOrder = 4;
    outline.visible = false;
    mesh.add(outline);
    const record = { original, order: mesh.renderOrder, outline };
    records.set(mesh, record);
    mesh.material.transparent = true;
    mesh.material.depthTest = mesh.material.depthWrite = false;
    mesh.material.needsUpdate = true;
    return record;
  };
  return {
    update(units, selected, camera) {
      camera.updateMatrixWorld();
      const active = new Set(units.filter(({ hp, mesh }) => hp > 0 && mesh?.visible).map(({ mesh }) => mesh));
      for (const [mesh, record] of records) if (!active.has(mesh)) restore(mesh, record);
      const buildings = scenery.filter((mesh) => mesh.visible).map((mesh) => {
        mesh.updateWorldMatrix(true, false);
        mesh.material.opacity = 1;
        return { mesh, bounds: bounds(mesh, camera) };
      });
      for (const unit of units) {
        const mesh = unit.mesh;
        if (!active.has(mesh)) continue;
        const record = records.get(mesh) ?? register(mesh);
        mesh.updateWorldMatrix(true, false);
        const unitBounds = bounds(mesh, camera);
        mesh.renderOrder = citySpriteOrder(mesh.position.z);
        const blockers = buildings.filter(({ mesh: building, bounds: b }) =>
          building.position.z > mesh.position.z + 0.01 &&
          b.left < unitBounds.right && b.right > unitBounds.left &&
          b.bottom < unitBounds.top && b.top > unitBounds.bottom &&
          overlapsArt(unitBounds, mesh.material.map, b, building.material.map));
        const obscured = blockers.length > 0;
        mesh.userData.cityOccluded = obscured;
        record.outline.visible = obscured && unit !== selected;
        record.outline.material.uniforms.map.value = mesh.material.map;
        const image = mesh.material.map.image;
        record.outline.material.uniforms.texel.value.set(1 / image.width, 1 / image.height);
        if (obscured && mesh.userData.healthBar) mesh.userData.healthBar.group.visible = true;
        for (const { mesh: building } of blockers) building.material.opacity = 0.28;
      }
    },
    dispose() {
      for (const [mesh, record] of records) restore(mesh, record);
      for (const building of scenery) building.material.opacity = 1;
    },
  };
}
