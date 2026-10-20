// Tiene in cache solo la struttura del sito per aprirlo velocemente.
// File, PDF e dati arrivano sempre direttamente dalla rete.
var CACHE = "classe-v19";
var SHELL = ["./", "index.html", "style.css", "app.js", "orario.js", "orario.css", "correzioni.js", "correzioni.css", "profili.js", "profili.css", "riepilogo.js", "riepilogo.css", "config.js", "seed.js", "vendor/supabase.js", "manifest.webmanifest", "icons/icon.svg", "fonts/bricolage-grotesque-latin-wght-normal.woff2", "fonts/atkinson-hyperlegible-latin-400-normal.woff2", "fonts/atkinson-hyperlegible-latin-700-normal.woff2"];
self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener("fetch", function (e) {
  var req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin || req.headers.has("range")) return;
  var shellPaths = SHELL.map(function (p) { return new URL(p, self.registration.scope).pathname; });
  if (req.mode !== "navigate" && shellPaths.indexOf(url.pathname) < 0) return;
  e.respondWith(fetch(req).then(function (res) {
    if (res.ok && res.status === 200) {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(req, copy); });
    }
    return res;
  }).catch(function () { return caches.match(req, { ignoreSearch: true }); }));
});
