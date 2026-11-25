/* Diagnose, Konfliktanzeige und Backup-Dialoge */
let PREIMP = null, // Rückgängig-Punkt vor dem letzten Import oder der letzten Wiederherstellung
  PENDING = null; // geprüfter Backup-Text, der auf Bestätigung wartet

const COLL = { tasks: "Aufgabe", memory: "Gedächtnis", "metric-entry": "Kennzahl-Wert", "metric-goal": "Kennzahl-Ziel", meetup: "Nächstes Meetup", posts: "Instagram-Beitrag", brand: "Markenprofil", settings: "Instagram-Rhythmus" };
const cut = (s, n) => (!s ? "" : s.length > n ? s.slice(0, n) + "…" : s);
function recLine(coll, r, mid) {
  if (!r) return "–";
  if (coll === "tasks")
    return `${esc(r.title)} <span class="mut">· ${esc(r.prio)}${r.due ? " · Frist " + fmt(r.due) : ""}${r.done ? " · erledigt" : ""}</span>`;
  if (coll === "posts") return `${esc(r.title)} <span class="mut">· ${esc(PSTATUS[r.status] || r.status)}${r.date ? " · " + fmt(r.date) : ""}${r.deleted ? " · gelöscht" : ""}</span>`;
  if (coll === "brand") return `Region ${esc(r.region || "–")} · Anmeldung ${esc(r.signup || "–")}`;
  if (coll === "settings") return `${esc((r.days || []).map((d) => WD[d]).join("/"))} · ${esc(r.time)} Uhr`;
  if (coll === "memory") return `${esc(r.title)}${r.text ? `<div class="mut">${esc(cut(r.text, 140))}</div>` : ""}`;
  if (coll === "metric-entry") {
    const m = S.metrics.find((x) => x.id === mid);
    return `${m ? esc(m.name) + ": " : ""}${num(r.value)} <span class="mut">· ${r.date ? fmt(r.date) : "ohne Datum"}${r.deleted ? " · entfernt" : ""}</span>`;
  }
  if (coll === "metric-goal") return "Ziel " + (r.goal === "" || r.goal == null ? "(leer)" : esc(r.goal));
  if (coll === "meetup") return `${esc(r.place || "Ort fehlt")} <span class="mut">· ${r.date ? fmt(r.date) : "Datum fehlt"}${r.goal !== "" && r.goal != null ? " · Ziel " + esc(r.goal) : ""}</span>`;
  return "";
}
function conflictHtml(c) {
  const when = new Date(c.at).toLocaleDateString("de-DE");
  if (c.kind === "fork") {
    const p = S.memory.find((m) => m.id === c.ref);
    return `<div class="card rec bad" data-conflict="${esc(c.id)}"><b>Gedächtnis: zwei Änderungen am selben Eintrag</b><div class="mut">Ursprünglich: ${esc(p ? p.title : "unbekannt")} · erkannt ${when}</div>${c.options
      .map((oid) => {
        const m = S.memory.find((x) => x.id === oid);
        return m
          ? `<div class="card"><b>${esc(m.title)}</b><div class="mut">${fmt(m.date)}${m.changeReason ? " · Grund: " + esc(cut(m.changeReason, 120)) : ""}</div>${m.text ? `<div>${esc(cut(m.text, 200))}</div>` : ""}<button class="s p" data-a="cfx" data-id="${esc(c.id)}" data-v="${esc(oid)}" style="margin-top:6px">Diese Version gilt</button></div>`
          : "";
      })
      .join("")}<button class="s" data-a="cfx" data-id="${esc(c.id)}" data-v="both">Beide als getrennte Einträge behalten</button></div>`;
  }
  return `<div class="card rec warn" data-conflict="${esc(c.id)}"><b>${COLL[c.coll] || esc(c.coll)}: unterschiedlich geändert</b><div class="mut">erkannt ${when}</div><div><span class="mut">Gilt jetzt:</span> ${recLine(c.coll, c.kept, c.mid)}</div><div><span class="mut">Andere Version:</span> ${recLine(c.coll, c.other, c.mid)}</div><div class="row" style="margin-top:6px"><button class="s" data-a="cfx" data-id="${esc(c.id)}" data-v="keep">So lassen</button><button class="s p" data-a="cfx" data-id="${esc(c.id)}" data-v="other">Andere Version übernehmen</button></div></div>`;
}

/* ---------- Backup prüfen / Import-Vorschau ---------- */
const SUM = { ok: "✅ Prüfsumme korrekt", bad: "❌ Prüfsumme falsch: Backup verändert oder beschädigt", missing: "❓ Prüfsumme fehlt", unavailable: "❓ Prüfsumme hier nicht prüfbar", legacy: "ℹ️ Älteres Backup-Format ohne Prüfsumme (Version 1 oder 2)" };
function inspectHtml(r) {
  if (!r.ok) return `<div class="card rec bad">${esc(r.error)}</div>`;
  if (r.kind === "values")
    return `<div class="card rec">Kennzahlen-Import mit ${r.count} Wert(en).${r.preview ? `<div>Beim Zusammenführen: <b>${r.preview.added}</b> übernommen${r.preview.skipped ? `, <b>${r.preview.skipped}</b> ungültig (werden übersprungen)` : ""}</div>` : ""}</div>`;
  const p = r.preview,
    c = r.counts;
  return `<div class="card rec ${r.sum === "bad" ? "bad" : p.conflicts || p.skipped || !r.allHere ? "warn" : "ok"}"><b>${r.env ? "Backup vom " + new Date(r.createdAt).toLocaleString("de-DE") : "Backup im älteren Format (Datenversion " + esc(r.schema) + ")"}</b>
<div>${SUM[r.sum] || ""}</div><div class="mut">Enthält: ${c.memory} Gedächtnis-Einträge, ${c.tasks} Aufgaben, ${c.posts} Instagram-Beiträge, ${c.values} Kennzahl-Werte, ${c.aitest} KI-Testergebnisse</div>
<div>Beim Zusammenführen: <b>${p.added}</b> neu, <b>${p.updated}</b> aktualisiert, <b>${p.conflicts}</b> Konflikt(e)${p.skipped ? `, <b>${p.skipped}</b> ungültig (werden übersprungen)` : ""}</div>
<div class="mut">${r.allHere ? "Alle Einträge dieses Backups sind auf diesem Gerät vorhanden." : "Dieses Backup enthält Einträge, die auf diesem Gerät fehlen."}</div></div>`;
}
function importSheet(r) {
  const p = r.preview;
  sheet(
    `<h1>Backup zusammenführen</h1>${inspectHtml(r)}${r.kind === "state" ? `<p>Vor dem Zusammenführen wird automatisch ein Rückgängig-Punkt angelegt. Vorhandene Einträge werden nicht gelöscht.${p.conflicts ? " Konflikte kannst du danach unter „Mehr › Datenkonflikte“ entscheiden." : ""}</p>` : "<p>Die Werte werden als geprüfte Kennzahlen übernommen. Vorher wird ein Rückgängig-Punkt angelegt.</p>"}<div class="row"><button class="p" data-a="impGo">Jetzt zusammenführen</button><button data-a="close">Abbrechen</button></div>`,
  );
}
async function makeUndoPoint(label) {
  const pt = { at: Date.now(), label, data: clone(S), aitest: (await aiLoad()) || [] };
  const ok = await kvPut("pre-import", pt);
  const chk = ok && (await kvGet("pre-import"));
  if (!chk || JSON.stringify(chk.data) !== JSON.stringify(pt.data)) {
    logEvent("error", "undo.snapshot", "Rückgängig-Punkt konnte nicht gespeichert werden");
    return false;
  }
  PREIMP = pt;
  return true;
}
async function applyImport(text) {
  const p = parseBackup(text);
  if (!p.ok) return { ok: false, error: p.error };
  if (!(await makeUndoPoint("Import"))) return { ok: false, error: "Rückgängig-Punkt nicht möglich. Es wurde nichts verändert." };
  if (p.kind === "values") {
    let n = 0;
    for (const x of p.values) if (x && ingest(x.key, x.date, x.value, x.source)) n++;
    await save();
    logEvent("info", "import.values", n + " von " + p.values.length + " Werten übernommen");
    return { ok: true, n, conflicts: 0, skipped: p.values.length - n };
  }
  if (p.env && p.env.sha256) {
    const h = await sha256(payloadOf(p.env.data, p.env.aitest || []));
    if (h != null && h !== p.env.sha256) return { ok: false, error: "Backup verändert oder beschädigt. Es wurde nichts übernommen." };
  }
  const inc = cleanIncoming(p.data, p.aitest);
  const rep = mergeInto(S, inc);
  if (inc.aitest.length) {
    const l = (await aiLoad()) || [];
    for (const x of inc.aitest) if (!l.some((y) => y.id === x.id)) l.push(x);
    await aiSave(l);
  }
  await save();
  logEvent("info", "import.state", `neu ${rep.added}, aktualisiert ${rep.updated}, Konflikte ${rep.conflicts}, übersprungen ${rep.skipped}`);
  return { ok: true, n: rep.added + rep.updated, conflicts: rep.conflicts, skipped: rep.skipped };
}

/* ---------- Diagnose ---------- */
async function runChecks() {
  const c = {};
  c.app = APP_VERSION;
  c.schema = SCHEMA + " (gespeichert: " + S.v + ")";
  c.mode =
    (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone ? "Home-Bildschirm-App" : "Browser-Tab";
  c.online = navigator.onLine ? "online" : "offline";
  c.sw = "serviceWorker" in navigator ? (navigator.serviceWorker.controller ? "aktiv" : "registriert, noch nicht aktiv") : "nicht unterstützt";
  try {
    c.caches = "caches" in window ? (await caches.keys()).filter((k) => k.startsWith("vivalink")).join(", ") || "keine" : "nicht unterstützt";
  } catch (e) {
    c.caches = "Fehler";
  }
  const probe = { t: Date.now(), r: Math.random() };
  const w = await kvPut("probe", probe),
    r = await kvGet("probe");
  c.storage = w && r && r.t === probe.t && r.r === probe.r ? "OK (Schreiben und Lesen)" : "FEHLER";
  if (c.storage === "FEHLER") logEvent("error", "storage.probe", "Schreib-/Lesetest fehlgeschlagen");
  try {
    c.persist = navigator.storage && navigator.storage.persisted ? ((await navigator.storage.persisted()) ? "ja" : "nein (iOS kann Daten bei Speichermangel löschen)") : "unbekannt";
  } catch (e) {
    c.persist = "unbekannt";
  }
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const e = await navigator.storage.estimate();
      c.quota = (e.usage / 1048576).toFixed(1) + " MB von " + Math.round(e.quota / 1048576) + " MB";
    } else c.quota = "unbekannt";
  } catch (e) {
    c.quota = "unbekannt";
  }
  c.gpu = await gpuInfo();
  const ai = (await aiLoad()) || [];
  c.counts = `Gedächtnis ${S.memory.filter((m) => m.active).length}/${S.memory.length}, Aufgaben offen ${S.tasks.filter((t) => !t.done).length}/${S.tasks.length}, Kennzahl-Werte ${S.metrics.reduce((n, m) => n + m.entries.filter((e) => !e.deleted).length, 0)}, KI-Tests ${ai.length}`;
  c.backup = S.lastBackup ? fmt(S.lastBackup) + " (vor " + ago(S.lastBackup) + " Tagen)" : "noch keines";
  c.safety = (SAFE ? "Sicherheitskopie vorhanden" : "keine Sicherheitskopie") + " · " + (PREIMP ? "Rückgängig-Punkt vorhanden" : "kein Rückgängig-Punkt") + " · " + ((await kvGet("snaps")) || []).length + " automatische Sicherungspunkte";
  c.conflicts = openConflicts().length + " offen, " + S.conflicts.filter((x) => x.resolved).length + " entschieden";
  c.integrity = integrity();
  return c;
}
const DL = { app: "App-Version", schema: "Datenversion", mode: "Anzeige", online: "Netz", sw: "Service Worker", caches: "Offline-Speicher", storage: "Speichertest", persist: "Vor Löschung geschützt", quota: "Speicherbelegung", gpu: "WebGPU", counts: "Datenumfang", backup: "Letztes Backup", safety: "Sicherungen", conflicts: "Datenkonflikte" };
function diagText(c) {
  const lines = ["Vivalink Management AI – Diagnosebericht (ohne Inhalte)", "Erstellt: " + new Date().toISOString(), ""];
  for (const k in DL) lines.push(DL[k] + ": " + c[k]);
  lines.push("", "Integritätsprüfung:", ...(c.integrity.length ? c.integrity.map((i) => "- [" + i.code + "] " + i.msg) : ["- keine Auffälligkeiten"]));
  lines.push("", "Technisches Protokoll (neueste zuerst):");
  const L = LOG.slice(-50).reverse();
  lines.push(...(L.length ? L.map((e) => `- ${new Date(e.at).toISOString()} ${e.level} ${e.code}${e.n ? " ×" + e.n : ""}: ${e.msg}`) : ["- leer"]));
  return lines.join("\n");
}
async function diagSheet() {
  const c = await runChecks();
  const L = LOG.slice(-30).reverse();
  sheet(
    `<h1>Diagnose</h1><div class="card" id="diagChecks">${Object.keys(DL)
      .map((k) => `<div style="margin:3px 0 7px"><div class="mut">${DL[k]}</div><b data-check="${k}">${esc(c[k])}</b></div>`)
      .join("")}</div>
<h2>Integritätsprüfung</h2>${c.integrity.length ? c.integrity.map((i) => `<div class="card rec ${i.sev >= 2 ? "bad" : "warn"}" data-issue="${esc(i.code)}">${esc(i.msg)}</div>`).join("") : '<div class="card rec ok" data-issue="none">Keine Auffälligkeiten.</div>'}
${actionsHtml()}
<h2>Technisches Protokoll</h2>${L.length ? L.map((e) => `<div class="card ${e.level === "error" ? "rec bad" : e.level === "warn" ? "rec warn" : ""}" data-log="${esc(e.code)}"><div class="row sp"><b>${esc(e.code)}${e.n ? " ×" + e.n : ""}</b><span class="mut">${new Date(e.at).toLocaleString("de-DE")}</span></div><div class="mut">${esc(e.msg)}</div></div>`).join("") : '<p class="mut">Keine Einträge.</p>'}
<p class="mut">Der Diagnosebericht enthält Versionen, Prüfergebnisse, Zähler und technische Meldungen, aber keine Inhalte. Du kannst ihn in einen Reparaturauftrag für Claude Code einfügen.</p>
<textarea id="diagTxt" readonly style="min-height:120px">${esc(diagText(c))}</textarea>
<div class="row"><button class="p" data-a="cpDiag">Diagnosebericht kopieren</button><button data-a="clrLog">Protokoll leeren</button><button data-a="close">Schließen</button></div>`,
  );
}

/* ---------- Automatische lokale Sicherungspunkte (täglich, die letzten 7 Tage) ---------- */
const SNAP_KEEP = 7;
let LASTSNAP = null; // Datum des letzten automatischen Sicherungspunkts
async function autoSnapshot(force = false) {
  const idx = (await kvGet("snaps")) || [];
  const d = today();
  if (!force && idx.includes(d)) {
    // Sicherungspunkt des Tages beim Start auffrischen, wenn er älter als 3 Stunden ist (Änderungen des Tages sichern)
    const cur = await kvGet("snap-" + d);
    if (cur && Date.now() - (cur.at || 0) < 3 * 3600e3) return false;
  }
  const ok = await kvPut("snap-" + d, { at: Date.now(), app: APP_VERSION, data: clone(S), aitest: (await aiLoad()) || [] });
  if (!ok) {
    logEvent("error", "snapshot", "Sicherungspunkt nicht gespeichert");
    return false;
  }
  const list = [...new Set([d, ...idx])].sort().reverse();
  for (const old of list.slice(SNAP_KEEP)) await kvPut("snap-" + old, null);
  await kvPut("snaps", list.slice(0, SNAP_KEEP));
  LASTSNAP = d;
  logAction("snapshot.auto", "auto", true, d);
  return true;
}
async function snapList() {
  const idx = (await kvGet("snaps")) || [];
  const out = [];
  for (const d of idx) {
    const s = await kvGet("snap-" + d);
    if (s) out.push({ d, at: s.at, n: (s.data.memory || []).length + (s.data.tasks || []).length + ((s.data.studio && s.data.studio.posts) || []).length });
  }
  return out;
}
async function snapSheet() {
  const L = await snapList();
  sheet(`<h1>Automatische Sicherungspunkte</h1><p class="mut">Die App sichert deine Daten automatisch einmal täglich auf diesem Gerät (die letzten ${SNAP_KEEP} Tage). Das schützt vor Bedien- und Importfehlern, nicht vor dem Verlust des Geräts – dafür folgt die Synchronisierung.</p>${L.length ? L.map((s) => `<div class="card row sp"><div><b>${fmt(s.d)}</b><div class="mut">${new Date(s.at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} Uhr · ${s.n} Einträge</div></div><button class="s" data-a="snapRestore" data-id="${esc(s.d)}">Wiederherstellen</button></div>`).join("") : '<p class="mut">Noch kein Sicherungspunkt.</p>'}<button data-a="close">Schließen</button>`);
}
async function snapRestore(d) {
  if (window._sr !== d) {
    window._sr = d;
    return toast("Nochmal tippen, um den Stand vom " + fmt(d) + " wiederherzustellen");
  }
  window._sr = null;
  const s = await kvGet("snap-" + d);
  if (!s) return toast("Sicherungspunkt nicht gefunden");
  if (!(await makeUndoPoint("Vor Wiederherstellung " + fmt(d)))) return toast("Rückgängig-Punkt nicht möglich. Nichts verändert.");
  S = clone(s.data);
  migrate();
  await aiSave(s.aitest || []);
  await save();
  logEvent("info", "snapshot.restore", "Sicherungspunkt wiederhergestellt");
  close();
  render();
  toast("Stand vom " + fmt(d) + " wiederhergestellt (rückgängig unter „Mehr“)");
}
