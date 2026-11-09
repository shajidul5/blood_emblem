// Match visible idle silhouettes, not the transparent canvas or an outstretched attack effect.
export function unitSpriteScale(unit, texture) {
  if (!['infantry', 'armor', 'cavalry'].includes(unit.type)) return unit.scale ?? 1;
  const ratio = texture.userData.idleHeightRatio;
  if (!Number.isFinite(ratio) || ratio <= 0) throw new Error(`Missing sprite height for ${unit.id}.`);
  const height = unit.type === 'cavalry' ? 1.02 : 0.85;
  return height / ratio;
}
