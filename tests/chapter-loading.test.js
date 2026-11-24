import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { buildWithAssets, prepareMotion, warmTextures } from '../src/game/chapter-loading.js';

const priorRaf = Object.getOwnPropertyDescriptor(globalThis, 'requestAnimationFrame');
before(() => { globalThis.requestAnimationFrame = callback => setImmediate(callback); });
after(() => {
  if (priorRaf) Object.defineProperty(globalThis, 'requestAnimationFrame', priorRaf);
  else delete globalThis.requestAnimationFrame;
});

const manager = () => ({ itemStart() {}, itemEnd() {}, itemError() {} });

test('Chapter building waits for all artwork, including duplicate requests, and restores the loading manager', async () => {
  const loading = manager();
  const original = { ...loading };
  const progress = [];
  let finished = false;
  const ready = () => {};
  const work = buildWithAssets(loading, () => {
    loading.itemStart('map');
    loading.itemStart('map');
    loading.itemStart('backdrop');
    loading.itemEnd('map');
    return ready;
  }, (completed, total) => progress.push([completed, total])).then(value => { finished = true; return value; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(finished, false);
  loading.itemEnd('map');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(finished, false);
  loading.itemEnd('backdrop');
  assert.equal(await work, ready);
  assert.deepEqual(progress.at(-1), [3, 3]);
  assert.deepEqual(loading, original);
});

test('Missing artwork and build failures reject explicitly without leaking manager hooks', async () => {
  const loading = manager();
  const original = { ...loading };
  await assert.rejects(buildWithAssets(loading, () => {
    loading.itemStart('missing.png');
    loading.itemError('missing.png');
    loading.itemEnd('missing.png');
  }), /Could not load chapter artwork: missing.png/);
  assert.deepEqual(loading, original);
  await assert.rejects(buildWithAssets(loading, () => { throw new Error('Invalid save'); }), /Invalid save/);
  assert.deepEqual(loading, original);
});

test('Cached artwork finishes without waiting for another load event', async () => {
  const ready = () => {};
  assert.equal(await buildWithAssets(manager(), () => ready), ready);
});

test('Only requested animation sets load, once each, sequentially, with measured progress', async () => {
  const loaded = [], progress = [];
  let active = 0;
  await prepareMotion({ async loadMotion(set) {
    assert.equal(active++, 0);
    loaded.push(set);
    await new Promise(resolve => setImmediate(resolve));
    active--;
  } }, ['maria', 'genericSage', 'maria'], (completed, total) => progress.push([completed, total]));
  assert.deepEqual(loaded, ['maria', 'genericSage']);
  assert.deepEqual(progress, [[0, 2], [1, 2], [2, 2]]);
  await assert.rejects(prepareMotion({ loadMotion: async () => { throw new Error('Missing animation'); } }, ['maria']),
    /Missing animation/);
});

test('Texture warmup deduplicates and uploads in batches of at most sixteen between paints', async () => {
  const textures = Array.from({ length: 19 }, () => ({ image: {} }));
  const uploaded = [], progress = [];
  await warmTextures({ initTexture: texture => uploaded.push(texture) }, [...textures, textures[0], null, {}],
    (completed, total) => progress.push([completed, total]));
  assert.deepEqual(uploaded, textures);
  assert.deepEqual(progress[0], [0, 19]);
  assert.deepEqual(progress.at(-1), [19, 19]);
  for (let index = 1; index < progress.length; index++) {
    assert.ok(progress[index][0] - progress[index - 1][0] <= 16);
  }
});

test('Texture uploads yield as soon as a batch reaches six milliseconds', async () => {
  const prior = Object.getOwnPropertyDescriptor(globalThis, 'performance');
  let now = 0;
  Object.defineProperty(globalThis, 'performance', { configurable: true, value: { now: () => now } });
  try {
    const progress = [];
    await warmTextures({ initTexture: () => { now += 3; } },
      Array.from({ length: 6 }, () => ({ image: {}, version: 0 })),
      (completed, total) => progress.push([completed, total]));
    assert.deepEqual(progress, [[0, 6], [2, 6], [4, 6], [6, 6]]);
  } finally {
    Object.defineProperty(globalThis, 'performance', prior);
  }
});

test('Repeated warmup skips cached uploads but reuploads changed and disposed textures', async () => {
  const uploaded = [];
  const renderer = { initTexture: texture => uploaded.push(texture) };
  let dispose;
  const texture = { image: {}, version: 0, addEventListener(event, listener) {
    assert.equal(event, 'dispose');
    dispose = listener;
  } };
  await warmTextures(renderer, [texture]);
  await warmTextures(renderer, [texture]);
  assert.equal(uploaded.length, 1);
  texture.version++;
  await warmTextures(renderer, [texture]);
  assert.equal(uploaded.length, 2);
  dispose();
  await warmTextures(renderer, [texture]);
  assert.equal(uploaded.length, 3);
  await warmTextures({ initTexture: () => uploaded.push(texture) }, [texture]);
  assert.equal(uploaded.length, 4, 'uploads are cached per renderer, not globally');
});
test('The live transition keeps its modal and gameplay gate until shaders finish, and prevents duplicate loads', async () => {
  const source = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  const code = source.slice(source.indexOf('async function loadChapterScene('), source.indexOf('const partyOf'));
  const events = [];
  let release;
  const shaderReady = new Promise(resolve => { release = resolve; });
  const vector = { set() { return this; }, add() { return this; }, clone() { return this; }, multiplyScalar() { return this; } };
  const unit = { hp: 10, mesh: {} };
  const dialog = { open: false, showModal() { this.open = true; }, close() { this.open = false; } };
  const context = {
    chapterLoading: false, chapterLoadGeneration: 0, sessionStarted: false,
    chapterLoadingDialog: dialog, chapterLoadingProgress: () => {}, nextPaint: async () => {},
    THREE: { DefaultLoadingManager: manager() }, buildWithAssets,
    playerTeam: [unit], neutralUnits: () => [], enemies: [unit], weaponSpriteSet: () => 'maria',
    prepareMotion: async (_, sets) => { assert.equal(sets.length, 1); events.push('motion'); },
    characterSprites: {}, warmingMotion: new WeakMap(), setIdleSprite: () => {},
    camera: { position: vector }, player: { x: 1, z: 1 }, worldX: value => value, worldZ: value => value,
    CAM_OFFSET: vector, tacticalCameraScale: () => 1, update: () => {}, clock: { elapsedTime: 0, getDelta() {} },
    motionTextures: () => [], scene: { traverse() {} },
    warmTextures: async () => { events.push('textures'); },
    renderer: { async compileAsync() { events.push('compile'); await shaderReady; }, render() { events.push('render'); } },
    window: { setTimeout() {} }, mainMenu: { hidden: false },
    document: { body: { classList: { add() {} } } }, menuStatus: { textContent: '' }, setLevelStatus() {},
    console: { error() {} },
    build: () => () => { events.push('reveal'); },
  };
  const work = runInNewContext(`${code}\nloadChapterScene(build)`, context);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(context.chapterLoading, true);
  assert.equal(dialog.open, true);
  assert.deepEqual(events, ['motion', 'textures', 'compile']);
  assert.equal(await runInNewContext('loadChapterScene(() => { throw new Error("duplicate"); })', context), false);
  release();
  assert.equal(await work, true);
  assert.equal(dialog.open, false);
  assert.equal(context.chapterLoading, false);
  assert.deepEqual(events, ['motion', 'textures', 'compile', 'render', 'reveal']);
  context.prepareMotion = async () => { throw new Error('Missing sprites'); };
  assert.equal(await runInNewContext('loadChapterScene(build)', context), false);
  assert.equal(context.sessionStarted, false);
  assert.equal(context.mainMenu.hidden, false);
  assert.equal(dialog.open, false);
  assert.match(context.menuStatus.textContent, /Missing sprites.*saved game has not been changed/);
  assert.equal(events.filter(event => event === 'reveal').length, 1);
});

test('Sprite normalization yields at its six-millisecond budget while preserving native crops and bottom alignment', async () => {
  const source = await readFile(new URL('../src/characters/animation-loader.js', import.meta.url), 'utf8');
  const code = source.slice(source.indexOf('const yieldToBrowser'), source.indexOf('// Load all possible character sprites'));
  const textures = [
    { image: { width: 4, height: 5, bounds: [1, 1, 2, 3] }, userData: {} },
    { image: { width: 6, height: 4, bounds: [2, 1, 4, 2] }, userData: {} },
  ];
  let image, yields = 0, now = 0;
  const draws = [];
  const context = {
    performance: { now: () => now },
    scheduler: { yield: async () => { yields++; } },
    document: { createElement: () => ({ getContext: () => ({
      drawImage(value) { image = value; },
      getImageData(_, __, width, height) {
        now += 6;
        const data = new Uint8ClampedArray(width * height * 4);
        const [left, top, right, bottom] = image.bounds;
        for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) data[(y * width + x) * 4 + 3] = 255;
        return { data };
      },
    }) }) },
    OffscreenCanvas: class {
      constructor(width, height) { this.width = width; this.height = height; }
      getContext() { return { clearRect() {}, drawImage: (...args) => { now += 6; draws.push(args.slice(1)); } }; }
    },
    textures,
  };
  const normalized = await runInNewContext(`${code}\nnormalizeSpritesToConsistentSize(textures, 'Test', 'south')`, context);
  assert.equal(yields, 5);
  assert.deepEqual(draws, [[1, 1, 2, 3, 1, 0, 2, 3], [2, 1, 3, 2, 0, 1, 3, 2]]);
  for (const texture of normalized) {
    assert.equal(texture.image.width, 3);
    assert.equal(texture.image.height, 3);
    assert.equal(texture.userData.idleHeightRatio, 1);
    assert.equal(texture.needsUpdate, true);
  }
});

test('Title startup never loads or builds Chapter 1 and gameplay stays gated until preparation completes', async () => {
  const source = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  const startup = source.slice(source.indexOf('// ---------- Level loading and world ----------'),
    source.indexOf('function newGame()'));
  assert.doesNotMatch(startup, /await loadInitialLevel|const initialLevel|^resetEnemies\(\);/m);
  assert.match(source, /return startLevel\(\(\) => loadInitialLevel\(setLevelStatus\), \{ chapter: 0 \}\)/);
  assert.match(source, /if \(!sessionStarted \|\| chapterLoading\) return false/);
  assert.match(source, /return loadChapterScene\(\(\) => restoreGame\(save\)\)/);
  assert.match(source, /if \(!activeLevel \|\| chapterLoading \|\| !sessionStarted\)/);
  const loading = source.slice(source.indexOf('async function loadChapterScene('), source.indexOf('const partyOf'));
  assert.ok(loading.indexOf('await prepareMotion(') < loading.indexOf('await warmTextures('));
  assert.ok(loading.indexOf('await warmTextures(') < loading.indexOf('await renderer.compileAsync('));
  assert.ok(loading.indexOf('renderer.render(scene, camera)') < loading.indexOf('ready();'));
  assert.ok(loading.indexOf('chapterLoadingDialog.close();') < loading.indexOf('ready();'));
});
