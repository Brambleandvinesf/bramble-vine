import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useAuth } from "../lib/auth";
import { useViewAs } from "../lib/view-as";
import { canSee } from "../lib/permissions";
import { sessionCache } from "../lib/session-cache";
import { useDayState } from "../lib/day-state";
import { RefreshDot } from "../components/RefreshDot";
import { useReviewableToday } from "../lib/reviewable-today";
import { MessagesFab } from "../components/MessagesFab";
import { appendTeamParam } from "../lib/team";
import { confirmModal } from "../components/ConfirmModal";
import { SPINE_RESERVE_CSS } from "../components/DayStateSpine";


const CK = "loading:getData";
const CONFIRMED_CLIENTS_KEY = "bv.loading.confirmedClients";

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
  /** Clients whose Client Info AF says "No" — never auto-text them. */
  skipTextClients?: string[];
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

  /* PP2 (8/2) ROOT CAUSE of "confirmed items never reach Load Vehicle":
     this map was keyed by BARE Project ID, but Project IDs are only
     unique PER CLIENT ("proj-1" exists for nearly every client). getData
     returns every client's projects, so whichever client came last in
     the array overwrote the key — Louise Ireland's Confirmed proj-5/6/7
     were clobbered to "" by some later client's blank proj-5/6/7 and
     every one of her items was filtered out. Measured against live data
     8/2: 0 items with the bare key, 5 (correct) with the composite one.
     Code.js hit exactly this in v6.6.1 and fixed it there with
     Client Name + Project ID; this reader never got the same treatment. */
  const statusKey = (client: unknown, project: unknown) =>
    `${String(client ?? "").trim()}||${String(project ?? "").trim()}`;
  const projectStatus: Record<string, string> = {};
  (d.projects ?? []).forEach((p) => {
    const id = String(p["Project ID"] ?? "").trim();
    if (id) {
      projectStatus[statusKey(p["Client Name"], id)] = String(p["Status"] ?? "").trim();
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
        projectStatus[statusKey(it.client, it.project)] === "Confirmed",
    );
}

/** VV (8/2): how long a locally-toggled row stays pinned over poll data
 *  before we assume the write is lost and let the server win again. */
const PENDING_TTL_MS = 25_000;
type PendingLoad = Map<number, { value: boolean; at: number }>;

/**
 * Lay un-acknowledged local toggles over a fresh server read instead of
 * letting the read blind-overwrite them (VV). An entry retires as soon as
 * the server reports the same value — or after the TTL, so a write that
 * never landed can't pin a wrong tick on screen forever.
 */
function applyPending(rows: ToolRow[], pending: PendingLoad): ToolRow[] {
  if (pending.size === 0) return rows;
  const now = Date.now();
  const out = rows.map((it) => {
    const p = pending.get(it.row);
    if (!p) return it;
    if (it.loaded === p.value) { pending.delete(it.row); return it; }   // server caught up
    if (now - p.at > PENDING_TTL_MS) { pending.delete(it.row); return it; }
    return { ...it, loaded: p.value };
  });
  return out;
}

function LoadingPage() {
  const { role } = useAuth();
  const { effectiveRole } = useViewAs();
  const canConfirm = canSee(role, "special_confirm");
  const reviewable = useReviewableToday();
  const navigate = useNavigate();

  // Assistant's loading UX lives inside the Field state machine now.
  // Deep-linking /loading as an assistant sends them to /field.
  useEffect(() => {
    if (effectiveRole === "assistant") {
      void navigate({ to: "/field", replace: true });
    }
  }, [effectiveRole, navigate]);



  const cached = sessionCache.get<GetDataResponse>(CK);
  const [confirm, setConfirm] = useState<ConfirmState | null>(() => cached?.confirm ?? null);
  const [items, setItems] = useState<ToolRow[] | null>(() => (cached ? normalize(cached) : null));
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [writeErr, setWriteErr] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [offline, setOffline] = useState(false);
  const [completing, setCompleting] = useState(false);
  // Survives the remounts that poll-driven navigation causes; without this a
  // spine yank threw away every per-client confirmation tap.
  // VV (8/2): rows toggled locally and not yet echoed back by the server.
  const pendingRef = useRef<PendingLoad>(new Map());
  // RR2 (8/2): rows whose client/project context the user tapped open.
  const [expandedItems, setExpandedItems] = useState<Set<number>>(() => new Set());
  const [confirmedClients, setConfirmedClients] = useState<Record<string, boolean>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const raw = window.sessionStorage.getItem(CONFIRMED_CLIENTS_KEY);
      return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
    } catch { return {}; }
  });
  useEffect(() => {
    try { window.sessionStorage.setItem(CONFIRMED_CLIENTS_KEY, JSON.stringify(confirmedClients)); } catch { /* ignore */ }
  }, [confirmedClients]);
  const [flashClient, setFlashClient] = useState<string | null>(null);
  // Shared loading-done flag: loadingComplete sets CONFIRM_STATE.loadingDone
  // on the backend and every device reads it off the day-state poll; localDone
  // bridges the poll gap on the device that pressed the button.
  const [localDone, setLocalDone] = useState(false);
  const [departing, setDeparting] = useState(false);
  const dayState = useDayState();
  const loadingDone = localDone || dayState?.flags?.loadingDone === true;
  // TT.3: read inside the stable `toggle` callback without re-creating it.
  const loadingDoneRef = useRef(loadingDone);
  loadingDoneRef.current = loadingDone;



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
        setItems(applyPending(normalize(json), pendingRef.current));
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
        const res = await fetch(appendTeamParam(`${SCRIPT_URL}?action=getField`));
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
    /* TT.3 (8/2): once LOADING COMPLETE is pressed the checklist is
       frozen on every device — the day has moved on to departing. */
    if (loadingDoneRef.current) return;
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
    const next = !prev;
    /* VV (8/2): pin this row until the SERVER agrees. Without it the 10s
       poll blind-overwrites the tick with whatever the sheet last said. */
    pendingRef.current.set(row, { value: next, at: Date.now() });
    /* VV: there used to be an `if (!materialId) return;` here — a row with
       no Material ID updated locally and NEVER POSTED, so the poll wiped
       it seconds later. That is the whole reported bug. setLoaded has
       always accepted a row fallback, so send the write either way. */
    try {
      const res = await fetch(SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action: "setLoaded", materialId, row, loaded: next }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || json.ok === false) throw new Error(json.error || "save failed");
      setWriteErr(null);
    } catch (e) {
      pendingRef.current.delete(row);          // the write didn't land
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

  // The first stop's client and whether Client Info AF opts them out of
  // auto-texts. Drives the depart button's label — dayState's
  // skipSameDayTexts can't, because the route has no current client yet.
  const firstStop = (field?.events ?? [])[0];
  const firstStopClient = firstStop ? matchClient(firstStop.title, field?.clients ?? []) : null;
  const firstStopSkipsText =
    !!firstStopClient &&
    (field?.skipTextClients ?? []).some(
      (c) => c.trim().toLowerCase() === firstStopClient.trim().toLowerCase(),
    );

  // Departure is an explicit, shared act: flips the route to enroute stop 0
  // (every device's poll advances to the first-visit screen), texts the ETA
  // (unless the client opted out via AF, or the quiet button was used), and
  // opens turn-by-turn on this device.
  const departNow = async (withText: boolean) => {
    if (departing) return;
    const first = firstStop;
    if (!first) {
      toast.error("No first stop on today's calendar");
      return;
    }
    const address = first.location ?? "";
    // Opened synchronously, before any await — popup blockers eat it otherwise.
    if (address) {
      window.open(
        "https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=" +
          encodeURIComponent(address),
        "_blank",
        "noopener,noreferrer",
      );
    }
    setDeparting(true);
    try {
      const r = await postScript({
        action: "setRoute",
        state: "enroute",
        stopIndex: 0,
        client: firstStopClient,
        eventId: first.id,
      });
      if (!r.ok) {
        toast.error(r.error || "Couldn't start the route — retry");
        return;
      }
      if (withText) {
        const t = await postScript({ action: "textEta" });
        const raw = (t.raw ?? {}) as { ok?: boolean; to?: string; error?: string; alreadySent?: boolean; skipped?: boolean };
        if (t.ok && raw.ok !== false) {
          if (!raw.skipped) toast.success(raw.alreadySent ? "ETA already sent today" : `ETA sent to ${raw.to ?? "client"}`);
        } else {
          toast.error(raw.error || t.error || "ETA text failed");
        }
      }
      void navigate({ to: "/field" });
    } finally {
      setDeparting(false);
    }
  };

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
        <div style={STATE}>Daily load only — nothing extra today</div>
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
              {offline && <span style={{ color: MUTED, fontSize: 14 }}>offline — last data</span>}
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
            const isConfirmed = !!confirmedClients[client];
            const isFlashing = flashClient === client;
            if (isConfirmed) {
              return (
                <section
                  key={client}
                  style={{ margin: "12px 12px 0" }}
                >
                  <button
                    type="button"
                    onClick={() =>
                      setConfirmedClients((s) => {
                        const n = { ...s };
                        delete n[client];
                        return n;
                      })
                    }
                    style={CLIENT_CONFIRMED_ROW}
                  >
                    <span style={{ color: LIME, fontSize: 20, marginRight: 10 }}>✓</span>
                    <span style={{ color: TEXT, fontSize: 15, fontWeight: "bold", letterSpacing: 1 }}>
                      {client}
                    </span>
                    <span style={{ marginLeft: "auto", color: MUTED, fontSize: 12, letterSpacing: 1 }}>
                      CONFIRMED · TAP TO EDIT
                    </span>
                  </button>
                </section>
              );
            }
            return (
              <section
                key={client}
                style={{
                  margin: "18px 12px 0",
                  animation: isFlashing ? "bvFlashLime .3s ease" : undefined,
                }}
              >
                <div style={CLIENT_HEAD}>
                  <span style={{ color: LIME, fontSize: 16, fontWeight: "bold", letterSpacing: 1 }}>
                    {client}
                  </span>
                </div>
                {/* RR (8/2): one flat checklist per client — checkboxes and
                    nothing else. The per-project headers are gone; which
                    project an item belongs to is context, not the point of
                    this screen, so it hides behind a tap (RR2). */}
                {(() => {
                  const flat = Object.keys(projects).flatMap((project) =>
                    projects[project].map((it) => ({ it, project })),
                  );
                  return (
                    <div style={ROWS}>
                      {flat.map(({ it, project }, i) => {
                        const onsite = /-\s*onsite/i.test(it.item);
                        const name = it.item.replace(/\s*-\s*onsite\s*$/i, "");
                        const meta = [it.qty, it.size].filter(Boolean).join(" · ");
                        const open = expandedItems.has(it.row);
                        return (
                          <div
                            key={`${it.row}-${i}`}
                            style={{
                              ...ITEM,
                              borderBottom: i === flat.length - 1 ? "none" : `1px solid ${LINE}`,
                              cursor: "pointer",
                              alignItems: "flex-start",
                            }}
                          >
                            {/* RR (8/2): items with no Material ID used to be
                                un-tappable, which on a day where every row
                                lacked one meant NOTHING could be checked off.
                                setLoaded has always accepted a row fallback,
                                so the lockout was pure frontend. */}
                            <div
                              onClick={() => toggle(it.row)}
                              style={{
                                ...BOX,
                                background: it.loaded ? LIME : "transparent",
                                borderColor: it.loaded ? LIME : LIME_DIM,
                              }}
                            >
                              {it.loaded ? "✓" : ""}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }} onClick={() => toggle(it.row)}>
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
                              </div>
                              {meta && <div style={META}>{meta}</div>}
                              {it.notes && <div style={NOTES}>{it.notes}</div>}
                              {open && (
                                <div style={{ ...META, color: DIM_GREEN }}>
                                  {client} · {project}
                                </div>
                              )}
                            </div>
                            <button
                              type="button"
                              aria-label={open ? "Hide details" : "Show details"}
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpandedItems((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(it.row)) next.delete(it.row);
                                  else next.add(it.row);
                                  return next;
                                });
                              }}
                              style={{
                                background: "transparent",
                                border: "none",
                                color: MUTED,
                                fontFamily: "inherit",
                                fontSize: 13,
                                cursor: "pointer",
                                padding: "0 2px",
                                flex: "0 0 auto",
                              }}
                            >
                              {open ? "▾" : "▸"}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
                {/* TT.1 (8/2): the per-client "CONFIRM {client}" button was a
                    leak from the /confirm screen — Load Vehicle is a
                    checklist with exactly ONE button (LOADING COMPLETE),
                    so it is gone rather than hidden. */}
              </section>
            );
          })}


          <div style={{ height: 200 }} />
        </>
      )}
      {confirm?.confirmed && (() => {
        /* TT.2 (8/2): one button for the whole checklist, pressable by any
           crew member — no per-client gate. loadingComplete is shared
           state, so every device sees it and the button goes dark. */
        return (
          <div style={LOADING_COMPLETE_WRAP}>
            {!loadingDone ? (
              <button
                type="button"
                disabled={completing}
                onClick={async () => {
                  if (completing) return;
                  setCompleting(true);
                  try {
                    const res = await fetch(SCRIPT_URL, {
                      method: "POST",
                      headers: { "Content-Type": "text/plain" },
                      body: JSON.stringify({ action: "loadingComplete" }),
                    });
                    // Previously only a thrown error was caught, so an HTTP
                    // error still reported success and advanced the crew.
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    // Stays on this screen: departure is its own shared act
                    // (NAVIGATE AND TEXT ETA below), not a side effect of
                    // finishing the checklist.
                    setLocalDone(true);
                    toast.success("Loading marked complete");
                  } catch {
                    toast.error("Couldn't mark complete — retry");
                  } finally {
                    setCompleting(false);
                  }
                }}
                style={{
                  ...LOADING_COMPLETE_BTN,
                  opacity: completing ? 0.4 : 1,
                  cursor: completing ? "not-allowed" : "pointer",
                  boxShadow: "0 0 22px rgba(124,255,0,.25)",
                }}
              >
                {completing ? "SAVING…" : "LOADING COMPLETE"}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  disabled
                  style={{ ...LOADING_COMPLETE_BTN, opacity: 0.35, cursor: "default" }}
                >
                  LOADING COMPLETE ✓
                </button>
                <button
                  type="button"
                  disabled={departing}
                  onClick={() => void departNow(!firstStopSkipsText)}
                  style={{
                    ...LOADING_COMPLETE_BTN,
                    marginTop: 10,
                    opacity: departing ? 0.6 : 1,
                    boxShadow: "0 0 22px rgba(124,255,0,.25)",
                  }}
                >
                  {departing
                    ? "DEPARTING…"
                    : firstStopSkipsText
                      ? `NAVIGATE TO ${(firstStopClient ?? "NEXT STOP").toUpperCase()} (NO TEXT)`
                      : `NAVIGATE TO ${(firstStopClient ?? "NEXT STOP").toUpperCase()} AND SEND ETA`}
                </button>
                {/* TT.3 (8/2): ALWAYS offered, whatever N's automatic AF
                    check concluded. Deliberate manual override — the S bug
                    hid 17 clients' opt-outs for months, so the crew keeps a
                    way to force no-text even if detection is wrong. */}
                <button
                  type="button"
                  disabled={departing}
                  onClick={() => void departNow(false)}
                  style={{
                    display: "block",
                    margin: "8px auto 0",
                    background: "transparent",
                    border: "none",
                    color: MUTED,
                    fontFamily: "inherit",
                    fontSize: 11,
                    letterSpacing: 1,
                    textDecoration: "underline",
                    cursor: "pointer",
                  }}
                >
                  navigate without texting
                </button>
              </>
            )}
          </div>
        );
      })()}

      {effectiveRole === "management" && field && <RouteFooter field={field} />}
      <MessagesFab />
    </div>
  );
}


function RouteFooter({ field }: { field: GetFieldResponse }) {
  // Read directly rather than threading a prop: this footer is self-contained and
  // already sits under DayStateProvider. Only a literal true suppresses anything,
  // so a payload without the field - which is correct before a stop is active -
  // behaves exactly as before.
  const skipSameDayTexts = useDayState()?.skipSameDayTexts === true;
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
    if (!(await confirmModal(msg))) return;
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
        {/* Genuinely standalone, unlike the Field screen's fused visit buttons,
            so this one really can just go when the client is not to be texted. */}
        {navFlag && !skipSameDayTexts && (
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
const TEXT = "#e8e8e8";
const MUTED = "#b8b8b8";
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
const LOADING_COMPLETE_WRAP: React.CSSProperties = {
  position: "sticky",
  bottom: 0,
  padding: "14px 12px calc(14px + env(safe-area-inset-bottom, 0px))",
  background: "linear-gradient(180deg, rgba(10,10,10,0) 0%, #0a0a0a 40%)",
  display: "flex",
  justifyContent: "center",
  zIndex: 40,
};
const LOADING_COMPLETE_BTN: React.CSSProperties = {
  width: "100%",
  maxWidth: 520,
  minHeight: 64,
  background: LIME,
  color: "#0a0a0a",
  border: "none",
  borderRadius: 12,
  fontFamily: "'Courier New', Courier, monospace",
  fontSize: 16,
  letterSpacing: 2,
  fontWeight: "bold",
  cursor: "pointer",
  boxShadow: "0 0 22px rgba(124,255,0,.25)",
};
const CLIENT_HEAD: React.CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  gap: 10,
  padding: "0 4px 8px",
};
const CLIENT_CONFIRMED_ROW: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  width: "100%",
  minHeight: 52,
  padding: "10px 14px",
  background: "#0f1a08",
  border: `1px solid ${LIME_DIM}`,
  borderRadius: 10,
  color: TEXT,
  fontFamily: "inherit",
  cursor: "pointer",
  textAlign: "left",
};
const CONFIRM_CLIENT_BTN: React.CSSProperties = {
  display: "block",
  width: "100%",
  marginTop: 12,
  minHeight: 56,
  padding: "12px 16px",
  background: LIME,
  color: "#0a0a0a",
  border: "none",
  borderRadius: 10,
  fontFamily: "inherit",
  fontSize: 15,
  letterSpacing: 2,
  fontWeight: "bold",
  cursor: "pointer",
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
  /* Must clear the spine's full reserve band or the spine paints over it. */
  bottom: SPINE_RESERVE_CSS,
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
