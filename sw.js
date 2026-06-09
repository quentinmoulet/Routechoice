// Service worker — coquille hors-ligne. L'analyse tourne dans le navigateur, donc
// l'app marche sans réseau ; seuls Livelox (/api/*) et le partage requièrent le net.
const CACHE = 'routechoice-v1';
const ASSETS = ['./', './index.html', './manifest.webmanifest', './icon.svg'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  // API et fonctions → toujours réseau (jamais de cache)
  if (u.pathname.startsWith('/api/') || u.pathname.includes('/.netlify/')) return;
  if (e.request.method !== 'GET') return;
  // coquille : cache d'abord, réseau en repli (et mise en cache opportuniste)
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).then(resp => {
      if (resp && resp.ok && u.origin === location.origin) {
        const cp = resp.clone();
        caches.open(CACHE).then(c => c.put(e.request, cp));
      }
      return resp;
    }).catch(() => caches.match('./index.html')))
  );
});
