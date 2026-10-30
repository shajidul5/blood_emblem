const ROLL_DELAY_MS = 320;
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

function wait(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

export function createLevelUpDialog(dialog) {
  const heading = dialog.querySelector('#level-up-heading');
  const rollsContainer = dialog.querySelector('#level-up-rolls');
  const continueButton = dialog.querySelector('#level-up-continue');
  let rolling = false;

  continueButton.addEventListener('click', () => {
    if (!rolling) dialog.close();
  });
  dialog.addEventListener('cancel', (event) => {
    if (rolling) event.preventDefault();
  });

  async function show(characterName, growthRolls) {
    if (!growthRolls.length) return;
    rolling = true;
    continueButton.disabled = true;
    heading.textContent = `${characterName} LEVEL UP!`;
    rollsContainer.replaceChildren();

    const rows = [];
    for (const levelRolls of growthRolls) {
      const levelHeading = document.createElement('h3');
      levelHeading.textContent = `LEVEL ${levelRolls[0]?.level ?? ''}`;
      rollsContainer.append(levelHeading);
      const list = document.createElement('ul');
      rollsContainer.append(list);
      for (const roll of levelRolls) {
        const row = document.createElement('li');
        const statName = document.createElement('span');
        const result = document.createElement('strong');
        statName.textContent = `${STAT_LABELS[roll.stat] ?? roll.stat} (${roll.growthRate}%)`;
        result.textContent = 'Rolling…';
        row.append(statName, result);
        list.append(row);
        rows.push({ row, result, roll });
      }
    }

    dialog.showModal();
    for (const { row, result, roll } of rows) {
      await wait(ROLL_DELAY_MS);
      row.classList.add('revealed');
      result.textContent = roll.gained ? '+1' : '—';
      row.classList.toggle('gained', roll.gained);
    }
    rolling = false;
    continueButton.disabled = false;
    continueButton.focus();
    await new Promise((resolve) => dialog.addEventListener('close', resolve, { once: true }));
  }

  return { show };
}
