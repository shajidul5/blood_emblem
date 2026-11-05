import {
  AWAKEN, MAX_LEADERSHIP, MAX_WEAPON_TIER, awaken, buyLeadership, canAwaken, describeTierBonus, getInsight,
  getLeadership, isAwakened, leadershipCost, nextWeaponCost, refundLeadership, refundWeapon, revertAwakening,
  upgradableWeaponIds, upgradeWeapon, weaponTier,
  BLOOD_EMBLEM, bloodEmblemDescription, buyBloodEmblem, isBloodEmblemEquipped, isBloodEmblemUpgraded,
  refundBloodEmblem, toggleBloodEmblem,
} from './insight.js';

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const button = (label, onClick, disabled = false, className = '') => {
  const node = el('button', className, label);
  node.type = 'button';
  node.disabled = disabled;
  node.addEventListener('click', onClick);
  return node;
};

const SORT_ORDER = { weapon: 0, consumable: 1 };
const TITLES = {
  hub: 'Preparations',
  units: 'Unit Select',
  inventory: 'Inventory',
  unit: 'Inventory',
  use: 'Use Item',
  tradePick: 'Trade',
  trade: 'Trade',
  convoy: 'Convoy',
  insight: 'Insight',
};
const PARENT = {
  units: 'hub', inventory: 'hub', insight: 'hub', unit: 'inventory',
  use: 'unit', tradePick: 'unit', trade: 'tradePick', convoy: 'unit',
};

// Pre-battle hub in the Fire Emblem style: every option opens a sub-screen, Start Battle closes it.
export function createPrepMenu({
  dialog, getTeam, getConvoy, items, statItems, readInsight, settle, maxSize, maxDeployed,
  isDeployed, setDeployed, getInfo, portrait, onProfile, onSave, onOptions, onViewMap, onChange,
}) {
  let view = 'hub';
  let subjectId = null;
  let partnerId = null;
  let pendingSwap = null;
  let flash = '';
  let focusPending = false;
  let viewingMap = false;
  let resolveClosed = null;

  const team = () => getTeam();
  const unitById = (id) => team().find((unit) => unit.id === id);
  const subject = () => unitById(subjectId) ?? team()[0];
  const maria = () => unitById('maria');
  const listOf = (holder) => (holder ? holder.inventory : getConvoy());
  const isBound = (entry) => Boolean(items.get(entry.id)?.bound);

  const go = (next) => {
    view = next;
    pendingSwap = null;
    flash = '';
    focusPending = true;
    render();
  };

  const sortEntries = (entries) => {
    entries.sort((a, b) => {
      const itemA = items.get(a.id);
      const itemB = items.get(b.id);
      const rank = (SORT_ORDER[itemA?.itemType] ?? 2) - (SORT_ORDER[itemB?.itemType] ?? 2);
      return rank || (itemA?.name ?? a.id).localeCompare(itemB?.name ?? b.id);
    });
  };

  // holder is the unit carrying the entry, or null when it sits in the convoy; user is who benefits.
  const useEntry = (holder, entry, user) => {
    const item = items.get(entry.id);
    if (item.insight) {
      readInsight(holder, entry);
      flash = `${user.name} read ${item.name}. +${item.insight} Insight.`;
      onChange();
      return;
    }
    if (statItems[item.effect]) {
      const { stat } = statItems[item.effect];
      const amount = item.amount ?? 2;
      user[stat] += amount;
      if (stat === 'maxHp') user.hp += amount;
      flash = `${user.name} used ${item.name}.`;
    } else {
      const healed = Math.min(item.heal, user.maxHp - user.hp);
      user.hp += healed;
      flash = `${user.name} recovered ${healed} HP.`;
    }
    entry.uses--;
    if (!(entry.uses > 0)) listOf(holder).splice(listOf(holder).indexOf(entry), 1);
    onChange();
  };

  const canUse = (unit, item) =>
    item?.itemType === 'consumable' &&
    (item.insight || statItems[item.effect] || (item.heal && unit.hp < unit.maxHp));

  const moveEntry = (from, to, entry) => {
    const source = listOf(from);
    const index = source.indexOf(entry);
    if (index < 0 || isBound(entry) || (to && to.inventory.length >= maxSize)) return;
    source.splice(index, 1);
    listOf(to).push(entry);
    const notes = [from && settle(from, null), to && settle(to, entry)].filter(Boolean).join('');
    flash = `${items.get(entry.id).name} moved to ${to ? to.name : 'the convoy'}.${notes}`;
    onChange();
  };

  const swapEntries = (holderA, entryA, holderB, entryB) => {
    const listA = listOf(holderA);
    const listB = listOf(holderB);
    const indexA = listA.indexOf(entryA);
    const indexB = listB.indexOf(entryB);
    pendingSwap = null;
    if (indexA < 0 || indexB < 0 || isBound(entryA) || isBound(entryB)) return;
    listA[indexA] = entryB;
    listB[indexB] = entryA;
    const notes = [holderA && settle(holderA, entryB), holderB && settle(holderB, entryA)].filter(Boolean).join('');
    flash = `Swapped ${items.get(entryA.id).name} with ${items.get(entryB.id).name}.${notes}`;
    onChange();
  };

  const entryRow = (entry, actions = []) => {
    const item = items.get(entry.id);
    const row = el('li');
    const info = el('div', 'item-info');
    if (item?.spriteUrl) {
      const icon = el('span', 'item-icon');
      const img = el('img');
      img.src = item.spriteUrl;
      img.alt = '';
      icon.append(img);
      info.append(icon);
    }
    const text = el('div');
    text.append(el('strong', '', item?.name ?? entry.id));
    if (entry.id === 'blood-emblem') text.append(el('span', 'item-effect', bloodEmblemDescription()));
    else if (Number.isInteger(entry.uses)) text.append(el('span', '', `Uses: ${entry.uses}`));
    info.append(text);
    row.append(info);
    const box = el('div', 'prep-actions');
    box.append(...actions);
    row.append(box);
    return row;
  };

  // While a swap is pending every row offers to finish or cancel it; otherwise the normal buttons show.
  const swapAware = (holder, entry, normal) => {
    if (!pendingSwap) return normal();
    if (pendingSwap.entry === entry) return [button('Cancel swap', () => { pendingSwap = null; render(); })];
    if (pendingSwap.holder === holder) return [];
    return [button('Swap for this', () => swapEntries(pendingSwap.holder, pendingSwap.entry, holder, entry), isBound(entry))];
  };

  const startSwap = (holder, entry) => () => { pendingSwap = { holder, entry }; render(); };

  const card = (unit, onClick, { selected = false, disabled = false, note = '' } = {}) => {
    const node = button('', onClick, disabled, 'prep-card');
    if (selected) node.classList.add('selected');
    const url = portrait(unit);
    if (url) {
      const img = el('img');
      img.src = url;
      img.alt = '';
      node.append(img);
    }
    node.append(el('span', 'prep-card-name', unit.name));
    if (note) node.append(el('span', 'prep-card-note', note));
    return node;
  };

  const column = (title, entries, rowFor, footerButtons = []) => {
    const section = el('section', 'prep-column');
    const head = el('div', 'prep-subhead');
    head.append(el('h3', '', title), ...footerButtons);
    section.append(head);
    const list = el('ul', 'item-list');
    for (const entry of entries) list.append(entryRow(entry, rowFor(entry)));
    if (!entries.length) list.append(el('li', '', 'Empty.'));
    section.append(list);
    return section;
  };

  const renderHub = (body) => {
    const info = getInfo();
    body.append(el('p', 'prep-note', `${info.chapter} · Objective: ${info.objective}`));
    const deployed = team().filter(isDeployed).length;
    const menu = el('div', 'prep-hub');
    menu.append(
      button(`Unit Select (${deployed}/${maxDeployed})`, () => go('units')),
      button('Inventory', () => go('inventory')),
      button(`Insight (${getInsight()})`, () => go('insight')),
      button('Save', () => { flash = onSave() ? 'Game saved.' : 'Could not save the game.'; render(); }),
      button('Options', () => onOptions()),
      button('View Map', () => { viewingMap = true; dialog.close(); onViewMap(); }),
      button('Start Battle', () => dialog.close(), false, 'primary'),
    );
    body.append(menu);
  };

  const renderUnits = (body) => {
    const deployed = team().filter(isDeployed).length;
    body.append(el('p', 'prep-note', `Choose who fights this chapter: ${deployed}/${maxDeployed} deployed. Maria always deploys.`));
    const grid = el('div', 'prep-grid prep-units-grid');
    for (const unit of team()) {
      const on = isDeployed(unit);
      const required = unit.id === 'maria';
      grid.append(card(unit, () => { setDeployed(unit, !on); render(); }, {
        selected: on,
        disabled: required || (!on && deployed >= maxDeployed),
        note: required ? 'Required' : on ? 'Deployed' : 'Benched',
      }));
    }
    body.append(grid);
    const actions = el('div', 'prep-actions');
    actions.append(
      button('Select all', () => { for (const unit of team()) setDeployed(unit, true); render(); }),
      button('Clear', () => { for (const unit of team()) if (unit.id !== 'maria') setDeployed(unit, false); render(); }),
    );
    body.append(actions);
  };

  const renderInventory = (body) => {
    body.append(el('p', 'prep-note', 'Choose a unit.'));
    const grid = el('div', 'prep-grid');
    for (const unit of team()) {
      grid.append(card(unit, () => { subjectId = unit.id; go('unit'); }, {
        note: `${unit.inventory.length}/${maxSize} items`,
      }));
    }
    body.append(grid);
  };

  const renderUnit = (body) => {
    const unit = subject();
    const head = el('div', 'prep-unit-head');
    head.append(card(unit, () => {}, { disabled: true }));
    const details = el('div');
    details.append(
      el('strong', '', unit.name),
      el('div', 'prep-note', `Lv ${unit.level} ${unit.class} · HP ${unit.hp}/${unit.maxHp} · ${unit.inventory.length}/${maxSize} items`),
    );
    head.append(details);
    body.append(head);
    const menu = el('div', 'prep-hub');
    menu.append(
      button('Profile', () => onProfile(unit)),
      button('Trade', () => go('tradePick'), team().length < 2),
      button('Use Item', () => go('use')),
      button('Convoy', () => go('convoy')),
      button('Sort Items', () => { sortEntries(unit.inventory); flash = `${unit.name}'s items sorted.`; render(); }),
    );
    if (unit.id === 'maria' && unit.inventory.some((entry) => entry.id === 'blood-emblem')) {
      menu.append(button(isBloodEmblemUpgraded()
        ? `${isBloodEmblemEquipped() ? 'Unequip' : 'Equip'} Blood Emblem`
        : 'Blood Emblem (unlock with Insight)',
      () => { toggleBloodEmblem(unit); onChange(); }, !isBloodEmblemUpgraded()));
    }
    body.append(menu);
  };

  const renderUse = (body) => {
    const unit = subject();
    body.append(column(`${unit.name} · HP ${unit.hp}/${unit.maxHp}`, unit.inventory, (entry) => {
      const item = items.get(entry.id);
      if (entry.id === 'blood-emblem') {
        return [button(isBloodEmblemEquipped() ? 'Unequip' : 'Equip',
          () => { toggleBloodEmblem(unit); onChange(); }, !isBloodEmblemUpgraded() || unit.id !== 'maria')];
      }
      return canUse(unit, item)
        ? [button(item.insight ? 'Read' : 'Use', () => useEntry(unit, entry, unit))]
        : [];
    }));
  };

  const renderTradePick = (body) => {
    const unit = subject();
    body.append(el('p', 'prep-note', `Trade ${unit.name}'s items with whom?`));
    const grid = el('div', 'prep-grid');
    for (const other of team().filter((member) => member !== unit)) {
      grid.append(card(other, () => { partnerId = other.id; go('trade'); }, {
        note: `${other.inventory.length}/${maxSize} items`,
      }));
    }
    body.append(grid);
  };

  const renderTrade = (body) => {
    const unit = subject();
    const other = unitById(partnerId);
    if (pendingSwap) body.append(el('p', 'prep-note', 'Pick the item to swap with on the other side.'));
    const columns = el('div', 'prep-columns');
    for (const [holder, partner] of [[unit, other], [other, unit]]) {
      columns.append(column(`${holder.name} · ${holder.inventory.length}/${maxSize}`, holder.inventory, (entry) =>
        swapAware(holder, entry, () => [
          button(`Give to ${partner.name}`, () => moveEntry(holder, partner, entry), isBound(entry) || partner.inventory.length >= maxSize),
          button('Swap', startSwap(holder, entry), isBound(entry) || partner.inventory.length === 0),
        ])));
    }
    body.append(columns);
  };

  const renderConvoy = (body) => {
    const unit = subject();
    const convoy = getConvoy();
    if (pendingSwap) body.append(el('p', 'prep-note', 'Pick the item to swap with on the other side.'));
    const columns = el('div', 'prep-columns');
    columns.append(column(`${unit.name} · ${unit.inventory.length}/${maxSize}`, unit.inventory, (entry) =>
      swapAware(unit, entry, () => [
        button('Store', () => moveEntry(unit, null, entry), isBound(entry)),
        button('Swap', startSwap(unit, entry), isBound(entry) || convoy.length === 0),
      ]), [button('Sort', () => { sortEntries(unit.inventory); render(); })]));
    columns.append(column(`Convoy · ${convoy.length}`, convoy, (entry) =>
      swapAware(null, entry, () => {
        const item = items.get(entry.id);
        const actions = [];
        if (canUse(unit, item)) actions.push(button(item.insight ? 'Read' : 'Use', () => useEntry(null, entry, unit)));
        actions.push(
          button('Take', () => moveEntry(null, unit, entry), unit.inventory.length >= maxSize),
          button('Swap', startSwap(null, entry), isBound(entry) || unit.inventory.length === 0),
        );
        return actions;
      }), [button('Sort', () => { sortEntries(convoy); render(); })]));
    body.append(columns);
  };

  const costLabel = (cost) => (cost === undefined ? 'Max' : `${cost} Insight`);

  const upgradeRow = (title, detail, pips, buttons, item, leadership = false) => {
    const row = el('li');
    const info = el('div', 'item-info');
    const icon = el('span', leadership ? 'item-icon prep-star' : 'item-icon');
    icon.setAttribute('aria-hidden', 'true');
    if (leadership) icon.textContent = '★';
    else if (item?.spriteUrl) {
      const img = el('img');
      img.src = item.spriteUrl;
      img.alt = '';
      icon.append(img);
    }
    const text = el('div');
    text.append(el('strong', '', title));
    if (detail) text.append(el('span', 'item-effect', detail));
    text.append(el('span', 'prep-pips', pips));
    info.append(icon, text);
    row.append(info);
    const actions = el('div', 'prep-actions');
    actions.append(...buttons);
    row.append(actions);
    return row;
  };

  const pipString = (filled, total) => '◆'.repeat(filled) + '◇'.repeat(total - filled);

  const renderInsight = (body) => {
    const insight = getInsight();
    body.append(el('p', 'prep-note', 'Insight reveals the true potential of spells and the people who wield them. Every purchase can be refunded in full.'));
    const list = el('ul', 'item-list');

    const stars = getLeadership();
    list.append(upgradeRow(
      'Maria · Leadership',
      `Each star gives the whole party +5 Hit and +5 Avoid (now +${stars * 5}).`,
      '★'.repeat(stars) + '☆'.repeat(MAX_LEADERSHIP - stars),
      [
        button(`Buy (${costLabel(leadershipCost())})`, () => { buyLeadership(); onChange(); },
          leadershipCost() === undefined || insight < leadershipCost()),
        button('Refund', () => { refundLeadership(); onChange(); }, stars === 0),
      ],
      null, true,
    ));

    const emblem = maria()?.inventory.some((entry) => entry.id === 'blood-emblem');
    list.append(upgradeRow('Blood Emblem', bloodEmblemDescription(), isBloodEmblemUpgraded() ? 'Awakened' : 'Dormant', [
      button(`Upgrade (${BLOOD_EMBLEM.cost} Insight)`, () => { buyBloodEmblem(); onChange(); },
        !emblem || isBloodEmblemUpgraded() || insight < BLOOD_EMBLEM.cost),
      button(isBloodEmblemEquipped() ? 'Unequip' : 'Equip', () => { toggleBloodEmblem(maria()); onChange(); },
        !emblem || !isBloodEmblemUpgraded()),
      button('Refund', () => { refundBloodEmblem(); onChange(); }, !isBloodEmblemUpgraded()),
    ], items.get('blood-emblem')));

    const owned = new Set([...team().flatMap((unit) => unit.inventory), ...getConvoy()].map((entry) => entry.id));
    if (isAwakened()) owned.add(AWAKEN.weaponId);
    for (const id of upgradableWeaponIds()) {
      if (!owned.has(id) && !weaponTier(id)) continue;
      const tier = weaponTier(id);
      const base = items.get(id);
      const awakened = id === AWAKEN.weaponId && isAwakened();
      const buttons = [
        button(`Upgrade (${costLabel(nextWeaponCost(id))})`, () => { upgradeWeapon(id); onChange(); },
          tier >= MAX_WEAPON_TIER || insight < nextWeaponCost(id)),
        button('Refund', () => { refundWeapon(id); onChange(); }, tier === 0 || awakened),
      ];
      if (id === AWAKEN.weaponId && tier === MAX_WEAPON_TIER) {
        buttons.unshift(awakened
          ? button('Revert', () => { revertAwakening(maria()); onChange(); })
          : button(`Awaken (${AWAKEN.cost} Insight)`, () => { awaken(maria()); onChange(); },
            !canAwaken() || !maria().inventory.some((entry) => entry.id === AWAKEN.weaponId)));
      }
      const name = awakened ? `${items.get(AWAKEN.into).name} (awakened ${base.name})` : base.name;
      const next = describeTierBonus(id, tier + 1);
      list.append(upgradeRow(name, tier >= MAX_WEAPON_TIER ? 'Fully upgraded.' : `Next: ${next}`, pipString(tier, MAX_WEAPON_TIER), buttons,
        awakened ? items.get(AWAKEN.into) : base));
    }
    body.append(list);
  };

  const RENDERERS = {
    hub: renderHub, units: renderUnits, inventory: renderInventory, unit: renderUnit, use: renderUse,
    tradePick: renderTradePick, trade: renderTrade, convoy: renderConvoy, insight: renderInsight,
  };

  const render = () => {
    dialog.replaceChildren();
    const header = el('div', 'inventory-header');
    header.append(el('h2', '', TITLES[view]));
    const total = el('strong', 'prep-insight', `Insight: ${getInsight()}`);
    total.setAttribute('role', 'status');
    header.append(total);
    dialog.append(header);

    const body = el('div', 'prep-body');
    RENDERERS[view](body);
    dialog.append(body);

    dialog.append(el('p', 'prep-note prep-flash', flash));
    if (view !== 'hub') dialog.append(button('Back', () => go(PARENT[view])));
    if (focusPending) {
      focusPending = false;
      (body.querySelector('button:not(:disabled)') ?? dialog.querySelector('button:not(:disabled)'))?.focus();
    }
  };

  // Escape steps back a screen instead of closing the hub.
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    if (view !== 'hub') go(PARENT[view]);
  });

  dialog.addEventListener('close', () => {
    if (viewingMap) return;
    resolveClosed?.();
    resolveClosed = null;
  });

  return {
    get open() { return dialog.open; },
    refresh: () => render(),
    // Brings the hub back after View Map hid it.
    resume() {
      viewingMap = false;
      focusPending = true;
      render();
      dialog.showModal();
    },
    show() {
      view = 'hub';
      subjectId = null;
      partnerId = null;
      pendingSwap = null;
      flash = '';
      focusPending = true;
      render();
      return new Promise((resolve) => {
        resolveClosed = resolve;
        dialog.showModal();
      });
    },
  };
}
