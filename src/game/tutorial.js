import chapterOne from '../../data/tutorials/chapter-1.json';
import chapterTwo from '../../data/tutorials/chapter-2.json';
import chapterThree from '../../data/tutorials/chapter-3.json';
import chapterFour from '../../data/tutorials/chapter-4.json';
import chapterFive from '../../data/tutorials/chapter-5.json';
import chapterSix from '../../data/tutorials/chapter-6.json';
import triangle from '../../data/weapon-triangle.json';

const script = { ...chapterOne, ...chapterTwo, ...chapterThree, ...chapterFour, ...chapterFive, ...chapterSix };

const fill = (text, vars) => text.replace(/\{(\w+)\}/g, (match, key) => String(vars[key] ?? match));

const STORAGE_KEY = 'blood-emblem-tutorials';
let enabled = true;
try { enabled = localStorage.getItem(STORAGE_KEY) !== 'off'; } catch { /* storage unavailable */ }

export const tutorialsEnabled = () => enabled;

export function setTutorialsEnabled(value) {
  enabled = Boolean(value);
  try { localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off'); } catch { /* storage unavailable */ }
}

export function createTutorialPopup(dialog, { itemSprite = () => null } = {}) {
  const kicker = dialog.querySelector('#tutorial-kicker');
  const title = dialog.querySelector('#tutorial-title');
  const body = dialog.querySelector('#tutorial-body');
  const visual = dialog.querySelector('#tutorial-visual');
  const continueButton = dialog.querySelector('#tutorial-continue');

  continueButton.addEventListener('click', () => dialog.close());

  function renderVisual(page) {
    visual.replaceChildren();
    visual.hidden = true;
    if (page.diagram === 'weapon-triangle') {
      for (const [winner, loser] of Object.entries(triangle.beats)) {
        const row = document.createElement('div');
        row.className = 'tutorial-triangle-row';
        const left = document.createElement('span');
        left.textContent = winner;
        const arrow = document.createElement('b');
        arrow.textContent = 'beats';
        const right = document.createElement('span');
        right.textContent = loser;
        row.append(left, arrow, right);
        visual.append(row);
      }
      visual.hidden = false;
    } else if (page.icon) {
      const url = itemSprite(page.icon);
      if (url) {
        const image = document.createElement('img');
        image.src = url;
        image.alt = '';
        visual.append(image);
        visual.hidden = false;
      }
    }
  }

  function showPage(page, vars) {
    kicker.textContent = page.kicker;
    title.textContent = page.title;
    body.replaceChildren(...page.paragraphs.map((text) => {
      const paragraph = document.createElement('p');
      paragraph.textContent = fill(text, vars);
      return paragraph;
    }));
    renderVisual(page);
    continueButton.textContent = page.button ?? 'Continue';
    dialog.classList.toggle('docked', Boolean(page.dock));
    return new Promise((resolve) => {
      dialog.addEventListener('close', resolve, { once: true });
      dialog.showModal();
      continueButton.focus({ preventScroll: true });
    });
  }

  // Shows each page of a script entry in turn; {name} placeholders come from vars.
  async function show(id, vars = {}) {
    if (!enabled) return;
    const entry = script[id];
    if (!entry) throw new Error(`Unknown tutorial "${id}".`);
    const allVars = { island: script.island, ...vars };
    for (const page of entry.pages) await showPage(page, allVars);
  }

  return { show, get open() { return dialog.open; } };
}

export const TRIANGLE_EFFECTS = { hit: triangle.hit, avoid: triangle.avoid, damage: triangle.damage };

export const PART_ONE_ENDING = { ...chapterFive.escape.ending, welcome: `Welcome to ${script.island}` };
