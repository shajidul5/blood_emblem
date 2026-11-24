function noise(context, destination, buffer, { at = context.currentTime, duration, frequency, volume, type = 'bandpass' }) {
  const source = context.createBufferSource();
  source.buffer = buffer;
  const filter = context.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = frequency;
  const gain = context.createGain();
  gain.gain.setValueAtTime(.0001, at);
  gain.gain.exponentialRampToValueAtTime(volume, at + Math.min(.08, duration / 4));
  gain.gain.exponentialRampToValueAtTime(.0001, at + duration);
  source.connect(filter).connect(gain).connect(destination);
  source.start(at, Math.random() * 2);
  source.stop(at + duration);
  source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
}

function tone(context, destination, { at = context.currentTime, frequency, end = frequency, duration, volume, type = 'sine' }) {
  const source = context.createOscillator();
  source.type = type;
  source.frequency.setValueAtTime(frequency, at);
  source.frequency.exponentialRampToValueAtTime(end, at + duration);
  const gain = context.createGain();
  gain.gain.setValueAtTime(.0001, at);
  gain.gain.exponentialRampToValueAtTime(volume, at + .015);
  gain.gain.exponentialRampToValueAtTime(.0001, at + duration);
  source.connect(gain).connect(destination);
  source.start(at);
  source.stop(at + duration);
  source.onended = () => { source.disconnect(); gain.disconnect(); };
}

export function playClockBell(context, destination) {
  for (const [frequency, volume, duration] of [[110, .18, 5], [231, .07, 3.8], [302, .04, 2.4]]) {
    tone(context, destination, { frequency, volume, duration });
  }
}

export function playPursuitHooves(context, destination, buffer) {
  for (let index = 0; index < 12; index++) {
    const at = context.currentTime + index * .19 + (index % 2 ? .035 : 0);
    noise(context, destination, buffer, { at, duration: .085, frequency: 850, volume: .45 });
    tone(context, destination, { at, frequency: index % 2 ? 110 : 85, end: 55,
      duration: .1, volume: .18 });
  }
}

export function createCityAmbience(context, destination, buffer) {
  const gain = context.createGain();
  gain.gain.value = 0;
  gain.connect(destination);
  const wind = context.createBufferSource();
  wind.buffer = buffer;
  wind.loop = true;
  wind.loopEnd = buffer.duration - .25;
  const filter = context.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 760;
  filter.Q.value = .7;
  const windGain = context.createGain();
  windGain.gain.value = .18;
  wind.connect(filter).connect(windGain).connect(gain);
  wind.start(0);
  let active = false;
  const timers = new Set();
  const every = (minimum, spread, play) => {
    const id = setTimeout(() => {
      timers.delete(id);
      if (!active) return;
      play();
      every(minimum, spread, play);
    }, minimum + Math.random() * spread);
    timers.add(id);
  };
  return {
    warnPursuit() {
      if (active) playPursuitHooves(context, gain, buffer);
    },
    setActive(value) {
      if (active === value) return;
      active = value;
      gain.gain.cancelScheduledValues(context.currentTime);
      gain.gain.setTargetAtTime(active ? 1 : 0, context.currentTime, .35);
      for (const id of timers) clearTimeout(id);
      timers.clear();
      if (!active) return;
      every(12000, 12000, () => {
        tone(context, gain, { frequency: 340, end: 230, duration: 1.1, volume: .025, type: 'triangle' });
        noise(context, gain, buffer, { duration: .8, frequency: 1800, volume: .08 });
      });
      every(5000, 8000, () => {
        for (let index = 0; index < 3; index++)
          noise(context, gain, buffer, { at: context.currentTime + index * .17,
            duration: .12, frequency: 2200 + Math.random() * 1000, volume: .07 });
      });
      every(22000, 18000, () =>
        tone(context, gain, { frequency: 87, end: 66, duration: 2.1, volume: .018, type: 'triangle' }));
      every(45000, 25000, () => playClockBell(context, gain));
    },
  };
}
