// Minimal service worker for PWA installability.
// Auto-activates new versions immediately and claims all clients.
// v3 - force update
const SW_VERSION = "v3-2026-07-22";

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

self.addEventListener("fetch", (event) => {
  // Passthrough — required so Chrome recognizes a fetch handler for install.
  event.respondWith(fetch(event.request));
});
