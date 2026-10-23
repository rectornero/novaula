// Tiene in cache solo la struttura del sito per aprirlo velocemente.
// File, PDF e dati arrivano sempre direttamente dalla rete.
var CACHE = "classe-v29";
var SHELL = ["./", "index.html", "style.css", "app.js", "orario.js", "orario.css", "lim.js", "lim.css", "correzioni.js", "correzioni.css", "profili.js", "profili.css", "riepilogo.js", "riepilogo.css", "pagella.js", "pagella.css", "notifiche.js", "avvisi.js", "avvisi.css", "config.js", "seed.js", "vendor/supabase.js", "manifest.webmanifest", "icons/icon.svg", "fonts/bricolage-grotesque-latin-wght-normal.woff2", "fonts/atkinson-hyperlegible-latin-400-normal.woff2", "fonts/atkinson-hyperlegible-latin-700-normal.woff2"];
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

// Notifiche sul telefono: il testo arriva cifrato dalla funzione Edge "notifiche"
self.addEventListener("push", function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "Novaula", {
    body: d.body || "", tag: d.tag || undefined, data: { url: d.url || "./" },
    icon: "icons/icon-192.png", badge: "icons/icon-192.png", lang: "it"
  }));
});
self.addEventListener("notificationclick", function (e) {
  e.notification.close();
  var url = new URL((e.notification.data && e.notification.data.url) || "./", self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (c.url.indexOf(self.registration.scope) === 0 && "focus" in c) {
        return c.focus().then(function (w) { return w && w.navigate ? w.navigate(url) : null; }).catch(function () { return self.clients.openWindow(url); });
      }
    }
    return self.clients.openWindow(url);
  }));
});
