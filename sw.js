// CA Fish Regs — Service Worker
// Caches app shell for offline use

const CACHE_NAME = 'cafish-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/map.html',
  'https://fonts.googleapis.com/css2?family=Unbounded:wght@400;700;900&family=DM+Sans:wght@300;400;500&display=swap',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
];

// Install — cache app shell
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS).catch(() => {
        // Don't fail install if some external assets can't be cached
      });
    })
  );
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch — serve from cache first, fall back to network, cache new responses
self.addEventListener('fetch', e => {
  // Only handle http/https requests — skip chrome-extension, data: etc.
  if (!e.request.url.startsWith('http')) return;

  // Don't intercept live data APIs — always need fresh data
  const url = e.request.url;
  if (url.includes('supabase.co') || url.includes('anthropic.com') ||
      url.includes('api.weather.gov') || url.includes('tidesandcurrents') ||
      url.includes('arcgis.com')) {
    return; // Let these go straight to network
  }

  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(response => {
        // Cache successful GET responses
        if (e.request.method === 'GET' && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return response;
      }).catch(() => {
        // Offline fallback for navigation
        if (e.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
      });
    })
  );
});
