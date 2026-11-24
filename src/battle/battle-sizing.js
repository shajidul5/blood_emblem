export const BATTLE_BODY_HEIGHT = 130;
export const MOUNTED_BATTLE_BODY_HEIGHT = 140;

export function battleActorScale(fighter, unit) {
  if (fighter.bodyTop === undefined) {
    const bossScale = unit.isBoss && ['merfolk', 'deep-merfolk'].includes(unit.classId) ? 1.12 : 1;
    return (fighter.scale ?? 1) * bossScale;
  }
  if (!Number.isFinite(fighter.bodyTop) || fighter.bodyTop < 0 || fighter.bodyTop >= fighter.baseline)
    throw new Error(`Invalid battle body landmark for ${unit.id}.`);
  const height = fighter.mounted ? MOUNTED_BATTLE_BODY_HEIGHT : BATTLE_BODY_HEIGHT;
  return height / (2 * (fighter.baseline - fighter.bodyTop)) * (unit.isBoss ? 1.12 : 1);
}

export function scaledBattleClip(fighter, clip, scale) {
  return scale === 1 ? clip : { ...clip,
    advance: clip.advance - (clip.contact.x - fighter.anchorX) * 2 * (scale - 1) };
}
