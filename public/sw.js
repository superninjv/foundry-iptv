// Foundry IPTV — minimal service worker for PWA installability.
// Caches static assets only. Authenticated HTML pages are NEVER cached
// because they contain user-specific data (history, lists, settings) that
// must not be replayable offline after logout or session expiry.

const CACHE_NAME = 'foundry-iptv-v2';

// Only these exact paths are cacheable. Everything else falls through to
// the network with no cache write and no offline fallback.
const PUBLIC_ASSETS = new Set([
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/favicon.ico',
]);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll([...PUBLIC_ASSETS]).catch(() => {}),
    ),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Wipe all old caches on activation so previously cached HTML from older
  // worker versions cannot leak across logout / version upgrades.
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'clear-cache') {
    event.waitUntil(
      caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))),
    );
  }
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith(self.location.origin)) return;

  const url = new URL(event.request.url);

  // Only the explicit public-asset allowlist is ever served from cache.
  // Authenticated routes, API responses, and HTML pages bypass the worker
  // entirely so they can't be replayed when the user is logged out.
  if (!PUBLIC_ASSETS.has(url.pathname)) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      });
    }),
  );
});
