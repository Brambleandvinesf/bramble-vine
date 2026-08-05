import { useEffect, useRef, type DependencyList } from "react";

/**
 * Fixed-interval polling with the two guards every poller in this app was
 * missing (CC-17, 8/5).
 *
 * WHY THIS EXISTS. Load Vehicle, Field and Shopping each ran one or two bare
 * `setInterval`s against endpoints that are individually slow and wildly
 * variable — getData measured 3.0-23.3s and ships 360KB, getField 2.7-21.0s.
 * `setInterval` does not wait for the previous run, so at a 10s period a call
 * that takes 13s means the next tick starts before the last one finished. The
 * screens set a refreshing flag at the top of every tick, so once ticks overlap
 * the flag is re-raised before the previous tick's `finally` lowers it and the
 * screen sits in its loading state indefinitely. That is the "loads in
 * perpetuity" report: one idle screen produced 44 /exec calls in 168 seconds.
 *
 * Two guards fix it:
 *   - IN-FLIGHT: never two ticks at once. A slow response delays the next poll
 *     instead of racing it, so the request queue cannot grow without bound.
 *   - HIDDEN TAB: a backgrounded tab gets no data it can show. On a phone in
 *     someone's pocket that is the common case, and it was the bulk of the waste.
 *
 * Coming back to a visible tab refreshes immediately, so the longer intervals
 * these callers now use are not felt: the crew sees fresh data on focus rather
 * than waiting out the remainder of a period.
 *
 * `tick` receives an `isCancelled` probe — check it after every await before
 * calling setState, exactly as the hand-rolled `cancelled` flags did.
 */
export function usePoll(
  tick: (isCancelled: () => boolean) => Promise<void>,
  intervalMs: number,
  deps: DependencyList,
): void {
  /* Held in a ref so a re-created callback does not tear down the timer and
     re-fire an immediate request — that would reintroduce request spam through
     the back door, on every parent render. */
  const tickRef = useRef(tick);
  tickRef.current = tick;

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    const isCancelled = () => cancelled;

    const run = async (force: boolean) => {
      if (inFlight) return;
      if (!force && document.visibilityState === "hidden") return;
      inFlight = true;
      try {
        await tickRef.current(isCancelled);
      } catch {
        /* Callers own their error handling; a throw must not kill the interval. */
      } finally {
        inFlight = false;
      }
    };

    void run(true);
    const id = window.setInterval(() => void run(false), intervalMs);
    const onVis = () => {
      if (document.visibilityState === "visible") void run(true);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs, ...deps]);
}
