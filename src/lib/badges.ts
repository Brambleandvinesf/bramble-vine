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
};

/**
 * Poll inbox + receipts counts every ~60s while the user is signed in.
 * Inbox count uses the same rule as the Messages screen's own badge:
 * items where `awaiting` is true.
 */
export function useBadgePoller({ email, canMessages, canReceipts, canVisits }: PollOpts): void {
  useEffect(() => {
    if (!email) return;
    let cancelled = false;

    const tick = async () => {
      const e = email.trim().toLowerCase();
      if (canMessages) {
        try {
          const r = await fetch(`${SCRIPT_URL}?action=getInbox&email=${encodeURIComponent(e)}`);
          const j = (await r.json()) as { inbox?: Array<{ awaiting?: boolean }> };
          const n = (j.inbox ?? []).filter((i) => !!i.awaiting).length;
          if (!cancelled) setBadge(BK.inbox, n);
        } catch {
          /* keep last value */
        }
      }
      if (canVisits) {
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
      }
      if (canReceipts) {
        try {
          const r = await fetch(`${SCRIPT_URL}?action=getReceipts`);
          const j = (await r.json()) as {
            lines?: Array<{
              finalDesignation?: string;
              ["Final designation"]?: string;
              invoiced?: string;
              Invoiced?: string;
            }>;
          };
          const n = (j.lines ?? []).filter((l) => {
            const fd = String(l.finalDesignation ?? l["Final designation"] ?? "").trim();
            const inv = String(l.invoiced ?? l.Invoiced ?? "").trim();
            return !fd && !inv;
          }).length;
          if (!cancelled) setBadge(BK.receipts, n);
        } catch {
          /* keep last value */
        }
      }
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
  }, [email, canMessages, canReceipts]);
}
