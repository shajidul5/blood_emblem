import { playItemDiscovery } from '../audio/ui-sounds.js';

export function createItemPopup(dialog) {
  const heading = dialog.querySelector('#item-popup-heading');
  const recipient = dialog.querySelector('#item-popup-recipient');
  const icon = dialog.querySelector('#item-popup-icon');
  const name = dialog.querySelector('#item-popup-name');
  const description = dialog.querySelector('#item-popup-description');
  const lore = dialog.querySelector('#item-popup-lore');
  const continueButton = dialog.querySelector('#item-popup-continue');

  continueButton.addEventListener('click', () => dialog.close());

  function showOne(unit, item, toConvoy) {
    heading.textContent = toConvoy ? 'Sent to Convoy' : 'Item Received';
    recipient.textContent = toConvoy ? `${unit.name}'s inventory is full` : unit.name;
    name.textContent = item.name;
    description.textContent = item.type === 'consumable' && item.heal
      ? `Restores ${item.heal} HP · ${item.maxUses} uses`
      : item.might !== undefined ? `Might ${item.might} · Weight ${item.weight}` : item.description ?? '';
    lore.textContent = item.lore ?? '';
    icon.replaceChildren();
    if (item.spriteUrl) {
      const image = document.createElement('img');
      image.src = item.spriteUrl;
      image.alt = '';
      icon.append(image);
    }
    return new Promise((resolve) => {
      dialog.addEventListener('close', resolve, { once: true });
      dialog.showModal();
      playItemDiscovery();
      continueButton.focus({ preventScroll: true });
    });
  }

  // Shows each { unit, item } receipt in turn, waiting for the player to dismiss each one.
  async function show(receipts) {
    for (const { unit, item, toConvoy } of receipts) {
      await showOne(unit, item, toConvoy);
    }
  }

  return { show, get open() { return dialog.open; } };
}
