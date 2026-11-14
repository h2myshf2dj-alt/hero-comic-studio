// Offline-Speicher für die App-Dateien (KI-Bilder werden nicht zwischengespeichert)
const CACHE = "hcs-v6";
const FILES = ["./", "index.html", "style.css", "store.js", "ai.js", "render.js", "app.js",
  "manifest.json", "icon-180.png", "icon-192.png", "icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, { cache: "reload" })))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // KI & Schriften direkt aus dem Netz
  // Erst Netz (neueste Version), bei Offline aus dem Speicher
  e.respondWith(
    fetch(e.request, { cache: "no-store" }).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request))
  );
});
