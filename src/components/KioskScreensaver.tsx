import { useCallback, useEffect, useRef, useState } from "react";
import { isKiosk, isQuietHours } from "../lib/kiosk";

/* Wall-display screensaver: 6pm–8am weekdays, all day weekends (LA time).
 *
 * A CSS animation over a black overlay — NOT a device sleep. The Pi is left
 * powered and the browser keeps running, so the app is already live when the
 * crew arrives rather than waking up cold.
 *
 * KIOSK ONLY. isKiosk() identifies the DEVICE (a ?kiosk=1 flag persisted from
 * the launcher URL), never a role — so this can never black out a lead's phone
 * mid-shift, which is the one thing it must not do.
 *
 * IT IS DISMISSIBLE, on purpose. That Pi is not only a wall display — its own
 * launcher comments note Gmail, Quo and Drive get real use on it. A cover that
 * could not be dismissed would make the machine unusable after 6pm. Any touch,
 * click or key dismisses it, and it re-arms after a few idle minutes.
 */

const IDLE_REARM_MS = 3 * 60_000;

export function KioskScreensaver() {
  /* Read once: the flag is durable and this must not re-run per render. */
  const [kiosk] = useState<boolean>(() => isKiosk());
  const [quiet, setQuiet] = useState<boolean>(() => isQuietHours());
  const [dismissed, setDismissed] = useState(false);
  const idleTimer = useRef<number | null>(null);

  /* Poll the clock rather than computing the next 8am/6pm — a minute of lag is
     invisible on a wall display and cannot drift out of step with isQuietHours
     across a DST change. */
  useEffect(() => {
    if (!kiosk) return;
    const t = window.setInterval(() => setQuiet(isQuietHours()), 60_000);
    return () => window.clearInterval(t);
  }, [kiosk]);

  /* Leaving quiet hours clears any manual dismissal, so tomorrow evening arms
     itself again without anyone touching the machine. */
  useEffect(() => {
    if (!quiet) setDismissed(false);
  }, [quiet]);

  const armIdle = useCallback(() => {
    if (idleTimer.current) window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => setDismissed(false), IDLE_REARM_MS);
  }, []);

  /* While dismissed, watch for activity and re-arm once it stops. */
  useEffect(() => {
    if (!kiosk || !quiet || !dismissed) return;
    const evts: (keyof WindowEventMap)[] = ["pointerdown", "keydown", "wheel", "touchstart"];
    evts.forEach((e) => window.addEventListener(e, armIdle, { passive: true }));
    armIdle();
    return () => {
      evts.forEach((e) => window.removeEventListener(e, armIdle));
      if (idleTimer.current) window.clearTimeout(idleTimer.current);
    };
  }, [kiosk, quiet, dismissed, armIdle]);

  if (!kiosk || !quiet || dismissed) return null;

  return (
    <div
      onPointerDown={() => setDismissed(true)}
      onKeyDown={() => setDismissed(true)}
      role="presentation"
      aria-label="Wall display resting. Touch to wake."
      style={{
        position: "fixed",
        inset: 0,
        /* Above the spine (4000) and the menu (110); this is the top layer. */
        zIndex: 99_000,
        background: "#000",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "none",
        overflow: "hidden",
        /* Nothing behind it should be reachable while it is up. */
        touchAction: "none",
      }}
    >
      <style>{`
        @keyframes bvMedallion {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes bvMedallionBreathe {
          0%, 100% { opacity: .70; }
          50%      { opacity: .92; }
        }
        /* Respect a reduced-motion preference: hold it still rather than spin. */
        @media (prefers-reduced-motion: reduce) {
          .bv-medallion { animation: none !important; }
        }
      `}</style>
      <img
        className="bv-medallion"
        src="/bvlogo-circle-full.png"
        alt=""
        draggable={false}
        style={{
          /* Large, but never cropped on either axis of the wall display. */
          width: "min(62vw, 62vh)",
          height: "min(62vw, 62vh)",
          objectFit: "contain",
          /* Slow: a full turn a minute reads as a medallion turning, not a
             spinner. Two stacked animations so it turns AND breathes. */
          animation: "bvMedallion 60s linear infinite, bvMedallionBreathe 8s ease-in-out infinite",
          willChange: "transform, opacity",
          userSelect: "none",
        }}
      />
    </div>
  );
}
