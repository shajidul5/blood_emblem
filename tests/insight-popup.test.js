import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

let server;
let createItemPopup;
let renderInsightLabel;
let insightSpriteUrl;

class Element extends EventTarget {
  textContent = '';
  children = [];
  classList = new Set();
  open = false;

  replaceChildren(...children) { this.children = children; }
  append(child) { this.children.push(child); }
  focus() { this.focused = true; }
  showModal() { this.open = true; }
  close() {
    this.open = false;
    this.dispatchEvent(new Event('close'));
  }
}

before(async () => {
  server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: 'custom' });
  ({ createItemPopup } = await server.ssrLoadModule('/src/characters/item-popup.js'));
  ({ renderInsightLabel, insightSpriteUrl } = await server.ssrLoadModule('/src/game/insight-display.js'));
});

after(async () => { await server?.close(); });

function installDom(t) {
  const previous = ['document', 'window'].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  globalThis.document = { createElement: () => new Element() };
  globalThis.window = {};
  t.after(() => {
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
}

test('Insight labels keep one decorative eye when the total changes', (t) => {
  installDom(t);
  const label = new Element();
  renderInsightLabel(label, 'Insight: 5');
  renderInsightLabel(label, 'Insight: 10');
  assert.equal(label.children.length, 2);
  assert.equal(label.children[0].src, insightSpriteUrl);
  assert.equal(label.children[0].alt, '');
  assert.equal(label.children[1].textContent, 'Insight: 10');
  assert.ok(label.classList.has('insight-display'));
});

test('boss notification waits for dismissal and item receipts reset every field', async (t) => {
  installDom(t);
  const dialog = new Element();
  const fields = new Map();
  dialog.querySelector = (selector) => {
    if (!fields.has(selector)) fields.set(selector, new Element());
    return fields.get(selector);
  };
  const text = (id) => fields.get(`#item-popup-${id}`).textContent;
  const popup = createItemPopup(dialog);
  let dismissed = false;
  const notification = popup.showInsight('Bridge Captain', 5, 23).then(() => { dismissed = true; });
  assert.ok(popup.open);
  assert.equal(text('heading'), 'Insight Gained');
  assert.equal(text('recipient'), 'Bridge Captain defeated');
  assert.equal(text('name'), '+5 Insight');
  assert.equal(text('description'), 'Total Insight: 23');
  assert.equal(text('lore'), '');
  assert.equal(text('continue'), 'Continue');
  assert.equal(fields.get('#item-popup-icon').children[0].src, insightSpriteUrl);
  assert.ok(fields.get('#item-popup-continue').focused);
  await Promise.resolve();
  assert.equal(dismissed, false);
  fields.get('#item-popup-continue').dispatchEvent(new Event('click'));
  await notification;
  assert.equal(popup.open, false);
  assert.equal(dismissed, true);

  const item = { name: 'Javelin', might: 6, weight: 8, spriteUrl: '/javelin.png', lore: 'A throwing lance.' };
  const receipt = popup.show([{ unit: { name: 'Maria' }, item, toConvoy: true }]);
  assert.ok(popup.open);
  assert.equal(text('heading'), 'Sent to Convoy');
  assert.equal(text('recipient'), "Maria's inventory is full");
  assert.equal(text('name'), 'Javelin');
  assert.equal(text('description'), 'Might 6 · Weight 8');
  assert.equal(text('lore'), item.lore);
  assert.equal(text('continue'), 'Take');
  assert.equal(fields.get('#item-popup-icon').children[0].src, item.spriteUrl);
  dialog.close();
  await receipt;

  const next = popup.showInsight('Another Boss', 7, 30);
  assert.equal(text('lore'), '');
  assert.equal(text('description'), 'Total Insight: 30');
  assert.equal(text('continue'), 'Continue');
  dialog.close();
  await next;
});

test('ordinary item receipts still show sequentially, including items without sprites', async (t) => {
  installDom(t);
  const dialog = new Element();
  const fields = new Map();
  dialog.querySelector = (selector) => {
    if (!fields.has(selector)) fields.set(selector, new Element());
    return fields.get(selector);
  };
  const popup = createItemPopup(dialog);
  const receipts = popup.show([
    { unit: { name: 'Maria' }, item: { name: 'Potion', type: 'consumable', heal: 10, maxUses: 3 } },
    { unit: { name: 'Linus' }, item: { name: 'Keepsake', description: 'Read for Insight.' } },
  ]);
  assert.equal(fields.get('#item-popup-heading').textContent, 'Item Received');
  assert.equal(fields.get('#item-popup-description').textContent, 'Restores 10 HP · 3 uses');
  assert.equal(fields.get('#item-popup-icon').children.length, 0);
  dialog.close();
  await Promise.resolve();
  assert.ok(popup.open);
  assert.equal(fields.get('#item-popup-recipient').textContent, 'Linus');
  assert.equal(fields.get('#item-popup-name').textContent, 'Keepsake');
  assert.equal(fields.get('#item-popup-description').textContent, 'Read for Insight.');
  dialog.close();
  await receipts;
  assert.equal(popup.open, false);
});

test('reading any Insight item shows its own lore and reward until dismissed, resetting previous popup fields', async (t) => {
  installDom(t);
  const dialog = new Element(), fields = new Map();
  dialog.querySelector = (selector) => {
    if (!fields.has(selector)) fields.set(selector, new Element());
    return fields.get(selector);
  };
  const popup = createItemPopup(dialog);
  const text = (id) => fields.get(`#item-popup-${id}`).textContent;
  for (const item of [
    { name: 'Treatment Ledger', insight: 10, lore: 'Pulse absent. Movement resumed.', spriteUrl: '/ledger.svg' },
    { name: "Orsen's Journal", insight: 10, lore: 'Hold the road.' },
    { name: 'Keepsake', insight: 5, lore: 'A fading memory.' },
  ]) {
    let dismissed = false;
    const reading = popup.showRead(item, 25).then(() => { dismissed = true; });
    assert.ok(popup.open);
    assert.equal(text('heading'), 'Item Read');
    assert.equal(text('recipient'), `+${item.insight} Insight`);
    assert.equal(text('name'), item.name);
    assert.equal(text('description'), 'Total Insight: 25');
    assert.equal(text('lore'), item.lore);
    assert.equal(text('continue'), 'Continue');
    assert.equal(fields.get('#item-popup-icon').children.length, item.spriteUrl ? 1 : 0);
    await Promise.resolve();
    assert.equal(dismissed, false);
    fields.get('#item-popup-continue').dispatchEvent(new Event('click'));
    await reading;
    assert.equal(dismissed, true);
  }
});

test('Chapter 12 opens with one short story summary without reward locations, wave schedules or build advice', async () => {
  const { readFile } = await import('node:fs/promises');
  const script = JSON.parse(await readFile(new URL('../data/tutorials/chapter-12.json', import.meta.url), 'utf8'));
  assert.equal(script.infirmary.pages.length, 1);
  const text = script.infirmary.pages[0].paragraphs.join(' ');
  assert.ok(text.split(/\s+/).length <= 85);
  assert.match(text, /eight enemy phases/);
  assert.match(text, /Rictor, Lena and Arlan must survive/);
  assert.doesNotMatch(text, /Insight|Javelin|Saint's Ash|turn (three|five|six|seven)|growth|EXP|extract|emblem/i);
});
