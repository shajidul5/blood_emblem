// Hollow Wood ambience: canopy wind, leaf rustles, snapping twigs and distant crows.
// Something follows Maria through these trees, so the crows never quite stop.

import { loadCrowAudio, playCrowCall } from './crow-audio.js';

function playRustle(context, destination, buffer, random = Math.random) {
  const now = context.currentTime;
  const duration = 1.2 + random() * 1.6;
  const source = context.createBufferSource();
  source.buffer = buffer;
  const filter = context.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 2600 + random() * 1800;
  const gain = context.createGain();
  gain.gain.setValueAtTime(.0001, now);
  gain.gain.exponentialRampToValueAtTime(.35, now + duration * .4);
  gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
  source.connect(filter).connect(gain).connect(destination);
  source.start(now, random() * 3);
  source.stop(now + duration);
  source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
}

function playTwigSnap(context, destination, buffer, random = Math.random) {
  const now = context.currentTime;
  for (let index = 0; index < 2; index++) {
    const at = now + index * (.05 + random() * .05);
    const source = context.createBufferSource();
    source.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1500 + random() * 1200;
    filter.Q.value = 2;
    const gain = context.createGain();
    gain.gain.setValueAtTime(.0001, at);
    gain.gain.exponentialRampToValueAtTime(.5, at + .004);
    gain.gain.exponentialRampToValueAtTime(.0001, at + .06);
    source.connect(filter).connect(gain).connect(destination);
    source.start(at, random() * 3);
    source.stop(at + .08);
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
  }
}

export function createForestAmbience(context, destination, buffer) {
  const gain = context.createGain();
  gain.gain.value = 0;
  gain.connect(destination);
  // Canopy wind: band-limited noise that swells and falls slowly.
  const wind = context.createBufferSource();
  wind.buffer = buffer;
  wind.loop = true;
  wind.loopEnd = buffer.duration - .25;
  const filter = context.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 520;
  filter.Q.value = .6;
  const windGain = context.createGain();
  windGain.gain.value = .32;
  const gust = context.createOscillator();
  gust.frequency.value = .06;
  const depth = context.createGain();
  depth.gain.value = .16;
  gust.connect(depth).connect(windGain.gain);
  wind.connect(filter).connect(windGain).connect(gain);
  wind.start(0, Math.random() * 4);
  gust.start();
  let active = false;
  let activation = 0;
  const timers = new Set();
  const every = (min, spread, play, repeat = true) => {
    const id = setTimeout(() => {
      timers.delete(id);
      if (!active) return;
      play();
      if (repeat) every(min, spread, play);
    }, min + Math.random() * spread);
    timers.add(id);
  };
  return {
    setActive(value) {
      if (active === value) return;
      active = value;
      const currentActivation = ++activation;
      gain.gain.cancelScheduledValues(context.currentTime);
      gain.gain.setTargetAtTime(active ? 1 : 0, context.currentTime, .5);
      for (const id of timers) clearTimeout(id);
      timers.clear();
      if (!active) return;
      loadCrowAudio(context).then((crowBuffer) => {
        if (!active || activation !== currentActivation) return;
        const call = () => playCrowCall(context, gain, crowBuffer, {
          pitch: .95 + Math.random() * .1, volume: .75 + Math.random() * .15, pan: Math.random() * 1.2 - .6,
        });
        every(600, 400, () => {
          call();
          every(8000, 6000, call);
        }, false);
      }).catch((error) => console.error('Could not start forest crow calls:', error));
      every(3000, 5000, () => playRustle(context, gain, buffer));
      every(9000, 12000, () => playTwigSnap(context, gain, buffer));
    },
  };
}
