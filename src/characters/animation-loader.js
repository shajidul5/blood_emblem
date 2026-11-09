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

async function normalizeSpritesToConsistentSize(sprites, characterName, direction, referenceIdle) {
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
  let frameSize = Math.max(maxWidth, maxHeight);
  if (referenceIdle && boundsList[0]) {
    const image = referenceIdle.image;
    canvas.width = image.width;
    canvas.height = image.height;
    ctx.drawImage(image, 0, 0);
    const referenceBounds = getSpriteBounds(ctx.getImageData(0, 0, canvas.width, canvas.height), canvas.width, canvas.height);
    if (!referenceBounds) throw new Error(`Missing visible reference sprite for ${characterName} ${direction}.`);
    // Padding all frames equally matches idle height without resampling pixel art or changing animation proportions.
    frameSize = Math.max(frameSize, Math.round(boundsList[0].height * image.height / referenceBounds.height));
  }
  
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

const genericWolfmanIdleSprites = import.meta.glob('../../assets/character/Generic_Wolfman/rotations/*.png', { eager: true, query: '?url', import: 'default' });
const genericWolfmanWalkingFrames = import.meta.glob('../../assets/character/Generic_Wolfman/animations/Walking/*/frame_*.png', { eager: true, query: '?url', import: 'default' });
const genericWolfmanAttackFrames = import.meta.glob('../../assets/character/Generic_Wolfman/animations/The_creature_pulls_its_claws_tight_against_its_che/*/frame_*.png', { eager: true, query: '?url', import: 'default' });
const genericArcherIdleSprites = import.meta.glob('../../assets/character/Generic_Archer/rotations/*.png', { eager: true, query: '?url', import: 'default' });
const genericArcherWalkingFrames = import.meta.glob('../../assets/character/Generic_Archer/animations/Walking/*/frame_*.png', { eager: true, query: '?url', import: 'default' });
const genericArcherAttackFrames = import.meta.glob('../../assets/character/Generic_Archer/animations/Attacking/*/frame_*.png', { eager: true, query: '?url', import: 'default' });
const genericMageIdleSprites = import.meta.glob('../../assets/character/Generic_Mage/rotations/*.png', { eager: true, query: '?url', import: 'default' });
const genericMageWalkingFrames = import.meta.glob('../../assets/character/Generic_Mage/animations/Walking/*/frame_*.png', { eager: true, query: '?url', import: 'default' });
const genericMageAttackFrames = import.meta.glob('../../assets/character/Generic_Mage/animations/Attacking/*/frame_*.png', { eager: true, query: '?url', import: 'default' });
const bloodBeastIdleSprites = import.meta.glob('../../assets/character/Blood_Beast/rotations/*.png', { eager: true, query: '?url', import: 'default' });
const ravenIdleSprites = import.meta.glob('../../assets/character/Raven/rotations/*.png', { eager: true, query: '?url', import: 'default' });
const ravenWalkingFrames = import.meta.glob('../../assets/character/Raven/animations/Walking/*/frame_*.png', { eager: true, query: '?url', import: 'default' });
const ravenAttackFrames = import.meta.glob('../../assets/character/Raven/animations/Attacking/*/frame_*.png', { eager: true, query: '?url', import: 'default' });
const bloodBeastWalkingFrames = import.meta.glob('../../assets/character/Blood_Beast/animations/walking/*/frame_*.png', { eager: true, query: '?url', import: 'default' });
const bloodBeastAttackFrames = import.meta.glob('../../assets/character/Blood_Beast/animations/The_beast_pulls_both_giant_arms_back_to_its_flanks/*/frame_*.png', { eager: true, query: '?url', import: 'default' });
const genericKnightIdleSprites = import.meta.glob('../../assets/character/Generic_Knight/rotations/*.png', { eager: true, query: '?url', import: 'default' });
const genericKnightWalkingFrames = import.meta.glob('../../assets/character/Generic_Knight/animations/Walking/*/frame_*.png', { eager: true, query: '?url', import: 'default' });
const genericKnightAttackFrames = import.meta.glob('../../assets/character/Generic_Knight/animations/Attacking/*/frame_*.png', { eager: true, query: '?url', import: 'default' });
const genericCavalierIdleSprites = import.meta.glob('../../assets/character/Generic_cavalier/rotations/*.png', { eager: true, query: '?url', import: 'default' });
const genericCavalierWalkingFrames = import.meta.glob('../../assets/character/Generic_cavalier/animations/Walking/*/frame_*.png', { eager: true, query: '?url', import: 'default' });
const genericCavalierAttackFrames = import.meta.glob('../../assets/character/Generic_cavalier/animations/The_knight_pulls_the_lance_back_towards_the_should/*/frame_*.png', { eager: true, query: '?url', import: 'default' });
const linusIdleSprites = import.meta.glob('../../assets/character/Linus/rotations/*.png', { eager: true, query: '?url', import: 'default' });
const linusWalkingFrames = import.meta.glob('../../assets/character/Linus/animations/Walking/*/frame_*.png', { eager: true, query: '?url', import: 'default' });
const linusAttackFrames = import.meta.glob('../../assets/character/Linus/animations/The_rider_pulls_the_lance_back_towards_the_shoulde/*/frame_*.png', { eager: true, query: '?url', import: 'default' });
const linusSwordIdleSprites = import.meta.glob('../../assets/character/Linus/Linus_sword/rotations/*.png', { eager: true, query: '?url', import: 'default' });
const linusSwordAttackFrames = import.meta.glob('../../assets/character/Linus/Linus_sword/animations/Attacking/*/frame_*.png', { eager: true, query: '?url', import: 'default' });
const villagerIdleSprites = import.meta.glob('../../assets/character/Villager/rotations/*.png', { eager: true, query: '?url', import: 'default' });
const villagerWalkingFrames = import.meta.glob('../../assets/character/Villager/animations/walking/*/frame_*.png', { eager: true, query: '?url', import: 'default' });
const genericPaladinIdleSprites = import.meta.glob('../../assets/character/Generic_Paladin/rotations/*.png', { eager: true, query: '?url', import: 'default' });
const genericPaladinWalkingFrames = import.meta.glob('../../assets/character/Generic_Paladin/animations/walking/*/frame_*.png', { eager: true, query: '?url', import: 'default' });
const genericPaladinAttackFrames = import.meta.glob('../../assets/character/Generic_Paladin/animations/Attacking/*/frame_*.png', { eager: true, query: '?url', import: 'default' });
const genericPaladinSwordIdleSprites = import.meta.glob('../../assets/character/Generic_Paladin/Generic_Sword_Paladin/rotations/*.png', { eager: true, query: '?url', import: 'default' });
const genericPaladinSwordAttackFrames = import.meta.glob('../../assets/character/Generic_Paladin/Generic_Sword_Paladin/animations/Attacking/*/frame_*.png', { eager: true, query: '?url', import: 'default' });
const paladinLinusIdleSprites = import.meta.glob('../../assets/character/Paladin_Linus/rotations/*.png', { eager: true, query: '?url', import: 'default' });
const paladinLinusWalkingFrames = import.meta.glob('../../assets/character/Paladin_Linus/animations/Walking/*/frame_*.png', { eager: true, query: '?url', import: 'default' });
const paladinLinusAttackFrames = import.meta.glob('../../assets/character/Paladin_Linus/animations/Attacking/*/frame_*.png', { eager: true, query: '?url', import: 'default' });
const paladinLinusSwordIdleSprites = import.meta.glob('../../assets/character/Paladin_Linus/Paladin_Linus_Sword/rotations/*.png', { eager: true, query: '?url', import: 'default' });
const paladinLinusSwordAttackFrames = import.meta.glob('../../assets/character/Paladin_Linus/Paladin_Linus_Sword/animations/Attacking/*/frame_*.png', { eager: true, query: '?url', import: 'default' });
const starkIdleSprites = import.meta.glob('../../assets/character/Stark/rotations/*.png', { eager: true, query: '?url', import: 'default' });
const heartrootIdleSprites = import.meta.glob('../../assets/character/Heartroot/rotations/*.png', { eager: true, query: '?url', import: 'default' });
const starkWalkingFrames = import.meta.glob('../../assets/character/Stark/animations/Walking/*/frame_*.png', { eager: true, query: '?url', import: 'default' });
const starkAttackFrames = import.meta.glob('../../assets/character/Stark/animations/The_character_pulls_back_the_bowstring_with_the_ri/*/frame_*.png', { eager: true, query: '?url', import: 'default' });
const sniperStarkIdleSprites = import.meta.glob('../../assets/character/Sniper_Stark/rotations/*.png', { eager: true, query: '?url', import: 'default' });
const sniperStarkWalkingFrames = import.meta.glob('../../assets/character/Sniper_Stark/animations/Walking/*/frame_*.png', { eager: true, query: '?url', import: 'default' });
const sniperStarkAttackFrames = import.meta.glob('../../assets/character/Sniper_Stark/animations/Attacking/*/frame_*.png', { eager: true, query: '?url', import: 'default' });
const rictorIdleSprites = import.meta.glob('../../assets/character/Rictor_Templar/rotations/*.png', { eager: true, query: '?url', import: 'default' });
const rictorWalkingFrames = import.meta.glob('../../assets/character/Rictor_Templar/animations/Walking/*/frame_*.png', { eager: true, query: '?url', import: 'default' });
const rictorAttackFrames = import.meta.glob('../../assets/character/Rictor_Templar/animations/Attacking/*/frame_*.png', { eager: true, query: '?url', import: 'default' });
const templarRictorIdleSprites = import.meta.glob('../../assets/character/Rictor_Mounted_Templar/rotations/*.png', { eager: true, query: '?url', import: 'default' });
const templarRictorWalkingFrames = import.meta.glob('../../assets/character/Rictor_Mounted_Templar/animations/Walking/*/frame_*.png', { eager: true, query: '?url', import: 'default' });
const templarRictorAttackFrames = import.meta.glob('../../assets/character/Rictor_Mounted_Templar/animations/Attacking/*/frame_*.png', { eager: true, query: '?url', import: 'default' });
const templarRictorHolyFrames = import.meta.glob('../../assets/character/Rictor_Mounted_Templar/animations/Holy_Attack/*/frame_*.png', { eager: true, query: '?url', import: 'default' });
const lenaIdleSprites = import.meta.glob('../../assets/character/Lena/rotations/*.png', { eager: true, query: '?url', import: 'default' });
const lenaWalkingFrames = import.meta.glob('../../assets/character/Lena/animations/walking/*/frame_*.png', { eager: true, query: '?url', import: 'default' });
const lenaAttackFrames = import.meta.glob('../../assets/character/Lena/animations/Attacking/*/frame_*.png', { eager: true, query: '?url', import: 'default' });
const assassinLenaIdleSprites = import.meta.glob('../../assets/character/Assassin_Lena/rotations/*.png', { eager: true, query: '?url', import: 'default' });
const assassinLenaWalkingFrames = import.meta.glob('../../assets/character/Assassin_Lena/animations/Walking/*/frame_*.png', { eager: true, query: '?url', import: 'default' });
const assassinLenaAttackFrames = import.meta.glob('../../assets/character/Assassin_Lena/animations/Attacking/*/frame_*.png', { eager: true, query: '?url', import: 'default' });
const assassinLenaBowFrames = import.meta.glob('../../assets/character/Assassin_Lena/animations/The_character_grasps_the_bow_with_the_left_hand_wh/*/frame_*.png', { eager: true, query: '?url', import: 'default' });
const genericSoldierIdleSprites = import.meta.glob('../../assets/character/Generic_Soldier/rotations/*.png', { eager: true, query: '?url', import: 'default' });
const genericSoldierWalkingFrames = import.meta.glob('../../assets/character/Generic_Soldier/animations/walking/*/frame_*.png', { eager: true, query: '?url', import: 'default' });
const genericSoldierAttackFrames = import.meta.glob('../../assets/character/Generic_Soldier/animations/The_soldier_shifts_weight_to_the_rear_leg_as_the_r/*/frame_*.png', { eager: true, query: '?url', import: 'default' });
const genericUndeadIdleSprites = import.meta.glob('../../assets/character/Generic_Undead/rotations/*.png', { eager: true, query: '?url', import: 'default' });
const genericUndeadWalkingFrames = import.meta.glob('../../assets/character/Generic_Undead/animations/Walking/*/frame_*.png', { eager: true, query: '?url', import: 'default' });
const genericUndeadAttackFrames = import.meta.glob('../../assets/character/Generic_Undead/animations/The_creature_hunches_its_torso_while_drawing_both/*/frame_*.png', { eager: true, query: '?url', import: 'default' });
const arlanIdleSprites = import.meta.glob('../../assets/character/Arlan/rotations/*.png', { eager: true, query: '?url', import: 'default' });
const arlanWalkingFrames = import.meta.glob('../../assets/character/Arlan/animations/Walking/*/frame_*.png', { eager: true, query: '?url', import: 'default' });
const arlanAttackFrames = import.meta.glob('../../assets/character/Arlan/animations/The_right_hand_draws_the_spear_back_to_the_hip_wit/*/frame_*.png', { eager: true, query: '?url', import: 'default' });
const generalArlanIdleSprites = import.meta.glob('../../assets/character/General_Arlan/rotations/*.png', { eager: true, query: '?url', import: 'default' });
const generalArlanWalkingFrames = import.meta.glob('../../assets/character/General_Arlan/animations/Walking/*/frame_*.png', { eager: true, query: '?url', import: 'default' });
const generalArlanAttackFrames = import.meta.glob('../../assets/character/General_Arlan/animations/Attacking/*/frame_*.png', { eager: true, query: '?url', import: 'default' });
const generalSeverinIdleSprites = import.meta.glob('../../assets/character/General_Severin/rotations/*.png', { eager: true, query: '?url', import: 'default' });
const generalSeverinWalkingFrames = import.meta.glob('../../assets/character/General_Severin/animations/Walking/*/frame_*.png', { eager: true, query: '?url', import: 'default' });
const generalSeverinAttackFrames = import.meta.glob('../../assets/character/General_Severin/animations/Attacking/*/frame_*.png', { eager: true, query: '?url', import: 'default' });
const genericPriestIdleSprites = import.meta.glob('../../assets/character/Generic_Priest/rotations/*.png', { eager: true, query: '?url', import: 'default' });
const genericPriestWalkingFrames = import.meta.glob('../../assets/character/Generic_Priest/animations/Walking/*/frame_*.png', { eager: true, query: '?url', import: 'default' });
const genericPriestStaffFrames = import.meta.glob('../../assets/character/Generic_Priest/animations/Healing/*/frame_*.png', { eager: true, query: '?url', import: 'default' });
const genericBishopIdleSprites = import.meta.glob('../../assets/character/Generic_Bishop/rotations/*.png', { eager: true, query: '?url', import: 'default' });
const genericBishopWalkingFrames = import.meta.glob('../../assets/character/Generic_Bishop/animations/Walking/*/frame_*.png', { eager: true, query: '?url', import: 'default' });
const genericBishopCastFrames = import.meta.glob('../../assets/character/Generic_Bishop/animations/The_figure_raises_their_right_hand_to_the_chest_to/*/frame_*.png', { eager: true, query: '?url', import: 'default' });
const rottenIdleSprites = import.meta.glob('../../assets/character/Rotten/rotations/*.png', { eager: true, query: '?url', import: 'default' });
const rottenWalkingFrames = import.meta.glob('../../assets/character/Rotten/animations/walking/*/frame_*.png', { eager: true, query: '?url', import: 'default' });
const rottenAttackFrames = import.meta.glob('../../assets/character/Rotten/animations/The_left_arm_s_blighted_tendrils_draw_back_against/*/frame_*.png', { eager: true, query: '?url', import: 'default' });
const troyIdleSprites = import.meta.glob('../../assets/character/Troy/rotations/*.png', { eager: true, query: '?url', import: 'default' });
const troyWalkingFrames = import.meta.glob('../../assets/character/Troy/animations/Walking/*/frame_*.png', { eager: true, query: '?url', import: 'default' });
const troyAttackFrames = import.meta.glob('../../assets/character/Troy/animations/Attacking/*/frame_*.png', { eager: true, query: '?url', import: 'default' });
const troySwordIdleSprites = import.meta.glob('../../assets/character/Troy/Troy_sword/rotations/*.png', { eager: true, query: '?url', import: 'default' });
const troySwordAttackFrames = import.meta.glob('../../assets/character/Troy/Troy_sword/animations/*/*/frame_*.png', { eager: true, query: '?url', import: 'default' });
const paladinTroyIdleSprites = import.meta.glob('../../assets/character/Paladin_Troy/rotations/*.png', { eager: true, query: '?url', import: 'default' });
const paladinTroyWalkingFrames = import.meta.glob('../../assets/character/Paladin_Troy/animations/walking/*/frame_*.png', { eager: true, query: '?url', import: 'default' });
const paladinTroyAttackFrames = import.meta.glob('../../assets/character/Paladin_Troy/animations/The_rider_pulls_the_lance_back_behind_the_right_sh/*/frame_*.png', { eager: true, query: '?url', import: 'default' });
const paladinTroySwordIdleSprites = import.meta.glob('../../assets/character/Paladin_Troy/Paladin_troy_sword/rotations/*.png', { eager: true, query: '?url', import: 'default' });
const paladinTroySwordAttackFrames = import.meta.glob('../../assets/character/Paladin_Troy/Paladin_troy_sword/animations/*/*/frame_*.png', { eager: true, query: '?url', import: 'default' });
const evelineIdleSprites = import.meta.glob('../../assets/character/Eveline_Troubadour/rotations/*.png', { eager: true, query: '?url', import: 'default' });
const evelineWalkingFrames = import.meta.glob('../../assets/character/Eveline_Troubadour/animations/Walking/*/frame_*.png', { eager: true, query: '?url', import: 'default' });
const evelineStaffFrames = import.meta.glob('../../assets/character/Eveline_Troubadour/animations/Healing/*/frame_*.png', { eager: true, query: '?url', import: 'default' });
const valkyrieEvelineIdleSprites = import.meta.glob('../../assets/character/Eveline_Valkyrie/rotations/*.png', { eager: true, query: '?url', import: 'default' });
const valkyrieEvelineWalkingFrames = import.meta.glob('../../assets/character/Eveline_Valkyrie/animations/Walking/*/frame_*.png', { eager: true, query: '?url', import: 'default' });
const valkyrieEvelineStaffFrames = import.meta.glob('../../assets/character/Eveline_Valkyrie/animations/Healing/*/frame_*.png', { eager: true, query: '?url', import: 'default' });
const corvisIdleSprites = import.meta.glob('../../assets/character/Corvis/rotations/*.png', { eager: true, query: '?url', import: 'default' });
const corvisWalkingFrames = import.meta.glob('../../assets/character/Corvis/animations/walking/*/frame_*.png', { eager: true, query: '?url', import: 'default' });
const corvisAttackFrames = import.meta.glob('../../assets/character/Corvis/animations/Attacking/*/frame_*.png', { eager: true, query: '?url', import: 'default' });
const darkSageCorvisIdleSprites = import.meta.glob('../../assets/character/Dark_Sage_Corvis/rotations/*.png', { eager: true, query: '?url', import: 'default' });
const darkSageCorvisWalkingFrames = import.meta.glob('../../assets/character/Dark_Sage_Corvis/animations/Walking/*/frame_*.png', { eager: true, query: '?url', import: 'default' });
const darkSageCorvisAttackFrames = import.meta.glob('../../assets/character/Dark_Sage_Corvis/animations/The_right_hand_draws_the_glowing_cyan_book_back_to/*/frame_*.png', { eager: true, query: '?url', import: 'default' });
const darkSageCorvisStaffFrames = import.meta.glob('../../assets/character/Dark_Sage_Corvis/Dark_Sage_Corvis_Staff/animations/*/*/frame_*.png', { eager: true, query: '?url', import: 'default' });
const darkSageCorvisStaffIdleSprites = import.meta.glob('../../assets/character/Dark_Sage_Corvis/Dark_Sage_Corvis_Staff/rotations/*.png', { eager: true, query: '?url', import: 'default' });
const genericSageIdleSprites = import.meta.glob('../../assets/character/Generic_Sage/rotations/*.png', { eager: true, query: '?url', import: 'default' });
const genericSageWalkingFrames = import.meta.glob('../../assets/character/Generic_Sage/animations/walking/*/frame_*.png', { eager: true, query: '?url', import: 'default' });
const genericSageAttackFrames = import.meta.glob('../../assets/character/Generic_Sage/animations/The_right_hand_draws_back_to_the_hip_then_thrusts/*/frame_*.png', { eager: true, query: '?url', import: 'default' });

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

async function loadCharacterWithAllAnimations(characterName, idleGlob, walkingGlob, attackingGlob, referenceIdle) {
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
    const normalized = await normalizeSpritesToConsistentSize(allSpritesForDirection, characterName, direction, referenceIdle?.[direction]);
    
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

  for (const [key, folder, idle, walking, attack] of [
    ['genericWolfman', 'Generic_Wolfman', genericWolfmanIdleSprites, genericWolfmanWalkingFrames, genericWolfmanAttackFrames],
    ['genericArcher', 'Generic_Archer', genericArcherIdleSprites, genericArcherWalkingFrames, genericArcherAttackFrames],
    ['genericMage', 'Generic_Mage', genericMageIdleSprites, genericMageWalkingFrames, genericMageAttackFrames],
    ['genericSage', 'Generic_Sage', genericSageIdleSprites, genericSageWalkingFrames, genericSageAttackFrames],
    ['corvis', 'Corvis', corvisIdleSprites, corvisWalkingFrames, corvisAttackFrames],
    ['darkSageCorvis', 'Dark_Sage_Corvis', darkSageCorvisIdleSprites, darkSageCorvisWalkingFrames, darkSageCorvisAttackFrames],
    ['bloodBeast', 'Blood_Beast', bloodBeastIdleSprites, bloodBeastWalkingFrames, bloodBeastAttackFrames],
    ['raven', 'Raven', ravenIdleSprites, ravenWalkingFrames, ravenAttackFrames],
    ['genericKnight', 'Generic_Knight', genericKnightIdleSprites, genericKnightWalkingFrames, genericKnightAttackFrames],
    ['genericCavalier', 'Generic_cavalier', genericCavalierIdleSprites, genericCavalierWalkingFrames, genericCavalierAttackFrames],
    ['linus', 'Linus', linusIdleSprites, linusWalkingFrames, linusAttackFrames],
    ['linusSword', 'Linus Sword', linusSwordIdleSprites, linusWalkingFrames, linusSwordAttackFrames],
    ['villager', 'Villager', villagerIdleSprites, villagerWalkingFrames, {}],
    ['genericPaladin', 'Generic Paladin', genericPaladinIdleSprites, genericPaladinWalkingFrames, genericPaladinAttackFrames],
    ['genericPaladinSword', 'Generic Sword Paladin', genericPaladinSwordIdleSprites, genericPaladinWalkingFrames, genericPaladinSwordAttackFrames],
    ['paladinLinus', 'Paladin Linus', paladinLinusIdleSprites, paladinLinusWalkingFrames, paladinLinusAttackFrames],
    ['paladinLinusSword', 'Paladin Linus Sword', paladinLinusSwordIdleSprites, paladinLinusWalkingFrames, paladinLinusSwordAttackFrames],
    ['stark', 'Stark', starkIdleSprites, starkWalkingFrames, starkAttackFrames],
    ['sniperStark', 'Sniper_Stark', sniperStarkIdleSprites, sniperStarkWalkingFrames, sniperStarkAttackFrames],
    ['heartroot', 'Heartroot', heartrootIdleSprites, {}, {}],
    ['rictor', 'Rictor', rictorIdleSprites, rictorWalkingFrames, rictorAttackFrames],
    ['templarRictor', 'Templar_Rictor', templarRictorIdleSprites, templarRictorWalkingFrames, templarRictorAttackFrames],
    ['templarRictorHoly', 'Templar_Rictor_Holy', templarRictorIdleSprites, templarRictorWalkingFrames, templarRictorHolyFrames],
    ['lena', 'Lena', lenaIdleSprites, lenaWalkingFrames, lenaAttackFrames],
    ['assassinLena', 'Assassin_Lena', assassinLenaIdleSprites, assassinLenaWalkingFrames, assassinLenaAttackFrames],
    ['assassinLenaBow', 'Assassin_Lena_Bow', assassinLenaIdleSprites, assassinLenaWalkingFrames, assassinLenaBowFrames],
    ['genericSoldier', 'Generic_Soldier', genericSoldierIdleSprites, genericSoldierWalkingFrames, genericSoldierAttackFrames],
    ['genericUndead', 'Generic_Undead', genericUndeadIdleSprites, genericUndeadWalkingFrames, genericUndeadAttackFrames],
    ['arlan', 'Arlan', arlanIdleSprites, arlanWalkingFrames, arlanAttackFrames],
    ['generalArlan', 'General_Arlan', generalArlanIdleSprites, generalArlanWalkingFrames, generalArlanAttackFrames],
    ['generalSeverin', 'General_Severin', generalSeverinIdleSprites, generalSeverinWalkingFrames, generalSeverinAttackFrames],
    ['genericPriest', 'Generic_Priest', genericPriestIdleSprites, genericPriestWalkingFrames, genericPriestStaffFrames],
    ['genericBishop', 'Generic_Bishop', genericBishopIdleSprites, genericBishopWalkingFrames, genericBishopCastFrames],
    ['rotten', 'Rotten', rottenIdleSprites, rottenWalkingFrames, rottenAttackFrames],
    ['troy', 'Troy', troyIdleSprites, troyWalkingFrames, troyAttackFrames],
    ['troySword', 'Troy Sword', troySwordIdleSprites, troyWalkingFrames, troySwordAttackFrames],
    ['paladinTroy', 'Paladin Troy', paladinTroyIdleSprites, paladinTroyWalkingFrames, paladinTroyAttackFrames],
    ['paladinTroySword', 'Paladin Troy Sword', paladinTroySwordIdleSprites, paladinTroyWalkingFrames, paladinTroySwordAttackFrames],
    ['eveline', 'Eveline', evelineIdleSprites, evelineWalkingFrames, evelineStaffFrames],
    ['valkyrieEveline', 'Valkyrie Eveline', valkyrieEvelineIdleSprites, valkyrieEvelineWalkingFrames, valkyrieEvelineStaffFrames],
  ]) {
    const data = await loadCharacterWithAllAnimations(folder, idle, walking, attack, key === 'lena' ? mariaData.idle : undefined);
    result[key] = data.idle;
    result[`${key}WalkingFrames`] = data.walking;
    result[`${key}AttackFrames`] = data.attacking;
    // The bishop's single raised-hand gesture serves for both Aureole and its healing staff.
    if (key === 'eveline' || key === 'valkyrieEveline' || key === 'genericPriest' || key === 'genericBishop') {
      result[`${key}StaffFrames`] = data.attacking;
    }
  }
  // The supplied priest has no northwest cast; north is its closest available pose.
  result.genericPriestStaffFrames['north-west'] = result.genericPriestStaffFrames.north;

  const darkSageStaffData = await loadCharacterWithAllAnimations('Dark_Sage_Corvis_Staff',
    darkSageCorvisStaffIdleSprites, darkSageCorvisWalkingFrames, darkSageCorvisStaffFrames);
  result.darkSageCorvisStaff = darkSageStaffData.idle;
  result.darkSageCorvisStaffWalkingFrames = darkSageStaffData.walking;
  result.darkSageCorvisStaffStaffFrames = darkSageStaffData.attacking;

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
