const CACHE_NAME = "work-permit-shell-v6";
const APP_BASE = "/Contactor-visitor/work-permit/";
const APP_SHELL = [
  APP_BASE,
  APP_BASE + "index.html",
  APP_BASE + "manifest.webmanifest",
  APP_BASE + "icon.svg",
  APP_BASE + "icon-192.png",
  APP_BASE + "icon-512.png"
];
self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(APP_SHELL);
    await self.skipWaiting();
  })());
});
self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith("work-permit-shell-") && key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith(APP_BASE)) {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response && response.ok) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(request, response.clone());
        }
        return response;
      } catch (error) {
        const cached = await caches.match(request);
        if (cached) return cached;
        if (request.mode === "navigate") return caches.match(APP_BASE + "index.html");
        throw error;
      }
    })());
  }
});
