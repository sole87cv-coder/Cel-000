// service-worker.js — cache offline do v1su4rt.
// Ao alterar qualquer arquivo em APP_FILES, aumente CACHE_NAME.
const CACHE_NAME = 'v1su4rt-v4';
const APP_FILES = [
  './',
  './index.html',
  './privacy.html',
  './manifest.webmanifest',
  './icon.svg',
  './assets/styles.css',
  './assets/shaders.js',
  './assets/interaction.js',
  './assets/app.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => Promise.all(APP_FILES.map((url) => cache.add(url).catch((err) => {
        // um arquivo ausente não derruba a instalação inteira
        console.warn('Falha ao adicionar ao cache:', url, err);
      }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  // páginas: tenta a rede e atualiza o cache; offline, usa o que estiver guardado
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      } catch (err) {
        return (await caches.match(request)) || (await caches.match('./index.html'));
      }
    })());
    return;
  }

  // arquivos: cache primeiro
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    }),
  );
});
