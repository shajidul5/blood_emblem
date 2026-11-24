import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

const root = new URL('../assets/covenant/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', root), 'utf8'));
const json = (file) => JSON.parse(readFileSync(new URL(file, import.meta.url), 'utf8'));
const directions = ['south', 'south-east', 'east', 'north-east', 'north', 'north-west', 'west', 'south-west'];

function image(file, base = root) {
  assert.ok(!file.includes('..') && !file.startsWith('/'), 'asset paths stay inside the package');
  const png = readFileSync(new URL(file, base));
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', file);
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
  assert.equal(png[24], 8, `${file}: 8-bit image`);
  assert.equal(png[25], 6, `${file}: RGBA transparency`);
  assert.equal(png[28], 0, `${file}: no interlacing`);
  const chunks = [];
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset);
    if (png.toString('ascii', offset + 4, offset + 8) === 'IDAT')
      chunks.push(png.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  const raw = inflateSync(Buffer.concat(chunks));
  const stride = width * 4, pixels = Buffer.alloc(stride * height);
  assert.equal(raw.length, (stride + 1) * height, file);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    assert.ok(filter <= 4, `${file}: supported PNG filter`);
    for (let x = 0; x < stride; x++) {
      const offset = y * stride + x;
      const left = x >= 4 ? pixels[offset - 4] : 0;
      const up = y ? pixels[offset - stride] : 0;
      const upperLeft = y && x >= 4 ? pixels[offset - stride - 4] : 0;
      const p = left + up - upperLeft;
      const distances = [Math.abs(p - left), Math.abs(p - up), Math.abs(p - upperLeft)];
      const paeth = distances[0] <= distances[1] && distances[0] <= distances[2]
        ? left : distances[1] <= distances[2] ? up : upperLeft;
      const prediction = [0, left, up, Math.floor((left + up) / 2), paeth][filter];
      pixels[offset] = (raw[y * (stride + 1) + x + 1] + prediction) & 255;
    }
  }
  return { width, height, pixels };
}

function visibleFrame(png, size, frame = 0) {
  let visible = 0;
  for (let y = 0; y < png.height; y++)
    for (let x = frame * size; x < (frame + 1) * size; x++)
      if (png.pixels[(y * png.width + x) * 4 + 3]) visible++;
  assert.ok(visible > 40, `frame ${frame} contains visible art`);
  assert.ok(visible < size * png.height, `frame ${frame} retains transparent background`);
}

function bounds(png) {
  let left = png.width, top = png.height, right = -1, bottom = -1;
  for (let y = 0; y < png.height; y++) for (let x = 0; x < png.width; x++) {
    if (!png.pixels[(y * png.width + x) * 4 + 3]) continue;
    left = Math.min(left, x); top = Math.min(top, y);
    right = Math.max(right, x); bottom = Math.max(bottom, y);
  }
  return { width: right - left + 1, height: bottom - top + 1 };
}

test('Covenant package enables both classes using the approved art without replacing base-class art', () => {
  assert.equal(manifest.status, 'implemented');
  assert.equal(manifest.runtimeEnabled, true);
  assert.deepEqual(Object.keys(manifest.fighters).sort(), ['bloodsworn', 'veilstalker']);
  const classes = json('../data/classes.json');
  const runtime = json('../assets/battle/manifest.json');
  for (const [id, fighter] of Object.entries(manifest.fighters)) {
    assert.ok(classes.classes.some((entry) => entry.id === id), `${id} is a playable class`);
    const active = runtime.fighters[`${fighter.unitId}-${id}`];
    assert.ok(active);
    if (id === 'veilstalker') {
      assert.equal(`assets/battle/${active.idle}`, fighter.map.battleReference);
      for (const kind of ['attack', 'critical'])
        assert.notEqual(active[kind].file, `../covenant/${fighter.battle[kind].file}`);
      continue;
    }
    assert.equal(active.idle, `../covenant/${fighter.battle.idle}`);
    for (const kind of ['attack', 'critical']) {
      assert.equal(active[kind].file, `../covenant/${fighter.battle[kind].file}`);
      assert.equal(active[kind].job, fighter.battle[kind].job);
      assert.equal(active[kind].impactFrame, fighter.battle[kind].impactFrame);
    }
  }
  assert.ok(runtime.fighters['linus-cavalier-lance'] && runtime.fighters['linus-paladin-lance']);
  assert.ok(runtime.fighters['stark-archer'] && runtime.fighters['stark-sniper']);
});

for (const [id, fighter] of Object.entries(manifest.fighters)) {
  test(`${id} has roster-scaled PixelLab facings and complete walking loops`, () => {
    const map = fighter.map;
    assert.deepEqual(map.directions, directions);
    assert.deepEqual(Object.keys(map.rotations).sort(), [...directions].sort());
    assert.deepEqual(Object.keys(map.animations.Walking).sort(), [...directions].sort());
    assert.equal(map.generator, 'PixelLab');
    if (id === 'bloodsworn') {
      assert.equal(map.method, 'edit_image + transfer_outfit');
      assert.ok(map.rotationJob);
    } else {
      assert.ok(map.characterId && map.walkingGroupId && map.attackGroupId);
      assert.equal(map.styleReference, 'assets/character/Maria/Idle/rotations/south.png');
      assert.ok(map.sourceImageJob);
    }
    assert.ok(map.walkingJobs.length);
    assert.equal(map.sourceSpriteFolder, `assets/character/${id === 'bloodsworn' ? 'Linus' : 'Stark'}`);
    assert.deepEqual(map.size, { width: 48, height: 48 });
    const repository = new URL('../', import.meta.url);
    for (const direction of directions) {
      const rotation = image(map.rotations[direction]);
      const source = image(`${map.sourceSpriteFolder}/rotations/${direction}.png`, repository);
      assert.equal(rotation.width, map.size.width);
      assert.equal(rotation.height, map.size.height);
      assert.equal(rotation.width, source.width, 'keep the roster native canvas, not an enlarged chibi redraw');
      assert.equal(rotation.height, source.height);
      visibleFrame(rotation, rotation.width);
      const actual = bounds(rotation), original = bounds(source);
      if (!map.archived) {
        assert.ok(Math.abs(actual.width - original.width) <= 8, `${direction}: retain roster silhouette width`);
        assert.ok(Math.abs(actual.height - original.height) <= 8, `${direction}: retain roster silhouette height`);
      }
      const frames = map.animations.Walking[direction];
      const sourceDirectory = `${map.sourceSpriteFolder}/animations/Walking/${direction}/`;
      const originalFrames = map.archived ? [] : readdirSync(new URL(sourceDirectory, repository)).filter(file => file.endsWith('.png')).sort();
      if (!map.archived) assert.equal(frames.length, originalFrames.length, 'retain every original walking pose');
      assert.equal(frames.length, map.walkingFrames);
      const unique = new Set();
      for (const [index, file] of frames.entries()) {
        const png = image(file);
        assert.equal(png.width, map.walkingSize.width);
        assert.equal(png.height, map.walkingSize.height);
        if (!map.archived) {
          const sourceFrame = image(sourceDirectory + originalFrames[index], repository);
          assert.equal(png.width, sourceFrame.width, 'restore source padding without resampling');
          assert.equal(png.height, sourceFrame.height);
        }
        visibleFrame(png, png.width);
        unique.add(png.pixels.toString('base64'));
      }
      assert.ok(unique.size > 1, `${direction} walking actually moves`);
    }
  });

  test(`${id} battle clips retain native frames, distinct criticals and in-range cue timings`, () => {
    const battle = fighter.battle;
    const idle = image(battle.idle);
    assert.equal(idle.width, 128);
    assert.equal(idle.height, 128);
    visibleFrame(idle, 128);
    assert.notEqual(battle.attack.job, battle.critical.job);
    assert.notEqual(battle.attack.file, battle.critical.file);
    assert.equal(battle.attack.frames, 25);
    assert.equal(battle.critical.frames, 33);
    assert.equal(battle.idleLoop.frames, 9);
    const clips = [battle.idleLoop, battle.attack, battle.critical,
      ...Object.values(battle.thrown ?? {}), ...(battle.bloodOath ? [battle.bloodOath] : [])];
    for (const clip of clips) {
      const png = image(clip.file);
      assert.equal(png.width, battle.size * clip.frames, clip.file);
      assert.equal(png.height, battle.size, clip.file);
      assert.ok(clip.job && clip.frameMs > 0);
      for (let frame = 0; frame < clip.frames; frame++) visibleFrame(png, battle.size, frame);
      if (clip.impactFrame !== undefined)
        assert.ok(clip.impactFrame >= 0 && clip.impactFrame < clip.frames);
      if (clip.catchFrame !== undefined)
        assert.ok(clip.catchFrame > clip.impactFrame && clip.catchFrame < clip.frames);
    }
  });
}

test('Bloodsworn includes separate support and two throw/catch clips; Veilstalker keeps ranged attacks', () => {
  const { bloodsworn, veilstalker } = manifest.fighters;
  const battle = bloodsworn.battle;
  assert.equal(bloodsworn.unitId, 'linus');
  assert.equal(veilstalker.unitId, 'stark');
  assert.equal(battle.bloodOath.casting, true);
  assert.notEqual(battle.bloodOath.job, battle.attack.job);
  assert.notEqual(battle.thrown.attack.job, battle.thrown.critical.job);
  assert.equal(veilstalker.battle.casting, true);
  assert.equal(veilstalker.battle.attack.advance, 0);
  for (const clip of [battle.attack, battle.critical])
    assert.equal(clip.advance + (clip.contact.x - battle.anchorX) * 2, 208);
});
