// Builds docs/item-guide.md from the item, weapon and upgrade data. Run: npm run item-guide
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const readJson = (path) => JSON.parse(readFileSync(new URL(path, root), 'utf8'));
const readDir = (dir) => readdirSync(new URL(dir, root)).filter((file) => file.endsWith('.json')).map((file) => readJson(`${dir}/${file}`));

const items = readDir('data/items');
const weapons = readDir('data/weapons');
const upgrades = readJson('data/upgrades.json');
const characters = Object.fromEntries(readDir('data/characters').map((character) => [character.id, character.name]));
const weaponById = Object.fromEntries(weapons.map((weapon) => [weapon.id, weapon]));

// Natural weapons that only monsters wield never appear in a player's hands.
const ENEMY_TYPES = new Set(['Claw', 'Root', 'Cargo']);
const ENEMY_WEAPONS = new Set(['tentacle', 'crow-greatsword']);
const TYPE_ORDER = ['Sword', 'Spear', 'Axe', 'Bow', 'Gun', 'Anima', 'Light', 'Dark', 'Staff'];
const RANKS = ['E', 'D', 'C', 'B', 'A', 'S'];
const STATS = {
  'hp-up': 'Max HP', 'strength-up': 'Strength', 'magic-up': 'Magic', 'dexterity-up': 'Dexterity', 'speed-up': 'Speed',
  'luck-up': 'Luck', 'defense-up': 'Defense', 'resistance-up': 'Resistance', 'movement-up': 'Movement', 'build-up': 'Build',
};
const EFFECTIVE = { armor: 'armored', undead: 'undead', beast: 'beast', aqua: 'aquatic', flying: 'flying', cavalry: 'cavalry' };

const cell = (text) => String(text).replace(/\|/g, '\\|').replace(/\n/g, ' ');
const list = (words) => words.length < 2 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`;
const range = (weapon) => weapon.rangeFromMagic
  ? `1–Mag/${weapon.rangeFromMagic}`
  : weapon.minRange === weapon.maxRange ? `${weapon.maxRange}` : `${weapon.minRange}–${weapon.maxRange}`;

function consumableEffect(item) {
  if (STATS[item.effect]) return `Permanently raises ${STATS[item.effect]} by ${item.amount ?? 2}.`;
  if (item.effect === 'weapon-rank-up') return 'Raises the user\'s rank in their equipped weapon type by one (E→D→C→B→A→S). Cannot be used at S rank or without a weapon.';
  if (item.insight) return `Read to gain ${item.insight} Insight.`;
  if (item.heal) return `Restores ${item.heal} HP.`;
  return item.description ?? '—';
}

const CONSUMABLE_GROUPS = [
  ['Recovery', (item) => item.heal],
  ['Stat Boosters', (item) => STATS[item.effect] || item.effect === 'weapon-rank-up'],
  ['Insight', (item) => item.insight],
  ['Promotion and Key Items', () => true],
];

function weaponMechanics(weapon) {
  const notes = [];
  const said = (word) => weapon.description?.toLowerCase().includes(word);
  if (weapon.effect?.length && !said('effective')) {
    notes.push(`Effective against ${list(weapon.effect.map((tag) => EFFECTIVE[tag] ?? tag))} foes (triple might).`);
  }
  if (weapon.description) notes.push(weapon.description);
  else {
    if (weapon.brave) notes.push('Strikes twice in a row.');
    if (weapon.reaves) notes.push(`Reverses the weapon triangle against ${list(weapon.reaves)} users.`);
    if (weapon.lifeSteal) notes.push(`Restores HP equal to ${weapon.lifeSteal * 100}% of the damage dealt.`);
    if (weapon.halvesResistance) notes.push("Halves the target's Resistance.");
    if (weapon.heal) notes.push(`Heals an ally for ${weapon.heal} + Magic HP.`);
    if (weapon.freeze) notes.push(`Freezes a foe in place for ${weapon.freezeTurns ?? 1} turn${(weapon.freezeTurns ?? 1) === 1 ? '' : 's'}.`);
  }
  if (weapon.heal && weapon.description) notes.push(`Heals ${weapon.heal} + Magic HP.`);
  if (weapon.exclusiveTo && !said(' only')) notes.push(`${characters[weapon.exclusiveTo] ?? weapon.exclusiveTo} only.`);
  return notes.length ? notes.join(' ') : '—';
}

function upgradePath(weapon) {
  const evolution = upgrades.evolutions[weapon.id];
  if (evolution) return `Evolves into **${weaponById[evolution.into].name}** for ${evolution.cost} Insight.`;
  const evolvedFrom = Object.entries(upgrades.evolutions).find(([, next]) => next.into === weapon.id);
  if (evolvedFrom) return `Evolved form of **${weaponById[evolvedFrom[0]].name}**.`;
  const spells = upgrades.spellbooks[weapon.id];
  if (spells) {
    const steps = spells.map((id, index) => `**${weaponById[id].name}** (${upgrades.spellCosts[index]} Insight, rank ${weaponById[id].requiredRank})`);
    return `Unlocks ${steps.join(', then ')} in the same book.`;
  }
  if (weapon.spellbook) {
    return `Tier ${weapon.tier} spell written in **${weaponById[weapon.spellbook].name}**; costs ${upgrades.spellCosts[weapon.tier - 2]} Insight to unlock.`;
  }
  return '—';
}

const lines = [
  '# Blood Emblem Item Guide',
  '',
  '> Generated from `data/items`, `data/weapons` and `data/upgrades.json` by `npm run item-guide`. Edit the data, then regenerate.',
  '',
  'Insight is spent from the Preparations **Insight** screen. Every item that grants Insight grants **10**.',
  '',
  '## Consumables',
  '',
];

const remaining = [...items].sort((a, b) => a.name.localeCompare(b.name));
for (const [title, belongs] of CONSUMABLE_GROUPS) {
  const group = remaining.filter(belongs);
  for (const item of group) remaining.splice(remaining.indexOf(item), 1);
  if (!group.length) continue;
  lines.push(`### ${title}`, '', '| Item | Effect | Uses | Lore |', '| --- | --- | --- | --- |');
  for (const item of group) {
    const bound = item.bound ? ' (bound)' : '';
    lines.push(`| **${cell(item.name)}**${bound} | ${cell(consumableEffect(item))} | ${item.maxUses ?? 1} | ${cell(item.lore ?? '')} |`);
  }
  lines.push('');
}

lines.push(
  '## Weapons',
  '',
  'Only weapons the party can wield are listed; monsters\' natural weapons are omitted. **Rank** is the weapon level needed to equip it (E needs no training). Physical weapons without a use count never break. Tome and staff uses scale with the wielder\'s class.',
  '',
);

const playerWeapons = weapons.filter((weapon) => !ENEMY_TYPES.has(weapon.type) && !ENEMY_WEAPONS.has(weapon.id));
const unknownTypes = [...new Set(playerWeapons.map((weapon) => weapon.type))].filter((type) => !TYPE_ORDER.includes(type));
if (unknownTypes.length) throw new Error(`Add weapon types to TYPE_ORDER: ${unknownTypes.join(', ')}`);
for (const type of TYPE_ORDER) {
  const group = playerWeapons
    .filter((weapon) => weapon.type === type)
    .sort((a, b) => RANKS.indexOf(a.requiredRank ?? 'E') - RANKS.indexOf(b.requiredRank ?? 'E') || a.might - b.might || a.name.localeCompare(b.name));
  if (!group.length) continue;
  lines.push(`### ${type}`, '', '| Weapon | Rank | Mt | Hit | Crit | Wt | Range | Uses | Effect | Upgrades |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const weapon of group) {
    lines.push(`| **${cell(weapon.name)}** | ${weapon.requiredRank ?? 'E'} | ${weapon.type === 'Staff' ? '—' : weapon.might} | ${weapon.hit} | ${weapon.critical} | ${weapon.weight} | ${range(weapon)} | ${weapon.maxUses ?? '—'} | ${cell(weaponMechanics(weapon))} | ${cell(upgradePath(weapon))} |`);
  }
  lines.push('', '<details><summary>Lore</summary>', '');
  for (const weapon of group) lines.push(`- **${weapon.name}:** ${weapon.lore ?? '—'}`);
  lines.push('', '</details>', '');
}

writeFileSync(new URL('docs/item-guide.md', root), `${lines.join('\n').trimEnd()}\n`);
console.log(`Wrote docs/item-guide.md (${items.length} consumables, ${playerWeapons.length} weapons).`);
