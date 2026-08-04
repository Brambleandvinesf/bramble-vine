import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { useAuth } from "../lib/auth";
import { useViewAs } from "../lib/view-as";
import { SCRIPT_URL } from "./confirm";
import { RefreshDot } from "../components/RefreshDot";
import { sessionCache } from "../lib/session-cache";
import { confirmModal } from "../components/ConfirmModal";
import {
  applyPunchDelete,
  applyPunchEdit,
  laIso,
  planPunchDelete,
  planPunchEdit,
  punchTime,
  type PunchEditArgs,
  type PunchPlan,
} from "../lib/punch-edit";

/* ============================================================
 * APPROVAL QUEUE — lead / management only.
 * Reads:  GET  <SCRIPT_URL>?action=approvalQueue&days=30
 * Writes: POST { action: "payrollConfirm", by, person, ok }
 *         punch edits go through src/lib/punch-edit.ts (never hand-rolled)
 * One card per DAY, one sub-card per EMPLOYEE, timeline rows inside.
 * Large historical backlog on first open is expected by design.
 * ============================================================ */

export const Route = createFileRoute("/approvals")({
  head: () => ({
    meta: [
      { title: "Bramble & Vine — Approval Queue" },
      { name: "description", content: "Unapproved crew hours awaiting review." },
    ],
  }),
  component: ApprovalsPage,
});

const BG = "#0a0a0a";
const PANEL = "#121212";
const LIME = "#7cff00";
const LIME_DIM = "#4a7a1e";
const TEXT = "#e8e8e8";
const FINE = "#b8b8b8";
const LINE = "#2a2a2a";
const CK = "approvals:approvalQueue";
const OVERHEAD = "Bramble & Vine";

const DAY_CARD: React.CSSProperties = {
  background: "#0f1509",
  border: "3px solid #d9ff70",
  borderRadius: 14,
  padding: 14,
  boxShadow: "0 0 0 2px rgba(191,255,60,.18), 0 0 28px rgba(191,255,60,.14)",
  marginBottom: 18,
};

const PERSON_CARD: React.CSSProperties = {
  background: PANEL,
  border: "1px solid rgba(124,255,0,0.45)",
  borderRadius: 10,
  padding: 12,
  marginBottom: 10,
};

const INPUT: React.CSSProperties = {
  background: "#0a0a0a",
  color: TEXT,
  border: `1px solid ${LINE}`,
  borderRadius: 6,
  fontFamily: "inherit",
  fontSize: 15,
  padding: "8px 10px",
  minHeight: 44,
  width: 92,
};

type WorkRow = {
  type: "work";
  id: string;
  start?: string;
  end?: string;
  jobcode?: string;
  jobcodeId?: string;
  seconds?: number;
  onClock?: boolean;
};
type BreakRow = { type: "break"; start?: string; end?: string; minutes?: number };
type TimelineRow = WorkRow | BreakRow;

type Punch = {
  id: string;
  start?: string;
  end?: string;
  jobcodeId?: string;
  jobcode?: string;
  seconds?: number;
  onClock?: boolean;
};

type Row = {
  date: string;
  person: string;
  userId?: string | number;
  hours: number;
  /** A COUNT, not an array. The array is `punches`. */
  segments: number;
  clients?: string[];
  approved?: boolean;
  /** That person's QBT watermark (approved_to), or null. Server-computed. */
  approvedTo?: string | null;
  /** Audit only — someone clicked approve in the app. NEVER decides approval. */
  appConfirmed?: boolean;
  punches?: Punch[];
  timeline?: TimelineRow[];
  breakMinutes?: number;
};

type SweepDay = { date: string; hours?: number };

type ApproveThroughResponse = {
  ok?: boolean;
  error?: string;
  dryRun?: boolean;
  confirmed?: boolean;
  noOp?: boolean;
  message?: string;
  approvedToBefore?: string | null;
  target?: string;
  sweep?: SweepDay[];
  sweepDays?: number;
  sweepHours?: number;
  alsoApproves?: SweepDay[];
};


type OnClock = {
  person?: string;
  date?: string;
  since?: string;
  clients?: string[];
  [k: string]: unknown;
};

type QueueResponse = {
  windowDays?: number;
  from?: string;
  to?: string;
  unapproved?: Row[];
  unapprovedCount?: number;
  unapprovedHours?: number;
  alreadyApprovedCount?: number;
  stillOnClock?: OnClock[];
};

function rowKey(r: Row) {
  return `${r.date}|${r.person}`;
}

function fmtHours(h: unknown) {
  const n = Number(h);
  return Number.isFinite(n) ? n.toFixed(2) : "0.00";
}

function fmtDate(d: string) {
  if (!d) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  if (!m) return d;
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return dt.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** "30 Jul" — compact form used in sweep sentences and the watermark note. */
function fmtShort(d?: string | null) {
  if (!d) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  if (!m) return d;
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return dt.toLocaleDateString("en-US", { day: "numeric", month: "short" });
}

/** "Thu 30 Jul" — how the confirmation names the target day. */
function fmtDow(d?: string | null) {
  if (!d) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  if (!m) return d;
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return dt.toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short" });
}


/** "9:03" in LA time — what the H:mm inputs are prefilled with. */
function laHHMM(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d
    .toLocaleTimeString("en-US", {
      timeZone: "America/Los_Angeles",
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
    })
    .replace(/^0/, "");
}

/* ---------------- the pencil editor ---------------- */

function PunchEditor({
  row,
  seg,
  clients,
  onClose,
  onApplied,
}: {
  row: Row;
  seg: WorkRow;
  clients: string[];
  onClose: () => void;
  onApplied: () => void;
}) {
  const [start, setStart] = useState(() => laHHMM(seg.start));
  const [end, setEnd] = useState(() => laHHMM(seg.end));
  const [client, setClient] = useState<string>("");
  const [optIn, setOptIn] = useState(false);
  const [plan, setPlan] = useState<PunchPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  type Built = { err: string; args?: undefined } | { err?: undefined; args: PunchEditArgs };
  const build = useCallback(
    (withOptIn: boolean): Built => {

      const args: Parameters<typeof planPunchEdit>[0] = {
        person: row.person,
        id: seg.id,
        date: row.date,
      };
      if (start && start !== laHHMM(seg.start)) {
        const iso = laIso(row.date, start);
        if (!iso) return { err: "not a valid time on that date" } as const;
        args.start = iso;
      }
      if (end && end !== laHHMM(seg.end)) {
        const iso = laIso(row.date, end);
        if (!iso) return { err: "not a valid time on that date" } as const;
        args.end = iso;
      }
      if (client) args.client = client;
      if (withOptIn && plan?.needsOptIn) args[plan.needsOptIn] = true;
      return { args } as const;
    },
    [row.person, row.date, seg.id, seg.start, seg.end, start, end, client, plan],
  );

  const doPlan = useCallback(
    async (withOptIn: boolean) => {
      const built = build(withOptIn);
      if (built.err || !built.args) {
        setMsg(built.err ?? "Could not build that edit.");
        setPlan(null);
        return;
      }
      setBusy(true);
      setMsg(null);
      try {
        const j = await planPunchEdit(built.args);
        setPlan(j);
      } catch (e) {
        setMsg(e instanceof Error ? e.message : "Could not plan that edit.");
      } finally {
        setBusy(false);
      }
    },
    [build],
  );

  const doApply = useCallback(async () => {
    const built = build(optIn);
    if (built.err || !built.args) {
      setMsg(built.err ?? "Could not build that edit.");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const j = await applyPunchEdit(built.args);
      if (j.partial) {
        setMsg(
          `Partly applied — check the segment times. ${(j.applied ?? [])
            .map((a) => `${a.field} → ${punchTime(a.to)}`)
            .join(", ")}${j.error ? ` — ${j.error}` : ""}`,
        );
        onApplied();
        return;
      }
      onApplied();
      onClose();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not apply that edit.");
    } finally {
      setBusy(false);
    }
  }, [build, optIn, onApplied, onClose]);

  const optInLabel =
    plan?.needsOptIn === "allowBreakToPaid"
      ? "Convert unpaid break time to paid"
      : plan?.needsOptIn === "allowCrossClient"
        ? "Move another client's billed boundary"
        : null;

  return (
    <div
      style={{
        border: `1px solid ${LIME_DIM}`,
        borderRadius: 8,
        padding: 10,
        marginTop: 8,
        background: "#0a0a0a",
      }}
    >
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label style={{ color: FINE, fontSize: 13 }}>
          <div style={{ marginBottom: 4 }}>START (H:mm)</div>
          <input
            value={start}
            onChange={(e) => setStart(e.target.value)}
            placeholder="9:03"
            style={INPUT}
          />
        </label>
        <label style={{ color: FINE, fontSize: 13 }}>
          <div style={{ marginBottom: 4 }}>END (H:mm)</div>
          <input
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            placeholder="10:49"
            style={INPUT}
          />
        </label>
        <label style={{ color: FINE, fontSize: 13, flex: "1 1 180px" }}>
          <div style={{ marginBottom: 4 }}>CLIENT</div>
          <select
            value={client}
            onChange={(e) => setClient(e.target.value)}
            style={{ ...INPUT, width: "100%" }}
          >
            <option value="">— keep {seg.jobcode || "current"} —</option>
            {clients.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      </div>

      {plan ? (
        <div style={{ marginTop: 10, fontSize: 14, color: TEXT }}>
          {plan.refusal ? (
            <div style={{ color: LIME, whiteSpace: "pre-wrap" }}>{plan.refusal}</div>
          ) : null}
          {(plan.steps ?? []).map((s, i) => (
            <div key={`${s.id}-${i}`} style={{ color: FINE }}>
              {s.field} {punchTime(s.from)} → {punchTime(s.to)}
              {s.why ? ` — ${s.why}` : ""}
            </div>
          ))}
          {(plan.warnings ?? []).map((w, i) => (
            <div key={i} style={{ color: LIME, marginTop: 4 }}>
              {w}
            </div>
          ))}
          {optInLabel ? (
            <label
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                color: TEXT,
                marginTop: 10,
                fontSize: 14,
              }}
            >
              <input
                type="checkbox"
                checked={optIn}
                onChange={(e) => {
                  setOptIn(e.target.checked);
                  if (e.target.checked) void doPlan(true);
                }}
              />
              {optInLabel}
            </label>
          ) : null}
        </div>
      ) : null}

      {msg ? (
        <div style={{ color: LIME, fontSize: 14, marginTop: 8, whiteSpace: "pre-wrap" }}>{msg}</div>
      ) : null}

      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        <button
          type="button"
          disabled={busy}
          onClick={() => void doPlan(optIn)}
          style={{
            background: "transparent",
            color: LIME,
            border: `1px solid ${LIME_DIM}`,
            borderRadius: 6,
            minHeight: 48,
            padding: "0 16px",
            fontFamily: "inherit",
            fontSize: 13,
            letterSpacing: 1,
            cursor: "pointer",
          }}
        >
          {busy ? "…" : "PREVIEW"}
        </button>
        <button
          type="button"
          disabled={
            busy || !plan || (plan.ok === false && !(plan.needsOptIn && optIn))
          }
          onClick={() => void doApply()}
          style={{
            background: LIME,
            color: "#0a0a0a",
            border: "none",
            borderRadius: 6,
            minHeight: 48,
            padding: "0 20px",
            fontFamily: "inherit",
            fontSize: 13,
            letterSpacing: 2,
            fontWeight: 900,
            cursor: "pointer",
            opacity: !plan ? 0.5 : 1,
          }}
        >
          APPLY
        </button>
        <button
          type="button"
          onClick={onClose}
          style={{
            background: "transparent",
            color: FINE,
            border: `1px solid ${LINE}`,
            borderRadius: 6,
            minHeight: 48,
            padding: "0 14px",
            fontFamily: "inherit",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          CANCEL
        </button>
      </div>
    </div>
  );
}

/* ---------------- timeline ---------------- */

function Timeline({
  row,
  clients,
  onApplied,
}: {
  row: Row;
  clients: string[];
  onApplied: () => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [delMsg, setDelMsg] = useState<string | null>(null);

  const doDelete = useCallback(
    async (seg: WorkRow) => {
      setDelMsg(null);
      setDeleting(seg.id);
      try {
        const plan = await planPunchDelete({ person: row.person, id: seg.id, date: row.date });
        if (plan.ok === false || !plan.removing) {
          setDelMsg(plan.error || "Could not plan that delete.");
          return;
        }
        const r = plan.removing;
        const lines = [
          "Delete this punch permanently?",
          "",
          `${r.person} · ${fmtDate(r.date)} · ${r.client}`,
          `${punchTime(r.start)}–${punchTime(r.end ?? undefined)} · ${Number(r.hours).toFixed(2)}h`,
          `id ${r.id}`,
        ];
        if (plan.billingProjection) lines.push("", plan.billingProjection);
        const ok = await confirmModal({
          message: lines.join("\n"),
          destructive: true,
          confirmLabel: "DELETE PERMANENTLY",
        });
        if (!ok) return;
        await applyPunchDelete({ person: row.person, id: seg.id, date: row.date });
        onApplied();
      } catch (e) {
        setDelMsg(e instanceof Error ? e.message : "Could not delete that segment.");
      } finally {
        setDeleting(null);
      }
    },
    [row.person, row.date, onApplied],
  );

  const rows = row.timeline ?? [];
  if (!rows.length) {
    return (
      <div style={{ color: FINE, fontSize: 14, marginTop: 8 }}>
        {row.segments ?? 0} segment{Number(row.segments) === 1 ? "" : "s"}
      </div>
    );
  }

  return (
    <div style={{ marginTop: 8 }}>
      {rows.map((t, i) => {
        const isBreak = t.type === "break";
        const label = isBreak ? "Break:" : `${(t as WorkRow).jobcode || "—"}:`;
        const key = isBreak ? `break-${i}` : `work-${(t as WorkRow).id}`;
        return (
          <div key={key}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "4px 0",
                color: isBreak ? FINE : TEXT,
                opacity: isBreak ? 0.65 : 1,
                fontSize: 14,
              }}
            >
              <span style={{ flex: "1 1 auto", minWidth: 0, overflowWrap: "anywhere" }}>
                {label}
              </span>
              <span style={{ whiteSpace: "nowrap", color: isBreak ? FINE : LIME }}>
                {punchTime(t.start)}-{punchTime(t.end)}
              </span>
              {isBreak ? (
                <span style={{ color: FINE, fontSize: 13, whiteSpace: "nowrap" }}>
                  {Number((t as BreakRow).minutes ?? 0)} min
                </span>
              ) : (
                <>
                  <button
                    type="button"
                    aria-label={`Edit ${label} segment`}
                    onClick={() =>
                      setEditing((cur) => (cur === (t as WorkRow).id ? null : (t as WorkRow).id))
                    }
                    style={{
                      background: "transparent",
                      border: `1px solid ${LINE}`,
                      borderRadius: 6,
                      color: LIME,
                      width: 44,
                      height: 44,
                      display: "grid",
                      placeItems: "center",
                      cursor: "pointer",
                      flex: "0 0 auto",
                    }}
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${label} segment`}
                    disabled={deleting === (t as WorkRow).id}
                    onClick={() => void doDelete(t as WorkRow)}
                    style={{
                      background: "transparent",
                      border: `1px solid ${LIME}`,
                      borderRadius: 6,
                      color: LIME,
                      width: 44,
                      height: 44,
                      display: "grid",
                      placeItems: "center",
                      cursor: deleting === (t as WorkRow).id ? "wait" : "pointer",
                      opacity: deleting === (t as WorkRow).id ? 0.5 : 1,
                      flex: "0 0 auto",
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </>
              )}

            </div>
            {!isBreak && editing === (t as WorkRow).id ? (
              <PunchEditor
                row={row}
                seg={t as WorkRow}
                clients={clients}
                onClose={() => setEditing(null)}
                onApplied={onApplied}
              />
            ) : null}
          </div>
        );
      })}
      {delMsg ? (
        <div style={{ color: LIME, fontSize: 13, marginTop: 6, whiteSpace: "pre-wrap" }}>
          {delMsg}
        </div>
      ) : null}
      {row.breakMinutes ? (
        <div style={{ color: FINE, fontSize: 13, marginTop: 4 }}>
          {row.breakMinutes} min unpaid break
        </div>
      ) : null}

    </div>
  );
}

/* ---------------- page ---------------- */

function ApprovalsPage() {
  const { name } = useAuth();
  const { effectiveRole } = useViewAs();
  const allowed = effectiveRole === "lead" || effectiveRole === "management";

  const [data, setData] = useState<QueueResponse | null>(
    () => sessionCache.get<QueueResponse>(CK) ?? null,
  );
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, "ok" | "flag">>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; err: boolean } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`${SCRIPT_URL}?action=approvalQueue&days=30`);
      const json = (await res.json()) as QueueResponse;
      setData(json);
      sessionCache.set(CK, json);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load the approval queue.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (allowed) void load();
  }, [allowed, load]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(id);
  }, [toast]);

  const groups = useMemo(() => {
    const rows = (data?.unapproved ?? []).filter((r) => !done[rowKey(r)]);
    const byDate = new Map<string, Row[]>();
    for (const r of rows) {
      const k = r.date ?? "";
      if (!byDate.has(k)) byDate.set(k, []);
      byDate.get(k)!.push(r);
    }
    return [...byDate.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [data, done]);

  const remaining = useMemo(
    () => (data?.unapproved ?? []).filter((r) => !done[rowKey(r)]),
    [data, done],
  );
  const remainingHours = remaining.reduce((s, r) => s + (Number(r.hours) || 0), 0);

  const submit = useCallback(
    async (r: Row, ok: boolean, note?: string) => {
      const key = rowKey(r);
      setBusy(key);
      try {
        const res = await fetch(SCRIPT_URL, {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: JSON.stringify({
            action: "payrollConfirm",
            by: name ?? "",
            person: r.person,
            ok,
            ...(note ? { note } : {}),
          }),
        });
        const json = (await res.json()) as { ok?: boolean; error?: string };
        if (json.ok === false) throw new Error(json.error || "not ok");
        setDone((d) => ({ ...d, [key]: ok ? "ok" : "flag" }));
        setToast({
          msg: ok
            ? `Approved ${r.person} — ${fmtHours(r.hours)} h`
            : `Flagged ${r.person} for management review`,
          err: false,
        });
      } catch (e) {
        setToast({
          msg: e instanceof Error ? e.message : "Could not record that.",
          err: true,
        });
      } finally {
        setBusy(null);
      }
    },
    [name],
  );

  /* APPROVE — two steps, because QBT stores approval as ONE DATE PER PERSON
   * (approved_to). Approving 30 Jul while 27–29 are open DOES approve them; that
   * cannot be blocked, only disclosed. Step 1 plans (dryRun), step 2 commits. */
  const approve = useCallback(
    async (r: Row) => {
      const key = rowKey(r);
      setBusy(key);
      try {
        const call = async (dryRun: boolean) => {
          const res = await fetch(SCRIPT_URL, {
            method: "POST",
            headers: { "Content-Type": "text/plain" },
            body: JSON.stringify({
              action: "approveThrough",
              confirm: "APPROVE",
              person: r.person,
              date: r.date,
              by: name ?? "",
              dryRun,
            }),
          });
          return (await res.json().catch(() => ({}))) as ApproveThroughResponse;
        };

        const plan = await call(true);
        if (plan.ok === false && !plan.noOp) {
          throw new Error(plan.error || "Could not plan that approval.");
        }
        if (plan.noOp) {
          // The watermark never moves backwards. Not an approval; do not offer to proceed.
          setToast({
            msg:
              plan.message ||
              `${r.person} is already approved through ${fmtShort(plan.approvedToBefore)}.`,
            err: false,
          });
          return;
        }

        const also = plan.alsoApproves ?? [];
        let message = `Approve ${r.person} through ${fmtDow(plan.target || r.date)}?`;
        if (also.length) {
          message +=
            `\n\nThis also approves ${also.length} earlier unapproved day${
              also.length === 1 ? "" : "s"
            }:\n` +
            `${also.map((d) => fmtShort(d.date)).join(", ")} — ${fmtHours(plan.sweepHours)}h total.` +
            `\n\nQuickBooks Time records approval as a date, not per-day, so earlier days cannot stay unapproved.`;
        }
        const ok = await confirmModal({ message, confirmLabel: "APPROVE" });
        if (!ok) return;

        const applied = await call(false);
        if (applied.ok === false) throw new Error(applied.error || "Approval failed.");
        // A write the backend could not read back is not a success.
        if (applied.confirmed === false) {
          throw new Error(
            applied.error ||
              "QuickBooks Time did not confirm the approval — refresh and check before retrying.",
          );
        }
        setToast({
          msg: `Approved ${r.person} through ${fmtShort(applied.target || plan.target || r.date)}${
            applied.sweepDays ? ` — ${applied.sweepDays} day${applied.sweepDays === 1 ? "" : "s"}` : ""
          }`,
          err: false,
        });
        await load();
      } catch (e) {
        setToast({
          msg: e instanceof Error ? e.message : "Could not record that.",
          err: true,
        });
      } finally {
        setBusy(null);
      }
    },
    [name, load],
  );


  if (!allowed) {
    return (
      <div
        style={{
          background: BG,
          minHeight: "100vh",
          padding: 24,
          color: FINE,
          fontFamily: "'Courier New', Courier, monospace",
        }}
      >
        Approval Queue is limited to lead and management.
      </div>
    );
  }

  return (
    <div
      style={{
        background: BG,
        minHeight: "100vh",
        padding: "16px 14px 40px",
        color: TEXT,
        fontFamily: "'Courier New', Courier, monospace",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <h1 style={{ color: LIME, fontSize: 18, letterSpacing: 2, margin: 0, fontWeight: 900 }}>
          APPROVAL QUEUE
        </h1>
        <RefreshDot refreshing={loading} />
        <button
          type="button"
          onClick={() => void load()}
          style={{
            marginLeft: "auto",
            background: "transparent",
            color: LIME,
            border: `1px solid ${LIME_DIM}`,
            borderRadius: 6,
            minHeight: 36,
            padding: "0 12px",
            fontFamily: "inherit",
            fontSize: 12,
            letterSpacing: 1,
            cursor: "pointer",
          }}
        >
          REFRESH
        </button>
      </div>

      <div
        style={{
          background: PANEL,
          border: `1px solid ${LINE}`,
          borderRadius: 8,
          padding: 14,
          marginBottom: 14,
        }}
      >
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
          <div>
            <div style={{ color: LIME, fontSize: 26, fontWeight: 900, lineHeight: 1 }}>
              {remaining.length}
            </div>
            <div style={{ color: FINE, fontSize: 14 }}>person-days unapproved</div>
          </div>
          <div>
            <div style={{ color: LIME, fontSize: 26, fontWeight: 900, lineHeight: 1 }}>
              {remainingHours.toFixed(2)}
            </div>
            <div style={{ color: FINE, fontSize: 14 }}>hours awaiting approval</div>
          </div>
          {typeof data?.alreadyApprovedCount === "number" ? (
            <div>
              <div style={{ color: TEXT, fontSize: 26, fontWeight: 900, lineHeight: 1 }}>
                {data.alreadyApprovedCount}
              </div>
              <div style={{ color: FINE, fontSize: 14 }}>already approved</div>
            </div>
          ) : null}
        </div>
        <div style={{ color: FINE, fontSize: 14, marginTop: 10, lineHeight: 1.5 }}>
          {data?.from && data?.to
            ? `Window: ${fmtDate(data.from)} → ${fmtDate(data.to)}${
                data.windowDays ? ` (${data.windowDays} days)` : ""
              }`
            : "Last 30 days"}
          . Historical backlog is expected — per-person approval only became
          recordable recently, so earlier days read unapproved by design.
        </div>
      </div>

      {err ? (
        <div
          style={{
            border: `1px solid ${LIME_DIM}`,
            borderRadius: 8,
            padding: 12,
            color: LIME,
            fontSize: 14,
            marginBottom: 14,
          }}
        >
          {err}
        </div>
      ) : null}

      {groups.length === 0 && !loading ? (
        <div style={{ color: FINE, fontSize: 15, padding: "18px 4px" }}>
          Nothing awaiting approval in this window.
        </div>
      ) : null}

      {groups.map(([date, rows]) => {
        const dayClients = [
          ...new Set([
            OVERHEAD,
            ...rows.flatMap((r) => r.clients ?? []),
            ...rows.flatMap((r) =>
              (r.timeline ?? [])
                .filter((t): t is WorkRow => t.type === "work")
                .map((t) => t.jobcode ?? "")
                .filter(Boolean),
            ),
          ]),
        ].sort((a, b) => (a === OVERHEAD ? -1 : b === OVERHEAD ? 1 : a.localeCompare(b)));

        return (
          <div key={date} style={DAY_CARD}>
            <div
              style={{
                color: LIME,
                fontSize: 14,
                letterSpacing: 2,
                fontWeight: 900,
                padding: "2px 2px 10px",
                borderBottom: `1px solid ${LIME_DIM}`,
                marginBottom: 10,
              }}
            >
              {fmtDate(date)}
            </div>
            {rows.map((r) => {
              const key = rowKey(r);
              const isBusy = busy === key;
              return (
                <div key={key} style={PERSON_CARD}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                    <div style={{ color: LIME, fontSize: 15, fontWeight: 900 }}>{r.person}</div>
                    <div
                      style={{ marginLeft: "auto", color: LIME, fontSize: 16, fontWeight: 900 }}
                    >
                      {fmtHours(r.hours)} h
                    </div>
                  </div>
                  <div style={{ color: FINE, fontSize: 13, marginTop: 2 }}>
                    {r.segments ?? 0} segment{Number(r.segments) === 1 ? "" : "s"}
                    {r.approvedTo
                      ? ` · approved through ${fmtShort(r.approvedTo)}`
                      : " · never approved in QuickBooks Time"}
                  </div>


                  <Timeline row={r} clients={dayClients} onApplied={() => void load()} />

                  {!(r.clients && r.clients.length) && !(r.timeline && r.timeline.length) ? (
                    <div style={{ color: FINE, fontSize: 13, marginTop: 8 }}>
                      No client booked against this time.
                    </div>
                  ) : null}

                  <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void approve(r)}
                      style={{
                        background: LIME,
                        color: "#0a0a0a",
                        border: "none",
                        borderRadius: 6,
                        minHeight: 56,
                        padding: "0 20px",
                        fontFamily: "inherit",
                        fontSize: 13,
                        letterSpacing: 2,
                        fontWeight: 900,
                        cursor: isBusy ? "default" : "pointer",
                        opacity: isBusy ? 0.6 : 1,
                      }}
                    >
                      {isBusy ? "…" : "APPROVE"}
                    </button>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={async () => {
                        const ok = await confirmModal({
                          message: `Can't verify ${r.person}'s ${fmtHours(r.hours)} h on ${fmtDate(
                            r.date,
                          )}?\n\nThis notifies management instead of approving.`,
                          confirmLabel: "SEND",
                          destructive: true,
                        });
                        if (ok) void submit(r, false, "Could not verify from Approval Queue");
                      }}
                      style={{
                        background: "transparent",
                        color: LIME,
                        border: `1px solid ${LIME_DIM}`,
                        borderRadius: 6,
                        minHeight: 56,
                        padding: "0 16px",
                        fontFamily: "inherit",
                        fontSize: 13,
                        letterSpacing: 1,
                        cursor: isBusy ? "default" : "pointer",
                        opacity: isBusy ? 0.6 : 1,
                      }}
                    >
                      CAN'T VERIFY
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}

      {data?.stillOnClock && data.stillOnClock.length ? (
        <div style={{ marginTop: 24 }}>
          <div
            style={{
              color: FINE,
              fontSize: 13,
              letterSpacing: 2,
              fontWeight: 900,
              borderBottom: `1px solid ${LINE}`,
              padding: "6px 2px",
              marginBottom: 8,
            }}
          >
            STILL ON THE CLOCK — NOT APPROVABLE
          </div>
          {data.stillOnClock.map((s, i) => (
            <div
              key={`${String(s.person)}-${i}`}
              style={{
                border: `1px dashed ${LINE}`,
                borderRadius: 8,
                padding: 10,
                marginBottom: 6,
                color: FINE,
                fontSize: 14,
              }}
            >
              <span style={{ color: TEXT, fontWeight: 900 }}>{String(s.person ?? "—")}</span>
              {s.since ? ` — since ${String(s.since)}` : ""}
              {s.clients && s.clients.length ? ` — ${s.clients.join(", ")}` : ""}
              <div style={{ fontSize: 13, marginTop: 2 }}>
                Still working. Hours can be approved once they clock out.
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {toast ? (
        <div
          style={{
            position: "fixed",
            left: 12,
            right: 12,
            bottom: 96,
            background: PANEL,
            border: `1px solid ${toast.err ? LIME : LIME_DIM}`,
            color: toast.err ? LIME : TEXT,
            borderRadius: 8,
            padding: "10px 12px",
            fontSize: 14,
            zIndex: 60,
          }}
        >
          {toast.msg}
        </div>
      ) : null}
    </div>
  );
}
