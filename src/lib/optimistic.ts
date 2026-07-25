import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Durable optimistic decisions for poll-backed screens.
 *
 * Every screen here polls Apps Script, which reads Sheets. A write is not
 * necessarily visible to the next read, so a poll that races a write returns
 * pre-write state. Screens that drop their optimistic state whenever a poll
 * lands therefore resurrect rows the user already handled - the recurring
 * "handled messages and cards come back" bug.
 *
 * A decision recorded here survives polls until one of three things happens:
 *
 *   confirmed  the fresh payload agrees with it, so it is no longer needed
 *   reverted   the POST failed, so the caller drops it immediately
 *   abandoned  the payload still contradicts it after ttlMs, meaning the write
 *              probably never landed - the decision is dropped and returned to
 *              the caller so it can say so
 *
 * That last case is the point of the TTL: a choice that silently hides a row
 * forever is worse than one that comes back, because the work is then lost
 * without anybody knowing. Reappearing is acceptable *if* it is reported.
 *
 * Records are persisted per scope, so a reload or a re-mount does not
 * resurrect anything either.
 */
export type OptimisticRecord = {
  kind: string;
  id: string;
  /** Decided value. Defaults to true, which is all a hide/remove needs. */
  value?: boolean;
  /** Epoch ms the decision was made, for TTL. */
  at: number;
};

/** Long enough to cover Sheets propagation, short enough to notice a lost write. */
export const OPTIMISTIC_TTL_MS = 120_000;

const PREFIX = "bv-optimistic:";

function loadScope(scope: string): OptimisticRecord[] {
  try {
    const raw = localStorage.getItem(PREFIX + scope);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (r): r is OptimisticRecord =>
        !!r && typeof r.kind === "string" && typeof r.id === "string" && typeof r.at === "number",
    );
  } catch {
    return [];
  }
}

function saveScope(scope: string, recs: OptimisticRecord[]) {
  try {
    if (recs.length) localStorage.setItem(PREFIX + scope, JSON.stringify(recs));
    else localStorage.removeItem(PREFIX + scope);
  } catch {
    /* private mode or full quota: in-memory behaviour still holds for this tab */
  }
}

export type Optimistic = {
  /** Live records. Build screen-shaped views off this with useMemo. */
  records: OptimisticRecord[];
  /** Record a choice. Re-deciding the same kind+id restarts its TTL. */
  decide: (kind: string, id: string, value?: boolean) => void;
  /** Drop a choice - use when the POST came back not-ok. */
  revert: (kind: string, id: string) => void;
  /**
   * Called with each fresh payload. `confirmed` answers "does the server now
   * agree with this record?". Returns the records abandoned for being
   * contradicted past the TTL, so the caller can surface them.
   */
  reconcile: (confirmed: (r: OptimisticRecord) => boolean) => OptimisticRecord[];
};

export function useOptimistic(scope: string, ttlMs: number = OPTIMISTIC_TTL_MS): Optimistic {
  const [records, setRecords] = useState<OptimisticRecord[]>(() => loadScope(scope));

  // Mirrored so reconcile can be a pure synchronous read-modify-write. Doing
  // that work inside a setState updater would be wrong: updaters can run twice
  // (StrictMode) and run after the function has already returned.
  const ref = useRef(records);

  const commit = useCallback(
    (next: OptimisticRecord[]) => {
      ref.current = next;
      setRecords(next);
    },
    [],
  );

  // A new scope (different mailbox or signed-in user) has its own records.
  const scopeRef = useRef(scope);
  useEffect(() => {
    if (scopeRef.current === scope) return;
    scopeRef.current = scope;
    commit(loadScope(scope));
  }, [scope, commit]);

  useEffect(() => {
    saveScope(scope, records);
  }, [scope, records]);

  const decide = useCallback(
    (kind: string, id: string, value: boolean = true) => {
      const kept = ref.current.filter((r) => !(r.kind === kind && r.id === id));
      commit([...kept, { kind, id, value, at: Date.now() }]);
    },
    [commit],
  );

  const revert = useCallback(
    (kind: string, id: string) => {
      const next = ref.current.filter((r) => !(r.kind === kind && r.id === id));
      if (next.length !== ref.current.length) commit(next);
    },
    [commit],
  );

  const reconcile = useCallback(
    (confirmed: (r: OptimisticRecord) => boolean): OptimisticRecord[] => {
      const now = Date.now();
      const prev = ref.current;
      const keep: OptimisticRecord[] = [];
      const abandoned: OptimisticRecord[] = [];
      for (const r of prev) {
        if (confirmed(r)) continue; // server agrees; the record has done its job
        if (now - r.at > ttlMs) {
          abandoned.push(r);
          continue;
        }
        keep.push(r); // still in flight as far as we can tell
      }
      if (keep.length !== prev.length) commit(keep);
      return abandoned;
    },
    [ttlMs, commit],
  );

  return { records, decide, revert, reconcile };
}
