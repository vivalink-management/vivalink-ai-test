/* Ansichten */
let showAllMet = false;
function vHome() {
  const open = S.tasks.filter((x) => !x.done),
    act = S.memory.filter((m) => m.active),
    t = today();
  const withVal = S.metrics.filter((m) => cur(m) || oldE(m));
  const mets = showAllMet ? S.metrics : withVal;
  return (
    `<h1>Vivalink Management AI</h1><div class="mut">${new Date().toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" })}</div>
<div class="stats"><div class="stat"><b>${open.length}</b><span>offen</span></div><div class="stat"><b>${open.filter((x) => x.due && x.due < t).length}</b><span>überfällig</span></div><div class="stat"><b>${act.length}</b><span>Wissen</span></div><div class="stat"><b>${act.filter((m) => m.cat === "Entscheidung").length}</b><span>Entscheidungen</span></div></div>
${statusHtml()}${manageHtml()}<h2>Empfehlungen</h2>` +
    topHtml() +
    `${goalsHtml()}${meetupHtml()}${studioHomeCard()}<h2>Kennzahlen</h2>${mets.length ? mets.map(mCardHtml).join("") : '<p class="mut">Noch keine Werte. Sie kommen später automatisch aus der Verwaltung oder du trägst sie ein.</p>'}<div class="row"><button class="s" data-a="allMet">${showAllMet ? "Nur Kennzahlen mit Werten" : "Alle Kennzahlen (" + S.metrics.length + ")"}</button></div>
<h2>Als Nächstes</h2><div class="row"><button class="p" data-a="newMem">Wissen eintragen</button><button data-a="newTask">Aufgabe anlegen</button><button data-a="tab" data-id="ai">Arbeitsauftrag</button></div>`
  );
}

function studioHomeCard() {
  if (!S.studio) return "";
  const t = today(),
    wk = livePosts().filter((p) => p.date && p.date >= t && p.date <= addDays(t, 7) && p.status !== "abgelehnt");
  return `<h2>Instagram</h2><div class="card" data-a="tab" data-id="studio"><div class="row sp"><b>Nächste 7 Tage</b><b>${wk.length} Beiträge</b></div><div class="mut">${wk.filter((p) => p.status === "freigegeben").length} freigegeben · ${wk.filter((p) => p.status === "entwurf").length} Entwürfe · ${wk.filter((p) => p.status === "veroeffentlicht").length} veröffentlicht</div></div>`;
}

function vTasks() {
  const o = orderTasks(liveTasks().filter((x) => !x.done)),
    d = liveTasks().filter((x) => x.done).sort((a, b) => b.doneAt - a.doneAt);
  const msr = (x) =>
    x.measure
      ? `<div class="mut">Maßnahme · Prüfung ${fmt(x.measure.checkAt)} · ${esc(measureLine(x))}</div>${
          x.measure.outcome
            ? `<div class="mut">Ergebnis: ${esc(x.measure.outcome)} (Einschätzung)</div>`
            : x.measure.checkAt <= today() || x.done
              ? `<div class="row" style="margin-top:4px"><span class="mut">Hat es gewirkt?</span><button class="s" data-a="msrOut" data-id="${esc(x.id)}" data-v="wirksam">Ja</button><button class="s" data-a="msrOut" data-id="${esc(x.id)}" data-v="unklar">Unklar</button><button class="s" data-a="msrOut" data-id="${esc(x.id)}" data-v="nicht-wirksam">Nein</button></div><div class="mut" style="font-size:12px">Zeitlicher Zusammenhang – keine bewiesene Ursache.</div>`
              : ""
        }`
      : "";
  const card = (x) => {
    const blk = !x.done && blockedBy(x),
      pre = x.after && S.tasks.find((y) => y.id === x.after);
    return `<div class="card row sp" ${blk ? 'style="opacity:.75"' : ""}><div style="flex:1;min-width:0" data-a="editTask" data-id="${esc(x.id)}"><div class="${x.done ? "done" : ""}">${esc(x.title)}</div><div class="mut">${esc(x.prio)} · ${esc(x.area)}${x.due ? " · Frist " + fmt(x.due) : ""}${x.due && !x.done && x.due < today() ? " · überfällig" : ""}</div>${blk ? `<div class="mut">⏳ wartet auf: ${esc(blk.title)}</div>` : pre && !x.done ? `<div class="mut">nach: ${esc(pre.title)} ✓</div>` : ""}${msr(x)}</div><button class="s" data-a="toggle" data-id="${esc(x.id)}">${x.done ? "Wieder öffnen" : "Erledigt"}</button></div>`;
  };
  return (
    `<div class="row sp"><h1>Aufgaben</h1><button class="p" data-a="newTask">Neu</button></div>` +
    (o.length ? o.map(card).join("") : '<p class="mut">Keine offenen Aufgaben. Lege die erste an.</p>') +
    `<h2><span data-a="doneToggle">Erledigt (${d.length}) ${showDone ? "▾" : "▸"}</span></h2>` +
    (showDone ? d.map(card).join("") : "")
  );
}

function chain(id) {
  let m = S.memory.find((x) => x.id === id);
  while (m && m.supersedes) {
    const p = S.memory.find((x) => x.id === m.supersedes);
    if (!p) break;
    m = p;
  }
  const out = [];
  while (m) {
    out.push(m);
    m = S.memory.find((x) => x.id === m.supersededBy);
  }
  return out;
}
function mCard(m) {
  const v = m.supersedes || m.supersededBy;
  return `<div class="card ${m.active ? "" : "old"}"><div class="row sp"><b>${esc(m.title)}</b><span class="chip">${esc(m.cat)}</span></div>
<div class="mut">${stl(m.status)} · ${fmt(m.date)}${m.active ? "" : " · ersetzt"}${m.private ? " · 🔒 vertraulich" : ""}</div>${m.text ? `<p>${esc(m.text)}</p>` : ""}
${m.reason ? `<div><span class="mut">Begründung:</span> ${esc(m.reason)}</div>` : ""}${m.result ? `<div><span class="mut">Ergebnis:</span> ${esc(m.result)}</div>` : ""}
${m.changeReason ? `<div><span class="mut">Grund der Änderung:</span> ${esc(m.changeReason)}</div>` : ""}
<div class="row" style="margin-top:8px">${m.active ? `<button class="s" data-a="editMem" data-id="${esc(m.id)}">Ändern</button>` : ""}${v ? `<button class="s" data-a="hist" data-id="${esc(m.id)}">Verlauf</button>` : ""}</div></div>`;
}
function memList() {
  const q = mf.q.toLowerCase();
  const l = S.memory
    .filter(
      (m) =>
        (mf.hist || m.active) &&
        (!mf.cat || m.cat === mf.cat) &&
        (!q || (m.title + " " + m.text + " " + m.reason + " " + m.result).toLowerCase().includes(q)),
    )
    .sort((a, b) => b.createdAt - a.createdAt);
  return l.length
    ? l.map(mCard).join("")
    : '<p class="mut">Keine Einträge gefunden. Trage Wissen über Vivalink ein, damit die KI später darauf aufbauen kann.</p>';
}
function vMem() {
  return `<div class="row sp"><h1>Gedächtnis</h1><button class="p" data-a="newMem">Neu</button></div>
<input id="q" placeholder="Suchen" value="${esc(mf.q)}">
<div class="chips"><button class="${mf.cat ? "" : "on"}" data-a="cat" data-id="">Alle</button>${CATS.map((c) => `<button class="${mf.cat === c ? "on" : ""}" data-a="cat" data-id="${esc(c)}">${c}</button>`).join("")}</div>
<label><input type="checkbox" id="hist" ${mf.hist ? "checked" : ""} style="width:auto;margin-right:6px">Auch ersetzte Einträge zeigen</label><div id="list">${memList()}</div>`;
}

function vMore() {
  const gpu = "gpu" in navigator,
    oc = openConflicts();
  return `<h1>Mehr</h1><h2>Daten übertragen (optional)</h2><div class="card">
<p class="mut">Optional: nur nötig, um Daten auf ein anderes Gerät zu übertragen, bis die Synchronisierung kommt. Das Backup enthält auch vertrauliche Einträge – nur in einer <b>gesperrten Notiz</b> oder als Datei aufbewahren.</p>
<div class="row"><button class="p" data-a="exp">Backup kopieren</button><button data-a="expFile">Als Datei sichern</button></div>
<label style="display:block;margin-top:12px">Backup einfügen, prüfen und zusammenführen</label><textarea id="imp" placeholder="Backup-Text hier einfügen"></textarea><div class="row"><button data-a="chkImp">Backup prüfen</button><button data-a="imp">Zusammenführen</button></div><div id="impRes"></div>
${PREIMP ? `<p class="mut">Rückgängig-Punkt vom ${new Date(PREIMP.at).toLocaleString("de-DE")} (${esc(PREIMP.label || "Import")}).</p><button data-a="undoImp">Letzten Import rückgängig machen</button>` : ""}</div>
${IS_TEST && typeof demoCard === "function" ? demoCard() : ""}<h2>Verwaltung</h2><div class="card"><p class="mut">Zusammengefasste Kennzahlen automatisch aus der Vivalink-Verwaltung übernehmen.</p><button data-a="kpi">Kennzahlen aus der Verwaltung</button></div><h2>Autonomie</h2><div class="card"><p class="mut">Ablauf der App, Stufen und deine widerrufbaren Berechtigungen.</p><button data-a="auto">Autonomie und Berechtigungen</button></div><h2>Synchronisierung iPhone ↔ iPad</h2><div class="card"><p class="mut">${syncUrl() ? "Ende-zu-Ende verschlüsselt. Hält deine Geräte automatisch auf demselben Stand." : "Vorbereitet, noch nicht freigegeben (kostenloser Speicher wird nach deiner Entscheidung eingerichtet)."}</p><button data-a="sync">Synchronisierung</button></div>
<h2>Automatische Sicherung</h2><div class="card"><p>Die App legt täglich automatisch einen Sicherungspunkt auf diesem Gerät an (die letzten 7 Tage). Manuelle Backups sind nicht nötig.</p><button data-a="snaps">Sicherungspunkte anzeigen</button></div>
<h2>Datenkonflikte</h2>${oc.length ? `<p class="mut">Derselbe Eintrag wurde auf zwei Geräten unterschiedlich geändert. Bis zu deiner Entscheidung gilt die neuere Version. Nichts wurde gelöscht.</p>` + oc.map(conflictHtml).join("") : '<div class="card mut">Keine offenen Konflikte.</div>'}
<h2>Diagnose</h2><div class="card"><p>Technischer Zustand, Speichertest, Integritätsprüfung und Fehlerprotokoll. Der Diagnosebericht enthält keine Inhalte aus Gedächtnis, Aufgaben oder Kennzahlen.</p><button class="p" data-a="diag">Diagnose öffnen</button></div>
<h2>Gerätetest für lokale KI</h2><div class="card">WebGPU: <b>${gpu ? "verfügbar" : "nicht verfügbar"}</b><p class="mut">${gpu ? "Dein Gerät kann voraussichtlich ein kleines lokales KI-Modell ausführen. Den echten Leistungstest bauen wir im nächsten Schritt." : "Ohne WebGPU läuft keine lokale KI im Browser. Prüfe unter iOS Einstellungen › Apps › Safari › Erweitert › Funktionen, ob WebGPU aktiv ist."}</p></div>
<h2>KI-Test</h2><div class="card"><p>Teste ein lokales KI-Modell auf diesem Gerät und halte die Ergebnisse fest. Deine Unternehmensdaten werden dabei nicht verändert.</p><button class="p" data-a="aiTest">KI-Test öffnen</button></div><h2>Gestaltung</h2><div class="card"><label>Akzentfarbe (später deine Markenfarbe)</label><input type="color" id="ac" value="${esc(S.accent || "#0f766e")}" style="height:48px;padding:4px"></div>
<h2>Sicherheitskopie</h2><div class="card"><p class="mut">${SAFE ? "Automatische Kopie vom Stand vor dem Update auf Datenversion " + esc(SAFE.to || 2) + " vom " + new Date(SAFE.at).toLocaleDateString("de-DE") + ". Beim Wiederherstellen gehen später eingetragene Daten verloren (vorher wird ein Rückgängig-Punkt angelegt)." : "Keine automatische Sicherheitskopie vorhanden."}</p>${SAFE ? '<button data-a="restore">Stand vor dem Update wiederherstellen</button>' : ""}</div><h2>Datenschutz</h2><p class="mut">Alle Daten liegen nur auf diesem Gerät. Nichts wird an einen Server gesendet. Das technische Protokoll enthält keine Inhalte und bleibt ebenfalls auf dem Gerät.</p><p class="mut">Version ${APP_VERSION} · Datenversion ${SCHEMA}</p>`;
}

function render() {
  const v = { home: vHome, tasks: vTasks, memory: vMem, studio: vStudio, ai: vAi, more: vMore }[tab]();
  $("#app").innerHTML = (IS_TEST ? '<div class="testbar">TESTVERSION · nur künstliche Testdaten · getrennt von deiner Vivalink AI</div>' : "") + v;
  document.documentElement.style.setProperty("--ac", S.accent || "#0f766e");
  $("#nav").innerHTML = [
    ["home", "Start"],
    ["tasks", "Aufgaben"],
    ["memory", "Gedächtnis"],
    ["studio", "Studio"],
    ["ai", "Aufträge"],
    ["more", "Mehr"],
  ]
    .map((x) => `<button class="${tab === x[0] ? "on" : ""}" data-a="tab" data-id="${esc(x[0])}">${x[1]}</button>`)
    .join("");
  if (tab === "studio") paintThumbs();
}
const sheet = (h) => {
  const s = $("#sheet");
  s.className = "sheet";
  s.innerHTML = "<div>" + h + "</div>";
  s.hidden = false;
};
const close = () => {
  $("#sheet").hidden = true;
};
const opts = (l, s) => l.map((x) => `<option ${x === s ? "selected" : ""}>${x}</option>`).join("");

let taskEdit = null;
function taskForm(x) {
  taskEdit = x ? x.id : null;
  x = x || { prio: "mittel", area: "App", due: "", after: "" };
  const pre = liveTasks()
    .filter((y) => !y.done && y.id !== taskEdit && !(taskEdit && makesCycle(taskEdit, y.id)))
    .map((y) => `<option value="${esc(y.id)}" ${y.id === x.after ? "selected" : ""}>${esc(y.title.slice(0, 60))}</option>`)
    .join("");
  sheet(
    `<h1>${taskEdit ? "Aufgabe bearbeiten" : "Neue Aufgabe"}</h1><label>Was ist zu tun?</label><input id="t-t" value="${esc(x.title || "")}"><label>Priorität</label><select id="t-p">${opts(["hoch", "mittel", "niedrig"], x.prio)}</select><label>Bereich</label><select id="t-a">${opts(CATS, CATS.includes(x.area) ? x.area : "App")}</select><label>Frist (optional)</label><input type="date" id="t-d" value="${esc(x.due || "")}"><label>Erst nach dieser Aufgabe (optional)</label><select id="t-after"><option value="">– keine –</option>${pre}</select><div class="row"><button class="p" data-a="saveTask">Speichern</button><button data-a="close">Abbrechen</button>${taskEdit ? '<button data-a="delTask">Löschen</button>' : ""}</div>`,
  );
}
function memForm(o) {
  editId = o ? o.id : null;
  o = o || { cat: "Ziele", status: "confirmed", date: today() };
  sheet(`<h1>${editId ? "Eintrag ändern" : "Neuer Eintrag"}</h1>${editId ? `<div class="card rec warn">Der alte Eintrag bleibt als Vorgänger erhalten. Du siehst später, was sich wann und warum geändert hat.</div>` : ""}
<label>Kategorie</label><select id="f-cat">${opts(CATS, o.cat)}</select><label>Titel</label><input id="f-title" value="${esc(o.title)}"><label>Inhalt</label><textarea id="f-text">${esc(o.text)}</textarea>
<label>Wie sicher ist das?</label><select id="f-st">${Object.keys(STL)
    .map((k) => `<option value="${k}" ${k === o.status ? "selected" : ""}>${STL[k]}</option>`)
    .join("")}</select>
<label>Datum</label><input type="date" id="f-date" value="${esc(o.date)}"><label>Begründung (warum?)</label><textarea id="f-re">${esc(o.reason)}</textarea><label>Ergebnis (was kam heraus?)</label><textarea id="f-res">${esc(o.result)}</textarea><label><input type="checkbox" id="f-pv" ${o.private ? "checked" : ""} style="width:auto;margin-right:6px">Vertraulich oder personenbezogen (wird nie in Arbeitsaufträge übernommen)</label>
${editId ? `<label>Warum änderst du das? (Pflicht)</label><textarea id="f-cr"></textarea>` : ""}<div class="row"><button class="p" data-a="saveMem">Speichern</button><button data-a="close">Abbrechen</button></div>`);
}
function histView(id) {
  const c = chain(id).reverse();
  sheet(
    `<h1>Verlauf</h1><div class="tl">${c.map((m, i) => `<div class="card ${m.active ? "" : "old"}"><b>${m.active ? "Aktuell" : "Früher"}: ${esc(m.title)}</b><div class="mut">${fmt(m.date)} · ${stl(m.status)}</div>${m.text ? `<p>${esc(m.text)}</p>` : ""}${m.reason ? `<div><span class="mut">Begründung:</span> ${esc(m.reason)}</div>` : ""}${m.result ? `<div><span class="mut">Ergebnis:</span> ${esc(m.result)}</div>` : ""}${m.changeReason ? `<div><span class="mut">Warum geändert:</span> ${esc(m.changeReason)}</div>` : ""}</div>`).join("")}</div><button data-a="close">Schließen</button>`,
  );
}

