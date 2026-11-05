import { WEAPON_RANKS } from './weapon-levels.js';
import { playStatUp } from '../audio/ui-sounds.js';

export function createRankUpDialog(dialog, iconForType) {
  const heading = dialog.querySelector('#rank-up-heading');
  const icon = dialog.querySelector('#rank-up-icon');
  const change = dialog.querySelector('#rank-up-change');
  const bonus = dialog.querySelector('#rank-up-bonus');
  const continueButton = dialog.querySelector('#rank-up-continue');
  continueButton.addEventListener('click', () => dialog.close());

  async function show({ unit, type, rank }) {
    const index = WEAPON_RANKS.findIndex((entry) => entry.id === rank.id);
    const previous = WEAPON_RANKS[Math.max(0, index - 1)];
    heading.textContent = `${unit.name}'s ${type} rank up!`;
    const url = iconForType(type);
    icon.hidden = !url;
    if (url) icon.src = url;
    icon.alt = type;
    change.textContent = `${previous.id} → ${rank.id}`;
    bonus.textContent = `+${rank.hit - previous.hit} Hit, +${rank.avoid - previous.avoid} Avoid (total +${rank.hit} Hit, +${rank.avoid} Avoid)`;
    dialog.showModal();
    playStatUp(0);
    continueButton.focus();
    await new Promise((resolve) => dialog.addEventListener('close', resolve, { once: true }));
  }

  return { show };
}
