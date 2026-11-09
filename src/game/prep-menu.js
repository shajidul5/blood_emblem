import {
  EVOLUTIONS, EVOLVING_WEAPON_IDS, LEADERSHIP_AVOID, LEADERSHIP_HIT, MAX_LEADERSHIP, SPELLBOOK_IDS, buyLeadership, canEvolve,
  evolveWeapon, getInsight, getLeadership, isEvolved, leadershipCost, nextSpellCost, nextSpellId, refundLeadership, refundSpell,
  revertEvolution, spellTier, unlockSpell,
  BLOOD_EMBLEM, bloodEmblemDescription, buyBloodEmblem, isBloodEmblemEquipped, isBloodEmblemUpgraded,
  refundBloodEmblem, toggleBloodEmblem,
} from './insight.js';
import { renderInsightLabel } from './insight-display.js';
import { rescaleMagicUses, spellsOf } from '../characters/inventory.js';
import { canPromote, getUsesMultiplier, promoteUnit } from '../characters/classes.js';
import { snapshotForPromotion } from '../characters/promotion-dialog.js';

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
  isRequired = (unit) => unit.id === 'maria',
  onPromote = () => {},
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

  const back = () => {
    if (!dialog.open) return false;
    if (view !== 'hub') go(PARENT[view]);
    return true;
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
    if (item.effect === 'promote') {
      if (!canUse(user, item) || !listOf(holder).includes(entry) || !(entry.uses > 0)) {
        flash = 'This Orders Emblem cannot be used by the selected unit.';
        render();
        return;
      }
      const before = snapshotForPromotion(user, portrait(user));
      const previousMultiplier = getUsesMultiplier(user);
      const result = promoteUnit(user);
      rescaleMagicUses(user, previousMultiplier);
      entry.uses--;
      if (!entry.uses) listOf(holder).splice(listOf(holder).indexOf(entry), 1);
      flash = `${user.name} promoted from ${result.from} to ${result.to}!`;
      onChange();
      onPromote(user, before);
      return;
    }
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
    (item.insight || statItems[item.effect] || (item.effect === 'promote' && unit.level >= 20 && canPromote(unit)) ||
      (item.heal && unit.hp < unit.maxHp));

  const promotionAction = (holder, entry, unit) => {
    const ready = canUse(unit, items.get(entry.id));
    return button(ready ? 'Use' : canPromote(unit) ? 'Needs level 20' : 'Already promoted',
      () => useEntry(holder, entry, unit), !ready);
  };

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

  const entryRow = (entry, actions = [], showLore = false) => {
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
    if (entry.spells) {
      text.append(el('span', 'item-effect', `Spells: ${Object.entries(entry.spells)
        .map(([id, uses]) => `${items.get(id)?.name ?? id} (${uses})`).join(' · ')}`));
    }
    if (showLore && item?.lore) text.append(el('span', 'item-lore', item.lore));
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

  const column = (title, entries, rowFor, footerButtons = [], showLore = false) => {
    const section = el('section', 'prep-column');
    const head = el('div', 'prep-subhead');
    head.append(el('h3', '', title), ...footerButtons);
    section.append(head);
    const list = el('ul', 'item-list');
    for (const entry of entries) list.append(entryRow(entry, rowFor(entry), showLore));
    if (!entries.length) list.append(el('li', '', 'Empty.'));
    section.append(list);
    return section;
  };

  const renderHub = (body) => {
    const info = getInfo();
    body.append(el('p', 'prep-note', `${info.chapter} · Objective: ${info.objective}`));
    const deployed = team().filter(isDeployed).length;
    const menu = el('div', 'prep-hub');
    const insightButton = button('', () => go('insight'));
    renderInsightLabel(insightButton, `Insight (${getInsight()})`);
    menu.append(
      button(`Unit Select (${deployed}/${maxDeployed})`, () => go('units')),
      button('Inventory', () => go('inventory')),
      insightButton,
      button('Save', () => { flash = onSave() ? 'Game saved.' : 'Could not save the game.'; render(); }),
      button('Options', () => onOptions()),
      button('View Map', () => { viewingMap = true; dialog.close(); onViewMap(); }),
      button('Start Battle', () => dialog.close(), false, 'primary'),
    );
    body.append(menu);
  };

  const renderUnits = (body) => {
    const deployed = team().filter(isDeployed).length;
    const requiredNames = team().filter(isRequired).map((unit) => unit.name).join(' and ');
    body.append(el('p', 'prep-note', `Choose who fights this chapter: ${deployed}/${maxDeployed} deployed. ${requiredNames} always deploy${team().filter(isRequired).length === 1 ? 's' : ''}.`));
    const grid = el('div', 'prep-grid prep-units-grid');
    for (const unit of team()) {
      const on = isDeployed(unit);
      const required = isRequired(unit);
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
      button('Clear', () => { for (const unit of team()) if (!isRequired(unit)) setDeployed(unit, false); render(); }),
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
      if (item.effect === 'promote') return [promotionAction(unit, entry, unit)];
      if (entry.id === 'blood-emblem') {
        return [button(isBloodEmblemEquipped() ? 'Unequip' : 'Equip',
          () => { toggleBloodEmblem(unit); onChange(); }, !isBloodEmblemUpgraded() || unit.id !== 'maria')];
      }
      return canUse(unit, item)
        ? [button(item.insight ? 'Read' : 'Use', () => useEntry(unit, entry, unit))]
        : [];
    }, [], true));
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
        if (item.effect === 'promote') actions.push(promotionAction(null, entry, unit));
        else if (canUse(unit, item)) actions.push(button(item.insight ? 'Read' : 'Use', () => useEntry(null, entry, unit)));
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

  // One line describing a spell or evolved weapon for the Insight screen.
  const describeSpell = (item) => {
    const uses = item.maxUses ? ` · ${item.maxUses} uses` : '';
    let stats;
    if (item.heal) stats = `Heals ${item.heal} + Magic${item.rangeFromMagic ? ' · Range 1 to Magic/2' : ''}`;
    else if (item.freeze) stats = `Hit ${item.hit}${item.freezeTurns ? ` · Freezes ${item.freezeTurns} turns` : ''}`;
    else stats = `Mt ${item.might} · Wt ${item.weight} · Hit ${item.hit} · Crit ${item.critical}`
      + (item.maxRange > 2 || item.minRange > 1 ? ` · Range ${item.minRange}-${item.maxRange}` : '');
    const extra = item.description ?? (item.effect?.length ? `Effective vs ${item.effect.join(', ')}.` : '');
    const rank = item.requiredRank ? ` · Requires ${item.type} rank ${item.requiredRank}` : '';
    return `${item.name} · ${stats}${rank}${uses}${extra ? `. ${extra}` : ''}`;
  };

  const renderInsight = (body) => {
    const insight = getInsight();
    body.append(el('p', 'prep-note', 'Insight reveals the true potential of spells and the people who wield them. Every purchase can be refunded in full.'));
    const list = el('ul', 'item-list');

    const stars = getLeadership();
    // Maria's own upgrades only show while her party is in the field; the Insight pool is shared.
    if (maria()) list.append(upgradeRow(
      'Maria · Leadership',
      `Each star gives the whole party +${LEADERSHIP_HIT} Hit and +${LEADERSHIP_AVOID} Avoid (now +${stars * LEADERSHIP_HIT} Hit, +${stars * LEADERSHIP_AVOID} Avoid).`,
      '★'.repeat(stars) + '☆'.repeat(MAX_LEADERSHIP - stars),
      [
        button(`Buy (${costLabel(leadershipCost())})`, () => { buyLeadership(); onChange(); },
          leadershipCost() === undefined || insight < leadershipCost()),
        button('Refund', () => { refundLeadership(); onChange(); }, stars === 0),
      ],
      null, true,
    ));

    const emblem = maria()?.inventory.some((entry) => entry.id === 'blood-emblem');
    if (maria()) list.append(upgradeRow('Blood Emblem', bloodEmblemDescription(), isBloodEmblemUpgraded() ? 'Awakened' : 'Dormant', [
      button(`Upgrade (${BLOOD_EMBLEM.cost} Insight)`, () => { buyBloodEmblem(); onChange(); },
        !emblem || isBloodEmblemUpgraded() || insight < BLOOD_EMBLEM.cost),
      button(isBloodEmblemEquipped() ? 'Unequip' : 'Equip', () => { toggleBloodEmblem(maria()); onChange(); },
        !emblem || !isBloodEmblemUpgraded()),
      button('Refund', () => { refundBloodEmblem(); onChange(); }, !isBloodEmblemUpgraded()),
    ], items.get('blood-emblem')));

    const owned = new Set([...team().flatMap((unit) => unit.inventory), ...getConvoy()].map((entry) => entry.id));

    // Spellbooks: each unlock teaches the party the next spell written in the tome or staff.
    for (const bookId of SPELLBOOK_IDS) {
      const tier = spellTier(bookId);
      if (!owned.has(bookId) && !tier) continue;
      const book = items.get(bookId);
      const ladder = [book, ...spellsOf(bookId)];
      const nextId = nextSpellId(bookId);
      const next = nextId && items.get(nextId);
      const cost = nextSpellCost(bookId);
      list.append(upgradeRow(
        book.name,
        next ? `Next: ${describeSpell(next)}` : 'Every spell in this book is unlocked.',
        ladder.map((spell, index) => `${index <= tier ? '◆' : '◇'} ${spell.name}`).join('   '),
        [
          button(next ? `Unlock (${cost} Insight)` : 'Mastered', () => { unlockSpell(bookId); onChange(); },
            !next || insight < cost),
          button('Refund', () => { refundSpell(bookId); onChange(); }, tier === 0),
        ],
        book,
      ));
    }

    // Evolutions: a personal weapon reforged into its true form.
    for (const baseId of EVOLVING_WEAPON_IDS) {
      const { into, cost } = EVOLUTIONS[baseId];
      const evolved = isEvolved(baseId);
      if (!owned.has(evolved ? into : baseId)) continue;
      const base = items.get(baseId);
      const result = items.get(into);
      list.append(upgradeRow(
        evolved ? `${result.name} (reforged ${base.name})` : base.name,
        `${evolved ? '' : 'Evolves into '}${describeSpell(result)}`,
        `${evolved ? '◇' : '◆'} ${base.name}   ${evolved ? '◆' : '◇'} ${result.name}`,
        [evolved
          ? button('Revert', () => { revertEvolution(baseId, team(), getConvoy()); onChange(); })
          : button(`Evolve (${cost} Insight)`, () => { evolveWeapon(baseId, team(), getConvoy()); onChange(); }, !canEvolve(baseId))],
        evolved ? result : base,
      ));
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
    const total = el('strong', 'prep-insight');
    renderInsightLabel(total, `Insight: ${getInsight()}`);
    total.setAttribute('role', 'status');
    header.append(total);
    dialog.append(header);

    const body = el('div', 'prep-body');
    RENDERERS[view](body);
    dialog.append(body);

    dialog.append(el('p', 'prep-note prep-flash', flash));
    if (view !== 'hub') dialog.append(button('Back', back));
    if (focusPending) {
      focusPending = false;
      (body.querySelector('button:not(:disabled)') ?? dialog.querySelector('button:not(:disabled)'))?.focus();
    }
  };

  // Every back control steps to the parent without closing the preparation hub.
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    back();
  });

  dialog.addEventListener('close', () => {
    if (viewingMap) return;
    resolveClosed?.();
    resolveClosed = null;
  });

  return {
    get open() { return dialog.open; },
    back,
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
