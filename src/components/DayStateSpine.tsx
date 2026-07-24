import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { ChevronUp, ChevronDown } from "lucide-react";
import { useDayState, type DayPhase } from "../lib/day-state";
import { useAuth } from "../lib/auth";

const LIME = "#7cff00";
const LIME_DIM = "#2f5f10";
const DIM_TEXT = "#4a7a1e";
const YELLOW = "#ffd400";
const BG = "#0a0a0a";

const SUB_DESC: Record<string, string> = {
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

// Layout constants
const H = 108;
const PARENT_CY = 76; // anchor center-y from top
const SUB_CY = 26; // sub-node center-y from top
const JOG_Y = 50; // horizontal jog between parent and sub-row
const parentSize = 26;
const parentCurrentSize = 32;
const subSize = 18;
const subCurrentSize = 26;
const SUB_GAP = 10;

function circleStyle(
  size: number,
  status: Status,
  interactive: boolean,
): React.CSSProperties {
  const base: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: 999,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    background: "transparent",
    padding: 0,
    boxSizing: "border-box",
    cursor: interactive ? "pointer" : "default",
    transition: "all .25s ease",
  };
  if (status === "done") {
    return {
      ...base,
      border: `2px solid ${LIME}`,
      background: LIME,
      boxShadow: `0 0 8px ${LIME}, 0 0 16px rgba(124,255,0,0.35)`,
    };
  }
  if (status === "current") {
    return {
      ...base,
      border: `2px solid ${YELLOW}`,
      background: YELLOW,
      boxShadow: `0 0 10px ${YELLOW}, 0 0 22px rgba(255,212,0,0.55)`,
      animation: "bvSpinePulse 1.8s ease-out infinite",
    };
  }
  return {
    ...base,
    border: `2px solid ${LIME_DIM}`,
    background: "transparent",
    opacity: 0.75,
  };
}

function capsuleStyle(width: number, height: number, interactive: boolean): React.CSSProperties {
  return {
    width,
    height,
    borderRadius: 999,
    border: `2px solid ${YELLOW}`,
    background: YELLOW,
    color: "#0a0a0a",
    boxShadow: `0 0 10px ${YELLOW}, 0 0 22px rgba(255,212,0,0.55)`,
    animation: "bvSpinePulse 1.8s ease-out infinite",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0 12px",
    fontFamily: "'Courier New', Courier, monospace",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.5,
    whiteSpace: "nowrap",
    boxSizing: "border-box",
    cursor: interactive ? "pointer" : "default",
    transition: "all .25s ease",
  };
}

function measureCapsuleWidth(text: string): number {
  // Approx monospace 11px: ~6.7px per char + 24px padding + 4px border
  return Math.max(subCurrentSize + 24, Math.round(text.length * 6.7 + 28));
}

export function DayStateSpine() {
  const state = useDayState();
  const router = useRouter();
  const { role } = useAuth();
  const isOffice = role === "office";

  const [collapsed, setCollapsed] = useState(false);
  const lastKeyRef = useRef<string>("");

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerW, setContainerW] = useState(0);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setContainerW(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [collapsed]);

  useEffect(() => {
    if (!state) return;
    const key = `${state.phase}:${state.subStep}`;
    if (lastKeyRef.current && lastKeyRef.current !== key) {
      setCollapsed(false);
    }
    lastKeyRef.current = key;
  }, [state]);

  const phases = state?.phaseOrder ?? [];
  const activeIdx = state ? phases.indexOf(state.phase) : -1;

  const activeSubs = useMemo(() => {
    if (!state) return [];
    return state.subSteps[state.phase] || [];
  }, [state]);
  const currentSubIdx = state ? activeSubs.indexOf(state.subStep) : -1;

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

  const N = phases.length;

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

  const currentDesc = SUB_DESC[state.subStep] || state.subStep;

  // Compute sub-node dimensions for the active phase.
  // Widths are accumulated with SUB_GAP so the current-step capsule always
  // reserves its own space; neighbors reflow around it (spec #7).
  const subDims = activeSubs.map((s, si) => {
    const cur = si === currentSubIdx;
    if (cur) {
      const text = SUB_DESC[s] ?? s;
      return { w: measureCapsuleWidth(text), h: subCurrentSize, capsule: true, text };
    }
    return { w: subSize, h: subSize, capsule: false, text: "" };
  });
  const totalSubW =
    subDims.reduce((acc, d) => acc + d.w, 0) + SUB_GAP * Math.max(0, subDims.length - 1);
  const subCenters: number[] = [];
  {
    let acc = 0;
    for (let i = 0; i < subDims.length; i++) {
      subCenters.push(acc + subDims[i].w / 2);
      acc += subDims[i].w + SUB_GAP;
    }
  }

  // Center sub-row over the active parent anchor; clamp to viewport with padding.
  const PAD = 8;
  const anchorCenterX =
    containerW > 0 && activeIdx >= 0 ? (containerW * (activeIdx + 0.5)) / N : 0;
  let clampedLeft = anchorCenterX - totalSubW / 2;
  if (containerW > 0) {
    const maxLeft = Math.max(PAD, containerW - totalSubW - PAD);
    clampedLeft = Math.min(Math.max(PAD, clampedLeft), maxLeft);
  }
  const subXs = subCenters.map((c) => clampedLeft + c);
  const activeParentPx =
    currentSubIdx >= 0 ? parentSize : parentCurrentSize; /* current-when-no-sub */

  return (
    <>
      <style>{`
        @keyframes bvSpinePulse {
          0%,100% { box-shadow: 0 0 10px ${YELLOW}, 0 0 22px rgba(255,212,0,0.55); }
          50%     { box-shadow: 0 0 14px ${YELLOW}, 0 0 34px rgba(255,212,0,0.75); }
        }
        @keyframes bvSpineFade {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0);   }
        }
        .bv-spine-node { animation: bvSpineFade .35s ease-out both; }
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
              color: YELLOW,
              fontSize: 12,
              letterSpacing: 1.2,
              fontWeight: 700,
              minHeight: 32,
            }}
          >
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: 999,
                background: YELLOW,
                boxShadow: `0 0 8px ${YELLOW}`,
              }}
            />
            {currentDesc}
          </div>
        ) : (
          <div
            ref={containerRef}
            style={{
              position: "relative",
              height: H,
              width: "100%",
              overflow: "visible",
            }}
          >
            {/* Horizontal baseline segments between anchor centers */}
            {phases.map((_, i) => {
              if (i === N - 1) return null;
              const leftPct = ((i + 0.5) / N) * 100;
              const widthPct = (1 / N) * 100;
              const done = i < activeIdx;
              return (
                <div
                  key={`hline-${i}`}
                  style={{
                    position: "absolute",
                    left: `${leftPct}%`,
                    width: `${widthPct}%`,
                    top: PARENT_CY - 1,
                    height: 2,
                    background: done ? LIME : LIME_DIM,
                    opacity: done ? 1 : 0.5,
                    boxShadow: done ? `0 0 6px ${LIME}` : "none",
                  }}
                />
              );
            })}

            {/* Phase anchors (parents + labels) */}
            <div style={{ position: "absolute", inset: 0, display: "flex" }}>
              {phases.map((phase, i) => {
                const isActive = i === activeIdx;
                const isDone = i < activeIdx;
                const parentStatus: Status = isActive
                  ? currentSubIdx >= 0
                    ? "done"
                    : "current"
                  : isDone
                    ? "done"
                    : "upcoming";
                const parentPx = parentStatus === "current" ? parentCurrentSize : parentSize;
                const label = anchorLabel(phase, state.client);

                return (
                  <div
                    key={`ph-${phase}-${i}`}
                    style={{
                      flex: 1,
                      position: "relative",
                      overflow: "visible",
                    }}
                  >
                    {/* Parent anchor circle at column center */}
                    <div
                      aria-label={label}
                      className="bv-spine-node"
                      style={{
                        position: "absolute",
                        left: "50%",
                        top: PARENT_CY,
                        transform: "translate(-50%, -50%)",
                        zIndex: 3,
                        ...circleStyle(parentPx, parentStatus, false),
                      }}
                    />
                    {/* Anchor label */}
                    <div
                      style={{
                        position: "absolute",
                        left: "50%",
                        top: PARENT_CY + parentPx / 2 + 3,
                        transform: "translateX(-50%)",
                        color: parentStatus === "upcoming" ? DIM_TEXT : LIME,
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

            {/* Active sub-row + connectors — rendered at absolute px positions
                so the row can be centered over the parent anchor and clamped
                to the viewport regardless of column width. */}
            {activeIdx >= 0 &&
              activeSubs.length > 0 &&
              subCenters.length > 0 &&
              containerW > 0 && (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    pointerEvents: "none",
                    zIndex: 4,
                  }}
                >
                  {/* Segment A: vertical from parent TOP CENTER up to JOG_Y */}
                  <div
                    style={{
                      position: "absolute",
                      left: anchorCenterX - 1,
                      top: JOG_Y,
                      height: Math.max(0, PARENT_CY - activeParentPx / 2 - JOG_Y),
                      width: 2,
                      background: LIME,
                      boxShadow: `0 0 4px ${LIME}`,
                    }}
                  />
                  {/* Segment B: horizontal at JOG_Y from anchor center to sub[0] center */}
                  {(() => {
                    const x0 = Math.min(anchorCenterX, subXs[0]);
                    const w = Math.abs(subXs[0] - anchorCenterX);
                    return (
                      <div
                        style={{
                          position: "absolute",
                          left: x0,
                          width: w,
                          top: JOG_Y - 1,
                          height: 2,
                          background: LIME,
                          boxShadow: `0 0 4px ${LIME}`,
                        }}
                      />
                    );
                  })()}
                  {/* Segment C: vertical at sub[0] center from JOG_Y up to bottom of sub[0] */}
                  <div
                    style={{
                      position: "absolute",
                      left: subXs[0] - 1,
                      top: SUB_CY + subDims[0].h / 2,
                      height: Math.max(0, JOG_Y - (SUB_CY + subDims[0].h / 2)),
                      width: 2,
                      background: LIME,
                      boxShadow: `0 0 4px ${LIME}`,
                    }}
                  />

                  {/* Horizontal baseline connecting all sub-node centers */}
                  {subXs.length > 1 && (
                    <div
                      style={{
                        position: "absolute",
                        left: subXs[0],
                        width: subXs[subXs.length - 1] - subXs[0],
                        top: SUB_CY - 1,
                        height: 2,
                        background: LIME,
                        boxShadow: `0 0 4px ${LIME}`,
                        opacity: 0.9,
                      }}
                    />
                  )}

                  {/* Sub-nodes */}
                  {activeSubs.map((s, si) => {
                    const d = subDims[si];
                    const sStatus: Status =
                      si < currentSubIdx
                        ? "done"
                        : si === currentSubIdx
                          ? "current"
                          : "upcoming";
                    const target = routeFor(s, isOffice);
                    const canTap = sStatus !== "upcoming" && !!target;
                    const commonPos: React.CSSProperties = {
                      position: "absolute",
                      left: subXs[si],
                      top: SUB_CY,
                      transform: "translate(-50%, -50%)",
                      zIndex: 5,
                      pointerEvents: "auto",
                    };
                    if (d.capsule) {
                      return (
                        <button
                          key={s}
                          type="button"
                          disabled={!canTap}
                          onClick={canTap ? () => onTap(s) : undefined}
                          aria-label={d.text}
                          aria-current="step"
                          title={d.text}
                          className="bv-spine-node"
                          style={{ ...commonPos, ...capsuleStyle(d.w, d.h, canTap) }}
                        >
                          {d.text}
                        </button>
                      );
                    }
                    return (
                      <button
                        key={s}
                        type="button"
                        disabled={!canTap}
                        onClick={canTap ? () => onTap(s) : undefined}
                        aria-label={SUB_DESC[s] || s}
                        title={SUB_DESC[s] || s}
                        className="bv-spine-node"
                        style={{ ...commonPos, ...circleStyle(d.w, sStatus, canTap) }}
                      />
                    );
                  })}
                </div>
              )}
          </div>
        )}
      </div>
    </>
  );
}
