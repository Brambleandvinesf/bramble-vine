import { useMemo } from "react";
import { useRouter } from "@tanstack/react-router";
import { useDayState, type DayPhase } from "../lib/day-state";
import { useAuth } from "../lib/auth";

const LIME = "#7cff00";
const DIM = "#2a2a2a";
const DIM_TEXT = "#4a7a1e";
const YELLOW = "#ffd400";

const LABELS: Record<string, string> = {
  signin: "SIGN IN",
  team_assign: "TEAM",
  dailyload_confirm: "DAILY",
  special_confirm: "SPECIAL",
  loading: "LOAD",
  enroute: "GO",
  arrived: "ARR",
  visit: "VISIT",
  debrief: "DEBRIEF",
  next: "NEXT",
  unload: "UNLOAD",
  confirm_hours: "HOURS",
};

const PHASE_LABEL: Record<DayPhase, string> = {
  HQ_LOADING: "HQ",
  FIELD_VISIT: "FIELD",
  HQ_UNLOADING: "HQ",
};

function routeFor(subStep: string, isOffice: boolean): {
  to?: string;
  event?: string;
} | null {
  switch (subStep) {
    case "signin":
      return { to: "/login" };
    case "team_assign":
      return isOffice ? { event: "bv:open-team-setup", to: "/schedule" } : { to: "/schedule" };
    case "dailyload_confirm":
    case "special_confirm":
      return { to: "/confirm" };
    case "loading":
      return { to: "/loading" };
    case "enroute":
    case "arrived":
    case "visit":
    case "debrief":
    case "next":
    case "unload":
    case "confirm_hours":
      return { to: "/field" };
    default:
      return null;
  }
}

export function DayStateSpine() {
  const state = useDayState();
  const router = useRouter();
  const { role } = useAuth();
  const isOffice = role === "office";

  const flat = useMemo(() => {
    if (!state) return [] as { phase: DayPhase; subStep: string }[];
    const out: { phase: DayPhase; subStep: string }[] = [];
    for (const p of state.phaseOrder) {
      const steps = state.subSteps[p] || [];
      for (const s of steps) out.push({ phase: p, subStep: s });
    }
    return out;
  }, [state]);

  if (!state || flat.length === 0) {
    return (
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 90,
          padding: "4px 10px",
          background: "#0a0a0a",
          borderTop: "1px solid #1a1a1a",
          color: DIM_TEXT,
          fontFamily: "'Courier New', Courier, monospace",
          fontSize: 10,
          letterSpacing: 1,
          textAlign: "center",
        }}
      >
        day state loading…
      </div>
    );
  }

  const currentIdx = flat.findIndex(
    (n) => n.phase === state.phase && n.subStep === state.subStep,
  );

  const onTap = (subStep: string) => {
    const target = routeFor(subStep, isOffice);
    if (!target) return;
    if (target.event) {
      try {
        window.dispatchEvent(new CustomEvent(target.event));
      } catch {
        /* ignore */
      }
    }
    if (target.to) void router.navigate({ to: target.to });
  };

  return (
    <>
      <style>{`
        @keyframes bvSpinePulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(255,212,0,0.55); }
          50%      { box-shadow: 0 0 0 6px rgba(255,212,0,0);    }
        }
      `}</style>
      <div
        aria-label="Day progress"
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 90,
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 10px",
          background: "#0a0a0a",
          borderTop: "1px solid #1a1a1a",
          overflowX: "auto",
          fontFamily: "'Courier New', Courier, monospace",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {flat.map((node, i) => {
          const isCurrent = i === currentIdx;
          const isDone = currentIdx >= 0 && i < currentIdx;
          const isUpcoming = !isCurrent && !isDone;

          const phaseChange = i === 0 || flat[i - 1]!.phase !== node.phase;

          const size = isCurrent ? 36 : 28;
          const bg = isCurrent ? YELLOW : isDone ? LIME : "transparent";
          const border = isCurrent
            ? YELLOW
            : isDone
              ? LIME
              : DIM;

          const textColor = isCurrent || isDone ? "#0a0a0a" : DIM_TEXT;

          const target = routeFor(node.subStep, isOffice);
          const canTap = !isUpcoming && !!target;

          const dot = (
            <button
              key={`${node.phase}:${node.subStep}`}
              type="button"
              onClick={canTap ? () => onTap(node.subStep) : undefined}
              disabled={!canTap}
              aria-label={`${node.phase} ${node.subStep}`}
              aria-current={isCurrent ? "step" : undefined}
              title={LABELS[node.subStep] || node.subStep}
              style={{
                position: "relative",
                flex: "0 0 auto",
                minWidth: size,
                height: size,
                padding: "0 8px",
                borderRadius: 999,
                background: bg,
                border: `1px solid ${border}`,
                color: textColor,
                fontSize: isCurrent ? 11 : 10,
                fontWeight: 700,
                letterSpacing: 1,
                cursor: canTap ? "pointer" : "default",
                opacity: isUpcoming ? 0.85 : 1,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                whiteSpace: "nowrap",
                animation: isCurrent ? "bvSpinePulse 1.6s ease-out infinite" : undefined,
              }}
            >
              {LABELS[node.subStep] || node.subStep}
            </button>
          );

          if (phaseChange && i > 0) {
            return (
              <span
                key={`sep-${i}`}
                style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
              >
                <span style={{ color: DIM_TEXT, fontSize: 10, letterSpacing: 1 }}>
                  ›
                </span>
                <span style={{ color: DIM_TEXT, fontSize: 9, letterSpacing: 1 }}>
                  {PHASE_LABEL[node.phase]}
                </span>
                {dot}
              </span>
            );
          }
          if (i === 0) {
            return (
              <span
                key={`head-${i}`}
                style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
              >
                <span style={{ color: DIM_TEXT, fontSize: 9, letterSpacing: 1 }}>
                  {PHASE_LABEL[node.phase]}
                </span>
                {dot}
              </span>
            );
          }
          return dot;
        })}
      </div>
    </>
  );
}
