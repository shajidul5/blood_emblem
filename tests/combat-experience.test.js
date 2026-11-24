import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { awardExperience } from '../src/characters/progression.js';

let server, combat;

before(async () => {
  server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: 'custom' });
  combat = await server.ssrLoadModule('/src/battle/combat.js');
});

after(async () => server?.close());

test('underleveled units receive uncapped catch-up EXP rather than stopping at 45', () => {
  const attacker = { level: 2 };
  const enemy = { level: 12, classId: 'soldier' };
  assert.equal(combat.getExperienceMultiplier(attacker, enemy), 2);
  assert.equal(combat.getCombatExperience(enemy, true, attacker), 60);
  assert.equal(combat.getCombatExperience(enemy, false, attacker), 20);
  assert.equal(combat.getCombatExperience({ ...enemy, level: 22 }, true, attacker), 90);
  let previous = 0;
  for (let level = 2; level <= 40; level++) {
    const reward = combat.getCombatExperience({ ...enemy, level }, true, attacker);
    assert.ok(reward > previous, `reward increases beyond the former five-level ceiling: level ${level}`);
    previous = reward;
  }
});

test('equal-level rewards, boss bonuses, promoted enemies and the low-level farming floor are preserved', () => {
  const attacker = { level: 12 };
  for (const [classId, isBoss, kill, surviving] of [
    ['soldier', false, 30, 10], ['soldier', true, 70, 10],
    ['paladin', false, 100, 15], ['paladin', true, 100, 15],
  ]) {
    const enemy = { level: 12, classId, isBoss };
    assert.equal(combat.getCombatExperience(enemy, true, attacker), kill);
    assert.equal(combat.getCombatExperience(enemy, false, attacker), surviving);
    assert.equal(combat.getCombatExperience(enemy, true, { level: 2 }), kill * 2);
  }
  const weaker = { level: 1, classId: 'soldier' };
  assert.equal(combat.getExperienceMultiplier({ level: 30 }, weaker), .1);
  assert.equal(combat.getCombatExperience(weaker, true, { level: 30 }), 3);
  assert.equal(combat.getCombatExperience(weaker, false, { level: 30 }), 1);
  assert.equal(combat.getExperienceMultiplier(undefined, weaker), 1);
  assert.equal(combat.getExperienceMultiplier(attacker, {}), 1);
});

test('large catch-up awards retain every point and process all crossed levels and growth rolls', () => {
  const unit = { level: 2, experience: 90, growthRates: {} };
  const reward = combat.getCombatExperience({ level: 17, classId: 'paladin', isBoss: true }, true, unit);
  assert.equal(reward, 250);
  const result = awardExperience(unit, reward);
  assert.equal(result.levelUps, 3);
  assert.equal(result.growthRolls.length, 3);
  assert.equal(unit.level, 5);
  assert.equal(unit.experience, 40);
});
