import { useCallback, useEffect, useMemo, useState } from "react";
import { writeBillingHours } from "../lib/billing-hours";

/* Palette (mirrors field.tsx) */
const BG = "#0a0a0a";
const PANEL = "#121212";
const PANEL_2 = "#181818";
const LIME = "#7cff00";
const LIME_DIM = "rgba(124,255,0,.35)";
const DIM_GREEN = "#4a7a1e";
const TEXT = "#e8e8e8";
const MUTED = "#b8b8b8";
const LINE = "#2a2a2a";

type Entry = {
  id: string;
  start: string; // ISO
  end: string | null; // ISO or null (still on clock)
  onClock: boolean;
  seconds: number;
  jobcodeId?: string;
  jobcode?: string;
};
type Person = { userId: string; name: string; entries: Entry[] };
type PayrollDayResponse = { ok?: boolean; day?: string; client?: string; people?: Person[] };

type PlanStep = { id: string; start?: string; end?: string; note?: string; label?: string };
type Plan = {
  ok?: boolean;
  refusal?: string;
  warnings?: string[];
  steps?: PlanStep[];
};

type Props = {
  open: boolean;
  scriptUrl: string;
  byName: string;
  client?: string;
  onClose: () => void;
  onProceed: () => void; // called after payrollConfirm succeeds — the day is over at that point
};

function fmtHM(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
function toLocalInputValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInputValue(v: string): string {
  // input "YYYY-MM-DDTHH:mm" (local) → ISO
  const d = new Date(v);
  return d.toISOString();
}
function hmm(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.round((secs % 3600) / 60);
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}
/* Billing figure is always a clean quarter-hour — that's what goes on an invoice. */
function toQuarter(hours: number): number {
  return Math.max(0, Math.round(hours * 4) / 4);
}
function fmtHours(h: number): string {
  return h.toFixed(2);
}
function entryEndMs(e: Entry): number {
  if (e.end) return new Date(e.end).getTime();
  if (e.onClock) return Date.now();
  return new Date(e.start).getTime() + (e.seconds || 0) * 1000;
}
function todayISODate(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
/* A person's client for billing purposes = the jobcode of their latest segment,
   unless the caller told us which client this card is about. */
function personClient(p: Person, fallback?: string): string {
  const sorted = [...p.entries].sort((a, b) => entryEndMs(b) - entryEndMs(a));
  return (fallback || sorted[0]?.jobcode || "").trim();
}

export function PayrollConfirm({ open, scriptUrl, byName, client, onClose, onProceed }: Props) {
  const [loading, setLoading] = useState(false);
  const [people, setPeople] = useState<Person[]>([]);
  const [day, setDay] = useState<string>("");
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showDecline, setShowDecline] = useState(false);
  const [declineNote, setDeclineNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  /* (A) BILLING adjustments — Billing Hours tab only, never QuickBooks Time. */
  const [billing, setBilling] = useState<Record<string, number>>({});
  const [billingNote, setBillingNote] = useState<string | null>(null);
  const [billingBusy, setBillingBusy] = useState<string | null>(null);

  /* (B) PAYROLL edit — planner-gated. */
  const [editing, setEditing] = useState<{
    person: Person;
    entryId: string;
    field: "start" | "end";
    value: string;
  } | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [probing, setProbing] = useState(false);
  const [override, setOverride] = useState<{
    allowBreakToPaid?: boolean;
    allowCrossClient?: boolean;
  }>({});
  const [stepLog, setStepLog] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const q = client ? `&client=${encodeURIComponent(client)}` : "";
      const r = await fetch(`${scriptUrl}?action=payrollDay${q}`, { method: "GET" });
      const j = (await r.json().catch(() => ({}))) as PayrollDayResponse;
      if (!j || j.ok === false) throw new Error("payrollDay failed");
      const list = Array.isArray(j.people) ? j.people : [];
      setPeople(list);
      setDay(j.day ?? "");
      // Re-seed the billing figure from the (possibly corrected) clock time.
      setBilling((cur) => {
        const next = { ...cur };
        for (const p of list) {
          const secs = p.entries.reduce(
            (a, e) => a + (e.onClock ? (Date.now() - new Date(e.start).getTime()) / 1000 : e.seconds || 0),
            0,
          );
          next[p.name] = toQuarter(secs / 3600);
        }
        return next;
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "load failed");
    } finally {
      setLoading(false);
    }
  }, [scriptUrl, client]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  // Anyone whose timesheet is still open. Hours cannot be confirmed until every
  // entry is closed, or the totals on screen would be short.
  const stillOnClock = useMemo(
    () => people.filter((p) => p.entries.some((e) => e.onClock)),
    [people],
  );
  const waitingForClockOuts = stillOnClock.length > 0;

  // While waiting, re-poll so the screen releases itself when the last person
  // clocks out - nobody should have to leave and come back.
  useEffect(() => {
    if (!open || !waitingForClockOuts) return;
    const id = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(id);
  }, [open, waitingForClockOuts, load]);

  // Compute day time range across all entries.
  const range = useMemo(() => {
    let min = Infinity;
    let max = -Infinity;
    for (const p of people) {
      for (const e of p.entries) {
        const s = new Date(e.start).getTime();
        if (!isNaN(s)) min = Math.min(min, s);
        const end = entryEndMs(e);
        if (!isNaN(end)) max = Math.max(max, end);
      }
    }
    if (!isFinite(min) || !isFinite(max) || max <= min) {
      // fallback: 6a → 8p today
      const d = new Date();
      d.setHours(6, 0, 0, 0);
      const e = new Date();
      e.setHours(20, 0, 0, 0);
      return { min: d.getTime(), max: e.getTime() };
    }
    // Pad 10 min each side
    return { min: min - 10 * 60_000, max: max + 10 * 60_000 };
  }, [people]);

  /* (A) ±15 min. Billing Hours tab upsert on date+client+person — pressing "+"
     three times leaves ONE row, so we always send the absolute figure. */
  const adjustBilling = useCallback(
    async (person: Person, deltaHours: number) => {
      const cur = billing[person.name] ?? 0;
      const next = toQuarter(cur + deltaHours);
      const prev = cur;
      setBilling((b) => ({ ...b, [person.name]: next })); // optimistic
      setBillingBusy(person.name);
      setErr(null);
      try {
        /* BUGFIX (8/4): this POSTed setBillingHours WITHOUT dryRun. The backend
           computes `dry = data.dryRun !== false`, so omitting it means
           dryRun:true and the write is SKIPPED — while still answering ok:true
           with a billingOnly note. The old guard checked only `ok === false`,
           so it read that as success, kept the optimistic update and displayed
           the reassuring note. Every adjustment this screen ever made was
           silently discarded. Verified against the deployed backend rather than
           inferred: the identical call sent twice still reported
           hoursFrom:null / mode:"insert", proving the first wrote nothing.
           writeBillingHours sends dryRun:false AND throws on a dryRun response,
           so this can no longer fail quietly. */
        const j = await writeBillingHours({
          client: personClient(person, client),
          rows: [{ person: person.name, hours: next }],
          date: day || todayISODate(),
        });
        if (j.billingOnly) setBillingNote(j.billingOnly);
      } catch (e) {
        setBilling((b) => ({ ...b, [person.name]: prev })); // roll back
        setErr(e instanceof Error ? e.message : "billing update failed");
      } finally {
        setBillingBusy(null);
      }
    },
    [billing, day, client],
  );

  /* (B) Ask the planner first. Never write straight to payrollEdit. */
  const probe = useCallback(
    async (flags: { allowBreakToPaid?: boolean; allowCrossClient?: boolean }) => {
      if (!editing) return;
      setProbing(true);
      setPlan(null);
      setStepLog([]);
      setErr(null);
      try {
        const iso = fromLocalInputValue(editing.value);
        const body: Record<string, unknown> = {
          action: "neighborProbe",
          segments: editing.person.entries,
          targetId: editing.entryId,
        };
        if (editing.field === "start") body.newStart = iso;
        else body.newEnd = iso;
        if (flags.allowBreakToPaid) body.allowBreakToPaid = true;
        if (flags.allowCrossClient) body.allowCrossClient = true;
        const r = await fetch(scriptUrl, {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: JSON.stringify(body),
        });
        const j = (await r.json().catch(() => ({}))) as { ok?: boolean; plan?: Plan };
        if (!j.plan) throw new Error("neighborProbe returned no plan");
        setPlan(j.plan);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "probe failed");
      } finally {
        setProbing(false);
      }
    },
    [editing, scriptUrl],
  );

  /* Steps run IN THE ORDER GIVEN — the neighbour moves out of the way before
     the target moves in. QB Time answers an overlapping write with HTTP 200 and
     hides the per-item failure, so we stop on the first failure. */
  const runPlan = useCallback(async () => {
    if (!plan?.steps?.length || !editing) return;
    setSaving(true);
    setErr(null);
    const log: string[] = [];
    try {
      for (let i = 0; i < plan.steps.length; i++) {
        const step = plan.steps[i];
        const body: Record<string, unknown> = { action: "payrollEdit", id: step.id };
        if (step.start) body.start = step.start;
        if (step.end) body.end = step.end;
        const r = await fetch(scriptUrl, {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: JSON.stringify(body),
        });
        const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!j.ok) {
          log.push(`step ${i + 1} FAILED: ${j.error || "payrollEdit rejected"}`);
          setStepLog([...log]);
          throw new Error(
            i === 0
              ? `neighbour did not move — target left untouched (${j.error || "payrollEdit rejected"})`
              : j.error || "payrollEdit failed",
          );
        }
        log.push(`step ${i + 1} ok${step.label ? ` — ${step.label}` : ""}`);
        setStepLog([...log]);
      }
      setEditing(null);
      setPlan(null);
      setOverride({});
      await load(); // re-seeds the billing figure from the corrected time
    } catch (e) {
      setErr(e instanceof Error ? e.message : "edit failed");
    } finally {
      setSaving(false);
    }
  }, [plan, editing, scriptUrl, load]);

  const submitConfirm = useCallback(
    async (ok: boolean, note?: string) => {
      setSubmitting(true);
      setErr(null);
      try {
        const body: Record<string, unknown> = { action: "payrollConfirm", by: byName, ok };
        if (!ok) body.note = note ?? "";
        const r = await fetch(scriptUrl, {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: JSON.stringify(body),
        });
        const j = (await r.json().catch(() => ({}))) as { ok?: boolean };
        if (!j.ok) throw new Error("payrollConfirm failed");
        onProceed();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "confirm failed");
        setSubmitting(false);
      }
    },
    [byName, scriptUrl, onProceed],
  );

  if (!open) return null;

  const refusalOverridable =
    plan?.ok === false &&
    !!plan.refusal &&
    /different client|another client|unpaid break|paid time/i.test(plan.refusal);
  const crossClientRefusal = !!plan?.refusal && /client/i.test(plan.refusal);

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 500,
        background: "rgba(0,0,0,.85)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        overflow: "auto",
        padding: "24px 12px",
        fontFamily: "'Courier New', Courier, monospace",
        color: TEXT,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 720,
          background: BG,
          border: `1px solid ${LINE}`,
          borderRadius: 12,
          padding: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <div style={{ color: LIME, fontSize: 18, fontWeight: "bold", letterSpacing: 2 }}>
            PAYROLL — CONFIRM DAY
          </div>
          <div style={{ marginLeft: "auto", color: MUTED, fontSize: 14 }}>{day}</div>
        </div>
        <div style={{ color: MUTED, fontSize: 14, marginTop: 8, lineHeight: 1.4 }}>
          Review each person's hours. Use − / + to adjust the BILLING figure by 15 minutes. The
          pencil on a start/stop range is a PAYROLL edit and moves real time entries.
        </div>

        {loading && (
          <div style={{ color: MUTED, fontSize: 14, marginTop: 20, textAlign: "center" }}>
            Loading…
          </div>
        )}
        {err && (
          <div
            style={{
              marginTop: 12,
              padding: "8px 10px",
              border: `1px solid ${LIME_DIM}`,
              color: LIME,
              borderRadius: 6,
              fontSize: 14,
            }}
          >
            {err}
          </div>
        )}

        {!loading && people.length === 0 && !err && (
          <div style={{ color: MUTED, fontSize: 14, marginTop: 20, textAlign: "center" }}>
            No entries for today.
          </div>
        )}

        {!loading && people.length > 0 && (
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 12 }}>
            {people.map((p) => (
              <PersonRow
                key={p.userId}
                person={p}
                min={range.min}
                max={range.max}
                billingHours={billing[p.name] ?? 0}
                billingBusy={billingBusy === p.name}
                billingNote={billingNote}
                onAdjust={(delta) => void adjustBilling(p, delta)}
                onEdit={(entryId, field, current) =>
                  setEditing({ person: p, entryId, field, value: toLocalInputValue(current) })
                }
              />
            ))}
          </div>
        )}

        {/* Action buttons */}
        <div
          style={{
            marginTop: 20,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          {!showDecline ? (
            <>
              {waitingForClockOuts && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                    padding: "10px 12px",
                    border: `1px solid ${LINE}`,
                    borderRadius: 8,
                    background: PANEL_2,
                  }}
                >
                  {stillOnClock.map((p) => (
                    <div key={p.userId} style={{ color: MUTED, fontSize: 14 }}>
                      {p.name} time entries still in progress
                    </div>
                  ))}
                  {/* The 60s poll will clear this on its own; this is for the
                      lead who can see the last person has just clocked out. */}
                  <button
                    onClick={() => void load()}
                    disabled={loading || submitting}
                    style={{
                      alignSelf: "flex-start",
                      marginTop: 6,
                      minHeight: 32,
                      padding: "0 12px",
                      background: "transparent",
                      color: loading ? MUTED : LIME,
                      border: `1px solid ${loading ? LINE : LIME_DIM}`,
                      borderRadius: 6,
                      fontFamily: "inherit",
                      fontSize: 12,
                      letterSpacing: 1.5,
                      cursor: loading || submitting ? "default" : "pointer",
                    }}
                  >
                    {loading ? "REFRESHING…" : "REFRESH"}
                  </button>
                </div>
              )}
              <button
                onClick={() => void submitConfirm(true)}
                disabled={loading || submitting || waitingForClockOuts}
                style={{
                  minHeight: 56,
                  background: waitingForClockOuts ? PANEL_2 : LIME,
                  color: waitingForClockOuts ? MUTED : BG,
                  border: `2px solid ${waitingForClockOuts ? LINE : LIME}`,
                  borderRadius: 8,
                  fontFamily: "inherit",
                  fontSize: 16,
                  fontWeight: "bold",
                  letterSpacing: 2,
                  cursor: waitingForClockOuts ? "not-allowed" : "pointer",
                  opacity: loading || submitting ? 0.5 : 1,
                }}
              >
                CONFIRM HOURS
              </button>
              <button
                onClick={() => setShowDecline(true)}
                disabled={loading || submitting || waitingForClockOuts}
                style={{
                  minHeight: 44,
                  background: "transparent",
                  color: waitingForClockOuts ? MUTED : LIME,
                  border: `1px solid ${waitingForClockOuts ? LINE : LIME_DIM}`,
                  borderRadius: 8,
                  fontFamily: "inherit",
                  fontSize: 14,
                  letterSpacing: 1.5,
                  cursor: waitingForClockOuts ? "not-allowed" : "pointer",
                }}
              >
                CAN'T CONFIRM
              </button>
              <button
                onClick={onClose}
                disabled={submitting}
                style={{
                  marginTop: 4,
                  background: "transparent",
                  color: DIM_GREEN,
                  border: "none",
                  fontFamily: "inherit",
                  fontSize: 12,
                  letterSpacing: 1,
                  cursor: "pointer",
                }}
              >
                cancel
              </button>
            </>
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 10,
                padding: 12,
                background: PANEL,
                border: `1px solid ${LINE}`,
                borderRadius: 8,
              }}
            >
              <div style={{ color: LIME, fontSize: 14, letterSpacing: 1 }}>
                WHY CAN'T YOU CONFIRM?
              </div>
              <textarea
                value={declineNote}
                onChange={(e) => setDeclineNote(e.target.value)}
                placeholder="Short note for the office…"
                rows={3}
                style={{
                  width: "100%",
                  background: PANEL_2,
                  color: TEXT,
                  border: `1px solid ${LINE}`,
                  borderRadius: 6,
                  padding: "10px 12px",
                  fontFamily: "inherit",
                  fontSize: 14,
                  boxSizing: "border-box",
                  resize: "vertical",
                }}
              />
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => setShowDecline(false)}
                  disabled={submitting}
                  style={{
                    flex: 1,
                    minHeight: 44,
                    background: "transparent",
                    color: LIME,
                    border: `1px solid ${LIME_DIM}`,
                    borderRadius: 6,
                    fontFamily: "inherit",
                    fontSize: 14,
                    letterSpacing: 1,
                    cursor: "pointer",
                  }}
                >
                  BACK
                </button>
                <button
                  onClick={() => void submitConfirm(false, declineNote.trim())}
                  disabled={submitting || declineNote.trim().length < 2}
                  style={{
                    flex: 2,
                    minHeight: 44,
                    background: LIME,
                    color: BG,
                    border: `2px solid ${LIME}`,
                    borderRadius: 6,
                    fontFamily: "inherit",
                    fontSize: 14,
                    fontWeight: "bold",
                    letterSpacing: 1.5,
                    cursor: "pointer",
                    opacity: submitting || declineNote.trim().length < 2 ? 0.5 : 1,
                  }}
                >
                  SUBMIT &amp; CLOCK OUT
                </button>
              </div>
            </div>
          )}
        </div>

        {/* PAYROLL EDIT (nested) — probe, review, then execute steps in order. */}
        {editing && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 600,
              background: "rgba(0,0,0,.9)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 16,
              overflow: "auto",
            }}
            onClick={() => {
              if (saving || probing) return;
              setEditing(null);
              setPlan(null);
              setOverride({});
              setStepLog([]);
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: "100%",
                maxWidth: 420,
                background: BG,
                border: `2px solid ${LIME}`,
                borderRadius: 10,
                padding: 16,
              }}
            >
              <div style={{ color: LIME, fontSize: 15, letterSpacing: 1.5, fontWeight: "bold" }}>
                PAYROLL EDIT — {editing.field.toUpperCase()}
              </div>
              <div style={{ color: MUTED, fontSize: 14, marginTop: 6, lineHeight: 1.4 }}>
                {editing.person.name} · this changes the real time entry in QuickBooks Time and may
                move a neighbouring segment.
              </div>
              <input
                type="datetime-local"
                value={editing.value}
                onChange={(e) => {
                  const v = e.target.value;
                  setEditing((cur) => (cur ? { ...cur, value: v } : cur));
                  setPlan(null);
                  setOverride({});
                  setStepLog([]);
                }}
                style={{
                  marginTop: 12,
                  width: "100%",
                  background: PANEL_2,
                  color: TEXT,
                  border: `1px solid ${LINE}`,
                  borderRadius: 6,
                  padding: "10px 12px",
                  fontFamily: "inherit",
                  fontSize: 15,
                  boxSizing: "border-box",
                }}
              />

              {/* Refusal — shown VERBATIM. The wording is the useful part. */}
              {plan?.ok === false && (
                <div
                  style={{
                    marginTop: 12,
                    padding: "10px 12px",
                    background: PANEL,
                    border: `1px solid ${LIME}`,
                    borderRadius: 6,
                  }}
                >
                  <div style={{ color: LIME, fontSize: 12, letterSpacing: 1.5 }}>REFUSED</div>
                  <div style={{ color: TEXT, fontSize: 14, marginTop: 6, lineHeight: 1.45 }}>
                    {plan.refusal || "refused with no reason given"}
                  </div>
                  {refusalOverridable && (
                    <button
                      onClick={() => {
                        const flags = crossClientRefusal
                          ? { ...override, allowCrossClient: true }
                          : { ...override, allowBreakToPaid: true };
                        setOverride(flags);
                        void probe(flags);
                      }}
                      disabled={probing}
                      style={{
                        marginTop: 10,
                        minHeight: 44,
                        width: "100%",
                        background: "transparent",
                        color: LIME,
                        border: `1px solid ${LIME}`,
                        borderRadius: 6,
                        fontFamily: "inherit",
                        fontSize: 13,
                        letterSpacing: 1,
                        cursor: probing ? "default" : "pointer",
                      }}
                    >
                      {crossClientRefusal
                        ? "YES — MOVE THE OTHER CLIENT'S BILLED BOUNDARY"
                        : "YES — CONVERT UNPAID BREAK TIME INTO PAID TIME"}
                    </button>
                  )}
                </div>
              )}

              {/* Warnings — every entry shown before committing. */}
              {plan?.ok === true && (plan.warnings?.length ?? 0) > 0 && (
                <div
                  style={{
                    marginTop: 12,
                    padding: "10px 12px",
                    background: PANEL,
                    border: `1px solid ${LIME_DIM}`,
                    borderRadius: 6,
                  }}
                >
                  <div style={{ color: LIME, fontSize: 12, letterSpacing: 1.5 }}>
                    BEFORE YOU COMMIT
                  </div>
                  {plan.warnings!.map((w, i) => (
                    <div
                      key={i}
                      style={{ color: TEXT, fontSize: 14, marginTop: 6, lineHeight: 1.45 }}
                    >
                      · {w}
                    </div>
                  ))}
                </div>
              )}

              {/* Steps preview, in execution order. */}
              {plan?.ok === true && (plan.steps?.length ?? 0) > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ color: MUTED, fontSize: 12, letterSpacing: 1.5 }}>
                    {plan.steps!.length} STEP{plan.steps!.length > 1 ? "S" : ""}, IN ORDER
                  </div>
                  {plan.steps!.map((s, i) => (
                    <div key={`${s.id}-${i}`} style={{ color: MUTED, fontSize: 14, marginTop: 4 }}>
                      {i + 1}. {s.label || s.note || `entry ${s.id}`}
                      {s.start ? ` · start ${fmtHM(s.start)}` : ""}
                      {s.end ? ` · end ${fmtHM(s.end)}` : ""}
                    </div>
                  ))}
                </div>
              )}

              {stepLog.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  {stepLog.map((l, i) => (
                    <div key={i} style={{ color: LIME, fontSize: 13, marginTop: 2 }}>
                      {l}
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                <button
                  onClick={() => {
                    setEditing(null);
                    setPlan(null);
                    setOverride({});
                    setStepLog([]);
                  }}
                  disabled={saving || probing}
                  style={{
                    flex: 1,
                    minHeight: 44,
                    background: "transparent",
                    color: LIME,
                    border: `1px solid ${LIME_DIM}`,
                    borderRadius: 6,
                    fontFamily: "inherit",
                    fontSize: 14,
                    letterSpacing: 1,
                    cursor: "pointer",
                  }}
                >
                  CANCEL
                </button>
                {plan?.ok === true ? (
                  <button
                    onClick={() => void runPlan()}
                    disabled={saving}
                    style={{
                      flex: 1,
                      minHeight: 44,
                      background: LIME,
                      color: BG,
                      border: `2px solid ${LIME}`,
                      borderRadius: 6,
                      fontFamily: "inherit",
                      fontSize: 14,
                      fontWeight: "bold",
                      letterSpacing: 1,
                      cursor: "pointer",
                      opacity: saving ? 0.5 : 1,
                    }}
                  >
                    {saving ? "APPLYING…" : "APPLY EDIT"}
                  </button>
                ) : (
                  <button
                    onClick={() => void probe(override)}
                    disabled={probing || !editing.value}
                    style={{
                      flex: 1,
                      minHeight: 44,
                      background: LIME,
                      color: BG,
                      border: `2px solid ${LIME}`,
                      borderRadius: 6,
                      fontFamily: "inherit",
                      fontSize: 14,
                      fontWeight: "bold",
                      letterSpacing: 1,
                      cursor: probing ? "default" : "pointer",
                      opacity: probing || !editing.value ? 0.5 : 1,
                    }}
                  >
                    {probing ? "CHECKING…" : "CHECK EDIT"}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PersonRow({
  person,
  min,
  max,
  billingHours,
  billingBusy,
  billingNote,
  onAdjust,
  onEdit,
}: {
  person: Person;
  min: number;
  max: number;
  billingHours: number;
  billingBusy: boolean;
  billingNote: string | null;
  onAdjust: (deltaHours: number) => void;
  onEdit: (entryId: string, field: "start" | "end", current: string | null) => void;
}) {
  const span = Math.max(1, max - min);
  const totalSec = person.entries.reduce((a, e) => a + (e.seconds || 0), 0);

  // Sort entries by start
  const sorted = [...person.entries].sort(
    (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
  );

  // Build gap markers between entries
  const gaps: Array<{ leftPct: number; widthPct: number; secs: number }> = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const aEnd = entryEndMs(sorted[i]);
    const bStart = new Date(sorted[i + 1].start).getTime();
    if (bStart > aEnd) {
      gaps.push({
        leftPct: ((aEnd - min) / span) * 100,
        widthPct: ((bStart - aEnd) / span) * 100,
        secs: (bStart - aEnd) / 1000,
      });
    }
  }

  return (
    <div
      style={{
        background: PANEL,
        border: `1px solid ${LINE}`,
        borderRadius: 8,
        padding: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <div style={{ color: LIME, fontSize: 15, fontWeight: "bold", letterSpacing: 1 }}>
          {person.name}
        </div>
        <div style={{ marginLeft: "auto", color: MUTED, fontSize: 14 }}>
          clock {hmm(totalSec)}
        </div>
      </div>

      {/* (A) BILLING headline + quarter-hour adjustment. Deliberately styled as a
          soft/dashed control so it never reads like the payroll pencil. */}
      <div
        style={{
          marginTop: 10,
          padding: "10px 12px",
          background: PANEL_2,
          border: `1px dashed ${LIME_DIM}`,
          borderRadius: 8,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ color: MUTED, fontSize: 14, letterSpacing: 1 }}>BILLING</div>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
            <QuarterButton label="−" onClick={() => onAdjust(-0.25)} disabled={billingBusy} />
            <div
              style={{
                color: LIME,
                fontSize: 20,
                fontWeight: "bold",
                minWidth: 78,
                textAlign: "center",
                opacity: billingBusy ? 0.55 : 1,
              }}
            >
              {fmtHours(billingHours)} h
            </div>
            <QuarterButton label="+" onClick={() => onAdjust(0.25)} disabled={billingBusy} />
          </div>
        </div>
        <div style={{ color: MUTED, fontSize: 14, marginTop: 6, lineHeight: 1.35 }}>
          {billingNote || "Billing Hours tab only — QuickBooks Time untouched"}
        </div>
      </div>

      {/* Timeline */}
      <div
        style={{
          position: "relative",
          height: 26,
          background: PANEL_2,
          border: `1px solid ${LINE}`,
          borderRadius: 4,
          marginTop: 10,
          overflow: "hidden",
        }}
      >
        {gaps.map((g, i) => (
          <div
            key={`gap-${i}`}
            title={`break ${hmm(g.secs)}`}
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: `${g.leftPct}%`,
              width: `${g.widthPct}%`,
              background:
                "repeating-linear-gradient(45deg, transparent 0 4px, rgba(124,255,0,.15) 4px 8px)",
            }}
          />
        ))}
        {sorted.map((e) => {
          const s = new Date(e.start).getTime();
          const end = entryEndMs(e);
          const leftPct = ((s - min) / span) * 100;
          const widthPct = Math.max(0.5, ((end - s) / span) * 100);
          return (
            <div
              key={e.id}
              title={`${fmtHM(e.start)} – ${fmtHM(e.end)}${e.onClock ? " (on clock)" : ""}`}
              style={{
                position: "absolute",
                top: 3,
                bottom: 3,
                left: `${leftPct}%`,
                width: `${widthPct}%`,
                background: e.onClock ? LIME : LIME_DIM,
                border: `1px solid ${LIME}`,
                borderRadius: 3,
              }}
            />
          );
        })}
      </div>

      {/* Entries list */}
      <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
        {sorted.map((e, i) => {
          const prev = i > 0 ? sorted[i - 1] : null;
          const prevEnd = prev ? entryEndMs(prev) : null;
          const gapSec =
            prevEnd != null ? Math.max(0, (new Date(e.start).getTime() - prevEnd) / 1000) : 0;
          return (
            <div key={e.id}>
              {gapSec > 30 && (
                <div
                  style={{
                    fontSize: 14,
                    color: DIM_GREEN,
                    padding: "2px 4px",
                    letterSpacing: 1,
                  }}
                >
                  · break {hmm(gapSec)}
                </div>
              )}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 14,
                  padding: "4px 0",
                }}
              >
                <span style={{ color: TEXT, fontSize: 15 }}>
                  {fmtHM(e.start)} <span style={{ color: MUTED }}>–</span>{" "}
                  {e.end ? fmtHM(e.end) : "on clock"}
                </span>
                {/* (B) PAYROLL edit — solid-bordered pencil, visually distinct
                    from the dashed billing control above. */}
                <PencilButton
                  title="Edit payroll times"
                  onClick={() => onEdit(e.id, e.end ? "end" : "start", e.end ?? e.start)}
                />
                {e.jobcode && (
                  <span style={{ color: DIM_GREEN, fontSize: 13 }}>{e.jobcode}</span>
                )}
                <span style={{ marginLeft: "auto", color: MUTED, fontSize: 14 }}>
                  {hmm(e.seconds || 0)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function QuarterButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label === "+" ? "add 15 minutes to billing" : "remove 15 minutes from billing"}
      style={{
        width: 44,
        height: 44,
        background: "transparent",
        color: LIME,
        border: `1px dashed ${LIME}`,
        borderRadius: 8,
        fontFamily: "inherit",
        fontSize: 20,
        lineHeight: 1,
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {label}
    </button>
  );
}

function PencilButton({ onClick, title }: { onClick: () => void; title?: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label="edit payroll times"
      style={{
        width: 36,
        height: 36,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: "transparent",
        color: LIME,
        border: `1px solid ${LIME}`,
        borderRadius: 6,
        fontFamily: "inherit",
        cursor: "pointer",
      }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
      </svg>
    </button>
  );
}
