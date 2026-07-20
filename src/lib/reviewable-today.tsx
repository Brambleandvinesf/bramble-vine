import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { sessionCache } from "./session-cache";

/**
 * reviewableToday: does today have any project that needs review /
 * loading action? Computed from getConfirm's `projects` payload.
 *
 * Rule: a project counts if
 *   - Type === "SPECIAL", OR
 *   - Type is "RECURRING" or blank AND it has at least one item.
 * Items on getConfirm are already server-nested per project (composite
 * Client Name + Project ID match), so a non-empty items array satisfies
 * the composite rule.
 */

const SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbwZlJn9jKzzYfcFglDmVGV3l-FTYib0D3mNdILivsB1477aMym68NViDCwia26_JH4siQ/exec";

const CK = "reviewable:getConfirm";
const POLL_MS = 60_000;

type ConfirmProject = {
  Type?: unknown;
  type?: unknown;
  items?: unknown;
};
type GetConfirmPayload = {
  projects?: ConfirmProject[];
};

export function computeReviewable(payload: GetConfirmPayload | null | undefined): boolean {
  const projects = payload?.projects ?? [];
  for (const p of projects) {
    const type = String((p.Type ?? p.type ?? "")).trim().toUpperCase();
    const items = Array.isArray(p.items) ? p.items : [];
    if (type === "SPECIAL") return true;
    if ((type === "RECURRING" || type === "") && items.length > 0) return true;
  }
  return false;
}

type Ctx = { reviewable: boolean | null };
const ReviewableCtx = createContext<Ctx>({ reviewable: null });

export function ReviewableTodayProvider({ children }: { children: ReactNode }) {
  const cached = sessionCache.get<GetConfirmPayload>(CK);
  const [reviewable, setReviewable] = useState<boolean | null>(() =>
    cached ? computeReviewable(cached) : null,
  );

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch(`${SCRIPT_URL}?action=getConfirm`);
        if (!res.ok) return;
        const json = (await res.json()) as GetConfirmPayload;
        if (cancelled) return;
        sessionCache.set(CK, json);
        setReviewable(computeReviewable(json));
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
  }, []);

  return (
    <ReviewableCtx.Provider value={{ reviewable }}>{children}</ReviewableCtx.Provider>
  );
}

export function useReviewableToday(): boolean | null {
  return useContext(ReviewableCtx).reviewable;
}
