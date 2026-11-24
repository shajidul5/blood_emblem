import { prepareCathedralLoop } from './cathedral-ambience.js';

export const SHORE_AUDIO_URLS = Object.freeze({
  ocean: new URL('../../assets/audio/shore-black-ocean.wav', import.meta.url).href,
  bells: new URL('../../assets/audio/shore-submerged-bells.wav', import.meta.url).href,
  sky: new URL('../../assets/audio/shore-impossible-sky.wav', import.meta.url).href,
});

export function createShoreAmbience(context, destination) {
  let active = false;
  let beacons = [true, true, true];
  const recordings = new Map();
  const layers = [
    { key: 'ocean', volume: .34 },
    { key: 'sky', volume: .12 },
    ...[0, 1, 2].map((beacon) => ({ key: 'bells', volume: .07, beacon })),
  ];

  function volume(layer) {
    return layer.beacon === undefined || beacons[layer.beacon] ? layer.volume : 0;
  }

  function load(key) {
    if (!recordings.has(key)) {
      const pending = fetch(SHORE_AUDIO_URLS[key]).then(async (response) => {
        if (!response.ok) throw new Error(`Shore ${key} response: ${response.status}`);
        return prepareCathedralLoop(context, await context.decodeAudioData(await response.arrayBuffer()));
      });
      recordings.set(key, pending);
      void pending.catch(() => recordings.delete(key));
    }
    return recordings.get(key);
  }

  function stop(layer) {
    const voice = layer.voice;
    if (!voice) return;
    layer.voice = undefined;
    const now = context.currentTime;
    layer.offset = (voice.offset + now - voice.started) % voice.source.buffer.duration;
    if (context.state === 'running') {
      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.setTargetAtTime(0, now, .15);
      voice.source.stop(now + .6);
    } else {
      voice.source.stop();
      voice.source.disconnect();
      voice.gain.disconnect();
    }
  }

  async function start(layer) {
    if (layer.voice || layer.loading) return;
    layer.loading = true;
    try {
      const buffer = await load(layer.key);
      if (!active || layer.voice || context.state !== 'running') return;
      const source = context.createBufferSource(), gain = context.createGain();
      const now = context.currentTime;
      const offset = layer.offset ?? (layer.beacon ?? 0) * buffer.duration / 3;
      source.buffer = buffer;
      source.loop = true;
      gain.gain.value = 0;
      source.connect(gain).connect(destination);
      source.onended = () => { source.disconnect(); gain.disconnect(); };
      gain.gain.setTargetAtTime(volume(layer), now, .4);
      source.start(now, offset);
      layer.voice = { source, gain, started: now, offset };
    } catch (error) {
      console.error(`Could not load Shore ${layer.key} ambience:`, error);
    } finally {
      layer.loading = false;
    }
  }

  function setActive(value, litBeacons = beacons) {
    if (!Array.isArray(litBeacons) || litBeacons.length !== 3 ||
        !litBeacons.every((lit) => typeof lit === 'boolean')) {
      throw new Error('Shore ambience needs three beacon states.');
    }
    active = Boolean(value);
    beacons = [...litBeacons];
    for (const layer of layers) {
      if (!active) stop(layer);
      else if (layer.voice) {
        const now = context.currentTime;
        layer.voice.gain.gain.cancelScheduledValues(now);
        layer.voice.gain.gain.setTargetAtTime(volume(layer), now, .4);
      } else void start(layer);
    }
  }
  return { setActive };
}
