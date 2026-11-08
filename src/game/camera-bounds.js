export const TACTICAL_FOV = 28;
export const INTERIOR_CAMERA_PADDING = 4;
export const STREET_CAMERA_PADDING = 8;
export const STREET_SKYLINE = Object.freeze({ x: 0, y: 0.2, z: -22, width: 96, height: 32 });

export function constrainInteriorCamera(target, offset, aspect, width, height, padding = INTERIOR_CAMERA_PADDING) {
  // A small border keeps edge tiles and upright spawn sprites inside the viewport.
  width += padding * 2;
  height += padding * 2;
  const distance = Math.hypot(offset.y, offset.z);
  const ny = offset.y / distance;
  const nz = offset.z / distance;
  const footprint = (tangent) => {
    const corners = [];
    for (const vertical of [-tangent, tangent]) {
      const rayY = -ny + vertical * nz;
      const rayZ = -nz - vertical * ny;
      const travel = -(target.y + offset.y) / rayY;
      for (const horizontal of [-tangent * aspect, tangent * aspect]) {
        corners.push({ x: horizontal * travel, z: offset.z + rayZ * travel });
      }
    }
    return {
      minX: Math.min(...corners.map((point) => point.x)),
      maxX: Math.max(...corners.map((point) => point.x)),
      minZ: Math.min(...corners.map((point) => point.z)),
      maxZ: Math.max(...corners.map((point) => point.z)),
    };
  };
  let low = 0;
  let high = Math.tan(TACTICAL_FOV * Math.PI / 360);
  for (let iteration = 0; iteration < 32; iteration++) {
    const middle = (low + high) / 2;
    const view = footprint(middle);
    if (view.maxX - view.minX <= width && view.maxZ - view.minZ <= height) low = middle;
    else high = middle;
  }
  const view = footprint(low);
  target.x = Math.max(-width / 2 - view.minX, Math.min(width / 2 - view.maxX, target.x));
  target.z = Math.max(-height / 2 - view.minZ, Math.min(height / 2 - view.maxZ, target.z));
  return Math.atan(low) * 360 / Math.PI;
}

export function constrainStreetCamera(target, backdrop, offset, aspect, width, height) {
  const distance = Math.hypot(offset.y, offset.z);
  const ny = offset.y / distance;
  const nz = offset.z / distance;
  const depthAt = (z) => distance + ny * (target.y - backdrop.y) + nz * (z - backdrop.z);
  const bottomAt = (z) => nz * (backdrop.y - target.y) - ny * (backdrop.z - z);
  const halfWidth = width / 2 + STREET_CAMERA_PADDING;
  const halfHeight = height / 2 + STREET_CAMERA_PADDING;
  const requested = { ...target };
  const boundsAt = (tangent) => {
    const xs = [];
    const zs = [];
    for (const vertical of [-tangent, tangent]) {
      const travel = -(target.y + offset.y) / (-ny + vertical * nz);
      zs.push(offset.z + (-nz - vertical * ny) * travel);
      xs.push(-tangent * aspect * travel, tangent * aspect * travel);
    }
    let minX = -halfWidth - Math.min(...xs);
    let maxX = halfWidth - Math.max(...xs);
    let minZ = -halfHeight - Math.min(...zs);
    const maxZ = halfHeight - Math.max(...zs);
    let z = Math.max(minZ, Math.min(maxZ, requested.z));
    const visible = backdrop && bottomAt(z) <= depthAt(z) * tangent &&
      bottomAt(z) + backdrop.height >= -depthAt(z) * tangent;
    if (visible) {
      // Intersect skyline and street limits before moving either camera axis.
      minZ = Math.max(minZ, (depthAt(0) * tangent - bottomAt(0) - backdrop.height) / (ny - nz * tangent));
      z = Math.max(minZ, Math.min(maxZ, requested.z));
      const pan = backdrop.width / 2 - 0.15 - depthAt(z) * tangent * aspect;
      minX = Math.max(minX, backdrop.x - pan);
      maxX = Math.min(maxX, backdrop.x + pan);
    }
    return { minX, maxX, minZ, maxZ, z };
  };
  let low = 0;
  let high = Math.tan(TACTICAL_FOV * Math.PI / 360);
  for (let iteration = 0; iteration < 40; iteration++) {
    const middle = (low + high) / 2;
    const bounds = boundsAt(middle);
    if (bounds.minX <= bounds.maxX && bounds.minZ <= bounds.maxZ) low = middle;
    else high = middle;
  }
  const bounds = boundsAt(low);
  target.x = Math.max(bounds.minX, Math.min(bounds.maxX, requested.x));
  target.z = bounds.z;
  return Math.atan(low) * 360 / Math.PI;
}

// The city plane faces the tactical camera, so its depth is constant across the skyline.
export function constrainCityCamera(target, backdrop, offset, aspect, northLimit) {
  target.z = Math.max(northLimit, target.z);
  const distance = Math.hypot(offset.y, offset.z);
  const normalY = offset.y / distance;
  const normalZ = offset.z / distance;
  const depth = distance + normalY * (target.y - backdrop.y) + normalZ * (target.z - backdrop.z);
  const bottom = normalZ * (backdrop.y - target.y) - normalY * (backdrop.z - target.z);
  const tangent = Math.tan(TACTICAL_FOV * Math.PI / 360);
  const visible = bottom <= depth * tangent && bottom + backdrop.height >= -depth * tangent;
  if (!visible) return TACTICAL_FOV;

  const halfWidth = backdrop.width / 2 - 0.15;
  const limitedTangent = Math.min(tangent, halfWidth / (depth * aspect));
  const pan = Math.max(0, halfWidth - depth * limitedTangent * aspect);
  target.x = Math.max(backdrop.x - pan, Math.min(backdrop.x + pan, target.x));
  return Math.atan(limitedTangent) * 360 / Math.PI;
}
