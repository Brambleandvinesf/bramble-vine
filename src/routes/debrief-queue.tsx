import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../lib/auth";
import { useViewAs } from "../lib/view-as";
import { canSee } from "../lib/permissions";
import { SCRIPT_URL } from "./confirm";
import { RefreshDot } from "../components/RefreshDot";
import { sessionCache } from "../lib/session-cache";
import { StateDebrief } from "./field";
import { fetchPayrollDay, personSeconds } from "../lib/billing-hours";
import { fetchClientNames } from "../lib/add-project";

/* ============================================================
 * DEBRIEF QUEUE — gated on the route_queues capability (lead, office,
 * management; NOT assistant). See lib/permissions.ts. THE FAILSAFE.
 *
 * Reads:  GET  <SCRIPT_URL>?action=debriefQueue
 * Writes: POST { action: "saveDebrief", client, date, eventId, ...payload }
 *
 * WHY THIS EXISTS. The live flow reaches a debrief through exactly one gate,
 * `route.state === "debrief"`, set by the day-state machine. When the early-day
 * gates misbehave that screen is simply unreachable, and debriefs routinely did
 * not happen at all — while billing hours, items used and projects completed are
 * the input to invoicing. So this route reaches the SAME screens from evidence
 * instead of from route state: a calendar event whose end time has passed, with
 * no Debrief Log entry for its Event ID.
 *
 * IT IS A SECOND ENTRY POINT, NOT A PARALLEL IMPLEMENTATION. StateDebrief and
 * its Hours/Items/Projects/Messages steps are imported from field.tsx and
 * rendered as-is. The live flow is untouched.
 *
 * WHAT IS SUBSTITUTED. Everything StateDebrief needs comes from the live route
 * object normally. Here:
 *   route.roster        -> people from payrollDay for that client+date, i.e. who
 *                          the TIMESHEETS say was actually there. Route state is
 *                          the unreliable thing; timesheets are the evidence.
 *   events[stopIndex]   -> the queue entry's own event
 *   clientMatch         -> the queue entry's client
 *   (new) date          -> the visit's date, so a next-morning debrief reads that
 *                          day's hours and stamps that day's rows
 *
 * NOT PASSED, DELIBERATELY: suppressInvoice. A real debrief invoices exactly as
 * the live flow does — that is the entire point of collecting this data, and a
 * submission that quietly skipped invoicing would be worse than one that failed
 * loudly. That flag exists only for sandboxed verification and must never be
 * reachable from this screen.
 * ============================================================ */

export const Route = createFileRoute("/debrief-queue")({
  head: () => ({
    meta: [
      { title: "Bramble & Vine — Debrief Queue" },
      { name: "description", content: "Visits that have happened and still need a debrief." },
    ],
  }),
  component: DebriefQueuePage,
});

const BG = "#0a0a0a";
const PANEL = "#121212";
const LIME = "#7cff00";
const LIME_DIM = "#4a7a1e";
const TEXT = "#e8e8e8";
const FINE = "#b8b8b8";
const LINE = "#2a2a2a";
const CK = "debriefQueue:queue";

type QueueEntry = {
  eventId: string;
  title: string;
  client: string;
  start: string;
  end: string;
  date: string;
  location?: string;
  /* CC-10 Item 3: hours already on Billing Hours for this client+date. A HINT,
     never a filter — visits from before the Debrief Log tab existed (8/4) carry
     no log row even when they were properly debriefed, and this is the only
     evidence of that era that survives. */
  billedHours?: number;
  /* Client-side only: minted by ADD DEBRIEF, never returned by the backend. */
  manual?: boolean;
};

type RosterLike = {
  id: string;
  name: string;
  in?: string | null;
  out?: string | null;
  role?: string;
  client?: string;
  tsId?: string;
};

type Fieldish = {
  projects?: unknown[];
  tools?: unknown[];
  employees?: { id: string; name: string }[];
};

function fmtWhen(e: QueueEntry): string {
  const t = (iso: string) =>
    new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const d = new Date(e.start).toLocaleDateString([], { month: "short", day: "numeric" });
  /* A manual entry has no calendar event, so it has no real window — printing
     an invented one would look like evidence. */
  return e.manual ? `${d} · added by hand` : `${d} · ${t(e.start)}–${t(e.end)}`;
}

/** Today in the crew's timezone, as the yyyy-MM-dd the backend keys rows by. */
function todayLA(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
}

function DebriefQueuePage() {
  const { role } = useAuth();
  const { effectiveRole } = useViewAs();
  const who = effectiveRole ?? role;
  /* XX-05: one capability for both queue screens — see permissions.ts. */
  const allowed = canSee(who, "route_queues");

  const [upcoming, setUpcoming] = useState<QueueEntry[]>([]);
  const [queue, setQueue] = useState<QueueEntry[] | null>(
    () => sessionCache.get<QueueEntry[]>(CK) ?? null,
  );
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState<QueueEntry | null>(null);
  const [roster, setRoster] = useState<RosterLike[] | null>(null);
  const [fieldish, setFieldish] = useState<Fieldish>({});
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  /* CC-10 Item 3: the window the backend actually read, echoed back. Before
     v7.4.85 the queue only ever saw today, and "nothing waiting" and "we only
     looked at today" were the same answer on screen. */
  const [window, setWindow] = useState<{ since?: string; through?: string } | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  /* Locally hidden rows. Session-scoped on purpose: nothing on the sheet says
     "this visit needs no debrief", so a hide must never outlive the session and
     never hide the row from anyone else. */
  const [dismissed, setDismissed] = useState<string[]>(
    () => sessionCache.get<string[]>(DK) ?? [],
  );
  const [confirmDismiss, setConfirmDismiss] = useState<string | null>(null);

  const dismiss = useCallback((id: string) => {
    setConfirmDismiss(null);
    setDismissed((prev) => {
      const next = prev.includes(id) ? prev : [...prev, id];
      sessionCache.set(DK, next);
      return next;
    });
  }, []);


  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch(`${SCRIPT_URL}?action=debriefQueue`);
      const j = (await r.json().catch(() => ({}))) as {
        queue?: QueueEntry[];
        upcoming?: QueueEntry[];
        since?: string;
        through?: string;
        error?: string;
      };
      if (j.error) throw new Error(j.error);
      const q = Array.isArray(j.queue) ? j.queue : [];
      setQueue(q);
      setUpcoming(Array.isArray(j.upcoming) ? j.upcoming : []);
      setWindow(j.since ? { since: j.since, through: j.through } : null);
      sessionCache.set(CK, q);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "could not read the queue");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (allowed) void load();
  }, [allowed, load]);

  /* CC-13 Item 18 — PROJECTS MUST NOT COME FROM getField HERE.
     getField TRIMS projects and tools to TODAY'S clients:
         projs = CP_TAB.filter(p => todays.indexOf(p['Client Name']) >= 0)
     That is right for the live flow, which only ever stands on today's route,
     and wrong for this screen, whose entire purpose is reaching visits that
     ALREADY HAPPENED. Any queue entry for a client not on today's route arrived
     at StateDebrief with an empty projects list, so "Projects Completed" —
     including the Special projects — rendered blank. Measured: 14 of the 15 rows
     currently in the queue are past dates, so this was nearly the whole screen.

     getProjects returns EVERY client's rows from the same two tabs, so the
     Projects Completed step behaves as it does in visit mode.

     WHAT IS NOT LOST: getField also computes `crossedActive` per response, which
     getProjects does not carry. Checked before switching — crossedActive is read
     in exactly ONE place in the frontend (StateVisit's struck-through cards) and
     StateDebrief never touches it. So nothing here needs it, and deriving it
     client-side would have meant a second copy of the backend's crossActive_
     rule — the twin-rule trap that produced the 30-vs-1 receipts badge.

     employees STILL comes from getField: getProjects does not return it, and the
     Hours step's person picker needs it. Both reads are fired together and the
     screen degrades independently — a failed getProjects loses the project
     pickers, a failed getField loses the employee list, and neither blocks the
     debrief itself. */
  useEffect(() => {
    if (!allowed) return;
    void (async () => {
      const [projRes, fieldRes] = await Promise.allSettled([
        fetch(`${SCRIPT_URL}?action=getProjects`).then((r) => r.json()),
        fetch(`${SCRIPT_URL}?action=getField`).then((r) => r.json()),
      ]);
      const next: Fieldish = {};
      if (projRes.status === "fulfilled") {
        const p = (projRes.value ?? {}) as Fieldish;
        if (Array.isArray(p.projects)) next.projects = p.projects;
        if (Array.isArray(p.tools)) next.tools = p.tools;
      }
      if (fieldRes.status === "fulfilled") {
        const f = (fieldRes.value ?? {}) as Fieldish;
        if (Array.isArray(f.employees)) next.employees = f.employees;
        /* Fallback only: if getProjects failed, today's trimmed set still beats
           nothing at all for a queue entry that IS on today's route. */
        if (!next.projects && Array.isArray(f.projects)) next.projects = f.projects;
        if (!next.tools && Array.isArray(f.tools)) next.tools = f.tools;
      }
      setFieldish(next);
    })();
  }, [allowed]);

  /* THE SUBSTITUTION. route.roster does not exist for a past visit, so the
     person list comes from the timesheets for that client+date. StateDebrief
     seeds its billing figures from roster `in`/`out`, and its Hours step then
     re-seeds from payrollDay anyway, so handing it real QBT spans keeps both
     paths consistent. */
  const openEntry = useCallback(async (e: QueueEntry) => {
    setOpen(e);
    setRoster(null);
    setNote(null);
    try {
      const pd = await fetchPayrollDay(e.client, e.date);
      const people = pd.people ?? [];
      setRoster(
        people.map((p) => {
          const secs = personSeconds(p);
          const first = p.entries?.[0];
          const startIso = first?.start ?? e.start;
          return {
            id: p.userId,
            name: p.name,
            in: startIso,
            out: new Date(new Date(startIso).getTime() + secs * 1000).toISOString(),
            role: "assistant",
            client: e.client,
          };
        }),
      );
      if (!people.length) {
        setNote(
          "No QuickBooks Time entries for this visit — add people by hand in the Hours step.",
        );
      }
    } catch {
      setRoster([]);
      setNote("Could not read QuickBooks Time — add people by hand in the Hours step.");
    }
  }, []);

  const submit = useCallback(
    async (payload: Record<string, unknown>) => {
      if (!open) return;
      setBusy(true);
      setErr(null);
      try {
        const r = await fetch(SCRIPT_URL, {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: JSON.stringify({
            action: "saveDebrief",
            client: open.client,
            date: open.date,
            eventId: open.eventId,
            by: who ?? "",
            /* suppressInvoice is intentionally absent — see the header. */
            ...payload,
          }),
        });
        const j = (await r.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          report?: Record<string, unknown>;
        };
        if (j.ok === false) throw new Error(j.error || "debrief failed");
        const failed = Object.entries(j.report ?? {}).filter(([, v]) =>
          String(v).toLowerCase().includes("failed"),
        );
        setNote(
          failed.length
            ? `Saved with issues: ${failed.map(([k]) => k).join(", ")}`
            : "Debrief saved.",
        );
        setOpen(null);
        setRoster(null);
        await load();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "debrief failed");
      } finally {
        setBusy(false);
      }
    },
    [open, who, load],
  );

  const pending = useMemo(
    () => (queue ?? []).filter((e) => !dismissed.includes(e.eventId)),
    [queue, dismissed],
  );


  if (!allowed) {
    return (
      <div style={{ background: BG, color: TEXT, minHeight: "100vh", padding: 16, fontFamily: "monospace" }}>
        <div style={{ color: FINE, fontSize: 12 }}>Debrief Queue is not available for your role.</div>
      </div>
    );
  }

  /* An entry is open: hand the real debrief steps the substituted context. */
  if (open) {
    return (
      <div style={{ background: BG, color: TEXT, minHeight: "100vh", padding: 12, fontFamily: "monospace" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <button
            type="button"
            onClick={() => { setOpen(null); setRoster(null); }}
            style={{
              background: "transparent", border: `1px solid ${LINE}`, color: FINE,
              fontFamily: "inherit", fontSize: 11, padding: "6px 10px", borderRadius: 4,
              cursor: "pointer",
            }}
          >
            ← QUEUE
          </button>
          <div style={{ fontSize: 12, letterSpacing: 1, color: LIME }}>
            {open.client.toUpperCase()}
          </div>
          <div style={{ fontSize: 11, color: FINE }}>{fmtWhen(open)}</div>
        </div>
        {/* Was orange. Red means failure here and nothing else, and this is an
            advisory ("no timesheets — add people by hand"), so it takes the
            app's ordinary fine-print treatment. */}
        {note && <div style={{ color: FINE, fontSize: 11, marginBottom: 8 }}>{note}</div>}
        {err && <div style={{ color: "#ff6b6b", fontSize: 11, marginBottom: 8 }}>{err}</div>}
        {roster === null ? (
          <div style={{ color: FINE, fontSize: 12 }}>READING QUICKBOOKS TIME…</div>
        ) : (
          <StateDebrief
            clientMatch={open.client}
            event={{ id: open.eventId, title: open.title, start: open.start, end: open.end }}
            roster={roster as never}
            projects={(fieldish.projects ?? []) as never}
            tools={(fieldish.tools ?? []) as never}
            employees={(fieldish.employees ?? []) as never}
            notes={[]}
            busy={busy}
            date={open.date}
            onFinish={submit}
          />
        )}
      </div>
    );
  }

  return (
    <div style={{ background: BG, color: TEXT, minHeight: "100vh", padding: 16, fontFamily: "monospace" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <div style={{ fontSize: 14, letterSpacing: 2, color: LIME }}>DEBRIEF QUEUE</div>
        <RefreshDot refreshing={loading} />
        <button
          type="button"
          onClick={() => void load()}
          style={{
            background: "transparent", border: `1px solid ${LINE}`, color: FINE,
            fontFamily: "inherit", fontSize: 10, padding: "4px 8px", borderRadius: 4,
            cursor: "pointer", marginLeft: "auto",
          }}
        >
          REFRESH
        </button>
      </div>
      <div style={{ color: FINE, fontSize: 11, marginBottom: 10 }}>
        Visits that have finished and have no debrief logged
        {window?.since ? `, ${window.since} through ${window.through ?? "today"}` : ""}.
      </div>

      {/* CC-10 Item 3 — THE FAILSAFE'S OWN FAILSAFE. Everything above is
          derived from calendar evidence, so a visit with no event on
          '1. Client Visits' — a call-out squeezed in, an event deleted, a
          client the calendar never knew about — is invisible to it. This is the
          way in that depends on nothing at all. */}
      <button
        type="button"
        onClick={() => setAddOpen(true)}
        style={{
          background: "transparent", border: `1px solid ${LIME_DIM}`, color: LIME,
          fontFamily: "inherit", fontSize: 11, letterSpacing: 2, fontWeight: "bold",
          padding: "8px 14px", borderRadius: 999, cursor: "pointer", marginBottom: 14,
        }}
      >
        + ADD DEBRIEF
      </button>

      {err && <div style={{ color: "#ff6b6b", fontSize: 11, marginBottom: 10 }}>{err}</div>}
      {note && <div style={{ color: LIME, fontSize: 11, marginBottom: 10 }}>{note}</div>}

      {queue === null && !err && <div style={{ color: FINE, fontSize: 12 }}>Loading…</div>}

      {queue !== null && pending.length === 0 && (
        <div style={{ ...panel, color: FINE, fontSize: 12 }}>
          Nothing waiting — every finished visit today has been debriefed.
        </div>
      )}

      <div style={{ display: "grid", gap: 10 }}>
        {pending.map((e) => (
          <div key={e.eventId} style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => void openEntry(e)}
              style={{
                ...panel,
                width: "100%",
                textAlign: "left",
                cursor: "pointer",
                fontFamily: "inherit",
                color: TEXT,
                paddingRight: 56,
              }}
            >
              <div style={{ color: LIME, fontSize: 14, fontWeight: "bold" }}>{e.client}</div>
              <div style={{ color: FINE, fontSize: 11, marginTop: 3 }}>{fmtWhen(e)}</div>
              {e.location && (
                <div style={{ color: FINE, fontSize: 10, marginTop: 2 }}>{e.location}</div>
              )}
              {/* CC-10 Item 3: the restored backlog reaches back before the
                  Debrief Log tab existed, so some of these WERE debriefed and
                  simply left no log row. Billed hours is the surviving evidence.
                  Stated, never acted on — it does not remove the row, because a
                  debrief writes four things besides billing and a zero-hour
                  visit is real. */}
              {typeof e.billedHours === "number" && e.billedHours > 0 && (
                <div style={{ color: FINE, fontSize: 10, marginTop: 4 }}>
                  {e.billedHours}h already on Billing Hours — may have been debriefed
                  before the log existed
                </div>
              )}
              <div style={{ color: LIME_DIM, fontSize: 10, marginTop: 6, letterSpacing: 1 }}>
                TAP TO DEBRIEF →
              </div>
            </button>
            {/* DISMISS — LOCAL ONLY, and deliberately so. Nothing is written to
                the sheet: the queue is DERIVED from calendar evidence plus the
                absence of a Debrief Log row, so there is no row to delete. This
                only hides the card on this device for this session, for the
                backlog entries that were debriefed before the log existed.
                Two-tap, because an accidental swipe past a real visit is how a
                debrief silently never happens. */}
            <div style={{ position: "absolute", top: 8, right: 8 }}>
              {confirmDismiss === e.eventId ? (
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <button
                    type="button"
                    onClick={() => dismiss(e.eventId)}
                    style={{
                      background: "transparent", border: `1px solid ${LIME_DIM}`, color: LIME,
                      fontFamily: "inherit", fontSize: 10, letterSpacing: 1, fontWeight: "bold",
                      padding: "6px 10px", borderRadius: 4, cursor: "pointer",
                    }}
                  >
                    HIDE
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDismiss(null)}
                    style={{
                      background: "transparent", border: `1px solid ${LINE}`, color: FINE,
                      fontFamily: "inherit", fontSize: 10, letterSpacing: 1,
                      padding: "6px 8px", borderRadius: 4, cursor: "pointer",
                    }}
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  aria-label={`Hide ${e.client} from the queue`}
                  title="Hide from queue (this device only)"
                  onClick={() => setConfirmDismiss(e.eventId)}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center",
                    width: 36, height: 36, background: "transparent",
                    border: `1px solid ${LINE}`, color: FINE, borderRadius: 6,
                    cursor: "pointer", padding: 0,
                  }}
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>


      {/* UPCOMING — same evidence signal inverted: the visit has not ended yet,
          so there is nothing to debrief. Visible but deliberately inert. */}
      {upcoming.length > 0 && (
        <div style={{ marginTop: 22 }}>
          <div style={{ fontSize: 12, letterSpacing: 2, color: FINE }}>UPCOMING DEBRIEFS</div>
          <div style={{ color: FINE, fontSize: 11, marginTop: 4, marginBottom: 10 }}>
            Not finished yet — available once the visit ends.
          </div>
          <div style={{ display: "grid", gap: 10 }}>
            {upcoming.map((e) => (
              <div key={e.eventId} style={{ ...panel, opacity: 0.55 }}>
                <div style={{ color: FINE, fontSize: 14, fontWeight: "bold" }}>{e.client}</div>
                <div style={{ color: FINE, fontSize: 11, marginTop: 3 }}>{fmtWhen(e)}</div>
                {e.location && (
                  <div style={{ color: FINE, fontSize: 10, marginTop: 2 }}>{e.location}</div>
                )}
                <div style={{ color: FINE, fontSize: 10, marginTop: 6, letterSpacing: 1 }}>
                  ends{" "}
                  {new Date(e.end).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {addOpen && (
        <AddDebriefSheet
          onCancel={() => setAddOpen(false)}
          onPick={(client, date) => {
            setAddOpen(false);
            const noon = `${date}T12:00:00`;
            void openEntry({
              /* A synthetic id, not a blank one. The Debrief Log upserts on
                 Event ID + Date and the invoice gate keys on Event ID, so two
                 manual debriefs for one client on one day with an EMPTY id
                 would collide — the second would overwrite the first's log row
                 and be treated as already invoiced. saveDebrief takes any
                 string; the ad-hoc project path already mints 'ADHOC-<ms>' the
                 same way. */
              eventId: `MANUAL-${Date.now()}`,
              title: `${client} — manual debrief`,
              client,
              date,
              start: noon,
              end: noon,
              manual: true,
            });
          }}
        />
      )}
    </div>
  );
}

/**
 * CC-10 Item 3 — ADD DEBRIEF. Client and date, nothing else: everything a
 * debrief needs beyond those two comes from the debrief steps themselves, and
 * the hours come from QuickBooks Time for that client+date exactly as they do
 * for a calendar-derived entry.
 *
 * The client list is getStopSuggest's, via the shared fetchClientNames() that
 * Add Stop and the debrief's new-project flow already use — the FULL roster,
 * not today's route, since the whole point is reaching a visit the route never
 * knew about. PICK ONLY, no free text: the client name is an unenforced foreign
 * key across five places (see CLAUDE.md), and a hand-typed near-miss would
 * write billing hours and an invoice against a client that does not exist.
 */
function AddDebriefSheet({
  onCancel,
  onPick,
}: {
  onCancel: () => void;
  onPick: (client: string, date: string) => void;
}) {
  const [clients, setClients] = useState<string[] | null>(null);
  const [q, setQ] = useState("");
  const [client, setClient] = useState("");
  const [date, setDate] = useState(todayLA);
  const [loadErr, setLoadErr] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        setClients(await fetchClientNames());
      } catch {
        setClients([]);
        setLoadErr(true);
      }
    })();
  }, []);

  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const all = clients ?? [];
    return (needle ? all.filter((c) => c.toLowerCase().includes(needle)) : all).slice(0, 60);
  }, [clients, q]);

  const input: React.CSSProperties = {
    width: "100%",
    boxSizing: "border-box",
    background: BG,
    color: TEXT,
    border: `1px solid ${LINE}`,
    borderRadius: 6,
    padding: 10,
    fontFamily: "inherit",
    fontSize: 14,
  };

  return (
    <div
      onClick={onCancel}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,.8)", zIndex: 320,
        display: "flex", alignItems: "stretch", justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: BG, width: "100%", maxWidth: 560, height: "100%",
          display: "flex", flexDirection: "column", fontFamily: "inherit",
        }}
      >
        <div
          style={{
            padding: "12px 14px", borderBottom: `1px solid ${LINE}`,
            display: "flex", alignItems: "center", gap: 10,
          }}
        >
          <div style={{ color: LIME, fontSize: 13, letterSpacing: 2, fontWeight: "bold", flex: 1 }}>
            ADD DEBRIEF
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close"
            style={{
              background: "transparent", border: "none", color: FINE,
              fontFamily: "inherit", fontSize: 22, cursor: "pointer",
              minWidth: 40, minHeight: 40, padding: 4,
            }}
          >
            ×
          </button>
        </div>

        <div style={{ padding: "12px 14px", borderBottom: `1px solid ${LINE}` }}>
          <div style={{ color: FINE, fontSize: 11, marginBottom: 8 }}>
            For a visit with no calendar event, or one the queue cannot see.
          </div>
          <label style={{ color: FINE, fontSize: 10, letterSpacing: 1 }}>DATE OF THE VISIT</label>
          <input
            type="date"
            value={date}
            max={todayLA()}
            onChange={(e) => setDate(e.target.value)}
            style={{ ...input, marginTop: 4, marginBottom: 10 }}
          />
          <label style={{ color: FINE, fontSize: 10, letterSpacing: 1 }}>CLIENT</label>
          <input
            value={q}
            onChange={(e) => { setQ(e.target.value); setClient(""); }}
            placeholder={clients === null ? "Loading clients…" : "Type to filter…"}
            style={{ ...input, marginTop: 4 }}
          />
          {loadErr && (
            <div style={{ color: "#ff6b6b", fontSize: 11, marginTop: 6 }}>
              Couldn't read the client list — close and try again.
            </div>
          )}
        </div>

        <div style={{ flex: 1, overflowY: "auto" }}>
          {matches.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setClient(c)}
              style={{
                display: "block", width: "100%", textAlign: "left",
                background: client === c ? PANEL : "transparent",
                color: client === c ? LIME : TEXT,
                border: "none", borderBottom: `1px solid ${LINE}`,
                padding: "12px 14px", fontFamily: "inherit", fontSize: 14,
                cursor: "pointer",
              }}
            >
              {c}
            </button>
          ))}
          {clients !== null && matches.length === 0 && (
            <div style={{ color: FINE, fontSize: 12, padding: "20px 14px", textAlign: "center" }}>
              No client matches.
            </div>
          )}
        </div>

        <div style={{ padding: "12px 14px", borderTop: `1px solid ${LINE}` }}>
          <button
            type="button"
            disabled={!client || !date}
            onClick={() => onPick(client, date)}
            style={{
              width: "100%", minHeight: 48, background: LIME, color: BG,
              border: "none", borderRadius: 6, fontFamily: "inherit", fontSize: 13,
              letterSpacing: 2, fontWeight: "bold",
              cursor: client && date ? "pointer" : "default",
              opacity: client && date ? 1 : 0.4,
            }}
          >
            {client ? `DEBRIEF ${client.toUpperCase()}` : "PICK A CLIENT"}
          </button>
        </div>
      </div>
    </div>
  );
}

const panel: React.CSSProperties = {
  background: PANEL,
  border: `1px solid ${LINE}`,
  borderRadius: 8,
  padding: 12,
  width: "100%",
  boxSizing: "border-box",
};
