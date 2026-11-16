import { test } from 'node:test';
import assert from 'node:assert/strict';
import { constrainCityCamera, constrainInteriorCamera, constrainStreetCamera, INTERIOR_CAMERA_PADDING, LONE_SHIP_OCEAN_MARGIN, MANOR_CAMERA_MARGIN,
  STREET_CAMERA_PADDING, STREET_SKYLINE, TACTICAL_FOV } from '../src/game/camera-bounds.js';

const backdrop = { x: 0, y: 0.2, z: -18.5, width: 28, height: 7 };
const offset = { y: 14 * 36 / 19, z: 10 * 36 / 19 };

test('default tactical zoom shows at least 14% more map width without changing the camera angle', () => {
  const previous = Math.tan(28 * Math.PI / 360);
  const current = Math.tan(TACTICAL_FOV * Math.PI / 360);
  assert.ok(current / previous >= 1.14);
  assert.ok(current / previous <= 1.18, 'the pullback stays modest enough to read units');
});

test('city camera stops at the gate and keeps both skyline edges outside the viewport', () => {
  for (const aspect of [0.6, 1.26, 16 / 9, 21 / 9, 32 / 9]) {
    for (const x of [-9, 0, 9]) {
      const target = { x, y: 0.8, z: -17.5 };
      const fov = constrainCityCamera(target, backdrop, offset, aspect, -14.5);
      assert.equal(target.z, -14.5);
      assert.ok(fov > 0 && fov <= TACTICAL_FOV);
      const distance = Math.hypot(offset.y, offset.z);
      const depth = distance + offset.y / distance * (target.y - backdrop.y) +
        offset.z / distance * (target.z - backdrop.z);
      const halfView = depth * Math.tan(fov * Math.PI / 360) * aspect;
      assert.ok(target.x - halfView >= -14 + 0.149);
      assert.ok(target.x + halfView <= 14 - 0.149);
    }
  }
});

test('camera away from the skyline keeps its normal field of view and horizontal freedom', () => {
  const target = { x: 8, y: 0.8, z: 16.5 };
  assert.equal(constrainCityCamera(target, backdrop, offset, 16 / 9, -14.5), TACTICAL_FOV);
  assert.equal(target.x, 8);
  assert.equal(target.z, 16.5);
});

test('infirmary camera keeps every ground-plane viewport corner within the padded map', () => {
  const offset = { y: 14 * 1.45, z: 10 * 1.45 };
  for (const aspect of [0.6, 1.26, 16 / 9, 21 / 9, 32 / 9]) {
    for (const x of [-100, 0, 100]) {
      for (const z of [-100, 0, 100]) {
        const target = { x, y: 0.8, z };
        const fov = constrainInteriorCamera(target, offset, aspect, 24, 20);
        assert.ok(fov > 0 && fov <= TACTICAL_FOV);
        const tangent = Math.tan(fov * Math.PI / 360);
        const distance = Math.hypot(offset.y, offset.z);
        for (const v of [-tangent, tangent]) {
          const rayY = -offset.y / distance + v * offset.z / distance;
          const rayZ = -offset.z / distance - v * offset.y / distance;
          const travel = -(target.y + offset.y) / rayY;
          for (const h of [-tangent * aspect, tangent * aspect]) {
            const groundX = target.x + h * travel;
            const groundZ = target.z + offset.z + rayZ * travel;
            assert.ok(groundX >= -12 - INTERIOR_CAMERA_PADDING - 1e-8 && groundX <= 12 + INTERIOR_CAMERA_PADDING + 1e-8);
            assert.ok(groundZ >= -10 - INTERIOR_CAMERA_PADDING - 1e-8 && groundZ <= 10 + INTERIOR_CAMERA_PADDING + 1e-8);
          }
        }
      }
    }
  }
});

function assertArtworkBounds(target, offset, aspect, width, height, fov) {
  const distance = Math.hypot(offset.y, offset.z);
  const ny = offset.y / distance;
  const nz = offset.z / distance;
  const tangent = Math.tan(fov * Math.PI / 360);
  for (const v of [-tangent, tangent]) {
    const travel = (0.01 - target.y - offset.y) / (-ny + v * nz);
    for (const h of [-tangent * aspect, tangent * aspect]) {
      const x = target.x + h * travel;
      const z = target.z + offset.z + (-nz - v * ny) * travel;
      assert.ok(Math.abs(x) <= width / 2 + 1e-8, `artwork x ${x}, width ${width}`);
      assert.ok(Math.abs(z) <= height / 2 + 1e-8, `artwork z ${z}, height ${height}`);
    }
  }
}

test('all ten illustrated maps keep every viewport corner inside the exact artwork with no padding', async () => {
  const { readFile } = await import('node:fs/promises');
  for (const file of ['map_01_two_ships', 'map_02_boarders_from_the_deep',
    'map_03_fishing_village', 'map_04_mansion', 'map_05_escape', 'map_06_hollow_wood',
    'map_07_orders_camp', 'map_08_rotted_heart', 'map_09_last_crossing', 'map_10_golden_threshold']) {
    const map = JSON.parse(await readFile(new URL(`../data/levels/${file}.json`, import.meta.url), 'utf8'));
    assert.ok(map.shipScene || map.villageScene);
    const scale = Math.max(0.55, map.width / 21, map.height / 19);
    const offset = { y: 14 * scale, z: 10 * scale };
    for (const aspect of [0.35, 0.6, 1.26, 16 / 9, 21 / 9, 32 / 9]) {
      for (const x of [-100, -map.width / 2 + 0.5, 0, map.width / 2 - 0.5, 100]) {
        for (const z of [-100, -map.height / 2 + 0.5, 0, map.height / 2 - 0.5, 100]) {
          const target = { x, y: 0.8, z };
          const fov = constrainInteriorCamera(target, offset, aspect, map.width, map.height, 0, 0.01);
          assert.ok(fov > 0 && fov <= TACTICAL_FOV);
          assertArtworkBounds(target, offset, aspect, map.width, map.height, fov);
          const clamped = { ...target };
          const nextFov = constrainInteriorCamera(target, offset, aspect, map.width, map.height, 0, 0.01);
          assert.deepEqual(target, clamped, 'a stationary camera does not drift at the boundary');
          assert.equal(nextFov, fov);
        }
      }
    }
  }
});

test('Chapter 2 lone ship zooms out over open ocean to about Chapter 1 scale', async () => {
  const { readFile } = await import('node:fs/promises');
  const load = async (file) => JSON.parse(await readFile(new URL(`../data/levels/${file}.json`, import.meta.url), 'utf8'));
  const [one, two] = await Promise.all([load('map_01_two_ships'), load('map_02_boarders_from_the_deep')]);
  assert.equal(two.shipScene.layout, 'lone-ship');
  const fovFor = (map, width, target = { x: 0, y: 0.8, z: 0 }) => {
    const scale = Math.max(0.55, map.width / 21, map.height / 19);
    return constrainInteriorCamera(target, { y: 14 * scale, z: 10 * scale }, 16 / 9, width, map.height, 0, 0.01);
  };
  const width = two.width + LONE_SHIP_OCEAN_MARGIN * 2;
  const chapterOne = fovFor(one, one.width);
  assert.ok(fovFor(two, width) >= chapterOne * 0.85, 'Chapter 2 is not much tighter than Chapter 1');
  assert.ok(fovFor(two, width) > fovFor(two, two.width) * 1.5);
  for (const x of [-100, 100]) {
    const target = { x, y: 0.8, z: 0 };
    fovFor(two, width, target);
    assert.ok(Math.abs(target.x) < width / 2, 'pans only as far as the ocean margin');
  }
});

test('Chapter 4 manor camera reaches both side walls along the bottom of the view', async () => {
  const { readFile } = await import('node:fs/promises');
  const map = JSON.parse(await readFile(new URL('../data/levels/map_04_mansion.json', import.meta.url), 'utf8'));
  const scale = Math.max(0.55, map.width / 21, map.height / 19);
  const offset = { y: 14 * scale, z: 10 * scale };
  for (const aspect of [0.6, 1.26, 16 / 9, 21 / 9]) {
    for (const side of [-1, 1]) {
      const target = { x: side * 100, y: 0.8, z: 100 };
      const fov = constrainInteriorCamera(target, offset, aspect, map.width, map.height, MANOR_CAMERA_MARGIN, 0.01, true);
      const distance = Math.hypot(offset.y, offset.z), ny = offset.y / distance, nz = offset.z / distance;
      const tangent = Math.tan(fov * Math.PI / 360);
      const travel = (0.01 - target.y - offset.y) / (-ny - tangent * nz);
      const nearEdgeX = target.x + side * tangent * aspect * travel;
      assert.ok(Math.abs(nearEdgeX - side * (map.width / 2 + MANOR_CAMERA_MARGIN)) < 1e-6, `bottom ${side < 0 ? 'left' : 'right'} wall touches the screen edge`);
      const farClamped = { x: side * 100, y: 0.8, z: 100 };
      constrainInteriorCamera(farClamped, offset, aspect, map.width, map.height, 0, 0.01);
      assert.ok(Math.abs(target.x) > Math.abs(farClamped.x), 'manor view pans further toward the walls');
      assert.ok(target.z <= map.height / 2 + MANOR_CAMERA_MARGIN, 'only a small night margin shows beyond the walls');
    }
  }
});

test('artwork bounds constrain transitional and shaken camera positions immediately after resize', () => {
  const width = 24, height = 21;
  const offset = { y: 16, z: 80 / 7 };
  const target = { x: 100, y: 0.8, z: 100 };
  for (const aspect of [0.35, 32 / 9, 16 / 9, 0.6]) {
    for (let frame = 0; frame < 60; frame++) {
      target.x += (frame % 2 ? -1 : 1) * 0.4;
      target.y += (frame % 2 ? -1 : 1) * 0.2;
      target.z += (frame % 2 ? -1 : 1) * 0.3;
      const fov = constrainInteriorCamera(target, offset, aspect, width, height, 0, 0.01);
      assertArtworkBounds(target, offset, aspect, width, height, fov);
    }
  }
  const centered = { x: 0, y: 0.8, z: 0 };
  assert.ok(Math.abs(constrainInteriorCamera(centered, offset, 1, width, height, 0, 0.01) - TACTICAL_FOV) < 1e-6,
    'keep the wider default view when it fits inside the artwork');
});

test('every walkable infirmary tile is fully visible when followed, including edge spawn tiles', async () => {
  const { readFile } = await import('node:fs/promises');
  const map = JSON.parse(await readFile(new URL('../data/levels/map_12_infirmary.json', import.meta.url), 'utf8'));
  const offset = { y: 14 * 1.45, z: 10 * 1.45 };
  const distance = Math.hypot(offset.y, offset.z);
  const ny = offset.y / distance;
  const nz = offset.z / distance;
  for (const aspect of [0.6, 1.26, 16 / 9, 21 / 9, 32 / 9]) {
    for (let z = 0; z < map.height; z++) {
      for (let x = 0; x < map.width; x++) {
        if ('xy'.includes(map.tiles[z][x])) continue;
        const target = { x: x - map.width / 2 + 0.5, y: 0.8, z: z - map.height / 2 + 0.5 };
        const fov = constrainInteriorCamera(target, offset, aspect, map.width, map.height);
        const tangent = Math.tan(fov * Math.PI / 360);
        for (const dx of [0, 1]) {
          for (const dz of [0, 1]) {
            const px = x - map.width / 2 + dx - target.x;
            const pz = z - map.height / 2 + dz - target.z;
            const depth = distance + ny * target.y - nz * pz;
            const screenX = px / (depth * tangent * aspect);
            const screenY = (-nz * target.y - ny * pz) / (depth * tangent);
            assert.ok(Math.abs(screenX) <= 0.97 && Math.abs(screenY) <= 0.97,
              `tile ${x},${z}, aspect ${aspect}: ${screenX},${screenY}`);
          }
        }
      }
    }
  }
});

const project = (point, target, offset, aspect, fov) => {
  const distance = Math.hypot(offset.y, offset.z);
  const ny = offset.y / distance;
  const nz = offset.z / distance;
  const tangent = Math.tan(fov * Math.PI / 360);
  const dx = point.x - target.x;
  const dy = point.y - target.y;
  const dz = point.z - target.z;
  const depth = distance - ny * dy - nz * dz;
  return { x: dx / (depth * tangent * aspect), y: (nz * dy - ny * dz) / (depth * tangent) };
};

test('Chapter 3 authored right-edge arrivals keep the normal bounded camera without edge zoom', async () => {
  const { readFile } = await import('node:fs/promises');
  const map = JSON.parse(await readFile(new URL('../data/levels/map_03_fishing_village.json', import.meta.url), 'utf8'));
  const scale = Math.max(0.55, map.width / 21, map.height / 19);
  const offset = { y: 14 * scale, z: 10 * scale };
  for (const aspect of [1.26, 16 / 9, 21 / 9]) {
    let openingFov;
    for (const tile of [...map.players, ...map.enemies, ...map.reinforcements.flatMap((w) => w.units)]) {
      const target = { x: tile.x - map.width / 2 + 0.5, y: 0.8, z: tile.z - map.height / 2 + 0.5 };
      const fov = constrainInteriorCamera(target, offset, aspect, map.width, map.height, 0, 0.01);
      assertArtworkBounds(target, offset, aspect, map.width, map.height, fov);
      if (openingFov !== undefined) assert.equal(fov,openingFov);
      openingFov=fov;
    }
  }
});

test('illustrated camera FOV stays steady when following different map positions', () => {
  for (const aspect of [0.35, 1.26, 32 / 9]) {
    for (const width of [24,48]) {
      const scale = Math.max(width / 21, 21 / 19);
      const offset = {y:14*scale,z:10*scale};
      let previous;
      for (const x of [-width/2+0.5,0,width/2-0.5]) for (const z of [-10,0,10]) {
        const target = {x,y:0.8,z};
        const fov = constrainInteriorCamera(target,offset,aspect,width,21,0,0.01);
        assert.ok(fov >= 1 && fov <= TACTICAL_FOV);
        if (previous !== undefined) assert.equal(fov,previous,'panning never causes edge zoom');
        previous=fov;
        assertArtworkBounds(target,offset,aspect,width,21,fov);
      }
    }
  }
});

function assertStreetBounds(target, offset, aspect, fov, backdrop = STREET_SKYLINE) {
  const distance = Math.hypot(offset.y, offset.z);
  const ny = offset.y / distance;
  const nz = offset.z / distance;
  const tangent = Math.tan(fov * Math.PI / 360);
  for (const v of [-tangent, tangent]) {
    const travel = -(target.y + offset.y) / (-ny + v * nz);
    for (const h of [-tangent * aspect, tangent * aspect]) {
      const x = target.x + h * travel;
      const z = target.z + offset.z + (-nz - v * ny) * travel;
      assert.ok(Math.abs(x) <= 14 + STREET_CAMERA_PADDING + 1e-8, `ground x ${x}`);
      assert.ok(Math.abs(z) <= 14 + STREET_CAMERA_PADDING + 1e-8, `ground z ${z}`);
    }
  }
  if (!backdrop) return;
  const depth = distance + ny * (target.y - backdrop.y) + nz * (target.z - backdrop.z);
  const bottom = nz * (backdrop.y - target.y) - ny * (backdrop.z - target.z);
  if (bottom > depth * tangent || bottom + backdrop.height < -depth * tangent) return;
  const halfView = depth * tangent * aspect;
  assert.ok(target.x - halfView >= backdrop.x - backdrop.width / 2 + 0.149);
  assert.ok(target.x + halfView <= backdrop.x + backdrop.width / 2 - 0.149);
  assert.ok(bottom + backdrop.height >= depth * tangent - 1e-8, 'skyline top stays outside viewport');
}

test('streets intersect skyline and eight-tile town limits for extreme panning and viewport shapes', () => {
  for (const zoom of [1.45, 28 / 19, 36 / 19]) {
    const offset = { y: 14 * zoom, z: 10 * zoom };
    for (const aspect of [0.6, 1.26, 16 / 9, 21 / 9, 32 / 9]) {
      for (const x of [-100, 0, 100]) {
        for (const z of [-100, 0, 100]) {
          const target = { x, y: 0.8, z };
          const fov = constrainStreetCamera(target, STREET_SKYLINE, offset, aspect, 28, 28);
          assert.ok(fov > 0 && fov <= TACTICAL_FOV);
          assertStreetBounds(target, offset, aspect, fov);
        }
      }
    }
  }
});

test('every walkable street tile and mounted silhouette remains inside 97% of each followed viewport', async () => {
  const { readFile } = await import('node:fs/promises');
  const map = JSON.parse(await readFile(new URL('../data/levels/map_13_procession.json', import.meta.url), 'utf8'));
  for (const zoom of [1.45, 28 / 19, 36 / 19]) {
    const offset = { y: 14 * zoom, z: 10 * zoom };
    for (const aspect of [0.6, 1.26, 16 / 9, 21 / 9, 32 / 9]) {
      for (let z = 0; z < map.height; z++) {
        for (let x = 0; x < map.width; x++) {
          if (!'gGjn'.includes(map.tiles[z][x])) continue;
          const center = { x: x - map.width / 2 + 0.5, y: 0.8, z: z - map.height / 2 + 0.5 };
          const target = { ...center };
          const fov = constrainStreetCamera(target, undefined, offset, aspect, map.width, map.height);
          assertStreetBounds(target, offset, aspect, fov, null);
          const corners = [];
          for (const dx of [-0.5, 0.5]) {
            for (const dz of [-0.5, 0.5]) corners.push({ x: center.x + dx, y: 0, z: center.z + dz });
          }
          const tilt = Math.atan2(14, 10);
          for (const dx of [-0.65, 0.65]) {
            for (const height of [0, 1.7]) {
              corners.push({ x: center.x + dx, y: 0.12 + height * Math.cos(tilt),
                z: center.z + 0.2 - height * Math.sin(tilt) });
            }
          }
          for (const corner of corners) {
            const screen = project(corner, target, offset, aspect, fov);
            assert.ok(Math.abs(screen.x) <= 0.97 && Math.abs(screen.y) <= 0.97,
              `tile/sprite ${x},${z}, aspect ${aspect}, zoom ${zoom}: ${screen.x},${screen.y}`);
          }
        }
      }
    }
  }
});

test('a narrower skyline does not invalidate the ground constraint after horizontal clamping', () => {
  const smallerBackdrop = { ...STREET_SKYLINE, width: 36, height: 14 };
  const offset = { y: 14 * 1.45, z: 10 * 1.45 };
  for (const aspect of [0.6, 16 / 9, 32 / 9]) {
    for (const x of [-100, 100]) {
      const target = { x, y: 0.8, z: -100 };
      const fov = constrainStreetCamera(target, smallerBackdrop, offset, aspect, 28, 28);
      assertStreetBounds(target, offset, aspect, fov, smallerBackdrop);
    }
  }
});

test('the standalone clocktower face and spire remain visible from the gate without a backdrop or zoom change', async () => {
  const { readFile } = await import('node:fs/promises');
  const map = JSON.parse(await readFile(new URL('../data/levels/map_13_procession.json', import.meta.url), 'utf8'));
  const png = await readFile(new URL('../assets/tiles/Cathedral_Streets/clocktower.png', import.meta.url));
  const imageWidth = png.readUInt32BE(16);
  const imageHeight = png.readUInt32BE(20);
  const footprint = map.decorativeHouses.find((house) => house.style === 'clocktower');
  const tilt = Math.atan2(14, 10);
  const width = Math.min(footprint.width - 0.08, footprint.height * 0.98 / (imageHeight / imageWidth * Math.sin(tilt)));
  const art = {
    x: footprint.x + footprint.width / 2 - map.width / 2,
    z: footprint.z + footprint.height - map.height / 2,
    y: 0.12, width, height: width * imageHeight / imageWidth, imageWidth, imageHeight,
  };
  for (const aspect of [16 / 9, 1134 / 897]) {
    const offset = { y: 14 * 28 / 19, z: 10 * 28 / 19 };
    const target = { x: 13 - 14 + 0.5, y: 0.8, z: 2 - 14 + 0.5 };
    const fov = constrainStreetCamera(target, undefined, offset, aspect, 28, 28);
    assert.equal(Math.round(fov), TACTICAL_FOV, 'do not zoom out to reveal distant art');
    const landmark = (pixel) => {
      const height = (1 - pixel.y / art.imageHeight) * art.height;
      return project({
        x: art.x + (pixel.x / art.imageWidth - 0.5) * art.width,
        y: art.y + height * Math.cos(tilt),
        z: art.z - height * Math.sin(tilt),
      }, target, offset, aspect, fov);
    };
    for (const pixel of [{ x: 29, y: 91 }, { x: 29, y: 1 }, { x: 15, y: 76 }, { x: 44, y: 106 }]) {
      const screen = landmark(pixel);
      assert.ok(Math.abs(screen.x) <= 0.97 && Math.abs(screen.y) <= 0.97,
        `clocktower ${JSON.stringify(pixel)}, aspect ${aspect}: ${JSON.stringify(screen)}`);
    }
    const faceLeft = landmark({ x: 15, y: 91 });
    const faceRight = landmark({ x: 44, y: 91 });
    assert.ok((faceRight.x - faceLeft.x) * (aspect * 897) / 2 >= 16,
      'clock face remains large enough to distinguish from ordinary roof windows');
  }
});
