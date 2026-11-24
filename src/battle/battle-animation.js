import { rangedEffectFor, spellEffectFor, staffEffectFor, thrownEffectFor } from './spell-animation.js';

export const COMBAT_ANIMATIONS_KEY = 'blood-emblem-combat-animations';

// Fighters whose manifest entry has `thrown` clips for range-2 axe or spear attacks.
export const THROWING_FIGHTERS = new Set([
  'bartz-pirate', 'bartz-berserker', 'generic-knight', 'generic-cavalier', 'generic-soldier',
  'generic-berserker', 'generic-halberdier',
  'linus-cavalier-lance', 'linus-paladin-lance', 'generic-paladin',
  'rictor-oathkeeper', 'rictor-templar-lance',
  'linus-bloodsworn',
  'rictor-oathbound-lance',
  'arlan-knight', 'arlan-general-spear', 'arlan-general-axe',
  'leon-hero-axe',
  'generic-paladin-axe', 'generic-general-spear', 'generic-general-axe',
  'troy-cavalier-lance', 'troy-paladin-lance', 'troy-paladin-axe',
  'linus-paladin-axe',
]);

export function battleThrow(unit, distance) {
  if (distance !== 2 || !THROWING_FIGHTERS.has(battleSpriteKey(unit))) return null;
  return thrownEffectFor(unit.weapon);
}

// Time from the thrown weapon's contact until the clip's catch frame is on screen.
export function thrownReturnMs(clip, spell) {
  if (!Number.isInteger(clip.catchFrame)) return 0;
  return (clip.catchFrame - clip.impactFrame) * clip.frameMs + clip.holdMs + spell.impactMs;
}

// Battle art is chosen by weapon type, so every weapon of a type shares that fighter's animation.
export function battleSpriteKey(unit) {
  const shore = {
    'shore-unmoored-duelist': ['Sword', 'shore-duelist'],
    'shore-tidebound-sentinel': ['Spear', 'shore-sentinel'],
    'shore-keelbreaker': ['Axe', 'shore-keelbreaker'],
    'shore-horizon-watcher': ['Bow', 'shore-watcher'],
    'shore-storm-custodian': ['Anima', 'shore-custodian'],
    'shore-horizon-keeper': ['Anima', 'shore-keeper'],
    'shore-crowman': ['Sword', 'shore-crowman'],
  }[unit.id];
  if (shore && unit.weapon?.type === shore[0] &&
      (shore[0] !== 'Anima' || spellEffectFor(unit.weapon))) return shore[1];
  if (unit.id === 'bell-envoy' && unit.weapon?.type === 'Claw') return 'bell-envoy';
  if (unit.id === 'maria' && unit.classId === 'hunter' && unit.weapon?.type === 'Sword') return 'maria-hunter';
  if (unit.id === 'maria' && unit.classId === 'ravager' && unit.weapon?.type === 'Sword') return 'maria-ravager';
  if (unit.id === 'maria' && unit.classId === 'ravager' && unit.weapon?.type === 'Gun') return 'maria-ravager-gun';
  if (unit.id === 'bartz' && unit.classId === 'pirate' && unit.weapon?.type === 'Axe') return 'bartz-pirate';
  if (unit.id === 'bartz' && unit.classId === 'berserker' && unit.weapon?.type === 'Axe') return 'bartz-berserker';
  if (unit.id === 'leon') {
    if (unit.classId === 'mercenary' && unit.weapon?.type === 'Sword') return 'leon-mercenary';
    if (unit.classId === 'hero') {
      if (unit.weapon?.type === 'Sword') return 'leon-hero-sword';
      if (unit.weapon?.type === 'Axe') return 'leon-hero-axe';
    }
  }
  if (unit.id === 'serra' && unit.weapon?.type === 'Anima' && spellEffectFor(unit.weapon)) {
    if (unit.classId === 'mage') return 'serra-mage';
    if (unit.classId === 'sage') return 'serra-sage';
  }
  if (unit.id === 'arlan') {
    if (unit.classId === 'knight' && unit.weapon?.type === 'Spear') return 'arlan-knight';
    if (unit.classId === 'general') {
      if (unit.weapon?.type === 'Spear') return 'arlan-general-spear';
      if (unit.weapon?.type === 'Axe') return 'arlan-general-axe';
    }
  }
  if (unit.id === 'lena') {
    if (unit.classId === 'thief' && unit.weapon?.type === 'Sword') return 'lena-thief';
    if (unit.classId === 'assassin') {
      if (unit.weapon?.type === 'Sword') return 'lena-assassin-sword';
      if (unit.weapon?.type === 'Bow') return 'lena-assassin-bow';
    }
  }
  if (unit.id === 'linus' && unit.classId === 'paladin' && unit.weapon?.type === 'Axe') return 'linus-paladin-axe';
  if (unit.id === 'linus' && ['Spear', 'Sword'].includes(unit.weapon?.type)) {
    const weapon = unit.weapon.type === 'Spear' ? 'lance' : 'sword';
    if (unit.classId === 'cavalier') return `linus-cavalier-${weapon}`;
    if (unit.classId === 'paladin') return `linus-paladin-${weapon}`;
    if (unit.classId === 'bloodsworn' && unit.weapon.type === 'Spear') return 'linus-bloodsworn';
    if (unit.classId === 'bloodsworn' && unit.weapon.type === 'Sword') return 'linus-bloodsworn-sword';
  }
  if (unit.id === 'troy') {
    const weapon = { Spear: 'lance', Sword: 'sword', Axe: 'axe' }[unit.weapon?.type];
    if (unit.classId === 'cavalier' && ['lance', 'sword'].includes(weapon)) return `troy-cavalier-${weapon}`;
    if (unit.classId === 'paladin' && weapon) return `troy-paladin-${weapon}`;
  }
  if (unit.id === 'corvis' && spellEffectFor(unit.weapon)) {
    if (unit.classId === 'shaman' && unit.weapon.type === 'Dark') return 'corvis-shaman';
    if (unit.classId === 'dark-sage' && ['Dark', 'Anima'].includes(unit.weapon.type)) return 'corvis-dark-sage';
  }
  if (unit.id === 'eveline' && unit.classId === 'valkyrie' &&
      unit.weapon?.type === 'Anima' && spellEffectFor(unit.weapon)) return 'eveline-valkyrie';
  if (unit.id === 'rictor') {
    if (unit.classId === 'oathbound') {
      if (unit.weapon?.type === 'Spear') return 'rictor-oathbound-lance';
      if (unit.weapon?.type === 'Sword') return 'rictor-oathbound-sword';
      if (unit.weapon?.type === 'Dark' && spellEffectFor(unit.weapon)) return 'rictor-oathbound-dark';
    }
    if (unit.weapon?.type === 'Spear') {
      if (unit.classId === 'oathkeeper') return 'rictor-oathkeeper';
      if (unit.classId === 'templar') return 'rictor-templar-lance';
    }
    if (unit.classId === 'templar' && unit.weapon?.type === 'Light' && spellEffectFor(unit.weapon))
      return 'rictor-templar-light';
  }
  if (hasBishopBattleArt(unit) &&
      unit.weapon?.type === 'Light' && spellEffectFor(unit.weapon)) return bishopBattleKey(unit);
  if (unit.spriteSet === 'raider' && unit.classId === 'raider' && unit.weapon?.type === 'Axe') return 'raider';
  if (unit.spriteSet === 'genericBerserker' && unit.classId === 'berserker' && unit.weapon?.type === 'Axe') return 'generic-berserker';
  if (unit.spriteSet === 'genericArcher' && unit.classId === 'archer' && unit.weapon?.type === 'Bow') return 'generic-archer';
  if (unit.spriteSet === 'genericCavalier' && unit.classId === 'cavalier' && unit.weapon?.type === 'Sword') return 'generic-cavalier-sword';
  if (unit.spriteSet === 'genericPaladin' && unit.classId === 'paladin') {
    if (unit.weapon?.type === 'Sword') return 'generic-paladin-sword';
    if (unit.weapon?.type === 'Axe') return 'generic-paladin-axe';
  }
  if (['generalSeverin', 'genericKnight'].includes(unit.spriteSet) && unit.classId === 'general') {
    if (unit.weapon?.type === 'Spear') return 'generic-general-spear';
    if (unit.weapon?.type === 'Axe') return 'generic-general-axe';
  }
  if (unit.weapon?.type === 'Spear') {
    if (unit.spriteSet === 'genericKnight' && unit.classId === 'knight') return 'generic-knight';
    if (unit.spriteSet === 'genericCavalier' && unit.classId === 'cavalier') return 'generic-cavalier';
    if (unit.spriteSet === 'genericPaladin' && unit.classId === 'paladin') return 'generic-paladin';
    if (unit.spriteSet === 'genericSoldier' && unit.classId === 'soldier') return 'generic-soldier';
    if (unit.spriteSet === 'genericHalberdier' && unit.classId === 'halberdier') return 'generic-halberdier';
  }
  if (['merfolk', 'merfolk-boss'].includes(unit.id) && unit.classId === 'merfolk' &&
      unit.spriteSet === 'merfolk' && unit.weapon?.type === 'Spear') return 'merfolk';
  if (['deep-merfolk', 'killian'].includes(unit.id) && unit.classId === 'deep-merfolk' &&
      unit.spriteSet === 'killian' && unit.weapon?.type === 'Axe') return 'deep-merfolk';
  if (unit.id === 'cypher' && unit.classId === 'mage' && spellEffectFor(unit.weapon)) return 'cyrus-mage';
  if (unit.id === 'cypher' && unit.classId === 'sage' && spellEffectFor(unit.weapon)) return 'cyrus-sage';
  if (unit.spriteSet === 'genericMage' && unit.classId === 'mage' && spellEffectFor(unit.weapon)) return 'generic-mage';
  if (unit.spriteSet === 'genericSage' && unit.classId === 'sage' &&
      unit.weapon?.type === 'Anima' && spellEffectFor(unit.weapon)) return 'generic-sage';
  if (unit.spriteSet === 'bloodBeast' && unit.classId === 'blood-beast' && unit.weapon?.type === 'Claw') return 'blood-beast';
  if (unit.spriteSet === 'genericUndead' && unit.classId === 'undead' && unit.weapon?.type === 'Claw') return 'generic-undead';
  if (unit.spriteSet === 'rotten' && unit.classId === 'rotten' && unit.weapon?.type === 'Claw') return 'rotten';
  if (unit.id === 'stark' && unit.weapon?.type === 'Bow') {
    if (unit.classId === 'archer') return 'stark-archer';
    if (unit.classId === 'sniper') return 'stark-sniper';
    if (unit.classId === 'veilstalker') return 'stark-veilstalker';
  }
  if (['feral-wolf', 'great-wolf'].includes(unit.id) && unit.classId === 'wolf' &&
      unit.spriteSet === 'feralWolf' && unit.weapon?.type === 'Claw') return unit.id;
  if (unit.id === 'liam' && unit.classId === 'wolfman' && unit.weapon?.type === 'Axe') return 'liam';
  if (unit.spriteSet === 'genericWolfman' && unit.classId === 'wolfman' && unit.weapon?.type === 'Claw') return 'generic-wolfman';
  if (unit.id === 'crowman' && unit.classId === 'crowman' && unit.weapon?.type === 'Sword') return 'crowman';
  if (unit.spriteSet === 'raven' && unit.classId === 'raven' && unit.weapon?.type === 'Claw') return 'raven';
  return null;
}

function hasBishopBattleArt(unit) {
  return unit.classId === 'bishop' && (['seymour', 'voss'].includes(unit.id) ||
    ['genericBishop', 'liftKeeper'].includes(unit.spriteSet));
}

const bishopBattleKey = (unit) => unit.id === 'voss' ? 'voss' : 'seymour-bishop';

// Staff casters reuse a fighter entry whose `staff` block holds the staff idle and cast clip.
export function staffBattleKey(unit, staff) {
  if (!staffEffectFor(staff)) return null;
  if (staff.type === 'Blood Rite')
    return unit.id === 'linus' && unit.classId === 'bloodsworn' ? 'linus-bloodsworn' : null;
  if (unit.id === 'cypher' && unit.classId === 'sage') return 'cyrus-sage';
  if (unit.id === 'serra' && unit.classId === 'sage') return 'serra-sage';
  if (unit.id === 'corvis' && unit.classId === 'dark-sage') return 'corvis-dark-sage';
  if (unit.id === 'eveline' && ['troubadour', 'valkyrie'].includes(unit.classId)) return `eveline-${unit.classId}`;
  if (unit.spriteSet === 'genericSage' && unit.classId === 'sage') return 'generic-sage';
  if (hasBishopBattleArt(unit)) return bishopBattleKey(unit);
  if (unit.id === 'seymour' && ['priest', 'bishop'].includes(unit.classId))
    return `seymour-${unit.classId}`;
  return null;
}

export function battleIdleKey(unit) {
  return battleSpriteKey(unit) ?? staffBattleKey(unit, unit.weapon) ??
    (hasBishopBattleArt(unit) ? bishopBattleKey(unit) : null) ??
    (unit.id === 'seymour' && ['priest', 'bishop'].includes(unit.classId)
    ? `seymour-${unit.classId}` : null);
}

// The recipient (an ally being healed or a foe being frozen) only stands in, so any battle art will do.
export function supportsStaffScene(caster, target, staff) {
  return Boolean(staffBattleKey(caster, staff) && battleIdleKey(target));
}

export function supportsBattleScene(left, right) {
  const distance = Math.abs(left.x - right.x) + Math.abs(left.z - right.z);
  const rangedArt = (unit) => Boolean(rangedEffectFor(unit.weapon) ||
    ['deep-merfolk', 'blood-beast', 'rotten'].includes(battleSpriteKey(unit)) ||
    battleThrow(unit, distance));
  // Long-range weapons (Bolting at 3–10) open the scene at any distance they can reach.
  const reaches = (unit) => rangedArt(unit) && (distance === 2 || (unit.weapon?.maxRange ?? 2) >= distance);
  return Boolean(battleIdleKey(left) && battleIdleKey(right) &&
    (battleSpriteKey(left) || battleSpriteKey(right)) && (distance === 1 ||
    distance >= 2 && (reaches(left) || reaches(right)) &&
      [left, right].every((unit) => !battleSpriteKey(unit) || rangedArt(unit) ||
        (unit.weapon?.maxRange ?? 1) < distance)));
}

// `chapter` is zero-based: Chapters 1–2 are at sea, Chapters 6–9 in the Hollow Wood.
export function battleBackdrop(chapter) {
  if (chapter === 16) return 'shore';
  if (chapter <= 1) return 'ship';
  if (chapter >= 5 && chapter <= 8) return 'forest';
  return 'coast';
}

export function readCombatAnimations(storage) {
  try {
    return storage.getItem(COMBAT_ANIMATIONS_KEY) !== 'off';
  } catch (error) {
    console.warn('Could not read the combat animation preference:', error);
    return true;
  }
}

export function writeCombatAnimations(storage, enabled) {
  try {
    storage.setItem(COMBAT_ANIMATIONS_KEY, enabled ? 'on' : 'off');
    return true;
  } catch (error) {
    console.error('Could not save the combat animation preference:', error);
    return false;
  }
}

// Each strike owns one impact, even when a skip crosses the contact frame.
export function createImpactGate(applyImpact) {
  let applied = false;
  return () => {
    if (applied) return;
    applied = true;
    applyImpact();
  };
}

export function animationFrameAt(clip, milliseconds) {
  return Math.min(clip.frames - 1, Math.max(0, Math.floor(milliseconds / clip.frameMs)));
}

export function idleFrameAt(clip, milliseconds, reducedMotion = false) {
  if (!clip || reducedMotion) return 0;
  return Math.floor(Math.max(0, milliseconds) / clip.frameMs) % clip.frames;
}

export function displayedBattleHp(health, now) {
  const difference = health.to - health.from;
  const elapsed = Math.max(0, now - health.changed - 70);
  const duration = Math.min(1100, Math.abs(difference) * 30);
  const steps = duration === 0 ? 0 : Math.min(Math.abs(difference),
    Math.floor(elapsed / duration * Math.abs(difference)));
  return health.from + Math.sign(difference) * steps;
}

export function battleHpSegments(maxHp, width = 206) {
  const columns = Math.min(40, maxHp);
  const rows = Math.ceil(maxHp / columns);
  return Array.from({ length: maxHp }, (_, index) => {
    const column = index % columns;
    const left = Math.floor(column * width / columns);
    const right = Math.floor((column + 1) * width / columns);
    return { hp: index + 1, x: left, y: Math.floor(index / columns) * 8,
      width: right - left - 1, rows };
  });
}

export function battleImpactShake(milliseconds, critical, hit) {
  const duration = critical ? 360 : 140;
  if (!hit || milliseconds < 0 || milliseconds >= duration) return { x: 0, y: 0 };
  const fade = (1 - milliseconds / duration) ** 2;
  return {
    x: Math.round(Math.cos(milliseconds * 0.19) * (critical ? 8 : 2) * fade),
    y: Math.round(Math.sin(milliseconds * 0.27 + 1) * (critical ? 5 : 1) * fade),
  };
}

export function strikePose(clip, milliseconds) {
  const contactTime = clip.impactFrame * clip.frameMs;
  const sampleTime = milliseconds > contactTime ? Math.max(contactTime, milliseconds - clip.holdMs) : milliseconds;
  const frame = animationFrameAt(clip, sampleTime);
  const endTime = (clip.frames - 1) * clip.frameMs;
  const approach = Math.min(1, milliseconds / contactTime);
  const recovery = Math.min(1, Math.max(0, (milliseconds - contactTime - clip.holdMs) /
    Math.max(1, endTime - contactTime)));
  return {
    frame,
    contact: milliseconds >= contactTime,
    offset: clip.advance * (milliseconds <= contactTime ? approach * approach : 1 - recovery),
    lift: leapLift(clip, milliseconds),
    done: milliseconds >= clip.frames * clip.frameMs + clip.holdMs,
  };
}

// A clip's `leap` lifts the fighter off the ground between two frames (negative is up).
export function leapLift(clip, milliseconds) {
  if (!clip.leap) return 0;
  const start = clip.leap.from * clip.frameMs;
  const progress = (milliseconds - start) / ((clip.leap.to - clip.leap.from) * clip.frameMs);
  return progress <= 0 || progress >= 1 ? 0 : -clip.leap.height * Math.sin(progress * Math.PI);
}
export function battleStrikePose(clip, milliseconds, spell) {
  if (!spell) return strikePose(clip, milliseconds);
  const releaseTime = clip.impactFrame * clip.frameMs;
  const pose = strikePose({ ...clip, holdMs: clip.holdMs + spell.travelMs + spell.impactMs }, milliseconds);
  return { ...pose, released: milliseconds >= releaseTime,
    contact: milliseconds >= releaseTime + spell.travelMs };
}

export function battleImpactTime(clip, spell) {
  return clip.impactFrame * clip.frameMs + (spell?.travelMs ?? 0);
}

// Earlier positions of a dashing fighter, drawn as fading afterimages.
export function afterimageTrail(place, milliseconds, moving) {
  if (!moving) return [];
  return [[35, .45], [70, .28], [105, .14]].map(([lag, alpha]) => ({ ...place(Math.max(0, milliseconds - lag)), alpha }));
}

/*
 * A multi-hit critical choreographed from separate clips: a dash slash from the front, a blink
 * behind the foe for a reversed backhand, a blink above for a plunging cleave, then a streak home.
 * Positions are world x for the fighter's anchor; `facing` is 1 toward the foe and -1 turned back.
 * Only the final cleave is `contact` (the one real impact); the earlier slashes are flourishes.
 */
export function flurryTimeline(fighter, { home, target, direction, scale = 2 }) {
  const front = fighter.critical;
  const { back, plunge, frontEnd, blinkMs, behind, lift, returnMs } = fighter.flurry;
  const frontAnchor = home + direction * front.advance;
  const behindAnchor = target + direction * behind;
  const plungeAnchor = target - direction * ((plunge.contact.x - fighter.anchorX) * scale + 12);
  const phases = [];
  let start = 0;
  const add = (phase) => {
    phases.push({ ...phase, start });
    start += phase.ms;
  };
  const frontHit = front.impactFrame * front.frameMs;
  add({ kind: 'front', ms: frontHit + front.holdMs + (frontEnd - front.impactFrame) * front.frameMs });
  add({ kind: 'blink', ms: blinkMs, from: [frontAnchor, 0], to: [behindAnchor, 0], facing: -1, clip: 'back', frame: 0 });
  const backHit = back.impactFrame * back.frameMs;
  add({ kind: 'back', ms: backHit + back.holdMs + (back.end - back.impactFrame) * back.frameMs });
  add({ kind: 'blink', ms: blinkMs, from: [behindAnchor, 0], to: [plungeAnchor, -lift], facing: 1,
    clip: 'plunge', frame: plunge.start });
  add({ kind: 'plunge', ms: plunge.descentMs + plunge.holdMs + (plunge.frames - 1 - plunge.impactFrame) * plunge.frameMs });
  add({ kind: 'return', ms: returnMs, from: [plungeAnchor, 0], to: [home, 0], facing: 1, clip: null, frame: 0 });
  const timeline = {
    phases, home, frontAnchor, behindAnchor, plungeAnchor, duration: start,
    flourishes: [frontHit, phases[2].start + backHit],
    impact: phases[4].start + plunge.descentMs,
  };
  return timeline;
}

export function flurryPose(fighter, timeline, milliseconds) {
  const { critical: front, flurry } = fighter;
  const { back, plunge } = flurry;
  const place = (ms) => {
    const phase = timeline.phases.findLast((entry) => ms >= entry.start) ?? timeline.phases[0];
    const t = Math.max(0, ms - phase.start);
    if (phase.kind === 'front') {
      const contact = front.impactFrame * front.frameMs;
      const approach = Math.min(1, t / contact);
      const sample = t > contact ? Math.max(contact, t - front.holdMs) : t;
      return { phase, clip: 'critical', frame: Math.min(flurry.frontEnd, animationFrameAt(front, sample)),
        x: timeline.frontAnchor - (timeline.frontAnchor - timeline.home) * (1 - approach * approach), lift: 0, facing: 1 };
    }
    if (phase.kind === 'back') {
      const contact = back.impactFrame * back.frameMs;
      const sample = t > contact ? Math.max(contact, t - back.holdMs) : t;
      return { phase, clip: 'back', frame: Math.min(back.end, animationFrameAt(back, sample)),
        x: timeline.behindAnchor, lift: 0, facing: -1 };
    }
    if (phase.kind === 'plunge') {
      const descent = Math.min(1, t / plunge.descentMs);
      const frame = t < plunge.descentMs ?
        plunge.start + Math.floor(descent * (plunge.impactFrame - plunge.start)) :
        Math.min(plunge.frames - 1, plunge.impactFrame +
          Math.floor(Math.max(0, t - plunge.descentMs - plunge.holdMs) / plunge.frameMs));
      return { phase, clip: 'plunge', frame, x: timeline.plungeAnchor,
        lift: descent >= 1 ? 0 : -flurry.lift * (1 - descent * descent), facing: 1 };
    }
    const progress = Math.min(1, t / phase.ms);
    const eased = 1 - (1 - progress) ** 2;
    return { phase, clip: phase.clip, frame: phase.frame, facing: phase.facing,
      x: phase.from[0] + (phase.to[0] - phase.from[0]) * eased,
      lift: phase.from[1] + (phase.to[1] - phase.from[1]) * eased };
  };
  const current = place(milliseconds);
  const kind = current.phase.kind;
  const moving = kind === 'blink' || kind === 'return' ||
    kind === 'front' && milliseconds < front.impactFrame * front.frameMs ||
    kind === 'plunge' && milliseconds < timeline.impact;
  const flourish = timeline.flourishes.findLast((time) => milliseconds >= time);
  return {
    clip: current.clip, frame: current.frame, x: current.x, lift: current.lift, facing: current.facing,
    alpha: kind === 'blink' ? .6 : 1,
    ghosts: afterimageTrail((ms) => {
      const { x, lift, facing } = place(ms);
      return { x, lift, facing };
    }, milliseconds, moving),
    flourish: flourish === undefined || milliseconds >= timeline.impact ? null :
      { index: timeline.flourishes.indexOf(flourish), since: milliseconds - flourish },
    contact: milliseconds >= timeline.impact,
    done: milliseconds >= timeline.duration,
  };
}
