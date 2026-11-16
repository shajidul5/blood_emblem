import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import * as THREE from 'three';
import { GATE_SHRIEK_URL, loadGateShriek } from '../src/audio/gate-audio.js';

const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
const reveal = main.slice(main.indexOf('async function showGateRavens('), main.indexOf('\nfunction hideMainMenu()'));
const raven = (x, z) => ({ id: 'raven', hp: 18, x, z, mesh: { position: new THREE.Vector3(x, 0, z) } });

function cameraHarness({ hidden = false, reduced = false, fail = false, gate = true } = {}) {
  const shots = [];
  const manual = new THREE.Vector3(10, .8, 24);
  const context = {
    THREE, activeLevel: { width: 23, gateEncounter: gate ? {} : null },
    document: { hidden }, window: { matchMedia: () => ({ matches: reduced }) },
    gameState: { mode: 'cursor' }, cameraFollowTarget: undefined, manualCameraTarget: manual,
    cursor: { x: 11, z: 32 }, worldX: (x) => x, worldZ: (z) => z,
    renderTacticalUi() {},
    async wait(ms) {
      shots.push({ ms, target: context.cameraFollowTarget.clone() });
      assert.equal(context.gameState.mode, 'combat', 'input is locked during each camera shot');
      assert.equal(context.manualCameraTarget, null, 'camera shots cannot overwrite the player pan target');
      if (fail) throw new Error('interrupted');
    },
  };
  runInNewContext(`${reveal}\nglobalThis.show = showGateRavens;`, context);
  return { context, shots, manual };
}

test('raven arrival camera shows both actual flocks then returns to the player pan and unlocks control', async () => {
  const { context, shots, manual } = cameraHarness();
  await context.show([raven(2, 8), raven(2, 12), raven(20, 8), raven(20, 12),
    { ...raven(11, 3), id: 'golden-mage' }, { ...raven(2, 3), hp: 0 }]);
  assert.deepEqual(shots.map(({ ms, target }) => [ms, target.x, target.z]),
    [[1100, 2, 10], [1100, 20, 10], [500, 10, 24]]);
  assert.equal(context.cameraFollowTarget, undefined);
  assert.equal(context.manualCameraTarget, manual);
  assert.equal(context.gameState.mode, 'cursor');
  assert.equal(manual.z, 24);
});

test('single or partially queued raven arrivals use one shot and preserve an existing cinematic target', async () => {
  const { context, shots } = cameraHarness();
  const previous = new THREE.Vector3(11, 0, 5);
  context.cameraFollowTarget = previous;
  context.gameState.mode = 'combat';
  await context.show([raven(20, 22)]);
  assert.equal(shots.length, 2);
  assert.deepEqual(shots[0].target.toArray(), [20, 0, 22]);
  assert.equal(context.cameraFollowTarget, previous);
  assert.equal(context.gameState.mode, 'combat');
});

test('raven camera skips other chapters, empty waves, hidden tabs and reduced motion without locking input', async () => {
  for (const options of [{ gate: false }, { hidden: true }, { reduced: true }, {}]) {
    const { context, shots, manual } = cameraHarness(options);
    await context.show(Object.keys(options).length ? [raven(2, 23)] : []);
    assert.equal(shots.length, 0);
    assert.equal(context.gameState.mode, 'cursor');
    assert.equal(context.manualCameraTarget, manual);
  }
});

test('an interrupted raven camera restores control and surfaces the failure', async () => {
  const { context, manual } = cameraHarness({ fail: true });
  await assert.rejects(context.show([raven(2, 23)]), /interrupted/);
  assert.equal(context.gameState.mode, 'cursor');
  assert.equal(context.manualCameraTarget, manual);
  assert.equal(context.cameraFollowTarget, undefined);
});

test('the Beast landing and its raven reveal also preserve the player camera pan', async () => {
  const source = main.slice(main.indexOf('async function revealGateBeast('), main.indexOf('\nfunction spawnGateRavens()'));
  const manual = new THREE.Vector3(10, .8, 24), previous = new THREE.Vector3(11, 0, 7);
  const flock = [raven(2, 8), raven(20, 8)];
  const revealed = [];
  const context = {
    THREE, cameraFollowTarget: previous, manualCameraTarget: manual,
    setMessage() {}, playGateRumble() {}, playBloodBeastRoar() {}, playHitImpact() {},
    showCombatResult() {}, renderTacticalUi() {},
    async wait() { assert.equal(context.manualCameraTarget, null); },
    tutorialPopup: { async show(id) { assert.equal(id, 'bloodBeastArrival'); } },
    spawnGateRavens: () => flock, async showGateRavens(units) { revealed.push(units); },
  };
  runInNewContext(`${source}\nglobalThis.show = revealGateBeast;`, context);
  const beast = { mesh: { position: new THREE.Vector3(11, 0, 5), visible: false } };
  await context.show(beast);
  assert.equal(context.cameraFollowTarget, previous);
  assert.equal(context.manualCameraTarget, manual);
  assert.equal(manual.z, 24);
  assert.equal(revealed[0], flock);
  assert.equal(beast.mesh.visible, true);
  assert.equal(beast.mesh.position.y, 0);
});

test('Chapter 10 wires actual arrivals at opening, boss reveal, turn transition and continued delayed flocks', () => {
  assert.match(main, /if \(intro === 'goldenBridge'\) await showGateRavens\(enemies\)/);
  assert.match(main, /await showGateRavens\(spawnGateRavens\(\)\)/);
  assert.match(main, /await showGateRavens\(\[\.\.\.gateRavens, \.\.\.reinforcementResult.units\]\)/);
  assert.match(main, /void showGateRavens\(spawnGateRavens\(\)\)\.catch/);
  assert.doesNotMatch(main, /bridgeWarnings|tutorialPopup\.show\('bridgeWarning'/);
});

test('generated gate shriek is a real 4.5-second audible WAV', async () => {
  const wav = await readFile(new URL(GATE_SHRIEK_URL));
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
  let channels, rate, bits, format, samples;
  for (let offset = 12; offset + 8 <= wav.length;) {
    const size = wav.readUInt32LE(offset + 4);
    const kind = wav.toString('ascii', offset, offset + 4);
    if (kind === 'fmt ') {
      format = wav.readUInt16LE(offset + 8);
      channels = wav.readUInt16LE(offset + 10);
      rate = wav.readUInt32LE(offset + 12);
      bits = wav.readUInt16LE(offset + 22);
    }
    if (kind === 'data') samples = wav.subarray(offset + 8, offset + 8 + size);
    offset += 8 + size + size % 2;
  }
  assert.equal(format, 1);
  assert.equal(bits, 16);
  assert.ok(Math.abs(samples.length / (channels * rate * 2) - 4.5) < .1);
  let squares = 0, peak = 0;
  for (let offset = 0; offset < samples.length; offset += 2) {
    const value = samples.readInt16LE(offset) / 32768;
    peak = Math.max(peak, Math.abs(value));
    squares += value * value;
  }
  assert.ok(peak > .2 && peak <= 1);
  assert.ok(Math.sqrt(squares / (samples.length / 2)) > .025);
});

test('gate shriek loading caches per context and retries HTTP failures explicitly', async (t) => {
  let fetches = 0;
  const context = { decodeAudioData: async () => ({ duration: 4.5 }) };
  t.mock.method(globalThis, 'fetch', async (url) => {
    assert.equal(url, GATE_SHRIEK_URL);
    fetches++;
    return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) };
  });
  const loading = loadGateShriek(context);
  assert.equal(loadGateShriek(context), loading);
  assert.equal((await loading).duration, 4.5);
  assert.equal(fetches, 1);
  const other = { ...context };
  t.mock.method(globalThis, 'fetch', async () => ({ ok: false, status: 503 }));
  await assert.rejects(loadGateShriek(other), /HTTP 503/);
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }));
  assert.equal((await loadGateShriek(other)).duration, 4.5);
});

test('distant shriek uses the generated sample through shared audio output, cleans up and stays silent when hidden', async () => {
  const module = await readFile(new URL('../src/audio/gate-audio.js', import.meta.url), 'utf8');
  const source = module.slice(module.indexOf('export async function playDistantGateShriek'))
    .replace('export async function', 'async function');
  let loads = 0;
  const nodes = [];
  const node = () => {
    const value = { gain: { value: 0 }, connect(other) { this.destination = other; return other; },
      disconnect() { this.disconnected = true; }, start() { this.started = true; } };
    nodes.push(value);
    return value;
  };
  const buffer = { duration: 4.5 }, destination = {};
  const context = { createBufferSource: node, createGain: node };
  const sandbox = { document: { hidden: false }, getSoundOutput: () => ({ context, destination }),
    loadGateShriek: async () => { loads++; return buffer; } };
  runInNewContext(`${source}\nglobalThis.play = playDistantGateShriek;`, sandbox);
  await sandbox.play();
  assert.equal(nodes[0].buffer, buffer);
  assert.equal(nodes[0].started, true);
  assert.equal(nodes[1].gain.value, .55);
  assert.equal(nodes[1].destination, destination);
  nodes[0].onended();
  assert.ok(nodes.every((entry) => entry.disconnected));
  sandbox.document.hidden = true;
  await sandbox.play();
  assert.equal(loads, 1);
});
