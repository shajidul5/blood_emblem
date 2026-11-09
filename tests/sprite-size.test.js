import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unitSpriteScale } from '../src/characters/sprite-size.js';

const sprite = (ratio) => ({ userData: { idleHeightRatio: ratio } });

test('Infantry and armored sprites share visible height despite padding, promotions and saved scales', () => {
  for (const type of ['infantry', 'armor']) {
    for (const ratio of [0.2, 0.4, 0.65, 0.85, 1]) {
      for (const scale of [undefined, 0.85, 1.2, 1.25]) {
        const unit = { id: 'seymour', type, scale };
        assert.ok(Math.abs(unitSpriteScale(unit, sprite(ratio)) * ratio - 0.85) < 1e-10);
      }
    }
  }
});

test('Mounted units stay twenty percent larger and monsters retain their authored scales', () => {
  const infantry = unitSpriteScale({ id: 'seymour', type: 'infantry' }, sprite(0.5));
  const rider = unitSpriteScale({ id: 'rictor', type: 'cavalry', scale: 1.2 }, sprite(0.5));
  assert.equal(rider / infantry, 1.2);
  for (const [type, scale] of [['beast', 2.1], ['undead', 1.25], ['flying', 0.9]]) {
    assert.equal(unitSpriteScale({ type, scale }, sprite(0.2)), scale);
  }
});

test('Animation frames use their set idle proportions rather than changing scale on each attack pose', () => {
  const unit = { id: 'seymour', type: 'infantry' };
  const idle = { ...sprite(0.4), image: { height: 100 } };
  const attack = { ...sprite(0.2), image: { height: 200 } };
  const idleScale = unitSpriteScale(unit, idle);
  const attackScale = unitSpriteScale(unit, attack);
  assert.equal(idleScale * 40 / idle.image.height, attackScale * 40 / attack.image.height,
    'larger attack canvases do not shrink the character');
  assert.equal(attackScale * 60 / attack.image.height / (attackScale * 40 / attack.image.height), 1.5,
    'a raised staff retains its larger pose instead of being squeezed to idle height');
  assert.throws(() => unitSpriteScale(unit, sprite(0)), /Missing sprite height for seymour/);
  assert.throws(() => unitSpriteScale(unit, sprite(undefined)), /Missing sprite height for seymour/);
});
