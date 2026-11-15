import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';

let server, characters, combat;
const stats = ['hp', 'strength', 'magic', 'dexterity', 'speed', 'luck', 'defense', 'resistance'];
const merfolk = new Set(['merfolk', 'merfolk-boss', 'merfolk-chieftain', 'deep-merfolk', 'killian']);

before(async () => {
  server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: 'custom' });
  [characters, combat] = await Promise.all([
    server.ssrLoadModule('/src/characters/characters.js'), server.ssrLoadModule('/src/battle/combat.js'),
  ]);
});
after(async () => { await server?.close(); });

test('every Chapter 6+ enemy gains ten combat-growth points and retroactive stats except all Merfolk variants', () => {
  for (const id of characters.ENEMY_IDS) {
    const base = characters.createEnemyUnit(id, 0, 0);
    for (const level of [base.level, base.level + 10]) {
      const early = characters.createEnemyUnit(id, 0, 0, { chapter: 4, level });
      for (const chapter of [5, 6, 9, 18]) {
        const late = characters.createEnemyUnit(id, 0, 0, { chapter, level });
        const bonus = merfolk.has(id) ? 0 : Math.round((level - 1) * 0.1);
        for (const stat of stats) {
          assert.equal(late[stat], early[stat] + bonus, `${id} chapter ${chapter + 1} level ${level} ${stat}`);
          assert.equal(late.growthRates[stat], early.growthRates[stat] + (merfolk.has(id) ? 0 : 10), `${id} ${stat} growth`);
        }
        assert.equal(late.maxHp, early.maxHp + bonus);
        for (const stat of ['movement', 'build']) {
          assert.equal(late[stat], early[stat], `${id} ${stat}`);
          assert.equal(late.growthRates[stat], early.growthRates[stat]);
        }
        assert.equal(late.level, level);
        assert.equal(late.ai, early.ai);
        assert.equal(late.weapon.id, early.weapon.id);
      }
    }
    assert.deepEqual(characters.createEnemyUnit(id, 0, 0), base, `${id}: profiles are never mutated`);
    assert.deepEqual(characters.createEnemyUnit(id, 0, 0, { chapter: null }), base);
  }
});

test('Chapter 6 wolves gain stats even at authored base level and later levels gain more, without compounding', () => {
  for (const [level, bonus] of [[16, 2], [20, 2], [30, 3]]) {
    const old = characters.createEnemyUnit('feral-wolf', 0, 0, { level, chapter: 4 });
    const first = characters.createEnemyUnit('feral-wolf', 0, 0, { level, chapter: 5 });
    const restored = characters.createEnemyUnit(first.id, first.x, first.z, { ...first, chapter: 5 });
    assert.equal(first.strength, old.strength + bonus);
    assert.equal(first.dexterity, old.dexterity + bonus);
    assert.equal(restored.strength, first.strength);
    assert.equal(restored.maxHp, first.maxHp);
    assert.deepEqual(restored.growthRates, first.growthRates);
  }
});

test('physical and magical enemies actually deal more damage and have higher hit rates', () => {
  const defender = { ...characters.createMaria(), defense: 5, resistance: 5, speed: 24, luck: 10 };
  for (const id of ['order-cavalier', 'golden-mage']) {
    const old = characters.createEnemyUnit(id, 0, 0, { level: 20, chapter: 4 });
    const late = characters.createEnemyUnit(id, 0, 0, { level: 20, chapter: 5 });
    assert.equal(combat.getCombatDamage(late, defender), combat.getCombatDamage(old, defender) + 2, id);
    assert.equal(combat.getHitRate(late, defender), combat.getHitRate(old, defender) + 5, id);
  }
});

test('retroactive growth rounds predictably at each five-level threshold', () => {
  for (const [level, bonus] of [[5, 0], [6, 1], [15, 1], [16, 2], [25, 2], [26, 3]]) {
    const early = characters.createEnemyUnit('raider', 0, 0, { chapter: 4, level });
    const late = characters.createEnemyUnit('raider', 0, 0, { chapter: 5, level });
    for (const stat of stats) assert.equal(late[stat] - early[stat], bonus, `level ${level} ${stat}`);
  }
});

test('enemy creation passes the active chapter for initial spawns, reinforcements, special spawns and restores', async () => {
  const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(main, /createEnemyUnit\(id, tileX, tileZ, \{ \.\.\.options, chapter: currentChapter \}\)/);
  assert.match(main, /currentChapter = save.chapter;[\s\S]*enemies = save.enemies.map/);
  assert.match(main, /currentChapter = chapter;[\s\S]*resetEnemies\(\)/);
  const generator = await readFile(new URL('../scripts/create-chapter16-save.mjs', import.meta.url), 'utf8');
  assert.match(generator, /createEnemyUnit\(entry.id, entry.x, entry.z, \{ \.\.\.entry, chapter: 15 \}\)/);
});

test('ally growths and stats remain authored, including former enemy Bartz', async () => {
  for (const [create, id] of [
    ['createMaria', 'maria'], ['createBartzAlly', 'bartz'], ['createLinusAlly', 'linus'],
  ]) {
    const profile = JSON.parse(await readFile(new URL(`../data/characters/${id}.json`, import.meta.url), 'utf8'));
    const ally = characters[create]();
    assert.deepEqual(ally.growthRates, profile.growthRates);
    for (const stat of stats) assert.equal(ally[stat], profile.currentStats[stat]);
  }
});
