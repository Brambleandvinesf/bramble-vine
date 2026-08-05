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
import { countPendingDesignation } from "./receipt-line";

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
        const r = await fetch(`${SCRIPT_URL}?action=getInbox&email=${encodeURIComponent(e)}`);
        const j = (await r.json()) as { inbox?: Array<{ awaiting?: boolean }> };
        const n = (j.inbox ?? []).filter((i) => !!i.awaiting).length;
        if (!cancelled) setBadge(BK.inbox, n);
      } catch {
        /* keep last value */
      }
    };

    const countVisits = async () => {
      try {
        const r = await fetch(`${SCRIPT_URL}?action=getQueue`);
        const j = (await r.json()) as {
          queue?: Array<{ status?: string; Status?: string }>;
        };
        const n = (j.queue ?? []).filter((row) => {
          const s = String(row.status ?? row.Status ?? "").trim().toLowerCase();
          return s === "" || s === "pending";
        }).length;
        if (!cancelled) setBadge(BK.visits, n);
      } catch {
        /* keep last value */
      }
    };

    const countReceipts = async () => {
      try {
        const r = await fetch(`${SCRIPT_URL}?action=getReceipts`);
        const j = (await r.json()) as { lines?: Array<Record<string, unknown>> };
        /* CC-11: this used to re-read the sheet headers itself and asked for
           "Final designation" — lowercase d, a key that does not exist. The
           designation half of the filter therefore never matched, so the badge
           counted every un-invoiced line: 30 against the Designate tab's real 1.
           It now runs the SAME normLine + predicate that screen does, so the two
           numbers cannot disagree again. */
        const n = countPendingDesignation(j.lines ?? []);
        if (!cancelled) setBadge(BK.receipts, n);
      } catch {
        /* keep last value */
      }
    };

    const countApprovals = async () => {
      try {
        const r = await fetch(`${SCRIPT_URL}?action=approvalQueue&days=30`);
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
        const r = await fetch(`${SCRIPT_URL}?action=debriefQueue`);
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
