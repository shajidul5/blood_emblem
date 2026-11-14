import { createForestAmbience } from './forest-ambience.js';
import { createShipAmbience } from './ship-ambience.js';

const STORAGE_KEY = 'blood-emblem-ocean-sound';
const MASTER_VOLUME = 0.35;
const FADE_SECONDS = 1.5;
const LOOP_TAIL_SECONDS = 0.25;

let context = null;
let master = null;
let surf = null;
let ambienceGain = 1;
let shipChapter = false;
let forestChapter = false;
let shipAmbience;
let forestAmbience;
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
  surf = context.createGain();
  surf.connect(master);
  addWaveLayer(context, surf, buffer, {
    frequency: 450, swellSeconds: 9, depth: 0.35, base: 0.55, filterType: 'lowpass',
  });
  addWaveLayer(context, surf, buffer, {
    frequency: 1800, swellSeconds: 6.5, depth: 0.12, base: 0.14, filterType: 'bandpass',
  });
  shipAmbience = createShipAmbience(context, master, buffer);
  forestAmbience = createForestAmbience(context, master, buffer);
  context.addEventListener('statechange', applyState);
  return true;
}

function applyState() {
  if (!context) return;
  const audible = enabled && ambienceGain > 0 && !document.hidden && context.state === 'running';
  shipAmbience.setActive(shipChapter && audible);
  forestAmbience.setActive(forestChapter && audible);
  // Inland forest chapters have no surf at all.
  surf.gain.setTargetAtTime(forestChapter ? 0 : shipChapter ? .42 : 1, context.currentTime, .35);
  master.gain.cancelScheduledValues(context.currentTime);
  master.gain.setTargetAtTime(enabled ? MASTER_VOLUME * ambienceGain : 0, context.currentTime, FADE_SECONDS / 3);
}

export function setShipAmbienceActive(value) {
  shipChapter = Boolean(value);
  applyState();
}

export function setForestAmbienceActive(value) {
  forestChapter = Boolean(value);
  applyState();
}

export function setOceanAmbienceGain(value) {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error('Ocean ambience gain must be between zero and one.');
  ambienceGain = value;
  applyState();
}

async function start() {
  if (!enabled) return;
  if (!context && !build()) return;
  if (context.state !== 'running' && context.state !== 'closed') await context.resume();
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
  document.addEventListener('visibilitychange', applyState);
  const unlock = () => {
    if (!enabled || context?.state === 'running') return;
    start().catch((error) => console.error('Could not start environmental sounds:', error));
  };
  window.addEventListener('pointerdown', unlock, true);
  window.addEventListener('keydown', unlock, true);
}
