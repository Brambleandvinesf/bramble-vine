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
  /** lead/management only — the approvals + debrief-queue routes are gated. */
  canApprovals?: boolean;
};


/**
 * Poll inbox + receipts counts every ~60s while the user is signed in.
 * Inbox count uses the same rule as the Messages screen's own badge:
 * items where `awaiting` is true.
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

    // These three counts are independent, but used to be awaited in sequence, so
    // a role with all three paid three Apps Script round trips end to end - the
    // slowest thing on first paint. They now run together. Each keeps its own
    // try/catch, which also means one failure cannot cancel the others the way a
    // bare Promise.all would.
    const countInbox = async () => {
      const e = email.trim().toLowerCase();
      try {
        /* item 11: was getInbox, which shipped ~348KB so this could count
           awaiting threads — on every page load and every tab focus. The
           backend returns the integer now, from the same feed builder the
           Messages screen uses. */
        const r = await fetch(`${SCRIPT_URL}?action=inboxCount&email=${encodeURIComponent(e)}`);
        const j = (await r.json()) as { count?: number };
        if (!cancelled && typeof j.count === "number") setBadge(BK.inbox, j.count);
      } catch {
        /* keep last value */
      }
    };

    const countVisits = async () => {
      try {
        /* item 11: was getQueue (20KB, 3.3s). queueRows_ already computed
           "pending" server-side and this kept a second copy of the same rule —
           the count now comes from the backend's mqPending_, so there is one
           definition instead of two. */
        const r = await fetch(`${SCRIPT_URL}?action=getQueue&countOnly=1`);
        const j = (await r.json()) as { count?: number };
        if (!cancelled && typeof j.count === "number") setBadge(BK.visits, j.count);
      } catch {
        /* keep last value */
      }
    };

    const countReceipts = async () => {
      try {
        /* item 11: was getReceipts — 167KB and ~14s, the worst call in the app,
           fired on every page load and tab focus to produce one number.
           The backend counts it now (receiptsPendingCount_).
           CC-11 CAUTION: that backend predicate is the twin of
           isPendingDesignation in lib/receipt-line.ts, which the Designate
           screen still uses. They must agree — the 30-vs-1 bug was exactly this
           rule implemented twice. If you change one, change both. */
        const r = await fetch(`${SCRIPT_URL}?action=getReceipts&countOnly=1`);
        const j = (await r.json()) as { count?: number };
        if (!cancelled && typeof j.count === "number") setBadge(BK.receipts, j.count);
      } catch {
        /* keep last value */
      }
    };

    const countApprovals = async () => {
      try {
        const r = await fetch(`${SCRIPT_URL}?action=approvalQueue&countOnly=1&days=30`);
        const j = (await r.json()) as { unapprovedCount?: number };
        if (!cancelled && typeof j.unapprovedCount === "number") {
          setBadge(BK.approvals, j.unapprovedCount);
        }
      } catch {
        /* keep last value */
      }
    };

    /* readyCount, never count/upcomingCount: it exists precisely so a badge
       cannot count visits that have not happened yet as needing action. */
    const countDebriefQueue = async () => {
      try {
        const r = await fetch(`${SCRIPT_URL}?action=debriefQueue&countOnly=1`);
        const j = (await r.json()) as { readyCount?: number };
        if (!cancelled && typeof j.readyCount === "number") {
          setBadge(BK.debriefq, j.readyCount);
        }
      } catch {
        /* keep last value */
      }
    };

    const tick = async () => {
      const jobs: Array<Promise<void>> = [];
      if (canMessages) jobs.push(countInbox());
      if (canVisits) jobs.push(countVisits());
      if (canReceipts) jobs.push(countReceipts());
      if (canApprovals) jobs.push(countApprovals(), countDebriefQueue());
      await Promise.all(jobs);
    };


    void tick();
    const interval = window.setInterval(tick, 60_000);
    const onVis = () => {
      if (document.visibilityState === "visible") void tick();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [email, canMessages, canReceipts, canVisits, canApprovals]);
}
