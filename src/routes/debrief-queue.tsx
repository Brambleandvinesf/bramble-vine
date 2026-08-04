import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../lib/auth";
import { useViewAs } from "../lib/view-as";
import { SCRIPT_URL } from "./confirm";
import { RefreshDot } from "../components/RefreshDot";
import { sessionCache } from "../lib/session-cache";
import { StateDebrief } from "./field";
import { fetchPayrollDay, personSeconds } from "../lib/billing-hours";

/* ============================================================
 * DEBRIEF QUEUE — lead / management only. THE FAILSAFE.
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

function fmtWhen(startIso: string, endIso: string): string {
  const t = (iso: string) =>
    new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const d = new Date(startIso).toLocaleDateString([], { month: "short", day: "numeric" });
  return `${d} · ${t(startIso)}–${t(endIso)}`;
}

function DebriefQueuePage() {
  const { role } = useAuth();
  const { effectiveRole } = useViewAs();
  const who = effectiveRole ?? role;
  const allowed = who === "lead" || who === "management";

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

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch(`${SCRIPT_URL}?action=debriefQueue`);
      const j = (await r.json().catch(() => ({}))) as {
        queue?: QueueEntry[];
        upcoming?: QueueEntry[];
        error?: string;
      };
      if (j.error) throw new Error(j.error);
      const q = Array.isArray(j.queue) ? j.queue : [];
      setQueue(q);
      setUpcoming(Array.isArray(j.upcoming) ? j.upcoming : []);
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

  /* Projects/tools/employees come from getField exactly as the live flow gets
     them — one read, reused for whichever entry is opened. */
  useEffect(() => {
    if (!allowed) return;
    void (async () => {
      try {
        const r = await fetch(`${SCRIPT_URL}?action=getField`);
        const j = (await r.json().catch(() => ({}))) as Fieldish;
        setFieldish(j ?? {});
      } catch {
        /* the debrief still works without the pickers pre-filled */
      }
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

  const pending = useMemo(() => queue ?? [], [queue]);

  if (!allowed) {
    return (
      <div style={{ background: BG, color: TEXT, minHeight: "100vh", padding: 16, fontFamily: "monospace" }}>
        <div style={{ color: FINE, fontSize: 12 }}>DEBRIEF QUEUE is lead / management only.</div>
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
          <div style={{ fontSize: 11, color: FINE }}>{fmtWhen(open.start, open.end)}</div>
        </div>
        {note && <div style={{ color: "#ffb020", fontSize: 11, marginBottom: 8 }}>{note}</div>}
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
      <div style={{ color: FINE, fontSize: 11, marginBottom: 14 }}>
        Visits that have finished and have no debrief logged. Today onward only.
      </div>

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
          <button
            key={e.eventId}
            type="button"
            onClick={() => void openEntry(e)}
            style={{
              ...panel,
              textAlign: "left",
              cursor: "pointer",
              fontFamily: "inherit",
              color: TEXT,
            }}
          >
            <div style={{ color: LIME, fontSize: 14, fontWeight: "bold" }}>{e.client}</div>
            <div style={{ color: FINE, fontSize: 11, marginTop: 3 }}>{fmtWhen(e.start, e.end)}</div>
            {e.location && (
              <div style={{ color: FINE, fontSize: 10, marginTop: 2 }}>{e.location}</div>
            )}
            <div style={{ color: LIME_DIM, fontSize: 10, marginTop: 6, letterSpacing: 1 }}>
              TAP TO DEBRIEF →
            </div>
          </button>
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
                <div style={{ color: FINE, fontSize: 11, marginTop: 3 }}>
                  {fmtWhen(e.start, e.end)}
                </div>
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
