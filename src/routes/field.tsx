import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "../lib/auth";
import { useViewAs } from "../lib/view-as";
import { canSee } from "../lib/permissions";
import { ItemPicker } from "../components/ItemPicker";
import { sessionCache } from "../lib/session-cache";
import { useOptimistic } from "../lib/optimistic";
import { RefreshDot } from "../components/RefreshDot";
import { appendTeamParam, resolveTeam } from "../lib/team";
import { PayrollConfirm } from "../components/PayrollConfirm";
import { confirmModal } from "../components/ConfirmModal";
import { hqScreenFor, useDayState } from "../lib/day-state";
import { openGoogleWallet } from "../lib/wallet";
import { ClientRefPanel } from "../components/ClientRefPanel";
import {
  breakElapsed,
  endOnsiteBreak,
  startOnsiteBreak,
  type OnsiteBreakMap,
} from "../lib/onsite-break";
import {
  addCompletedProject,
  addFollowUpProject,
  fetchClientNames,
  sectionBase,
  sectionLabel,
  siblingSections,
} from "../lib/add-project";
import {
  fetchPayrollDay,
  personOnClock,
  personSeconds,
  reconcileRoster,
  todayISODate,
  toQuarter,
  writeBillingHours,
  type PayrollDay,
} from "../lib/billing-hours";

const CK = "field:getField";

export const Route = createFileRoute("/field")({
  head: () => ({ meta: [{ title: "Bramble & Vine — Field" }] }),
  validateSearch: (raw: Record<string, unknown>): FieldSearch => {
    const states = ["enroute", "arrived", "visit", "debrief", "next", "done"] as const;
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
/* "" = at HQ, not yet departed (v7.4.8 backend default). The route only
   becomes "enroute" when the crew explicitly departs from the Load Vehicle
   screen. */
type RouteState = "" | "enroute" | "arrived" | "visit" | "debrief" | "next" | "done";
type DebriefStepKey = "billing" | "updates" | "items" | "new" | "office";
type FieldSearch = { preview?: RouteState; step?: DebriefStepKey };
type Employee = { id: string; name: string };
type RosterMember = { id: string; name: string; role?: string | null; in?: string | null; out?: string | null; tsId?: string | null; client?: string | null };
type EventItem = { id: string; title: string; start?: string; end?: string; location?: string; color?: string; description?: string };

/** Canonical vendor (getField.vendors) — recognises supply stops as their own stop type. */
type FieldVendor = {
  vendor: string;
  aliases?: string[];
  address?: string;
  taxExempt?: boolean;
  taxExemptId?: string;
};
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
  /** BB (8/2): FINISHED UNLOADING pressed — gates the clock-out leg. */
  unloaded?: boolean;
  arrivedAt?: string | null;
  locationCheck?: { near?: boolean; client?: string } | null;
};

export type VisitNoteType = "update" | "item" | "future" | "office";
export type VisitNote = {
  id: string;
  client?: string;
  type: VisitNoteType;
  text?: string;
  item?: string;
  qty?: string;
  photos?: string[];
  createdAt?: string;
};

type GetFieldResponse = {
  route?: RouteDoc;
  events?: EventItem[];
  employees?: Employee[];
  projects?: ProjectRow[];
  tools?: ToolRowRaw[];
  clients?: string[];
  /** Clients whose Client Info AF says "No" — never auto-text arrival/ETA. */
  skipTextClients?: string[];
  /** Clients whose Client Info AG says "No" — never auto-text departure. */
  skipDepartureClients?: string[];
  /** Clients whose text is routed to someone other than themselves. */
  specialTextClients?: Array<{ client: string; arrival: boolean; departure: boolean }>;
  /** Server's texted-today ledger as "client||kind" (TEXT_SENT). The real
   *  cross-device guard; the local set is only a mirror of it. */
  textSent?: string[];
  /** XX-02: the visit timer, computed server-side from the client's Max Time
   *  person-hour budget against the LIVE crew count. Null when there is no
   *  budget to count down (Flexible / TBD / blank). */
  visitTimer?: VisitTimerView | null;
  /** XX-02: before/after/project photo counts for the CURRENT visit. */
  visitPhotos?: VisitPhotoTally | null;
  /** Canonical vendors — vendor stops are their own stop type (C, 8/2). */
  vendors?: FieldVendor[];
  visitNotes?: VisitNote[];
  /** Client name -> items already on site (operational reference, all roles). */
  inventory?: Record<string, string[]>;
  /** Full inventory vocabulary for the picker. */
  knownInventory?: string[];
  /** Client name -> irrigation zone map (text mapping OR Drive image URL). */
  zoneMaps?: Record<string, string>;
  /* ONSITE BREAK (8/4): name -> {since, source, client}. Server-held so ON BREAK
     survives a reload and shows on a second phone. */
  onsiteBreaks?: OnsiteBreakMap;
  /** Client Info AB, special message shown at the top of the event body. */
  clients_info?: Array<{ client?: string; name?: string; specialMessage?: string }>;
  clientInfo?: Array<{ client?: string; name?: string; specialMessage?: string }>;
  specialMessages?: Record<string, string>;
  serverTime?: string;
};

/* ---------- assistant loading gate: reads getData for confirm+loaded ---------- */
type LoadingItem = {
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

function useLoadingSnapshot(enabled: boolean) {
  const [confirmed, setConfirmed] = useState<boolean | null>(null);
  // Raw server truth. Ticks every POLL_MS and replaces the list wholesale, so
  // it must never be the thing a checkbox reads: see `items` below.
  const [rawItems, setRawItems] = useState<LoadingItem[]>([]);
  const [ready, setReady] = useState(false);

  // A tick that lands before setLoaded is readable used to flip a just-ticked
  // box back. Toggles are held here until the payload agrees.
  const {
    records: optRecords,
    decide: optDecide,
    revert: optRevert,
    reconcile: optReconcile,
  } = useOptimistic("field:loaded");
  const loadedOverride = useMemo(() => {
    const out: Record<string, boolean> = {};
    for (const r of optRecords) if (r.kind === "loaded") out[r.id] = r.value === true;
    return out;
  }, [optRecords]);

  const items = useMemo(
    () =>
      rawItems.map((it) =>
        it.materialId && it.materialId in loadedOverride
          ? { ...it, loaded: loadedOverride[it.materialId] }
          : it,
      ),
    [rawItems, loadedOverride],
  );

  // Toggle needs the currently displayed value without depending on it.
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch(`${SCRIPT_URL}?action=getData`);
        if (!res.ok) return;
        const json = (await res.json()) as {
          tools?: Array<Record<string, unknown>>;
          projects?: Array<Record<string, unknown>>;
          clients?: unknown[];
          confirm?: { confirmed?: boolean };
        };
        if (cancelled) return;
        setConfirmed(!!json.confirm?.confirmed);
        const clientSet = new Set(
          (json.clients ?? []).map((c) => String(c ?? "").trim()).filter(Boolean),
        );
        const projectStatus: Record<string, string> = {};
        (json.projects ?? []).forEach((p) => {
          const id = String(p["Project ID"] ?? "").trim();
          if (id) projectStatus[id] = String(p["Status"] ?? "").trim();
        });
        const list: LoadingItem[] = (json.tools ?? [])
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
            (it) => it.item && clientSet.has(it.client) && projectStatus[it.project] === "Confirmed",
          );
        const byId = new Map(list.map((i) => [i.materialId, i]));
        const abandoned = optReconcile((r) => {
          const it = byId.get(r.id);
          if (!it) return true; // row gone from the checklist entirely
          return it.loaded === (r.value === true);
        });
        if (abandoned.length) {
          toast.warning(
            abandoned.length === 1
              ? "1 loading change may not have saved."
              : `${abandoned.length} loading changes may not have saved.`,
          );
        }
        setRawItems(list);
        setReady(true);
      } catch {
        /* keep last snapshot */
      }
    };
    void tick();
    const id = window.setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [enabled, optReconcile]);

  const toggle = useCallback(
    async (row: number) => {
      const it = itemsRef.current.find((x) => x.row === row);
      if (!it || !it.materialId) return;
      const next = !it.loaded;
      // The record is the optimistic flip - no separate local mutation needed,
      // and it now outlives the polls instead of being overwritten by them.
      optDecide("loaded", it.materialId, next);
      try {
        const res = await fetch(SCRIPT_URL, {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: JSON.stringify({ action: "setLoaded", materialId: it.materialId, row, loaded: next }),
        });
        // Previously only a thrown error rolled back, so an HTTP 500 read as success.
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } catch {
        optRevert("loaded", it.materialId);
        toast.error("Couldn't save that item — try again.");
      }
    },
    [optDecide, optRevert],
  );

  const allLoaded = items.length === 0 || items.every((i) => i.loaded);
  return { confirmed, items, allLoaded, ready, toggle };
}



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

/* ---------- client arrival/departure text ----------
 *
 * WHAT ACTUALLY GUARDS AGAINST DOUBLE-TEXTING A CLIENT IS THE BACKEND.
 * TEXT_SENT is a day-scoped Script Property keyed "client||kind" whose own
 * comment says it "makes textClient idempotent across every device, not just
 * one phone". This set is only the UI's picture of that, so the buttons can
 * show what has already gone out.
 *
 * It used to live in sessionStorage, which meant the picture died with the tab
 * and a second device started blank — looking as though nothing had been sent.
 * Now: localStorage so it survives a tab close, and seeded from the server's
 * ledger (getField.textSent) so a second device shows the truth.
 *
 * NOTE ON GRANULARITY. The local key includes stopIndex; the server's does not.
 * Seeding therefore marks every stop for that client+kind, which is what the
 * BACKEND will actually do — a second stop for the same client on the same day
 * would have its text refused. Matching the server's granularity makes the UI
 * honest rather than promising a send that will not happen.
 */
const TEXTED_KEY = "field:texted";
const textedStops = new Set<string>(loadTextedStops());
/** Server-side "client||kind" pairs already sent today. */
const textedServer = new Set<string>();
function loadTextedStops(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(TEXTED_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}
function saveTextedStops() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TEXTED_KEY, JSON.stringify(Array.from(textedStops)));
  } catch { /* ignore */ }
}
function serverTextKey(client: string | null, kind: "arrived" | "done"): string {
  return `${(client ?? "").trim().toLowerCase()}||${kind}`;
}
/** Fold the server's ledger in on every poll. Cheap, and it self-corrects a
 *  device that was asleep while another phone sent the text. */
function syncTextedFromServer(sent: string[] | undefined) {
  if (!Array.isArray(sent)) return;
  textedServer.clear();
  for (const s of sent) textedServer.add(String(s).trim().toLowerCase());
}
function textStopKey(client: string | null, kind: "arrived" | "done", stopIndex: number): string {
  return `${stopIndex}:${kind}:${(client ?? "").toLowerCase()}`;
}
function hasTexted(client: string | null, kind: "arrived" | "done", stopIndex: number): boolean {
  return (
    textedStops.has(textStopKey(client, kind, stopIndex)) ||
    textedServer.has(serverTextKey(client, kind))
  );
}
function markTexted(client: string | null, kind: "arrived" | "done", stopIndex: number) {
  textedStops.add(textStopKey(client, kind, stopIndex));
  textedServer.add(serverTextKey(client, kind));
  saveTextedStops();
}
async function textClient(
  send: (b: unknown, o?: { silent?: boolean }) => Promise<{ ok: boolean; raw: unknown }>,
  kind: "arrived" | "done",
  client: string | null,
  stopIndex: number,
  isPreview: boolean,
  skipTexts = false,
): Promise<boolean> {
  if (isPreview) return false;
  if (hasTexted(client, kind, stopIndex)) return false;
  if (skipTexts) {
    // This client is not to be texted again today. Record the stop as settled
    // anyway: hasTexted is also what disables the visit button and stops it
    // being tapped twice, so leaving it unset would change the visit flow.
    markTexted(client, kind, stopIndex);
    return false;
  }
  const r = await send({ action: "textClient", kind }, { silent: true });
  if (r.ok) {
    markTexted(client, kind, stopIndex);
    toast.success("Client texted");
    return true;
  }
  const err =
    r.raw && typeof r.raw === "object" && "error" in (r.raw as Record<string, unknown>)
      ? String((r.raw as Record<string, unknown>).error)
      : "unknown";
  toast.error(`client text failed: ${err}`);
  return false;
}

/* ---------- assistant navigate gate (per stop, session-only) ---------- */
const NAVIGATED_KEY = "field:navigated";
const navigatedStops = new Set<number>(loadNavigatedStops());
function loadNavigatedStops(): number[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(NAVIGATED_KEY);
    return raw ? (JSON.parse(raw) as number[]) : [];
  } catch {
    return [];
  }
}
function saveNavigatedStops() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(NAVIGATED_KEY, JSON.stringify(Array.from(navigatedStops)));
  } catch { /* ignore */ }
}
function markNavigated(stopIndex: number) {
  navigatedStops.add(stopIndex);
  saveNavigatedStops();
}
function hasNavigated(stopIndex: number): boolean {
  return navigatedStops.has(stopIndex);
}

function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/\bsector\b/g, "sect")
    .replace(/\bsect\.?\b/g, "sect")
    .replace(/\s+/g, " ")
    .trim();
}

function matchClient(title: string, clients: string[]): string | null {
  const t = normalizeForMatch(title || "");
  for (const c of clients) {
    const n = normalizeForMatch(c || "");
    if (n && t.includes(n)) return c; // return the ORIGINAL client
    // string, never the normalized one
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

/* Does this event point at a vendor? Address first (it distinguishes
   'Home Depot - Colma' from '- Daly City'), then base name and aliases,
   minimum 4 chars so a short alias can't fire inside a client name.
   Mirrors the backend's vendorMatch_ — keep the two in step. */
function matchVendor(ev: EventItem | undefined, vendors: FieldVendor[]): FieldVendor | null {
  if (!ev) return null;
  const t = (ev.title || "").toLowerCase();
  const loc = (ev.location || "").toLowerCase();
  for (const v of vendors) {
    const street = (v.address || "").split(",")[0].trim().toLowerCase();
    if (street.length >= 6 && loc.includes(street)) return v;
  }
  for (const v of vendors) {
    const base = v.vendor.split(" - ")[0].trim().toLowerCase();
    if (base.length >= 4 && (t.includes(base) || loc.includes(base))) return v;
    for (const al of v.aliases ?? []) {
      const a = al.toLowerCase();
      if (a.length >= 4 && (t.includes(a) || loc.includes(a))) return v;
    }
  }
  return null;
}

/* ---------- Q (8/2): calendar-description HTML ---------- */
/* Google Calendar descriptions arrive as HTML (<b>, <br>, <a href>…) and
   were being shown as escaped text. Render them through an allowlist
   sanitizer instead: DOMParser walk that keeps basic formatting, unwraps
   everything else to its text, and only lets http(s) links through with
   target/rel pinned. The content is authored by Brandon/Angel in Google
   Calendar, but the walk means a pasted payload still can't execute. */
const PLAN_ALLOWED_TAGS = new Set(["B", "STRONG", "I", "EM", "U", "S", "BR", "P", "DIV", "SPAN", "A", "UL", "OL", "LI"]);

function escapePlanText(s2: string): string {
  return s2.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function sanitizeEventHtml(html: string): string {
  if (typeof DOMParser === "undefined") return escapePlanText(html);
  /* AB.2 (8/2): real calendar descriptions mix a few inline tags (<a>,
     <b>) with NEWLINES doing the structural work. HTML collapses those,
     which is why the plan rendered as one flowing blob. When the source
     has no block-level markup of its own, promote its newlines to <br>
     first so the author's line structure survives. */
  const hasBlockMarkup = /<\s*(br|p|div|ul|ol|li)\b/i.test(html);
  const src = hasBlockMarkup ? html : html.replace(/\r?\n/g, "<br>");
  const doc = new DOMParser().parseFromString(src, "text/html");
  const walk = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return escapePlanText(node.textContent ?? "");
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const el = node as Element;
    const inner = Array.from(el.childNodes).map(walk).join("");
    const tag = el.tagName;
    if (!PLAN_ALLOWED_TAGS.has(tag)) return inner;      // unwrap, keep the text
    if (tag === "BR") return "<br>";
    if (tag === "A") {
      const href = el.getAttribute("href") ?? "";
      if (!/^https?:\/\//i.test(href)) return inner;    // javascript:/data: etc. → text only
      const safeHref = escapePlanText(href).replace(/"/g, "&quot;");
      return `<a href="${safeHref}" target="_blank" rel="noopener noreferrer" style="color:${LIME};text-decoration:underline">${inner}</a>`;
    }
    const t = tag.toLowerCase();
    return `<${t}>${inner}</${t}>`;
  };
  return Array.from(doc.body.childNodes).map(walk).join("");
}

/** Body of a plan panel: renders HTML descriptions properly, keeps plain text as-is. */
function EventPlanBody({ text }: { text: string }) {
  const base: React.CSSProperties = {
    color: TEXT,
    fontSize: 13,
    marginTop: 6,
    lineHeight: 1.5,
    wordBreak: "break-word",
  };
  if (!/<[a-z][^>]*>/i.test(text)) {
    /* AB.2: plain-text plans still carry structure as leading "•", "◦" or
       "-" — preserve it with pre-wrap so the indentation survives. */
    return <div style={{ ...base, whiteSpace: "pre-wrap" }}>{text}</div>;
  }
  /* AB.2 (8/2): the sanitizer's allowlist already passes UL/OL/LI, but the
     app's CSS reset strips list markers and padding, so a real <ul> came
     out looking like flowing text. Scope the list styling back in here. */
  return (
    <>
      <style>{`
        .bv-plan ul, .bv-plan ol { margin: 6px 0; padding-left: 20px; }
        .bv-plan ul { list-style: disc outside; }
        .bv-plan ul ul { list-style: circle outside; margin: 2px 0; }
        .bv-plan ol { list-style: decimal outside; }
        .bv-plan li { margin: 3px 0; }
        .bv-plan p { margin: 6px 0; }
        .bv-plan b, .bv-plan strong { color: ${LIME}; }
      `}</style>
      <div className="bv-plan" style={base} dangerouslySetInnerHTML={{ __html: sanitizeEventHtml(text) }} />
    </>
  );
}

/** Mirrors the backend's isBreakEvent_ — a scheduled break, not a visit. */
function isBreakTitle(title?: string | null): boolean {
  return /\b(lunch|break)\b/i.test(title ?? "");
}

/* ---------- identity ---------- */
const OVERHEAD_CLIENT = "Bramble & Vine";
type Me = { id: string; name: string; role?: "lead" | "assistant" };
function isOverheadClient(c?: string | null): boolean {
  return (c ?? "").trim().toLowerCase() === OVERHEAD_CLIENT.toLowerCase();
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
  /* Lv09 (8/4): was "billing". Follows DEBRIEF_STEPS[0] now that Hours is last. */
  const initialStep: DebriefStepKey = search.step ?? DEBRIEF_STEPS[0].key;
  const [previewStep, setPreviewStep] = useState<DebriefStepKey>(initialStep);
  useEffect(() => {
    if (search.step) setPreviewStep(search.step);
  }, [search.step]);

  const {
    records: routeRecords,
    decide: routeDecide,
    revert: routeRevert,
    reconcile: routeReconcile,
  } = useOptimistic("field:route");
  const [data, setData] = useState<GetFieldResponse | null>(
    () => sessionCache.get<GetFieldResponse>(CK) ?? null,
  );
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<{ kind: "info" | "err"; text: string } | null>(null);
  const [now, setNow] = useState<number>(Date.now());
  const [refreshing, setRefreshing] = useState(false);
  const [offline, setOffline] = useState(false);

  const fetchOnce = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch(appendTeamParam(`${SCRIPT_URL}?action=getField`));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as GetFieldResponse;
      sessionCache.set(CK, json);
      /* Fold in the server's texted ledger before anything renders, so the
         arrival/departure buttons reflect what another device already sent. */
      syncTextedFromServer(json.textSent);
      const srvRoute = json.route ?? {};
      const abandoned = routeReconcile((r) => {
        if (r.kind === "route:state") return srvRoute.state === r.value;
        if (r.kind === "route:stopIndex") return (srvRoute.stopIndex ?? 0) === r.value;
        if (r.kind === "route:delegated") return !!srvRoute.delegated === (r.value === true);
        return false;
      });
      if (abandoned.length) {
        setBanner({
          kind: "err",
          text: "That step may not have saved — showing the server's version.",
        });
      }
      setData(json);
      setLoadErr(null);
      setOffline(false);
    } catch (e) {
      if (sessionCache.has(CK)) setOffline(true);
      else setLoadErr(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setRefreshing(false);
    }
  }, [routeReconcile]);

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

  // Route progression is the laggiest thing in the app: every setRoute waited on
  // the next 10s getField before the screen moved, and a poll that raced the
  // write could bounce it back. Recording the patch here shows it immediately
  // and holds it until getField agrees. Wrapping send rather than the seven
  // call sites means children calling send(...) get this too.
  const routePatchOf = useCallback((body: unknown): Partial<RouteDoc> | null => {
    if (!body || typeof body !== "object") return null;
    const b = body as Record<string, unknown>;
    if (b.action !== "setRoute") return null;
    const patch: Partial<RouteDoc> = {};
    if (typeof b.state === "string") patch.state = b.state as RouteState;
    if (typeof b.stopIndex === "number") patch.stopIndex = b.stopIndex;
    if (typeof b.delegated === "boolean") patch.delegated = b.delegated;
    return Object.keys(patch).length ? patch : null;
  }, []);

  const send = useCallback(
    async (body: unknown, opts?: { silent?: boolean }): Promise<{ ok: boolean; raw: unknown }> => {
      if (isPreview) return { ok: false, raw: null };
      const patch = routePatchOf(body);
      if (patch) {
        if (patch.state !== undefined) routeDecide("route:state", "current", patch.state);
        if (patch.stopIndex !== undefined) routeDecide("route:stopIndex", "current", patch.stopIndex);
        if (patch.delegated !== undefined) routeDecide("route:delegated", "current", patch.delegated);
      }
      setBusy(true);
      const r = await postScript(body);
      setBusy(false);
      if (!r.ok && !opts?.silent) {
        setBanner({ kind: "err", text: `Save failed — ${r.error ?? "unknown"}` });
      } else if (r.ok) {
        setBanner(null);
        void fetchOnce();
      }
      if (patch && !r.ok) {
        // The move did not happen; drop the overlay so the screen goes back.
        if (patch.state !== undefined) routeRevert("route:state", "current");
        if (patch.stopIndex !== undefined) routeRevert("route:stopIndex", "current");
        if (patch.delegated !== undefined) routeRevert("route:delegated", "current");
      }
      return { ok: r.ok, raw: r.raw };
    },
    [fetchOnce, isPreview, routePatchOf, routeDecide, routeRevert],
  );

  // What the screen renders: server data with any un-confirmed route move laid
  // over it. Everything below reads this, so the whole subtree moves at once.
  const view = useMemo<GetFieldResponse | null>(() => {
    if (!data) return null;
    const patch: Partial<RouteDoc> = {};
    for (const r of routeRecords) {
      if (r.kind === "route:state" && typeof r.value === "string") patch.state = r.value as RouteState;
      if (r.kind === "route:stopIndex" && typeof r.value === "number") patch.stopIndex = r.value;
      if (r.kind === "route:delegated" && typeof r.value === "boolean") patch.delegated = r.value;
    }
    if (!Object.keys(patch).length) return data;
    return { ...data, route: { ...(data.route ?? {}), ...patch } };
  }, [data, routeRecords]);

  if (!canSeeField) return null;

  return (
    <div style={PAGE}>
      <TopBar
        user={user}
        state={previewState ?? view?.route?.state}
        delegated={!!view?.route?.delegated}
      />
      {(refreshing || offline) && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 12px 0" }}>
          <RefreshDot refreshing={refreshing} offline={offline} />
          {offline && <span style={{ color: MUTED, fontSize: 10, letterSpacing: 1, textTransform: "uppercase" }}>offline — last data</span>}
        </div>
      )}
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
      {view && (
        <FieldBody
          data={view}
          now={now}
          send={send}
          refresh={fetchOnce}
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

/* AG/Lv09 (8/4): Hours moved to LAST. It is the wrap-up, not the opener, and it
   now reads real QuickBooks Time figures which are only worth confirming once
   the visit's work has been recorded. initialStep defaults to the FIRST entry
   here for the same reason — opening on Hours would defeat the reorder. */
const DEBRIEF_STEPS: { key: DebriefStepKey; label: string }[] = [
  { key: "updates", label: "Projects Completed" },
  { key: "items", label: "Items Used" },
  { key: "new", label: "Future Projects" },
  { key: "office", label: "Messages" },
  { key: "billing", label: "Hours" },
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
  refresh,
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
  refresh: () => void | Promise<void>;
  busy: boolean;
  role: ReturnType<typeof useViewAs>["effectiveRole"];
  setBanner: (b: { kind: "info" | "err"; text: string } | null) => void;
  previewState: RouteState | null;
  previewStep: DebriefStepKey;
  isPreview: boolean;
}) {
  const route = data.route ?? {};
  // An absent state (old backend) still reads as enroute; the new backend
  // sends "" until the crew departs, and "" must NOT be coerced to enroute —
  // that coercion is exactly what opened the day on "En route to first stop".
  const liveState: RouteState = (route.state ?? "enroute") as RouteState;
  const state: RouteState = previewState ?? liveState;
  const events = data.events ?? [];
  const employees = data.employees ?? [];
  const clients = data.clients ?? [];
  const roster = route.roster ?? [];
  const stopIndex = route.stopIndex ?? 0;
  const currentEvent = events[stopIndex] ?? events[0];
  const clientMatch = currentEvent ? matchClient(currentEvent.title, clients) : null;
  // Vendor stops are their own stop type (C, 8/2): tax banner, wallet button,
  // receipt hard gate, never texts, clock billed to a client.
  const vendors = data.vendors ?? [];
  const vendorStop = currentEvent ? matchVendor(currentEvent, vendors) : null;
  // JJ/HH: a scheduled Lunch Break is its own stop type — no No Show, no
  // debrief, no texting; the backend pauses the clock for it.
  const isBreakStop = isBreakTitle(currentEvent?.title);

  const isLead = canSee(role, "route_debrief");
  const canDebrief = canSee(role, "route_debrief") || route.delegated === true;

  const allNotes = data.visitNotes ?? [];
  const stopNotes = useMemo(
    () =>
      clientMatch
        ? allNotes.filter(
            (n) => (n.client ?? "").toLowerCase() === clientMatch.toLowerCase(),
          )
        : [],
    [allNotes, clientMatch],
  );

  // Items already on site for this client. Keyed by client name, matched
  // case-insensitively because the sheet's casing isn't guaranteed.
  const clientInventory = useMemo(() => {
    const map = data.inventory ?? {};
    if (!clientMatch) return [] as string[];
    const want = clientMatch.trim().toLowerCase();
    const hit = Object.keys(map).find((k) => k.trim().toLowerCase() === want);
    return hit ? (map[hit] ?? []) : [];
  }, [data.inventory, clientMatch]);

  // Zone map + special message are per-client reference, same case-insensitive
  // lookup as inventory (sheet casing isn't guaranteed).
  const clientZoneMap = useMemo(() => {
    const map = data.zoneMaps ?? {};
    if (!clientMatch) return "";
    const want = clientMatch.trim().toLowerCase();
    const hit = Object.keys(map).find((k) => k.trim().toLowerCase() === want);
    return hit ? (map[hit] ?? "") : "";
  }, [data.zoneMaps, clientMatch]);

  const clientSpecialMessage = useMemo(() => {
    if (!clientMatch) return "";
    const want = clientMatch.trim().toLowerCase();
    const rec = data.specialMessages ?? {};
    const recHit = Object.keys(rec).find((k) => k.trim().toLowerCase() === want);
    if (recHit && rec[recHit]) return rec[recHit] ?? "";
    const rows = data.clientInfo ?? data.clients_info ?? [];
    const row = rows.find(
      (r) => ((r.client ?? r.name ?? "").trim().toLowerCase() === want),
    );
    return row?.specialMessage ?? "";
  }, [data.specialMessages, data.clientInfo, data.clients_info, clientMatch]);



  const [rosterEdit, setRosterEdit] = useState(false);
  const [backNotice, setBackNotice] = useState<string | null>(null);
  // Identity now comes from day-state's fieldPhone; there's no per-phone picker.
  const dayState = useDayState();
  const fieldPhone = dayState?.fieldPhone ?? null;
  // This client has already had their text today. Only a literal true suppresses
  // anything, so a payload without the field behaves exactly as before.
  const skipSameDayTexts = dayState?.skipSameDayTexts === true;
  // N (8/2): every button that would text must SAY so in its label — and say
  // "(NO TEXT)" when the client's AF opt-out (or a vendor stop) suppresses it.
  // Same AF source the send logic already uses; this is labeling, not a new
  // suppression mechanism.
  const afOptOut =
    !!clientMatch &&
    (data.skipTextClients ?? []).some(
      (c) => c.trim().toLowerCase() === clientMatch.trim().toLowerCase(),
    );
  // AG ("Departure Text") is a SEPARATE column from AF — departure must never
  // be gated on the arrival flag (that mix-up is the bug this fixes).
  const agOptOut =
    !!clientMatch &&
    (data.skipDepartureClients ?? []).some(
      (c) => c.trim().toLowerCase() === clientMatch.trim().toLowerCase(),
    );
  const skipDepartureTexts = agOptOut;
  const textsSuppressed = skipSameDayTexts || afOptOut || !!vendorStop;
  const departureTextsSuppressed = skipDepartureTexts || !!vendorStop;
  // Clients whose text goes to someone else (housekeeper, neighbour…). Labels
  // only — the backend decides the actual recipient.
  const special = clientMatch
    ? (data.specialTextClients ?? []).find(
        (s0) => s0.client.trim().toLowerCase() === clientMatch.trim().toLowerCase(),
      )
    : undefined;
  const arrivalToContact = special?.arrival === true;
  const departureToContact = special?.departure === true;
  // Clock identity requires the ACTUAL signed-in role — never view-as. Before
  // this check, management browsing /field was handed the field phone holder's
  // QBT id and a live CLOCK IN button under someone else's timesheet.
  const { role: actualRole } = useAuth();
  const isCrew = actualRole === "lead" || actualRole === "assistant";
  const derivedMeRole: "lead" | "assistant" = actualRole === "assistant" ? "assistant" : "lead";
  const me: Me | null = useMemo(
    () =>
      isCrew && fieldPhone
        ? { id: fieldPhone.id, name: fieldPhone.name, role: derivedMeRole }
        : null,
    [isCrew, fieldPhone, derivedMeRole],
  );
  const [breakFrom, setBreakFromState] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try { return window.sessionStorage.getItem("field:breakFrom") || null; } catch { return null; }
  });
  const setBreakFrom = (v: string | null) => {
    setBreakFromState(v);
    try {
      if (typeof window === "undefined") return;
      if (v) window.sessionStorage.setItem("field:breakFrom", v);
      else window.sessionStorage.removeItem("field:breakFrom");
    } catch { /* ignore */ }
  };
  const bodyRouter = useRouter();

  /* --- assistant loading gate (per-phone identity role, first stop only) --- */
  const assistantGateEnabled =
    !isPreview &&
    !!me &&
    me.role === "assistant" &&
    (liveState === "" || liveState === "enroute") &&
    stopIndex === 0;
  const loadingSnap = useLoadingSnapshot(assistantGateEnabled);
  // Pre-departure ("" state) the gate stays open even fully loaded: departing
  // is an explicit shared act (LOADING COMPLETE → NAVIGATE AND TEXT ETA), not
  // a side effect of ticking the last item.
  const assistantGateOpen =
    assistantGateEnabled &&
    (liveState === "" ||
      !loadingSnap.ready || loadingSnap.confirmed !== true || !loadingSnap.allLoaded);
  const [localLoadDone, setLocalLoadDone] = useState(false);
  const sharedLoadingDone = localLoadDone || dayState?.flags?.loadingDone === true;
  const assistantComplete = async () => {
    const r = await send({ action: "loadingComplete" });
    if (r.ok) setLocalLoadDone(true);
    else setBanner({ kind: "err", text: "Couldn't mark complete — retry." });
  };
  // First stop's AF preference — the depart label needs it before the route
  // has a current client (dayState.skipSameDayTexts can't cover this yet).
  const firstStopClient = events[0] ? matchClient(events[0].title, clients) : null;
  const firstStopSkipsText =
    !!firstStopClient && (data.skipTextClients ?? []).includes(firstStopClient);
  const assistantDepart = async (withText: boolean) => {
    const first = events[0];
    if (!first) {
      setBanner({ kind: "err", text: "No first stop on today's calendar." });
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
    const r = await send({
      action: "setRoute", state: "enroute", stopIndex: 0,
      client: firstStopClient, eventId: first.id,
    });
    if (r.ok && withText) void send({ action: "textEta" }, { silent: true });
  };

  /* --- hooks that must run every render (moved above early returns) --- */
  // Payroll confirm is the last step of the day, not a gate in front of the
  // lead's clock-out: the clock-out has to land first, or the lead's own entry
  // is still open and the hours on the screen are wrong.
  const [payrollOpen, setPayrollOpen] = useState(false);
  const openPayroll = useCallback(() => setPayrollOpen(true), []);
  const closePayroll = useCallback(() => setPayrollOpen(false), []);
  /* BB4 (8/2): the lead's end-of-day clock-out flows straight into
     approval — payroll review opens (as before), and when it closes the
     approve prompt follows as one continuous action. qbApprove stays
     server-gated on everyone being clocked out. */
  const promptApprove = useCallback(async () => {
    if (!(await confirmModal("Clocked out. Approve today's hours in QB Time now?"))) return;
    const r = await send({ action: "qbApprove" });
    if (r.ok) setBanner({ kind: "info", text: "Approved through today ✓" });
  }, [send, setBanner]);

  const _state: RouteState = previewState ?? liveState;
  const locActive = !isPreview && (_state === "enroute" || _state === "arrived" || _state === "visit");
  useEffect(() => {
    if (!locActive) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    const report = () => {
      if (cancelled) return;
      if (typeof document !== "undefined" && document.hidden) return;
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (cancelled) return;
          void send(
            { action: "reportLocation", lat: pos.coords.latitude, lon: pos.coords.longitude },
            { silent: true },
          );
        },
        () => { /* denied or unavailable — silent */ },
        { enableHighAccuracy: false, maximumAge: 30_000, timeout: 15_000 },
      );
    };
    report();
    timer = setInterval(report, 45_000);
    const onVis = () => { if (!document.hidden) report(); };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [locActive, send]);

  /* --- manage-full-crew fallback (lead only, always reachable via link) --- */
  if (rosterEdit && !isPreview) {
    return (
      <RosterPicker
        employees={employees}
        busy={busy}
        initialSelected={roster.map((r) => r.id)}
        onCancel={() => { setRosterEdit(false); setBackNotice(null); }}
        onSet={async (people) => {
          const r = await send({ action: "setRoster", people });
          if (r.ok) { setRosterEdit(false); setBackNotice(null); }
        }}
      />
    );
  }

  /* --- assistant gate: needs a field-phone assignment AND HQ_LOADING team_assign/
     dailyload_confirm/special_confirm completed. Otherwise route to /schedule. --- */
  useEffect(() => {
    if (isPreview) return;
    if (role !== "assistant") return;
    if (!dayState) return;
    const hq = dayState.subSteps?.HQ_LOADING || [];
    const iSpecial = hq.indexOf("special_confirm");
    const iCur = hq.indexOf(dayState.subStep);
    const hqReady =
      dayState.phase !== "HQ_LOADING" || (iSpecial >= 0 && iCur > iSpecial);
    if (!fieldPhone || !hqReady) {
      void bodyRouter.navigate({ to: "/schedule" });
    }
  }, [role, dayState, fieldPhone, isPreview, bodyRouter]);

  /* --- lead HQ gate: /field is for a departed route. While the day is still
     in HQ_LOADING, send the lead to the screen that owns the current step —
     before this the lead was hard-landed here and ran the whole route with
     no roster set and the daily load unanswered. --- */
  useEffect(() => {
    if (isPreview) return;
    if (role !== "lead") return;
    if (!dayState) return;
    if (dayState.phase !== "HQ_LOADING") return;
    // Depart-eligible: loading is done and the phase flip to FIELD_VISIT is a
    // poll away. Bouncing here would yank the lead straight back off the
    // screen they just departed to.
    if (dayState.subStep === "loading" && dayState.flags?.loadingDone) return;
    void bodyRouter.navigate({ to: hqScreenFor(dayState.subStep) });
  }, [role, dayState, isPreview, bodyRouter]);

  if (role === "assistant" && !me && !isPreview) {
    // Gate effect above will redirect; render nothing meanwhile.
    return null;
  }

  const anyClockedIn = roster.some((m) => !!m.in && !m.out);
  const nextEvent = events[stopIndex + 1];
  const nextVendor = nextEvent ? matchVendor(nextEvent, vendors) : null;
  const nextClientMatch = nextEvent
    ? (nextVendor ? nextVendor.vendor : matchClient(nextEvent.title, clients))
    : null;
  const isLastStop = stopIndex + 1 >= events.length;

  const handleBackToCrew = () => {
    if (isPreview) return;
    if (anyClockedIn) {
      setBackNotice("Crew is clocked in — clock out before changing the roster.");
      return;
    }
    setBackNotice(null);
    setRosterEdit(true);
  };

  const handleSkip = async () => {
    if (isPreview) return;
    const label = clientMatch ?? currentEvent?.title ?? "this client";
    const msg = isLastStop
      ? `Skip ${label}? No stops remain.`
      : `Skip ${label}? The visit stays on the calendar.`;
    if (!(await confirmModal(msg))) return;
    if (isLastStop) {
      void send({ action: "setRoute", stopIndex: stopIndex + 1, state: "next" });
    } else {
      void send({
        action: "setRoute",
        stopIndex: stopIndex + 1,
        state: "enroute",
        client: nextClientMatch,
        eventId: nextEvent!.id,
      });
    }
  };

  // preview=done demos the HQ end-of-day stages read-only (BB, 8/2).
  const routeComplete =
    previewState === "done" || (!isPreview && stopIndex >= events.length);




  const meRow = me ? roster.find((r) => r.id === me.id) : undefined;
  const meOnClock = !!(meRow?.in && !meRow?.out);

  /* ONSITE BREAK (8/4): lunch taken WITHOUT leaving this stop. Entirely separate
     from startBreakFromCurrent below, which clocks out via qbClock and stashes
     "field:breakFrom" in sessionStorage for a crew that LEAVES the property —
     that path is untouched. This one never advances stopIndex, so no arrival,
     departure, client text or debrief can fire from it.
     State lives on the SERVER (getField.onsiteBreaks) rather than here, because
     it has to survive a reload and be visible from a second phone. */
  const onsiteBreaks = data.onsiteBreaks ?? {};
  const myOnsiteBreak = me ? onsiteBreaks[me.name] : undefined;
  const onOnsiteBreak = !!myOnsiteBreak?.since;

  const takeOnsiteLunch =
    me && (meOnClock || onOnsiteBreak)
      ? async () => {
          if (isPreview) return;
          try {
            if (onOnsiteBreak) await endOnsiteBreak(me.name);
            else await startOnsiteBreak(me.name);
            /* Not routed through send(): that posts raw and would not apply the
               dryRun:false / throw-on-dryRun discipline. So refetch by hand,
               the same call send() makes on success. */
            void refresh();
          } catch (e) {
            setBanner({
              kind: "err",
              text: e instanceof Error ? e.message : "Break failed — retry.",
            });
          }
        }
      : undefined;
  // "Start Visit & Switch": move this device's crew member onto the client's
  // clock. Everyone else does the same via their own SWITCH TO button, which
  // is what makes the shared state read correctly on every device.
  const switchMeTo = async (toClient: string) => {
    if (!me || !meOnClock || isPreview) return;
    const from = meRow?.client ?? OVERHEAD_CLIENT;
    if (from.trim().toLowerCase() === toClient.trim().toLowerCase()) return;
    const outR = await send({ action: "qbClock", userId: me.id, dir: "out", client: from }, { silent: true });
    if (!outR.ok) return;
    await send({ action: "qbClock", userId: me.id, dir: "in", client: toClient }, { silent: true });
  };
  const startBreakFromCurrent = me && meOnClock
    ? async () => {
        if (isPreview) return;
        const current = meRow?.client ?? OVERHEAD_CLIENT;
        const r = await send({ action: "qbClock", userId: me.id, dir: "out", client: current });
        if (r.ok) setBreakFrom(current);
        else setBanner({ kind: "err", text: "Break failed — retry." });
      }
    : undefined;


  const leadEndOfDay = !!(me && me.role === "lead" && routeComplete);

  // T2 (8/2): assistants clock out first at end of day. Mirrors the server
  // gate (which rejects a lead's route-complete clock-out while an
  // assistant is on the clock) so the button explains itself instead of
  // erroring.
  const assistantsStillIn = roster.filter(
    (m) => (m.role ?? "") === "assistant" && m.in && !m.out,
  );
  const leadOutBlocked =
    leadEndOfDay && assistantsStillIn.length > 0
      ? `${assistantsStillIn.map((m) => m.name).join(", ")} — assistants clock out before the lead.`
      : null;

  const personalClockSlot = me ? (
    <PersonalClockPanel
      me={me}
      roster={roster}
      clientMatch={clientMatch}
      now={now}
      isPreview={isPreview}
      send={send}
      setBanner={setBanner}
      breakFrom={breakFrom}
      setBreakFrom={setBreakFrom}
      afterClockOut={leadEndOfDay ? openPayroll : undefined}
      outBlockedReason={leadOutBlocked}
    />
  ) : null;

  /* AB (8/2): the one combined client-arrival action. Marks arrival (only
     the first presser — the shared route state makes it first-tap-wins),
     puts THIS person on the client's clock, and sends the arrival text.
     Later tappers just move their own clock: state is already 'visit', so
     no second arrival and no second text. `withText:false` is the manual
     override (AB.5); N's AF logic still suppresses on top of it. */
  const arriveAndSwitch = useCallback(async (withText: boolean) => {
    if (isPreview) return;
    const firstPresser = state !== "visit";
    if (firstPresser) {
      if (!currentEvent || !clientMatch) return;
      const a = await send({
        action: "setRoute", state: "arrived",
        client: clientMatch, eventId: currentEvent.id, stopIndex,
      });
      if (!a.ok) return;
      const v = await send({ action: "setRoute", state: "visit" });
      if (!v.ok) return;
      if (withText) {
        void textClient(send, "arrived", clientMatch, stopIndex, isPreview, skipSameDayTexts);
      } else {
        markTexted(clientMatch, "arrived", stopIndex);   // settle the stop, send nothing
      }
    }
    if (!clientMatch) return;
    /* AB.4: this button replaced the generic clock-in panel, so it has to
       handle someone who isn't on the clock at all yet, not just switch. */
    if (me && !meOnClock) {
      if (!roster.some((r) => r.id === me.id)) {
        await send({ action: "joinRoster", id: me.id, name: me.name, role: me.role || "assistant" }, { silent: true });
      }
      await send({ action: "qbClock", userId: me.id, dir: "in", client: clientMatch }, { silent: true });
    } else {
      void switchMeTo(clientMatch);
    }
  }, [isPreview, state, currentEvent, clientMatch, stopIndex, send, skipSameDayTexts, me, meOnClock, roster, switchMeTo]);

  const handleVisitComplete = async () => {
    if (vendorStop) return;   // vendor stops never text
    // AG, not AF: departure has its own opt-out column.
    void textClient(send, "done", clientMatch, stopIndex, isPreview, skipDepartureTexts);
  };


  return (
    <div>
      {me && (
        <ClockingAsHeader me={me} roster={roster} />
      )}
      {/* ROUTE COMPLETE → the HQ end-of-day sequence (BB, 8/2):
          ARRIVED AT HQ → FINISHED UNLOADING → clock out (assistants
          first) → approve. On a day where nobody ever clocked in, the
          sequence never inserts itself — nobody left HQ (BB5). */}
      {routeComplete && (
        <RouteComplete
          events={events}
          roster={roster}
          isLead={isLead}
          /* DD (8/2): the sequence gates on the ROUTE having departed, not on
             clock-ins — "nobody left HQ" is a route fact. A crew that drove
             the day with no clock entries still arrives and unloads. */
          departed={(route.state ?? "") !== ""}
          atHq={state === "done"}
          unloaded={!!route.unloaded}
          isPreview={isPreview}
          onArrivedHq={() => void send({ action: "setRoute", state: "done" })}
          onFinishedUnloading={() => void send({ action: "setRoute", unloaded: true })}
          clockSlot={personalClockSlot}
          /* T1/T3 (8/2): approving hours is the LAST act of the day —
             locked until everyone is off the clock AND the lead's own
             shift has actually been clocked out (a day where the lead
             never clocked in has nothing to approve from here). */
          approveNote={(() => {
            const stillIn = roster.filter((m) => m.in && !m.out);
            if (stillIn.length) {
              return `Waiting for clock-outs: ${stillIn.map((m) => m.name).join(", ")}`;
            }
            const leadShiftDone = roster.some(
              (m) => (m.role ?? "") === "lead" && m.in && m.out,
            );
            if (!leadShiftDone) return "Approve unlocks after the lead clocks out.";
            return null;
          })()}
          leadName={me?.name ?? ""}

          busy={busy}
        />
      )}
      {!routeComplete && (
        <>
          {currentEvent && (
            <ClientHeader
              event={currentEvent}
              clientMatch={vendorStop ? vendorStop.vendor : clientMatch}
              state={state}
              inventory={clientInventory}
              knownInventory={data.knownInventory ?? []}
              zoneMap={clientZoneMap}
              specialMessage={clientSpecialMessage}
              send={send}
              /* Vendor/break stops aren't clients — no inventory reference. */
              panelDisabled={!!vendorStop || isBreakStop || isPreview}
            />

          )}

          {(state === "" || state === "enroute" || state === "arrived") && (
            assistantGateOpen ? (
              <AssistantLoadingGate
                clockSlot={personalClockSlot}
                confirmed={loadingSnap.confirmed === true}
                items={loadingSnap.items}
                ready={loadingSnap.ready}
                onToggle={loadingSnap.toggle}
                allLoaded={loadingSnap.allLoaded}
                loadingDone={sharedLoadingDone}
                departed={liveState !== ""}
                busy={busy}
                skipText={firstStopSkipsText}
                onComplete={() => void assistantComplete()}
                onDepart={(withText) => void assistantDepart(withText)}
              />
            ) : (
              <StateArrived
                skipSameDayTexts={skipSameDayTexts}
                textsSuppressed={textsSuppressed}
                arrivalToContact={arrivalToContact}
                roster={roster}
                clientMatch={clientMatch}
                stopIndex={stopIndex}
                isLead={isLead}
                busy={busy}
                clockSlot={personalClockSlot}
                onBackToCrew={handleBackToCrew}
                backNotice={backNotice}
                isPreview={isPreview}
                role={role}
                event={currentEvent}
                send={send}
                locationCheck={route.locationCheck ?? null}
                vendorStop={vendorStop}
                isBreak={isBreakStop}
                hasArrived={state === "arrived"}
                /* GG (8/2): ARRIVED is the transition out of travelling.
                   Client stops stop here (the Start Visit screen comes
                   next); vendor stops and breaks go straight into visit
                   mode with no in-between screen (HH.1). */
                onArrived={async () => {
                  const routeClient = vendorStop ? vendorStop.vendor : (clientMatch ?? currentEvent?.title ?? "");
                  if (!currentEvent) return;
                  const r = await send({
                    action: "setRoute",
                    state: "arrived",
                    client: routeClient,
                    eventId: currentEvent.id,
                    stopIndex,
                  });
                  if (!r.ok) return;
                  if (vendorStop || isBreakStop) {
                    const v = await send({ action: "setRoute", state: "visit" });
                    /* II (8/2): a supply run bills to general overhead by
                       default — billing a client is an explicit choice made
                       inside the visit (LL.2.b), never automatic. */
                    if (v.ok && vendorStop) void switchMeTo(OVERHEAD_CLIENT);
                  }
                }}
                onArriveAndSwitch={() => void arriveAndSwitch(true)}
                onArriveAndSwitchNoText={() => void arriveAndSwitch(false)}
                onNoShow={() => void confirmNoShow(send, setBanner)}
              />
            )
          )}



          {/* LL (8/2): a supply run has its own visit sequence — chips,
              checkout, receipt gate, navigate. No debrief, no No Show. */}
          {state === "visit" && vendorStop && (
            <VendorVisit
              vendor={vendorStop}
              clients={clients}
              nextLabel={nextClientMatch ?? (isLastStop ? null : nextEvent?.title ?? null)}
              nextAddress={nextEvent?.location ?? ""}
              billTo={meRow?.client ?? OVERHEAD_CLIENT}
              busy={busy}
              isPreview={isPreview}
              onSwitchClient={(c) => void switchMeTo(c)}
              onOutcome={(outcome) => void send({ action: "setRoute", vendorOutcome: outcome })}
              onNavigateNext={() => void send({ action: "setRoute", state: "next" })}
            />
          )}

          {state === "visit" && !vendorStop && isBreakStop && (
            <BreakVisit
              title={currentEvent?.title ?? "Lunch Break"}
              busy={busy}
              isPreview={isPreview}
              onEndBreak={() => void send({ action: "setRoute", state: "next" })}
            />
          )}

          {state === "visit" && !vendorStop && !isBreakStop && (
            <StateVisit
              visitTimer={data.visitTimer ?? null}
              visitPhotos={data.visitPhotos ?? null}
              skipSameDayTexts={skipSameDayTexts}
              textsSuppressed={textsSuppressed}
              departureTextsSuppressed={departureTextsSuppressed}
              departureToContact={departureToContact}
              event={currentEvent}
              clientMatch={clientMatch}
              vendorStop={vendorStop}
              stopIndex={stopIndex}
              arrivedAt={route.arrivedAt}
              now={now}
              roster={roster}
              isLead={isLead}
              delegated={!!route.delegated}
              onDelegate={(v) => void send({ action: "setRoute", delegated: v })}
              projects={data.projects ?? []}
              tools={data.tools ?? []}
              busy={busy}
              isPreview={isPreview}
              notes={stopNotes}
              clockSlot={personalClockSlot}
              onBreak={startBreakFromCurrent}
              onOnsiteLunch={takeOnsiteLunch}
              onsiteBreakSince={myOnsiteBreak?.since}
              onEndVisit={() => void send({ action: "setRoute", state: "debrief" })}
              onCrossProject={(projectId, crossed) =>
                void send({ action: "crossProject", projectId, client: clientMatch, crossed }, { silent: true })
              }
              onToggleTool={(t) => void send({ action: "setLoaded", materialId: t.materialId, row: t.row, loaded: !t.loaded }, { silent: true })}
              onVisitComplete={handleVisitComplete}
              onNoShow={() => void confirmNoShow(send, setBanner)}
            />
          )}



          {/* Vendor stop debrief = the receipt HARD GATE (C, 8/2): nothing
              advances to the next stop until an outcome is recorded. The
              backend enforces the same gate on setRoute. */}
          {state === "debrief" && vendorStop && (
            <VendorDebrief
              vendor={vendorStop}
              busy={busy}
              isPreview={isPreview}
              onOutcome={async (outcome) => {
                if (isPreview) return;
                const r = await send({ action: "setRoute", vendorOutcome: outcome });
                if (!r.ok) return;
                await send({ action: "setRoute", state: "next" });
              }}
            />
          )}

          {state === "debrief" && !vendorStop && (
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
                  notes={stopNotes}
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
                      if (clientMatch) {
                        // fire-and-forget clear of consumed notes for this client
                        void postScript({ action: "visitNote", clearClient: clientMatch });
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
              clientMatch={vendorStop ? vendorStop.vendor : clientMatch}
              isLead={isLead}
              projects={data.projects ?? []}
              busy={busy}
              onHere={() => {
                const routeClient = vendorStop ? vendorStop.vendor : clientMatch;
                if (!currentEvent || !routeClient) return;
                void send({
                  action: "setRoute",
                  state: "arrived",
                  client: routeClient,
                  eventId: currentEvent.id,
                  stopIndex,
                });
              }}
              headerNote={vendorStop ? "NEXT STOP — SUPPLY RUN" : "NEXT STOP"}
            />
          )}

          {state === "next" && (
            <RouteSoFar events={events} stopIndex={stopIndex} />
          )}
        </>
      )}
      <PayrollConfirm
        open={payrollOpen}
        scriptUrl={SCRIPT_URL}
        byName={me?.name ?? "lead"}
        onClose={() => { closePayroll(); void promptApprove(); }}
        onProceed={() => { closePayroll(); void promptApprove(); }}
      />
    </div>
  );
}

/* LL (8/2): the whole vendor visit, in order — shopping chips for this
   vendor → READY TO CHECKOUT (opens Wallet + arms the receipt gate) →
   receipt outcome → NAVIGATE TO NEXT STOP. No debrief (HH.3), no No Show
   (HH.2), no texting language anywhere (HH.4). Billing defaults to
   overhead; "Switch to client" here is the one explicit opt-in (II). */
function VendorVisit({
  vendor,
  clients,
  nextLabel,
  nextAddress,
  billTo,
  busy,
  isPreview,
  onSwitchClient,
  onOutcome,
  onNavigateNext,
}: {
  vendor: FieldVendor;
  clients: string[];
  nextLabel: string | null;
  nextAddress: string;
  billTo: string | null;
  busy: boolean;
  isPreview: boolean;
  onSwitchClient: (client: string) => void;
  onOutcome: (outcome: "receipt" | "none") => void;
  onNavigateNext: () => void;
}) {
  const [sugs, setSugs] = useState<string[]>([]);
  const [checkout, setCheckout] = useState(false);
  const [receiptDone, setReceiptDone] = useState(false);
  const [pickOpen, setPickOpen] = useState(false);
  const [query, setQuery] = useState("");

  // U's vendor-suggestion mechanic, reused verbatim (LL.2.c).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `${SCRIPT_URL}?action=getShopping&vendor=${encodeURIComponent(vendor.vendor)}`,
        );
        const j = (await res.json()) as { items?: { item: string; done: boolean }[]; suggestions?: string[] };
        if (cancelled) return;
        const open = (j.items ?? []).filter((i) => !i.done).map((i) => i.item);
        setSugs([...open, ...(j.suggestions ?? [])].slice(0, 12));
      } catch { /* chips are optional */ }
    })();
    return () => { cancelled = true; };
  }, [vendor.vendor]);

  const matches = query.trim()
    ? clients.filter((c) => c.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 6)
    : [];

  return (
    <div style={{ padding: "10px 14px" }}>
      <div style={PANEL_BOX}>
        <div style={{ color: MUTED, fontSize: 12 }}>Supply run in progress</div>
      </div>

      {vendor.taxExempt && (
        <div style={{ marginTop: 12, padding: "8px 10px", border: `1px solid ${LIME_DIM}`, borderRadius: 4, color: LIME, fontSize: 12, background: "rgba(124,255,0,0.06)" }}>
          {vendor.taxExemptId
            ? `TAX-EXEMPT ACCOUNT ON FILE — ID: ${vendor.taxExemptId}`
            : "TAX-EXEMPT ACCOUNT ON FILE — ID not yet recorded"}
        </div>
      )}

      {/* II/LL.2.b: overhead unless someone explicitly bills a client. */}
      <div style={{ ...SECTION_HEAD, marginTop: 16 }}>BILLING</div>
      <div style={{ color: MUTED, fontSize: 12, padding: "0 4px 6px" }}>
        {billTo && billTo !== OVERHEAD_CLIENT
          ? `Billing to ${billTo}.`
          : "Billing to B&V overhead — switch to a client only if this run is for one."}
      </div>
      {!pickOpen ? (
        <button type="button" onClick={() => setPickOpen(true)} disabled={isPreview}
          style={{ ...BIG_BTN, width: "100%", minHeight: 44, fontSize: 12 }}>
          SWITCH TO CLIENT?
        </button>
      ) : (
        <div>
          <input
            autoFocus value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Search clients…"
            style={{ width: "100%", boxSizing: "border-box", background: BG, color: TEXT, border: `1px solid ${LINE}`, borderRadius: 6, padding: "10px", fontFamily: "inherit", fontSize: 14 }}
          />
          <div style={{ display: "grid", gap: 2, marginTop: 4 }}>
            {matches.map((c) => (
              <button key={c} type="button"
                onClick={() => { onSwitchClient(c); setPickOpen(false); setQuery(""); }}
                style={{ textAlign: "left", background: "transparent", border: `1px solid ${LINE}`, borderRadius: 4, color: TEXT, fontFamily: "inherit", fontSize: 13, padding: "8px 10px", cursor: "pointer" }}>
                {c}
              </button>
            ))}
          </div>
        </div>
      )}

      {sugs.length > 0 && (
        <>
          <div style={{ ...SECTION_HEAD, marginTop: 16 }}>SHOPPING LIST — {vendor.vendor.toUpperCase()}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {sugs.map((s) => (
              <span key={s} style={{ border: `1px solid ${LIME_DIM}`, color: LIME, borderRadius: 999, padding: "6px 10px", fontSize: 12 }}>
                {s}
              </span>
            ))}
          </div>
        </>
      )}

      {!checkout && (
        <button type="button" disabled={busy || isPreview}
          onClick={() => { openGoogleWallet(); setCheckout(true); }}
          style={{ ...PRIMARY_BTN, marginTop: 18, opacity: busy || isPreview ? 0.6 : 1 }}>
          READY TO CHECKOUT
        </button>
      )}

      {checkout && !receiptDone && (
        <>
          <div style={{ ...SECTION_HEAD, marginTop: 18 }}>RECEIPT</div>
          <div style={{ color: MUTED, fontSize: 12, padding: "0 4px 6px" }}>
            Snap the receipt on the{" "}
            <Link to="/receipts" style={{ color: LIME }}>Receipts screen</Link>, then confirm:
          </div>
          <button type="button" disabled={busy || isPreview}
            onClick={() => { onOutcome("receipt"); setReceiptDone(true); }}
            style={{ ...PRIMARY_BTN, marginTop: 8, opacity: busy || isPreview ? 0.6 : 1 }}>
            RECEIPT ATTACHED ✓
          </button>
          <button type="button" disabled={busy || isPreview}
            onClick={() => { onOutcome("none"); setReceiptDone(true); }}
            style={{ ...BIG_BTN, width: "100%", marginTop: 10, opacity: busy || isPreview ? 0.6 : 1 }}>
            NO PURCHASE MADE
          </button>
        </>
      )}

      {receiptDone && (
        <>
          {/* LL.2.f: only if a client was actually chosen does anyone need
              to move their own clock; otherwise Navigate shows directly. */}
          {billTo && billTo !== OVERHEAD_CLIENT && (
            <div style={{ ...SECTION_HEAD, marginTop: 18 }}>YOUR CLOCK</div>
          )}
          <button type="button" disabled={busy || isPreview}
            onClick={() => {
              if (nextAddress) {
                window.open(
                  "https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=" +
                    encodeURIComponent(nextAddress),
                  "_blank", "noopener,noreferrer",
                );
              }
              onNavigateNext();
            }}
            style={{ ...PRIMARY_BTN, marginTop: 14, opacity: busy || isPreview ? 0.6 : 1 }}>
            {nextLabel ? `NAVIGATE TO ${nextLabel.toUpperCase()}` : "NAVIGATE — BACK TO HQ"}
          </button>
        </>
      )}
    </div>
  );
}

/* JJ/HH: a scheduled break. The backend clocks everyone out at the start
   of the window and back in at the end — this screen just says so. */
function BreakVisit({
  title, busy, isPreview, onEndBreak,
}: { title: string; busy: boolean; isPreview: boolean; onEndBreak: () => void }) {
  return (
    <div style={{ padding: "10px 14px" }}>
      <div style={PANEL_BOX}>
        <div style={{ color: LIME, fontSize: 18, fontWeight: "bold" }}>{title}</div>
        <div style={{ color: MUTED, fontSize: 12, marginTop: 6, lineHeight: 1.5 }}>
          Clocks pause automatically for the break and resume on the same
          jobcode when it ends. Nothing to confirm.
        </div>
      </div>
      <button type="button" disabled={busy || isPreview} onClick={onEndBreak}
        style={{ ...PRIMARY_BTN, marginTop: 16, opacity: busy || isPreview ? 0.6 : 1 }}>
        BREAK OVER — CONTINUE
      </button>
    </div>
  );
}

/* Vendor-stop debrief (C, 8/2): a two-outcome hard gate replacing the full
   client debrief. Either a receipt is on record (attach it on the Receipts
   screen first) or the run explicitly bought nothing — the next Navigate
   stays locked until one is chosen, and the backend rejects the advance
   without it. Vendor stops never text and never invoice from here. */
function VendorDebrief({
  vendor,
  busy,
  isPreview,
  onOutcome,
}: {
  vendor: FieldVendor;
  busy: boolean;
  isPreview: boolean;
  onOutcome: (outcome: "receipt" | "none") => void;
}) {
  return (
    <div style={{ padding: "10px 14px" }}>
      <div style={PANEL_BOX}>
        <div style={{ color: LIME, fontSize: 14, letterSpacing: 1 }}>
          SUPPLY STOP — {vendor.vendor.toUpperCase()}
        </div>
        <div style={{ color: MUTED, marginTop: 8, fontSize: 13, lineHeight: 1.5 }}>
          Before the next stop: was anything purchased here?
        </div>
      </div>
      <div style={{ color: MUTED, fontSize: 11, letterSpacing: 0.5, marginTop: 12 }}>
        Snap the receipt on the{" "}
        <Link to="/receipts" style={{ color: LIME }}>Receipts screen</Link>
        {" "}first, then confirm:
      </div>
      <button
        type="button"
        onClick={() => onOutcome("receipt")}
        disabled={busy || isPreview}
        style={{ ...PRIMARY_BTN, marginTop: 12, opacity: busy || isPreview ? 0.6 : 1 }}
      >
        RECEIPT ATTACHED ✓
      </button>
      <button
        type="button"
        onClick={() => onOutcome("none")}
        disabled={busy || isPreview}
        style={{ ...BIG_BTN, width: "100%", marginTop: 10, opacity: busy || isPreview ? 0.6 : 1 }}
      >
        NO PURCHASE MADE
      </button>
    </div>
  );
}

async function confirmNoShow(
  send: (b: unknown) => Promise<{ ok: boolean; raw: unknown }>,
  setBanner: (b: { kind: "info" | "err"; text: string } | null) => void,
) {
  if (!(await confirmModal({ message: "Mark this stop a no-show? Everyone clocks out and the schedule pulls earlier.", destructive: true }))) return;
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
  initialSelected,
  onCancel,
}: {
  employees: Employee[];
  onSet: (people: Employee[]) => void;
  busy: boolean;
  initialSelected?: string[];
  onCancel?: () => void;
}) {
  const [sel, setSel] = useState<Record<string, boolean>>(() => {
    const out: Record<string, boolean> = {};
    (initialSelected ?? []).forEach((id) => { out[id] = true; });
    return out;
  });
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
      {onCancel && (
        <button
          onClick={onCancel}
          style={{ ...SMALL_BTN, marginTop: 12, width: "100%", color: MUTED, borderColor: LINE }}
        >
          CANCEL
        </button>
      )}
    </div>
  );
}


/* ============================================================
 * CLOCKING AS — sticky identity header
 * ============================================================ */
function ClockingAsHeader({
  me,
}: {
  me: Me;
  roster: RosterMember[];
}) {
  return (
    <div
      style={{
        padding: "6px 14px 0",
        display: "flex",
        alignItems: "center",
        gap: 8,
        flexWrap: "wrap",
      }}
    >
      <span style={{ color: MUTED, fontSize: 11, letterSpacing: 1 }}>CLOCKING AS:</span>
      <span style={{ color: LIME, fontSize: 12, letterSpacing: 1 }}>{me.name.toUpperCase()}</span>
    </div>
  );
}

/* ============================================================
 * PERSONAL CLOCK PANEL — replaces whole-crew grids
 * ============================================================ */

function PersonalClockPanel({
  me,
  roster,
  clientMatch,
  now,
  isPreview,
  send,
  setBanner,
  breakFrom,
  setBreakFrom,
  afterClockOut,
  outBlockedReason,
}: {
  me: Me;
  roster: RosterMember[];
  clientMatch: string | null;
  now: number;
  isPreview: boolean;
  send: (b: unknown, o?: { silent?: boolean }) => Promise<{ ok: boolean; raw: unknown }>;
  setBanner: (b: { kind: "info" | "err"; text: string } | null) => void;
  breakFrom: string | null;
  setBreakFrom: (v: string | null) => void;
  /** Lead's end of day: run after the clock-out actually registers. */
  afterClockOut?: () => void;
  /** T2 (8/2): non-null blocks every OUT action, with this reason shown. */
  outBlockedReason?: string | null;
}) {
  const row = roster.find((r) => r.id === me.id);
  const open = !!row?.in && !row?.out;
  const onOverhead = open && isOverheadClient(row?.client);
  const onClient = open && !onOverhead;
  const onBreakState = !open && !!breakFrom;
  const [busy, setBusy] = useState(false);

  const labelFor = (c: string) => (isOverheadClient(c) ? "B&V" : c);

  const doClockIn = async (client: string) => {
    if (isPreview) return;
    setBusy(true);
    if (!roster.some((r) => r.id === me.id)) {
      const j = await send({ action: "joinRoster", id: me.id, name: me.name, role: me.role || "assistant" }, { silent: true });
      if (!j.ok) {
        setBusy(false);
        setBanner({ kind: "err", text: "Couldn't join roster — retry." });
        return;
      }
      void resolveTeam(me.id);
    }
    const r = await send({ action: "qbClock", userId: me.id, dir: "in", client });
    setBusy(false);
    if (!r.ok) setBanner({ kind: "err", text: "Clock in failed — retry." });
    else setBreakFrom(null);
  };

  const doSwitch = async (fromClient: string, toClient: string) => {
    if (isPreview) return;
    setBusy(true);
    const outR = await send({ action: "qbClock", userId: me.id, dir: "out", client: fromClient }, { silent: true });
    if (!outR.ok) {
      setBusy(false);
      setBanner({ kind: "err", text: `Switch from ${labelFor(fromClient)} failed — retry.` });
      return;
    }
    const inR = await send({ action: "qbClock", userId: me.id, dir: "in", client: toClient }, { silent: true });
    setBusy(false);
    if (!inR.ok) {
      setBanner({ kind: "err", text: `Switched out but couldn't switch in to ${labelFor(toClient)} — retry.` });
    } else {
      setBanner(null);
      setBreakFrom(null);
    }
  };

  const startBreak = async (fromClient: string) => {
    if (isPreview) return;
    setBusy(true);
    const r = await send({ action: "qbClock", userId: me.id, dir: "out", client: fromClient });
    setBusy(false);
    if (r.ok) {
      setBreakFrom(fromClient);
      // Only once the clock-out has registered: payroll confirm is the last
      // step of the day, and it needs this entry closed to total correctly.
      afterClockOut?.();
    } else {
      setBanner({ kind: "err", text: "Break failed — retry." });
    }
  };

  const since = row?.in
    ? `Since ${fmtTime(row.in)} · ${elapsed(row.in, now)}`
    : null;

  // While on the clock, every available action here starts with a clock-out
  // (break, switch, end shift) — so an out-block disables the whole panel.
  // Off the clock the actions are INs, which are never blocked.
  const outGated = open && !!outBlockedReason;
  const disabled = busy || isPreview || outGated;

  let primary: { label: string; onClick: () => void; enabled: boolean } | null = null;
  let secondary: { label: string; onClick: () => void } | null = null;

  if (onBreakState && breakFrom) {
    primary = {
      label: `RESUME — ${labelFor(breakFrom)}`,
      onClick: () => void doClockIn(breakFrom),
      enabled: true,
    };
  } else if (!open) {
    primary = {
      label: "CLOCK IN — B&V",
      onClick: () => void doClockIn(OVERHEAD_CLIENT),
      enabled: true,
    };
  } else if (onOverhead && clientMatch) {
    primary = {
      label: `SWITCH TO ${clientMatch.toUpperCase()}`,
      onClick: () => void doSwitch(OVERHEAD_CLIENT, clientMatch),
      enabled: true,
    };
    secondary = { label: "BREAK TIME", onClick: () => void startBreak(OVERHEAD_CLIENT) };
  } else if (onOverhead && !clientMatch) {
    primary = {
      label: "BREAK TIME",
      onClick: () => void startBreak(OVERHEAD_CLIENT),
      enabled: true,
    };
  } else if (onClient) {
    const c = row?.client ?? clientMatch ?? "";
    primary = {
      label: "SWITCH TO BREAK TIME",
      onClick: () => void startBreak(c),
      enabled: true,
    };
    secondary = {
      label: "SWITCH TO BRAMBLE & VINE",
      onClick: () => void doSwitch(c, OVERHEAD_CLIENT),
    };
  }

  return (
    <div style={{ ...PANEL_BOX, marginTop: 4 }}>
      <div style={{ color: MUTED, fontSize: 11, letterSpacing: 1 }}>YOUR CLOCK</div>
      {primary && (
        <button
          onClick={primary.onClick}
          disabled={disabled || !primary.enabled}
          style={{
            ...PRIMARY_BTN,
            width: "100%",
            marginTop: 10,
            opacity: disabled ? 0.5 : 1,
            whiteSpace: "normal",
            lineHeight: 1.2,
            padding: "10px 12px",
            minHeight: 56,
          }}
        >
          {primary.label}
        </button>
      )}
      {secondary && (
        <button
          onClick={secondary.onClick}
          disabled={disabled}
          style={{
            ...PRIMARY_BTN,
            width: "100%",
            marginTop: 8,
            opacity: disabled ? 0.5 : 1,
          }}
        >
          {secondary.label}
        </button>
      )}
      {outGated && (
        <div style={{ color: MUTED, fontSize: 11, marginTop: 8, textAlign: "center", letterSpacing: 0.5 }}>
          ⏳ {outBlockedReason}
        </div>
      )}
      {since && (
        <div style={{ color: MUTED, fontSize: 11, marginTop: 8, textAlign: "center" }}>{since}</div>
      )}
    </div>
  );
}



function ClientHeader({
  event,
  clientMatch,
  state,
  inventory = [],
  knownInventory = [],
  zoneMap = "",
  specialMessage = "",
  send,
  panelDisabled = false,
}: {
  event: EventItem;
  clientMatch: string | null;
  state: RouteState;
  inventory?: string[];
  knownInventory?: string[];
  zoneMap?: string;
  specialMessage?: string;
  send?: (b: unknown, o?: { silent?: boolean }) => Promise<{ ok: boolean; raw: unknown }>;
  panelDisabled?: boolean;
}) {
  // Tapping the client name opens the reference panel (operational only —
  // never gate codes or WiFi; those have their own lead-gated action).
  const [panelOpen, setPanelOpen] = useState(false);
  const label = clientMatch ?? event.title;
  const canOpen = !!clientMatch && !!send && !panelDisabled;
  return (
    <div style={{ padding: "14px 14px 0" }}>
      <div style={{ color: MUTED, fontSize: 11, letterSpacing: 1 }}>{state.toUpperCase()}</div>
      {canOpen ? (
        <button
          onClick={() => setPanelOpen(true)}
          style={{
            display: "block",
            background: "transparent",
            border: "none",
            padding: 0,
            marginTop: 2,
            color: LIME,
            fontFamily: "inherit",
            fontSize: 22,
            fontWeight: "bold",
            textAlign: "left",
            cursor: "pointer",
            borderBottom: `1px dashed ${LIME_DIM}`,
          }}
          aria-label={`Open ${label} reference`}
        >
          {label}
        </button>
      ) : (
        <div style={{ color: LIME, fontSize: 22, fontWeight: "bold", marginTop: 2 }}>{label}</div>
      )}
      <div style={{ color: MUTED, fontSize: 12, marginTop: 2 }}>
        {fmtTime(event.start)}{event.end ? ` – ${fmtTime(event.end)}` : ""}
      </div>
      {!clientMatch && (
        <div style={{ color: RED, fontSize: 12, marginTop: 6 }}>
          no client match — tell Brandon
        </div>
      )}
      {panelOpen && clientMatch && send && (
        <ClientRefPanel
          client={clientMatch}
          inventory={inventory}
          knownInventory={knownInventory}
          zoneMap={zoneMap}
          specialMessage={specialMessage}
          send={send}
          onClose={() => setPanelOpen(false)}
        />
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
  onBackToCrew,
  backNotice,
  onSkip,
  skipDisabled,
  isPreview,
}: {
  event?: EventItem;
  clientMatch: string | null;
  isLead: boolean;
  projects: ProjectRow[];
  busy: boolean;
  onHere: () => void;
  headerNote?: string;
  onBackToCrew?: () => void;
  backNotice?: string | null;
  onSkip?: () => void;
  skipDisabled?: boolean;
  isPreview?: boolean;
}) {
  if (!event) return <div style={STATE}>No upcoming stop.</div>;
  const address = event.location ?? "";
  const mapsUrl = address
    ? "https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=" + encodeURIComponent(address)
    : "";
  const fallbackHref =
    "https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=" +
    encodeURIComponent(address);

  void projects;

  return (
    <div style={{ padding: "10px 14px" }}>
      {onBackToCrew && (
        <div style={{ marginBottom: 6 }}>
          <button
            onClick={onBackToCrew}
            disabled={!!isPreview}
            style={{
              background: "transparent",
              border: "none",
              color: DIM_GREEN,
              fontFamily: "inherit",
              fontSize: 12,
              letterSpacing: 1,
              padding: "4px 0",
              cursor: isPreview ? "default" : "pointer",
              opacity: isPreview ? 0.5 : 1,
            }}
          >
            ← CREW
          </button>
          {backNotice && (
            <div style={{ color: RED, fontSize: 12, marginTop: 4, opacity: 0.85 }}>
              {backNotice}
            </div>
          )}
        </div>
      )}
      {headerNote && (
        <div style={{ color: LIME, fontSize: 12, letterSpacing: 2, marginBottom: 6 }}>{headerNote}</div>
      )}
      <div style={PANEL_BOX}>
        <div style={{ color: MUTED, fontSize: 11, letterSpacing: 1 }}>ADDRESS</div>
        <div style={{ color: TEXT, fontSize: 18, marginTop: 6, lineHeight: 1.4, wordBreak: "break-word" }}>
          {address || <span style={{ color: MUTED }}>No address set</span>}
        </div>
      </div>

      {/* M4 (8/2): the upcoming visit's plan, from its calendar event. */}
      {event.description?.trim() && (
        <div style={{ ...PANEL_BOX, marginTop: 12 }}>
          <div style={{ color: MUTED, fontSize: 11, letterSpacing: 1 }}>NEXT VISIT'S PLAN</div>
          <EventPlanBody text={event.description.trim()} />
        </div>
      )}

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
            {/* GG (8/2): this always set 'arrived' — now it says so. The
                Start Visit step lives on the arrived screen. */}
            ARRIVED
          </button>
          {onSkip && (
            <button
              onClick={onSkip}
              disabled={!!skipDisabled || !!isPreview}
              style={{
                ...BIG_BTN,
                width: "100%",
                marginTop: 10,
                minHeight: 44,
                fontSize: 12,
                letterSpacing: 2,
                color: DIM_GREEN,
                borderColor: LIME_DIM,
                opacity: skipDisabled || isPreview ? 0.5 : 1,
              }}
            >
              SKIP THIS CLIENT
            </button>
          )}
        </div>
      )}
    </div>
  );
}


const BRIGHT_LIME = "#bfff3c";

function ItemPill({
  t,
  disabled,
  onClick,
  ignoreLoaded,
}: {
  t: NormTool;
  disabled?: boolean;
  onClick?: () => void;
  /** AD.7: render normal regardless of Loading's `loaded` flag. */
  ignoreLoaded?: boolean;
}) {
  const label = [t.qty, t.item, t.size].filter(Boolean).join(" ");
  const clickable = !disabled && !!onClick && !!t.materialId;
  return (
    <button
      type="button"
      onClick={clickable ? onClick : undefined}
      disabled={!clickable}
      title={t.notes || undefined}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        maxWidth: "100%",
        /* AD.7: `loaded` means "in the vehicle" — a Loading-screen fact.
           On the visit screen it must not read as "already done". */
        background: !ignoreLoaded && t.loaded ? BRIGHT_LIME : BG,
        color: !ignoreLoaded && t.loaded ? BG : BRIGHT_LIME,
        border: `1px solid ${BRIGHT_LIME}`,
        borderRadius: 999,
        padding: "4px 10px",
        fontFamily: "inherit",
        fontSize: 12,
        lineHeight: 1.3,
        cursor: clickable ? "pointer" : "default",
        textAlign: "left",
        textDecoration: !ignoreLoaded && t.loaded ? "line-through" : "none",
        opacity: !ignoreLoaded && !t.materialId ? 0.55 : 1,
      }}
    >
      <span style={{ whiteSpace: "normal", wordBreak: "break-word" }}>{label}</span>
    </button>
  );
}

function ProjectCard({
  p,
  items,
  busy,
  onToggleTool,
  crossed,
  onToggleCrossed,
}: {
  p: ProjectRow;
  items: NormTool[];
  busy?: boolean;
  onToggleTool?: (t: NormTool) => void;
  /** AD.8: this project is struck through — done today (recurring) or
   *  permanently (special). */
  crossed?: boolean;
  onToggleCrossed?: () => void;
}) {
  const action = s(p["Project Action"]) || s(p["Action"]) || "—";
  const type = s(p["Type"]);
  const notes = s(p["Notes"]);
  return (
    <div
      style={{
        ...PANEL_BOX,
        marginTop: 8,
        opacity: crossed ? 0.5 : 1,
        cursor: onToggleCrossed ? "pointer" : "default",
      }}
      /* AD.8: tapping the CARD toggles it, but never when the tap landed
         on a button (item pills and any future controls keep their own
         behaviour). */
      onClick={
        onToggleCrossed
          ? (e) => {
              if ((e.target as HTMLElement).closest("button")) return;
              onToggleCrossed();
            }
          : undefined
      }
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <div
          style={{
            color: BRIGHT_LIME,
            fontSize: 14,
            fontWeight: "bold",
            flex: 1,
            lineHeight: 1.35,
            textDecoration: crossed ? "line-through" : "none",
          }}
        >
          {action}
        </div>
        {type && <span style={PILL_DIM}>{type.toUpperCase()}</span>}
      </div>
      {items.length > 0 && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
            marginTop: 8,
            paddingLeft: 12,
          }}
        >
          {items.map((t, i) => (
            <ItemPill
              key={`${t.row}-${i}`}
              t={t}
              /* AD.7: "loaded" is a LOADING-screen concept. On the visit
                 screen those same rows were rendering in the filled/
                 checked-off treatment, reading as already done. Items
                 here always render normal. */
              ignoreLoaded
              disabled={busy}
              onClick={onToggleTool ? () => onToggleTool(t) : undefined}
            />
          ))}
        </div>
      )}
      {notes && <div style={{ color: DIM_GREEN, fontSize: 12, marginTop: 6, lineHeight: 1.4 }}>{notes}</div>}
    </div>
  );
}

/* ============================================================
 * ASSISTANT LOADING GATE — pre-navigate step for assistants at
 * first stop. Hides Navigate until the lead has confirmed the day
 * AND every filtered loading item is checked off.
 * ============================================================ */
function AssistantLoadingGate({
  clockSlot,
  confirmed,
  items,
  ready,
  onToggle,
  allLoaded,
  loadingDone,
  departed,
  busy,
  skipText,
  onComplete,
  onDepart,
}: {
  clockSlot?: React.ReactNode;
  confirmed: boolean;
  items: LoadingItem[];
  ready: boolean;
  onToggle: (row: number) => void;
  allLoaded: boolean;
  loadingDone: boolean;
  departed: boolean;
  busy: boolean;
  /** First stop's client has AF="No" — depart without any auto-text. */
  skipText: boolean;
  onComplete: () => void;
  onDepart: (withText: boolean) => void;
}) {
  const grouped = useMemo(() => {
    const by = new Map<string, LoadingItem[]>();
    for (const it of items) {
      const arr = by.get(it.client) ?? [];
      arr.push(it);
      by.set(it.client, arr);
    }
    return Array.from(by.entries());
  }, [items]);
  const total = items.length;
  const done = items.filter((i) => i.loaded).length;

  return (
    <div style={{ padding: "10px 14px" }}>
      {clockSlot}
      {!confirmed && (
        <div
          style={{
            marginTop: 14,
            padding: "18px 16px",
            border: `2px dashed ${LIME}`,
            borderRadius: 12,
            background: PANEL,
            color: LIME,
            textAlign: "center",
            fontSize: 15,
            fontWeight: "bold",
            letterSpacing: 2,
            textTransform: "uppercase",
            boxShadow: "0 0 22px rgba(124,255,0,.12)",
          }}
        >
          Waiting for Daily Load Confirmation
          <div style={{ color: DIM_GREEN, fontSize: 12, marginTop: 8, letterSpacing: 1, fontWeight: "normal", textTransform: "none" }}>
            Lead will confirm the day's load shortly. Navigate unlocks after loading is done.
          </div>
        </div>
      )}

      {confirmed && (
        <>
          <div style={{ marginTop: 14, color: LIME, fontSize: 14, letterSpacing: 2, fontWeight: "bold" }}>
            LOADING · {done} / {total}
          </div>
          {!ready && (
            <div style={{ color: MUTED, fontSize: 12, marginTop: 6 }}>Fetching list…</div>
          )}
          {ready && total === 0 && (
            <div style={{ color: DIM_GREEN, fontSize: 13, marginTop: 8, lineHeight: 1.4 }}>
              No special loading items today.
            </div>
          )}
          {grouped.map(([client, rows]) => {
            const cDone = rows.filter((r) => r.loaded).length;
            return (
              <div
                key={client}
                style={{
                  marginTop: 12,
                  background: PANEL,
                  border: `1px solid ${LINE}`,
                  borderRadius: 8,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    padding: "10px 12px",
                    borderBottom: `1px solid ${LINE}`,
                    color: LIME,
                    fontSize: 12,
                    letterSpacing: 2,
                    fontWeight: "bold",
                    display: "flex",
                    justifyContent: "space-between",
                    textTransform: "uppercase",
                  }}
                >
                  <span>{client}</span>
                  <span style={{ color: cDone === rows.length ? LIME : DIM_GREEN }}>
                    {cDone}/{rows.length}
                  </span>
                </div>
                <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                  {rows.map((it) => (
                    <li
                      key={it.row}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "12px 12px",
                        borderTop: `1px solid ${LINE}`,
                        cursor: "pointer",
                      }}
                      onClick={() => onToggle(it.row)}
                    >
                      <div
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 6,
                          border: `2px solid ${it.loaded ? LIME : LIME_DIM}`,
                          background: it.loaded ? LIME : "transparent",
                          color: BG,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontWeight: "bold",
                          flex: "0 0 auto",
                        }}
                      >
                        {it.loaded ? "✓" : ""}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            color: it.loaded ? MUTED : TEXT,
                            textDecoration: it.loaded ? "line-through" : "none",
                            fontSize: 14,
                          }}
                        >
                          {it.item}
                          {it.qty ? ` · ${it.qty}` : ""}
                          {it.size ? ` · ${it.size}` : ""}
                        </div>
                        {it.notes && (
                          <div style={{ color: DIM_GREEN, fontSize: 12, marginTop: 2 }}>
                            {it.notes}
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </>
      )}

      {confirmed && ready && allLoaded && !departed && (
        <div style={{ marginTop: 18 }}>
          {!loadingDone ? (
            <button
              onClick={onComplete}
              disabled={busy}
              style={{ ...PRIMARY_BTN, opacity: busy ? 0.6 : 1 }}
            >
              LOADING COMPLETE
            </button>
          ) : (
            <>
              <button disabled style={{ ...PRIMARY_BTN, opacity: 0.35 }}>
                LOADING COMPLETE ✓
              </button>
              <button
                onClick={() => onDepart(!skipText)}
                disabled={busy}
                style={{ ...PRIMARY_BTN, marginTop: 10, opacity: busy ? 0.6 : 1 }}
              >
                {skipText ? "NAVIGATE (NO TEXT)" : "NAVIGATE & SEND TEXT"}
              </button>
              {!skipText && (
                <button
                  onClick={() => onDepart(false)}
                  disabled={busy}
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
              )}
            </>
          )}
        </div>
      )}

      {!(confirmed && ready && allLoaded) && (
        <div
          style={{
            marginTop: 18,
            color: DIM_GREEN,
            fontSize: 11,
            letterSpacing: 1,
            textAlign: "center",
            textTransform: "uppercase",
          }}
        >
          Navigate unlocks once the day is confirmed and everything's loaded.
        </div>
      )}
    </div>
  );
}

/* ============================================================ */

function StateArrived({
  skipSameDayTexts,
  textsSuppressed,
  arrivalToContact,
  roster,
  clientMatch,
  stopIndex,
  isLead,
  busy,
  clockSlot,
  onBackToCrew,
  backNotice,
  isPreview,
  role,
  event,
  send,
  locationCheck,
  vendorStop,
  isBreak,
  hasArrived,
  onArrived,
  onArriveAndSwitch,
  onArriveAndSwitchNoText,
  onNoShow,
}: {
  skipSameDayTexts: boolean;
  textsSuppressed: boolean;
  /** Arrival text is routed to a contact, not the client (specialTextClients). */
  arrivalToContact?: boolean;
  roster: RosterMember[];
  clientMatch: string | null;
  stopIndex: number;
  isLead: boolean;
  busy: boolean;
  clockSlot?: React.ReactNode;
  onBackToCrew?: () => void;
  backNotice?: string | null;
  isPreview?: boolean;
  role: ReturnType<typeof useViewAs>["effectiveRole"];
  event?: EventItem;
  send: (b: unknown, o?: { silent?: boolean }) => Promise<{ ok: boolean; raw: unknown }>;
  locationCheck?: { near?: boolean; client?: string } | null;
  vendorStop?: FieldVendor | null;
  /** Scheduled Lunch Break stop (JJ/HH) — not a client visit. */
  isBreak?: boolean;
  /** GG: the explicit ARRIVED action has been taken for this stop. */
  hasArrived: boolean;
  onArrived: () => void;
  /** AB: arrive + clock onto this client + send the arrival text. */
  onArriveAndSwitch: () => void;
  /** AB.5: same, with the text forced off. */
  onArriveAndSwitchNoText: () => void;
  onNoShow: () => void;
}) {
  // Only true client appointments carry No Show, texting copy and the
  // Start Visit & Switch step (HH.6 — clients are unaffected).
  const clientStop = !vendorStop && !isBreak;
  const anyIn = roster.some((m) => !!m.in);
  const alreadyTexted = hasTexted(clientMatch, "arrived", stopIndex);
  // M2 (8/2): the clock requirement only applies to crew who actually run a
  // clock. Management never clocks in (iron rule since v7.4.8), so a solo
  // management run left this button permanently darkened — the live-run bug.
  const clockGate = role === "management" ? false : !anyIn;
  const [navigated, setNavigated] = useState(() => hasNavigated(stopIndex));
  useEffect(() => {
    setNavigated(hasNavigated(stopIndex));
  }, [stopIndex]);

  const label = vendorStop?.vendor ?? clientMatch ?? event?.title ?? "this client";
  const address = event?.location ?? vendorStop?.address ?? "";
  const mapsUrl = address
    ? "https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=" + encodeURIComponent(address)
    : "";

  const handleNavigate = async () => {
    // Skip the ETA offer outright when texts are suppressed (already texted
    // today, AF opt-out, or a vendor stop) - asking and then not sending
    // would be worse than not asking.
    const wantsText = textsSuppressed ? false : await confirmModal(`Text ${label} your ETA?`);
    if (wantsText) {
      const r = await send({ action: "textClient", kind: "eta" }, { silent: true });
      const raw = (r.raw ?? {}) as { ok?: boolean; to?: string; error?: string };
      if (r.ok && raw.ok !== false) {
        toast.success(`ETA sent to ${raw.to ?? label}`);
      } else {
        toast.error(raw.error || "ETA text failed");
      }
    }
    if (mapsUrl) window.open(mapsUrl, "_blank", "noopener,noreferrer");
    markNavigated(stopIndex);
    setNavigated(true);
  };

  /* AA (8/2): the stop summary and Start Visit / No Show used to hide until
     THIS DEVICE had tapped NAVIGATE (a sessionStorage flag) — so landing
     here from the en-route line after a PWA restart, or on a device that
     departed from the Loading screen, showed nothing but a NAVIGATE button.
     The arrival actions are the point of this screen; they render always.
     NAVIGATE still shows until used on this device, as an option not a gate. */
  const showNormal = true;

  // Request geolocation permission on first render of Navigate (fail silent).
  useEffect(() => {
    if (isPreview) return;
    if (navigated) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    try {
      navigator.geolocation.getCurrentPosition(() => {}, () => {}, { timeout: 15_000 });
    } catch { /* ignore */ }
    // Only trigger once when the Navigate button is first shown for this stop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopIndex]);

  const nearBanner = (() => {
    if (!locationCheck?.near) return null;
    if (!clientMatch) return null;
    const lc = (locationCheck.client ?? "").trim().toLowerCase();
    if (lc && lc !== clientMatch.trim().toLowerCase()) return null;
    return `You're near ${clientMatch} — ready to start?`;
  })();

  return (
    <div style={{ padding: "10px 14px" }}>
      {onBackToCrew && (
        <div style={{ marginBottom: 6 }}>
          <button
            onClick={onBackToCrew}
            disabled={!!isPreview}
            style={{
              background: "transparent",
              border: "none",
              color: DIM_GREEN,
              fontFamily: "inherit",
              fontSize: 12,
              letterSpacing: 1,
              padding: "4px 0",
              cursor: isPreview ? "default" : "pointer",
              opacity: isPreview ? 0.5 : 1,
            }}
          >
            ← CREW
          </button>
          {backNotice && (
            <div style={{ color: RED, fontSize: 12, marginTop: 4, opacity: 0.85 }}>
              {backNotice}
            </div>
          )}
        </div>
      )}
      {!clientMatch && !vendorStop && <div style={{ color: RED, fontSize: 12, marginBottom: 8 }}>no client match — tell Brandon</div>}
      {/* AB.4 (8/2): the generic "CLOCK IN — B&V" panel is gone from the
          CLIENT arrival screen — the one combined button below does the
          clocking. Vendor stops and breaks keep it. */}
      {!clientStop && clockSlot}

      {/* Tax-exempt reminder (F/G7): always fires for flagged vendors —
          with the ID when known, never silently absent. */}
      {vendorStop?.taxExempt && (
        <div
          style={{
            marginTop: 12,
            padding: "8px 10px",
            border: `1px solid ${LIME_DIM}`,
            borderRadius: 4,
            color: LIME,
            fontSize: 12,
            letterSpacing: 0.5,
            background: "rgba(124,255,0,0.06)",
          }}
        >
          {vendorStop.taxExemptId
            ? `TAX-EXEMPT ACCOUNT ON FILE — ID: ${vendorStop.taxExemptId}`
            : "TAX-EXEMPT ACCOUNT ON FILE — ID not yet recorded"}
        </div>
      )}

      {/* AB.1 (8/2): the plan comes FIRST and dominates the screen — the
          crew is here to read it, not to hunt for buttons. */}
      {event?.description?.trim() && (
        <div style={{ ...PANEL_BOX, marginTop: 14 }}>
          <div style={{ color: MUTED, fontSize: 11, letterSpacing: 1 }}>TODAY'S PLAN</div>
          <EventPlanBody text={event.description.trim()} />
        </div>
      )}

      {/* AB.3: no NAVIGATE on the CLIENT arrival screen — you cannot reach
          it without having already travelled, so the button was redundant.
          Vendor stops and breaks keep it. */}
      {!clientStop && !navigated && (
        <button
          type="button"
          onClick={handleNavigate}
          disabled={busy || !address}
          style={{ ...NAVIGATE_BTN, opacity: address ? 1 : 0.45, marginTop: 14 }}
        >
          NAVIGATE
        </button>
      )}

      {nearBanner && (
        <div
          style={{
            marginTop: 14,
            padding: "8px 10px",
            border: `1px solid ${LIME_DIM}`,
            borderRadius: 4,
            color: LIME,
            fontSize: 12,
            letterSpacing: 0.5,
            background: "rgba(124,255,0,0.06)",
          }}
        >
          {nearBanner}
        </div>
      )}

      {/* GG (8/2): for VENDOR stops and breaks, arriving is still its own
          explicit act and goes straight into visit mode (HH.1). */}
      {!clientStop && !hasArrived && (
        <button
          onClick={onArrived}
          disabled={busy || !!isPreview}
          style={{ ...PRIMARY_BTN, marginTop: 14, opacity: busy || isPreview ? 0.6 : 1 }}
        >
          ARRIVED
        </button>
      )}

      {/* AB.4-7 (8/2): CLIENT stops collapse GG's two steps into ONE act —
          mark arrival, clock the presser onto this client, send the arrival
          text. First tap wins: only the first presser carries the
          "ARRIVED —" prefix and triggers the text; anyone tapping in later
          is just moving their own clock (AB.7). */}
      {clientStop && (
        <>
          <button
            onClick={onArriveAndSwitch}
            disabled={busy || !!isPreview}
            style={{ ...PRIMARY_BTN, marginTop: 14, opacity: busy || isPreview ? 0.6 : 1 }}
          >
            {hasArrived
              ? `SWITCH TO ${label.toUpperCase()}`
              : textsSuppressed
                ? `ARRIVED — SWITCH TO ${label.toUpperCase()} (NO TEXT)`
                : `ARRIVED — SWITCH TO ${label.toUpperCase()} & TEXT ${
                    arrivalToContact ? "CONTACT" : "CLIENT"
                  }`}
          </button>
          {/* AB.5: same manual override as TT.3's navigate escape hatch —
              force no-text even if the automatic AF check is wrong. */}
          {!hasArrived && (
            <button
              type="button"
              onClick={onArriveAndSwitchNoText}
              disabled={busy || !!isPreview}
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
              switch without texting
            </button>
          )}
        </>
      )}

      {/* AD.1 (8/2): NO SHOW no longer lives on the arrival screen — the
          crew frequently clocks in while waiting on site for access,
          before anyone knows whether the visit is happening. It moved to
          Visit In Progress. This screen now has exactly one main action
          plus its escape hatch. */}
    </div>
  );
}

/* ============================================================ */
function StateVisit({
  skipSameDayTexts,
  textsSuppressed,
  departureTextsSuppressed,
  departureToContact,
  event,
  clientMatch,
  vendorStop,
  stopIndex,
  arrivedAt,
  now,
  roster,
  isLead,
  delegated,
  onDelegate,
  projects,
  tools,
  busy,
  isPreview,
  notes,
  clockSlot,
  onBreak,
  /* ONSITE BREAK (8/4): distinct from onBreak, which is the leave-the-property
     flow. This one pauses the clock at THIS stop and never advances stopIndex. */
  onOnsiteLunch,
  onsiteBreakSince,
  onEndVisit,
  onCrossProject,
  onToggleTool,
  onVisitComplete,
  onNoShow,
  visitTimer,
  visitPhotos,
}: {
  /** XX-02: the client's Max Time budget measured against the LIVE crew count
   *  (visitTimerView_). Null when there is no budget — Flexible, TBD or blank. */
  visitTimer?: VisitTimerView | null;
  /** XX-02: before/after/project photo counts for THIS visit. */
  visitPhotos?: VisitPhotoTally | null;
  skipSameDayTexts: boolean;
  textsSuppressed: boolean;
  /** AG-derived: departure text suppressed (or vendor stop). */
  departureTextsSuppressed?: boolean;
  /** Departure text is routed to a contact, not the client. */
  departureToContact?: boolean;
  event?: EventItem;
  clientMatch: string | null;
  vendorStop?: FieldVendor | null;
  stopIndex: number;
  arrivedAt?: string | null;
  now: number;
  roster: RosterMember[];
  isLead: boolean;
  delegated: boolean;
  onDelegate: (v: boolean) => void;
  projects: ProjectRow[];
  tools: ToolRowRaw[];
  busy: boolean;
  isPreview: boolean;
  notes: VisitNote[];
  clockSlot?: React.ReactNode;
  onBreak?: () => void;
  onOnsiteLunch?: () => void;
  onsiteBreakSince?: string;
  /** LL.1: advance the route out of the visit (was silently missing). */
  onEndVisit: () => void;
  /** AD.8: persist a project's crossed-out state. */
  onCrossProject: (projectId: string, crossed: boolean) => void;
  onToggleTool: (t: NormTool) => void;
  onVisitComplete?: () => void;
  onNoShow: () => void;
}) {
  const alreadyTextedDone = hasTexted(clientMatch, "done", stopIndex);

  const clientKey = clientMatch ? clientMatch.trim().toLowerCase() : "";
  const clientProjects = clientKey
    ? projects.filter((p) => s(p["Client Name"]).trim().toLowerCase() === clientKey)
    : [];
  const projectIds = new Set(clientProjects.map((p) => s(p["Project ID"]).trim()).filter(Boolean));
  const normTools = useMemo<NormTool[]>(
    () =>
      (tools ?? [])
        .map((t) => ({
          row: Number(t.row ?? 0),
          materialId: s(t["Material ID"]),
          client: s(t["Client Name"]).trim(),
          project: s(t["Project ID"]).trim(),
          item: s(t["Item Name"]),
          qty: s(t["Quantity"]),
          size: s(t["Size"]),
          notes: s(t["Notes"]),
          loaded: t["Loaded Status"] === true,
        }))
        .filter(
          (t) =>
            t.item &&
            (clientKey === "" || t.client.toLowerCase() === clientKey),
        ),
    [tools, clientKey],
  );

  const [showOut, setShowOut] = useState(false);
  const [noteComposerOpen, setNoteComposerOpen] = useState(false);

  /* AD.8 (8/2): which cards are struck through. Seeded from the server's
     computed crossedActive (recurring stamps expire on their own, so the
     backend decides, not the client) and held locally between polls —
     the VV optimistic-write rule: pin the local value, let the server
     confirm it. */
  const serverCrossed = useMemo(
    () =>
      new Set(
        clientProjects
          .filter((p) => p.crossedActive === true)
          .map((p) => s(p["Project ID"]).trim())
          .filter(Boolean),
      ),
    [clientProjects],
  );
  const [pendingCross, setPendingCross] = useState<Record<string, boolean>>({});
  const crossedIds = useMemo(() => {
    const out = new Set(serverCrossed);
    for (const [pid, want] of Object.entries(pendingCross)) {
      if (want) out.add(pid);
      else out.delete(pid);
    }
    return out;
  }, [serverCrossed, pendingCross]);
  // Drop a pending flag once the server agrees (VV pattern).
  useEffect(() => {
    setPendingCross((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const [pid, want] of Object.entries(prev)) {
        if (serverCrossed.has(pid) === want) { delete next[pid]; changed = true; }
      }
      return changed ? next : prev;
    });
  }, [serverCrossed]);

  const onToggleCrossed = useCallback(
    (pid: string) => {
      if (!pid || !clientMatch) return;
      const want = !crossedIds.has(pid);
      setPendingCross((prev) => ({ ...prev, [pid]: want }));
      void onCrossProject(pid, want);
    },
    [crossedIds, clientMatch, onCrossProject],
  );

  return (
    <div style={{ padding: "10px 14px" }}>
      <div style={PANEL_BOX}>
        <div style={{ display: "flex", alignItems: "baseline" }}>
          <div style={{ color: LIME, fontSize: 18, fontWeight: "bold" }}>{vendorStop?.vendor ?? clientMatch ?? event?.title}</div>
          <div style={{ marginLeft: "auto", color: MUTED, fontSize: 12 }}>
            {arrivedAt ? `${elapsed(arrivedAt, now)} onsite` : "onsite"}
          </div>
        </div>
      </div>

      {/* AD.3/4 (8/2): Camera, + NOTE and Delegate Debrief all moved to
          the bottom of the screen with the other actions — the project
          cards own the space above them now. */}
      {noteComposerOpen && (
        <NoteComposer
          onClose={() => setNoteComposerOpen(false)}
          disabled={isPreview}
        />
      )}
      <NotesStrip notes={notes} disabled={isPreview} />
      {/* ONSITE BREAK (8/4): lunch WITHOUT leaving this stop. Deliberately its
          own control, sitting above the existing break button rather than
          replacing it — that one is for a crew that leaves the property and is
          untouched. This never advances stopIndex, so no second arrival, no
          duplicate client text, no second debrief. */}
      {onOnsiteLunch && (
        <div style={{ marginTop: 10 }}>
          {onsiteBreakSince ? (
            <div
              style={{
                ...PANEL_BOX,
                textAlign: "center",
                borderColor: "#ffb020",
              }}
            >
              <div style={{ color: "#ffb020", fontSize: 13, letterSpacing: 2 }}>
                ON BREAK
              </div>
              <div
                style={{
                  color: "#ffb020",
                  fontSize: 30,
                  fontWeight: "bold",
                  fontVariantNumeric: "tabular-nums",
                  marginTop: 4,
                }}
              >
                {breakElapsed(onsiteBreakSince, now)}
              </div>
              <div style={{ color: MUTED, fontSize: 10, marginTop: 4 }}>
                Clock paused · still at {clientMatch ?? "this stop"}
              </div>
              <button
                type="button"
                onClick={onOnsiteLunch}
                disabled={busy || isPreview}
                style={{
                  ...PRIMARY_BTN,
                  marginTop: 10,
                  background: "transparent",
                  color: "#ffb020",
                  border: "1px solid #ffb020",
                  opacity: busy || isPreview ? 0.5 : 1,
                  cursor: busy || isPreview ? "default" : "pointer",
                }}
              >
                END LUNCH
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onOnsiteLunch}
              disabled={busy || isPreview}
              style={{
                ...PRIMARY_BTN,
                background: "transparent",
                color: LIME,
                border: `1px solid ${LIME_DIM}`,
                opacity: busy || isPreview ? 0.5 : 1,
                cursor: busy || isPreview ? "default" : "pointer",
              }}
            >
              TAKE LUNCH
            </button>
          )}
        </div>
      )}
      {onBreak && (
        <div style={{ display: "flex", justifyContent: "center", marginTop: 10 }}>
          <button
            type="button"
            onClick={onBreak}
            disabled={busy || isPreview}
            style={{
              background: "transparent",
              border: `1px solid ${DIM_GREEN}`,
              color: DIM_GREEN,
              fontFamily: "inherit",
              fontSize: 11,
              letterSpacing: 1,
              padding: "6px 12px",
              borderRadius: 4,
              cursor: busy || isPreview ? "default" : "pointer",
              opacity: busy || isPreview ? 0.5 : 1,
            }}
          >
            BREAK TIME
          </button>
        </div>
      )}


      <div style={{ ...SECTION_HEAD, marginTop: 16 }}>PROJECTS</div>

      {clientProjects.length === 0 ? (
        <div style={{ color: MUTED, fontSize: 12, padding: "8px 4px" }}>No projects listed.</div>
      ) : (
        clientProjects.map((p, i) => {
          const pid = s(p["Project ID"]).trim();
          const items = pid
            ? normTools.filter((t) => t.project === pid)
            : [];
          return (
            <ProjectCard
              key={i}
              p={p}
              items={items}
              busy={busy}
              onToggleTool={onToggleTool}
              crossed={crossedIds.has(s(p["Project ID"]).trim())}
              onToggleCrossed={
                isPreview ? undefined : () => onToggleCrossed(s(p["Project ID"]).trim())
              }
            />
          );
        })
      )}

      {(() => {
        const unlinked = normTools.filter(
          (t) => !t.project || !projectIds.has(t.project),
        );
        if (unlinked.length === 0) return null;
        return (
          <>
            <div style={{ ...SECTION_HEAD, marginTop: 16, color: DIM_GREEN }}>
              UNLINKED ITEMS
            </div>
            <div
              style={{
                ...PANEL_BOX,
                marginTop: 8,
                opacity: 0.7,
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 6,
                }}
              >
                {unlinked.map((t, i) => (
                  <ItemPill
                    key={`u-${t.row}-${i}`}
                    t={t}
                    disabled={busy}
                    onClick={() => onToggleTool(t)}
                  />
                ))}
              </div>
              <div style={{ color: MUTED, fontSize: 11, marginTop: 8 }}>
                Item's Project ID doesn't match any project on this visit.
              </div>
            </div>
          </>
        );
      })()}


      {/* AD.6 (8/2): every action lives here at the bottom, in order —
          DEBRIEF (primary), NO SHOW, CAMERA, + NOTE, then Delegate as
          fine print. Order is Brandon's proposal, open to adjustment. */}
      <div style={{ ...SECTION_HEAD, marginTop: 20 }}>ACTIONS</div>

      {/* AD.5: the person actually on the visit needs their OWN debrief
          action — previously only "delegate" existed, which was an
          oversight. */}
      {isLead && !showOut && (
        <button
          onClick={() => {
            onVisitComplete?.();
            setShowOut(true);
            onEndVisit();
          }}
          disabled={!!isPreview}
          style={{ ...PRIMARY_BTN, marginTop: 8, opacity: isPreview ? 0.45 : 1 }}
        >
          {/* Departure is governed by AG, not AF — the label states exactly
              what the tap will do; the backend re-checks at send time. */}
          {departureTextsSuppressed
            ? "DEBRIEF (NO TEXT)"
            : `DEBRIEF & TEXT ${departureToContact ? "CONTACT" : "CLIENT"}`}
        </button>
      )}

      {/* AD.2: No Show moved here from the Arrived screen — the crew
          often clocks in while waiting on site for access, before the
          visit is confirmed to be happening at all. */}
      {isLead && (
        <button onClick={onNoShow} style={{ ...DANGER_BTN, marginTop: 10 }} disabled={busy}>
          NO SHOW
        </button>
      )}

      {/* XX-02: the reminder the visit timer never had.
          visitTimerTick has computed T-20/T-5 against the client's Max Time
          person-hour budget since v7.1.0 and announced them through
          ntfyPushRoles_, which delivers nothing — so nobody ever saw one. This
          banner is the delivery mechanism, and it PERSISTS rather than firing
          once: visits routinely run past their budget, and a one-shot alert at a
          moment already gone is no reminder at all. */}
      <VisitPhotoReminder
        timer={visitTimer}
        tally={visitPhotos}
        clientName={clientMatch ?? s(event?.title)}
        eventId={s(event?.id)}
        disabled={isPreview}
      />

      {/* AD.3: camera + note, relocated from the top of the screen. */}
      <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "flex-start" }}>
        <div style={{ flex: 1, display: "flex", gap: 8 }}>
          {/* Explicit tagging, defaulted by route state: on arrival BEFORE is
              the emphasised one, and once the budget is nearly spent AFTER is. */}
          <div style={{ flex: 1 }}>
            <VisitCamera
              clientName={clientMatch ?? s(event?.title)}
              disabled={isPreview}
              kind="before"
              eventId={s(event?.id)}
              emphasis={(visitTimer?.remainMin ?? 999) > 20}
            />
          </div>
          <div style={{ flex: 1 }}>
            <VisitCamera
              clientName={clientMatch ?? s(event?.title)}
              disabled={isPreview}
              kind="after"
              eventId={s(event?.id)}
              emphasis={(visitTimer?.remainMin ?? 999) <= 20}
            />
          </div>
        </div>
        <button
          type="button"
          onClick={() => setNoteComposerOpen(true)}
          disabled={isPreview}
          style={{ ...PRIMARY_BTN, width: 120, flex: "0 0 auto", opacity: isPreview ? 0.4 : 1 }}
        >
          + NOTE
        </button>
      </div>

      {/* AD.4: delegation is a rare exception, not a headline action —
          fine print, least prominent thing on the screen. */}
      <button
        type="button"
        onClick={() => onDelegate(!delegated)}
        disabled={isPreview}
        style={{
          display: "block",
          margin: "14px auto 0",
          background: "transparent",
          border: "none",
          color: delegated ? LIME : MUTED,
          fontFamily: "inherit",
          fontSize: 11,
          letterSpacing: 1,
          textDecoration: "underline",
          cursor: "pointer",
        }}
      >
        {delegated ? "✓ delegated — tap to revoke" : "delegate debrief (this visit)"}
      </button>

      {/* AD.5/6 (8/2): the old END VISIT button IS the DEBRIEF button now
          — same action (text the client, advance the route out of the
          visit, open the clock-out), moved up into the bottom action
          block under its real name. LL.1's route-advance fix is
          preserved there. */}

      {showOut && (
        <>
          <div style={{ ...SECTION_HEAD, marginTop: 16 }}>CLOCK OUT</div>
          {clockSlot}
          <div style={{ color: MUTED, fontSize: 11, textAlign: "center", marginTop: 10 }}>
            {/* KK.1 (8/2): debrief does NOT open itself — the T-5 warning
                prompts the crew to start it. Claiming otherwise was the
                bug; the debrief step is already open below. */}
            Clock out when you're done — the debrief is ready when you are.
          </div>
        </>
      )}
    </div>
  );
}

type NormTool = {
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

/**
 * XX-02: `kind` turns this into a BEFORE or AFTER capture.
 *
 * With a kind, the photo becomes a gallery item — the backend files a row and
 * shares the Drive file so the client's gallery can show it. Without one the
 * behaviour is exactly as before: Drive only, private, no gallery row. Tagging
 * is EXPLICIT for a reason — inferring before/after from timestamps is wrong
 * often enough to poison the data, because crews photograph a finished bed
 * mid-visit and start the next one.
 */

/* ---- XX-02: the visit photo reminder banner ----------------------------
 *
 * Two prompts, both PERSISTENT until satisfied:
 *   BEFORE — as soon as the visit starts, until a before photo exists
 *   AFTER  — from T-5 onward (and through overtime), until an after photo exists
 *
 * Persistent rather than one-shot on purpose. Visits routinely run past their
 * budget, so a single alert fired exactly at T-5 is a reminder you have already
 * missed. This keeps asking, and stops the moment the photo is filed.
 *
 * The timing is NOT the calendar's scheduled end. It is remainMin from
 * visitTimerView_, i.e. the client's Max Time person-hour budget measured
 * against the live crew count — so a bigger crew reaches T-5 sooner, which is
 * the correct behaviour and what a fixed end time could never express.
 */
type VisitTimerView = {
  client: string;
  crew: number;
  budgetPh: number;
  usedPh: number;
  remainMin: number;
  strict: boolean;
  phase: "ok" | "t20" | "t5" | "over";
};
type VisitPhotoTally = { before: number; after: number; project: number };

function VisitPhotoReminder({
  timer,
  tally,
  clientName,
  eventId,
  disabled,
}: {
  timer: VisitTimerView | null | undefined;
  tally: VisitPhotoTally | null | undefined;
  clientName: string;
  eventId: string;
  disabled: boolean;
}) {
  const needBefore = (tally?.before ?? 0) === 0;
  /* Ask for the after photo from T-5 onward. With no timer (Max Time blank,
     Flexible, or TBD) there is no budget to count down, so only the before
     prompt applies — inventing a deadline would be worse than none. */
  const nearEnd = !!timer && (timer.phase === "t5" || timer.phase === "over");
  const needAfter = nearEnd && (tally?.after ?? 0) === 0;

  if (disabled || (!needBefore && !needAfter)) return null;

  const rows: Array<{ kind: "before" | "after"; text: string; urgent: boolean }> = [];
  if (needBefore) {
    rows.push({ kind: "before", text: "Take a BEFORE photo for this visit.", urgent: false });
  }
  if (needAfter) {
    const over = timer!.phase === "over";
    rows.push({
      kind: "after",
      text: over
        ? (timer!.strict
            ? "Hard stop reached — take the AFTER photo now."
            : "Over the visit budget — take the AFTER photo.")
        : `About ${Math.max(0, timer!.remainMin)} min left — take the AFTER photo.`,
      urgent: over,
    });
  }

  return (
    <div style={{ marginTop: 10 }}>
      {rows.map((r) => (
        <div
          key={r.kind}
          role="status"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 12px",
            marginBottom: 6,
            borderRadius: 8,
            border: `1px solid ${r.urgent ? "#ff3b30" : r.kind === "after" ? "#c9a227" : LINE}`,
            background: r.urgent ? "rgba(255,59,48,.10)" : "rgba(255,255,255,.03)",
            color: r.urgent ? "#ff8a80" : MUTED,
            fontSize: 12,
            lineHeight: 1.4,
          }}
        >
          <span style={{ flex: 1 }}>📷 {r.text}</span>
        </div>
      ))}
      {/* The buttons themselves live directly below; the banner says WHAT and
          WHEN rather than duplicating the capture control. */}
    </div>
  );
}
function VisitCamera({
  clientName,
  disabled,
  kind,
  eventId,
  emphasis,
}: {
  clientName: string;
  disabled: boolean;
  kind?: "before" | "after";
  eventId?: string;
  /** Route state says this is the one they probably want next. */
  emphasis?: boolean;
}) {
  const [photos, setPhotos] = useState<VisitPhoto[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const upload = useCallback(
    async (id: string, base64: string, client: string) => {
      try {
        const res = await fetch(SCRIPT_URL, {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: JSON.stringify({
            action: "visitPhoto",
            data: base64,
            mime: "image/jpeg",
            client,
            /* Only sent for a tagged capture; without these the backend keeps
               today's private, non-gallery behaviour. */
            ...(kind ? { kind, eventId: eventId ?? "" } : {}),
          }),
        });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          projectPhotoLogged?: unknown;
        };
        /* A tagged photo is only "done" once it is FILED. The upload can succeed
           while the gallery row fails, and calling that ok would show a photo as
           in the client's gallery when it is not. */
        const filed = !kind || json.projectPhotoLogged === true;
        if (json.ok && filed) {
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
    [kind, eventId],
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
          ...(kind && !emphasis
            ? { ...SMALL_BTN, width: "100%", minHeight: 44 }
            : PRIMARY_BTN),
          opacity: disabled ? 0.4 : 1,
          cursor: disabled ? "not-allowed" : "pointer",
        }}
      >
        {kind === "before" ? "📷 BEFORE" : kind === "after" ? "📷 AFTER" : "📷 CAMERA"}
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
const NOTE_TYPE_META: Record<VisitNoteType, { label: string; short: string }> = {
  update: { label: "PROJECT UPDATE", short: "UPDATE" },
  item: { label: "ITEM USED", short: "ITEM" },
  future: { label: "FUTURE PROJECT", short: "FUTURE" },
  office: { label: "MESSAGE (office/client)", short: "MESSAGE" },
};

function NoteComposer({
  onClose,
  disabled,
}: {
  onClose: () => void;
  disabled: boolean;
}) {
  const [type, setType] = useState<VisitNoteType>("update");
  const [text, setText] = useState("");
  const [qty, setQty] = useState("");
  const [item, setItem] = useState<string>("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const canSave =
    !saving && !disabled && (type === "item" ? !!item.trim() : !!text.trim());

  const submit = async () => {
    if (!canSave) return;
    setSaving(true);
    const body: Record<string, unknown> = { action: "visitNote", type };
    if (type === "item") {
      body.item = item;
      if (qty.trim()) body.qty = qty.trim();
    } else {
      body.text = text.trim();
    }
    await postScript(body);
    setSaving(false);
    onClose();
  };

  const CHIP = (t: VisitNoteType) => (
    <button
      key={t}
      type="button"
      onClick={() => setType(t)}
      style={{
        background: type === t ? LIME : "transparent",
        color: type === t ? BG : LIME,
        border: `1px solid ${LIME_DIM}`,
        borderRadius: 999,
        padding: "6px 10px",
        fontFamily: "inherit",
        fontSize: 11,
        fontWeight: "bold",
        letterSpacing: 1,
        cursor: "pointer",
      }}
    >
      {NOTE_TYPE_META[t].short}
    </button>
  );

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.75)",
        zIndex: 250,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: BG,
          borderTop: `1px solid ${LINE}`,
          width: "100%",
          maxWidth: 560,
          padding: 14,
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", marginBottom: 10 }}>
          <div style={{ color: LIME, fontSize: 14, fontWeight: "bold", letterSpacing: 2 }}>
            + VISIT NOTE
          </div>
          <button
            onClick={onClose}
            style={{
              marginLeft: "auto",
              background: "transparent",
              color: MUTED,
              border: "none",
              fontSize: 20,
              cursor: "pointer",
            }}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
          {(Object.keys(NOTE_TYPE_META) as VisitNoteType[]).map(CHIP)}
        </div>

        {type === "item" ? (
          <>
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              style={{
                width: "100%",
                background: PANEL,
                color: item ? LIME : MUTED,
                border: `1px solid ${LINE}`,
                borderRadius: 6,
                padding: "10px 12px",
                fontFamily: "inherit",
                fontSize: 13,
                textAlign: "left",
                cursor: "pointer",
              }}
            >
              {item || "Select item from catalog…"}
            </button>
            <input
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder="Qty"
              inputMode="decimal"
              style={{
                width: "100%",
                background: BG,
                color: TEXT,
                border: `1px solid ${LINE}`,
                borderRadius: 6,
                padding: "10px 12px",
                fontFamily: "inherit",
                fontSize: 14,
                marginTop: 8,
                boxSizing: "border-box",
              }}
            />
          </>
        ) : (
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={
              type === "update"
                ? "Project status update…"
                : type === "future"
                  ? "Future project idea…"
                  : "Message for office/client…"
            }
            style={{
              width: "100%",
              minHeight: 90,
              background: BG,
              color: TEXT,
              border: `1px solid ${LINE}`,
              borderRadius: 6,
              padding: "10px 12px",
              fontFamily: "inherit",
              fontSize: 14,
              resize: "vertical",
              boxSizing: "border-box",
            }}
          />
        )}

        <button
          type="button"
          onClick={submit}
          disabled={!canSave}
          style={{
            ...PRIMARY_BTN,
            marginTop: 12,
            opacity: canSave ? 1 : 0.4,
            cursor: canSave ? "pointer" : "not-allowed",
          }}
        >
          {saving ? "SAVING…" : "SAVE NOTE"}
        </button>

        {pickerOpen && (
          <ItemPicker
            onCancel={() => setPickerOpen(false)}
            onAdd={(p) => {
              setItem(p.name);
              if (!qty && p.qty) setQty(p.qty);
              setPickerOpen(false);
            }}
          />
        )}
      </div>
    </div>
  );
}

function NotesStrip({
  notes,
  disabled,
}: {
  notes: VisitNote[];
  disabled: boolean;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [photoTargetId, setPhotoTargetId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  // local optimistic photo count per note
  const [pendingPhotoIds, setPendingPhotoIds] = useState<Record<string, number>>({});

  const remove = async (id: string) => {
    if (disabled) return;
    setBusyId(id);
    await postScript({ action: "visitNote", delete: id });
    setBusyId(null);
  };

  const handleFiles = async (files: FileList | null) => {
    const noteId = photoTargetId;
    setPhotoTargetId(null);
    if (!files || !noteId || disabled) return;
    for (const file of Array.from(files)) {
      try {
        const { base64 } = await downscaleToJpegBase64(file);
        setPendingPhotoIds((prev) => ({
          ...prev,
          [noteId]: (prev[noteId] ?? 0) + 1,
        }));
        void postScript({
          action: "visitPhoto",
          data: base64,
          mime: "image/jpeg",
          noteId,
        });
      } catch {
        // skip
      }
    }
  };

  if (!notes.length && !Object.keys(pendingPhotoIds).length) return null;

  return (
    <div style={{ marginTop: 12 }}>
      <div style={SECTION_HEAD}>NOTES ({notes.length})</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {notes.map((n) => {
          const meta = NOTE_TYPE_META[n.type];
          const photoCount = (n.photos?.length ?? 0) + (pendingPhotoIds[n.id] ?? 0);
          const body =
            n.type === "item"
              ? `${n.item ?? ""}${n.qty ? ` × ${n.qty}` : ""}`
              : (n.text ?? "");
          return (
            <div
              key={n.id}
              style={{
                background: PANEL,
                border: `1px solid ${LINE}`,
                borderRadius: 8,
                padding: "8px 10px",
                display: "flex",
                alignItems: "flex-start",
                gap: 8,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    color: DIM_GREEN,
                    fontSize: 9,
                    letterSpacing: 2,
                    fontWeight: "bold",
                  }}
                >
                  {meta?.short ?? n.type.toUpperCase()}
                  {photoCount > 0 && (
                    <span style={{ color: LIME, marginLeft: 6 }}>
                      · 📷 {photoCount}
                    </span>
                  )}
                  {n.createdAt && (
                    <span style={{ color: MUTED, marginLeft: 6, letterSpacing: 1 }}>
                      · {formatNoteTime(n.createdAt)}
                    </span>
                  )}
                </div>
                <div
                  style={{
                    color: TEXT,
                    fontSize: 13,
                    marginTop: 2,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {body}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPhotoTargetId(n.id);
                  requestAnimationFrame(() => fileRef.current?.click());
                }}
                disabled={disabled}
                aria-label="Add photo"
                style={{
                  background: "transparent",
                  border: "none",
                  color: LIME,
                  cursor: disabled ? "not-allowed" : "pointer",
                  fontSize: 16,
                  padding: 4,
                  opacity: disabled ? 0.4 : 1,
                }}
              >
                📷
              </button>
              <button
                type="button"
                onClick={() => void remove(n.id)}
                disabled={disabled || busyId === n.id}
                aria-label="Delete note"
                style={{
                  background: "transparent",
                  border: "none",
                  color: MUTED,
                  cursor: "pointer",
                  fontSize: 16,
                  padding: 4,
                  opacity: disabled ? 0.4 : 1,
                }}
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
      <input
        ref={fileRef}
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
    </div>
  );
}

function formatNoteTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
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
/**
 * `clientKey` is what makes saveDebrief's newProjects section idempotent
 * (item 9). A brand-new project has no natural key — its Project ID is assigned
 * BY the write and its action text is editable — so the UI mints a stable id at
 * the moment the row is created and resends it unchanged. Saving twice then
 * updates the same project instead of creating a second one.
 *
 * Minted once, in newProjectRow(). Never regenerate it on edit: a new key on
 * the second save is exactly the duplicate this prevents.
 */
type NewProject = {
  action: string;
  type?: string;
  notes?: string;
  items?: NewProjectItem[];
  clientKey?: string;
};

/** A blank project row, carrying its stable key from birth. */
function newProjectRow(type = "RECURRING"): NewProject {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return { action: "", type, clientKey: `np-${rand}` };
}
/**
 * `partial` = "Partially Used — Left Onsite". A plain Used marking makes the
 * backend drop the item from the client's Inventory; partial keeps/adds it.
 * That consequence is server-side — never reimplemented here.
 */
type ItemUsed = { name: string; qty?: string; partial?: boolean };

/* (8/4) EXPORTED so the failsafe DEBRIEF QUEUE route can render these very same
   steps for a visit that already happened. A second entry point, NOT a rebuild -
   everything about the live flow below is untouched. */
export function StateDebrief({
  clientMatch,
  event,
  roster,
  projects,
  tools,
  busy,
  onFinish,
  previewStep,
  employees = [],
  notes = [],
  /* (8/4) Which DAY this debrief is for. The live flow omits it, so payrollDay
     defaults to today exactly as before; the queue passes the visit's own date so
     a next-morning debrief reads that visit's hours rather than today's. */
  date,
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
  notes?: VisitNote[];
  date?: string;
}) {
  const clocked = roster.filter((m) => m.in);
  const { effectiveRole } = useViewAs();
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

  const updateNotes = useMemo(() => notes.filter((n) => n.type === "update"), [notes]);
  const itemNotes = useMemo(() => notes.filter((n) => n.type === "item"), [notes]);
  const futureNotes = useMemo(() => notes.filter((n) => n.type === "future"), [notes]);
  const officeNotes = useMemo(() => notes.filter((n) => n.type === "office"), [notes]);

  const appendPhotos = (base: string, photos?: string[]): string => {
    if (!photos || !photos.length) return base;
    const lines = photos.map((u) => `photo: ${u}`).join("\n");
    return base ? `${base}\n${lines}` : lines;
  };

  const [updates, setUpdates] = useState<DebriefUpdate[]>([]);
  const setSpecial = (projectId: string, status: string, notes?: string) => {
    setUpdates((cur) => {
      const rest = cur.filter((u) => u.projectId !== projectId);
      if (status === "SKIP") return rest;
      return [...rest, { projectId, status, notes }];
    });
  };
  const [focusedProjectId, setFocusedProjectId] = useState<string | null>(null);
  const appendToProjectNotes = (text: string) => {
    const pid = focusedProjectId;
    if (!pid || !text.trim()) return;
    setUpdates((cur) => {
      const existing = cur.find((u) => u.projectId === pid);
      const status = existing?.status ?? "IN PROGRESS";
      const prev = existing?.notes ?? "";
      const merged = prev ? `${prev}\n${text}` : text;
      const rest = cur.filter((u) => u.projectId !== pid);
      return [...rest, { projectId: pid, status, notes: merged }];
    });
  };

  const [itemsUsed, setItemsUsed] = useState<ItemUsed[]>(() =>
    itemNotes
      .filter((n) => n.item)
      .map((n) => ({
        name: n.item!,
        qty: appendPhotos(n.qty ?? "", n.photos),
      })),
  );

  const [newProjects, setNewProjects] = useState<NewProject[]>(() =>
    futureNotes.map((n) => ({
      action: n.text ?? "",
      notes: appendPhotos("", n.photos),
      items: [],
    })),
  );
  const [clientUpdates, setClientUpdates] = useState<string[]>([]);
  const [officeTasks, setOfficeTasks] = useState<string[]>(() =>
    officeNotes.map((n) => appendPhotos(n.text ?? "", n.photos)),
  );


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

  const isPreview = !!previewStep;
  const previewIndex = previewStep
    ? Math.max(0, DEBRIEF_STEPS.findIndex((s) => s.key === previewStep))
    : 0;
  const [liveIndex, setLiveIndex] = useState(0);
  const [completed, setCompleted] = useState<Set<number>>(new Set());
  const current = isPreview ? previewIndex : liveIndex;
  const currentKey = DEBRIEF_STEPS[current].key;
  const currentLabel = DEBRIEF_STEPS[current].label;
  const isLast = current === DEBRIEF_STEPS.length - 1;

  /* Lv09 (8/4): the Hours step reads QuickBooks Time instead of guessing from
     the roster's in/out stamps. Fetched when the step is first opened rather
     than on mount — it is the LAST step now, so most debriefs would pay for a
     request nobody looks at. */
  const [qbtDay, setQbtDay] = useState<PayrollDay | null>(null);
  const [qbtLoading, setQbtLoading] = useState(false);
  const [qbtErr, setQbtErr] = useState<string | null>(null);
  const [billingBusy, setBillingBusy] = useState<string | null>(null);
  const [billingNote, setBillingNote] = useState<string | null>(null);

  /* BUGFIX (8/4): this effect used to list qbtLoading in its OWN dependency
     array while also setting it. That deadlocked, deterministically:
       run 1  guard passes, setQbtLoading(true), fetch starts, cleanup C1 armed
       state change re-renders -> deps changed -> React runs C1 (cancelled=true)
       run 2  early-returns on the qbtLoading guard
       fetch resolves -> `if (cancelled) return` -> result DISCARDED, and
              setQbtLoading(false) never runs, so the guard blocks every retry
     Result: "READING QUICKBOOKS TIME…" forever, with the request visibly
     completing in the network panel. Caught only by loading the real screen —
     it typechecks perfectly.
     Now guarded by a REF, which is not reactive, so nothing the effect does can
     retrigger or cancel it. No cancellation flag either: a late setState on an
     unmounted component is a harmless no-op in React 18, whereas cancelling is
     what broke this. The ref also makes StrictMode's double-invoke a no-op
     instead of a second discarded request. */
  /* ---- CC-09: log a project that was COMPLETED during this visit ----
   *
   * Separate from the "New projects" step, which stages work for LATER and goes
   * out with saveDebrief. This writes immediately — createProject then
   * crossProject(permanent) — so the record exists even if the debrief is never
   * finished, which is the point of logging it for posterity.
   *
   * Reuses NewProjectForm so it is the same form as every other add-project
   * screen. Items are not collected here: this records what was DONE, and the
   * materials that went with it belong on the Items Used step. */
  const [addDone, setAddDone] = useState<NewProject | null>(null);
  const [addBusy, setAddBusy] = useState(false);
  const [addErr, setAddErr] = useState<string | null>(null);
  const [addedDone, setAddedDone] = useState<
    Array<{ id: string; action: string; kind: "completed" | "followup"; client: string }>
  >([]);
  /* COMPLETED = work done on this visit, crossed off immediately for the
     record. FOLLOW-UP = something noticed now that belongs to a LATER visit, so
     it stays pending — that difference is the whole reason for the toggle. */
  const [addKind, setAddKind] = useState<"completed" | "followup">("completed");
  /* Which section a follow-up lands on. Only meaningful for a client that is
     split into sections; everyone else has exactly one place it can go. */
  const [addTarget, setAddTarget] = useState<string>("");
  const [sectionOpts, setSectionOpts] = useState<string[]>([]);

  /* CC-10: how many photos each project already carries, so each button can say
     so without a request per card. One read when the step opens. */
  const [photoCounts, setPhotoCounts] = useState<Record<string, number>>({});
  useEffect(() => {
    if (currentKey !== "updates" || !clientMatch) return;
    let gone = false;
    void fetch(`${SCRIPT_URL}?action=projectPhotos&client=${encodeURIComponent(clientMatch)}`)
      .then((r) => r.json())
      .then((j: { photos?: Record<string, unknown[]> }) => {
        if (gone) return;
        const out: Record<string, number> = {};
        for (const [pid, list] of Object.entries(j.photos ?? {})) {
          out[pid] = Array.isArray(list) ? list.length : 0;
        }
        setPhotoCounts(out);
      })
      .catch(() => { /* no photos yet is the normal case, not an error */ });
    return () => { gone = true; };
  }, [currentKey, clientMatch]);

  /* Load the sibling sections lazily, and only for a sectioned client — most
     clients have none, and this must not cost a request on every debrief. */
  useEffect(() => {
    if (!addDone || addKind !== "followup" || !clientMatch) return;
    if (!sectionBase(clientMatch)) { setSectionOpts([]); return; }
    let gone = false;
    void fetchClientNames()
      .then((all) => { if (!gone) setSectionOpts(siblingSections(clientMatch, all)); })
      .catch(() => { if (!gone) setSectionOpts([]); });
    return () => { gone = true; };
  }, [addDone, addKind, clientMatch]);

  const saveAddedProject = useCallback(async () => {
    if (isPreview || !addDone) return;
    const target = (addKind === "followup" && addTarget) || clientMatch || "";
    if (!target) { setAddErr("no client for this visit"); return; }
    setAddBusy(true);
    setAddErr(null);
    try {
      const common = {
        client: target,
        projectAction: addDone.action,
        type: addDone.type,
        notes: addDone.notes,
      };
      if (addKind === "followup") {
        /* NOT crossed: a follow-up is a pending to-do for a later visit. */
        const { projectId } = await addFollowUpProject(common);
        setAddedDone((cur) => [
          ...cur,
          { id: projectId, action: addDone.action.trim(), kind: "followup", client: target },
        ]);
      } else {
        const { projectId, crossed } = await addCompletedProject(common);
        setAddedDone((cur) => [
          ...cur,
          { id: projectId, action: addDone.action.trim(), kind: "completed", client: target },
        ]);
        /* The project exists either way; say so plainly rather than implying the
           whole write failed and inviting a duplicate on retry. */
        if (!crossed) setAddErr(`Added as ${projectId}, but could not mark it complete.`);
      }
      setAddDone(null);
      setAddTarget("");
    } catch (e) {
      setAddErr(e instanceof Error ? e.message : "could not add the project");
    } finally {
      setAddBusy(false);
    }
  }, [isPreview, addDone, addKind, addTarget, clientMatch]);

  const qbtStarted = useRef(false);
  /* Bumped by the re-check button so a failed clock read is recoverable
     without leaving the debrief (CC-07). */
  const [clockRecheck, setClockRecheck] = useState(0);
  const recheckClock = useCallback(() => {
    qbtStarted.current = false;
    setClockRecheck((n) => n + 1);
  }, []);

  useEffect(() => {
    if (currentKey !== "billing" || qbtStarted.current) return;
    qbtStarted.current = true;
    setQbtLoading(true);
    setQbtErr(null);
    /* CC-07: correct the roster mirror while we are here. Not what the gate
       below reads — that goes straight to QBT — but it keeps the clock card and
       anything else roster-driven from contradicting this screen. Deliberately
       not awaited: it must never delay or fail the payroll read. */
    void reconcileRoster().catch(() => {});
    void (async () => {
      try {
        const j = await fetchPayrollDay(clientMatch ?? undefined, date);
        setQbtDay(j);
        /* Re-seed the billing figure from the real clock time. Only for people
           QBT actually knows about — anyone added by hand keeps their figure. */
        const byName = new Map((j.people ?? []).map((p) => [p.name.toLowerCase(), p]));
        setBilling((cur) => {
          const seeded = cur.map((r) => {
            const p = byName.get(r.name.toLowerCase());
            return p ? { ...r, hours: toQuarter(personSeconds(p) / 3600) } : r;
          });
          /* Someone on the clock for this client who is not on the visit roster
             still has to be billed, so add them rather than hiding them. */
          const known = new Set(seeded.map((r) => r.name.toLowerCase()));
          for (const p of j.people ?? []) {
            if (!known.has(p.name.toLowerCase())) {
              seeded.push({ name: p.name, hours: toQuarter(personSeconds(p) / 3600) });
            }
          }
          return seeded;
        });
      } catch (e) {
        setQbtErr(e instanceof Error ? e.message : "could not read QuickBooks Time");
      } finally {
        setQbtLoading(false);
      }
    })();
  }, [currentKey, clientMatch, date, clockRecheck]);

  /* ---- CC-07: Finish Debrief is gated on everyone having clocked OUT ----
   *
   * Read from QuickBooks Time directly (qbtDay), not from st.roster. The roster
   * is the app's own mirror and on 8/4 it claimed someone was on the clock on a
   * tsId QBT did not have; reconcileRoster above corrects that mirror, but the
   * gate itself should not depend on a correction having succeeded when the
   * authority is already in hand. payrollDay IS that authority, and since CC-05
   * it is filtered to THIS client's jobcode, so "still on the clock" means still
   * on the clock HERE — not on unrelated internal time.
   *
   * Blocks while the answer is unknown, on purpose: finishing a debrief decides
   * billable hours, and "we could not check" is not the same as "everyone is
   * out". A re-check is offered so a failed read is never a dead end. */
  const stillOnClock = useMemo(
    () => (qbtDay?.people ?? []).filter(personOnClock),
    [qbtDay],
  );
  const finishBlockedReason: string | null = isPreview
    ? null                       // preview is already read-only; no extra noise
    : qbtLoading
      ? "Checking who is still on the clock…"
      : qbtErr || !qbtDay
        ? "Can't confirm everyone has clocked out — QuickBooks Time did not answer."
        : stillOnClock.length
          ? `Still clocked in: ${stillOnClock.map((p) => p.name).join(", ")}`
          : null;

  /* Absolute figure, never a delta — setBillingHours upserts on
     date+client+person, so sending the total means repeated taps leave ONE row.
     writeBillingHours sends dryRun:false and throws on a dryRun response; see
     lib/billing-hours.ts for why that guard exists. BILLING ONLY: this cannot
     touch QuickBooks Time or anyone's pay. */
  const adjustBilling = async (name: string, delta: number) => {
    /* (8/4) The debrief preview badge promises "PREVIEW — READ ONLY", and this
       write was not honouring it: tapping ± from a management preview would have
       written a real Billing Hours row for a real employee against the live
       client and today's date. Found while trying to verify the stepper from
       preview mode. A screen that says read-only must be read-only. */
    if (isPreview) return;
    const row = billing.find((b) => b.name === name);
    if (!row || billingBusy) return;
    const prev = row.hours;
    const next = Math.min(16, toQuarter(prev + delta));
    if (next === prev) return;
    setBilling((cur) => cur.map((r) => (r.name === name ? { ...r, hours: next } : r)));
    setBillingBusy(name);
    setQbtErr(null);
    try {
      const client = (clientMatch ?? "").trim();
      if (!client) throw new Error("no client on this visit — cannot bill hours");
      const j = await writeBillingHours({
        client,
        rows: [{ person: name, hours: next }],
        date: qbtDay?.day || todayISODate(),
        eventId: event?.id,
      });
      if (j.billingOnly) setBillingNote(j.billingOnly);
    } catch (e) {
      setBilling((cur) => cur.map((r) => (r.name === name ? { ...r, hours: prev } : r)));
      setQbtErr(e instanceof Error ? e.message : "billing update failed");
    } finally {
      setBillingBusy(null);
    }
  };

  const qbtPerson = (name: string) =>
    (qbtDay?.people ?? []).find((p) => p.name.toLowerCase() === name.toLowerCase()) ?? null;

  const goNext = () => {
    setCompleted((c) => new Set(c).add(current));
    setLiveIndex((i) => Math.min(DEBRIEF_STEPS.length - 1, i + 1));
  };
  const goBack = () => setLiveIndex((i) => Math.max(0, i - 1));

  return (
    <div style={{ padding: "10px 14px" }}>
      <div
        style={{
          color: LIME,
          fontSize: 17,
          fontWeight: 500,
          letterSpacing: 1,
          textAlign: "center",
        }}
      >
        Debrief - {clientMatch ?? event?.title}
      </div>

      {/* Wizard header */}
      <div
        style={{
          marginTop: 12,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", gap: 6 }}>
          {DEBRIEF_STEPS.map((s, i) => {
            const on = i === current;
            const done = completed.has(i) && !isPreview;
            const color = on || done ? LIME : LIME_DIM;
            return (
              <span
                key={s.key}
                aria-label={s.label}
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 999,
                  background: on || done ? color : "transparent",
                  border: `1px solid ${color}`,
                  display: "inline-block",
                }}
              />
            );
          })}
        </div>
      </div>

      <div
        style={{
          color: LIME,
          fontSize: 30,
          fontWeight: "bold",
          textAlign: "center",
          letterSpacing: 2,
          marginTop: 10,
        }}
      >
        {currentLabel.toUpperCase()}
      </div>

      <div style={{ marginTop: 10 }}>
        {currentKey === "billing" && (
          <div>
            {qbtLoading && !qbtDay && (
              <div style={{ color: MUTED, fontSize: 12, marginBottom: 10 }}>
                READING QUICKBOOKS TIME…
              </div>
            )}
            {/* The client has no matching QB jobcode, so the figures below span
                every jobcode rather than just this visit. Shown, not swallowed —
                a total that quietly includes other clients' time is worse than a
                visible caveat. */}
            {qbtDay?.warning && (
              <div style={{ color: "#ffb020", fontSize: 12, marginBottom: 10 }}>
                ⚠ {qbtDay.warning}
              </div>
            )}
            {qbtErr && (
              <div style={{ color: "#ff6b6b", fontSize: 12, marginBottom: 10 }}>{qbtErr}</div>
            )}
            {qbtDay && (qbtDay.people ?? []).length === 0 && (
              <div style={{ color: MUTED, fontSize: 12, marginBottom: 10 }}>
                No QuickBooks Time entries for this client today — figures below are
                from the visit roster and are billing-only.
              </div>
            )}

            <div style={{ display: "grid", gap: 10 }}>
              {billing.map((b, i) => {
                const p = qbtPerson(b.name);
                const qbtHours = p ? toQuarter(personSeconds(p) / 3600) : null;
                const onClock = p ? personOnClock(p) : false;
                const delta = qbtHours === null ? 0 : +(b.hours - qbtHours).toFixed(2);
                const busy = billingBusy === b.name;
                return (
                  <div key={`${b.name}-${i}`} style={{ ...PANEL_BOX, textAlign: "center" }}>
                    <div style={{ color: TEXT, fontSize: 14, letterSpacing: 1, marginBottom: 4 }}>
                      {b.name.toUpperCase()}
                    </div>
                    {/* What QuickBooks Time actually recorded, versus what the
                        client is billed. Two different numbers on purpose. */}
                    <div style={{ color: MUTED, fontSize: 11, marginBottom: 10 }}>
                      {qbtHours === null ? (
                        <>not in QuickBooks Time · billing only</>
                      ) : (
                        <>
                          QBT {qbtHours.toFixed(2)}
                          {onClock && <span style={{ color: "#ffb020" }}> · still on the clock</span>}
                          {delta !== 0 && (
                            <>
                              {" · billing "}
                              {delta > 0 ? "+" : ""}
                              {delta.toFixed(2)}
                            </>
                          )}
                        </>
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16 }}>
                      <button
                        onClick={() => void adjustBilling(b.name, -0.25)}
                        disabled={busy || isPreview}
                        aria-label="Decrease billed hours"
                        style={{
                          width: 56,
                          height: 56,
                          borderRadius: 8,
                          border: `1px solid ${LIME_DIM}`,
                          background: "transparent",
                          color: LIME,
                          fontSize: 28,
                          fontWeight: "bold",
                          cursor: busy ? "default" : "pointer",
                          opacity: busy ? 0.5 : 1,
                        }}
                      >
                        −
                      </button>
                      <div style={{ minWidth: 120, color: LIME, fontSize: 40, fontWeight: "bold", fontVariantNumeric: "tabular-nums", opacity: busy ? 0.6 : 1 }}>
                        {b.hours.toFixed(2)}
                      </div>
                      <button
                        onClick={() => void adjustBilling(b.name, 0.25)}
                        disabled={busy || isPreview}
                        aria-label="Increase billed hours"
                        style={{
                          width: 56,
                          height: 56,
                          borderRadius: 8,
                          border: `1px solid ${LIME_DIM}`,
                          background: "transparent",
                          color: LIME,
                          fontSize: 28,
                          fontWeight: "bold",
                          cursor: busy ? "default" : "pointer",
                          opacity: busy ? 0.5 : 1,
                        }}
                      >
                        +
                      </button>
                    </div>
                    {qbtHours !== null && delta !== 0 && (
                      <button
                        onClick={() => void adjustBilling(b.name, qbtHours - b.hours)}
                        disabled={busy || isPreview}
                        style={{
                          marginTop: 8,
                          background: "transparent",
                          border: "none",
                          color: MUTED,
                          fontFamily: "inherit",
                          fontSize: 11,
                          textDecoration: "underline",
                          cursor: busy ? "default" : "pointer",
                        }}
                      >
                        reset to QBT
                      </button>
                    )}
                    {/* Segments are reference, so the lead can see what the
                        number is made of. Read-only: editing the actual QBT
                        times needs a backend write action that does not exist
                        (neighborPlan_/neighborProbe are planners only). */}
                    {p && p.entries.length > 0 && (
                      <div style={{ marginTop: 8, color: MUTED, fontSize: 10, lineHeight: 1.5 }}>
                        {p.entries.map((en) => {
                          /* CC-08: each segment's own hours, so the rounding is
                             visible per line instead of only in the total.
                             DECIMAL, not "5h": the QBT figure above is quarter-
                             rounded, and 4.95 + 3.20 = 8.15 -> 8.25 is only
                             checkable if the parts are shown as they actually
                             are. Rounding "4h57m" to "5h" here would hide the
                             very thing this is meant to expose.
                             An open segment counts up to now, matching how
                             personSeconds totals it. */
                          const secs = en.onClock
                            ? (Date.now() - new Date(en.start).getTime()) / 1000
                            : en.seconds || 0;
                          return (
                            <div
                              key={en.id}
                              style={{ display: "flex", alignItems: "baseline", gap: 8 }}
                            >
                              <span style={{ flex: 1, minWidth: 0 }}>
                                {fmtTime(en.start)}–{en.end ? fmtTime(en.end) : "now"}
                                {en.jobcode ? ` · ${en.jobcode}` : ""}
                              </span>
                              <span
                                style={{
                                  flex: "0 0 auto",
                                  fontVariantNumeric: "tabular-nums",
                                  color: en.onClock ? "#ffb020" : MUTED,
                                }}
                              >
                                {(secs / 3600).toFixed(2)}h
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div style={{ color: MUTED, fontSize: 10, marginTop: 10, lineHeight: 1.5 }}>
              Adjusts what the CLIENT IS BILLED. Does not touch QuickBooks Time or
              anyone's pay.
              {billingNote ? ` ${billingNote}` : ""}
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

            {effectiveRole === "management" && (
              <>
                <div style={{ ...ROW_LINE, borderTop: `1px solid ${LINE}`, marginTop: 12 }}>
                  <div style={{ flex: 1, color: MUTED, fontSize: 12 }}>TOTAL</div>
                  <div style={{ color: LIME, fontWeight: "bold" }}>{total.toFixed(2)}</div>
                </div>
                <div style={{ color: MUTED, fontSize: 11, marginTop: 6 }}>
                  Labor hours only — payroll stays in QB Time.
                </div>
              </>
            )}
          </div>
        )}

        {currentKey === "updates" && (
          <div>
            {updateNotes.length > 0 && (
              <div style={{ ...PANEL_BOX, marginBottom: 10 }}>
                <div style={{ color: DIM_GREEN, fontSize: 10, letterSpacing: 2 }}>
                  FIELD NOTES — TAP TO APPEND TO FOCUSED PROJECT
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
                  {updateNotes.map((n) => (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => appendToProjectNotes(appendPhotos(n.text ?? "", n.photos))}
                      disabled={!focusedProjectId}
                      style={{
                        textAlign: "left",
                        background: "transparent",
                        border: `1px solid ${LIME_DIM}`,
                        borderRadius: 6,
                        color: focusedProjectId ? LIME : DIM_GREEN,
                        padding: "6px 8px",
                        fontFamily: "inherit",
                        fontSize: 12,
                        cursor: focusedProjectId ? "pointer" : "not-allowed",
                      }}
                    >
                      {n.text}
                      {n.photos?.length ? ` · 📷 ${n.photos.length}` : ""}
                    </button>
                  ))}
                </div>
                {!focusedProjectId && (
                  <div style={{ color: MUTED, fontSize: 11, marginTop: 6 }}>
                    Focus a project's Notes field below to enable.
                  </div>
                )}
              </div>
            )}
            {specialProjects.length === 0 && (
              <div style={{ color: MUTED, fontSize: 12 }}>No projects to update.</div>
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
                  <textarea
                    placeholder={cur?.status === "" ? "Why not?" : "Notes (optional)"}
                    value={cur?.notes ?? ""}
                    onFocus={() => setFocusedProjectId(id)}
                    onChange={(e) =>
                      setSpecial(id, cur?.status ?? "DONE", e.target.value)
                    }
                    style={{ ...INPUT, minHeight: 56, marginTop: 8, resize: "vertical" }}
                  />
                  {/* CC-10: photos for THIS project. Record-keeping; nothing
                      here sends anything to the client. */}
                  <ProjectCamera
                    projectId={id}
                    clientName={clientMatch ?? ""}
                    disabled={busy || isPreview || !clientMatch}
                    existing={photoCounts[id] ?? 0}
                  />
                </div>
              );
            })}

            {/* CC-09: log something completed that was not on the list. Writes
                straight to Client Projects and marks it done — it is a record,
                not a to-do. */}
            <div style={{ marginTop: 14, borderTop: `1px solid ${LINE}`, paddingTop: 12 }}>
              {addedDone.map((a) => (
                <div
                  key={a.id}
                  style={{
                    color: a.kind === "completed" ? DIM_GREEN : "#ffb020",
                    fontSize: 12,
                    marginBottom: 6,
                  }}
                >
                  {a.kind === "completed" ? "✓" : "→"} {a.action}{" "}
                  <span style={{ color: MUTED }}>
                    · {a.kind === "completed" ? "logged as" : "follow-up on " + a.client + ","}{" "}
                    {a.id}
                  </span>
                </div>
              ))}
              {addErr && (
                <div style={{ color: "#ffb020", fontSize: 12, marginBottom: 6 }}>{addErr}</div>
              )}
              {addDone ? (
                <>
                  {/* Which KIND of entry. Completed work is crossed off now;
                      a follow-up stays pending for a later visit. */}
                  <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                    {(
                      [
                        ["completed", "DONE THIS VISIT"],
                        ["followup", "FOLLOW-UP"],
                      ] as const
                    ).map(([k, label]) => {
                      const on = addKind === k;
                      return (
                        <button
                          key={k}
                          onClick={() => { setAddKind(k); setAddTarget(""); }}
                          style={{
                            ...SMALL_BTN,
                            flex: 1,
                            background: on ? LIME : "transparent",
                            color: on ? BG : LIME,
                            borderColor: on ? LIME : LIME_DIM,
                          }}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>

                  {/* Sector picker — follow-ups only, and only for a client that
                      is actually split into sections. A section IS a Client Info
                      row, so choosing one just changes which row this lands on. */}
                  {addKind === "followup" && sectionOpts.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ color: MUTED, fontSize: 11, marginBottom: 4 }}>
                        Which visit does this belong to?
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {[
                          { v: "", label: "NEXT VISIT" },
                          ...sectionOpts.map((c) => ({
                            v: c,
                            label: (sectionLabel(c) || c).toUpperCase(),
                          })),
                        ].map((o) => {
                          const on = addTarget === o.v;
                          return (
                            <button
                              key={o.v || "__same"}
                              onClick={() => setAddTarget(o.v)}
                              style={{
                                ...SMALL_BTN,
                                padding: "0 10px",
                                background: on ? LIME : "transparent",
                                color: on ? BG : LIME,
                                borderColor: on ? LIME : LIME_DIM,
                              }}
                            >
                              {o.label}
                            </button>
                          );
                        })}
                      </div>
                      <div style={{ color: MUTED, fontSize: 11, marginTop: 4 }}>
                        Filing on: {addTarget || clientMatch}
                      </div>
                    </div>
                  )}

                  <NewProjectForm
                    value={addDone}
                    onChange={setAddDone}
                    onRemove={() => { setAddDone(null); setAddErr(null); setAddTarget(""); }}
                  />
                  <button
                    onClick={() => void saveAddedProject()}
                    disabled={addBusy || isPreview || !addDone.action.trim()}
                    style={{
                      ...PRIMARY_BTN,
                      marginTop: 8,
                      minHeight: 44,
                      opacity: addBusy || isPreview || !addDone.action.trim() ? 0.5 : 1,
                    }}
                  >
                    {addBusy
                      ? "SAVING…"
                      : addKind === "completed"
                        ? "SAVE AS COMPLETED"
                        : "SAVE FOLLOW-UP"}
                  </button>
                </>
              ) : (
                <button
                  onClick={() => {
                    setAddDone({ action: "", type: "SPECIAL" });
                    setAddErr(null);
                    setAddKind("completed");
                    setAddTarget("");
                  }}
                  disabled={isPreview}
                  style={{ ...SMALL_BTN, opacity: isPreview ? 0.5 : 1 }}
                >
                  + ADD PROJECT
                </button>
              )}
            </div>
          </div>
        )}


        {currentKey === "items" && (
          <ItemsUsedPicker items={itemsUsed} onChange={setItemsUsed} disabled={busy} />
        )}

        {currentKey === "new" && (
          <div>
            {newProjects.map((p, idx) => (
              <NewProjectForm
                key={idx}
                value={p}
                onChange={(v) => setNewProjects((cur) => cur.map((x, i) => (i === idx ? v : x)))}
                onRemove={() => setNewProjects((cur) => cur.filter((_, i) => i !== idx))}
              />
            ))}
            <button
              onClick={() => setNewProjects((cur) => [...cur, newProjectRow()])}
              style={{ ...SMALL_BTN, marginTop: 8 }}
            >
              + ADD PROJECT
            </button>
          </div>
        )}

        {currentKey === "office" && (
          <div style={{ display: "grid", gap: 14 }}>
            <div>
              <div style={{ color: LIME, fontSize: 12, letterSpacing: 2, marginBottom: 6 }}>
                MESSAGES FOR THE CLIENT
              </div>
              <TextList
                items={clientUpdates}
                onChange={setClientUpdates}
                placeholder="Something to tell the client…"
              />
            </div>
            <div>
              <div style={{ color: LIME, fontSize: 12, letterSpacing: 2, marginBottom: 6 }}>
                MESSAGES FOR THE OFFICE
              </div>
              <TextList
                items={officeTasks}
                onChange={setOfficeTasks}
                placeholder="Follow-up for office…"
              />
            </div>
          </div>
        )}
      </div>

      {/* CC-07: say WHY finishing is unavailable. A disabled button with no
          reason reads as a broken app, and the fix is usually one tap away on
          someone else's phone. */}
      {isLast && finishBlockedReason && (
        <div
          role="status"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginTop: 16,
            padding: "10px 12px",
            border: `1px solid ${LINE}`,
            borderRadius: 8,
            background: "rgba(255,255,255,.03)",
            color: MUTED,
            fontSize: 12,
            lineHeight: 1.4,
          }}
        >
          <span style={{ flex: 1 }}>⏱ {finishBlockedReason}</span>
          {!qbtLoading && (
            <button
              type="button"
              onClick={recheckClock}
              style={{
                ...SMALL_BTN,
                flex: "0 0 auto",
                minHeight: 32,
                padding: "0 12px",
                background: "transparent",
                color: LIME,
                borderColor: LIME_DIM,
              }}
            >
              RE-CHECK
            </button>
          )}
        </div>
      )}

      {/* Wizard nav */}
      <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
        <button
          onClick={goBack}
          disabled={isPreview || current === 0}
          style={{
            ...SMALL_BTN,
            flex: "0 0 auto",
            minHeight: 56,
            padding: "0 18px",
            background: "transparent",
            color: current === 0 || isPreview ? MUTED : LIME,
            borderColor: current === 0 || isPreview ? LINE : LIME_DIM,
            opacity: current === 0 || isPreview ? 0.5 : 1,
          }}
        >
          ← BACK
        </button>
        {isLast ? (
          <button
            onClick={handleFinish}
            disabled={busy || isPreview || !!finishBlockedReason}
            title={finishBlockedReason ?? undefined}
            style={{
              ...PRIMARY_BTN,
              flex: 1,
              minHeight: 56,
              opacity: isPreview || finishBlockedReason ? 0.5 : 1,
              cursor: finishBlockedReason ? "not-allowed" : PRIMARY_BTN.cursor,
            }}
          >
            FINISH DEBRIEF
          </button>
        ) : (
          <button
            onClick={goNext}
            disabled={isPreview}
            style={{ ...PRIMARY_BTN, flex: 1, minHeight: 56, opacity: isPreview ? 0.5 : 1 }}
          >
            NEXT →
          </button>
        )}
      </div>
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


/* ---- CC-10: photos attached to ONE project -------------------------------
 *
 * Same pipeline as VisitCamera above — downscale, base64, visitPhoto, Drive via
 * PHOTO_FOLDER_ID, PHOTO_HOOK — with a projectId so the backend can file it
 * against the project rather than the day. Deliberately NOT the visit-notes
 * photos[] array: that store self-resets at the crew-day rollover, and these
 * are records.
 *
 * Sharing with the client is a SEPARATE, deliberate action and is not built
 * here. Nothing on this screen sends anything to a client.
 */
function ProjectCamera({
  projectId,
  clientName,
  disabled,
  existing,
}: {
  projectId: string;
  clientName: string;
  disabled: boolean;
  existing: number;
}) {
  const [photos, setPhotos] = useState<VisitPhoto[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const upload = useCallback(
    async (id: string, base64: string) => {
      try {
        const res = await fetch(SCRIPT_URL, {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: JSON.stringify({
            action: "visitPhoto",
            data: base64,
            mime: "image/jpeg",
            client: clientName,
            projectId,
          }),
        });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          projectPhotoLogged?: unknown;
        };
        /* The upload can succeed while the project link fails — the photo is in
           Drive either way, but calling that "ok" would misreport it as attached
           to this project. */
        if (json.ok && json.projectPhotoLogged === true) {
          setPhotos((prev) => prev.map((p) => (p.id === id ? { ...p, status: "ok" } : p)));
        } else {
          throw new Error("upload failed");
        }
      } catch {
        setPhotos((prev) =>
          prev.map((p) =>
            p.id === id ? { ...p, status: "error", retry: () => void upload(id, base64) } : p,
          ),
        );
      }
    },
    [clientName, projectId],
  );

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || disabled) return;
      for (const file of Array.from(files)) {
        try {
          const { base64, dataUrl } = await downscaleToJpegBase64(file);
          const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          setPhotos((prev) => [...prev, { id, thumb: dataUrl, status: "uploading" }]);
          void upload(id, base64);
        } catch {
          /* an unreadable file must not take the others down with it */
        }
      }
    },
    [disabled, upload],
  );

  const shown = existing + photos.filter((p) => p.status === "ok").length;

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
          style={{
            ...SMALL_BTN,
            opacity: disabled ? 0.4 : 1,
            cursor: disabled ? "not-allowed" : "pointer",
          }}
        >
          📷 PHOTO
        </button>
        {shown > 0 && (
          <span style={{ color: MUTED, fontSize: 11 }}>
            {shown} photo{shown === 1 ? "" : "s"}
          </span>
        )}
      </div>
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
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
          {photos.map((p) => (
            <div key={p.id} style={{ position: "relative" }}>
              <img
                src={p.thumb}
                alt=""
                style={{
                  width: 44,
                  height: 44,
                  objectFit: "cover",
                  borderRadius: 6,
                  opacity: p.status === "ok" ? 1 : 0.45,
                  border: `1px solid ${p.status === "error" ? "#ff3b30" : LINE}`,
                }}
              />
              {p.status === "error" && (
                <button
                  type="button"
                  onClick={() => p.retry?.()}
                  title="Retry"
                  style={{
                    position: "absolute",
                    inset: 0,
                    background: "rgba(0,0,0,.55)",
                    color: "#ff3b30",
                    border: "none",
                    borderRadius: 6,
                    fontSize: 10,
                    cursor: "pointer",
                  }}
                >
                  RETRY
                </button>
              )}
            </div>
          ))}
        </div>
      )}
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


function ItemsUsedPicker({
  items,
  onChange,
  disabled,
}: {
  items: ItemUsed[];
  onChange: (v: ItemUsed[]) => void;
  disabled: boolean;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  return (
    <div>
      {items.map((i, idx) => (

        <div
          key={idx}
          style={{ borderBottom: `1px solid ${LINE}`, padding: "2px 0 8px" }}
        >
          <div style={{ ...ROW_LINE, borderBottom: "none", gap: 6 }}>
            <div style={{ flex: 1, color: TEXT, fontSize: 13, wordBreak: "break-word" }}>
              {i.name}
            </div>
            <input
              placeholder="Qty"
              value={i.qty ?? ""}
              onChange={(e) =>
                onChange(items.map((x, j) => (j === idx ? { ...x, qty: e.target.value } : x)))
              }
              disabled={disabled}
              style={{ ...INPUT, width: 72, marginTop: 0 }}
            />
            <button
              onClick={() => onChange(items.filter((_, j) => j !== idx))}
              disabled={disabled}
              style={{ ...SMALL_BTN, color: RED, borderColor: RED }}
            >
              ✕
            </button>
          </div>
          {/* Rare case, so deliberately quiet: small text toggle, not a button. */}
          <button
            onClick={() =>
              onChange(
                items.map((x, j) =>
                  // Off means absent, so the payload only ever carries partial: true.
                  j === idx ? { ...x, partial: x.partial ? undefined : true } : x,
                ),
              )
            }
            disabled={disabled}
            style={{
              background: "transparent",
              border: "none",
              padding: "2px 0 0",
              fontFamily: "inherit",
              fontSize: 11,
              letterSpacing: 0.5,
              color: i.partial ? LIME : MUTED,
              cursor: "pointer",
              textAlign: "left",
            }}
            aria-pressed={!!i.partial}
          >
            {i.partial ? "☑" : "☐"} partially used — left onsite
          </button>
        </div>
      ))}
      <button
        onClick={() => setPickerOpen(true)}
        disabled={disabled}
        style={{ ...SMALL_BTN, marginTop: 8, opacity: disabled ? 0.4 : 1 }}
      >
        + ADD ITEM

      </button>
      {pickerOpen && (
        <ItemPicker
          onCancel={() => setPickerOpen(false)}
          onAdd={(picked) => {
            onChange([...items, { name: picked.name, qty: picked.qty || undefined }]);
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

/* ============================================================
 * DAY CLOSE APPROVAL GATE (Lv11)
 * The lead cannot finish the day until every employee is clocked
 * out and their hours are approved. gateSatisfied and blockers[]
 * are computed server-side and are the ONLY source of truth —
 * blockers are written for a human and shown verbatim.
 * The LEAD IS NEVER APPROVED (approvalRequired: false): ownership,
 * not an hourly employee. Do not add a lead approval control.
 * ============================================================ */
const AMBER = "#8f8f8f"; /* muted, per palette rules — no amber/red here */

type DayCloseEmployee = {
  name: string;
  userId?: string;
  clockedOut?: boolean;
  stillOnClockInQbt?: boolean;
  approved?: boolean;
  hours?: number;
};
type DayCloseDoc = {
  ok?: boolean;
  day?: string;
  employees?: DayCloseEmployee[];
  noEmployeesToday?: boolean;
  requiresSoloAck?: boolean;
  lead?: { name?: string; hours?: number; approvalRequired?: boolean } | null;
  totalHoursToday?: number;
  gateSatisfied?: boolean;
  blockers?: string[];
};

function h2(n: unknown): string {
  const v = typeof n === "number" ? n : Number(n);
  return Number.isFinite(v) ? v.toFixed(2) : "0.00";
}

function DayCloseGate({
  leadName,
  isPreview,
  busy,
}: {
  leadName: string;
  isPreview: boolean;
  busy: boolean;
}) {
  const [doc, setDoc] = useState<DayCloseDoc | null>(null);
  const [loadErr, setLoadErr] = useState(false);
  const [working, setWorking] = useState<string | null>(null);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [soloAck, setSoloAck] = useState(false);
  const [approveMsg, setApproveMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(async () => {
    if (isPreview) return;
    try {
      const res = await fetch(appendTeamParam(`${SCRIPT_URL}?action=dayClose`));
      const json = (await res.json()) as DayCloseDoc;
      setDoc(json);
      setLoadErr(false);
    } catch {
      setLoadErr(true);
    }
  }, [isPreview]);

  useEffect(() => {
    void load();
  }, [load]);

  const employees = doc?.employees ?? [];
  const solo = !!(doc?.noEmployeesToday || doc?.requiresSoloAck);
  const blockers = doc?.blockers ?? [];
  const allOut = employees.length > 0 && employees.every((e) => e.clockedOut === true);
  const gateOpen =
    !!doc && doc.gateSatisfied === true && (!solo || soloAck) && (solo || allOut);

  const write = async (body: Record<string, unknown>, key: string) => {
    if (isPreview) return;
    setWorking(key);
    const r = await postScript(body);
    setWorking(null);
    if (!r.ok) {
      const raw = (r.raw ?? {}) as Record<string, unknown>;
      setApproveMsg({
        kind: "err",
        text: String(raw.error ?? r.error ?? "Save failed — retry."),
      });
    }
    // gateSatisfied/blockers are server-computed: always refetch.
    await load();
  };

  const runQbApprove = async () => {
    if (isPreview) return;
    setApproveMsg(null);
    setWorking("qbApprove");
    const r = await postScript({ action: "qbApprove" });
    setWorking(null);
    const raw = (r.raw ?? {}) as Record<string, unknown>;
    if (r.ok) {
      const count = raw.approvedCount ?? raw.users ?? raw.userCount;
      const thru = raw.approvedTo ?? raw.through ?? doc?.day;
      setApproveMsg({
        kind: "ok",
        text:
          `Approved${count !== undefined ? ` ${count} user${String(count) === "1" ? "" : "s"}` : ""}` +
          `${thru ? ` through ${String(thru)}` : ""}`,
      });
    } else {
      // A refusal is correct, not transient — surface verbatim, never retry.
      setApproveMsg({ kind: "err", text: String(raw.error ?? r.error ?? "qbApprove failed") });
    }
    await load();
  };

  return (
    <>
      <div style={{ ...SECTION_HEAD, marginTop: 20 }}>HOURS APPROVAL</div>

      {isPreview && (
        <div style={{ color: MUTED, fontSize: 12, padding: "0 4px 6px" }}>
          Preview — approval controls are read-only.
        </div>
      )}
      {loadErr && !doc && (
        <div style={{ ...PANEL_BOX, color: MUTED, fontSize: 12 }}>
          Couldn't load today's hours.{" "}
          <button type="button" onClick={() => void load()} style={SMALL_BTN}>
            RETRY
          </button>
        </div>
      )}

      {solo && (
        <div style={{ ...PANEL_BOX, marginBottom: 8 }}>
          <div style={{ color: TEXT, fontSize: 13, marginBottom: 10 }}>
            No employees on today's roster — nothing to approve.
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 56, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={soloAck}
              disabled={isPreview}
              onChange={(e) => setSoloAck(e.target.checked)}
              style={{ width: 22, height: 22, accentColor: LIME }}
            />
            <span style={{ color: soloAck ? LIME : TEXT, fontSize: 13, letterSpacing: 0.5 }}>
              Working alone today — no hours to approve
            </span>
          </label>
        </div>
      )}

      {employees.map((e) => {
        const key = e.userId || e.name;
        const busyRow = busy || working !== null || isPreview;
        return (
          <div key={key} style={{ ...PANEL_BOX, marginBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "baseline" }}>
              <span style={{ color: TEXT, fontSize: 15, fontWeight: "bold", letterSpacing: 1 }}>
                {e.name}
              </span>
              <span style={{ marginLeft: "auto", color: LIME, fontWeight: "bold", fontSize: 15 }}>
                {h2(e.hours)}
              </span>
            </div>

            {/* These two states are DISTINCT and never merged: the roster can
                lag a rejected write, so a person may read as clocked out
                locally while QuickBooks Time still has them open. */}
            {e.stillOnClockInQbt === true && (
              <div style={{ color: AMBER, fontSize: 12, marginTop: 6, letterSpacing: 0.5 }}>
                still on the clock in QuickBooks Time
              </div>
            )}
            {e.clockedOut !== true && (
              <div style={{ color: MUTED, fontSize: 12, marginTop: 6, letterSpacing: 0.5 }}>
                still clocked in — cannot be approved yet
              </div>
            )}

            {e.clockedOut === true && e.approved === true && (
              <div style={{ color: LIME, fontSize: 12, marginTop: 6, letterSpacing: 0.5 }}>
                ✓ hours approved
              </div>
            )}

            {e.clockedOut === true && e.approved !== true && (
              <>
                <button
                  type="button"
                  disabled={busyRow}
                  onClick={() =>
                    void write(
                      { action: "payrollConfirm", by: leadName, ok: true, person: e.name },
                      `ok:${key}`,
                    )
                  }
                  style={{
                    ...PRIMARY_BTN,
                    marginTop: 10,
                    opacity: busyRow ? 0.6 : 1,
                  }}
                >
                  {working === `ok:${key}` ? "APPROVING…" : "APPROVE"}
                </button>

                {noteFor !== key ? (
                  <button
                    type="button"
                    disabled={busyRow}
                    onClick={() => {
                      setNoteFor(key);
                      setNote("");
                    }}
                    style={{ ...SMALL_BTN, marginTop: 8, color: MUTED, borderColor: LINE }}
                  >
                    CAN'T VERIFY THESE HOURS
                  </button>
                ) : (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ color: MUTED, fontSize: 11, letterSpacing: 1, marginBottom: 6 }}>
                      WHY CAN'T THESE HOURS BE VERIFIED? (REQUIRED)
                    </div>
                    <textarea
                      value={note}
                      onChange={(ev) => setNote(ev.target.value)}
                      rows={2}
                      style={{ ...INPUT, resize: "vertical" }}
                    />
                    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                      <button
                        type="button"
                        disabled={busyRow || note.trim().length < 3}
                        onClick={async () => {
                          await write(
                            {
                              action: "payrollConfirm",
                              by: leadName,
                              ok: false,
                              person: e.name,
                              note: note.trim(),
                            },
                            `no:${key}`,
                          );
                          setNoteFor(null);
                          setNote("");
                        }}
                        style={{
                          ...SMALL_BTN,
                          color: MUTED,
                          borderColor: LINE,
                          opacity: busyRow || note.trim().length < 3 ? 0.5 : 1,
                        }}
                      >
                        SEND TO MANAGEMENT
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setNoteFor(null);
                          setNote("");
                        }}
                        style={{ ...SMALL_BTN, color: MUTED, borderColor: LINE }}
                      >
                        CANCEL
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}

      {/* Reference only. The lead is ownership, not an hourly employee —
          no approve button, no bearing on the gate. */}
      {doc?.lead && (
        <div style={{ ...PANEL_BOX, marginBottom: 8, background: PANEL_2 }}>
          <div style={{ display: "flex", alignItems: "baseline" }}>
            <span style={{ color: MUTED, fontSize: 13, letterSpacing: 1 }}>
              {doc.lead.name} (lead)
            </span>
            <span style={{ marginLeft: "auto", color: MUTED, fontWeight: "bold", fontSize: 14 }}>
              {h2(doc.lead.hours)}
            </span>
          </div>
          <div style={{ color: MUTED, fontSize: 11, marginTop: 4 }}>
            Reference only — no approval required.
          </div>
        </div>
      )}

      <div style={{ ...PANEL_BOX, marginTop: 8 }}>
        <div style={{ display: "flex" }}>
          <span style={{ color: MUTED }}>Total hours today</span>
          <span style={{ marginLeft: "auto", color: LIME, fontWeight: "bold" }}>
            {h2(doc?.totalHoursToday)}
          </span>
        </div>
      </div>

      {/* qbApprove is offered only once every employee is clocked out. */}
      <button
        type="button"
        onClick={() => void runQbApprove()}
        disabled={!gateOpen || busy || working !== null || isPreview}
        style={{
          ...PRIMARY_BTN,
          marginTop: 14,
          opacity: !gateOpen || busy || working !== null || isPreview ? 0.5 : 1,
          cursor: gateOpen ? "pointer" : "not-allowed",
        }}
      >
        {working === "qbApprove" ? "APPROVING…" : "APPROVE TODAY'S HOURS IN QB TIME"}
      </button>

      {/* Blockers are written to be read by a human — shown verbatim. */}
      {!gateOpen && blockers.length > 0 && (
        <div style={{ marginTop: 10, padding: "0 4px" }}>
          {blockers.map((b, i) => (
            <div key={`${b}-${i}`} style={{ color: MUTED, fontSize: 12, padding: "3px 0" }}>
              {b}
            </div>
          ))}
        </div>
      )}
      {!gateOpen && blockers.length === 0 && solo && !soloAck && (
        <div style={{ marginTop: 10, padding: "0 4px", color: MUTED, fontSize: 12 }}>
          Acknowledge working alone to finish the day.
        </div>
      )}

      {approveMsg && (
        <div
          style={{
            marginTop: 12,
            padding: "10px 12px",
            border: `1px solid ${approveMsg.kind === "ok" ? LIME_DIM : LINE}`,
            borderRadius: 8,
            color: approveMsg.kind === "ok" ? LIME : TEXT,
            fontSize: 12,
            lineHeight: 1.5,
          }}
        >
          {approveMsg.text}
        </div>
      )}
    </>
  );
}


function RouteComplete({
  events,
  roster,
  isLead,
  departed,
  atHq,
  unloaded,
  isPreview,
  onArrivedHq,
  onFinishedUnloading,
  clockSlot,
  approveNote,
  leadName,
  busy,
}: {
  events: EventItem[];
  roster: RosterMember[];
  isLead: boolean;
  /** The route actually left HQ today — the sequence only exists then (BB5/DD). */
  departed: boolean;
  /** ARRIVED AT HQ pressed (route state 'done'). */
  atHq: boolean;
  /** FINISHED UNLOADING pressed. */
  unloaded: boolean;
  isPreview: boolean;
  onArrivedHq: () => void;
  onFinishedUnloading: () => void;
  clockSlot?: React.ReactNode;
  /** Why approval isn't available yet; null = it is (T1/T3, 8/2). */
  approveNote: string | null;
  /** Name recorded as the approver on payrollConfirm. */
  leadName: string;
  busy: boolean;

}) {
  const totalHours = roster.reduce((a, m) => a + hoursBetween(m.in, m.out), 0);
  // Preview renders every stage's controls read-only; a day where the route
  // never departed skips the sequence — nobody left, nothing arrives (BB5).
  // DD (8/2): this was gated on clock-ins, which wrongly hid ARRIVED AT HQ
  // on a driven day with an empty clock — departure is the real signal.
  const sequence = departed || isPreview;
  const note = (text: string) => (
    <div
      style={{
        marginTop: 20,
        padding: "10px 12px",
        border: `1px solid ${LIME_DIM}`,
        borderRadius: 8,
        color: MUTED,
        fontSize: 12,
        letterSpacing: 0.5,
        textAlign: "center",
      }}
    >
      {text}
    </div>
  );
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

      {!sequence && isLead && approveNote && note(approveNote)}

      {sequence && !atHq && (
        <button
          onClick={onArrivedHq}
          disabled={busy || isPreview}
          style={{ ...PRIMARY_BTN, marginTop: 20, opacity: busy || isPreview ? 0.6 : 1 }}
        >
          ARRIVED AT HQ
        </button>
      )}

      {sequence && atHq && !unloaded && (
        <>
          <div style={{ ...SECTION_HEAD, marginTop: 20 }}>UNLOADING</div>
          <div style={{ color: MUTED, fontSize: 12, padding: "0 4px 6px" }}>
            Vehicle back at HQ — unload, then confirm. One button, no checklist.
          </div>
          <button
            onClick={onFinishedUnloading}
            disabled={busy || isPreview}
            style={{ ...PRIMARY_BTN, marginTop: 8, opacity: busy || isPreview ? 0.6 : 1 }}
          >
            FINISHED UNLOADING
          </button>
        </>
      )}

      {sequence && atHq && unloaded && (
        <>
          <div style={{ ...SECTION_HEAD, marginTop: 20 }}>CLOCK OUT</div>
          <div style={{ color: MUTED, fontSize: 12, padding: "0 4px 6px" }}>
            Assistants clock out first, then the lead — the lead's clock-out
            rolls straight into approving today's hours.
          </div>
          {clockSlot}
          {/* Lv11: the server-computed dayClose gate owns approval from here. */}
          {isLead && <DayCloseGate leadName={leadName} isPreview={isPreview} busy={busy} />}

        </>
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
const NAVIGATE_BTN: React.CSSProperties = {
  ...BIG_BTN,
  width: "100%",
  background: LIME,
  color: BG,
  borderColor: LIME,
  textAlign: "center",
  display: "block",
  padding: "0 12px",
  lineHeight: "56px",
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
