function polygon(ctx, points, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  ctx.closePath();
  ctx.fill();
}

export const LETHALITY_IMPACT_MS = 650;
export const LETHALITY_HITSTOP_MS = 110;

export function drawLethality(ctx, { x, y, elapsed, width, height, reducedMotion = false, backdrop = true }) {
  if (elapsed < 0 || elapsed >= LETHALITY_IMPACT_MS) return;
  const progress = elapsed / LETHALITY_IMPACT_MS;
  const alpha = Math.min(1, (1 - progress) * 3);
  ctx.save();
  if (backdrop) {
    ctx.globalAlpha = alpha * .7;
    ctx.fillStyle = '#100a19';
    ctx.fillRect(0, 58, width, height - 58);
  }
  ctx.translate(Math.round(x), Math.round(y));
  ctx.globalAlpha = alpha;
  const span = reducedMotion ? 55 : 35 + Math.min(1, elapsed / 90) * 50;
  for (const angle of [-.65, .65]) {
    ctx.save();
    ctx.rotate(angle);
    polygon(ctx, [[-span, -4], [-12, -9], [span, 0], [12, 8]], '#a71e46');
    polygon(ctx, [[-span, -1], [0, -3], [span, 0], [0, 3]], '#fff0d6');
    ctx.restore();
  }
  ctx.strokeStyle = '#ed426c';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, reducedMotion ? 30 : 14 + progress * 96, 0, Math.PI * 2);
  ctx.stroke();
  if (!reducedMotion) {
    for (let index = 0; index < 12; index++) {
      const angle = index * Math.PI / 6;
      const radius = 20 + progress * 100;
      ctx.fillStyle = index % 2 ? '#f5cbba' : '#c82d5a';
      ctx.fillRect(Math.round(Math.cos(angle) * radius), Math.round(Math.sin(angle) * radius * .65), 3, 3);
    }
  }
  ctx.restore();
}

export function drawLastBenediction(ctx, effect, floor, height, critical, reducedMotion) {
  const { x, progress, impacted, alpha, afterImpact } = effect;
  const width = (critical ? 54 : 38) * progress;
  ctx.save();
  ctx.globalAlpha = alpha * .8;
  ctx.strokeStyle = '#ffe3a4';
  ctx.lineWidth = 2;
  for (const radius of [width, width * .72]) {
    ctx.beginPath();
    ctx.ellipse(x, floor - 4, radius, radius / 4, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (let i = -2; i <= 2; i++) {
    const offset = i * width * .85;
    const rise = !impacted || reducedMotion ? progress : 1 + afterImpact / 1500;
    const y = impacted ? floor : floor - Math.abs(i) * 7 - progress * 35;
    const tip = floor - rise * height * (i ? .68 : 1);
    const span = impacted ? (i ? 8 : 18) : 2;
    polygon(ctx, [[x + offset, tip], [x + offset + span, y - 12],
      [x + offset, y], [x + offset - span, y - 12]], i ? '#efb768' : '#fff6cf');
  }
  ctx.restore();
}

function flame(ctx, x, floor, width, height, time, seed) {
  const pixel = (value) => Math.round(value / 2) * 2;
  for (const [scale, reach, color] of [[1, 1, '#982b19'], [.84, .94, '#ea4d19'],
    [.63, .85, '#ff9828'], [.4, .69, '#ffdc76'], [.19, .53, '#fff5cb']]) {
    const w = width * scale;
    const h = height * reach;
    const sway = Math.sin(time / 100 + seed) * w * .22;
    const point = (dx, dy) => [pixel(x + dx * w + sway * dy), pixel(floor - h * dy)];
    polygon(ctx, [point(-.56, 0), point(-.63, .2), point(-.41, .44), point(-.51, .73),
      point(-.17, .54), point(.02, 1), point(.21, .71), point(.22, .48), point(.5, .68),
      point(.39, .37), point(.58, .21), point(.44, 0)], color);
  }
}

export function drawCinderVigil(ctx, effect, { width, height, floor, critical, reducedMotion }) {
  const { x, progress, impacted, alpha } = effect;
  const time = reducedMotion ? 0 : Math.floor(effect.sinceRelease / 34) * 34;
  const aftermath = 1 - alpha;
  const burn = impacted ? Math.min(1, .64 + aftermath * 4) * (1 - aftermath ** 2) : 0;
  const radius = 22 + 50 * progress + aftermath * 120;
  ctx.save();
  ctx.globalAlpha = (impacted ? .34 + burn * .24 : progress * .53) * alpha;
  ctx.fillStyle = '#33120f';
  ctx.fillRect(0, 58, width, height - 58);

  ctx.globalAlpha = alpha * (impacted ? .85 : progress);
  ctx.strokeStyle = '#ffba57';
  ctx.lineWidth = 2;
  for (const [inset, dash] of [[0, []], [9, [4, 6]]]) {
    ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.ellipse(x, floor - 3, radius - inset, (radius - inset) * .23, 0, 0, 2 * Math.PI);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  if (impacted) {
    const heightScale = critical ? 1.22 : 1;
    const columns = [[-112, 88, 32], [112, 88, 34], [-67, 142, 48], [71, 155, 45],
      [-33, 173, 55], [35, 183, 55], [0, 232, 75]];
    for (const [i, [offset, size, breadth]] of columns.entries()) {
      const spread = reducedMotion ? 1 : .64 + aftermath * .8;
      const flicker = .92 + .08 * Math.sin(time / 65 + i);
      ctx.globalAlpha = alpha ** .65 * (reducedMotion ? .78 : .96);
      flame(ctx, x + offset * spread, floor, breadth * burn, size * heightScale * burn * flicker, time, i * 2);
    }
    if (!reducedMotion) {
      ctx.globalAlpha = .17 * Math.max(0, 1 - effect.afterImpact / 160);
      ctx.fillStyle = '#ffcf8c';
      ctx.fillRect(0, 58, width, height - 58);
    }
  } else {
    for (let i = -2; i <= 2; i++) {
      flame(ctx, x + i * radius / 2, floor, 5 + progress * 9, 9 + progress ** 2 * (30 - Math.abs(i) * 8), time, i);
    }
  }

  const sparks = reducedMotion ? 12 : impacted ? 52 : 20;
  for (let i = 0; i < sparks; i++) {
    const age = ((time + i * 97) % 760) / 760;
    const drift = (i * 47 % 101 - 50) / 50;
    const px = x + drift * radius * (1 + age);
    const py = floor - age * (impacted ? 180 : 64) * progress;
    ctx.globalAlpha = alpha * progress * (1 - age);
    ctx.fillStyle = i % 3 ? '#ff9d36' : '#fff0ab';
    const size = i % 5 ? 2 : 4;
    ctx.fillRect(Math.round(px / 2) * 2, Math.round(py / 2) * 2, size, size);
  }
  ctx.restore();
}

export function drawHeavyStrike(ctx, style, x, y, direction, progress, critical) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(direction, 1);
  ctx.globalAlpha = (1 - progress) ** 2;
  if (style === 'axe-cleave') {
    ctx.rotate(.95);
    const span = (critical ? 69 : 49) + progress * 28;
    polygon(ctx, [[-span, -12], [-span * .3, -4], [span * .72, -3], [span, -13],
      [span * .9, 3], [span * .45, 12], [-span * .45, 9]], '#d34a21');
    polygon(ctx, [[-span, -12], [-span * .25, 1], [span * .8, 0], [span, -13],
      [span * .84, 5], [-span * .4, 6]], '#ffd797');
  } else {
    const reach = (critical ? 82 : 62) + progress * 26;
    polygon(ctx, [[-reach, -9], [14, -5], [reach * .65, 0], [14, 6], [-reach, 9], [-reach * .64, 0]], '#d7a95b');
    polygon(ctx, [[-reach, 0], [10, -2], [reach * .65, 0], [10, 2]], '#fff4cb');
  }
  ctx.restore();
}
