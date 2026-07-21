import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../lib/auth";
import { useViewAs } from "../lib/view-as";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Bramble & Vine — Admin" },
      { name: "description", content: "Read-only permissions matrix." },
    ],
  }),
  component: AdminPage,
});

const SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbwZlJn9jKzzYfcFglDmVGV3l-FTYib0D3mNdILivsB1477aMym68NViDCwia26_JH4siQ/exec";

type RoleKey = "lead" | "assistant" | "office" | "management";
const ROLES: { key: RoleKey; label: string }[] = [
  { key: "lead", label: "Lead" },
  { key: "assistant", label: "Assistant" },
  { key: "office", label: "Office" },
  { key: "management", label: "Management" },
];

type PermRow = Record<RoleKey, 0 | 1>;
type PermMap = Record<string, PermRow>;

type SubChild = { key: string; label: string; step?: string; dimmed?: boolean };
type Child = { key: string; label: string; sub?: SubChild[] };
type Group = { id: string; label: string; children: Child[] };

const GROUPS: Group[] = [
  { id: "dashboard", label: "Dashboard", children: [{ key: "dashboard", label: "Dashboard" }] },
  { id: "confirm", label: "CONFIRM LOAD", children: [{ key: "special_confirm", label: "Special Confirm" }] },
  { id: "loading", label: "Loading", children: [{ key: "loading", label: "Loading" }] },
  {
    id: "field",
    label: "Field / Route",
    children: [
      { key: "route_enroute", label: "En Route" },
      { key: "route_arrived", label: "Arrived" },
      { key: "route_visit", label: "Visit Mode" },
      {
        key: "route_debrief",
        label: "Debrief",
        sub: [
          { key: "route_debrief", label: "Hours", step: "billing", dimmed: true },
          { key: "route_debrief", label: "Projects Completed", step: "updates", dimmed: true },
          { key: "route_debrief", label: "Items Used", step: "items", dimmed: true },
          { key: "route_debrief", label: "Future Projects", step: "new", dimmed: true },
          { key: "route_debrief", label: "Messages", step: "office", dimmed: true },
        ],
      },
      { key: "route_next", label: "Next Stop" },
    ],
  },

  { id: "visits", label: "CONFIRM VISITS", children: [{ key: "visits", label: "Visits" }] },
  { id: "projects", label: "Projects", children: [{ key: "projects", label: "Projects" }] },
  { id: "messages", label: "Messages", children: [{ key: "messages", label: "Messages" }] },
  {
    id: "receipts",
    label: "Receipts",
    children: [
      { key: "rcpt_designate", label: "Designate" },
      { key: "rcpt_invoice", label: "Invoice Review" },
    ],
  },
  { id: "admin", label: "Admin", children: [{ key: "admin", label: "Admin" }] },
];

const FIELD_PREVIEW: Record<string, "enroute" | "arrived" | "visit" | "debrief" | "next"> = {
  route_enroute: "enroute",
  route_arrived: "arrived",
  route_visit: "visit",
  route_debrief: "debrief",
  route_next: "next",
};

const OPEN_TARGETS: Record<string, string> = {
  dashboard: "/",
  special_confirm: "/confirm",
  loading: "/loading",
  visits: "/visits",
  projects: "/projects",
  messages: "/messages",
  rcpt_designate: "/receipts",
  rcpt_invoice: "/receipts",
  route_enroute: "/field",
  route_arrived: "/field",
  route_visit: "/field",
  route_next: "/field",
  route_debrief: "/field",
};

const KNOWN_KEYS = new Set(GROUPS.flatMap((g) => g.children.map((c) => c.key)));



function Dot({ on }: { on: boolean }) {
  return (
    <span
      aria-label={on ? "allowed" : "not allowed"}
      style={{
        display: "inline-block",
        width: 10,
        height: 10,
        borderRadius: 999,
        background: on ? "#7cff00" : "#1e3a0a",
        boxShadow: on ? "0 0 6px rgba(124,255,0,0.6)" : "none",
      }}
    />
  );
}

function RoleCell({ role, on }: { role: string; on: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        minWidth: 92,
        color: on ? "#7cff00" : "#4a7a1e",
        fontSize: 11,
        letterSpacing: 1,
        textTransform: "uppercase",
      }}
    >
      <Dot on={on} />
      <span>{role}</span>
    </div>
  );
}

function AdminPage() {
  const { role } = useAuth();
  const { effectiveRole } = useViewAs();
  const navigate = useNavigate();

  const denied = !(role === "management") && !(effectiveRole === "management");
  useEffect(() => {
    if (denied) void navigate({ to: "/" });
  }, [denied, navigate]);

  const [tab, setTab] = useState<"perms" | "teams">("perms");
  const [perms, setPerms] = useState<PermMap | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "ok">("idle");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setStatus((s) => (s === "ok" ? "ok" : "loading"));
    try {
      const res = await fetch(`${SCRIPT_URL}?action=getPermissions`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { permissions?: PermMap };
      if (!json.permissions) throw new Error("Missing permissions");
      setPerms(json.permissions);
      setStatus("ok");
    } catch {
      setStatus("error");
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    if (denied) return;
    void load();
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [denied, load]);

  if (denied) return null;

  const groupsToRender: Group[] = (() => {
    if (!perms) return GROUPS;
    const unknown = Object.keys(perms).filter((k) => !KNOWN_KEYS.has(k));
    if (unknown.length === 0) return GROUPS;
    return [
      ...GROUPS,
      { id: "__other", label: "Other", children: unknown.map((k) => ({ key: k, label: k })) },
    ];
  })();

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const rollupFor = (g: Group): PermRow => {
    const acc: PermRow = { lead: 0, assistant: 0, office: 0, management: 0 };
    if (!perms) return acc;
    for (const c of g.children) {
      const row = perms[c.key];
      if (!row) continue;
      for (const r of ROLES) if (row[r.key]) acc[r.key] = 1;
    }
    return acc;
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0a0a0a",
        color: "#e8e8e8",
        fontFamily: "'Courier New', Courier, monospace",
        paddingBottom: 88,
      }}
    >
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "16px 12px" }}>
        <h1
          style={{
            color: "#7cff00",
            fontSize: 16,
            letterSpacing: 2,
            margin: 0,
            marginBottom: 12,
          }}
        >
          ADMIN
        </h1>

        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          {(["perms", "teams"] as const).map((k) => {
            const active = tab === k;
            return (
              <button
                key={k}
                onClick={() => setTab(k)}
                style={{
                  background: active ? "#7cff00" : "transparent",
                  color: active ? "#0a0a0a" : "#7cff00",
                  border: "1px solid #7cff00",
                  borderRadius: 4,
                  padding: "6px 12px",
                  fontFamily: "inherit",
                  fontSize: 11,
                  letterSpacing: 1,
                  cursor: "pointer",
                  textTransform: "uppercase",
                }}
              >
                {k === "perms" ? "Permissions" : "Teams"}
              </button>
            );
          })}
        </div>

        {tab === "teams" ? <TeamsAdmin /> : null}

        {tab === "perms" ? (
          <p style={{ color: "#8f8f8f", fontSize: 11, margin: "0 0 16px" }}>
            Read-only — canonical matrix lives in the backend.
          </p>
        ) : null}


        {tab === "perms" && status === "loading" && !perms ? (
          <div style={{ color: "#8f8f8f", fontSize: 12 }}>Loading…</div>
        ) : null}

        {tab === "perms" && status === "error" && !perms ? (
          <div
            style={{
              border: "1px solid #2a2a2a",
              background: "#121212",
              padding: 16,
              borderRadius: 6,
              color: "#e8e8e8",
              fontSize: 12,
            }}
          >
            <div style={{ marginBottom: 10 }}>Couldn't load permissions.</div>
            <button
              onClick={() => void load()}
              style={{
                background: "transparent",
                color: "#7cff00",
                border: "1px solid #7cff00",
                borderRadius: 4,
                padding: "6px 12px",
                fontFamily: "inherit",
                fontSize: 11,
                letterSpacing: 1,
                cursor: "pointer",
              }}
            >
              RETRY
            </button>
          </div>
        ) : null}

        {tab === "perms" && perms ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {groupsToRender.map((g) => {
              const open = expanded.has(g.id);
              const roll = rollupFor(g);
              return (
                <div
                  key={g.id}
                  style={{
                    border: "1px solid #2a2a2a",
                    background: "#121212",
                    borderRadius: 6,
                    overflow: "hidden",
                  }}
                >
                  <button
                    onClick={() => toggle(g.id)}
                    aria-expanded={open}
                    style={{
                      width: "100%",
                      minHeight: 56,
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "0 14px",
                      background: "transparent",
                      color: "#e8e8e8",
                      border: "none",
                      fontFamily: "inherit",
                      fontSize: 13,
                      textAlign: "left",
                      cursor: "pointer",
                    }}
                  >
                    <span
                      style={{
                        color: "#7cff00",
                        display: "inline-block",
                        width: 12,
                        transform: open ? "rotate(90deg)" : "none",
                        transition: "transform 120ms",
                      }}
                    >
                      ▸
                    </span>
                    <span
                      style={{
                        flex: 1,
                        letterSpacing: 1,
                        textTransform: "uppercase",
                      }}
                    >
                      {g.label}
                    </span>
                    <span style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      {ROLES.map((r) => (
                        <Dot key={r.key} on={!!roll[r.key]} />
                      ))}
                    </span>
                  </button>

                  {open ? (
                    <div style={{ borderTop: "1px solid #2a2a2a" }}>
                      {g.children.map((c) => {
                        const row = perms[c.key];
                        const openRow = (key: string, step?: string) => {
                          const target = OPEN_TARGETS[key];
                          if (!target) return;
                          if (target === "/field") {
                            const preview = FIELD_PREVIEW[key];
                            void navigate({
                              to: "/field",
                              search: preview ? { preview, ...(step ? { step } : {}) } : {},
                            });
                          } else {
                            void navigate({ to: target as "/" });
                          }
                        };
                        return (
                          <div key={c.key}>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                flexWrap: "wrap",
                                gap: 10,
                                padding: "10px 14px 10px 38px",
                                borderTop: "1px solid #1a1a1a",
                              }}
                            >
                              <div style={{ flex: "1 1 180px", color: "#e8e8e8", fontSize: 12 }}>
                                {c.label}
                              </div>
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                                {ROLES.map((r) => (
                                  <RoleCell key={r.key} role={r.label} on={!!(row && row[r.key])} />
                                ))}
                              </div>
                              {OPEN_TARGETS[c.key] && c.key !== "admin" ? (
                                <button
                                  type="button"
                                  aria-label={`Open ${c.label}`}
                                  onClick={() => openRow(c.key)}
                                  style={{
                                    marginLeft: "auto",
                                    background: "transparent",
                                    border: "1px solid #2a2a2a",
                                    color: "#7cff00",
                                    borderRadius: 4,
                                    width: 32,
                                    height: 32,
                                    display: "inline-flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    cursor: "pointer",
                                    fontFamily: "inherit",
                                    fontSize: 14,
                                    lineHeight: 1,
                                  }}
                                >
                                  ›
                                </button>
                              ) : null}
                            </div>
                            {c.sub?.map((sc) => {
                              const srow = perms[sc.key];
                              return (
                                <div
                                  key={`${c.key}:${sc.step ?? sc.label}`}
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    flexWrap: "wrap",
                                    gap: 10,
                                    padding: "8px 14px 8px 62px",
                                    borderTop: "1px solid #1a1a1a",
                                    opacity: sc.dimmed ? 0.6 : 1,
                                  }}
                                >
                                  <div style={{ flex: "1 1 180px", color: "#bdbdbd", fontSize: 12 }}>
                                    {sc.label}
                                  </div>
                                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                                    {ROLES.map((r) => (
                                      <RoleCell key={r.key} role={r.label} on={!!(srow && srow[r.key])} />
                                    ))}
                                  </div>
                                  <button
                                    type="button"
                                    aria-label={`Open ${sc.label}`}
                                    onClick={() => openRow(sc.key, sc.step)}
                                    style={{
                                      marginLeft: "auto",
                                      background: "transparent",
                                      border: "1px solid #2a2a2a",
                                      color: "#7cff00",
                                      borderRadius: 4,
                                      width: 32,
                                      height: 32,
                                      display: "inline-flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      cursor: "pointer",
                                      fontFamily: "inherit",
                                      fontSize: 14,
                                      lineHeight: 1,
                                    }}
                                  >
                                    ›
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  ) : null}

                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}
