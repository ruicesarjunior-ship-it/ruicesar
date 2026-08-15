/**
 * Service worker — permite usar o aplicativo sem sinal de internet.
 * Estratégia: cache-first para o "casco" do app, com atualização em segundo plano.
 */

const CACHE = 'fte-v1';
const ARQUIVOS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/estilos.css',
  './js/app.js',
  './js/db.js',
  './js/store.js',
  './js/fotos.js',
  './js/checklist.js',
  './js/relatorio.js',
  './js/backup.js',
  './icons/icone.svg',
  './icons/icone-mascarado.svg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((chaves) => Promise.all(chaves.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((resp) => {
      const rede = fetch(e.request)
        .then((r) => {
          if (r.ok && new URL(e.request.url).origin === location.origin) {
            const copia = r.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copia));
          }
          return r;
        })
        .catch(() => resp);
      return resp || rede;
    })
  );
});
