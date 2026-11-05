import { playItemDiscovery } from '../audio/ui-sounds.js';
import { insightSpriteUrl } from '../game/insight-display.js';

export function createItemPopup(dialog) {
  const heading = dialog.querySelector('#item-popup-heading');
  const recipient = dialog.querySelector('#item-popup-recipient');
  const icon = dialog.querySelector('#item-popup-icon');
  const name = dialog.querySelector('#item-popup-name');
  const description = dialog.querySelector('#item-popup-description');
  const lore = dialog.querySelector('#item-popup-lore');
  const continueButton = dialog.querySelector('#item-popup-continue');

  continueButton.addEventListener('click', () => dialog.close());

  function present({ title, recipientText, nameText, descriptionText, loreText = '', spriteUrl, buttonText }) {
    heading.textContent = title;
    recipient.textContent = recipientText;
    name.textContent = nameText;
    description.textContent = descriptionText;
    lore.textContent = loreText;
    continueButton.textContent = buttonText;
    icon.replaceChildren();
    if (spriteUrl) {
      const image = document.createElement('img');
      image.src = spriteUrl;
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

  function showOne(unit, item, toConvoy) {
    return present({
      title: toConvoy ? 'Sent to Convoy' : 'Item Received',
      recipientText: toConvoy ? `${unit.name}'s inventory is full` : unit.name,
      nameText: item.name,
      descriptionText: item.type === 'consumable' && item.heal
        ? `Restores ${item.heal} HP · ${item.maxUses} uses`
        : item.might !== undefined ? `Might ${item.might} · Weight ${item.weight}` : item.description ?? '',
      loreText: item.lore ?? '',
      spriteUrl: item.spriteUrl,
      buttonText: 'Take',
    });
  }

  function showInsight(bossName, amount, total) {
    return present({
      title: 'Insight Gained',
      recipientText: `${bossName} defeated`,
      nameText: `+${amount} Insight`,
      descriptionText: `Total Insight: ${total}`,
      spriteUrl: insightSpriteUrl,
      buttonText: 'Continue',
    });
  }

  // Shows each { unit, item } receipt in turn, waiting for the player to dismiss each one.
  async function show(receipts) {
    for (const { unit, item, toConvoy } of receipts) {
      await showOne(unit, item, toConvoy);
    }
  }

  return { show, showInsight, get open() { return dialog.open; } };
}
