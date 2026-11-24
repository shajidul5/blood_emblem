import art from '../../assets/battle/manifest.json';
import { afterimageTrail, battleBackdrop, battleHpSegments, battleImpactShake, battleSpriteKey, battleThrow,
  createImpactGate, displayedBattleHp, animationFrameAt, idleFrameAt, battleImpactTime, battleStrikePose, flurryPose,
  battleIdleKey, flurryTimeline, staffBattleKey, strikePose, supportsBattleScene, supportsStaffScene,
  thrownReturnMs } from './battle-animation.js';
import { STAFF_EFFECTS, rangedEffectFor, spellEffectFor, spellEffectPose, staffEffectFor,
  thrownWeaponPose } from './spell-animation.js';
import { drawHpDigits } from './hp-digits.js';
import { battleActorScale, scaledBattleClip } from './battle-sizing.js';
import { drawCinderVigil, drawHeavyStrike, drawLastBenediction, drawLethality,
  LETHALITY_HITSTOP_MS, LETHALITY_IMPACT_MS } from './battle-effects.js';
import { playHitImpact, playHpDrainTick, playMissWhiff, playSpellImpact, playSpellRelease,
  playWeaponSwing } from '../audio/combat-sounds.js';
import './battle-screen.css';

const urls = import.meta.glob('../../assets/{battle,covenant}/**/*.png', { eager: true, query: '?url', import: 'default' });
const images = new Map();
const WIDTH = 480;
const HEIGHT = 270;
const BASELINE = 233;
const SCALE = 2;

function loadImage(path) {
  const relative = path.startsWith('../covenant/') ? path.slice(3) : `battle/${path}`;
  const url = urls[`../../assets/${relative}`];
  if (!url) return Promise.reject(new Error(`Missing battle artwork: ${path}`));
  if (!images.has(path)) {
    const loading = new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`Could not load battle artwork: ${path}`));
      image.src = url;
    }).catch((error) => {
      images.delete(path);
      throw error;
    });
    images.set(path, loading);
  }
  return images.get(path);
}

export function createBattleScreen() {
  const dialog = document.createElement('dialog');
  dialog.id = 'battle-screen';
  dialog.setAttribute('aria-label', 'Combat animation');
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  canvas.setAttribute('aria-hidden', 'true');
  const footer = document.createElement('footer');
  const status = document.createElement('span');
  status.setAttribute('role', 'status');
  const skip = document.createElement('button');
  skip.type = 'button';
  skip.textContent = 'Skip battle (Esc)';
  footer.append(status, skip);
  dialog.append(canvas, footer);
  document.body.append(dialog);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  let state = null;
  let raf = 0;
  let strike = null;
  let skipped = false;
  let labels = [];
  let previousFocus = null;

  function skipBattle() {
    skipped = true;
    status.textContent = 'Finishing combat...';
  }
  skip.addEventListener('click', skipBattle);
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    skipBattle();
  });
  dialog.addEventListener('keydown', (event) => {
    // Keep game shortcuts from handling input while this modal owns combat.
    event.stopPropagation();
    if (event.code === 'Escape') {
      event.preventDefault();
      skipBattle();
    }
  });

  function fighter(index, frame, offset = 0, recoil = 0, alpha = 1, lift = 0) {
    const actor = state.actors[index];
    const direction = index === 0 ? 1 : -1;
    const idleIndex = idleFrameAt(actor.art.idleLoop, performance.now() - state.started, state.reducedMotion);
    sprite(actor, frame?.image ?? actor.idleLoop ?? actor.idle, frame?.clip ? frame.index : idleIndex,
      actor.x + direction * offset - direction * recoil, lift * actor.scale, direction, alpha);
  }

  function sprite(actor, image, frameIndex, x, lift, facing, alpha, ghost = false) {
    ctx.save();
    ctx.globalAlpha = alpha;
    if (ghost) ctx.filter = 'sepia(1) saturate(5) hue-rotate(-45deg) brightness(.9)';
    else if (actor.art.filter) ctx.filter = actor.art.filter;
    ctx.translate(Math.round(x), Math.round(BASELINE + lift));
    ctx.scale(facing * SCALE * actor.scale, SCALE * actor.scale);
    ctx.drawImage(image, frameIndex * actor.art.size, 0, actor.art.size, actor.art.size,
      -actor.art.anchorX, -actor.art.baseline, actor.art.size, actor.art.size);
    ctx.restore();
  }

  function strikeState(elapsed) {
    if (strike.result.lethality && !state.reducedMotion) {
      const contact = battleImpactTime(strike.clip, strike.spell);
      elapsed -= Math.min(LETHALITY_HITSTOP_MS, Math.max(0, elapsed - contact));
    }
    return strike.flurry ? flurryPose(state.actors[strike.actor].art, strike.flurry, elapsed) :
      battleStrikePose(strike.clip, elapsed, strike.spell);
  }

  // The multi-hit critical: crimson afterimages trail every dash and blink.
  function drawFlurry(pose) {
    const actor = state.actors[strike.actor];
    const direction = strike.actor === 0 ? 1 : -1;
    const image = pose.clip === 'critical' ? actor.critical : pose.clip ? actor.flurry[pose.clip] : actor.idle;
    const frame = pose.clip ? pose.frame : 0;
    for (const ghost of pose.ghosts.slice().reverse())
      sprite(actor, image, frame, ghost.x, ghost.lift, ghost.facing * direction, ghost.alpha, true);
    sprite(actor, image, frame, pose.x, pose.lift, pose.facing * direction, pose.alpha);
  }

  function drawSlash(x, y, angle, since, critical) {
    if (since < 0 || since >= 180) return;
    const reach = Math.min(1, since / 60) * (critical ? 64 : 46);
    ctx.save();
    ctx.globalAlpha = 1 - since / 180;
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = '#9e1b2a';
    ctx.fillRect(-reach, -4, reach * 2, 8);
    ctx.fillStyle = '#ff5a4f';
    ctx.fillRect(-reach, -2, reach * 2, 4);
    ctx.fillStyle = '#fff4cd';
    ctx.fillRect(-reach * .8, -1, reach * 1.6, 2);
    ctx.restore();
    drawHitBurst(x, y, since);
  }

  function drawHud(actor, index, now) {
    const x = index === 0 ? 12 : 250;
    const hp = displayedBattleHp(actor.health, now);
    const extraRows = (actor.segments[0].rows - 1) * 8;
    ctx.fillStyle = '#101321';
    ctx.fillRect(x, 8, 218, 48 + extraRows);
    ctx.strokeStyle = '#d9b976';
    ctx.strokeRect(x + 0.5, 8.5, 217, 47 + extraRows);
    ctx.fillStyle = actor.friendly ? '#354e76' : '#753440';
    ctx.fillRect(x + 3, 11, 212, 15);
    ctx.font = 'bold 10px Georgia';
    ctx.fillStyle = '#fff1c8';
    ctx.textAlign = 'left';
    ctx.fillText(actor.unit.name.toUpperCase(), x + 7, 22);
    drawHpDigits(ctx, `${hp}/${actor.unit.maxHp}`, x + 208, 13);
    const low = hp <= actor.unit.maxHp / 4;
    for (const segment of actor.segments) {
      const sx = x + 6 + segment.x;
      const sy = 30 + segment.y;
      const filled = segment.hp <= hp;
      ctx.fillStyle = filled ? low ? '#e5773d' : '#3dbe73' : '#283145';
      ctx.fillRect(sx, sy, segment.width, 6);
      ctx.fillStyle = filled ? low ? '#ffda7c' : '#d1ff9d' : '#414d63';
      ctx.fillRect(sx, sy, segment.width, 2);
      ctx.fillStyle = filled ? low ? '#8e361f' : '#20734a' : '#151d2d';
      ctx.fillRect(sx, sy + 5, segment.width, 1);
    }
    ctx.textAlign = 'left';
    ctx.font = '9px Georgia';
    ctx.fillStyle = '#fff1c8';
    ctx.fillText(actor.weaponName ?? actor.unit.weapon?.name ?? 'Unarmed', x + 7, 49 + extraRows);
  }

  function draw(now) {
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    let pose = null;
    let elapsed = 0;
    let afterImpact = -1;
    if (strike) {
      elapsed = now - strike.started;
      pose = strikeState(elapsed);
      afterImpact = elapsed - (strike.flurry ? strike.flurry.impact : battleImpactTime(strike.clip, strike.spell));
    }
    const flourish = pose?.flourish;
    const shake = state.reducedMotion || strike?.spell?.support ? { x: 0, y: 0 } :
      flourish ? battleImpactShake(flourish.since, false, true) :
      battleImpactShake(afterImpact, strike?.result.critical, strike?.result.hit);
    ctx.fillStyle = '#101321';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.save();
    ctx.translate(shake.x, shake.y);
    ctx.drawImage(state.background, 0, 30, WIDTH, 240);
    if (strike?.result.critical && !pose.contact) {
      ctx.fillStyle = '#170e2380';
      ctx.fillRect(0, 52, WIDTH, 218);
      ctx.fillStyle = '#efc77c';
      ctx.font = 'bold 13px Georgia';
      ctx.textAlign = 'center';
      ctx.fillText(strike.result.lethality ? 'LETHALITY' : 'CRITICAL', WIDTH / 2, 77);
    }
    for (let index = 0; index < 2; index++) {
      const attacking = strike?.actor === index;
      const reacting = strike && !attacking && afterImpact >= 0;
      const flinch = strike && !attacking && flourish && flourish.since < 220 ?
        Math.sin(flourish.since / 220 * Math.PI) * 6 : 0;
      const recoil = reacting ? Math.sin(Math.min(1, afterImpact / 350) * Math.PI) *
        (strike.result.hit ? (strike.result.critical ? 10 : 5) : 14) : flinch;
      const fade = state.actors[index].unit.hp <= 0 ? reacting ? Math.max(0, 1 - afterImpact / 500) : 0 : 1;
      if (attacking && strike.flurry) {
        drawFlurry(pose);
        continue;
      }
      if (attacking && state.actors[index].art.afterimages && !strike.spell) {
        const actor = state.actors[index];
        const direction = index === 0 ? 1 : -1;
        const trail = afterimageTrail((ms) => ({ x: actor.x + direction * strikePose(strike.clip, ms).offset,
          lift: 0, facing: direction }), elapsed, elapsed < strike.clip.impactFrame * strike.clip.frameMs);
        for (const ghost of trail.reverse())
          sprite(actor, strike.image, pose.frame, ghost.x, 0, ghost.facing, ghost.alpha, true);
      }
      fighter(index, attacking ? { image: strike.image, clip: strike.clip, index: pose.frame } : null,
        attacking ? pose.offset : 0, recoil, fade, attacking ? pose.lift ?? 0 : 0);
    }
    if (strike?.flurry) {
      const target = state.actors[1 - strike.actor];
      const direction = strike.actor === 0 ? 1 : -1;
      const x = target.x - direction * 8;
      if (flourish) drawSlash(x, 160, [-.55, .12][flourish.index] * direction, flourish.since, false);
      if (afterImpact >= 0) drawSlash(x, 160, Math.PI / 2 - .2 * direction, afterImpact, true);
    }
    if (strike?.spell) drawSpell(elapsed);
    if (strike?.result.hit && !strike.spell && afterImpact >= 0 && afterImpact < 220) {
      const style = state.actors[strike.actor].art.strikeEffect;
      const target = state.actors[1 - strike.actor];
      if (style) drawHeavyStrike(ctx, style, target.x, BASELINE - 66, strike.actor === 0 ? 1 : -1,
        afterImpact / 220, strike.result.critical);
    }
    if (strike?.result.hit && !strike.spell && !strike.flurry && afterImpact >= 0 && afterImpact < 140) {
      const actor = state.actors[strike.actor];
      const direction = strike.actor === 0 ? 1 : -1;
      const x = actor.x + direction * (strike.clip.advance +
        (strike.clip.contact.x - actor.art.anchorX) * SCALE * actor.scale);
      const y = BASELINE - (actor.art.baseline - strike.clip.contact.y) * SCALE * actor.scale;
      ctx.strokeStyle = strike.result.critical ? '#ffdb91' : '#fff4cd';
      ctx.lineWidth = afterImpact < 60 ? 3 : 1;
      for (let i = 0; i < 8; i++) {
        const angle = i * Math.PI / 4;
        const inner = afterImpact / 12;
        const outer = inner + (strike.result.critical ? 20 : 12);
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(angle) * inner, y + Math.sin(angle) * inner);
        ctx.lineTo(x + Math.cos(angle) * outer, y + Math.sin(angle) * outer);
        ctx.stroke();
      }
    }
    if (strike?.result.lethality && strike.result.hit) {
      const target = state.actors[1 - strike.actor];
      drawLethality(ctx, { x: target.x, y: BASELINE - 66, elapsed: afterImpact,
        width: WIDTH, height: HEIGHT, reducedMotion: state.reducedMotion });
      if (afterImpact >= 0 && afterImpact < LETHALITY_IMPACT_MS) {
        ctx.fillStyle = '#ffb9cf';
        ctx.font = 'bold 22px Georgia';
        ctx.textAlign = 'center';
        ctx.fillText('LETHALITY', WIDTH / 2, 80);
      }
    }
    ctx.restore();
    state.actors.forEach((actor, index) => drawHud(actor, index, now));
    labels = labels.filter((label) => now - label.born < 650);
    for (const label of labels) {
      const age = now - label.born;
      ctx.globalAlpha = Math.min(1, (650 - age) / 150);
      ctx.font = `bold ${label.type === 'critical' || label.type === 'lethality' ? 21 : 17}px Georgia`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#160e18';
      const x = state.actors[label.actor].x;
      const y = 110 - Math.round(age / 55);
      ctx.strokeText(label.text, x, y);
      ctx.fillStyle = label.type === 'heal' ? '#9aeb9a' : label.type === 'lethality' ? '#ff9dbe' :
        label.type === 'critical' ? '#ffb46e' : '#fff0c3';
      ctx.fillText(label.text, x, y);
      ctx.globalAlpha = 1;
    }
  }

  function drawSpell(elapsed) {
    const caster = state.actors[strike.actor];
    const target = state.actors[1 - strike.actor];
    const direction = strike.actor === 0 ? 1 : -1;
    const origin = {
      x: caster.x + direction * (strike.clip.contact.x - caster.art.anchorX) * SCALE * caster.scale,
      y: BASELINE - (caster.art.baseline - strike.clip.contact.y) * SCALE * caster.scale,
    };
    const targetX = target.x + (strike.result.hit ? 0 : direction * 32);
    if (strike.spell.motion === 'thrown') {
      const sinceRelease = elapsed - strike.clip.impactFrame * strike.clip.frameMs;
      if (sinceRelease >= 0) drawThrown({ sinceRelease, afterImpact: sinceRelease - strike.spell.travelMs,
        originX: origin.x, originY: origin.y, targetX }, direction);
      return;
    }
    const effect = spellEffectPose(strike.clip, strike.spell, elapsed, caster.x, targetX, origin);
    if (!effect) return;
    if (strike.spell.motion === 'judgment') {
      drawLastBenediction(ctx, effect, BASELINE, HEIGHT, strike.result.critical, state.reducedMotion);
      return;
    }
    if (strike.spell.motion === 'pyre') {
      drawCinderVigil(ctx, effect, { width: WIDTH, height: HEIGHT, floor: BASELINE,
        critical: strike.result.critical, reducedMotion: state.reducedMotion });
      return;
    }
    if (strike.spell.motion === 'arrow') {
      drawArrow(effect, direction);
      return;
    }
    if (strike.spell.motion === 'bullet') {
      drawBullet(effect, direction);
      return;
    }
    const spec = art.spells[strike.spell.key];
    const effectTime = strike.spell.motion === 'bolt' ? effect.afterImpact : effect.sinceRelease;
    const frame = animationFrameAt(spec, effectTime % (spec.frames * spec.frameMs));
    ctx.save();
    ctx.globalAlpha = effect.alpha;
    if (strike.spell.motion === 'bolt' && !effect.impacted) {
      ctx.fillStyle = strike.spell.tint;
      ctx.globalAlpha = .25 + effect.progress * .35;
      ctx.fillRect(effect.x - 12, BASELINE - 2, 24, 2);
    } else {
      ctx.translate(Math.round(effect.x), strike.spell.motion === 'bolt' ? BASELINE : Math.round(effect.y));
      ctx.scale((strike.actor === 0 ? 1 : -1) * effect.scale,
        effect.scale * (strike.spell.motion === 'bolt' ? strike.spell.stretch ?? 1 : 1));
      ctx.drawImage(state.effects[strike.spell.key], frame * spec.width, 0, spec.width, spec.height,
        -spec.width / 2, strike.spell.motion === 'bolt' ? -spec.height : -spec.height / 2,
        spec.width, spec.height);
    }
    ctx.restore();
  }

  // A crisp pixel arrow in flight, then a hit flash (or nothing on a miss) once it lands.
  function drawArrow(effect, direction) {
    if (!effect.impacted) {
      const angle = Math.atan2(Math.cos(effect.progress * Math.PI) * -6 * Math.PI, 220);
      ctx.save();
      ctx.translate(Math.round(effect.x), Math.round(effect.y));
      ctx.scale(direction, 1);
      ctx.rotate(angle);
      ctx.fillStyle = '#2a1a12';
      ctx.fillRect(-26, -2, 46, 4);
      ctx.fillStyle = '#9b6a3c';
      ctx.fillRect(-24, -1, 42, 2);
      ctx.fillStyle = '#e8e2d0';
      ctx.fillRect(-28, -5, 8, 2);
      ctx.fillRect(-28, 3, 8, 2);
      ctx.fillStyle = '#c33a32';
      ctx.fillRect(-24, -4, 2, 2);
      ctx.fillRect(-24, 2, 2, 2);
      ctx.fillStyle = '#1c2026';
      ctx.fillRect(18, -4, 4, 8);
      ctx.fillRect(22, -2, 4, 4);
      ctx.fillStyle = '#c9d2dc';
      ctx.fillRect(18, -2, 4, 4);
      ctx.fillRect(22, -1, 3, 2);
      ctx.restore();
      return;
    }
    if (!strike.result.hit || effect.afterImpact >= 140) return;
    drawHitBurst(effect.x, effect.y, effect.afterImpact);
  }

  // A hot tracer streak; the round's impact is a hit burst, a miss just flies past.
  function drawBullet(effect, direction) {
    if (!effect.impacted) {
      ctx.save();
      ctx.translate(Math.round(effect.x), Math.round(effect.y));
      ctx.scale(direction, 1);
      ctx.fillStyle = '#ff7a2e';
      ctx.globalAlpha = .55;
      ctx.fillRect(-34, -1, 30, 2);
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#ffe2a0';
      ctx.fillRect(-12, -1, 12, 2);
      ctx.fillStyle = '#fffbe8';
      ctx.fillRect(-4, -2, 4, 4);
      ctx.restore();
      return;
    }
    if (!strike.result.hit || effect.afterImpact >= 140) return;
    drawHitBurst(effect.x, effect.y, effect.afterImpact);
  }

  function drawHitBurst(x, y, afterImpact) {
    ctx.strokeStyle = strike.result.critical ? '#ffdb91' : '#fff4cd';
    ctx.lineWidth = afterImpact < 60 ? 3 : 1;
    for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4;
      const inner = afterImpact / 12;
      const outer = inner + (strike.result.critical ? 20 : 12);
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(angle) * inner, y + Math.sin(angle) * inner);
      ctx.lineTo(x + Math.cos(angle) * outer, y + Math.sin(angle) * outer);
      ctx.stroke();
    }
  }

  // Hand axes spin end over end and return to the thrower; javelins fly point-first.
  function drawThrown(effect, direction) {
    const start = { x: effect.originX, y: effect.originY };
    const target = { x: effect.targetX, y: 150 };
    const caster = state.actors[strike.actor];
    const hand = strike.clip.catchPoint;
    const returnTo = hand ? { x: caster.x + direction * (hand.x - caster.art.anchorX) * SCALE * caster.scale,
      y: BASELINE - (caster.art.baseline - hand.y) * SCALE * caster.scale } : start;
    const pose = thrownWeaponPose(strike.spell, effect.sinceRelease, start, target, strike.returnMs, returnTo);
    if (pose.phase !== 'done') {
      ctx.save();
      ctx.translate(Math.round(pose.x), Math.round(pose.y));
      ctx.scale(direction, 1);
      ctx.rotate(pose.angle);
      if (strike.spell.spin) {
        ctx.fillStyle = '#2a1a12';
        ctx.fillRect(-20, -3, 34, 6);
        ctx.fillStyle = '#8a5a32';
        ctx.fillRect(-18, -1, 30, 2);
        ctx.fillStyle = '#1c2026';
        ctx.fillRect(8, -16, 12, 20);
        ctx.fillRect(20, -12, 4, 14);
        ctx.fillStyle = '#9aa6b2';
        ctx.fillRect(10, -14, 8, 16);
        ctx.fillStyle = '#dce4ec';
        ctx.fillRect(18, -10, 4, 10);
      } else {
        ctx.fillStyle = '#2a1a12';
        ctx.fillRect(-34, -2, 58, 4);
        ctx.fillStyle = '#8a5a32';
        ctx.fillRect(-32, -1, 54, 2);
        ctx.fillStyle = '#1c2026';
        ctx.fillRect(22, -4, 6, 8);
        ctx.fillRect(28, -2, 6, 4);
        ctx.fillStyle = '#c9d2dc';
        ctx.fillRect(22, -2, 6, 4);
        ctx.fillRect(28, -1, 5, 2);
      }
      ctx.restore();
    }
    if (strike.result.hit && effect.afterImpact >= 0 && effect.afterImpact < 140)
      drawHitBurst(target.x, target.y, effect.afterImpact);
  }

  function tick(now) {
    if (!state) return;
    try {
      if (strike) {
        const pose = strikeState(now - strike.started);
        if (strike.flurry && pose.flourish && strike.flourished <= pose.flourish.index && !skipped) {
          strike.flourished = pose.flourish.index + 1;
          playWeaponSwing(strike.weapon);
          playHitImpact({ critical: false });
        }
        if (pose.released && !strike.released && !skipped) {
          strike.released = true;
          if (strike.spell.physical) playWeaponSwing(strike.weapon);
          else playSpellRelease(strike.spell.element ?? strike.spell.key);
        }
        if (pose.contact || skipped) strike.impact();
        const hpFinished = state.actors.every((actor) => displayedBattleHp(actor.health, now) === actor.health.to);
        const lethalFinished = !strike.result.lethality ||
          now - strike.started >= battleImpactTime(strike.clip, strike.spell) + LETHALITY_IMPACT_MS;
        if ((pose.done && hpFinished && lethalFinished) || skipped) {
          const finished = strike;
          strike = null;
          finished.resolve();
        }
        if (!skipped) {
          let lost = 0;
          for (const actor of state.actors) {
            const hp = displayedBattleHp(actor.health, now);
            lost += Math.max(0, actor.health.last - hp);
            actor.health.last = hp;
          }
          if (lost > 0) playHpDrainTick(lost);
        }
      }
      draw(now);
      raf = requestAnimationFrame(tick);
    } catch (error) {
      const failed = strike;
      strike = null;
      failed?.reject(error);
      console.error('Battle presentation failed:', error);
      close();
    }
  }

  function close() {
    cancelAnimationFrame(raf);
    state = null;
    labels = [];
    if (dialog.open) dialog.close();
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
  }

  return {
    get active() { return state !== null; },
    get skipped() { return skipped; },
    async begin(left, right, { enabled, chapter, staff = null }) {
      if (!enabled || !(staff ? supportsStaffScene(left, right, staff) : supportsBattleScene(left, right))) return false;
      if (state) throw new Error('A battle scene is already open.');
      const distance = Math.abs(left.x - right.x) + Math.abs(left.z - right.z);
      const staffEffect = staff ? staffEffectFor(staff) : null;
      const actors = await Promise.all([left, right].map(async (unit, index) => {
        const casting = staff && index === 0;
        const base = art.fighters[casting ? staffBattleKey(unit, staff) : battleIdleKey(unit)];
        const staffIdle = casting || staffBattleKey(unit, unit.weapon);
        const ready = staffIdle ? { ...base, idle: base.staff.idle, idleLoop: base.staff.idleLoop } : base;
        // A staff caster swaps in the staff idle and cast clip; the cast never crits.
        const spec = casting ? { ...ready, casting: true, attack: base.staff.cast,
          critical: base.staff.cast } : ready;
        const [idle, attack, critical] = await Promise.all(
          [spec.idle, spec.attack?.file, spec.critical?.file].map(file => file ? loadImage(file) : null));
        const idleLoop = spec.idleLoop ? await loadImage(spec.idleLoop.file) : null;
        const thrown = !staff && battleThrow(unit, distance) && spec.thrown ? Object.fromEntries(await Promise.all(
          ['attack', 'critical'].map(async (kind) => [kind, await loadImage(spec.thrown[kind].file)]))) : null;
        const flurry = !staff && spec.flurry ? Object.fromEntries(await Promise.all(
          ['back', 'plunge'].map(async (kind) => [kind, await loadImage(spec.flurry[kind].file)]))) : null;
        return { unit, art: spec, idle, idleLoop, attack, critical, thrown, flurry, x: index === 0 ? 130 : 350,
          scale: battleActorScale(spec, unit),
          friendly: index === 0 || staffEffect === STAFF_EFFECTS.heal || staffEffect === STAFF_EFFECTS.bloodOath,
          weaponName: casting ? staff.name : null,
          segments: battleHpSegments(unit.maxHp),
          health: { from: unit.hp, to: unit.hp, last: unit.hp, changed: performance.now() } };
      }));
      const effectKeys = [...new Set([...[left, right].map((unit) => spellEffectFor(unit.weapon)),
        staffEffect].filter((effect) => effect && art.spells[effect.key]).map(({ key }) => key))];
      const effects = Object.fromEntries(await Promise.all(effectKeys.map(async (key) =>
        [key, await loadImage(art.spells[key].file)])));
      const background = await loadImage(art.backgrounds[battleBackdrop(chapter)]);
      previousFocus = document.activeElement;
      state = { actors, background, effects, staffEffect, started: performance.now(),
        reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches };
      skipped = false;
      labels = [];
      status.textContent = staff ? `${left.name} casts ${staff.name} on ${right.name}` : `${left.name} faces ${right.name}`;
      dialog.showModal();
      skip.focus();
      raf = requestAnimationFrame(tick);
      return true;
    },
    async strike(attacker, result, applyImpact) {
      if (!state) throw new Error('Cannot animate a strike without an open battle scene.');
      const actor = state.actors.findIndex((entry) => entry.unit === attacker);
      if (actor < 0) throw new Error('The attacker is not in this battle scene.');
      const entry = state.actors[actor];
      if ((!battleSpriteKey(attacker) && !(state.staffEffect && actor === 0)) ||
          !entry.art.attack || !entry.art.critical)
        throw new Error(`${attacker.name} has no offensive battle animation.`);
      const thrown = entry.thrown ? battleThrow(attacker, 2) : null;
      const projectile = state.staffEffect && actor === 0 ? state.staffEffect : thrown ?? rangedEffectFor(attacker.weapon);
      const impact = createImpactGate(() => {
        state.actors.forEach((entry) => {
          entry.health = { from: entry.unit.hp, to: entry.unit.hp, last: entry.unit.hp, changed: performance.now() };
        });
        if (!skipped && !projectile) playWeaponSwing(attacker.weapon);
        applyImpact();
        state.actors.forEach((entry) => { entry.health.to = entry.unit.hp; });
        status.textContent = state.staffEffect ? `${attacker.name}: ${result.hit ? 'cast complete' : 'resisted'}` :
          `${attacker.name}: ${result.hit ? result.lethality ? 'Lethality - lethal blow' : result.critical ? 'critical hit' : 'hit' : 'miss'}`;
      });
      if (skipped) {
        impact();
        return;
      }
      const kind = result.critical ? 'critical' : 'attack';
      const source = thrown ? entry.art.thrown[kind] : entry.art[kind];
      const clip = projectile ? source : scaledBattleClip(entry.art, source, entry.scale);
      const flurryArt = { ...entry.art, critical: clip };
      const flurry = result.critical && result.hit && entry.flurry && !projectile ? flurryTimeline(flurryArt, {
        home: entry.x, target: state.actors[1 - actor].x, direction: actor === 0 ? 1 : -1,
        scale: SCALE * entry.scale }) : null;
      await new Promise((resolve, reject) => {
        strike = { actor, result, clip, image: thrown ? entry.thrown[kind] : entry[kind], weapon: attacker.weapon,
          spell: projectile, returnMs: thrown ? thrownReturnMs(clip, thrown) : 0, released: false,
          flurry, flourished: 0, started: performance.now(), impact, resolve, reject };
      });
    },
    result(unit, text, type) {
      if (!state || skipped) return;
      const actor = state.actors.findIndex((entry) => entry.unit === unit);
      if (type === 'miss') playMissWhiff();
      else if (type === 'heal' || type === 'freeze') {
        if (strike?.spell?.support) playSpellImpact(strike.spell.element);
      } else {
        if (strike?.spell && !strike.spell.physical) playSpellImpact(strike.spell.element ?? strike.spell.key, { critical: type === 'critical' });
        else playHitImpact({ critical: type === 'critical' || type === 'lethality', lethality: type === 'lethality' });
      }
      if (actor >= 0) labels.push({ actor, text, type, born: performance.now() });
    },
    async end() {
      if (!state) return;
      if (!skipped) await new Promise((resolve) => setTimeout(resolve, 220));
      close();
    },
    close,
  };
}
