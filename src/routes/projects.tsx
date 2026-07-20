import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../lib/auth";
import { useViewAs } from "../lib/view-as";
import { ItemPicker } from "../components/ItemPicker";
import { sessionCache } from "../lib/session-cache";
import { RefreshDot } from "../components/RefreshDot";

const CK = "projects:getProjects";


export const Route = createFileRoute("/projects")({
  head: () => ({
    meta: [
      { title: "Bramble & Vine — Projects" },
      { name: "description", content: "Manage clients, projects, and items." },
    ],
  }),
  component: ProjectsPage,
});

/* Apps Script is the only backend. */
const SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbwZlJn9jKzzYfcFglDmVGV3l-FTYib0D3mNdILivsB1477aMym68NViDCwia26_JH4siQ/exec";

type ToolRow = {
  row: number;
  client: string;
  projectId: string;
  name: string;
  qty: string;
  size: string;
  notes: string;
  loaded: string;
  materialId: string;
};

type Project = {
  row: number;
  client: string;
  projectId: string;
  category: string;
  action: string;
  garden: string;
  type: string;
  notes: string;
  status: string;
};

type GetProjectsResponse = {
  projects?: Array<Record<string, unknown>>;
  tools?: Array<Record<string, unknown>>;
  clients?: string[];
  todaysClients?: string[];
  serverTime?: string;
};

type Toast = { msg: string; err: boolean; id: number };

function normProject(p: Record<string, unknown>): Project {
  return {
    row: Number(p.row ?? 0),
    client: String(p["Client Name"] ?? "").trim(),
    projectId: String(p["Project ID"] ?? "").trim(),
    category: String(p["Category"] ?? "").trim(),
    action: String(p["Project Action"] ?? "").trim(),
    garden: String(p["Garden"] ?? "").trim(),
    type: String(p["Type"] ?? "").trim(),
    notes: String(p["Notes"] ?? "").trim(),
    status: String(p["Status"] ?? "").trim(),
  };
}

function normTool(t: Record<string, unknown>): ToolRow {
  return {
    row: Number(t.row ?? 0),
    client: String(t["Client Name"] ?? "").trim(),
    projectId: String(t["Project ID"] ?? "").trim(),
    name: String(t["Item Name"] ?? "").trim(),
    qty: String(t["Quantity"] ?? "").trim(),
    size: String(t["Size"] ?? "").trim(),
    notes: String(t["Notes"] ?? "").trim(),
    loaded: String(t["Loaded Status"] ?? "").trim(),
    materialId: String(t["Material ID"] ?? "").trim(),
  };
}

type EditDraft = {
  action: string;
  garden: string;
  type: string;
  category: string;
  notes: string;
  status: string;
};

type NewItem = { name: string; qty: string; size: string; notes: string };

function ProjectsPage() {
  const { role } = useAuth();
  const { effectiveRole } = useViewAs();
  const navigate = useNavigate();

  // Access rule per spec: use the app's role from useAuth/useViewAs directly.
  // Redirect assistant home.
  const denied = role === "assistant" || effectiveRole === "assistant";
  useEffect(() => {
    if (denied) void navigate({ to: "/" });
  }, [denied, navigate]);

  const cached = sessionCache.get<GetProjectsResponse>(CK);
  const [projects, setProjects] = useState<Project[]>(
    () => (cached?.projects ?? []).map(normProject),
  );
  const [tools, setTools] = useState<ToolRow[]>(
    () => (cached?.tools ?? []).map(normTool),
  );
  const [clients, setClients] = useState<string[]>(
    () => (cached?.clients ?? []).map((c) => String(c).trim()).filter(Boolean),
  );
  const [todaysClients, setTodaysClients] = useState<string[]>(
    () => (cached?.todaysClients ?? []).map((c) => String(c).trim()).filter(Boolean),
  );
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<boolean>(() => !!cached);
  const [refreshing, setRefreshing] = useState(false);
  const [offline, setOffline] = useState(false);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"" | "SPECIAL" | "RECURRING">("");
  const [todayOnly, setTodayOnly] = useState(false);
  const [hasItemsOnly, setHasItemsOnly] = useState(false);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Record<string, EditDraft>>({});
  const [syncing, setSyncing] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<Toast | null>(null);
  const [showNew, setShowNew] = useState(false);

  const showToast = useCallback((msg: string, err = false) => {
    const id = Date.now();
    setToast({ msg, err, id });
    setTimeout(() => setToast((t) => (t && t.id === id ? null : t)), 5000);
  }, []);

  // Per-key serial write queue (last-in dispatches after previous resolves).
  const queueRef = useRef<Record<string, Promise<unknown>>>({});
  const enqueue = useCallback((key: string, fn: () => Promise<void>) => {
    const prev = queueRef.current[key] ?? Promise.resolve();
    const next = prev.catch(() => {}).then(fn);
    queueRef.current[key] = next;
    return next;
  }, []);

  const markSync = useCallback((key: string, on: boolean) => {
    setSyncing((prev) => {
      const n = { ...prev };
      if (on) n[key] = true;
      else delete n[key];
      return n;
    });
  }, []);

  const firePost = useCallback(async (payload: Record<string, unknown>) => {
    const res = await fetch(SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify(payload),
    });
    const json = (await res.json()) as {
      ok?: boolean;
      rebuilt?: string;
      client?: string;
      projectId?: string;
      error?: string;
    };
    if (!json.ok) throw new Error(json.error || "Not ok");
    return json;
  }, []);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch(`${SCRIPT_URL}?action=getProjects`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as GetProjectsResponse;
      sessionCache.set(CK, json);
      setProjects((json.projects ?? []).map(normProject));
      setTools((json.tools ?? []).map(normTool));
      setClients((json.clients ?? []).map((c) => String(c).trim()).filter(Boolean));
      setTodaysClients(
        (json.todaysClients ?? []).map((c) => String(c).trim()).filter(Boolean),
      );
      setOffline(false);
    } finally {
      setRefreshing(false);
    }
  }, []);

  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current || denied) return;
    fetchedRef.current = true;
    (async () => {
      try {
        await load();
      } catch (e) {
        if (sessionCache.has(CK)) setOffline(true);
        else setLoadErr(e instanceof Error ? e.message : "Failed to load");
      } finally {
        setLoaded(true);
      }
    })();
  }, [load, denied]);

  // Tools grouped by projectId.
  const toolsByProject = useMemo(() => {
    const m: Record<string, ToolRow[]> = {};
    for (const t of tools) {
      if (!t.projectId) continue;
      (m[t.projectId] ??= []).push(t);
    }
    return m;
  }, [tools]);

  const todaySet = useMemo(
    () => new Set(todaysClients.map((c) => c.toLowerCase())),
    [todaysClients],
  );

  const filteredProjects = useMemo(() => {
    const q = search.trim().toLowerCase();
    return projects.filter((p) => {
      if (typeFilter && p.type.toUpperCase() !== typeFilter) return false;
      if (todayOnly && !todaySet.has(p.client.toLowerCase())) return false;
      if (hasItemsOnly && (toolsByProject[p.projectId]?.length ?? 0) === 0) return false;
      if (q) {
        const hay = `${p.client} ${p.action}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [projects, search, typeFilter, todayOnly, hasItemsOnly, todaySet, toolsByProject]);

  const grouped = useMemo(() => {
    const m: Record<string, Project[]> = {};
    for (const p of filteredProjects) {
      const c = p.client || "(no client)";
      (m[c] ??= []).push(p);
    }
    for (const c of Object.keys(m)) {
      m[c].sort((a, b) => a.action.localeCompare(b.action));
    }
    return m;
  }, [filteredProjects]);

  const clientOrder = useMemo(
    () => Object.keys(grouped).sort((a, b) => a.localeCompare(b)),
    [grouped],
  );

  // Collapse all by default; auto-expand when active search matches.
  const activeSearch = search.trim().length > 0;
  const isExpanded = useCallback(
    (client: string) => (activeSearch ? true : expanded.has(client)),
    [activeSearch, expanded],
  );
  const toggleClient = useCallback((client: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(client)) next.delete(client);
      else next.add(client);
      return next;
    });
  }, []);

  const startEdit = useCallback((p: Project) => {
    setEditing((prev) => ({
      ...prev,
      [p.projectId]: {
        action: p.action,
        garden: p.garden,
        type: p.type,
        category: p.category,
        notes: p.notes,
        status: p.status,
      },
    }));
  }, []);
  const cancelEdit = useCallback((projectId: string) => {
    setEditing((prev) => {
      const n = { ...prev };
      delete n[projectId];
      return n;
    });
  }, []);
  const patchEdit = useCallback((projectId: string, patch: Partial<EditDraft>) => {
    setEditing((prev) => ({ ...prev, [projectId]: { ...prev[projectId], ...patch } }));
  }, []);

  const saveEdit = useCallback(
    (p: Project) => {
      const e = editing[p.projectId];
      if (!e) return;
      const diff: Record<string, unknown> = { action: "editProject", projectId: p.projectId };
      const patch: Partial<Project> = {};
      if (e.action !== p.action) { diff.projectAction = e.action; patch.action = e.action; }
      if (e.garden !== p.garden) { diff.garden = e.garden; patch.garden = e.garden; }
      if (e.type !== p.type) { diff.type = e.type; patch.type = e.type; }
      if (e.category !== p.category) { diff.category = e.category; patch.category = e.category; }
      if (e.notes !== p.notes) { diff.notes = e.notes; patch.notes = e.notes; }
      if (e.status !== p.status) { diff.status = e.status; patch.status = e.status; }
      if (Object.keys(diff).length <= 2) {
        cancelEdit(p.projectId);
        return;
      }
      // Optimistic: apply patch locally, close edit form, dispatch in background.
      const snapshot = p;
      setProjects((prev) =>
        prev.map((pp) => (pp.projectId === p.projectId ? { ...pp, ...patch } : pp)),
      );
      cancelEdit(p.projectId);
      markSync(p.projectId, true);
      void enqueue(p.projectId, async () => {
        try {
          await firePost(diff);
        } catch (err) {
          setProjects((prev) =>
            prev.map((pp) => (pp.projectId === p.projectId ? snapshot : pp)),
          );
          showToast(
            err instanceof Error
              ? `Couldn't save edit to ${p.projectId} — restored`
              : `Couldn't save edit to ${p.projectId} — restored`,
            true,
          );
        } finally {
          markSync(p.projectId, false);
        }
      });
    },
    [editing, cancelEdit, enqueue, firePost, markSync, showToast],
  );

  const deleteProject = useCallback(
    (p: Project) => {
      if (!p.projectId) return;
      if (!window.confirm(`Delete this project?\n\n${p.action || "(no action)"}`)) return;
      const snapshot = p;
      const snapshotTools = tools.filter((t) => t.projectId === p.projectId);
      // Optimistic remove.
      setProjects((prev) => prev.filter((pp) => pp.projectId !== p.projectId));
      setTools((prev) => prev.filter((t) => t.projectId !== p.projectId));
      markSync(p.projectId, true);
      void enqueue(p.projectId, async () => {
        try {
          await firePost({ action: "deleteProject", projectId: p.projectId });
        } catch (err) {
          setProjects((prev) => [...prev, snapshot]);
          setTools((prev) => [...prev, ...snapshotTools]);
          showToast(
            err instanceof Error
              ? `Couldn't delete ${p.projectId} — restored`
              : `Couldn't delete ${p.projectId} — restored`,
            true,
          );
        } finally {
          markSync(p.projectId, false);
        }
      });
    },
    [tools, enqueue, firePost, markSync, showToast],
  );

  const createProject = useCallback(
    (form: {
      client: string;
      projectAction: string;
      garden: string;
      type: string;
      category: string;
      notes: string;
      items: NewItem[];
    }) => {
      const items = form.items
        .filter((i) => i.name.trim())
        .map((i) => ({ name: i.name, qty: i.qty, size: i.size, notes: i.notes }));
      const payload: Record<string, unknown> = {
        action: "createProject",
        client: form.client,
        projectAction: form.projectAction,
      };
      if (form.garden) payload.garden = form.garden;
      if (form.type) payload.type = form.type;
      if (form.category) payload.category = form.category;
      if (form.notes) payload.notes = form.notes;
      if (items.length) payload.items = items;

      const tempId = `__new__${Date.now()}`;
      const optimistic: Project = {
        row: 0,
        client: form.client,
        projectId: tempId,
        category: form.category,
        action: form.projectAction,
        garden: form.garden,
        type: form.type,
        notes: form.notes,
        status: "",
      };
      const optimisticTools: ToolRow[] = items.map((it, i) => ({
        row: 0,
        client: form.client,
        projectId: tempId,
        name: it.name,
        qty: it.qty,
        size: it.size,
        notes: it.notes,
        loaded: "",
        materialId: `${tempId}-${i}`,
      }));
      setProjects((prev) => [...prev, optimistic]);
      setTools((prev) => [...prev, ...optimisticTools]);
      setShowNew(false);
      markSync(tempId, true);
      void enqueue(tempId, async () => {
        try {
          await firePost(payload);
        } catch (err) {
          setProjects((prev) => prev.filter((p) => p.projectId !== tempId));
          setTools((prev) => prev.filter((t) => t.projectId !== tempId));
          showToast(
            err instanceof Error
              ? `Couldn't create project — ${err.message}`
              : `Couldn't create project — restored`,
            true,
          );
        } finally {
          markSync(tempId, false);
        }
      });
    },
    [enqueue, firePost, markSync, showToast],
  );

  if (denied) return null;

  return (
    <div style={PAGE}>
      <header style={HEADER}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 10,
          }}
        >
          <div style={{ color: LIME, fontSize: 20, fontWeight: "bold", letterSpacing: 2 }}>
            PROJECTS
          </div>
          <button
            style={{ ...SOLID_BTN_SM, marginLeft: "auto" }}
            onClick={() => setShowNew(true)}
          >
            + NEW
          </button>
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search client or action…"
          style={INPUT}
        />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
          <Chip
            active={typeFilter === "SPECIAL"}
            onClick={() => setTypeFilter((v) => (v === "SPECIAL" ? "" : "SPECIAL"))}
          >
            SPECIAL
          </Chip>
          <Chip
            active={typeFilter === "RECURRING"}
            onClick={() => setTypeFilter((v) => (v === "RECURRING" ? "" : "RECURRING"))}
          >
            RECURRING
          </Chip>
          <Chip active={todayOnly} onClick={() => setTodayOnly((v) => !v)}>
            TODAY'S ROUTE
          </Chip>
          <Chip active={hasItemsOnly} onClick={() => setHasItemsOnly((v) => !v)}>
            HAS ITEMS
          </Chip>
        </div>
      </header>

      {loadErr && (
        <div style={STATE}>
          Couldn't load projects.
          <br />
          <span style={{ color: RED }}>{loadErr}</span>
        </div>
      )}

      {!loadErr && !loaded && <div style={STATE}>Loading…</div>}

      {!loadErr && loaded && clientOrder.length === 0 && (
        <div style={STATE}>No projects match.</div>
      )}

      {!loadErr &&
        clientOrder.map((client) => {
          const list = grouped[client];
          const open = isExpanded(client);
          return (
            <section key={client} style={{ margin: "14px 12px 0" }}>
              <button style={CLIENT_HEAD} onClick={() => toggleClient(client)}>
                <span style={{ color: LIME, fontSize: 15, fontWeight: "bold", letterSpacing: 1 }}>
                  {open ? "▼" : "▶"} {client}
                </span>
                <span style={{ fontSize: 11, color: MUTED, marginLeft: "auto" }}>
                  {list.length} project{list.length === 1 ? "" : "s"}
                </span>
              </button>
              {open && (
                <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                  {list.map((p) => {
                    const isBusy = !!syncing[p.projectId];
                    const draft = editing[p.projectId];
                    const items = toolsByProject[p.projectId] ?? [];
                    return (
                      <div key={p.projectId || p.row} style={{ ...CARD, position: "relative", opacity: isBusy ? 0.85 : 1 }}>
                        {isBusy && (
                          <span
                            title="Syncing…"
                            style={{
                              position: "absolute",
                              top: 8,
                              right: 8,
                              width: 8,
                              height: 8,
                              borderRadius: "50%",
                              background: LIME_DIM,
                              boxShadow: `0 0 6px ${LIME_DIM}`,
                            }}
                          />
                        )}
                        {draft ? (
                          <EditForm
                            draft={draft}
                            onChange={(patch) => patchEdit(p.projectId, patch)}
                            onSave={() => saveEdit(p)}
                            onCancel={() => cancelEdit(p.projectId)}
                            saving={isBusy}
                          />
                        ) : (
                          <ProjectView
                            project={p}
                            items={items}
                            busy={isBusy}
                            onEdit={() => startEdit(p)}
                            onDelete={() => deleteProject(p)}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}

      <div style={{ height: 100 }} />

      {toast && (
        <div
          style={{
            position: "fixed",
            left: 12,
            right: 12,
            bottom: 72,
            padding: "10px 14px",
            background: PANEL,
            border: `1px solid ${toast.err ? RED : LIME_DIM}`,
            color: toast.err ? RED : LIME,
            borderRadius: 8,
            fontSize: 13,
            zIndex: 95,
          }}
        >
          {toast.msg}
        </div>
      )}

      {showNew && (
        <NewProjectModal
          clients={clients}
          onCancel={() => setShowNew(false)}
          onSubmit={createProject}
          submitting={Object.keys(syncing).some((k) => k.startsWith("__new__"))}
        />
      )}
    </div>
  );
}

/* ---------- subcomponents ---------- */

function ProjectView({
  project,
  items,
  busy,
  onEdit,
  onDelete,
}: {
  project: Project;
  items: ToolRow[];
  busy: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const type = project.type.toUpperCase();
  const typeColor = type === "SPECIAL" ? AMBER : LIME;
  return (
    <>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: TEXT, fontSize: 14, fontWeight: "bold", lineHeight: 1.3 }}>
            {project.action || "(no action)"}
          </div>
          <div
            style={{
              marginTop: 4,
              display: "flex",
              flexWrap: "wrap",
              gap: 6,
              fontSize: 11,
              color: MUTED,
            }}
          >
            {project.garden && <span>Garden: {project.garden}</span>}
            {project.category && <span>· {project.category}</span>}
            {project.status && <span>· {project.status}</span>}
          </div>
        </div>
        {type && (
          <span
            style={{
              fontSize: 10,
              letterSpacing: 1,
              color: typeColor,
              border: `1px solid ${typeColor}`,
              borderRadius: 4,
              padding: "2px 6px",
              fontWeight: "bold",
            }}
          >
            {type}
          </span>
        )}
      </div>
      {project.notes && (
        <div style={{ marginTop: 8, fontSize: 12, color: TEXT, whiteSpace: "pre-wrap" }}>
          {project.notes}
        </div>
      )}
      {items.length > 0 && (
        <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 4 }}>
          {items.map((it) => (
            <span key={it.materialId || it.row} style={CHIP}>
              {[it.qty, it.qty ? "×" : "", it.name, it.size].filter(Boolean).join(" ")}
            </span>
          ))}
        </div>
      )}
      <div style={{ marginTop: 10, display: "flex", gap: 6 }}>
        <button style={GHOST_BTN_SM} onClick={onEdit} disabled={busy}>
          {busy ? "SAVING…" : "EDIT"}
        </button>
        <button
          style={{ ...GHOST_BTN_SM, color: RED, borderColor: RED }}
          onClick={onDelete}
          disabled={busy}
        >
          DELETE
        </button>
      </div>
    </>
  );
}

function EditForm({
  draft,
  onChange,
  onSave,
  onCancel,
  saving,
}: {
  draft: EditDraft;
  onChange: (patch: Partial<EditDraft>) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  return (
    <div>
      <label style={LABEL}>Action</label>
      <input value={draft.action} onChange={(e) => onChange({ action: e.target.value })} style={INPUT} />
      <div style={ROW2}>
        <div style={{ flex: 1 }}>
          <label style={LABEL}>Garden</label>
          <input value={draft.garden} onChange={(e) => onChange({ garden: e.target.value })} style={INPUT} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={LABEL}>Category</label>
          <input value={draft.category} onChange={(e) => onChange({ category: e.target.value })} style={INPUT} />
        </div>
      </div>
      <div style={ROW2}>
        <div style={{ flex: 1 }}>
          <label style={LABEL}>Type</label>
          <div style={{ display: "flex", gap: 6 }}>
            <SegBtn active={draft.type.toUpperCase() === "RECURRING"} onClick={() => onChange({ type: "RECURRING" })}>
              RECURRING
            </SegBtn>
            <SegBtn active={draft.type.toUpperCase() === "SPECIAL"} onClick={() => onChange({ type: "SPECIAL" })}>
              SPECIAL
            </SegBtn>
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <label style={LABEL}>Status</label>
          <input value={draft.status} onChange={(e) => onChange({ status: e.target.value })} style={INPUT} />
        </div>
      </div>
      <label style={LABEL}>Notes</label>
      <textarea
        value={draft.notes}
        onChange={(e) => onChange({ notes: e.target.value })}
        style={{ ...INPUT, minHeight: 60, resize: "vertical" }}
      />
      <div style={{ marginTop: 10, display: "flex", gap: 6 }}>
        <button style={SOLID_BTN_SM} onClick={onSave} disabled={saving}>
          {saving ? "SAVING…" : "SAVE"}
        </button>
        <button style={GHOST_BTN_SM} onClick={onCancel} disabled={saving}>
          CANCEL
        </button>
      </div>
    </div>
  );
}

function NewProjectModal({
  clients,
  onCancel,
  onSubmit,
  submitting,
}: {
  clients: string[];
  onCancel: () => void;
  onSubmit: (form: {
    client: string;
    projectAction: string;
    garden: string;
    type: string;
    category: string;
    notes: string;
    items: NewItem[];
  }) => void;
  submitting: boolean;
}) {
  const [client, setClient] = useState("");
  const [clientQuery, setClientQuery] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [projectAction, setProjectAction] = useState("");
  const [garden, setGarden] = useState("");
  const [category, setCategory] = useState("");
  const [type, setType] = useState<"RECURRING" | "SPECIAL">("RECURRING");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<NewItem[]>([]);
  const [itemPickerOpen, setItemPickerOpen] = useState(false);

  const matches = useMemo(() => {
    const q = clientQuery.trim().toLowerCase();
    if (!q) return clients.slice(0, 20);
    return clients.filter((c) => c.toLowerCase().includes(q)).slice(0, 20);
  }, [clientQuery, clients]);

  const canSubmit = client.trim() && projectAction.trim() && !submitting;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.75)",
        zIndex: 200,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: 12,
        overflowY: "auto",
      }}
      onClick={onCancel}
    >
      <div
        style={{
          background: PANEL,
          border: `1px solid ${LINE}`,
          borderRadius: 10,
          padding: 14,
          maxWidth: 520,
          width: "100%",
          marginTop: 40,
          marginBottom: 80,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            color: LIME,
            fontSize: 14,
            fontWeight: "bold",
            letterSpacing: 2,
            marginBottom: 10,
          }}
        >
          NEW PROJECT
        </div>

        <label style={LABEL}>Client</label>
        {client ? (
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <div style={{ ...INPUT, display: "flex", alignItems: "center" }}>{client}</div>
            <button
              style={GHOST_BTN_SM}
              onClick={() => {
                setClient("");
                setPickerOpen(true);
              }}
            >
              CHANGE
            </button>
          </div>
        ) : (
          <>
            <input
              value={clientQuery}
              onChange={(e) => {
                setClientQuery(e.target.value);
                setPickerOpen(true);
              }}
              onFocus={() => setPickerOpen(true)}
              placeholder="Search clients…"
              style={INPUT}
            />
            {pickerOpen && (
              <div
                style={{
                  marginTop: 4,
                  maxHeight: 200,
                  overflowY: "auto",
                  border: `1px solid ${LINE}`,
                  borderRadius: 6,
                }}
              >
                {matches.length === 0 && (
                  <div style={{ padding: 10, color: MUTED, fontSize: 12 }}>No matches</div>
                )}
                {matches.map((c) => (
                  <button
                    key={c}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      background: "transparent",
                      color: TEXT,
                      border: "none",
                      padding: "10px 12px",
                      fontFamily: "inherit",
                      fontSize: 13,
                      cursor: "pointer",
                      borderBottom: `1px solid ${LINE}`,
                    }}
                    onClick={() => {
                      setClient(c);
                      setClientQuery("");
                      setPickerOpen(false);
                    }}
                  >
                    {c}
                  </button>
                ))}
                {clientQuery.trim() &&
                  !matches.some((m) => m.toLowerCase() === clientQuery.trim().toLowerCase()) && (
                    <button
                      style={{
                        display: "block",
                        width: "100%",
                        textAlign: "left",
                        background: "transparent",
                        color: LIME,
                        border: "none",
                        padding: "10px 12px",
                        fontFamily: "inherit",
                        fontSize: 13,
                        cursor: "pointer",
                      }}
                      onClick={() => {
                        setClient(clientQuery.trim());
                        setClientQuery("");
                        setPickerOpen(false);
                      }}
                    >
                      + Use "{clientQuery.trim()}"
                    </button>
                  )}
              </div>
            )}
          </>
        )}

        <label style={LABEL}>Action *</label>
        <input
          value={projectAction}
          onChange={(e) => setProjectAction(e.target.value)}
          style={INPUT}
          placeholder="e.g. Prune roses"
        />

        <div style={ROW2}>
          <div style={{ flex: 1 }}>
            <label style={LABEL}>Garden</label>
            <input value={garden} onChange={(e) => setGarden(e.target.value)} style={INPUT} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={LABEL}>Category</label>
            <input value={category} onChange={(e) => setCategory(e.target.value)} style={INPUT} />
          </div>
        </div>

        <label style={LABEL}>Type</label>
        <div style={{ display: "flex", gap: 6 }}>
          <SegBtn active={type === "RECURRING"} onClick={() => setType("RECURRING")}>
            RECURRING
          </SegBtn>
          <SegBtn active={type === "SPECIAL"} onClick={() => setType("SPECIAL")}>
            SPECIAL
          </SegBtn>
        </div>

        <label style={LABEL}>Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          style={{ ...INPUT, minHeight: 60, resize: "vertical" }}
        />

        <label style={LABEL}>Items</label>
        {items.map((it, i) => (
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
              style={{ ...GHOST_BTN_SM, color: RED, borderColor: RED, minWidth: 44 }}
              onClick={() => setItems((prev) => prev.filter((_, idx) => idx !== i))}
            >
              ×
            </button>
          </div>
        ))}
        <button
          style={{ ...GHOST_BTN_SM, marginTop: 4 }}
          onClick={() => setItemPickerOpen(true)}
        >
          + ADD ITEM
        </button>

        {itemPickerOpen && (
          <ItemPicker
            onCancel={() => setItemPickerOpen(false)}
            onAdd={(picked) => {
              setItems((prev) => [...prev, picked]);
              setItemPickerOpen(false);
            }}
          />
        )}


        <div style={{ marginTop: 14, display: "flex", gap: 6 }}>
          <button
            style={{ ...SOLID_BTN_SM, flex: 1 }}
            disabled={!canSubmit}
            onClick={() =>
              onSubmit({
                client: client.trim(),
                projectAction: projectAction.trim(),
                garden: garden.trim(),
                type,
                category: category.trim(),
                notes: notes.trim(),
                items,
              })
            }
          >
            {submitting ? "SAVING…" : "CREATE"}
          </button>
          <button style={GHOST_BTN_SM} onClick={onCancel} disabled={submitting}>
            CANCEL
          </button>
        </div>
      </div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? LIME : "transparent",
        color: active ? "#0a0a0a" : LIME,
        border: `1px solid ${active ? LIME : LIME_DIM}`,
        borderRadius: 999,
        padding: "6px 12px",
        fontFamily: "inherit",
        fontSize: 10,
        letterSpacing: 1,
        fontWeight: "bold",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function SegBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? LIME : "transparent",
        color: active ? "#0a0a0a" : LIME,
        border: `1px solid ${LIME}`,
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
const LIME_DIM = "rgba(124,255,0,.35)";
const AMBER = "#ffb03f";
const TEXT = "#e8e8e8";
const MUTED = "#8f8f8f";
const LINE = "#2a2a2a";
const RED = "#ff3b30";
const PANEL = "#121212";

const PAGE: React.CSSProperties = {
  background: "#0a0a0a",
  color: TEXT,
  fontFamily: "'Courier New', Courier, monospace",
  minHeight: "calc(100vh - 60px)",
  paddingBottom: 80,
};
const HEADER: React.CSSProperties = {
  position: "sticky",
  top: 44,
  zIndex: 10,
  background: "#0a0a0a",
  borderBottom: `1px solid ${LINE}`,
  padding: "14px 12px 12px",
};
const CLIENT_HEAD: React.CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  gap: 10,
  padding: "6px 4px",
  width: "100%",
  background: "transparent",
  border: "none",
  cursor: "pointer",
  fontFamily: "inherit",
  textAlign: "left",
};
const CARD: React.CSSProperties = {
  background: PANEL,
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
const SOLID_BTN_SM: React.CSSProperties = {
  background: LIME,
  color: "#0a0a0a",
  border: "none",
  borderRadius: 6,
  padding: "0 14px",
  minHeight: 40,
  fontFamily: "inherit",
  fontSize: 12,
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

// Silence unused var warning for canSee import (kept for future gating).
