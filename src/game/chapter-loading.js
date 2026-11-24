export const nextPaint = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
const textureUploads = new WeakMap();

export async function buildWithAssets(manager, build, onProgress = () => {}) {
  const original = { itemStart: manager.itemStart, itemEnd: manager.itemEnd, itemError: manager.itemError };
  const pending = new Map();
  const failed = new Set();
  let total = 0;
  let completed = 0;
  let settled;
  manager.itemStart = function(url) {
    pending.set(url, (pending.get(url) ?? 0) + 1);
    onProgress(completed, ++total);
    original.itemStart.call(this, url);
  };
  manager.itemEnd = function(url) {
    if (pending.has(url)) {
      const count = pending.get(url);
      if (count === 1) pending.delete(url);
      else pending.set(url, count - 1);
      onProgress(++completed, total);
      if (!pending.size) settled?.();
    }
    original.itemEnd.call(this, url);
  };
  manager.itemError = function(url) {
    if (pending.has(url)) failed.add(url);
    original.itemError.call(this, url);
  };
  try {
    const ready = await build();
    if (pending.size) await new Promise(resolve => { settled = resolve; });
    if (failed.size) throw new Error(`Could not load chapter artwork: ${[...failed].join(', ')}`);
    return ready;
  } finally {
    Object.assign(manager, original);
  }
}

export async function prepareMotion(sprites, sets, onProgress = () => {}) {
  const unique = [...new Set(sets)];
  onProgress(0, unique.length);
  for (let index = 0; index < unique.length; index++) {
    await sprites.loadMotion(unique[index]);
    onProgress(index + 1, unique.length);
    await nextPaint();
  }
}

export async function warmTextures(renderer, textures, onProgress = () => {}) {
  let uploaded = textureUploads.get(renderer);
  if (!uploaded) {
    uploaded = new WeakMap();
    textureUploads.set(renderer, uploaded);
  }
  const unique = [...new Set(textures)].filter(texture => {
    if (!texture?.image) return false;
    const prior = uploaded.get(texture);
    return !prior || prior.version !== texture.version;
  });
  onProgress(0, unique.length);
  let batchStarted = performance.now();
  let batchCount = 0;
  for (let index = 0; index < unique.length; index++) {
    const texture = unique[index];
    renderer.initTexture(texture);
    let record = uploaded.get(texture);
    if (!record) {
      record = {};
      uploaded.set(texture, record);
      texture.addEventListener?.('dispose', () => { record.version = -1; });
    }
    record.version = texture.version;
    batchCount++;
    if (batchCount === 16 || performance.now() - batchStarted >= 6 || index + 1 === unique.length) {
      onProgress(index + 1, unique.length);
      await new Promise(resolve => requestAnimationFrame(resolve));
      batchStarted = performance.now();
      batchCount = 0;
    }
  }
}
