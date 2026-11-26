/* Offline shell: network-first for app files (so updates show immediately), cache as offline fallback.
   Recipes live in localStorage and photos in IndexedDB, never in this cache. */
const CACHE = 'cookbook-v17';
const ASSETS = ['./', './index.html', './style.css', './app.js', './store.js', './parser.js', './icons.js',
  './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png',
  './fonts/cormorant-garamond-latin-500-italic.woff2', './fonts/cormorant-garamond-latin-500-normal.woff2', './fonts/cormorant-garamond-latin-600-normal.woff2', './fonts/cormorant-garamond-latin-ext-500-italic.woff2', './fonts/cormorant-garamond-latin-ext-500-normal.woff2', './fonts/cormorant-garamond-latin-ext-600-normal.woff2', './fonts/eb-garamond-latin-400-italic.woff2', './fonts/eb-garamond-latin-400-normal.woff2', './fonts/eb-garamond-latin-600-normal.woff2', './fonts/eb-garamond-latin-ext-400-italic.woff2', './fonts/eb-garamond-latin-ext-400-normal.woff2', './fonts/eb-garamond-latin-ext-600-normal.woff2'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(fetch(req, { cache: 'no-cache' }).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then(hit => hit || caches.match('./index.html'))));
});
