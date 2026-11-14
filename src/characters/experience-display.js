import { playExperienceTick, playExperienceLevelUp } from '../audio/ui-sounds.js';

const EXP_PER_LEVEL = 100;

export function createExperienceDisplay(element) {
  const label = element.querySelector('#exp-label');
  const fill = element.querySelector('#exp-fill');
  const gainLabel = element.querySelector('#exp-gain');
  const progressBar = element.querySelector('#exp-track');
  const unitLabel = element.querySelector('#exp-unit');
  const portrait = element.querySelector('#exp-portrait');
  let animationQueue = Promise.resolve();
  let animationGeneration = 0;
  let cancelDelay;
  let cancelAnimation;

  function setProgress(level, experience) {
    label.textContent = `LV ${level} · EXP ${experience}/${EXP_PER_LEVEL}`;
    progressBar.setAttribute('aria-valuenow', String(experience));
    fill.style.width = `${experience}%`;
  }

  function reset(level, experience) {
    animationGeneration++;
    cancelDelay?.();
    cancelAnimation?.();
    animationQueue = Promise.resolve();
    element.classList.remove('gaining');
    gainLabel.textContent = '';
    unitLabel.textContent = '';
    portrait.hidden = true;
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

  function animateTo(level, from, to) {
    if (from === to) return Promise.resolve();
    const duration = Math.max(360, Math.min(1400, (to - from) * 22));
    return new Promise((resolve) => {
      let frame, startedAt, displayed = from;
      cancelAnimation = () => {
        cancelAnimationFrame(frame);
        cancelAnimation = undefined;
        resolve();
      };
      const step = (now) => {
        startedAt ??= now;
        const progress = Math.min(1, (now - startedAt) / duration);
        const next = from + Math.floor((to - from) * progress);
        if (next !== displayed) {
          setProgress(level, next);
          playExperienceTick(next, next - displayed);
          displayed = next;
        }
        if (progress < 1) frame = requestAnimationFrame(step);
        else {
          cancelAnimation = undefined;
          resolve();
        }
      };
      frame = requestAnimationFrame(step);
    });
  }

  function showGain({ name, portraitUrl, level, experience, amount, levelUps, finalLevel, finalExperience }) {
    const generation = animationGeneration;
    animationQueue = animationQueue.then(async () => {
      if (generation !== animationGeneration) return;
      element.classList.add('gaining');
      element.hidden = false;
      unitLabel.textContent = name ?? 'Experience';
      portrait.hidden = !portraitUrl;
      if (portraitUrl) portrait.src = portraitUrl;
      gainLabel.textContent = `+${amount} EXP`;
      setProgress(level, experience);
      await wait(240);
      if (generation !== animationGeneration) return;

      for (let nextLevel = 0; nextLevel < levelUps; nextLevel++) {
        await animateTo(level, experience, EXP_PER_LEVEL);
        if (generation !== animationGeneration) return;
        playExperienceLevelUp();
        gainLabel.textContent = `LEVEL UP! · +${amount} EXP`;
        await wait(360);
        if (generation !== animationGeneration) return;
        level++;
        experience = 0;
        setProgress(level, experience);
        await wait(120);
        if (generation !== animationGeneration) return;
      }

      await animateTo(finalLevel, experience, finalExperience);
      if (generation !== animationGeneration) return;
      setProgress(finalLevel, finalExperience);
      gainLabel.textContent = levelUps ? `LEVEL UP! · +${amount} EXP` : `+${amount} EXP`;
      await wait(1100);
      if (generation !== animationGeneration) return;
      element.classList.remove('gaining');
    });
    return animationQueue;
  }

  return { reset, setProgress, showGain };
}
