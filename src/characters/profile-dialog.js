import { attackSpeed, getAvoid, getHitRate, weaponRangeLabel } from '../battle/combat.js';
import { CLASSES } from './classes.js';
import { INVENTORY_ITEMS } from './inventory.js';
import { getWeaponExp, MAX_WEAPON_EXP, rankForExp, WEAPON_RANKS } from './weapon-levels.js';

const EXP_PER_LEVEL = 100;
const TABS = ['stats', 'inventory', 'weapons'];

const PORTRAITS = import.meta.glob(
  ['../../assets/character/*/Idle/rotations/south.png', '../../assets/character/*/rotations/south.png'],
  { eager: true, query: '?url', import: 'default' },
);

export function portraitUrl(unit) {
  return unit.sprite ? PORTRAITS[`../../${unit.sprite}`] : undefined;
}

// Bars fill against a nominal ceiling so stats read at a glance; values above it simply show a full bar.
const STAT_ROWS = [
  ['HP', 'hp', 60],
  ['Strength', 'strength', 30],
  ['Magic', 'magic', 30],
  ['Dexterity', 'dexterity', 30],
  ['Speed', 'speed', 30],
  ['Luck', 'luck', 30],
  ['Defense', 'defense', 30],
  ['Resistance', 'resistance', 30],
  ['Movement', 'movement', 10],
  ['Build', 'build', 20],
];

// A common weapon of each type stands in as that type's icon.
const TYPE_ICONS = {
  Sword: 'iron-katana', Spear: 'iron-spear', Axe: 'iron-axe', Bow: 'iron-bow', Gun: 'hunter-pistol',
  Anima: 'fire-tome', Light: 'light-tome', Dark: 'dark-tome', Staff: 'heal-staff', Claw: 'wolf-claws',
};

export function weaponTypeIcon(type) {
  return INVENTORY_ITEMS.get(TYPE_ICONS[type])?.spriteUrl;
}

// Every weapon type the unit's class can wield, plus any it trained before a class change.
export function weaponLevelRows(unit) {
  const classTypes = CLASSES.get(unit.classId)?.weaponTypes ?? (unit.weapon?.type ? [unit.weapon.type] : []);
  const trained = Object.entries(unit.weaponExp ?? {})
    .filter(([type, exp]) => type !== 'Tome' && exp > 0 && !classTypes.includes(type))
    .map(([type]) => type);
  return [...classTypes, ...trained].map((type) => {
    const exp = getWeaponExp(unit, type);
    const rank = rankForExp(exp);
    const next = WEAPON_RANKS[WEAPON_RANKS.indexOf(rank) + 1];
    return {
      type,
      exp,
      rank,
      next,
      usable: classTypes.includes(type),
      equipped: unit.weapon?.type === type,
      tracked: Boolean(unit.weaponExp),
      progress: next ? (exp - rank.exp) / (next.exp - rank.exp) : 1,
    };
  });
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function bar(fraction, className = '') {
  const track = element('div', `profile-bar ${className}`.trim());
  const fill = element('div', 'profile-bar-fill');
  fill.style.width = `${Math.round(Math.max(0, Math.min(1, fraction)) * 100)}%`;
  track.append(fill);
  return track;
}

function icon(url) {
  const frame = element('div', 'profile-icon');
  if (url) {
    const image = element('img');
    image.src = url;
    image.alt = '';
    frame.append(image);
  }
  return frame;
}

function definitionList(target, entries) {
  target.replaceChildren(...entries.map(([label, value]) => {
    const item = element('div');
    item.append(element('dt', '', label), element('dd', '', String(value)));
    return item;
  }));
}

export function createProfileDialog(dialog) {
  const tabs = TABS.map((id) => dialog.querySelector(`#profile-tab-${id}`));
  const panels = TABS.map((id) => dialog.querySelector(`#profile-panel-${id}`));
  let activeTab = 'stats';

  function selectTab(id, focus = false) {
    activeTab = id;
    TABS.forEach((tabId, index) => {
      const selected = tabId === id;
      tabs[index].setAttribute('aria-selected', String(selected));
      tabs[index].tabIndex = selected ? 0 : -1;
      panels[index].hidden = !selected;
    });
    if (focus) tabs[TABS.indexOf(id)].focus();
  }

  tabs.forEach((tab, index) => tab.addEventListener('click', () => selectTab(TABS[index])));
  for (const key of dialog.querySelectorAll('[data-tab-step]')) {
    key.addEventListener('click', () => {
      const index = (TABS.indexOf(activeTab) + Number(key.dataset.tabStep) + TABS.length) % TABS.length;
      selectTab(TABS[index], true);
    });
  }
  dialog.addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.altKey || event.metaKey) return;
    const step = { ArrowLeft: -1, ArrowRight: 1, q: -1, Q: -1, e: 1, E: 1 }[event.key];
    const direct = { 1: 0, 2: 1, 3: 2 }[event.key];
    if (step === undefined && direct === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    const index = direct ?? (TABS.indexOf(activeTab) + step + TABS.length) % TABS.length;
    selectTab(TABS[index], true);
  });

  function renderHeader(unit) {
    dialog.querySelector('#profile-heading').textContent = unit.name;
    dialog.querySelector('#profile-class').textContent =
      `${unit.isBoss ? 'Boss · ' : ''}${unit.class}${unit.type ? ` · ${unit.type}` : ''}`;
    dialog.querySelector('#profile-level').textContent = `Lv ${unit.level}`;
    const portrait = dialog.querySelector('#profile-portrait');
    const url = portraitUrl(unit);
    portrait.hidden = !url;
    if (url) portrait.src = url;
    portrait.alt = `${unit.name} portrait`;

    const vitals = dialog.querySelector('#profile-vitals');
    const hp = element('div', 'profile-vital hp');
    hp.append(element('span', 'profile-vital-label', 'HP'), bar(unit.hp / unit.maxHp, 'hp'),
      element('span', 'profile-vital-value', `${unit.hp}/${unit.maxHp}`));
    const exp = element('div', 'profile-vital exp');
    exp.append(element('span', 'profile-vital-label', 'EXP'), bar((unit.experience ?? 0) / EXP_PER_LEVEL, 'exp'),
      element('span', 'profile-vital-value', `${unit.experience ?? 0}/${EXP_PER_LEVEL}`));
    vitals.replaceChildren(hp, exp);
  }

  function renderStats(unit, opponent, terrain, opponentTerrain) {
    const grid = dialog.querySelector('#profile-stats');
    grid.replaceChildren(...STAT_ROWS.map(([label, key, ceiling]) => {
      const value = key === 'hp' ? unit.maxHp : unit[key];
      const base = unit.baseStats?.[key];
      const gain = Number.isFinite(base) ? value - base : 0;
      const row = element('div', 'profile-stat');
      const name = element('span', 'profile-stat-name', label);
      const number = element('span', 'profile-stat-value', String(value));
      if (gain > 0) number.title = `Base ${base} · +${gain} gained`;
      const growth = element('span', 'profile-stat-growth', `${unit.growthRates?.[key] ?? 0}%`);
      growth.title = 'Growth rate';
      row.append(name, number, bar(value / ceiling), growth);
      return row;
    }));

    const combat = [
      ['Attack Speed', attackSpeed(unit)],
      ['Avoid', getAvoid(unit, terrain)],
      ['Terrain', terrain.name],
      ['Terrain Def', `+${terrain.defense}`],
    ];
    if (opponent) combat.push([`Hit vs ${opponent.name}`, `${getHitRate(unit, opponent, opponentTerrain)}%`]);
    definitionList(dialog.querySelector('#profile-combat'), combat);
  }

  function renderInventory(unit, inventory) {
    const weapon = unit.weapon;
    const card = dialog.querySelector('#profile-weapon');
    const title = element('div', 'profile-weapon-title');
    const name = element('div', 'profile-weapon-name');
    name.append(element('strong', '', weapon?.name ?? 'Unarmed'),
      element('span', '', weapon ? `${weapon.type}${weapon.requiredRank ? ` · Rank ${weapon.requiredRank}` : ''}` : 'No weapon equipped'));
    title.append(icon(weapon?.spriteUrl), name);
    const stats = element('dl', 'profile-weapon-stats');
    if (weapon) {
      definitionList(stats, [
        ['Might', weapon.might], ['Hit', weapon.hit], ['Crit', weapon.critical],
        ['Weight', weapon.weight], ['Range', weaponRangeLabel(weapon)],
      ]);
    }
    card.replaceChildren(title, stats);
    if (weapon?.effect?.length) card.append(element('p', 'profile-weapon-effect', `Effective vs ${weapon.effect.join(', ')}`));

    const list = dialog.querySelector('#profile-items');
    list.replaceChildren(...(inventory?.rows ?? []));
    dialog.querySelector('#profile-items-empty').hidden = Boolean(inventory?.rows?.length);
    dialog.querySelector('#profile-items-heading').textContent = inventory?.heading ?? 'Items';
    dialog.querySelector('#profile-inventory-note').textContent = inventory?.note ?? '';
  }

  function renderWeaponLevels(unit) {
    const rows = weaponLevelRows(unit);
    const list = dialog.querySelector('#profile-weapon-levels');
    list.replaceChildren(...rows.map((row) => {
      const item = element('li', 'profile-weapon-level');
      item.classList.toggle('equipped', row.equipped);
      item.classList.toggle('unusable', !row.usable);
      const name = element('div', 'profile-weapon-level-name');
      const title = element('strong', '', row.type);
      if (row.equipped) title.append(element('em', 'profile-tag', 'Equipped'));
      name.append(title,
        element('span', '', row.usable ? `+${row.rank.hit} Hit · +${row.rank.avoid} Avoid` : 'Not usable by class'));
      const badge = element('div', `profile-rank rank-${row.rank.id}`, row.rank.id);
      const progress = element('div', 'profile-weapon-level-progress');
      const pips = element('div', 'profile-rank-pips');
      for (const rank of WEAPON_RANKS) {
        const pip = element('span', rank.exp <= row.exp ? 'reached' : '', rank.id);
        if (rank === row.rank) pip.classList.add('current');
        pips.append(pip);
      }
      const label = !row.tracked ? 'Untrained'
        : row.exp >= MAX_WEAPON_EXP ? 'Mastered'
          : `${row.exp - row.rank.exp}/${row.next.exp - row.rank.exp} to ${row.next.id}`;
      const meter = element('div', 'profile-weapon-level-meter');
      meter.append(bar(row.tracked ? row.progress : 0, row.exp >= MAX_WEAPON_EXP ? 'exp mastered' : 'exp'),
        element('span', 'profile-weapon-level-exp', label));
      progress.append(pips, meter);
      item.append(icon(weaponTypeIcon(row.type)), name, badge, progress);
      return item;
    }));
    dialog.querySelector('#profile-weapon-levels-empty').hidden = rows.length > 0;
    dialog.querySelector('#profile-weapon-note').textContent = unit.weaponExp
      ? 'Each hit earns 2 weapon EXP. Higher ranks add Hit and Avoid and unlock stronger weapons.'
      : 'Enemies fight at a fixed weapon rank and do not gain weapon EXP.';
  }

  function show(unit, opponent, terrain, opponentTerrain, inventory) {
    renderHeader(unit);
    renderStats(unit, opponent, terrain, opponentTerrain);
    renderInventory(unit, inventory);
    renderWeaponLevels(unit);
    selectTab(inventory?.focus ?? activeTab);
    dialog.showModal();
    tabs[TABS.indexOf(activeTab)].focus();
  }

  return { show, selectTab };
}
