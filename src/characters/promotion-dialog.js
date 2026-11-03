import { playStatUp } from '../audio/ui-sounds.js';

const STAT_LABELS = {
  hp: 'HP',
  strength: 'Strength',
  magic: 'Magic',
  dexterity: 'Dexterity',
  speed: 'Speed',
  luck: 'Luck',
  defense: 'Defense',
  resistance: 'Resistance',
  movement: 'Movement',
  build: 'Build',
};
const REVEAL_DELAY_MS = 320;

const wait = (milliseconds) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

// Captures what the dialog needs to show "before" while the unit still has its old class.
export function snapshotForPromotion(unit, portrait) {
  const stats = {};
  for (const stat of Object.keys(STAT_LABELS)) stats[stat] = stat === 'hp' ? unit.maxHp : unit[stat];
  return { className: unit.class, portrait, stats };
}

export function createPromotionDialog(dialog) {
  const heading = dialog.querySelector('#promotion-heading');
  const beforeImage = dialog.querySelector('#promotion-before-sprite');
  const afterImage = dialog.querySelector('#promotion-after-sprite');
  const beforeName = dialog.querySelector('#promotion-before-class');
  const afterName = dialog.querySelector('#promotion-after-class');
  const rolls = dialog.querySelector('#promotion-stats');
  const continueButton = dialog.querySelector('#promotion-continue');
  let revealing = false;

  continueButton.addEventListener('click', () => {
    if (!revealing) dialog.close();
  });
  dialog.addEventListener('cancel', (event) => {
    if (revealing) event.preventDefault();
  });

  function setImage(image, url, label) {
    image.hidden = !url;
    if (url) image.src = url;
    image.alt = label;
  }

  async function show(unit, before, afterPortrait) {
    revealing = true;
    continueButton.disabled = true;
    heading.textContent = `${unit.name} PROMOTED!`;
    setImage(beforeImage, before.portrait, `${unit.name} as ${before.className}`);
    setImage(afterImage, afterPortrait, `${unit.name} as ${unit.class}`);
    beforeName.textContent = before.className;
    afterName.textContent = unit.class;
    afterImage.classList.remove('revealed');
    afterName.classList.remove('revealed');

    rolls.replaceChildren();
    const rows = [];
    for (const stat of Object.keys(STAT_LABELS)) {
      const oldValue = before.stats[stat];
      const newValue = stat === 'hp' ? unit.maxHp : unit[stat];
      const row = document.createElement('li');
      const name = document.createElement('span');
      const value = document.createElement('b');
      const gain = document.createElement('em');
      name.textContent = STAT_LABELS[stat];
      value.textContent = oldValue;
      row.append(name, value, gain);
      rolls.append(row);
      rows.push({ row, value, gain, newValue, bonus: newValue - oldValue });
    }

    dialog.showModal();
    await wait(REVEAL_DELAY_MS);
    afterImage.classList.add('revealed');
    afterName.classList.add('revealed');
    await wait(REVEAL_DELAY_MS * 2);
    let risen = 0;
    for (const entry of rows) {
      if (!entry.bonus) continue;
      entry.row.classList.add('rolling');
      await wait(REVEAL_DELAY_MS);
      entry.row.classList.remove('rolling');
      entry.value.textContent = entry.newValue;
      entry.gain.textContent = `+${entry.bonus}`;
      entry.row.classList.add('gained');
      entry.value.classList.remove('bump');
      void entry.value.offsetWidth;
      entry.value.classList.add('bump');
      playStatUp(risen++);
    }
    revealing = false;
    continueButton.disabled = false;
    continueButton.focus();
    await new Promise((resolve) => dialog.addEventListener('close', resolve, { once: true }));
  }

  return { show };
}
