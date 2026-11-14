import { ensureContext, getSoundOutput, noise, tone } from './ui-sounds.js';
import { loadCrowAudio, playCrowCall } from './crow-audio.js';

// Swing sounds are keyed by a weapon's `sound` field; `type` is the fallback.
const SWING_SOUNDS = {
  slash() {
    noise({ frequency: 2200, to: 7500, q: 1.4, decay: 0.2, volume: 0.4 });
    noise({ frequency: 9000, to: 4000, q: 0.8, type: 'highpass', decay: 0.12, volume: 0.1 });
    tone({ type: 'sine', from: 1700, to: 3400, decay: 0.14, volume: 0.04 });
  },
  axe() {
    noise({ frequency: 500, to: 1800, q: 0.9, decay: 0.32, volume: 0.55 });
    noise({ frequency: 250, to: 120, q: 0.7, type: 'lowpass', decay: 0.3, volume: 0.35 });
    tone({ type: 'triangle', from: 150, to: 65, decay: 0.28, volume: 0.22 });
  },
  gun() {
    noise({ frequency: 1800, to: 300, q: 0.6, decay: 0.22, volume: 0.8 });
    tone({ type: 'square', from: 220, to: 40, decay: 0.18, volume: 0.35 });
    noise({ frequency: 6000, q: 1, type: 'highpass', decay: 0.05, volume: 0.3 });
  },
  bow() {
    tone({ type: 'triangle', from: 180, to: 90, decay: 0.12, volume: 0.25 });
    noise({ frequency: 4500, to: 1500, q: 1.2, type: 'highpass', decay: 0.2, volume: 0.2 });
    tone({ type: 'sine', from: 1200, to: 2400, decay: 0.08, volume: 0.05 });
  },
};

const TYPE_FALLBACK = { sword: 'slash', axe: 'axe', gun: 'gun', bow: 'bow' };

export function swingSoundFor(weapon) {
  if (!weapon) return 'slash';
  if (weapon.sound && SWING_SOUNDS[weapon.sound]) return weapon.sound;
  return TYPE_FALLBACK[String(weapon.type ?? '').toLowerCase()] ?? 'slash';
}

export function playWeaponSwing(weapon) {
  if (!ensureContext()) return;
  SWING_SOUNDS[swingSoundFor(weapon)]();
}

// A short blade transient over a damped body impact, rather than a ringing anvil.
export function playHitImpact({ critical = false } = {}) {
  if (!ensureContext()) return;
  noise({ type: 'highpass', frequency: 6200, to: 1800, q: 0.7, decay: 0.035, volume: 0.32 });
  tone({ type: 'triangle', from: 2100, to: 520, decay: 0.045, volume: 0.16 });
  noise({ type: 'bandpass', frequency: 1350, to: 280, q: 0.65, start: 0.009,
    decay: 0.14, volume: critical ? 0.65 : 0.48 });
  tone({ type: 'sine', from: 150, to: 43, start: 0.008, decay: 0.22, volume: critical ? 0.65 : 0.48 });
  noise({ type: 'lowpass', frequency: 650, to: 130, start: 0.02, decay: 0.17, volume: 0.22 });
  if (critical) {
    tone({ type: 'sine', from: 82, to: 29, start: 0.025, decay: 0.42, volume: 0.55 });
    noise({ type: 'bandpass', frequency: 3300, to: 700, q: 0.9, start: 0.018, decay: 0.16, volume: 0.25 });
  }
}

export function playHpDrainTick(count = 1) {
  if (!ensureContext()) return;
  // Coalesce a delayed render's backlog instead of leaving a long audio queue after a skip.
  for (let index = 0; index < Math.min(count, 4); index++) {
    const start = index * 0.009;
    tone({ type: 'square', from: 760, to: 510, start, attack: 0.001, decay: 0.018, volume: 0.055 });
    tone({ type: 'triangle', from: 380, to: 255, start, attack: 0.001, decay: 0.025, volume: 0.04 });
  }
}

export function playMissWhiff() {
  if (!ensureContext()) return;
  noise({ frequency: 3000, to: 900, q: 0.8, decay: 0.16, volume: 0.1 });
}

// Something menacing is close: a sinking drone, a dissonant swell and a burst of crows taking flight.
export function playCrowOmen() {
  if (!ensureContext()) return;
  tone({ type: 'sine', from: 58, to: 38, attack: .6, decay: 3.4, volume: .55 });
  tone({ type: 'sawtooth', from: 87, to: 61, attack: .8, decay: 3, volume: .08 });
  tone({ type: 'sine', from: 123, to: 117, start: .3, attack: .9, decay: 2.6, volume: .12 });
  tone({ type: 'triangle', from: 174, to: 165, start: .5, attack: 1, decay: 2.4, volume: .07 });
  const { context, destination } = getSoundOutput();
  const startAt = context.currentTime + .9;
  loadCrowAudio(context).then((buffer) => {
    playCrowCall(context, destination, buffer, {
      start: Math.max(0, startAt - context.currentTime), pitch: .95, volume: .9,
    });
  }).catch((error) => console.error('Could not play Crowman warning calls:', error));
  for (let index = 0; index < 5; index++) {
    noise({ type: 'lowpass', frequency: 900, to: 300, start: .85 + index * .09, decay: .12, volume: .25 });
  }
}

export function playSpellRelease(element) {
  if (!ensureContext()) return;
  const frequency = element === 'fire' ? 620 : element === 'thunder' ? 1900 : element === 'holy' ? 880 :
    element === 'ice' ? 1500 : 1100;
  tone({ type: 'triangle', from: frequency / 2, to: frequency, attack: .03, decay: .24, volume: .12 });
  noise({ frequency, to: frequency * 2, q: .8, decay: .3, volume: .2 });
}

export function playSpellImpact(element, { critical = false } = {}) {
  if (!ensureContext()) return;
  const volume = critical ? .6 : .4;
  if (element === 'fire') {
    noise({ type: 'lowpass', frequency: 2400, to: 180, decay: .42, volume });
    tone({ type: 'sine', from: 160, to: 40, decay: .32, volume });
  } else if (element === 'thunder') {
    noise({ type: 'highpass', frequency: 6000, to: 1200, decay: .08, volume });
    noise({ type: 'lowpass', frequency: 1100, to: 90, start: .025, decay: .48, volume });
    tone({ type: 'sawtooth', from: 150, to: 38, decay: .2, volume: volume * .3 });
  } else if (element === 'wind') {
    noise({ frequency: 2500, to: 350, q: 1.1, decay: .38, volume });
    tone({ type: 'sine', from: 650, to: 180, decay: .28, volume: volume * .4 });
  } else if (element === 'holy') {
    // A rising, bell-like chord for restoration.
    [523, 659, 784, 1047].forEach((frequency, index) =>
      tone({ type: 'sine', from: frequency, to: frequency, start: index * .07, attack: .01, decay: .5, volume: .1 }));
    noise({ type: 'highpass', frequency: 7000, decay: .4, volume: .06 });
  } else if (element === 'ice') {
    noise({ type: 'highpass', frequency: 5200, to: 2600, decay: .16, volume });
    for (let index = 0; index < 4; index++)
      tone({ type: 'triangle', from: 2400 - index * 260, to: 1800 - index * 200, start: index * .05, decay: .12, volume: .08 });
    noise({ type: 'lowpass', frequency: 900, to: 200, start: .05, decay: .3, volume: volume * .5 });
  } else {
    throw new Error(`Unknown spell sound: ${element}`);
  }
}

export function playGateRumble() {
  if (!ensureContext()) return;
  for (let i = 0; i < 10; i++) {
    const start = i * 0.13;
    noise({ start, type: 'lowpass', frequency: 240, to: 65, decay: 0.35, volume: 0.14 });
    tone({ type: 'sine', start, from: 52, to: 30, decay: 0.4, volume: 0.09 });
  }
}

export function playBloodBeastRoar() {
  if (!ensureContext()) return;
  noise({ frequency: 800, to: 180, q: 1.5, decay: 1.1, volume: 0.35 });
  tone({ type: 'sawtooth', from: 170, to: 48, attack: 0.08, decay: 1.2, volume: 0.09 });
  tone({ type: 'sawtooth', from: 1050, to: 230, attack: 0.12, decay: 1, volume: 0.06 });
  tone({ type: 'triangle', from: 1470, to: 310, start: 0.07, decay: 0.95, volume: 0.06 });
}

// A rusty iron squeal and a heavy latch as a cell door swings open.
export function playDoorCreak() {
  if (!ensureContext()) return;
  noise({ type: 'lowpass', frequency: 900, to: 200, decay: 0.12, volume: 0.35 });
  tone({ type: 'sawtooth', start: 0.08, from: 420, to: 610, attack: 0.1, decay: 0.7, volume: 0.05 });
  tone({ type: 'triangle', start: 0.12, from: 880, to: 1150, attack: 0.1, decay: 0.6, volume: 0.04 });
  tone({ type: 'sine', start: 0.75, from: 120, to: 50, decay: 0.3, volume: 0.35 });
}
