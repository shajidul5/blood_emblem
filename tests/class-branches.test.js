import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { battleSpriteKey, battleIdleKey, staffBattleKey, battleThrow, supportsStaffScene,
  supportsBattleScene } from '../src/battle/battle-animation.js';

let server, classes, characters, inventory, gallery;
const json = async (file) => JSON.parse(await readFile(new URL(`../${file}`, import.meta.url), 'utf8'));
const previousImage = Object.getOwnPropertyDescriptor(globalThis, 'Image');
before(async () => {
  globalThis.Image = class { set src(value) { queueMicrotask(() => this.onload()); } };
  server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: 'custom' });
  [classes, characters, inventory, gallery] = await Promise.all(
    ['characters/classes', 'characters/characters', 'characters/inventory', 'gallery/catalog']
      .map((file) => server.ssrLoadModule(`/src/${file}.js`)));
});
after(async () => {
  await server?.close();
  if (previousImage) Object.defineProperty(globalThis, 'Image', previousImage);
  else delete globalThis.Image;
});

test('Paladin unlocks D Axes for Linus and Troy, preserves higher ranks and repairs old promoted saves idempotently', () => {
  for (const factory of ['createLinusAlly', 'createTroyAlly']) {
    const unit = characters[factory]();
    const original = structuredClone(unit.weaponExp);
    unit.level = 20;
    classes.promoteUnit(unit);
    assert.equal(unit.classId, 'paladin');
    assert.equal(unit.weaponExp.Axe, 30);
    for (const type of ['Spear', 'Sword']) assert.equal(unit.weaponExp[type], original[type]);
    assert.ok(classes.canEquipWeapon(unit, inventory.INVENTORY_ITEMS.get('hand-axe')));
    const saved = structuredClone(unit);
    delete saved.weaponExp.Axe;
    classes.applyClass(saved, saved.classId);
    assert.deepEqual(saved, unit);
    const once = structuredClone(saved);
    classes.applyClass(saved, saved.classId);
    assert.deepEqual(saved, once);
    unit.weaponExp.Axe = 90;
    classes.applyClass(unit, 'paladin');
    assert.equal(unit.weaponExp.Axe, 90);
  }
});

test('Bloodsworn is Linus-specific, keeps swords and lances, and gains exactly two extra Defense and Resistance', () => {
  const normal = characters.createLinusAlly(), covenant = characters.createLinusAlly();
  normal.level = covenant.level = 20;
  const before = structuredClone(covenant);
  classes.promoteUnit(normal);
  classes.promoteUnit(covenant, 'covenant-emblem');
  for (const stat of ['defense', 'resistance']) {
    assert.equal(covenant[stat] - normal[stat], 2);
    assert.equal(covenant[stat] - before[stat], 4);
  }
  for (const stat of ['strength', 'speed', 'movement', 'maxHp']) assert.equal(covenant[stat], normal[stat]);
  assert.deepEqual(covenant.weaponExp, before.weaponExp);
  assert.deepEqual(classes.getClass('bloodsworn').weaponTypes, ['Spear', 'Sword']);
  assert.equal(classes.canEquipWeapon(covenant, inventory.INVENTORY_ITEMS.get('hand-axe')), false);
  assert.equal(classes.canEquipWeapon(covenant, inventory.INVENTORY_ITEMS.get('iron-sword')), true);
  assert.equal(classes.canPromote({ ...characters.createTroyAlly(), level: 20 }, 'covenant-emblem'), false);
  const once = structuredClone(covenant);
  classes.applyClass(covenant, 'bloodsworn');
  assert.deepEqual(covenant, once, 'loading a class never reapplies promotion stats');
  const profile = gallery.roster.find((entry) => entry.id === 'linus');
  const preview = gallery.unitFor(profile, 'bloodsworn');
  assert.equal(preview.defense, covenant.defense);
  assert.equal(preview.resistance, covenant.resistance);
  assert.deepEqual(profile.weaponExp, before.weaponExp, 'gallery never mutates profile ranks');
});

test('Dark Sage gains D Anima and Staff, retains Dark, and uses tome-specific effects without granting Shaman Anima', () => {
  const unit = characters.createCorvisAlly();
  const before = structuredClone(unit.weaponExp);
  const fire = inventory.INVENTORY_ITEMS.get('fire-tome');
  assert.equal(classes.canEquipWeapon(unit, fire), false);
  classes.promoteUnit(unit);
  assert.deepEqual(classes.getClass('dark-sage').weaponTypes, ['Dark', 'Staff', 'Anima']);
  assert.equal(unit.weaponExp.Anima, 30);
  assert.equal(unit.weaponExp.Staff, 30);
  assert.equal(unit.weaponExp.Dark, before.Dark);
  assert.ok(classes.canEquipWeapon(unit, fire));
  unit.weaponExp.Anima = 90;
  classes.applyClass(unit, 'dark-sage');
  assert.equal(unit.weaponExp.Anima, 90);
  delete unit.weaponExp.Anima;
  classes.applyClass(unit, 'dark-sage');
  assert.equal(unit.weaponExp.Anima, 30, 'older promoted saves gain the new minimum rank');
  for (const id of ['fire-tome', 'thunder-tome', 'wind-tome', 'inferno', 'bolting']) {
    const weapon = inventory.INVENTORY_ITEMS.get(id);
    assert.ok(weapon, id);
    assert.equal(battleSpriteKey({ ...unit, weapon }), 'corvis-dark-sage');
    assert.equal(battleSpriteKey({ ...unit, classId: 'shaman', weapon }), null);
  }
});

test('Eveline supports mounted staff scenes in both classes and promoted Anima without identity leakage', async () => {
  const target = { id: 'maria', classId: 'hunter', x: 10, z: 0, weapon: { type: 'Sword' } };
  for (const classId of ['troubadour', 'valkyrie']) {
    for (const id of ['heal-staff', 'mend', 'physic', 'freeze-staff', 'hold', 'stasis']) {
      const weapon = await json(`data/weapons/${id}.json`);
      const unit = { id: 'eveline', classId, x: 0, z: 0, weapon };
      assert.equal(staffBattleKey(unit, weapon), `eveline-${classId}`);
      assert.equal(battleIdleKey(unit), `eveline-${classId}`);
      assert.ok(supportsStaffScene(unit, target, weapon));
      assert.ok(supportsBattleScene({ ...target, x: 1 }, unit));
      assert.equal(staffBattleKey({ ...unit, id: 'someone-else' }, weapon), null);
      assert.equal(battleSpriteKey(unit), null);
    }
  }
  const weapon = await json('data/weapons/fire-tome.json');
  assert.equal(battleSpriteKey({ id: 'eveline', classId: 'valkyrie', weapon }), 'eveline-valkyrie');
  assert.equal(battleSpriteKey({ id: 'eveline', classId: 'troubadour', weapon }), null);
  const axe = { id: 'linus', classId: 'paladin', weapon: await json('data/weapons/hand-axe.json') };
  assert.equal(battleSpriteKey(axe), 'linus-paladin-axe');
  assert.equal(battleThrow(axe, 2).key, 'thrown-axe');
  assert.equal(battleSpriteKey({ ...axe, classId: 'bloodsworn' }), null);
  assert.equal(battleSpriteKey({ ...axe, classId: 'bloodsworn', weapon: { type: 'Sword' } }), 'linus-bloodsworn-sword');
});

test('compendium link is available in shared title and in-game Options without navigating away or touching saves', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const dialog = html.slice(html.indexOf('<dialog id="options-dialog"'), html.indexOf('<dialog id="save-slots-dialog"'));
  assert.match(dialog, /<a id="open-compendium" href="\.\/character-gallery\.html" target="_blank" rel="noopener noreferrer"/);
  assert.match(dialog, /Character Compendium \(opens in a new tab\)/);
  const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  for (const name of ['openTitleOptions', 'openOptionsMenu']) {
    const code = main.slice(main.indexOf(`function ${name}()`), main.indexOf('\n}', main.indexOf(`function ${name}()`)) + 2);
    assert.doesNotMatch(code, /open-compendium/);
    assert.match(code, /optionsDialog\.showModal\(\)/);
  }
});
