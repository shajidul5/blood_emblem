export const CATHEDRAL_CHANT_URL = new URL('../../assets/audio/the-last-litany.mp3', import.meta.url).href;

export function prepareCathedralLoop(context, recording) {
  const { sampleRate, numberOfChannels, length } = recording;
  const start = sampleRate;
  const end = length - 4 * sampleRate;
  const blend = 3 * sampleRate;
  if (end - start <= 2 * blend) throw new Error('Cathedral recording is too short to loop.');
  const loop = context.createBuffer(numberOfChannels, end - start - blend, sampleRate);
  for (let channel = 0; channel < numberOfChannels; channel++) {
    const input = recording.getChannelData(channel);
    const output = loop.getChannelData(channel);
    output.set(input.subarray(start + blend, end));
    // Blend the tail into the skipped head so the wrap continues at the next sample.
    for (let i = 0; i < blend; i++) {
      const index = output.length - blend + i;
      const mix = i / (blend - 1);
      output[index] = output[index] * (1 - mix) + input[start + i] * mix;
    }
  }
  return loop;
}

export function createCathedralAmbience(context, destination) {
  let active = false;
  let loading;
  let voice;
  let offset = 0;

  function setActive(value) {
    active = value;
    if (!active && voice) {
      const { source, gain, started } = voice;
      const now = context.currentTime;
      offset = (offset + now - started) % source.buffer.duration;
      voice = undefined;
      if (context.state === 'running') {
        gain.gain.cancelScheduledValues(now);
        gain.gain.setTargetAtTime(0, now, .12);
        source.stop(now + .5);
      } else {
        source.stop();
        source.disconnect();
        gain.disconnect();
      }
    }
    if (!active || voice) return;
    if (!loading) {
      loading = fetch(CATHEDRAL_CHANT_URL)
        .then(async (response) => {
          if (!response.ok) throw new Error(`Cathedral chant response: ${response.status}`);
          return prepareCathedralLoop(context, await context.decodeAudioData(await response.arrayBuffer()));
        })
        .catch((error) => {
          loading = undefined;
          console.error('Could not load Cathedral ambience:', error);
          return null;
        });
    }
    void loading.then((buffer) => {
      if (!buffer || !active || voice || context.state !== 'running') return;
      const source = context.createBufferSource();
      const gain = context.createGain();
      source.buffer = buffer;
      source.loop = true;
      gain.gain.value = 0;
      source.connect(gain).connect(destination);
      source.onended = () => {
        source.disconnect();
        gain.disconnect();
      };
      const now = context.currentTime;
      gain.gain.setTargetAtTime(.42, now, .3);
      source.start(now, offset);
      voice = { source, gain, started: now };
    });
  }

  return { setActive };
}
