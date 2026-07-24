import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { ChevronUp, ChevronDown } from "lucide-react";
import { useDayState, type DayPhase } from "../lib/day-state";
import { useAuth } from "../lib/auth";

const LIME = "#7cff00";
const LIME_DIM = "#2f5f10";
const DIM_TEXT = "#4a7a1e";
const BG = "#0a0a0a";

const ACTION_TEXT: Record<string, string> = {
  signin: "Sign In",
  team_assign: "Assign Teams",
  dailyload_confirm: "Confirm Daily Load",
  special_confirm: "Confirm Special Loading",
  loading: "Load Vehicle",
  enroute: "En Route",
  arrived: "Arrived",
  visit: "Visit In Progress",
  debrief: "Debrief",
  next: "Next Stop",
  unload: "Unload",
  confirm_hours: "Confirm Hours",
};

function anchorLabel(phase: DayPhase, client: string | null | undefined): string {
  if (phase === "FIELD_VISIT") return (client && client.trim()) || "FIELD";
  return "HQ";
}

function routeFor(
  subStep: string,
  isOffice: boolean,
): { to?: string; event?: string } | null {
  switch (subStep) {
    case "signin":
      return { to: "/login" };
    case "team_assign":
      return isOffice
        ? { event: "bv:open-team-setup", to: "/schedule" }
        : { to: "/schedule" };
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

type Status = "done" | "current" | "upcoming";

function circleStyle(size: number, status: Status, interactive: boolean): React.CSSProperties {
  const base: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: 999,
    display: "inline-block",
    boxSizing: "border-box",
    padding: 0,
    cursor: interactive ? "pointer" : "default",
    transition: "all .25s ease",
    border: 0,
    flex: "0 0 auto",
  };
  if (status === "done") {
    return {
      ...base,
      border: `2px solid ${LIME}`,
      background: LIME,
      boxShadow: `0 0 8px ${LIME}, 0 0 16px rgba(124,255,0,0.35)`,
    };
  }
  return {
    ...base,
    border: `2px solid ${LIME_DIM}`,
    background: "transparent",
    opacity: 0.75,
  };
}

export function DayStateSpine() {
  const state = useDayState();
  const router = useRouter();
  const { role } = useAuth();
  const isOffice = role === "office";

  const [collapsed, setCollapsed] = useState(false);
  const lastKeyRef = useRef<string>("");

  useEffect(() => {
    if (!state) return;
    const key = `${state.phase}:${state.subStep}`;
    if (lastKeyRef.current && lastKeyRef.current !== key) setCollapsed(false);
    lastKeyRef.current = key;
  }, [state]);

  const phases = state?.phaseOrder ?? [];
  const activeIdx = state ? phases.indexOf(state.phase) : -1;

  const activeSubs = useMemo(() => {
    if (!state) return [];
    return state.subSteps[state.phase] || [];
  }, [state]);
  const currentSubIdx = state ? activeSubs.indexOf(state.subStep) : -1;

  // ---- measurement for connector routing ----
  const containerRef = useRef<HTMLDivElement | null>(null);
  const anchorRefs = useRef<(HTMLDivElement | null)[]>([]);
  const subRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [geom, setGeom] = useState<{
    w: number;
    h: number;
    anchors: { cx: number; cy: number; top: number }[];
    subs: { cx: number; cy: number; bottom: number }[];
  } | null>(null);

  useLayoutEffect(() => {
    if (!containerRef.current) return;
    const measure = () => {
      const el = containerRef.current;
      if (!el) return;
      const c = el.getBoundingClientRect();
      const anchors = anchorRefs.current.map((n) => {
        if (!n) return { cx: 0, cy: 0, top: 0 };
        const r = n.getBoundingClientRect();
        return {
          cx: r.left + r.width / 2 - c.left,
          cy: r.top + r.height / 2 - c.top,
          top: r.top - c.top,
        };
      });
      const subs = subRefs.current.map((n) => {
        if (!n) return { cx: 0, cy: 0, bottom: 0 };
        const r = n.getBoundingClientRect();
        return {
          cx: r.left + r.width / 2 - c.left,
          cy: r.top + r.height / 2 - c.top,
          bottom: r.bottom - c.top,
        };
      });
      setGeom({ w: c.width, h: c.height, anchors, subs });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(containerRef.current);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [state, collapsed, activeSubs.length, currentSubIdx, activeIdx, phases.length]);

  if (!state || phases.length === 0) {
    return (
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 90,
          padding: "6px 10px calc(6px + env(safe-area-inset-bottom, 0px))",
          background: BG,
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

  const onTap = (subStep: string) => {
    const target = routeFor(subStep, isOffice);
    if (!target) return;
    if (target.event) {
      try {
        window.dispatchEvent(new CustomEvent(target.event));
      } catch { /* ignore */ }
    }
    if (target.to) void router.navigate({ to: target.to });
  };

  const currentActionText =
    ACTION_TEXT[state.subStep] || state.subStep.replace(/_/g, " ").toUpperCase();

  const N = phases.length;
  const parentSize = 26;
  const subSize = 18;

  return (
    <>
      <style>{`
        @keyframes bvSpineBlink {
          0%,100% { box-shadow: 0 0 5px rgba(124,255,0,0.4), 0 0 10px rgba(124,255,0,0.15); opacity: 0.4; }
          50%     { box-shadow: 0 0 12px ${LIME}, 0 0 26px rgba(124,255,0,0.7); opacity: 1; }
        }
        @keyframes bvSpineCapsuleIn {
          from { transform: scale(0.85); opacity: 0; }
          to   { transform: scale(1);    opacity: 1; }
        }
        @keyframes bvSpineFade {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0);   }
        }
        @keyframes bvSpineDash {
          from { stroke-dashoffset: 0; }
          to   { stroke-dashoffset: -28; }
        }
        .bv-spine-node { animation: bvSpineFade .35s ease-out both; }
        .bv-spine-capsule { animation: bvSpineCapsuleIn .35s ease-out both, bvSpineBlink 3s cubic-bezier(0.45,0,0.55,1) infinite; }
        .bv-spine-dot-blink { animation: bvSpineBlink 3s cubic-bezier(0.45,0,0.55,1) infinite; }
        .bv-spine-enroute { stroke-dasharray: 8 6; animation: bvSpineDash 1.2s linear infinite; }
      `}</style>

      <div
        aria-label="Day progress"
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 90,
          background: BG,
          borderTop: "1px solid #1a1a1a",
          fontFamily: "'Courier New', Courier, monospace",
          paddingBottom: "calc(6px + env(safe-area-inset-bottom, 0px))",
        }}
      >
        {/* toggle handle */}
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? "Expand day spine" : "Collapse day spine"}
          style={{
            position: "absolute",
            top: -14,
            left: "50%",
            transform: "translateX(-50%)",
            width: 44,
            height: 18,
            borderRadius: "10px 10px 0 0",
            background: BG,
            border: "1px solid #1a1a1a",
            borderBottom: "none",
            color: DIM_TEXT,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            padding: 0,
          }}
        >
          {collapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        {collapsed ? (
          <div
            style={{
              padding: "8px 12px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              color: LIME,
              fontSize: 11,
              letterSpacing: 1.5,
              fontWeight: 700,
              minHeight: 32,
            }}
          >
            <span
              className="bv-spine-dot-blink"
              style={{
                width: 10,
                height: 10,
                borderRadius: 999,
                background: LIME,
              }}
            />
            {currentActionText.toUpperCase()}
          </div>
        ) : (
          <div
            ref={containerRef}
            style={{
              position: "relative",
              height: 128,
              width: "100%",
              overflow: "hidden",
            }}
          >
            {/* SVG connector layer */}
            {geom && (
              <svg
                width={geom.w}
                height={geom.h}
                style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
              >
                <defs>
                  <filter id="bvLimeGlow" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="1.2" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>

                {/* horizontal baseline between anchors, at anchor center */}
                {geom.anchors.map((a, i) => {
                  if (i === geom.anchors.length - 1) return null;
                  const b = geom.anchors[i + 1];
                  const done = i < activeIdx;
                  const r = parentSize / 2;
                  const isEnrouteSeg =
                    state.phase === "FIELD_VISIT" &&
                    state.subStep === "enroute" &&
                    phases[i] === "HQ_LOADING" &&
                    phases[i + 1] === "FIELD_VISIT";
                  if (isEnrouteSeg) {
                    const midX = (a.cx + r + (b.cx - r)) / 2;
                    return (
                      <g key={`base-${i}`}>
                        <line
                          x1={a.cx + r}
                          x2={b.cx - r}
                          y1={a.cy}
                          y2={b.cy}
                          stroke={LIME_DIM}
                          strokeWidth={2}
                          opacity={0.6}
                        />
                        <line
                          className="bv-spine-enroute"
                          x1={a.cx + r}
                          x2={b.cx - r}
                          y1={a.cy}
                          y2={b.cy}
                          stroke={LIME}
                          strokeWidth={2}
                          filter="url(#bvLimeGlow)"
                        />
                        <text
                          x={midX}
                          y={a.cy - 6}
                          textAnchor="middle"
                          fill={LIME}
                          style={{
                            fontFamily: "'Courier New', Courier, monospace",
                            fontSize: 9,
                            fontWeight: 700,
                            letterSpacing: 1.2,
                            textTransform: "uppercase",
                          }}
                        >
                          En Route
                        </text>
                      </g>
                    );
                  }
                  const stroke = done ? LIME : LIME_DIM;
                  return (
                    <line
                      key={`base-${i}`}
                      x1={a.cx + r}
                      x2={b.cx - r}
                      y1={a.cy}
                      y2={b.cy}
                      stroke={stroke}
                      strokeWidth={2}
                      opacity={done ? 1 : 0.55}
                      filter={done ? "url(#bvLimeGlow)" : undefined}
                    />
                  );
                })}

                {/* L-connector: active anchor → first sub-node */}
                {activeIdx >= 0 &&
                  activeSubs.length > 0 &&
                  geom.anchors[activeIdx] &&
                  geom.subs[0] &&
                  (() => {
                    const a = geom.anchors[activeIdx];
                    const first = geom.subs[0];
                    const anchorTopEdge = a.cy - parentSize / 2;
                    const subBottomEdge = first.bottom;
                    // bend halfway between sub row and anchor
                    const bendY = Math.round((subBottomEdge + anchorTopEdge) / 2);
                    return (
                      <g stroke={LIME} strokeWidth={2} fill="none" filter="url(#bvLimeGlow)">
                        {/* up from anchor center */}
                        <line x1={a.cx} y1={anchorTopEdge} x2={a.cx} y2={bendY} />
                        {/* horizontal to first sub's x */}
                        <line x1={a.cx} y1={bendY} x2={first.cx} y2={bendY} />
                        {/* up into first sub center (clipped at bottom edge) */}
                        <line x1={first.cx} y1={bendY} x2={first.cx} y2={subBottomEdge} />
                      </g>
                    );
                  })()}

                {/* horizontal sub-line connecting all sub-node centers */}
                {activeSubs.length > 1 &&
                  geom.subs.length === activeSubs.length &&
                  (() => {
                    const first = geom.subs[0];
                    const last = geom.subs[geom.subs.length - 1];
                    if (!first || !last) return null;
                    return (
                      <line
                        x1={first.cx}
                        x2={last.cx}
                        y1={first.cy}
                        y2={last.cy}
                        stroke={LIME_DIM}
                        strokeWidth={2}
                        opacity={0.7}
                      />
                    );
                  })()}
                {/* done segment overlay for sub-line */}
                {activeSubs.length > 1 &&
                  currentSubIdx > 0 &&
                  geom.subs.length === activeSubs.length &&
                  (() => {
                    const first = geom.subs[0];
                    const doneTo = geom.subs[Math.min(currentSubIdx, geom.subs.length - 1)];
                    if (!first || !doneTo) return null;
                    return (
                      <line
                        x1={first.cx}
                        x2={doneTo.cx}
                        y1={first.cy}
                        y2={doneTo.cy}
                        stroke={LIME}
                        strokeWidth={2}
                        filter="url(#bvLimeGlow)"
                      />
                    );
                  })()}
              </svg>
            )}

            {/* Sub-row for active phase (centered above its anchor, clamped) */}
            {activeIdx >= 0 && activeSubs.length > 0 && (
              <div
                style={{
                  position: "absolute",
                  top: 10,
                  left: `${((activeIdx + 0.5) / N) * 100}%`,
                  transform: "translateX(-50%)",
                  maxWidth: "calc(100vw - 16px)",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "0 8px",
                  whiteSpace: "nowrap",
                }}
              >
                {activeSubs.map((s, si) => {
                  const sStatus: Status =
                    si < currentSubIdx ? "done" : si === currentSubIdx ? "current" : "upcoming";
                  const target = routeFor(s, isOffice);
                  const canTap = sStatus !== "upcoming" && !!target;
                  const setRef = (el: HTMLElement | null) => {
                    subRefs.current[si] = el as HTMLDivElement | null;
                  };
                  if (sStatus === "current") {
                    return (
                      <button
                        key={s}
                        ref={setRef}
                        type="button"
                        disabled={!canTap}
                        onClick={canTap ? () => onTap(s) : undefined}
                        aria-current="step"
                        aria-label={ACTION_TEXT[s] || s}
                        className="bv-spine-capsule"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          height: 30,
                          padding: "0 14px",
                          borderRadius: 999,
                          background: LIME,
                          color: "#0a0a0a",
                          fontSize: 11,
                          fontWeight: 800,
                          letterSpacing: 1.4,
                          textTransform: "uppercase",
                          border: `2px solid ${LIME}`,
                          cursor: canTap ? "pointer" : "default",
                          whiteSpace: "nowrap",
                          fontFamily: "'Courier New', Courier, monospace",
                        }}
                      >
                        {ACTION_TEXT[s] || s}
                      </button>
                    );
                  }
                  return (
                    <div
                      key={s}
                      ref={setRef}
                      role={canTap ? "button" : undefined}
                      tabIndex={canTap ? 0 : -1}
                      onClick={canTap ? () => onTap(s) : undefined}
                      aria-label={ACTION_TEXT[s] || s}
                      className="bv-spine-node"
                      style={circleStyle(subSize, sStatus, canTap)}
                    />
                  );
                })}
              </div>
            )}

            {/* Anchor row (always show labels) */}
            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 6,
                display: "flex",
                alignItems: "flex-end",
              }}
            >
              {phases.map((phase, i) => {
                const isActivePhase = i === activeIdx;
                const isDone = i < activeIdx;
                // parent status: done once its sub-steps have begun; upcoming if not reached
                const parentStatus: Status = isActivePhase
                  ? currentSubIdx >= 0
                    ? "done"
                    : "upcoming"
                  : isDone
                    ? "done"
                    : "upcoming";
                const label = anchorLabel(phase, state.client);
                return (
                  <div
                    key={`ph-${phase}-${i}`}
                    className="bv-spine-node"
                    style={{
                      flex: 1,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 3,
                    }}
                  >
                    <div
                      ref={(el) => {
                        anchorRefs.current[i] = el;
                      }}
                      aria-label={label}
                      style={circleStyle(parentSize, parentStatus, false)}
                    />
                    <div
                      style={{
                        color: parentStatus === "done" ? LIME : DIM_TEXT,
                        fontSize: 9,
                        letterSpacing: 1.2,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        whiteSpace: "nowrap",
                        maxWidth: 140,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        textAlign: "center",
                      }}
                    >
                      {label}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
