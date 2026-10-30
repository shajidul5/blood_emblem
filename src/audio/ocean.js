const STORAGE_KEY = 'blood-emblem-ocean-sound';
const MASTER_VOLUME = 0.35;
const FADE_SECONDS = 1.5;
const LOOP_TAIL_SECONDS = 0.25;

let context = null;
let master = null;
let enabled = localStorage.getItem(STORAGE_KEY) !== 'off';
const listeners = new Set();

function createNoiseBuffer(audioContext) {
  const length = audioContext.sampleRate * 6;
  const buffer = audioContext.createBuffer(2, length, audioContext.sampleRate);
  const fade = Math.floor(audioContext.sampleRate * LOOP_TAIL_SECONDS);
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel);
    let last = 0;
    for (let i = 0; i < length; i++) {
      // Brown noise gives the low rumble of open water.
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      data[i] = last * 3.5;
    }
    // Cross-fade the tail into the head so the loop has no audible seam.
    for (let i = 0; i < fade; i++) {
      const mix = i / fade;
      data[length - fade + i] = data[length - fade + i] * (1 - mix) + data[i] * mix;
    }
  }
  return buffer;
}

function addWaveLayer(audioContext, destination, buffer, { frequency, swellSeconds, depth, base, filterType }) {
  const source = audioContext.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  source.loopEnd = buffer.duration - LOOP_TAIL_SECONDS;

  const filter = audioContext.createBiquadFilter();
  filter.type = filterType;
  filter.frequency.value = frequency;

  const swell = audioContext.createGain();
  swell.gain.value = base;

  // A slow oscillator raises and lowers the volume like waves rolling in and out.
  const lfo = audioContext.createOscillator();
  lfo.frequency.value = 1 / swellSeconds;
  const lfoDepth = audioContext.createGain();
  lfoDepth.gain.value = depth;
  lfo.connect(lfoDepth).connect(swell.gain);

  source.connect(filter).connect(swell).connect(destination);
  source.start(0, Math.random() * 4);
  lfo.start();
}

function build() {
  const AudioContextClass = window.AudioContext ?? window.webkitAudioContext;
  if (!AudioContextClass) return false;
  context = new AudioContextClass();
  master = context.createGain();
  master.gain.value = 0;
  master.connect(context.destination);
  const buffer = createNoiseBuffer(context);
  addWaveLayer(context, master, buffer, {
    frequency: 450, swellSeconds: 9, depth: 0.35, base: 0.55, filterType: 'lowpass',
  });
  addWaveLayer(context, master, buffer, {
    frequency: 1800, swellSeconds: 6.5, depth: 0.12, base: 0.14, filterType: 'bandpass',
  });
  return true;
}

function applyState() {
  if (!context) return;
  master.gain.cancelScheduledValues(context.currentTime);
  master.gain.setTargetAtTime(enabled ? MASTER_VOLUME : 0, context.currentTime, FADE_SECONDS / 3);
}

async function start() {
  if (!enabled) return;
  if (!context && !build()) return;
  if (context.state === 'suspended') await context.resume();
  applyState();
}

export function isOceanSoundEnabled() {
  return enabled;
}

export function onOceanSoundChange(listener) {
  listeners.add(listener);
  listener(enabled);
}

export async function setOceanSoundEnabled(value) {
  enabled = value;
  localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
  if (enabled) await start();
  else applyState();
  for (const listener of listeners) listener(enabled);
}

// Browsers block audio until the player interacts, so begin on the first gesture.
export function initializeOceanSound() {
  const unlock = () => {
    window.removeEventListener('pointerdown', unlock, true);
    window.removeEventListener('keydown', unlock, true);
    start();
  };
  window.addEventListener('pointerdown', unlock, true);
  window.addEventListener('keydown', unlock, true);
}
