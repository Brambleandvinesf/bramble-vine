/* Is this browser THE WALL DISPLAY?
 *
 * Nothing in this app could answer that before — a grep for "kiosk" across src
 * turned up two comments and no mechanism. The kiosk is Chromium in --kiosk mode
 * on the Pi, launched from ~/.config/autostart/bvkiosk.desktop ->
 * /home/info/clock/bvkiosk.sh, which opens the PUBLISHED site. So the marker
 * lives in that launcher's URL: ?kiosk=1. A phone can never have it.
 *
 * WHY IT IS PERSISTED RATHER THAN READ FROM THE URL EACH TIME. /field and /login
 * both declare validateSearch, which drops unknown search keys — and the kiosk
 * lands on /login before anything else. So the param survives exactly one
 * navigation and then vanishes. Read it once, keep it in localStorage, same as
 * lib/auth.tsx and lib/auto-clock-in.ts already do for durable device facts.
 *
 * DELIBERATELY NOT THE OFFICE ROLE. Role would catch an office person on their
 * phone and black their screen out at 6pm mid-shift. This identifies a DEVICE,
 * which is what the requirement actually is.
 */

const KIOSK_KEY = "bv:isKiosk";

/** True on the wall display only. Persists the flag the first time it sees it. */
export function isKiosk(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search);
    const flagged = params.get("kiosk");
    if (flagged === "1") {
      localStorage.setItem(KIOSK_KEY, "1");
      return true;
    }
    /* ?kiosk=0 is the escape hatch: if this ever gets set on a device by
       accident, one visit clears it. */
    if (flagged === "0") {
      localStorage.removeItem(KIOSK_KEY);
      return false;
    }
    return localStorage.getItem(KIOSK_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Is it screensaver time in LA? 6pm–8am on weekdays, all day at weekends.
 *
 * Uses America/Los_Angeles explicitly rather than the device clock — the rest of
 * the app pins that timezone for every day boundary, and a wall display with a
 * drifted or mis-set clock should not decide this differently from the backend.
 */
export function isQuietHours(now: Date = new Date()): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "short",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hourRaw = parts.find((p) => p.type === "hour")?.value ?? "0";
  /* Intl renders midnight as "24" in some ICU versions under hour12:false. */
  const hour = Number(hourRaw) % 24;
  if (weekday === "Sat" || weekday === "Sun") return true;
  return hour >= 18 || hour < 8;
}
