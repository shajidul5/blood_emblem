import { getClass } from '../characters/classes.js';
import { battleSpriteKey, staffBattleKey } from '../battle/battle-animation.js';
import { createBattleScreen } from '../battle/battle-screen.js';
import { adversaries, art, battleSetsFor, branchesFor, clipsFor, directions, effectsFor, mapClipsFor, roster,
  unitFor, weaponsFor } from './catalog.js';
import './character-gallery.css';

const urls = import.meta.glob([
  '../../assets/character/{Maria,Ravager_Maria,Bartz,Berserker_Bartz,Cyrus,Seymour,Bishop_Seymour,Stark,Sniper_Stark,Linus,Paladin_Linus,Rictor_Templar,Rictor_Mounted_Templar,Lena,Assassin_Lena,Arlan,General_Arlan,Troy,Paladin_Troy,Eveline_Troubadour,Eveline_Valkyrie,Corvis,Dark_Sage_Corvis}/**/*.png',
  '../../assets/{battle,covenant}/**/*.png',
  '../../assets/character/{Generic_Undead,Rotten}/**/*.png',
], { eager: true, query: '?url', import: 'default' });
const $ = (id) => document.getElementById(id);
const screen = createBattleScreen();
const images = new Map();
let profile = roster[0], classId = profile.classId;
let generation = 0, mapGeneration = 0;
let drawers = [], mapDrawers = [];
let paused = matchMedia('(prefers-reduced-motion: reduce)').matches;
let elapsed = 0, last = performance.now(), busy = false;

function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}

function message(text, error = false) {
  $('status').textContent = text;
  $('status').classList.toggle('error', error);
}

function report(error) {
  console.error('Character gallery:', error);
  message(error.message, true);
}

function image(url) {
  if (!url) return Promise.reject(new Error('Missing gallery artwork URL.'));
  if (!images.has(url)) images.set(url, new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => { images.delete(url); reject(new Error('Could not load gallery artwork. Reload to retry.')); };
    img.src = url;
  }));
  return images.get(url);
}

function battleUrl(file) {
  const path = file.startsWith('../covenant/') ? file.slice(3) : `battle/${file}`;
  const url = urls[`../../assets/${path}`];
  if (!url) throw new Error(`Missing gallery artwork: ${file}`);
  return url;
}

function options(select, choices) {
  select.replaceChildren(...choices.map(({ value, label }) => {
    const option = node('option', label);
    option.value = value;
    return option;
  }));
}

function canvas(size, label) {
  const result = node('canvas');
  result.width = result.height = size;
  result.setAttribute('role', 'img');
  result.setAttribute('aria-label', label);
  result.getContext('2d').imageSmoothingEnabled = false;
  return result;
}

function sheetDrawer(stage, img, clip, size, offset = elapsed) {
  const ctx = stage.getContext('2d');
  return (time) => {
    const frame = Math.floor(Math.max(0, time - offset) / clip.frameMs) % clip.frames;
    ctx.clearRect(0, 0, stage.width, stage.height);
    ctx.drawImage(img, frame * size, 0, size, size, 0, 0, stage.width, stage.height);
  };
}

async function battleCard(set, token) {
  const card = node('article', undefined, 'card');
  card.append(node('h3', `${profile.name} / ${set.weapon.type}`));
  const stage = canvas(256, `${profile.name} ${getClass(classId).name} battle animation`);
  stage.className = 'stage';
  const label = node('label', 'Animation');
  const select = node('select');
  const clips = clipsFor(set.spec);
  options(select, clips.map((clip, index) => ({ value: index, label: clip.name })));
  select.value = String(clips.findIndex((clip) => clip.name === (set.spec.idleLoop ? 'Breathing idle' : 'Attack')));
  label.append(select);
  card.append(stage, label, node('p', 'Original sheets and frame timings. Use Play combat for movement, impacts and effects.', 'subtle'));
  $('battle-art').append(card);
  let draw = () => {}, selection = 0;
  const update = async () => {
    const request = ++selection;
    const clip = clips[Number(select.value)];
    const img = await image(battleUrl(clip.file));
    if (token !== generation || request !== selection) return;
    draw = sheetDrawer(stage, img, clip, set.spec.size);
    draw(elapsed);
  };
  select.addEventListener('change', () => void update().catch(report));
  await update();
  if (token === generation) drawers.push((time) => draw(time));
}

async function effectCard(entry, token) {
  const card = node('article', undefined, 'card');
  const stage = canvas(256, `${entry.name} spell effect`);
  stage.className = 'stage';
  card.append(node('h3', entry.name), stage, node('p', `${entry.effect.element} / ${entry.spec.frames} native frames`, 'subtle'));
  $('effects').append(card);
  const img = await image(battleUrl(entry.spec.file));
  if (token !== generation) return;
  const draw = sheetDrawer(stage, img, entry.spec, entry.spec.width);
  drawers.push(draw);
  draw(elapsed);
}

function bounds(img) {
  const scratch = document.createElement('canvas');
  scratch.width = img.width;
  scratch.height = img.height;
  const ctx = scratch.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const pixels = ctx.getImageData(0, 0, img.width, img.height).data;
  let left = img.width, right = -1, top = img.height, bottom = -1;
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
    if (!pixels[(y * img.width + x) * 4 + 3]) continue;
    left = Math.min(left, x); right = Math.max(right, x);
    top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  if (right < left) throw new Error('Empty frame found in character map artwork.');
  return { left, top, width: right - left + 1, height: bottom - top + 1 };
}

async function showMap(clips, token) {
  const request = ++mapGeneration;
  mapDrawers = [];
  $('maps').replaceChildren();
  const clip = clips[Number($('map-animation').value)];
  if (!clip) throw new Error(`No map animations found for ${profile.name} / ${classId}.`);
  const groups = await Promise.all(directions.map(async (direction) => ({
    direction, frames: await Promise.all((clip.directions[direction] ?? []).map(async (frame) => {
      const img = await image(frame.url);
      return { img, ...bounds(img) };
    })),
  })));
  if (token !== generation || request !== mapGeneration) return;
  const frames = groups.flatMap((group) => group.frames);
  const largest = Math.max(...frames.map((frame) => Math.max(frame.width, frame.height)));
  const scale = Math.max(1, Math.floor(128 / largest));
  const started = elapsed;
  for (const group of groups) {
    const card = node('div', undefined, 'map');
    const stage = canvas(144, `${profile.name}: ${clip.name}, ${group.direction}`);
    const ctx = stage.getContext('2d');
    card.append(stage, node('span', group.direction));
    if (!group.frames.length) card.append(node('span', 'Not available'));
    $('maps').append(card);
    const draw = (time) => {
      ctx.clearRect(0, 0, 144, 144);
      if (!group.frames.length) return;
      const frame = group.frames[Math.floor(Math.max(0, time - started) / 120) % group.frames.length];
      ctx.drawImage(frame.img, frame.left, frame.top, frame.width, frame.height,
        Math.round((144 - frame.width * scale) / 2), 136 - frame.height * scale,
        frame.width * scale, frame.height * scale);
    };
    mapDrawers.push(draw);
    draw(elapsed);
  }
}

function selectedWeapon() {
  return weaponsFor(profile, classId).find((weapon) => weapon.id === $('weapon').value);
}

function updateCombat() {
  const weapon = selectedWeapon();
  const unit = unitFor(profile, classId, weapon);
  const support = ['Staff', 'Blood Rite'].includes(weapon.type);
  const supported = support ? staffBattleKey(unit, weapon) : battleSpriteKey(unit);
  const previous = $('range').value;
  const min = support ? 1 : weapon.minRange ?? 1;
  const max = support ? 1 : weapon.maxRange ?? 1;
  options($('range'), [...new Set([min, ...(min <= 2 && max >= 2 ? [2] : []), max])]
    .map((range) => ({ value: range, label: range === 1 ? 'Adjacent' : `${range} tiles` })));
  if ([...$('range').options].some((option) => option.value === previous)) $('range').value = previous;
  $('play').disabled = busy || !supported;
  $('result').disabled = support && !weapon.freeze;
  $('side').disabled = support;
  $('combat-note').textContent = !supported
    ? 'Dedicated battle art is not yet available for this character / weapon. Map animations and available effect sheets are shown instead.'
    : support ? 'Support previews keep the caster on the left. Healing, freeze and Blood Oath use their actual support effects.'
      : 'Includes class-compatible weapons and unlocked spells regardless of rank or campaign progress. Preview damage is illustrative, not a balance forecast.';
}

async function render() {
  const token = ++generation;
  drawers = []; mapDrawers = [];
  message(`Loading ${profile.name}...`);
  const branches = branchesFor(profile);
  const branch = branches.find((entry) => entry.classId === classId);
  $('name').textContent = profile.name;
  $('identity').textContent = adversaries.includes(profile)
    ? `${branches[0].definition.name} / Chapter 11 adversary`
    : `${branches[0].definition.name} / ${branches.length - 1} promotion ${branches.length === 2 ? 'path' : 'paths'}`;
  $('branches').replaceChildren(...branches.map((entry) => {
    const button = node('button', undefined, 'branch');
    button.type = 'button';
    button.setAttribute('aria-pressed', String(entry.classId === classId));
    const unit = unitFor(profile, entry.classId);
    const portrait = node('img');
    portrait.src = urls[`../../${unit.sprite}`];
    portrait.alt = '';
    const text = node('span');
    text.append(node('strong', entry.definition.name), node('small', entry.label));
    button.append(portrait, text);
    button.addEventListener('click', () => {
      classId = entry.classId;
      void render().catch(report);
    });
    return button;
  }));
  $('class-name').textContent = branch.definition.name;
  $('branch-label').textContent = branch.label;
  $('weapons').textContent = `${unitFor(profile, classId).type} / ${branch.definition.weaponTypes.join(' + ')}`;
  $('abilities').replaceChildren(...(branch.definition.abilities ?? []).map((ability) =>
    node('li', `${ability.name}: ${ability.description}`)));
  const gains = Object.entries(getClass(profile.classId).promotionBonuses ?? {}).filter(([, value]) => value);
  $('promotion-note').textContent = adversaries.includes(profile) ? 'Enemy battle art. Chapter layouts, enemy stats and encounter rules are unchanged.'
    : classId === profile.classId
    ? 'Choose an emblem branch above to compare its outfit, weapons, abilities and animations.'
    : `Level 20+ base-class promotion; cannot switch after promotion. Bonuses: ${gains.map(([key, value]) => `+${value} ${key === 'hp' ? 'HP' : key}`).join(', ')}.`;
  const clips = mapClipsFor(unitFor(profile, classId), urls);
  options($('map-animation'), clips.map((clip, index) => ({ value: index, label: clip.name })));
  $('map-animation').onchange = () => void showMap(clips, token).catch(report);
  $('battle-art').replaceChildren();
  $('effects').replaceChildren();
  const sets = battleSetsFor(profile, classId);
  $('battle-note').textContent = sets.length ? 'Select a clip on each card. Promotions without a dedicated set are not represented by generic battle art.'
    : 'Dedicated side-view battle animations have not been created for this class yet. All existing map sprites and animations remain available above.';
  if (!sets.length) $('battle-art').append(node('p', 'Map animations available / dedicated battle art pending.', 'panel'));
  const effects = effectsFor(profile, classId);
  if (!effects.length) $('effects').append(node('p',
    'Physical impact, arrows, bullets and thrown weapons appear in Play combat where supported. Class abilities are described above; not every ability has a separate effect sheet.', 'panel'));
  for (const ability of branch.definition.abilities ?? []) {
    const card = node('article', undefined, 'card');
    card.append(node('h3', ability.name), node('p', ability.description));
    $('effects').append(card);
  }
  options($('weapon'), weaponsFor(profile, classId).map((weapon) => ({ value: weapon.id, label: `${weapon.name} / ${weapon.type}` })));
  updateCombat();
  await Promise.all([showMap(clips, token), ...sets.map((set) => battleCard(set, token)),
    ...effects.map((effect) => effectCard(effect, token))]);
  if (token === generation) message(`${profile.name} / ${branch.definition.name}. Ready. No save data accessed.`);
}

async function play() {
  if (busy) return;
  busy = true;
  updateCombat();
  const weapon = selectedWeapon();
  const unit = unitFor(profile, classId, weapon);
  const support = ['Staff', 'Blood Rite'].includes(weapon.type);
  const healing = weapon.heal || weapon.type === 'Blood Rite';
  const target = { id: 'maria', name: healing ? 'Ally' : 'Sparring partner', classId: 'hunter',
    hp: 40, maxHp: 80, x: Number($('range').value), z: 0,
    weapon: { id: 'rapier', name: 'Rapier', type: 'Sword' } };
  const hit = (support && !weapon.freeze) || $('result').value !== 'miss';
  const critical = !support && $('result').value === 'critical';
  try {
    const pair = !support && $('side').value === 'right' ? [target, unit] : [unit, target];
    const opened = await screen.begin(...pair, {
      enabled: true, chapter: Number($('backdrop').value), staff: support ? weapon : null,
    });
    if (!opened) throw new Error('This character / weapon does not have a supported battle animation.');
    await screen.strike(unit, { hit, critical }, () => {
      let text = 'MISS', type = 'miss';
      if (hit && weapon.type === 'Blood Rite') {
        unit.hp -= 6;
        target.bloodOath = true;
        text = 'OATH'; type = 'heal';
      } else if (hit && weapon.heal) {
        target.hp += Math.min(weapon.heal, target.maxHp - target.hp);
        text = 'HEAL'; type = 'heal';
      } else if (hit && weapon.freeze) {
        text = 'FROZEN'; type = 'freeze';
      } else if (hit) {
        const damage = critical ? 24 : 12;
        target.hp -= damage;
        text = `-${damage}`; type = critical ? 'critical' : 'hit';
      }
      screen.result(target, text, type);
    });
    message(`${unit.name} / ${weapon.name}: ${hit ? 'preview complete' : 'miss'}.`);
  } finally {
    await screen.end();
    busy = false;
    updateCombat();
  }
}

function updatePause() {
  $('pause').textContent = paused ? 'Resume loops' : 'Pause loops';
  $('pause').setAttribute('aria-pressed', String(paused));
}
$('pause').addEventListener('click', () => { paused = !paused; updatePause(); });
$('weapon').addEventListener('change', updateCombat);
$('play').addEventListener('click', () => void play().catch(report));
for (const [label, entries] of [['Playable company', roster], ['Chapter 11 adversaries', adversaries]]) {
  const group = node('optgroup');
  group.label = label;
  for (const entry of entries) {
    const option = node('option', entry.name);
    option.value = entry.id;
    group.append(option);
  }
  $('character').append(group);
}
$('character').addEventListener('change', () => {
  profile = [...roster, ...adversaries].find((entry) => entry.id === $('character').value);
  classId = profile.classId;
  void render().catch(report);
});
function tick(now) {
  if (!paused && !document.hidden && !screen.active) elapsed += Math.min(now - last, 100);
  last = now;
  if (!document.hidden && !screen.active) for (const draw of [...drawers, ...mapDrawers]) draw(elapsed);
  requestAnimationFrame(tick);
}
updatePause();
requestAnimationFrame(tick);
void render().catch(report);
