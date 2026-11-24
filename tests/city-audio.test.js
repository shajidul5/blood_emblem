import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCityAmbience, playClockBell, playPursuitHooves } from '../src/audio/city-ambience.js';

function audioContext() {
  const nodes = [];
  const param = () => ({ value: 0, events: [],
    setValueAtTime(...args) { this.events.push(args); },
    exponentialRampToValueAtTime(...args) { this.events.push(args); },
    setTargetAtTime(...args) { this.events.push(args); }, cancelScheduledValues() {} });
  const node = (kind) => {
    const result = { kind, gain: param(), frequency: param(), Q: param(), starts: [], stops: [],
      connections: [], disconnected: false,
      connect(other) { this.connections.push(other); return other; },
      disconnect() { this.disconnected = true; },
      start(...args) { this.starts.push(args); }, stop(...args) { this.stops.push(args); } };
    nodes.push(result);
    return result;
  };
  return { nodes, currentTime: 10, destination: {},
    createGain: () => node('gain'), createBiquadFilter: () => node('filter'),
    createOscillator: () => node('oscillator'), createBufferSource: () => node('source') };
}

test('clock bell has low inharmonic partials, finite decay and disconnected nodes', () => {
  const context = audioContext();
  playClockBell(context, context.destination);
  const tones = context.nodes.filter((node) => node.kind === 'oscillator');
  assert.equal(tones.length, 3);
  assert.deepEqual(tones.map((node) => node.frequency.events[0][0]), [110, 231, 302]);
  assert.ok(tones.every((node) => node.stops[0][0] <= 15));
  for (const tone of tones) tone.onended();
  assert.ok(context.nodes.every((node) => node.disconnected));
});

test('cavalry warning is a distinct finite twelve-hoof sequence, never a repeating ambient cue', () => {
  const context = audioContext();
  playPursuitHooves(context, context.destination, { duration: 6 });
  const sources = context.nodes.filter((node) => node.kind === 'source');
  const tones = context.nodes.filter((node) => node.kind === 'oscillator');
  assert.equal(sources.length, 12);
  assert.equal(tones.length, 12);
  assert.ok(sources.at(-1).starts[0][0] < 12.2);
  assert.ok(sources.every((node) => node.stops.length === 1 && !node.loop));
  for (const node of [...sources, ...tones]) node.onended();
  assert.ok(context.nodes.every((node) => node.disconnected));
});

test('city has one scheduler per ambient sound, sparse bells and no hooves except warnings', (t) => {
  const timers = new Map();
  let id = 0;
  t.mock.method(Math, 'random', () => .5);
  t.mock.method(globalThis, 'setTimeout', (callback, delay) => { timers.set(++id, { callback, delay }); return id; });
  t.mock.method(globalThis, 'clearTimeout', (key) => timers.delete(key));
  const context = audioContext();
  const city = createCityAmbience(context, context.destination, { duration: 6 });
  city.warnPursuit();
  assert.equal(context.nodes.filter((node) => node.kind === 'source').length, 1, 'muted warning cannot play');
  city.setActive(true);
  city.setActive(true);
  assert.equal(timers.size, 4);
  assert.deepEqual([...timers.values()].map((timer) => timer.delay), [18000, 9000, 31000, 57500]);
  for (const [key, event] of [...timers]) {
    timers.delete(key);
    event.callback();
  }
  assert.equal(timers.size, 4, 'callbacks replace, never multiply, their timers');
  const before = context.nodes.filter((node) => node.kind === 'source').length;
  city.warnPursuit();
  assert.equal(context.nodes.filter((node) => node.kind === 'source').length, before + 12);
  assert.equal(timers.size, 4, 'warning hooves do not create an ambient scheduler');
  city.setActive(false);
  assert.equal(timers.size, 0);
  assert.equal(context.nodes[0].gain.events.at(-1)[0], 0);
  city.setActive(true);
  assert.equal(timers.size, 4);
  city.setActive(false);
});
