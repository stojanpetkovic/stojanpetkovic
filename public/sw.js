/*
 * Service worker for the installable app.
 *
 * - Pages: network first, so a visitor always gets the latest copy online; the
 *   last copy of each visited page is kept for when the connection drops, and
 *   a page never visited falls back to /offline.html.
 * - Hashed build assets (/_astro/…), fonts and images: served from the cache
 *   and refreshed in the background.
 * - Never touched: other sites, the API, lead tracking, POSTs and the admin.
 *
 * Bump VERSION to drop every old cache on the next visit.
 */
const VERSION = 'v1';
const STATIC_CACHE = `static-${VERSION}`;
const PAGE_CACHE = `pages-${VERSION}`;
const MAX_PAGES = 40;
const PRECACHE = ['/offline.html', '/pwa-192x192.png', '/favicon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .catch(() => {})
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== STATIC_CACHE && key !== PAGE_CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

function skip(url) {
  return (
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/admin') ||
    url.pathname === '/leads.js' ||
    url.pathname === '/sw.js'
  );
}

async function trimPages() {
  const cache = await caches.open(PAGE_CACHE);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - MAX_PAGES; i++) await cache.delete(keys[i]);
}

async function pageFromNetwork(request) {
  try {
    const response = await fetch(request);
    if (response.ok && response.type === 'basic') {
      const copy = response.clone();
      caches.open(PAGE_CACHE).then((cache) => cache.put(request, copy)).then(trimPages);
    }
    return response;
  } catch {
    const cached = await caches.match(request, { ignoreSearch: true });
    return cached || (await caches.match('/offline.html')) || Response.error();
  }
}

async function assetFromCache(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  const refresh = fetch(request)
    .then((response) => {
      if (response.ok && response.type === 'basic') cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);
  return cached || refresh;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (skip(url)) return;

  if (request.mode === 'navigate') {
    event.respondWith(pageFromNetwork(request));
    return;
  }

  if (
    url.pathname.startsWith('/_astro/') ||
    url.pathname.startsWith('/fonts/') ||
    /\.(?:png|jpe?g|webp|avif|svg|gif|ico|woff2?)$/i.test(url.pathname)
  ) {
    event.respondWith(assetFromCache(request));
  }
});
