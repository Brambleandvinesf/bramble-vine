import React, { memo, useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { ChevronUp, ChevronDown } from "lucide-react";
import { useDayState, useDayStateRefresh, type DayPhase } from "../lib/day-state";
import { useAuth, type Role } from "../lib/auth";
import { canSee } from "../lib/permissions";
import { SCRIPT_URL } from "../routes/confirm";

const LIME = "#7cff00";
const LIME_DIM = "#2f5f10";
const DIM_TEXT = "#4a7a1e";
const BG = "#0a0a0a";

// Height of the spine body WITH a sub-node row. The body renders at a fixed
// height per mode, so collapsing can be a pure translate with no reflow.
const SPINE_BODY_H = 128;
// R (8/2): with no active sub-nodes (transit, or a phase with none) there is
// nothing above the anchors — the body shrinks to just the anchor row instead
// of reserving the full sub-row space.
const SPINE_COMPACT_H = 64;
// How much of the body stays on screen when collapsed. The sub-node row sits at
// top:10 and the active capsule is 30 tall, so it occupies 10-40: 46 keeps the
// whole capsule with a little breathing room and hides the anchors below it.
const COLLAPSED_PEEK = 46;
// Slide the body's hidden part plus the bottom padding off the bottom edge. The
// arrow tab is anchored above the body, so it rides down with it and stays
// visible as the peek handle.
const COLLAPSED_SHIFT =
  `calc(${SPINE_BODY_H - COLLAPSED_PEEK}px + 6px + env(safe-area-inset-bottom, 0px))`;

// The arrow tab is anchored 14px ABOVE the body, and the bar carries 6px plus
// the safe-area inset below it. Pages must reserve all of that, not just the
// body: reserving 128 left the tab and the inset overlapping the bottom of
// every screen, which is what hid the Confirm Special Loading button.
//
// R (8/2): the reserve is now a CSS variable the spine keeps up to date, so
// pages automatically reserve less when the body is in its compact
// (no-sub-row) mode. The fallback is the full-size value — anything rendering
// before the spine mounts reserves the safe maximum.
export const SPINE_RESERVE_CSS =
  `var(--bv-spine-reserve, calc(${SPINE_BODY_H + 14 + 6}px + env(safe-area-inset-bottom, 0px)))`;

// How long the spine stays up before folding itself away. Long enough to read
// the state that just changed, short enough not to sit on a button.
const AUTO_COLLAPSE_MS = 2500;

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

// Transit is drawn as the dashed line BETWEEN anchors, never as a sub-node —
// the little "EN ROUTE" pill above the destination anchor duplicated the
// line's state and is gone (M1, 8/2). These sub-steps therefore have no node.
const TRANSIT_SUBS = new Set(["enroute", "next"]);

// One anchor per real stop (B redesign, 8/2): HQ, then every calendar stop —
// client or vendor — then HQ again for unloading. When the backend couldn't
// read the calendar (stops null/empty) fall back to the old one-per-phase
// anchors so the spine never goes blank.
type AnchorDef = { label: string; phase: DayPhase; stopI?: number; vendor?: boolean };

// MM (8/2): with clients, vendors and breaks all on the spine, full labels
// under every anchor collide. Only the CURRENT and IMMEDIATE NEXT anchors
// keep their full label; the rest shrink to a short tag, tappable for the
// full name. Each anchor also claims a minimum width, so a busy day scrolls
// sideways rather than crushing the labels together.
const ANCHOR_MIN_W = 84;
function shortTag(label: string): string {
  const l = label.trim();
  if (l.length <= 8) return l;
  // "Devil Mountain Wholesale Nursery - Colma" -> "Colma"; else first word.
  const tail = l.split(" - ").pop()!.trim();
  const base = tail.length && tail.length < l.length ? tail : l;
  const first = base.split(/\s+/)[0];
  return (first.length > 8 ? first.slice(0, 8) : first).replace(/[.,]$/, "");
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
  const refreshDayState = useDayStateRefresh();
  const router = useRouter();
  const { role } = useAuth();
  const canAssignTeams = role === "office" || role === "lead" || role === "management";

  const [collapsed, setCollapsed] = useState(false);
  // MM (8/2): anchors whose short tag the user tapped open.
  const [expandedAnchors, setExpandedAnchors] = useState<Set<number>>(() => new Set());
  // V (8/2): which segment's "+" was tapped — event index the new stop takes.
  // CC (8/2): activeLine marks a tap on the segment the crew is DRIVING right
  // now; only that case offers "ADD STOP AND CHANGE COURSE" (explicit retarget).
  const [addStopAt, setAddStopAt] = useState<{ insertAt: number; activeLine: boolean } | null>(null);
  const [nudge, setNudge] = useState(0);
  const [nudging, setNudging] = useState(false);
  const lastKeyRef = useRef<string>("");
  const followKeyRef = useRef<string>("");
  // Set once the arrow is used: a deliberate choice outranks the timer, so the
  // spine stops folding itself away until the day state next changes.
  const manualRef = useRef(false);
  const autoRef = useRef<number | null>(null);

  const armAutoCollapse = useCallback(() => {
    if (autoRef.current) window.clearTimeout(autoRef.current);
    autoRef.current = window.setTimeout(() => {
      if (!manualRef.current) setCollapsed(true);
    }, AUTO_COLLAPSE_MS);
  }, []);

  // Fold away shortly after the screen first paints. It comes up expanded so
  // the day is legible on arrival, then gets out of the way of whatever is at
  // the bottom of the page.
  useEffect(() => {
    armAutoCollapse();
    return () => {
      if (autoRef.current) window.clearTimeout(autoRef.current);
    };
  }, [armAutoCollapse]);

  useEffect(() => {
    if (!state) return;
    const key = `${state.phase}:${state.subStep}`;
    if (lastKeyRef.current && lastKeyRef.current !== key) {
      // A real state change re-takes control from a manual collapse: this is
      // the one moment the spine has something new to say.
      manualRef.current = false;
      setCollapsed(false);
      armAutoCollapse();
      // Fires for every role on every screen while GLOW_ON_EVERY_CHANGE is on.
      if (GLOW_ON_EVERY_CHANGE) setNudge((n) => n + 1);
    }
    lastKeyRef.current = key;
  }, [state, armAutoCollapse]);

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

  // Anchor list: HQ + one per real stop + HQ, falling back to the classic
  // per-phase anchors when the backend has no stop list.
  const anchors = useMemo<AnchorDef[]>(() => {
    if (!state) return [];
    const stops = state.stops ?? null;
    if (!stops || stops.length === 0) {
      return phases.map((p) => ({ label: anchorLabel(p, state.client), phase: p }));
    }
    return [
      { label: "HQ", phase: "HQ_LOADING" as DayPhase },
      ...stops.map((s2, i) => ({
        label: s2.label,
        phase: "FIELD_VISIT" as DayPhase,
        stopI: i,
        vendor: s2.type === "vendor",
      })),
      { label: "HQ", phase: "HQ_UNLOADING" as DayPhase },
    ];
  }, [state, phases]);
  const stopAnchors = anchors.some((a) => a.stopI !== undefined);

  const activeIdx = (() => {
    if (!state) return -1;
    if (!stopAnchors) return phases.indexOf(state.phase);
    if (state.phase === "HQ_LOADING") return 0;
    if (state.phase === "HQ_UNLOADING") return anchors.length - 1;
    /* AA (8/2): past the last stop (state 'next' after the final debrief)
       the crew is heading HOME — the transit line points at the final HQ
       anchor. Clamping to the last STOP here drew a dashed line back into
       a stop that was already done, which is the line Brandon tapped and
       then (rightly) didn't get an arrival screen for. */
    return Math.min(1 + (state.stopIndex ?? 0), anchors.length - 1);
  })();

  const activeSubs = useMemo(() => {
    if (!state) return [];
    const all = state.subSteps[state.phase] || [];
    // M1: transit sub-steps have no node of their own — the dashed line
    // between anchors is their whole representation.
    if (state.phase !== "FIELD_VISIT") return all;
    return all.filter((s2) => !TRANSIT_SUBS.has(s2));
  }, [state]);
  const currentSubIdx = state ? activeSubs.indexOf(state.subStep) : -1;
  const inTransit =
    !!state && state.phase === "FIELD_VISIT" && TRANSIT_SUBS.has(state.subStep);
  // During transit the sub-row is hidden outright: showing the next stop's
  // dot row over an anchor the crew hasn't reached would be the same
  // duplicate-status noise the EN ROUTE pill was.
  const showSubRow = activeSubs.length > 0 && !inTransit;

  // R (8/2): no sub-row → compact body, and no collapse affordance at all.
  // Collapsing exists to get the sub-row out of the way of page content;
  // with only anchors showing, the old tab hid the anchors themselves —
  // the one thing the spine must never do.
  const bodyH = showSubRow ? SPINE_BODY_H : SPINE_COMPACT_H;
  const collapsible = showSubRow;
  const effectiveCollapsed = collapsed && collapsible;
  // Keep every page's bottom reserve in step with the actual body height
  // (tab only exists when collapsible; 6px + inset always).
  useLayoutEffect(() => {
    const reserve =
      `calc(${bodyH + (collapsible ? 14 : 0) + 6}px + env(safe-area-inset-bottom, 0px))`;
    try {
      document.documentElement.style.setProperty("--bv-spine-reserve", reserve);
    } catch { /* SSR */ }
  }, [bodyH, collapsible]);

  // ---- measurement for connector routing ----
  const containerRef = useRef<HTMLDivElement | null>(null);
  const anchorRefs = useRef<(HTMLDivElement | null)[]>([]);
  const subRefs = useRef<(HTMLDivElement | null)[]>([]);
  const subRowRef = useRef<HTMLDivElement | null>(null);
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
      // offsetLeft/offsetTop are pre-transform, but they are relative to
      // offsetParent - and offsetParent is NOT reliably the row. A CSS transform
      // makes an element an offsetParent, so an anchor circle reports its own
      // animated wrapper, not the anchor row. Measured in a browser: every
      // anchor then returned offsetLeft 13, so all three centres collapsed onto
      // the same x and the baseline segments had zero length and vanished.
      // Walking the chain up to the container is the only reading that holds for
      // both rows, whatever ends up positioned or transformed between them.
      const centreOf = (n: HTMLElement) => {
        const hw = n.offsetWidth / 2;
        const hh = n.offsetHeight / 2;
        let x = 0;
        let y = 0;
        let node: HTMLElement | null = n;
        while (node && node !== el) {
          x += node.offsetLeft;
          y += node.offsetTop;
          node = node.offsetParent as HTMLElement | null;
        }
        return { cx: x + hw, cy: y + hh, hw, hh };
      };

      const anchorPts = anchors.map((_, i) => {
        const n = anchorRefs.current[i];
        if (!n) return { cx: 0, cy: 0, top: 0 };
        const { cx, cy, hh } = centreOf(n);
        return { cx, cy, top: cy - hh };
      });
      // Iterate the current sub-steps, not the ref array: that array never
      // shrinks, so after a phase with fewer sub-steps (unloading has 2 against
      // a visit's 5) its stale tail made subs.length disagree with
      // activeSubs.length, and the connector block silently drew nothing.
      const subs = activeSubs.map((_, i) => {
        const n = subRefs.current[i];
        if (!n) return { cx: 0, cy: 0, bottom: 0, hw: 0, hh: 0 };
        // Extents are layout-based for the same reason as the centres: the
        // capsule mounts under a scale(0.85) keyframe, so a visual-box read
        // would stay 15% short for the rest of the day.
        const { cx, cy, hw, hh } = centreOf(n);
        return { cx, cy, bottom: cy + hh, hw, hh };
      });
      // Layout width again, for the same reason as the sub extents above.
      const subRowW = subRowRef.current ? subRowRef.current.offsetWidth : 0;
      setGeom({ w: cw, h: ch, anchors: anchorPts, subs, subRowW });
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
  }, [state, activeSubs, currentSubIdx, activeIdx, anchors]);

  if (!state || anchors.length === 0) {
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

  const N = anchors.length;
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
  //
  // Resolved to a plain left edge, never centred with translateX(-50%). The
  // connector maths reads offsetLeft, which is a layout value and ignores
  // transforms, so a -50% here would place every line half a row to the right
  // of the nodes it is meant to join. Subtracting half the width gives the same
  // pixels while keeping layout and paint in agreement.
  const subRowLeft: number = (() => {
    const cw = geom?.w ?? 0;
    const rw = geom?.subRowW ?? 0;
    // Before the first measurement, or when the row simply cannot fit, pin it to
    // the left edge rather than letting it hang off into the clipped region.
    if (!cw || !rw || rw + SUB_ROW_PAD * 2 >= cw) return SUB_ROW_PAD;
    const desired = ((activeIdx + 0.5) / N) * cw;
    const half = rw / 2;
    const centre = Math.min(Math.max(desired, half + SUB_ROW_PAD), cw - half - SUB_ROW_PAD);
    return centre - half;
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
          // always renders at full size for its mode, so no node changes
          // position, size or style between states - only this transform does.
          transform: effectiveCollapsed ? `translateY(${COLLAPSED_SHIFT})` : "translateY(0)",
          transition: "transform 300ms ease-in-out",
          willChange: "transform",
        }}
      >
        {/* toggle handle — only when there IS a sub-row to fold away (R):
            in compact mode collapsing could only hide the anchors, which is
            the one thing the spine must never do. */}
        {collapsible && (
        <button
          type="button"
          onClick={() => {
            manualRef.current = true;
            if (autoRef.current) window.clearTimeout(autoRef.current);
            setCollapsed((c) => !c);
          }}
          aria-label={effectiveCollapsed ? "Expand day spine" : "Collapse day spine"}
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
          {effectiveCollapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        )}

        {/* MM: a busy day scrolls sideways rather than cramming anchors —
            the inner track claims ANCHOR_MIN_W per anchor. */}
        <div
          ref={containerRef}
          style={{
            position: "relative",
            height: bodyH,
            width: "100%",
            minWidth: anchors.length * ANCHOR_MIN_W,
            overflowY: "hidden",
            overflowX: "auto",
            transition: "height 250ms ease-in-out",
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
                  {/*
                    filterUnits must be userSpaceOnUse, not the objectBoundingBox
                    default. A perfectly horizontal line has a ZERO-HEIGHT bbox,
                    so a region of "200% of the bbox" is still zero and the filter
                    paints nothing - the element vanishes outright. Only completed
                    connectors carry this glow, so only they disappeared, and only
                    once the segments were made exactly horizontal: while they
                    were still 4px out of true the non-zero bbox hid the problem.
                    Measured in a browser: horizontal + objectBoundingBox renders
                    0 in the green channel, userSpaceOnUse renders 255.
                  */}
                  <filter
                    id="bvLimeGlow"
                    filterUnits="userSpaceOnUse"
                    x={0}
                    y={0}
                    width={geom.w}
                    height={geom.h}
                  >
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
                  // Transit (enroute from HQ, or 'next' between stops) is the
                  // segment INTO the current anchor. The drawing below is the
                  // well-liked dashed line + label — unchanged (M5 guardrail).
                  const isEnrouteSeg = inTransit && i === activeIdx - 1;
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
                        {/* W (8/2): invisible tap target restoring the lost
                            path back to Start Visit / No Show — visuals and
                            animation above are untouched (M5 guardrail). */}
                        <line
                          x1={a.cx + r}
                          x2={b.cx - r}
                          y1={a.cy}
                          y2={b.cy}
                          stroke="transparent"
                          strokeWidth={28}
                          style={{ pointerEvents: "stroke", cursor: "pointer" }}
                          onClick={() => void router.navigate({ to: "/field" })}
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
                  showSubRow &&
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
                {showSubRow &&
                  activeSubs.length > 1 &&
                  geom.subs.length === activeSubs.length &&
                  (() => {
                    // Endpoints land ON each node's edge, so the segments visibly
                    // touch the nodes they join. The 1px bite absorbs the
                    // sub-pixel error in the centres - offsetLeft is an integer,
                    // so a centre can be up to ~0.5px out - which would otherwise
                    // leave a hairline break. It is well inside the 2px ring, so
                    // nothing reads as the line running over a node.
                    const BITE = 1;
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
                      const offA = edgeDist(a.hw, a.hh, ux, uy) - BITE;
                      const offB = edgeDist(b.hw, b.hh, ux, uy) - BITE;
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

            {/* Sub-row for active phase (centred over its anchor, clamped) */}
            {activeIdx >= 0 && showSubRow && (
              <div
                ref={subRowRef}
                style={{
                  position: "absolute",
                  top: 10,
                  left: subRowLeft,
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

            {/* Anchor row (always show labels).
                pointerEvents none (Y1, 8/2): this row is absolutely
                positioned OVER the SVG at exactly the connecting line's
                height, and its full-width flex children were swallowing
                every tap meant for W's hit-line — verified with a
                hit-test harness (elementFromPoint resolved to this row
                before the fix, to the hit-line after). Nothing in this
                row is interactive, so nothing is lost. */}
            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 6,
                display: "flex",
                alignItems: "flex-end",
                pointerEvents: "none",
              }}
            >
              {anchors.map((anchor, i) => {
                const isActiveAnchor = i === activeIdx;
                const isDone = i < activeIdx;
                // Anchor status: done once its sub-steps have begun (i.e. the
                // crew is actually AT it — a transit segment leaves the
                // destination anchor hollow until arrival); done outright
                // once the day has moved past it.
                const parentStatus: Status = isActiveAnchor
                  ? currentSubIdx >= 0
                    ? "done"
                    : "upcoming"
                  : isDone
                    ? "done"
                    : "upcoming";
                const label = anchor.label;
                // MM: full label for where we are and where we're going
                // next; everything else collapses to a short tag until
                // tapped. Expanded picks are remembered per anchor.
                const showFull =
                  i === activeIdx || i === activeIdx + 1 || expandedAnchors.has(i);
                const shown = showFull ? label : shortTag(label);
                return (
                  <div
                    key={`ph-${anchor.phase}-${i}`}
                    className="bv-spine-node"
                    style={{
                      flex: 1,
                      minWidth: ANCHOR_MIN_W,
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
                      role={showFull ? undefined : "button"}
                      title={label}
                      onClick={
                        showFull
                          ? undefined
                          : () => setExpandedAnchors((s2) => new Set(s2).add(i))
                      }
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
                        // The row is pointerEvents:none for W's tap-line, so
                        // re-enable it just for these expandable tags.
                        pointerEvents: showFull ? "none" : "auto",
                        cursor: showFull ? "default" : "pointer",
                        opacity: showFull ? 1 : 0.75,
                      }}
                    >
                      {shown}
                    </div>
                  </div>
                );
              })}
          </div>

            {/* V (8/2): "+" on every connecting line — insert a stop between
                these two anchors. Only in stops-mode (real per-stop anchors)
                and only for signed-in roles that run the day. */}
            {stopAnchors &&
              geom &&
              geom.anchors.slice(0, -1).map((a, i) => {
                const b = geom.anchors[i + 1];
                if (!a.cx || !b.cx) return null;
                const midX = (a.cx + b.cx) / 2;
                return (
                  <button
                    key={`add-${i}`}
                    type="button"
                    aria-label="Add stop here"
                    onClick={() =>
                      setAddStopAt({ insertAt: i, activeLine: inTransit && i === activeIdx - 1 })
                    }
                    style={{
                      position: "absolute",
                      left: midX - 22,
                      top: a.cy - 22,
                      width: 44,
                      height: 44,
                      borderRadius: 999,
                      background: "transparent",
                      border: "none",
                      padding: 0,
                      cursor: "pointer",
                      zIndex: 3,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <span
                      style={{
                        width: 14,
                        height: 14,
                        borderRadius: 999,
                        background: BG,
                        border: `1px solid ${LIME_DIM}`,
                        color: LIME,
                        fontSize: 13,
                        lineHeight: "13px",
                        textAlign: "center",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      +
                    </span>

                  </button>
                );
              })}
        </div>
      </div>

      {addStopAt !== null && (
        <AddStopSheet
          insertAt={addStopAt.insertAt}
          activeLine={addStopAt.activeLine}
          onClose={() => setAddStopAt(null)}
          onAdded={() => {
            setAddStopAt(null);
            refreshDayState();
          }}
        />
      )}
    </>
  );
}

/* ---------- V (8/2): Add Stop flow ---------- */

type DestSuggest = { label: string; address: string; placeId?: string };

/* CO (8/3): the backend returns exactly one documented shape:
     { ok, configured, suggestions: [{ placeId, text, primary, secondary }] }
   Read that and nothing else — the earlier multi-shape parser chased a bug
   that did not exist. */
function parsePlaces(json: unknown): DestSuggest[] {
  const root = (json ?? {}) as { suggestions?: unknown };
  const list = Array.isArray(root.suggestions) ? root.suggestions : [];
  const out: DestSuggest[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const s = (v: unknown) => (typeof v === "string" ? v : "");
    const label = s(o["primary"]) || s(o["text"]);
    if (!label) continue;
    const secondary = s(o["secondary"]);
    const placeId = s(o["placeId"]);
    out.push({
      label,
      address: secondary && secondary !== label ? secondary : "",
      ...(placeId ? { placeId } : {}),
    });
  }
  return out.slice(0, 50);
}



const SUGGEST_ROW: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: "10px 12px",
  background: "transparent",
  color: "#e8e8e8",
  border: "none",
  borderBottom: "1px solid #1d1d1d",
  fontFamily: "inherit",
  fontSize: 13,
  textAlign: "left",
  cursor: "pointer",
};

const SUGGEST_SUB: React.CSSProperties = {
  display: "block",
  color: "#8f8f8f",
  fontSize: 11,
  marginTop: 2,
};

const SuggestRow = memo(function SuggestRow({
  dest,
  onPick,
}: {
  dest: DestSuggest;
  onPick: (d: DestSuggest) => void;
}) {
  return (
    <button type="button" onClick={() => onPick(dest)} style={SUGGEST_ROW}>
      {dest.label}
      {dest.address && <span style={SUGGEST_SUB}>{dest.address}</span>}
    </button>
  );
});

function AddStopSheet({
  insertAt,
  activeLine,
  onClose,
  onAdded,
}: {
  insertAt: number;
  /** CC (8/2): "+" was pressed on the line the crew is driving right now. */
  activeLine: boolean;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [mode, setMode] = useState<"vendor" | "client" | "other" | null>(null);
  const [query, setQuery] = useState("");
  const [vendors, setVendors] = useState<DestSuggest[]>([]);
  const [frequent, setFrequent] = useState<DestSuggest[]>([]);
  const [clients, setClients] = useState<DestSuggest[]>([]);
  const [picked, setPicked] = useState<DestSuggest | null>(null);
  const [saveFrequent, setSaveFrequent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  /* CO (8/3): Google Places lookup for the OTHER pill.
     Billing: ONE sessionToken threads all placesAutocomplete keystrokes plus
     the closing placesDetails call — that is what makes Google bill this as a
     single session instead of per request. Minted on first keystroke of a
     lookup, discarded the moment the lookup ends (pick, clear, pill switch,
     sheet close). */
  /* Optimistic gate: we ATTEMPT the lookup and only stop once the backend has
     actually told us it is unavailable (configured:false / ok:false). Gating on
     a getField roundtrip first was the CO bug — getField takes seconds on Apps
     Script, so every early keystroke was skipped and the list looked dead. */
  const [placesOff, setPlacesOff] = useState(false);
  const [placeSuggests, setPlaceSuggests] = useState<DestSuggest[]>([]);
  const [searching, setSearching] = useState(false);
  const tokenRef = useRef<string | null>(null);
  const seqRef = useRef(0);


  const ensureToken = useCallback(() => {
    if (!tokenRef.current) {
      tokenRef.current =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : String(Math.random()).slice(2) + Date.now();
    }
    return tokenRef.current;
  }, []);

  const dropLookup = useCallback(() => {
    tokenRef.current = null;
    seqRef.current += 1;
    setPlaceSuggests([]);
    setSearching(false);
  }, []);

  /* placesOff is NOT a permanent latch: a stale configured:false must not kill
     the feature for the rest of the session. Reset on open and pill switch. */
  useEffect(() => {
    setPlacesOff(false);
  }, [mode]);

  /* Discard any live session token when the sheet unmounts. */
  useEffect(() => () => { tokenRef.current = null; }, []);





  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${SCRIPT_URL}?action=getStopSuggest`);
        const json = (await res.json()) as { vendors?: DestSuggest[]; frequent?: DestSuggest[] };
        if (cancelled) return;
        setVendors(json.vendors ?? []);
        setFrequent(json.frequent ?? []);
      } catch { /* suggestions are optional */ }
    })();
    return () => { cancelled = true; };
  }, []);

  /* Client roster comes from getField.clientAddresses (name -> address). */
  useEffect(() => {
    if (mode !== "client" || clients.length) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${SCRIPT_URL}?action=getField`);
        const json = (await res.json()) as { clientAddresses?: Record<string, string> };
        if (cancelled) return;
        setClients(
          Object.entries(json.clientAddresses ?? {}).map(([label, address]) => ({
            label,
            address: address || "",
          })),
        );
      } catch { /* roster is optional */ }
    })();
    return () => { cancelled = true; };
  }, [mode, clients.length]);

  const deferredQuery = useDeferredValue(query);
  const q = deferredQuery.trim().toLowerCase();

  const pool = useMemo<DestSuggest[]>(() => {
    const raw =
      mode === "client" ? clients : mode === "vendor" ? [...frequent, ...vendors] : [];
    const seen = new Set<string>();
    const out: DestSuggest[] = [];
    for (const d of raw) {
      const k = `${d.label}|${d.address}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(d);
    }
    return out;
  }, [mode, clients, frequent, vendors]);

  const matches = useMemo(() => {
    const filtered = q
      ? pool.filter(
          (d) => d.label.toLowerCase().includes(q) || d.address.toLowerCase().includes(q),
        )
      : pool;
    return filtered.slice(0, 50);
  }, [pool, q]);

  /* Network debounce (450ms) for placesAutocomplete — separate from, and in
     addition to, the render-level useDeferredValue above. Under 3 chars the
     backend refuses anyway, so we never spend the round trip.
     HONESTY (8/3): an Apps Script POST costs ~1.4s no matter what it does;
     Places adds only 200-400ms. So we debounce longer and SAY we're searching
     rather than looking frozen. Typing is never blocked. */
  useEffect(() => {
    if (mode !== "other" || placesOff || picked) return;
    const text = query.trim();
    if (text.length < 3) {
      dropLookup();
      setSearching(false);
      return;
    }
    const token = ensureToken();
    const seq = ++seqRef.current;
    const t = setTimeout(() => {
      setSearching(true);
      void (async () => {
        try {
          const res = await fetch(SCRIPT_URL, {
            method: "POST",
            headers: { "Content-Type": "text/plain" },
            body: JSON.stringify({
              action: "placesAutocomplete",
              input: text,
              sessionToken: token,
            }),
          });
          const json = (await res.json()) as Record<string, unknown>;
          if (seq !== seqRef.current) return; // stale response
          if (json["configured"] === false) {
            /* ONLY an explicit configured:false disables lookups. Never a
               network error, non-JSON body, or ok:false — Apps Script
               intermittently answers a POST with an unrelated payload. */
            setPlacesOff(true);
            setPlaceSuggests([]);
            return;
          }
          setPlaceSuggests(parsePlaces(json));
        } catch {
          if (seq === seqRef.current) setPlaceSuggests([]);
        } finally {
          if (seq === seqRef.current) setSearching(false);
        }
      })();
    }, 450);
    return () => clearTimeout(t);
  }, [mode, placesOff, picked, query, ensureToken, dropLookup]);




  const onPick = useCallback(
    (d: DestSuggest) => {
      /* `query` is the single source of truth for the input — a pick must
         write it, or the next keystroke appends to a stale value and every
         later lookup searches garbage. */
      setQuery(d.label);
      if (!d.placeId) {
        setPicked(d);
        return;
      }
      const token = ensureToken();
      const placeId = d.placeId;
      setPicked({ label: d.label, address: d.address });
      setPlaceSuggests([]);
      setSearching(false);
      void (async () => {
        try {
          const res = await fetch(SCRIPT_URL, {
            method: "POST",
            headers: { "Content-Type": "text/plain" },
            body: JSON.stringify({ action: "placesDetails", placeId, sessionToken: token }),
          });
          const j = (await res.json()) as { name?: string; address?: string };
          const name = typeof j.name === "string" ? j.name : "";
          const address = typeof j.address === "string" ? j.address : "";
          if (name || address) {
            setPicked({ label: name || d.label, address: address || d.address });
            if (name) setQuery(name);
          }



        } catch { /* typed text / suggestion text stands */ }
        finally {
          // Session ends with placesDetails — next lookup mints a fresh token.
          tokenRef.current = null;
        }
      })();
    },
    [ensureToken],
  );


  const confirm = async () => {
    const title = (picked?.label ?? query).trim();
    if (!title || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const address = picked?.address ?? (mode === "other" ? query.trim() : "");
      const res = await fetch(SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({
          action: "addStop",
          title,
          address,
          insertAt,
          saveFrequent: mode === "client" ? false : saveFrequent,
          /* CC (8/2): retargeting the destination is explicit — only the
             CHANGE COURSE button (active line) ever sends this. */
          changeCourse: activeLine,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || json.ok === false) {
        setErr(json.error ?? "Add stop failed — retry.");
        return;
      }
      /* EE (8/2): confirming also launches navigation — but ONLY on the leg the
         crew is actually driving right now. */
      if (activeLine) {
        const dest = address.trim() || title;
        window.open(
          "https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=" +
            encodeURIComponent(dest),
          "_blank",
          "noopener,noreferrer",
        );
      }
      onAdded();
    } catch {
      setErr("Add stop failed — retry.");
    } finally {
      setBusy(false);
    }
  };


  const chip: React.CSSProperties = {
    background: "transparent",
    color: LIME,
    border: `1px solid ${LIME_DIM}`,
    borderRadius: 999,
    padding: "6px 10px",
    fontFamily: "inherit",
    fontSize: 12,
    cursor: "pointer",
    maxWidth: "100%",
    textAlign: "left",
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.8)",
        zIndex: 300,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: BG,
          borderTop: "1px solid #2a2a2a",
          borderRadius: "12px 12px 0 0",
          width: "100%",
          maxWidth: 560,
          padding: "16px 14px calc(20px + env(safe-area-inset-bottom, 0px))",
          fontFamily: "'Courier New', Courier, monospace",
          color: "#e8e8e8",
        }}
      >
        <div style={{ color: LIME, fontSize: 13, letterSpacing: 2, fontWeight: "bold" }}>
          {activeLine ? "ADD STOP — CHANGE COURSE" : "ADD STOP"}
        </div>
        <div style={{ color: DIM_TEXT, fontSize: 11, marginTop: 4 }}>
          {activeLine
            ? "You're driving this leg right now — the new stop becomes your next destination."
            : "Inserted into today's route right where you tapped."}
        </div>

        <div style={{ fontSize: 10, letterSpacing: 1, color: "#8f8f8f", margin: "14px 0 6px" }}>
          STOP TYPE
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {(["vendor", "client", "other"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                dropLookup();
                setPicked(null);
                setQuery("");
                if (m === "client") setSaveFrequent(false);
              }}
              style={{
                ...chip,
                flex: 1,
                textAlign: "center",
                minHeight: 40,
                letterSpacing: 1,
                fontWeight: "bold",
                background: mode === m ? LIME : "transparent",
                color: mode === m ? BG : LIME,
                border: `1px solid ${mode === m ? LIME : LIME_DIM}`,
              }}
            >
              {m.toUpperCase()}
            </button>
          ))}
        </div>

        {mode && (
          <>
        <div style={{ fontSize: 10, letterSpacing: 1, color: "#8f8f8f", margin: "14px 0 4px" }}>
          {mode === "other" ? "ADDRESS" : "DESTINATION"}
        </div>

        <input
          autoFocus
          value={query}
          onChange={(e) => {
            setPicked(null);
            setQuery(e.target.value);
            if (mode === "other" && !e.target.value.trim()) dropLookup();
          }}
          placeholder={
            mode === "vendor"
              ? "Search vendors…"
              : mode === "client"
                ? "Search clients…"
                : "Type the full address…"
          }

          style={{
            width: "100%",
            boxSizing: "border-box",
            background: BG,
            color: "#e8e8e8",
            border: `1px solid ${picked ? LIME : "#2a2a2a"}`,
            borderRadius: 6,
            padding: "10px 10px",
            fontFamily: "inherit",
            fontSize: 14,
          }}
        />

        {mode === "other" && !picked && searching && placeSuggests.length === 0 && (
          <div style={{ marginTop: 8, color: "#8f8f8f", fontSize: 11 }}>searching…</div>
        )}

        {!picked && (mode === "other" ? placeSuggests : matches).length > 0 && (
          <div
            style={{
              marginTop: 6,
              border: "1px solid #2a2a2a",
              borderRadius: 6,
              overflow: "hidden",
              maxHeight: 260,
              overflowY: "auto",
              WebkitOverflowScrolling: "touch",
            }}
          >
            {(mode === "other" ? placeSuggests : matches).map((d) => (
              <SuggestRow
                key={d.placeId ?? `${d.label}|${d.address}`}
                dest={d}
                onPick={onPick}
              />
            ))}
          </div>
        )}


        {mode === "vendor" && !picked && !q && frequent.length > 0 && (
          <>
            <div style={{ fontSize: 10, letterSpacing: 1, color: "#8f8f8f", margin: "12px 0 6px" }}>
              FREQUENTED
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {frequent.slice(0, 8).map((d, i) => (
                <button key={`f-${i}`} type="button" style={chip} onClick={() => setPicked(d)}>
                  {d.label}
                </button>
              ))}
            </div>
          </>
        )}

        {picked?.address && (
          <div style={{ color: "#8f8f8f", fontSize: 11, marginTop: 8 }}>{picked.address}</div>
        )}
          </>
        )}

        {(mode === "vendor" || mode === "other") && (
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginTop: 14,
              color: "#8f8f8f",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={saveFrequent}
              onChange={(e) => setSaveFrequent(e.target.checked)}
            />
            Add to Frequented Destinations
          </label>
        )}


        {err && <div style={{ color: "#ff5555", fontSize: 12, marginTop: 8 }}>{err}</div>}

        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button
            type="button"
            onClick={() => void confirm()}
            disabled={busy || !mode || !(picked?.label ?? query).trim()}
            style={{
              flex: 1,
              minHeight: 48,
              background: LIME,
              color: BG,
              border: "none",
              borderRadius: 6,
              fontFamily: "inherit",
              fontSize: 13,
              letterSpacing: 2,
              fontWeight: "bold",
              cursor: "pointer",
              opacity: busy || !mode || !(picked?.label ?? query).trim() ? 0.5 : 1,
            }}
          >
            {busy
              ? "ADDING…"
              : activeLine
                ? "CONFIRM ADD STOP & NAVIGATE"
                : "CONFIRM ADD STOP"}

          </button>
          <button
            type="button"
            onClick={onClose}
            style={{
              minHeight: 48,
              background: "transparent",
              color: LIME,
              border: `1px solid ${LIME_DIM}`,
              borderRadius: 6,
              padding: "0 14px",
              fontFamily: "inherit",
              fontSize: 13,
              letterSpacing: 2,
              fontWeight: "bold",
              cursor: "pointer",
            }}
          >
            CANCEL
          </button>
        </div>
      </div>
    </div>
  );
}
