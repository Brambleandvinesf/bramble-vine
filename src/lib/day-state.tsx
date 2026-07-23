import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { sessionCache } from "./session-cache";

const SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbwZlJn9jKzzYfcFglDmVGV3l-FTYib0D3mNdILivsB1477aMym68NViDCwia26_JH4siQ/exec";

const CK = "dayState:getState";
const POLL_MS = 30_000;

export type DayPhase = "HQ_LOADING" | "FIELD_VISIT" | "HQ_UNLOADING";
export type DayState = {
  ok?: boolean;
  phase: DayPhase;
  subStep: string;
  stopIndex?: number;
  client?: string | null;
  lineState?: string;
  caption?: string;
  flags?: Record<string, boolean>;
  phaseOrder: DayPhase[];
  subSteps: Record<DayPhase, string[]>;
};

type Ctx = { state: DayState | null; refresh: () => void };
const DayStateCtx = createContext<Ctx>({ state: null, refresh: () => {} });

export function DayStateProvider({
  enabled,
  children,
}: {
  enabled: boolean;
  children: ReactNode;
}) {
  const cached = sessionCache.get<DayState>(CK);
  const [state, setState] = useState<DayState | null>(cached ?? null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch(`${SCRIPT_URL}?action=getState`);
        if (!res.ok) return;
        const json = (await res.json()) as DayState;
        if (cancelled) return;
        if (!json || !json.phase || !json.subSteps) return;
        sessionCache.set(CK, json);
        setState(json);
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
    <DayStateCtx.Provider value={{ state, refresh: () => setNonce((n) => n + 1) }}>
      {children}
    </DayStateCtx.Provider>
  );
}

export function useDayState(): DayState | null {
  return useContext(DayStateCtx).state;
}
