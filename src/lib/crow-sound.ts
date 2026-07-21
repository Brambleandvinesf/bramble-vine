// Plays the existing MP3 at /crooooow_121108209.mp3.
// Uses a single unlocked HTMLAudioElement to satisfy autoplay policies.

const SRC = "/crooooow_121108209.mp3";
let audioEl: HTMLAudioElement | null = null;
let unlocked = false;

function getAudio(): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  if (!audioEl) {
    audioEl = new Audio(SRC);
    audioEl.preload = "auto";
    audioEl.crossOrigin = "anonymous";
  }
  return audioEl;
}

/**
 * Call once on a user gesture (tap/click/keydown) to unlock playback.
 * Performs a muted play+pause so subsequent programmatic plays are allowed.
 */
export function unlockCrowAudio(): void {
  if (unlocked) return;
  const a = getAudio();
  if (!a) return;
  const prevMuted = a.muted;
  const prevVol = a.volume;
  a.muted = true;
  a.volume = 0;
  const p = a.play();
  const finish = () => {
    try {
      a.pause();
      a.currentTime = 0;
    } catch {
      /* ignore */
    }
    a.muted = prevMuted;
    a.volume = prevVol;
    unlocked = true;
  };
  if (p && typeof (p as Promise<void>).then === "function") {
    (p as Promise<void>).then(finish).catch(() => {
      /* leave unlocked=false; a later gesture will retry */
    });
  } else {
    finish();
  }
}

// Back-compat shim (some callers may still import this).
export function ensureAudioContext(): null {
  return null;
}

/** Play the crow shriek MP3 at full volume. Safe to call repeatedly. */
export function playCrowShriek(): void {
  const a = getAudio();
  if (!a) return;
  try {
    a.muted = false;
    a.volume = 1;
    a.currentTime = 0;
    void a.play().catch(() => {
      /* blocked until user gesture unlocks */
    });
  } catch {
    /* ignore */
  }
}
