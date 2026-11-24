/* Geräteübergreifende Synchronisierung (Ende-zu-Ende verschlüsselt) – vorbereitet, aktiv erst nach Freigabe.
   - Kopplungscode: 128 Bit Zufall, nur auf den Geräten gespeichert (nie im Backup, nie auf dem Server).
   - Daraus abgeleitet: Tresor-ID (Adresse), Zugangs-Token (Server speichert nur dessen Hash) und Schlüssel (PBKDF2 → AES-GCM 256).
   - Der Server sieht nur verschlüsselte Daten und eine Versionsnummer. Protokoll: server/vault-core.mjs.
   - Zusammenführen über mergeInto (gleiche Konflikterkennung wie bei Backups). Vor jeder Übernahme ein Rückgängig-Punkt. */
const SYNC_FORMAT = "vivalink-sync";
const B32 = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // ohne leicht verwechselbare Zeichen
const syncUrl = () => window.VL_SYNC_URL || ""; // wird erst nach Freigabe gesetzt (js/config.js)
let SYNC = { busy: false, last: null, error: null };

function newPairCode() {
  const r = crypto.getRandomValues(new Uint8Array(20));
  const s = [...r].map((x) => B32[x % 32]).join("");
  return s.match(/.{4}/g).join("-");
}
const normCode = (c) => String(c || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const validCode = (c) => normCode(c).length === 20 && [...normCode(c)].every((x) => B32.includes(x));
async function hexOf(s) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
const b64 = (u8) => btoa(String.fromCharCode(...u8));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function vaultKeys(code) {
  const c = normCode(code);
  const id = (await hexOf("vivalink-vault-id:" + c)).slice(0, 32);
  const token = await hexOf("vivalink-vault-token:" + c);
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(c), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey({ name: "PBKDF2", salt: new TextEncoder().encode("vivalink-vault-key:" + id), iterations: 210000, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  return { id, token, key };
}
async function seal(K, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, K.key, new TextEncoder().encode(JSON.stringify(obj))));
  return JSON.stringify({ v: 1, iv: b64(iv), ct: b64(ct) });
}
async function unseal(K, blob) {
  const o = JSON.parse(blob);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(o.iv) }, K.key, unb64(o.ct));
  return JSON.parse(new TextDecoder().decode(pt));
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

/* Transport: HTTP gegen den Tresor-Server (später Cloudflare Worker). In Tests: lokaler Testserver. */
function httpTransport(base) {
  const u = (id) => base.replace(/\/$/, "") + "/v1/vault/" + id;
  return {
    async get(K) {
      const r = await fetch(u(K.id), { headers: { authorization: "Bearer " + K.token }, cache: "no-store" });
      if (r.status === 404) return null;
      if (!r.ok) throw Object.assign(new Error("Server " + r.status), { status: r.status });
      return r.json();
    },
    async put(K, blob, expected) {
      const r = await fetch(u(K.id), { method: "PUT", headers: { authorization: "Bearer " + K.token, "content-type": "application/json" }, body: JSON.stringify({ blob, expected }) });
      if (r.status === 409) return { conflict: true, ...(await r.json()) };
      if (!r.ok) throw Object.assign(new Error("Server " + r.status), { status: r.status });
      return r.json();
    },
  };
}

/* Gerätebezogene Einstellung (nicht synchronisiert, nicht im Backup) */
const syncCfg = async () => (await kvGet("sync-config")) || null;
async function syncSetup(code) {
  if (!validCode(code)) return { ok: false, error: "Ungültiger Kopplungscode" };
  await kvPut("sync-config", { code: normCode(code), since: Date.now(), last: null, version: 0 });
  logEvent("info", "sync.setup", "Gerät gekoppelt");
  return { ok: true };
}
async function syncRemove() {
  await kvPut("sync-config", null);
  logEvent("info", "sync.remove", "Kopplung entfernt");
}

/* Ein Synchronisierungsdurchlauf: holen → entschlüsseln → zusammenführen → verschlüsseln → schreiben. */
async function syncOnce(transport = null) {
  const cfg = await syncCfg();
  if (!cfg) return { ok: false, error: "Nicht eingerichtet" };
  if (!syncUrl() && !transport) return { ok: false, error: "Kein Synchronisierungs-Server freigegeben" };
  if (SYNC.busy) return { ok: false, error: "Läuft bereits" };
  SYNC.busy = true;
  const T = transport || httpTransport(syncUrl());
  const rep = { pulled: 0, conflicts: 0, pushed: false };
  try {
    const K = await vaultKeys(cfg.code);
    for (let attempt = 0; attempt < 4; attempt++) {
      const remote = await T.get(K);
      let remotePayload = null;
      if (remote) {
        let payload;
        try {
          payload = await unseal(K, remote.blob);
        } catch (e) {
          throw new Error("Daten auf dem Server lassen sich nicht entschlüsseln (falscher Code oder beschädigt) – nichts verändert");
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
      const same = remote && remotePayload && JSON.stringify(canon(data)) === JSON.stringify(canon(remotePayload.data));
      if (same) {
        // Inhalt identisch: nichts schreiben (kein Hin und Her zwischen den Geräten)
        cfg.last = Date.now();
        cfg.version = remote.version;
        await kvPut("sync-config", cfg);
        SYNC.last = cfg.last;
        SYNC.error = null;
        return { ok: true, ...rep, version: remote.version };
      }
      const blob = await seal(K, { format: SYNC_FORMAT, schema: SCHEMA, app: APP_VERSION, device: S.dev, at: Date.now(), data, aitest: (await aiLoad()) || [] });
      const res = await T.put(K, blob, remote ? remote.version : 0);
      if (res.conflict) continue; // anderes Gerät hat zwischendurch geschrieben → erneut holen und zusammenführen
      rep.pushed = true;
      cfg.last = Date.now();
      cfg.version = res.version;
      await kvPut("sync-config", cfg);
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
  }
}
/* Automatisch: beim Start und kurz nach Änderungen (nur wenn eingerichtet und online) */
let syncTimer = null;
function syncSoon(ms = 4000) {
  if (!syncUrl() || SYNC.busy) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(async () => {
    if (navigator.onLine !== false && (await syncCfg())) {
      const r = await act("sync.run", "auto", () => syncOnce());
      if (r.ok && (r.pulled || r.conflicts)) render();
    }
  }, ms);
}

/* ---------- Oberfläche (Bereich „Mehr“) ---------- */
async function syncSheet() {
  const cfg = await syncCfg();
  const url = syncUrl();
  if (!url) {
    sheet(`<h1>Synchronisierung</h1><div class="card rec warn">Noch nicht freigegeben. Für die Synchronisierung zwischen iPhone und iPad wird ein kostenloser Speicher benötigt (Empfehlung: Cloudflare, siehe Projektübersicht). Die Einrichtung erfolgt erst nach deiner Entscheidung.</div><p class="mut">Bis dahin sichert die App täglich automatisch auf jedem Gerät.</p><button data-a="close">Schließen</button>`);
    return;
  }
  sheet(`<h1>Synchronisierung</h1><p class="mut">Ende-zu-Ende verschlüsselt: Der Server sieht nur verschlüsselte Daten. Der Kopplungscode bleibt auf deinen Geräten – bewahre ihn sicher auf.</p>
${cfg ? `<div class="card"><div>Status: <b>${SYNC.error ? "Fehler" : "gekoppelt"}</b></div><div class="mut">Letzte Synchronisierung: ${cfg.last ? new Date(cfg.last).toLocaleString("de-DE") : "noch keine"}${SYNC.error ? " · " + esc(SYNC.error) : ""}</div><label>Kopplungscode (für das andere Gerät)</label><input readonly id="syCode" value="${esc(normCode(cfg.code).match(/.{4}/g).join("-"))}"></div><div class="row"><button class="p" data-a="syNow">Jetzt synchronisieren</button><button data-a="syOff">Kopplung entfernen</button><button data-a="close">Schließen</button></div>` : `<div class="card"><b>Erstes Gerät</b><p class="mut">Erzeugt einen neuen Kopplungscode.</p><button class="p" data-a="syNew">Neue Synchronisierung einrichten</button></div><div class="card"><b>Weiteres Gerät</b><label>Kopplungscode vom ersten Gerät</label><input id="syIn" placeholder="XXXX-XXXX-XXXX-XXXX-XXXX" autocapitalize="characters"><button data-a="syJoin">Verbinden</button></div><button data-a="close">Schließen</button>`}`);
}
async function syncAction(a) {
  if (a === "sync") return syncSheet();
  if (a === "syNew" || a === "syJoin") {
    const code = a === "syNew" ? newPairCode() : val("syIn");
    const r = await syncSetup(code);
    if (!r.ok) return toast(r.error);
    const s = await syncOnce();
    toast(s.ok ? "Synchronisiert" + (s.pulled ? ` · ${s.pulled} Einträge übernommen` : "") + (s.conflicts ? ` · ${s.conflicts} Konflikt(e)` : "") : s.error);
    render();
    return syncSheet();
  }
  if (a === "syNow") {
    const s = await syncOnce();
    toast(s.ok ? "Synchronisiert" + (s.pulled ? ` · ${s.pulled} Einträge übernommen` : "") + (s.conflicts ? ` · ${s.conflicts} Konflikt(e)` : "") : s.error);
    render();
    return syncSheet();
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
