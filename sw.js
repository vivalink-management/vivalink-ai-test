/* Service Worker: lädt zuerst aus dem Netz (immer aktuelle Version), offline aus dem Speicher. */
const VERSION = "2.1.0";
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
  "js/config.js",
  "js/core.js",
  "js/data.js",
  "js/metrics.js",
  "js/rules.js",
  "js/prompts.js",
  "js/aitest.js",
  "js/views.js",
  "js/diag.js",
  "js/demo.js",
  "js/app.js",
];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(C).then((c) => c.addAll(F)));
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
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req)
      .then((r) => {
        if (r.ok && r.type === "basic") {
          const c = r.clone();
          caches.open(C).then((x) => x.put(req, c));
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
