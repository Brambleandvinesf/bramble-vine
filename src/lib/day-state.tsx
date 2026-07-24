import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
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
};

type Ctx = { state: DayState | null; serverOffsetMs: number; refresh: () => void };
const DayStateCtx = createContext<Ctx>({ state: null, serverOffsetMs: 0, refresh: () => {} });

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

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch(`${SCRIPT_URL}?action=getDayState`);
        if (!res.ok) return;
        const json = (await res.json()) as DayState;
        if (cancelled) return;
        // eslint-disable-next-line no-console
        console.log("[dayState]", json);
        if (!json || !json.phase || !json.subSteps) return;
        sessionCache.set(CK, json);
        setState(json);
        if (json.serverNow) {
          const sn = Date.parse(json.serverNow);
          if (!isNaN(sn)) setServerOffsetMs(sn - Date.now());
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

  return (
    <DayStateCtx.Provider value={{ state, serverOffsetMs, refresh: () => setNonce((n) => n + 1) }}>
      {children}
    </DayStateCtx.Provider>
  );
}

export function useDayState(): DayState | null {
  return useContext(DayStateCtx).state;
}

export function useServerOffsetMs(): number {
  return useContext(DayStateCtx).serverOffsetMs;
}
