import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth, crewDayLA } from "../lib/auth";
import { useViewAs } from "../lib/view-as";
import { canSee } from "../lib/permissions";
import { ItemPicker } from "../components/ItemPicker";
import { ComboSelect } from "../components/ComboSelect";
import { sessionCache } from "../lib/session-cache";
import { useOptimistic } from "../lib/optimistic";
import { useSubStepOverride } from "../lib/day-state";
import { RefreshDot } from "../components/RefreshDot";
import { useReviewableToday } from "../lib/reviewable-today";
import { Check, SkipForward, Trash2 } from "lucide-react";
import { confirmModal } from "../components/ConfirmModal";
import { SPINE_RESERVE_CSS } from "../components/DayStateSpine";

const CK = "confirm:getConfirm";

export const Route = createFileRoute("/confirm")({
  head: () => ({
    meta: [
      { title: "Bramble & Vine — Confirm Day" },
      { name: "description", content: "Confirm today's loading list and route notes." },
    ],
  }),
  component: ConfirmPage,
});

/* ============================================================
 * Backend contract — Apps Script is the ONLY backend.
 * Reads:  GET  <SCRIPT_URL>?action=getConfirm
 * Writes: POST <SCRIPT_URL>  Content-Type text/plain (no preflight)
 *         body: { action: "confirmDay", statuses, updates,
 *                 newProjects, deletes, sendText }
 * ============================================================ */
export const SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbwZlJn9jKzzYfcFglDmVGV3l-FTYib0D3mNdILivsB1477aMym68NViDCwia26_JH4siQ/exec";

type Item = { name: string; qty: string; size: string; notes: string };

type Project = {
  row: number;
  /**
   * Unique per row, unlike projectId.
   *
   * "Project ID" is only unique WITHIN a client - proj-1 exists once for every
   * client on the schedule. Keying per-card state on it made four clients share
   * one entry, so a card showed another client's action and type, deleting one
   * staged all four, and submit diffed the shared edit against every row and
   * wrote the differences back. Never key local state on projectId.
   *
   * The sheet's locked Row ID is the real identity; (client, projectId) is the
   * fallback and is also unique.
   */
  uid: string;
  projectId: string;
  client: string;
  category: string;
  action: string;
  garden: string;
  type: string;
  notes: string;
  status: string;
  showOnReview: boolean;
  items: Item[];
};

type ConfirmState = {
  day?: string;
  confirmed?: boolean;
  at?: string;
  clients?: string[];
};

type GetConfirmResponse = {
  state?: ConfirmState;
  todaysClients?: string[];
  projects?: Array<Record<string, unknown>>;
  clients?: string[];
  serverTime?: string;
};

/** Size a textarea to its content, so nothing is hidden behind a scrollbar. */
function autoGrow(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

function normProject(p: Record<string, unknown>): Project {
  const rawItems = Array.isArray(p.items) ? (p.items as Array<Record<string, unknown>>) : [];
  const items: Item[] = rawItems.map((it) => ({
    name: String(it["Item Name"] ?? it.name ?? "").trim(),
    qty: String(it["Quantity"] ?? it.qty ?? "").trim(),
    size: String(it["Size"] ?? it.size ?? "").trim(),
    notes: String(it["Notes"] ?? it.notes ?? "").trim(),
  }));
  const projectId = String(p["Project ID"] ?? p.projectId ?? "").trim();
  const client = String(p["Client Name"] ?? p.client ?? "").trim();
  const rowId = String(p["🔒 Row ID"] ?? p.rowId ?? "").trim();
  return {
    row: Number(p.row ?? 0),
    uid: rowId || (projectId ? `${client}||${projectId}` : `row-${Number(p.row ?? 0)}`),
    projectId,
    client,
    category: String(p["Category"] ?? p.category ?? "").trim(),
    action: String(p["Project Action"] ?? p.action ?? "").trim(),
    garden: String(p["Garden"] ?? p.garden ?? "").trim(),
    type: String(p["Type"] ?? p.type ?? "").trim(),
    notes: String(p["Notes"] ?? p.notes ?? "").trim(),
    status: String(p["Status"] ?? p.status ?? "").trim(),
    showOnReview: Boolean(p.showOnReview),
    items,
  };
}

type Edit = {
  action: string;
  garden: string;
  type: string;
  category: string;
  notes: string;
  status: "Pending" | "Confirmed" | "SKIP";
  expanded: boolean;
  notesOpen: boolean;
};

type NewItem = { name: string; qty: string; size: string; notes: string };
type NewProject = {
  key: string;
  client: string;
  action: string;
  garden: string;
  type: string;
  category: string;
  notes: string;
  items: NewItem[];
};

/**
 * Confirming a client, skipping a card or staging a delete only lived in React
 * state, so a reload - or the screen being revisited - undid all of it and the
 * cards came back. None of it is written to the sheet until Submit, so it has
 * to survive locally until then.
 *
 * Day-scoped: yesterday's confirmations must never hide today's work. Cleared
 * on a successful submit, when the server becomes the record.
 */
const STAGE_KEY = "bv.confirm.staged";

type StagedWork = {
  day: string;
  confirmedClients: string[];
  /** uid -> handled status. Keyed by uid, never projectId; see Project.uid. */
  statuses: Record<string, "Confirmed" | "SKIP">;
  deletes: string[];
};

function readStaged(): StagedWork | null {
  try {
    const raw = localStorage.getItem(STAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as StagedWork;
    if (!s || s.day !== crewDayLA()) return null;
    return {
      day: s.day,
      confirmedClients: Array.isArray(s.confirmedClients) ? s.confirmedClients : [],
      statuses: s.statuses && typeof s.statuses === "object" ? s.statuses : {},
      deletes: Array.isArray(s.deletes) ? s.deletes : [],
    };
  } catch {
    return null;
  }
}

function writeStaged(s: Omit<StagedWork, "day">): void {
  try {
    localStorage.setItem(STAGE_KEY, JSON.stringify({ day: crewDayLA(), ...s }));
  } catch {
    /* private mode: staging simply will not survive a reload */
  }
}

function clearStaged(): void {
  try {
    localStorage.removeItem(STAGE_KEY);
  } catch {
    /* ignore */
  }
}

function todayLabel(): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "America/Los_Angeles",
  }).format(new Date());
}

function timeLabel(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Los_Angeles",
  }).format(d);
}

function summarizeReport(report?: Record<string, unknown> | null): string {
  if (!report || typeof report !== "object") return "";
  const parts: string[] = [];
  const updates = Number(report.updates);
  if (updates > 0) parts.push(`${updates} updated`);
  const statuses = Number(report.statuses);
  if (statuses > 0) parts.push(`${statuses} confirmed/skipped`);
  const deletes = Number(report.deletes);
  if (deletes > 0) parts.push(`${deletes} deleted`);
  const newProjects = Array.isArray(report.newProjects) ? report.newProjects.length : 0;
  if (newProjects > 0) parts.push(`${newProjects} added`);
  const added = Number(report.added);
  if (added > 0) parts.push(`${added} added`);
  const rebuilt =
    report.rebuilt && typeof report.rebuilt === "object" ? Object.keys(report.rebuilt).length : 0;
  if (rebuilt > 0) parts.push(`${rebuilt} client${rebuilt === 1 ? "" : "s"} rebuilt`);
  const texts =
    report.texts && typeof report.texts === "object" ? Object.keys(report.texts).length : 0;
  if (texts > 0) parts.push("crew texted");
  return parts.join(" · ");
}

function ConfirmPage() {
  const { user } = useAuth();
  const { effectiveRole } = useViewAs();
  const navigate = useNavigate();
  const allowed = canSee(effectiveRole, "special_confirm");
  const reviewable = useReviewableToday();
  useEffect(() => {
    if (!allowed) void navigate({ to: "/" });
  }, [allowed, navigate]);

  const cached = sessionCache.get<GetConfirmResponse>(CK);
  const [state, setState] = useState<ConfirmState | null>(() => cached?.state ?? null);
  const [todaysClients, setTodaysClients] = useState<string[]>(
    () => (cached?.todaysClients ?? []).map((c) => String(c).trim()).filter(Boolean),
  );
  const [projects, setProjects] = useState<Project[]>(
    () => (cached?.projects ?? []).map(normProject),
  );
  const gardenOptions = useMemo(
    () => projects.map((p) => p.garden).filter(Boolean),
    [projects],
  );
  const categoryOptions = useMemo(
    () => projects.map((p) => p.category).filter(Boolean),
    [projects],
  );
  // Read once per mount: later writes go through writeStaged, and re-reading
  // would fight the state we just restored.
  const stagedRef = useRef<StagedWork | null>(readStaged());
  /* Has `edits` been populated from a payload yet?
   *
   * THE BUG THIS FIXES. sessionCache is in-memory and documented as "cleared on
   * full page reload", so on EVERY reload `cached` is undefined and the `edits`
   * initializer below iterates an empty list — edits starts as {}. The mirror
   * effect then ran immediately, derived `statuses` from those empty edits, and
   * wrote statuses:{} straight over the localStorage copy BEFORE the fetch came
   * back. Every staged Confirmed/SKIP was destroyed on reload, and if the lead
   * had staged nothing else the whole record hit the clearStaged() branch. The
   * persistence added to survive a reload was being erased by the reload.
   *
   * Seeded true when we DID seed from cache, because then edits already holds
   * the restored statuses and mirroring it back is correct. */
  const hydratedRef = useRef<boolean>(!!cached);
  const [edits, setEdits] = useState<Record<string, Edit>>(() => {
    const initial: Record<string, Edit> = {};
    for (const p of (cached?.projects ?? []).map(normProject)) {
      const key = p.uid;
      initial[key] = {
        action: p.action,
        garden: p.garden,
        type: p.type,
        category: p.category,
        notes: p.notes,
        status: stagedRef.current?.statuses[key] ?? "Pending",
        expanded: p.showOnReview,
        notesOpen: !!p.notes,
      };
    }
    return initial;
  });
  // Staged deletions, cleared once submitted.
  const [deletes, setDeletes] = useState<Set<string>>(
    () => new Set(stagedRef.current?.deletes ?? []),
  );
  // Submitted deletions, held until the server confirms them; see
  // src/lib/optimistic.ts for why a payload alone is not proof.
  const { decide: optDecide, reconcile: optReconcile, records: optRecords } =
    // :v2 - overrides used to be stored under projectId. A persisted record
    // from the old scheme would never match a uid, so it would look abandoned
    // and raise a spurious "deletion may not have saved" on the first load.
    useOptimistic("confirm:deleted-projects:v2");
  const { advanceSubStep } = useSubStepOverride();
  const committedDeletes = useMemo(
    () => new Set(optRecords.filter((r) => r.kind === "deleted").map((r) => r.id)),
    [optRecords],
  );
  const [newByClient, setNewByClient] = useState<Record<string, NewProject[]>>({});
  const [pickerFor, setPickerFor] = useState<
    | { mode: "new"; client: string; key: string }
    | { mode: "existing"; client: string; projectId: string; uid: string }
    | null
  >(null);
  const [syncing, setSyncing] = useState<Set<string>>(new Set());
  const [expandedMore, setExpandedMore] = useState<Set<string>>(new Set());
  const [sendText, setSendText] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitFlash, setSubmitFlash] = useState<{ msg: string; err: boolean } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [offline, setOffline] = useState(false);
  const [animating, setAnimating] = useState<Record<string, "confirm" | "skip" | "delete">>({});
  const [confirmedClients, setConfirmedClients] = useState<Set<string>>(
    () => new Set(stagedRef.current?.confirmedClients ?? []),
  );
  const [flashClient, setFlashClient] = useState<string | null>(null);
  /* AF (8/2): the project whose skip is being resolved — one-off, or a
     standing season assignment. */
  const [seasonFor, setSeasonFor] = useState<
    { uid: string; projectId: string; client: string; action: string } | null
  >(null);
  /* PP1 (8/2): lifted out of the footer's IIFE — the footer's very
     EXISTENCE now depends on this, not just the button's enabled state. */
  const allClientsConfirmed =
    todaysClients.length > 0 && todaysClients.every((c) => confirmedClients.has(c));
  const toggleClientConfirmed = useCallback((client: string) => {
    setConfirmedClients((prev) => {
      const next = new Set(prev);
      if (next.has(client)) next.delete(client);
      else next.add(client);
      return next;
    });
  }, []);
  const beginAnim = useCallback(
    (key: string, kind: "confirm" | "skip" | "delete", after: () => void) => {
      setAnimating((p) => ({ ...p, [key]: kind }));
      window.setTimeout(() => {
        setAnimating((p) => {
          const n = { ...p };
          delete n[key];
          return n;
        });
        after();
      }, 300);
    },
    [],
  );

  // Mirror the handled markers to localStorage whenever they move. Only the
  // markers - not the field edits - because a restored edit would silently win
  // over a newer value from the sheet, and these three are what make a card
  // vanish and come back.
  useEffect(() => {
    /* Do not mirror until `edits` reflects a real payload. Before that it is {},
       and writing it back erases the very staging this effect exists to keep —
       see hydratedRef. Nothing is lost by waiting: the effect re-runs the moment
       applyData sets edits, which is also when hydratedRef becomes true. */
    if (!hydratedRef.current) return;
    const statuses: Record<string, "Confirmed" | "SKIP"> = {};
    for (const [uid, e] of Object.entries(edits)) {
      if (e.status === "Confirmed" || e.status === "SKIP") statuses[uid] = e.status;
    }
    const next = {
      confirmedClients: [...confirmedClients],
      statuses,
      deletes: [...deletes],
    };
    stagedRef.current = { day: crewDayLA(), ...next };
    if (!next.confirmedClients.length && !next.deletes.length && !Object.keys(statuses).length) {
      clearStaged();
    } else {
      writeStaged(next);
    }
  }, [edits, deletes, confirmedClients]);

  const fetchedRef = useRef(false);
  /** Reconciliation is suspended until this moment; see applyData and submit. */
  const reconcileHoldRef = useRef(0);

  // The client header sticks directly beneath the page header. Measured rather
  // than hardcoded: the page header's height changes with its content, and a
  // fixed offset either overlaps it or leaves a gap.
  const headerRef = useRef<HTMLElement | null>(null);
  const [clientStickyTop, setClientStickyTop] = useState(HEADER_TOP + 90);
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const measure = () => setClientStickyTop(HEADER_TOP + el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const applyData = useCallback((d: GetConfirmResponse) => {
    const ps = (d.projects ?? []).map(normProject);
    // A submitted delete stays suppressed until this payload stops carrying the
    // project. getConfirm can be served before the delete is readable, so
    // trusting each payload outright is what let deleted rows come back.
    //
    // Reconciliation is held off briefly after a submit: the load that follows
    // one can easily beat the write, and judging the override against that
    // payload is what produced spurious "may not have saved" warnings.
    if (Date.now() >= reconcileHoldRef.current) {
      const seen = new Set(ps.map((p) => p.uid).filter(Boolean));
      const abandoned = optReconcile((r) => !seen.has(r.id));
      if (abandoned.length) {
        setSubmitFlash({
          msg:
            abandoned.length === 1
              ? "1 deletion may not have saved — showing the server's version."
              : `${abandoned.length} deletions may not have saved — showing the server's version.`,
          err: true,
        });
      }
    }
    setState(d.state ?? {});
    setTodaysClients((d.todaysClients ?? []).map((c) => String(c).trim()).filter(Boolean));
    setProjects(ps);
    /* Set BEFORE setEdits: this is the moment `edits` starts reflecting real
       data, so the mirror effect that setEdits triggers is now safe to write.
       A ref, not state — it must be readable by that effect on the very same
       pass, without scheduling another render. */
    hydratedRef.current = true;
    setEdits((prev) => {
      const next: Record<string, Edit> = {};
      for (const p of ps) {
        const key = p.uid;
        const existing = prev[key];
        next[key] = existing ?? {
          action: p.action,
          garden: p.garden,
          type: p.type,
          category: p.category,
          notes: p.notes,
          // A card handled before a reload stays handled: the first payload
          // after remounting is exactly when it would otherwise come back.
          status: stagedRef.current?.statuses[key] ?? "Pending",
          expanded: p.showOnReview,
          notesOpen: !!p.notes,
        };
      }
      return next;
    });
  }, [optReconcile]);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {

      const res = await fetch(`${SCRIPT_URL}?action=getConfirm`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as GetConfirmResponse;
      sessionCache.set(CK, json);
      applyData(json);
      setOffline(false);
    } finally {
      setRefreshing(false);
    }
  }, [applyData]);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    (async () => {
      try {
        await load();
      } catch (e) {
        if (sessionCache.has(CK)) setOffline(true);
        else setLoadErr(e instanceof Error ? e.message : "Failed to load");
      }
    })();
  }, [load]);

  // Group projects by client, in todaysClients order. Projects whose deletion
  // has been submitted are withheld until the server stops sending them.
  //
  // What belongs on this screen: every SPECIAL project, and any RECURRING or
  // untyped one that actually has items to load. getConfirm already folds the
  // tools-sheet rows into p.items server-side, so that count is complete. A
  // RECURRING project with nothing to load has nothing to confirm, and other
  // types - FUTURE, for instance - are not this screen's business.
  const grouped = useMemo(() => {
    const map: Record<string, Project[]> = {};
    for (const c of todaysClients) map[c] = [];
    for (const p of projects) {
      if (!p.client) continue;
      if (committedDeletes.has(p.uid)) continue;
      const type = (p.type || "").trim().toUpperCase();
      const keep =
        type === "SPECIAL" ||
        ((type === "RECURRING" || type === "") && p.items.length > 0);
      if (!keep) continue;
      if (!map[p.client]) map[p.client] = [];
      map[p.client].push(p);
    }
    return map;
  }, [projects, todaysClients, committedDeletes]);

  const setEdit = useCallback((key: string, patch: Partial<Edit>) => {
    setEdits((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }, []);

  const undoDelete = useCallback((uid: string) => {
    setDeletes((prev) => {
      const next = new Set(prev);
      next.delete(uid);
      return next;
    });
  }, []);

  const addNewProject = useCallback((client: string) => {
    setNewByClient((prev) => {
      const list = prev[client] ? [...prev[client]] : [];
      list.push({
        key: `new-${client}-${Date.now()}-${list.length}`,
        client,
        action: "",
        garden: "",
        type: "RECURRING",
        category: "",
        notes: "",
        items: [],
      });
      return { ...prev, [client]: list };
    });
  }, []);

  const updateNewProject = useCallback(
    (client: string, key: string, patch: Partial<NewProject>) => {
      setNewByClient((prev) => {
        const list = (prev[client] ?? []).map((n) => (n.key === key ? { ...n, ...patch } : n));
        return { ...prev, [client]: list };
      });
    },
    [],
  );

  const removeNewProject = useCallback((client: string, key: string) => {
    setNewByClient((prev) => {
      const list = (prev[client] ?? []).filter((n) => n.key !== key);
      return { ...prev, [client]: list };
    });
  }, []);

  const appendNewItem = useCallback(
    (client: string, key: string, item: NewItem) => {
      setNewByClient((prev) => {
        const list = (prev[client] ?? []).map((n) =>
          n.key === key ? { ...n, items: [...n.items, item] } : n,
        );
        return { ...prev, [client]: list };
      });
    },
    [],
  );

  const removeNewItem = useCallback((client: string, key: string, idx: number) => {
    setNewByClient((prev) => {
      const list = (prev[client] ?? []).map((n) =>
        n.key === key ? { ...n, items: n.items.filter((_, i) => i !== idx) } : n,
      );
      return { ...prev, [client]: list };
    });
  }, []);

  const toggleMore = useCallback((client: string) => {
    setExpandedMore((prev) => {
      const next = new Set(prev);
      if (next.has(client)) next.delete(client);
      else next.add(client);
      return next;
    });
  }, []);

  const markSync = useCallback((key: string, on: boolean) => {
    setSyncing((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);

  const editProjectLive = useCallback(
    async (p: Project, patch: Record<string, string>, applyToEdit?: (e: Edit) => Partial<Edit>) => {
      if (!p.projectId) return;
      const key = p.uid;
      // optimistic
      if (applyToEdit) {
        setEdits((prev) => ({ ...prev, [key]: { ...prev[key], ...applyToEdit(prev[key]) } }));
      }
      markSync(key, true);
      try {
        const res = await fetch(SCRIPT_URL, {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: JSON.stringify({ action: "editProject", projectId: p.projectId, client: p.client, ...patch }),
        });
        const json = (await res.json()) as { ok?: boolean; error?: string };
        if (!json.ok) throw new Error(json.error || "not ok");
      } catch (err) {
        setSubmitFlash({
          msg: err instanceof Error ? `Couldn't save — ${err.message}` : "Couldn't save",
          err: true,
        });
      } finally {
        markSync(key, false);
      }
    },
    [markSync],
  );

  const addItemToExisting = useCallback(
    // uid identifies the row locally; the backend is addressed by
    // (client, projectId), which is unique even though projectId alone is not.
    async (client: string, projectId: string, uid: string, picked: NewItem) => {
      // optimistic append pill
      const snapshot = projects;
      setProjects((prev) =>
        prev.map((p) =>
          p.uid === uid
            ? { ...p, items: [...p.items, picked] }
            : p,
        ),
      );
      markSync(uid, true);
      try {
        const res = await fetch(SCRIPT_URL, {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: JSON.stringify({
            action: "addItems",
            client,
            projectId,
            items: [{ name: picked.name, qty: picked.qty, size: picked.size }],
          }),
        });
        const json = (await res.json()) as { ok?: boolean; error?: string };
        if (!json.ok) throw new Error(json.error || "not ok");
      } catch (err) {
        setProjects(snapshot);
        setSubmitFlash({
          msg: err instanceof Error ? `Couldn't add item — ${err.message}` : "Couldn't add item",
          err: true,
        });
      } finally {
        markSync(uid, false);
      }
    },
    [projects, markSync],
  );

  const removeItemFromExisting = useCallback(
    async (client: string, projectId: string, uid: string, idx: number, it: Item) => {
      const snapshot = projects;
      setProjects((prev) =>
        prev.map((p) =>
          p.uid === uid
            ? { ...p, items: p.items.filter((_, i) => i !== idx) }
            : p,
        ),
      );
      markSync(uid, true);
      try {
        const res = await fetch(SCRIPT_URL, {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: JSON.stringify({
            action: "removeItem",
            client,
            projectId,
            item: { name: it.name, qty: it.qty, size: it.size },
          }),
        });
        const json = (await res.json()) as { ok?: boolean; error?: string };
        if (!json.ok) throw new Error(json.error || "not ok");
      } catch (err) {
        setProjects(snapshot);
        setSubmitFlash({
          msg: err instanceof Error ? `Couldn't remove item — ${err.message}` : "Couldn't remove item",
          err: true,
        });
      } finally {
        markSync(uid, false);
      }
    },
    [projects, markSync],
  );

  const distinctTypes = useMemo(() => {
    const set = new Set<string>();
    for (const p of projects) if (p.type.trim()) set.add(p.type.trim());
    return [...set].sort();
  }, [projects]);

  const submit = useCallback(async () => {
    // Build payload
    // client travels with every id: projectId alone matches up to four rows.
    const statuses: Array<{ projectId: string; client: string; status: "Confirmed" | "SKIP" }> = [];
    const updates: Array<Record<string, string>> = [];
    const deletesArr: Array<{ projectId: string; client: string }> = [];
    for (const p of projects) {
      const key = p.uid;
      const e = edits[key];
      if (!e) continue;
      if (!p.projectId) continue;
      if (deletes.has(p.uid)) {
        deletesArr.push({ projectId: p.projectId, client: p.client });
        continue;
      }
      if (e.status === "Confirmed" || e.status === "SKIP") {
        statuses.push({ projectId: p.projectId, client: p.client, status: e.status });
      } else if (confirmedClients.has(p.client)) {
        /* PP2 (8/2) ROOT CAUSE: confirming a CLIENT card never wrote the
           per-project Status, and Load Vehicle only lists items whose
           project Status is exactly "Confirmed" — so a fully confirmed
           day handed Load Vehicle nothing. Confirming the client now
           confirms its projects; an explicit SKIP above still wins. */
        statuses.push({ projectId: p.projectId, client: p.client, status: "Confirmed" });
      }
      const diff: Record<string, string> = {};
      if (e.action !== p.action) diff.action = e.action;
      if (e.garden !== p.garden) diff.garden = e.garden;
      if (e.type !== p.type) diff.type = e.type;
      if (e.category !== p.category) diff.category = e.category;
      if (e.notes !== p.notes) diff.notes = e.notes;
      if (Object.keys(diff).length) {
        updates.push({ projectId: p.projectId, client: p.client, ...diff });
      }
    }
    const newProjects: Array<Record<string, unknown>> = [];
    for (const client of Object.keys(newByClient)) {
      for (const n of newByClient[client]) {
        if (!n.action.trim()) continue;
        const items = n.items
          .filter((i) => i.name.trim())
          .map((i) => ({ name: i.name, qty: i.qty, size: i.size, notes: i.notes }));
        newProjects.push({
          client: n.client,
          action: n.action,
          garden: n.garden || undefined,
          type: n.type || undefined,
          category: n.category || undefined,
          notes: n.notes || undefined,
          items: items.length ? items : undefined,
        });
      }
    }
    const payload = {
      action: "confirmDay",
      statuses,
      updates,
      newProjects,
      deletes: deletesArr,
      sendText,
    };
    setSubmitting(true);
    setSubmitFlash(null);
    try {
      const res = await fetch(SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        report?: Record<string, unknown>;
        error?: string;
        state?: ConfirmState;
      };
      if (!json.ok) throw new Error(json.error || "not ok");
      // confirmDay only sets CONFIRM_STATE.confirmed. The backend's day-state
      // ladder needs specialConfirmed too, and nothing else ever sent it — the
      // server sat at special_confirm forever while the spine's 90s override
      // pretended otherwise, then yanked everyone back here.
      try {
        await fetch(SCRIPT_URL, {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: JSON.stringify({ action: "confirmSpecial" }),
        });
      } catch {
        /* poll reconciliation will surface it if this didn't land */
      }
      const reportSummary = summarizeReport(json.report);
      setSubmitFlash({
        msg: reportSummary ? `Confirmed. ${reportSummary}` : "Confirmed.",
        err: false,
      });
      // Advance the spine on the ok. The navigate below then lands on /loading
      // with the day state already showing the next step.
      advanceSubStep("loading");
      if (json.state) setState(json.state);
      // Hand the staged deletions to the optimistic store before clearing them,
      // so the reload below cannot resurrect what was just deleted.
      for (const id of deletes) if (id) optDecide("deleted", id);
      // Drop the cached payload so a re-entry cannot seed from a pre-delete copy,
      // and give the write a moment before any override is judged against a
      // response - the reload below can easily be served ahead of it.
      sessionCache.clear(CK);
      reconcileHoldRef.current = Date.now() + 2000;
      // The sheet is the record now, so the local staging copy is spent.
      // Cleared before the reload, or restoring it would re-hide cards the
      // server has already accounted for.
      stagedRef.current = null;
      clearStaged();
      setDeletes(new Set());
      setNewByClient({});
      // Reload to reflect authoritative server state
      try {
        await load();
      } catch {
        /* ignore */
      }
      void navigate({ to: "/loading" });
    } catch (e) {
      setSubmitFlash({
        msg: e instanceof Error ? `Failed — ${e.message}` : "Failed.",
        err: true,
      });
    } finally {
      setSubmitting(false);
    }
  }, [projects, edits, deletes, newByClient, sendText, load, optDecide, advanceSubStep]);

  if (!allowed) return null;

  return (
    <div style={PAGE}>
      <style>{`
        @keyframes bvFlashLime {
          0%,100% { background:#121212; box-shadow:none; }
          50% { background:rgba(124,255,0,.22); box-shadow:0 0 18px rgba(124,255,0,.35); }
        }
        @keyframes bvSlideRightFade {
          to { transform: translateX(40%); opacity: .5; }
        }
        @keyframes bvShrinkOut {
          to { transform: scale(.85); opacity: 0; }
        }
      `}</style>
      <header ref={headerRef} style={HEADER}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ color: LIME, fontSize: 20, fontWeight: "bold", letterSpacing: 2 }}>
            CONFIRM DAY
          </div>
          <RefreshDot refreshing={refreshing} offline={offline} />
          {offline && <span style={{ color: MUTED, fontSize: 14 }}>offline — last data</span>}
        </div>
        <div style={{ marginTop: 4, color: TEXT, fontSize: 14 }}>{todayLabel()}</div>
        <div style={{ marginTop: 2, fontSize: 14, color: MUTED }}>
          Confirm today's loading list
        </div>
        {/* The "Confirmed at … — re-confirming allowed" banner is hidden: it
            restates what the screen already shows and re-confirming is obvious
            from the button still being there. */}
        {user ? null : null}
      </header>

      {loadErr && (
        <div style={STATE}>
          Couldn't load the confirm data.
          <br />
          <span style={{ color: RED }}>{loadErr}</span>
        </div>
      )}

      {!loadErr && state === null && <div style={STATE}>Loading…</div>}

      {!loadErr && state !== null && reviewable === false && (
        <div style={STATE}>
          No special loading in the books for today, anything you want to add for
          today's clients?
        </div>
      )}

      {!loadErr &&
        state !== null &&
        todaysClients.length === 0 && (
          <div style={STATE}>No clients scheduled for today.</div>
        )}

      {!loadErr &&
        todaysClients.map((client) => {
          const list = grouped[client] ?? [];
          const visible = list.filter((p) => {
            const key = p.uid;
            const e = edits[key];
            return e ? e.expanded : p.showOnReview;
          });
          const collapsed = list.filter((p) => {
            const key = p.uid;
            const e = edits[key];
            const isExpanded = e ? e.expanded : p.showOnReview;
            return !isExpanded;
          });
          const showAll = expandedMore.has(client);
          const rendered = showAll ? list : visible;
          const newList = newByClient[client] ?? [];
          return (
            <section key={client} style={{ margin: "16px 12px 0" }}>
              {confirmedClients.has(client) ? (
                <button
                  onClick={() => toggleClientConfirmed(client)}
                  style={{
                    ...CLIENT_CARD,
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    width: "100%",
                    cursor: "pointer",
                    padding: "14px 16px",
                    background: "#0f1509",
                    color: LIME_BRIGHT,
                    fontFamily: "inherit",
                    textAlign: "left",
                  }}
                  title="Tap to re-open"
                >
                  <Check size={22} />
                  <span style={{ fontSize: 20, fontWeight: "bold", letterSpacing: 2 }}>
                    {client}
                  </span>
                </button>
              ) : (
              <div
                style={{
                  ...CLIENT_CARD,
                  animation: flashClient === client ? "bvFlashLime 300ms ease" : undefined,
                }}
              >
              <div style={{ ...CLIENT_HEAD, top: clientStickyTop }}>
                <span
                  style={{
                    color: LIME_BRIGHT,
                    fontSize: 22,
                    fontWeight: "bold",
                    letterSpacing: 2,
                    textAlign: "center",
                    width: "100%",
                  }}
                >
                  {client}
                </span>
                <div style={{ fontSize: 14, color: MUTED, textAlign: "center", width: "100%", marginTop: 4 }}>
                  {list.length} project{list.length === 1 ? "" : "s"}
                </div>
              </div>

              {rendered.map((p) => {
                const key = p.uid;
                const e = edits[key];
                if (!e) return null;
                const isDeleted = deletes.has(p.uid);
                const skip = e.status === "SKIP";
                const confirmed = e.status === "Confirmed";
                // Optimistically hide handled cards (deleted / skipped / confirmed).
                if (isDeleted || skip || confirmed) return null;
                const anim = animating[key];
                return (
                  <div
                    key={key}
                    style={{
                      ...CARD,
                      marginTop: 8,
                      opacity: isDeleted ? 0.4 : skip ? 0.55 : 1,
                      animation:
                        anim === "confirm"
                          ? "bvFlashLime 300ms ease"
                          : anim === "skip"
                            ? "bvSlideRightFade 300ms ease forwards"
                            : anim === "delete"
                              ? "bvShrinkOut 300ms ease forwards"
                              : undefined,
                    }}
                  >
                    {/* Type, Garden and Category share one row at the same
                        weight. They used to be a right-aligned Type plus a
                        two-column labelled block lower down, which was most of
                        the card's height for three short values. */}
                    <div
                      style={{
                        display: "flex",
                        gap: 6,
                        marginBottom: 10,
                        alignItems: "center",
                        justifyContent: "center",
                        flexWrap: "wrap",
                      }}
                    >
                      <TypeSelect
                        value={e.type}
                        options={distinctTypes}
                        syncing={syncing.has(p.uid)}
                        disabled={isDeleted || !p.projectId}
                        onChange={(val) => {
                          if (val === e.type) return;
                          void editProjectLive(p, { type: val }, () => ({ type: val }));
                        }}
                      />
                      <ComboSelect
                        value={e.garden}
                        options={gardenOptions}
                        onChange={(v) => setEdit(key, { garden: v })}
                        disabled={isDeleted}
                        placeholder="GARDEN"
                        compact
                      />
                      <ComboSelect
                        value={e.category}
                        options={categoryOptions}
                        onChange={(v) => setEdit(key, { category: v })}
                        disabled={isDeleted}
                        placeholder="CATEGORY"
                        compact
                      />
                    </div>

                    <label style={LABEL}>ACTION</label>
                    {/* A textarea, not an input: an input cannot wrap, so any
                        action longer than the field was cut off with no way to
                        read it. Grows to fit its content on mount and on edit. */}
                    <textarea
                      value={e.action}
                      onChange={(ev) => {
                        setEdit(key, { action: ev.target.value });
                        autoGrow(ev.currentTarget);
                      }}
                      ref={autoGrow}
                      rows={1}
                      style={ACTION_INPUT}
                      disabled={isDeleted}
                    />
                    {/* Items and their add button share one row: the button was
                        a full-width block below the pills, which pushed every
                        card taller than a phone screen. */}
                    {(p.items.length > 0 || (p.projectId && !isDeleted)) && (
                      <div style={ITEMS_ROW}>
                        {p.items.map((it, i) => {
                          const label = [it.qty, it.name, it.size]
                            .map((s) => String(s ?? "").trim())
                            .filter(Boolean)
                            .join(" · ");
                          return (
                            <span key={i} style={ITEM_PILL} title={it.notes || undefined}>
                              <span style={{ paddingRight: 4 }}>{label || it.name}</span>
                              {p.projectId && (
                                <button
                                  aria-label="Remove item"
                                  title="Remove item"
                                  onClick={() =>
                                    void removeItemFromExisting(client, p.projectId, p.uid, i, it)
                                  }
                                  style={ITEM_PILL_X}
                                >
                                  ×
                                </button>
                              )}
                            </span>
                          );
                        })}
                        {p.projectId && !isDeleted && (
                          <button
                            style={ADD_ITEM_PILL}
                            onClick={() =>
                              setPickerFor({ mode: "existing", client, projectId: p.projectId, uid: p.uid })
                            }
                          >
                            + ADD ITEM
                          </button>
                        )}
                      </div>
                    )}

                    {e.notesOpen ? (
                      <>
                        <label style={LABEL}>NOTES</label>
                        <textarea
                          value={e.notes}
                          onChange={(ev) => setEdit(key, { notes: ev.target.value })}
                          style={{ ...INPUT, resize: "vertical" }}
                          rows={2}
                          disabled={isDeleted}
                          autoFocus={!e.notes}
                        />
                      </>
                    ) : null}

                    <div
                      style={{
                        marginTop: 12,
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      {/* The Project ID itself is internal and hidden. The
                          missing-ID warning stays: it tells the user this card
                          cannot be saved, which they do need to see. */}
                      {!p.projectId && (
                        <span style={{ fontSize: 14, color: RED, letterSpacing: 1 }}>
                          NO ID (won't save)
                        </span>
                      )}
                      {isDeleted && (
                        <button
                          style={{ ...GHOST_BTN_SM, marginLeft: "auto" }}
                          onClick={() => undoDelete(p.uid)}
                        >
                          UNDO DELETE
                        </button>
                      )}
                    </div>
                    <div
                      style={{
                        marginTop: 14,
                        paddingTop: 12,
                        borderTop: `1px solid ${LINE}`,
                        display: "flex",
                        justifyContent: "center",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      {/* Notes sits with the other card actions rather than
                          occupying a row of its own. */}
                      {!e.notesOpen && (
                        <button
                          style={{ ...GHOST_BTN_SM, marginRight: "auto" }}
                          onClick={() => setEdit(key, { notesOpen: true })}
                          disabled={isDeleted}
                        >
                          + ADD NOTES
                        </button>
                      )}
                      <button
                        aria-label="Confirm"
                        title="Confirm"
                        style={ICON_ACTION_BTN}
                        onClick={() =>
                          beginAnim(key, "confirm", () => setEdit(key, { status: "Confirmed" }))
                        }
                      >
                        <Check size={20} />
                      </button>
                      <button
                        aria-label="Skip"
                        title="Skip"
                        style={ICON_ACTION_BTN}
                        /* AF.1 (8/2): skipping now asks whether this is a
                           one-off or a seasonal task, so "Heavy prune" can
                           be assigned once instead of skipped every pass. */
                        onClick={() =>
                          p.projectId
                            ? setSeasonFor({
                                uid: key,
                                projectId: p.projectId,
                                client: p.client,
                                action: p.action,
                              })
                            : beginAnim(key, "skip", () => setEdit(key, { status: "SKIP" }))
                        }
                      >
                        <SkipForward size={20} />
                      </button>
                      {p.projectId && (
                        <button
                          aria-label="Delete"
                          title="Delete"
                          style={ICON_ACTION_BTN}
                          onClick={async () => {
                            if (
                              !(await confirmModal({
                                message: `Delete this project?\n\n${e.action || "(no action)"}`,
                                destructive: true,
                              }))
                            )
                              return;
                            beginAnim(key, "delete", () => {
                              setDeletes((prev) => {
                                const next = new Set(prev);
                                next.add(p.uid);
                                return next;
                              });
                            });
                          }}
                        >
                          <Trash2 size={20} />
                        </button>
                      )}
                    </div>
                  </div>

                );
              })}

              {!showAll && collapsed.length > 0 && (
                <button
                  style={{ ...GHOST_BTN_SM, marginTop: 8 }}
                  onClick={() => toggleMore(client)}
                >
                  MORE PROJECTS ({collapsed.length})
                </button>
              )}
              {showAll && collapsed.length > 0 && (
                <button
                  style={{ ...GHOST_BTN_SM, marginTop: 8 }}
                  onClick={() => toggleMore(client)}
                >
                  HIDE EXTRA ({collapsed.length})
                </button>
              )}

              {newList.map((n) => (
                <div key={n.key} style={{ ...CARD, marginTop: 8, borderColor: LIME_DIM }}>
                  <div style={{ display: "flex", alignItems: "baseline", marginBottom: 8 }}>
                    <span style={{ color: LIME, fontSize: 14, letterSpacing: 1 }}>
                      NEW PROJECT
                    </span>
                    <div style={{ flex: 1 }} />
                    <SegBtn
                      active={n.type.toUpperCase() === "SPECIAL"}
                      onClick={() =>
                        updateNewProject(client, n.key, {
                          type:
                            n.type.toUpperCase() === "SPECIAL" ? "RECURRING" : "SPECIAL",
                        })
                      }
                    >
                      {n.type.toUpperCase() === "SPECIAL" ? "SPECIAL" : "RECURRING"}
                    </SegBtn>
                  </div>
                  <label style={LABEL}>ACTION *</label>
                  <input
                    value={n.action}
                    onChange={(ev) =>
                      updateNewProject(client, n.key, { action: ev.target.value })
                    }
                    style={INPUT}
                    placeholder="e.g. Prune roses"
                  />
                  <div style={ROW2}>
                    <div style={{ flex: 1 }}>
                      <label style={LABEL}>GARDEN</label>
                      <ComboSelect
                        value={n.garden}
                        options={gardenOptions}
                        onChange={(v) => updateNewProject(client, n.key, { garden: v })}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={LABEL}>CATEGORY</label>
                      <ComboSelect
                        value={n.category}
                        options={categoryOptions}
                        onChange={(v) => updateNewProject(client, n.key, { category: v })}
                      />
                    </div>
                  </div>
                  <label style={LABEL}>NOTES</label>
                  <textarea
                    value={n.notes}
                    onChange={(ev) =>
                      updateNewProject(client, n.key, { notes: ev.target.value })
                    }
                    style={{ ...INPUT, resize: "vertical" }}
                    rows={2}
                  />
                  <div style={{ marginTop: 10 }}>
                    <div
                      style={{
                        fontSize: 14,
                        color: MUTED,
                        letterSpacing: 1,
                        marginBottom: 6,
                      }}
                    >
                      ITEMS
                    </div>
                    {n.items.map((it, i) => (
                      <div
                        key={i}
                        style={{
                          display: "flex",
                          gap: 6,
                          alignItems: "flex-start",
                          marginBottom: 6,
                          padding: "8px 10px",
                          border: `1px solid ${LINE}`,
                          borderRadius: 6,
                          background: "#0a0a0a",
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ color: LIME, fontSize: 14, fontWeight: "bold", wordBreak: "break-word" }}>
                            {it.name}
                          </div>
                          <div style={{ color: MUTED, fontSize: 14, marginTop: 2 }}>
                            {[it.qty && `Qty ${it.qty}`, it.size, it.notes].filter(Boolean).join(" · ") || "—"}
                          </div>
                        </div>
                        <button
                          style={{
                            ...GHOST_BTN_SM,
                            color: RED,
                            borderColor: RED,
                            minWidth: 44,
                          }}
                          onClick={() => removeNewItem(client, n.key, i)}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    <button
                      style={{ ...ADD_ITEM_BTN, marginTop: 6 }}
                      onClick={() => setPickerFor({ mode: "new", client, key: n.key })}
                    >
                      + ADD ITEM
                    </button>

                  </div>
                  <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
                    <button
                      style={{ ...GHOST_BTN_SM, color: RED, borderColor: RED }}
                      onClick={() => removeNewProject(client, n.key)}
                    >
                      DISCARD
                    </button>
                  </div>
                </div>
              ))}

              <button
                style={{ ...GHOST_BTN_SM, marginTop: 8 }}
                onClick={() => addNewProject(client)}
              >
                + ADD PROJECT
              </button>

              <button
                style={{ ...SOLID_BTN, width: "100%", marginTop: 16 }}
                onClick={() => {
                  setFlashClient(client);
                  window.setTimeout(() => {
                    setFlashClient(null);
                    toggleClientConfirmed(client);
                  }, 280);
                }}
              >
                CONFIRM {client.toUpperCase()}
              </button>
              </div>
              )}
            </section>

          );
        })}

      {/* PP1 (8/2): until every client card is confirmed there is NO
          footer at all — not a disabled one. The footer is a fixed bar
          pinned across the bottom, so rendering it early parked a dead
          overlay over the last card. An inline hint (in normal flow,
          not fixed) says what's outstanding instead. */}
      {!allClientsConfirmed && (
        <div
          style={{
            margin: "8px 12px 24px",
            padding: "10px 12px",
            border: `1px solid ${LINE}`,
            borderRadius: 8,
            color: MUTED,
            fontSize: 12,
            letterSpacing: 0.5,
            textAlign: "center",
          }}
        >
          {todaysClients.length === 0
            ? "No clients scheduled today."
            : `Confirm each client to continue — ${confirmedClients.size} of ${todaysClients.length} done.`}
        </div>
      )}

      {(allClientsConfirmed || submitFlash) && <div style={{ height: 140 }} />}

      {(allClientsConfirmed || submitFlash) && (
      <div style={FOOTER}>
        {submitFlash && (
          <div
            style={{
              fontSize: 14,
              color: submitFlash.err ? RED : LIME,
              marginBottom: 8,
            }}
          >
            {submitFlash.msg}
          </div>
        )}
        {allClientsConfirmed && (() => {
          return (
            <>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  color: TEXT,
                  fontSize: 13,
                  marginBottom: 8,
                  cursor: "pointer",
                  opacity: allClientsConfirmed ? 1 : 0.5,
                }}
              >
                <input
                  type="checkbox"
                  checked={sendText}
                  onChange={(e) => setSendText(e.target.checked)}
                  style={{ width: 20, height: 20, accentColor: LIME }}
                  disabled={!allClientsConfirmed}
                />
                Text the crew the loading link
              </label>
              <button
                style={{
                  ...SOLID_BTN,
                  width: "100%",
                  opacity: allClientsConfirmed && !submitting ? 1 : 0.4,
                  cursor: allClientsConfirmed && !submitting ? "pointer" : "not-allowed",
                }}
                onClick={submit}
                disabled={
                  submitting || !!loadErr || state === null || !allClientsConfirmed
                }
              >
                {submitting
                  ? "CONFIRMING…"
                  : !allClientsConfirmed
                    ? `CONFIRM EACH CLIENT (${confirmedClients.size}/${todaysClients.length})`
                    : reviewable === false
                      ? "CONFIRM DAILY LOAD & NOTIFY CREW"
                      : "CONFIRM SPECIAL LOADING"}
              </button>
            </>
          );
        })()}

      </div>
      )}
      {seasonFor && (
        <SeasonSheet
          projectAction={seasonFor.action}
          onClose={() => setSeasonFor(null)}
          onSkipOnce={() => {
            const k = seasonFor.uid;
            setSeasonFor(null);
            beginAnim(k, "skip", () => setEdit(k, { status: "SKIP" }));
          }}
          onAssign={async (seasons) => {
            const target = seasonFor;
            setSeasonFor(null);
            try {
              await fetch(SCRIPT_URL, {
                method: "POST",
                headers: { "Content-Type": "text/plain" },
                body: JSON.stringify({
                  action: "assignSeasons",
                  projectId: target.projectId,
                  client: target.client,
                  seasons,
                }),
              });
            } catch { /* the skip below still stands for today */ }
            // Assignment is a standing rule, not a confirmation — today's
            // pass still treats it as skipped (AF.6).
            beginAnim(target.uid, "skip", () => setEdit(target.uid, { status: "SKIP" }));
          }}
        />
      )}
      {pickerFor && (
        <ItemPicker
          onCancel={() => setPickerFor(null)}
          onAdd={(picked) => {
            if (pickerFor.mode === "new") {
              appendNewItem(pickerFor.client, pickerFor.key, picked);
            } else {
              void addItemToExisting(pickerFor.client, pickerFor.projectId, pickerFor.uid, picked);
            }
            setPickerFor(null);
          }}
        />
      )}
    </div>
  );
}

function TypeSelect({
  value,
  options,
  disabled,
  syncing,
  onChange,
}: {
  value: string;
  options: string[];
  disabled?: boolean;
  syncing?: boolean;
  onChange: (val: string) => void;
}) {
  const [customOpen, setCustomOpen] = useState(false);
  const [custom, setCustom] = useState("");
  const opts = Array.from(new Set([...options, value].filter(Boolean)));
  if (customOpen) {
    return (
      <div style={{ display: "flex", gap: 4 }}>
        <input
          autoFocus
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          placeholder="Type…"
          style={{
            ...INPUT,
            width: 140,
            padding: "4px 8px",
            minHeight: 36,
            fontSize: 11,
            letterSpacing: 1,
            color: LIME,
          }}
        />
        <button
          style={{ ...GHOST_BTN_SM, minHeight: 36 }}
          onClick={() => {
            const v = custom.trim();
            setCustomOpen(false);
            setCustom("");
            if (v) onChange(v);
          }}
        >
          OK
        </button>
      </div>
    );
  }
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => {
        if (e.target.value === "__custom__") {
          setCustom("");
          setCustomOpen(true);
          return;
        }
        onChange(e.target.value);
      }}
      style={{
        background: "transparent",
        color: syncing ? MUTED : LIME,
        border: `1px solid ${LIME}`,
        borderRadius: 6,
        padding: "0 8px",
        minHeight: 36,
        fontFamily: "inherit",
        fontSize: 11,
        letterSpacing: 2,
        fontWeight: "bold",
        cursor: "pointer",
        // Fixed so Type, Garden and Category are visibly one set of three.
        width: 128,
        flex: "0 0 auto",
        textOverflow: "ellipsis",
      }}
    >
      {!value && <option value="">—</option>}
      {opts.map((o) => (
        <option key={o} value={o}>
          {o.toUpperCase()}
        </option>
      ))}
      <option value="__custom__">CUSTOM…</option>
    </select>
  );
}

function SegBtn({
  active,
  danger,
  onClick,
  children,
}: {
  active: boolean;
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const accent = danger ? RED : LIME;
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? accent : "transparent",
        color: active ? "#0a0a0a" : accent,
        border: `1px solid ${accent}`,
        borderRadius: 6,
        padding: "0 12px",
        minHeight: 36,
        fontFamily: "inherit",
        fontSize: 11,
        letterSpacing: 2,
        fontWeight: "bold",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function BigSegBtn({
  active,
  danger,
  onClick,
  children,
}: {
  active: boolean;
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const accent = danger ? RED : LIME_BRIGHT;
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? accent : "transparent",
        color: active ? "#0a0a0a" : accent,
        border: `2px solid ${accent}`,
        borderRadius: 8,
        padding: "0 28px",
        minHeight: 48,
        minWidth: 140,
        fontFamily: "inherit",
        fontSize: 14,
        letterSpacing: 3,
        fontWeight: "bold",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

/* ---------- styles ---------- */
const LIME = "#7cff00";
const LIME_BRIGHT = "#bfff3c";
const LIME_DIM = "rgba(124,255,0,.35)";
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
/** Where the page header sticks; the client headers stack directly below it. */
const HEADER_TOP = 44;
const HEADER: React.CSSProperties = {
  position: "sticky",
  top: HEADER_TOP,
  zIndex: 10,
  background: "#0a0a0a",
  borderBottom: `1px solid ${LINE}`,
  padding: "14px 16px 12px",
};
const SUCCESS_BANNER: React.CSSProperties = {
  marginTop: 10,
  padding: "8px 10px",
  background: "rgba(124,255,0,.08)",
  border: `1px solid ${LIME_DIM}`,
  color: LIME,
  borderRadius: 6,
  fontSize: 14,
};
const CLIENT_CARD: React.CSSProperties = {
  background: "#0f1509",
  border: `3px solid #d9ff70`,
  borderRadius: 14,
  padding: 14,
  boxShadow: "0 0 0 2px rgba(191,255,60,.18), 0 0 28px rgba(191,255,60,.14)",
};
const CLIENT_HEAD: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  padding: "10px 4px 12px",
  borderBottom: `1px solid ${LIME_DIM}`,
  marginBottom: 8,
  // Sticks within its own client card, so it holds while that client's projects
  // scroll and gives way when the next client's card arrives. `top` is supplied
  // at the call site from the measured page-header height - zIndex 5 keeps it
  // under the page header (10), which it slides beneath.
  position: "sticky",
  zIndex: 5,
  background: "#0f1509",
};

const CARD: React.CSSProperties = {
  background: "#121212",
  border: `1px solid rgba(124,255,0,0.45)`,
  borderRadius: 10,
  padding: 12,
};

const LABEL: React.CSSProperties = {
  display: "block",
  fontSize: 14,
  color: MUTED,
  letterSpacing: 1,
  margin: "8px 0 4px",
};
const INPUT: React.CSSProperties = {
  width: "100%",
  background: "#0a0a0a",
  color: TEXT,
  border: `1px solid ${LINE}`,
  borderRadius: 6,
  padding: "10px 10px",
  fontFamily: "inherit",
  fontSize: 13,
  boxSizing: "border-box",
};
const ROW2: React.CSSProperties = { display: "flex", gap: 8 };
const ACTION_INPUT: React.CSSProperties = {
  width: "100%",
  background: "#0a0a0a",
  color: LIME_BRIGHT,
  border: `1px solid ${LINE}`,
  borderRadius: 8,
  padding: "18px 16px",
  fontFamily: "inherit",
  fontSize: 24,
  fontWeight: "bold",
  boxSizing: "border-box",
  // Wraps and grows instead of clipping. No overflow:hidden and no clamp - the
  // whole action has to be readable.
  lineHeight: 1.25,
  resize: "vertical",
  overflowY: "auto",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};
const ITEMS_ROW: React.CSSProperties = {
  marginTop: 10,
  marginLeft: 12,
  paddingLeft: 8,
  borderLeft: `1px solid ${LIME_DIM}`,
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 10,
};
/**
 * Filled, because these are the items that ARE on the load. Add Item is the
 * outlined pill beside them - the contrast is what separates a thing that
 * exists from the control that makes another one.
 */
const ITEM_PILL: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  fontSize: 18,
  color: "#0a0a0a",
  background: LIME_BRIGHT,
  border: `1px solid ${LIME_BRIGHT}`,
  borderRadius: 999,
  padding: "4px 6px 4px 14px",
  letterSpacing: 0.5,
  fontWeight: "bold",
};

const ADD_ITEM_PILL: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  fontSize: 14,
  color: LIME,
  background: "transparent",
  border: `1px solid ${LIME}`,
  borderRadius: 999,
  padding: "0 16px",
  minHeight: 38,
  fontFamily: "inherit",
  fontWeight: "bold",
  letterSpacing: 1.5,
  cursor: "pointer",
};
const ITEM_PILL_X: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: 32,
  minHeight: 32,
  width: 32,
  height: 32,
  padding: 0,
  marginLeft: 2,
  // Sits on a filled lime pill now, so it has to be dark to be visible.
  background: "transparent",
  color: "#0a0a0a",
  border: `1px solid rgba(10,10,10,.45)`,
  borderRadius: 999,
  fontFamily: "inherit",
  fontSize: 18,
  lineHeight: 1,
  cursor: "pointer",
};
const ADD_ITEM_BTN: React.CSSProperties = {
  background: "transparent",
  color: LIME,
  border: `1px solid ${LIME}`,
  borderRadius: 8,
  padding: "0 24px",
  minHeight: 60,
  fontFamily: "inherit",
  fontSize: 18,
  letterSpacing: 2,
  fontWeight: "bold",
  cursor: "pointer",
};

const CHIP: React.CSSProperties = {
  display: "inline-block",
  fontSize: 11,
  color: LIME,
  border: `1px solid ${LIME_DIM}`,
  borderRadius: 4,
  padding: "3px 8px",
};
const SOLID_BTN: React.CSSProperties = {
  background: LIME,
  color: "#0a0a0a",
  border: "none",
  borderRadius: 6,
  padding: "0 18px",
  minHeight: 56,
  fontFamily: "inherit",
  fontSize: 14,
  letterSpacing: 2,
  fontWeight: "bold",
  cursor: "pointer",
};
const GHOST_BTN_SM: React.CSSProperties = {
  background: "transparent",
  color: LIME,
  border: `1px solid ${LIME_DIM}`,
  borderRadius: 6,
  padding: "0 12px",
  minHeight: 36,
  fontFamily: "inherit",
  fontSize: 11,
  letterSpacing: 2,
  fontWeight: "bold",
  cursor: "pointer",
};
const ICON_ACTION_BTN: React.CSSProperties = {
  background: "transparent",
  color: LIME_BRIGHT,
  border: `1px solid ${LIME_BRIGHT}`,
  borderRadius: 6,
  width: 44,
  height: 44,
  minWidth: 44,
  minHeight: 44,
  padding: 0,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  flex: "0 0 auto",
};
const STATE: React.CSSProperties = {
  margin: "40px 20px",
  textAlign: "center",
  color: MUTED,
  fontSize: 14,
  lineHeight: 1.6,
};
const FOOTER: React.CSSProperties = {
  position: "fixed",
  left: 0,
  right: 0,
  /* The spine is fixed at bottom:0 and paints over anything parked in its
     reserve band — bottom:56 left this footer (and its confirm button)
     entirely hidden behind it. */
  bottom: SPINE_RESERVE_CSS,
  background: "#0a0a0a",
  borderTop: `1px solid ${LINE}`,
  padding: "10px 12px",
  zIndex: 90,
};

/* ============================================================
 * AF (8/2): resolving a skip. A task like "Heavy prune" is not really
 * being skipped — it is out of season. Offer that choice explicitly:
 * skip once (today's behaviour) or assign standing season(s), after
 * which getConfirm stops surfacing it outside them.
 *
 * The eight labels and their boundaries live on the backend (Wheel of
 * the Year; astronomical solstices/equinoxes, fixed cross-quarters).
 * Claude pre-checks a suggestion for SF's microclimate — suggestion
 * only, fully editable, nothing saved until CONFIRM.
 * ============================================================ */
const SEASONS = [
  "Early Spring", "Late Spring", "Early Summer", "Late Summer",
  "Early Fall", "Late Fall", "Early Winter", "Late Winter",
] as const;

function SeasonSheet({
  projectAction,
  onClose,
  onSkipOnce,
  onAssign,
}: {
  projectAction: string;
  onClose: () => void;
  onSkipOnce: () => void;
  onAssign: (seasons: string[]) => void;
}) {
  const [mode, setMode] = useState<"choose" | "assign">("choose");
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [why, setWhy] = useState<string | null>(null);
  const [thinking, setThinking] = useState(false);

  const openAssign = async () => {
    setMode("assign");
    setThinking(true);
    try {
      const res = await fetch(SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action: "suggestSeasons", action_text: projectAction }),
      });
      const j = (await res.json()) as { ok?: boolean; seasons?: string[]; why?: string };
      if (j.ok !== false && Array.isArray(j.seasons)) {
        setPicked(new Set(j.seasons));
        setWhy(j.why || null);
      }
    } catch {
      /* suggestion is optional — the crew can just tick boxes */
    } finally {
      setThinking(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,.8)", zIndex: 320,
        display: "flex", alignItems: "flex-end", justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#0a0a0a", borderTop: `1px solid ${LINE}`, borderRadius: "12px 12px 0 0",
          width: "100%", maxWidth: 560,
          padding: "16px 14px calc(20px + env(safe-area-inset-bottom, 0px))",
          fontFamily: "'Courier New', Courier, monospace", color: TEXT,
        }}
      >
        <div style={{ color: LIME, fontSize: 13, letterSpacing: 2, fontWeight: "bold" }}>
          {mode === "choose" ? "SKIP THIS TASK" : "ASSIGN TO SEASON(S)"}
        </div>
        <div style={{ color: MUTED, fontSize: 12, marginTop: 6, lineHeight: 1.4 }}>
          {projectAction}
        </div>

        {mode === "choose" ? (
          <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
            <button type="button" onClick={onSkipOnce} style={{ ...SOLID_BTN, width: "100%" }}>
              SKIP ONCE
            </button>
            <button
              type="button"
              onClick={() => void openAssign()}
              style={{
                width: "100%", minHeight: 48, background: "transparent", color: LIME,
                border: `1px solid ${LIME_DIM}`, borderRadius: 6, fontFamily: "inherit",
                fontSize: 13, letterSpacing: 2, fontWeight: "bold", cursor: "pointer",
              }}
            >
              ASSIGN TO SEASON(S)
            </button>
            <div style={{ color: MUTED, fontSize: 11, textAlign: "center" }}>
              Assigned tasks stop appearing here outside their season.
            </div>
          </div>
        ) : (
          <>
            <div style={{ color: MUTED, fontSize: 11, marginTop: 12 }}>
              {thinking
                ? "Checking what's right for San Francisco…"
                : why
                  ? `Suggested: ${why} — edit freely.`
                  : "Tick every season this task belongs in."}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
              {SEASONS.map((s2) => {
                const on = picked.has(s2);
                return (
                  <button
                    key={s2}
                    type="button"
                    onClick={() =>
                      setPicked((prev) => {
                        const next = new Set(prev);
                        if (next.has(s2)) next.delete(s2);
                        else next.add(s2);
                        return next;
                      })
                    }
                    style={{
                      background: on ? LIME : "transparent",
                      color: on ? "#0a0a0a" : LIME,
                      border: `1px solid ${on ? LIME : LIME_DIM}`,
                      borderRadius: 999, padding: "8px 12px", fontFamily: "inherit",
                      fontSize: 12, fontWeight: "bold", cursor: "pointer",
                    }}
                  >
                    {s2.toUpperCase()}
                  </button>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button
                type="button"
                disabled={picked.size === 0}
                onClick={() => onAssign(Array.from(picked))}
                style={{ ...SOLID_BTN, flex: 1, opacity: picked.size === 0 ? 0.5 : 1 }}
              >
                CONFIRM SEASONS
              </button>
              <button
                type="button"
                onClick={() => setMode("choose")}
                style={{
                  minHeight: 48, background: "transparent", color: LIME,
                  border: `1px solid ${LIME_DIM}`, borderRadius: 6, padding: "0 14px",
                  fontFamily: "inherit", fontSize: 13, letterSpacing: 2,
                  fontWeight: "bold", cursor: "pointer",
                }}
              >
                BACK
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
