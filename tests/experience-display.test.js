import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const source = (await readFile(new URL('../src/characters/experience-display.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\r?\n/, '').replace('export function ', 'function ');

function harness() {
  let time = 0, id = 0;
  const pending = new Map(), progress = [], ticks = [], chimes = [];
  const nodes = new Map();
  for (const selector of ['#exp-label', '#exp-fill', '#exp-gain', '#exp-track', '#exp-unit', '#exp-portrait']) {
    nodes.set(selector, { textContent: '', hidden: false, style: {}, setAttribute(name, value) {
      this[name] = value;
      if (name === 'aria-valuenow') progress.push(Number(value));
    } });
  }
  const classes = new Set();
  const element = {
    hidden: true, querySelector: (selector) => nodes.get(selector),
    classList: { add: (name) => classes.add(name), remove: (name) => classes.delete(name) },
  };
  const schedule = (callback, delay = 16) => {
    pending.set(++id, { time: time + delay, callback });
    return id;
  };
  const context = {
    element,
    window: { setTimeout: schedule, clearTimeout: (id) => pending.delete(id) },
    requestAnimationFrame: (callback) => schedule(callback),
    cancelAnimationFrame: (id) => pending.delete(id),
    playExperienceTick: (xp, count) => ticks.push({ xp, count }),
    playExperienceLevelUp: () => chimes.push(time),
  };
  const display = runInNewContext(`${source}\ncreateExperienceDisplay(element)`, context);
  const flush = async () => { for (let i=0;i<8;i++) await Promise.resolve(); };
  async function advanceUntil(predicate) {
    await flush();
    for (let attempts=0; attempts<2000 && !predicate(); attempts++) {
      const next = [...pending].sort((a,b) => a[1].time-b[1].time)[0];
      assert.ok(next, 'animation must have a scheduled continuation');
      pending.delete(next[0]);
      time = next[1].time;
      next[1].callback(time);
      await flush();
    }
    assert.ok(predicate(), 'animation finished within its bounded schedule');
  }
  return { display, nodes, element, classes, progress, ticks, chimes, pending, advanceUntil, flush };
}

test('EXP gain presents the correct unit, counts every point with rising ticks, then returns to the HUD', async () => {
  const h = harness();
  h.display.reset(3, 20);
  let done = false;
  const promise = h.display.showGain({ name: 'Cyrus', portraitUrl: 'cyrus.png',
    level: 3, experience: 20, amount: 25, levelUps: 0, finalLevel: 3, finalExperience: 45 })
    .then(() => { done = true; });
  await h.flush();
  assert.equal(h.element.hidden, false);
  assert.ok(h.classes.has('gaining'));
  assert.equal(h.nodes.get('#exp-unit').textContent, 'Cyrus');
  assert.equal(h.nodes.get('#exp-portrait').src, 'cyrus.png');
  await h.advanceUntil(() => done);
  await promise;
  assert.deepEqual(h.progress, [20,20,...Array.from({ length: 25 }, (_,i) => 21+i),45]);
  assert.equal(h.ticks.reduce((sum,tick) => sum+tick.count,0), 25);
  assert.equal(h.chimes.length, 0);
  assert.equal(h.nodes.get('#exp-fill').style.width, '45%');
  assert.equal(h.nodes.get('#exp-label').textContent, 'LV 3 · EXP 45/100');
  assert.equal(h.classes.has('gaining'), false);
});

test('EXP fills to 100 before each level-up chime, wraps, and counts the exact final remainder', async () => {
  const h = harness();
  let done = false;
  h.display.showGain({ name: 'Maria', level: 1, experience: 90, amount: 125,
    levelUps: 2, finalLevel: 3, finalExperience: 15 }).then(() => { done = true; });
  await h.advanceUntil(() => done);
  assert.equal(h.chimes.length, 2);
  assert.equal(h.ticks.reduce((sum,tick) => sum+tick.count,0), 125);
  assert.equal(h.progress.filter((value) => value === 100).length, 2);
  assert.equal(h.progress.filter((value) => value === 0).length, 2);
  assert.equal(h.nodes.get('#exp-label').textContent, 'LV 3 · EXP 15/100');
  assert.equal(h.nodes.get('#exp-portrait').hidden, true);
  assert.equal(h.nodes.get('#exp-gain').textContent, 'LEVEL UP! · +125 EXP');
});

test('reset cancels in-flight ticks, clears pending gains and cannot overwrite a new unit', async () => {
  const h = harness();
  let first = false, queued = false;
  const gain = { level: 1, experience: 0, amount: 50, levelUps: 0, finalLevel: 1, finalExperience: 50 };
  h.display.showGain(gain).then(() => { first = true; });
  h.display.showGain(gain).then(() => { queued = true; });
  await h.advanceUntil(() => h.ticks.length >= 5);
  const count = h.ticks.length;
  h.display.reset(8, 77);
  await h.flush();
  assert.ok(first && queued);
  assert.equal(h.pending.size, 0);
  assert.equal(h.ticks.length, count);
  assert.equal(h.nodes.get('#exp-label').textContent, 'LV 8 · EXP 77/100');
  assert.equal(h.nodes.get('#exp-fill').style.width, '77%');
  assert.equal(h.classes.has('gaining'), false);
  let done = false;
  h.display.showGain({ ...gain, level: 8, experience: 77, amount: 2, finalLevel: 8, finalExperience: 79 })
    .then(() => { done = true; });
  await h.advanceUntil(() => done);
  assert.equal(h.nodes.get('#exp-fill').style.width, '79%');
});

test('queued gains play in order, and an exact level-up does not add phantom EXP ticks', async () => {
  const h = harness();
  let done = false;
  h.display.showGain({ level: 2, experience: 80, amount: 20, levelUps: 1, finalLevel: 3, finalExperience: 0 });
  h.display.showGain({ level: 3, experience: 0, amount: 10, levelUps: 0, finalLevel: 3, finalExperience: 10 })
    .then(() => { done = true; });
  await h.advanceUntil(() => done);
  assert.equal(h.chimes.length, 1);
  assert.equal(h.ticks.reduce((sum,tick) => sum+tick.count,0), 30);
  assert.equal(h.nodes.get('#exp-label').textContent, 'LV 3 · EXP 10/100');
});

test('EXP sound is an original rising pulse and celebratory ascending chord', async () => {
  const audio = await readFile(new URL('../src/audio/ui-sounds.js', import.meta.url), 'utf8');
  const from = audio.indexOf('export function playExperienceTick');
  const to = audio.indexOf('// Item discovery', from);
  const tones = [];
  const context = { ensureContext: () => true, tone: (options) => tones.push(options) };
  runInNewContext(audio.slice(from,to).replaceAll('export function ', 'function ') +
    '\nplayExperienceTick(10,100);playExperienceLevelUp();', context);
  assert.equal(tones.length, 14, 'delayed frame backlog is capped at three pulses plus four chord notes');
  assert.ok(tones.slice(0,6).every((tone) => tone.to > tone.from));
  assert.ok(tones[12].from > tones[6].from);
});
