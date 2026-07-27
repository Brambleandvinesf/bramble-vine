import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { ChevronUp, ChevronDown } from "lucide-react";
import { useDayState, type DayPhase } from "../lib/day-state";
import { useAuth, type Role } from "../lib/auth";
import { canSee } from "../lib/permissions";

const LIME = "#7cff00";
const LIME_DIM = "#2f5f10";
const DIM_TEXT = "#4a7a1e";
const BG = "#0a0a0a";

// Height of the spine body. The body is always rendered at this height, in both
// states, so collapsing can be a pure translate with no reflow.
const SPINE_BODY_H = 128;
// How much of the body stays on screen when collapsed. The sub-node row sits at
// top:10 and the active capsule is 30 tall, so it occupies 10-40: 46 keeps the
// whole capsule with a little breathing room and hides the anchors below it.
const COLLAPSED_PEEK = 46;
// Slide the body's hidden part plus the bottom padding off the bottom edge. The
// arrow tab is anchored above the body, so it rides down with it and stays
// visible as the peek handle.
const COLLAPSED_SHIFT =
  `calc(${SPINE_BODY_H - COLLAPSED_PEEK}px + 6px + env(safe-area-inset-bottom, 0px))`;

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

// Roles whose screen follows the spine's active node automatically. The guided
// linear day belongs to the field crew; office runs from schedule + messages
// and management moves around freely, so neither gets yanked between screens.
const FOLLOW_ROLES = new Set<Role>(["lead", "assistant"]);

// Never pull the crew off these screens. When the day advances while they are
// here, the spine glows instead (see nudge below) so the change is noticed
// without stealing the screen out from under them.
const NO_FOLLOW_FROM = new Set(["/messages", "/receipts"]);

// "Glowfire": pulse the spine whenever the active node changes.
//
// TEMPORARY (2026-07-24) - true so the animation can be observed on every role
// and every screen. Setting this back to false narrows it to its intended job:
// glowing only for crew who were deliberately NOT navigated (see NO_FOLLOW_FROM).
const GLOW_ON_EVERY_CHANGE = true;

/**
 * Where a followed role's screen belongs for a given sub-step.
 *
 * This deliberately mirrors the destination screens' own guards instead of
 * reusing routeFor: /confirm bounces anyone without special_confirm (assistants)
 * back to "/", and /loading redirects assistants to /field. Following those
 * blindly would ping-pong the crew between screens. null means "leave it alone".
 */
function followTo(subStep: string, role: Role): string | null {
  switch (subStep) {
    case "team_assign":
      return "/schedule";
    case "dailyload_confirm":
    case "special_confirm":
      return canSee(role, "special_confirm") ? "/confirm" : null;
    case "loading":
      if (role === "assistant") return "/field";
      return canSee(role, "loading") ? "/loading" : null;
    case "enroute":
    case "arrived":
    case "visit":
    case "debrief":
    case "next":
    case "unload":
    case "confirm_hours":
      return canSee(role, "route_enroute") ? "/field" : null;
    default:
      // signin, and anything the backend adds later: do not move the screen.
      return null;
  }
}

function routeFor(
  subStep: string,
  canAssignTeams: boolean,
): { to?: string; event?: string } | null {
  switch (subStep) {
    case "signin":
      return { to: "/login" };
    case "team_assign":
      return canAssignTeams
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
  const canAssignTeams = role === "office" || role === "lead" || role === "management";

  const [collapsed, setCollapsed] = useState(false);
  const [nudge, setNudge] = useState(0);
  const [nudging, setNudging] = useState(false);
  const lastKeyRef = useRef<string>("");
  const followKeyRef = useRef<string>("");

  useEffect(() => {
    if (!state) return;
    const key = `${state.phase}:${state.subStep}`;
    if (lastKeyRef.current && lastKeyRef.current !== key) {
      setCollapsed(false);
      // Fires for every role on every screen while GLOW_ON_EVERY_CHANGE is on.
      if (GLOW_ON_EVERY_CHANGE) setNudge((n) => n + 1);
    }
    lastKeyRef.current = key;
  }, [state]);

  // Keep the screen on the spine's active node. Only fires when the node
  // actually changes, so a poll that returns identical state never navigates,
  // and never on the first reading - that would fight the role landing routes.
  useEffect(() => {
    if (!state) return;
    const key = `${state.phase}:${state.subStep}`;
    const prev = followKeyRef.current;
    if (prev === key) return;
    followKeyRef.current = key;
    if (!prev) return;
    if (!role || !FOLLOW_ROLES.has(role)) return;

    const to = followTo(state.subStep, role);
    if (!to) return;
    const here = router.state.location.pathname;
    if (here === to) return;
    if (NO_FOLLOW_FROM.has(here)) {
      // Stay put, but glow the spine so the new state gets noticed. Skipped
      // when GLOW_ON_EVERY_CHANGE already fired it for this change.
      if (!GLOW_ON_EVERY_CHANGE) setNudge((n) => n + 1);
      return;
    }
    // Navigates only. Advancing the day should move the screen, never throw a
    // modal (such as team setup) over it unasked.
    void router.navigate({ to });
  }, [state, role, router]);

  // Drives the one-shot glow. Keyed off a counter so repeated changes replay it.
  useEffect(() => {
    if (!nudge) return;
    setNudging(true);
    const t = window.setTimeout(() => setNudging(false), 2800);
    return () => window.clearTimeout(t);
  }, [nudge]);

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
  const subRowRef = useRef<HTMLDivElement | null>(null);
  const anchorRowRef = useRef<HTMLDivElement | null>(null);
  const [geom, setGeom] = useState<{
    w: number;
    h: number;
    anchors: { cx: number; cy: number; top: number }[];
    // hw/hh are half extents: sub-nodes are 18px circles except the current one,
    // which is a text capsule an order of magnitude wider.
    subs: { cx: number; cy: number; bottom: number; hw: number; hh: number }[];
    subRowW: number;
  } | null>(null);

  useLayoutEffect(() => {
    if (!containerRef.current) return;
    const measure = () => {
      const el = containerRef.current;
      if (!el) return;
      // Layout box here too, so nothing in this function reads a transformed
      // value. The container is only translated, not scaled, but keeping every
      // measurement in one coordinate system avoids the question entirely.
      const cw = el.offsetWidth;
      const ch = el.offsetHeight;

      // Centres are taken from the LAYOUT box, never the visual one.
      //
      // Every node carries .bv-spine-node, whose bvSpineFade keyframe starts at
      // translateY(4px) with fill "both" - so at measure time the transform is
      // already applied and getBoundingClientRect reports the node 4px low. The
      // active capsule uses .bv-spine-capsule instead, which only scales, and
      // scale is centre-origin, so its centre does not move. The two therefore
      // disagreed by 4px and the connectors ran at a slight slant. A
      // ResizeObserver never fires for a transform, so nothing corrected it.
      //
      // offsetLeft/offsetTop are pre-transform and relative to the nearest
      // positioned ancestor: for a sub-node that is the sub-row, for an anchor
      // circle it is the anchor row, and both rows are positioned inside the
      // container - so adding the row's own offset gives container coordinates.
      const centreIn = (row: HTMLElement | null, n: HTMLElement) => {
        const hw = n.offsetWidth / 2;
        const hh = n.offsetHeight / 2;
        const rowLeft = row ? row.offsetLeft : 0;
        const rowTop = row ? row.offsetTop : 0;
        return { cx: rowLeft + n.offsetLeft + hw, cy: rowTop + n.offsetTop + hh, hw, hh };
      };

      const anchorRow = anchorRowRef.current;
      const anchors = phases.map((_, i) => {
        const n = anchorRefs.current[i];
        if (!n) return { cx: 0, cy: 0, top: 0 };
        const { cx, cy, hh } = centreIn(anchorRow, n);
        return { cx, cy, top: cy - hh };
      });
      // Iterate the current sub-steps, not the ref array: that array never
      // shrinks, so after a phase with fewer sub-steps (unloading has 2 against
      // a visit's 5) its stale tail made subs.length disagree with
      // activeSubs.length, and the connector block silently drew nothing.
      const subRow = subRowRef.current;
      const subs = activeSubs.map((_, i) => {
        const n = subRefs.current[i];
        if (!n) return { cx: 0, cy: 0, bottom: 0, hw: 0, hh: 0 };
        // Extents are layout-based for the same reason as the centres: the
        // capsule mounts under a scale(0.85) keyframe, so a visual-box read
        // would stay 15% short for the rest of the day.
        const { cx, cy, hw, hh } = centreIn(subRow, n);
        return { cx, cy, bottom: cy + hh, hw, hh };
      });
      // Layout width again, for the same reason as the sub extents above.
      const subRowW = subRowRef.current ? subRowRef.current.offsetWidth : 0;
      setGeom({ w: cw, h: ch, anchors, subs, subRowW });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(containerRef.current);
    // The sub-row is absolutely positioned, so container resizes miss it; watch
    // it directly or a late font load leaves a stale width behind.
    if (subRowRef.current) ro.observe(subRowRef.current);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
    // No `collapsed` dependency: the body renders identically in both states, so
    // collapsing cannot change any geometry. (A transform would not disturb the
    // measurements either - they are all relative to the container, which moves
    // with its children.)
  }, [state, activeSubs, currentSubIdx, activeIdx, phases]);

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
    const target = routeFor(subStep, canAssignTeams);
    if (!target) return;
    if (target.event) {
      try {
        window.dispatchEvent(new CustomEvent(target.event));
      } catch { /* ignore */ }
    }
    if (target.to) void router.navigate({ to: target.to });
  };

  const N = phases.length;
  const parentSize = 26;
  const subSize = 18;

  // The sub-row wants to centre over its anchor, but the first and last anchors
  // sit near the screen edges: centring a wide row over anchor 0 pushes its left
  // edge negative and the container's overflow:hidden eats the first node
  // (reported on a phone, 2026-07-24). Clamp the centre so the row always fits.
  const SUB_ROW_PAD = 8;
  // Connectors are drawn edge-to-edge, so this gap is the only room they have.
  // At the old value of 10 they came out as 4px stubs once the overlap was fixed.
  const SUB_ROW_GAP = 18;
  const subRowPos: { left: number; transform: string } = (() => {
    const cw = geom?.w ?? 0;
    const rw = geom?.subRowW ?? 0;
    // Before the first measurement, or when the row simply cannot fit, pin it to
    // the left edge rather than letting it hang off into the clipped region.
    if (!cw || !rw || rw + SUB_ROW_PAD * 2 >= cw) {
      return { left: SUB_ROW_PAD, transform: "none" };
    }
    const desired = ((activeIdx + 0.5) / N) * cw;
    const half = rw / 2;
    const clamped = Math.min(Math.max(desired, half + SUB_ROW_PAD), cw - half - SUB_ROW_PAD);
    return { left: clamped, transform: "translateX(-50%)" };
  })();

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
        @keyframes bvSpineNudge {
          0%   { box-shadow: 0 0 0 rgba(124,255,0,0); }
          18%  { box-shadow: 0 -7px 22px rgba(124,255,0,0.6), 0 -2px 6px rgba(124,255,0,0.5); }
          100% { box-shadow: 0 0 0 rgba(124,255,0,0); }
        }
        /* Animated box-shadow only: the bar's border/background are inline. */
        .bv-spine-nudge { animation: bvSpineNudge 1.4s ease-out 2; }
        .bv-spine-node { animation: bvSpineFade .35s ease-out both; }
        .bv-spine-capsule { animation: bvSpineCapsuleIn .35s ease-out both, bvSpineBlink 3s cubic-bezier(0.45,0,0.55,1) infinite; }
        .bv-spine-enroute { stroke-dasharray: 8 6; animation: bvSpineDash 1.2s linear infinite; }
      `}</style>

      <div
        aria-label="Day progress"
        className={nudging ? "bv-spine-nudge" : undefined}
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
          // Collapsing slides the whole bar down and nothing else. The spine
          // always renders at full size, so no node changes position, size or
          // style between states - only this transform does.
          transform: collapsed ? `translateY(${COLLAPSED_SHIFT})` : "translateY(0)",
          transition: "transform 300ms ease-in-out",
          willChange: "transform",
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

        <div
          ref={containerRef}
          style={{
            position: "relative",
            height: SPINE_BODY_H,
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

                {/* horizontal sub-line: segments between adjacent sub-node edges */}
                {activeSubs.length > 1 &&
                  geom.subs.length === activeSubs.length &&
                  (() => {
                    const gap = 3;
                    // Distance from a node's centre to where the connector leaves
                    // its box. Using a fixed radius here drew the line straight
                    // over the current node, which is a wide capsule, not a dot.
                    const edgeDist = (hw: number, hh: number, ux: number, uy: number) => {
                      const tx = Math.abs(ux) > 1e-6 ? hw / Math.abs(ux) : Infinity;
                      const ty = Math.abs(uy) > 1e-6 ? hh / Math.abs(uy) : Infinity;
                      const t = Math.min(tx, ty);
                      return Number.isFinite(t) ? t : Math.max(hw, hh);
                    };
                    const segs: React.ReactNode[] = [];
                    for (let i = 0; i < geom.subs.length - 1; i++) {
                      const a = geom.subs[i];
                      const b = geom.subs[i + 1];
                      if (!a || !b) continue;
                      const done = i + 1 <= currentSubIdx;
                      const dx = b.cx - a.cx;
                      const dy = b.cy - a.cy;
                      const len = Math.hypot(dx, dy) || 1;
                      const ux = dx / len;
                      const uy = dy / len;
                      const offA = edgeDist(a.hw, a.hh, ux, uy) + gap;
                      const offB = edgeDist(b.hw, b.hh, ux, uy) + gap;
                      // Adjacent nodes can sit closer than their two insets;
                      // drawing then would render a backwards line.
                      if (offA + offB >= len) continue;
                      const x1 = a.cx + ux * offA;
                      const y1 = a.cy + uy * offA;
                      const x2 = b.cx - ux * offB;
                      const y2 = b.cy - uy * offB;
                      segs.push(
                        <line
                          key={`sub-seg-${i}`}
                          x1={x1}
                          x2={x2}
                          y1={y1}
                          y2={y2}
                          stroke={done ? LIME : LIME_DIM}
                          strokeWidth={2}
                          opacity={done ? 1 : 0.7}
                          filter={done ? "url(#bvLimeGlow)" : undefined}
                        />,
                      );
                    }
                    return <g>{segs}</g>;
                  })()}
              </svg>
            )}

            {/* Sub-row for active phase (centered above its anchor, clamped) */}
            {activeIdx >= 0 && activeSubs.length > 0 && (
              <div
                ref={subRowRef}
                style={{
                  position: "absolute",
                  top: 10,
                  left: subRowPos.left,
                  transform: subRowPos.transform,
                  maxWidth: `calc(100% - ${SUB_ROW_PAD * 2}px)`,
                  display: "flex",
                  alignItems: "center",
                  gap: SUB_ROW_GAP,
                  whiteSpace: "nowrap",
                }}
              >
                {activeSubs.map((s, si) => {
                  const sStatus: Status =
                    si < currentSubIdx ? "done" : si === currentSubIdx ? "current" : "upcoming";
                  const target = routeFor(s, canAssignTeams);
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
              ref={anchorRowRef}
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
      </div>
    </>
  );
}
