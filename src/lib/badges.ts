/**
 * Shared, session-scoped badge counts consumed by the bottom bar,
 * MessagesFab, and Home tiles. Values are kept in sessionCache under
 * stable keys and any listener re-renders on change.
 *
 * The Messages screen publishes its own live `badgeCount` here so every
 * surface shows an identical number. A background poller (mounted in
 * AppFrame) refreshes counts every ~60s while the user is signed in.
 */
import { useEffect, useState } from "react";
import { sessionCache } from "./session-cache";
import { SCRIPT_URL } from "../routes/confirm";

export const BK = {
  inbox: "home:getInbox:count",
  receipts: "home:getReceipts:count",
  visits: "home:getQueue:count",
  /* CC-45 Item 47: the Invoice Queue's own count. It rides the SAME badgeCounts
     request as every other badge — asking for `visits` now returns both numbers — so
     a second nav badge costs no extra fetch. `visits` became confirmations-only in
     v7.4.108, so the two cannot double-count each other. */
  invoices: "home:getQueue:invoices:count",
  approvals: "home:approvalQueue:count",
  debriefq: "home:debriefQueue:count",
} as const;


const EVT = "bv:badges";

export function getBadge(key: string): number | null {
  const v = sessionCache.get<number>(key);
  return typeof v === "number" ? v : null;
}

export function setBadge(key: string, val: number | null): void {
  if (val === null || val === undefined) sessionCache.clear(key);
  else sessionCache.set(key, val);
  try {
    window.dispatchEvent(new CustomEvent(EVT));
  } catch {
    /* ignore */
  }
}

export function useBadge(key: string): number | null {
  const [v, setV] = useState<number | null>(() => getBadge(key));
  useEffect(() => {
    const on = () => setV(getBadge(key));
    window.addEventListener(EVT, on);
    return () => window.removeEventListener(EVT, on);
  }, [key]);
  return v;
}

type PollOpts = {
  email: string | null;
  canMessages: boolean;
  canReceipts: boolean;
  canVisits?: boolean;
  /** Approval Queue + Debrief Queue — the route_queues capability (XX-05). */
  canApprovals?: boolean;
};


/** Steady-state badge refresh. */
const POLL_MS = 60_000;
/**
 * How soon to re-poll while the server still owes us counts.
 *
 * badgeCounts computes at most ONE uncached count per request, so it can never
 * be the slow call that delays the day-state spine (XX-04). The counts it
 * deferred come back named in `pending`, and this is how fast we come back for
 * them — a few seconds each rather than a full 60s cycle, so a cold first load
 * fills every badge in seconds instead of minutes.
 */
const PENDING_RETRY_MS = 4_000;

/**
 * Refresh every badge this role can see in ONE request (XX-04), every ~60s while
 * signed in — faster while the server still owes us counts. The counts are
 * computed server-side by the same helpers the individual screens use, so a
 * badge cannot disagree with the screen it points at — that disagreement was a
 * real bug once (CC-11, 30 vs 1).
 */
export function useBadgePoller({
  email,
  canMessages,
  canReceipts,
  canVisits,
  canApprovals,
}: PollOpts): void {

  useEffect(() => {
    if (!email) return;
    let cancelled = false;

    /**
     * ONE REQUEST PER GROUP, SEQUENTIALLY — and that is deliberate, not sprawl.
     * badgeCounts computes at most one uncached count per request (BC_MAX_COLD=1)
     * and, measured live on 8/21, a combined `want=messages,visits,receipts,queues`
     * request returned only the already-cached groups and reported the rest
     * `pending` FOREVER — four repeats in a row produced byte-identical responses,
     * so the deferred counts never arrived and those badges never appeared.
     * Asking for one group at a time makes each group the single cold compute it
     * is allowed, and every group answers. Sequential, so we do not trade this for
     * the concurrency serialisation XX-04 measured.
     */
    const tick = async (): Promise<boolean> => {
      const want: string[] = [];
      if (canMessages) want.push("messages");
      if (canVisits) want.push("visits");
      if (canReceipts) want.push("receipts");
      if (canApprovals) want.push("queues");
      if (!want.length) return false;
      const e = (email ?? "").trim().toLowerCase();
      let stillPending = false;
      for (const group of want) {
        if (cancelled) return false;
        try {
          const r = await fetch(
            `${SCRIPT_URL}?action=badgeCounts&email=${encodeURIComponent(e)}` +
              `&want=${encodeURIComponent(group)}&days=30`,
          );
          const j = (await r.json()) as {
            counts?: Partial<
              Record<
                "inbox" | "visits" | "invoices" | "receipts" | "approvals" | "debriefq",
                number
              >
            >;
            pending?: string[];
          };
          if (cancelled) return false;
          const c = j.counts ?? {};
          /* A key the server did not send is "no answer yet", NOT zero — keep the
             last known value. Writing 0 here would flash a wrong count on every
             deferred badge, which is worse than showing a slightly stale one. */
          const set = (key: string, v: number | undefined) => {
            if (typeof v === "number") setBadge(key, v);
          };
          set(BK.inbox, c.inbox);
          set(BK.visits, c.visits);
          set(BK.invoices, c.invoices);      // CC-45 Item 47
          set(BK.receipts, c.receipts);
          set(BK.approvals, c.approvals);
          set(BK.debriefq, c.debriefq);
          if (Array.isArray(j.pending) && j.pending.length > 0) stillPending = true;
        } catch {
          /* keep last values */
        }
      }
      return stillPending;
    };


    /* Self-scheduling timeout rather than a fixed interval, so the delay can
       depend on whether counts are still outstanding. */
    let timer: number | undefined;
    const run = async () => {
      const stillPending = await tick();
      if (cancelled) return;
      timer = window.setTimeout(run, stillPending ? PENDING_RETRY_MS : POLL_MS);
    };
    void run();
    const onVis = () => {
      if (document.visibilityState === "visible") void tick();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [email, canMessages, canReceipts, canVisits, canApprovals]);
}
