/* Меняйте номер версии каждый раз, когда правите любой файл —
   иначе iPhone продолжит показывать старую сохранённую копию. */
const VERSION = 'dict-v9';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './course.js',
  './course.json',
  './words.json',
  './grammar.json',
  './links.json',
  './manifest.webmanifest',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* Сначала сеть, при неудаче — сохранённая копия. Правки подхватываются
   сразу онлайн, а без интернета приложение всё равно открывается. */
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const copy = res.clone();
        caches.open(VERSION).then(c => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
  );
});
