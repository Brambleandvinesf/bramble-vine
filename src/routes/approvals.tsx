import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../lib/auth";
import { useViewAs } from "../lib/view-as";
import { SCRIPT_URL } from "./confirm";
import { RefreshDot } from "../components/RefreshDot";
import { sessionCache } from "../lib/session-cache";
import { confirmModal } from "../components/ConfirmModal";

/* ============================================================
 * APPROVAL QUEUE — lead / management only.
 * Reads:  GET  <SCRIPT_URL>?action=approvalQueue&days=30
 * Writes: POST { action: "payrollConfirm", by, person, ok }
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

type Row = {
  date: string;
  person: string;
  userId?: string | number;
  hours: number;
  segments: number;
  clients?: string[];
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

  if (!allowed) {
    return (
      <div style={{ background: BG, minHeight: "100vh", padding: 24, color: FINE, fontFamily: "'Courier New', Courier, monospace" }}>
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
        <RefreshDot loading={loading} />
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

      {groups.map(([date, rows]) => (
        <div key={date} style={{ marginBottom: 18 }}>
          <div
            style={{
              color: LIME,
              fontSize: 13,
              letterSpacing: 2,
              fontWeight: 900,
              padding: "6px 2px",
              borderBottom: `1px solid ${LINE}`,
              marginBottom: 8,
            }}
          >
            {fmtDate(date)}
          </div>
          {rows.map((r) => {
            const key = rowKey(r);
            const isBusy = busy === key;
            return (
              <div
                key={key}
                style={{
                  background: PANEL,
                  border: `1px solid ${LINE}`,
                  borderRadius: 8,
                  padding: 12,
                  marginBottom: 8,
                }}
              >
                <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                  <div style={{ color: LIME, fontSize: 15, fontWeight: 900 }}>{r.person}</div>
                  <div style={{ marginLeft: "auto", color: LIME, fontSize: 16, fontWeight: 900 }}>
                    {fmtHours(r.hours)} h
                  </div>
                </div>
                <div style={{ color: FINE, fontSize: 14, marginTop: 4 }}>
                  {r.segments ?? 0} segment{Number(r.segments) === 1 ? "" : "s"}
                </div>
                {r.clients && r.clients.length ? (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                    {r.clients.map((c, i) => (
                      <span
                        key={`${c}-${i}`}
                        style={{
                          border: `1px solid ${LIME_DIM}`,
                          color: TEXT,
                          borderRadius: 999,
                          padding: "3px 10px",
                          fontSize: 13,
                        }}
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div style={{ color: FINE, fontSize: 13, marginTop: 8 }}>
                    No client booked against this time.
                  </div>
                )}
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => void submit(r, true)}
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
                      minHeight: 48,
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
      ))}

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
