/* Freigabelogik und Aktionsprotokoll
   Grundlage für spätere selbstständige Arbeit: Jede Handlung der Management AI hat eine feste Stufe.
   Stufe 0: automatisch · Stufe 1: automatisch mit Rückgängig-Punkt · Stufe 2: nur nach Freigabe des Gründers
   Stufe 3: nie automatisch (Geschäftsentscheidungen, Zahlungen, Preise, Produktivsysteme) – die App lehnt ab.
   Das Protokoll liegt nur auf dem Gerät (enthält keine Inhalte, nur Art, Zeitpunkt, Ergebnis). */
const POLICY = {
  "snapshot.auto": { lvl: 0, n: "Automatischer Sicherungspunkt" },
  "studio.autoDraft": { lvl: 0, n: "Instagram-Entwurf aus bestätigten Fakten vorbereiten" },
  "kpi.fetch": { lvl: 0, n: "Kennzahlen aus der Verwaltung abrufen (nur lesend)" },
  "sync.run": { lvl: 1, n: "Geräte synchronisieren (mit Rückgängig-Punkt)" },
  "sync.pair": { lvl: 2, n: "Gerät koppeln (Prüfzahl bestätigt) oder Synchronisierung einrichten" },
  "sync.rotate": { lvl: 2, n: "Synchronisierungs-Schlüssel erneuern und alten Tresor sperren" },
  "grant.manage": { lvl: 2, n: "Berechtigungen erteilen oder widerrufen" },
  "task.setup": { lvl: 2, n: "Aufgaben-Kanal für geplante KI-Aufgaben einrichten" },
  "task.publish": { lvl: 1, n: "Auftrag mit öffentlichen Fakten für die geplante KI-Aufgabe bereitstellen" },
  "task.fetch": { lvl: 0, n: "Ergebnisse der geplanten KI-Aufgabe als Entwürfe übernehmen" },
  "measure.start": { lvl: 2, n: "Maßnahme starten" },
  "post.approve": { lvl: 2, n: "Instagram-Beitrag freigeben" },
  "post.publish": { lvl: 2, n: "Freigegebenen Instagram-Beitrag veröffentlichen" },
  "post.publishUnapproved": { lvl: 3, n: "Nicht freigegebenen Beitrag veröffentlichen" },
  "price.change": { lvl: 3, n: "Preise festlegen oder ändern" },
  "payment.trigger": { lvl: 3, n: "Zahlungen oder Erstattungen auslösen" },
  "ads.paid": { lvl: 3, n: "Bezahlte Werbung starten" },
  "prod.write": { lvl: 3, n: "Produktive Vivalink-Datenbank oder -App ändern" },
  "service.paid": { lvl: 3, n: "Kostenpflichtigen Dienst aktivieren" },
};
const LVL = ["automatisch", "automatisch mit Rückgängig-Punkt", "nur nach deiner Freigabe", "nie automatisch"];
let ACTIONS = [];
const ACT_MAX = 300;
async function loadActions() {
  const l = await kvGet("actions");
  if (Array.isArray(l)) ACTIONS = l.concat(ACTIONS).slice(-ACT_MAX);
}
/* Darf diese Handlung ausgeführt werden? by: "auto" (App selbst) oder "gruender" (bewusste Bedienung) */
function mayRun(name, by = "auto") {
  const p = POLICY[name];
  if (!p) return { ok: false, why: "Unbekannte Handlung – aus Sicherheitsgründen abgelehnt" };
  if (p.lvl >= 3) return { ok: false, why: "Stufe 3 (" + LVL[3] + "): " + p.n };
  if (p.lvl === 2 && by !== "gruender") {
    // Automatisch nur mit aktiver, befristeter und begrenzter Berechtigung des Gründers (js/autonomy.js)
    const g = by === "auto" && typeof grantAllows === "function" ? grantAllows(name) : { ok: false, why: "Stufe 2: braucht deine Freigabe" };
    return g.ok ? { ok: true, grant: g.g.id } : { ok: false, why: g.why };
  }
  return { ok: true };
}
function logAction(name, by, ok, detail, grant) {
  const p = POLICY[name] || { lvl: 3 };
  ACTIONS.push({ at: Date.now(), name, lvl: p.lvl, by, ok, detail: redact(detail || "").slice(0, 160), ...(grant ? { grant } : {}) });
  if (ACTIONS.length > ACT_MAX) ACTIONS = ACTIONS.slice(-ACT_MAX);
  kvPut("actions", ACTIONS);
}
/* Führt eine Handlung nur aus, wenn die Freigabelogik sie erlaubt – und protokolliert beides. */
const GRANT_PENDING = {};
async function act(name, by, fn) {
  const m = mayRun(name, by);
  if (!m.ok) {
    logAction(name, by, false, "abgelehnt: " + m.why);
    return { ok: false, refused: true, error: m.why };
  }
  // Nutzung einer Berechtigung sofort vormerken (verhindert Überschreiten des Limits bei gleichzeitigen Abläufen)
  if (m.grant) GRANT_PENDING[m.grant] = (GRANT_PENDING[m.grant] || 0) + 1;
  try {
    const r = await fn();
    logAction(name, by, !(r && r.ok === false), (m.grant ? "mit Berechtigung: " : "") + (r && r.detail ? r.detail : ""), m.grant);
    return r;
  } catch (e) {
    logAction(name, by, false, e.message, m.grant);
    throw e;
  } finally {
    if (m.grant) GRANT_PENDING[m.grant]--;
  }
}

/* ---------- Veröffentlichungsschutz (manuell heute, automatisch später – gleiche Regeln) ---------- */
/* Ein Beitrag kann nur einmal veröffentlicht werden, nur wenn er freigegeben ist und seit der Freigabe unverändert blieb. */
function canPublish(p) {
  if (!p || p.deleted) return { ok: false, why: "Beitrag gelöscht" };
  if (p.status === "veroeffentlicht" || (p.publish && p.publish.state === "erledigt")) return { ok: false, why: "Bereits veröffentlicht – doppelte Veröffentlichung verhindert" };
  if (p.publish && p.publish.state === "laeuft" && Date.now() - p.publish.at < 10 * 60e3) return { ok: false, why: "Veröffentlichung läuft bereits" };
  if (p.demo) return { ok: false, why: "Demo-Beitrag aus der Testversion – wird nie veröffentlicht" };
  if (p.status !== "freigegeben") return { ok: false, why: "Nicht freigegeben – Veröffentlichung nur nach deiner Freigabe" };
  if (p.approvedHash && p.approvedHash !== postHash(p)) return { ok: false, why: "Seit der Freigabe verändert – bitte erneut freigeben" };
  return { ok: true };
}
/* Fingerabdruck des veröffentlichten Inhalts (Text, Folien, Termin) */
const postHash = (p) => JSON.stringify([p.caption, p.hashtags, p.slides, p.type, p.date, p.variant].concat(p.photo && p.photo.consent ? [p.photo.id] : []));
function approvePost(p) {
  p.status = "freigegeben";
  p.approvedAt = Date.now();
  p.approvedHash = postHash(p);
  touch(p);
}
function claimPublish(p, channel) {
  const c = canPublish(p);
  if (!c.ok) return c;
  p.publish = { state: "laeuft", at: Date.now(), channel, key: p.id };
  touch(p);
  return { ok: true };
}
function finishPublish(p, ok, info = {}) {
  if (!p.publish || p.publish.state !== "laeuft") return false;
  if (ok) {
    p.publish = { ...p.publish, state: "erledigt", doneAt: Date.now(), mediaId: info.mediaId || null, permalink: info.permalink || null };
    p.status = "veroeffentlicht";
    p.publishedAt = Date.now();
  } else p.publish = { ...p.publish, state: "fehler", error: redact(info.error || "Fehler").slice(0, 160) };
  touch(p);
  return true;
}
/* Manuelle Veröffentlichung (Teilen) als „veröffentlicht“ festhalten – über dieselben Schutzregeln */
function markPublishedManually(p) {
  const c = claimPublish(p, "manuell");
  if (!c.ok) return c;
  finishPublish(p, true);
  return { ok: true };
}
function actionsHtml() {
  const L = ACTIONS.slice(-20).reverse();
  return `<h2>Aktionsprotokoll</h2><p class="mut">Was die App selbst getan oder abgelehnt hat (Stufen: 0 automatisch · 1 mit Rückgängig-Punkt · 2 nur nach Freigabe · 3 nie automatisch).</p>${
    L.length ? L.map((a) => `<div class="card ${a.ok ? "" : "rec warn"}" data-action="${esc(a.name)}"><div class="row sp"><b>${esc((POLICY[a.name] || {}).n || a.name)}</b><span class="mut">${new Date(a.at).toLocaleString("de-DE")}</span></div><div class="mut">Stufe ${a.lvl} · ${a.by === "gruender" ? "durch dich" : "automatisch"} · ${a.ok ? "ausgeführt" : "nicht ausgeführt"}${a.detail ? " · " + esc(a.detail) : ""}</div></div>`).join("") : '<p class="mut">Noch keine Einträge.</p>'
  }`;
}
