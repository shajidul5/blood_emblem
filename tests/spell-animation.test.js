import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import * as timing from '../src/battle/battle-animation.js';
import { ARROW_EFFECT, BULLET_EFFECT, STAFF_EFFECTS, rangedEffectFor, SPELL_EFFECTS, spellEffectFor,
  spellEffectPose, staffEffectFor, thrownEffectFor, thrownWeaponPose } from '../src/battle/spell-animation.js';

const art = JSON.parse(await readFile(new URL('../assets/battle/manifest.json', import.meta.url), 'utf8'));
const cyrus = () => ({ id: 'cypher', name: 'Cyrus', classId: 'mage', spriteSet: 'cypher',
  x: 0, z: 0, hp: 24, maxHp: 24, weapon: { id: 'fire-tome', type: 'Anima', name: 'Fire' } });
const merfolk = () => ({ id: 'merfolk', name: 'Merfolk', classId: 'merfolk', spriteSet: 'merfolk',
  x: 1, z: 0, hp: 30, maxHp: 30, weapon: { id: 'iron-spear', type: 'Spear', name: 'Iron Spear' } });

test('only promoted Rictor uses the mounted Light set for all three real Light tomes', async () => {
  for (const id of ['light-tome', 'lumen', 'aureole']) {
    const weapon = JSON.parse(await readFile(new URL(`../data/weapons/${id}.json`, import.meta.url)));
    const unit = { id: 'rictor', classId: 'templar', x: 0, z: 0, weapon };
    assert.equal(timing.battleSpriteKey(unit), 'rictor-templar-light');
    assert.equal(spellEffectFor(weapon).element, 'holy');
    assert.ok(art.spells[spellEffectFor(weapon).key]);
    assert.equal(timing.battleThrow(unit, 2), null);
    for (const x of [1, 2]) {
      assert.ok(timing.supportsBattleScene(unit, { ...merfolk(), x }));
      assert.ok(timing.supportsBattleScene({ ...merfolk(), x }, unit));
    }
    assert.equal(timing.supportsBattleScene(unit, { ...merfolk(), x: 3 }), false);
    assert.equal(timing.battleSpriteKey({ ...unit, classId: 'oathkeeper' }), null);
    assert.equal(timing.battleSpriteKey({ ...unit, id: 'unrelated' }), null);
  }
  const base = { id: 'rictor', classId: 'templar' };
  assert.equal(timing.battleSpriteKey({ ...base, weapon: { id: 'unknown', type: 'Light' } }), null);
  assert.equal(timing.battleSpriteKey({ ...base, weapon: { id: 'fire-tome', type: 'Anima' } }), null);
  assert.equal(art.fighters['rictor-templar-light'].casting, true);
});

test('Cyrus, promoted Cyrus and the standard Merfolk boss have explicitly supported art', () => {
  assert.equal(timing.battleSpriteKey(cyrus()), 'cyrus-mage');
  assert.equal(timing.battleSpriteKey({ ...cyrus(), classId: 'sage' }), 'cyrus-sage');
  assert.equal(timing.battleSpriteKey(merfolk()), 'merfolk');
  assert.equal(timing.battleSpriteKey({ ...merfolk(), id: 'merfolk-boss', isBoss: true }), 'merfolk');
  assert.equal(timing.battleSpriteKey({ ...merfolk(), id: 'merfolk-chieftain' }), null);
  assert.equal(timing.battleSpriteKey({ ...merfolk(), weapon: { type: 'Axe' } }), null);
  for (const id of Object.keys(SPELL_EFFECTS)) {
    const caster = { ...cyrus(), weapon: { id } };
    assert.ok(timing.supportsBattleScene(caster, merfolk()));
    assert.ok(timing.supportsBattleScene(caster, { ...merfolk(), x: 2 }));
    assert.ok(timing.supportsBattleScene({ ...merfolk(), x: 2 }, caster));
    assert.equal(timing.supportsBattleScene(caster, { ...merfolk(), x: 3 }), false);
  }
  assert.equal(timing.battleSpriteKey({ ...cyrus(), weapon: { id: 'elfire' } }), null);
  assert.equal(spellEffectFor({ id: 'elfire', type: 'Anima' }), null);
  assert.equal(spellEffectFor(null), null);
  assert.equal(timing.supportsBattleScene(cyrus(), { ...merfolk(), x: 2,
    weapon: { id: 'javelin', type: 'Spear', maxRange: 2 } }), false, 'no melee thrust for a ranged spear');
  assert.equal(timing.supportsBattleScene(cyrus(), { id: 'bartz', classId: 'pirate', x: 2, z: 0,
    weapon: { id: 'hand-axe', type: 'Axe', maxRange: 2 } }), true, 'Bartz answers a spell by throwing his axe');
});

test('a spell releases from the generic cast, travels, contacts, then allows recovery', () => {
  for (const kind of ['attack', 'critical']) {
    const clip = art.fighters['cyrus-mage'][kind];
    for (const spell of Object.values(SPELL_EFFECTS)) {
      const release = clip.impactFrame * clip.frameMs;
      const impact = timing.battleImpactTime(clip, spell);
      assert.equal(timing.battleStrikePose(clip, release - 1, spell).released, false);
      assert.equal(timing.battleStrikePose(clip, release, spell).released, true);
      assert.equal(timing.battleStrikePose(clip, impact - 1, spell).contact, false);
      assert.equal(timing.battleStrikePose(clip, impact, spell).contact, true);
      assert.equal(timing.battleStrikePose(clip, impact, spell).frame, clip.impactFrame);
      assert.equal(timing.battleStrikePose(clip, impact, spell).offset, 0);
      const end = clip.frames * clip.frameMs + clip.holdMs + spell.travelMs + spell.impactMs;
      assert.equal(timing.battleStrikePose(clip, end - 1, spell).done, false);
      assert.equal(timing.battleStrikePose(clip, end, spell).done, true);
      for (const [from, to] of [[130, 350], [350, 130]]) {
        assert.equal(spellEffectPose(clip, spell, release - 1, from, to), null);
        const contact = spellEffectPose(clip, spell, impact, from, to);
        assert.equal(contact.x, to);
        assert.equal(contact.impacted, true);
        assert.equal(contact.alpha, 1);
        assert.equal(spellEffectPose(clip, spell, impact + spell.impactMs, from, to), null);
        const halfway = spellEffectPose(clip, spell, release + spell.travelMs / 2, from, to);
        if (spell.motion === 'projectile') assert.ok(halfway.x > 130 && halfway.x < 350);
        else assert.equal(halfway.x, to);
      }
    }
  }
  const clip = art.fighters.merfolk.attack;
  assert.deepEqual(timing.battleStrikePose(clip, 280, null), timing.strikePose(clip, 280));
});

test('spell effects are separately generated and packed at their native resolution', async () => {
  for (const spec of Object.values(art.spells)) {
    const png = await readFile(new URL(`../assets/battle/${spec.file}`, import.meta.url));
    assert.equal(png.readUInt32BE(16), spec.width * spec.frames);
    assert.equal(png.readUInt32BE(20), spec.height);
    assert.equal(spec.frames, 9);
    assert.ok(spec.job && spec.sourceJob);
    assert.notEqual(spec.job, art.fighters['cyrus-mage'].attack.job);
  }
});

test('Cyrus has all eight map directions, complete walk/cast clips, and compatible Sage wiring', async () => {
  const directions = ['south', 'south-east', 'east', 'north-east', 'north', 'north-west', 'west', 'south-west'];
  const root = new URL('../assets/character/Cyrus/Idle/', import.meta.url);
  for (const direction of directions) {
    const idle = await readFile(new URL(`rotations/${direction}.png`, root));
    assert.equal(idle.readUInt32BE(16), 48);
    assert.equal(idle.readUInt32BE(20), 48);
    for (const [clip, count, size] of [['Walking', 6, 48], ['Casting', 9, 68]]) {
      const directory = new URL(`animations/${clip}/${direction}/`, root);
      const names = (await readdir(directory)).filter((name) => name.endsWith('.png')).sort();
      assert.equal(names.length, count, `${clip} ${direction}`);
      for (let frame = 0; frame < count; frame++) {
        assert.equal(names[frame], `frame_${String(frame).padStart(3, '0')}.png`);
        const png = await readFile(new URL(names[frame], directory));
        assert.equal(png.readUInt32BE(16), size);
        assert.equal(png.readUInt32BE(20), size);
      }
    }
  }
  const loader = await readFile(new URL('../src/characters/animation-loader.js', import.meta.url), 'utf8');
  assert.match(loader, /Cyrus\/Idle\/animations\/Casting/);
  assert.doesNotMatch(loader, /Cypher\/Idle|Sage_Cypher\//);
  assert.match(loader, /result\.sageCypherAttackFrames = cypherData\.attacking/);
});

async function presenterHarness({ reducedMotion = false } = {}) {
  let now = 0;
  let callback;
  const calls = [];
  const context = new Proxy({}, { set: () => true, get: (_, key) => (...args) => {
    if (key === 'drawImage') calls.push(['image', args[0].src, ...args.slice(1)]);
    if (key === 'translate' || key === 'scale') calls.push([key, ...args]);
  } });
  class Element {
    constructor(tag) { this.tag = tag; this.children = []; this.events = {}; this.isConnected = true; }
    setAttribute() {}
    append(...children) { this.children.push(...children); }
    addEventListener(name, fn) { this.events[name] = fn; }
    getContext() { return context; }
    showModal() { this.open = true; }
    close() { this.open = false; }
    focus() {}
  }
  const document = { body: new Element('body'), createElement: (tag) => new Element(tag), activeElement: null };
  const audio = (name) => (...args) => calls.push([name, ...args]);
  const filenames = [...Object.values(art.backgrounds), ...Object.values(art.spells).map((s) => s.file),
    ...Object.values(art.fighters).flatMap((f) => [f.idle, f.attack.file, f.critical.file,
      ...(f.idleLoop ? [f.idleLoop.file] : []),
      ...(f.thrown ? [f.thrown.attack.file, f.thrown.critical.file] : []),
      ...(f.flurry ? [f.flurry.back.file, f.flurry.plunge.file] : []),
      ...(f.staff ? [f.staff.idle, f.staff.cast.file] : [])])];
  const source = (await readFile(new URL('../src/battle/battle-screen.js', import.meta.url), 'utf8'))
    .replace(/^import[\s\S]*?;\r?\n/gm, '')
    .replace(/^const urls = .*;\r?\n/m, '')
    .replace('export function createBattleScreen', 'function createBattleScreen');
  const sandbox = { ...timing, art, STAFF_EFFECTS, rangedEffectFor, spellEffectFor, spellEffectPose,
    staffEffectFor, thrownWeaponPose, document, console,
    performance: { now: () => now }, matchMedia: () => ({ matches: reducedMotion }),
    requestAnimationFrame(fn) { callback = fn; return 1; }, cancelAnimationFrame() { callback = null; },
    setTimeout(fn) { fn(); },
    drawHpDigits() {},
    playWeaponSwing: audio('steel-swing'), playHitImpact: audio('steel-hit'),
    playSpellRelease: audio('release'), playSpellImpact: audio('spell-hit'),
    playMissWhiff: audio('miss'), playHpDrainTick: audio('hp'),
    urls: Object.fromEntries(filenames.map((f) =>
      [`../../assets/${f.startsWith('../covenant/') ? f.slice(3) : `battle/${f}`}`, f])),
    Image: class { set src(value) { this.url = value; this.srcValue = value; queueMicrotask(() => this.onload()); }
      get src() { return this.srcValue; } },
  };
  runInNewContext(`${source}\nglobalThis.presenter = createBattleScreen();`, sandbox);
  return { screen: sandbox.presenter, calls,
    skip: () => document.body.children[0].children[1].children[1].events.click(),
    step(value) { now = value; const fn = callback; callback = null; fn?.(now); } };
}

test('real presenter loops new fighter idles at native frame boundaries, including while opponents attack', async () => {
  for (const [id, classId, spriteSet, type, weaponId, key] of [
    ['lena', 'thief', 'lena', 'Sword', 'iron-katana', 'lena-thief'],
    ['lena', 'assassin', 'assassinLena', 'Sword', 'iron-katana', 'lena-assassin-sword'],
    ['lena', 'assassin', 'assassinLena', 'Bow', 'iron-bow', 'lena-assassin-bow'],
    ['undead', 'undead', 'genericUndead', 'Claw', 'undead-claws', 'generic-undead'],
    ['rotten', 'rotten', 'rotten', 'Claw', 'blighted-tendrils', 'rotten'],
    ['linus', 'bloodsworn', 'bloodswornLinus', 'Spear', 'iron-spear', 'linus-bloodsworn'],
    ['stark', 'veilstalker', 'veilstalkerStark', 'Bow', 'iron-bow', 'stark-veilstalker'],
    ['golden-captain', 'paladin', 'genericPaladin', 'Spear', 'javelin', 'generic-paladin'],
    ['golden-mage', 'mage', 'genericMage', 'Anima', 'fire-tome', 'generic-mage'],
    ['blood-beast', 'blood-beast', 'bloodBeast', 'Claw', 'blood-claws', 'blood-beast'],
  ]) {
    for (const reducedMotion of [false, true]) {
      const harness = await presenterHarness({ reducedMotion });
      const unit = { id, name: id, classId, spriteSet, x: 1, z: 0, hp: 30, maxHp: 30,
        weapon: { id: weaponId, name: weaponId, type, maxRange: 2 } };
      const caster = cyrus();
      assert.equal(await harness.screen.begin(caster, unit, { enabled: true, chapter: 9 }), true);
      const clip = art.fighters[key].idleLoop;
      const size = art.fighters[key].size;
      for (const ms of [clip.frameMs - 1, clip.frameMs, clip.frameMs * clip.frames]) {
        harness.step(ms);
        const last = harness.calls.filter(([name, file]) => name === 'image' && file === clip.file).at(-1);
        assert.ok(last);
        assert.equal(last[2], timing.idleFrameAt(clip, ms, reducedMotion) * size);
      }
      const pending = harness.screen.strike(caster, { hit: false, critical: false }, () => {});
      const ms = clip.frameMs * (clip.frames + 1);
      harness.step(ms);
      const last = harness.calls.filter(([name, file]) => name === 'image' && file === clip.file).at(-1);
      assert.equal(last[2], reducedMotion ? 0 : size);
      harness.skip();
      harness.step(6000);
      await pending;
      await harness.screen.end();
    }
  }
});

test('real presenter delays damage and elemental audio until contact, mirrors, and skips exactly once', async () => {
  for (const [unitId, classId, spriteSet] of [
    ['cypher', 'mage', 'cypher'], ['cypher', 'sage', 'sageCypher'], ['golden-mage', 'mage', 'genericMage'],
  ]) {
  for (const id of Object.keys(SPELL_EFFECTS)) {
    for (const side of [0, 1]) {
      for (const critical of [false, true]) {
        for (const hit of [false, true]) {
          for (const skipAt of [null, 0, 500, 1400]) {
            const harness = await presenterHarness();
            const caster = { ...cyrus(), id: unitId, classId, spriteSet }, target = merfolk();
            caster.weapon = { id, name: id };
            const pair = side === 0 ? [caster, target] : [target, caster];
            assert.equal(await harness.screen.begin(...pair, { enabled: true, chapter: 0 }), true);
            let impacts = 0;
            const pending = harness.screen.strike(caster, { hit, critical }, () => {
              impacts++;
              if (hit) target.hp -= 7;
              harness.screen.result(target, hit ? '7' : 'MISS', hit ? critical ? 'critical' : 'damage' : 'miss');
            });

            const clip = art.fighters[timing.battleSpriteKey(caster)][critical ? 'critical' : 'attack'];
            const impactTime = timing.battleImpactTime(clip, SPELL_EFFECTS[id]);
            if (skipAt === null) {
              const home = side === 0 ? 130 : 350;
              harness.step(impactTime - 1);
              assert.equal(impacts, 0);
              assert.equal(target.hp, 30);
              assert.ok(harness.calls.some(([name, x, y]) => name === 'translate' && x === home && y === 233),
                'scaled casters remain at home instead of lunging like melee units');
              harness.step(impactTime);
              assert.equal(impacts, 1);
              assert.equal(target.hp, hit ? 23 : 30);
              assert.ok(harness.calls.some(([name, key]) => name === 'release' && key === SPELL_EFFECTS[id].element));
              assert.ok(harness.calls.some(([name]) => name === (hit ? 'spell-hit' : 'miss')));
              assert.ok(harness.calls.some(([name, file]) => name === 'image' && file === art.spells[SPELL_EFFECTS[id].key].file));
            } else {
              harness.step(skipAt);
              harness.skip();
            }
            harness.step(5000);
            await pending;
            assert.equal(impacts, 1);
            assert.equal(target.hp, hit ? 23 : 30);
            assert.equal(harness.calls.some(([name]) => name.startsWith('steel')), false);
            await harness.screen.end();
            assert.equal(harness.screen.active, false);
          }
        }
      }
    }
  }
  }
});

test('mounted Rictor casts Light on either side at both ranges, with holy audio, misses and safe skips', async () => {
  for (const id of ['light-tome', 'lumen', 'aureole']) {
    const weapon = JSON.parse(await readFile(new URL(`../data/weapons/${id}.json`, import.meta.url)));
    for (const range of [1, 2]) {
      for (const side of [0, 1]) {
        for (const critical of [false, true]) {
          for (const hit of [false, true]) {
            for (const skip of [false, true]) {
              const harness = await presenterHarness({ reducedMotion: skip });
              const caster = { ...cyrus(), id: 'rictor', classId: 'templar', weapon };
              const target = { ...merfolk(), x: range };
              const pair = side ? [target, caster] : [caster, target];
              assert.equal(await harness.screen.begin(...pair, { enabled: true, chapter: 9 }), true);
              let impacts = 0;
              const pending = harness.screen.strike(caster, { hit, critical }, () => {
                impacts++;
                if (hit) target.hp -= 7;
                harness.screen.result(target, hit ? '7' : 'MISS', hit ? critical ? 'critical' : 'damage' : 'miss');
              });
              const clip = art.fighters['rictor-templar-light'][critical ? 'critical' : 'attack'];
              const impact = timing.battleImpactTime(clip, SPELL_EFFECTS[id]);
              harness.step(impact - 1);
              assert.equal(impacts, 0);
              if (skip) harness.skip();
              harness.step(impact);
              assert.equal(impacts, 1);
              assert.equal(target.hp, hit ? 23 : 30);
              if (!skip) {
                assert.ok(harness.calls.some(([name, element]) => name === 'release' && element === 'holy'));
                assert.ok(harness.calls.some(([name]) => name === (hit ? 'spell-hit' : 'miss')));
                assert.ok(harness.calls.some(([name, file]) => name === 'image' &&
                  file === art.spells[SPELL_EFFECTS[id].key].file));
                assert.ok(harness.calls.some(([name, x, y]) =>
                  name === 'translate' && x === (side ? 350 : 130) && y === 233));
              }
              harness.step(6000);
              await pending;
              assert.equal(impacts, 1);
              assert.equal(harness.calls.some(([name]) => name.startsWith('steel')), false);
              await harness.screen.end();
            }
          }
        }
      }
    }
  }
});

test('Sage staff effects cover every tier without equipping a staff or enabling staff attacks', async () => {
  const sage = { ...cyrus(), classId: 'sage' };
  const target = merfolk();
  for (const id of ['heal-staff', 'mend', 'physic', 'freeze-staff', 'hold', 'stasis']) {
    const staff = JSON.parse(await readFile(new URL(`../data/weapons/${id}.json`, import.meta.url)));
    assert.equal(staffEffectFor(staff), staff.freeze ? STAFF_EFFECTS.freeze : STAFF_EFFECTS.heal);
    assert.equal(timing.staffBattleKey(sage, staff), 'cyrus-sage');
    assert.equal(timing.supportsStaffScene(sage, { ...target, x: 10 }, staff), true);
    assert.equal(timing.battleSpriteKey({ ...sage, weapon: staff }), null);
    assert.equal(timing.staffBattleKey(cyrus(), staff), null);
    assert.equal(timing.supportsStaffScene(sage, { ...target, id: 'unknown' }, staff), false);
    assert.equal(sage.weapon.id, 'fire-tome');
  }
  assert.equal(staffEffectFor({ type: 'Anima', heal: 10 }), null);
  assert.equal(staffEffectFor(null), null);
  const spec = art.fighters['cyrus-sage'];
  for (const [file, width] of [[spec.staff.idle, 128], [spec.staff.cast.file, 128 * spec.staff.cast.frames]]) {
    const png = await readFile(new URL(`../assets/battle/${file}`, import.meta.url));
    assert.equal(png.readUInt32BE(16), width);
    assert.equal(png.readUInt32BE(20), 128);
  }
});

test('Sage heals and freezes at staff contact; misses and skips resolve exactly once', async () => {
  for (const kind of ['heal', 'freeze']) {
    for (const hit of kind === 'heal' ? [true] : [false, true]) {
      for (const skipAt of [null, 0, 650, 1000]) {
        const harness = await presenterHarness();
        const sage = { ...cyrus(), classId: 'sage' };
        const recipient = kind === 'heal' ? { ...cyrus(), hp: 10 } : merfolk();
        const staff = { type: 'Staff', name: kind, [kind]: kind === 'heal' ? 10 : true };
        assert.equal(await harness.screen.begin(sage, recipient, { enabled: false, chapter: 5, staff }), false);
        assert.equal(await harness.screen.begin(sage, recipient, { enabled: true, chapter: 5, staff }), true);
        const initialHp = recipient.hp;
        let impacts = 0;
        const pending = harness.screen.strike(sage, { hit, critical: false }, () => {
          impacts++;
          if (hit && kind === 'heal') recipient.hp += 10;
          if (hit && kind === 'freeze') recipient.frozen = 2;
          harness.screen.result(recipient, hit ? kind === 'heal' ? '+10' : 'FROZEN' : 'MISS', hit ? kind : 'miss');
        });
        const clip = art.fighters['cyrus-sage'].staff.cast;
        const impact = timing.battleImpactTime(clip, STAFF_EFFECTS[kind]);
        if (skipAt === null) {
          harness.step(impact - 1);
          assert.equal(impacts, 0);
          assert.equal(recipient.hp, initialHp);
          harness.step(impact);
          assert.equal(impacts, 1);
          assert.ok(harness.calls.some(([name, element]) => name === 'release' && element === STAFF_EFFECTS[kind].element));
          assert.ok(harness.calls.some(([name, file]) => name === 'image' && file === clip.file));
          assert.ok(harness.calls.some(([name, file]) => name === 'image' && file === art.spells[kind].file));
          assert.ok(harness.calls.some(([name]) => name === (hit ? 'spell-hit' : 'miss')));
        } else {
          harness.step(skipAt);
          harness.skip();
        }
        harness.step(5000);
        await pending;
        assert.equal(impacts, 1);
        assert.equal(recipient.hp, initialHp + (kind === 'heal' ? 10 : 0));
        assert.equal(Boolean(recipient.frozen), kind === 'freeze' && hit);
        assert.equal(sage.weapon.id, 'fire-tome', 'staff casting preserves the equipped attack tome');
        assert.equal(harness.calls.some(([name]) => name.startsWith('steel')), false);
        await harness.screen.end();
        assert.equal(harness.screen.active, false);
      }
    }
  }
});

test('Blood Oath uses the approved protective cast, resolves once at contact or skip, and never swaps equipment', async () => {
  const rite = { id: 'blood-oath', name: 'Blood Oath', type: 'Blood Rite' };
  const caster = { id: 'linus', classId: 'bloodsworn', name: 'Linus', hp: 30, maxHp: 30,
    x: 0, z: 0, weapon: { id: 'javelin', type: 'Spear', name: 'Javelin' } };
  assert.equal(staffEffectFor(rite), STAFF_EFFECTS.bloodOath);
  assert.equal(timing.staffBattleKey(caster, rite), 'linus-bloodsworn');
  assert.equal(timing.staffBattleKey({ ...caster, classId: 'paladin' }, rite), null);
  assert.equal(timing.staffBattleKey({ ...cyrus(), classId: 'sage' }, rite), null);
  assert.equal(timing.staffBattleKey(caster, { type: 'Staff', heal: 10 }), null);
  for (const reducedMotion of [false, true]) for (const skipAt of [null, 0, 650, 1000]) {
    const harness = await presenterHarness({ reducedMotion });
    const linus = { ...caster }, target = merfolk();
    assert.equal(await harness.screen.begin(linus, target, { enabled: true, chapter: 9, staff: rite }), true);
    let impacts = 0;
    const pending = harness.screen.strike(linus, { hit: true, critical: false }, () => {
      impacts++;
      linus.hp -= 6;
      target.bloodOath = true;
      harness.screen.result(target, 'OATH', 'heal');
    });
    const clip = art.fighters['linus-bloodsworn'].staff.cast;
    const impact = timing.battleImpactTime(clip, STAFF_EFFECTS.bloodOath);
    if (skipAt === null) {
      harness.step(impact - 1);
      assert.equal(impacts, 0);
      assert.equal(linus.hp, 30);
      harness.step(impact);
      assert.equal(impacts, 1);
      assert.ok(harness.calls.some(([name, file]) => name === 'image' && file === clip.file));
      assert.ok(harness.calls.some(([name, element]) => name === 'release' && element === 'holy'));
      assert.equal(harness.calls.some(([name]) => name.startsWith('steel')), false);
    } else {
      harness.step(skipAt);
      harness.skip();
    }
    harness.step(5000);
    await pending;
    assert.equal(impacts, 1);
    assert.equal(linus.hp, 24);
    assert.equal(target.bloodOath, true);
    assert.equal(linus.weapon, caster.weapon);
    await harness.screen.end();
  }
});

test('Ravager pistols use gun art at both ranges, mirrored, with physical impact and one impact per shot', async () => {
  for (const id of ['hunter-pistol', 'evelynn']) {
    for (const distance of [1, 2]) {
      for (const side of [0, 1]) {
        for (const critical of [false, true]) {
          for (const hit of [false, true]) {
            for (const skipAt of [null, 0, 750, 1000]) {
              const harness = await presenterHarness();
              const maria = { id: 'maria', name: 'Maria', classId: 'ravager', x: 0, z: 0, hp: 34, maxHp: 34,
                weapon: { id, name: id, type: 'Gun', minRange: 1, maxRange: 2 } };
              const target = { ...merfolk(), x: distance };
              const pair = side === 0 ? [maria, target] : [target, maria];
              assert.equal(rangedEffectFor(maria.weapon), BULLET_EFFECT);
              assert.equal(await harness.screen.begin(...pair, { enabled: true, chapter: 5 }), true);
              let impacts = 0;
              const pending = harness.screen.strike(maria, { hit, critical }, () => {
                impacts++;
                if (hit) target.hp -= 5;
                harness.screen.result(target, hit ? '-5' : 'MISS', hit ? critical ? 'critical' : 'hit' : 'miss');
              });
              const clip = art.fighters['maria-ravager-gun'][critical ? 'critical' : 'attack'];
              const impact = timing.battleImpactTime(clip, BULLET_EFFECT);
              if (skipAt === null) {
                harness.step(impact - 1);
                assert.equal(impacts, 0);
                assert.ok(harness.calls.some(([name, weapon]) => name === 'steel-swing' && weapon.type === 'Gun'));
                harness.step(impact);
                assert.equal(impacts, 1);
                assert.ok(harness.calls.some(([name]) => name === (hit ? 'steel-hit' : 'miss')));
                assert.ok(harness.calls.some(([name, file]) => name === 'image' && file === clip.file));
              } else {
                harness.step(skipAt);
                harness.skip();
              }
              harness.step(5000);
              await pending;
              assert.equal(impacts, 1);
              assert.equal(target.hp, hit ? 25 : 30);
              assert.equal(harness.calls.filter(([name]) => name === 'steel-swing').length <= 1, true);
              assert.equal(harness.calls.some(([name]) => name === 'release' || name === 'spell-hit'), false);
              await harness.screen.end();
            }
          }
        }
      }
    }
  }
});

test('Stark, Assassin Lena and generic archers loose arrows with bow audio, mirror, and skip exactly once', async () => {
  assert.equal(rangedEffectFor({ id: 'iron-bow', type: 'Bow' }), ARROW_EFFECT);
  assert.equal(spellEffectFor({ id: 'iron-bow', type: 'Bow' }), null, 'arrows are not elemental spells');
  assert.equal(rangedEffectFor({ id: 'iron-sword', type: 'Sword' }), null);
  for (const [classId, id, spriteSet, key] of [
    ['archer', 'stark', undefined, 'stark-archer'],
    ['sniper', 'stark', undefined, 'stark-sniper'],
    ['veilstalker', 'stark', 'veilstalkerStark', 'stark-veilstalker'],
    ['assassin', 'lena', 'assassinLena', 'lena-assassin-bow'],
    ['archer', 'order-archer', 'genericArcher', 'generic-archer'],
  ]) {
    for (const side of [0, 1]) {
      for (const critical of [false, true]) {
        for (const hit of [false, true]) {
          for (const skipAt of [null, 0, 900]) {
            const harness = await presenterHarness();
            const stark = { id, name: id, spriteSet, classId, x: 0, z: 0, hp: 24, maxHp: 24,
              weapon: { id: 'hunter-bow', name: 'Hunter Bow', type: 'Bow', minRange: 2, maxRange: 2 } };
            const wolf = { id: 'feral-wolf', name: 'Feral Wolf', classId: 'wolf', spriteSet: 'feralWolf',
              x: 2, z: 0, hp: 30, maxHp: 30, weapon: { id: 'wolf-claws', name: 'Claws', type: 'Claw', maxRange: 1 } };
            const pair = side === 0 ? [stark, wolf] : [wolf, stark];
            assert.equal(await harness.screen.begin(...pair, { enabled: true, chapter: 6 }), true);
            let impacts = 0;
            const pending = harness.screen.strike(stark, { hit, critical }, () => {
              impacts++;
              if (hit) wolf.hp -= 9;
              harness.screen.result(wolf, hit ? '9' : 'MISS', hit ? critical ? 'critical' : 'damage' : 'miss');
            });
            const clip = art.fighters[key][critical ? 'critical' : 'attack'];
            const impactTime = timing.battleImpactTime(clip, ARROW_EFFECT);
            if (skipAt === null) {
              harness.step(impactTime - 1);
              assert.equal(impacts, 0);
              assert.equal(wolf.hp, 30);
              assert.ok(harness.calls.some(([name]) => name === 'steel-swing'), 'bow twang at release');
              harness.step(impactTime);
              assert.equal(impacts, 1);
              assert.equal(wolf.hp, hit ? 21 : 30);
              assert.ok(harness.calls.some(([name]) => name === (hit ? 'steel-hit' : 'miss')));
              assert.ok(harness.calls.some(([name, file]) => name === 'image' && file === clip.file));
            } else {
              harness.step(skipAt);
              harness.skip();
            }
            harness.step(5000);
            await pending;
            assert.equal(impacts, 1);
            assert.equal(wolf.hp, hit ? 21 : 30);
            assert.equal(harness.calls.filter(([name]) => name === 'steel-swing').length <= 1, true);
            assert.equal(harness.calls.some(([name]) => name === 'release' || name === 'spell-hit'), false);
            assert.ok(harness.calls.some(([name, file]) => name === 'image' && file === art.backgrounds.forest));
            await harness.screen.end();
          }
        }
      }
    }
  }
});

test('Bartz and generic lancers throw at range 2, catch the weapon, and keep melee clips at range 1', async () => {
  for (const [classId, key, id, spriteSet, type] of [
    ['pirate', 'bartz-pirate', 'bartz', undefined, 'Axe'],
    ['berserker', 'bartz-berserker', 'bartz', undefined, 'Axe'],
    ['knight', 'generic-knight', 'ward-knight', 'genericKnight', 'Spear'],
    ['general', 'generic-knight', 'orsen', 'genericKnight', 'Spear'],
    ['cavalier', 'generic-cavalier', 'bridge-captain', 'genericCavalier', 'Spear'],
    ['soldier', 'generic-soldier', 'ward-soldier', 'genericSoldier', 'Spear'],
    ['cavalier', 'linus-cavalier-lance', 'linus', 'linus', 'Spear'],
    ['paladin', 'linus-paladin-lance', 'linus', 'paladinLinus', 'Spear'],
    ['paladin', 'generic-paladin', 'golden-captain', 'genericPaladin', 'Spear'],
    ['bloodsworn', 'linus-bloodsworn', 'linus', 'bloodswornLinus', 'Spear'],
    ['oathkeeper', 'rictor-oathkeeper', 'rictor', 'rictor', 'Spear'],
    ['templar', 'rictor-templar-lance', 'rictor', 'templarRictor', 'Spear'],
  ]) {
  const axe = thrownEffectFor({ type, maxRange: 2 });
  for (const kind of ['attack', 'critical']) {
    const clip = art.fighters[key].thrown[kind];
    const returnMs = timing.thrownReturnMs(clip, axe);
    const start = { x: 0, y: 0 }, target = { x: 100, y: 0 }, hand = { x: 10, y: 20 };
    const catchTime = clip.catchFrame * clip.frameMs + clip.holdMs + axe.travelMs + axe.impactMs;
    const releaseTime = clip.impactFrame * clip.frameMs;
    assert.equal(thrownWeaponPose(axe, axe.travelMs - 1, start, target, returnMs, hand).phase, 'out');
    assert.equal(thrownWeaponPose(axe, catchTime - releaseTime - 1, start, target, returnMs, hand).phase, 'return');
    assert.equal(thrownWeaponPose(axe, catchTime - releaseTime, start, target, returnMs, hand).phase, 'done',
      'the thrown weapon lands in the hand exactly when the catch frame appears');
    assert.equal(timing.strikePose({ ...clip, holdMs: clip.holdMs + axe.travelMs + axe.impactMs }, catchTime).frame,
      clip.catchFrame);
  }
  for (const distance of [1, 2]) {
    for (const side of [0, 1]) {
      for (const critical of [false, true]) {
        for (const hit of [false, true]) {
          for (const skipAt of [null, 0, 700]) {
            const harness = await presenterHarness();
            const thrower = { id, name: id, spriteSet, classId, isBoss: id === 'orsen', x: 0, z: 0, hp: 30, maxHp: 30,
              weapon: { id: type === 'Axe' ? 'hand-axe' : 'javelin', name: type === 'Axe' ? 'Hand Axe' : 'Javelin',
                type, minRange: 1, maxRange: 2 } };
            const target = { ...merfolk(), x: distance, weapon: { id: 'iron-spear', name: 'Spear', type: 'Spear', maxRange: 1 } };
            const pair = side === 0 ? [thrower, target] : [target, thrower];
            assert.equal(await harness.screen.begin(...pair, { enabled: true, chapter: 3 }), true);
            let impacts = 0;
            const pending = harness.screen.strike(thrower, { hit, critical }, () => {
              impacts++;
              if (hit) target.hp -= 6;
              harness.screen.result(target, hit ? '6' : 'MISS', hit ? critical ? 'critical' : 'damage' : 'miss');
            });
            const fighter = art.fighters[key];
            const clip = distance === 2 ? fighter.thrown[critical ? 'critical' : 'attack'] : fighter[critical ? 'critical' : 'attack'];
            const scale = (fighter.scale ?? 1) * (id === 'orsen' ? 1.12 : 1);
            harness.step(0);
            assert.ok(harness.calls.some(([name, , y]) => name === 'scale' && y === scale * 2),
              'fighter uses the authored scale, including the larger knight boss');
            const impactTime = timing.battleImpactTime(clip, distance === 2 ? axe : null);
            if (skipAt === null) {
              if (distance === 2) {
                harness.step(clip.impactFrame * clip.frameMs);
                const home = side === 0 ? 130 : 350;
                const direction = side === 0 ? 1 : -1;
                const x = Math.round(home + direction * (clip.contact.x - fighter.anchorX) * 2 * scale);
                const y = Math.round(233 - (fighter.baseline - clip.contact.y) * 2 * scale);
                assert.ok(harness.calls.some(([name, px, py]) => name === 'translate' && px === x && py === y),
                  'projectile releases from the scaled, mirrored throwing hand');
              }
              harness.step(impactTime - 1);
              assert.equal(impacts, 0);
              harness.step(impactTime);
              assert.equal(impacts, 1);
              assert.ok(harness.calls.some(([name, file]) => name === 'image' && file === clip.file),
                `${distance === 2 ? 'thrown' : 'melee'} clip is drawn`);
              assert.ok(harness.calls.some(([name]) => name === (hit ? 'steel-hit' : 'miss')));
              assert.equal(harness.calls.filter(([name]) => name === 'steel-swing').length, 1);
            } else {
              harness.step(skipAt);
              harness.skip();
            }
            harness.step(6000);
            await pending;
            assert.equal(impacts, 1);
            assert.equal(target.hp, hit ? 24 : 30);
            assert.equal(harness.calls.some(([name]) => name === 'release' || name === 'spell-hit'), false);
            await harness.screen.end();
          }
        }
      }
    }
  }
  }
});

test('generic cavalry and both Linus forms slash with sword art, mirrored, resolving hits, misses and skips once', async () => {
  for (const [id, classId, spriteSet, key] of [
    ['order-cavalier', 'cavalier', 'genericCavalier', 'generic-cavalier-sword'],
    ['linus', 'cavalier', 'linus', 'linus-cavalier-sword'],
    ['linus', 'paladin', 'paladinLinus', 'linus-paladin-sword'],
  ]) {
  for (const side of [0, 1]) {
    for (const critical of [false, true]) {
      for (const hit of [false, true]) {
        for (const skipAt of [null, 0, 900]) {
          const harness = await presenterHarness();
          const rider = { id, name: id, classId,
            spriteSet, x: 0, z: 0, hp: 32, maxHp: 32,
            weapon: { id: 'steel-sword', name: 'Steel Sword', type: 'Sword', minRange: 1, maxRange: 1 } };
          const target = merfolk();
          assert.equal(await harness.screen.begin(...(side === 0 ? [rider, target] : [target, rider]),
            { enabled: true, chapter: 6 }), true);
          let impacts = 0;
          const pending = harness.screen.strike(rider, { hit, critical }, () => {
            impacts++;
            if (hit) target.hp -= 8;
            harness.screen.result(target, hit ? '8' : 'MISS', hit ? 'damage' : 'miss');
          });
          const fighter = art.fighters[key];
          const clip = fighter[critical ? 'critical' : 'attack'];
          if (skipAt === null) {
            const impactTime = timing.battleImpactTime(clip, null);
            harness.step(impactTime - 1);
            assert.equal(impacts, 0);
            harness.step(impactTime);
            assert.equal(impacts, 1);
            assert.ok(harness.calls.some(([name, file]) => name === 'image' && file === clip.file));
            assert.ok(harness.calls.some(([name, x, y]) =>
              name === 'scale' && x === (side === 0 ? 1 : -1) * 2 * fighter.scale && y === 2 * fighter.scale));
            assert.ok(harness.calls.some(([name]) => name === (hit ? 'steel-hit' : 'miss')));
          } else {
            harness.step(skipAt);
            harness.skip();
          }
          harness.step(6000);
          await pending;
          assert.equal(impacts, 1);
          assert.equal(target.hp, hit ? 22 : 30);
          assert.equal(harness.calls.some(([name]) => name === 'release' || name === 'spell-hit'), false);
          await harness.screen.end();
        }
      }
    }
  }
  }
});

test('wolfman, Lena sword sets and undead attacks mirror, miss and skip with exactly one physical impact', async () => {
  for (const [id, classId, spriteSet, type, weaponId, key] of [
    ['root-warden', 'wolfman', 'genericWolfman', 'Claw', 'wolfman-claws', 'generic-wolfman'],
    ['lena', 'thief', 'lena', 'Sword', 'iron-katana', 'lena-thief'],
    ['lena', 'assassin', 'assassinLena', 'Sword', 'iron-katana', 'lena-assassin-sword'],
    ['undead', 'undead', 'genericUndead', 'Claw', 'undead-claws', 'generic-undead'],
  ]) {
  for (const side of [0, 1]) for (const critical of [false, true]) {
    for (const hit of [false, true]) for (const skipAt of [null, 0, 900]) {
      const harness = await presenterHarness();
      const warden = { id, name: id, classId, spriteSet, x: 0, z: 0, hp: 68, maxHp: 68,
        weapon: { id: weaponId, name: weaponId, type, minRange: 1, maxRange: 1 } };
      const target = { ...merfolk(), x: 1 };
      assert.equal(await harness.screen.begin(...(side === 0 ? [warden, target] : [target, warden]),
        { enabled: true, chapter: 7 }), true);
      let impacts = 0;
      const pending = harness.screen.strike(warden, { hit, critical }, () => {
        impacts++;
        if (hit) target.hp -= 8;
        harness.screen.result(target, hit ? '8' : 'MISS', hit ? 'damage' : 'miss');
      });
      const clip = art.fighters[key][critical ? 'critical' : 'attack'];
      if (skipAt === null) {
        const contact = timing.battleImpactTime(clip, null);
        harness.step(contact - 1);
        assert.equal(impacts, 0);
        assert.equal(target.hp, 30);
        harness.step(contact);
        assert.equal(impacts, 1);
        assert.ok(harness.calls.some(([name, file]) => name === 'image' && file === clip.file));
      } else {
        harness.step(skipAt);
        harness.skip();
      }
      harness.step(5000);
      await pending;
      assert.equal(impacts, 1);
      assert.equal(target.hp, hit ? 22 : 30);
      assert.equal(harness.calls.some(([name]) => name === 'release' || name === 'spell-hit'), false);
      await harness.screen.end();
      assert.equal(harness.screen.active, false);
    }
  }
  }
});

test('Deep Merfolk, Blood Beast and Rotten attacks contact once, mirror, miss, and skip at both ranges', async () => {
  for (const [id, spriteSet, type, weaponId] of [
    ['deep-merfolk', 'killian', 'Axe', 'tentacle'], ['blood-beast', 'bloodBeast', 'Claw', 'blood-claws'],
    ['rotten', 'rotten', 'Claw', 'blighted-tendrils'],
  ]) {
  for (const distance of [1, 2]) {
    for (const side of [0, 1]) {
      for (const critical of [false, true]) {
        for (const hit of [false, true]) {
          for (const skipAt of [null, 0, 200, 1500]) {
            const harness = await presenterHarness();
            const deep = { id, name: id, classId: id,
              spriteSet, x: 0, z: 0, hp: 36, maxHp: 36,
              weapon: { id: weaponId, name: weaponId, type, maxRange: 2 } };
            const target = { ...merfolk(), x: distance };
            const pair = side === 0 ? [deep, target] : [target, deep];
            assert.equal(await harness.screen.begin(...pair, { enabled: true, chapter: 4 }), true);
            let impacts = 0;
            const pending = harness.screen.strike(deep, { hit, critical }, () => {
              impacts++;
              if (hit) target.hp -= 8;
              harness.screen.result(target, hit ? '8' : 'MISS', hit ? critical ? 'critical' : 'damage' : 'miss');
            });
            const clip = art.fighters[id][critical ? 'critical' : 'attack'];
            const contact = clip.impactFrame * clip.frameMs;
            if (skipAt === null) {
              harness.step(contact - 1);
              assert.equal(target.hp, 30);
              assert.equal(impacts, 0);
              harness.step(contact);
              assert.equal(target.hp, hit ? 22 : 30);
              assert.equal(impacts, 1);
              assert.ok(harness.calls.some(([name, file]) => name === 'image' && file === clip.file));
            } else {
              harness.step(skipAt);
              harness.skip();
            }
            harness.step(5000);
            await pending;
            assert.equal(impacts, 1);
            assert.equal(target.hp, hit ? 22 : 30);
            assert.equal(harness.calls.some(([name]) => name === 'release' || name === 'spell-hit'), false);
            await harness.screen.end();
            assert.equal(harness.screen.active, false);
          }
        }
      }
    }
  }
  }
});

test('Ravager Maria dashes into her slash and her critical lands three slashes but one impact', async () => {
  const fighter = art.fighters['maria-ravager'];
  for (const side of [0, 1]) {
    for (const critical of [false, true]) {
      for (const skipAt of [null, 0, 600, 1500]) {
        const harness = await presenterHarness();
        const maria = { id: 'maria', name: 'Maria', classId: 'ravager', spriteSet: 'ravagerMaria', x: 0, z: 0,
          hp: 40, maxHp: 40, weapon: { id: 'steel-sword', name: 'Steel Sword', type: 'Sword' } };
        const target = { ...merfolk(), x: 1 };
        const pair = side === 0 ? [maria, target] : [target, maria];
        assert.equal(await harness.screen.begin(...pair, { enabled: true, chapter: 6 }), true);
        let impacts = 0;
        const pending = harness.screen.strike(maria, { hit: true, critical }, () => {
          impacts++;
          target.hp -= 9;
          harness.screen.result(target, '9', critical ? 'critical' : 'damage');
        });
        const timeline = timing.flurryTimeline(fighter,
          { home: side === 0 ? 130 : 350, target: side === 0 ? 350 : 130, direction: side === 0 ? 1 : -1 });
        const contact = critical ? timeline.impact : fighter.attack.impactFrame * fighter.attack.frameMs;
        if (skipAt === null) {
          if (critical) for (const time of timeline.flourishes) harness.step(time);
          harness.step(contact - 1);
          assert.equal(impacts, 0);
          assert.equal(harness.calls.filter(([name]) => name === 'steel-hit').length, critical ? 2 : 0,
            'the front and backhand slashes are flourishes before the plunge');
          harness.step(contact);
          assert.equal(impacts, 1);
          assert.equal(target.hp, 21);
          const drawn = new Set(harness.calls.filter(([name]) => name === 'image').map(([, file]) => file));
          if (critical) for (const file of [fighter.critical.file, fighter.flurry.back.file, fighter.flurry.plunge.file])
            assert.ok(drawn.has(file), file);
          else assert.ok(drawn.has(fighter.attack.file));
        } else {
          harness.step(skipAt);
          harness.skip();
        }
        harness.step(5000);
        await pending;
        assert.equal(impacts, 1);
        assert.equal(target.hp, 21);
        await harness.screen.end();
        assert.equal(harness.screen.active, false);
      }
    }
  }
});
