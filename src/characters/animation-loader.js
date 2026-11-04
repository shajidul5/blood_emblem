import * as THREE from 'three';
import animationsConfig from '../../data/animations-config.json';

function getSpriteBounds(imageData, width, height) {
  const data = imageData.data;
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] === 0) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  
  if (right < left) return null;
  return {
    left,
    top,
    right,
    bottom,
    width: right - left + 1,
    height: bottom - top + 1,
  };
}

async function normalizeSpritesToConsistentSize(sprites, characterName, direction) {
  // sprites is an array of textures
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  
  let maxWidth = 0;
  let maxHeight = 0;
  const boundsList = [];
  
  // Find max bounds across all sprites
  for (const texture of sprites) {
    if (!texture || !texture.image) continue;
    
    canvas.width = texture.image.width;
    canvas.height = texture.image.height;
    ctx.drawImage(texture.image, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const bounds = getSpriteBounds(imageData, canvas.width, canvas.height);
    
    if (bounds) {
      boundsList.push(bounds);
      maxWidth = Math.max(maxWidth, bounds.width);
      maxHeight = Math.max(maxHeight, bounds.height);
    } else {
      boundsList.push(null);
    }
  }
  
  if (maxWidth === 0 || maxHeight === 0) return sprites;

  // Sprites are drawn on square planes, so keep the canvas square to avoid stretching.
  const frameSize = Math.max(maxWidth, maxHeight);
  
  // Normalize all sprites to use the max size
  const normalizedSprites = [];
  for (let i = 0; i < sprites.length; i++) {
    const texture = sprites[i];
    const bounds = boundsList[i];
    
    if (!texture || !bounds) {
      normalizedSprites.push(texture);
      continue;
    }
    
    // Create a new canvas with consistent size
    const normalizedCanvas = new OffscreenCanvas(frameSize, frameSize);
    const normalizedCtx = normalizedCanvas.getContext('2d');
    
    // Clear with transparent
    normalizedCtx.clearRect(0, 0, frameSize, frameSize);
    
    // Draw the sprite centered in the new canvas
    const offsetX = Math.round((frameSize - bounds.width) / 2);
    const offsetY = Math.round((frameSize - bounds.height) / 2);
    
    normalizedCtx.drawImage(
      texture.image,
      bounds.left,
      bounds.top,
      bounds.width,
      bounds.height,
      offsetX,
      offsetY,
      bounds.width,
      bounds.height,
    );
    
    // Create a new texture from the normalized canvas
    texture.image = normalizedCanvas;
    texture.needsUpdate = true;
    normalizedSprites.push(texture);
  }
  
  return normalizedSprites;
}


// Load all possible character sprites and animations using literal glob patterns
const mariaIdleSprites = import.meta.glob('../../assets/character/Maria/Idle/rotations/*.png', { eager: true, query: '?url', import: 'default' });
const mariaWalkingFrames = import.meta.glob('../../assets/character/Maria/Idle/animations/Walking/*/frame_*.png', { eager: true, query: '?url', import: 'default' });
const mariaAttackFrames = import.meta.glob('../../assets/character/Maria/attacking_with_katan/animations/*/*/frame_*.png', { eager: true, query: '?url', import: 'default' });

const bartzIdleSprites = import.meta.glob('../../assets/character/Bartz/Idle/rotations/*.png', { eager: true, query: '?url', import: 'default' });
const bartzWalkingFrames = import.meta.glob('../../assets/character/Bartz/Idle/animations/Walking/*/frame_*.png', { eager: true, query: '?url', import: 'default' });
const bartzAttackFrames = import.meta.glob('../../assets/character/Bartz/Idle/animations/Bartz_lunges_forward_and_swings_overhead_with_his/*/frame_*.png', { eager: true, query: '?url', import: 'default' });

const cypherIdleSprites = import.meta.glob('../../assets/character/Cypher/Idle/rotations/*.png', { eager: true, query: '?url', import: 'default' });
const cypherWalkingFrames = import.meta.glob('../../assets/character/Cypher/Idle/animations/Walking/*/frame_*.png', { eager: true, query: '?url', import: 'default' });
const cypherAttackFrames = import.meta.glob('../../assets/character/Cypher/Idle/animations/Raises_hand_and_summons_fireball._The_fire_ball_la/*/frame_*.png', { eager: true, query: '?url', import: 'default' });

const seymourIdleSprites = import.meta.glob('../../assets/character/Seymour/Idle/rotations/*.png', { eager: true, query: '?url', import: 'default' });
const seymourWalkingFrames = import.meta.glob('../../assets/character/Seymour/Idle/animations/Walking/*/frame_*.png', { eager: true, query: '?url', import: 'default' });
const seymourStaffFrames = import.meta.glob('../../assets/character/Seymour/Idle/animations/Staff/*/frame_*.png', { eager: true, query: '?url', import: 'default' });

const bishopSeymourIdleSprites = import.meta.glob('../../assets/character/Bishop_Seymour/rotations/*.png', { eager: true, query: '?url', import: 'default' });
const bishopSeymourWalkingFrames = import.meta.glob('../../assets/character/Bishop_Seymour/animations/Walking/*/frame_*.png', { eager: true, query: '?url', import: 'default' });
const bishopSeymourAttackFrames = import.meta.glob('../../assets/character/Bishop_Seymour/animations/The_figure_lifts_the_heavy_tome_with_the_left_hand/*/frame_*.png', { eager: true, query: '?url', import: 'default' });
const bishopSeymourStaffFrames = import.meta.glob('../../assets/character/Bishop_Seymour/animations/Healing/*/frame_*.png', { eager: true, query: '?url', import: 'default' });

const raiderIdleSprites = import.meta.glob('../../assets/character/Generic_Raider/Idle/rotations/*.png', { eager: true, query: '?url', import: 'default' });
const raiderWalkingFrames = import.meta.glob('../../assets/character/Generic_Raider/Idle/animations/Walking/*/frame_*.png', { eager: true, query: '?url', import: 'default' });
const raiderAttackFrames = import.meta.glob('../../assets/character/Generic_Raider/Fighting_stance_with/animations/*/*/frame_*.png', { eager: true, query: '?url', import: 'default' });

const merfolkIdleSprites = import.meta.glob('../../assets/character/Merfolk/Idle/rotations/*.png', { eager: true, query: '?url', import: 'default' });
const merfolkWalkingFrames = import.meta.glob('../../assets/character/Merfolk/Idle/animations/Walking/*/frame_*.png', { eager: true, query: '?url', import: 'default' });
const merfolkAttackFrames = import.meta.glob('../../assets/character/Merfolk/Idle/animations/Attacking/*/frame_*.png', { eager: true, query: '?url', import: 'default' });
const wolfIdleSprites = import.meta.glob('../../assets/character/Ferral_Wolf/Idle/rotations/*.png', { eager: true, query: '?url', import: 'default' });
const wolfWalkingFrames = import.meta.glob('../../assets/character/Ferral_Wolf/Idle/animations/Walking/*/frame_*.png', { eager: true, query: '?url', import: 'default' });
const wolfAttackFrames = import.meta.glob('../../assets/character/Ferral_Wolf/Idle/animations/Attacking/*/frame_*.png', { eager: true, query: '?url', import: 'default' });
const liamIdleSprites = import.meta.glob('../../assets/character/Liam/Idle/rotations/*.png', { eager: true, query: '?url', import: 'default' });
const liamWalkingFrames = import.meta.glob('../../assets/character/Liam/Idle/animations/Walking/*/frame_*.png', { eager: true, query: '?url', import: 'default' });
const liamAttackFrames = import.meta.glob('../../assets/character/Liam/Idle/animations/Attacking/*/frame_*.png', { eager: true, query: '?url', import: 'default' });

const ravagerMariaIdleSprites = import.meta.glob('../../assets/character/Ravager_Maria/rotations/*.png', { eager: true, query: '?url', import: 'default' });
const ravagerMariaWalkingFrames = import.meta.glob('../../assets/character/Ravager_Maria/animations/Walking/*/frame_*.png', { eager: true, query: '?url', import: 'default' });
const ravagerMariaAttackFrames = import.meta.glob('../../assets/character/Ravager_Maria/animations/Attacking/*/frame_*.png', { eager: true, query: '?url', import: 'default' });
const ravagerMariaFirearmFrames = import.meta.glob('../../assets/character/Ravager_Maria/Ravager_Maria_Firearm/animations/Firearm_Attack/*/frame_*.png', { eager: true, query: '?url', import: 'default' });

const berserkerBartzIdleSprites = import.meta.glob('../../assets/character/Berserker_Bartz/rotations/*.png', { eager: true, query: '?url', import: 'default' });
const berserkerBartzWalkingFrames = import.meta.glob('../../assets/character/Berserker_Bartz/animations/Walking/*/frame_*.png', { eager: true, query: '?url', import: 'default' });
const berserkerBartzAttackFrames = import.meta.glob('../../assets/character/Berserker_Bartz/animations/Attacking/*/frame_*.png', { eager: true, query: '?url', import: 'default' });

const sageCypherIdleSprites = import.meta.glob('../../assets/character/Sage_Cypher/rotations/*.png', { eager: true, query: '?url', import: 'default' });
const sageCypherWalkingFrames = import.meta.glob('../../assets/character/Sage_Cypher/animations/Walking/*/frame_*.png', { eager: true, query: '?url', import: 'default' });
const sageCypherAttackFrames = import.meta.glob('../../assets/character/Sage_Cypher/animations/Attacking/*/frame_*.png', { eager: true, query: '?url', import: 'default' });
const sageCypherStaffFrames = import.meta.glob('../../assets/character/Sage_Cypher/animations/Staff/*/frame_*.png', { eager: true, query: '?url', import: 'default' });

const killianIdleSprites = import.meta.glob('../../assets/character/Killian/rotations/*.png', { eager: true, query: '?url', import: 'default' });
const killianWalkingFrames = import.meta.glob('../../assets/character/Killian/animations/Walking/*/frame_*.png', { eager: true, query: '?url', import: 'default' });
const killianAttackFrames = import.meta.glob('../../assets/character/Killian/animations/Attacking/*/frame_*.png', { eager: true, query: '?url', import: 'default' });

function getDirectionFromPath(path) {
  const parts = path.split('/');
  // For idle sprites: find filename like "east.png" -> "east"
  const filename = parts[parts.length - 1];
  if (filename.match(/^(east|west|north|south|north-east|north-west|south-east|south-west)\.png$/)) {
    return filename.replace('.png', '');
  }
  // For animation frames: find direction folder
  // Pattern: .../direction/frame_N.png or .../type/direction/frame_N.png
  for (let i = parts.length - 2; i >= 0; i--) {
    const part = parts[i];
    if (part.match(/^(east|west|north|south|north-east|north-west|south-east|south-west)$/)) {
      return part;
    }
  }
  return null;
}

function getFrameIndexFromPath(path) {
  const match = path.match(/frame_(\d+)\.png$/);
  return match ? Number(match[1]) : null;
}

async function loadCharacterWithAllAnimations(characterName, idleGlob, walkingGlob, attackingGlob) {
  const loader = new THREE.TextureLoader();
  
  // Load all texture URLs first
  const allTextures = {
    idle: {},
    walking: {},
    attacking: {},
  };
  
  // Load idle sprites
  for (const [path, url] of Object.entries(idleGlob)) {
    const direction = getDirectionFromPath(path);
    if (!direction) continue;
    
    try {
      const texture = await new Promise((resolve, reject) => {
        loader.load(url, resolve, undefined, reject);
      });
      texture.magFilter = THREE.NearestFilter;
      texture.minFilter = THREE.NearestFilter;
      texture.generateMipmaps = false;
      texture.colorSpace = THREE.SRGBColorSpace;
      if (!allTextures.idle[direction]) allTextures.idle[direction] = [];
      allTextures.idle[direction].push(texture);
    } catch (error) {
      console.warn(`Could not load ${characterName} idle sprite for ${direction}: ${error.message}`);
    }
  }
  
  // Load walking frames
  const walkingEntries = [];
  for (const [path, url] of Object.entries(walkingGlob)) {
    const direction = getDirectionFromPath(path);
    const frameIndex = getFrameIndexFromPath(path);
    if (!direction || frameIndex === null) continue;
    
    try {
      const texture = await new Promise((resolve, reject) => {
        loader.load(url, resolve, undefined, reject);
      });
      texture.magFilter = THREE.NearestFilter;
      texture.minFilter = THREE.NearestFilter;
      texture.generateMipmaps = false;
      texture.colorSpace = THREE.SRGBColorSpace;
      walkingEntries.push({ direction, frameIndex, texture });
    } catch (error) {
      console.warn(`Could not load ${characterName} walking frame for ${direction}: ${error.message}`);
    }
  }
  
  // Organize walking frames by direction
  for (const direction of animationsConfig.animationDirections) {
    allTextures.walking[direction] = walkingEntries
      .filter(e => e.direction === direction)
      .sort((a, b) => a.frameIndex - b.frameIndex)
      .map(e => e.texture);
  }
  
  // Load attacking frames
  const attackingEntries = [];
  for (const [path, url] of Object.entries(attackingGlob)) {
    const direction = getDirectionFromPath(path);
    const frameIndex = getFrameIndexFromPath(path);
    if (!direction || frameIndex === null) continue;
    
    try {
      const texture = await new Promise((resolve, reject) => {
        loader.load(url, resolve, undefined, reject);
      });
      texture.magFilter = THREE.NearestFilter;
      texture.minFilter = THREE.NearestFilter;
      texture.generateMipmaps = false;
      texture.colorSpace = THREE.SRGBColorSpace;
      attackingEntries.push({ direction, frameIndex, texture });
    } catch (error) {
      console.warn(`Could not load ${characterName} attacking frame for ${direction}: ${error.message}`);
    }
  }
  
  // Organize attacking frames by direction
  for (const direction of animationsConfig.animationDirections) {
    allTextures.attacking[direction] = attackingEntries
      .filter(e => e.direction === direction)
      .sort((a, b) => a.frameIndex - b.frameIndex)
      .map(e => e.texture);
  }
  
  // Now normalize all textures (idle + walking + attacking) per direction
  const result = {
    idle: {},
    walking: {},
    attacking: {},
  };
  
  for (const direction of animationsConfig.animationDirections) {
    // Collect all textures for this direction
    const allSpritesForDirection = [
      ...(allTextures.idle[direction] || []),
      ...(allTextures.walking[direction] || []),
      ...(allTextures.attacking[direction] || []),
    ];
    
    if (allSpritesForDirection.length === 0) continue;
    
    // Normalize all together
    const normalized = await normalizeSpritesToConsistentSize(allSpritesForDirection, characterName, direction);
    
    // Split back into categories
    let idx = 0;
    
    // Idle sprites
    const idleCount = allTextures.idle[direction]?.length || 0;
    for (let i = 0; i < idleCount; i++) {
      if (!result.idle[direction]) result.idle[direction] = [];
      result.idle[direction].push(normalized[idx++]);
    }
    
    // Walking frames
    const walkingCount = allTextures.walking[direction]?.length || 0;
    result.walking[direction] = [];
    for (let i = 0; i < walkingCount; i++) {
      result.walking[direction].push(normalized[idx++]);
    }
    
    // Attacking frames
    const attackingCount = allTextures.attacking[direction]?.length || 0;
    result.attacking[direction] = [];
    for (let i = 0; i < attackingCount; i++) {
      result.attacking[direction].push(normalized[idx++]);
    }
  }
  
  // Return organized by type
  return {
    idle: Object.fromEntries(
      animationsConfig.animationDirections.map(d => [d, result.idle[d]?.[0] || null])
    ),
    walking: Object.fromEntries(
      animationsConfig.animationDirections.map(d => [d, result.walking[d] || []])
    ),
    attacking: Object.fromEntries(
      animationsConfig.animationDirections.map(d => [d, result.attacking[d] || []])
    ),
  };
}

export async function loadCharacterSprites() {
  const result = {
    animationFrameDuration: animationsConfig.animationFrameDuration,
  };

  // Load Maria with all animations normalized together
  const mariaData = await loadCharacterWithAllAnimations('Maria', mariaIdleSprites, mariaWalkingFrames, mariaAttackFrames);
  result.maria = mariaData.idle;
  result.mariaWalkingFrames = mariaData.walking;
  result.mariaAttackFrames = mariaData.attacking;

  // Load Bartz with all animations normalized together
  const bartzData = await loadCharacterWithAllAnimations('Bartz', bartzIdleSprites, bartzWalkingFrames, bartzAttackFrames);
  result.bartz = bartzData.idle;
  result.bartzWalkingFrames = bartzData.walking;
  result.bartzAttackFrames = bartzData.attacking;

  const cypherData = await loadCharacterWithAllAnimations('Cypher', cypherIdleSprites, cypherWalkingFrames, cypherAttackFrames);
  result.cypher = cypherData.idle;
  result.cypherWalkingFrames = cypherData.walking;
  result.cypherAttackFrames = cypherData.attacking;

  const seymourData = await loadCharacterWithAllAnimations('Seymour', seymourIdleSprites, seymourWalkingFrames, seymourStaffFrames);
  result.seymour = seymourData.idle;
  result.seymourWalkingFrames = seymourData.walking;
  result.seymourStaffFrames = seymourData.attacking;

  const bishopSeymourData = await loadCharacterWithAllAnimations('Bishop_Seymour', bishopSeymourIdleSprites, bishopSeymourWalkingFrames, bishopSeymourAttackFrames);
  result.bishopSeymour = bishopSeymourData.idle;
  result.bishopSeymourWalkingFrames = bishopSeymourData.walking;
  result.bishopSeymourAttackFrames = bishopSeymourData.attacking;
  const bishopSeymourStaffData = await loadCharacterWithAllAnimations('Bishop_Seymour_Staff', bishopSeymourIdleSprites, bishopSeymourWalkingFrames, bishopSeymourStaffFrames);
  result.bishopSeymourStaffFrames = bishopSeymourStaffData.attacking;

  // Load Raider with all animations normalized together
  const raiderData = await loadCharacterWithAllAnimations('Raider', raiderIdleSprites, raiderWalkingFrames, raiderAttackFrames);
  result.raider = raiderData.idle;
  result.raiderWalkingFrames = raiderData.walking;
  result.raiderAttackFrames = raiderData.attacking;

  const merfolkData = await loadCharacterWithAllAnimations('Merfolk', merfolkIdleSprites, merfolkWalkingFrames, merfolkAttackFrames);
  result.merfolk = merfolkData.idle;
  result.merfolkWalkingFrames = merfolkData.walking;
  result.merfolkAttackFrames = merfolkData.attacking;
  const wolfData = await loadCharacterWithAllAnimations('Ferral_Wolf', wolfIdleSprites, wolfWalkingFrames, wolfAttackFrames);
  result.feralWolf = wolfData.idle;
  result.feralWolfWalkingFrames = wolfData.walking;
  result.feralWolfAttackFrames = wolfData.attacking;
  const liamData = await loadCharacterWithAllAnimations('Liam', liamIdleSprites, liamWalkingFrames, liamAttackFrames);
  result.liam = liamData.idle;
  result.liamWalkingFrames = liamData.walking;
  result.liamAttackFrames = liamData.attacking;

  const killianData = await loadCharacterWithAllAnimations('Killian', killianIdleSprites, killianWalkingFrames, killianAttackFrames);
  result.killian = killianData.idle;
  result.killianWalkingFrames = killianData.walking;
  result.killianAttackFrames = killianData.attacking;

  const ravagerMariaData = await loadCharacterWithAllAnimations('Ravager_Maria', ravagerMariaIdleSprites, ravagerMariaWalkingFrames, ravagerMariaAttackFrames);
  result.ravagerMaria = ravagerMariaData.idle;
  result.ravagerMariaWalkingFrames = ravagerMariaData.walking;
  result.ravagerMariaAttackFrames = ravagerMariaData.attacking;
  const ravagerMariaFirearmData = await loadCharacterWithAllAnimations('Ravager_Maria_Firearm', ravagerMariaIdleSprites, ravagerMariaWalkingFrames, ravagerMariaFirearmFrames);
  result.ravagerMariaFirearmFrames = ravagerMariaFirearmData.attacking;

  const berserkerBartzData = await loadCharacterWithAllAnimations('Berserker_Bartz', berserkerBartzIdleSprites, berserkerBartzWalkingFrames, berserkerBartzAttackFrames);
  result.berserkerBartz = berserkerBartzData.idle;
  result.berserkerBartzWalkingFrames = berserkerBartzData.walking;
  result.berserkerBartzAttackFrames = berserkerBartzData.attacking;

  const sageCypherData = await loadCharacterWithAllAnimations('Sage_Cypher', sageCypherIdleSprites, sageCypherWalkingFrames, sageCypherAttackFrames);
  result.sageCypher = sageCypherData.idle;
  result.sageCypherWalkingFrames = sageCypherData.walking;
  result.sageCypherAttackFrames = sageCypherData.attacking;
  // Staff casting animation, for use once staff weapons exist.
  const sageCypherStaffData = await loadCharacterWithAllAnimations('Sage_Cypher_Staff', sageCypherIdleSprites, sageCypherWalkingFrames, sageCypherStaffFrames);
  result.sageCypherStaffFrames = sageCypherStaffData.attacking;

  return result;
}
