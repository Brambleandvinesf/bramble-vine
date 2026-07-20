import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../lib/auth";
import { useViewAs } from "../lib/view-as";
import { canSee } from "../lib/permissions";
import { ItemPicker } from "../components/ItemPicker";
import { sessionCache } from "../lib/session-cache";
import { RefreshDot } from "../components/RefreshDot";

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
  status: "Confirmed" | "SKIP";
  expanded: boolean;
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
        status: "Confirmed",
        expanded: p.showOnReview,
      };
    }
    return initial;
  });
  const [deletes, setDeletes] = useState<Set<string>>(new Set());
  const [newByClient, setNewByClient] = useState<Record<string, NewProject[]>>({});
  const [pickerFor, setPickerFor] = useState<{ client: string; key: string } | null>(null);
  const [expandedMore, setExpandedMore] = useState<Set<string>>(new Set());
  const [sendText, setSendText] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitFlash, setSubmitFlash] = useState<{ msg: string; err: boolean } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [offline, setOffline] = useState(false);

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
          status: "Confirmed",
          expanded: p.showOnReview,
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

  const submit = useCallback(async () => {
    // Build payload
    const statuses: Array<{ projectId: string; status: "Confirmed" | "SKIP" }> = [];
    const updates: Array<Record<string, string>> = [];
    for (const p of projects) {
      const key = p.projectId || `row-${p.row}`;
      const e = edits[key];
      if (!e) continue;
      if (!p.projectId) continue;
      if (deletes.has(p.projectId)) continue;
      statuses.push({ projectId: p.projectId, status: e.status });
      const diff: Record<string, string> = {};
      if (e.action !== p.action) diff.action = e.action;
      if (e.garden !== p.garden) diff.garden = e.garden;
      if (e.type !== p.type) diff.type = e.type;
      if (e.category !== p.category) diff.category = e.category;
      if (e.notes !== p.notes) diff.notes = e.notes;
      if (Object.keys(diff).length) {
        updates.push({ projectId: p.projectId, ...diff });
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
      deletes: Array.from(deletes),
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
      <header style={HEADER}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ color: LIME, fontSize: 20, fontWeight: "bold", letterSpacing: 2 }}>
            CONFIRM DAY
          </div>
          <RefreshDot refreshing={refreshing} offline={offline} />
          {offline && <span style={{ color: MUTED, fontSize: 11 }}>offline — last data</span>}
        </div>
        <div style={{ marginTop: 4, color: TEXT, fontSize: 14 }}>{todayLabel()}</div>
        <div style={{ marginTop: 2, fontSize: 12, color: MUTED }}>
          Confirm today's loading list
        </div>
        {state?.confirmed && (
          <div style={SUCCESS_BANNER}>
            ✓ Confirmed{state.at ? ` at ${timeLabel(state.at)}` : ""} — re-confirming allowed
          </div>
        )}
        {user && (
          <div style={{ marginTop: 6, fontSize: 11, color: MUTED, letterSpacing: 1 }}>
            SIGNED IN AS {user.toUpperCase()}
          </div>
        )}
      </header>

      {loadErr && (
        <div style={STATE}>
          Couldn't load the confirm data.
          <br />
          <span style={{ color: RED }}>{loadErr}</span>
        </div>
      )}

      {!loadErr && state === null && <div style={STATE}>Loading…</div>}

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
              <div style={CLIENT_HEAD}>
                <span
                  style={{ color: LIME, fontSize: 16, fontWeight: "bold", letterSpacing: 1 }}
                >
                  {client}
                </span>
                <span style={{ fontSize: 11, color: MUTED, marginLeft: "auto" }}>
                  {list.length} project{list.length === 1 ? "" : "s"}
                </span>
              </div>

              {rendered.map((p) => {
                const key = p.projectId || `row-${p.row}`;
                const e = edits[key];
                if (!e) return null;
                const isDeleted = p.projectId ? deletes.has(p.projectId) : false;
                const skip = e.status === "SKIP";
                return (
                  <div
                    key={key}
                    style={{
                      ...CARD,
                      marginTop: 8,
                      opacity: isDeleted ? 0.4 : skip ? 0.55 : 1,
                    }}
                  >
                    <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                      <SegBtn
                        active={!skip}
                        onClick={() => setEdit(key, { status: "Confirmed" })}
                      >
                        CONFIRM
                      </SegBtn>
                      <SegBtn
                        active={skip}
                        danger
                        onClick={() => setEdit(key, { status: "SKIP" })}
                      >
                        SKIP
                      </SegBtn>
                      <div style={{ flex: 1 }} />
                      <SegBtn
                        active={e.type.toUpperCase() === "SPECIAL"}
                        onClick={() =>
                          setEdit(key, {
                            type:
                              e.type.toUpperCase() === "SPECIAL" ? "RECURRING" : "SPECIAL",
                          })
                        }
                      >
                        {e.type.toUpperCase() === "SPECIAL" ? "SPECIAL" : "RECURRING"}
                      </SegBtn>
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
                              {label || it.name}
                            </span>
                          );
                        })}
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
                    <label style={LABEL}>NOTES</label>
                    <textarea
                      value={e.notes}
                      onChange={(ev) => setEdit(key, { notes: ev.target.value })}
                      style={{ ...INPUT, resize: "vertical" }}
                      rows={2}
                      disabled={isDeleted}
                    />

                    <div
                      style={{
                        marginTop: 12,
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        flexWrap: "wrap",
                      }}
                    >
                      {p.projectId ? (
                        <span style={{ fontSize: 10, color: MUTED, letterSpacing: 1 }}>
                          {p.projectId}
                        </span>
                      ) : (
                        <span style={{ fontSize: 10, color: AMBER, letterSpacing: 1 }}>
                          NO ID (won't save)
                        </span>
                      )}
                      <div style={{ flex: 1 }} />
                      {isDeleted ? (
                        <button
                          style={GHOST_BTN_SM}
                          onClick={() => undoDelete(p.projectId)}
                        >
                          UNDO DELETE
                        </button>
                      ) : (
                        p.projectId && (
                          <button
                            style={{ ...GHOST_BTN_SM, color: RED, borderColor: RED }}
                            onClick={() => requestDelete(p.projectId, e.action)}
                          >
                            DELETE
                          </button>
                        )
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
                    <span style={{ color: LIME, fontSize: 11, letterSpacing: 1 }}>
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
                        fontSize: 11,
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
                          <div style={{ color: LIME, fontSize: 12, fontWeight: "bold", wordBreak: "break-word" }}>
                            {it.name}
                          </div>
                          <div style={{ color: MUTED, fontSize: 11, marginTop: 2 }}>
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
                      style={{ ...GHOST_BTN_SM, marginTop: 4 }}
                      onClick={() => setPickerFor({ client, key: n.key })}
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
            </section>
          );
        })}

      <div style={{ height: 140 }} />

      <div style={FOOTER}>
        {submitFlash && (
          <div
            style={{
              fontSize: 12,
              color: submitFlash.err ? RED : LIME,
              marginBottom: 8,
            }}
          >
            {submitFlash.msg}
          </div>
        )}
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            color: TEXT,
            fontSize: 13,
            marginBottom: 8,
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={sendText}
            onChange={(e) => setSendText(e.target.checked)}
            style={{ width: 20, height: 20, accentColor: LIME }}
          />
          Text the crew the loading link
        </label>
        <button
          style={{ ...SOLID_BTN, width: "100%" }}
          onClick={submit}
          disabled={submitting || !!loadErr || state === null}
        >
          {submitting ? "CONFIRMING…" : "CONFIRM SPECIAL LOADING/PROJECTS"}
        </button>
      </div>
      {pickerFor && (
        <ItemPicker
          onCancel={() => setPickerFor(null)}
          onAdd={(picked) => {
            appendNewItem(pickerFor.client, pickerFor.key, picked);
            setPickerFor(null);
          }}
        />
      )}
    </div>
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

/* ---------- styles ---------- */
const LIME = "#7cff00";
const LIME_BRIGHT = "#bfff3c";
const LIME_DIM = "rgba(124,255,0,.35)";
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
const SUCCESS_BANNER: React.CSSProperties = {
  marginTop: 10,
  padding: "8px 10px",
  background: "rgba(124,255,0,.08)",
  border: `1px solid ${LIME_DIM}`,
  color: LIME,
  borderRadius: 6,
  fontSize: 12,
};
const CLIENT_HEAD: React.CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  gap: 10,
  padding: "0 4px 4px",
};
const CARD: React.CSSProperties = {
  background: "#121212",
  border: `1px solid ${LINE}`,
  borderRadius: 10,
  padding: 12,
};
const LABEL: React.CSSProperties = {
  display: "block",
  fontSize: 10,
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
