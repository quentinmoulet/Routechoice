// Service worker — coquille hors-ligne. L'analyse tourne dans le navigateur, donc
// l'app marche sans réseau ; seuls Livelox (/api/*) et le partage requièrent le net.
// HTML : réseau d'abord (pour toujours avoir la dernière version), cache en repli.
const CACHE = 'routechoice-v2';
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
  if (u.pathname.startsWith('/api/') || u.pathname.includes('/.netlify/')) return; // jamais de cache
  if (e.request.method !== 'GET') return;
  const isDoc = e.request.mode === 'navigate' || e.request.destination === 'document'
    || u.pathname === '/' || u.pathname.endsWith('/index.html');
  if (isDoc) {
    // réseau d'abord → on voit les mises à jour ; cache en repli (hors-ligne)
    e.respondWith(
      fetch(e.request).then(resp => {
        const cp = resp.clone(); caches.open(CACHE).then(c => c.put('./index.html', cp));
        return resp;
      }).catch(() => caches.match('./index.html'))
    );
    return;
  }
  // autres ressources même-origine (icône, manifeste) → cache d'abord
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).then(resp => {
      if (resp && resp.ok && u.origin === location.origin) {
        const cp = resp.clone(); caches.open(CACHE).then(c => c.put(e.request, cp));
      }
      return resp;
    }).catch(() => r))
  );
});
