import { getSoundOutput } from './ui-sounds.js';

export const GATE_SHRIEK_URL = new URL('../../assets/audio/gate-distant-shriek.wav', import.meta.url).href;
const buffers = new WeakMap();

export function loadGateShriek(context) {
  if (!buffers.has(context)) {
    const loading = fetch(GATE_SHRIEK_URL).then(async (response) => {
      if (!response.ok) throw new Error(`Could not load gate shriek: HTTP ${response.status}`);
      return context.decodeAudioData(await response.arrayBuffer());
    }).catch((error) => {
      buffers.delete(context);
      throw error;
    });
    buffers.set(context, loading);
  }
  return buffers.get(context);
}

export async function playDistantGateShriek() {
  if (document.hidden) return;
  const output = getSoundOutput();
  if (!output) return;
  const { context, destination } = output;
  const buffer = await loadGateShriek(context);
  if (document.hidden) return;
  const source = context.createBufferSource();
  const gain = context.createGain();
  source.buffer = buffer;
  gain.gain.value = .55;
  source.connect(gain).connect(destination);
  source.onended = () => {
    source.disconnect();
    gain.disconnect();
  };
  source.start();
}
