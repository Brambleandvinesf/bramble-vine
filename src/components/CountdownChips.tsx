import { useEffect, useState } from "react";
import { useDayState, useServerOffsetMs, type BreakItem } from "../lib/day-state";
import { useViewAs } from "../lib/view-as";

const LIME = "#7cff00";
const MONO = "'Courier New', Courier, monospace";
const TZ = "America/Los_Angeles";

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

function fmtHMM(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

const CHIP_BASE: React.CSSProperties = {
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

export function CountdownChips() {
  const state = useDayState();
  const offset = useServerOffsetMs();
  const { effectiveRole } = useViewAs();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => (n + 1) & 0xffff), 1000);
    return () => window.clearInterval(id);
  }, []);
  void tick;

  const now = Date.now() + offset;

  // Departure
  const departAtRaw = state?.departAt ?? null;
  const departAt = departAtRaw ? Date.parse(departAtRaw) : NaN;
  const hasDepart = departAtRaw && !isNaN(departAt);
  const departDiff = hasDepart ? departAt - now : 0;
  const departPassed = hasDepart && departDiff <= 0;

  // Next break (office only)
  const isOffice = effectiveRole === "office";
  const breaks: BreakItem[] = Array.isArray(state?.breaks) ? state!.breaks! : [];
  const parsedBreaks = breaks
    .map((b) => ({ ...b, at: parseBreakTime(b.time) }))
    .filter((b): b is BreakItem & { at: number } => b.at !== null);
  const nextBreak = parsedBreaks.find((b) => b.at - now > 0);

  if (!hasDepart && !(isOffice && nextBreak)) return null;

  return (
    <>
      <style>{`
        @keyframes bvChipBlink {
          0%, 100% { opacity: 1; box-shadow: 0 0 18px rgba(124,255,0,.55); }
          50%      { opacity: .55; box-shadow: 0 0 6px rgba(124,255,0,.25); }
        }
        .bv-chip-blink { animation: bvChipBlink 3s ease-in-out infinite; }
      `}</style>
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
        {isOffice && nextBreak && (
          <div
            style={{
              ...CHIP_BASE,
              fontSize: 13,
              padding: "6px 12px",
            }}
          >
            {nextBreak.label.toUpperCase()} {fmtHM(nextBreak.at)} · IN {fmtHMM(nextBreak.at - now)}
          </div>
        )}
      </div>
    </>
  );
}
