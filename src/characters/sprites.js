import * as THREE from 'three';
import idleEast from '../../assets/character/Maria/Idle/rotations/east.png?url&no-inline';
import idleNorth from '../../assets/character/Maria/Idle/rotations/north.png?url&no-inline';
import idleNorthEast from '../../assets/character/Maria/Idle/rotations/north-east.png?url&no-inline';
import idleNorthWest from '../../assets/character/Maria/Idle/rotations/north-west.png?url&no-inline';
import idleSouth from '../../assets/character/Maria/Idle/rotations/south.png?url&no-inline';
import idleSouthEast from '../../assets/character/Maria/Idle/rotations/south-east.png?url&no-inline';
import idleSouthWest from '../../assets/character/Maria/Idle/rotations/south-west.png?url&no-inline';
import idleWest from '../../assets/character/Maria/Idle/rotations/west.png?url&no-inline';
import attackingEast from '../../assets/character/Maria/attacking_with_katan/rotations/east.png?url&no-inline';
import attackingNorth from '../../assets/character/Maria/attacking_with_katan/rotations/north.png?url&no-inline';
import attackingNorthEast from '../../assets/character/Maria/attacking_with_katan/rotations/north-east.png?url&no-inline';
import attackingNorthWest from '../../assets/character/Maria/attacking_with_katan/rotations/north-west.png?url&no-inline';
import attackingSouth from '../../assets/character/Maria/attacking_with_katan/rotations/south.png?url&no-inline';
import attackingSouthEast from '../../assets/character/Maria/attacking_with_katan/rotations/south-east.png?url&no-inline';
import attackingSouthWest from '../../assets/character/Maria/attacking_with_katan/rotations/south-west.png?url&no-inline';
import attackingWest from '../../assets/character/Maria/attacking_with_katan/rotations/west.png?url&no-inline';
import walkingEast from '../../assets/character/Maria/walking_animation/rotations/east.png?url&no-inline';
import walkingNorth from '../../assets/character/Maria/walking_animation/rotations/north.png?url&no-inline';
import walkingNorthEast from '../../assets/character/Maria/walking_animation/rotations/north-east.png?url&no-inline';
import walkingNorthWest from '../../assets/character/Maria/walking_animation/rotations/north-west.png?url&no-inline';
import walkingSouth from '../../assets/character/Maria/walking_animation/rotations/south.png?url&no-inline';
import walkingSouthEast from '../../assets/character/Maria/walking_animation/rotations/south-east.png?url&no-inline';
import walkingSouthWest from '../../assets/character/Maria/walking_animation/rotations/south-west.png?url&no-inline';
import walkingWest from '../../assets/character/Maria/walking_animation/rotations/west.png?url&no-inline';
import bartzEast from '../../assets/character/Bartz/Idle/rotations/east.png?url&no-inline';
import bartzNorth from '../../assets/character/Bartz/Idle/rotations/north.png?url&no-inline';
import bartzNorthEast from '../../assets/character/Bartz/Idle/rotations/north-east.png?url&no-inline';
import bartzNorthWest from '../../assets/character/Bartz/Idle/rotations/north-west.png?url&no-inline';
import bartzSouth from '../../assets/character/Bartz/Idle/rotations/south.png?url&no-inline';
import bartzSouthEast from '../../assets/character/Bartz/Idle/rotations/south-east.png?url&no-inline';
import bartzSouthWest from '../../assets/character/Bartz/Idle/rotations/south-west.png?url&no-inline';
import bartzWest from '../../assets/character/Bartz/Idle/rotations/west.png?url&no-inline';
import raiderEast from '../../assets/character/Generic_Raider/Idle/rotations/east.png?url&no-inline';
import raiderNorth from '../../assets/character/Generic_Raider/Idle/rotations/north.png?url&no-inline';
import raiderNorthEast from '../../assets/character/Generic_Raider/Idle/rotations/north-east.png?url&no-inline';
import raiderNorthWest from '../../assets/character/Generic_Raider/Idle/rotations/north-west.png?url&no-inline';
import raiderSouth from '../../assets/character/Generic_Raider/Idle/rotations/south.png?url&no-inline';
import raiderSouthEast from '../../assets/character/Generic_Raider/Idle/rotations/south-east.png?url&no-inline';
import raiderSouthWest from '../../assets/character/Generic_Raider/Idle/rotations/south-west.png?url&no-inline';
import raiderWest from '../../assets/character/Generic_Raider/Idle/rotations/west.png?url&no-inline';

const WALKING_FRAME_URLS = import.meta.glob(
  '../../assets/character/Maria/Idle/animations/Walking/*/frame_*.png',
  { eager: true, query: '?url', import: 'default' },
);
const ATTACK_FRAME_URLS = import.meta.glob(
  '../../assets/character/Maria/attacking_with_katan/animations/*/*/frame_*.png',
  { eager: true, query: '?url', import: 'default' },
);
const ANIMATION_FRAME_DURATION = 0.12;

const CHARACTER_SPRITE_URLS = {
  east: { idle: idleEast, walking: walkingEast, attacking: attackingEast },
  west: { idle: idleWest, walking: walkingWest, attacking: attackingWest },
  north: { idle: idleNorth, walking: walkingNorth, attacking: attackingNorth },
  south: { idle: idleSouth, walking: walkingSouth, attacking: attackingSouth },
  'north-east': { idle: idleNorthEast, walking: walkingNorthEast, attacking: attackingNorthEast },
  'north-west': { idle: idleNorthWest, walking: walkingNorthWest, attacking: attackingNorthWest },
  'south-east': { idle: idleSouthEast, walking: walkingSouthEast, attacking: attackingSouthEast },
  'south-west': { idle: idleSouthWest, walking: walkingSouthWest, attacking: attackingSouthWest },
};

const BARTZ_SPRITE_URLS = {
  east: bartzEast,
  west: bartzWest,
  north: bartzNorth,
  south: bartzSouth,
  'north-east': bartzNorthEast,
  'north-west': bartzNorthWest,
  'south-east': bartzSouthEast,
  'south-west': bartzSouthWest,
};

const RAIDER_SPRITE_URLS = {
  east: raiderEast,
  west: raiderWest,
  north: raiderNorth,
  south: raiderSouth,
  'north-east': raiderNorthEast,
  'north-west': raiderNorthWest,
  'south-east': raiderSouthEast,
  'south-west': raiderSouthWest,
};

const BARTZ_WALKING_FRAME_URLS = import.meta.glob(
  '../../assets/character/Bartz/Idle/animations/Walking/*/frame_*.png',
  { eager: true, query: '?url', import: 'default' },
);

const BARTZ_ATTACK_FRAME_URLS = import.meta.glob(
  '../../assets/character/Bartz/Idle/animations/Bartz_lunges_forward_and_swings_overhead_with_his/*/frame_*.png',
  { eager: true, query: '?url', import: 'default' },
);

const RAIDER_WALKING_FRAME_URLS = import.meta.glob(
  '../../assets/character/Generic_Raider/Idle/animations/Walking/*/frame_*.png',
  { eager: true, query: '?url', import: 'default' },
);

const RAIDER_ATTACK_FRAME_URLS = import.meta.glob(
  '../../assets/character/Generic_Raider/Fighting_stance_with/animations/*/*/frame_*.png',
  { eager: true, query: '?url', import: 'default' },
);

function normalizeCharacterTexture(texture) {
  const source = document.createElement('canvas');
  source.width = texture.image.naturalWidth || texture.image.width;
  source.height = texture.image.naturalHeight || texture.image.height;
  const sourceContext = source.getContext('2d', { willReadFrequently: true });
  sourceContext.drawImage(texture.image, 0, 0);
  const { data } = sourceContext.getImageData(0, 0, source.width, source.height);
  let left = source.width;
  let top = source.height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < source.height; y++) {
    for (let x = 0; x < source.width; x++) {
      if (data[(y * source.width + x) * 4 + 3] === 0) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  if (right < left || bottom < top) {
    throw new Error('Character sprite contains no visible pixels.');
  }

  const frameSize = 84;
  const visibleHeight = 55;
  const baseline = frameSize;
  const visibleWidth = (right - left + 1) * visibleHeight / (bottom - top + 1);
  const frame = document.createElement('canvas');
  frame.width = frame.height = frameSize;
  const frameContext = frame.getContext('2d');
  frameContext.imageSmoothingEnabled = false;
  frameContext.drawImage(
    source,
    left,
    top,
    right - left + 1,
    bottom - top + 1,
    (frameSize - visibleWidth) / 2,
    baseline - visibleHeight,
    visibleWidth,
    visibleHeight,
  );
  texture.image = frame;
  texture.needsUpdate = true;
}

export async function loadCharacterSprites() {
  const loader = new THREE.TextureLoader();
  const entries = await Promise.all(Object.entries(CHARACTER_SPRITE_URLS).map(async ([direction, poses]) => {
    const loadedPoses = await Promise.all(Object.entries(poses).map(async ([pose, url]) => {
      try {
        const texture = await loader.loadAsync(url);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.generateMipmaps = false;
        texture.colorSpace = THREE.SRGBColorSpace;
        normalizeCharacterTexture(texture);
        return [pose, texture];
      } catch (error) {
        throw new Error(`Could not load ${direction} ${pose} sprite (${url}): ${error.message}`);
      }
    }));
    return [direction, Object.fromEntries(loadedPoses)];
  }));
  const walkingFrameEntries = await Promise.all(
    Object.entries(WALKING_FRAME_URLS).map(async ([path, url]) => {
      const direction = path.match(/Walking\/([^/]+)\/frame_\d+\.png$/)?.[1];
      if (!direction) throw new Error(`Unexpected walking animation asset path: ${path}`);
      try {
        const texture = await loader.loadAsync(url);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.generateMipmaps = false;
        texture.colorSpace = THREE.SRGBColorSpace;
        normalizeCharacterTexture(texture);
        return [direction, path, texture];
      } catch (error) {
        throw new Error(`Could not load ${direction} walking animation frame (${url}): ${error.message}`);
      }
    }),
  );
  const walkingFrames = Object.fromEntries(
    Object.keys(CHARACTER_SPRITE_URLS).map((direction) => [
      direction,
      walkingFrameEntries
        .filter(([frameDirection]) => frameDirection === direction)
        .sort((first, second) => first[1].localeCompare(second[1]))
        .map(([, , texture]) => texture),
    ]),
  );
  for (const [direction, frames] of Object.entries(walkingFrames)) {
    if (!frames.length) throw new Error(`No walking animation frames found for ${direction}.`);
  }
  const attackFrameEntries = await Promise.all(
    Object.entries(ATTACK_FRAME_URLS).map(async ([path, url]) => {
      const match = path.match(/animations\/[^/]+\/([^/]+)\/frame_(\d+)\.png$/);
      if (!match) throw new Error(`Unexpected attack animation asset path: ${path}`);
      const [, direction, frameIndex] = match;
      try {
        const texture = await loader.loadAsync(url);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.generateMipmaps = false;
        texture.colorSpace = THREE.SRGBColorSpace;
        normalizeCharacterTexture(texture);
        return [direction, Number(frameIndex), texture];
      } catch (error) {
        throw new Error(`Could not load ${direction} attack animation frame (${url}): ${error.message}`);
      }
    }),
  );
  const attackFrames = Object.fromEntries(
    Object.keys(CHARACTER_SPRITE_URLS).map((direction) => [
      direction,
      attackFrameEntries
        .filter(([frameDirection]) => frameDirection === direction)
        .sort((first, second) => first[1] - second[1])
        .map(([, , texture]) => texture),
    ]),
  );
  for (const [direction, frames] of Object.entries(attackFrames)) {
    if (!frames.length) throw new Error(`No attack animation frames found for ${direction}.`);
  }
  const bartz = Object.fromEntries(await Promise.all(
    Object.entries(BARTZ_SPRITE_URLS).map(async ([direction, url]) => {
      try {
        const texture = await loader.loadAsync(url);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.generateMipmaps = false;
        texture.colorSpace = THREE.SRGBColorSpace;
        normalizeCharacterTexture(texture);
        return [direction, texture];
      } catch (error) {
        throw new Error(`Could not load Bartz's ${direction} sprite (${url}): ${error.message}`);
      }
    }),
  ));
  const raider = Object.fromEntries(await Promise.all(
    Object.entries(RAIDER_SPRITE_URLS).map(async ([direction, url]) => {
      try {
        const texture = await loader.loadAsync(url);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.generateMipmaps = false;
        texture.colorSpace = THREE.SRGBColorSpace;
        normalizeCharacterTexture(texture);
        return [direction, texture];
      } catch (error) {
        throw new Error(`Could not load the generic raider's ${direction} sprite (${url}): ${error.message}`);
      }
    }),
  ));
  const bartzWalkingFrameEntries = await Promise.all(
    Object.entries(BARTZ_WALKING_FRAME_URLS).map(async ([path, url]) => {
      const match = path.match(/Walking\/([^/]+)\/frame_(\d+)\.png$/);
      if (!match) throw new Error(`Unexpected Bartz walking animation asset path: ${path}`);
      const [, direction, frameIndex] = match;
      try {
        const texture = await loader.loadAsync(url);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.generateMipmaps = false;
        texture.colorSpace = THREE.SRGBColorSpace;
        normalizeCharacterTexture(texture);
        return [direction, Number(frameIndex), texture];
      } catch (error) {
        throw new Error(`Could not load Bartz's ${direction} walking frame (${url}): ${error.message}`);
      }
    }),
  );
  const bartzWalkingFrames = Object.fromEntries(
    Object.keys(BARTZ_SPRITE_URLS).map((direction) => [
      direction,
      bartzWalkingFrameEntries
        .filter(([frameDirection]) => frameDirection === direction)
        .sort((first, second) => first[1] - second[1])
        .map(([, , texture]) => texture),
    ]),
  );
  for (const [direction, frames] of Object.entries(bartzWalkingFrames)) {
    if (!frames.length) throw new Error(`No Bartz walking animation frames found for ${direction}.`);
  }
  const bartzAttackFrameEntries = await Promise.all(
    Object.entries(BARTZ_ATTACK_FRAME_URLS).map(async ([path, url]) => {
      const match = path.match(/Bartz_lunges_forward_and_swings_overhead_with_his\/([^/]+)\/frame_(\d+)\.png$/);
      if (!match) throw new Error(`Unexpected Bartz attack animation asset path: ${path}`);
      const [, direction, frameIndex] = match;
      try {
        const texture = await loader.loadAsync(url);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.generateMipmaps = false;
        texture.colorSpace = THREE.SRGBColorSpace;
        normalizeCharacterTexture(texture);
        return [direction, Number(frameIndex), texture];
      } catch (error) {
        throw new Error(`Could not load Bartz's ${direction} attack frame (${url}): ${error.message}`);
      }
    }),
  );
  const bartzAttackFrames = Object.fromEntries(
    Object.keys(BARTZ_SPRITE_URLS).map((direction) => [
      direction,
      bartzAttackFrameEntries
        .filter(([frameDirection]) => frameDirection === direction)
        .sort((first, second) => first[1] - second[1])
        .map(([, , texture]) => texture),
    ]),
  );
  for (const [direction, frames] of Object.entries(bartzAttackFrames)) {
    if (!frames.length) throw new Error(`No Bartz attack animation frames found for ${direction}.`);
  }
  const raiderWalkingFrameEntries = await Promise.all(
    Object.entries(RAIDER_WALKING_FRAME_URLS).map(async ([path, url]) => {
      const match = path.match(/Walking\/([^/]+)\/frame_(\d+)\.png$/);
      if (!match) throw new Error(`Unexpected Raider walking animation asset path: ${path}`);
      const [, direction, frameIndex] = match;
      try {
        const texture = await loader.loadAsync(url);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.generateMipmaps = false;
        texture.colorSpace = THREE.SRGBColorSpace;
        normalizeCharacterTexture(texture);
        return [direction, Number(frameIndex), texture];
      } catch (error) {
        throw new Error(`Could not load Raider's ${direction} walking frame (${url}): ${error.message}`);
      }
    }),
  );
  const raiderWalkingFrames = Object.fromEntries(
    Object.keys(RAIDER_SPRITE_URLS).map((direction) => [
      direction,
      raiderWalkingFrameEntries
        .filter(([frameDirection]) => frameDirection === direction)
        .sort((first, second) => first[1] - second[1])
        .map(([, , texture]) => texture),
    ]),
  );
  for (const [direction, frames] of Object.entries(raiderWalkingFrames)) {
    if (!frames.length) throw new Error(`No Raider walking animation frames found for ${direction}.`);
  }
  const raiderAttackFrameEntries = await Promise.all(
    Object.entries(RAIDER_ATTACK_FRAME_URLS).map(async ([path, url]) => {
      const match = path.match(/Attacking_forward_with_the_battle_axe_in_hand\/([^/]+)\/frame_(\d+)\.png$/);
      if (!match) throw new Error(`Unexpected Raider attack animation asset path: ${path}`);
      const [, direction, frameIndex] = match;
      try {
        const texture = await loader.loadAsync(url);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.generateMipmaps = false;
        texture.colorSpace = THREE.SRGBColorSpace;
        normalizeCharacterTexture(texture);
        return [direction, Number(frameIndex), texture];
      } catch (error) {
        throw new Error(`Could not load Raider's ${direction} attack frame (${url}): ${error.message}`);
      }
    }),
  );
  const raiderAttackFrames = Object.fromEntries(
    Object.keys(RAIDER_SPRITE_URLS).map((direction) => [
      direction,
      raiderAttackFrameEntries
        .filter(([frameDirection]) => frameDirection === direction)
        .sort((first, second) => first[1] - second[1])
        .map(([, , texture]) => texture),
    ]),
  );
  for (const [direction, frames] of Object.entries(raiderAttackFrames)) {
    if (!frames.length) throw new Error(`No Raider attack animation frames found for ${direction}.`);
  }
  return {
    ...Object.fromEntries(entries),
    bartz,
    raider,
    walkingFrames,
    attackFrames,
    bartzWalkingFrames,
    bartzAttackFrames,
    raiderWalkingFrames,
    raiderAttackFrames,
    animationFrameDuration: ANIMATION_FRAME_DURATION,
  };
}
