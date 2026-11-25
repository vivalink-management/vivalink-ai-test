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
const PII_RE = /@|\+?\d[\d ()/-]{7,}\d|\b(name|email|telefon|phone|vorname|nachname|adresse|address|user_?id|uid)\b/i;

/* Prüft eine Antwort der Verwaltung, ohne etwas zu speichern. */
function validateKpis(j) {
  if (!j || typeof j !== "object" || Array.isArray(j)) return { ok: false, error: "Keine gültige Antwort" };
  const extra = Object.keys(j).filter((k) => !KPI_TOP.includes(k));
  if (extra.length) return { ok: false, error: "Unerwartete Felder (" + extra.slice(0, 3).join(", ") + ") – aus Datenschutzgründen nichts übernommen" };
  if (j.format !== KPI_FORMAT || j.version !== 1 || !Array.isArray(j.values)) return { ok: false, error: "Unbekanntes Format – nichts übernommen" };
  if (j.meta && (typeof j.meta !== "object" || Object.keys(j.meta).some((k) => !KPI_META.includes(k)))) return { ok: false, error: "Unerwartete Zusatzangaben – nichts übernommen" };
  const known = new Set(MT.map((t) => t.k));
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
/* Einmal-Kopplung: Code aus der Verwaltung gegen einen widerrufbaren Gerätezugang tauschen */
async function kpiPair(code) {
  if (!kpiUrl()) return { ok: false, error: "Anbindung noch nicht freigegeben" };
  if (!/^\d{6,8}$/.test(String(code || ""))) return { ok: false, error: "Ungültiger Kopplungscode" };
  try {
    const r = await fetch(kpiUrl().replace(/\/$/, "") + "/pair", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: String(code), device: S.dev }) });
    if (!r.ok) return { ok: false, error: r.status === 401 || r.status === 410 ? "Code ungültig oder abgelaufen" : "Verwaltung nicht erreichbar (" + r.status + ")" };
    const j = await r.json();
    if (!j || typeof j.token !== "string" || j.token.length < 32) return { ok: false, error: "Ungültige Antwort der Verwaltung" };
    await kvPut("kpi-config", { token: j.token, since: Date.now(), last: null });
    logEvent("info", "kpi.pair", "Gerät mit der Verwaltung gekoppelt");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: "Verwaltung nicht erreichbar" };
  }
}
/* Kennzahlen abrufen, streng prüfen und als Historie speichern */
async function kpiSync() {
  const cfg = await kpiCfg();
  if (!kpiUrl() || !cfg) return { ok: false, error: "Nicht eingerichtet" };
  let j;
  try {
    const r = await fetch(kpiUrl().replace(/\/$/, "") + "/kpis", { headers: { authorization: "Bearer " + cfg.token }, cache: "no-store" });
    if (r.status === 401 || r.status === 403) {
      logEvent("warn", "kpi.revoked", "Zugang widerrufen oder abgelaufen");
      return { ok: false, error: "Zugang widerrufen – bitte neu koppeln" };
    }
    if (!r.ok) throw new Error("Status " + r.status);
    j = await r.json();
  } catch (e) {
    logEvent("warn", "kpi.fetch", e.message || "Abruf fehlgeschlagen");
    return { ok: false, error: "Verwaltung nicht erreichbar" };
  }
  const v = validateKpis(j);
  if (!v.ok) {
    logEvent("error", "kpi.reject", v.error);
    logAction("kpi.fetch", "auto", false, v.error);
    return v;
  }
  let n = 0;
  for (const x of v.values) if (ingest(x.key, x.date, x.value, "verwaltung")) n++;
  cfg.last = Date.now();
  await kvPut("kpi-config", cfg);
  await save();
  logEvent("info", "kpi.ok", n + " Werte übernommen");
  logAction("kpi.fetch", "auto", true, n + " Werte");
  return { ok: true, n, ignored: v.ignored };
}

/* Im Zyklus: höchstens alle 6 Stunden abrufen (Stufe 0, nur lesend) */
async function kpiAuto() {
  const cfg = await kpiCfg();
  if (!kpiUrl() || !cfg || navigator.onLine === false) return null;
  if (cfg.last && Date.now() - cfg.last < 6 * 3600e3) return null;
  const r = await kpiSync();
  return r.ok ? r.n + " Kennzahlen aus der Verwaltung" : "Verwaltung: " + r.error;
}
async function kpiRemove() {
  await kvPut("kpi-config", null);
  logEvent("info", "kpi.remove", "Kopplung mit der Verwaltung entfernt");
}
/* ---------- Oberfläche („Mehr › Kennzahlen aus der Verwaltung“) ---------- */
async function kpiSheet() {
  const cfg = await kpiCfg();
  const fromV = S.metrics.reduce((n, m) => n + m.entries.filter((e) => !e.deleted && e.src === "verwaltung").length, 0);
  sheet(`<h1>Kennzahlen aus der Verwaltung</h1><p class="mut">Nur zusammengefasste Zahlen (z. B. Registrierungen, aktive Nutzer, Anmeldungen) aus den vorhandenen Auswertungen der Vivalink-Verwaltung. Keine Personendaten; Antworten mit unbekannten Feldern werden komplett abgelehnt.</p>${
    !kpiUrl()
      ? '<div class="card rec warn">Vorbereitet. Die Gegenstelle in der Verwaltung (Supabase) ist noch nicht eingerichtet – das braucht deine gesonderte Freigabe (Anleitung: docs/AUFTRAG-VERWALTUNG.md). Bis dahin trägst du Kennzahlen auf der Startseite ein.</div>'
      : cfg
        ? `<div class="card"><div>Status: <b>gekoppelt</b></div><div class="mut">Zuletzt abgerufen: ${cfg.last ? new Date(cfg.last).toLocaleString("de-DE") : "noch nie"} · übernommene Werte: ${fromV}</div><div class="mut">Abruf automatisch höchstens alle 6 Stunden beim Öffnen der App.</div></div><div class="row"><button class="p" data-a="kpNow">Jetzt abrufen</button><button data-a="kpOff">Kopplung entfernen</button></div>`
        : `<div class="card"><b>Mit der Verwaltung koppeln</b><p class="mut">In der Verwaltung unter „Management AI“ einen Kopplungscode erzeugen (6–8 Ziffern, 10 Minuten gültig) und hier eingeben.</p><input id="kpCode" inputmode="numeric" autocomplete="off" placeholder="Kopplungscode"><button class="p" data-a="kpPair">Koppeln</button></div>`
  }<button data-a="close">Schließen</button>`);
}
async function kpiAction(a) {
  if (a === "kpi") return kpiSheet();
  if (a === "kpPair") {
    const r = await kpiPair(val("kpCode").trim());
    if (!r.ok) return toast(r.error);
    const s = await kpiSync(); // protokolliert selbst
    toast("Gekoppelt" + (s.ok ? " · " + s.n + " Werte übernommen" : ""));
    render();
    return kpiSheet();
  }
  if (a === "kpNow") {
    const s = await kpiSync();
    toast(s.ok ? s.n + " Werte übernommen" : s.error);
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
