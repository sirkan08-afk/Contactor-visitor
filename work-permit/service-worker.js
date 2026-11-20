const CACHE_NAME = "work-permit-shell-v10";
const APP_BASE = new URL("./", self.registration.scope);
const APP_SHELL = [
  new URL("./", APP_BASE).href,
  new URL("./index.html", APP_BASE).href,
  new URL("./manifest.webmanifest", APP_BASE).href,
  new URL("./icon-192.png", APP_BASE).href,
  new URL("./icon-512.png", APP_BASE).href
];

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(APP_SHELL.map(async url => {
      try {
        const response = await fetch(url, { cache: "reload" });
        if (response.ok) await cache.put(url, response);
      } catch (error) {
        console.warn("Work Permit shell cache skipped:", url, error);
      }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(key => key.startsWith("work-permit-shell-") && key !== CACHE_NAME)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== APP_BASE.origin || !url.pathname.startsWith(APP_BASE.pathname)) return;

  event.respondWith((async () => {
    try {
      const response = await fetch(request);
      if (response && response.ok) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone()).catch(() => {});
      }
      return response;
    } catch (error) {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      if (cached) return cached;
      if (request.mode === "navigate") {
        return (await cache.match(new URL("./", APP_BASE).href)) || Response.error();
      }
      return Response.error();
    }
  })());
});
