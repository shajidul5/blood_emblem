// Blood-Emblem animated main menu.
// The scene is a stack of 320x180 pixel-art layers drawn onto one small canvas;
// CSS scales the canvas with nearest-neighbor rendering to keep the pixels sharp.

import layerMetadata from '../assets/ui/menu/layers.json';

const W = 320;
const H = 180;
const IMAGE_URLS = import.meta.glob('../assets/ui/menu/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
});
let ctx;

// ------------------------------------------------------------ loading
function loadImage(name) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load ' + name));
    const url = IMAGE_URLS[`../assets/ui/menu/${name}.png`];
    if (!url) {
      reject(new Error(`Missing menu image "${name}".`));
      return;
    }
    img.src = url;
  });
}

const NAMES = ['sky', 'moon', 'clouds_far', 'clouds_mid', 'mist', 'town', 'fg',
  'vignette', 'water', 'reflection', 'town_reflection'];

async function loadAll() {
  const [meta, ...imgs] = await Promise.all([
    Promise.resolve(layerMetadata),
    ...NAMES.map(loadImage),
  ]);
  const L = {};
  NAMES.forEach((n, i) => (L[n] = imgs[i]));
  return { meta, L };
}

// ------------------------------------------------------------ helpers
// Deterministic pseudo-random in [0,1) from integers, so flicker is stable per frame.
function hash(a, b = 0) {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  return ((h >>> 0) % 100000) / 100000;
}

function drawWrapped(img, offset, y = 0) {
  const o = ((Math.round(offset) % W) + W) % W;
  ctx.drawImage(img, o, y);
  ctx.drawImage(img, o - W, y);
}

// ------------------------------------------------------------ animation
let meta;
let L;

function drawCrow(x, y, frame) {
  // 5x3 flapping silhouette
  ctx.fillStyle = '#14101f';
  const f = frame % 4;
  if (f === 0) { ctx.fillRect(x, y, 1, 1); ctx.fillRect(x + 1, y + 1, 1, 1); ctx.fillRect(x + 2, y + 2, 1, 1); ctx.fillRect(x + 3, y + 1, 1, 1); ctx.fillRect(x + 4, y, 1, 1); }
  else if (f === 1 || f === 3) { ctx.fillRect(x, y + 1, 2, 1); ctx.fillRect(x + 2, y + 2, 1, 1); ctx.fillRect(x + 3, y + 1, 2, 1); }
  else { ctx.fillRect(x, y + 2, 1, 1); ctx.fillRect(x + 1, y + 1, 1, 1); ctx.fillRect(x + 2, y, 1, 1); ctx.fillRect(x + 3, y + 1, 1, 1); ctx.fillRect(x + 4, y + 2, 1, 1); }
}

const CROWS = [
  { x0: 20, y: 38, speed: 9, phase: 0.0, bob: 3 },
  { x0: 70, y: 30, speed: 8, phase: 1.3, bob: 2 },
  { x0: 150, y: 46, speed: 10, phase: 2.1, bob: 3 },
];

function draw(t) {
  const { hor, stars, sparkles, windows } = meta;
  ctx.clearRect(0, 0, W, H);

  // --- sky
  ctx.drawImage(L.sky, 0, 0);

  // --- twinkling stars
  stars.forEach(([x, y, col], i) => {
    const sp = 0.6 + ((i * 37) % 10) / 10 * 1.6;
    const a = 0.45 + 0.55 * Math.max(0, Math.sin(t * sp + i * 1.7));
    ctx.globalAlpha = a;
    ctx.fillStyle = col;
    ctx.fillRect(x, y, 1, 1);
  });
  sparkles.forEach(([x, y], i) => {
    const a = 0.35 + 0.65 * Math.max(0, Math.sin(t * 1.1 + i * 2.3));
    ctx.globalAlpha = a;
    ctx.fillStyle = '#d9d4ee';
    ctx.fillRect(x, y, 1, 1);
    ctx.globalAlpha = a * 0.7;
    ctx.fillRect(x - 1, y, 1, 1); ctx.fillRect(x + 1, y, 1, 1);
    ctx.fillRect(x, y - 1, 1, 1); ctx.fillRect(x, y + 1, 1, 1);
  });
  ctx.globalAlpha = 1;

  // --- shooting star, one every ~14 s
  const cyc = Math.floor(t / 14);
  const lt = t - cyc * 14 - 3;           // starts 3 s into each cycle
  if (lt >= 0 && lt < 0.9) {
    const p = lt / 0.9;
    const sx = 20 + hash(cyc, 1) * 150;
    const sy = 4 + hash(cyc, 2) * 24;
    for (let k = 0; k < 9; k++) {
      const q = Math.max(0, p - k * 0.025);
      ctx.globalAlpha = (1 - k / 9) * (1 - p * 0.5);
      ctx.fillStyle = k < 2 ? '#ffffff' : '#b9b3d4';
      ctx.fillRect(Math.round(sx + q * 80), Math.round(sy + q * 30), 1, 1);
    }
    ctx.globalAlpha = 1;
  }

  // --- moon
  ctx.drawImage(L.moon, 0, 0);

  // --- clouds (drift left, wrap around)
  drawWrapped(L.clouds_far, -t * 3);
  drawWrapped(L.clouds_mid, -t * 7);

  // --- crows flapping across the sky
  CROWS.forEach((c, i) => {
    const x = (((c.x0 + t * c.speed) % (W + 20)) + (W + 20)) % (W + 20) - 10;
    const y = Math.round(c.y + Math.sin(t * 0.7 + c.phase) * c.bob);
    drawCrow(Math.round(x), y, Math.floor(t * 6 + i));
  });

  // --- water, row by row: drifting streaks + gentle sway; deeper rows move more
  const wh = H - hor;
  for (let r = 0; r < wh; r++) {
    const depth = r / wh;
    const y = hor + r;
    const off = Math.sin(t * 0.8 + r * 0.45) * (0.4 + depth * 2.0) + t * (1.2 + depth * 5);
    const o = ((Math.round(off) % W) + W) % W;
    ctx.drawImage(L.water, 0, r, W, 1, o, y, W, 1);
    ctx.drawImage(L.water, 0, r, W, 1, o - W, y, W, 1);
  }

  // --- moon reflection: sways and glitters
  for (let r = 1; r < wh; r++) {
    const depth = r / wh;
    const y = hor + r;
    if (hash(r, Math.floor(t * 3)) < 0.1) continue;           // brief dropouts
    const sway = Math.round(Math.sin(t * 1.3 + r * 0.55) * (1 + depth * 3));
    ctx.globalAlpha = 0.7 + 0.3 * Math.sin(t * 2.4 + r * 1.9);
    ctx.drawImage(L.reflection, 0, r, W, 1, sway, y, W, 1);
  }
  ctx.globalAlpha = 1;

  // --- town reflection wobble
  for (let r = 2; r < 14; r++) {
    const sway = Math.round(Math.sin(t * 1.1 + r * 0.9) * 1);
    ctx.drawImage(L.town_reflection, 0, r, W, 1, sway, hor + r, W, 1);
  }

  // --- drifting mist along the horizon
  drawWrapped(L.mist, t * 4);

  // --- town silhouette + flickering lights
  ctx.drawImage(L.town, 0, 0);
  windows.forEach((g, gi) => {
    let a = 1;
    if (g.k === 'win') {
      const slow = 0.8 + 0.2 * Math.sin(t * (1.2 + (gi % 5) * 0.35) + gi * 2.1);
      const flick = hash(gi, Math.floor(t * 4)) < 0.06 ? 0.35 : 1;   // occasional gutter
      a = slow * flick;
    } else if (g.k === 'lamp') {
      a = 0.75 + 0.25 * Math.sin(t * 7 + gi) * Math.sin(t * 3.1 + gi * 0.7);
    } else if (g.k === 'rose') {
      a = 0.6 + 0.4 * Math.sin(t * 0.9);
    } else {
      a = 0.85 + 0.15 * Math.sin(t * 0.7 + gi);
    }
    ctx.globalAlpha = Math.max(0, Math.min(1, a));
    g.p.forEach(([x, y, c]) => {
      ctx.fillStyle = c;
      ctx.fillRect(x, y, 1, 1);
    });
    if (g.k === 'lamp') {                       // soft warm halo
      const [lx, ly] = g.p[0];
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = '#f2b04a';
      for (let dy = -3; dy <= 3; dy++) {
        for (let dx = -3; dx <= 3; dx++) {
          const d = Math.abs(dx) + Math.abs(dy);
          if (d === 0 || d > 3) continue;
          ctx.globalAlpha = (0.16 - d * 0.04) * a;     // fades out with distance
          ctx.fillRect(lx + dx, ly + dy, 1, 1);
        }
      }
      ctx.globalCompositeOperation = 'source-over';
    }
  });
  ctx.globalAlpha = 1;

  // --- foreground + vignette
  ctx.drawImage(L.fg, 0, 0);
  ctx.drawImage(L.vignette, 0, 0);
}

export function initializeAnimatedMenu() {
  const canvas = document.getElementById('scene');
  if (!canvas) throw new Error('Animated menu canvas #scene was not found.');
  ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not initialize the animated menu canvas.');
  ctx.imageSmoothingEnabled = false;

  const mainMenu = document.getElementById('main-menu');
  const params = new URLSearchParams(location.search);
  loadAll().then((data) => {
    ({ meta, L } = data);
    window.__draw = draw;
    if (params.has('freeze')) {
      draw(Number(params.get('freeze')) || 0);
      return;
    }
    const startedAt = performance.now();
    const loop = () => {
      if (!mainMenu.hidden) draw((performance.now() - startedAt) / 1000);
      requestAnimationFrame(loop);
    };
    loop();
  }).catch((error) => {
    console.error('Unable to load animated menu artwork:', error);
    const menuStatus = document.getElementById('menu-status');
    if (menuStatus) menuStatus.textContent = 'The animated menu background could not be loaded.';
  });
}
