import { attackSpeed, getAvoid, getHitRate, weaponRangeLabel } from '../battle/combat.js';

const PORTRAITS = import.meta.glob('../../assets/character/*/Idle/rotations/south.png', {
  eager: true,
  query: '?url',
  import: 'default',
});

function portraitUrl(unit) {
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

    const weapon = unit.weapon;
    weaponDetails.replaceChildren();
    const combatStats = [
      ['Weapon', weapon.name],
      ['Type', weapon.type],
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
      'Displayed Hit = weapon Hit + 2×Dexterity + floor(Luck/2) − enemy Avoid, clamped to 0–100. Avoid = 2×Attack Speed + Luck + terrain Avoid. Actual Hit averages two random rolls. Terrain Defense reduces physical damage. Doubles at a 4+ Attack Speed advantage.';
    dialog.showModal();
  }

  return { show };
}
