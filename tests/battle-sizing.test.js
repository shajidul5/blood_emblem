import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { inflateSync } from 'node:zlib';
import { battleActorScale, scaledBattleClip, BATTLE_BODY_HEIGHT,
  MOUNTED_BATTLE_BODY_HEIGHT } from '../src/battle/battle-sizing.js';
import { flurryTimeline, flurryPose } from '../src/battle/battle-animation.js';

const art = JSON.parse(await readFile(new URL('../assets/battle/manifest.json', import.meta.url)));
const monsters = new Set(['deep-merfolk', 'merfolk', 'feral-wolf', 'great-wolf', 'liam',
  'bell-envoy', 'crowman', 'raven', 'generic-wolfman', 'generic-undead', 'rotten', 'blood-beast']);
const humans = Object.entries(art.fighters).filter(([key]) => !monsters.has(key));

async function opaqueRow(file, row) {
  const png = await readFile(new URL(`../assets/battle/${file}`, import.meta.url));
  const width = png.readUInt32BE(16), chunks = [];
  assert.equal(png[24], 8);
  const channels = { 2: 3, 6: 4 }[png[25]];
  assert.ok(channels, `supported PNG format: ${file}`);
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset);
    if (png.toString('ascii', offset + 4, offset + 8) === 'IDAT')
      chunks.push(png.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  const raw = inflateSync(Buffer.concat(chunks)), stride = width * channels;
  let previous = Buffer.alloc(stride);
  for (let y = 0; y <= row; y++) {
    const filter = raw[y * (stride + 1)];
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? line[i - channels] : 0, b = previous[i];
      const c = i >= channels ? previous[i - channels] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const predictor = [0, a, b, Math.floor((a + b) / 2), pa <= pb && pa <= pc ? a : pb <= pc ? b : c][filter];
      assert.notEqual(predictor, undefined);
      line[i] = (line[i] + predictor) & 255;
    }
    previous = line;
  }
  return channels === 3 || Array.from({ length: width }, (_, x) => previous[x * 4 + 3]).some((alpha) => alpha > 16);
}

test('every ordinary ally and enemy has a visible body landmark and a common rendered height', async () => {
  assert.equal(humans.length, 58, 'all supported human identities and weapon sets are covered');
  for (const [key, fighter] of humans) {
    assert.ok(Number.isInteger(fighter.bodyTop), `${key}: required authored body landmark`);
    assert.ok(await opaqueRow(fighter.idle, fighter.bodyTop), `${key}: landmark is on visible artwork`);
    if (fighter.staff) assert.ok(await opaqueRow(fighter.staff.idle, fighter.bodyTop), `${key}: visible staff body`);
    const expected = fighter.mounted ? MOUNTED_BATTLE_BODY_HEIGHT : BATTLE_BODY_HEIGHT;
    for (const side of ['ally', 'enemy']) {
      const scale = battleActorScale(fighter, { id: key, team: side });
      assert.ok(Math.abs((fighter.baseline - fighter.bodyTop) * 2 * scale - expected) < .00001, key);
      assert.ok(233 - expected >= 64, `${key}: body clears the battle HUD`);
    }
  }
});

test('Rictor, Arlan, Lena and casters match generic infantry instead of using smaller authored scales', () => {
  const keys = ['rictor-oathkeeper', 'rictor-oathbound-lance', 'rictor-oathbound-sword',
    'rictor-oathbound-dark', 'arlan-knight', 'arlan-general-spear', 'arlan-general-axe',
    'lena-thief', 'lena-assassin-sword', 'lena-assassin-bow', 'serra-mage', 'serra-sage',
    'generic-knight', 'generic-soldier', 'generic-general-spear', 'generic-general-axe',
    'generic-mage', 'generic-sage'];
  for (const key of keys) {
    const fighter = art.fighters[key];
    assert.equal(fighter.mounted, undefined);
    const height = (fighter.baseline - fighter.bodyTop) * 2 * battleActorScale(fighter, { id: key });
    assert.ok(Math.abs(height - 130) < .00001, `${key}: actual body height ${height}`);
  }
  assert.ok(battleActorScale(art.fighters['arlan-knight'], { id: 'arlan' }) > art.fighters['arlan-knight'].scale);
  assert.ok(battleActorScale(art.fighters['generic-sage'], { id: 'church-sage' }) < art.fighters['generic-sage'].scale);
});

test('mounted allies and generics match across weapon sets while bosses and monsters keep their exception', () => {
  for (const [key, fighter] of humans) {
    const normal = battleActorScale(fighter, { id: key });
    const boss = battleActorScale(fighter, { id: key, isBoss: true });
    assert.ok(Math.abs(boss / normal - 1.12) < .00001, key);
  }
  for (const key of monsters) {
    const fighter = art.fighters[key];
    assert.equal(fighter.bodyTop, undefined, `${key}: no human normalization`);
    assert.equal(battleActorScale(fighter, { id: key }), fighter.scale ?? 1);
  }
  for (const classId of ['merfolk', 'deep-merfolk']) {
    const fighter = art.fighters[classId];
    assert.equal(battleActorScale(fighter, { id: classId, classId, isBoss: true }), (fighter.scale ?? 1) * 1.12);
  }
});

test('scaled melee and critical contacts still hit the opponent from either side without mutating clips', () => {
  for (const [key, fighter] of humans) {
    if (fighter.supportOnly || fighter.casting) continue;
    for (const isBoss of [false, true]) {
      const scale = battleActorScale(fighter, { id: key, isBoss });
      for (const kind of ['attack', 'critical']) {
        const source = fighter[kind], before = structuredClone(source);
        const clip = scaledBattleClip(fighter, source, scale);
        const reach = clip.advance + (clip.contact.x - fighter.anchorX) * 2 * scale;
        assert.ok(Math.abs(reach - 208) < .00001, `${key} ${kind}: weapon hits body, not empty space`);
        assert.ok(Math.abs(130 + reach - (350 - 12)) < .00001);
        assert.ok(Math.abs(350 - reach - (130 + 12)) < .00001);
        const y = 233 - (fighter.baseline - clip.contact.y) * 2 * scale;
        assert.ok(y >= 87 && y <= 233, `${key} ${kind}: impact remains within opposing body`);
        assert.deepEqual(source, before);
      }
    }
  }
});

test('Ravager flurry accounts for normalized scale in its front slash and final plunging contact', () => {
  const fighter = art.fighters['maria-ravager'], scale = battleActorScale(fighter, { id: 'maria' });
  const adjusted = { ...fighter, critical: scaledBattleClip(fighter, fighter.critical, scale) };
  for (const direction of [1, -1]) {
    const home = direction === 1 ? 130 : 350, target = direction === 1 ? 350 : 130;
    const timeline = flurryTimeline(adjusted, { home, target, direction, scale: 2 * scale });
    const pose = flurryPose(fighter, timeline, timeline.impact);
    assert.equal(pose.contact, true);
    assert.ok(Math.abs(pose.x + direction * (fighter.flurry.plunge.contact.x - fighter.anchorX) * 2 * scale -
      (target - direction * 12)) < .00001);
    assert.ok(Math.abs(timeline.frontAnchor + direction * (fighter.critical.contact.x - fighter.anchorX) * 2 * scale -
      (target - direction * 12)) < .00001);
    assert.deepEqual(timeline.flourishes.length, 2);
  }
});

test('invalid normalization metadata fails explicitly instead of silently choosing an arbitrary size', () => {
  for (const bodyTop of [-1, NaN, 100, 101])
    assert.throws(() => battleActorScale({ bodyTop, baseline: 100 }, { id: 'bad-art' }), /Invalid battle body landmark/);
});
