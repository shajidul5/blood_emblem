export function playTimberCreak(context, destination, buffer, random = Math.random) {
  const now = context.currentTime;
  const duration = 1.6 + random() * 1.4;
  const pitch = 85 + random() * 70;
  const envelope = context.createGain();
  envelope.gain.setValueAtTime(0, now);
  envelope.gain.linearRampToValueAtTime(.48, now + .3);
  envelope.gain.exponentialRampToValueAtTime(.001, now + duration);
  envelope.connect(destination);
  const wood = context.createOscillator();
  wood.type = 'triangle';
  wood.frequency.setValueAtTime(pitch, now);
  wood.frequency.exponentialRampToValueAtTime(pitch * .68, now + duration * .65);
  wood.frequency.linearRampToValueAtTime(pitch * .82, now + duration);
  const resonance = context.createBiquadFilter();
  resonance.type = 'bandpass';
  resonance.frequency.setValueAtTime(pitch, now);
  resonance.frequency.exponentialRampToValueAtTime(pitch * .68, now + duration * .65);
  resonance.frequency.linearRampToValueAtTime(pitch * .82, now + duration);
  resonance.Q.value = 1.2;
  wood.connect(resonance).connect(envelope);
  const strain = context.createBufferSource();
  strain.buffer = buffer;
  const friction = context.createBiquadFilter();
  friction.type = 'bandpass';
  friction.frequency.value = 380;
  friction.Q.value = 6;
  const noiseGain = context.createGain();
  noiseGain.gain.value = .8;
  strain.connect(friction).connect(noiseGain).connect(envelope);
  wood.start(now);
  strain.start(now, random());
  wood.stop(now + duration);
  strain.stop(now + duration);
  wood.onended = () => {
    wood.disconnect();
    resonance.disconnect();
    strain.disconnect();
    friction.disconnect();
    noiseGain.disconnect();
    envelope.disconnect();
  };
}

export function createShipAmbience(context, destination, buffer) {
  const gain = context.createGain();
  gain.gain.value = 0;
  gain.connect(destination);
  const wind = context.createBufferSource();
  wind.buffer = buffer;
  wind.loop = true;
  wind.loopEnd = buffer.duration - .25;
  const filter = context.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 750;
  filter.Q.value = .5;
  const windGain = context.createGain();
  windGain.gain.value = .18;
  const gust = context.createOscillator();
  gust.frequency.value = .075;
  const depth = context.createGain();
  depth.gain.value = .08;
  gust.connect(depth).connect(windGain.gain);
  wind.connect(filter).connect(windGain).connect(gain);
  wind.start();
  gust.start();
  let active = false;
  let timer;
  const schedule = (first = false) => {
    timer = setTimeout(() => {
      if (!active) return;
      playTimberCreak(context, gain, buffer);
      schedule();
    }, first ? 600 + Math.random() * 400 : 4000 + Math.random() * 3500);
  };
  return {
    setActive(value) {
      if (active === value) return;
      active = value;
      gain.gain.cancelScheduledValues(context.currentTime);
      gain.gain.setTargetAtTime(active ? 1 : 0, context.currentTime, .35);
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
      if (active) schedule(true);
    },
  };
}
