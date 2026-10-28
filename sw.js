// Garde l'appli sur le téléphone pour qu'elle s'ouvre même sans réseau dans la salle.
// Réseau d'abord (pour avoir la dernière version), mais si la salle capte mal on sert la copie après 2,5 s.
// Changer VERSION à chaque mise en ligne pour vider l'ancienne copie.

const VERSION = 'ma-seance-1';
const FICHIERS = [
  './',
  'index.html',
  'styles.css',
  'data.js',
  'app.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', ev => {
  ev.waitUntil(caches.open(VERSION).then(c => c.addAll(FICHIERS)));
  self.skipWaiting();
});

self.addEventListener('activate', ev => {
  ev.waitUntil(caches.keys().then(cles => Promise.all(cles.filter(c => c !== VERSION).map(c => caches.delete(c)))));
  self.clients.claim();
});

self.addEventListener('fetch', ev => {
  if (ev.request.method !== 'GET' || new URL(ev.request.url).origin !== location.origin) return;
  ev.respondWith(reseauOuCopie(ev));
});

async function reseauOuCopie(ev) {
  const cache = await caches.open(VERSION);
  const reseau = fetch(ev.request).then(rep => {
    if (rep.ok) cache.put(ev.request, rep.clone());
    return rep;
  });
  ev.waitUntil(reseau.catch(() => {}));
  const copie = await cache.match(ev.request, { ignoreSearch: true });
  if (!copie) return reseau;
  const attente = new Promise(ok => setTimeout(() => ok(copie), 2500));
  return Promise.race([reseau.catch(() => copie), attente]);
}
