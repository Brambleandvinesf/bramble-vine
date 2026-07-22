// Minimal service worker for PWA installability.
// Auto-activates new versions immediately and claims all clients.
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
