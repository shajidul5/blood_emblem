import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createShipAmbience, playTimberCreak } from '../src/audio/ship-ambience.js';

function audioContext() {
  const nodes = [];
  const param = () => ({
    value: 0, events: [],
    setValueAtTime(...args) { this.events.push(['set', ...args]); },
    linearRampToValueAtTime(...args) { this.events.push(['linear', ...args]); },
    exponentialRampToValueAtTime(...args) { this.events.push(['exponential', ...args]); },
    cancelScheduledValues(...args) { this.events.push(['cancel', ...args]); },
    setTargetAtTime(...args) { this.events.push(['target', ...args]); },
  });
  const node = (kind) => {
    const value = {
      kind, gain: param(), frequency: param(), Q: param(), connections: [],
      starts: [], stops: [], disconnected: false,
      connect(other) { this.connections.push(other); return other; },
      disconnect() { this.disconnected = true; },
      start(...args) { this.starts.push(args); },
      stop(...args) { this.stops.push(args); },
    };
    nodes.push(value);
    return value;
  };
  return {
    nodes, currentTime: 10, state: 'running', sampleRate: 100, destination: {},
    createGain: () => node('gain'),
    createOscillator: () => node('oscillator'),
    createBiquadFilter: () => node('filter'),
    createBufferSource: () => node('source'),
    createBuffer(channels, length, sampleRate) {
      return { duration: length / sampleRate, numberOfChannels: channels, getChannelData: () => new Float32Array(length) };
    },
  };
}

test('Timber creaks use finite original wood/friction envelopes and disconnect after playing', () => {
  const context = audioContext();
  playTimberCreak(context, context.destination, { duration: 6 }, () => .5);
  const wood = context.nodes.find((node) => node.kind === 'oscillator');
  const strain = context.nodes.find((node) => node.kind === 'source');
  assert.equal(wood.type, 'triangle');
  assert.deepEqual(wood.starts, [[10]]);
  assert.equal(wood.stops[0][0], 12.3);
  assert.deepEqual(strain.stops, wood.stops);
  assert.ok(wood.frequency.events.some(([type]) => type === 'exponential'));
  wood.onended();
  assert.ok(context.nodes.every((node) => node.disconnected));
});

test('Ship ambience starts only one irregular creak scheduler and cancels it on deactivation', (t) => {
  const pending = new Map();
  let id = 0;
  t.mock.method(globalThis, 'setTimeout', (callback, delay) => { pending.set(++id, { callback, delay }); return id; });
  t.mock.method(globalThis, 'clearTimeout', (key) => pending.delete(key));
  const context = audioContext();
  const ambience = createShipAmbience(context, context.destination, { duration: 6 });
  assert.equal(pending.size, 0);
  ambience.setActive(true);
  ambience.setActive(true);
  assert.equal(pending.size, 1);
  const [key, event] = [...pending][0];
  assert.ok(event.delay >= 600 && event.delay < 1000, 'first creak must not wait several seconds');
  pending.delete(key);
  event.callback();
  assert.equal(pending.size, 1);
  assert.ok([...pending.values()][0].delay >= 4000 && [...pending.values()][0].delay < 7500);
  assert.ok(context.nodes.some((node) => node.type === 'triangle'));
  ambience.setActive(false);
  assert.equal(pending.size, 0);
  const lastGain = context.nodes[0].gain.events.at(-1);
  assert.equal(lastGain[1], 0);
});

test('Environmental toggle, ship transitions, audio interruption and visibility scope ambience without touching saves', async (t) => {
  const pending = new Map();
  const storage = new Map([['save-slot-1', 'untouched'], ['blood-emblem-ocean-sound', 'off']]);
  const handlers = {};
  let id = 0;
  const context = audioContext();
  const audioHandlers = {};
  context.addEventListener = (name, callback) => { audioHandlers[name] = callback; };
  context.resume = async () => { context.state = 'running'; audioHandlers.statechange(); };
  const originals = new Map(['window', 'document', 'localStorage'].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  t.after(() => {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  globalThis.window = { AudioContext: function() { return context; }, addEventListener(name, callback) { handlers[name] = callback; }, removeEventListener() {} };
  globalThis.document = { hidden: false, addEventListener(name, callback) { handlers[name] = callback; } };
  globalThis.localStorage = { getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value) };
  t.mock.method(globalThis, 'setTimeout', (callback, delay) => { pending.set(++id, { callback, delay }); return id; });
  t.mock.method(globalThis, 'clearTimeout', (key) => pending.delete(key));
  const audio = await import('../src/audio/ocean.js');
  assert.equal(audio.isOceanSoundEnabled(), false, 'previous ocean preference remains authoritative');
  audio.initializeOceanSound();
  await audio.setOceanSoundEnabled(true);
  assert.equal(pending.size, 0, 'ordinary maps have no creaks');
  audio.setShipAmbienceActive(true);
  assert.equal(pending.size, 1);
  await audio.setOceanSoundEnabled(false);
  assert.equal(pending.size, 0);
  await audio.setOceanSoundEnabled(true);
  assert.equal(pending.size, 1);
  audio.setOceanAmbienceGain(0);
  assert.equal(pending.size, 0);
  audio.setOceanAmbienceGain(1);
  assert.equal(pending.size, 1);
  document.hidden = true;
  handlers.visibilitychange();
  assert.equal(pending.size, 0);
  document.hidden = false;
  handlers.visibilitychange();
  assert.equal(pending.size, 1);
  context.state = 'suspended';
  audioHandlers.statechange();
  assert.equal(pending.size, 0);
  context.state = 'running';
  audioHandlers.statechange();
  assert.equal(pending.size, 1, 'context resuming restarts chapter ambience without a toggle');
  context.state = 'interrupted';
  audioHandlers.statechange();
  assert.equal(pending.size, 0);
  handlers.pointerdown();
  await Promise.resolve();
  assert.equal(context.state, 'running', 'later gestures retry unlocking interrupted audio');
  assert.equal(pending.size, 1);
  assert.ok(context.nodes.some((node) => node.gain.events.some(([type, value]) => type === 'target' && value === .42)),
    'surf is reduced beneath ship sounds');
  audio.setShipAmbienceActive(false);
  assert.equal(pending.size, 0);
  assert.ok(context.nodes.some((node) => node.gain.events.at(-1)?.[1] === 1), 'ordinary maps restore the surf mix');
  context.decodeAudioData = async () => ({ duration: 5 });
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }));
  const { loadCrowAudio } = await import('../src/audio/crow-audio.js');
  const settleCrows = async () => { await loadCrowAudio(context); await Promise.resolve(); };
  audio.setForestAmbienceActive(true);
  await settleCrows();
  assert.equal(pending.size, 3, 'forest has one crow scheduler plus rustles and twigs');
  document.hidden = true;
  handlers.visibilitychange();
  assert.equal(pending.size, 0, 'hidden forest pages stop scheduling crows');
  document.hidden = false;
  handlers.visibilitychange();
  await settleCrows();
  assert.equal(pending.size, 3);
  await audio.setOceanSoundEnabled(false);
  assert.equal(pending.size, 0, 'environmental mute cancels forest calls');
  await audio.setOceanSoundEnabled(true);
  await settleCrows();
  assert.equal(pending.size, 3);
  context.state = 'suspended';
  audioHandlers.statechange();
  assert.equal(pending.size, 0);
  context.state = 'running';
  audioHandlers.statechange();
  await settleCrows();
  assert.equal(pending.size, 3, 'resuming audio restores only one forest scheduler');
  audio.setForestAmbienceActive(false);
  assert.equal(pending.size, 0, 'leaving the forest cancels the calls');
  assert.equal(storage.get('save-slot-1'), 'untouched');
  assert.equal(storage.size, 2, 'only the existing ocean preference was written');
});
