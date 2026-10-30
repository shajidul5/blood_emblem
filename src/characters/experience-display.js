const EXP_PER_LEVEL = 100;
const ANIMATION_DURATION_MS = 650;

export function createExperienceDisplay(element) {
  const label = element.querySelector('#exp-label');
  const fill = element.querySelector('#exp-fill');
  const gainLabel = element.querySelector('#exp-gain');
  const progressBar = element.querySelector('#exp-track');
  let animationQueue = Promise.resolve();
  let animationGeneration = 0;
  let cancelDelay;

  function setProgress(level, experience) {
    label.textContent = `LV ${level} · EXP ${experience}/${EXP_PER_LEVEL}`;
    progressBar.setAttribute('aria-valuenow', String(experience));
  }

  function reset(level, experience) {
    animationGeneration++;
    cancelDelay?.();
    animationQueue = Promise.resolve();
    element.classList.remove('gaining');
    gainLabel.textContent = '';
    fill.style.transition = 'none';
    fill.style.width = `${experience}%`;
    setProgress(level, experience);
  }

  function wait(milliseconds) {
    return new Promise((resolve) => {
      const timeout = window.setTimeout(() => {
        cancelDelay = undefined;
        resolve();
      }, milliseconds);
      cancelDelay = () => {
        window.clearTimeout(timeout);
        cancelDelay = undefined;
        resolve();
      };
    });
  }

  function showGain({ level, experience, amount, levelUps, finalLevel, finalExperience }) {
    const generation = animationGeneration;
    animationQueue = animationQueue.then(async () => {
      if (generation !== animationGeneration) return;
      element.classList.add('gaining');
      gainLabel.textContent = `+${amount} EXP`;
      fill.style.transition = 'none';
      fill.style.width = `${experience}%`;
      setProgress(level, experience);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      if (generation !== animationGeneration) return;

      for (let nextLevel = 0; nextLevel < levelUps; nextLevel++) {
        fill.style.transition = `width ${ANIMATION_DURATION_MS}ms ease-out`;
        fill.style.width = '100%';
        progressBar.setAttribute('aria-valuenow', String(EXP_PER_LEVEL));
        await wait(ANIMATION_DURATION_MS);
        if (generation !== animationGeneration) return;
        level++;
        experience = 0;
        setProgress(level, experience);
        fill.style.transition = 'none';
        fill.style.width = '0%';
        gainLabel.textContent = `LEVEL UP! · +${amount} EXP`;
        await wait(120);
        if (generation !== animationGeneration) return;
      }

      fill.style.transition = `width ${ANIMATION_DURATION_MS}ms ease-out`;
      fill.style.width = `${finalExperience}%`;
      setProgress(finalLevel, finalExperience);
      await wait(ANIMATION_DURATION_MS);
      if (generation !== animationGeneration) return;
      gainLabel.textContent = levelUps ? `LEVEL UP! · +${amount} EXP` : `+${amount} EXP`;
      await wait(1800);
      if (generation !== animationGeneration) return;
      element.classList.remove('gaining');
    });
    return animationQueue;
  }

  return { reset, setProgress, showGain };
}
