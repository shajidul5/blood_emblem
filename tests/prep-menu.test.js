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

  test('Orders Emblems promote from convoy and carried inventory without spending battle actions', async (t) => {
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
    globalThis.document = { createElement: (tag) => new Element(tag) };
    t.after(() => {
      if (previous) Object.defineProperty(globalThis, 'document', previous);
      else delete globalThis.document;
    });
    const characters = await server.ssrLoadModule('/src/characters/characters.js');
    const inventory = await server.ssrLoadModule('/src/characters/inventory.js');
    for (const source of ['convoy', 'carried']) {
      const unit = characters.createCypherAlly();
      unit.level = 20;
      unit.inventory = inventory.createInventory(['fire-tome', 'potion', 'potion', 'potion', 'potion']);
      const emblem = { id: 'master-emblem', uses: 1 };
      const convoy = source === 'convoy' ? [emblem, { id: 'potion', uses: 3 }] : [];
      if (source === 'carried') unit.inventory[4] = emblem;
      const dialog = new Element('dialog');
      let changes = 0, promotions = 0, before;
      const menu = createPrepMenu({
        dialog, getTeam: () => [unit], getConvoy: () => convoy, items: inventory.INVENTORY_ITEMS,
        statItems: {}, maxSize: 5, maxDeployed: 12, isDeployed: () => true,
        portrait: () => 'portrait', settle: () => '', getInfo: () => ({ chapter: 'Test', objective: 'Test' }),
        onChange() { changes++; menu.refresh(); },
        onPromote(promoted, snapshot) { promotions++; assert.equal(promoted, unit); before = snapshot; },
      });
      const click = (label) => {
        const node = dialog.all().find((node) => node.tag === 'button' && !node.disabled &&
          node.all().map((child) => child.textContent).join('') === label);
        assert.ok(node, `missing ${label} (${source})`);
        node.dispatchEvent(new Event('click'));
        return node;
      };
      const closed = menu.show();
      click('Inventory');
      dialog.all().find((node) => node.className === 'prep-card').dispatchEvent(new Event('click'));
      click(source === 'convoy' ? 'Convoy' : 'Use Item');
      const action = click('Use');
      assert.equal(unit.classId, 'sage');
      assert.equal(unit.spriteSet, 'sageCypher');
      assert.equal(unit.inventory[0].uses, inventory.INVENTORY_ITEMS.get('fire-tome').maxUses * 2);
      assert.equal(unit.weaponExp.Staff, 30);
      assert.equal(unit.acted, false);
      assert.equal(unit.moved, false);
      assert.equal(unit.inventory.length, source === 'convoy' ? 5 : 4);
      assert.ok(!(source === 'convoy' ? convoy : unit.inventory).includes(emblem));
      assert.equal(changes, 1);
      assert.equal(promotions, 1);
      assert.equal(before.className, 'Mage');
      action.dispatchEvent(new Event('click'));
      assert.equal(changes, 1, 'stale Use cannot consume another emblem or repeat bonuses');
      dialog.close();
      await closed;
    }
  });

  test('Preparation emblems explain level and class restrictions without consuming items', async (t) => {
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
    globalThis.document = { createElement: (tag) => new Element(tag) };
    t.after(() => {
      if (previous) Object.defineProperty(globalThis, 'document', previous);
      else delete globalThis.document;
    });
    for (const [classId, level, label] of [['mage', 19, 'Needs level 20'], ['sage', 20, 'Already promoted']]) {
      const unit = { id: 'cypher', name: 'Cypher', classId, level, inventory: [], hp: 20, maxHp: 20 };
      const convoy = [{ id: 'master-emblem', uses: 1 }];
      const dialog = new Element('dialog');
      const menu = createPrepMenu({
        dialog, getTeam: () => [unit], getConvoy: () => convoy,
        items: new Map([['master-emblem', { name: 'Orders Emblem', itemType: 'consumable', effect: 'promote' }]]),
        statItems: {}, maxSize: 5, maxDeployed: 12, isDeployed: () => true, portrait: () => null,
        getInfo: () => ({ chapter: 'Test', objective: 'Test' }),
      });
      const closed = menu.show();
      const click = (text) => dialog.all().find((node) => node.tag === 'button' &&
        node.textContent === text).dispatchEvent(new Event('click'));
      click('Inventory');
      dialog.all().find((node) => node.className === 'prep-card').dispatchEvent(new Event('click'));
      click('Convoy');
      assert.equal(dialog.all().find((node) => node.textContent === label).disabled, true);
      assert.equal(convoy[0].uses, 1);
      dialog.close();
      await closed;
    }
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
