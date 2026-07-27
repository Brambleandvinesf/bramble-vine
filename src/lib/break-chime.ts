/**
 * Break alert tones.
 *
 * Deliberately not the crow (src/lib/crow-sound.ts) - that means "a client is
 * waiting on you". A break starting is a different event and needs a different
 * sound, or the office learns to ignore both.
 *
 * Synthesised rather than an asset: two short tones need no network fetch, and
 * the office display may come up before anything is cached.
 */

let ctx: AudioContext | null = null;

function audioCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    try {
      ctx = new Ctor();
    } catch {
      return null;
    }
  }
  return ctx;
}

/**
 * Autoplay policy starts the context suspended until the page has been
 * interacted with. The kiosk may sit untouched all morning, so resume on the
 * first gesture of any kind and then stop listening.
 */
if (typeof window !== "undefined") {
  const unlock = () => {
    const c = audioCtx();
    if (c && c.state === "suspended") void c.resume().catch(() => {});
  };
  for (const ev of ["pointerdown", "keydown", "touchstart"] as const) {
    window.addEventListener(ev, unlock, { once: true, passive: true });
  }
}

function tone(c: AudioContext, freq: number, startAt: number, dur: number, gain: number) {
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  // Ramped rather than switched, so it reads as a chime instead of a click.
  g.gain.setValueAtTime(0.0001, startAt);
  g.gain.exponentialRampToValueAtTime(gain, startAt + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, startAt + dur);
  osc.connect(g).connect(c.destination);
  osc.start(startAt);
  osc.stop(startAt + dur + 0.02);
}

/**
 * `warn` = one minute out, two even tones.
 * `now`  = break has started, three rising tones so it is distinguishable
 *          from across the room without looking.
 */
export function playBreakChime(kind: "warn" | "now"): void {
  const c = audioCtx();
  if (!c) return;
  if (c.state === "suspended") void c.resume().catch(() => {});
  const t = c.currentTime + 0.02;
  try {
    if (kind === "warn") {
      tone(c, 660, t, 0.18, 0.25);
      tone(c, 660, t + 0.26, 0.18, 0.25);
    } else {
      tone(c, 523.25, t, 0.16, 0.3);
      tone(c, 659.25, t + 0.2, 0.16, 0.3);
      tone(c, 783.99, t + 0.4, 0.34, 0.3);
    }
  } catch {
    /* audio is a nicety; never let it break the screen */
  }
}
