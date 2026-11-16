import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attachMapDrag } from '../src/game/map-drag.js';

class Surface extends EventTarget {
  captured = new Set();
  setPointerCapture(id) { this.captured.add(id); }
  hasPointerCapture(id) { return this.captured.has(id); }
  releasePointerCapture(id) { this.captured.delete(id); }
}

function setup() {
  const element = new Surface(), calls = [];
  let enabled = true, clicks = 0;
  const cancel = attachMapDrag(element, {
    canPan: () => enabled,
    onStart: () => calls.push('start'),
    onPan: (...points) => calls.push(points),
    onEnd: () => calls.push('end'),
  });
  element.addEventListener('click', () => clicks++);
  const send = (type, x = 0, y = 0, id = 1, button = 0) => {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, { clientX: x, clientY: y, pointerId: id, button });
    element.dispatchEvent(event);
    return event;
  };
  return { element, calls, send, cancel, clicks: () => clicks, enable: (value) => { enabled = value; } };
}

test('a tap and small finger jitter preserve the normal battlefield click', () => {
  const ctx = setup();
  ctx.send('pointerdown', 100, 100);
  ctx.send('pointermove', 104, 104);
  ctx.send('pointerup', 104, 104);
  ctx.send('click', 104, 104);
  assert.equal(ctx.clicks(), 1);
  assert.deepEqual(ctx.calls, []);
  assert.equal(ctx.element.captured.size, 0);
});

test('mouse, pen and touch drags pan after eight pixels and never activate the release tile', () => {
  for (const pointerType of ['mouse', 'pen', 'touch']) {
    const ctx = setup();
    ctx.send('pointerdown', 100, 100);
    const event = new Event('pointermove', { cancelable: true });
    Object.assign(event, { clientX: 108, clientY: 100, pointerId: 1, pointerType });
    ctx.element.dispatchEvent(event);
    ctx.send('pointermove', 120, 110);
    ctx.send('pointerup', 120, 110);
    assert.equal(event.defaultPrevented, true);
    assert.deepEqual(ctx.calls, ['start', [100, 100, 108, 100], [108, 100, 120, 110], 'end']);
    assert.equal(ctx.send('click', 120, 110).defaultPrevented, true);
    assert.equal(ctx.clicks(), 0);
    ctx.send('pointerdown', 130, 110);
    ctx.send('pointerup', 130, 110);
    ctx.send('click', 130, 110);
    assert.equal(ctx.clicks(), 1, 'the next intentional tap works');
  }
});

test('blocked interaction and non-primary buttons never start a pan', () => {
  const ctx = setup();
  ctx.enable(false);
  ctx.send('pointerdown');
  ctx.send('pointermove', 100, 100);
  ctx.send('pointerup');
  ctx.enable(true);
  ctx.send('pointerdown', 0, 0, 1, 2);
  ctx.send('pointermove', 100, 100);
  ctx.send('pointerup');
  assert.deepEqual(ctx.calls, []);
});

test('phase changes, cancellation and lost capture clean up active gestures', () => {
  for (const end of ['phase', 'pointercancel', 'lostpointercapture']) {
    const ctx = setup();
    ctx.send('pointerdown');
    ctx.send('pointermove', 10, 0);
    if (end === 'phase') {
      ctx.enable(false);
      ctx.send('pointermove', 20, 0);
      ctx.send('pointerup', 20, 0);
    } else ctx.send(end, 10, 0);
    ctx.send('pointermove', 30, 0);
    ctx.send('click', 30, 0);
    assert.deepEqual(ctx.calls, ['start', [0, 0, 10, 0], 'end']);
    assert.equal(ctx.clicks(), 0);
    assert.equal(ctx.element.captured.size, 0);
  }
});

test('a second finger cancels pan and does not become an accidental tap or new drag', () => {
  const ctx = setup();
  ctx.send('pointerdown');
  ctx.send('pointermove', 10, 0);
  ctx.send('pointerdown', 20, 20, 2);
  ctx.send('pointermove', 30, 30, 2);
  ctx.send('pointerup', 30, 30, 2);
  ctx.send('pointermove', 40, 0);
  ctx.send('pointerup', 40, 0);
  ctx.send('click', 40, 0);
  assert.deepEqual(ctx.calls, ['start', [0, 0, 10, 0], 'end']);
  assert.equal(ctx.clicks(), 0);
  ctx.send('pointerdown', 50, 0);
  ctx.send('pointerup', 50, 0);
  ctx.send('click', 50, 0);
  assert.equal(ctx.clicks(), 1);
});

test('opening a dialog cancels capture even before the next pointer movement', () => {
  const ctx = setup();
  ctx.send('pointerdown');
  ctx.send('pointermove', 10, 0);
  ctx.cancel();
  ctx.send('lostpointercapture', 10, 0);
  ctx.send('pointermove', 20, 0);
  ctx.send('click', 20, 0);
  assert.deepEqual(ctx.calls, ['start', [0, 0, 10, 0], 'end']);
  assert.equal(ctx.element.captured.size, 0);
  assert.equal(ctx.clicks(), 0);
});
