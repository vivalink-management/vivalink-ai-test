/* Instagram-Studio – Oberfläche */
let studioMonth = null,
  curPost = null,
  storyView = false;
const SFILES = {}; // vorbereitete Bilddateien je Beitrag (für „Teilen“ ohne Wartezeit)
const sm = () => studioMonth || (studioMonth = today().slice(0, 7));
const monthName = (ym) => new Date(ym + "-15T12:00").toLocaleDateString("de-DE", { month: "long", year: "numeric" });
const pillarName = (id) => (PILLARS.find((p) => p.id === id) || {}).name || id;
const stChip = (p) => {
  const s = postState(p);
  return `<span class="chip st-${s.k}">${s.n}</span>`;
};
let stFilter = "alle";
const FILTERS = { alle: "Alle", bearbeiten: "Zu bearbeiten", offen: "Zu prüfen", geplant: "Geplant", veroeffentlicht: "Veröffentlicht" };
const needsWork = (p) => p.status === "entwurf" && p.warnings && p.warnings.length > 0;
const passFilter = (p) =>
  stFilter === "alle" || (stFilter === "bearbeiten" ? needsWork(p) : stFilter === "offen" ? p.status === "entwurf" : stFilter === "geplant" ? p.status === "freigegeben" : p.status === stFilter);
/* Monatsübersicht: was ist fertig, was braucht Arbeit, was steht als Nächstes an */
function monthOverview(ym, all) {
  const M = all.filter((p) => (p.date || "").startsWith(ym) && p.status !== "abgelehnt");
  const t = today(),
    wk = addDays(t, 7);
  const ready = M.filter((p) => p.status === "freigegeben" || p.status === "veroeffentlicht").length;
  const work = M.filter(needsWork).length;
  const check = M.filter((p) => p.status === "entwurf" && !needsWork(p)).length;
  const soon = all.filter((p) => p.date && p.date >= t && p.date <= wk && p.status !== "abgelehnt" && p.status !== "veroeffentlicht").sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const box = (n, label, f, cls) => `<button class="stat ${cls || ""}" data-a="stFilter" data-id="${f}"><b>${n}</b><span>${label}</span></button>`;
  return `<div class="stats">${box(ready, "fertig", "geplant", "")}${box(work, "zu bearbeiten", "bearbeiten", work ? "st-warn" : "")}${box(check, "zu prüfen", "offen", "")}${box(M.length, "im Monat", "alle", "")}</div>
<div class="card"><b>Als Nächstes (7 Tage)</b>${soon.length ? soon.slice(0, 4).map((p) => `<div class="row sp" data-a="stOpenNext" data-id="${esc(p.id)}" style="padding:4px 0;flex-wrap:nowrap"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${WD[new Date(p.date + "T12:00").getDay()]} ${fmt(p.date)} · ${esc(p.title)}</span>${stChip(p)}</div>`).join("") : '<div class="mut">Keine Beiträge in den nächsten 7 Tagen.</div>'}${soon.some((p) => p.status === "entwurf") ? '<div class="mut" style="margin-top:4px">Entwürfe in den nächsten Tagen brauchen noch deine Freigabe.</div>' : ""}</div>`;
}

function brandMissing() {
  const b = S.studio.brand,
    m = [];
  if (!b.region) m.push("Region");
  if (!b.signup) m.push("Anmeldeweg");
  if (!b.colorsConfirmed) m.push("Farben bestätigen");
  return m;
}
function vStudio() {
  const ym = sm(),
    all = livePosts(),
    P = all.filter((p) => (p.date || "").startsWith(ym) && passFilter(p)).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time) || postPrio(b) - postPrio(a));
  const weeks = {};
  for (const p of P) (weeks[weekKey(p.date)] = weeks[weekKey(p.date)] || []).push(p);
  const undated = all.filter((p) => !p.date && p.status !== "abgelehnt");
  const miss = brandMissing();
  const slots = planSlots(ym).length;
  const unrated = all.filter((p) => p.status === "veroeffentlicht" && !p.metrics);
  const L = S.studio.learned || {};
  return `<div class="row sp"><h1>Instagram-Studio</h1><button class="s" data-a="stBrand">Markenprofil</button></div>
${miss.length ? `<div class="card rec warn">Markenprofil vervollständigen: ${miss.join(", ")}. Ohne diese Angaben verweisen Beiträge nur auf die Website.<div class="row" style="margin-top:6px"><button class="s p" data-a="stBrand">Jetzt ergänzen</button></div></div>` : ""}
<div class="row sp"><button class="s" data-a="stMonth" data-id="-1">‹</button><h2 style="margin:0">${monthName(ym)}</h2><button class="s" data-a="stMonth" data-id="1">›</button></div>
${monthOverview(ym, all)}
<div class="chips">${Object.keys(FILTERS).map((k) => `<button class="${stFilter === k ? "on" : ""}" data-a="stFilter" data-id="${k}">${FILTERS[k]}</button>`).join("")}</div>
<div class="card"><b>Monatsplan</b><div class="mut">${slots ? slots + " freie Termine" : "Alle Termine sind belegt"}${P.filter((p) => p.status !== "abgelehnt").length ? " (" + P.filter((p) => p.status !== "abgelehnt").length + " Beiträge geplant)" : ""} (${S.studio.settings.perWeek} pro Woche, ${S.studio.settings.days.map((d) => WD[d]).join("/")}, ${S.studio.settings.time} Uhr). Die KI schreibt alle Beiträge mit Captions, Hashtags und Folientexten; die App gestaltet die Grafiken.</div>
<div class="row" style="margin-top:8px"><button class="p" data-a="stPrompt" ${slots ? "" : "disabled"}>${P.length ? "Freie Termine füllen" : "Monatsplan erstellen"}</button><button data-a="stNew">Einzelner Beitrag</button></div></div>
${Object.keys(weeks)
  .sort()
  .map((wk) => {
    const L2 = weeks[wk],
      open = L2.filter((p) => p.status === "entwurf"),
      warned = open.filter((p) => p.warnings && p.warnings.length);
    return `<h2>KW ${wk.split("-W")[1]} · ab ${fmt(weekMonday(L2[0].date))}</h2>${L2.map(postCard).join("")}${open.length ? `<div class="row"><button class="p" data-a="stApproveWeek" data-id="${esc(wk)}">Woche freigeben (${open.length - warned.length})</button>${warned.length ? `<span class="mut">${warned.length} mit Prüfhinweis – bitte einzeln prüfen</span>` : ""}</div>` : ""}`;
  })
  .join("")}
${!P.length ? `<p class="mut">${stFilter === "alle" ? "Für diesen Monat gibt es noch keine Beiträge. Tippe auf „Monatsplan erstellen“." : "Keine Beiträge in dieser Auswahl."}</p>` : ""}
${undated.length ? `<h2>Ohne Termin</h2>${undated.map(postCard).join("")}` : ""}
<h2>Auswertung</h2><div class="card">${L.n ? `<div>${esc(L.summary)}</div><div class="mut">Annahme auf Basis von ${L.n} ausgewerteten Beiträgen. Der Monatsplan berücksichtigt die Reihenfolge automatisch.</div>` : '<div class="mut">Noch keine Ergebnisse. Trage nach der Veröffentlichung Reichweite und Interaktionen ein (Beitrag öffnen → Ergebnisse).</div>'}${unrated.length ? `<div class="mut" style="margin-top:6px">${unrated.length} veröffentlichte Beiträge ohne Ergebnisse.</div>` : ""}</div>`;
}
function postCard(p) {
  return `<div class="card row" data-a="stOpen" data-id="${esc(p.id)}" style="align-items:flex-start;flex-wrap:nowrap"><div class="thumb" data-thumb="${esc(p.id)}"></div><div style="flex:1;min-width:0"><div class="row sp"><b>${p.date ? WD[new Date(p.date + "T12:00").getDay()] + " " + fmt(p.date) : "ohne Datum"}</b>${stChip(p)}</div><div class="mut">${esc(PTYPES[p.type] || p.type)} · ${esc(pillarName(p.pillar))}${p.source === "regel" ? " · automatisch erkannt" : ""}</div><div style="overflow:hidden;text-overflow:ellipsis">${postPrio(p) === 2 ? '<span class="chip st-wichtig">Wichtig</span> ' : ""}${esc(p.title)}</div>${p.warnings && p.warnings.length ? `<div class="mut" style="color:var(--warn)">⚠️ ${p.warnings.length} Prüfhinweis(e) – Einzelfreigabe nötig</div>` : ""}${p.hints && p.hints.length ? `<div class="mut">ℹ️ ${p.hints.length} Stilhinweis(e)</div>` : ""}</div></div>`;
}
/* Kleine Vorschaubilder nachträglich zeichnen */
const THUMB = {};
async function paintThumbs() {
  const els = [...document.querySelectorAll("[data-thumb]")];
  if (!els.length) return;
  const A = await brandAssets();
  for (const el of els) {
    const p = S.studio.posts.find((x) => x.id === el.dataset.thumb);
    if (!p) continue;
    let t = THUMB[p.id];
    if (!t || t.u !== p.updatedAt) {
      const big = renderSlide(p, 0, A, p.type === "story");
      const c = document.createElement("canvas");
      c.width = 144;
      c.height = Math.round((big.height / big.width) * 144);
      c.getContext("2d").drawImage(big, 0, 0, c.width, c.height);
      t = THUMB[p.id] = { u: p.updatedAt, c };
    }
    const c2 = document.createElement("canvas");
    c2.width = t.c.width;
    c2.height = t.c.height;
    c2.getContext("2d").drawImage(t.c, 0, 0);
    el.replaceChildren(c2);
  }
}

/* ---------- Beitrag ansehen und bearbeiten ---------- */
/* Bereiche statt einer langen Seite; feste Aktionsleiste; ungespeicherte Änderungen werden angezeigt
   und automatisch als Entwurf auf dem Gerät zwischengespeichert (gehen beim Schließen oder Absturz nicht verloren). */
const ED_TABS = { vorschau: "Vorschau", text: "Text", gestaltung: "Gestaltung", termin: "Termin" };
let EDIT = { id: null, dirty: false, tab: "vorschau", guides: false, timer: null, draftAt: 0 };
const wideScreen = () => window.matchMedia && window.matchMedia("(min-width: 900px)").matches;
async function postSheet(id, tab) {
  const p = S.studio.posts.find((x) => x.id === id);
  if (!p) return;
  curPost = id;
  if (EDIT.id !== id) EDIT = { id, dirty: false, tab: "vorschau", guides: false, timer: null, draftAt: 0 };
  EDIT.dirty = false;
  if (tab) EDIT.tab = tab;
  if (wideScreen() && EDIT.tab === "vorschau") EDIT.tab = "text";
  const story = storyView || p.type === "story";
  const tplOpts = (sel) => TEMPLATES.map((t) => `<option value="${t}" ${t === sel ? "selected" : ""}>${esc(TEMPLATE_NAMES[t] || t)}</option>`).join("");
  const ed = (s, i) => `<div class="card"><div class="row sp"><b>Folie ${i + 1}</b><select data-slide="${i}" data-f="template" style="width:auto;margin:0">${tplOpts(s.template)}</select></div>
<label>Titel</label><input data-slide="${i}" data-f="title" value="${esc(s.title)}"><label>Text${s.template === "info" ? " (Stichpunkte je Zeile)" : ""}</label><textarea data-slide="${i}" data-f="text">${esc(s.text)}</textarea>${s.template === "ankuendigung" || s.template === "erinnerung" ? `<label>Details (Datum, Ort – je Zeile)</label><textarea data-slide="${i}" data-f="details">${esc(s.details)}</textarea>` : ""}</div>`;
  const ph = p.photo || null;
  const panel = (k, h) => `<section data-panel="${k}" ${EDIT.tab === k ? "" : "hidden"}>${h}</section>`;
  const statusBtns =
    (p.status === "entwurf" ? `<button class="p" data-a="stSet" data-id="freigegeben">Freigeben</button><button data-a="stSet" data-id="abgelehnt">Ablehnen</button>` : "") +
    (p.status === "freigegeben" ? `<button class="p" data-a="stSet" data-id="veroeffentlicht">Als veröffentlicht markieren</button><button data-a="stSet" data-id="entwurf">Zurück zu Entwurf</button>` : "") +
    (p.status === "abgelehnt" ? `<button data-a="stSet" data-id="entwurf">Wieder als Entwurf</button>` : "");
  sheet(`<div class="ed"><div class="edhead"><div class="row sp" style="flex-wrap:nowrap"><h1 style="flex:1;margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.title)}</h1><span id="edDirty" class="chip st-dirty" hidden>Ungespeichert</span>${stChip(p)}<button class="s" data-a="stClose" aria-label="Schließen">✕</button></div>
<div class="chips edtabs">${Object.keys(ED_TABS).map((k) => `<button class="${EDIT.tab === k ? "on" : ""}" data-a="stTab" data-id="${k}">${ED_TABS[k]}</button>`).join("")}</div></div>
<div id="edDraft"></div>
<div class="edwrap">
${panel(
  "vorschau",
  `<div class="mut">${esc(PTYPES[p.type])} · ${esc(pillarName(p.pillar))}${p.kind ? " · " + esc(KINDS[p.kind] || p.kind) : ""} · ${p.date ? fmtLong(p.date) + ", " + esc(p.time) + " Uhr" : "ohne Datum"}${p.source === "regel" ? " · automatisch aus deinen Meetup-Daten erstellt" : p.source === "ki" ? " · von der KI geschrieben" : ""}</div>
${p.warnings && p.warnings.length ? `<div class="card rec warn"><b>Prüfhinweise (bitte prüfen, vor Freigabe)</b>${p.warnings.map((w) => `<div>• ${esc(w)}</div>`).join("")}</div>` : ""}${p.hints && p.hints.length ? `<div class="card rec"><b>Stilhinweise (optional)</b>${p.hints.map((w) => `<div>• ${esc(w)}</div>`).join("")}</div>` : ""}<p class="mut" style="font-size:12px">Die Prüfung erkennt typische Probleme anhand deiner Daten. Aussagen, zu denen keine Daten vorliegen, kann sie nicht auf Wahrheit prüfen – deine Kontrolle bleibt nötig.</p>
<div class="row" style="margin:8px 0"><button class="s ${story ? "" : "p"}" data-a="stView" data-id="feed">Feed</button><button class="s ${story ? "p" : ""}" data-a="stView" data-id="story">Story</button><label class="mut" style="margin-left:auto"><input type="checkbox" id="pe-guides" ${EDIT.guides ? "checked" : ""} style="width:auto;margin-right:4px">Schutzzonen</label></div>
<div id="stPrev" class="prev"></div><div id="stPrevNote" class="mut"></div>
<h2>Caption</h2><div class="card"><p style="margin:0;white-space:pre-wrap">${esc(postText(p))}</p></div>
<div class="row"><button class="p" data-a="stShare">Teilen (Instagram)</button><button data-a="stSave">Bilder speichern</button><button data-a="stCopy">Caption kopieren</button></div>`,
)}
${panel(
  "text",
  `<label>Caption</label><textarea id="pe-caption" style="min-height:200px">${esc(p.caption)}</textarea><div class="mut" id="pe-count"></div><label>Hashtags</label><input id="pe-tags" value="${esc((p.hashtags || []).join(" "))}">
<h2>Folien</h2>${p.slides.map(ed).join("")}<div class="row"><button data-a="stAddSlide">Folie hinzufügen</button>${p.slides.length > 1 ? `<button data-a="stDelSlide">Letzte Folie entfernen</button>` : ""}<button data-a="stRedo">Neu schreiben lassen</button></div>
${p.type === "reel" ? `<h2>Reel</h2><label>Skript</label><textarea id="pr-script" style="min-height:120px">${esc(p.reel && p.reel.script)}</textarea><label>Szenen (je Zeile)</label><textarea id="pr-shots">${esc(((p.reel && p.reel.shots) || []).join("\n"))}</textarea>` : ""}`,
)}
${panel(
  "gestaltung",
  `<label>Gestaltung</label><select id="pe-variant">${DESIGNS.map((n, i) => `<option value="${i}" ${i === (p.variant || 0) ? "selected" : ""}>${n}</option>`).join("")}</select><div class="row" style="margin:6px 0 4px"><button class="s" data-a="stAutoVariant">Automatisch passend wählen</button></div>
<label>Format</label><select id="pe-type">${Object.keys(PTYPES).map((k) => `<option value="${k}" ${k === p.type ? "selected" : ""}>${PTYPES[k]}</option>`).join("")}</select>
<h2>Eigenes Foto (optional)</h2><div class="card"><p class="mut" style="margin-top:0">Das Foto bleibt verkleinert auf diesem Gerät und wird nicht ins Backup oder in den Arbeitsauftrag übernommen. Es erscheint in den Vorlagen „Eigenes Foto“ und „Rückblick“.</p>
<input type="hidden" id="pe-photoid" value="${esc(ph ? ph.id : "")}"><div id="pe-photostate" class="mut">${ph ? "Foto hinterlegt" : "Kein Foto"}</div>
<input type="file" id="pe-photo" accept="image/*">
<label><input type="checkbox" id="pe-consent" ${ph && ph.consent ? "checked" : ""} style="width:auto;margin-right:6px">Ich habe die Rechte an diesem Foto, und alle erkennbaren Personen haben der Veröffentlichung zugestimmt.</label>
<label>Quelle / Notiz (optional, z. B. eigenes Foto)</label><input id="pe-photonote" value="${esc(ph ? ph.note : "")}">
${ph ? `<button class="s" data-a="stPhotoDel">Foto entfernen</button>` : ""}</div>`,
)}
${panel(
  "termin",
  `<div class="row"><div style="flex:1"><label>Datum</label><input type="date" id="pe-date" value="${esc(p.date)}"></div><div style="flex:1"><label>Uhrzeit</label><input type="time" id="pe-time" value="${esc(p.time)}"></div></div>
<label>Bereich</label><select id="pe-pillar">${PILLARS.map((q) => `<option value="${q.id}" ${q.id === p.pillar ? "selected" : ""}>${esc(q.name)}</option>`).join("")}</select>
<label>Interner Titel</label><input id="pe-title" value="${esc(p.title)}">
<label><input type="checkbox" id="pe-confirmed" ${p.confirmed ? "checked" : ""} style="width:auto;margin-right:6px">Angaben geprüft: Rückblicke und Erfahrungen stammen von mir und stimmen</label>
<h2>Status</h2><div class="card"><div>${stChip(p)} ${p.date && p.status === "freigegeben" ? "für " + fmt(p.date) + ", " + esc(p.time) + " Uhr" : ""}</div><div class="row" style="margin-top:8px">${statusBtns}</div></div>
${p.status === "veroeffentlicht" ? metricsForm(p) : ""}
<div class="row" style="margin-top:14px"><button data-a="stDel">Beitrag löschen</button></div>`,
)}
</div>
<div class="abar"><button class="p" data-a="stEdit" id="edSave">Speichern</button>${p.status === "entwurf" ? `<button data-a="stSet" data-id="freigegeben">Freigeben</button>` : ""}<button data-a="stClose">Schließen</button></div></div>`);
  $("#sheet").classList.add("wide");
  dirtyUi();
  countUi();
  await showDraftOffer(p);
  await paintPreview(p, story);
  postFiles(p, story).then((f) => (SFILES[p.id + (story ? ":s" : "")] = { u: p.updatedAt, f }));
}
/* Vorschau: zeigt die Formularwerte (auch ungespeichert), damit man das Ergebnis sofort sieht */
async function paintPreview(p, story = storyView || (p && p.type === "story")) {
  const box = $("#stPrev");
  if (!box || !p) return;
  const q = EDIT.dirty && $("#pe-caption") ? formPost(p) : p;
  const cvs = await renderPost(q, story, { guides: EDIT.guides });
  if (curPost !== p.id || !$("#stPrev")) return;
  box.replaceChildren(...cvs);
  const note = $("#stPrevNote");
  if (note) note.textContent = (EDIT.dirty ? "Vorschau mit ungespeicherten Änderungen. " : "") + (EDIT.guides ? (story ? "Rot: Bereiche, die Instagram in Storys überdeckt." : "Rot: wird im Profilraster (3:4) abgeschnitten.") : "") + (q.photo && q.photo.id && !q.photo.consent ? " Foto ohne bestätigte Einwilligung wird nicht verwendet." : "");
}
function dirtyUi() {
  const d = $("#edDirty");
  if (d) d.hidden = !EDIT.dirty;
}
function countUi() {
  const c = $("#pe-count"),
    t = $("#pe-caption");
  if (!c || !t) return;
  const w = t.value.split(/\s+/).filter(Boolean).length;
  c.textContent = `${w} Wörter · ${t.value.length} von 2.200 Zeichen`;
  c.style.color = t.value.length > 2200 ? "var(--warn)" : "";
}
/* Formularwerte lesen (ohne den Beitrag zu verändern) */
function formValues() {
  const v = {};
  document.querySelectorAll("#sheet [id^='pe-'], #sheet [id^='pr-']").forEach((el) => {
    if (el.type === "file") return;
    v[el.id] = el.type === "checkbox" ? el.checked : el.value;
  });
  document.querySelectorAll("#sheet [data-slide]").forEach((el) => (v["s:" + el.dataset.slide + ":" + el.dataset.f] = el.value));
  return v;
}
function applyValues(v) {
  for (const k in v) {
    if (k.startsWith("s:")) {
      const [, i, f] = k.split(":");
      const el = document.querySelector(`#sheet [data-slide="${i}"][data-f="${f}"]`);
      if (el) el.value = v[k];
    } else {
      const el = document.getElementById(k);
      if (el && el.type !== "file") el.type === "checkbox" ? (el.checked = !!v[k]) : (el.value = v[k]);
    }
  }
}
function formInto(q, v = formValues()) {
  const has = (k) => k in v;
  if (has("pe-date")) q.date = v["pe-date"];
  if (has("pe-time")) q.time = v["pe-time"] || q.time;
  if (has("pe-pillar")) q.pillar = v["pe-pillar"];
  if (has("pe-type")) q.type = v["pe-type"];
  if (has("pe-variant")) q.variant = Number(v["pe-variant"]) || 0;
  if (has("pe-title")) q.title = String(v["pe-title"]).trim() || q.title;
  if (has("pe-caption")) q.caption = v["pe-caption"];
  if (has("pe-tags")) q.hashtags = [...new Set(String(v["pe-tags"]).split(/[\s,]+/).map(cleanTag).filter(Boolean))].slice(0, 8);
  if (has("pe-confirmed")) q.confirmed = !!v["pe-confirmed"];
  if (has("pe-photoid")) q.photo = v["pe-photoid"] ? { id: v["pe-photoid"], consent: !!v["pe-consent"], note: String(v["pe-photonote"] || "").slice(0, 160) } : null;
  q.slides = q.slides.map((s, i) => {
    const n = { ...s };
    for (const f of ["template", "title", "text", "details"]) if (has(`s:${i}:${f}`)) n[f] = v[`s:${i}:${f}`];
    return n;
  });
  if (q.type !== "karussell" && q.slides.length > 1) q.slides = [q.slides[0]];
  if (q.type === "reel") q.reel = { script: has("pr-script") ? v["pr-script"] : (q.reel && q.reel.script) || "", shots: has("pr-shots") ? String(v["pr-shots"]).split("\n").map((s) => s.trim()).filter(Boolean) : (q.reel && q.reel.shots) || [] };
  return q;
}
const formPost = (p) => formInto(clone(p));
function readPostForm(p) {
  const oldPhoto = p.photo && p.photo.id;
  formInto(p);
  if (oldPhoto && (!p.photo || p.photo.id !== oldPhoto)) delPhoto(oldPhoto);
  checkPost(p);
  // Geänderter Inhalt nach Freigabe → zurück zu Entwurf, damit nur Freigegebenes veröffentlicht wird
  if (p.status === "freigegeben" && p.approvedHash && p.approvedHash !== postHash(p)) {
    p.status = "entwurf";
    p.approvedHash = null;
    p.reapprove = true;
  }
  touch(p);
  EDIT.dirty = false;
  kvPut("edit-draft", null);
}
/* Automatisches Zwischenspeichern ungespeicherter Eingaben (nur auf dem Gerät) */
function markDirty() {
  if (!EDIT.id) return;
  EDIT.dirty = true;
  dirtyUi();
  countUi();
  clearTimeout(EDIT.timer);
  EDIT.timer = setTimeout(() => {
    if (!EDIT.dirty || curPost !== EDIT.id) return;
    kvPut("edit-draft", { id: EDIT.id, at: Date.now(), v: formValues() });
    if (wideScreen()) paintPreview(S.studio.posts.find((x) => x.id === EDIT.id));
  }, 700);
}
async function showDraftOffer(p) {
  const d = await kvGet("edit-draft");
  const box = $("#edDraft");
  if (!box || !d || d.id !== p.id || !d.v || d.at < (p.updatedAt || 0)) return;
  box.innerHTML = `<div class="card rec warn">Ungespeicherte Änderungen vom ${new Date(d.at).toLocaleString("de-DE", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" })} gefunden.<div class="row" style="margin-top:6px"><button class="s p" data-a="stDraftUse">Wiederherstellen</button><button class="s" data-a="stDraftDrop">Verwerfen</button></div></div>`;
}
function editorTab(k) {
  EDIT.tab = k;
  document.querySelectorAll("#sheet [data-panel]").forEach((el) => (el.hidden = el.dataset.panel !== k));
  document.querySelectorAll("#sheet .edtabs button").forEach((b) => b.classList.toggle("on", b.dataset.id === k));
  if (k === "vorschau") paintPreview(S.studio.posts.find((x) => x.id === curPost));
  const s = $("#sheet > div");
  if (s) s.scrollTop = 0;
}
document.addEventListener("input", (e) => {
  if (!e.target.closest || !e.target.closest("#sheet .ed")) return;
  if (e.target.id === "pe-guides") return;
  if (e.target.type !== "file") markDirty();
});
document.addEventListener("change", async (e) => {
  if (!e.target.closest || !e.target.closest("#sheet .ed")) return;
  if (e.target.id === "pe-guides") {
    EDIT.guides = e.target.checked;
    return paintPreview(S.studio.posts.find((x) => x.id === curPost));
  }
  if (e.target.id === "pe-photo" && e.target.files && e.target.files[0]) {
    $("#pe-photostate").textContent = "Foto wird verarbeitet …";
    const r = await savePhoto(e.target.files[0]);
    if (!r.ok) return ($("#pe-photostate").textContent = r.error), toast(r.error);
    const prev = val("pe-photoid"),
      p = S.studio.posts.find((x) => x.id === curPost);
    if (prev && (!p || !p.photo || p.photo.id !== prev)) delPhoto(prev); // ungespeichertes vorheriges Foto
    $("#pe-photoid").value = r.id;
    $("#pe-photostate").textContent = `Neues Foto (${r.w}×${r.h}) – Einwilligung bestätigen und speichern`;
    const t0 = document.querySelector('#sheet [data-slide="0"][data-f="template"]');
    if (t0 && ["cover", "rueckblick", "frage"].includes(t0.value)) t0.value = "foto";
    markDirty();
  } else markDirty();
});
function metricsForm(p) {
  const m = p.metrics || {};
  const f = (k, n) => `<div style="flex:1;min-width:30%"><label>${n}</label><input id="pm-${k}" inputmode="numeric" value="${m[k] != null ? esc(m[k]) : ""}"></div>`;
  return `<h2>Ergebnisse</h2><div class="card"><div class="row">${f("reach", "Reichweite")}${f("likes", "Likes")}${f("comments", "Kommentare")}${f("saves", "Gespeichert")}${f("shares", "Geteilt")}${f("follows", "Neue Follower")}</div><button class="p" data-a="stMetrics">Ergebnisse speichern</button>${engagement(p.metrics) != null ? `<div class="mut">Interaktionsrate: ${(engagement(p.metrics) * 100).toFixed(1).replace(".", ",")} %</div>` : ""}</div>`;
}
/* ---------- Arbeitsauftrag Monatsplan ---------- */
function promptSheet(only) {
  const ym = sm(),
    pr = studioPrompt(ym, S, only);
  sheet(`<h1>${only ? "Beitrag neu schreiben lassen" : "Monatsplan " + monthName(ym)}</h1>
<p class="mut">1. Auftrag kopieren · 2. in Claude oder ChatGPT einfügen · 3. die komplette Antwort hier einfügen · 4. „Beiträge übernehmen“. Die App gestaltet danach alle Grafiken und prüft die Texte auf erfundene Angaben.</p>
<div id="warn">${pw(pr)}</div><textarea id="stPv" readonly style="min-height:200px">${esc(pr)}</textarea>
<div class="row"><button class="p" data-a="stCpPrompt">Auftrag kopieren</button><a class="lnk" href="https://claude.ai/new" target="_blank" rel="noopener">Claude</a><a class="lnk" href="https://chatgpt.com/" target="_blank" rel="noopener">ChatGPT</a></div>
<label style="display:block;margin-top:12px">Antwort der KI hier einfügen</label><textarea id="stAns" style="min-height:160px"></textarea>
<div class="row"><button class="p" data-a="stImport">Beiträge übernehmen</button><button data-a="close">Schließen</button></div>`);
}

/* ---------- Markenprofil ---------- */
function brandSheet() {
  const b = S.studio.brand,
    st = S.studio.settings,
    c = b.colors;
  const col = (k, n) => `<div style="flex:1;min-width:30%"><label>${n}</label><input type="color" id="bc-${k}" value="${esc(c[k])}" style="height:44px;padding:3px"><div class="mut">${esc(c[k])}</div></div>`;
  sheet(`<h1>Markenprofil</h1><p class="mut">Diese Angaben nutzt die KI für alle Beiträge. Sie bleiben in deinen App-Daten und gelangen nicht in den öffentlichen Programmcode.</p>
<label>Region (z. B. Stadt und Umgebung)</label><input id="bp-region" value="${esc(b.region)}">
<label>So meldet man sich an (genauer Weg, z. B. „Registrierung über vivalink.me“)</label><input id="bp-signup" value="${esc(b.signup)}">
<label>Website</label><input id="bp-website" value="${esc(b.website)}">
<label>Instagram-Kontoname (z. B. @…)</label><input id="bp-handle" value="${esc(b.handle)}">
<label>Feste Hashtags (optional)</label><input id="bp-tags" value="${esc(b.hashtags)}">
<label>Niemals erwähnen (optional)</label><input id="bp-avoid" value="${esc(b.avoid)}">
<h2>Markenfarben (aus dem offiziellen Logo, bestätigt)</h2><div class="row">${col("pink", "Pink")}${col("violet", "Violett")}${col("orange", "Orange")}</div>
<label><input type="checkbox" id="bp-ok" ${b.colorsConfirmed ? "checked" : ""} style="width:auto;margin-right:6px">Farben sind korrekt (bestätigt)</label>
<h2>Rhythmus</h2><label>Wochentage</label><div class="chips" style="flex-wrap:wrap">${[1, 2, 3, 4, 5, 6, 0].map((d) => `<label class="chip"><input type="checkbox" data-day="${d}" ${st.days.includes(d) ? "checked" : ""} style="width:auto;margin:0 4px 0 0">${WD[d]}</label>`).join("")}</div>
<div class="row"><div style="flex:1"><label>Uhrzeit (Annahme, später aus Ergebnissen)</label><input type="time" id="bp-time" value="${esc(st.time)}"></div><div style="flex:1"><label>Reels pro Monat</label><input id="bp-reels" inputmode="numeric" value="${esc(st.reelsPerMonth)}"></div></div>
<div class="row"><button class="p" data-a="stBrandSave">Speichern</button><button data-a="close">Abbrechen</button></div>`);
}

/* ---------- Aktionen ---------- */
async function studioAction(a, id, b) {
  const p = curPost && S.studio.posts.find((x) => x.id === curPost);
  if (a === "stMonth") {
    const [y, m] = sm().split("-").map(Number);
    const d = new Date(y, m - 1 + Number(id), 1);
    studioMonth = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
    render();
  } else if (a === "stFilter") {
    stFilter = id;
    render();
  } else if (a === "stOpen" || a === "stOpenNext") {
    storyView = false;
    EDIT.id = null;
    postSheet(id);
  } else if (a === "stView" && p) {
    storyView = id === "story";
    document.querySelectorAll('#sheet [data-a="stView"]').forEach((x) => x.classList.toggle("p", (x.dataset.id === "story") === storyView));
    await paintPreview(p, storyView || p.type === "story");
    const st = storyView || p.type === "story";
    postFiles(p, st).then((f) => (SFILES[p.id + (st ? ":s" : "")] = { u: p.updatedAt, f }));
  } else if (a === "stTab") editorTab(id);
  else if (a === "stClose") {
    if (EDIT.dirty && window._stc !== curPost) {
      window._stc = curPost;
      return toast("Ungespeicherte Änderungen: „Speichern“ tippen – oder nochmal „Schließen“ zum Verwerfen");
    }
    window._stc = null;
    if (EDIT.dirty && p) {
      const ph = $("#pe-photoid") && val("pe-photoid");
      if (ph && (!p.photo || p.photo.id !== ph)) delPhoto(ph);
      kvPut("edit-draft", null);
    }
    EDIT = { id: null, dirty: false, tab: "vorschau", guides: false, timer: null, draftAt: 0 };
    close();
  } else if (a === "stAutoVariant" && p) {
    const T2 = { ...S, studio: { ...S.studio, posts: S.studio.posts.filter((x) => x.id !== p.id) } };
    $("#pe-variant").value = String(pickVariant(val("pe-date") || p.date, T2));
    markDirty();
  } else if (a === "stPhotoDel" && p) {
    $("#pe-photoid").value = "";
    $("#pe-photostate").textContent = "Foto wird beim Speichern entfernt";
    markDirty();
  } else if (a === "stDraftUse") {
    const d = await kvGet("edit-draft");
    if (d && d.v) applyValues(d.v), markDirty();
    $("#edDraft").innerHTML = "";
  } else if (a === "stDraftDrop") {
    await kvPut("edit-draft", null);
    $("#edDraft").innerHTML = "";
  } else if (a === "stPrompt") promptSheet();
  else if (a === "stRedo" && p) promptSheet([{ date: p.date || today(), time: p.time, pillar: p.pillar, type: p.type }]);
  else if (a === "stCpPrompt") {
    const t = $("#stPv");
    try {
      await navigator.clipboard.writeText(t.value);
      toast("Auftrag kopiert");
    } catch (x) {
      t.select();
      toast("Markiert. Bitte manuell kopieren.");
    }
  } else if (a === "stImport") {
    const r = importPlan(val("stAns"));
    if (!r.ok) return toast(r.error);
    await save();
    logEvent("info", "studio.import", r.added.length + " Beiträge übernommen, " + r.warned + " mit Prüfhinweis");
    close();
    if (r.added[0] && r.added[0].date) studioMonth = r.added[0].date.slice(0, 7);
    render();
    toast(`${r.added.length} Beiträge als Entwurf übernommen${r.warned ? ` · ${r.warned} mit Prüfhinweis` : ""}${r.dupes ? ` · ${r.dupes} bereits vorhanden (übersprungen)` : ""}`);
  } else if (a === "stNew") {
    const q = makePost({ date: "", pillar: "community", type: "einzelbild", title: "Neuer Beitrag", slides: [{ template: "frage", title: "", text: "" }] }, "manuell");
    S.studio.posts.push(q);
    await save();
    render();
    postSheet(q.id);
  } else if (a === "stApproveWeek") {
    const n = approveWeek(id);
    await save();
    render();
    toast(n + " Beiträge freigegeben");
  } else if (a === "stSet" && p) {
    const warn = EDIT.dirty ? factCheck(formPost(p)) : p.warnings || [];
    if (id === "freigegeben" && warn.length && window._stw !== p.id) {
      window._stw = p.id;
      return toast("Prüfhinweise beachten. Nochmal tippen, um trotzdem freizugeben.");
    }
    window._stw = null;
    if (EDIT.dirty) readPostForm(p); // erst speichern, dann freigeben: freigegeben wird genau das Sichtbare
    const name = id === "freigegeben" ? "post.approve" : id === "veroeffentlicht" ? "post.publish" : null;
    const r = name ? await act(name, "gruender", () => setStatus(p, id) || { ok: true }) : (setStatus(p, id), { ok: true });
    if (r && r.ok === false) return toast(r.error || r.why || "Nicht möglich");
    await save();
    render();
    postSheet(p.id);
    toast(postState(p).n);
  } else if (a === "stEdit" && p) {
    readPostForm(p);
    await save();
    render();
    postSheet(p.id);
    toast("Gespeichert" + (p.reapprove ? " · nach der Änderung bitte erneut freigeben" : "") + (p.warnings.length ? " · " + p.warnings.length + " Prüfhinweis(e)" : ""));
    delete p.reapprove;
  } else if (a === "stAddSlide" && p) {
    readPostForm(p);
    if (p.type !== "karussell") p.type = "karussell";
    p.slides.splice(Math.max(1, p.slides.length - 1), 0, { template: "tipp", title: "", text: "", details: "" });
    touch(p);
    await save();
    postSheet(p.id);
  } else if (a === "stDelSlide" && p) {
    readPostForm(p);
    p.slides.pop();
    touch(p);
    await save();
    postSheet(p.id);
  } else if (a === "stDel" && p) {
    if (window._std !== p.id) {
      window._std = p.id;
      return toast("Nochmal tippen, um den Beitrag zu löschen");
    }
    window._std = null;
    p.deleted = true;
    touch(p);
    await save();
    close();
    render();
    toast("Beitrag gelöscht");
  } else if (a === "stCopy" && p) {
    try {
      await navigator.clipboard.writeText(postText(p));
      toast("Caption kopiert");
    } catch (x) {
      toast("Kopieren nicht möglich");
    }
  } else if ((a === "stShare" || a === "stSave") && p) {
    const story = storyView || p.type === "story";
    const key = p.id + (story ? ":s" : "");
    const cached = SFILES[key] && SFILES[key].u === p.updatedAt ? SFILES[key].f : null;
    if (a === "stShare" && cached && navigator.canShare && navigator.canShare({ files: cached })) {
      navigator.clipboard && navigator.clipboard.writeText(postText(p)).catch(() => {});
      try {
        await navigator.share({ files: cached });
        logEvent("info", "studio.share", "Beitrag geteilt");
        toast("Caption ist kopiert – in Instagram einfügen");
      } catch (x) {
        if (!x || x.name !== "AbortError") toast("Teilen nicht möglich – „Bilder speichern“ nutzen");
      }
      return;
    }
    const files = cached || (await postFiles(p, story));
    for (const f of files) {
      const u = URL.createObjectURL(f);
      const l = document.createElement("a");
      l.href = u;
      l.download = f.name;
      document.body.appendChild(l);
      l.click();
      l.remove();
      setTimeout(() => URL.revokeObjectURL(u), 4000);
    }
    if (a === "stShare") navigator.clipboard && navigator.clipboard.writeText(postText(p)).catch(() => {});
    toast(files.length + " Bild(er) gespeichert" + (a === "stShare" ? " · Caption kopiert" : ""));
  } else if (a === "stMetrics" && p) {
    const n = (k) => {
      const v = val("pm-" + k).trim();
      return v === "" || isNaN(v) ? null : Math.max(0, Math.round(Number(v)));
    };
    p.metrics = { reach: n("reach"), likes: n("likes"), comments: n("comments"), saves: n("saves"), shares: n("shares"), follows: n("follows"), at: Date.now() };
    touch(p);
    learn();
    await save();
    render();
    postSheet(p.id);
    toast("Ergebnisse gespeichert");
  } else if (a === "stBrand") brandSheet();
  else if (a === "stBrandSave") {
    const bb = S.studio.brand,
      st = S.studio.settings;
    bb.region = val("bp-region").trim();
    bb.signup = val("bp-signup").trim();
    bb.website = val("bp-website").trim() || "vivalink.me";
    bb.handle = val("bp-handle").trim();
    bb.hashtags = val("bp-tags").trim();
    bb.avoid = val("bp-avoid").trim();
    for (const k of ["pink", "violet", "orange"]) bb.colors[k] = val("bc-" + k);
    bb.colorsConfirmed = $("#bp-ok").checked;
    touch(bb);
    const days = [...document.querySelectorAll("[data-day]")].filter((e) => e.checked).map((e) => +e.dataset.day);
    if (days.length) st.days = days;
    st.perWeek = st.days.length;
    st.time = val("bp-time") || st.time;
    st.reelsPerMonth = Math.max(0, Math.min(8, Math.round(Number(val("bp-reels")) || 0)));
    touch(st);
    for (const k in THUMB) delete THUMB[k];
    await save();
    close();
    render();
    toast("Markenprofil gespeichert");
  }
}
