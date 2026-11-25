/* Nur in der Testversion sichtbar: künstliche Demodaten zum gefahrlosen Ausprobieren.
   Alle Namen, Orte und Zahlen sind frei erfunden. */
const dDay = (d) => new Date(Date.now() + d * 864e5).toLocaleDateString("sv-SE");
function demoState() {
  const old = Date.now() - 20 * 864e5;
  const mem = (id, cat, title, text, status, d, extra = {}) => ({ id, cat, title, text, status, date: dDay(d), reason: "", result: "", private: false, active: true, createdAt: old, updatedAt: old, ...extra });
  return {
    v: 1,
    dev: "demo-" + uid(),
    accent: "",
    lastBackup: "",
    memory: [
      mem("d-m1", "Ziele", "Demo: Ziel für das Quartal", "Mehr wiederkehrende Teilnehmer (Demotext)", "confirmed", -40, { active: false, supersededBy: "d-m2" }),
      mem("d-m2", "Ziele", "Demo: Ziel für das Quartal (präzisiert)", "Wiederkehrquote steigern (Demotext)", "estimate", -20, { supersedes: "d-m1", changeReason: "Demo-Änderung" }),
      mem("d-m3", "Entscheidung", "Demo: Testentscheidung ohne Ergebnis", "Neues Format ausprobieren (Demotext)", "confirmed", -30, { reason: "Demo-Begründung" }),
      mem("d-m4", "Instagram", "Demo: Bisherige Beitragsidee", "Karussell mit Tipps (Demotext)", "confirmed", -10),
      mem("d-m5", "Marketing", "Demo: Vertrauliche Notiz", "demo@example.invalid", "unknown", -5, { private: true }),
    ],
    tasks: [
      { id: "d-t1", title: "Demo: Überfällige Aufgabe", prio: "hoch", area: "App", due: dDay(-3), done: false, updatedAt: old },
      { id: "d-t2", title: "Demo: Wichtige Aufgabe ohne Frist", prio: "hoch", area: "Marketing", due: "", done: false, updatedAt: old },
      { id: "d-t3", title: "Demo: Erledigte Aufgabe", prio: "niedrig", area: "Meetup", due: "", done: true, doneAt: old, updatedAt: old },
    ],
  };
}
function demoMetrics(T) {
  const old = Date.now() - 20 * 864e5;
  const e = (id, d, v) => ({ id, date: dDay(d), value: v, status: "confirmed", src: "demo", note: "", updatedAt: old });
  const set = (key, goal, entries) => {
    const m = T.metrics.find((x) => x.key === key);
    if (m) (m.goal = goal), (m.goalAt = old), (m.entries = entries);
  };
  set("reg_week", "20", [e("d-w1", -21, 12), e("d-w2", -14, 10), e("d-w3", -7, 8), e("d-w4", 0, 6)]);
  set("signups", "", [e("d-s1", 0, 5)]);
  set("ig_fol", "", [e("d-f1", -8, 100), e("d-f2", -1, 104)]);
  T.meetup = { date: dDay(5), place: "Demo-Ort", goal: "20", note: "Demo", updatedAt: old };
}
/* Ein künstliches Backup im alten Format (Version 1) zum Testen der Übernahme. */
function demoV1Backup() {
  const t = Date.now() - 864e5;
  return JSON.stringify({
    v: 1,
    dev: "demo-altgeraet",
    accent: "",
    lastBackup: "",
    memory: [{ id: "d-alt-m1", cat: "Meetup", title: "Demo aus altem Gerät", text: "Eintrag aus einem Version-1-Backup (Demotext)", status: "confirmed", date: dDay(-2), reason: "", result: "", private: false, active: true, createdAt: t, updatedAt: t }],
    tasks: [{ id: "d-alt-t1", title: "Demo-Aufgabe aus altem Gerät", prio: "mittel", area: "Meetup", due: dDay(7), done: false, updatedAt: t }],
  });
}
/* Ein künstliches Backup, das mit den Demodaten in Konflikt steht (gleiche Aufgabe, anders geändert). */
function demoConflictBackup() {
  const t = S.tasks.find((x) => x.id === "d-t2");
  if (!t) return null;
  const b = clone(S);
  b.dev = "demo-anderes-geraet";
  const x = b.tasks.find((y) => y.id === "d-t2");
  x.title = "Demo: Wichtige Aufgabe (auf dem anderen Gerät geändert)";
  x.revs = [];
  x.updatedAt = Date.now() + 60000;
  return JSON.stringify(b);
}
/* Studio-Demo: Demo-Markenprofil und ein künstlicher Monatsplan (wie eine KI-Antwort), damit das Studio ohne KI testbar ist. */
const DEMO_TEXT = {
  tipps: ["Der erste Schritt ist der schwerste", "Kleine Fragen, große Gespräche", "Komm ein paar Minuten früher", "Zuhören verbindet"],
  orte: ["Ideen für ein entspanntes Treffen", "Gemeinsam draußen aktiv", "Ein gemütlicher Abend in kleiner Runde"],
  community: ["Was ist dein liebster Ort für ein erstes Treffen?", "Wie lernst du am liebsten neue Leute kennen?", "Welches Hobby würdest du gern mit anderen teilen?"],
  meetup: ["Bald ist es so weit", "Sei beim nächsten Treffen dabei"],
  sofunktionierts: ["So funktioniert es"],
  rueckblick: ["Danke fürs Dabeisein"],
};
function demoStudio() {
  const b = S.studio.brand;
  b.region = b.region || "Demo-Region";
  b.signup = b.signup || "Registrierung über vivalink.me (Demo)";
  b.handle = b.handle || "@demo";
  touch(b);
  const n = {};
  const slots = planSlots(today().slice(0, 7)).concat(planSlots(nextMonth(today().slice(0, 7)))).slice(0, 12);
  const posts = slots.map((s) => {
    const L = DEMO_TEXT[s.pillar] || DEMO_TEXT.tipps,
      t = L[(n[s.pillar] = (n[s.pillar] || 0) + 1) % L.length];
    const slides =
      s.type === "karussell"
        ? [
            { template: "cover", title: t, text: "Demo-Beitrag – künstlicher Text" },
            { template: "tipp", title: "Sei neugierig", text: "Stell offene Fragen und hör aufmerksam zu. (Demo)" },
            { template: "info", title: "Kurz gesagt", text: "Offene Fragen stellen\nZuhören\nGemeinsamkeiten suchen" },
            { template: "abschluss", title: "Lust auf neue Kontakte?", text: "Alle Infos auf der Website." },
          ]
        : s.pillar === "meetup"
          ? [{ template: s.kind === "erinnerung" ? "erinnerung" : "ankuendigung", title: t, text: "Demo-Ankündigung", details: S.meetup && S.meetup.date ? fmtLong(S.meetup.date) + "\n" + S.meetup.place : "" }]
          : [{ template: s.pillar === "community" ? "frage" : "cover", title: t, text: "Schreib es in die Kommentare (Demo)" }];
    return { ...s, meetupDate: s.pillar === "meetup" && S.meetup ? S.meetup.date : "", title: t + " (Demo " + s.date + ")", hook: t, slides, caption: `${t}\n\nDas ist ein künstlicher Demo-Text für die Testversion.\n\nMehr auf ${b.website}`, hashtags: ["#Vivalink", "#Demo", "#NeueLeuteKennenlernen"] };
  });
  return importPlan(JSON.stringify({ format: PLAN_FORMAT, version: 1, posts }));
}
function demoCard() {
  return `<h2>Testdaten (nur Testversion)</h2><div class="card"><p>Hier kannst du alles gefahrlos ausprobieren. Bitte <b>keine echten Unternehmensdaten</b> eingeben. Die Testversion hat einen eigenen Speicher und berührt deine Vivalink AI nicht.</p>
<div class="row"><button class="p" data-a="demoLoad">Demodaten laden</button><button data-a="demoStudio">Studio-Demo laden</button><button data-a="demoV1">Altes Backup (V1) erzeugen</button><button data-a="demoConflict">Konflikt-Backup erzeugen</button><button data-a="demoReset">Alle Testdaten löschen</button></div>
<p class="mut">„Altes Backup“ und „Konflikt-Backup“ füllen das Backup-Feld oben. Danach „Backup prüfen“ und „Zusammenführen“ tippen.</p></div>`;
}
async function demoAction(a) {
  if (!IS_TEST) return;
  if (a === "demoStudio") {
    const r = demoStudio();
    await save();
    tab = "studio";
    render();
    return toast(r.added.length + " Demo-Beiträge mit Grafiken im Studio");
  }
  if (a === "demoLoad" || a === "demoReset") {
    if (window._dm !== a) {
      window._dm = a;
      return toast("Nochmal tippen: ersetzt alle Testdaten auf diesem Gerät");
    }
    window._dm = null;
    S = a === "demoLoad" ? demoState() : { v: 1, dev: uid(), memory: [], tasks: [], accent: "", lastBackup: "" };
    migrate();
    if (a === "demoLoad") demoMetrics(S), runAutomations();
    await aiSave([]);
    await save();
    PREIMP = null;
    await kvPut("pre-import", null);
    logEvent("info", "demo." + (a === "demoLoad" ? "load" : "reset"), "Testdaten " + (a === "demoLoad" ? "geladen" : "gelöscht"));
    tab = a === "demoLoad" ? "home" : "more";
    render();
    toast(a === "demoLoad" ? "Demodaten geladen" : "Alle Testdaten gelöscht");
  } else {
    const t = a === "demoV1" ? demoV1Backup() : demoConflictBackup();
    if (!t) return toast("Bitte zuerst „Demodaten laden“ tippen");
    $("#imp").value = t;
    $("#imp").scrollIntoView({ block: "center" });
    toast("Backup-Feld gefüllt. Jetzt „Backup prüfen“ oder „Zusammenführen“ tippen.");
  }
}
