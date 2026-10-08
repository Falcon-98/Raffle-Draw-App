/*
 * Offline support for the raffle. After the site has been opened once while online,
 * it keeps working if the venue internet drops:
 *  - pages: network first, cached copy when offline (so a new deploy is picked up when online)
 *  - build files (/_next/static, hashed) and Google Fonts: cache first
 *  - everything else from this site: cached copy at once, refreshed in the background
 */
const CACHE = 'click2026-raffle-v1';
const BASE = new URL(self.registration.scope).pathname; // e.g. /Raffle-Draw-App/
const PRECACHE = ['', 'admin/', 'sample-participants.csv', 'favicon.svg', 'manifest.webmanifest'].map((p) => BASE + p);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => Promise.all(PRECACHE.map((u) => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const cacheable = (res) => res && (res.ok || res.type === 'opaque');

async function put(req, res) {
  if (!cacheable(res)) return;
  const c = await caches.open(CACHE);
  await c.put(req, res);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const fonts = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (!sameOrigin && !fonts) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          event.waitUntil(put(req, res.clone()));
          return res;
        })
        .catch(async () => (await caches.match(req, { ignoreSearch: true })) || (await caches.match(BASE)) || Response.error()),
    );
    return;
  }

  if (fonts || url.pathname.startsWith(BASE + '_next/static/')) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            event.waitUntil(put(req, res.clone()));
            return res;
          }),
      ),
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req)
        .then((res) => {
          event.waitUntil(put(req, res.clone()));
          return res;
        })
        .catch(() => hit || Response.error());
      return hit || net;
    }),
  );
});
