import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resumeAudioContext } from '../src/audio/audio-context.js';

test('running audio is preserved and concurrent suspended resumes share one request', async () => {
  let resumes = 0, finish;
  const context = {
    state: 'running',
    resume() {
      resumes++;
      return new Promise((resolve) => { finish = () => { context.state = 'running'; resolve(); }; });
    },
  };
  await resumeAudioContext(context);
  assert.equal(resumes, 0);
  context.state = 'suspended';
  const first = resumeAudioContext(context), second = resumeAudioContext(context);
  assert.equal(first, second);
  assert.equal(resumes, 1);
  finish();
  await first;
  context.state = 'interrupted';
  const retry = resumeAudioContext(context);
  assert.equal(resumes, 2, 'later interruptions can resume again');
  finish();
  await retry;
});

test('a permanently suspended device times out, closes and explicitly reports failure', async (t) => {
  let timeout, cleared = 0;
  t.mock.method(globalThis, 'setTimeout', (callback, delay) => {
    assert.equal(delay, 2000);
    timeout = callback;
    return 17;
  });
  t.mock.method(globalThis, 'clearTimeout', (id) => { assert.equal(id, 17); cleared++; });
  const context = { state: 'suspended', resume: () => new Promise(() => {}),
    async close() { this.state = 'closed'; } };
  const resumed = resumeAudioContext(context);
  const failure = assert.rejects(resumed, /Audio device did not resume/);
  timeout();
  await failure;
  assert.equal(context.state, 'closed', 'next gesture can recreate the failed context');
  assert.equal(cleared, 1);
});

test('resume rejections release the failed device and retain the original error', async () => {
  const failure = new Error('device unavailable');
  const context = { state: 'interrupted', resume: () => Promise.reject(failure),
    async close() { this.state = 'closed'; } };
  await assert.rejects(resumeAudioContext(context), (error) => error === failure);
  assert.equal(context.state, 'closed');
});

test('sound effects recreate closed contexts and unlock again on player gestures', async (t) => {
  const originals = new Map(['window', 'document'].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  t.after(() => {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  const contexts = [], gestures = {};
  globalThis.window = {
    AudioContext: function () {
      const context = {
        state: 'suspended', sampleRate: 100, destination: {},
        async resume() { this.state = 'running'; },
        createGain: () => ({ gain: {}, connect() {} }),
        createBuffer: (_channels, length) => ({ getChannelData: () => new Float32Array(length) }),
      };
      contexts.push(context);
      return context;
    },
    addEventListener(name, callback) { gestures[name] = callback; },
  };
  globalThis.document = { addEventListener() {} };
  const audio = await import('../src/audio/ui-sounds.js');
  audio.initializeUiSounds();
  gestures.pointerdown();
  await resumeAudioContext(contexts[0]);
  assert.equal(contexts.length, 1);
  assert.equal(contexts[0].state, 'running');
  contexts[0].state = 'closed';
  gestures.keydown();
  await resumeAudioContext(contexts[1]);
  assert.equal(contexts.length, 2);
  assert.equal(audio.getSoundOutput().context, contexts[1]);
  assert.equal(contexts[1].state, 'running');
});
