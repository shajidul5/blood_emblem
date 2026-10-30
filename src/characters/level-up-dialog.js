const ROLL_DELAY_MS = 380;
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

function statValue(unit, stat) {
  return stat === 'hp' ? unit.maxHp : unit[stat];
}

export function createLevelUpDialog(dialog) {
  const heading = dialog.querySelector('#level-up-heading');
  const levelLabel = dialog.querySelector('#level-up-level');
  const rollsContainer = dialog.querySelector('#level-up-rolls');
  const continueButton = dialog.querySelector('#level-up-continue');
  let rolling = false;

  continueButton.addEventListener('click', () => {
    if (!rolling) dialog.close();
  });
  dialog.addEventListener('cancel', (event) => {
    if (rolling) event.preventDefault();
  });

  // The unit already holds its final stats, so work backwards to the starting values.
  async function show(unit, growthRolls) {
    if (!growthRolls.length) return;
    rolling = true;
    continueButton.disabled = true;
    heading.textContent = `${unit.name} LEVEL UP!`;
    rollsContainer.replaceChildren();

    const totalGains = {};
    for (const rolls of growthRolls) {
      for (const roll of rolls) {
        if (roll.gained) totalGains[roll.stat] = (totalGains[roll.stat] ?? 0) + 1;
      }
    }
    const finalLevel = growthRolls[growthRolls.length - 1][0]?.level ?? unit.level;
    let displayedLevel = finalLevel - growthRolls.length;
    levelLabel.textContent = `LV ${displayedLevel}`;

    const list = document.createElement('ul');
    rollsContainer.append(list);
    const rows = new Map();
    for (const { stat } of growthRolls[0]) {
      const row = document.createElement('li');
      const name = document.createElement('span');
      const value = document.createElement('b');
      const gain = document.createElement('em');
      name.textContent = STAT_LABELS[stat] ?? stat;
      const current = statValue(unit, stat) - (totalGains[stat] ?? 0);
      value.textContent = current;
      row.append(name, value, gain);
      list.append(row);
      rows.set(stat, { row, value, gain, current, gained: 0 });
    }

    dialog.showModal();
    await wait(ROLL_DELAY_MS);
    for (const levelRolls of growthRolls) {
      displayedLevel++;
      levelLabel.textContent = `LV ${displayedLevel}`;
      for (const roll of levelRolls) {
        const entry = rows.get(roll.stat);
        if (!entry) continue;
        entry.row.classList.add('rolling');
        await wait(ROLL_DELAY_MS);
        entry.row.classList.remove('rolling');
        if (!roll.gained) continue;
        entry.current++;
        entry.gained++;
        entry.value.textContent = entry.current;
        entry.gain.textContent = `+${entry.gained}`;
        entry.row.classList.add('gained');
        // Restart the pop animation when a stat rises again on a later level.
        entry.value.classList.remove('bump');
        void entry.value.offsetWidth;
        entry.value.classList.add('bump');
      }
    }
    rolling = false;
    continueButton.disabled = false;
    continueButton.focus();
    await new Promise((resolve) => dialog.addEventListener('close', resolve, { once: true }));
  }

  return { show };
}
