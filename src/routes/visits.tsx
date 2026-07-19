import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../lib/auth";
import { useViewAs } from "../lib/view-as";
import { canSee } from "../lib/permissions";

export const Route = createFileRoute("/visits")({
  head: () => ({
    meta: [
      { title: "Bramble & Vine — Visit Confirmations" },
      { name: "description", content: "Draft and send this week's visit confirmations." },
    ],
  }),
  component: VisitsPage,
});

/* ============================================================
 * Backend contract — DO NOT modify without confirmation.
 * Apps Script is the ONLY read backend. Make.com webhooks are
 * the ONLY write destinations for this screen. No other network
 * destinations, no direct Google API calls.
 * Reads:  GET  <SCRIPT_URL>?action=getQueue -> { queue, clients, lastYes }
 * Writes: POST <ACTION_URL> JSON { token, eventId, action, text }
 *         POST <DRAFT_URL>  JSON { token, source: "visits-yes" }
 * ============================================================ */
const SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbwZlJn9jKzzYfcFglDmVGV3l-FTYib0D3mNdILivsB1477aMym68NViDCwia26_JH4siQ/exec";
const ACTION_URL = "https://hook.us2.make.com/f63ii4kvvdbqjrl8ze9ceblnd8gfbb4i";
const DRAFT_URL = "https://hook.us2.make.com/qd58recowfo5knfojgkxuldhqrvhk128";
const TOKEN = "bv7x2K9mQe4TpW8rLzV3";

type QueueRow = {
  eventId: string;
  client: string;
  contact: string;
  method: string;
  visitDate: string;
  draft: string;
  status: string;
};

type QueueResponse = {
  queue?: Array<Record<string, unknown>>;
  clients?: Array<unknown>;
  lastYes?: string;
};

function normalizeRow(r: Record<string, unknown>): QueueRow {
  return {
    eventId: String(r.eventId ?? r["Event ID"] ?? ""),
    client: String(r.client ?? r["Client Name"] ?? "").trim(),
    contact: String(r.contact ?? r["Contact"] ?? "").trim(),
    method: String(r.method ?? r["Method"] ?? "").trim() || "Text",
    visitDate: String(r.visitDate ?? r["Visit Date"] ?? "").trim(),
    draft: String(r.draft ?? r["Draft"] ?? ""),
    status: String(r.status ?? r["Status"] ?? ""),
  };
}

function isPending(r: QueueRow) {
  const s = String(r.status || "").trim().toLowerCase();
  return s === "" || s === "pending";
}

function weekKey(d: Date): string {
  // Convert to America/Los_Angeles, zero time, walk back to Monday.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const y = Number(get("year"));
  const m = Number(get("month"));
  const day = Number(get("day"));
  const wd = get("weekday"); // Mon, Tue...
  const wdMap: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  const back = wdMap[wd] ?? 0;
  const local = new Date(Date.UTC(y, m - 1, day));
  local.setUTCDate(local.getUTCDate() - back);
  return `${local.getUTCFullYear()}-${local.getUTCMonth() + 1}-${local.getUTCDate()}`;
}

function yesThisWeek(lastYes: string | null): boolean {
  if (!lastYes) return false;
  const d = new Date(lastYes);
  if (isNaN(d.getTime())) return false;
  return weekKey(d) === weekKey(new Date());
}

type CardState = {
  text: string;
  busy: boolean;
  sent: boolean;
  flash: { msg: string; err: boolean } | null;
};

function VisitsPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<QueueRow[] | null>(null);
  const [clients, setClients] = useState<string[]>([]);
  const [lastYes, setLastYes] = useState<string | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [reloading, setReloading] = useState(false);
  const [cards, setCards] = useState<Record<string, CardState>>({});
  const [suppressGate, setSuppressGate] = useState(false);
  const [forceGate, setForceGate] = useState(false);
  const [yesBusy, setYesBusy] = useState(false);
  const [yesStatus, setYesStatus] = useState<string>("");
  const [showAdd, setShowAdd] = useState(false);
  const [addClient, setAddClient] = useState("");
  const [addText, setAddText] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const [addFlash, setAddFlash] = useState<{ msg: string; err: boolean } | null>(null);

  const fetchedRef = useRef(false);

  // Force-gate on first load if ?gate=1
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("gate") === "1") setForceGate(true);
    }
  }, []);

  const applyQueue = useCallback((d: QueueResponse) => {
    const q = (d.queue ?? []).map(normalizeRow);
    setRows(q);
    setClients((d.clients ?? []).map((c) => String(c ?? "").trim()).filter(Boolean));
    setLastYes(d.lastYes ? String(d.lastYes) : null);
    setCards((prev) => {
      const next: Record<string, CardState> = {};
      for (const r of q) {
        next[r.eventId] = prev[r.eventId] ?? {
          text: r.draft,
          busy: false,
          sent: false,
          flash: null,
        };
      }
      return next;
    });
  }, []);

  const loadQueue = useCallback(async () => {
    const res = await fetch(`${SCRIPT_URL}?action=getQueue`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as QueueResponse;
    applyQueue(json);
    return json;
  }, [applyQueue]);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    (async () => {
      try {
        await loadQueue();
      } catch (e) {
        setLoadErr(e instanceof Error ? e.message : "Failed to load");
      }
    })();
  }, [loadQueue]);

  const pending = useMemo(() => (rows ?? []).filter(isPending), [rows]);

  const gateOpen =
    !yesThisWeek(lastYes) && (forceGate || (pending.length === 0 && !suppressGate));

  const onReload = useCallback(async () => {
    setReloading(true);
    setLoadErr(null);
    setSuppressGate(true);
    setForceGate(false);
    try {
      await loadQueue();
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setReloading(false);
    }
  }, [loadQueue]);

  const onYes = useCallback(async () => {
    setYesBusy(true);
    setYesStatus("Drafting messages…");
    try {
      await fetch(DRAFT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: TOKEN, source: "visits-yes" }),
      });
    } catch {
      // webhook blocks CORS reads — ignore
    }
    // Poll for pending rows
    let tries = 0;
    const poll = async () => {
      tries += 1;
      try {
        const d = await loadQueue();
        const q = (d.queue ?? []).map(normalizeRow).filter(isPending);
        if (q.length > 0) {
          setYesBusy(false);
          setYesStatus("");
          setForceGate(false);
          setSuppressGate(true);
          return;
        }
      } catch {
        /* ignore */
      }
      if (tries >= 36) {
        setYesStatus("Still drafting — tap Reload in a moment.");
        setYesBusy(false);
        setForceGate(false);
        setSuppressGate(true);
        return;
      }
      setTimeout(() => void poll(), 5000);
    };
    setTimeout(() => void poll(), 5000);
  }, [loadQueue]);

  const flash = useCallback((eventId: string, msg: string, err: boolean) => {
    setCards((prev) => ({
      ...prev,
      [eventId]: { ...prev[eventId], flash: { msg, err } },
    }));
    setTimeout(() => {
      setCards((prev) => {
        const c = prev[eventId];
        if (!c || !c.flash || c.flash.msg !== msg) return prev;
        return { ...prev, [eventId]: { ...c, flash: null } };
      });
    }, 2500);
  }, []);

  const doAction = useCallback(
    async (row: QueueRow, action: "send" | "save" | "skip") => {
      const state = cards[row.eventId];
      const text = action === "skip" ? "" : state?.text ?? "";
      if (action === "send" && !row.contact) {
        if (!window.confirm("No contact on this row — send anyway?")) return;
      }
      setCards((prev) => ({
        ...prev,
        [row.eventId]: { ...prev[row.eventId], busy: true, flash: null },
      }));
      try {
        const res = await fetch(ACTION_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: TOKEN, eventId: row.eventId, action, text }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        if (action === "save") {
          setCards((prev) => ({
            ...prev,
            [row.eventId]: { ...prev[row.eventId], busy: false },
          }));
          flash(row.eventId, "Saved.", false);
        } else {
          setCards((prev) => ({
            ...prev,
            [row.eventId]: { ...prev[row.eventId], busy: true, sent: true },
          }));
        }
      } catch {
        setCards((prev) => ({
          ...prev,
          [row.eventId]: { ...prev[row.eventId], busy: false },
        }));
        flash(row.eventId, "Action failed — try again.", true);
      }
    },
    [cards, flash],
  );

  const onAdd = useCallback(async () => {
    if (!addClient || !addText.trim()) {
      setAddFlash({ msg: "Choose a client and enter text.", err: true });
      return;
    }
    setAddBusy(true);
    setAddFlash(null);
    try {
      const res = await fetch(ACTION_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: TOKEN,
          action: "add",
          client: addClient,
          text: addText,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setAddClient("");
      setAddText("");
      setAddFlash({ msg: "Queued.", err: false });
      setShowAdd(false);
      await loadQueue();
    } catch {
      setAddFlash({ msg: "Failed — try again.", err: true });
    } finally {
      setAddBusy(false);
    }
  }, [addClient, addText, loadQueue]);

  return (
    <div style={PAGE}>
      <header style={HEADER}>
        <div style={{ color: LIME, fontSize: 20, fontWeight: "bold", letterSpacing: 2 }}>
          VISIT CONFIRMATIONS
        </div>
        {user && (
          <div style={{ marginTop: 6, fontSize: 11, color: MUTED, letterSpacing: 1 }}>
            SIGNED IN AS {user.toUpperCase()}
          </div>
        )}
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button style={GHOST_BTN} onClick={() => setShowAdd((s) => !s)}>
            + NEW MESSAGE
          </button>
          <button style={GHOST_BTN} onClick={onReload} disabled={reloading}>
            {reloading ? <>RELOADING<Ellipsis /></> : "RELOAD"}
          </button>
        </div>
      </header>

      {showAdd && (
        <section style={{ margin: "12px" }}>
          <div style={CARD}>
            <div style={{ fontSize: 12, color: MUTED, marginBottom: 8 }}>
              New message — delivery uses the client's confirmation preference
            </div>
            <select
              value={addClient}
              onChange={(e) => setAddClient(e.target.value)}
              style={INPUT}
            >
              <option value="">Choose a client…</option>
              {clients.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <textarea
              value={addText}
              onChange={(e) => setAddText(e.target.value)}
              rows={4}
              style={{ ...INPUT, marginTop: 8, resize: "vertical" }}
              placeholder="Message text…"
            />
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button style={SOLID_BTN} onClick={onAdd} disabled={addBusy}>
                {addBusy ? "ADDING…" : "ADD TO QUEUE"}
              </button>
              <button
                style={GHOST_BTN}
                onClick={() => {
                  setShowAdd(false);
                  setAddFlash(null);
                }}
                disabled={addBusy}
              >
                CANCEL
              </button>
              {addFlash && (
                <span
                  style={{
                    alignSelf: "center",
                    color: addFlash.err ? RED : LIME,
                    fontSize: 12,
                  }}
                >
                  {addFlash.msg}
                </span>
              )}
            </div>
          </div>
        </section>
      )}

      {loadErr && (
        <div style={STATE}>
          Couldn't reach the queue — check connection and Reload.
          <br />
          <span style={{ color: RED }}>{loadErr}</span>
        </div>
      )}

      {!loadErr && rows === null && <div style={STATE}>Loading…</div>}

      {!loadErr && rows !== null && pending.length === 0 && !gateOpen && (
        <div style={STATE}>No pending messages. ✓</div>
      )}

      {!loadErr && pending.map((row) => {
        const c = cards[row.eventId];
        if (!c) return null;
        return (
          <section
            key={row.eventId}
            style={{
              margin: "12px",
              opacity: c.sent ? 0.5 : 1,
              transition: "opacity .3s ease",
            }}
          >
            <div style={CARD}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontWeight: "bold", color: TEXT }}>
                  {row.client || "(no client)"}
                </span>
                {row.visitDate && (
                  <span style={{ fontSize: 12, color: MUTED }}>{row.visitDate}</span>
                )}
                <span style={BADGE}>{row.method}</span>
                {row.contact ? (
                  <span style={{ fontSize: 12, color: MUTED }}>{row.contact}</span>
                ) : (
                  <span style={{ fontSize: 12, color: RED }}>no contact!</span>
                )}
              </div>
              <textarea
                value={c.text}
                onChange={(e) =>
                  setCards((prev) => ({
                    ...prev,
                    [row.eventId]: { ...prev[row.eventId], text: e.target.value },
                  }))
                }
                rows={5}
                disabled={c.busy || c.sent}
                style={{ ...INPUT, marginTop: 10, resize: "vertical" }}
              />
              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                <button
                  style={SOLID_BTN}
                  onClick={() => void doAction(row, "send")}
                  disabled={c.busy || c.sent}
                >
                  SEND
                </button>
                <button
                  style={GHOST_BTN}
                  onClick={() => void doAction(row, "save")}
                  disabled={c.busy || c.sent}
                >
                  SAVE EDIT
                </button>
                <button
                  style={GHOST_BTN}
                  onClick={() => void doAction(row, "skip")}
                  disabled={c.busy || c.sent}
                >
                  SKIP
                </button>
                {c.flash && (
                  <span
                    style={{
                      alignSelf: "center",
                      color: c.flash.err ? RED : LIME,
                      fontSize: 12,
                    }}
                  >
                    {c.flash.msg}
                  </span>
                )}
              </div>
            </div>
          </section>
        );
      })}

      {gateOpen && (
        <div style={GATE_OVERLAY}>
          <div style={{ textAlign: "center", padding: 20 }}>
            <div
              style={{
                color: LIME,
                fontSize: 22,
                fontWeight: "bold",
                letterSpacing: 1,
                marginBottom: 24,
              }}
            >
              Is next week's schedule ready?
            </div>
            <button
              onClick={onYes}
              disabled={yesBusy}
              style={{
                background: LIME,
                color: "#0a0a0a",
                border: "none",
                borderRadius: 8,
                padding: "24px 60px",
                fontSize: 28,
                fontWeight: "bold",
                letterSpacing: 4,
                cursor: yesBusy ? "default" : "pointer",
                fontFamily: "inherit",
                minHeight: 80,
                opacity: yesBusy ? 0.6 : 1,
              }}
            >
              YES
            </button>
            <div style={{ marginTop: 20, fontSize: 13, color: MUTED, minHeight: 20 }}>
              {yesBusy ? (
                <>
                  {yesStatus}
                  <Ellipsis />
                </>
              ) : (
                yesStatus
              )}
            </div>
          </div>
        </div>
      )}

      <div style={{ height: 80 }} />
    </div>
  );
}

function Ellipsis() {
  const [n, setN] = useState(1);
  useEffect(() => {
    const t = setInterval(() => setN((v) => (v % 3) + 1), 400);
    return () => clearInterval(t);
  }, []);
  return <span>{".".repeat(n)}</span>;
}

/* ---------- styles ---------- */
const LIME = "#7cff00";
const TEXT = "#e8e8e8";
const MUTED = "#8f8f8f";
const LINE = "#2a2a2a";
const RED = "#ff3b30";

const PAGE: React.CSSProperties = {
  background: "#0a0a0a",
  color: TEXT,
  fontFamily: "'Courier New', Courier, monospace",
  minHeight: "calc(100vh - 60px)",
  paddingBottom: 40,
};
const HEADER: React.CSSProperties = {
  position: "sticky",
  top: 44,
  zIndex: 10,
  background: "#0a0a0a",
  borderBottom: `1px solid ${LINE}`,
  padding: "14px 16px 12px",
};
const CARD: React.CSSProperties = {
  background: "#121212",
  border: `1px solid ${LINE}`,
  borderRadius: 10,
  padding: 14,
};
const INPUT: React.CSSProperties = {
  width: "100%",
  background: "#0a0a0a",
  color: TEXT,
  border: `1px solid ${LINE}`,
  borderRadius: 6,
  padding: "10px 12px",
  fontFamily: "inherit",
  fontSize: 14,
  boxSizing: "border-box",
};
const BADGE: React.CSSProperties = {
  display: "inline-block",
  fontSize: 10,
  letterSpacing: 1,
  color: LIME,
  border: `1px solid ${LIME}`,
  borderRadius: 3,
  padding: "1px 6px",
  textTransform: "uppercase",
};
const SOLID_BTN: React.CSSProperties = {
  background: LIME,
  color: "#0a0a0a",
  border: "none",
  borderRadius: 6,
  padding: "0 18px",
  minHeight: 56,
  fontFamily: "inherit",
  fontSize: 13,
  letterSpacing: 2,
  fontWeight: "bold",
  cursor: "pointer",
};
const GHOST_BTN: React.CSSProperties = {
  background: "transparent",
  color: LIME,
  border: `1px solid ${LIME}`,
  borderRadius: 6,
  padding: "0 14px",
  minHeight: 56,
  fontFamily: "inherit",
  fontSize: 12,
  letterSpacing: 2,
  fontWeight: "bold",
  cursor: "pointer",
};
const STATE: React.CSSProperties = {
  margin: "40px 20px",
  textAlign: "center",
  color: MUTED,
  fontSize: 14,
  lineHeight: 1.6,
};
const GATE_OVERLAY: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "#0a0a0a",
  zIndex: 200,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};
