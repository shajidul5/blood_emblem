import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CATHEDRAL_CHANT_URL, createCathedralAmbience, prepareCathedralLoop } from '../src/audio/cathedral-ambience.js';

function buffer(numberOfChannels, length, sampleRate) {
  const channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  return { numberOfChannels, length, sampleRate, duration: length / sampleRate, getChannelData: (i) => channels[i] };
}

test('The bundled chant loop joins adjacent samples at the wrap on both channels', async () => {
  assert.ok((await readFile(new URL(CATHEDRAL_CHANT_URL))).length > 100_000);
  const recording = buffer(2, 150, 10);
  for (let channel = 0; channel < 2; channel++) {
    const data = recording.getChannelData(channel);
    for (let i = 0; i < data.length; i++) data[i] = i * (channel ? -1 : 1);
  }
  const loop = prepareCathedralLoop({ createBuffer: buffer }, recording);
  assert.equal(loop.duration, 7);
  for (let channel = 0; channel < 2; channel++) {
    const data = loop.getChannelData(channel);
    const sign = channel ? -1 : 1;
    assert.equal(data[0], sign * 40);
    assert.equal(data.at(-1), sign * 39);
  }
});

test('Chant loads once, never starts while inactive, and resumes without stacking loops', async (t) => {
  let respond;
  const fetch = t.mock.method(globalThis, 'fetch', () => new Promise((resolve) => { respond = resolve; }));
  const sources = [];
  const context = {
    state: 'running', currentTime: 10, createBuffer: buffer,
    decodeAudioData: async () => buffer(2, 150, 10),
    createGain: () => ({ connect() {}, disconnect() {}, gain: { setTargetAtTime() {}, cancelScheduledValues() {} } }),
    createBufferSource() {
      const source = {
        connect: (gain) => gain, disconnect() {},
        start(...args) { this.started = args; },
        stop(...args) { this.stopped = args; },
      };
      sources.push(source);
      return source;
    },
  };
  const tick = () => new Promise((resolve) => setImmediate(resolve));
  const chant = createCathedralAmbience(context, {});
  assert.equal(fetch.mock.callCount(), 0);
  chant.setActive(true);
  chant.setActive(true);
  chant.setActive(false);
  respond({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) });
  await tick();
  assert.equal(sources.length, 0);

  chant.setActive(true);
  chant.setActive(true);
  await tick();
  assert.equal(sources.length, 1);
  assert.equal(sources[0].loop, true);
  assert.deepEqual(sources[0].started, [10, 0]);
  context.currentTime = 19;
  chant.setActive(false);
  assert.deepEqual(sources[0].stopped, [19.5]);
  context.currentTime = 20;
  chant.setActive(true);
  await tick();
  assert.equal(sources.length, 2);
  assert.deepEqual(sources[1].started, [20, 2]);
  assert.equal(fetch.mock.callCount(), 1);
});
