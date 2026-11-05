import { attackSpeed, getAvoid, getHitRate, weaponRangeLabel } from '../battle/combat.js';
import { getWeaponExp, getWeaponRank, MAX_WEAPON_EXP, rankForExp, WEAPON_RANKS } from './weapon-levels.js';

function formatWeaponLevel(unit, weapon) {
  if (!weapon.type || weapon.type === '—') return '—';
  const rank = getWeaponRank(unit, weapon);
  const exp = getWeaponExp(unit, weapon.type);
  const next = WEAPON_RANKS[WEAPON_RANKS.indexOf(rankForExp(exp)) + 1];
  const progress = exp >= MAX_WEAPON_EXP ? 'MAX' : `${exp}/${next.exp}`;
  return `${rank.id} (${progress}) · +${rank.hit} Hit, +${rank.avoid} Avoid`;
}

const PORTRAITS = import.meta.glob(
  ['../../assets/character/*/Idle/rotations/south.png', '../../assets/character/*/rotations/south.png'],
  { eager: true, query: '?url', import: 'default' },
);

export function portraitUrl(unit) {
  return unit.sprite ? PORTRAITS[`../../${unit.sprite}`] : undefined;
}

const STAT_ROWS = [
  ['HP', 'hp'],
  ['Strength', 'strength'],
  ['Magic', 'magic'],
  ['Dexterity', 'dexterity'],
  ['Speed', 'speed'],
  ['Luck', 'luck'],
  ['Defense', 'defense'],
  ['Resistance', 'resistance'],
  ['Movement', 'movement'],
  ['Build', 'build'],
];

export function createProfileDialog(dialog) {
  const statsBody = dialog.querySelector('#profile-stats');
  const weaponDetails = dialog.querySelector('#profile-weapon');

  function show(unit, opponent, terrain, opponentTerrain) {
    dialog.querySelector('#profile-heading').textContent = unit.name;
    dialog.querySelector('#profile-class').textContent =
      `${unit.isBoss ? 'Boss · ' : ''}${unit.class}${unit.type ? ` · ${unit.type}` : ''}`;
    dialog.querySelector('#profile-level').textContent =
      `Level ${unit.level} · ${unit.experience} EXP`;
    const portrait = dialog.querySelector('#profile-portrait');
    const url = portraitUrl(unit);
    portrait.hidden = !url;
    if (url) portrait.src = url;
    portrait.alt = `${unit.name} portrait`;
    statsBody.replaceChildren();

    for (const [label, key] of STAT_ROWS) {
      const row = document.createElement('tr');
      const name = document.createElement('th');
      name.scope = 'row';
      name.textContent = label;
      const base = document.createElement('td');
      base.textContent = unit.baseStats[key];
      const current = document.createElement('td');
      current.textContent = key === 'hp'
        ? `${unit.hp}/${unit.maxHp}`
        : unit[key];
      const growth = document.createElement('td');
      growth.textContent = `${unit.growthRates[key]}%`;
      row.append(name, base, current, growth);
      statsBody.append(row);
    }

  const weapon = unit.weapon ?? {
    name: 'Unarmed', type: '—', effect: [], might: 0, weight: 0, hit: 0, critical: 0, minRange: 0, maxRange: 0,
  };
    weaponDetails.replaceChildren();
    const combatStats = [
      ['Weapon', weapon.name],
      ['Type', weapon.type],
      ['Weapon Level', unit.weaponExp ? formatWeaponLevel(unit, weapon) : '—'],
      ['Effective vs', weapon.effect?.length ? weapon.effect.join(', ') : '—'],
      ['Might', weapon.might],
      ['Weight', weapon.weight],
      ['Hit', `${weapon.hit}%`],
      ['Critical', `${weapon.critical}%`],
      ['Range', weaponRangeLabel(weapon)],
      ['Attack Speed', attackSpeed(unit)],
      ['Terrain', terrain.name],
      ['Terrain Avoid', `+${terrain.avoid}`],
      ['Terrain Defense', `+${terrain.defense}`],
      ['Avoid', getAvoid(unit, terrain)],
    ];
    if (opponent) {
      combatStats.push([`Hit Rate vs. ${opponent.name}`, `${getHitRate(unit, opponent, opponentTerrain)}%`]);
    }
    for (const [label, value] of combatStats) {
      const item = document.createElement('div');
      const term = document.createElement('dt');
      term.textContent = label;
      const description = document.createElement('dd');
      description.textContent = value;
      if (label === 'Weapon' && weapon.spriteUrl) {
        const icon = document.createElement('img');
        icon.src = weapon.spriteUrl;
        icon.alt = '';
        description.className = 'weapon-name';
        description.prepend(icon);
      }
      item.append(term, description);
      weaponDetails.append(item);
    }
    dialog.querySelector('#profile-combat-note').textContent =
      'Displayed Hit = weapon Hit + 2×Dexterity + floor(Luck/2) + weapon level Hit − enemy Avoid, clamped to 0–100. Avoid = 2×Attack Speed + Luck + terrain Avoid + weapon level Avoid. Attack Speed = Speed − max(0, weapon Weight − Build). Each hit earns 1 weapon EXP. Actual Hit averages two random rolls. Terrain Defense reduces physical damage. Doubles at a 4+ Attack Speed advantage.';
    dialog.showModal();
  }

  return { show };
}
