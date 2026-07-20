// Minimal service worker for PWA installability.
// Network-first passthrough. No caching (Apps Script must never be cached).
self.addEventListener("install", () => {
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
self.addEventListener("fetch", (event) => {
  // Passthrough — required so Chrome recognizes a fetch handler for install.
  event.respondWith(fetch(event.request));
});
