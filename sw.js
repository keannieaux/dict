/* Простой офлайн-кэш. Меняй VERSION, когда правишь файлы — иначе Safari отдаст старую версию. */
const VERSION = 'reader-v2';
const SHELL = [
  './', './index.html', './app.css', './app.js',
  './manifest.webmanifest', './icons/icon.svg',
  './books/index.json',
  './books/mary-poppins.json',
  './books/dead-mans-island.json',
  './books/huck-finn.json',
  './books/anne-green-gables.json',
  './books/canterville.json',
  './books/hampton-house.json',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // переводы и словарные запросы никогда не кэшируем
  if (url.origin !== location.origin) return;

  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(VERSION).then(c => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
