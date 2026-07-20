import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../lib/auth";
import { useViewAs } from "../lib/view-as";
import { canSee } from "../lib/permissions";
import { ItemPicker } from "../components/ItemPicker";

export const Route = createFileRoute("/field")({
  head: () => ({ meta: [{ title: "Bramble & Vine — Field" }] }),
  validateSearch: (raw: Record<string, unknown>): FieldSearch => {
    const states = ["enroute", "arrived", "visit", "debrief", "next"] as const;
    const steps = ["billing", "updates", "items", "new", "office"] as const;
    const p =
      typeof raw.preview === "string" &&
      (states as readonly string[]).includes(raw.preview)
        ? (raw.preview as RouteState)
        : undefined;
    const st =
      typeof raw.step === "string" &&
      (steps as readonly string[]).includes(raw.step)
        ? (raw.step as DebriefStepKey)
        : undefined;
    return { preview: p, step: st };
  },
  component: FieldPage,
});

/* ============================================================
 * Apps Script is the ONLY backend. No other network destinations.
 * All POSTs use text/plain to avoid CORS preflight. Responses are
 * still JSON — parse and treat json.ok === false as an error.
 * The backend owns state; this screen renders what it polls.
 * ============================================================ */
const SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbwZlJn9jKzzYfcFglDmVGV3l-FTYib0D3mNdILivsB1477aMym68NViDCwia26_JH4siQ/exec";

const POLL_MS = 10_000;

/* ---------- palette ---------- */
const BG = "#0a0a0a";
const PANEL = "#121212";
const PANEL_2 = "#181818";
const LIME = "#7cff00";
const LIME_DIM = "rgba(124,255,0,.35)";
const DIM_GREEN = "#4a7a1e";
const TEXT = "#e8e8e8";
const MUTED = "#8f8f8f";
const LINE = "#2a2a2a";
const RED = "#ff3b30";

/* ---------- types ---------- */
type RouteState = "enroute" | "arrived" | "visit" | "debrief" | "next";
type DebriefStepKey = "billing" | "updates" | "items" | "new" | "office";
type FieldSearch = { preview?: RouteState; step?: DebriefStepKey };
type Employee = { id: string; name: string };
type RosterMember = { id: string; name: string; in?: string | null; out?: string | null; tsId?: string | null };
type EventItem = { id: string; title: string; start?: string; end?: string; location?: string; color?: string };
type ProjectRow = Record<string, unknown> & { row?: number };
type ToolRowRaw = Record<string, unknown> & { row?: number };

type RouteDoc = {
  day?: string;
  state?: RouteState;
  stopIndex?: number;
  client?: string;
  eventId?: string;
  roster?: RosterMember[];
  delegated?: boolean;
  anchored?: boolean;
  arrivedAt?: string | null;
};

type GetFieldResponse = {
  route?: RouteDoc;
  events?: EventItem[];
  employees?: Employee[];
  projects?: ProjectRow[];
  tools?: ToolRowRaw[];
  clients?: string[];
  serverTime?: string;
};

/* ---------- helpers ---------- */
async function postScript(body: unknown): Promise<{ ok: boolean; raw: unknown; error?: string }> {
  try {
    const res = await fetch(SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify(body),
    });
    let json: unknown = null;
    try {
      json = await res.json();
    } catch {
      // non-JSON, treat as ok=false
    }
    const okFlag = json && typeof json === "object" && "ok" in (json as Record<string, unknown>)
      ? Boolean((json as Record<string, unknown>).ok)
      : res.ok;
    return { ok: !!okFlag, raw: json, error: okFlag ? undefined : `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, raw: null, error: e instanceof Error ? e.message : "network" };
  }
}

function matchClient(title: string, clients: string[]): string | null {
  const t = (title || "").toLowerCase();
  for (const c of clients) {
    const n = (c || "").trim();
    if (n && t.includes(n.toLowerCase())) return n;
  }
  return null;
}

function s(v: unknown): string {
  return String(v ?? "").trim();
}

function elapsed(fromIso?: string | null, nowMs?: number): string {
  if (!fromIso) return "—";
  const t = Date.parse(fromIso);
  if (!Number.isFinite(t)) return "—";
  const ms = Math.max(0, (nowMs ?? Date.now()) - t);
  const m = Math.floor(ms / 60000);
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${m % 60}m` : `${m}m`;
}

function fmtTime(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function hoursBetween(inIso?: string | null, outIso?: string | null): number {
  if (!inIso || !outIso) return 0;
  const a = Date.parse(inIso);
  const b = Date.parse(outIso);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 0;
  const h = (b - a) / 3_600_000;
  return Math.max(0, Math.round(h / 0.25) * 0.25);
}

/* ============================================================ */
function FieldPage() {
  const { effectiveRole } = useViewAs();
  const router = useRouter();
  const { user } = useAuth();
  const search = Route.useSearch();

  const canSeeField = canSee(effectiveRole, "route_enroute");
  useEffect(() => {
    if (!canSeeField) void router.navigate({ to: "/" });
  }, [canSeeField, router]);

  const isPreview = effectiveRole === "management" && !!search.preview;
  const previewState: RouteState | null = isPreview ? (search.preview as RouteState) : null;
  const initialStep: DebriefStepKey = search.step ?? "billing";
  const [previewStep, setPreviewStep] = useState<DebriefStepKey>(initialStep);
  useEffect(() => {
    if (search.step) setPreviewStep(search.step);
  }, [search.step]);

  const [data, setData] = useState<GetFieldResponse | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<{ kind: "info" | "err"; text: string } | null>(null);
  const [now, setNow] = useState<number>(Date.now());

  const fetchOnce = useCallback(async () => {
    try {
      const res = await fetch(`${SCRIPT_URL}?action=getField`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as GetFieldResponse;
      setData(json);
      setLoadErr(null);
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : "Failed to load");
    }
  }, []);

  useEffect(() => {
    if (!canSeeField) return;
    void fetchOnce();
    const id = window.setInterval(() => void fetchOnce(), POLL_MS);
    const clk = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      window.clearInterval(id);
      window.clearInterval(clk);
    };
  }, [canSeeField, fetchOnce]);

  const send = useCallback(
    async (body: unknown, opts?: { silent?: boolean }): Promise<{ ok: boolean; raw: unknown }> => {
      if (isPreview) return { ok: false, raw: null };
      setBusy(true);
      const r = await postScript(body);
      setBusy(false);
      if (!r.ok && !opts?.silent) {
        setBanner({ kind: "err", text: `Save failed — ${r.error ?? "unknown"}` });
      } else if (r.ok) {
        setBanner(null);
        void fetchOnce();
      }
      return { ok: r.ok, raw: r.raw };
    },
    [fetchOnce, isPreview],
  );

  if (!canSeeField) return null;

  return (
    <div style={PAGE}>
      <TopBar user={user} state={previewState ?? data?.route?.state} delegated={!!data?.route?.delegated} />
      {isPreview && (
        <PreviewBadge
          previewState={previewState!}
          step={previewStep}
          onStep={setPreviewStep}
          onExit={() => void router.navigate({ to: "/field", search: {} })}
        />
      )}
      {banner && (
        <div style={banner.kind === "err" ? ERRBAR : INFOBAR}>
          {banner.text}
          <button style={CLOSE_X} onClick={() => setBanner(null)}>×</button>
        </div>
      )}
      {loadErr && !data && <div style={STATE}>Loading field data…<br /><span style={{ color: RED }}>{loadErr}</span></div>}
      {!loadErr && !data && <div style={STATE}>Loading…</div>}
      {data && (
        <FieldBody
          data={data}
          now={now}
          send={send}
          busy={busy}
          role={effectiveRole}
          setBanner={setBanner}
          previewState={previewState}
          previewStep={previewStep}
          isPreview={isPreview}
        />
      )}
      <div style={{ height: 80 }} />
    </div>
  );
}

const DEBRIEF_STEPS: { key: DebriefStepKey; label: string }[] = [
  { key: "billing", label: "Labor Hours" },
  { key: "updates", label: "Project Updates" },
  { key: "new", label: "New Projects" },
  { key: "items", label: "Items Used" },
  { key: "office", label: "Office Tasks" },
];

function PreviewBadge({
  previewState,
  step,
  onStep,
  onExit,
}: {
  previewState: RouteState;
  step: DebriefStepKey;
  onStep: (s: DebriefStepKey) => void;
  onExit: () => void;
}) {
  return (
    <div
      style={{
        margin: "10px 12px 0",
        padding: "8px 12px",
        border: `1px solid ${DIM_GREEN}`,
        background: "#0f1a0a",
        borderRadius: 6,
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 8,
      }}
    >
      <button
        onClick={onExit}
        style={{
          background: "transparent",
          border: "none",
          color: DIM_GREEN,
          fontFamily: "inherit",
          fontSize: 11,
          letterSpacing: 1,
          cursor: "pointer",
          padding: 0,
        }}
      >
        PREVIEW — READ ONLY · {previewState.toUpperCase()} · TAP TO EXIT
      </button>
      {previewState === "debrief" && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginLeft: "auto" }}>
          {DEBRIEF_STEPS.map((s) => {
            const on = s.key === step;
            return (
              <button
                key={s.key}
                onClick={() => onStep(s.key)}
                style={{
                  border: `1px solid ${on ? LIME : DIM_GREEN}`,
                  background: on ? LIME : "transparent",
                  color: on ? BG : DIM_GREEN,
                  borderRadius: 4,
                  padding: "3px 8px",
                  fontFamily: "inherit",
                  fontSize: 10,
                  letterSpacing: 1,
                  cursor: "pointer",
                }}
              >
                {s.label.toUpperCase()}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}



/* ============================================================ */
function TopBar({ user, state, delegated }: { user: string | null; state?: RouteState; delegated?: boolean }) {
  return (
    <div style={TOPBAR}>
      <div style={{ color: LIME, fontWeight: "bold", letterSpacing: 2, fontSize: 14 }}>FIELD</div>
      <div style={{ color: MUTED, fontSize: 11, letterSpacing: 1 }}>
        {state ? `STATE · ${state.toUpperCase()}` : "STATE · —"}
      </div>
      {delegated && <span style={PILL_LIME}>DELEGATED</span>}
      <div style={{ marginLeft: "auto", color: MUTED, fontSize: 11 }}>{user?.toUpperCase()}</div>
    </div>
  );
}

/* ============================================================ */
function FieldBody({
  data,
  now,
  send,
  busy,
  role,
  setBanner,
  previewState,
  previewStep,
  isPreview,
}: {
  data: GetFieldResponse;
  now: number;
  send: (b: unknown, o?: { silent?: boolean }) => Promise<{ ok: boolean; raw: unknown }>;
  busy: boolean;
  role: ReturnType<typeof useViewAs>["effectiveRole"];
  setBanner: (b: { kind: "info" | "err"; text: string } | null) => void;
  previewState: RouteState | null;
  previewStep: DebriefStepKey;
  isPreview: boolean;
}) {
  const route = data.route ?? {};
  const liveState: RouteState = route.state ?? "enroute";
  const state: RouteState = previewState ?? liveState;
  const events = data.events ?? [];
  const employees = data.employees ?? [];
  const clients = data.clients ?? [];
  const roster = route.roster ?? [];
  const stopIndex = route.stopIndex ?? 0;
  const currentEvent = events[stopIndex] ?? events[0];
  const clientMatch = currentEvent ? matchClient(currentEvent.title, clients) : null;

  const isLead = canSee(role, "route_debrief");
  const canDebrief = canSee(role, "route_debrief") || route.delegated === true;

  /* --- roster picker gate (skipped in preview so all states are reachable) --- */
  if (roster.length === 0 && !isPreview) {
    return <RosterPicker employees={employees} onSet={(people) => send({ action: "setRoster", people })} busy={busy} />;
  }

  const routeComplete = !isPreview && stopIndex >= events.length;


  return (
    <div>
      {/* ROUTE COMPLETE handled separately */}
      {routeComplete ? (
        <RouteComplete
          events={events}
          roster={roster}
          isLead={isLead}
          onApprove={async () => {
            const r = await send({ action: "qbApprove" });
            if (r.ok) setBanner({ kind: "info", text: "Approved through today ✓" });
          }}
          busy={busy}
        />
      ) : (
        <>
          {currentEvent && (
            <ClientHeader event={currentEvent} clientMatch={clientMatch} state={state} />
          )}

          {state === "enroute" && (
            <StateEnRoute
              event={currentEvent}
              clientMatch={clientMatch}
              isLead={isLead}
              projects={data.projects ?? []}
              busy={busy}
              onHere={() => {
                if (!currentEvent || !clientMatch) return;
                void send({
                  action: "setRoute",
                  state: "arrived",
                  client: clientMatch,
                  eventId: currentEvent.id,
                  stopIndex,
                });
              }}
            />
          )}

          {state === "arrived" && (
            <StateArrived
              roster={roster}
              clientMatch={clientMatch}
              isLead={isLead}
              delegated={!!route.delegated}
              busy={busy}
              onClockIn={(m) => {
                if (!clientMatch) return;
                void send({ action: "qbClock", userId: m.id, dir: "in", client: clientMatch });
              }}
              onDelegate={(v) => void send({ action: "setRoute", delegated: v })}
              onStart={() => void send({ action: "setRoute", state: "visit" })}
              onNoShow={() => void confirmNoShow(send, setBanner)}
            />
          )}

          {state === "visit" && (
            <StateVisit
              event={currentEvent}
              clientMatch={clientMatch}
              arrivedAt={route.arrivedAt}
              now={now}
              roster={roster}
              isLead={isLead}
              projects={data.projects ?? []}
              tools={data.tools ?? []}
              busy={busy}
              isPreview={isPreview}
              onClockOut={(m) => {
                if (!clientMatch) return;
                void send({ action: "qbClock", userId: m.id, dir: "out", client: clientMatch });
              }}
              onToggleTool={(t) => void send({ action: "setLoaded", materialId: t.materialId, row: t.row, loaded: !t.loaded }, { silent: true })}
              onNoShow={() => void confirmNoShow(send, setBanner)}
            />
          )}


          {state === "debrief" && (
            <>
              {canDebrief || isPreview ? (
                <StateDebrief
                  clientMatch={clientMatch}
                  event={currentEvent}
                  roster={roster}
                  projects={data.projects ?? []}
                  tools={data.tools ?? []}
                  busy={busy || isPreview}
                  previewStep={isPreview ? previewStep : null}
                  employees={data.employees ?? []}
                  onFinish={async (payload) => {
                    if (isPreview) return;
                    const r = await send({
                      action: "saveDebrief",
                      client: clientMatch,
                      eventId: currentEvent?.id,
                      ...payload,
                    });
                    if (r.ok) {
                      const report = (r.raw as { report?: Record<string, string> })?.report;
                      if (report) {
                        const failed = Object.entries(report).filter(([, v]) =>
                          String(v).toLowerCase().includes("failed"),
                        );
                        if (failed.length) {
                          setBanner({
                            kind: "err",
                            text: `Debrief saved with issues: ${failed.map(([k]) => k).join(", ")}`,
                          });
                        }
                      }
                      await send({ action: "setRoute", state: "next" });
                    }
                  }}
                />
              ) : (
                <div style={PANEL_BOX}>
                  <div style={{ color: LIME, fontSize: 14, letterSpacing: 1 }}>DEBRIEF IN PROGRESS</div>
                  <div style={{ color: MUTED, marginTop: 8, fontSize: 13 }}>
                    Your lead has the debrief.
                  </div>
                  <RosterClockStatus roster={roster} />
                </div>
              )}
            </>
          )}


          {state === "next" && currentEvent && (
            <StateEnRoute
              event={currentEvent}
              clientMatch={clientMatch}
              isLead={isLead}
              projects={data.projects ?? []}
              busy={busy}
              onHere={() => {
                if (!currentEvent || !clientMatch) return;
                void send({
                  action: "setRoute",
                  state: "arrived",
                  client: clientMatch,
                  eventId: currentEvent.id,
                  stopIndex,
                });
              }}
              headerNote="NEXT STOP"
            />
          )}

          {state === "next" && (
            <RouteSoFar events={events} stopIndex={stopIndex} />
          )}
        </>
      )}
    </div>
  );
}

async function confirmNoShow(
  send: (b: unknown) => Promise<{ ok: boolean; raw: unknown }>,
  setBanner: (b: { kind: "info" | "err"; text: string } | null) => void,
) {
  if (!window.confirm("Mark this stop a no-show? Everyone clocks out and the schedule pulls earlier.")) return;
  const r = await send({ action: "noShow" });
  if (r.ok) {
    const pulled = (r.raw as { pulledEarlierMin?: number })?.pulledEarlierMin;
    if (typeof pulled === "number") setBanner({ kind: "info", text: `Schedule pulled ${pulled} min earlier.` });
  }
}

/* ============================================================ */
function RosterPicker({
  employees,
  onSet,
  busy,
}: {
  employees: Employee[];
  onSet: (people: Employee[]) => void;
  busy: boolean;
}) {
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const toggle = (id: string) => setSel((p) => ({ ...p, [id]: !p[id] }));
  const chosen = employees.filter((e) => sel[e.id]);
  return (
    <div style={{ padding: "20px 14px" }}>
      <div style={{ color: LIME, fontSize: 20, fontWeight: "bold", letterSpacing: 2, textAlign: "center" }}>
        WHO'S ON TODAY?
      </div>
      <div style={{ color: MUTED, textAlign: "center", marginTop: 6, fontSize: 12 }}>
        Tap every crew member working today.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10, marginTop: 16 }}>
        {employees.map((e) => {
          const on = !!sel[e.id];
          return (
            <button
              key={e.id}
              onClick={() => toggle(e.id)}
              style={{
                ...BIG_BTN,
                background: on ? LIME : "transparent",
                color: on ? BG : LIME,
                borderColor: on ? LIME : LIME_DIM,
              }}
            >
              {on ? "✓ " : ""}{e.name.toUpperCase()}
            </button>
          );
        })}
        {employees.length === 0 && <div style={STATE}>No employees returned by backend.</div>}
      </div>
      <button
        disabled={busy || chosen.length === 0}
        onClick={() => onSet(chosen.map((e) => ({ id: e.id, name: e.name })))}
        style={{
          ...PRIMARY_BTN,
          marginTop: 20,
          opacity: chosen.length === 0 ? 0.45 : 1,
        }}
      >
        SET ROSTER ({chosen.length})
      </button>
    </div>
  );
}

/* ============================================================ */
function ClientHeader({
  event,
  clientMatch,
  state,
}: {
  event: EventItem;
  clientMatch: string | null;
  state: RouteState;
}) {
  return (
    <div style={{ padding: "14px 14px 0" }}>
      <div style={{ color: MUTED, fontSize: 11, letterSpacing: 1 }}>{state.toUpperCase()}</div>
      <div style={{ color: LIME, fontSize: 22, fontWeight: "bold", marginTop: 2 }}>
        {clientMatch ?? event.title}
      </div>
      <div style={{ color: MUTED, fontSize: 12, marginTop: 2 }}>
        {fmtTime(event.start)}{event.end ? ` – ${fmtTime(event.end)}` : ""}
      </div>
      {!clientMatch && (
        <div style={{ color: RED, fontSize: 12, marginTop: 6 }}>
          no client match — tell Brandon
        </div>
      )}
    </div>
  );
}

/* ============================================================ */
function StateEnRoute({
  event,
  clientMatch,
  isLead,
  projects,
  busy,
  onHere,
  headerNote,
}: {
  event?: EventItem;
  clientMatch: string | null;
  isLead: boolean;
  projects: ProjectRow[];
  busy: boolean;
  onHere: () => void;
  headerNote?: string;
}) {
  if (!event) return <div style={STATE}>No upcoming stop.</div>;
  const address = event.location ?? "";
  const mapsUrl = address
    ? "https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=" + encodeURIComponent(address)
    : "";
  const fallbackHref =
    "https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=" +
    encodeURIComponent(address);

  const clientProjects = clientMatch
    ? projects.filter(
        (p) =>
          s(p["Client Name"]).toLowerCase() === clientMatch.toLowerCase() &&
          s(p["Status"]).toUpperCase() !== "SKIP",
      )
    : [];

  return (
    <div style={{ padding: "10px 14px" }}>
      {headerNote && (
        <div style={{ color: LIME, fontSize: 12, letterSpacing: 2, marginBottom: 6 }}>{headerNote}</div>
      )}
      <div style={PANEL_BOX}>
        <div style={{ color: MUTED, fontSize: 11, letterSpacing: 1 }}>ADDRESS</div>
        <div style={{ color: TEXT, fontSize: 18, marginTop: 6, lineHeight: 1.4, wordBreak: "break-word" }}>
          {address || <span style={{ color: MUTED }}>No address set</span>}
        </div>
      </div>

      <button
        disabled={!address}
        onClick={() => {
          if (mapsUrl) window.open(mapsUrl, "_blank", "noopener,noreferrer");
        }}
        style={{
          ...PRIMARY_BTN,
          marginTop: 12,
          width: "100%",
          opacity: address ? 1 : 0.45,
          background: address ? LIME : "transparent",
          color: address ? "#000" : DIM_GREEN,
          borderColor: address ? LIME : LIME_DIM,
        }}
      >
        NAVIGATE
      </button>
      {address && (
        <button
          onClick={() => window.open(fallbackHref, "_blank", "noopener,noreferrer")}
          style={{
            display: "block",
            textAlign: "center",
            color: DIM_GREEN,
            textDecoration: "underline",
            marginTop: 8,
            fontSize: 12,
            background: "transparent",
            border: "none",
            width: "100%",
            fontFamily: "inherit",
            cursor: "pointer",
          }}
        >
          open in google maps
        </button>
      )}



      {isLead && (
        <div style={{ marginTop: 16 }}>
          <button
            disabled={busy || !clientMatch}
            onClick={onHere}
            style={{ ...PRIMARY_BTN, marginTop: 14, opacity: !clientMatch ? 0.45 : 1 }}
          >
            START VISIT
          </button>
        </div>
      )}
    </div>
  );
}

function ProjectCard({ p }: { p: ProjectRow }) {
  const action = s(p["Project Action"]) || s(p["Action"]) || "—";
  const type = s(p["Type"]);
  const notes = s(p["Notes"]);
  return (
    <div style={{ ...PANEL_BOX, marginTop: 8 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <div style={{ color: TEXT, fontSize: 14, flex: 1 }}>{action}</div>
        {type && <span style={PILL_DIM}>{type.toUpperCase()}</span>}
      </div>
      {notes && <div style={{ color: DIM_GREEN, fontSize: 12, marginTop: 6, lineHeight: 1.4 }}>{notes}</div>}
    </div>
  );
}

/* ============================================================ */
function StateArrived({
  roster,
  clientMatch,
  isLead,
  delegated,
  busy,
  onClockIn,
  onDelegate,
  onStart,
  onNoShow,
}: {
  roster: RosterMember[];
  clientMatch: string | null;
  isLead: boolean;
  delegated: boolean;
  busy: boolean;
  onClockIn: (m: RosterMember) => void;
  onDelegate: (v: boolean) => void;
  onStart: () => void;
  onNoShow: () => void;
}) {
  const anyIn = roster.some((m) => !!m.in);
  return (
    <div style={{ padding: "10px 14px" }}>
      <div style={SECTION_HEAD}>CLOCK IN — TAP YOUR NAME</div>
      {!clientMatch && <div style={{ color: RED, fontSize: 12, marginBottom: 8 }}>no client match — tell Brandon</div>}
      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
        {roster.map((m) => {
          const on = !!m.in;
          return (
            <button
              key={m.id}
              onClick={() => !on && onClockIn(m)}
              disabled={on || busy || !clientMatch}
              style={{
                ...BIG_BTN,
                background: on ? LIME : "transparent",
                color: on ? BG : LIME,
                borderColor: on ? LIME : LIME_DIM,
                opacity: !clientMatch ? 0.45 : 1,
              }}
            >
              {on ? "✓ " : ""}{m.name.toUpperCase()}
            </button>
          );
        })}
      </div>

      {isLead && (
        <>
          <div style={{ ...SECTION_HEAD, marginTop: 18 }}>DEBRIEF</div>
          <button
            onClick={() => onDelegate(!delegated)}
            style={{
              ...BIG_BTN,
              background: delegated ? LIME : "transparent",
              color: delegated ? BG : LIME,
              borderColor: delegated ? LIME : LIME_DIM,
            }}
          >
            {delegated ? "✓ DELEGATED (TAP TO REVOKE)" : "DELEGATE DEBRIEF (THIS VISIT)"}
          </button>

          <button
            onClick={onStart}
            disabled={!anyIn || busy}
            style={{ ...PRIMARY_BTN, marginTop: 14, opacity: !anyIn ? 0.45 : 1 }}
          >
            START VISIT
          </button>
        </>
      )}

      {isLead && (
        <button onClick={onNoShow} style={{ ...DANGER_BTN, marginTop: 14 }} disabled={busy}>
          NO SHOW
        </button>
      )}
    </div>
  );
}

/* ============================================================ */
function StateVisit({
  event,
  clientMatch,
  arrivedAt,
  now,
  roster,
  isLead,
  projects,
  tools,
  busy,
  isPreview,
  onClockOut,
  onToggleTool,
  onNoShow,
}: {
  event?: EventItem;
  clientMatch: string | null;
  arrivedAt?: string | null;
  now: number;
  roster: RosterMember[];
  isLead: boolean;
  projects: ProjectRow[];
  tools: ToolRowRaw[];
  busy: boolean;
  isPreview: boolean;
  onClockOut: (m: RosterMember) => void;
  onToggleTool: (t: NormTool) => void;
  onNoShow: () => void;
}) {

  const clientProjects = clientMatch
    ? projects.filter((p) => s(p["Client Name"]).toLowerCase() === clientMatch.toLowerCase())
    : [];
  const projectIds = new Set(clientProjects.map((p) => s(p["Project ID"])).filter(Boolean));
  const normTools = useMemo<NormTool[]>(
    () =>
      (tools ?? [])
        .map((t) => ({
          row: Number(t.row ?? 0),
          materialId: s(t["Material ID"]),
          project: s(t["Project ID"]),
          item: s(t["Item Name"]),
          qty: s(t["Quantity"]),
          size: s(t["Size"]),
          notes: s(t["Notes"]),
          loaded: t["Loaded Status"] === true,
        }))
        .filter((t) => t.item && (projectIds.size === 0 || projectIds.has(t.project))),
    [tools, projectIds],
  );

  const [showOut, setShowOut] = useState(false);

  return (
    <div style={{ padding: "10px 14px" }}>
      <div style={PANEL_BOX}>
        <div style={{ display: "flex", alignItems: "baseline" }}>
          <div style={{ color: LIME, fontSize: 18, fontWeight: "bold" }}>{clientMatch ?? event?.title}</div>
          <div style={{ marginLeft: "auto", color: MUTED, fontSize: 12 }}>
            {arrivedAt ? `${elapsed(arrivedAt, now)} onsite` : "onsite"}
          </div>
        </div>
      </div>
      <VisitCamera clientName={clientMatch ?? s(event?.title)} disabled={isPreview} />

      <div style={{ ...SECTION_HEAD, marginTop: 16 }}>PROJECTS</div>

      {clientProjects.length === 0 ? (
        <div style={{ color: MUTED, fontSize: 12, padding: "8px 4px" }}>No projects listed.</div>
      ) : (
        clientProjects.map((p, i) => <ProjectCard key={i} p={p} />)
      )}

      <div style={{ ...SECTION_HEAD, marginTop: 16 }}>T&amp;M CHECKLIST</div>
      {normTools.length === 0 ? (
        <div style={{ color: MUTED, fontSize: 12, padding: "8px 4px" }}>No tools for this client's projects.</div>
      ) : (
        <div
          style={{
            background: PANEL,
            border: `1px solid ${LINE}`,
            borderRadius: 10,
            overflow: "hidden",
          }}
        >
          {normTools.map((t, i) => {
            const noId = !t.materialId;
            const meta = [t.qty, t.size].filter(Boolean).join(" · ");
            return (
              <div
                key={`${t.row}-${i}`}
                onClick={() => !noId && !busy && onToggleTool(t)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  minHeight: 56,
                  padding: "12px 14px",
                  borderBottom: i === normTools.length - 1 ? "none" : `1px solid ${LINE}`,
                  cursor: noId ? "default" : "pointer",
                  opacity: noId ? 0.6 : 1,
                  userSelect: "none",
                }}
              >
                <div
                  style={{
                    flex: "0 0 32px",
                    height: 32,
                    border: `2px solid ${t.loaded ? LIME : LIME_DIM}`,
                    background: t.loaded ? LIME : "transparent",
                    borderRadius: 6,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: BG,
                    fontSize: 22,
                  }}
                >
                  {t.loaded ? "✓" : ""}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 15,
                      color: t.loaded ? MUTED : TEXT,
                      textDecoration: t.loaded ? "line-through" : "none",
                    }}
                  >
                    {t.item}
                  </div>
                  {meta && <div style={{ fontSize: 12, color: MUTED, marginTop: 3 }}>{meta}</div>}
                  {t.notes && (
                    <div style={{ fontSize: 12, color: "rgba(124,255,0,.55)", marginTop: 3 }}>{t.notes}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {isLead && (
        <button onClick={onNoShow} style={{ ...DANGER_BTN, marginTop: 14 }} disabled={busy}>
          NO SHOW
        </button>
      )}

      {isLead && !showOut && (
        <button onClick={() => setShowOut(true)} style={{ ...PRIMARY_BTN, marginTop: 14 }}>
          GARDEN VISIT COMPLETE
        </button>
      )}

      {showOut && (
        <>
          <div style={{ ...SECTION_HEAD, marginTop: 16 }}>CLOCK OUT — TAP YOUR NAME</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
            {roster.map((m) => {
              const out = !!m.out;
              const inOnly = !!m.in && !m.out;
              return (
                <button
                  key={m.id}
                  onClick={() => inOnly && onClockOut(m)}
                  disabled={out || !inOnly || busy}
                  style={{
                    ...BIG_BTN,
                    background: out ? LIME : "transparent",
                    color: out ? BG : LIME,
                    borderColor: out ? LIME : LIME_DIM,
                    opacity: !inOnly && !out ? 0.4 : 1,
                  }}
                >
                  {out ? "✓ " : ""}{m.name.toUpperCase()}
                </button>
              );
            })}
          </div>
          <div style={{ color: MUTED, fontSize: 11, textAlign: "center", marginTop: 10 }}>
            Debrief opens automatically once everyone is out.
          </div>
        </>
      )}
    </div>
  );
}

type NormTool = {
  row: number;
  materialId: string;
  project: string;
  item: string;
  qty: string;
  size: string;
  notes: string;
  loaded: boolean;
};


/* ============================================================ */
type VisitPhoto = {
  id: string;
  thumb: string;
  status: "uploading" | "ok" | "error";
  retry?: () => void;
};

async function downscaleToJpegBase64(file: File, maxEdge = 2048, quality = 0.85): Promise<{ base64: string; dataUrl: string }> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error("image load failed"));
    im.src = dataUrl;
  });
  const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  ctx.drawImage(img, 0, 0, w, h);
  const out = canvas.toDataURL("image/jpeg", quality);
  const base64 = out.split(",")[1] ?? "";
  return { base64, dataUrl: out };
}

function VisitCamera({ clientName, disabled }: { clientName: string; disabled: boolean }) {
  const [photos, setPhotos] = useState<VisitPhoto[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const upload = useCallback(
    async (id: string, base64: string, client: string) => {
      try {
        const res = await fetch(SCRIPT_URL, {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: JSON.stringify({ action: "visitPhoto", data: base64, mime: "image/jpeg", client }),
        });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean };
        if (json.ok) {
          setPhotos((prev) => prev.map((p) => (p.id === id ? { ...p, status: "ok" } : p)));
        } else {
          throw new Error("upload failed");
        }
      } catch {
        setPhotos((prev) =>
          prev.map((p) =>
            p.id === id
              ? { ...p, status: "error", retry: () => void upload(id, base64, client) }
              : p,
          ),
        );
      }
    },
    [],
  );

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || disabled) return;
      const client = clientName;
      for (const file of Array.from(files)) {
        try {
          const { base64, dataUrl } = await downscaleToJpegBase64(file);
          const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          setPhotos((prev) => [...prev, { id, thumb: dataUrl, status: "uploading" }]);
          void upload(id, base64, client);
        } catch {
          // skip unreadable file
        }
      }
    },
    [clientName, disabled, upload],
  );

  return (
    <div style={{ marginTop: 12 }}>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        style={{
          ...PRIMARY_BTN,
          opacity: disabled ? 0.4 : 1,
          cursor: disabled ? "not-allowed" : "pointer",
        }}
      >
        📷 CAMERA
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        style={{ display: "none" }}
        onChange={(e) => {
          void handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
      {photos.length > 0 && (
        <div style={{ display: "flex", gap: 8, marginTop: 10, overflowX: "auto", paddingBottom: 4 }}>
          {photos.map((p) => (
            <div
              key={p.id}
              onClick={() => p.status === "error" && p.retry?.()}
              style={{
                position: "relative",
                flex: "0 0 auto",
                width: 72,
                height: 72,
                borderRadius: 8,
                overflow: "hidden",
                border: `1px solid ${p.status === "error" ? "#ff4d4d" : LIME_DIM}`,
                cursor: p.status === "error" ? "pointer" : "default",
              }}
            >
              <img src={p.thumb} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background:
                    p.status === "uploading"
                      ? "rgba(0,0,0,.45)"
                      : p.status === "ok"
                        ? "rgba(0,0,0,.25)"
                        : "rgba(120,0,0,.45)",
                  color: p.status === "ok" ? LIME : "#fff",
                  fontSize: p.status === "uploading" ? 12 : 22,
                  fontWeight: "bold",
                }}
              >
                {p.status === "uploading" ? "…" : p.status === "ok" ? "✓" : "↻"}
              </div>
              {p.status === "error" && (
                <div
                  style={{
                    position: "absolute",
                    bottom: 0,
                    left: 0,
                    right: 0,
                    background: "#ff4d4d",
                    color: "#000",
                    fontSize: 10,
                    textAlign: "center",
                    padding: "1px 0",
                    fontWeight: "bold",
                  }}
                >
                  RETRY
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============================================================ */

function RosterClockStatus({ roster }: { roster: RosterMember[] }) {
  return (
    <div style={{ marginTop: 10 }}>
      {roster.map((m) => (
        <div key={m.id} style={{ display: "flex", padding: "4px 0", fontSize: 12 }}>
          <span style={{ color: TEXT }}>{m.name}</span>
          <span style={{ marginLeft: "auto", color: m.out ? LIME : m.in ? DIM_GREEN : MUTED }}>
            {m.out ? "out" : m.in ? "in" : "—"}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ============================================================ */
type DebriefBilling = { name: string; hours: number };
type DebriefUpdate = { projectId: string; status?: string; notes?: string };
type NewProjectItem = { name: string; qty?: string; size?: string; notes?: string };
type NewProject = { action: string; type?: string; notes?: string; items?: NewProjectItem[] };
type ItemUsed = { name: string; qty?: string };

function StateDebrief({
  clientMatch,
  event,
  roster,
  projects,
  tools,
  busy,
  onFinish,
  previewStep,
  employees = [],
}: {
  clientMatch: string | null;
  event?: EventItem;
  roster: RosterMember[];
  projects: ProjectRow[];
  tools: ToolRowRaw[];
  busy: boolean;
  onFinish: (payload: {
    billing: DebriefBilling[];
    updates: DebriefUpdate[];
    newProjects: NewProject[];
    itemsUsed: ItemUsed[];
    officeTasks: string[];
  }) => Promise<void>;
  previewStep?: DebriefStepKey | null;
  employees?: Employee[];
}) {
  const clocked = roster.filter((m) => m.in);
  const nowIso = useMemo(() => new Date().toISOString(), []);
  const [billing, setBilling] = useState<DebriefBilling[]>(
    () => clocked.map((m) => ({ name: m.name, hours: hoursBetween(m.in, m.out ?? nowIso) })),
  );
  const [showAddPerson, setShowAddPerson] = useState(false);

  const specialProjects = useMemo(
    () =>
      clientMatch
        ? projects.filter(
            (p) =>
              s(p["Client Name"]).toLowerCase() === clientMatch.toLowerCase() &&
              s(p["Type"]).toUpperCase() === "SPECIAL",
          )
        : [],
    [projects, clientMatch],
  );

  const [updates, setUpdates] = useState<DebriefUpdate[]>([]);
  const setSpecial = (projectId: string, status: string, notes?: string) => {
    setUpdates((cur) => {
      const rest = cur.filter((u) => u.projectId !== projectId);
      if (status === "SKIP") return rest;
      return [...rest, { projectId, status, notes }];
    });
  };

  const [itemsUsed, setItemsUsed] = useState<ItemUsed[]>([]);


  const [newProjects, setNewProjects] = useState<NewProject[]>([]);
  const [clientUpdates, setClientUpdates] = useState<string[]>([]);
  const [officeTasks, setOfficeTasks] = useState<string[]>([]);

  const total = billing.reduce((a, b) => a + b.hours, 0);

  const handleFinish = async () => {
    const office = [
      ...clientUpdates.filter(Boolean).map((t) => `Client update: ${t}`),
      ...officeTasks.filter(Boolean),
    ];
    await onFinish({
      billing,
      updates,
      newProjects,
      itemsUsed,
      officeTasks: office,
    });
  };

  const showStep = (k: DebriefStepKey) => !previewStep || previewStep === k;

  return (
    <div style={{ padding: "10px 14px" }}>
      <div style={{ color: LIME, fontSize: 20, fontWeight: "bold", letterSpacing: 2 }}>DEBRIEF</div>
      <div style={{ color: MUTED, fontSize: 12, marginTop: 4 }}>
        {clientMatch ?? event?.title}
      </div>

      {/* 1. LABOR HOURS */}
      {showStep("billing") && (
      <Step n={1} title="LABOR HOURS">
        <div style={{ display: "grid", gap: 10 }}>
          {billing.map((b, i) => {
            const dec = () =>
              setBilling((cur) =>
                cur.map((r, j) => (j === i ? { ...r, hours: Math.max(0, +(r.hours - 0.25).toFixed(2)) } : r)),
              );
            const inc = () =>
              setBilling((cur) =>
                cur.map((r, j) => (j === i ? { ...r, hours: Math.min(16, +(r.hours + 0.25).toFixed(2)) } : r)),
              );
            return (
              <div key={`${b.name}-${i}`} style={{ ...PANEL_BOX, textAlign: "center" }}>
                <div style={{ color: TEXT, fontSize: 14, letterSpacing: 1, marginBottom: 10 }}>
                  {b.name.toUpperCase()}
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16 }}>
                  <button
                    onClick={dec}
                    aria-label="Decrease hours"
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: 8,
                      border: `1px solid ${LIME_DIM}`,
                      background: "transparent",
                      color: LIME,
                      fontSize: 28,
                      fontWeight: "bold",
                      cursor: "pointer",
                    }}
                  >
                    −
                  </button>
                  <div style={{ minWidth: 120, color: LIME, fontSize: 40, fontWeight: "bold", fontVariantNumeric: "tabular-nums" }}>
                    {b.hours.toFixed(2)}
                  </div>
                  <button
                    onClick={inc}
                    aria-label="Increase hours"
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: 8,
                      border: `1px solid ${LIME_DIM}`,
                      background: "transparent",
                      color: LIME,
                      fontSize: 28,
                      fontWeight: "bold",
                      cursor: "pointer",
                    }}
                  >
                    +
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <button
          onClick={() => setShowAddPerson(true)}
          style={{
            ...PRIMARY_BTN,
            marginTop: 12,
            background: "transparent",
            color: LIME,
            border: `1px dashed ${LIME_DIM}`,
          }}
        >
          + ADD PERSON
        </button>

        {showAddPerson && (
          <div style={{ ...PANEL_BOX, marginTop: 10 }}>
            <div style={{ color: MUTED, fontSize: 12, marginBottom: 8 }}>PICK A PERSON</div>
            <div style={{ display: "grid", gap: 6 }}>
              {(employees ?? [])
                .filter((e) => !billing.some((b) => b.name.toLowerCase() === e.name.toLowerCase()))
                .map((e) => (
                  <button
                    key={e.id}
                    onClick={() => {
                      setBilling((cur) => [...cur, { name: e.name, hours: 0 }]);
                      setShowAddPerson(false);
                    }}
                    style={{
                      ...SMALL_BTN,
                      textAlign: "left",
                      padding: "10px 12px",
                      background: "transparent",
                      color: TEXT,
                      border: `1px solid ${LIME_DIM}`,
                    }}
                  >
                    {e.name}
                  </button>
                ))}
              {(employees ?? []).filter((e) => !billing.some((b) => b.name.toLowerCase() === e.name.toLowerCase())).length === 0 && (
                <div style={{ color: MUTED, fontSize: 12 }}>Everyone is already listed.</div>
              )}
            </div>
            <button
              onClick={() => setShowAddPerson(false)}
              style={{ ...SMALL_BTN, marginTop: 8, background: "transparent", color: MUTED }}
            >
              Cancel
            </button>
          </div>
        )}

        <div style={{ ...ROW_LINE, borderTop: `1px solid ${LINE}`, marginTop: 12 }}>
          <div style={{ flex: 1, color: MUTED, fontSize: 12 }}>TOTAL</div>
          <div style={{ color: LIME, fontWeight: "bold" }}>{total.toFixed(2)}</div>
        </div>
        <div style={{ color: MUTED, fontSize: 11, marginTop: 6 }}>
          Labor hours only — payroll stays in QB Time.
        </div>
      </Step>
      )}

      {/* 2. SPECIAL / UPDATES */}
      {showStep("updates") && (
      <Step n={2} title="SPECIAL PROJECTS">
        {specialProjects.length === 0 && (
          <div style={{ color: MUTED, fontSize: 12 }}>No special projects.</div>
        )}
        {specialProjects.map((p) => {
          const id = s(p["Project ID"]);
          const cur = updates.find((u) => u.projectId === id);
          const action = s(p["Project Action"]) || s(p["Action"]);
          const notes = s(p["Notes"]);
          return (
            <div key={id} style={{ ...PANEL_BOX, marginTop: 8 }}>
              <div style={{ color: TEXT, fontSize: 14 }}>{action || id}</div>
              {notes && <div style={{ color: DIM_GREEN, fontSize: 12, marginTop: 4 }}>{notes}</div>}
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                {(["DONE", "NOT_DONE", "SKIP"] as const).map((k) => {
                  const label = k === "DONE" ? "Done" : k === "NOT_DONE" ? "Not done" : "Skip";
                  const active =
                    (k === "DONE" && cur?.status === "DONE") ||
                    (k === "NOT_DONE" && cur?.status === "") ||
                    (k === "SKIP" && !cur);
                  return (
                    <button
                      key={k}
                      onClick={() =>
                        setSpecial(id, k === "DONE" ? "DONE" : k === "NOT_DONE" ? "" : "SKIP")
                      }
                      style={{
                        ...SMALL_BTN,
                        flex: 1,
                        background: active ? LIME : "transparent",
                        color: active ? BG : LIME,
                        borderColor: active ? LIME : LIME_DIM,
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              {cur?.status === "" && (
                <input
                  placeholder="Why not?"
                  value={cur.notes ?? ""}
                  onChange={(e) => setSpecial(id, "", e.target.value)}
                  style={INPUT}
                />
              )}
            </div>
          );
        })}
      </Step>
      )}

      {/* 3. ITEMS USED */}
      {showStep("items") && (
      <Step n={3} title="ITEMS USED">
        <ItemsUsedPicker
          items={itemsUsed}
          onChange={setItemsUsed}
          disabled={busy}
        />
      </Step>
      )}


      {/* 4. NEW PROJECTS */}
      {showStep("new") && (
      <Step n={4} title="NEW PROJECTS FOR NEXT TIME">
        {newProjects.map((p, idx) => (
          <NewProjectForm
            key={idx}
            value={p}
            onChange={(v) => setNewProjects((cur) => cur.map((x, i) => (i === idx ? v : x)))}
            onRemove={() => setNewProjects((cur) => cur.filter((_, i) => i !== idx))}
          />
        ))}
        <button
          onClick={() => setNewProjects((cur) => [...cur, { action: "", type: "RECURRING" }])}
          style={{ ...SMALL_BTN, marginTop: 8 }}
        >
          + ADD PROJECT
        </button>
      </Step>
      )}

      {/* 5. CLIENT UPDATES */}
      {showStep("office") && (
      <Step n={5} title="UPDATES FOR THE CLIENT">
        <TextList
          items={clientUpdates}
          onChange={setClientUpdates}
          placeholder="Something to tell the client…"
        />
      </Step>
      )}

      {/* 6. OFFICE TASKS */}
      {showStep("office") && (
      <Step n={6} title="ACTION ITEMS FOR OFFICE">
        <TextList items={officeTasks} onChange={setOfficeTasks} placeholder="Follow-up for office…" />
      </Step>
      )}

      <button onClick={handleFinish} disabled={busy} style={{ ...PRIMARY_BTN, marginTop: 20 }}>
        FINISH DEBRIEF
      </button>
    </div>

  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div style={{ ...PANEL_BOX, marginTop: 14 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <div
          style={{
            width: 24,
            height: 24,
            border: `1px solid ${LIME_DIM}`,
            color: LIME,
            borderRadius: 4,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12,
          }}
        >
          {n}
        </div>
        <div style={{ color: LIME, fontSize: 13, letterSpacing: 2, fontWeight: "bold" }}>{title}</div>
      </div>
      <div style={{ marginTop: 10 }}>{children}</div>
    </div>
  );
}

function NewProjectForm({
  value,
  onChange,
  onRemove,
}: {
  value: NewProject;
  onChange: (v: NewProject) => void;
  onRemove: () => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  return (
    <div style={{ ...PANEL_BOX, marginTop: 8, background: PANEL_2 }}>
      <input
        placeholder="Project action (required)"
        value={value.action}
        onChange={(e) => onChange({ ...value, action: e.target.value })}
        style={{ ...INPUT, marginTop: 0 }}
      />
      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        {(["SPECIAL", "RECURRING"] as const).map((t) => {
          const on = value.type === t;
          return (
            <button
              key={t}
              onClick={() => onChange({ ...value, type: t })}
              style={{
                ...SMALL_BTN,
                flex: 1,
                background: on ? LIME : "transparent",
                color: on ? BG : LIME,
                borderColor: on ? LIME : LIME_DIM,
              }}
            >
              {t}
            </button>
          );
        })}
      </div>
      <textarea
        placeholder="Notes"
        value={value.notes ?? ""}
        onChange={(e) => onChange({ ...value, notes: e.target.value })}
        style={{ ...INPUT, minHeight: 60, resize: "vertical" }}
      />
      {(value.items ?? []).map((it, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            gap: 6,
            marginTop: 6,
            padding: "8px 10px",
            border: `1px solid ${LIME_DIM}`,
            borderRadius: 6,
            background: BG,
            alignItems: "flex-start",
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: LIME, fontSize: 12, fontWeight: "bold", wordBreak: "break-word" }}>
              {it.name}
            </div>
            <div style={{ color: MUTED, fontSize: 11, marginTop: 2 }}>
              {[it.qty && `Qty ${it.qty}`, it.size, it.notes].filter(Boolean).join(" · ") || "—"}
            </div>
          </div>
          <button
            style={{ ...SMALL_BTN, color: RED, borderColor: RED, minWidth: 40 }}
            onClick={() => {
              const items = (value.items ?? []).filter((_, idx) => idx !== i);
              onChange({ ...value, items });
            }}
          >
            ×
          </button>
        </div>
      ))}
      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        <button
          onClick={() => setPickerOpen(true)}
          style={{ ...SMALL_BTN, flex: 1 }}
        >
          + ADD ITEM
        </button>
        <button onClick={onRemove} style={{ ...SMALL_BTN, color: RED, borderColor: RED }}>
          REMOVE
        </button>
      </div>
      {pickerOpen && (
        <ItemPicker
          onCancel={() => setPickerOpen(false)}
          onAdd={(picked) => {
            onChange({ ...value, items: [...(value.items ?? []), picked] });
            setPickerOpen(false);
          }}
        />
      )}
    </div>
  );
}


function TextList({
  items,
  onChange,
  placeholder,
}: {
  items: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
}) {
  const [draft, setDraft] = useState("");
  return (
    <div>
      {items.map((it, i) => (
        <div key={i} style={{ ...ROW_LINE, borderBottom: `1px solid ${LINE}` }}>
          <div style={{ flex: 1, color: TEXT, fontSize: 13 }}>{it}</div>
          <button
            onClick={() => onChange(items.filter((_, j) => j !== i))}
            style={{ ...SMALL_BTN, color: RED, borderColor: RED }}
          >
            ✕
          </button>
        </div>
      ))}
      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        <input
          placeholder={placeholder}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          style={{ ...INPUT, flex: 1, marginTop: 0 }}
        />
        <button
          onClick={() => {
            if (!draft.trim()) return;
            onChange([...items, draft.trim()]);
            setDraft("");
          }}
          style={{ ...SMALL_BTN }}
        >
          ADD
        </button>
      </div>
    </div>
  );
}

/* ============================================================ */
function RouteSoFar({ events, stopIndex }: { events: EventItem[]; stopIndex: number }) {
  const done = events.slice(0, stopIndex);
  if (done.length === 0) return null;
  return (
    <div style={{ padding: "10px 14px" }}>
      <div style={SECTION_HEAD}>ROUTE SO FAR</div>
      <div style={PANEL_BOX}>
        {done.map((e) => {
          const noShow = /red|#ff/i.test(e.color ?? "");
          return (
            <div key={e.id} style={{ display: "flex", gap: 8, padding: "4px 0", fontSize: 13 }}>
              <span style={{ color: noShow ? RED : LIME }}>{noShow ? "✗" : "✓"}</span>
              <span style={{ color: TEXT }}>{e.title}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RouteComplete({
  events,
  roster,
  isLead,
  onApprove,
  busy,
}: {
  events: EventItem[];
  roster: RosterMember[];
  isLead: boolean;
  onApprove: () => void;
  busy: boolean;
}) {
  const totalHours = roster.reduce((a, m) => a + hoursBetween(m.in, m.out), 0);
  return (
    <div style={{ padding: "20px 14px" }}>
      <div style={{ color: LIME, fontSize: 22, fontWeight: "bold", letterSpacing: 2, textAlign: "center" }}>
        ROUTE COMPLETE
      </div>
      <div style={{ ...PANEL_BOX, marginTop: 14 }}>
        <div style={{ display: "flex", padding: "4px 0" }}>
          <span style={{ color: MUTED }}>Stops</span>
          <span style={{ marginLeft: "auto", color: LIME, fontWeight: "bold" }}>{events.length}</span>
        </div>
        <div style={{ display: "flex", padding: "4px 0" }}>
          <span style={{ color: MUTED }}>Billing hours today</span>
          <span style={{ marginLeft: "auto", color: LIME, fontWeight: "bold" }}>{totalHours.toFixed(2)}</span>
        </div>
      </div>
      {isLead && (
        <button onClick={onApprove} disabled={busy} style={{ ...PRIMARY_BTN, marginTop: 20 }}>
          APPROVE TODAY'S HOURS IN QB TIME
        </button>
      )}
    </div>
  );
}

/* ---------- styles ---------- */
const PAGE: React.CSSProperties = {
  background: BG,
  color: TEXT,
  fontFamily: "'Courier New', Courier, monospace",
  minHeight: "calc(100vh - 60px)",
  paddingBottom: 80,
};
const TOPBAR: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "10px 14px",
  borderBottom: `1px solid ${LINE}`,
  background: BG,
  position: "sticky",
  top: 44,
  zIndex: 5,
};
const PANEL_BOX: React.CSSProperties = {
  background: PANEL,
  border: `1px solid ${LINE}`,
  borderRadius: 10,
  padding: 12,
};
const SECTION_HEAD: React.CSSProperties = {
  color: DIM_GREEN,
  fontSize: 11,
  letterSpacing: 2,
  padding: "6px 4px",
  textTransform: "uppercase",
};
const BIG_BTN: React.CSSProperties = {
  minHeight: 56,
  border: `2px solid ${LIME_DIM}`,
  background: "transparent",
  color: LIME,
  borderRadius: 8,
  fontFamily: "inherit",
  fontSize: 16,
  fontWeight: "bold",
  letterSpacing: 2,
  cursor: "pointer",
};
const PRIMARY_BTN: React.CSSProperties = {
  ...BIG_BTN,
  width: "100%",
  background: LIME,
  color: BG,
  borderColor: LIME,
  textAlign: "center",
  textDecoration: "none",
  display: "block",
  padding: "0 12px",
  lineHeight: "56px",
};
const DANGER_BTN: React.CSSProperties = {
  ...BIG_BTN,
  width: "100%",
  color: RED,
  borderColor: RED,
  background: "transparent",
};
const SMALL_BTN: React.CSSProperties = {
  minHeight: 40,
  padding: "0 12px",
  border: `1px solid ${LIME_DIM}`,
  background: "transparent",
  color: LIME,
  borderRadius: 6,
  fontFamily: "inherit",
  fontSize: 12,
  letterSpacing: 1,
  cursor: "pointer",
};
const STEP_BTN: React.CSSProperties = {
  ...SMALL_BTN,
  width: 40,
  padding: 0,
  fontSize: 18,
};
const INPUT: React.CSSProperties = {
  width: "100%",
  marginTop: 8,
  padding: "10px 12px",
  background: PANEL_2,
  color: TEXT,
  border: `1px solid ${LINE}`,
  borderRadius: 6,
  fontFamily: "inherit",
  fontSize: 14,
  boxSizing: "border-box",
};
const CHIP: React.CSSProperties = {
  border: `1px solid ${LIME_DIM}`,
  background: "transparent",
  color: LIME,
  borderRadius: 999,
  padding: "6px 10px",
  fontFamily: "inherit",
  fontSize: 12,
  cursor: "pointer",
};
const ROW_LINE: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "8px 0",
};
const ERRBAR: React.CSSProperties = {
  margin: "10px 12px 0",
  padding: "10px 12px",
  background: "#1a0a0a",
  border: `1px solid ${RED}`,
  color: RED,
  borderRadius: 6,
  fontSize: 13,
  position: "relative",
};
const INFOBAR: React.CSSProperties = {
  margin: "10px 12px 0",
  padding: "10px 12px",
  background: "#0f1a0a",
  border: `1px solid ${LIME_DIM}`,
  color: LIME,
  borderRadius: 6,
  fontSize: 13,
  position: "relative",
};
const CLOSE_X: React.CSSProperties = {
  position: "absolute",
  right: 8,
  top: 6,
  background: "transparent",
  color: "inherit",
  border: "none",
  fontSize: 18,
  cursor: "pointer",
};
const STATE: React.CSSProperties = {
  margin: "40px 20px",
  textAlign: "center",
  color: MUTED,
  fontSize: 14,
  lineHeight: 1.6,
};
const PILL_LIME: React.CSSProperties = {
  fontSize: 10,
  letterSpacing: 1,
  color: BG,
  background: LIME,
  borderRadius: 3,
  padding: "2px 6px",
};
const PILL_DIM: React.CSSProperties = {
  fontSize: 10,
  letterSpacing: 1,
  color: DIM_GREEN,
  border: `1px solid ${DIM_GREEN}`,
  borderRadius: 3,
  padding: "1px 6px",
};
