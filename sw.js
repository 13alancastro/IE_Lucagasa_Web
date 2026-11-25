/* Service Worker: solo cachea archivos estáticos del frontend.
   Las peticiones a la API (otro puerto/origen) nunca se interceptan. */
const CACHE_NAME = 'lucagasa-static-v2';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/scripts.js',
  '/manifest.webmanifest',
  '/img/logogalan.png',
  '/img/favicon.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  // Nunca tocar la API ni peticiones cross-origin.
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (event.request.method !== 'GET') return;

  // Network-first: siempre trae la versión más reciente del archivo.
  // Si no hay conexión, usa la copia cacheada.
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then(cached => cached || Response.error()))
  );
});
