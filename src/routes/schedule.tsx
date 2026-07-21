import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../lib/auth";
import { useViewAs } from "../lib/view-as";
import { useReviewableToday } from "../lib/reviewable-today";
import { sessionCache } from "../lib/session-cache";
import { RefreshDot } from "../components/RefreshDot";
import { MessagesFab } from "../components/MessagesFab";
import { appendTeamParam } from "../lib/team";


export const Route = createFileRoute("/schedule")({
  head: () => ({
    meta: [
      { title: "Bramble & Vine — Schedule" },
      { name: "description", content: "Daily and weekly crew schedule." },
    ],
  }),
  component: SchedulePage,
});

const SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbwZlJn9jKzzYfcFglDmVGV3l-FTYib0D3mNdILivsB1477aMym68NViDCwia26_JH4siQ/exec";

const LIME = "#7cff00";
const DIM_GREEN = "#4a7a1e";
const BG = "#0a0a0a";
const PANEL = "#121212";
const BORDER = "#2a2a2a";
const MONO = "'Courier New', Courier, monospace";
const POLL_MS = 60_000;
const TZ = "America/Los_Angeles";

type EventItem = {
  id: string;
  title: string;
  start: string;
  end: string;
  location: string;
  color: string;
  description: string;
};

type GetScheduleResponse = {
  events?: EventItem[];
  serverTime?: string;
};

/* LA-local YYYY-MM-DD helpers using Intl parts (avoids UTC drift). */
function laParts(d: Date) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });
  const parts = fmt.formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return {
    y: Number(get("year")),
    m: Number(get("month")),
    d: Number(get("day")),
    weekday: get("weekday"),
  };
}
function laDateKey(d: Date) {
  const { y, m, d: dd } = laParts(d);
  return `${y}-${String(m).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}
/** Anchor to LA-local noon of the given LA calendar day. Stable for +/- day math. */
function laNoon(dateKey: string): Date {
  // Interpret dateKey as LA-local; noon avoids DST edge cases when adding days.
  // We approximate by constructing a UTC date and shifting by LA offset for that day.
  const [y, m, d] = dateKey.split("-").map(Number);
  // Guess: 19:00 UTC ~ noon LA (PDT=UTC-7, PST=UTC-8). Precise anchoring not needed
  // because we only ever re-derive the key via laDateKey().
  return new Date(Date.UTC(y, m - 1, d, 19, 0, 0));
}
function addDaysKey(dateKey: string, n: number): string {
  const base = laNoon(dateKey);
  base.setUTCDate(base.getUTCDate() + n);
  return laDateKey(base);
}
/** Monday of the LA-local week containing dateKey. */
function mondayOfKey(dateKey: string): string {
  const base = laNoon(dateKey);
  const wd = base.getUTCDay(); // 0=Sun..6=Sat, close enough for LA noon anchor
  const diff = wd === 0 ? -6 : 1 - wd;
  base.setUTCDate(base.getUTCDate() + diff);
  return laDateKey(base);
}

function fmtLongDate(dateKey: string): string {
  const d = laNoon(dateKey);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    weekday: "long",
    month: "long",
    day: "numeric",
  })
    .format(d)
    .toUpperCase();
}
function fmtShortDay(dateKey: string): string {
  const d = laNoon(dateKey);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    weekday: "short",
    month: "numeric",
    day: "numeric",
  }).format(d);
}
function fmtTime(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}
function eventDateKey(iso: string): string {
  return laDateKey(new Date(iso));
}
function mapsHref(loc: string): string {
  return `https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${encodeURIComponent(loc)}`;
}

/** Sanitize: allow ONLY <a href="..."> tags. Preserve structure from legacy HTML
 *  (<br>, <p>, <li>, <ul>, <ol>, <h1..h6>, <div>) as newlines / bullets.
 *  Plain-text descriptions with \n pass through unchanged. */
function sanitizeDescription(html: string): Array<{ kind: "text"; value: string } | { kind: "link"; href: string; text: string }> {
  if (!html) return [];
  const decode = (s: string) =>
    s
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  const structuralize = (s: string) =>
    s
      .replace(/<br\s*\/?\s*>/gi, "\n")
      .replace(/<li\b[^>]*>/gi, "\n• ")
      .replace(/<\/(p|div|li|ul|ol|h[1-6])\s*>/gi, "\n");
  const stripTags = (s: string) => s.replace(/<[^>]+>/g, "");
  const collapse = (s: string) => s.replace(/\n{3,}/g, "\n\n");
  const finalize = (s: string) => collapse(decode(stripTags(structuralize(s))));

  const out: Array<{ kind: "text"; value: string } | { kind: "link"; href: string; text: string }> = [];
  const anchorRe = /<a\s+[^>]*href\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a>/gi;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = anchorRe.exec(html)) !== null) {
    if (m.index > last) {
      const chunk = finalize(html.slice(last, m.index));
      if (chunk) out.push({ kind: "text", value: chunk });
    }
    const href = (m[1] ?? m[2] ?? "").trim();
    const text = finalize(m[3] ?? "") || href;
    const safe = /^(https?:|mailto:|tel:)/i.test(href);
    if (safe) out.push({ kind: "link", href, text });
    else out.push({ kind: "text", value: text });
    last = m.index + m[0].length;
  }
  if (last < html.length) {
    const chunk = finalize(html.slice(last));
    if (chunk) out.push({ kind: "text", value: chunk });
  }
  return out;
}


function SchedulePage() {
  const { role } = useAuth();
  const { effectiveRole } = useViewAs();
  const navigate = useNavigate();

  const denied = role === "office" || effectiveRole === "office";
  useEffect(() => {
    if (denied) void navigate({ to: "/" });
  }, [denied, navigate]);

  const isFieldCrew = effectiveRole === "assistant" || effectiveRole === "lead";
  const isLeadOrMgmt = effectiveRole === "lead" || effectiveRole === "management";
  const reviewable = useReviewableToday();
  const [confirmed, setConfirmed] = useState<boolean | null>(null);
  const confirmSeenRef = useRef(false);
  const [baseLoadDismissed, setBaseLoadDismissed] = useState(false);
  const [baseLoadSubmitting, setBaseLoadSubmitting] = useState(false);
  const [baseLoadFlash, setBaseLoadFlash] = useState<string | null>(null);
  useEffect(() => {
    if (!isFieldCrew && effectiveRole !== "management") return;
    let cancelled = false;
    const tick = async () => {
      try {
        const r = await fetch(`${SCRIPT_URL}?action=getConfirm`);
        if (!r.ok) return;
        const j = (await r.json()) as { state?: { confirmed?: boolean } };
        if (cancelled) return;
        setConfirmed(!!j.state?.confirmed);
      } catch { /* noop */ }
    };
    tick();
    const id = window.setInterval(tick, 10_000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [isFieldCrew, effectiveRole]);
  useEffect(() => {
    if (!isFieldCrew) return;
    if (confirmed !== true) return;
    if (confirmSeenRef.current) return;
    confirmSeenRef.current = true;
    void navigate({ to: "/loading" });
  }, [confirmed, isFieldCrew, navigate]);

  const submitBaseLoadYes = useCallback(async () => {
    setBaseLoadSubmitting(true);
    setBaseLoadFlash(null);
    try {
      const res = await fetch(SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({
          action: "confirmDay",
          statuses: {},
          updates: [],
          newProjects: [],
          deletes: [],
          sendText: true,
        }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string; state?: { confirmed?: boolean } };
      if (!j.ok) throw new Error(j.error || "not ok");
      if (j.state?.confirmed) setConfirmed(true);
      setBaseLoadFlash("BASE LOAD CONFIRMED — CREW NOTIFIED");
    } catch (e) {
      setBaseLoadFlash(`FAILED: ${e instanceof Error ? e.message : "unknown"}`);
    } finally {
      setBaseLoadSubmitting(false);
    }
  }, []);

  const submitBaseLoadNo = useCallback(async () => {
    setBaseLoadSubmitting(true);
    setBaseLoadFlash(null);
    try {
      await fetch(SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({
          action: "replyQuo",
          participants: ["+14152343696"],
          text: "Different loading today — standby.",
        }),
      });
    } catch { /* best-effort */ }
    setBaseLoadSubmitting(false);
    setBaseLoadDismissed(true);
    void navigate({ to: "/confirm" });
  }, [navigate]);


  const [view, setView] = useState<"day" | "week">("day");
  const [anchor, setAnchor] = useState<string>(() => laDateKey(new Date()));
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);
  const [offline, setOffline] = useState(false);
  const reqIdRef = useRef(0);


  const { start, end } = useMemo(() => {
    if (view === "day") return { start: anchor, end: addDaysKey(anchor, 1) };
    const mon = mondayOfKey(anchor);
    return { start: mon, end: addDaysKey(mon, 7) };
  }, [view, anchor]);

  const cacheKey = `schedule:getSchedule:${start}:${end}`;

  // Seed cached range instantly when start/end changes.
  useEffect(() => {
    const cached = sessionCache.get<EventItem[]>(cacheKey);
    if (cached) {
      setEvents(cached);
      setLoadErr(null);
    } else {
      setEvents([]);
    }
  }, [cacheKey]);

  const fetchRange = useCallback(async () => {
    const myId = ++reqIdRef.current;
    const key = `schedule:getSchedule:${start}:${end}`;
    setRefreshing(true);
    try {
      const url = appendTeamParam(`${SCRIPT_URL}?action=getSchedule&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as GetScheduleResponse;
      if (myId !== reqIdRef.current) return;
      const list = Array.isArray(json.events) ? json.events : [];
      list.sort((a, b) => (a.start ?? "").localeCompare(b.start ?? ""));
      sessionCache.set(key, list);
      setEvents(list);
      setLoadErr(null);
      setOffline(false);
    } catch (e) {
      if (myId !== reqIdRef.current) return;
      if (sessionCache.has(key)) setOffline(true);
      else setLoadErr(e instanceof Error ? e.message : "Failed to load");
    } finally {
      if (myId === reqIdRef.current) setRefreshing(false);
    }
  }, [start, end]);

  useEffect(() => {
    if (denied) return;
    void fetchRange();
    const id = window.setInterval(() => void fetchRange(), POLL_MS);
    const onFocus = () => void fetchRange();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [denied, fetchRange]);

  const goPrev = () => setAnchor((a) => addDaysKey(a, view === "day" ? -1 : -7));
  const goNext = () => setAnchor((a) => addDaysKey(a, view === "day" ? 1 : 7));
  const goToday = () => setAnchor(laDateKey(new Date()));

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const byDay = useMemo(() => {
    const m = new Map<string, EventItem[]>();
    for (const ev of events) {
      const k = eventDateKey(ev.start);
      const arr = m.get(k) ?? [];
      arr.push(ev);
      m.set(k, arr);
    }
    return m;
  }, [events]);

  if (denied) return null;

  const weekKeys = view === "week" ? Array.from({ length: 7 }, (_, i) => addDaysKey(start, i)) : [];

  return (
    <div
      style={{
        minHeight: "100vh",
        background: BG,
        color: "#e8e8e8",
        fontFamily: MONO,
        padding: "16px 12px 96px",
      }}
    >
      {/* Header */}
      {!(isLeadOrMgmt && confirmed === false) && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 12,
            flexWrap: "wrap",
          }}
        >
          <NavBtn onClick={goPrev} label="◀" />
          <NavBtn onClick={goToday} label="TODAY" />
          <NavBtn onClick={goNext} label="▶" />
          <div style={{ flex: 1 }} />
          <ViewToggle view={view} setView={setView} />
        </div>
      )}

      <h1
        style={{
          color: LIME,
          fontSize: 22,
          letterSpacing: 2,
          margin: "4px 2px 16px",
          fontWeight: "bold",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        {view === "day"
          ? fmtLongDate(anchor)
          : `WEEK OF ${fmtLongDate(mondayOfKey(anchor))}`}
        <RefreshDot refreshing={refreshing} offline={offline} />
        {offline && (
          <span style={{ color: "#8f8f8f", fontSize: 10, letterSpacing: 1 }}>
            OFFLINE — LAST DATA
          </span>
        )}
      </h1>

      {isLeadOrMgmt && confirmed === false && !baseLoadDismissed && (
        <div
          style={{
            background: PANEL,
            border: `2px dashed ${LIME}`,
            borderRadius: 12,
            padding: "22px 18px",
            marginBottom: 16,
            textAlign: "center",
            boxShadow: "0 0 22px rgba(124,255,0,.12)",
          }}
        >
          <div
            style={{
              color: LIME,
              fontSize: 16,
              fontWeight: "bold",
              letterSpacing: 1.5,
              textTransform: "uppercase",
              marginBottom: 14,
            }}
          >
            Do we need the usual base load today?
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
            <button
              onClick={() => void submitBaseLoadYes()}
              disabled={baseLoadSubmitting}
              style={{
                minHeight: 60,
                padding: "0 32px",
                background: LIME,
                color: "#0a0a0a",
                border: `1px solid ${LIME}`,
                borderRadius: 8,
                fontFamily: MONO,
                fontSize: 18,
                letterSpacing: 3,
                fontWeight: "bold",
                cursor: baseLoadSubmitting ? "wait" : "pointer",
                opacity: baseLoadSubmitting ? 0.6 : 1,
              }}
            >
              {baseLoadSubmitting ? "…" : "YES"}
            </button>
            <button
              onClick={() => void submitBaseLoadNo()}
              disabled={baseLoadSubmitting}
              style={{
                minHeight: 60,
                padding: "0 32px",
                background: "transparent",
                color: LIME,
                border: `1px solid ${LIME}`,
                borderRadius: 8,
                fontFamily: MONO,
                fontSize: 18,
                letterSpacing: 3,
                fontWeight: "bold",
                cursor: "pointer",
              }}
            >
              NO
            </button>
          </div>
          {baseLoadFlash && (
            <div style={{ marginTop: 12, color: LIME, fontSize: 11, letterSpacing: 1 }}>
              {baseLoadFlash}
            </div>
          )}
          {reviewable === true && (
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${BORDER}` }}>
              <Link
                to="/confirm"
                style={{
                  display: "inline-block",
                  textDecoration: "none",
                  minHeight: 48,
                  padding: "12px 20px",
                  color: LIME,
                  border: `1px solid ${LIME}`,
                  borderRadius: 6,
                  fontFamily: MONO,
                  fontSize: 12,
                  letterSpacing: 2,
                  fontWeight: "bold",
                }}
              >
                REVIEW TODAY'S PROJECTS →
              </Link>
            </div>
          )}
        </div>
      )}

      {effectiveRole === "assistant" && confirmed === false && (
        <div
          style={{
            background: PANEL,
            border: `2px dashed ${LIME}`,
            borderRadius: 12,
            padding: "22px 18px",
            marginBottom: 16,
            textAlign: "center",
            color: LIME,
            fontSize: 15,
            fontWeight: "bold",
            letterSpacing: 2,
            textTransform: "uppercase",
            boxShadow: "0 0 22px rgba(124,255,0,.12)",
          }}
        >
          Awaiting loading instructions…
          <div style={{ color: DIM_GREEN, fontSize: 11, marginTop: 6, letterSpacing: 1, fontWeight: "normal" }}>
            You'll be sent to the loading list the moment the lead confirms.
          </div>
        </div>
      )}


      {loadErr ? (
        <div style={{ color: "#ff6b6b", marginBottom: 12, fontSize: 12 }}>
          Failed to load schedule: {loadErr}
        </div>
      ) : null}

      {view === "day" ? (
        <DayList
          events={byDay.get(anchor) ?? []}
          expanded={expanded}
          onToggle={toggle}
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {weekKeys.map((k) => (
            <div key={k} style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 6 }}>
              <div
                style={{
                  padding: "10px 12px",
                  color: LIME,
                  fontSize: 12,
                  letterSpacing: 2,
                  fontWeight: "bold",
                  borderBottom: `1px solid ${BORDER}`,
                  textTransform: "uppercase",
                }}
              >
                {fmtShortDay(k)}
              </div>
              <DayList
                events={byDay.get(k) ?? []}
                expanded={expanded}
                onToggle={toggle}
                compact
              />
            </div>
          ))}
        </div>
      )}
      {isFieldCrew && <MessagesFab />}
    </div>
  );
}


function NavBtn({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        minHeight: 56,
        minWidth: 56,
        padding: "0 14px",
        background: "transparent",
        color: LIME,
        border: `1px solid ${LIME}`,
        borderRadius: 4,
        fontFamily: MONO,
        fontSize: 14,
        letterSpacing: 2,
        fontWeight: "bold",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

function ViewToggle({ view, setView }: { view: "day" | "week"; setView: (v: "day" | "week") => void }) {
  const btn = (v: "day" | "week", label: string) => (
    <button
      key={v}
      onClick={() => setView(v)}
      style={{
        minHeight: 56,
        padding: "0 16px",
        background: view === v ? LIME : "transparent",
        color: view === v ? "#000" : LIME,
        border: `1px solid ${LIME}`,
        fontFamily: MONO,
        fontSize: 12,
        letterSpacing: 2,
        fontWeight: "bold",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
  return (
    <div style={{ display: "inline-flex" }}>
      {btn("day", "DAY")}
      {btn("week", "WEEK")}
    </div>
  );
}

function DayList({
  events,
  expanded,
  onToggle,
  compact,
}: {
  events: EventItem[];
  expanded: Set<string>;
  onToggle: (id: string) => void;
  compact?: boolean;
}) {
  if (events.length === 0) {
    return (
      <div
        style={{
          textAlign: "center",
          color: DIM_GREEN,
          padding: "24px 12px",
          fontSize: 12,
          letterSpacing: 1,
        }}
      >
        No visits scheduled.
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {events.map((ev) => (
        <EventRow
          key={ev.id}
          ev={ev}
          isOpen={expanded.has(ev.id)}
          onToggle={() => onToggle(ev.id)}
          compact={compact}
        />
      ))}
    </div>
  );
}

function EventRow({
  ev,
  isOpen,
  onToggle,
  compact,
}: {
  ev: EventItem;
  isOpen: boolean;
  onToggle: () => void;
  compact?: boolean;
}) {
  const desc = useMemo(() => sanitizeDescription(ev.description ?? ""), [ev.description]);
  return (
    <div
      style={{
        borderTop: compact ? `1px solid ${BORDER}` : "none",
        borderBottom: compact ? "none" : `1px solid ${BORDER}`,
        padding: compact ? "8px 12px" : "12px 4px",
      }}
    >
      <button
        onClick={onToggle}
        style={{
          width: "100%",
          textAlign: "left",
          background: "transparent",
          border: "none",
          color: "#e8e8e8",
          fontFamily: MONO,
          cursor: "pointer",
          padding: 0,
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
        }}
      >
        <span
          style={{
            color: DIM_GREEN,
            fontSize: 12,
            minWidth: 64,
            paddingTop: 2,
            letterSpacing: 1,
          }}
        >
          {fmtTime(ev.start)}
        </span>
        <span
          style={{
            color: LIME,
            fontSize: 14,
            fontWeight: "bold",
            paddingTop: 2,
            transition: "transform 0.15s",
            display: "inline-block",
            transform: isOpen ? "rotate(90deg)" : "none",
          }}
        >
          ▶
        </span>
        <span style={{ flex: 1 }}>
          <span
            style={{
              color: LIME,
              fontSize: compact ? 13 : 15,
              fontWeight: "bold",
              letterSpacing: 1,
              display: "block",
            }}
          >
            {ev.title || "(untitled)"}
          </span>
          {ev.location ? (
            <a
              href={mapsHref(ev.location)}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                window.open(mapsHref(ev.location), "_blank", "noopener,noreferrer");
              }}
              style={{
                display: "inline-block",
                marginTop: 4,
                color: "#e8e8e8",
                textDecoration: "underline",
                fontSize: 12,
              }}
            >
              {ev.location}
            </a>
          ) : null}

        </span>
      </button>
      {isOpen && desc.length > 0 ? (
        <div
          style={{
            marginTop: 10,
            marginLeft: 74,
            padding: "10px 12px",
            background: BG,
            border: `1px solid ${BORDER}`,
            borderRadius: 4,
            color: "#cfcfcf",
            fontSize: 12,
            whiteSpace: "pre-wrap",
            fontFamily: MONO,
            lineHeight: 1.5,
          }}
        >
          {desc.map((seg, i) =>
            seg.kind === "link" ? (
              <a
                key={i}
                href={seg.href}
                onClick={(e) => {
                  e.preventDefault();
                  window.open(seg.href, "_blank", "noopener,noreferrer");
                }}
                style={{ color: LIME, textDecoration: "underline", cursor: "pointer" }}
              >
                {seg.text}
              </a>

            ) : (
              <span key={i}>{seg.value}</span>
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}
