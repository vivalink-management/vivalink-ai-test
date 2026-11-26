/* Anbindung der Vivalink-Verwaltung (Rork/Supabase) – vorbereitet, aktiv erst nach Umsetzung und Freigabe.
   - Nur zusammengefasste Kennzahlen (keine Personendaten), Format: {format:"vivalink-kpis", version:1, generatedAt, values:[{key,date,value,source}]}
   - Kopplung per Einmalcode aus der Verwaltung → widerrufbarer Gerätezugang (Token nur auf diesem Gerät gespeichert)
   - Strikte Prüfung: unbekannte Felder oder Hinweise auf Personendaten → komplette Antwort wird abgelehnt
   - Historie: jeder Tageswert wird als Kennzahl-Eintrag (Quelle „verwaltung“) gespeichert und synchronisiert. */
const KPI_FORMAT = "vivalink-kpis";
const kpiUrl = () => window.VL_KPI_URL || "";
const KPI_TOP = ["format", "version", "generatedAt", "values", "meta"];
const KPI_VAL = ["key", "date", "value", "source"];
const KPI_META = ["excludesTestAccounts", "excludesDemoMeetups", "timezone"];
const KPI_MEETUP = ["meetup_days", "meetup_capacity"]; // keine Kennzahl-Karten, sondern Angaben zum nächsten Meetup
const PII_RE = /@|\+?\d[\d ()/-]{7,}\d|\b(name|email|telefon|phone|vorname|nachname|adresse|address|user_?id|uid)\b/i;

/* Prüft eine Antwort der Verwaltung, ohne etwas zu speichern. */
function validateKpis(j) {
  if (!j || typeof j !== "object" || Array.isArray(j)) return { ok: false, error: "Keine gültige Antwort" };
  const extra = Object.keys(j).filter((k) => !KPI_TOP.includes(k));
  if (extra.length) return { ok: false, error: "Unerwartete Felder (" + extra.slice(0, 3).join(", ") + ") – aus Datenschutzgründen nichts übernommen" };
  if (j.format !== KPI_FORMAT || j.version !== 1 || !Array.isArray(j.values)) return { ok: false, error: "Unbekanntes Format – nichts übernommen" };
  if (j.meta && (typeof j.meta !== "object" || Object.keys(j.meta).some((k) => !KPI_META.includes(k)))) return { ok: false, error: "Unerwartete Zusatzangaben – nichts übernommen" };
  const known = new Set([...MT.map((t) => t.k), ...KPI_MEETUP]);
  const vals = [];
  for (const v of j.values) {
    if (!v || typeof v !== "object" || Object.keys(v).some((k) => !KPI_VAL.includes(k))) return { ok: false, error: "Unerwartete Felder in einem Wert – aus Datenschutzgründen nichts übernommen" };
    if (typeof v.value !== "number" || !isFinite(v.value)) return { ok: false, error: "Ungültiger Zahlenwert – nichts übernommen" };
    if (typeof v.date !== "string" || !DATE_RE.test(v.date)) return { ok: false, error: "Ungültiges Datum – nichts übernommen" };
    if (v.source != null && (typeof v.source !== "string" || v.source.length > 40 || PII_RE.test(v.source))) return { ok: false, error: "Verdächtige Quellenangabe – nichts übernommen" };
    if (!known.has(v.key)) continue; // unbekannte Kennzahl: ignorieren (künftige Erweiterung)
    vals.push(v);
  }
  return { ok: true, values: vals, ignored: j.values.length - vals.length };
}
const kpiCfg = async () => (await kvGet("kpi-config")) || null;
/* Zustand für Befunde (synchron lesbar im Regelmotor), aktualisiert beim Start und nach jedem Abruf */
let KPI_STATE = null,
  KPI_MEETUP_DIFF = null;
const loadKpiState = async () => {
  KPI_STATE = kpiUrl() ? await kpiCfg() : null;
  const a = KPI_STATE ? await kvGet("meetup-auto") : null;
  KPI_MEETUP_DIFF = a && a.diff ? a.diff : null;
  return KPI_STATE;
};
const KPI_TIMEOUT = 15000;
async function kpiFetch(path, opt = {}) {
  const ac = typeof AbortController === "function" ? new AbortController() : null;
  const tm = ac && setTimeout(() => ac.abort(), KPI_TIMEOUT);
  try {
    return await fetch(kpiUrl().replace(/\/$/, "") + path, { ...opt, cache: "no-store", signal: ac && ac.signal });
  } finally {
    clearTimeout(tm);
  }
}
/* Einmal-Kopplung: Code aus der Verwaltung gegen einen widerrufbaren Gerätezugang tauschen */
async function kpiPair(code) {
  if (!kpiUrl()) return { ok: false, error: "Anbindung noch nicht freigegeben" };
  code = String(code || "").replace(/\D/g, "");
  if (!/^\d{6,8}$/.test(code)) return { ok: false, error: "Ungültiger Kopplungscode" };
  try {
    const r = await kpiFetch("/pair", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code, device: S.dev }) });
    if (!r.ok) return { ok: false, error: r.status === 401 || r.status === 410 ? "Code ungültig oder abgelaufen" : r.status === 429 ? "Zu viele Fehlversuche – in 10 Minuten neuen Code erzeugen" : "Verwaltung nicht erreichbar (" + r.status + ")" };
    const j = await r.json();
    if (!j || typeof j.token !== "string" || !/^[0-9a-f]{64}$/.test(j.token)) return { ok: false, error: "Ungültige Antwort der Verwaltung" };
    await kvPut("kpi-config", { token: j.token, since: Date.now(), last: null, fails: 0, lastError: null, revoked: null });
    await loadKpiState();
    logEvent("info", "kpi.pair", "Gerät mit der Verwaltung gekoppelt");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: "Verwaltung nicht erreichbar" };
  }
}
async function kpiFail(cfg, msg, extra = {}) {
  Object.assign(cfg, { fails: (cfg.fails || 0) + 1, lastError: { at: Date.now(), msg } }, extra);
  await kvPut("kpi-config", cfg);
  await loadKpiState();
  return { ok: false, error: msg };
}
/* Kennzahlen abrufen, streng prüfen und als Historie speichern */
async function kpiSync() {
  const cfg = await kpiCfg();
  if (!kpiUrl() || !cfg) return { ok: false, error: "Nicht eingerichtet" };
  if (cfg.revoked) return { ok: false, error: "Zugang widerrufen – bitte neu koppeln" };
  let j;
  try {
    const r = await kpiFetch("/kpis", { headers: { authorization: "Bearer " + cfg.token } });
    if (r.status === 401 || r.status === 403) {
      logEvent("warn", "kpi.revoked", "Zugang widerrufen oder abgelaufen");
      logAction("kpi.fetch", "auto", false, "Zugang widerrufen");
      return kpiFail(cfg, "Zugang widerrufen – bitte neu koppeln", { revoked: Date.now() });
    }
    if (r.status === 429) throw new Error("Zu viele Abrufe – später erneut");
    if (!r.ok) throw new Error("Verwaltung nicht erreichbar (" + r.status + ")");
    j = await r.json();
  } catch (e) {
    const msg = e && /^(Zu viele|Verwaltung)/.test(e.message) ? e.message : "Verwaltung nicht erreichbar";
    logEvent("warn", "kpi.fetch", msg);
    logAction("kpi.fetch", "auto", false, msg);
    return kpiFail(cfg, msg);
  }
  const v = validateKpis(j);
  if (!v.ok) {
    logEvent("error", "kpi.reject", v.error);
    logAction("kpi.fetch", "auto", false, v.error);
    return kpiFail(cfg, v.error);
  }
  let n = 0;
  const mu = await kpiMeetup(v.values);
  for (const x of v.values) {
    if (KPI_MEETUP.includes(x.key)) continue;
    const m = S.metrics.find((y) => y.key === x.key);
    if (m && addVal(m.id, { date: x.date, value: Math.round(x.value * 100) / 100, status: "confirmed", src: "verwaltung" })) n++;
  }
  Object.assign(cfg, { last: Date.now(), fails: 0, lastError: null, count: v.values.length });
  await kvPut("kpi-config", cfg);
  await loadKpiState();
  await save();
  logEvent("info", "kpi.ok", n + " Werte neu oder geändert");
  logAction("kpi.fetch", "auto", true, v.values.length + " Werte, " + n + " neu oder geändert");
  return { ok: true, n, total: v.values.length, ignored: v.ignored, meetup: mu };
}
/* Nächstes Meetup aus der Verwaltung: Datum (aus „Tage bis“) und Ziel (= Plätze) automatisch eintragen.
   Eigene Eingaben haben Vorrang: Überschrieben wird nur, was leer, vorbei oder zuletzt automatisch gesetzt war.
   Weicht ein selbst eingetragenes Datum ab, entsteht ein Hinweis statt einer Änderung. */
async function kpiMeetup(values) {
  const latest = (k) => values.filter((x) => x.key === k).sort((a, b) => b.date.localeCompare(a.date))[0];
  const d = latest("meetup_days"),
    c = latest("meetup_capacity");
  const prev = (await kvGet("meetup-auto")) || null;
  if (!d || !Number.isInteger(d.value) || d.value < 0 || d.value > 366) {
    if (prev && prev.diff) await kvPut("meetup-auto", { ...prev, diff: null });
    return null;
  }
  const target = addDays(d.date, d.value),
    cap = c && Number.isInteger(c.value) && c.value > 0 && c.value < 10000 ? String(c.value) : null,
    u = S.meetup;
  const wasAuto = prev && u.date === prev.date;
  if (!u.date || u.date < today() || wasAuto) {
    const isNew = !!u.date && u.date < today();
    const goalAuto = !!cap && (isNew || u.goal === "" || (prev && u.goal === prev.goal));
    if (u.date === target && (!goalAuto || u.goal === cap)) {
      await kvPut("meetup-auto", { date: target, goal: goalAuto ? cap : prev && prev.goal, diff: null });
      return null;
    }
    // Vorbei → neues Meetup: bisherige Angaben (Ort, Notiz) werden archiviert, nicht weitergetragen
    if (isNew) {
      const h = (await kvGet("meetup-history")) || [];
      h.push({ ...clone(u), archivedAt: Date.now() });
      await kvPut("meetup-history", h.slice(-30));
    }
    S.meetup = { ...u, date: target, goal: goalAuto ? cap : isNew ? "" : u.goal, ...(isNew ? { place: "", note: "" } : {}) };
    touch(S.meetup);
    await kvPut("meetup-auto", { date: target, goal: goalAuto ? cap : prev && prev.goal, diff: null });
    logAction("meetup.auto", "auto", true, "Nächstes Meetup aus der Verwaltung: " + target + (goalAuto ? ", Ziel " + cap : ""));
    return "Meetup-Datum aus der Verwaltung übernommen";
  }
  if (u.date !== target) {
    await kvPut("meetup-auto", { ...(prev || {}), diff: { own: u.date, verwaltung: target } });
    return "Meetup-Datum weicht von der Verwaltung ab";
  }
  if (prev && prev.diff) await kvPut("meetup-auto", { ...prev, diff: null });
  return null;
}

/* Im Zyklus: höchstens alle 6 Stunden abrufen (Stufe 0, nur lesend). Nach Fehlern wachsende Pause
   (30 Minuten, verdoppelt bis höchstens 8 Stunden), nach Widerruf kein Abruf mehr bis zur neuen Kopplung. */
async function kpiAuto() {
  const cfg = await kpiCfg();
  if (!kpiUrl() || !cfg || cfg.revoked || navigator.onLine === false) return cfg && cfg.revoked ? "Verwaltung: Zugang widerrufen – bitte neu koppeln" : null;
  if (cfg.last && Date.now() - cfg.last < 6 * 3600e3) return null;
  if (cfg.lastError && Date.now() - cfg.lastError.at < Math.min(8 * 3600e3, 30 * 60e3 * 2 ** Math.max(0, (cfg.fails || 1) - 1))) return null;
  const r = await kpiSync();
  return r.ok ? r.total + " Kennzahlen aus der Verwaltung (" + r.n + " neu oder geändert)" : "Verwaltung: " + r.error;
}
/* Hinweis, wenn das selbst eingetragene Meetup-Datum vom Datum in der Verwaltung abweicht */
function kpiMeetupFinding() {
  const d = KPI_MEETUP_DIFF;
  return d && S.meetup.date === d.own ? { title: "Meetup-Datum weicht von der Verwaltung ab", detail: `In der App: ${fmt(d.own)}, in der Verwaltung: ${fmt(d.verwaltung)}. Bitte prüfen und in der Meetup-Karte korrigieren.` } : null;
}
/* Befund, wenn die Anbindung nicht mehr funktioniert (Grundlage für die automatische Auswertung fehlt) */
function kpiFinding() {
  const c = KPI_STATE;
  if (!c) return null;
  if (c.revoked) return { title: "Verwaltung: Zugang widerrufen", detail: "Kennzahlen werden nicht mehr automatisch übernommen. Unter „Mehr › Verwaltung“ neu koppeln." };
  const since = c.last || c.since;
  if ((c.fails || 0) >= 3 && Date.now() - since > 24 * 3600e3) return { title: "Verwaltung: Kennzahlen seit " + Math.round((Date.now() - since) / 3600e3) + " Stunden nicht abrufbar", detail: "Letzter Fehler: " + ((c.lastError && c.lastError.msg) || "unbekannt") + ". Die App versucht es automatisch weiter." };
  return null;
}
async function kpiRemove() {
  await kvPut("kpi-config", null);
  await loadKpiState();
  logEvent("info", "kpi.remove", "Kopplung mit der Verwaltung entfernt");
}
/* ---------- Oberfläche („Mehr › Kennzahlen aus der Verwaltung“) ---------- */
async function kpiSheet() {
  const cfg = await kpiCfg();
  const fromV = S.metrics.reduce((n, m) => n + m.entries.filter((e) => !e.deleted && e.src === "verwaltung").length, 0);
  sheet(`<h1>Kennzahlen aus der Verwaltung</h1><p class="mut">Nur zusammengefasste Zahlen (z. B. Registrierungen, aktive Nutzer, Anmeldungen) aus den vorhandenen Auswertungen der Vivalink-Verwaltung. Keine Personendaten; Antworten mit unbekannten Feldern werden komplett abgelehnt.</p>${
    !kpiUrl()
      ? '<div class="card rec warn">Vorbereitet. Die Gegenstelle in der Verwaltung (Supabase) ist noch nicht eingerichtet – das braucht deine gesonderte Freigabe (Anleitung: docs/AUFTRAG-VERWALTUNG.md). Bis dahin trägst du Kennzahlen auf der Startseite ein.</div>'
      : cfg && !cfg.revoked
        ? `<div class="card"><div>Status: <b>${cfg.lastError ? "Problem beim Abruf" : "gekoppelt"}</b></div><div class="mut">Zuletzt abgerufen: ${cfg.last ? new Date(cfg.last).toLocaleString("de-DE") : "noch nie"} · übernommene Werte: ${fromV}</div>${cfg.lastError ? `<div class="mut">Letzter Fehler (${new Date(cfg.lastError.at).toLocaleString("de-DE")}): ${esc(cfg.lastError.msg)} – neuer Versuch automatisch.</div>` : ""}<div class="mut">Abruf automatisch höchstens alle 6 Stunden beim Öffnen der App.</div></div><div class="row"><button class="p" data-a="kpNow">Jetzt abrufen</button><button data-a="kpOff">Kopplung entfernen</button></div>`
        : `${cfg && cfg.revoked ? '<div class="card rec warn" id="kpRevoked">Der Zugang wurde in der Verwaltung widerrufen. Bisherige Kennzahlen bleiben erhalten. Für neue Werte einen neuen Kopplungscode erzeugen und hier eingeben.</div>' : ""}<div class="card"><b>Mit der Verwaltung koppeln</b><p class="mut">In der Verwaltung unter „Management AI“ einen Kopplungscode erzeugen (6–8 Ziffern, 10 Minuten gültig) und hier eingeben.</p><input id="kpCode" inputmode="numeric" autocomplete="off" placeholder="Kopplungscode"><button class="p" data-a="kpPair">Koppeln</button></div>`
  }<button data-a="close">Schließen</button>`);
}
async function kpiAction(a) {
  if (a === "kpi") return kpiSheet();
  if (a === "kpPair") {
    const r = await kpiPair(val("kpCode").trim());
    if (!r.ok) return toast(r.error);
    const s = await kpiSync(); // protokolliert selbst
    toast("Gekoppelt" + (s.ok ? " · " + s.total + " Werte übernommen" : " · " + s.error));
    render();
    return kpiSheet();
  }
  if (a === "kpNow") {
    const s = await kpiSync();
    toast(s.ok ? s.total + " Werte abgerufen, " + s.n + " neu oder geändert" : s.error);
    render();
    return kpiSheet();
  }
  if (a === "kpOff") {
    if (window._kpo !== 1) {
      window._kpo = 1;
      return toast("Nochmal tippen: Kopplung entfernen (Kennzahlen bleiben erhalten)");
    }
    window._kpo = 0;
    await kpiRemove();
    toast("Kopplung entfernt");
    return kpiSheet();
  }
}
