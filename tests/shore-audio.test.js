import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createShoreAmbience, SHORE_AUDIO_URLS } from '../src/audio/shore-ambience.js';

function buffer(channels, length, sampleRate) {
  const data = Array.from({ length: channels }, () => new Float32Array(length));
  return { numberOfChannels: channels, length, sampleRate, duration: length / sampleRate, getChannelData: (i) => data[i] };
}
function fixture() {
  const sources = [];
  const context = {
    state: 'running', currentTime: 10, createBuffer: buffer,
    decodeAudioData: async () => buffer(2, 300, 10),
    createGain: () => ({ connect() {}, disconnect() {}, gain: {
      targets: [], cancelScheduledValues() {},
      setTargetAtTime(value) { this.targets.push(value); },
    } }),
    createBufferSource() {
      const source = {
        connect(gain) { this.gain = gain; return gain; }, disconnect() {},
        start(...args) { this.started = args; }, stop(...args) { this.stopped = args; },
      };
      sources.push(source);
      return source;
    },
  };
  return { context, sources, ambience: createShoreAmbience(context, {}) };
}
const tick = () => new Promise((resolve) => setImmediate(resolve));

test('three generated Shore recordings are real WAVs of their requested durations', async () => {
  for (const [key, url] of Object.entries(SHORE_AUDIO_URLS)) {
    const wav = await readFile(new URL(url));
    assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
    assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
    let bytesPerSecond, dataLength;
    for (let offset = 12; offset + 8 <= wav.length;) {
      const kind = wav.toString('ascii', offset, offset + 4), size = wav.readUInt32LE(offset + 4);
      if (kind === 'fmt ') bytesPerSecond = wav.readUInt32LE(offset + 16);
      if (kind === 'data') dataLength = size;
      offset += 8 + size + size % 2;
    }
    assert.ok(bytesPerSecond > 0 && dataLength > 0);
    assert.ok(Math.abs(dataLength / bytesPerSecond - (key === 'bells' ? 20 : 30)) < .1);
  }
});

test('Shore recordings load lazily once and cancelled preparation cannot start playback', async (t) => {
  const pending = [];
  const fetch = t.mock.method(globalThis, 'fetch', () => new Promise((resolve) => pending.push(resolve)));
  const { ambience, sources } = fixture();
  ambience.setActive(false);
  assert.equal(fetch.mock.callCount(), 0);
  ambience.setActive(true);
  ambience.setActive(true);
  assert.equal(fetch.mock.callCount(), 3);
  ambience.setActive(false);
  for (const resolve of pending) resolve({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) });
  await tick();
  assert.equal(sources.length, 0);
  ambience.setActive(true);
  ambience.setActive(true);
  await tick();
  assert.equal(sources.length, 5, 'one ocean, one sky and three independently fading flame resonances');
  assert.ok(sources.every((source) => source.loop));
  assert.equal(fetch.mock.callCount(), 3);
});

test('each flame fades only its corresponding resonance; mute and resume preserve playback offsets', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) }));
  const { ambience, sources, context } = fixture();
  ambience.setActive(true);
  await tick();
  const ocean = sources[0], sky = sources[1], bells = sources.slice(2);
  ambience.setActive(true, [false, true, true]);
  assert.equal(bells[0].gain.gain.targets.at(-1), 0);
  assert.equal(bells[1].gain.gain.targets.at(-1), .07);
  assert.equal(bells[2].gain.gain.targets.at(-1), .07);
  assert.equal(ocean.gain.gain.targets.at(-1), .34);
  assert.equal(sky.gain.gain.targets.at(-1), .12);
  ambience.setActive(true, [false, false, false]);
  assert.ok(bells.every((source) => source.gain.gain.targets.at(-1) === 0));
  context.currentTime = 19;
  ambience.setActive(false);
  assert.ok(sources.every((source) => source.stopped[0] === 19.6));
  context.currentTime = 20;
  ambience.setActive(true);
  await tick();
  assert.equal(sources.length, 10);
  assert.deepEqual(sources[5].started, [20, 9]);
  assert.throws(() => ambience.setActive(true, [true]), /three beacon/);
});

test('failed Shore audio requests are reported and can be retried', async (t) => {
  let succeed = false;
  t.mock.method(globalThis, 'fetch', async () => ({
    ok: succeed, status: 503, arrayBuffer: async () => new ArrayBuffer(0),
  }));
  const log = t.mock.method(console, 'error', () => {});
  const { ambience, sources } = fixture();
  ambience.setActive(true);
  await tick();
  assert.equal(sources.length, 0);
  assert.ok(log.mock.callCount() > 0);
  succeed = true;
  ambience.setActive(true);
  await tick();
  assert.equal(sources.length, 5);
});
