import insightSpriteUrl from '../../assets/ui/insight_eye.png';

export { insightSpriteUrl };

export function renderInsightLabel(target, text) {
  const icon = document.createElement('img');
  icon.src = insightSpriteUrl;
  icon.alt = '';
  icon.className = 'insight-icon';
  const label = document.createElement('span');
  label.textContent = text;
  target.classList.add('insight-display');
  target.replaceChildren(icon, label);
}
