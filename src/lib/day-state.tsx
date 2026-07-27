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

export type DayPhase = "HQ_LOADING" | "FIELD_VISIT" | "HQ_UNLOADING";
export type FieldPhone = { id: string; name: string } | null;
export type BreakItem = { time: string; label: string };
export type DayState = {
  ok?: boolean;
  phase: DayPhase;
  subStep: string;
  stopIndex?: number;
  client?: string | null;
  lineState?: string;
  caption?: string;
  flags?: Record<string, boolean>;
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
    tick();
    const id = setInterval(tick, POLL_MS);
    const onVis = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      clearInterval(id);
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
