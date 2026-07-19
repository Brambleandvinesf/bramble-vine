import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth, type Role } from "../lib/auth";
import { useViewAs, VIEW_AS_ROLES } from "../lib/view-as";
import { canSee } from "../lib/permissions";
import { SCRIPT_URL } from "./confirm";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Bramble & Vine — Home" },
      { name: "description", content: "Crew dashboard: today's route, loading, receipts, messages." },
    ],
  }),
  component: HomePage,
});

const LIME = "#7cff00";
const DIM = "#4a7a1e";
const TEXT = "#e8e8e8";
const MUTED = "#8f8f8f";
const PANEL = "#121212";
const BORDER = "#222";

type TileSpec = { key: string; title: string; pending?: boolean; special?: boolean };

const TILES_BY_ROLE: Record<Role, TileSpec[]> = {
  management: [
    { key: "glance", title: "TODAY AT A GLANCE" },
    { key: "field", title: "FIELD STATE NOW" },
    { key: "receipts", title: "RECEIPTS PIPELINE" },
    { key: "messages", title: "MESSAGES" },
  ],
  lead: [
    { key: "special", title: "SPECIAL LOADING CONFIRM", special: true, pending: true },
    { key: "first", title: "TODAY'S FIRST VISIT" },
    { key: "loading", title: "LOADING STATUS" },
    { key: "unread", title: "UNREAD MESSAGES" },
  ],
  assistant: [
    { key: "loading-list", title: "LOADING LIST" },
    { key: "route", title: "TODAY'S ROUTE OVERVIEW" },
    { key: "messages", title: "MESSAGES" },
  ],
  office: [
    { key: "unread", title: "UNREAD MESSAGES" },
    { key: "receipts", title: "RECEIPTS AWAITING REVIEW" },
    { key: "intake", title: "NEW INTAKE SUBMISSIONS" },
  ],
};

function HomePage() {
  const { role: actualRole, name } = useAuth();
  const { effectiveRole, setViewAs, viewAs } = useViewAs();
  const role = effectiveRole;

  const [confirmState, setConfirmState] = useState<{ confirmed?: boolean } | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);

  useEffect(() => {
    if (!canSee(role, "special_confirm")) return;
    let cancelled = false;
    setConfirmLoading(true);
    fetch(`${SCRIPT_URL}?action=getConfirm`)
      .then((res) => res.json())
      .then((json: { state?: { confirmed?: boolean } }) => {
        console.log("[home confirm] ok cancelled=", cancelled, json);
        if (cancelled) return;
        console.log("[home confirm] setting state", json.state);
        setConfirmState(json.state ?? null);
      })
      .catch((e) => {
        console.error("[home confirm] error", e);
        if (cancelled) return;
        setConfirmState(null);
      })
      .finally(() => {
        console.log("[home confirm] finally cancelled=", cancelled);
        if (!cancelled) setConfirmLoading(false);
      });
    return () => {
      console.log("[home confirm] cleanup");
      cancelled = true;
    };
  }, [role]);

  const tiles = useMemo(() => (role ? TILES_BY_ROLE[role] : []), [role]);

  if (!role) return null;

  return (
    <div
      style={{
        background: "#0a0a0a",
        color: TEXT,
        fontFamily: "'Courier New', Courier, monospace",
        minHeight: "calc(100vh - 44px - 64px)",
        padding: "14px 12px 24px",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, padding: "0 4px 10px" }}>
        <div style={{ color: LIME, fontSize: 18, fontWeight: "bold", letterSpacing: 2 }}>
          HOME
        </div>
        <div style={{ color: MUTED, fontSize: 11, letterSpacing: 1, marginLeft: "auto" }}>
          {name?.toUpperCase()} · {role.toUpperCase()}
        </div>
      </div>

      {actualRole === "management" && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 6,
            padding: "8px 10px",
            marginBottom: 12,
            background: "#181818",
            border: `1px dashed ${DIM}`,
            borderRadius: 8,
          }}
        >
          <span style={{ color: MUTED, fontSize: 11, letterSpacing: 1 }}>VIEW AS:</span>
          {VIEW_AS_ROLES.map((r) => {
            const active = (viewAs ?? actualRole) === r;
            return (
              <button
                key={r}
                onClick={() => setViewAs(r === actualRole ? null : r)}
                style={{
                  minHeight: 32,
                  padding: "4px 10px",
                  background: active ? LIME : "transparent",
                  color: active ? "#0a0a0a" : DIM,
                  border: `1px solid ${active ? LIME : DIM}`,
                  borderRadius: 4,
                  fontFamily: "inherit",
                  fontSize: 11,
                  letterSpacing: 1,
                  cursor: "pointer",
                  textTransform: "uppercase",
                }}
              >
                {r}
              </button>
            );
          })}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
        {(() => {
          console.log("[home render]", { role, canSee: canSee(role, "special_confirm"), confirmLoading, confirmState });
          return null;
        })()}
        {canSee(role, "special_confirm") && !confirmLoading && confirmState && (
          <Link to="/confirm" style={{ textDecoration: "none" }}>
            <div
              style={{
                background: PANEL,
                border: `1px solid ${confirmState.confirmed ? LIME : "#ffb03f"}`,
                borderRadius: 10,
                padding: "14px 16px",
                minHeight: 56,
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <span style={{ fontSize: 16, color: confirmState.confirmed ? LIME : "#ffb03f" }}>
                {confirmState.confirmed ? "✓" : "!"}
              </span>
              <span
                style={{
                  color: confirmState.confirmed ? LIME : "#ffb03f",
                  fontSize: 13,
                  fontWeight: "bold",
                  letterSpacing: 1,
                  textTransform: "uppercase",
                }}
              >
                {confirmState.confirmed
                  ? "Loading list confirmed"
                  : "Loading list not confirmed — review today's projects"}
              </span>
            </div>
          </Link>
        )}
        {tiles.map((t) => (
          <Tile key={t.key} title={t.title} pulse={t.special && t.pending}>
            —
          </Tile>
        ))}
      </div>
    </div>
  );
}

function Tile({ title, pulse, children }: { title: string; pulse?: boolean; children: ReactNode }) {
  return (
    <div
      style={{
        background: PANEL,
        border: `1px solid ${pulse ? LIME : BORDER}`,
        borderRadius: 10,
        padding: "12px 14px",
        minHeight: 96,
        animation: pulse ? "bvPulse 1.2s ease-in-out infinite" : undefined,
      }}
    >
      <style>{`
        @keyframes bvPulse {
          0%, 100% { border-color: ${LIME}; box-shadow: 0 0 0 rgba(124,255,0,0); }
          50% { border-color: #d8ffb0; box-shadow: 0 0 16px rgba(124,255,0,.45); }
        }
        @media (prefers-reduced-motion: reduce) {
          [data-bv-pulse="1"] { animation: none !important; border-color: ${LIME} !important; box-shadow: 0 0 12px rgba(124,255,0,.35) !important; }
        }
      `}</style>
      <div
        data-bv-pulse={pulse ? "1" : undefined}
        style={{ color: LIME, fontSize: 12, letterSpacing: 2, fontWeight: "bold", marginBottom: 8 }}
      >
        {title}
      </div>
      <div style={{ color: MUTED, fontSize: 14, minHeight: 40 }}>{children}</div>
    </div>
  );
}
