// Zone Ahead service worker: keeps the app and its data on the phone so alerts work with no signal.
//  - the page: network first (so updates arrive), the saved copy when offline
//  - geo/*.json (street shapes, speed limits, parking signs): the saved copy straight away, refreshed in the background
//  - map tiles you've looked at: kept (up to about 2,500), never bulk-downloaded
//  - fonts and the 3D map library: kept once loaded
//  - live services (routes, road names, reports, bay sensors): always the network
const APP = 'za-app', DATA = 'za-data', TILES = 'za-tiles', LIBS = 'za-libs', MAX_TILES = 2500;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(APP).then(c => c.add(new Request(self.registration.scope, { cache: 'reload' })).catch(() => { })).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

async function trimTiles() {
  const c = await caches.open(TILES), keys = await c.keys();
  for (let i = 0; i < keys.length - MAX_TILES; i++) await c.delete(keys[i]);   // oldest first
}

self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const same = url.origin === self.location.origin;

  if (req.mode === 'navigate' && same) {
    e.respondWith(fetch(req).then(r => { if (r.ok) { const copy = r.clone(); caches.open(APP).then(c => c.put(self.registration.scope, copy)); } return r; })
      .catch(async () => (await caches.match(req, { ignoreSearch: true })) || (await caches.match(self.registration.scope)) || Response.error()));
    return;
  }
  if (same && /\/geo\/[^/]+\.json$/.test(url.pathname)) {
    e.respondWith(caches.open(DATA).then(async c => {
      const hit = await c.match(req);
      const net = fetch(req).then(r => { if (r.ok) c.put(req, r.clone()); return r; }).catch(() => null);
      if (hit) { e.waitUntil(net); return hit; }
      return (await net) || Response.error();
    }));
    return;
  }
  if (/(^|\.)basemaps\.cartocdn\.com$/.test(url.hostname)) {
    e.respondWith(caches.open(TILES).then(async c => {
      const hit = await c.match(req); if (hit) return hit;
      const r = await fetch(req);
      if (r.ok || r.type === 'opaque') { c.put(req, r.clone()); e.waitUntil(trimTiles()); }
      return r;
    }));
    return;
  }
  if (/^(fonts\.googleapis\.com|fonts\.gstatic\.com|cdnjs\.cloudflare\.com)$/.test(url.hostname)) {
    e.respondWith(caches.open(LIBS).then(async c => (await c.match(req)) || fetch(req).then(r => { if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; })));
  }
});
