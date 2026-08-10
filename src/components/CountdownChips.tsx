import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useDayState, useServerOffsetMs, type BreakItem } from "../lib/day-state";
import { useViewAs } from "../lib/view-as";
import { playBreakChime } from "../lib/break-chime";

const LIME = "#7cff00";
const MONO = "'Courier New', Courier, monospace";
const TZ = "America/Los_Angeles";

/** How early the first warning fires. */
const WARN_MS = 60_000;

/** Parse a break time into an epoch ms for TODAY (LA-local). Accepts ISO or "H:MM" (24h) or "h:mm AM/PM". */
function parseBreakTime(t: string): number | null {
  if (!t) return null;
  const iso = Date.parse(t);
  if (!isNaN(iso)) return iso;
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const get = (k: string) => parts.find((p) => p.type === k)?.value ?? "";
  const y = get("year"), mo = get("month"), da = get("day");
  const s = t.trim();
  const ampm = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  const h24 = s.match(/^(\d{1,2}):(\d{2})$/);
  let hh = 0, mm = 0;
  if (ampm) {
    hh = Number(ampm[1]) % 12;
    if (/PM/i.test(ampm[3])) hh += 12;
    mm = Number(ampm[2]);
  } else if (h24) {
    hh = Number(h24[1]); mm = Number(h24[2]);
  } else {
    return null;
  }
  // Interpret as LA-local: build a Date at 19:00 UTC on that day then adjust.
  // Precise LA local -> epoch is hard without a tz library; approximate by
  // parsing an ISO string with -07:00 or -08:00. Detect current LA offset.
  const laOff = laOffsetHours(now);
  const sign = laOff >= 0 ? "+" : "-";
  const off = String(Math.abs(laOff)).padStart(2, "0");
  const isoLocal = `${y}-${mo}-${da}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00${sign}${off}:00`;
  const p = Date.parse(isoLocal);
  return isNaN(p) ? null : p;
}

function laOffsetHours(d: Date): number {
  // Compute LA offset from UTC in hours (negative for west).
  const utc = new Date(d.toLocaleString("en-US", { timeZone: "UTC" })).getTime();
  const la = new Date(d.toLocaleString("en-US", { timeZone: TZ })).getTime();
  return Math.round((la - utc) / 3_600_000);
}

function fmtHM(ms: number): string {
  // "H:MM" style clock time for a given epoch, in LA.
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, hour: "numeric", minute: "2-digit",
  }).format(new Date(ms));
}

function fmtMMSS(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** "2HR 14M 03S", dropping the hours segment until there are some. */
function fmtHMS(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}HR ${mm}M ${ss}S` : `${mm}M ${ss}S`;
}

/**
 * "10-MINUTE BREAK" / "LUNCH". The sheet only carries a label, so the length
 * is inferred: anything that is not lunch is a ten-minute break unless the
 * label names its own duration ("15 min break").
 */
function breakTitle(label: string): string {
  const l = (label || "").trim();
  if (/lunch/i.test(l)) return "LUNCH";
  const named = l.match(/(\d+)\s*-?\s*(?:min|minute)/i);
  const mins = named ? named[1] : "10";
  return `${mins}-MINUTE BREAK`;
}

/**
 * How LONG a break runs, in minutes (CC-02 item 10, 8/7).
 *
 * The SAME label parsing breakTitle already does — deliberately not a second
 * break configuration. The sheet carries only a time and a label, so duration has
 * always been inferred from the label; this returns the number rather than a
 * display string, so a countdown can reach a break's END and not only its start.
 *
 * Lunch is the one fixed value: 1:15–2:15, therefore 60. Its label names no
 * duration, so before this it had none at all — which is why nothing could count
 * down to the end of lunch.
 */
function breakMinutes(label: string): number {
  if (/lunch/i.test((label || "").trim())) return 60;
  const named = (label || "").match(/(\d+)\s*-?\s*(?:min|minute)/i);
  return named ? parseInt(named[1], 10) || 10 : 10;
}

const CHIP_BASE: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  background: "#0a0a0a",
  color: LIME,
  border: `1px solid ${LIME}`,
  borderRadius: 999,
  fontFamily: MONO,
  fontWeight: "bold",
  letterSpacing: 1.5,
  textTransform: "uppercase",
  padding: "8px 14px",
};

export function CountdownChips({
  showDeparture = false,
}: {
  /**
   * The departure chip belongs to the final step of the HQ_LOADING group only.
   * On the standby/schedule screen the day is still being confirmed, and a
   * DEPART NOW there reads as an instruction to leave mid-setup.
   */
  showDeparture?: boolean;
} = {}) {
  const state = useDayState();
  const offset = useServerOffsetMs();
  const { effectiveRole } = useViewAs();
  const [tick, setTick] = useState(0);
  const [flash, setFlash] = useState<"warn" | "now" | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => (n + 1) & 0xffff), 1000);
    return () => window.clearInterval(id);
  }, []);
  void tick;

  const now = Date.now() + offset;

  // Departure
  const departAtRaw = state?.departAt ?? null;
  const departAt = departAtRaw ? Date.parse(departAtRaw) : NaN;
  const hasDepart = showDeparture && !!departAtRaw && !isNaN(departAt);
  const departDiff = hasDepart ? departAt - now : 0;
  const departPassed = hasDepart && departDiff <= 0;

  // Breaks: office and management both run to this clock.
  const seesBreaks = effectiveRole === "office" || effectiveRole === "management";
  const breaks: BreakItem[] = Array.isArray(state?.breaks) ? state!.breaks! : [];
  const parsedBreaks = breaks
    .map((b) => ({ ...b, at: parseBreakTime(b.time) }))
    .filter((b): b is BreakItem & { at: number } => b.at !== null)
    .sort((a, b) => a.at - b.at);
  /* (CC-02 item 10) Hold a break for its whole DURATION, not 60s past its start.
     The old 60s BREAK_GRACE_MS existed only to stop "NOW" being a blink, so after
     one minute the current break was dropped and the chip jumped to the NEXT — with a
     ten-minute break nine minutes still to run, and an hour of lunch. That is why
     nothing could count down to a break ending: the break stopped being current
     almost immediately. Now a break stays current until it is actually over. */
  const nextBreak = parsedBreaks.find(
    (b) => now < b.at + breakMinutes(b.label) * 60_000,
  );
  const breakDiff = nextBreak ? nextBreak.at - now : 0;
  const breakStarted = !!nextBreak && breakDiff <= 0;
  const breakWarning = !!nextBreak && breakDiff > 0 && breakDiff <= WARN_MS;
  /* Time left until this break TERMINATES — what the in-progress display counts. */
  const breakEndsAt = nextBreak ? nextBreak.at + breakMinutes(nextBreak.label) * 60_000 : 0;
  const breakRemainMs = nextBreak ? breakEndsAt - now : 0;
  const breakInProgress = !!nextBreak && breakStarted && breakRemainMs > 0;

  // Alerts fire once per break per threshold. Keyed by the break's own start
  // time: a re-render, a poll, or a remount must not re-trigger them.
  const firedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!seesBreaks || !nextBreak) return;
    const fire = (kind: "warn" | "now") => {
      const key = `${nextBreak.at}:${kind}`;
      if (firedRef.current.has(key)) return;
      firedRef.current.add(key);
      playBreakChime(kind);
      setFlash(kind);
      window.setTimeout(() => setFlash(null), kind === "now" ? 6000 : 4000);
    };
    if (breakStarted) fire("now");
    else if (breakWarning) fire("warn");
  }, [seesBreaks, nextBreak, breakStarted, breakWarning]);

  const showBreak = seesBreaks && !!nextBreak;
  if (!hasDepart && !showBreak) return null;

  return (
    <>
      <style>{`
        @keyframes bvChipBlink {
          0%, 100% { opacity: 1; box-shadow: 0 0 18px rgba(124,255,0,.55); }
          50%      { opacity: .55; box-shadow: 0 0 6px rgba(124,255,0,.25); }
        }
        .bv-chip-blink { animation: bvChipBlink 3s ease-in-out infinite; }
        @keyframes bvBreakPulse {
          0%, 100% { transform: scale(1);    box-shadow: 0 0 22px rgba(124,255,0,.65); }
          50%      { transform: scale(1.04); box-shadow: 0 0 4px  rgba(124,255,0,.2); }
        }
        .bv-break-pulse { animation: bvBreakPulse 1s ease-in-out infinite; }
        @keyframes bvScreenFlash {
          0%, 100% { opacity: 0; }
          50%      { opacity: .5; }
        }
        .bv-screen-flash {
          position: fixed; inset: 0; z-index: 9999; pointer-events: none;
          background: ${LIME};
          animation: bvScreenFlash .5s ease-in-out 6;
        }
      `}</style>
      {flash && <div className="bv-screen-flash" aria-hidden="true" />}
      {/* (CC-02 item 10) BREAK IN PROGRESS. Full-green screen, huge black number
          counting down to the break's TERMINATION. Rendered above everything so
          it reads across the room — this is the office kiosk, not a phone.
          Deliberately takes over from the departure chip: once departure has
          passed there is nothing useful in counting elapsed time, and a break
          that is actually running is the thing anyone looking at this needs. */}
      {breakInProgress && nextBreak && (
        <div
          role="timer"
          aria-live="off"
          aria-label={`${breakTitle(nextBreak.label)} ends in ${fmtMMSS(breakRemainMs)}`}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9998,
            background: LIME,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: MONO,
            color: "#000",
          }}
        >
          <div style={{ fontSize: "clamp(18px, 4vw, 34px)", letterSpacing: 4, fontWeight: 700 }}>
            {breakTitle(nextBreak.label)}
          </div>
          <div
            style={{
              fontSize: "clamp(96px, 30vw, 460px)",
              fontWeight: 900,
              lineHeight: 1,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {fmtMMSS(breakRemainMs)}
          </div>
          <div style={{ fontSize: "clamp(14px, 2.5vw, 24px)", letterSpacing: 3, opacity: 0.75 }}>
            UNTIL {fmtHM(breakEndsAt)}
          </div>
        </div>
      )}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
          justifyContent: "center",
          margin: "0 0 14px",
        }}
      >
        {hasDepart && (
          <div
            className={departPassed ? "bv-chip-blink" : undefined}
            style={{
              ...CHIP_BASE,
              fontSize: 16,
              padding: "10px 18px",
              background: departPassed ? LIME : "#0a0a0a",
              color: departPassed ? "#0a0a0a" : LIME,
            }}
          >
            {departPassed
              ? "DEPART NOW"
              : `DEPARTURE ${fmtHM(departAt)} · IN ${fmtMMSS(departDiff)}`}
          </div>
        )}
        {showBreak && nextBreak && (
          <div
            className={breakStarted || breakWarning ? "bv-break-pulse" : undefined}
            style={{
              ...CHIP_BASE,
              fontSize: breakStarted || breakWarning ? 16 : 13,
              padding: breakStarted || breakWarning ? "10px 18px" : "6px 12px",
              background: breakStarted ? LIME : "#0a0a0a",
              color: breakStarted ? "#0a0a0a" : LIME,
            }}
            role={breakStarted || breakWarning ? "alert" : undefined}
          >
            {breakStarted
              ? `${breakTitle(nextBreak.label)} · ${fmtMMSS(breakRemainMs)} LEFT`
              : `${breakTitle(nextBreak.label)} IN ${fmtHMS(breakDiff)}`}
          </div>
        )}
      </div>
    </>
  );
}
