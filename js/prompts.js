/* Arbeitsauftrag-Generator */
let ai = { k: null, extra: "", compact: false, tasks: true, priv: false, cats: [] };
const TC = {
  ig: ["Instagram", "Marketing", "Geschäftsmodell", "Ziele", "Meetup", "Kennzahl"],
  cap: ["Instagram", "Marketing", "Geschäftsmodell"],
  strat: [
    "Ziele",
    "Geschäftsmodell",
    "Entscheidung",
    "Finanzen",
    "Meetup",
    "Marketing",
    "Kennzahl",
    "Problem",
    "App",
    "Webseite",
    "Instagram",
  ],
  week: ["Ziele", "Entscheidung", "Meetup", "Marketing", "App", "Problem", "Kennzahl"],
  dec: ["Entscheidung", "Ziele", "Finanzen", "Kennzahl", "Problem"],
  prob: ["Problem", "Meetup", "Marketing", "Kennzahl", "Entscheidung", "Instagram"],
  sum: CATS,
};
const TPL = [
  {
    k: "ig",
    name: "Instagram-Ideen entwickeln",
    ext: 1,
    cat: "Instagram",
    d: "3 neue Beitragsideen mit Caption und Designhinweis",
    task: "Entwickle 3 neue, deutlich verschiedene Instagram-Beitragsideen für Vivalink. Wiederhole keine bisherigen Beiträge. Sie sollen zu meinem Geschäftsmodell und meinen Zielen passen und mehr Anmeldungen zu Meetups bringen.",
    fmt: "Pro Idee: Thema, Format (Karussell, Reel oder Einzelbild), Hook-Satz, vollständige Caption (max. 120 Wörter) mit 5 Hashtags, Designidee (Layout, Text auf dem Bild). Danach: warum diese Ideen zu Vivalink passen.",
  },
  {
    k: "cap",
    name: "Caption schreiben",
    ext: 0,
    cat: "Instagram",
    d: "Einfache Aufgabe, geeignet für die lokale KI",
    x: "Worum soll der Beitrag gehen?",
    task: "Schreibe eine Instagram-Caption (max. 100 Wörter, freundlich, mit 5 Hashtags) für Vivalink.",
    fmt: "Nur die Caption, keine Erklärung.",
  },
  {
    k: "strat",
    name: "Unternehmensstrategie analysieren",
    ext: 1,
    cat: "Ziele",
    d: "Stärken, Schwächen, nächste Schritte",
    task: "Analysiere die aktuelle Lage von Vivalink: Was läuft gut, was bremst, und was sollte ich in den nächsten 4 Wochen ändern? Vergleiche mindestens zwei Lösungswege und empfehle einen.",
  },
  {
    k: "week",
    name: "Wochenplan: 3 Maßnahmen",
    ext: 1,
    cat: "Ziele",
    d: "Drei Prioritäten für die kommende Woche",
    task: "Empfiehl mir die 3 wichtigsten Maßnahmen für die kommende Woche. Berücksichtige offene und überfällige Aufgaben.",
  },
  {
    k: "dec",
    name: "Entscheidung bewerten",
    ext: 1,
    cat: "Entscheidung",
    d: "Frühere oder anstehende Entscheidung prüfen",
    x: "Welche Entscheidung? (Titel oder Beschreibung)",
    task: "Bewerte die genannte Entscheidung: War oder ist sie sinnvoll? Nutze Begründung, Ergebnis und Verlauf. Nenne Alternativen.",
  },
  {
    k: "prob",
    name: "Problem lösen",
    ext: 1,
    cat: "Problem",
    d: "z. B. Anmeldungen schlechter als erwartet",
    x: "Beschreibe das Problem",
    task: "Analysiere das genannte Problem: wahrscheinlichste Ursachen, wie ich jede prüfe, und konkrete Lösungen mit Aufwand und Wirkung.",
  },
  {
    k: "sum",
    name: "Wissen zusammenfassen, Lücken finden",
    ext: 0,
    cat: "Ziele",
    d: "Was weiß die KI, was fehlt noch?",
    task: "Fasse zusammen, was du über Vivalink weißt, und nenne die 5 wichtigsten fehlenden Informationen, die ich nachtragen sollte.",
  },
];
function buildPrompt() {
  const T = TPL.find((t) => t.k === ai.k),
    c = ai.compact,
    cut = (s, n) => (!s ? "" : s.length > n ? s.slice(0, n) + "…" : s),
    mx = c ? 6 : 12;
  const ws = ai.extra
      .toLowerCase()
      .split(/[^a-zA-ZäöüÄÖÜß0-9]+/)
      .filter((w) => w.length > 3),
    kw = (m) => ws.some((w) => (m.title + " " + m.text).toLowerCase().includes(w));
  const act = S.memory
    .filter((m) => m.active && (ai.priv || !m.private) && (ai.cats.includes(m.cat) || kw(m)))
    .sort((a, b) => b.createdAt - a.createdAt);
  const ln = (m) => {
    let s = `- [${stl(m.status).slice(2)}, ${fmt(m.date)}] ${m.title}: ${cut(m.text, c ? 150 : 500)}`;
    if (!c) {
      if (m.reason) s += ` | Begründung: ${cut(m.reason, 300)}`;
      if (m.result) s += ` | Ergebnis: ${cut(m.result, 300)}`;
      const p = m.supersedes && S.memory.find((x) => x.id === m.supersedes);
      if (p) s += ` | Früher: „${p.title}“, geändert weil: ${cut(m.changeReason, 300)}`;
    }
    return s;
  };
  const grp = (h, f) => {
    const l = act.filter(f).slice(0, mx);
    return l.length ? `\n${h}\n` + l.map(ln).join("\n") + "\n" : "";
  };
  const open = S.tasks
    .filter((x) => !x.done)
    .sort((a, b) => PR[a.prio] - PR[b.prio])
    .slice(0, c ? 5 : 15);
  let k =
    grp("ZAHLEN UND KENNZAHLEN", (m) => m.cat === "Kennzahl") +
    grp("ENTSCHEIDUNGEN (aktueller Stand, mit Verlauf)", (m) => m.cat === "Entscheidung") +
    grp("BISHERIGE INSTAGRAM-BEITRÄGE UND -IDEEN (nicht wiederholen)", (m) => m.cat === "Instagram") +
    grp("WEITERES WISSEN ÜBER VIVALINK", (m) => !["Kennzahl", "Entscheidung", "Instagram"].includes(m.cat));
  if (ai.tasks && open.length)
    k +=
      "\nOFFENE AUFGABEN\n" +
      open
        .map(
          (x) =>
            `- [${x.prio}] ${x.title} (${x.area}${x.due ? ", Frist " + fmt(x.due) : ""}${x.due && x.due < today() ? ", ÜBERFÄLLIG" : ""})`,
        )
        .join("\n") +
      "\n";
  if (T.k !== "cap") {
    const ml = S.metrics
      .map((m) => {
        const cv = cur(m),
          o = oldE(m);
        if (!cv)
          return o
            ? `- ${m.name}: nur früherer Stand (ca. ${num(o.value)}), NICHT aktuell, nicht als aktuellen Wert verwenden`
            : null;
        const c7 = cmp(m, 7),
          c30 = cmp(m, 30);
        return `- ${m.name}: ${num(cv.value)}${m.unit ? " " + m.unit : ""} (${VS[cv.status].slice(2)}, ${fmt(cv.date)})${m.goal !== "" && m.goal != null ? ", Ziel " + num(m.goal) : ""}${c7 ? ", 7 Tage: " + cs(c7) : ""}${c30 ? ", 30 Tage: " + cs(c30) : ""}${cv.src && cv.src !== "manual" ? ", Quelle: " + cv.src : ""}`;
      })
      .filter(Boolean);
    if (ml.length)
      k += "\nKENNZAHLEN (nur Summen, keine Personendaten)\n" + ml.slice(0, c ? 6 : 15).join("\n") + "\n";
    const mu = S.meetup;
    if (mu && (mu.date || mu.place)) {
      const dy = mu.date
        ? Math.round((new Date(mu.date + "T12:00") - new Date(today() + "T12:00")) / 864e5)
        : null;
      k += `\nNÄCHSTES MEETUP\n- ${mu.place || "Ort unbekannt"}, ${mu.date ? fmt(mu.date) + (dy >= 0 ? " (in " + dy + " Tagen)" : " (vorbei)") : "Datum unbekannt"}${mu.goal !== "" ? ", Ziel Anmeldungen: " + num(mu.goal) : ""}\n`;
    }
    if (["strat", "week", "prob", "sum"].includes(T.k)) {
      const fl = findings().slice(0, c ? 3 : 6);
      if (fl.length)
        k +=
          "\nVOM REGELMOTOR ERKANNTE BEFUNDE (Fakt = aus Daten belegt, Annahme = Richtwert)\n" +
          fl
            .map((f) => `- [${f.kind === "fakt" ? "Fakt" : "Annahme"}] ${f.title}. ${f.why.join(" ")}`)
            .join("\n") +
          "\n";
    }
  }
  if (!k.trim())
    k =
      "\n(Im Unternehmensgedächtnis sind noch keine Einträge vorhanden. Frage mich zuerst nach den wichtigsten Grundlagen.)\n";
  const rules = c
    ? "Antworte auf Deutsch, kurz und konkret. Erfinde nichts. Wenn Infos fehlen, schreibe „Das weiß ich nicht“."
    : "REGELN\n- Stütze dich auf das Unternehmenswissen unten. Unterscheide „Bestätigt“ (Fakten), „Einschätzung“ (Annahmen) und „Unbekannt“.\n- Erfinde keine Zahlen oder Fakten. Nenne fehlende Informationen ausdrücklich.\n- Berücksichtige frühere Entscheidungen und die Gründe für Änderungen.\n- Bevorzuge kostenlose oder sehr günstige Maßnahmen.\n- Vergleiche bei Strategiefragen mindestens zwei Lösungswege.";
  const ex = ai.extra.trim();
  return `Du bist mein ${c ? "Assistent" : "strategischer Berater"} für mein Unternehmen „Vivalink“. Ich bin Gründer, arbeite allein, habe keine Programmierkenntnisse und ein kleines Budget.\n\nAUFGABE\n${T.task}${ex ? "\nZusatzinfo von mir: " + ex : ""}\n\n${rules}\n\nAUSGABEFORMAT\n${T.fmt || "1. Kurzfazit (max. 3 Sätze)\n2. Empfehlungen (nummeriert, jeweils mit Begründung und nächstem Schritt)\n3. Annahmen und Unsicherheiten\n4. Fehlende Informationen und Rückfragen an mich"}\n\nUNTERNEHMENSWISSEN (Stand ${fmt(today())})${k}`;
}
const pw = (t) =>
  /[\w.+-]+@[\w-]+\.[\w.]+|(\+|00)\d[\d ()\/-]{7,}\d|\b0\d{2,4}[ \/-]?\d{5,}\b/.test(t)
    ? '<div class="card rec bad">Achtung: Der Text enthält vermutlich eine E-Mail-Adresse oder Telefonnummer. Entferne personenbezogene Daten, bevor du ihn kopierst.</div>'
    : "";
function chk() {
  $("#warn").innerHTML = pw($("#pv").value);
}
function gen() {
  $("#pv").value = buildPrompt();
  chk();
}
function vAi() {
  if (!ai.k)
    return (
      `<h1>Arbeitsaufträge</h1><p class="mut">Tippe auf eine Aufgabe. Die App stellt Wissen, Entscheidungen, Zahlen und Aufgaben zu einem fertigen Auftrag zusammen.</p>` +
      TPL.map(
        (t) =>
          `<div class="card" data-a="tpl" data-id="${esc(t.k)}"><div class="row sp"><b>${t.name}</b><span class="chip">${t.ext ? "Claude / ChatGPT" : "lokal möglich"}</span></div><div class="mut">${t.d}</div></div>`,
      ).join("") +
      `<p class="mut">Tipp: Zahlen (z. B. Anmeldungen) trägst du auf der Startseite unter „Kennzahlen“ ein. Trage keine Namen oder Kontaktdaten von Teilnehmern ein.</p>`
    );
  const T = TPL.find((t) => t.k === ai.k),
    p = buildPrompt();
  return `<div class="row sp"><h1>${T.name}</h1><button class="s" data-a="aiBack">Zurück</button></div><label>${T.x || "Zusatzinfo (optional)"}</label><input id="a-x" value="${esc(ai.extra)}"><label>Für welche KI?</label><select id="a-m"><option value="v" ${ai.compact ? "" : "selected"}>Claude oder ChatGPT (ausführlich)</option><option value="k" ${ai.compact ? "selected" : ""}>Lokale KI (kompakt)</option></select><label><input type="checkbox" id="a-t" ${ai.tasks ? "checked" : ""} style="width:auto;margin-right:6px">Offene Aufgaben mitsenden</label><label><input type="checkbox" id="a-p" ${ai.priv ? "checked" : ""} style="width:auto;margin-right:6px">Auch vertrauliche Einträge einbeziehen (${S.memory.filter((m) => m.active && m.private).length} vorhanden, standardmäßig ausgeschlossen)</label><label>Berücksichtigte Kategorien (antippen zum Ändern)</label><div class="chips" style="flex-wrap:wrap">${CATS.map((c) => `<button class="${ai.cats.includes(c) ? "on" : ""}" data-a="acat" data-id="${esc(c)}">${c}</button>`).join("")}</div>
<h2>Fertiger Arbeitsauftrag</h2><div id="warn">${pw(p)}</div><textarea id="pv" style="min-height:260px">${esc(p)}</textarea>
<div class="row"><button class="p" data-a="cpPv">Kopieren</button><a class="lnk" href="https://claude.ai/new" target="_blank" rel="noopener">Claude</a><a class="lnk" href="https://chatgpt.com/" target="_blank" rel="noopener">ChatGPT</a></div>
<h2>Antwort speichern</h2><label>Quelle</label><select id="s-src"><option>Claude</option><option>ChatGPT</option><option>Lokale KI</option></select><label>Kategorie</label><select id="s-cat">${opts(CATS, T.cat)}</select><label>Antwort der KI hier einfügen</label><textarea id="ans" style="min-height:140px"></textarea><label><input type="checkbox" id="ok" style="width:auto;margin-right:6px">Ich habe den Inhalt geprüft (nötig für „bestätigt“)</label><div class="row"><button data-a="saveAns" data-id="estimate">Als Einschätzung speichern</button><button class="p" data-a="saveAns" data-id="confirmed">Als bestätigt übernehmen</button><button data-a="discard">Verwerfen</button></div><p class="mut">Nichts wird automatisch als Fakt gespeichert. Einschätzungen (💭) kennzeichnet die App in späteren Aufträgen als Annahme.</p>`;
}
