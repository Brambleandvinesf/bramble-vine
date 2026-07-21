import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useAuth } from "../lib/auth";
import { useViewAs } from "../lib/view-as";
import { canSee } from "../lib/permissions";
import { sessionCache } from "../lib/session-cache";
import { RefreshDot } from "../components/RefreshDot";
import { useReviewableToday } from "../lib/reviewable-today";
import { MessagesFab } from "../components/MessagesFab";


const CK = "loading:getData";

export const Route = createFileRoute("/loading")({
  head: () => ({
    meta: [
      { title: "Bramble & Vine — Morning Loading" },
      { name: "description", content: "Per-client loading checklist for today's route." },
    ],
  }),
  component: LoadingPage,
});

/* ============================================================
 * Backend contract — DO NOT modify without confirmation.
 * The Apps Script web app is the ONLY backend. No other network
 * destinations, no direct Google API calls, no Make webhooks.
 * Reads: GET  <SCRIPT_URL>?action=getData -> { tools, projects, clients, confirm }
 * Writes: POST <SCRIPT_URL> with Content-Type: text/plain
 *         body: { action: "setLoaded", materialId, row, loaded }
 * Text/plain is intentional — it avoids a CORS preflight.
 * The Apps Script decides which clients count as "today"; we filter
 * tools to that set and to projects whose Status is "Confirmed".
 * No client-side date logic.
 * ============================================================ */
const SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbwZlJn9jKzzYfcFglDmVGV3l-FTYib0D3mNdILivsB1477aMym68NViDCwia26_JH4siQ/exec";

const POLL_MS = 10000;

type ConfirmState = {
  day?: string;
  confirmed?: boolean;
  at?: string;
  clients?: unknown[];
};

type ToolRow = {
  row: number;
  materialId: string;
  client: string;
  project: string;
  item: string;
  qty: string;
  size: string;
  notes: string;
  loaded: boolean;
};

type GetDataResponse = {
  tools?: Array<Record<string, unknown>>;
  projects?: Array<Record<string, unknown>>;
  clients?: Array<unknown>;
  confirm?: ConfirmState;
};

type FieldEvent = { id: string; title: string; location?: string };
type FieldRoute = { state?: string; stopIndex?: number; delegated?: boolean };
type GetFieldResponse = {
  route?: FieldRoute;
  events?: FieldEvent[];
  clients?: string[];
};

const FIELD_CK = "loading:getField";

function matchClient(title: string, clients: string[]): string | null {
  const t = (title || "").toLowerCase();
  for (const c of clients) {
    const n = (c || "").trim();
    if (n && t.includes(n.toLowerCase())) return n;
  }
  return null;
}

async function postScript(body: unknown): Promise<{ ok: boolean; raw: unknown; error?: string }> {
  try {
    const res = await fetch(SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify(body),
    });
    let json: unknown = null;
    try { json = await res.json(); } catch { /* noop */ }
    const okFlag = json && typeof json === "object" && "ok" in (json as Record<string, unknown>)
      ? Boolean((json as Record<string, unknown>).ok)
      : res.ok;
    return { ok: !!okFlag, raw: json, error: okFlag ? undefined : `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, raw: null, error: e instanceof Error ? e.message : "network" };
  }
}


function normalize(d: GetDataResponse): ToolRow[] {
  const clients = new Set(
    (d.clients ?? []).map((c) => String(c ?? "").trim()).filter(Boolean),
  );

  const projectStatus: Record<string, string> = {};
  (d.projects ?? []).forEach((p) => {
    const id = String(p["Project ID"] ?? "").trim();
    if (id) {
      projectStatus[id] = String(p["Status"] ?? "").trim();
    }
  });

  return (d.tools ?? [])
    .map((t) => ({
      row: Number(t.row ?? 0),
      materialId: String(t["Material ID"] ?? ""),
      client: String(t["Client Name"] ?? "").trim(),
      project: String(t["Project ID"] ?? ""),
      item: String(t["Item Name"] ?? ""),
      qty: String(t["Quantity"] ?? ""),
      size: String(t["Size"] ?? ""),
      notes: String(t["Notes"] ?? ""),
      loaded: t["Loaded Status"] === true,
    }))
    .filter(
      (it) =>
        it.item &&
        clients.has(it.client) &&
        projectStatus[it.project] === "Confirmed",
    );
}

function LoadingPage() {
  const { user, role } = useAuth();
  const canConfirm = canSee(role, "special_confirm");
  const reviewable = useReviewableToday();


  const cached = sessionCache.get<GetDataResponse>(CK);
  const [confirm, setConfirm] = useState<ConfirmState | null>(() => cached?.confirm ?? null);
  const [items, setItems] = useState<ToolRow[] | null>(() => (cached ? normalize(cached) : null));
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [writeErr, setWriteErr] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [offline, setOffline] = useState(false);

  // Poll getData so the screen unlocks automatically once confirmed.
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      if (!cancelled) setRefreshing(true);
      try {
        const res = await fetch(`${SCRIPT_URL}?action=getData`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as GetDataResponse;
        if (cancelled) return;
        sessionCache.set(CK, json);
        setConfirm(json.confirm ?? null);
        setItems(normalize(json));
        setLoadErr(null);
        setOffline(false);
      } catch (e) {
        if (cancelled) return;
        if (sessionCache.has(CK)) setOffline(true);
        else setLoadErr(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setRefreshing(false);
      }
    };
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // Also poll getField so the pinned footer can show the current stop.
  const fieldCached = sessionCache.get<GetFieldResponse>(FIELD_CK) ?? null;
  const [field, setField] = useState<GetFieldResponse | null>(fieldCached);
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch(`${SCRIPT_URL}?action=getField`);
        if (!res.ok) return;
        const json = (await res.json()) as GetFieldResponse;
        if (cancelled) return;
        sessionCache.set(FIELD_CK, json);
        setField(json);
      } catch { /* keep last */ }
    };
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const toggle = useCallback(async (row: number) => {
    let prev = false;
    let materialId = "";
    setItems((cur) => {
      if (!cur) return cur;
      return cur.map((it) => {
        if (it.row !== row) return it;
        prev = it.loaded;
        materialId = it.materialId;
        return { ...it, loaded: !it.loaded };
      });
    });
    if (!materialId) return;
    try {
      await fetch(SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action: "setLoaded", materialId, row, loaded: !prev }),
      });
      setWriteErr(null);
    } catch (e) {
      setItems((cur) =>
        cur ? cur.map((it) => (it.row === row ? { ...it, loaded: prev } : it)) : cur,
      );
      setWriteErr(e instanceof Error ? e.message : "Save failed");
    }
  }, []);

  const grouped = useMemo(() => {
    const by: Record<string, Record<string, ToolRow[]>> = {};
    (items ?? []).forEach((it) => {
      const projects = (by[it.client] ||= {});
      const key = it.project || "—";
      (projects[key] ||= []).push(it);
    });
    return by;
  }, [items]);

  const totals = useMemo(() => {
    const total = items?.length ?? 0;
    const done = items?.filter((i) => i.loaded).length ?? 0;
    return { total, done };
  }, [items]);

  return (
    <div style={PAGE}>
      {loadErr && (
        <div style={STATE}>
          Could not load checklist.
          <br />
          <span style={{ color: RED }}>{loadErr}</span>
          <br />
          Check connection and reload.
        </div>
      )}

      {!loadErr && !confirm && (
        <div style={STATE}>Loading…</div>
      )}

      {!loadErr && confirm && !confirm.confirmed && (
        <WaitingState canConfirm={canConfirm} />
      )}

      {!loadErr && confirm?.confirmed && reviewable === false && (
        <div style={STATE}>Base load only — nothing extra today</div>
      )}

      {!loadErr && confirm?.confirmed && reviewable !== false && (
        <>
          <header style={HEADER}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ color: LIME, fontSize: 20, fontWeight: "bold", letterSpacing: 2 }}>
                LOADING CHECKLIST
              </div>
              <RefreshDot refreshing={refreshing} offline={offline} />
            </div>
            <div style={SUBROW}>
              <span>
                <b style={{ color: LIME }}>{totals.done}</b>
                {" of "}
                {totals.total} loaded
              </span>
              {offline && <span style={{ color: MUTED, fontSize: 11 }}>offline — last data</span>}
            </div>
            <div style={METER}>
              <div
                style={{
                  height: "100%",
                  width: totals.total ? `${(100 * totals.done) / totals.total}%` : "0%",
                  background: LIME,
                  transition: "width .25s ease",
                }}
              />
            </div>
            {user && (
              <div style={{ marginTop: 6, fontSize: 11, color: MUTED, letterSpacing: 1 }}>
                SIGNED IN AS {user.toUpperCase()}
              </div>
            )}
          </header>

          {writeErr && (
            <div style={ERRBAR}>Save failed — {writeErr}. Toggle reverted.</div>
          )}

          {items === null && <div style={STATE}>Loading…</div>}

          {items !== null && items.length === 0 && (
            <div style={STATE}>
              Nothing to load.
              <br />
              <b style={{ color: LIME }}>Everything's loaded.</b>
            </div>
          )}

          {Object.keys(grouped).map((client) => {
            const projects = grouped[client];
            return (
              <section key={client} style={{ margin: "18px 12px 0" }}>
                <div style={CLIENT_HEAD}>
                  <span style={{ color: LIME, fontSize: 16, fontWeight: "bold", letterSpacing: 1 }}>
                    {client}
                  </span>
                </div>
                {Object.keys(projects).map((project) => {
                  const rows = projects[project];
                  const done = rows.filter((r) => r.loaded).length;
                  return (
                    <div key={project} style={{ marginBottom: 12 }}>
                      <div style={PROJECT_HEAD}>
                        <span style={{ color: DIM_GREEN, fontSize: 12, letterSpacing: 1 }}>
                          {project}
                        </span>
                        <span style={{ fontSize: 12, color: MUTED, marginLeft: "auto" }}>
                          {done} of {rows.length} loaded
                        </span>
                      </div>
                      <div style={ROWS}>
                        {rows.map((it, i) => {
                          const onsite = /-\s*onsite/i.test(it.item);
                          const name = it.item.replace(/\s*-\s*onsite\s*$/i, "");
                          const meta = [it.qty, it.size].filter(Boolean).join(" · ");
                          const noId = !it.materialId;
                          return (
                            <div
                              key={`${it.row}-${i}`}
                              onClick={() => !noId && toggle(it.row)}
                              style={{
                                ...ITEM,
                                borderBottom: i === rows.length - 1 ? "none" : `1px solid ${LINE}`,
                                cursor: noId ? "default" : "pointer",
                                opacity: noId ? 0.6 : 1,
                              }}
                            >
                              <div
                                style={{
                                  ...BOX,
                                  background: it.loaded ? LIME : "transparent",
                                  borderColor: it.loaded ? LIME : LIME_DIM,
                                }}
                              >
                                {it.loaded ? "✓" : ""}
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div
                                  style={{
                                    fontSize: 15,
                                    lineHeight: 1.35,
                                    wordWrap: "break-word",
                                    color: it.loaded ? MUTED : TEXT,
                                    textDecoration: it.loaded ? "line-through" : "none",
                                  }}
                                >
                                  {name}
                                  {onsite && <span style={TAG}>ONSITE</span>}
                                  {noId && (
                                    <span style={{ ...TAG, background: AMBER, color: "#0a0a0a" }}>
                                      NO ID
                                    </span>
                                  )}
                                </div>
                                {meta && <div style={META}>{meta}</div>}
                                {it.notes && <div style={NOTES}>{it.notes}</div>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </section>
            );
          })}

          <div style={{ height: 200 }} />
        </>
      )}
      {field && <RouteFooter field={field} />}
    </div>
  );
}

function RouteFooter({ field }: { field: GetFieldResponse }) {
  const route = field.route ?? {};
  const state = route.state ?? "";
  const events = field.events ?? [];
  const clients = field.clients ?? [];
  const stopIndex = Number(route.stopIndex ?? 0);
  const currentEvent = events[stopIndex];
  const nextEvent = events[stopIndex + 1];
  const isLastStop = stopIndex + 1 >= events.length;

  const [navFlag, setNavFlag] = useState<string | null>(null);
  const [etaBusy, setEtaBusy] = useState(false);
  const [etaMsg, setEtaMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [skipBusy, setSkipBusy] = useState(false);

  const navKey = currentEvent ? `bv.loading.navigated:${currentEvent.id}` : "";
  useEffect(() => {
    if (!navKey || typeof window === "undefined") { setNavFlag(null); return; }
    try {
      setNavFlag(window.sessionStorage.getItem(navKey));
    } catch { setNavFlag(null); }
    setEtaMsg(null);
  }, [navKey]);

  if (!currentEvent) return null;
  if (state !== "enroute" && state !== "next") return null;

  const clientMatch = matchClient(currentEvent.title, clients);
  const address = currentEvent.location ?? "";
  const mapsUrl = address
    ? "https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=" + encodeURIComponent(address)
    : "";

  const onNavigate = () => {
    if (!mapsUrl) return;
    window.open(mapsUrl, "_blank", "noopener,noreferrer");
    try {
      window.sessionStorage.setItem(navKey, String(Date.now()));
      setNavFlag(String(Date.now()));
    } catch { /* ignore */ }
  };

  const onSkip = async () => {
    if (skipBusy) return;
    const label = clientMatch ?? currentEvent.title ?? "this client";
    const msg = isLastStop
      ? `Skip ${label}? No stops remain.`
      : `Skip ${label}? The visit stays on the calendar.`;
    if (!window.confirm(msg)) return;
    setSkipBusy(true);
    const body = isLastStop
      ? { action: "setRoute", stopIndex: stopIndex + 1, state: "next" }
      : {
          action: "setRoute",
          stopIndex: stopIndex + 1,
          state: "enroute",
          client: nextEvent ? matchClient(nextEvent.title, clients) : null,
          eventId: nextEvent?.id,
        };
    await postScript(body);
    // Field polls getField; footer will refresh on next tick.
    setSkipBusy(false);
  };

  const onTextEta = async () => {
    if (etaBusy) return;
    setEtaBusy(true);
    setEtaMsg(null);
    const r = await postScript({ action: "textEta" });
    const raw = (r.raw ?? {}) as { ok?: boolean; to?: string; error?: string };
    if (r.ok && raw.ok !== false) {
      setEtaMsg({ ok: true, text: `ETA sent to ${raw.to ?? "client"}` });
    } else {
      setEtaMsg({ ok: false, text: raw.error || r.error || "Send failed" });
    }
    setEtaBusy(false);
  };

  return (
    <div style={FOOTER_WRAP}>
      <div style={FOOTER_BOX}>
        <div style={{ color: LIME, fontSize: 11, letterSpacing: 2, fontWeight: "bold" }}>
          {state === "next" ? "NEXT STOP" : "CURRENT STOP"}
        </div>
        <div style={{ color: TEXT, fontSize: 15, fontWeight: "bold", marginTop: 4, lineHeight: 1.3 }}>
          {clientMatch ?? currentEvent.title}
        </div>
        {address && (
          <div style={{ color: MUTED, fontSize: 12, marginTop: 2, lineHeight: 1.35, wordBreak: "break-word" }}>
            {address}
          </div>
        )}
        <button
          type="button"
          onClick={onSkip}
          disabled={skipBusy}
          style={FOOTER_SKIP_BTN}
        >
          SKIP →
        </button>
        <button
          type="button"
          onClick={onNavigate}
          disabled={!address}
          style={{ ...FOOTER_NAV_BTN, opacity: address ? 1 : 0.45 }}
        >
          NAVIGATE
        </button>
        {navFlag && (
          <button
            type="button"
            onClick={onTextEta}
            disabled={etaBusy}
            style={{ ...FOOTER_ETA_BTN, opacity: etaBusy ? 0.6 : 1 }}
          >
            {etaBusy ? "SENDING…" : "TEXT ETA"}
          </button>
        )}
        {etaMsg && (
          <div
            style={{
              marginTop: 6,
              fontSize: 12,
              color: etaMsg.ok ? LIME : RED,
              letterSpacing: 1,
            }}
          >
            {etaMsg.ok ? "✓ " : ""}{etaMsg.text}
          </div>
        )}
      </div>
    </div>
  );
}

function WaitingState({ canConfirm }: { canConfirm: boolean }) {
  return (
    <div style={WAITING}>
      <div
        style={{
          color: LIME,
          fontSize: 18,
          fontWeight: "bold",
          letterSpacing: 2,
          marginBottom: 12,
          textTransform: "uppercase",
        }}
      >
        Waiting on loading confirmation
      </div>
      <div style={{ color: MUTED, fontSize: 14, maxWidth: 320, lineHeight: 1.5 }}>
        Today's list unlocks once a lead confirms the day's projects.
      </div>
      {canConfirm && (
        <Link to="/confirm" style={CONFIRM_BUTTON}>
          REVIEW & CONFIRM NOW
        </Link>
      )}
    </div>
  );
}

/* ---------- styles ---------- */
const LIME = "#7cff00";
const LIME_DIM = "rgba(124,255,0,.35)";
const DIM_GREEN = "#4a7a1e";
const AMBER = "#ffb03f";
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
  padding: "14px 16px 10px",
};
const SUBROW: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "baseline",
  fontSize: 13,
  color: MUTED,
  marginTop: 4,
};
const METER: React.CSSProperties = {
  height: 4,
  background: "#181818",
  marginTop: 10,
  borderRadius: 2,
  overflow: "hidden",
};
const ERRBAR: React.CSSProperties = {
  margin: "10px 12px 0",
  padding: "10px 12px",
  background: "#1a0a0a",
  border: `1px solid ${RED}`,
  color: RED,
  borderRadius: 6,
  fontSize: 13,
};
const STATE: React.CSSProperties = {
  margin: "40px 20px",
  textAlign: "center",
  color: MUTED,
  fontSize: 14,
  lineHeight: 1.6,
};
const WAITING: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "calc(100vh - 60px - 56px)",
  textAlign: "center",
  padding: "20px",
};
const CONFIRM_BUTTON: React.CSSProperties = {
  marginTop: 24,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 44,
  padding: "10px 18px",
  background: "transparent",
  border: `1px solid ${LIME}`,
  color: LIME,
  borderRadius: 6,
  textDecoration: "none",
  fontSize: 12,
  letterSpacing: 1,
  fontWeight: "bold",
  textTransform: "uppercase",
};
const CLIENT_HEAD: React.CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  gap: 10,
  padding: "0 4px 8px",
};
const PROJECT_HEAD: React.CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  gap: 10,
  padding: "6px 4px",
  textTransform: "uppercase",
};
const ROWS: React.CSSProperties = {
  background: "#121212",
  border: `1px solid ${LINE}`,
  borderRadius: 10,
  overflow: "hidden",
};
const ITEM: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 14,
  minHeight: 56,
  padding: "12px 14px",
  userSelect: "none",
};
const BOX: React.CSSProperties = {
  flex: "0 0 32px",
  height: 32,
  border: `2px solid ${LIME_DIM}`,
  borderRadius: 6,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 22,
  color: "#0a0a0a",
  transition: "all .12s ease",
};
const META: React.CSSProperties = { fontSize: 12, color: MUTED, marginTop: 3 };
const NOTES: React.CSSProperties = {
  fontSize: 12,
  color: "rgba(124,255,0,.55)",
  marginTop: 3,
  lineHeight: 1.35,
};
const TAG: React.CSSProperties = {
  display: "inline-block",
  fontSize: 10,
  letterSpacing: 1,
  color: "#0a0a0a",
  background: MUTED,
  borderRadius: 3,
  padding: "1px 6px",
  marginLeft: 6,
  verticalAlign: 1,
};
const FOOTER_WRAP: React.CSSProperties = {
  position: "fixed",
  left: 0,
  right: 0,
  bottom: "calc(56px + env(safe-area-inset-bottom, 0px))",
  zIndex: 90,
  padding: "8px 10px",
  background: "linear-gradient(to top, rgba(10,10,10,0.98) 60%, rgba(10,10,10,0))",
  pointerEvents: "none",
};
const FOOTER_BOX: React.CSSProperties = {
  pointerEvents: "auto",
  background: "#121212",
  border: `1px solid ${LINE}`,
  borderRadius: 10,
  padding: "10px 12px 12px",
};
const FOOTER_SKIP_BTN: React.CSSProperties = {
  display: "block",
  width: "100%",
  marginTop: 10,
  minHeight: 36,
  padding: "6px 10px",
  background: "transparent",
  color: DIM_GREEN,
  border: `1px solid ${LIME_DIM}`,
  borderRadius: 6,
  fontFamily: "inherit",
  fontSize: 11,
  letterSpacing: 2,
  fontWeight: "bold",
  cursor: "pointer",
};
const FOOTER_NAV_BTN: React.CSSProperties = {
  display: "block",
  width: "100%",
  marginTop: 8,
  minHeight: 52,
  padding: "10px 14px",
  background: LIME,
  color: "#000",
  border: `1px solid ${LIME}`,
  borderRadius: 8,
  fontFamily: "inherit",
  fontSize: 15,
  letterSpacing: 2,
  fontWeight: "bold",
  cursor: "pointer",
};
const FOOTER_ETA_BTN: React.CSSProperties = {
  display: "block",
  width: "100%",
  marginTop: 8,
  minHeight: 44,
  padding: "8px 12px",
  background: "transparent",
  color: LIME,
  border: `1px solid ${LIME}`,
  borderRadius: 8,
  fontFamily: "inherit",
  fontSize: 13,
  letterSpacing: 2,
  fontWeight: "bold",
  cursor: "pointer",
};
