/* Grundlagen: Konstanten, Hilfsfunktionen, Speicher, technisches Protokoll */
const APP_VERSION = "2.8.1";
const IS_TEST = window.VL_CHANNEL === "test";
const SCHEMA = 4; // Datenversion: 1 = GitHub-Version, 2 = Artefakt (Kennzahlen), 3 = Konflikterkennung, 4 = Instagram-Studio
const CATS = [
  "Ziele",
  "Geschäftsmodell",
  "Entscheidung",
  "Meetup",
  "Marketing",
  "Instagram",
  "App",
  "Webseite",
  "Finanzen",
  "Kennzahl",
  "Problem",
];
const GAPS = ["Ziele", "Geschäftsmodell", "Finanzen", "Meetup", "Marketing", "Instagram", "App", "Webseite"];
const STL = { confirmed: "✅ Bestätigt", estimate: "💭 Einschätzung", unknown: "❓ Unbekannt" };
const PR = { hoch: 0, mittel: 1, niedrig: 2 };
let S,
  tab = "home",
  mf = { cat: "", q: "", hist: false },
  editId = null,
  showDone = false;
const $ = (s) => document.querySelector(s),
  val = (id) => $("#" + id).value;
const esc = (s) =>
  String(s == null ? "" : s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
const stl = (s) => STL[s] || STL.unknown;
const today = () => new Date().toLocaleDateString("sv-SE");
const fmt = (d) => (d ? new Date(d + "T12:00").toLocaleDateString("de-DE") : "");
const ago = (d) => Math.floor((new Date(today()) - new Date(d)) / 864e5);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const clone = (o) => JSON.parse(JSON.stringify(o));
function toast(t) {
  const e = $("#toast");
  e.textContent = t;
  e.style.display = "block";
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (e.style.display = "none"), 2600);
}

/* Speicher: IndexedDB, nur auf diesem Gerät */
const idb = () =>
  new Promise((ok, no) => {
    const r = indexedDB.open(window.VL_DB || "vivalink", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("kv");
    r.onsuccess = () => ok(r.result);
    r.onerror = () => no(r.error);
  });
async function load() {
  try {
    const d = await idb();
    return await new Promise((ok) => {
      const q = d.transaction("kv").objectStore("kv").get("state");
      q.onsuccess = () => ok(q.result);
      q.onerror = () => ok(null);
    });
  } catch (e) {
    logEvent("error", "storage.load", e && e.message);
    return null;
  }
}
async function save() {
  if (!(await kvPut("state", S))) {
    logEvent("error", "storage.save", "Speichern fehlgeschlagen");
    toast("Speichern auf diesem Gerät nicht möglich");
    return false;
  }
  if (typeof syncSoon === "function") syncSoon(); // nur aktiv, wenn Synchronisierung freigegeben und eingerichtet
  return true;
}
/* Jede Änderung merkt sich, auf welchem Stand sie beruht (revs). So erkennt das Zusammenführen,
   ob ein Datensatz nur weiterentwickelt oder auf zwei Geräten unabhängig geändert wurde. */
const touch = (o) => {
  if (o.updatedAt) o.revs = [...(o.revs || []), o.updatedAt].slice(-30);
  o.updatedAt = Math.max(Date.now(), (o.updatedAt || 0) + 1);
};

const kvPut = async (k, v) => {
  try {
    const d = await idb();
    await new Promise((ok, no) => {
      const x = d.transaction("kv", "readwrite");
      x.objectStore("kv").put(clone(v), k);
      x.oncomplete = ok;
      x.onerror = x.onabort = () => no(x.error);
    });
    return true;
  } catch (e) {
    return false;
  }
};
const kvGet = async (k) => {
  try {
    const d = await idb();
    return await new Promise((ok) => {
      const q = d.transaction("kv").objectStore("kv").get(k);
      q.onsuccess = () => ok(q.result || null);
      q.onerror = () => ok(null);
    });
  } catch (e) {
    return null;
  }
};

/* Technisches Protokoll: nur Fehlercodes und technische Meldungen, keine Inhalte.
   E-Mail-Adressen, Telefonnummern und längere Zahlen werden vor dem Speichern entfernt. */
let LOG = [];
const LOG_MAX = 200;
const redact = (t) =>
  String(t == null ? "" : t)
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[E-Mail entfernt]")
    .replace(/(\+|00)\d[\d ()\/-]{6,}\d/g, "[Nummer entfernt]")
    .replace(/\d{4,}/g, "[Zahl]")
    .slice(0, 300);
let logTimer = null;
function logEvent(level, code, msg) {
  const e = { at: Date.now(), level, code: redact(code).slice(0, 60), msg: redact(msg) };
  const last = LOG[LOG.length - 1];
  if (last && last.code === e.code && last.msg === e.msg && last.level === level) {
    last.n = (last.n || 1) + 1;
    last.at = e.at;
  } else LOG.push(e);
  if (LOG.length > LOG_MAX) LOG = LOG.slice(-LOG_MAX);
  clearTimeout(logTimer);
  logTimer = setTimeout(() => kvPut("log", LOG), 50);
}
async function loadLog() {
  const l = await kvGet("log");
  if (Array.isArray(l)) LOG = l.concat(LOG).slice(-LOG_MAX);
}
window.addEventListener("error", (ev) => {
  const where = ev.filename ? String(ev.filename).split("/").pop() + ":" + ev.lineno + ":" + ev.colno : "";
  logEvent("error", "js.error", (ev.message || "Fehler") + (where ? " @ " + where : ""));
});
window.addEventListener("unhandledrejection", (ev) => {
  const r = ev.reason;
  logEvent("error", "js.promise", (r && (r.message || r.name)) || String(r));
});
document.addEventListener("securitypolicyviolation", (ev) => {
  logEvent("error", "csp", ev.violatedDirective + " " + String(ev.blockedURI || "").split("?")[0]);
});
