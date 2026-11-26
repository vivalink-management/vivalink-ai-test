/* Empfehlungen und Maßnahmenkontrolle
   Jeder Befund des Regelmotors wird um Bedeutung, mögliche Ursachen (immer als Annahme) und priorisierte
   Maßnahmen ergänzt. Eine freigegebene Maßnahme merkt sich den Ausgangswert der betroffenen Kennzahl und
   wird zum Prüftermin ausgewertet – ausdrücklich ohne Ursache-Wirkungs-Behauptung. */

const LV = ["", "niedrig", "mittel", "hoch"];
const mScore = (m) => m.n * 2 + m.d * 2 - m.a; // Nutzen und Dringlichkeit zählen doppelt, Aufwand mindert
const mPrio = (m) => (mScore(m) >= 10 ? "hoch" : mScore(m) >= 7 ? "mittel" : "niedrig");

/* Wissen je Befund (Schlüssel = Befund-ID oder Präfix vor dem Bindestrich-Teil der Kennzahl) */
const EXPLAIN = {
  "t-od": { mean: "Überfällige Aufgaben verlieren an Wirkung und binden Aufmerksamkeit.", causes: ["Frist war zu knapp geplant", "Aufgabe ist nicht mehr relevant", "Zu viele Aufgaben gleichzeitig"], measures: [{ t: "Fristen realistisch neu setzen", n: 2, d: 3, a: 1 }, { t: "Nicht mehr relevante Aufgaben als erledigt markieren", n: 2, d: 2, a: 1 }] },
  "t-focus": { mean: "Wenn alles wichtig ist, ist nichts wichtig – Fortschritt verteilt sich auf zu viele Baustellen.", causes: ["Prioritäten nicht regelmäßig überprüft"], measures: [{ t: "Höchstens 3 Aufgaben mit hoher Priorität behalten", n: 2, d: 2, a: 1 }] },
  "t-hn": { mean: "Wichtige Aufgaben ohne Frist werden leicht verschoben.", causes: ["Beim Anlegen keine Frist gesetzt"], measures: [{ t: "Fristen für wichtige Aufgaben festlegen", n: 2, d: 2, a: 1 }] },
  "t-st": { mean: "Lange offene Aufgaben deuten auf Blockaden oder fehlende Relevanz hin.", causes: ["Aufgabe zu groß formuliert", "Abhängigkeit von anderen"], measures: [{ t: "In kleinere Schritte teilen oder streichen", n: 2, d: 1, a: 1 }] },
  "t-wk": { mean: "Ohne Plan für die nächsten Tage gehen Routineaufgaben unter.", causes: [], measures: [{ t: "Mindestens eine Aufgabe für diese Woche einplanen", n: 1, d: 2, a: 1 }] },
  "g-gap": { mean: "Fehlendes Grundwissen macht Empfehlungen und Instagram-Beiträge ungenauer.", causes: [], measures: [{ t: "Wichtigste Grundlagen im Gedächtnis eintragen", n: 3, d: 1, a: 2 }] },
  "g-un": { mean: "Unklare Angaben können zu falschen Empfehlungen führen.", causes: [], measures: [{ t: "Status klären (bestätigt oder Einschätzung)", n: 2, d: 1, a: 1 }] },
  "g-nr": { mean: "Ohne festgehaltenes Ergebnis kann die App aus Entscheidungen nicht lernen.", causes: [], measures: [{ t: "Ergebnis der Entscheidung eintragen", n: 2, d: 2, a: 1 }] },
  "g-eo": { mean: "Alte Einschätzungen können überholt sein.", causes: [], measures: [{ t: "Einschätzungen prüfen und bestätigen oder ändern", n: 1, d: 1, a: 1 }] },
  "m-trend": {
    mean: "Die Kennzahl entwickelt sich ungünstig. Bleibt das so, wirkt es sich auf Wachstum und Meetups aus.",
    causes: ["Saisonale Schwankung", "Weniger Sichtbarkeit, z. B. weniger Beiträge", "Veränderung im Angebot oder Ablauf"],
    measures: [{ t: "Zusätzlichen Instagram-Beitrag zum Thema vorbereiten", n: 2, d: 2, a: 1, studio: "post" }, { t: "Ursachen per Tiefenanalyse untersuchen", n: 2, d: 2, a: 2 }, { t: "Kennzahl in 14 Tagen erneut prüfen", n: 1, d: 1, a: 1 }],
  },
  "m-go": { mean: "Die Kennzahl liegt unter deinem Ziel.", causes: ["Ziel ambitioniert gewählt", "Zu wenig Reichweite", "Angebot noch wenig bekannt"], measures: [{ t: "Zusätzlichen Instagram-Beitrag mit Handlungsaufforderung vorbereiten", n: 2, d: 2, a: 1, studio: "post" }, { t: "Ziel überprüfen (Geschäftsentscheidung)", n: 1, d: 1, a: 1 }] },
  "m-stale": { mean: "Veraltete Zahlen führen zu ungenauen Empfehlungen.", causes: ["Noch keine automatische Übernahme aus der Verwaltung"], measures: [{ t: "Wert aktualisieren", n: 2, d: 1, a: 1 }] },
  "mt-pace": {
    mean: "Bei zu wenigen Anmeldungen kurz vor dem Treffen kann das Meetup klein ausfallen oder muss abgesagt werden.",
    causes: ["Ankündigung zu spät oder zu selten", "Termin oder Uhrzeit ungünstig", "Die Zielgruppe erreicht die Information nicht"],
    measures: [{ t: "Instagram-Story als Meetup-Erinnerung", n: 3, d: 3, a: 1, studio: "story" }, { t: "Zusätzlichen Feed-Beitrag zum Meetup", n: 2, d: 3, a: 1, studio: "post" }, { t: "Persönliche Einladung über die Vivalink-App an Interessierte", n: 3, d: 3, a: 2 }],
    metric: "signups",
  },
  "mt-nd": { mean: "Ohne aktuellen Anmeldestand lässt sich nicht beurteilen, ob das Meetup gut gefüllt ist.", causes: [], measures: [{ t: "Anmeldestand eintragen", n: 2, d: 3, a: 1 }], metric: "signups" },
  "mt-ms": { mean: "Unvollständige Meetup-Angaben verhindern Ankündigungen und Auswertungen.", causes: [], measures: [{ t: "Datum, Ort und Ziel ergänzen", n: 2, d: 2, a: 1 }] },
  "mt-no": { mean: "Ohne geplantes Meetup kann die App keine Ankündigungen vorbereiten.", causes: [], measures: [{ t: "Nächstes Meetup anlegen", n: 2, d: 1, a: 1 }] },
  "ig-wait": { mean: "Ohne Freigabe werden geplante Beiträge nicht veröffentlicht – der Rhythmus bricht ab.", causes: [], measures: [{ t: "Woche im Studio prüfen und freigeben", n: 2, d: 3, a: 1 }] },
  "ig-due": { mean: "Freigegebene Beiträge sind fällig – Verzögerung kostet Reichweite.", causes: [], measures: [{ t: "Beitrag teilen und als veröffentlicht markieren", n: 2, d: 3, a: 1 }] },
  "ig-plan": { mean: "Ohne Plan für den nächsten Monat fehlen ab dessen Beginn Beiträge.", causes: [], measures: [{ t: "Monatsplan im Studio erstellen", n: 2, d: 2, a: 1 }] },
  "ig-none": { mean: "Regelmäßige Beiträge halten Vivalink sichtbar.", causes: [], measures: [{ t: "Beiträge für diese Woche erstellen", n: 2, d: 2, a: 1 }] },
  "ig-rate": { mean: "Ohne Ergebnisse kann die Planung nicht lernen, was funktioniert.", causes: [], measures: [{ t: "Reichweite und Interaktionen eintragen", n: 2, d: 1, a: 1 }] },
  "sys-cf": { mean: "Bis zur Entscheidung gilt die neuere Version; die andere bleibt erhalten.", causes: ["Dieselben Daten wurden auf zwei Geräten unterschiedlich geändert"], measures: [{ t: "Konflikte unter „Mehr“ entscheiden", n: 2, d: 3, a: 1 }] },
  "sys-err": { mean: "Technische Fehler können einzelne Funktionen beeinträchtigen.", causes: [], measures: [{ t: "Diagnosebericht kopieren und als Reparaturauftrag übergeben", n: 2, d: 2, a: 1 }] },
  "q-noshow": { mean: "Viele Absagen bedeuten leere Plätze und schwer planbare Gruppen.", causes: ["Anmeldung zu früh ohne Erinnerung", "Termin oder Ort unpassend", "geringe Verbindlichkeit"], measures: [{ t: "Bestätigung 48 Stunden vorher und Erinnerung am Vortag", n: 3, d: 2, a: 1 }, { t: "Absagegründe beim nächsten Meetup erfragen", n: 2, d: 1, a: 1 }], metric: "noshow" },
  "q-refund": { mean: "Hohe Erstattungen schmälern die Einnahmen und deuten auf Unzufriedenheit oder unklare Bedingungen.", causes: ["Absagen durch Vivalink", "unklare Stornobedingungen", "kurzfristige Absagen der Teilnehmer"], measures: [{ t: "Erstattungsgründe der letzten 30 Tage durchsehen", n: 2, d: 1, a: 1 }], metric: "refunds" },
  "q-active": { mean: "Registrierte, die nicht aktiv sind, kommen nicht zu Meetups – Wachstum entsteht dann nur auf dem Papier.", causes: ["keine passenden Termine", "fehlende Erinnerung", "Onboarding nicht abgeschlossen"], measures: [{ t: "Reaktivierungs-Beitrag im Instagram-Studio planen", n: 2, d: 2, a: 1 }, { t: "Einladungsrunde an inaktive Mitglieder", n: 3, d: 3, a: 2 }], metric: "active_users" },
  "q-invite": { mean: "Eine niedrige Annahmequote verschenkt Reichweite der Einladungen.", causes: ["Zeitpunkt der Einladung", "Text wenig konkret", "Zielgruppe passt nicht"], measures: [{ t: "Einladungstext in zwei Varianten testen", n: 2, d: 2, a: 1 }], metric: "invite_rate" },
  "mt-verw": { mean: "Mit zwei verschiedenen Terminen planen Erinnerungen, Beiträge und Auswertungen womöglich für das falsche Datum.", causes: ["Termin in der Verwaltung verschoben", "Datum in der App von Hand anders eingetragen"], measures: [{ t: "Richtiges Datum in der Meetup-Karte eintragen", n: 2, d: 1, a: 1 }] },
  "sys-kpi": { mean: "Ohne aktuelle Kennzahlen aus der Verwaltung beruhen Wochenbericht, Trends und Empfehlungen auf veralteten Werten.", causes: ["Zugang in der Verwaltung widerrufen", "Verwaltung oder Internet vorübergehend nicht erreichbar", "Änderung an der Gegenstelle"], measures: [{ t: "Unter „Mehr › Verwaltung“ Status prüfen und ggf. neu koppeln", n: 2, d: 1, a: 1 }] },
  "sys-auto": { mean: "Ohne regelmäßige Läufe fehlen Wochenentwürfe, Analysen oder technische Prüfungen.", causes: ["Kontingent des Claude-Pro-Abos erschöpft", "Geplante Aufgabe pausiert oder geändert", "Postfach-Schlüssel ersetzt"], measures: [{ t: "Status unter „Mehr › Autonomie“ prüfen und Claude Bescheid geben", n: 2, d: 2, a: 1 }] },
  "sys-snap": { mean: "Ohne automatische Sicherung wären Daten bei einem Fehler schwerer wiederherzustellen.", causes: ["Speicher des Geräts voll oder gesperrt"], measures: [{ t: "Diagnose öffnen und Speichertest prüfen", n: 3, d: 3, a: 1 }] },
};
function explainKey(id) {
  if (EXPLAIN[id]) return id;
  if (/^m-(tr|7)-/.test(id)) return "m-trend";
  if (/^m-go-/.test(id)) return "m-go";
  if (/^m-(st-|old|nv)/.test(id)) return "m-stale";
  if (/^ms-/.test(id)) return null;
  if (/^sys-auto-/.test(id)) return "sys-auto";
  return null;
}
function enrich(f) {
  const k = explainKey(f.id),
    e = k ? EXPLAIN[k] : null;
  const metric = (e && e.metric) || (/^m-(tr|7|go)-/.test(f.id) ? f.id.replace(/^m-(tr|7|go)-/, "") : null);
  const measures = (e ? e.measures : [{ t: f.action, n: 2, d: Math.max(1, f.sev), a: 1 }]).map((m) => ({ ...m, prio: mPrio(m), score: mScore(m) })).sort((a, b) => b.score - a.score);
  return { ...f, mean: e && e.mean, causes: (e && e.causes) || [], measures, metric };
}

/* ---------- Darstellung eines Befunds ---------- */
const fCard = (f0) => {
  const f = enrich(f0);
  return `<div class="card rec ${f.sev >= 3 ? "bad" : f.sev === 2 ? "warn" : ""}"><div class="row sp"><b>${esc(f.title)}</b><span class="chip">${f.kind === "fakt" ? "Fakt" : "Annahme"}</span></div><div>${esc(f.action)}</div>
<details><summary class="mut">Details und Maßnahmen</summary>
<div class="mut" style="margin-top:6px"><b>Fakten</b></div>${f.why.map((w) => `<div class="mut">• ${esc(w)}</div>`).join("")}
${f.mean ? `<div class="mut" style="margin-top:6px"><b>Bedeutung</b></div><div class="mut">${esc(f.mean)}</div>` : ""}
${f.causes.length ? `<div class="mut" style="margin-top:6px"><b>Mögliche Ursachen</b> <span class="chip">Annahme</span></div>${f.causes.map((c) => `<div class="mut">• ${esc(c)}</div>`).join("")}` : ""}
<div class="mut" style="margin-top:6px"><b>Empfohlene Maßnahmen</b></div>${f.measures
    .map(
      (m, i) =>
        `<div class="card" style="margin:6px 0;padding:8px 10px"><div><b>${i + 1}.</b> ${esc(m.t)}</div><div class="mut">Priorität ${m.prio} · Nutzen ${LV[m.n]} · Dringlichkeit ${LV[m.d]} · Aufwand ${LV[m.a]}${m.studio ? " · bereitet einen Instagram-Entwurf vor" : ""}</div><div class="mut">Risiko: ${esc(measureRisk(m))}</div><button class="s" data-a="msr" data-id="${esc(f.id)}" data-v="${i}" style="margin-top:4px">Maßnahme freigeben</button></div>`,
    )
    .join("")}
</details>${f.tab ? `<button class="s" data-a="tab" data-id="${esc(f.tab)}" style="margin-top:6px">${f.tab === "ai" ? "Tiefenanalyse" : "Öffnen"}</button>` : ""}<div class="row" style="margin-top:6px"><button class="s p" data-a="mk" data-id="${esc(f.id)}">Als Aufgabe anlegen</button><button class="s" data-a="later" data-id="${esc(f.id)}">Später</button><button class="s" data-a="nope" data-id="${esc(f.id)}">Nicht relevant</button></div></div>`;
};

/* ---------- Maßnahme freigeben ---------- */
function metricNow(key, T = S) {
  const m = key && T.metrics.find((x) => x.key === key);
  const c = m && cur(m);
  return c ? { value: c.value, date: c.date } : null;
}
function startMeasure(fid, idx, T = S) {
  const f0 = findings().find((x) => x.id === fid);
  if (!f0) return null;
  const f = enrich(f0),
    m = f.measures[idx];
  if (!m) return null;
  const u = T.meetup;
  const checkAt = f.metric === "signups" && u && u.date && u.date >= today() ? u.date : addDays(today(), 14);
  const x = {
    id: uid(),
    title: m.t,
    prio: m.prio,
    area: f.g === "studio" ? "Instagram" : f.g === "meetup" ? "Meetup" : f.g === "metric" ? "Marketing" : "Ziele",
    due: m.d >= 3 ? addDays(today(), 2) : m.d === 2 ? addDays(today(), 7) : addDays(today(), 14),
    done: false,
    dev: T.dev,
    fid: f.id,
    src: "massnahme",
    measure: { finding: f.title, metric: f.metric || null, baseline: metricNow(f.metric, T), start: today(), checkAt, outcome: null },
  };
  touch(x);
  T.tasks.push(x);
  // Instagram-Maßnahme: passenden Entwurf nur aus bestätigten Fakten vorbereiten (zur Freigabe im Studio)
  if (m.studio && T.studio) {
    const b = T.studio.brand,
      has = u && u.date && u.place && u.date >= today();
    const cta = b.signup || "Mehr auf " + b.website;
    const p = makePost(
      has
        ? {
            date: today(),
            pillar: "meetup",
            type: m.studio === "story" ? "story" : "einzelbild",
            title: (m.studio === "story" ? "Story-Erinnerung " : "Zusatzbeitrag ") + fmt(u.date),
            hook: "Noch Plätze frei?",
            slides: [{ template: "ankuendigung", title: "Sei dabei", text: "Neue Menschen kennenlernen – entspannt und in kleiner Runde.", details: `${fmtLong(u.date)}\n${u.place}` }],
            caption: `Lust, neue Leute kennenzulernen?\n\nUnser nächstes Meetup: ${fmtLong(u.date)} – ${u.place}.\n\n${cta}`,
            hashtags: ["#Vivalink", "#Meetup", "#NeueLeuteKennenlernen"],
            meetupDate: u.date,
          }
        : { date: addDays(today(), 2), pillar: "tipps", type: "einzelbild", title: "Zusatzbeitrag: " + f.title.slice(0, 60), slides: [{ template: "cover", title: "", text: "" }], caption: "" },
      "massnahme",
      T,
    );
    p.measureTask = x.id;
    T.studio.posts.push(p);
    x.measure.postId = p.id;
  }
  return x;
}

/* ---------- Erfolgskontrolle ---------- */
function measureState(x, T = S) {
  const m = x.measure,
    now = metricNow(m.metric, T);
  const delta = m.baseline && now && now.date !== m.baseline.date ? now.value - m.baseline.value : null;
  return { now, delta };
}
function measureLine(x, T = S) {
  const m = x.measure;
  if (!m.metric) return "Ohne Kennzahl – Ergebnis bitte selbst einschätzen.";
  const mm = T.metrics.find((y) => y.key === m.metric),
    name = mm ? mm.name : m.metric;
  const { now, delta } = measureState(x, T);
  // Vergleich mit dem gleich langen Zeitraum vor der Maßnahme: zeigt, ob sich nur ein bestehender Trend fortsetzt
  let prior = "";
  if (delta != null && m.baseline && mm) {
    const span = Math.round((new Date(now.date + "T12:00") - new Date(m.baseline.date + "T12:00")) / 864e5);
    const before = valid(mm).filter((e) => e.date <= addDays(m.baseline.date, -span)).pop();
    if (span > 0 && before) {
      const pd = m.baseline.value - before.value;
      prior = ` · im gleichen Zeitraum davor ${pd > 0 ? "+" : ""}${num(pd)}`;
    }
  }
  return `${name}: vorher ${m.baseline ? num(m.baseline.value) + " (" + fmt(m.baseline.date) + ")" : "kein Wert"} · jetzt ${now ? num(now.value) + " (" + fmt(now.date) + ")" : "kein Wert"}${delta != null ? ` · Veränderung ${delta > 0 ? "+" : ""}${num(delta)}` : ""}${prior}`;
}
function measureFindings(add, t) {
  for (const x of S.tasks.filter((y) => y.measure && !y.deleted && !y.measure.outcome && y.measure.checkAt <= t))
    add("ms-" + x.id, "task", 1, "fakt", "Maßnahme auswerten: " + x.title, "Prüfe die Entwicklung und halte fest, ob die Maßnahme aus deiner Sicht gewirkt hat.", [measureLine(x), "Ein zeitlicher Zusammenhang ist kein Beweis für die Ursache."], "tasks");
}
function finishMeasure(id, outcome, T = S) {
  const x = T.tasks.find((y) => y.id === id);
  if (!x || !x.measure) return false;
  const { now } = measureState(x, T);
  x.measure.outcome = outcome;
  x.measure.after = now;
  x.measure.evaluatedAt = today();
  x.done = true;
  x.doneAt = x.doneAt || Date.now();
  touch(x);
  const label = { wirksam: "wirksam (Einschätzung)", unklar: "unklar", "nicht-wirksam": "nicht wirksam (Einschätzung)" }[outcome] || outcome;
  const n = { id: uid(), cat: "Entscheidung", title: "Maßnahme: " + x.title, text: `Anlass: ${x.measure.finding}. ${measureLine(x, T)}`, status: "estimate", date: today(), reason: "Maßnahmenkontrolle", result: "Ergebnis: " + label + ". Zeitlicher Zusammenhang, keine bewiesene Ursache.", private: false, active: true, createdAt: Date.now(), dev: T.dev };
  touch(n);
  T.memory.push(n);
  logEvent("info", "measure.done", outcome);
  return true;
}

/* ---------- Bausteine der Management-Übersicht ---------- */
function goalsHtml() {
  const L = S.metrics.filter((m) => m.goal !== "" && m.goal != null && Number(m.goal) > 0 && cur(m));
  if (!L.length) return "";
  return `<h2>Ziele</h2>${L.map((m) => {
    const c = cur(m),
      g = Number(m.goal),
      pct = Math.max(0, Math.min(100, Math.round((c.value / g) * 100)));
    return `<div class="card" data-a="met" data-id="${esc(m.id)}"><div class="row sp"><b>${esc(m.name)}</b><span>${num(c.value)} / ${num(g)}</span></div><div class="bar"><span style="width:${pct}%"></span></div></div>`;
  }).join("")}`;
}
function statusHtml() {
  const t = today();
  const appr = S.studio ? livePosts().filter((p) => p.status === "entwurf" && p.date && p.date >= t && p.date <= addDays(t, 14)).length : 0;
  const ms = S.tasks.filter((x) => x.measure && !x.deleted && !x.measure.outcome).length;
  const tech = openConflicts().length + LOG.filter((e) => e.level === "error" && Date.now() - e.at < 7 * 864e5).length;
  const cell = (n, l, tabId, bad) => `<div class="stat" data-a="tab" data-id="${tabId}"><b ${bad ? 'style="color:var(--bad)"' : ""}>${n}</b><span>${l}</span></div>`;
  return `<div class="stats">${cell(appr, "Freigaben", "studio")}${cell(ms, "Maßnahmen", "tasks")}${cell(tech ? tech : "OK", "Technik", "more", tech > 0)}${cell(S.metrics.filter((m) => cur(m)).length, "Kennzahlen", "home")}</div>`;
}
