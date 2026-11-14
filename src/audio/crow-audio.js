export const CROW_AUDIO_URL = new URL('../../assets/audio/crow-calls.wav', import.meta.url).href;
const buffers = new WeakMap();

export function loadCrowAudio(context) {
  if (!buffers.has(context)) {
    const loading = fetch(CROW_AUDIO_URL).then(async (response) => {
      if (!response.ok) throw new Error(`Could not load crow audio: HTTP ${response.status}`);
      return context.decodeAudioData(await response.arrayBuffer());
    }).catch((error) => {
      buffers.delete(context);
      throw error;
    });
    buffers.set(context, loading);
  }
  return buffers.get(context);
}

export function playCrowCall(context, destination, buffer, {
  start = 0, pitch = 1, volume = .8, pan = 0,
} = {}) {
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = pitch;
  const gain = context.createGain();
  gain.gain.value = volume;
  const panner = context.createStereoPanner?.();
  source.connect(gain);
  if (panner) {
    panner.pan.value = pan;
    gain.connect(panner).connect(destination);
  } else gain.connect(destination);
  source.onended = () => {
    source.disconnect();
    gain.disconnect();
    panner?.disconnect();
  };
  source.start(context.currentTime + start);
}
