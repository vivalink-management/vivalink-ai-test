/* Geräteübergreifende Synchronisierung (Ende-zu-Ende verschlüsselt) – vorbereitet, aktiv erst nach Freigabe.
   Sicherheitskonzept (docs/SYNCHRONISIERUNG.md):
   - Tresor-Schlüssel: 256 Bit Zufall je Tresor (nicht aus einem Code abgeleitet), dazu zufällige Tresor-ID und
     Zugangs-Token (Server speichert nur dessen Hash). Alles bleibt auf den Geräten, nie im Backup, nie auf dem Server.
   - Neues Gerät koppeln: kurzer Einmal-Code (10 Minuten, einmalig) findet nur den Kopplungsplatz. Die Schlüssel werden
     per ECDH-Schlüsselvereinbarung übertragen; beide Geräte zeigen eine 6-stellige Prüfzahl, die du vergleichst und
     bestätigst. Der Code allein reicht nie für einen Zugriff – auch der Server kann nicht mitlesen.
   - Wiederherstellung: Wiederherstellungsschlüssel (160 Bit Zufall) für den Fall, dass alle Geräte verloren sind.
   - Gerät verloren: „Schlüssel erneuern“ legt einen neuen Tresor mit neuem Schlüssel an und sperrt den alten.
   - Zusammenführen über mergeInto (gleiche Konflikterkennung wie bei Backups). Vor jeder Übernahme ein Rückgängig-Punkt. */
const SYNC_FORMAT = "vivalink-sync";
const B32 = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // ohne leicht verwechselbare Zeichen
const syncUrl = () => window.VL_SYNC_URL || ""; // wird erst nach Freigabe gesetzt (js/config.js)
let SYNC = { busy: false, last: null, error: null };
/* Zustand für Befunde (synchron lesbar im Regelmotor): Kopplung, letzter Erfolg, letzter Fehler, Geräte */
let SYNC_STATE = null;
const loadSyncState = async () => {
  const c = syncUrl() ? await kvGet("sync-config") : null;
  SYNC_STATE = c && c.mk ? { revoked: !!c.revoked, last: c.last || null, since: c.since || null, devices: Object.keys(c.devices || {}).length, error: SYNC.error, errorAt: SYNC.errorAt || null } : null;
  return SYNC_STATE;
};
/* Befund, wenn die Synchronisierung gestört ist (nur wenn eingerichtet) */
function syncFinding(now = Date.now()) {
  const c = SYNC_STATE;
  if (!c) return null;
  if (c.revoked) return { sev: 2, title: "Synchronisierung gesperrt – dieses Gerät neu koppeln", detail: "Der Schlüssel wurde auf einem anderen Gerät erneuert. Unter „Mehr › Synchronisierung“ neu koppeln; die Daten auf diesem Gerät bleiben erhalten." };
  const days = c.last ? Math.floor((now - c.last) / 864e5) : null;
  if (c.error && (days == null || days >= 2)) return { sev: 2, title: "Synchronisierung funktioniert seit " + (days == null ? "der Einrichtung" : days + " Tagen") + " nicht", detail: "Letzter Fehler: " + c.error + ". Die App versucht es automatisch weiter; Daten bleiben auf diesem Gerät erhalten." };
  if (c.devices < 2 && c.last && now - (c.since || c.last) > 3 * 864e5) return { sev: 1, title: "Nur dieses Gerät ist mit der Synchronisierung verbunden", detail: "Falls dein anderes Gerät eine eigene Synchronisierung hat: „Mehr › Synchronisierung › Zusammenführen“." };
  return null;
}

/* ---------- Hilfen ---------- */
const rnd = (n) => crypto.getRandomValues(new Uint8Array(n));
const hexOfBytes = (u8) => [...u8].map((x) => x.toString(16).padStart(2, "0")).join("");
async function hexOf(s) {
  return hexOfBytes(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))));
}
const b64 = (u8) => btoa(String.fromCharCode(...u8));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
/* Base32 ohne Verwechslungszeichen; 5 Bit je Zeichen (gleichverteilt) */
function b32(u8) {
  let bits = 0,
    v = 0,
    out = "";
  for (const x of u8) {
    v = (v << 8) | x;
    bits += 8;
    while (bits >= 5) {
      out += B32[(v >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return out;
}
const normCode = (c) => String(c || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const group = (s) => s.match(/.{1,4}/g).join("-");
const devName = () => (/iPad/.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent)) ? "iPad" : /iPhone/.test(navigator.userAgent) ? "iPhone" : "Gerät");

/* ---------- Schlüssel ---------- */
async function hkdfKey(raw, salt, info) {
  const base = await crypto.subtle.importKey("raw", raw, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: new TextEncoder().encode(salt), info: new TextEncoder().encode(info) }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
function newVaultCfg(kv = 1) {
  // since: Zeitpunkt der Einrichtung auf diesem Gerät
  return { vid: hexOfBytes(rnd(16)), token: hexOfBytes(rnd(32)), mk: b64(rnd(32)), kv, since: Date.now(), last: null, version: 0, devices: {}, rid: "", rtok: "", recoveryAt: 0 };
}
/* Zugang zum Tresor: Adresse, Token, Datenschlüssel (aus dem Zufallsschlüssel, an Tresor und Schlüsselversion gebunden) */
async function vaultAccess(cfg) {
  return { id: cfg.vid, token: cfg.token, aad: "vault|" + cfg.vid + "|" + cfg.kv, key: await hkdfKey(unb64(cfg.mk), "vivalink-vault|" + cfg.vid, "vivalink-sync-data|" + cfg.kv) };
}
async function seal(K, obj) {
  const iv = rnd(12);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode(K.aad) }, K.key, new TextEncoder().encode(JSON.stringify(obj))));
  return JSON.stringify({ v: 2, iv: b64(iv), ct: b64(ct) });
}
async function unseal(K, blob) {
  const o = JSON.parse(blob);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(o.iv), additionalData: new TextEncoder().encode(K.aad) }, K.key, unb64(o.ct));
  return JSON.parse(new TextDecoder().decode(pt));
}
/* Wiederherstellungsschlüssel: 160 Bit Zufall, 32 Zeichen in Vierergruppen */
const newRecoveryKey = () => group(b32(rnd(20)));
const validRecovery = (c) => normCode(c).length === 32 && [...normCode(c)].every((x) => B32.includes(x));
async function recoveryAccess(R) {
  const c = normCode(R);
  const id = (await hexOf("vivalink-recovery-id:" + c)).slice(0, 32);
  return { id, token: await hexOf("vivalink-recovery-token:" + c), aad: "recovery|" + id, key: await hkdfKey(new TextEncoder().encode(c), "vivalink-recovery|" + id, "vivalink-recovery-key") };
}

/* Normierte Form zum Vergleich: ohne Zeitstempel und gerätebezogene Felder, Listen nach ID sortiert.
   Verhindert, dass zwei Geräte sich gleichen Inhalt endlos gegenseitig als „neu“ schicken. */
const LOCAL_ONLY = ["conflicts", "lastBackup", "dev", "learned", "accent"]; // accent = Anzeigefarbe je Gerät
const VOLATILE = ["updatedAt", "revs", "at", "warnings", "hints"];
function canon(x) {
  if (Array.isArray(x)) {
    const a = x.map(canon);
    return a.every((e) => e && typeof e === "object" && typeof e.id === "string") ? a.sort((p, q) => (p.id < q.id ? -1 : 1)) : a;
  }
  if (x && typeof x === "object") {
    const o = {};
    // leere Werte (fehlend, null, false, "") gelten als gleich – wie beim Zusammenführen (same in data.js)
    for (const k of Object.keys(x).sort()) if (!VOLATILE.includes(k) && !LOCAL_ONLY.includes(k) && x[k] != null && x[k] !== false && x[k] !== "") o[k] = canon(x[k]);
    return o;
  }
  return x;
}
const syncData = () => {
  const d = clone(S);
  for (const k of ["conflicts", "lastBackup", "dev", "accent"]) delete d[k];
  if (d.studio) delete d.studio.learned;
  return d;
};

/* ---------- Transport: HTTP gegen den Tresor-Server (später Cloudflare Worker); in Tests der lokale Testserver ---------- */
function httpTransport(base) {
  const root = base.replace(/\/$/, "");
  const call = async (method, path, body, token) => {
    const r = await fetch(root + path, { method, cache: "no-store", headers: { ...(token ? { authorization: "Bearer " + token } : {}), ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    return { status: r.status, j };
  };
  const err = (s) => Object.assign(new Error(s === 429 ? "Zu viele Fehlversuche – bitte in 10 Minuten erneut" : "Server " + s), { status: s });
  return {
    async get(K) {
      const { status, j } = await call("GET", "/v1/vault/" + K.id, null, K.token);
      if (status === 404) return null;
      if (status !== 200) throw err(status);
      return j;
    },
    async put(K, blob, expected) {
      const { status, j } = await call("PUT", "/v1/vault/" + K.id, { blob, expected }, K.token);
      if (status === 409) return { conflict: true, ...j };
      if (status !== 200) throw err(status);
      return j;
    },
    async revoke(K) {
      const { status } = await call("DELETE", "/v1/vault/" + K.id, null, K.token);
      return status === 200 || status === 404 || status === 410;
    },
    pair: {
      open: (slot, pubA, ownHash) => call("PUT", "/v1/pair/" + slot, { pubA, ownHash }),
      get: (slot) => call("GET", "/v1/pair/" + slot),
      join: (slot, pubB) => call("POST", "/v1/pair/" + slot + "/join", { pubB }),
      bundle: (slot, own, bundle) => call("POST", "/v1/pair/" + slot + "/bundle", { own, bundle }),
      cancel: (slot, own) => call("DELETE", "/v1/pair/" + slot, { own }),
    },
  };
}
const transport = (t) => t || httpTransport(syncUrl());

/* ---------- Gerätebezogene Einstellung (nicht synchronisiert, nicht im Backup) ---------- */
async function syncCfg() {
  const c = await kvGet("sync-config");
  if (c && !c.mk) {
    // Kopplung aus dem früheren Entwurf (Schlüssel aus Code abgeleitet) – nicht mehr zulässig, neu koppeln
    await kvPut("sync-config", null);
    logEvent("warn", "sync.legacy", "Alte Kopplung entfernt – bitte neu koppeln");
    return null;
  }
  return c || null;
}
const saveCfg = (c) => kvPut("sync-config", c);
async function syncRemove() {
  await kvPut("sync-config", null);
  logEvent("info", "sync.remove", "Kopplung entfernt");
}

/* Erstes Gerät: neuen Tresor anlegen, Daten hochladen, Wiederherstellungsschlüssel erzeugen */
async function syncCreate(t = null) {
  const T = transport(t);
  const cfg = newVaultCfg(1);
  await saveCfg(cfg);
  const r = await syncOnce(T);
  if (!r.ok) {
    await kvPut("sync-config", null);
    return r;
  }
  const R = await writeRecovery(T);
  return { ok: true, recovery: R, detail: "Synchronisierung eingerichtet" };
}
/* Wiederherstellungs-Umschlag: enthält Tresor-Zugang, verschlüsselt mit dem Wiederherstellungsschlüssel */
async function writeRecovery(t = null) {
  const T = transport(t);
  const cfg = await syncCfg();
  if (!cfg) return null;
  const R = newRecoveryKey(),
    K = await recoveryAccess(R);
  const res = await T.put(K, await seal(K, { format: "vivalink-recovery", vid: cfg.vid, token: cfg.token, mk: cfg.mk, kv: cfg.kv }), 0);
  if (res.conflict) throw new Error("Wiederherstellung konnte nicht angelegt werden");
  if (cfg.rid) await T.revoke({ id: cfg.rid, token: cfg.rtok }).catch(() => {}); // alten Schlüssel ungültig machen
  cfg.rid = K.id;
  cfg.rtok = K.token;
  cfg.recoveryAt = Date.now();
  await saveCfg(cfg);
  logEvent("info", "sync.recovery", "Wiederherstellungsschlüssel erzeugt");
  return R;
}
/* Alle Geräte verloren: mit dem Wiederherstellungsschlüssel wieder verbinden */
async function syncRecover(R, t = null) {
  if (!validRecovery(R)) return { ok: false, error: "Ungültiger Wiederherstellungsschlüssel (32 Zeichen)" };
  const T = transport(t),
    K = await recoveryAccess(R);
  let rec;
  try {
    rec = await T.get(K);
  } catch (e) {
    return { ok: false, error: e.status === 410 ? "Dieser Wiederherstellungsschlüssel wurde ersetzt" : e.message };
  }
  if (!rec) return { ok: false, error: "Wiederherstellungsschlüssel unbekannt" };
  let o;
  try {
    o = await unseal(K, rec.blob);
  } catch (e) {
    return { ok: false, error: "Wiederherstellung nicht lesbar – nichts verändert" };
  }
  if (!o || o.format !== "vivalink-recovery" || !o.mk) return { ok: false, error: "Unbekanntes Format – nichts verändert" };
  await saveCfg({ ...newVaultCfg(o.kv), vid: o.vid, token: o.token, mk: o.mk, rid: K.id, rtok: K.token, recoveryAt: Date.now() });
  return { ...(await syncOnce(T)), detail: "Mit Wiederherstellungsschlüssel verbunden" };
}
/* Gerät verloren oder Verdacht auf fremden Zugriff: neuer Tresor, neuer Schlüssel, alter Tresor gesperrt.
   Andere eigene Geräte müssen danach neu gekoppelt werden; das verlorene Gerät erhält keine neuen Daten mehr. */
async function syncRotate(t = null) {
  const T = transport(t);
  const old = await syncCfg();
  if (!old) return { ok: false, error: "Nicht eingerichtet" };
  await syncOnce(T); // vorher letzte Änderungen holen (falls möglich; ein manipulierter Tresor verhindert die Erneuerung nicht)
  const nc = { ...newVaultCfg(old.kv + 1), rid: old.rid, rtok: old.rtok };
  await saveCfg(nc);
  const r = await syncOnce(T);
  if (!r.ok) {
    await saveCfg(old);
    return r;
  }
  await T.revoke({ id: old.vid, token: old.token }).catch(() => {});
  const R = await writeRecovery(T);
  return { ok: true, recovery: R, detail: "Schlüssel erneuert, alter Tresor gesperrt" };
}

/* ---------- Kopplung eines weiteren Geräts (ECDH + Prüfzahl) ---------- */
let PAIR = null;
const pairSlot = async (code) => (await hexOf("vivalink-pair:" + normCode(code))).slice(0, 32);
const newShortCode = () => group(b32(rnd(5))); // 8 Zeichen, nur zum Finden des Kopplungsplatzes
async function ecdhPair() {
  const kp = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
  return { kp, pub: b64(new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey))) };
}
async function pairKey(priv, pubB64, slot) {
  const pub = await crypto.subtle.importKey("raw", unb64(pubB64), { name: "ECDH", namedCurve: "P-256" }, false, []);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: pub }, priv, 256));
  return { aad: "pair|" + slot, key: await hkdfKey(bits, "vivalink-pair|" + slot, "vivalink-pair-v1") };
}
/* Prüfzahl aus beiden öffentlichen Schlüsseln: stimmt sie auf beiden Geräten überein, hat niemand dazwischen getauscht */
async function sasOf(pubA, pubB) {
  const h = await hexOf("vivalink-sas|" + pubA + "|" + pubB);
  return String(parseInt(h.slice(0, 8), 16) % 1e6).padStart(6, "0").replace(/(\d{3})(\d{3})/, "$1 $2");
}
/* Gerät A (bereits gekoppelt): Kopplungsplatz öffnen */
async function pairStart(t = null) {
  const cfg = await syncCfg();
  if (!cfg) return { ok: false, error: "Dieses Gerät ist noch nicht gekoppelt" };
  const T = transport(t),
    code = newShortCode(),
    slot = await pairSlot(code),
    e = await ecdhPair(),
    own = hexOfBytes(rnd(32));
  const r = await T.pair.open(slot, e.pub, await hexOf(own));
  if (r.status !== 201) return { ok: false, error: r.status === 429 ? "Zu viele Versuche – später erneut" : "Kopplung konnte nicht gestartet werden" };
  PAIR = { role: "A", code, slot, kp: e.kp, pubA: e.pub, own, exp: r.j.exp, sas: null, pubB: null };
  return { ok: true, code };
}
/* Gerät A: prüfen, ob sich ein neues Gerät gemeldet hat → Prüfzahl anzeigen */
async function pairCheckA(t = null) {
  if (!PAIR || PAIR.role !== "A") return { state: "none" };
  const r = await transport(t).pair.get(PAIR.slot);
  if (r.status === 404) return (PAIR = null), { state: "expired" };
  if (r.j.pubB && !PAIR.sas) {
    PAIR.pubB = r.j.pubB;
    PAIR.sas = await sasOf(PAIR.pubA, PAIR.pubB);
  }
  return PAIR.sas ? { state: "confirm", sas: PAIR.sas } : { state: "waiting", code: PAIR.code };
}
/* Gerät A: nach Vergleich der Prüfzahl den Tresor-Zugang verschlüsselt übergeben */
async function pairApprove(t = null) {
  if (!PAIR || PAIR.role !== "A" || !PAIR.pubB) return { ok: false, error: "Keine Kopplung offen" };
  const cfg = await syncCfg();
  const K = await pairKey(PAIR.kp.privateKey, PAIR.pubB, PAIR.slot);
  const bundle = await seal(K, { format: "vivalink-pair", vid: cfg.vid, token: cfg.token, mk: cfg.mk, kv: cfg.kv, rid: cfg.rid, rtok: cfg.rtok, recoveryAt: cfg.recoveryAt || null });
  const r = await transport(t).pair.bundle(PAIR.slot, PAIR.own, bundle);
  PAIR = null;
  if (r.status !== 200) return { ok: false, error: "Übergabe fehlgeschlagen – bitte neu starten" };
  return { ok: true, detail: "Weiteres Gerät gekoppelt (Prüfzahl bestätigt)" };
}
async function pairCancel(t = null) {
  if (PAIR && PAIR.role === "A") await transport(t).pair.cancel(PAIR.slot, PAIR.own).catch(() => {});
  PAIR = null;
}
/* Gerät B (neu): mit dem Einmal-Code verbinden → Prüfzahl anzeigen */
async function pairJoin(code, t = null) {
  if (normCode(code).length !== 8 || ![...normCode(code)].every((x) => B32.includes(x))) return { ok: false, error: "Ungültiger Kopplungscode (8 Zeichen)" };
  const T = transport(t),
    slot = await pairSlot(code);
  const g = await T.pair.get(slot);
  if (g.status === 429) return { ok: false, error: "Zu viele Fehlversuche – bitte in 10 Minuten erneut" };
  if (g.status !== 200) return { ok: false, error: "Code unbekannt oder abgelaufen" };
  if (g.j.pubB) return { ok: false, error: "Dieser Code wurde bereits verwendet – auf dem anderen Gerät neu starten" };
  const e = await ecdhPair();
  const j = await T.pair.join(slot, e.pub);
  if (j.status !== 200) return { ok: false, error: "Dieser Code wurde bereits verwendet – auf dem anderen Gerät neu starten" };
  PAIR = { role: "B", slot, kp: e.kp, pubA: g.j.pubA, pubB: e.pub, sas: await sasOf(g.j.pubA, e.pub) };
  return { ok: true, sas: PAIR.sas };
}
/* Gerät B: auf die Bestätigung warten, dann Zugang übernehmen und synchronisieren */
async function pairCheckB(t = null) {
  if (!PAIR || PAIR.role !== "B") return { state: "none" };
  const T = transport(t);
  const r = await T.pair.get(PAIR.slot);
  if (r.status === 404) return (PAIR = null), { state: "expired" };
  if (!r.j.bundle) return { state: "waiting", sas: PAIR.sas };
  let o;
  try {
    o = await unseal(await pairKey(PAIR.kp.privateKey, PAIR.pubA, PAIR.slot), r.j.bundle);
  } catch (e) {
    PAIR = null;
    return { state: "error", error: "Übergabe nicht lesbar – Kopplung abgebrochen" };
  }
  PAIR = null;
  if (!o || o.format !== "vivalink-pair" || !o.mk) return { state: "error", error: "Unbekanntes Format" };
  const next = { ...newVaultCfg(o.kv), vid: o.vid, token: o.token, mk: o.mk, rid: o.rid || "", rtok: o.rtok || "", recoveryAt: o.recoveryAt || null };
  const prev = await syncCfg();
  if (prev && !prev.revoked) return mergeVaults(prev, next, T);
  await saveCfg(next);
  logAction("sync.pair", "gruender", true, "Dieses Gerät gekoppelt");
  const s = await syncOnce(T);
  return { state: "done", ...s };
}
/* Zusammenführen: Dieses Gerät hatte einen EIGENEN Tresor (z. B. beide Geräte haben „Synchronisierung einrichten“
   gewählt) und tritt nun dem Tresor des anderen Geräts bei. Ablauf mit mehrfacher Absicherung:
   1. letzter Stand des eigenen Tresors holen (falls ein weiteres Gerät daran hing) – scheitert das, wird nichts verändert
   2. Sicherungspunkt des Gerätezustands (zusätzlich zu den Rückgängig-Punkten jeder Übernahme)
   3. dem anderen Tresor beitreten: dessen Daten werden mit den eigenen zusammengeführt (nur Hinzufügen/Aktualisieren,
      nie Löschen; gleichzeitige Änderungen werden als Konflikt mit beiden Fassungen festgehalten) und hochgeladen
   4. erst nach Erfolg: alter Tresor und beide bisherigen Wiederherstellungsschlüssel gesperrt, ein neuer Schlüssel erzeugt
   Scheitert Schritt 3, bleibt die bisherige Kopplung unverändert aktiv. */
async function mergeVaults(prev, next, T) {
  if (prev.vid === next.vid) {
    const s = await syncOnce(T);
    return { state: "done", ...s, detail: "Beide Geräte nutzen bereits denselben Datenspeicher" };
  }
  const pre = await syncOnce(T);
  if (!pre.ok) return { state: "error", error: "Eigener Datenspeicher nicht erreichbar – nichts verändert (" + pre.error + ")" };
  await autoSnapshot(true);
  if (!(await makeUndoPoint("Vor dem Zusammenführen der Geräte"))) return { state: "error", error: "Rückgängig-Punkt nicht möglich – nichts verändert" };
  const before = { tasks: S.tasks.length, memory: S.memory.length, posts: (S.studio.posts || []).length, values: S.metrics.reduce((n, m) => n + m.entries.length, 0) };
  await kvPut("sync-prev", { ...prev, at: Date.now() });
  await saveCfg(next);
  const s = await syncOnce(T);
  const after = { tasks: S.tasks.length, memory: S.memory.length, posts: (S.studio.posts || []).length, values: S.metrics.reduce((n, m) => n + m.entries.length, 0) };
  const lost = Object.keys(before).filter((k) => after[k] < before[k]);
  if (!s.ok || lost.length) {
    // Rücknahme: bisherige Kopplung wieder aktiv; zusammengeführte Daten bleiben lokal (nichts gelöscht), Rückgängig-Punkt vorhanden
    await saveCfg(prev);
    await kvPut("sync-prev", null);
    logEvent("error", "sync.merge", s.ok ? "Weniger Einträge nach dem Zusammenführen: " + lost.join(", ") : s.error);
    return { state: "error", error: "Zusammenführen nicht abgeschlossen – bisherige Synchronisierung bleibt aktiv" + (s.ok ? "" : " (" + s.error + ")") };
  }
  await T.revoke({ id: prev.vid, token: prev.token }).catch(() => {});
  if (prev.rid) await T.revoke({ id: prev.rid, token: prev.rtok }).catch(() => {});
  const recovery = await writeRecovery(T).catch(() => null);
  await kvPut("sync-prev", null);
  logAction("sync.merge", "gruender", true, `Geräte zusammengeführt: ${s.pulled} übernommen, ${s.conflicts} Konflikte`);
  return { state: "done", ...s, merged: true, before, after, recovery, detail: "Geräte zusammengeführt" };
}

/* ---------- Ein Synchronisierungsdurchlauf: holen → entschlüsseln → zusammenführen → verschlüsseln → schreiben ---------- */
async function syncOnce(t = null) {
  const cfg = await syncCfg();
  if (!cfg) return { ok: false, error: "Nicht eingerichtet" };
  if (cfg.revoked) return { ok: false, error: "Diese Kopplung wurde gesperrt (Schlüssel erneuert) – bitte dieses Gerät neu koppeln" };
  if (!syncUrl() && !t) return { ok: false, error: "Kein Synchronisierungs-Server freigegeben" };
  if (SYNC.busy) return { ok: false, error: "Läuft bereits" };
  SYNC.busy = true;
  const T = transport(t);
  const rep = { pulled: 0, conflicts: 0, pushed: false };
  try {
    const K = await vaultAccess(cfg);
    for (let attempt = 0; attempt < 4; attempt++) {
      let remote;
      try {
        remote = await T.get(K);
      } catch (e) {
        if (e.status === 410) {
          cfg.revoked = true;
          await saveCfg(cfg);
          throw new Error("Diese Kopplung wurde gesperrt (Schlüssel erneuert) – bitte dieses Gerät neu koppeln");
        }
        throw e;
      }
      // Tresor fehlt, obwohl schon synchronisiert wurde: nicht still neu anlegen (Schutz vor Datenverlust/Verwechslung)
      if (!remote && cfg.version > 0) throw new Error("Daten auf dem Server nicht gefunden – nichts verändert. Unter „Synchronisierung“ den Schlüssel erneuern.");
      let remotePayload = null;
      if (remote) {
        let payload;
        try {
          payload = await unseal(K, remote.blob);
        } catch (e) {
          throw new Error("Daten auf dem Server lassen sich nicht entschlüsseln (falscher Schlüssel oder beschädigt) – nichts verändert");
        }
        if (!payload || payload.format !== SYNC_FORMAT || !payload.data || !Array.isArray(payload.data.memory)) throw new Error("Unbekanntes Datenformat – nichts verändert");
        remotePayload = payload;
        const inc = cleanIncoming(payload.data, payload.aitest);
        const preview = mergeInto(clone(S), clone(inc));
        if (preview.added + preview.updated + preview.conflicts > 0) {
          if (!(await makeUndoPoint("Synchronisierung"))) throw new Error("Rückgängig-Punkt nicht möglich – nichts verändert");
          const r = mergeInto(S, inc);
          rep.pulled += r.added + r.updated;
          rep.conflicts += r.conflicts;
          if (inc.aitest.length) {
            const l = (await aiLoad()) || [];
            for (const x of inc.aitest) if (!l.some((y) => y.id === x.id)) l.push(x);
            await aiSave(l);
          }
          await save();
        }
      }
      const data = syncData();
      const devices = { ...((remotePayload && remotePayload.devices) || {}) };
      const mine = devices[S.dev];
      const same = remote && remotePayload && JSON.stringify(canon(data)) === JSON.stringify(canon(remotePayload.data)) && mine && Date.now() - mine.at < 864e5;
      if (same) {
        // Inhalt identisch: nichts schreiben (kein Hin und Her zwischen den Geräten)
        Object.assign(cfg, { last: Date.now(), version: remote.version, devices });
        await saveCfg(cfg);
        SYNC.last = cfg.last;
        SYNC.error = null;
        return { ok: true, ...rep, version: remote.version };
      }
      devices[S.dev] = { name: devName(), at: Date.now() };
      const blob = await seal(K, { format: SYNC_FORMAT, schema: SCHEMA, app: APP_VERSION, device: S.dev, at: Date.now(), devices, data, aitest: (await aiLoad()) || [] });
      const res = await T.put(K, blob, remote ? remote.version : 0);
      if (res.conflict) continue; // anderes Gerät hat zwischendurch geschrieben → erneut holen und zusammenführen
      rep.pushed = true;
      Object.assign(cfg, { last: Date.now(), version: res.version, devices });
      await saveCfg(cfg);
      SYNC.last = cfg.last;
      SYNC.error = null;
      logEvent("info", "sync.ok", `übernommen ${rep.pulled}, Konflikte ${rep.conflicts}, Version ${res.version}`);
      return { ok: true, ...rep, version: res.version };
    }
    throw new Error("Zu viele gleichzeitige Änderungen – später erneut versuchen");
  } catch (e) {
    SYNC.error = e.message;
    logEvent("error", "sync.fail", e.message);
    return { ok: false, error: e.message, ...rep };
  } finally {
    SYNC.busy = false;
    if (SYNC.error) SYNC.errorAt = Date.now();
    await loadSyncState().catch(() => {});
  }
}
/* Automatisch: beim Start und kurz nach Änderungen (nur wenn eingerichtet und online) */
let syncTimer = null;
function syncSoon(ms = 4000) {
  if (!syncUrl() || SYNC.busy) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(async () => {
    const c = navigator.onLine !== false && (await syncCfg());
    if (c && !c.revoked) {
      const r = await act("sync.run", "auto", () => syncOnce());
      if (r.ok && (r.pulled || r.conflicts)) render();
    }
  }, ms);
}

/* ---------- Oberfläche (Bereich „Mehr“) ---------- */
let pairTimer = null;
const stopPairPoll = () => (clearInterval(pairTimer), (pairTimer = null));
function recoveryHtml(R) {
  return `<div class="card rec warn" id="syRec"><b>Dein Wiederherstellungsschlüssel</b><p>Nur damit kommst du an deine Daten, wenn alle Geräte verloren sind. Er wird <b>nur jetzt</b> angezeigt. Bewahre ihn offline auf (z. B. ausgedruckt oder im Passwort-Manager), nicht in einer unverschlüsselten Notiz.</p><textarea readonly id="syRecKey" rows="2" style="font-family:ui-monospace,monospace;font-size:17px;min-height:0;resize:none">${esc(R)}</textarea><div class="row"><button class="s" data-a="syRecCopy">Kopieren</button><button class="s p" data-a="syRecDone">Ich habe ihn sicher aufbewahrt</button></div></div>`;
}
async function syncSheet(extra = "") {
  stopPairPoll();
  const cfg = await syncCfg();
  if (!syncUrl()) {
    sheet(`<h1>Synchronisierung</h1><div class="card rec warn">Noch nicht freigegeben. Für die Synchronisierung zwischen iPhone und iPad wird ein kostenloser Speicher benötigt (Empfehlung: Cloudflare, siehe Projektübersicht). Die Einrichtung erfolgt erst nach deiner Entscheidung.</div><p class="mut">Bis dahin sichert die App täglich automatisch auf jedem Gerät.</p><button data-a="close">Schließen</button>`);
    return;
  }
  const devs = cfg ? Object.entries(cfg.devices || {}) : [];
  sheet(`<h1>Synchronisierung</h1><p class="mut">Ende-zu-Ende verschlüsselt mit einem zufälligen 256-Bit-Schlüssel, der nur auf deinen Geräten liegt. Der Server sieht nur verschlüsselte Daten.</p>${extra}
${
  cfg
    ? `<div class="card"><div>Status: <b>${cfg.revoked ? "gesperrt – neu koppeln" : SYNC.error ? "Fehler" : "gekoppelt"}</b></div><div class="mut">Letzte Synchronisierung: ${cfg.last ? new Date(cfg.last).toLocaleString("de-DE") : "noch keine"}${SYNC.error ? " · " + esc(SYNC.error) : ""}</div>${devs.length ? `<div class="mut" style="margin-top:4px">Geräte: ${devs.map(([id, d]) => `${esc(d.name)}${id === S.dev ? " (dieses)" : ""} · ${new Date(d.at).toLocaleDateString("de-DE")}`).join(" · ")}</div>` : ""}<div class="mut">Wiederherstellungsschlüssel: ${cfg.recoveryAt ? "erstellt am " + new Date(cfg.recoveryAt).toLocaleDateString("de-DE") : "fehlt"}</div></div>
<div class="row"><button class="p" data-a="syNow">Jetzt synchronisieren</button><button data-a="syAdd">Weiteres Gerät koppeln</button></div>
<div id="syPair"></div>
${devs.length < 2 && !cfg.revoked ? `<div class="card rec warn" id="syMergeCard"><b>Nur dieses Gerät ist verbunden</b><p>Hat dein anderes Gerät eine <b>eigene</b> Synchronisierung eingerichtet? Dann hier zusammenführen – es geht nichts verloren, beide Datenstände werden vereint:</p><ol style="margin:4px 0 8px 18px;padding:0"><li>Auf dem <b>anderen</b> Gerät: „Mehr › Synchronisierung › Weiteres Gerät koppeln“.</li><li>Den Code hier eingeben und „Zusammenführen“ tippen.</li><li>Prüfzahl vergleichen und auf dem anderen Gerät bestätigen.</li></ol><input id="syMergeIn" placeholder="XXXX-XXXX" autocapitalize="characters" autocomplete="off"><button data-a="syMerge">Zusammenführen</button></div>` : ""}
<h2>Sicherheit</h2><div class="row"><button data-a="syRecNew">Neuen Wiederherstellungsschlüssel</button><button data-a="syRotate">Gerät verloren: Schlüssel erneuern</button><button data-a="syOff">Kopplung auf diesem Gerät entfernen</button></div><p class="mut" style="font-size:12px">„Schlüssel erneuern“ sperrt den bisherigen Tresor. Ein verlorenes Gerät erhält danach keine neuen Daten mehr; deine anderen Geräte koppelst du einmal neu.</p><button data-a="close">Schließen</button>`
    : `<div class="card"><b>Erstes Gerät</b><p class="mut">Legt einen neuen, verschlüsselten Tresor an und zeigt einmalig deinen Wiederherstellungsschlüssel.</p><button class="p" data-a="syNew">Synchronisierung einrichten</button></div>
<div class="card"><b>Weiteres Gerät</b><p class="mut">Auf dem bereits gekoppelten Gerät „Weiteres Gerät koppeln“ tippen und den 8-stelligen Code hier eingeben. Danach vergleichst du eine Prüfzahl auf beiden Geräten.</p><input id="syIn" placeholder="XXXX-XXXX" autocapitalize="characters" autocomplete="off"><button data-a="syJoin">Verbinden</button><div id="syPair"></div></div>
<div class="card"><b>Alle Geräte verloren?</b><label>Wiederherstellungsschlüssel</label><input id="syRecIn" placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX" autocapitalize="characters" autocomplete="off"><button data-a="syRecover">Wiederherstellen</button></div><button data-a="close">Schließen</button>`
}`);
}
const syncMsg = (s) => (s.ok ? "Synchronisiert" + (s.pulled ? ` · ${s.pulled} Einträge übernommen` : "") + (s.conflicts ? ` · ${s.conflicts} Konflikt(e)` : "") : s.error);
function pairBox(h) {
  const b = $("#syPair");
  if (b) b.innerHTML = h;
}
async function syncAction(a) {
  if (a === "sync") return syncSheet();
  if (a === "syNew") {
    const r = await act("sync.pair", "gruender", () => syncCreate());
    toast(r.ok ? "Synchronisierung eingerichtet" : r.error);
    render();
    return syncSheet(r.ok && r.recovery ? recoveryHtml(r.recovery) : "");
  }
  if (a === "syRecCopy") {
    try {
      await navigator.clipboard.writeText(val("syRecKey"));
      return toast("Kopiert – bitte sicher ablegen und danach die Zwischenablage leeren");
    } catch (e) {
      $("#syRecKey").select();
      return toast("Markiert. Bitte manuell kopieren.");
    }
  }
  if (a === "syRecDone") return ($("#syRec") && $("#syRec").remove(), toast("Gut aufbewahren!"));
  if (a === "syRecNew") {
    const R = await writeRecovery().catch((e) => (toast(e.message), null));
    if (R) syncSheet(recoveryHtml(R));
    return;
  }
  if (a === "syRecover") {
    const r = await act("sync.pair", "gruender", () => syncRecover(val("syRecIn")));
    toast(syncMsg(r));
    render();
    return syncSheet();
  }
  if (a === "syAdd") {
    const r = await pairStart();
    if (!r.ok) return toast(r.error);
    pairBox(`<div class="card"><b>Code für das neue Gerät</b><div style="font-size:30px;font-weight:800;letter-spacing:3px;margin:6px 0" id="syCodeOut">${esc(r.code)}</div><div class="mut">10 Minuten gültig, nur einmal verwendbar. Warte auf das neue Gerät …</div><button class="s" data-a="syPairCancel">Abbrechen</button></div>`);
    pairTimer = setInterval(async () => {
      // Fenster geschlossen → Kopplung abbrechen, nicht weiter beim Server nachfragen
      if ($("#sheet").hidden || !$("#syPair")) return stopPairPoll(), pairCancel();
      const s = await pairCheckA();
      if (s.state === "confirm") {
        stopPairPoll();
        pairBox(`<div class="card rec warn"><b>Prüfzahl vergleichen</b><div style="font-size:30px;font-weight:800;margin:6px 0" id="sySas">${esc(s.sas)}</div><p>Steht auf dem neuen Gerät <b>genau dieselbe Zahl</b>? Nur dann bestätigen. Bei einer anderen Zahl: abbrechen.</p><div class="row"><button class="p" data-a="syPairOk">Zahl stimmt – verbinden</button><button data-a="syPairCancel">Abbrechen</button></div></div>`);
      } else if (s.state === "expired") {
        stopPairPoll();
        pairBox('<div class="card rec warn">Code abgelaufen oder abgebrochen. Bitte neu starten.</div>');
      }
    }, 2000);
    return;
  }
  if (a === "syPairOk") {
    const r = await act("sync.pair", "gruender", () => pairApprove());
    toast(r.ok ? "Gerät gekoppelt" : r.error);
    if (r.ok) [15000, 45000].forEach((ms) => setTimeout(() => syncOnce().then((x) => x.ok && (x.pulled || x.conflicts) && render()), ms)); // Daten des anderen Geräts abholen
    return syncSheet();
  }
  if (a === "syPairCancel") {
    stopPairPoll();
    await pairCancel();
    return syncSheet();
  }
  if (a === "syJoin" || a === "syMerge") {
    const r = await pairJoin(val(a === "syMerge" ? "syMergeIn" : "syIn"));
    if (!r.ok) return toast(r.error);
    pairBox(`<div class="card rec warn"><b>Prüfzahl</b><div style="font-size:30px;font-weight:800;margin:6px 0" id="sySas">${esc(r.sas)}</div><div class="mut">Vergleiche sie mit der Zahl auf dem anderen Gerät und bestätige dort. Warte auf Bestätigung …</div></div>`);
    pairTimer = setInterval(async () => {
      if ($("#sheet").hidden || !$("#syPair")) return stopPairPoll(), (PAIR = null);
      const s = await pairCheckB();
      if (s.state === "waiting") return;
      stopPairPoll();
      if (s.state === "done") {
        toast(s.merged ? `Zusammengeführt: ${s.pulled} Einträge übernommen` + (s.conflicts ? `, ${s.conflicts} Konflikt(e) zur Prüfung` : "") : syncMsg(s));
        render();
        syncSheet(s.merged ? `<div class="card" id="syMerged"><b>Beide Geräte nutzen jetzt denselben Datenspeicher.</b> Das andere Gerät übernimmt die vereinten Daten beim nächsten Öffnen automatisch. Der bisherige zweite Speicher wurde gesperrt.</div>` + (s.recovery ? recoveryHtml(s.recovery) + '<p class="mut">Dieser neue Wiederherstellungsschlüssel ersetzt <b>beide</b> bisherigen.</p>' : "") : "");
      } else pairBox(`<div class="card rec bad">${esc(s.error || "Kopplung abgebrochen oder abgelaufen")}</div>`);
    }, 2000);
    return;
  }
  if (a === "syNow") {
    const s = await syncOnce();
    toast(syncMsg(s));
    render();
    return syncSheet();
  }
  if (a === "syRotate") {
    if (window._srot !== 1) {
      window._srot = 1;
      return toast("Nochmal tippen: Neuer Schlüssel, alter Tresor wird gesperrt, andere Geräte neu koppeln");
    }
    window._srot = 0;
    const r = await act("sync.rotate", "gruender", () => syncRotate());
    toast(r.ok ? "Schlüssel erneuert – andere Geräte bitte neu koppeln" : r.error);
    return syncSheet(r.ok && r.recovery ? recoveryHtml(r.recovery) : "");
  }
  if (a === "syOff") {
    if (window._so !== 1) {
      window._so = 1;
      return toast("Nochmal tippen: Kopplung auf diesem Gerät entfernen (Daten bleiben erhalten)");
    }
    window._so = 0;
    await syncRemove();
    toast("Kopplung entfernt");
    return syncSheet();
  }
}
