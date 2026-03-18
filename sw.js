// CA Fish Regs — Service Worker v4
// Clears ALL old caches immediately, network-first

const CACHE_NAME = 'cafish-v4';

self.addEventListener('install', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(self.clients.claim());
});

// Network first — no caching, always fresh
self.addEventListener('fetch', e => {
  if (!e.request.url.startsWith('http')) return;
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
