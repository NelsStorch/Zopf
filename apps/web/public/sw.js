/*
 * Service worker of the delivery view (registered only there).
 * Keeps the route page, its scripts and the logo on the phone, so the view
 * opens and works without reception. Route data and unsent ticks live in the
 * page itself (localStorage); here only the files.
 *
 *   /_next/static/*, /brand/*   cache first (file names change with every build)
 *   /route/<token> pages        network first, cached copy when offline
 *   /api/v1/public/routes/*     network first, cached copy when offline (GET only)
 * Everything else (shop, admin, other API calls) is not touched.
 */
const CACHE = 'zopf-delivery-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('zopf-delivery-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    const hit = await cache.match(request, { ignoreSearch: true });
    if (hit) return hit;
    throw error;
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const path = url.pathname;
  if (path.startsWith('/_next/static/') || path.startsWith('/brand/')) {
    event.respondWith(cacheFirst(request));
  } else if (path.startsWith('/route/') || path.startsWith('/api/v1/public/routes/')) {
    event.respondWith(networkFirst(request));
  }
});
