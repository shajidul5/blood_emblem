import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { CROW_AUDIO_URL, loadCrowAudio, playCrowCall } from '../src/audio/crow-audio.js';
import { createForestAmbience } from '../src/audio/forest-ambience.js';

function audioContext() {
  const nodes = [];
  const param = () => ({
    value: 0, events: [],
    cancelScheduledValues() {},
    setTargetAtTime(...args) { this.events.push(args); },
    setValueAtTime() {}, exponentialRampToValueAtTime() {},
  });
  const node = (kind) => {
    const value = { kind, gain: param(), frequency: param(), Q: param(), pan: param(), playbackRate: param(),
      starts: [], connections: [], disconnected: false,
      connect(other) { this.connections.push(other); return other; },
      disconnect() { this.disconnected = true; },
      start(...args) { this.starts.push(args); }, stop() {},
    };
    nodes.push(value);
    return value;
  };
  return { nodes, currentTime: 10, destination: {},
    createGain: () => node('gain'), createOscillator: () => node('oscillator'),
    createBiquadFilter: () => node('filter'), createBufferSource: () => node('source'),
    createStereoPanner: () => node('panner'),
    async decodeAudioData(bytes) { return { bytes, duration: 5 }; },
  };
}

test('generated crow WAV is five seconds of audible PCM, not an empty placeholder', async () => {
  const wav = await readFile(new URL(CROW_AUDIO_URL));
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
  let rate, channels, bits, samples;
  for (let offset = 12; offset + 8 <= wav.length;) {
    const size = wav.readUInt32LE(offset + 4);
    const kind = wav.toString('ascii', offset, offset + 4);
    if (kind === 'fmt ') {
      assert.equal(wav.readUInt16LE(offset + 8), 1);
      channels = wav.readUInt16LE(offset + 10);
      rate = wav.readUInt32LE(offset + 12);
      bits = wav.readUInt16LE(offset + 22);
    }
    if (kind === 'data') samples = wav.subarray(offset + 8, offset + 8 + size);
    offset += 8 + size + size % 2;
  }
  assert.equal(bits, 16);
  assert.ok(Math.abs(samples.length / (channels * rate * 2) - 5) < .1);
  let peak = 0, squares = 0;
  for (let i = 0; i < samples.length; i += 2) {
    const value = samples.readInt16LE(i) / 32768;
    peak = Math.max(peak, Math.abs(value));
    squares += value * value;
  }
  assert.ok(peak > .2 && peak <= 1, `peak ${peak}`);
  assert.ok(Math.sqrt(squares / (samples.length / 2)) > .025, 'recording has audible signal energy');
});

test('crow loading is cached per audio context and failures are surfaced and retryable', async (t) => {
  let fetches = 0;
  t.mock.method(globalThis, 'fetch', async (url) => {
    assert.equal(url, CROW_AUDIO_URL);
    fetches++;
    return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) };
  });
  const context = audioContext();
  const first = loadCrowAudio(context);
  assert.equal(loadCrowAudio(context), first);
  await first;
  assert.equal(fetches, 1);
  const other = audioContext();
  t.mock.method(globalThis, 'fetch', async () => ({ ok: false, status: 404 }));
  await assert.rejects(loadCrowAudio(other), /HTTP 404/);
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }));
  assert.equal((await loadCrowAudio(other)).duration, 5);
});

test('crow playback uses the recording at stronger gain, pans, and disconnects when finished', () => {
  const context = audioContext();
  const buffer = { duration: 5 };
  playCrowCall(context, context.destination, buffer, { start: .9, pitch: .95, pan: -.3 });
  const [source, gain, panner] = context.nodes;
  assert.equal(source.buffer, buffer);
  assert.deepEqual(source.starts, [[10.9]]);
  assert.equal(source.playbackRate.value, .95);
  assert.equal(gain.gain.value, .8);
  assert.equal(panner.pan.value, -.3);
  assert.deepEqual(panner.connections, [context.destination]);
  assert.equal(context.nodes.some(n => n.kind === 'oscillator'), false);
  source.onended();
  assert.ok(context.nodes.every(n => n.disconnected));
});

test('Crowman warning uses the same generated sample instead of high-pitched synthetic caws', async () => {
  const source = (await readFile(new URL('../src/audio/combat-sounds.js', import.meta.url), 'utf8'))
    .replace(/^import .*;\r?\n/gm, '').replaceAll('export function ', 'function ');
  const context = audioContext();
  const buffer = { duration: 5 };
  const tones = [], samples = [];
  runInNewContext(`${source}\nplayCrowOmen();`, {
    ensureContext: () => true, getSoundOutput: () => ({ context, destination: context.destination }),
    tone: value => tones.push(value), noise() {}, console,
    loadCrowAudio: async value => { assert.equal(value, context); return buffer; },
    playCrowCall: (...args) => samples.push(args),
  });
  await Promise.resolve();
  assert.equal(samples.length, 1);
  assert.equal(samples[0][2], buffer);
  assert.equal(samples[0][3].volume, .9);
  assert.ok(Math.abs(samples[0][3].start - .9) < .001);
  assert.ok(tones.every(tone => tone.from < 200), 'only the low ominous drone stays synthesized');
});

test('forest first call is prompt, repeats only once per interval, and deactivation cancels all timers', async (t) => {
  t.mock.method(Math, 'random', () => .5);
  const pending = new Map();
  let id = 0;
  t.mock.method(globalThis, 'setTimeout', (callback, delay) => { pending.set(++id, { callback, delay }); return id; });
  t.mock.method(globalThis, 'clearTimeout', key => pending.delete(key));
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }));
  const context = audioContext();
  const ambience = createForestAmbience(context, context.destination, { duration: 6 });
  ambience.setActive(true);
  ambience.setActive(false);
  ambience.setActive(true);
  const buffer = await loadCrowAudio(context);
  await Promise.resolve();
  assert.equal(pending.size, 3, 'stale load completion must not add a second scheduler');
  ambience.setActive(true);
  assert.equal(pending.size, 3);
  const run = predicate => {
    const [key, event] = [...pending].find(([, value]) => predicate(value.delay));
    pending.delete(key);
    event.callback();
  };
  run(delay => delay >= 600 && delay < 1000);
  assert.equal(pending.size, 3);
  assert.equal(context.nodes.filter(n => n.buffer === buffer).length, 1);
  run(delay => delay >= 8000 && delay < 14000);
  assert.equal(pending.size, 3, 'first-call timer must not repeat and multiply the crow scheduler');
  assert.equal(context.nodes.filter(n => n.buffer === buffer).length, 2);
  const gain = context.nodes.find(n => n.kind === 'gain' && n.gain.value >= .75 && n.gain.value <= .9);
  assert.ok(gain, 'crow playback gain is 0.75–0.9, up from the synthesized 0.12–0.26');
  ambience.setActive(false);
  assert.equal(pending.size, 0);
  assert.equal(context.nodes[0].gain.events.at(-1)[0], 0);
});
