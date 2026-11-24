// Spell identity is independent of the caster's sprite or class. `key` names the manifest sheet,
// `element` the sound; `bolt` spells erupt upward from the target's feet, stretched by `stretch`.
export const SPELL_EFFECTS = Object.freeze({
  'fire-tome': Object.freeze({ key: 'fire', element: 'fire', travelMs: 440, impactMs: 280, tint: '#ff9d42', motion: 'projectile' }),
  blaze: Object.freeze({ key: 'blaze', element: 'fire', travelMs: 380, impactMs: 300, tint: '#ffb347', motion: 'projectile' }),
  inferno: Object.freeze({ key: 'inferno', element: 'fire', travelMs: 300, impactMs: 420, tint: '#ff6a2a', motion: 'bolt', stretch: 1.25 }),
  'cinder-vigil': Object.freeze({ key: 'cinder-vigil', element: 'fire', travelMs: 640, impactMs: 960, motion: 'pyre' }),
  'thunder-tome': Object.freeze({ key: 'thunder', element: 'thunder', travelMs: 240, impactMs: 360, tint: '#d3baff', motion: 'bolt', stretch: 1.375 }),
  elthunder: Object.freeze({ key: 'elthunder', element: 'thunder', travelMs: 220, impactMs: 380, tint: '#9fb8ff', motion: 'bolt', stretch: 1.375 }),
  bolting: Object.freeze({ key: 'bolting', element: 'thunder', travelMs: 320, impactMs: 440, tint: '#c4f2ff', motion: 'bolt', stretch: 1.375 }),
  heavenfall: Object.freeze({ key: 'bolting', element: 'thunder', travelMs: 400, impactMs: 680, tint: '#ddeaff', motion: 'bolt', stretch: 1.75 }),
  'wind-tome': Object.freeze({ key: 'wind', element: 'wind', travelMs: 500, impactMs: 300, tint: '#a2f5b2', motion: 'projectile' }),
  gale: Object.freeze({ key: 'gale', element: 'wind', travelMs: 420, impactMs: 300, tint: '#8de0a0', motion: 'projectile' }),
  tempest: Object.freeze({ key: 'tempest', element: 'wind', travelMs: 300, impactMs: 420, tint: '#7fd896', motion: 'bolt', stretch: 1.25 }),
  'the-last-horizon': Object.freeze({ key: 'tempest', element: 'wind', travelMs: 460, impactMs: 660, tint: '#c5e5f5', motion: 'bolt', stretch: 1.6 }),
  'light-tome': Object.freeze({ key: 'light', element: 'holy', travelMs: 240, impactMs: 360, tint: '#fff3bb', motion: 'bolt' }),
  lumen: Object.freeze({ key: 'lumen', element: 'holy', travelMs: 220, impactMs: 380, tint: '#ffe9a1', motion: 'bolt', stretch: 1.125 }),
  aureole: Object.freeze({ key: 'aureole', element: 'holy', travelMs: 300, impactMs: 440, tint: '#fff8d6', motion: 'bolt', stretch: 1.25 }),
  'last-benediction': Object.freeze({ key: 'last-benediction', element: 'holy', travelMs: 580, impactMs: 780, motion: 'judgment' }),
  'dark-tome': Object.freeze({ key: 'dark', element: 'dark', travelMs: 320, impactMs: 400, tint: '#b464ed', motion: 'bolt' }),
  luna: Object.freeze({ key: 'dark', element: 'dark', travelMs: 280, impactMs: 440, tint: '#b8a1ff', motion: 'bolt', stretch: 1.125 }),
  nosferatu: Object.freeze({ key: 'dark', element: 'dark', travelMs: 360, impactMs: 480, tint: '#d761bd', motion: 'bolt', stretch: 1.125 }),
  'last-testament': Object.freeze({ key: 'dark', element: 'dark', travelMs: 400, impactMs: 520, tint: '#9240d9', motion: 'bolt', stretch: 1.25 }),
});

// Arrows share the spell timeline (release, flight, contact) but are physical shots.
export const ARROW_EFFECT = Object.freeze({ key: 'arrow', travelMs: 240, impactMs: 140, tint: '#fff4cd',
  motion: 'arrow', physical: true });

// A pistol round: near-instant flight; the muzzle flash lives in the shooter's clip.
export const BULLET_EFFECT = Object.freeze({ key: 'bullet', travelMs: 110, impactMs: 140, tint: '#ffe2a0',
  motion: 'bullet', physical: true });

// Staves never travel: the effect rises at the recipient's feet like a bolt.
export const STAFF_EFFECTS = Object.freeze({
  bloodOath: Object.freeze({ key: 'heal', element: 'holy', travelMs: 160, impactMs: 520, tint: '#ed8f9e', motion: 'bolt', stretch: 1.25, support: true }),
  heal: Object.freeze({ key: 'heal', element: 'holy', travelMs: 160, impactMs: 520, tint: '#ffe58a', motion: 'bolt', stretch: 1.25, support: true }),
  freeze: Object.freeze({ key: 'freeze', element: 'ice', travelMs: 160, impactMs: 460, tint: '#9fe3ff', motion: 'bolt', stretch: 1.25, support: true }),
});

export function spellEffectFor(weapon) {
  return SPELL_EFFECTS[weapon?.id] ?? null;
}

export function staffEffectFor(staff) {
  if (staff?.id === 'blood-oath' && staff.type === 'Blood Rite') return STAFF_EFFECTS.bloodOath;
  if (staff?.type !== 'Staff') return null;
  return staff.freeze ? STAFF_EFFECTS.freeze : staff.heal ? STAFF_EFFECTS.heal : null;
}

export function rangedEffectFor(weapon) {
  return spellEffectFor(weapon) ?? (weapon?.type === 'Bow' ? ARROW_EFFECT : weapon?.type === 'Gun' ? BULLET_EFFECT : null);
}

// Throwable melee weapons (hand axes, javelins) at range 2 fly as physical projectiles.
const THROWN_EFFECTS = Object.freeze({
  Axe: Object.freeze({ key: 'thrown-axe', travelMs: 300, impactMs: 140, motion: 'thrown', physical: true, spin: true }),
  Spear: Object.freeze({ key: 'thrown-spear', travelMs: 260, impactMs: 140, motion: 'thrown', physical: true, spin: false }),
});

export function thrownEffectFor(weapon) {
  return (weapon?.maxRange ?? 1) >= 2 ? THROWN_EFFECTS[weapon.type] ?? null : null;
}

// Out to the target, then (when the clip catches it) back to the thrower's hand.
export function thrownWeaponPose(spell, sinceRelease, start, target, returnMs = 0, returnTo = start) {
  if (sinceRelease < 0) return null;
  const lift = spell.spin ? 18 : 8;
  const spin = (time) => spell.spin ? time / 1000 * 5 * Math.PI * 2 : 0;
  if (sinceRelease < spell.travelMs) {
    const progress = sinceRelease / spell.travelMs;
    return { x: start.x + (target.x - start.x) * progress,
      y: start.y + (target.y - start.y) * progress - Math.sin(progress * Math.PI) * lift,
      angle: spell.spin ? spin(sinceRelease) : Math.atan2(-Math.cos(progress * Math.PI) * lift * Math.PI, 220),
      phase: 'out' };
  }
  const back = sinceRelease - spell.travelMs;
  if (back < returnMs) {
    const progress = back / returnMs;
    return { x: target.x + (returnTo.x - target.x) * progress,
      y: target.y + (returnTo.y - target.y) * progress - Math.sin(progress * Math.PI) * lift,
      angle: spin(sinceRelease), phase: 'return' };
  }
  return { x: target.x, y: target.y, angle: 0, phase: 'done' };
}

export function spellEffectPose(clip, spell, elapsed, actorX, targetX, origin) {
  const sinceRelease = elapsed - clip.impactFrame * clip.frameMs;
  if (sinceRelease < 0 || sinceRelease >= spell.travelMs + spell.impactMs) return null;
  const progress = Math.min(1, sinceRelease / spell.travelMs);
  const direction = Math.sign(targetX - actorX);
  const start = origin ?? { x: actorX + direction * 38, y: 150 };
  const afterImpact = Math.max(0, sinceRelease - spell.travelMs);
  return {
    x: ['bolt', 'pyre', 'judgment'].includes(spell.motion) ? targetX : start.x + (targetX - start.x) * progress,
    y: start.y + (150 - start.y) * progress - (spell.motion === 'projectile' ? Math.sin(progress * Math.PI) * 12 :
      spell.motion === 'arrow' ? Math.sin(progress * Math.PI) * 6 : 0),
    progress, afterImpact, sinceRelease,
    impacted: sinceRelease >= spell.travelMs,
    alpha: sinceRelease < spell.travelMs ? 1 : Math.max(0, 1 - afterImpact / spell.impactMs),
    scale: sinceRelease < spell.travelMs ? 1 : 1 + afterImpact / spell.impactMs * .6,
  };
}
