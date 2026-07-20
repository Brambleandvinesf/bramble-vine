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
  const [confirmLoading, setConfirmLoading] = useState(true);
  const [msgCount, setMsgCount] = useState<number | null>(null);
  const [rcptCount, setRcptCount] = useState<number | null>(null);

  const canMsg = canSee(role, "messages");
  const canRcpt = canSee(role, "rcpt_designate") || canSee(role, "rcpt_invoice");

  useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      if (!cancelled) setConfirmLoading(true);
      // Confirm
      try {
        const res = await fetch(`${SCRIPT_URL}?action=getConfirm`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as { state?: { confirmed?: boolean } };
        if (!cancelled) setConfirmState(json.state ?? null);
      } catch (e) {
        console.error("[home confirm] error", e);
        if (!cancelled) setConfirmState((prev) => (prev?.confirmed === true ? prev : { confirmed: false }));
      } finally {
        if (!cancelled) setConfirmLoading(false);
      }
      // Messages awaiting
      if (canMsg) {
        try {
          const r = await fetch(`${SCRIPT_URL}?action=getInbox`);
          const j = (await r.json()) as { inbox?: Array<{ awaiting?: boolean }> };
          if (!cancelled) {
            const n = (j.inbox ?? []).filter((it) => it.awaiting === true).length;
            setMsgCount(n);
          }
        } catch (e) {
          console.error("[home msg] error", e);
        }
      }
      // Receipts awaiting designation
      if (canRcpt) {
        try {
          const r = await fetch(`${SCRIPT_URL}?action=getReceipts`);
          const j = (await r.json()) as { lines?: Array<{ finalDesignation?: string; ["Final designation"]?: string; invoiced?: string; Invoiced?: string }> };
          if (!cancelled) {
            const n = (j.lines ?? []).filter((l) => {
              const fd = String(l.finalDesignation ?? l["Final designation"] ?? "").trim();
              const inv = String(l.invoiced ?? l.Invoiced ?? "").trim();
              return !fd && !inv;
            }).length;
            setRcptCount(n);
          }
        } catch (e) {
          console.error("[home rcpt] error", e);
        }
      }
    };

    tick();
    const interval = setInterval(tick, 60_000);

    const onFocus = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onFocus);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [canMsg, canRcpt]);


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
        <ConfirmBanner
          loading={confirmLoading}
          confirmed={confirmState?.confirmed ?? null}
          role={role}
        />
        {tiles.map((t) => (
          <Tile key={t.key} title={t.title} pulse={t.special && t.pending}>
            —
          </Tile>
        ))}
      </div>
    </div>
  );
}

function ConfirmBanner({
  loading,
  confirmed,
  role,
}: {
  loading: boolean;
  confirmed: boolean | null;
  role: Role;
}) {
  const clickable = canSee(role, "special_confirm");
  const checking = loading && confirmed === null;
  const isConfirmed = confirmed === true;
  const isWarning = !isConfirmed;

  const icon = checking ? "•" : isConfirmed ? "✓" : "!";
  const color = isConfirmed ? LIME : "#ffb03f";
  const text = checking
    ? "Checking today's confirmation…"
    : isConfirmed
    ? "Loading list confirmed ✓"
    : "Loading list not confirmed — review today's projects";

  const banner = (
    <div
      style={{
        background: PANEL,
        border: `1px solid ${color}`,
        borderRadius: 10,
        padding: "14px 16px",
        minHeight: 56,
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}
    >
      <span style={{ fontSize: 16, color, width: 18, textAlign: "center" }}>
        {icon}
      </span>
      <span
        style={{
          color,
          fontSize: 13,
          fontWeight: "bold",
          letterSpacing: 1,
          textTransform: "uppercase",
        }}
      >
        {text}
      </span>
    </div>
  );

  return clickable ? (
    <Link to="/confirm" style={{ textDecoration: "none" }}>
      {banner}
    </Link>
  ) : (
    banner
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
