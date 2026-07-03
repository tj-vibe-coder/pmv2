/* IOCT PM service worker — lets the app open without a connection so field
   crews can clock in/out on site. App shell only; API calls are never cached
   (the offline punch queue in localStorage handles data). */
const CACHE = 'ioct-shell-v2';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(['/', '/index.html', '/manifest.json'])).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // POST/PUT fall through → app queues them offline
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // ignore cross-origin (maps, etc.)
  if (url.pathname.startsWith('/api/')) return;    // never cache API responses

  // HTML navigations: network-first so updates land when online, cached shell when offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put('/index.html', copy)); return res; })
        .catch(() => caches.match('/index.html')),
    );
    return;
  }

  // Static assets (hashed, immutable): cache-first, populate on first fetch.
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).then((res) => {
      if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => cached)),
  );
});
