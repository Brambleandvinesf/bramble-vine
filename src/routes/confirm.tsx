import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../lib/auth";
import { useViewAs } from "../lib/view-as";
import { canSee } from "../lib/permissions";
import { ItemPicker } from "../components/ItemPicker";
import { sessionCache } from "../lib/session-cache";
import { RefreshDot } from "../components/RefreshDot";
import { useReviewableToday } from "../lib/reviewable-today";
import { Check, SkipForward, Trash2 } from "lucide-react";

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

function normProject(p: Record<string, unknown>): Project {
  const rawItems = Array.isArray(p.items) ? (p.items as Array<Record<string, unknown>>) : [];
  const items: Item[] = rawItems.map((it) => ({
    name: String(it["Item Name"] ?? it.name ?? "").trim(),
    qty: String(it["Quantity"] ?? it.qty ?? "").trim(),
    size: String(it["Size"] ?? it.size ?? "").trim(),
    notes: String(it["Notes"] ?? it.notes ?? "").trim(),
  }));
  return {
    row: Number(p.row ?? 0),
    projectId: String(p["Project ID"] ?? p.projectId ?? "").trim(),
    client: String(p["Client Name"] ?? p.client ?? "").trim(),
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
  const [edits, setEdits] = useState<Record<string, Edit>>(() => {
    const initial: Record<string, Edit> = {};
    for (const p of (cached?.projects ?? []).map(normProject)) {
      const key = p.projectId || `row-${p.row}`;
      initial[key] = {
        action: p.action,
        garden: p.garden,
        type: p.type,
        category: p.category,
        notes: p.notes,
        status: "Pending",
        expanded: p.showOnReview,
        notesOpen: !!p.notes,
      };
    }
    return initial;
  });
  const [deletes, setDeletes] = useState<Set<string>>(new Set());
  const [newByClient, setNewByClient] = useState<Record<string, NewProject[]>>({});
  const [pickerFor, setPickerFor] = useState<
    | { mode: "new"; client: string; key: string }
    | { mode: "existing"; client: string; projectId: string }
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
  const [confirmedClients, setConfirmedClients] = useState<Set<string>>(new Set());
  const [flashClient, setFlashClient] = useState<string | null>(null);
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

  const fetchedRef = useRef(false);

  const applyData = useCallback((d: GetConfirmResponse) => {
    const ps = (d.projects ?? []).map(normProject);
    setState(d.state ?? {});
    setTodaysClients((d.todaysClients ?? []).map((c) => String(c).trim()).filter(Boolean));
    setProjects(ps);
    setEdits((prev) => {
      const next: Record<string, Edit> = {};
      for (const p of ps) {
        const key = p.projectId || `row-${p.row}`;
        const existing = prev[key];
        next[key] = existing ?? {
          action: p.action,
          garden: p.garden,
          type: p.type,
          category: p.category,
          notes: p.notes,
          status: "Pending",
          expanded: p.showOnReview,
          notesOpen: !!p.notes,
        };
      }
      return next;
    });
  }, []);

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

  // Group projects by client, in todaysClients order.
  const grouped = useMemo(() => {
    const map: Record<string, Project[]> = {};
    for (const c of todaysClients) map[c] = [];
    for (const p of projects) {
      if (!p.client) continue;
      if (!map[p.client]) map[p.client] = [];
      map[p.client].push(p);
    }
    return map;
  }, [projects, todaysClients]);

  // A card is "handled" (hidden) when deleted, skipped, or explicitly confirmed.
  // Submit surfaces only when zero reviewable cards remain.
  // Cards are hidden when deleted, skipped, or explicitly confirmed. Retained
  // for potential future use; per-client confirm now drives submit gating.
  void useMemo(() => grouped, [grouped]);


  const setEdit = useCallback((key: string, patch: Partial<Edit>) => {
    setEdits((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }, []);

  const requestDelete = useCallback((projectId: string, actionLabel: string) => {
    if (!projectId) return;
    if (!window.confirm(`Delete this project?\n\n${actionLabel || "(no action)"}`)) return;
    setDeletes((prev) => {
      const next = new Set(prev);
      next.add(projectId);
      return next;
    });
  }, []);

  const undoDelete = useCallback((projectId: string) => {
    setDeletes((prev) => {
      const next = new Set(prev);
      next.delete(projectId);
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
      const key = p.projectId;
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
    async (client: string, projectId: string, picked: NewItem) => {
      // optimistic append pill
      const snapshot = projects;
      setProjects((prev) =>
        prev.map((p) =>
          p.projectId === projectId
            ? { ...p, items: [...p.items, picked] }
            : p,
        ),
      );
      markSync(projectId, true);
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
        markSync(projectId, false);
      }
    },
    [projects, markSync],
  );

  const removeItemFromExisting = useCallback(
    async (client: string, projectId: string, idx: number, it: Item) => {
      const snapshot = projects;
      setProjects((prev) =>
        prev.map((p) =>
          p.projectId === projectId
            ? { ...p, items: p.items.filter((_, i) => i !== idx) }
            : p,
        ),
      );
      markSync(projectId, true);
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
        markSync(projectId, false);
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
    const statuses: Array<{ projectId: string; status: "Confirmed" | "SKIP" }> = [];
    const updates: Array<Record<string, string>> = [];
    const deletesArr: Array<{ projectId: string; client: string }> = [];
    for (const p of projects) {
      const key = p.projectId || `row-${p.row}`;
      const e = edits[key];
      if (!e) continue;
      if (!p.projectId) continue;
      if (deletes.has(p.projectId)) {
        deletesArr.push({ projectId: p.projectId, client: p.client });
        continue;
      }
      if (e.status === "Confirmed" || e.status === "SKIP") {
        statuses.push({ projectId: p.projectId, status: e.status });
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
      const reportSummary = summarizeReport(json.report);
      setSubmitFlash({
        msg: reportSummary ? `Confirmed. ${reportSummary}` : "Confirmed.",
        err: false,
      });
      if (json.state) setState(json.state);
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
  }, [projects, edits, deletes, newByClient, sendText, load]);

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
      <header style={HEADER}>
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
        {state?.confirmed && (
          <div style={SUCCESS_BANNER}>
            ✓ Confirmed{state.at ? ` at ${timeLabel(state.at)}` : ""} — re-confirming allowed
          </div>
        )}
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
            const key = p.projectId || `row-${p.row}`;
            const e = edits[key];
            return e ? e.expanded : p.showOnReview;
          });
          const collapsed = list.filter((p) => {
            const key = p.projectId || `row-${p.row}`;
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
              <div style={CLIENT_HEAD}>
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
                const key = p.projectId || `row-${p.row}`;
                const e = edits[key];
                if (!e) return null;
                const isDeleted = p.projectId ? deletes.has(p.projectId) : false;
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
                    <div style={{ display: "flex", gap: 6, marginBottom: 10, alignItems: "center" }}>
                      <div style={{ flex: 1 }} />
                      <TypeSelect
                        value={e.type}
                        options={distinctTypes}
                        syncing={p.projectId ? syncing.has(p.projectId) : false}
                        disabled={isDeleted || !p.projectId}
                        onChange={(val) => {
                          if (val === e.type) return;
                          void editProjectLive(p, { type: val }, () => ({ type: val }));
                        }}
                      />
                    </div>


                    <label style={LABEL}>ACTION</label>
                    <input
                      value={e.action}
                      onChange={(ev) => setEdit(key, { action: ev.target.value })}
                      style={ACTION_INPUT}
                      disabled={isDeleted}
                    />
                    {p.items.length > 0 && (
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
                                    void removeItemFromExisting(client, p.projectId, i, it)
                                  }
                                  style={ITEM_PILL_X}
                                >
                                  ×
                                </button>
                              )}
                            </span>
                          );
                        })}
                      </div>
                    )}
                    {p.projectId && !isDeleted && (
                      <div style={{ marginTop: 10 }}>
                        <button
                          style={ADD_ITEM_BTN}
                          onClick={() =>
                            setPickerFor({ mode: "existing", client, projectId: p.projectId })
                          }
                        >
                          + ADD ITEM
                        </button>
                      </div>
                    )}

                    <div style={ROW2}>
                      <div style={{ flex: 1 }}>
                        <label style={LABEL}>GARDEN</label>
                        <input
                          value={e.garden}
                          onChange={(ev) => setEdit(key, { garden: ev.target.value })}
                          style={INPUT}
                          disabled={isDeleted}
                        />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={LABEL}>CATEGORY</label>
                        <input
                          value={e.category}
                          onChange={(ev) => setEdit(key, { category: ev.target.value })}
                          style={INPUT}
                          disabled={isDeleted}
                        />
                      </div>
                    </div>
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
                    ) : (
                      <div style={{ marginTop: 8 }}>
                        <button
                          style={GHOST_BTN_SM}
                          onClick={() => setEdit(key, { notesOpen: true })}
                          disabled={isDeleted}
                        >
                          + ADD NOTES
                        </button>
                      </div>
                    )}

                    <div
                      style={{
                        marginTop: 12,
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      {p.projectId ? (
                        <span style={{ fontSize: 14, color: MUTED, letterSpacing: 1 }}>
                          {p.projectId}
                        </span>
                      ) : (
                        <span style={{ fontSize: 14, color: AMBER, letterSpacing: 1 }}>
                          NO ID (won't save)
                        </span>
                      )}
                      {isDeleted && (
                        <button
                          style={{ ...GHOST_BTN_SM, marginLeft: "auto" }}
                          onClick={() => undoDelete(p.projectId)}
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
                        onClick={() =>
                          beginAnim(key, "skip", () => setEdit(key, { status: "SKIP" }))
                        }
                      >
                        <SkipForward size={20} />
                      </button>
                      {p.projectId && (
                        <button
                          aria-label="Delete"
                          title="Delete"
                          style={ICON_ACTION_BTN}
                          onClick={() => {
                            if (
                              !window.confirm(
                                `Delete this project?\n\n${e.action || "(no action)"}`,
                              )
                            )
                              return;
                            beginAnim(key, "delete", () => {
                              setDeletes((prev) => {
                                const next = new Set(prev);
                                next.add(p.projectId);
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
                      <input
                        value={n.garden}
                        onChange={(ev) =>
                          updateNewProject(client, n.key, { garden: ev.target.value })
                        }
                        style={INPUT}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={LABEL}>CATEGORY</label>
                      <input
                        value={n.category}
                        onChange={(ev) =>
                          updateNewProject(client, n.key, { category: ev.target.value })
                        }
                        style={INPUT}
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

      <div style={{ height: 140 }} />

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
        {(() => {
          const allClientsConfirmed =
            todaysClients.length > 0 &&
            todaysClients.every((c) => confirmedClients.has(c));
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
      {pickerFor && (
        <ItemPicker
          onCancel={() => setPickerFor(null)}
          onAdd={(picked) => {
            if (pickerFor.mode === "new") {
              appendNewItem(pickerFor.client, pickerFor.key, picked);
            } else {
              void addItemToExisting(pickerFor.client, pickerFor.projectId, picked);
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
const AMBER = "#ffb03f";
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
  position: "sticky",
  top: 130,
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
};
const ITEMS_ROW: React.CSSProperties = {
  marginTop: 10,
  marginLeft: 12,
  paddingLeft: 8,
  borderLeft: `1px solid ${LIME_DIM}`,
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
};
const ITEM_PILL: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  fontSize: 18,
  color: LIME_BRIGHT,
  background: "#0a0a0a",
  border: `1px solid ${LIME_BRIGHT}`,
  borderRadius: 999,
  padding: "4px 6px 4px 14px",
  letterSpacing: 0.5,
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
  background: "transparent",
  color: LIME_BRIGHT,
  border: `1px solid ${LIME_DIM}`,
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
  bottom: 56,
  background: "#0a0a0a",
  borderTop: `1px solid ${LINE}`,
  padding: "10px 12px",
  zIndex: 90,
};
