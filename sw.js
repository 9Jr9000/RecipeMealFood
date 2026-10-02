// Offline support: always try the network, fall back to the cached app when offline.
const CACHE = 'recipe-box-v4';
const ASSETS = [
  './', 'index.html', 'css/styles.css', 'js/app.js', 'js/db.js', 'js/ingredients.js', 'js/sync.js',
  'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', e => {
  // cache: 'reload' skips the browser's HTTP cache so a new version never caches old files.
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS.map(url => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function freshRequest(req) {
  // Page loads ("navigate" requests) can't be copied with options, so rebuild them from the URL.
  if (req.mode === 'navigate') return new Request(req.url, { cache: 'no-cache', credentials: 'same-origin' });
  return new Request(req, { cache: 'no-cache' });
}

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  // Network first so updates show up right away; the cache is the offline fallback.
  e.respondWith(
    caches.open(CACHE).then(cache =>
      // no-cache: always check with the server (cheap when nothing changed).
      fetch(freshRequest(e.request))
        .then(res => { if (res.ok) cache.put(e.request, res.clone()); return res; })
        .catch(() => cache.match(e.request, { ignoreSearch: true })),
    ),
  );
});
