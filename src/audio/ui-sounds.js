const MASTER_VOLUME = 0.5;
const FOCUS_SUPPRESS_MS = 160;
const MENU_SELECTOR = 'button, [role="button"]';

let context = null;
let master = null;
let noiseBuffer = null;
let lastConfirmAt = 0;
let lastTickAt = 0;

export function ensureContext() {
  if (!context) {
    const AudioContextClass = window.AudioContext ?? window.webkitAudioContext;
    if (!AudioContextClass) return false;
    context = new AudioContextClass();
    master = context.createGain();
    master.gain.value = MASTER_VOLUME;
    master.connect(context.destination);
    noiseBuffer = context.createBuffer(1, context.sampleRate * 0.3, context.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  if (context.state === 'suspended') context.resume();
  return true;
}

export function tone({ type = 'sine', from, to = from, start = 0, attack = 0.004, decay, volume }) {
  const t = context.currentTime + start;
  const oscillator = context.createOscillator();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(from, t);
  if (to !== from) oscillator.frequency.exponentialRampToValueAtTime(to, t + decay);
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(volume, t + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  oscillator.connect(gain).connect(master);
  oscillator.start(t);
  oscillator.stop(t + decay + 0.05);
}

export function noise({ start = 0, decay, volume, frequency, to = frequency, q = 1, type = 'bandpass' }) {
  const t = context.currentTime + start;
  const source = context.createBufferSource();
  source.buffer = noiseBuffer;
  const filter = context.createBiquadFilter();
  filter.type = type;
  filter.Q.value = q;
  filter.frequency.setValueAtTime(frequency, t);
  if (to !== frequency) filter.frequency.exponentialRampToValueAtTime(to, t + decay);
  const gain = context.createGain();
  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  source.connect(filter).connect(gain).connect(master);
  source.start(t);
  source.stop(t + decay + 0.05);
}

// A short dry tick: a Fire Emblem style cursor blip with a stone-on-iron click.
export function playMenuMove() {
  if (!ensureContext()) return;
  const now = performance.now();
  if (now - lastTickAt < 35 || now - lastConfirmAt < FOCUS_SUPPRESS_MS) return;
  lastTickAt = now;
  tone({ type: 'triangle', from: 1480, to: 1050, decay: 0.07, volume: 0.16 });
  tone({ type: 'sine', from: 2220, decay: 0.035, volume: 0.05 });
  noise({ decay: 0.025, volume: 0.1, frequency: 3200 });
}

// A deep tolling note under a bright chime: Fire Emblem confirm meets a cathedral bell.
export function playConfirm() {
  if (!ensureContext()) return;
  lastConfirmAt = performance.now();
  tone({ type: 'sine', from: 110, to: 70, decay: 0.45, volume: 0.4 });
  tone({ type: 'sine', from: 330, decay: 0.7, volume: 0.1 });
  tone({ type: 'triangle', from: 784, start: 0.01, decay: 0.28, volume: 0.15 });
  tone({ type: 'triangle', from: 1175, start: 0.07, decay: 0.45, volume: 0.13 });
  tone({ type: 'sine', from: 2349, start: 0.07, decay: 0.3, volume: 0.04 });
  noise({ decay: 0.06, volume: 0.15, frequency: 1800 });
}

// A hollow, falling note for backing out of a menu.
export function playCancel() {
  if (!ensureContext()) return;
  lastConfirmAt = performance.now();
  tone({ type: 'sine', from: 140, to: 62, decay: 0.32, volume: 0.35 });
  tone({ type: 'triangle', from: 660, to: 440, decay: 0.2, volume: 0.12 });
  noise({ decay: 0.05, volume: 0.1, frequency: 900 });
}

// Bright rising pentatonic tick for each stat gained on a level-up.
const STAT_UP_NOTES = [784, 880, 1047, 1175, 1319, 1568, 1760, 2093];

export function playStatUp(index = 0) {
  if (!ensureContext()) return;
  const note = STAT_UP_NOTES[Math.min(index, STAT_UP_NOTES.length - 1)];
  tone({ type: 'square', from: note, decay: 0.09, volume: 0.07 });
  tone({ type: 'triangle', from: note * 2, start: 0.05, decay: 0.16, volume: 0.12 });
  tone({ type: 'sine', from: note * 3, start: 0.05, decay: 0.1, volume: 0.03 });
  noise({ decay: 0.02, volume: 0.06, frequency: 5000 });
}

function isCancelButton(button) {
  return /(^|-)(back|close|cancel)(-|$)/i.test(button.id) ||
    /^(back|close|cancel)$/i.test(button.textContent.trim());
}

function menuButtonFrom(target) {
  const button = target instanceof Element ? target.closest(MENU_SELECTOR) : null;
  return button && !button.disabled ? button : null;
}

export function initializeUiSounds() {
  document.addEventListener('click', (event) => {
    const button = menuButtonFrom(event.target);
    if (!button) return;
    if (isCancelButton(button)) playCancel();
    else playConfirm();
  }, true);

  document.addEventListener('focusin', (event) => {
    if (menuButtonFrom(event.target)) playMenuMove();
  }, true);

  document.addEventListener('pointerover', (event) => {
    const button = menuButtonFrom(event.target);
    if (button && event.pointerType === 'mouse' && !button.contains(event.relatedTarget)) playMenuMove();
  }, true);
}
