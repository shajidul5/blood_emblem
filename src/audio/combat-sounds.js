import { ensureContext, noise, tone } from './ui-sounds.js';

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

// A weighty thud with a metallic bite; criticals add a deep boom and a ringing crack.
export function playHitImpact({ critical = false } = {}) {
  if (!ensureContext()) return;
  tone({ type: 'sine', from: 170, to: 42, decay: 0.24, volume: critical ? 0.8 : 0.6 });
  tone({ type: 'square', from: 320, to: 120, decay: 0.07, volume: 0.12 });
  noise({ type: 'lowpass', frequency: 2600, to: 500, decay: 0.12, volume: critical ? 0.6 : 0.45 });
  noise({ frequency: 3800, q: 2, decay: 0.05, volume: 0.25 });
  if (critical) {
    tone({ type: 'sine', from: 95, to: 30, start: 0.02, decay: 0.55, volume: 0.7 });
    tone({ type: 'triangle', from: 1320, to: 1100, start: 0.02, decay: 0.5, volume: 0.14 });
    noise({ type: 'highpass', frequency: 5000, decay: 0.3, volume: 0.22 });
  }
}

export function playMissWhiff() {
  if (!ensureContext()) return;
  noise({ frequency: 3000, to: 900, q: 0.8, decay: 0.16, volume: 0.1 });
}
