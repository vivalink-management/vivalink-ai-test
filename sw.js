/* Service Worker: lädt zuerst aus dem Netz (immer aktuelle Version), offline aus dem Speicher.
   Alle Netzabrufe umgehen den Browser-Zwischenspeicher (GitHub Pages erlaubt bis zu 10 Minuten),
   damit nach einem Update nie alte und neue Dateien gemischt oder veraltet offline gespeichert werden. */
const VERSION = "2.4.0";
const CH = "vivalink-test-"; // Test-Build: "vivalink-test-"
const C = CH + VERSION;
// Nur eigene, veraltete Offline-Speicher löschen. Die echte App und die Testversion berühren sich nie.
const own = (k) => k !== C && k.startsWith(CH) && (CH !== "vivalink-" || !k.startsWith("vivalink-test-"));
const F = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "icon-180.png",
  "icon-512.png",
  "brand/vivalink-logo.png",
  "brand/vivalink-logo-weiss.png",
  "brand/vivalink-symbol.png",
  "brand/vivalink-symbol-weiss.png",
  "brand/nunito-latin-400-normal.woff2",
  "brand/nunito-latin-700-normal.woff2",
  "brand/nunito-latin-800-normal.woff2",
  "js/config.js",
  "js/core.js",
  "js/data.js",
  "js/metrics.js",
  "js/actions.js",
  "js/rules.js",
  "js/studio.js",
  "js/advice.js",
  "js/manage.js",
  "js/render.js",
  "js/prompts.js",
  "js/aitest.js",
  "js/views.js",
  "js/studio-view.js",
  "js/diag.js",
  "js/sync.js",
  "js/autonomy.js",
  "js/kpi.js",
  "js/demo.js",
  "js/app.js",
];
self.addEventListener("install", (e) => {
  // Unvollständige Installation (z. B. Verbindung weg): halb gefüllten Speicher entfernen, alte Version bleibt aktiv
  e.waitUntil(
    caches
      .open(C)
      .then((c) => c.addAll(F.map((u) => new Request(u, { cache: "reload" }))))
      .catch((err) => caches.delete(C).then(() => Promise.reject(err))),
  );
  self.skipWaiting();
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((k) => Promise.all(k.filter(own).map((x) => caches.delete(x))))
      .then(() => self.clients.claim()),
  );
});
const fresh = (req) => {
  try {
    return new Request(req, { cache: "no-cache" });
  } catch (e) {
    return req;
  }
};
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(fresh(req))
      .then((r) => {
        if (r.ok && r.type === "basic") {
          const c = r.clone();
          e.waitUntil(caches.open(C).then((x) => x.put(req, c)));
        }
        return r;
      })
      .catch(() =>
        caches
          .match(req, { ignoreSearch: true })
          .then((r) => r || (req.mode === "navigate" ? caches.match("index.html") : undefined))
          .then((r) => r || new Response("Offline", { status: 503, statusText: "Offline" })),
      ),
  );
});
