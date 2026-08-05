import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { sessionCache } from "./session-cache";

const SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbwZlJn9jKzzYfcFglDmVGV3l-FTYib0D3mNdILivsB1477aMym68NViDCwia26_JH4siQ/exec";

const CK = "dayState:getState";
const POLL_MS = 30_000;
/* XX-04: how fast to retry while there is STILL NO day state at all.
 * The spine is unusable until the first answer lands, and getDayState can be
 * queued behind the rest of a cold page load (Apps Script serialises past ~4-5
 * concurrent calls per user). At the old flat 30s, one lost first tick meant 30
 * seconds of "day state loading…" and two meant a minute — the reported bug.
 * Only applies before the first success; steady-state polling stays POLL_MS. */
const FIRST_LOAD_RETRY_MS = 5_000;

export type DayPhase = "HQ_LOADING" | "FIELD_VISIT" | "HQ_UNLOADING";
export type FieldPhone = { id: string; name: string } | null;
/** One real calendar stop — the spine draws one anchor per entry (B, 8/2). */
export type DayStop = { label: string; type: "client" | "vendor" | "break" };
export type BreakItem = { time: string; label: string };
export type DayState = {
  ok?: boolean;
  phase: DayPhase;
  subStep: string;
  stopIndex?: number;
  /** Today's route, one entry per real stop; null when the calendar read failed. */
  stops?: DayStop[] | null;
  client?: string | null;
  lineState?: string;
  caption?: string;
  flags?: Record<string, boolean>;
  /** Size of today's roster (EMPLOYEE_TEAMS); 1 = solo day. */
  crewCount?: number | null;
  fieldPhone?: FieldPhone;
  phaseOrder: DayPhase[];
  subSteps: Record<DayPhase, string[]>;
  serverNow?: string;
  departAt?: string | null;
  travelMin?: number;
  breaks?: BreakItem[];
  /** Current client has already been texted today; suppress further texts. */
  skipSameDayTexts?: boolean;
};

/**
 * Sub-step the UI should show, when that differs from the last poll.
 *
 * `advance` is for the moment a confirm POST returns ok: the spine and captions
 * move at once instead of sitting up to a poll cycle behind the tap. `hold` is
 * the mirror case - a gate whose overlay is still open must not let the caption
 * run ahead of what has actually been confirmed.
 *
 * Either way the poll remains the authority: the override is dropped as soon as
 * the payload agrees, and abandoned after the TTL if it never does, so a failed
 * write cannot leave the UI permanently ahead of the server.
 */
type SubStepOverride = { subStep: string; at: number; kind: "advance" | "hold" };

/** Long enough for a Sheets write to become readable, short enough to notice. */
const OVERRIDE_TTL_MS = 90_000;

/**
 * Captions for the sub-steps this override mechanism can name. Only used while
 * an override is in force; every other caption still comes from the backend.
 */
const CAPTION_FOR: Record<string, string> = {
  team_assign: "Awaiting Team Assignments",
  dailyload_confirm: "Waiting for Daily Load Confirmation",
  special_confirm: "Waiting for Special Loading",
  loading: "Loading Vehicle",
};

type Ctx = {
  state: DayState | null;
  serverOffsetMs: number;
  refresh: () => void;
  /** Show `subStep` now; a confirm POST just succeeded. */
  advanceSubStep: (subStep: string) => void;
  /** Pin the display at `subStep` until released; a gate is still pending. */
  holdSubStep: (subStep: string) => void;
  /** Drop any override and let the poll speak for itself. */
  releaseSubStep: () => void;
};
const DayStateCtx = createContext<Ctx>({
  state: null,
  serverOffsetMs: 0,
  refresh: () => {},
  advanceSubStep: () => {},
  holdSubStep: () => {},
  releaseSubStep: () => {},
});

export function DayStateProvider({
  enabled,
  children,
}: {
  enabled: boolean;
  children: ReactNode;
}) {
  const cached = sessionCache.get<DayState>(CK);
  const [state, setState] = useState<DayState | null>(cached ?? null);
  const [serverOffsetMs, setServerOffsetMs] = useState(0);
  const [nonce, setNonce] = useState(0);
  const [override, setOverride] = useState<SubStepOverride | null>(null);
  const sigRef = useRef<string>("");
  /* XX-04: do we have ANY day state yet? Drives the retry cadence only.
     Seeded from the session cache, so a warm in-tab navigation does not spend a
     fast retry it does not need. Deliberately separate from sigRef, which exists
     to suppress no-op re-renders and would conflate two questions. */
  const haveStateRef = useRef<boolean>(!!cached);
  const overrideRef = useRef<SubStepOverride | null>(null);
  useEffect(() => {
    overrideRef.current = override;
  }, [override]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch(`${SCRIPT_URL}?action=getDayState`);
        if (!res.ok) return;
        const json = (await res.json()) as DayState;
        if (cancelled) return;
        if (!json || !json.phase || !json.subSteps) return;
        /* XX-04: a usable answer arrived — stop retrying fast. Set HERE rather
           than inside the change-signature check below, because a payload
           identical to the cached one is still a successful answer. */
        haveStateRef.current = true;

        // serverNow ticks on every poll, so it is excluded from the change
        // signature; including it would make every poll look like a change and
        // re-render every consumer (field and schedule are the expensive ones).
        const { serverNow, ...rest } = json;
        const sig = JSON.stringify(rest);
        // Reconcile the override against this payload. An advance is satisfied
        // the moment the server reports the same sub-step. A hold is satisfied
        // once the server has moved PAST the held step, which is what confirming
        // the gate causes. Either is abandoned after the TTL, so a write that
        // never landed cannot pin the UI forever.
        const ov = overrideRef.current;
        if (ov) {
          const order = json.subSteps?.[json.phase] || [];
          const iSrv = order.indexOf(json.subStep);
          const iOv = order.indexOf(ov.subStep);
          const satisfied =
            ov.kind === "advance"
              ? json.subStep === ov.subStep || (iSrv >= 0 && iOv >= 0 && iSrv > iOv)
              : iSrv >= 0 && iOv >= 0 && iSrv > iOv;
          if (satisfied || Date.now() - ov.at > OVERRIDE_TTL_MS) {
            overrideRef.current = null;
            setOverride(null);
          }
        }

        if (sig !== sigRef.current) {
          sigRef.current = sig;
          sessionCache.set(CK, json);
          setState(json);
          if (import.meta.env.DEV) {
            // eslint-disable-next-line no-console
            console.log("[dayState]", json);
          }
        }

        if (serverNow) {
          const sn = Date.parse(serverNow);
          if (!isNaN(sn)) {
            const next = sn - Date.now();
            // Sub-second drift is noise; re-rendering for it is not worth it.
            setServerOffsetMs((prev) => (Math.abs(next - prev) > 1000 ? next : prev));
          }
        }
      } catch {
        /* keep last known */
      }
    };
    /* XX-04: retry FAST until we have a first answer, then settle to POLL_MS.
     *
     * The spine renders "day state loading…" while state is null, and this used
     * to be a flat 30s setInterval. On a cold load sessionCache is empty (it is
     * in-memory), so the very first tick is the only thing standing between the
     * crew and a usable spine — and every failure path in tick() silently
     * returns, so a lost first tick meant 30 more seconds of "loading", and two
     * meant a full minute. That is the reported symptom.
     *
     * A self-scheduling timeout rather than an interval, so the delay can differ
     * before and after the first success. Steady-state cost is unchanged: once
     * state exists it is POLL_MS exactly as before. */
    let timer: number | undefined;
    const schedule = () => {
      const delay = haveStateRef.current ? POLL_MS : FIRST_LOAD_RETRY_MS;
      timer = window.setTimeout(run, delay);
    };
    const run = async () => {
      await tick();
      if (cancelled) return;
      schedule();
    };
    void run();
    const onVis = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [enabled, nonce]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  const advanceSubStep = useCallback((subStep: string) => {
    setOverride({ subStep, at: Date.now(), kind: "advance" });
    // Pull the real state in sooner than the next tick so the override is
    // short-lived when the write was fast.
    setNonce((n) => n + 1);
  }, []);
  const holdSubStep = useCallback((subStep: string) => {
    setOverride((prev) =>
      prev && prev.kind === "hold" && prev.subStep === subStep
        ? prev
        : { subStep, at: Date.now(), kind: "hold" },
    );
  }, []);
  const releaseSubStep = useCallback(() => setOverride(null), []);

  // What consumers see. The override only rewrites subStep; caption comes from
  // the sub-step so a held gate does not read as advanced, and everything else
  // (phase, client, departAt) stays exactly as polled.
  const effective = useMemo<DayState | null>(() => {
    if (!state) return null;
    if (!override || override.subStep === state.subStep) return state;
    const known = state.subSteps?.[state.phase] || [];
    // Only override within the current phase's sub-steps; a stale override from
    // a previous phase must not invent a step this phase does not have.
    if (known.length && !known.includes(override.subStep)) return state;
    return {
      ...state,
      subStep: override.subStep,
      caption: CAPTION_FOR[override.subStep] ?? state.caption,
    };
  }, [state, override]);

  // Memoised so provider re-renders alone cannot re-render every consumer.
  const value = useMemo<Ctx>(
    () => ({
      state: effective,
      serverOffsetMs,
      refresh,
      advanceSubStep,
      holdSubStep,
      releaseSubStep,
    }),
    [effective, serverOffsetMs, refresh, advanceSubStep, holdSubStep, releaseSubStep],
  );

  return <DayStateCtx.Provider value={value}>{children}</DayStateCtx.Provider>;
}

export function useDayState(): DayState | null {
  return useContext(DayStateCtx).state;
}

/**
 * Screen that owns each HQ_LOADING sub-step. Role landings and the field
 * screen's HQ gates use this so "where should I be right now" has exactly one
 * answer, derived from the polled day state instead of a hard-coded route.
 */
export function hqScreenFor(subStep: string): "/schedule" | "/confirm" | "/loading" {
  if (subStep === "special_confirm") return "/confirm";
  if (subStep === "loading") return "/loading";
  return "/schedule"; // team_assign, dailyload_confirm
}

/** Ask the provider for a fresh getDayState immediately (e.g. after addStop). */
export function useDayStateRefresh(): () => void {
  return useContext(DayStateCtx).refresh;
}

export function useServerOffsetMs(): number {
  return useContext(DayStateCtx).serverOffsetMs;
}

/**
 * Move the day state on the instant a confirm POST succeeds, or pin it while a
 * gate is still pending. The poll reconciles either way - see SubStepOverride.
 */
export function useSubStepOverride(): Pick<
  Ctx,
  "advanceSubStep" | "holdSubStep" | "releaseSubStep"
> {
  const { advanceSubStep, holdSubStep, releaseSubStep } = useContext(DayStateCtx);
  return { advanceSubStep, holdSubStep, releaseSubStep };
}
