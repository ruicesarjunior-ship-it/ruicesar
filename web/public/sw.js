/* Service Worker do app "MPBA — Expedição de Ofícios".
   Estratégia network-first com fallback para cache: quando há internet, busca a
   versão mais nova e guarda uma cópia; sem internet, serve a última cópia salva.
   Assim o app abre e funciona offline (menos a IA e a nuvem, que exigem rede).
   Não intercepta chamadas a outros domínios (Anthropic/Firebase) — essas vão
   direto para a rede. */
var CACHE = "mpba-cache-v1";

self.addEventListener("install", function () { self.skipWaiting(); });

self.addEventListener("activate", function (e) {
  e.waitUntil((async function () {
    var keys = await caches.keys();
    await Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== self.location.origin) return; // não mexe em IA/Firebase

  e.respondWith((async function () {
    var cache = await caches.open(CACHE);
    try {
      var fresh = await fetch(req);
      if (fresh && fresh.status === 200 && (fresh.type === "basic" || fresh.type === "default")) {
        cache.put(req, fresh.clone());
      }
      return fresh;
    } catch (err) {
      var cached = await cache.match(req);
      if (cached) return cached;
      if (req.mode === "navigate") {
        var idx = (await cache.match("./index.html")) || (await cache.match("index.html")) || (await cache.match("./"));
        if (idx) return idx;
      }
      throw err;
    }
  })());
});
