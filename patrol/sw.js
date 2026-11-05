const CACHE_NAME = 'security-patrol-v11';

self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter(key => key.startsWith('security-patrol-') && key !== CACHE_NAME)
        .map(key => caches.delete(key))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const scopeUrl = new URL(self.registration.scope);

  // This worker must never intercept requests belonging to the Contractor app
  // or any other path on the same GitHub Pages origin.
  if (url.origin !== scopeUrl.origin || !url.href.startsWith(scopeUrl.href)) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);

    try {
      const response = await fetch(request);
      if (response && response.ok) {
        await cache.put(request, response.clone()).catch(() => {});
      }
      return response;
    } catch (error) {
      const cached = await cache.match(request);
      if (cached) return cached;

      if (request.mode === 'navigate') {
        const fallbackUrl = new URL('./index.html', scopeUrl).href;
        const fallback = await cache.match(fallbackUrl);
        if (fallback) return fallback;
      }

      return Response.error();
    }
  })());
});
