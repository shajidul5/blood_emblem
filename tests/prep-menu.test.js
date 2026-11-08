import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

let server, createPrepMenu;
class Element extends EventTarget {
  constructor(tag) {
    super();
    this.tag = tag;
    this.children = [];
    this.classList = new Set();
    this.open = false;
    this.textContent = '';
  }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute() {}
  focus() {}
  showModal() { this.open = true; }
  close() { this.open = false; this.dispatchEvent(new Event('close')); }
  querySelector() { return this.all().find((node) => node.tag === 'button' && !node.disabled); }
  all() { return [this, ...this.children.flatMap((node) => node.all())]; }
}

before(async () => {
  server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: 'custom' });
  ({ createPrepMenu } = await server.ssrLoadModule('/src/game/prep-menu.js'));
});
after(async () => { await server?.close(); });

test('universal preparation Back matches button and Escape navigation in every subview', async (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  globalThis.document = { createElement: (tag) => new Element(tag) };
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else delete globalThis.document;
  });
  const dialog = new Element('dialog');
  const team = ['rictor', 'lena'].map((id) => ({
    id, name: id, inventory: [{ id: 'potion', uses: 3 }], hp: 10, maxHp: 20,
  }));
  const menu = createPrepMenu({
    dialog, getTeam: () => team, getConvoy: () => [],
    items: new Map([['potion', { id: 'potion', name: 'Potion', itemType: 'consumable', heal: 10 }]]),
    statItems: {}, maxSize: 5, maxDeployed: 12, isDeployed: () => true,
    isRequired: () => false, portrait: () => null, settle: () => '',
    getInfo: () => ({ chapter: 'Test', objective: 'Test' }), onChange() {},
    onViewMap() {}, onSave() {}, onProfile() {}, onOptions() {}, setDeployed() {},
  });
  const click = (label) => {
    const button = dialog.all().find((node) => node.tag === 'button' &&
      node.all().map((child) => child.textContent).join('') === label);
    assert.ok(button, `missing ${label}`);
    button.dispatchEvent(new Event('click'));
  };
  const title = () => dialog.all().find((node) => node.tag === 'h2').textContent;
  assert.equal(menu.back(), false, 'closed preparations do not consume Back');
  const closed = menu.show();
  for (const label of ['Unit Select (2/12)', 'Insight (0)', 'Inventory']) {
    click(label);
    assert.equal(menu.back(), true);
    assert.equal(title(), 'Preparations');
  }
  click('Inventory');
  const selectUnit = () => dialog.all().find((node) => node.className === 'prep-card')
    .dispatchEvent(new Event('click'));
  selectUnit();
  click('Use Item');
  assert.equal(menu.back(), true);
  assert.equal(title(), 'Inventory');
  click('Convoy');
  menu.back();
  click('Trade');
  selectUnit();
  assert.equal(title(), 'Trade');
  click('Swap');
  assert.ok(dialog.all().some((node) => node.textContent.includes('Pick the item to swap')));
  menu.back();
  assert.ok(dialog.all().some((node) => node.textContent.includes('items with whom?')));
  assert.ok(!dialog.all().some((node) => node.textContent.includes('Pick the item to swap')));
  const cancel = new Event('cancel', { cancelable: true });
  dialog.dispatchEvent(cancel);
  assert.equal(cancel.defaultPrevented, true);
  assert.equal(title(), 'Inventory');
  click('Back');
  assert.equal(title(), 'Inventory');
  menu.back();
  assert.equal(title(), 'Preparations');
  assert.equal(menu.back(), true);
  assert.equal(dialog.open, true, 'Back at hub does not start battle or close preparation');
  click('View Map');
  assert.equal(menu.back(), false);
  menu.resume();
  assert.equal(dialog.open, true);
  assert.equal(title(), 'Preparations');
  dialog.close();
  await closed;
});
