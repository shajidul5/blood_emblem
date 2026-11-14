import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { drawHpDigits } from '../src/battle/hp-digits.js';
import {
  animationFrameAt, battleBackdrop, battleSpriteKey, battleThrow, COMBAT_ANIMATIONS_KEY, createImpactGate,
  battleHpSegments, battleImpactShake, displayedBattleHp, flurryPose, flurryTimeline,
  readCombatAnimations, strikePose, supportsBattleScene, THROWING_FIGHTERS, writeCombatAnimations,
} from '../src/battle/battle-animation.js';
import { thrownEffectFor } from '../src/battle/spell-animation.js';

const art = JSON.parse(await readFile(new URL('../assets/battle/manifest.json', import.meta.url), 'utf8'));
const maria = () => ({ id: 'maria', classId: 'hunter', x: 0, z: 0, weapon: { id: 'rapier', type: 'Sword' } });
const raider = () => ({ id: 'raider', classId: 'raider', spriteSet: 'raider', x: 1, z: 0, weapon: { type: 'Axe' } });
const bartz = () => ({ id: 'bartz', classId: 'pirate', x: 1, z: 0, weapon: { type: 'Axe' } });
const deepMerfolk = () => ({ id: 'deep-merfolk', classId: 'deep-merfolk', spriteSet: 'killian',
  x: 1, z: 0, weapon: { id: 'tentacle', type: 'Axe', minRange: 1, maxRange: 2 } });

test('generic combat art covers every matching roster profile without leaking to other classes or weapons', async () => {
  const families = {
    genericArcher: ['archer', 'Bow', 'generic-archer'],
    genericKnight: ['knight', 'Spear', 'generic-knight'],
    genericCavalier: ['cavalier', 'Spear', 'generic-cavalier'],
    genericSoldier: ['soldier', 'Spear', 'generic-soldier'],
  };
  const covered = new Set();
  const directory = new URL('../data/characters/', import.meta.url);
  for (const file of await readdir(directory)) {
    if (!file.endsWith('.json')) continue;
    const profile = JSON.parse(await readFile(new URL(file, directory), 'utf8'));
    const family = families[profile.spriteSet];
    if (!family) continue;
    const [classId, type, key] = family;
    assert.ok([classId, ...(profile.spriteSet === 'genericKnight' ? ['general'] : [])].includes(profile.classId), file);
    const unit = { ...profile, x: 0, z: 0, weapon: { type, maxRange: type === 'Bow' ? 2 : 1 } };
    assert.equal(battleSpriteKey(unit), key, file);
    assert.ok(art.fighters[key], file);
    assert.ok(supportsBattleScene(unit, { ...maria(), x: type === 'Bow' ? 2 : 1 }), file);
    assert.equal(battleSpriteKey({ ...unit, weapon: { type: 'Axe' } }), null, file);
    assert.equal(battleSpriteKey({ ...unit, classId: 'mage' }), null, file);
    assert.equal(battleSpriteKey({ ...unit, spriteSet: 'genericUndead' }), null, file);
    covered.add(profile.spriteSet);
  }
  assert.equal(covered.size, 4);
  assert.equal(art.fighters['generic-archer'].casting, true);
});

test('generic lance users thrust adjacent and throw javelins at range 2', () => {
  for (const [spriteSet, classId, key] of [
    ['genericKnight', 'knight', 'generic-knight'], ['genericKnight', 'general', 'generic-knight'],
    ['genericCavalier', 'cavalier', 'generic-cavalier'], ['genericSoldier', 'soldier', 'generic-soldier'],
  ]) {
    const unit = { id: 'generic-test', spriteSet, classId, x: 0, z: 0,
      weapon: { id: 'javelin', type: 'Spear', minRange: 1, maxRange: 2 } };
    assert.equal(battleThrow(unit, 1), null);
    assert.equal(battleThrow(unit, 2)?.key, 'thrown-spear');
    assert.ok(THROWING_FIGHTERS.has(key) && art.fighters[key].thrown);
    assert.ok(supportsBattleScene(unit, { ...maria(), x: 2 }));
    assert.ok(supportsBattleScene({ ...maria(), x: 2 }, unit));
    assert.equal(battleThrow({ ...unit, weapon: { type: 'Spear', maxRange: 1 } }, 2), null);
    assert.equal(supportsBattleScene(unit, { ...maria(), x: 3 }), false);
  }
});

test('generic cavalry select sword art independently of lance art and never throw swords', () => {
  const unit = { id: 'order-cavalier', spriteSet: 'genericCavalier', classId: 'cavalier', x: 0, z: 0 };
  for (const id of ['iron-sword', 'steel-sword', 'silver-sword', 'killing-edge', 'armorslayer']) {
    const sword = { ...unit, weapon: { id, type: 'Sword', minRange: 1, maxRange: 1 } };
    assert.equal(battleSpriteKey(sword), 'generic-cavalier-sword', id);
    assert.ok(supportsBattleScene(sword, { ...maria(), x: 1 }));
    assert.equal(supportsBattleScene(sword, { ...maria(), x: 2 }), false);
    assert.equal(battleThrow(sword, 2), null);
    assert.equal(battleSpriteKey({ ...sword, classId: 'paladin' }), null);
    assert.equal(battleSpriteKey({ ...sword, spriteSet: 'rictor' }), null);
  }
  assert.equal(battleSpriteKey({ ...unit, weapon: { type: 'Spear' } }), 'generic-cavalier');
  assert.equal(battleSpriteKey({ ...unit, weapon: { type: 'Axe' } }), null);
  const sword = art.fighters['generic-cavalier-sword'];
  assert.ok(sword);
  assert.equal(sword.thrown, undefined);
  assert.notEqual(sword.idle, art.fighters['generic-cavalier'].idle);
  assert.equal(sword.scale, art.fighters['generic-cavalier'].scale);
});

test('battle art is explicitly scoped to base Maria, Bartz and axe Raiders', () => {
  assert.equal(battleSpriteKey(maria()), 'maria-hunter');
  assert.equal(battleSpriteKey(bartz()), 'bartz-pirate');
  assert.equal(battleSpriteKey(raider()), 'raider');
  assert.ok(supportsBattleScene(maria(), bartz()));
  assert.ok(supportsBattleScene(raider(), maria()));
  assert.equal(battleSpriteKey({ ...maria(), classId: 'ravager' }), 'maria-ravager');
  for (const id of ['hunter-pistol', 'evelynn'])
    assert.equal(battleSpriteKey({ ...maria(), classId: 'ravager', weapon: { id, type: 'Gun' } }), 'maria-ravager-gun');
  assert.equal(battleSpriteKey({ ...bartz(), classId: 'berserker' }), 'bartz-berserker');
  assert.equal(battleSpriteKey({ ...bartz(), classId: 'berserker', weapon: { id: 'iron-sword', type: 'Sword' } }), null);
  for (const id of ['iron-sword', 'lancereaver', 'steel-sword'])
    assert.equal(battleSpriteKey({ ...maria(), weapon: { id, type: 'Sword' } }), 'maria-hunter', `Maria uses her art with ${id}`);
  for (const id of ['hand-axe', 'iron-axe', 'zanbato'])
    assert.equal(battleSpriteKey({ ...bartz(), weapon: { id, type: 'Axe' } }), 'bartz-pirate', `Bartz uses his art with ${id}`);
  assert.equal(battleSpriteKey({ ...maria(), weapon: { id: 'hunter-pistol', type: 'Gun' } }), null);
  assert.equal(battleSpriteKey({ ...raider(), weapon: { type: 'Gun' } }), null);
  assert.equal(battleSpriteKey({ ...raider(), spriteSet: 'genericUndead' }), null);
  assert.equal(battleSpriteKey({ ...maria(), weapon: null }), null);
  assert.equal(supportsBattleScene(maria(), { ...raider(), x: 2 }), false);
  assert.equal(supportsBattleScene(maria(), { ...raider(), z: 1 }), false);
  assert.equal(supportsBattleScene(maria(), { ...raider(), classId: 'mage' }), false);
});

test('Deep Merfolk use their own tentacle battle art at both authored ranges', () => {
  const deep = deepMerfolk();
  assert.equal(battleSpriteKey(deep), 'deep-merfolk');
  for (const distance of [1, 2]) {
    const enemy = { ...deep, x: distance };
    assert.ok(supportsBattleScene(maria(), enemy));
    assert.ok(supportsBattleScene(enemy, maria()));
    assert.ok(supportsBattleScene({ ...deep, x: 0 }, enemy));
  }
  assert.equal(supportsBattleScene(maria(), { ...deep, x: 3 }), false);
  assert.equal(supportsBattleScene(maria(), { ...deep, x: 0 }), false);
  const killian = { ...deep, id: 'killian', isBoss: true, x: 1 };
  assert.equal(battleSpriteKey(killian), 'deep-merfolk', 'Killian fights with the Deep Merfolk battle art');
  assert.ok(supportsBattleScene(maria(), killian), 'Maria versus Killian plays the battle scene');
  assert.equal(battleSpriteKey({ ...killian, id: 'other-boss' }), null);
  assert.equal(battleSpriteKey({ ...deep, classId: 'merfolk' }), null);
  assert.equal(battleSpriteKey({ ...deep, spriteSet: 'merfolk' }), null);
  assert.equal(battleSpriteKey({ ...deep, weapon: { id: 'iron-spear', type: 'Spear' } }), null);
  assert.ok(supportsBattleScene({ ...bartz(), x: 0,
    weapon: { id: 'hand-axe', type: 'Axe', maxRange: 2 } }, { ...deep, x: 2 }), 'Bartz throws his axe at range 2');
  assert.equal(supportsBattleScene({ ...raider(), x: 0,
    weapon: { id: 'hand-axe', type: 'Axe', maxRange: 2 } }, { ...deep, x: 2 }), false);
});

test('Stark, the wolves and Liam use their own battle art, and bows fight at range 2', () => {
  const stark = { id: 'stark', classId: 'archer', x: 0, z: 0,
    weapon: { id: 'hunter-bow', type: 'Bow', minRange: 2, maxRange: 2 } };
  const wolf = { id: 'feral-wolf', classId: 'wolf', spriteSet: 'feralWolf', x: 2, z: 0,
    weapon: { id: 'wolf-claws', type: 'Claw', minRange: 1, maxRange: 1 } };
  const liam = { id: 'liam', classId: 'wolfman', spriteSet: 'liam', x: 1, z: 0,
    weapon: { id: 'hunters-hatchet', type: 'Axe', minRange: 1, maxRange: 1 } };
  assert.equal(battleSpriteKey(stark), 'stark-archer');
  for (const id of ['iron-bow', 'killer-bow'])
    assert.equal(battleSpriteKey({ ...stark, weapon: { id, type: 'Bow' } }), 'stark-archer');
  assert.equal(battleSpriteKey({ ...stark, classId: 'sniper' }), 'stark-sniper');
  assert.equal(battleSpriteKey({ ...stark, classId: 'mage' }), null);
  assert.equal(battleSpriteKey(wolf), 'feral-wolf');
  assert.equal(battleSpriteKey({ ...wolf, id: 'great-wolf', isBoss: true }), 'great-wolf');
  assert.equal(battleSpriteKey({ ...wolf, id: 'shadow-wolf' }), null);
  assert.equal(battleSpriteKey(liam), 'liam');
  assert.equal(battleSpriteKey({ ...liam, weapon: { id: 'claws', type: 'Claw' } }), null);
  assert.equal(battleSpriteKey({ ...liam, id: 'wolfman' }), null);
  for (const key of ['stark-archer', 'stark-sniper', 'feral-wolf', 'great-wolf', 'liam']) assert.ok(art.fighters[key], key);
  assert.ok(art.fighters['stark-archer'].casting && art.fighters['stark-sniper'].casting, 'archers shoot without lunging');

  assert.ok(supportsBattleScene(stark, wolf), 'Stark shoots a wolf two tiles away');
  assert.ok(supportsBattleScene(wolf, stark), 'a wolf at range 2 cannot counter but the scene still plays');
  assert.ok(supportsBattleScene({ ...wolf, x: 1 }, stark), 'a wolf bites Stark up close');
  assert.ok(supportsBattleScene(liam, maria()));
  assert.equal(supportsBattleScene(stark, { ...wolf, x: 3 }), false);
  assert.equal(supportsBattleScene(stark, { ...wolf, weapon: { ...wolf.weapon, maxRange: 2 } }), false);

  assert.equal(battleBackdrop(0), 'ship');
  assert.equal(battleBackdrop(1), 'ship');
  assert.equal(battleBackdrop(4), 'coast');
  for (const chapter of [5, 6, 7, 8]) assert.equal(battleBackdrop(chapter), 'forest', `Chapter ${chapter + 1}`);
  assert.equal(battleBackdrop(9), 'coast');
  assert.equal(art.backgrounds.forest, 'forest.png');
});

test('Bartz throws his axe at range 2 with dedicated clips; future range-2 spears share the logic', async () => {
  const handAxe = { id: 'hand-axe', type: 'Axe', minRange: 1, maxRange: 2 };
  const thrower = { ...bartz(), x: 0, weapon: handAxe };
  assert.equal(battleThrow(thrower, 2)?.key, 'thrown-axe');
  assert.equal(battleThrow(thrower, 1), null, 'adjacent attacks keep the melee swing');
  assert.equal(battleThrow({ ...thrower, weapon: { id: 'iron-axe', type: 'Axe', maxRange: 1 } }, 2), null);
  assert.equal(battleThrow({ ...raider(), weapon: handAxe }, 2), null, 'only fighters with thrown clips throw');
  assert.equal(thrownEffectFor({ id: 'javelin', type: 'Spear', maxRange: 2 })?.key, 'thrown-spear');
  assert.equal(thrownEffectFor({ id: 'iron-spear', type: 'Spear', maxRange: 1 }), null);
  assert.ok(supportsBattleScene(thrower, { ...maria(), x: 2 }), 'Bartz throws at a swordswoman two tiles away');
  assert.ok(supportsBattleScene({ ...maria(), x: 2 }, thrower), 'and the scene plays when she starts it');
  assert.equal(supportsBattleScene({ ...thrower, weapon: { id: 'iron-axe', type: 'Axe', maxRange: 1 } },
    { ...maria(), x: 2 }), false);
  assert.equal(supportsBattleScene({ ...raider(), x: 0, weapon: handAxe }, { ...maria(), x: 2 }), false);

  for (const key of THROWING_FIGHTERS) {
    const fighter = art.fighters[key];
    assert.ok(fighter.thrown, `${key} has thrown clips`);
    const { attack, critical } = fighter.thrown;
    assert.ok(critical.frames > attack.frames && critical.impactFrame > attack.impactFrame);
    assert.notEqual(attack.job, critical.job);
    for (const clip of [attack, critical]) {
      assert.equal(clip.advance, 0, 'throws stay planted');
      assert.ok(clip.impactFrame > 0 && clip.catchFrame > clip.impactFrame && clip.catchFrame < clip.frames);
      const data = await readFile(new URL(`../assets/battle/${clip.file}`, import.meta.url));
      assert.equal(data.readUInt32BE(16), fighter.size * clip.frames);
      assert.equal(data.readUInt32BE(20), fighter.size);
    }
  }
});

test('Berserker Bartz leaps off the ground for his critical slam and lands before contact', () => {
  const { attack, critical } = art.fighters['bartz-berserker'];
  assert.equal(attack.leap, undefined);
  for (let ms = 0; ms < attack.frames * attack.frameMs; ms += 10) assert.equal(strikePose(attack, ms).lift, 0);
  const { from, to, height } = critical.leap;
  assert.ok(from < to && to <= critical.impactFrame && height > 0);
  const peak = strikePose(critical, (from + to) / 2 * critical.frameMs);
  assert.equal(peak.lift, -height);
  assert.ok(peak.offset > 0 && peak.offset < critical.advance, 'he pounces forward through the air');
  assert.equal(strikePose(critical, from * critical.frameMs).lift, 0);
  assert.equal(strikePose(critical, critical.impactFrame * critical.frameMs).lift, 0, 'the slam lands on the ground');
});

test('Ravager Maria critical strikes from the front, behind and above, then returns home', () => {
  const fighter = art.fighters['maria-ravager'];
  for (const [home, target, direction] of [[130, 350, 1], [350, 130, -1]]) {
    const timeline = flurryTimeline(fighter, { home, target, direction });
    const at = (ms) => flurryPose(fighter, timeline, ms);
    const [front, back] = timeline.flourishes;
    assert.ok(front < back && back < timeline.impact && timeline.impact < timeline.duration);
    assert.equal(at(0).x, home);
    assert.ok(at(0).ghosts.length === 0 || at(0).ghosts.every((ghost) => ghost.x === home));
    assert.deepEqual([at(front).clip, at(front).facing, at(front).x], ['critical', 1, home + direction * fighter.critical.advance]);
    assert.equal(at(front).frame, fighter.critical.impactFrame);
    assert.equal(at(front).flourish.index, 0);
    assert.deepEqual([at(back).clip, at(back).facing, at(back).frame], ['back', -1, fighter.flurry.back.impactFrame]);
    assert.equal(Math.sign(at(back).x - target), direction, 'the backhand comes from the far side');
    assert.equal(at(back).flourish.index, 1);
    const plungeStart = timeline.phases[4].start;
    assert.equal(at(plungeStart).lift, -fighter.flurry.lift, 'the cleave starts above the foe');
    assert.equal(at(timeline.impact - 1).contact, false);
    assert.equal(at(timeline.impact).contact, true);
    assert.equal(at(timeline.impact).lift, 0);
    assert.equal(at(timeline.impact).frame, fighter.flurry.plunge.impactFrame);
    assert.equal(at(timeline.impact).flourish, null);
    assert.ok(at(timeline.phases[1].start + 60).ghosts.length > 0, 'blinks leave afterimages');
    assert.equal(at(timeline.duration - 1).done, false);
    assert.deepEqual([at(timeline.duration).x, at(timeline.duration).clip, at(timeline.duration).done], [home, null, true]);
    for (let ms = 0; ms <= timeline.duration; ms += 10) {
      const pose = at(ms);
      if (pose.clip) assert.ok(pose.frame >= 0 && pose.frame < fighter.flurry[pose.clip]?.frames ||
        pose.clip === 'critical' && pose.frame <= fighter.flurry.frontEnd, `${ms}ms frame`);
      assert.ok(pose.x > 40 && pose.x < 440, `${ms}ms stays on screen`);
    }
  }
});

test('preference defaults on, persists off/on and never writes a save key', () => {
  const values = new Map([['blood-emblem-save', 'untouched']]);
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  assert.equal(readCombatAnimations(storage), true);
  assert.equal(writeCombatAnimations(storage, false), true);
  assert.equal(values.get(COMBAT_ANIMATIONS_KEY), 'off');
  assert.equal(readCombatAnimations(storage), false);
  assert.equal(writeCombatAnimations(storage, true), true);
  assert.equal(readCombatAnimations(storage), true);
  assert.equal(values.get('blood-emblem-save'), 'untouched');
  assert.equal(values.size, 2);
});

test('storage failures are reported without preventing session-local animation controls', (t) => {
  const warnings = t.mock.method(console, 'warn', () => {});
  const errors = t.mock.method(console, 'error', () => {});
  const storage = {
    getItem() { throw new Error('denied'); },
    setItem() { throw new Error('full'); },
  };
  assert.equal(readCombatAnimations(storage), true);
  assert.equal(writeCombatAnimations(storage, false), false);
  assert.equal(warnings.mock.callCount(), 1);
  assert.equal(errors.mock.callCount(), 1);
});

test('each strike applies exactly one impact, including skip before or after contact', () => {
  for (const skipTime of [0, 100, 500, 3000]) {
    let damage = 0;
    const impact = createImpactGate(() => { damage += 7; });
    for (const elapsed of [0, 100, 500, 1500, 3000]) {
      if (elapsed >= skipTime || elapsed >= 280) impact();
    }
    assert.equal(damage, 7);
  }
});

test('animation timing holds the actual contact frame, advances and returns without early damage', () => {
  for (const fighter of Object.values(art.fighters)) {
    for (const kind of ['attack', 'critical']) {
      const clip = fighter[kind];
      const contact = clip.impactFrame * clip.frameMs;
      assert.equal(strikePose(clip, contact - 1).contact, false);
      assert.equal(strikePose(clip, contact).contact, true);
      assert.equal(strikePose(clip, contact).frame, clip.impactFrame);
      assert.equal(strikePose(clip, contact + clip.holdMs - 1).frame, clip.impactFrame);
      assert.equal(strikePose(clip, contact).offset, clip.advance);
      assert.equal(strikePose(clip, contact + clip.holdMs).offset, clip.advance);
      assert.equal(strikePose(clip, 0).offset, 0);
      const end = clip.frames * clip.frameMs + clip.holdMs;
      assert.equal(strikePose(clip, end - 1).done, false);
      assert.equal(strikePose(clip, end).done, true);
      assert.equal(strikePose(clip, end).offset, 0);
      assert.equal(animationFrameAt(clip, -1), 0);
      assert.equal(animationFrameAt(clip, end + 1000), clip.frames - 1);
    }
    assert.ok(fighter.critical.frames > fighter.attack.frames);
    assert.ok(fighter.critical.impactFrame > fighter.attack.impactFrame);
    assert.notEqual(fighter.attack.job, fighter.critical.job);
  }
});

test('all generated sheets contain every declared frame at original size', async () => {
  const png = async (path) => {
    const data = await readFile(new URL(`../assets/battle/${path}`, import.meta.url));
    assert.equal(data.subarray(1, 4).toString(), 'PNG');
    return { width: data.readUInt32BE(16), height: data.readUInt32BE(20), data };
  };
  for (const [key, fighter] of Object.entries(art.fighters)) {
    const idle = await png(fighter.idle);
    assert.equal(idle.width, 128, key);
    assert.equal(idle.height, 128, key);
    for (const kind of ['attack', 'critical']) {
      const clip = fighter[kind];
      const sheet = await png(clip.file);
      assert.equal(sheet.width, fighter.size * clip.frames, `${key} ${kind}`);
      assert.equal(sheet.height, fighter.size);
      assert.ok(clip.impactFrame > 0 && clip.impactFrame < clip.frames - 1);
      assert.ok(clip.frameMs <= 40, 'at least 25fps');
      assert.ok(clip.contact.x < fighter.size && clip.contact.y < fighter.size);
    }
    assert.notDeepEqual((await png(fighter.attack.file)).data, (await png(fighter.critical.file)).data);
  }
  for (const path of Object.values(art.backgrounds)) {
    const background = await png(path);
    assert.equal(background.width, 480);
    assert.equal(background.height, 240);
  }
});

test('weapon contact reaches the opponent on both sides rather than striking empty space', () => {
  for (const fighter of Object.values(art.fighters)) {
    if (fighter.casting) {
      assert.equal(fighter.attack.advance, 0, 'mages release independent spells without a melee lunge');
      assert.equal(fighter.critical.advance, 0);
      continue;
    }
    for (const kind of ['attack', 'critical']) {
      const clip = fighter[kind];
      const reach = clip.advance + (clip.contact.x - fighter.anchorX) * 2;
      assert.equal(130 + reach, 350 - 12);
      assert.equal(350 - reach, 130 + 12);
      const y = 233 - (fighter.baseline - clip.contact.y) * 2 * (fighter.scale ?? 1);
      assert.ok(y >= 125 && y <= 233, 'contact lands within the opposing body height');
    }
  }
});

test('HP counts down every whole point after impact, including lethal damage and healing', () => {
  const health = { from: 24, to: 17, changed: 1000 };
  assert.equal(displayedBattleHp(health, 1000), 24);
  assert.equal(displayedBattleHp(health, 1099), 24);
  for (let lost = 1; lost <= 7; lost++) {
    assert.equal(displayedBattleHp(health, 1070 + lost * 30), 24 - lost);
  }
  assert.equal(displayedBattleHp(health, 5000), 17);
  assert.equal(displayedBattleHp({ from: 100, to: 0, changed: 0 }, 1170), 0);
  assert.equal(displayedBattleHp({ from: 17, to: 24, changed: 0 }, 280), 24);
  assert.equal(displayedBattleHp({ from: 24, to: 24, changed: 0 }, 500), 24);
});

test('HP segments represent exactly one point, stay separated and wrap large totals', () => {
  for (const maxHp of [1, 18, 24, 38, 40, 41, 100, 150]) {
    const segments = battleHpSegments(maxHp);
    assert.equal(segments.length, maxHp);
    assert.equal(segments.at(-1).hp, maxHp);
    assert.equal(segments[0].rows, Math.ceil(maxHp / 40));
    for (let index = 0; index < segments.length; index++) {
      const segment = segments[index];
      assert.equal(segment.hp, index + 1);
      assert.ok(segment.width >= 4);
      assert.ok(segment.x >= 0 && segment.x + segment.width < 206);
      if (index && segments[index - 1].y === segment.y) {
        assert.ok(segments[index - 1].x + segments[index - 1].width < segment.x);
      }
    }
    assert.equal(segments.filter((segment) => segment.hp <= Math.floor(maxHp / 2)).length, Math.floor(maxHp / 2));
  }
});

test('HP numerals draw on an integer pixel grid without antialiased font rendering', () => {
  const rectangles = [];
  drawHpDigits({ fillRect: (...args) => rectangles.push(args) }, '24/100', 220, 13);
  assert.ok(rectangles.length > 100);
  for (const rect of rectangles) {
    assert.ok(rect.every(Number.isInteger));
    assert.ok(rect[0] >= 174 && rect[0] <= 220);
    assert.deepEqual(rect.slice(2), [2, 2]);
  }
});

test('critical rumble has stronger two-axis impact, decays and never shakes a miss', () => {
  const first = battleImpactShake(0, true, true);
  assert.equal(first.x, 8);
  assert.ok(first.y >= 4);
  assert.ok(Math.abs(first.x) > Math.abs(battleImpactShake(0, false, true).x));
  assert.notDeepEqual(battleImpactShake(80, true, true), { x: 0, y: 0 });
  assert.deepEqual(battleImpactShake(360, true, true), { x: 0, y: 0 });
  assert.deepEqual(battleImpactShake(10, true, false), { x: 0, y: 0 });
  assert.deepEqual(battleImpactShake(-1, true, true), { x: 0, y: 0 });
});

test('impact and HP sounds use original short synthesis, not sampled game audio', async () => {
  const calls = [];
  const source = (await readFile(new URL('../src/audio/combat-sounds.js', import.meta.url), 'utf8'))
    .replace(/^import .*;\r?\n/gm, '').replaceAll('export function ', 'function ');
  const context = { ensureContext: () => true,
    tone: (options) => calls.push({ kind: 'tone', ...options }),
    noise: (options) => calls.push({ kind: 'noise', ...options }) };
  runInNewContext(`${source}\nplayHitImpact();`, context);
  assert.ok(calls.some((call) => call.kind === 'noise' && call.type === 'highpass' && call.decay <= 0.04));
  assert.ok(calls.some((call) => call.type === 'sine' && call.to < 50));
  const normalCount = calls.length;
  calls.length = 0;
  runInNewContext('playHitImpact({ critical: true });', context);
  assert.ok(calls.length > normalCount);
  calls.length = 0;
  runInNewContext('playHpDrainTick(1);', context);
  assert.equal(calls.length, 2);
  assert.ok(calls.every((call) => call.decay <= 0.025 && call.volume < 0.1));
  calls.length = 0;
  runInNewContext('playHpDrainTick(100);', context);
  assert.equal(calls.length, 8, 'lagged frames cannot queue seconds of stale HP sound');
});
