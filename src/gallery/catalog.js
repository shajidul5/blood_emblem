import { applyClass, getClass, getPromotionBonuses } from '../characters/classes.js';
import { battleSpriteKey, staffBattleKey } from '../battle/battle-animation.js';
import { spellEffectFor, staffEffectFor } from '../battle/spell-animation.js';
import { BLOOD_OATH } from '../game/covenant.js';
import art from '../../assets/battle/manifest.json';
import undead from '../../data/characters/undead.json';
import rotten from '../../data/characters/rotten.json';
import genericPaladin from '../../data/characters/cathedral-paladin.json';
import genericGeneral from '../../data/characters/cathedral-general.json';
import genericSage from '../../data/characters/church-sage.json';

const profiles = import.meta.glob('../../data/characters/{maria,bartz,cypher,seymour,stark,linus,leon,rictor,lena,arlan,serra,troy,eveline,corvis}.json',
  { eager: true, import: 'default' });
const weaponData = Object.values(import.meta.glob('../../data/weapons/*.json', { eager: true, import: 'default' }));
const rosterOrder = ['maria', 'bartz', 'cypher', 'seymour', 'stark', 'linus', 'leon', 'rictor', 'lena', 'arlan', 'serra', 'troy', 'eveline', 'corvis'];
const shoreAdversaries = Object.values(import.meta.glob(
  '../../data/characters/shore-{unmoored-duelist,tidebound-sentinel,keelbreaker,horizon-watcher,storm-custodian,horizon-keeper,crowman}.json',
  { eager: true, import: 'default' }));

export const roster = Object.values(profiles).sort((a, b) => rosterOrder.indexOf(a.id) - rosterOrder.indexOf(b.id));
export const adversaries = [undead, rotten, genericPaladin, genericGeneral, genericSage, ...shoreAdversaries];
export { art };
export const directions = ['south', 'south-east', 'east', 'north-east', 'north', 'north-west', 'west', 'south-west'];

export function branchesFor(profile) {
  const base = getClass(profile.classId);
  return [
    { classId: base.id, label: 'Base class' },
    ...(base.promotesTo ? [{ classId: base.promotesTo, label: 'Orders Emblem' }] : []),
    ...(base.covenantPromotions?.[profile.id]
      ? [{ classId: base.covenantPromotions[profile.id], label: 'Covenant Emblem' }] : []),
  ].map((branch) => ({ ...branch, definition: getClass(branch.classId) }));
}

export function unitFor(profile, classId, weapon = null) {
  const base = getClass(profile.classId);
  if (!branchesFor(profile).some((branch) => branch.classId === classId))
    throw new Error(`Unknown promotion branch for ${profile.name}: ${classId}`);
  const unit = { ...profile, weaponExp: { ...profile.weaponExp }, ...profile.currentStats, maxHp: profile.currentStats.hp, x: 0, z: 0, weapon };
  if (classId !== base.id) {
    for (const [stat, bonus] of Object.entries(getPromotionBonuses(base.id, classId))) unit[stat] += bonus;
    unit.maxHp = unit.hp;
  }
  applyClass(unit, classId);
  return unit;
}

export function weaponsFor(profile, classId) {
  const definition = getClass(classId);
  const weapons = weaponData.filter((weapon) => definition.weaponTypes.includes(weapon.type) &&
    (!['undead', 'rotten'].includes(profile.id) || weapon.id === profile.weaponId) &&
    (!profile.id.startsWith('shore-') || weapon.id === profile.weaponId) &&
    (!weapon.exclusiveTo || weapon.exclusiveTo === profile.id));
  weapons.sort((a, b) => Number(b.id === profile.weaponId) - Number(a.id === profile.weaponId) ||
    a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
  if (definition.abilities?.some((ability) => ability.bloodOath)) weapons.push(BLOOD_OATH);
  return weapons;
}

export function battleSetsFor(profile, classId) {
  const sets = new Map();
  for (const weapon of weaponsFor(profile, classId)) {
    const unit = unitFor(profile, classId, weapon);
    const offensive = battleSpriteKey(unit);
    const key = offensive ?? staffBattleKey(unit, weapon);
    const existing = sets.get(key);
    if (key && (!existing || offensive && staffEffectFor(existing.weapon)))
      sets.set(key, { key, weapon, spec: art.fighters[key] });
  }
  return [...sets.values()];
}

export function clipsFor(spec) {
  return [
    { name: 'Idle', file: spec.idle, frames: 1, frameMs: 120 },
    ...(spec.idleLoop ? [{ name: 'Breathing idle', ...spec.idleLoop }] : []),
    ...(spec.supportOnly ? [] : [{ name: 'Attack', ...spec.attack }, { name: 'Critical', ...spec.critical }]),
    ...Object.entries(spec.thrown ?? {}).map(([kind, clip]) => ({ name: `Throw / ${kind}`, ...clip })),
    ...['back', 'plunge'].filter((kind) => spec.flurry?.[kind])
      .map((kind) => ({ name: `Critical / ${kind}`, ...spec.flurry[kind] })),
    ...(spec.staff ? [{ name: 'Support idle', file: spec.staff.idle, frames: 1, frameMs: 120 },
      { name: 'Support cast', ...spec.staff.cast }] : []),
  ];
}

export function effectsFor(profile, classId) {
  const effects = new Map();
  for (const weapon of weaponsFor(profile, classId)) {
    const effect = spellEffectFor(weapon) ?? staffEffectFor(weapon);
    if (effect && !effects.has(effect.key)) effects.set(effect.key, {
      name: weapon.name, effect, spec: art.spells[effect.key],
    });
  }
  return [...effects.values()];
}

export function mapClipsFor(unit, urls) {
  const root = `../../${unit.sprite.slice(0, unit.sprite.lastIndexOf('/rotations/'))}/`;
  // Maria's original attack set lives beside Idle rather than within it.
  const extra = unit.id === 'maria' && unit.classId === 'hunter'
    ? '../../assets/character/Maria/attacking_with_katan/' : null;
  const groups = new Map();
  for (const [path, url] of Object.entries(urls)) {
    if (!path.startsWith(root) && !(extra && path.startsWith(extra))) continue;
    const match = path.match(/^(.*\/(?:rotations|animations\/[^/]+))\/([^/]+?)(?:\/frame_\d+)?\.png$/);
    if (!match || !directions.includes(match[2])) continue;
    const [, group, direction] = match;
    const fromExtra = extra && group.startsWith(extra);
    const relative = group.slice(fromExtra ? extra.length : root.length);
    const label = relative.replace(/\/?rotations$/, ' idle').replace('animations/', '').replaceAll('_', ' ').trim();
    if (!groups.has(group)) groups.set(group, {
      name: group === `${root}rotations` ? 'Idle' : fromExtra
        ? `Katana / ${group.endsWith('/rotations') ? 'Idle' : 'Attack'}`
        : label.length > 65 ? `${label.slice(0, 62)}...` : label,
      directions: {},
    });
    const clip = groups.get(group);
    (clip.directions[direction] ??= []).push({ path, url });
  }
  for (const clip of groups.values())
    for (const frames of Object.values(clip.directions)) frames.sort((a, b) => a.path.localeCompare(b.path));
  return [...groups.values()].sort((a, b) => Number(b.name === 'Idle') - Number(a.name === 'Idle') || a.name.localeCompare(b.name));
}
