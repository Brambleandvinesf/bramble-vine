let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return null;
    audioCtx = new Ctx();
  }
  return audioCtx;
}

export function ensureAudioContext(): AudioContext | null {
  const ctx = getAudioContext();
  if (ctx && ctx.state === "suspended") {
    void ctx.resume();
  }
  return ctx;
}

/**
 * Synthesize a loud, harsh crow shriek using the Web Audio API.
 * No external audio files or connectors required.
 */
export function playCrowShriek() {
  const ctx = ensureAudioContext();
  if (!ctx) return;

  const t = ctx.currentTime;
  const duration = 1.1;

  // Master gain + heavy compression so it punches through
  const masterGain = ctx.createGain();
  masterGain.gain.value = 1.5;

  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -8;
  compressor.knee.value = 4;
  compressor.ratio.value = 16;
  compressor.attack.value = 0.001;
  compressor.release.value = 0.08;

  masterGain.connect(compressor).connect(ctx.destination);

  // --- Harsh oscillator shriek ---
  const osc = ctx.createOscillator();
  osc.type = "sawtooth";
  // Start high, dip, then rise and fall like a corvid screech
  osc.frequency.setValueAtTime(2200, t);
  osc.frequency.exponentialRampToValueAtTime(320, t + 0.16);
  osc.frequency.linearRampToValueAtTime(1400, t + 0.42);
  osc.frequency.exponentialRampToValueAtTime(220, t + duration);

  const oscGain = ctx.createGain();
  oscGain.gain.setValueAtTime(0, t);
  oscGain.gain.linearRampToValueAtTime(0.65, t + 0.025);
  oscGain.gain.exponentialRampToValueAtTime(0.001, t + duration);

  osc.connect(oscGain).connect(masterGain);

  // --- White-noise burst with bandpass for rasp ---
  const bufferSize = Math.ceil(ctx.sampleRate * duration);
  const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const noiseData = noiseBuffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    noiseData[i] = Math.random() * 2 - 1;
  }
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer;

  const bandpass = ctx.createBiquadFilter();
  bandpass.type = "bandpass";
  bandpass.frequency.value = 2500;
  bandpass.Q.value = 0.9;

  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0, t);
  noiseGain.gain.linearRampToValueAtTime(0.55, t + 0.02);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, t + duration * 0.75);

  noise.connect(bandpass).connect(noiseGain).connect(masterGain);

  // --- Subtle second oscillator for throatiness ---
  const throat = ctx.createOscillator();
  throat.type = "square";
  throat.frequency.setValueAtTime(520, t);
  throat.frequency.exponentialRampToValueAtTime(180, t + duration);
  const throatGain = ctx.createGain();
  throatGain.gain.setValueAtTime(0, t);
  throatGain.gain.linearRampToValueAtTime(0.2, t + 0.04);
  throatGain.gain.exponentialRampToValueAtTime(0.001, t + duration * 0.8);
  throat.connect(throatGain).connect(masterGain);

  osc.start(t);
  noise.start(t);
  throat.start(t);
  osc.stop(t + duration);
  noise.stop(t + duration);
  throat.stop(t + duration);
}
