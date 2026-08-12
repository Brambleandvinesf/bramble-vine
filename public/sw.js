// Minimal service worker for PWA installability.
// Auto-activates new versions immediately and claims all clients.
// v4 - CC-13: stopped intercepting fetch. See the fetch handler at the bottom.
const SW_VERSION = "v4-2026-08-12";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      await self.clients.claim();
      const clients = await self.clients.matchAll({ type: "window" });
      for (const client of clients) {
        try {
          client.postMessage({ type: "SW_ACTIVATED", version: SW_VERSION });
        } catch {}
      }
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

/**
 * CC-13 (8/12): THIS HANDLER USED TO BREAK THE APP, AND IT WAS THE WHOLE BUG.
 *
 * It was:
 *     event.respondWith(fetch(event.request));
 * which is a blanket intercept of EVERY request the app makes, with no catch.
 * Two consequences, and both were live on Angel's phone:
 *
 *  1. When that fetch() rejects — a flaky mobile network, a request aborted
 *     mid-flight, a backgrounded tab — the promise handed to respondWith rejects
 *     unhandled. That is the reported console error, to the character:
 *         Uncaught (in promise) TypeError: Failed to fetch  at sw.js:32:21
 *     Column 21 of the old line 32 is `fetch(event.request)`.
 *  2. Worse, respondWith then answers the PAGE with a network error. So the
 *     app's own fetch rejects too, even when the server answered fine. That is
 *     why the Message Center showed "Couldn't reach the inbox — check connection
 *     and Reload" while getInbox was measurably returning HTTP 200 with valid
 *     JSON: loadInbox() threw, safeLoad() caught it, setFeedError(true).
 *     The failure was never on the server. It was in here.
 *
 * With five pollers running through usePoll, one bad network moment produced a
 * burst of these — 29 identical errors were captured — and the rejected-promise
 * churn is what Chrome's "Page Unresponsive" dialog was reacting to.
 *
 * THE FIX IS TO NOT INTERCEPT. The handler still EXISTS, which is all Chrome
 * needs for installability — that was the only reason respondWith was ever here,
 * and it was never required. Not calling respondWith lets the browser perform its
 * own default networking, exactly as if no service worker were installed: no
 * extra failure point, no uncaught rejection, and transient blips are handled by
 * the browser and the app's own retry logic instead of being converted into hard
 * failures.
 *
 * Deliberately NOT "add a .catch()": catching and returning a synthetic error
 * Response would silence the console noise but still hand the page a failed
 * response, so the inbox would go on reporting that it cannot be reached. The
 * interception itself is the defect, not the missing handler.
 *
 * DO NOT reintroduce respondWith here without a caching strategy that genuinely
 * needs it — and if that day comes, it needs a catch AND a fallback Response.
 */
self.addEventListener("fetch", () => {
  /* Intentionally empty. Presence satisfies installability; the browser handles
     the request. See the note above before changing this. */
});
