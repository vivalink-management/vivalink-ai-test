/* Instagram-Studio – reine Logik (ohne Oberfläche).
   Bewusst ohne DOM-Zugriff, damit dieselben Funktionen später auch von der Synchronisierung,
   einem Server oder geplanten Claude-Aufgaben genutzt werden können.
   Austauschformat für KI-Antworten: docs/STUDIO-FORMAT.md */

const PILLARS = [
  { id: "meetup", name: "Meetups: Ankündigungen und Erinnerungen", type: "einzelbild", needs: "meetup" },
  { id: "tipps", name: "Tipps zum Kontakteknüpfen", type: "karussell" },
  { id: "orte", name: "Orte und Aktivitäten vor Ort", type: "karussell" },
  { id: "sofunktionierts", name: "So funktioniert Vivalink", type: "karussell", needs: "appfacts" },
  { id: "rueckblick", name: "Rückblicke", type: "einzelbild", needs: "pastfacts" },
  { id: "community", name: "Fragen und Umfragen an die Community", type: "einzelbild" },
];
const PTYPES = { einzelbild: "Einzelbild", karussell: "Karussell", story: "Story", reel: "Reel" };
const PSTATUS = { entwurf: "Entwurf", freigegeben: "Freigegeben", veroeffentlicht: "Veröffentlicht", abgelehnt: "Abgelehnt" };
const TEMPLATES = ["cover", "tipp", "info", "frage", "ankuendigung", "erinnerung", "rueckblick", "abschluss", "foto"];
const TEMPLATE_NAMES = { cover: "Titel", tipp: "Tipp (nummeriert)", info: "Info (Liste)", frage: "Frage", ankuendigung: "Meetup-Ankündigung", erinnerung: "Meetup-Erinnerung", rueckblick: "Rückblick", abschluss: "Abschluss mit Anmeldung", foto: "Eigenes Foto" };
/* Beitragsarten: bestimmen Aufbau, Ton und Handlungsaufforderung */
const KINDS = { ankuendigung: "Ankündigung", erinnerung: "Erinnerung", info: "Info", tipps: "Tipps", ideen: "Ideen", frage: "Frage", rueckblick: "Rückblick" };
const PILLAR_KIND = { meetup: "ankuendigung", tipps: "tipps", orte: "ideen", sofunktionierts: "info", rueckblick: "rueckblick", community: "frage" };
/* Blickwinkel je Bereich: sorgt für Abwechslung, ohne Fakten zu erfinden */
const ANGLES = {
  tipps: ["ein Gespräch mit Unbekannten beginnen", "Nervosität vor dem ersten Treffen", "Gemeinsamkeiten entdecken", "zuhören statt Smalltalk", "nach einem Treffen in Kontakt bleiben", "neu in der Stadt und Anschluss finden", "allein zu einem Treffen gehen"],
  orte: ["entspannte Café-Runde", "gemeinsam draußen unterwegs", "Spieleabend in kleiner Runde", "Kultur gemeinsam erleben", "zusammen kochen oder essen gehen", "Sport und Bewegung in lockerer Runde"],
  sofunktionierts: ["Was Vivalink anders macht", "Für wen Vivalink gedacht ist", "Vom Interesse zum persönlichen Treffen"],
  community: ["Lieblingsort für gute Gespräche", "Was dir bei neuen Kontakten wichtig ist", "Aktivität, die du gern mit anderen machen würdest", "Entweder-oder-Frage", "Was ein Treffen angenehm macht"],
  rueckblick: ["Eindrücke vom letzten Meetup (nur echte Angaben)"],
  meetup: ["Ankündigung", "Erinnerung"],
};
/* Abgedroschene Werbefloskeln: Stilhinweis und Verbot im KI-Auftrag */
const STOCK = ["in der heutigen zeit", "heutzutage", "worauf wartest du noch", "nicht verpassen", "verpasse nicht", "sei dabei!", "unvergesslich", "freundschaften fürs leben", "wir freuen uns riesig", "taucht ein", "tauche ein", "next level", "gönn dir", "das perfekte", "ganz einfach", "jetzt durchstarten", "abenteuer wartet", "mega", "tolle leute", "spannende menschen", "magische momente", "lass dich überraschen", "garantiert"];
const LOUD_EMOJI = /[\u{1F525}\u{1F4AF}\u{1F680}\u{1F4A5}\u{1F631}\u{1F911}\u{1F4B0}\u{1F37E}\u{1F37B}\u{1F48B}\u{2764}\u{1F60D}\u{1F618}]/u;
const WD = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const PLAN_FORMAT = "vivalink-studio-plan";
const DESIGNS = ["Logo-Verlauf", "Violett", "Hell", "Dunkel"];

/* Markenfarben aus dem offiziellen Logo (vom Gründer bestätigt). Anmeldung über die Website (vom Gründer angegeben). */
const BRAND_DEFAULT = {
  name: "Vivalink",
  website: "vivalink.me",
  region: "",
  handle: "",
  signup: "Registrierung über vivalink.me",
  // Hauptfarben aus dem Logo (bestätigt); magenta und rose sind die Zwischentöne des Logo-Verlaufs
  colors: { pink: "#FA0372", violet: "#6203DD", orange: "#FE6603", magenta: "#AC01B7", rose: "#EE2278", text: "#000000" },
  colorsConfirmed: true,
  font: "Nunito",
  // Vom Gründer beschriebene Besonderheiten (Grundlage aller Texte)
  concept: "Persönliche Begegnungen statt nur online schreiben; kleine Gruppen; gemeinsame Interessen; echte Gespräche",
  audience: "Erwachsene, die neue Menschen kennenlernen möchten",
  tone: "freundlich, natürlich, modern und professionell; Du-Ansprache; deutsche Texte; Emojis nur sparsam (höchstens 1–2 pro Beitrag)",
  goals: ["Neue Registrierungen für die Vivalink-App", "Mehr Anmeldungen zu Meetups", "Höhere Bekanntheit von Vivalink", "Aufbau von Vertrauen"],
  hashtags: "",
  avoid: "",
};
const SETTINGS_DEFAULT = { perWeek: 3, days: [1, 3, 5], time: "18:00", reelsPerMonth: 0 };

function studioDefaults() {
  return { posts: [], brand: { ...clone(BRAND_DEFAULT), updatedAt: 0 }, settings: { ...clone(SETTINGS_DEFAULT), updatedAt: 0 }, learned: {} };
}

/* ---------- Datumshilfen ---------- */
const isoDay = (d) => new Date(d).toLocaleDateString("sv-SE");
const addDays = (s, n) => isoDay(new Date(s + "T12:00").getTime() + n * 864e5);
function weekKey(s) {
  const d = new Date(s + "T12:00");
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = t.getUTCFullYear();
  const w = Math.ceil(((t - Date.UTC(y, 0, 1)) / 864e5 + 1) / 7);
  return y + "-W" + String(w).padStart(2, "0");
}
const weekMonday = (s) => {
  const d = new Date(s + "T12:00");
  return addDays(s, -((d.getDay() + 6) % 7));
};
const monthDays = (ym) => {
  const [y, m] = ym.split("-").map(Number);
  const n = new Date(y, m, 0).getDate();
  return Array.from({ length: n }, (_, i) => `${ym}-${String(i + 1).padStart(2, "0")}`);
};
const nextMonth = (ym) => {
  const [y, m] = ym.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
};
const fmtLong = (s) => new Date(s + "T12:00").toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" });

/* ---------- Fakten: nur bestätigte, nicht vertrauliche Angaben ---------- */
const PUBLIC_CATS = ["App", "Webseite", "Meetup", "Geschäftsmodell"];
function studioFacts(T = S) {
  const st = T.studio,
    b = st.brand,
    F = [];
  const add = (kind, text, ref) => F.push({ id: "F" + (F.length + 1), kind, text, ref });
  add("marke", `Name: ${b.name}. Website: ${b.website}.`, "brand");
  if (b.region) add("marke", `Regionaler Schwerpunkt: ${b.region}.`, "brand");
  add("marke", `Besonderheiten: ${b.concept || BRAND_DEFAULT.concept}.`, "brand");
  if (b.signup) add("marke", `So meldet man sich an: ${b.signup}`, "brand");
  if (b.handle) add("marke", `Instagram-Konto: ${b.handle}`, "brand");
  const u = T.meetup;
  if (u && u.date && u.place && u.date >= today()) add("meetup", `Nächstes Meetup: ${fmtLong(u.date)} (${u.date}), Ort: ${u.place}.`, "meetup");
  else if (u && u.date && u.place && u.date >= addDays(today(), -14)) add("meetup-vergangen", `Letztes Meetup: ${fmtLong(u.date)} (${u.date}), Ort: ${u.place}. Über den Verlauf liegen keine Angaben vor.`, "meetup");
  for (const m of T.memory.filter((m) => m.active && !m.private && m.status === "confirmed" && PUBLIC_CATS.includes(m.cat)))
    add(m.cat === "Meetup" ? "meetup-wissen" : m.cat === "Geschäftsmodell" ? "intern" : "app", `${m.title}${m.text ? ": " + m.text.slice(0, 400) : ""}${m.result ? " Ergebnis: " + m.result.slice(0, 200) : ""}`, m.id);
  return F;
}
const hasFacts = (F, kinds) => F.some((f) => kinds.includes(f.kind));

/* ---------- Meetup-Beiträge: welche gibt es schon? (verhindert doppelte Ankündigungen) ---------- */
function meetupCoverage(T = S) {
  const u = T.meetup;
  if (!u || !u.date) return { announce: false, remind: false };
  const L = T.studio.posts.filter((p) => !p.deleted && p.status !== "abgelehnt" && p.pillar === "meetup" && (p.meetupDate === u.date || (p.date && p.date <= u.date && p.date >= addDays(u.date, -21))));
  const diff = (p) => (p.date ? Math.round((new Date(u.date + "T12:00") - new Date(p.date + "T12:00")) / 864e5) : 99);
  const recap = T.studio.posts.some((p) => !p.deleted && p.status !== "abgelehnt" && (p.auto === "rueckblick" || p.pillar === "rueckblick") && (p.meetupDate === u.date || (p.date && p.date > u.date && p.date <= addDays(u.date, 14))));
  return { announce: L.some((p) => p.auto === "ankuendigung" || diff(p) >= 4), remind: L.some((p) => p.auto === "erinnerung" || (diff(p) >= 0 && diff(p) <= 3)), recap };
}

/* ---------- Inhaltlicher Schwerpunkt aus den aktuellen Kennzahlen (ohne Zahlen zu veröffentlichen) ----------
   Verbindet Analyse und Marketing: die wöchentlichen Entwürfe richten sich nach dem, was gerade am meisten hilft. */
function contentFocus(T = S) {
  const out = [];
  const val = (k) => {
    const m = T.metrics.find((x) => x.key === k),
      c = m && cur(m);
    return c && ago(c.date) <= 10 ? c.value : null;
  };
  const u = T.meetup,
    days = u && u.date ? Math.round((new Date(u.date + "T12:00") - new Date(today() + "T12:00")) / 864e5) : null,
    goal = u && Number(u.goal) > 0 ? Number(u.goal) : null,
    su = val("signups");
  if (days != null && days >= 0 && days <= 14 && goal && su != null && su < goal * (days <= 7 ? 0.75 : 0.5))
    out.push("Das nächste Meetup braucht noch Anmeldungen: Ankündigung und Erinnerung in den Vordergrund, Vorfreude und niedrige Hürde betonen (keine Teilnehmerzahlen nennen).");
  else if (days != null && days >= 0 && days <= 14 && goal && su != null && su >= goal)
    out.push("Das nächste Meetup ist gut gefüllt: nicht weiter dafür werben; stattdessen auf künftige Termine und die Anmeldung allgemein hinweisen.");
  const reg = val("reg_total"),
    act = val("active_users");
  if (reg && act != null && reg >= 30 && act / reg < 0.3) out.push("Viele Registrierte sind länger nicht aktiv: Beiträge, die den Einstieg ins erste Meetup leicht machen (Ablauf, was einen erwartet).");
  const m7 = T.metrics.find((x) => x.key === "reg_week"),
    tr = m7 && typeof metricTrend === "function" ? metricTrend(m7, today()) : null;
  if (tr && tr.dir === "fallend") out.push("Neue Registrierungen gehen zurück: Vivalink und das Konzept für Neue verständlich vorstellen, mit klarer Anmeldung.");
  const ns = val("noshow");
  if (ns != null && su && ns / su >= 0.25) out.push("Viele Absagen: Verbindlichkeit fördern – Erinnerung und „Darauf kannst du dich freuen“ kurz vor dem Termin.");
  return out.slice(0, 3);
}

/* ---------- Planung: Termine und Themenverteilung ---------- */
function planSlots(ym, T = S, angleUse = {}) {
  const st = T.studio,
    set = st.settings,
    F = studioFacts(T);
  // Nur freie Termine: Tage mit vorhandenem Beitrag (außer gelöscht/abgelehnt) werden nicht erneut geplant
  const taken = new Set(st.posts.filter((p) => !p.deleted && p.status !== "abgelehnt" && p.date).map((p) => p.date));
  const days = monthDays(ym).filter((d) => set.days.includes(new Date(d + "T12:00").getDay()) && d >= today() && !taken.has(d));
  const avail = PILLARS.filter((p) => !p.needs || (p.needs === "meetup" ? false : p.needs === "appfacts" ? hasFacts(F, ["app"]) : hasFacts(F, ["meetup-wissen", "meetup-vergangen"]) && !meetupCoverage(T).recap));
  const learned = st.learned && st.learned.order ? st.learned.order : [];
  const order = [...avail].sort((a, b) => (learned.indexOf(a.id) + 1 || 99) - (learned.indexOf(b.id) + 1 || 99));
  // Bestätigtes Meetup: Ankündigung am ersten Termin 7–13 Tage vorher, Erinnerung am letzten Termin 1–3 Tage vorher
  const u = T.meetup,
    meet = new Set();
  if (u && u.date && u.place && u.date >= today()) {
    const diff = (d) => Math.round((new Date(u.date + "T12:00") - new Date(d + "T12:00")) / 864e5);
    const a = days.find((d) => diff(d) >= 7 && diff(d) <= 13);
    const r = [...days].reverse().find((d) => diff(d) >= 1 && diff(d) <= 3);
    const cov = meetupCoverage(T);
    if (a && !cov.announce) meet.add(a);
    if (r && !cov.remind) meet.add(r);
  }
  const slots = [];
  let i = 0,
    reels = set.reelsPerMonth || 0;
  // Abstand: gleicher Bereich nie direkt hintereinander (auch nicht neben bestehenden Beiträgen), seltene Bereiche zuerst
  const live = st.posts.filter((p) => !p.deleted && p.status !== "abgelehnt" && p.date);
  const neighbor = (d) => {
    const before = live.filter((p) => p.date < d).sort((a, b) => b.date.localeCompare(a.date))[0];
    const after = live.filter((p) => p.date > d).sort((a, b) => a.date.localeCompare(b.date))[0];
    return [before && before.pillar, after && after.pillar];
  };
  const used = {};
  for (const p of live) if (p.date.startsWith(ym)) used[p.pillar] = (used[p.pillar] || 0) + 1;
  let prev = null;
  for (const d of days) {
    if (meet.has(d)) {
      const remind = u && Math.round((new Date(u.date + "T12:00") - new Date(d + "T12:00")) / 864e5) <= 3;
      slots.push({ date: d, time: set.time, pillar: "meetup", type: "einzelbild", kind: remind ? "erinnerung" : "ankuendigung", angle: remind ? "Erinnerung" : "Ankündigung" });
      prev = "meetup";
      continue;
    }
    const [nb, na] = neighbor(d);
    const cand = order.length ? [...order].sort((a, b) => (used[a.id] || 0) - (used[b.id] || 0) || order.indexOf(a) - order.indexOf(b)) : [];
    const p = cand.find((q) => q.id !== prev && q.id !== nb && q.id !== na) || cand.find((q) => q.id !== prev) || cand[0];
    if (!p) continue;
    used[p.id] = (used[p.id] || 0) + 1;
    prev = p.id;
    i++;
    let type = p.type;
    if (reels > 0 && i % 4 === 0) (type = "reel"), reels--;
    slots.push({ date: d, time: set.time, pillar: p.id, type, kind: PILLAR_KIND[p.id], angle: pickAngle(p.id, T, angleUse) });
  }
  return slots;
}
/* Wenig genutzter Blickwinkel zuerst (berücksichtigt bisherige Beiträge der letzten 120 Tage) */
function pickAngle(pillar, T = S, extra = {}) {
  const L = ANGLES[pillar] || [];
  if (!L.length) return "";
  const n = (a) => T.studio.posts.filter((p) => !p.deleted && p.angle === a && (p.date || "") >= addDays(today(), -120)).length + (extra[a] || 0);
  const a = [...L].sort((x, y) => n(x) - n(y) || L.indexOf(x) - L.indexOf(y))[0];
  extra[a] = (extra[a] || 0) + 1;
  return a;
}
/* Gestaltung automatisch abwechseln: nicht wie der vorherige Beitrag, selten genutzte zuerst */
function pickVariant(date, T = S) {
  const L = T.studio.posts.filter((p) => !p.deleted && p.status !== "abgelehnt").sort((a, b) => (a.date || "9").localeCompare(b.date || "9"));
  const before = L.filter((p) => !date || (p.date || "9") <= date);
  const last = before.slice(-6);
  const prev = last.length ? last[last.length - 1].variant : null;
  const nb = L.find((p) => date && p.date && p.date > date);
  const cnt = (v) => last.filter((p) => p.variant === v).length;
  const opts = DESIGNS.map((_, k) => k).filter((k) => k !== prev && (!nb || k !== nb.variant));
  return opts.sort((a, b) => cnt(a) - cnt(b) || a - b)[0] ?? 0;
}

/* ---------- Arbeitsauftrag (Prompt) für den Monatsplan oder einzelne Beiträge ---------- */
function recentPosts(T = S, days = 120) {
  const lim = addDays(today(), -days);
  return T.studio.posts.filter((p) => !p.deleted && (p.date || "") >= lim);
}
function studioPrompt(ym, T = S, only = null) {
  const st = T.studio,
    b = st.brand,
    F = studioFacts(T);
  const slots = only ? only : planSlots(ym, T);
  const prev = recentPosts(T)
    .map((p) => `- ${p.date || "ohne Datum"} [${p.pillar}${p.status === "veroeffentlicht" ? ", veröffentlicht" : ""}] ${p.title}${p.hook ? " – " + p.hook : ""}`)
    .slice(-40);
  const learned = st.learned && st.learned.summary ? st.learned.summary : "";
  const pName = (id) => (PILLARS.find((p) => p.id === id) || {}).name || id;
  return `Du schreibst die Instagram-Beiträge für „${b.name}“. Erstelle ${only ? "die folgenden Beiträge" : "den Redaktionsplan für " + ym} – fertig formuliert, so dass sie nach meiner Prüfung direkt veröffentlicht werden können.

WORUM ES BEI ${b.name.toUpperCase()} GEHT
- ${b.concept || BRAND_DEFAULT.concept}.
- Zielgruppe: ${b.audience}${b.region ? ", Schwerpunkt " + b.region + " und Umgebung" : ""}.
- Ziele (Reihenfolge = Priorität): ${b.goals.join("; ")}.
- Ton: ${b.tone}. Schreib so, wie ein sympathischer Mensch aus dem Team spricht – konkret, warm, ohne Werbesprache.
- Website: ${b.website}${b.signup ? "; Anmeldung: " + b.signup : ""}.${b.avoid ? "\n- Niemals erwähnen: " + b.avoid : ""}

WAHRHEIT VOR WIRKUNG (wichtigste Regel)
1. Verwende ausschließlich die Fakten F1–F${F.length}. Erfinde KEINE Veranstaltungen, Orte, Termine, Teilnehmerzahlen, Erlebnisse, Zitate, Personen, Preise, App-Funktionen, Auszeichnungen oder Versprechen.
2. Zahlen, Daten und Uhrzeiten nur aus den Fakten oder dem Termin des Beitrags. Keine Preise, nicht „kostenlos“, außer es steht in den Fakten.
3. Anmeldung: nur ${b.signup ? "„" + b.signup + "“" : "über " + b.website}. Keine App-Store- oder Download-Hinweise und keine Aussage, dass es eine App zum Herunterladen gibt, außer es steht in den Fakten.
4. Fehlt dir eine Angabe, erfinde sie nicht: schreibe an der Stelle [BITTE ERGÄNZEN: …]. Die App blockiert solche Beiträge, bis ich sie ausfülle.
5. „Orte und Aktivitäten“: nur allgemeine Arten (z. B. „ein ruhiges Café“), keine Namen, außer sie stehen in den Fakten.
6. Rückblicke nur mit echten Angaben aus den Fakten; Eindrücke, Stimmung und Zahlen als [BITTE ERGÄNZEN: …].

SO KLINGT ES GUT
- Jeder Beitrag hat einen anderen Einstieg. Wechsle zwischen: echter Frage an die Leser, kurzer Alltagsbeobachtung, klarer Aussage, kleinem Gedankenexperiment („Stell dir vor …“). Keine erfundenen Personen oder Erlebnisse.
- Nutze den angegebenen Blickwinkel je Termin; keine Wiederholung der bisherigen Beiträge (Liste unten).
- Vermeide Floskeln wie: ${STOCK.slice(0, 14).map((x) => "„" + x + "“").join(", ")}.
- Captions 60–150 Wörter, kurze Absätze, Du-Ansprache. Höchstens 2 Emojis, nur passende und ruhige (z. B. 📅 📍 ☕ 🙂), keine 🔥💯🚀.
- Handlungsaufforderung am Ende, jedes Mal anders formuliert, immer mit ${b.website}.
- 5–8 passende deutsche Hashtags ohne Leerzeichen${b.hashtags ? ", immer dabei: " + b.hashtags : ""}; nicht in jedem Beitrag dieselben.
- Interne Fakten (Typ „intern“) nur sinngemäß und nur, wenn sie für die Öffentlichkeit geeignet sind.

${(() => {
    const cf = contentFocus(T);
    return cf.length ? "SCHWERPUNKT (aus den aktuellen Kennzahlen abgeleitet; Zahlen daraus NICHT in Beiträgen nennen)\n" + cf.map((x) => "- " + x).join("\n") + "\n\n" : "";
  })()}FAKTEN
${F.map((f) => `${f.id} (${f.kind}): ${f.text}`).join("\n")}

TERMINE (je ein Beitrag)
${slots.map((s, i) => `${i + 1}. ${s.date} (${WD[new Date(s.date + "T12:00").getDay()]}) ${s.time} – Bereich: ${pName(s.pillar)} – Art: ${KINDS[s.kind || PILLAR_KIND[s.pillar]] || "frei"} – Format: ${PTYPES[s.type]}${s.angle ? " – Blickwinkel: " + s.angle : ""}`).join("\n")}

BISHERIGE BEITRÄGE (nicht wiederholen)
${prev.length ? prev.join("\n") : "(noch keine)"}
${learned ? "\nBISHERIGE ERGEBNISSE (Annahme, kleine Datenbasis)\n" + learned + "\n" : ""}
FOLIEN
- Einzelbild: genau 1 Folie. Vorlagen: "frage" (Community-Frage), "ankuendigung" (Meetup; Feld "details": Datum und Ort aus den Fakten, je Zeile), "erinnerung" (kurz vor dem Meetup, ebenfalls "details"), "rueckblick", "cover".
- Karussell: 4–6 Folien: zuerst "cover" (neugierig machender Titel), dann "tipp" oder "info" (je Folie ein Gedanke; bei "info" Stichpunkte je Zeile), zuletzt "abschluss" (Handlungsaufforderung).
- Reel: 1 Folie "cover" als Titelbild, zusätzlich "reel" mit Skript und Szenenliste.
- Folientexte kurz und auf dem Handy lesbar: Titel höchstens 8 Wörter, Text höchstens 25 Wörter.
- "story": 1–2 kurze Sätze für eine Story (höchstens 15 Wörter).

ANTWORTE NUR MIT DIESEM JSON (ohne weitere Erklärungen):
{"format":"${PLAN_FORMAT}","version":1,"posts":[{"date":"JJJJ-MM-TT","time":"HH:MM","pillar":"${PILLARS.map((p) => p.id).join("|")}","kind":"${Object.keys(KINDS).join("|")}","angle":"Blickwinkel aus dem Termin","type":"einzelbild|karussell|reel","title":"interner Kurztitel","hook":"erster Satz","slides":[{"template":"cover|tipp|info|frage|ankuendigung|erinnerung|rueckblick|abschluss","title":"…","text":"…","details":"…"}],"caption":"…","hashtags":["#…"],"facts":["F1"],"reel":{"script":"…","shots":["…"]},"story":"…"}]}`;
}

/* ---------- KI-Antwort prüfen und übernehmen ---------- */
const cleanTag = (h) => {
  const t = String(h || "")
    .trim()
    .replace(/^#*/, "")
    .replace(/[^0-9A-Za-zÄÖÜäöüß_]/g, "");
  return t && /[A-Za-zÄÖÜäöüß]/.test(t) ? "#" + t : ""; // nur Ziffern verlinkt Instagram nicht
};
const words = (s) =>
  new Set(
    String(s || "")
      .toLowerCase()
      .split(/[^a-zäöüß0-9]+/)
      .filter((w) => w.length > 3),
  );
function similar(a, b) {
  const A = words(a),
    B = words(b);
  if (!A.size || !B.size) return 0;
  let n = 0;
  for (const w of A) if (B.has(w)) n++;
  const m = Math.min(A.size, B.size);
  return m < 4 ? (n === Math.max(A.size, B.size) ? 1 : 0) : n / m;
}
/* Faktenprüfung: Zahlen, Daten, Preise, Zitate und Versprechen, die nicht aus den Fakten stammen, werden markiert. */
function factCheck(p, T = S) {
  const F = studioFacts(T);
  let allowed = F.map((f) => f.text).join(" ") + " " + (p.date || "") + " " + (p.time || "");
  // Alle üblichen Schreibweisen der erlaubten Daten (12.3.2026, 12.03., Donnerstag, 12. März)
  for (const iso of new Set(allowed.match(/\d{4}-\d{2}-\d{2}/g) || [])) {
    const [y, m, dd] = iso.split("-");
    allowed += ` ${fmt(iso)} ${fmtLong(iso)} ${+dd}.${+m}. ${dd}.${m}. ${dd}.${m}.${y} ${+dd}.${+m}.${y}`;
  }
  const all = [p.title, p.hook, p.caption, ...(p.slides || []).flatMap((s) => [s.title, s.text, s.details]), p.story, p.reel && p.reel.script].filter(Boolean).join(" \n ");
  const W = [];
  const nums = all.match(/\d+([.,:]\d+)*/g) || [];
  const bad = [...new Set(nums.filter((n) => !allowed.includes(n) && !/^[1-9]$/.test(n)))];
  if (bad.length) W.push("Zahlen oder Daten, die nicht in den Fakten stehen: " + bad.slice(0, 5).join(", "));
  // Preise: jeder Betrag muss genau so in den Fakten stehen; „kostenlos“ nur, wenn es dort steht
  const norm = (x) => x.toLowerCase().replace(/\s+/g, "").replace("euro", "€");
  const amounts = (all.match(/\d+([.,]\d+)?\s*(€|euro\b)|€\s*\d+([.,]\d+)?/gi) || []).map(norm);
  const allowedAmounts = (allowed.match(/\d+([.,]\d+)?\s*(€|euro\b)|€\s*\d+([.,]\d+)?/gi) || []).map(norm);
  if (
    amounts.some((a) => !allowedAmounts.includes(a)) ||
    (/€|\beuro\b/i.test(all) && !amounts.length && !/€|\beuro\b/i.test(allowed)) ||
    (/kostenlos|gratis|umsonst/i.test(all) && !/kostenlos|gratis|umsonst/i.test(allowed)) ||
    /\d+\s*%\s*(rabatt|günstiger|sparen)/i.test(all)
  )
    W.push("Preis- oder Kostenangabe – Preise legt nur der Gründer fest");
  // Großschreibung zählt (Namen): daher ohne i-Flag, sonst gilt „erzählt und …“ als „erzählt + Name“
  if (/„[^“"]{12,}[“"]\s*[–—-]\s*[A-ZÄÖÜ]|\b(sagt|erzählt|berichtet|meint)\s+[A-ZÄÖÜ][a-zäöüß]+\b|\b[Tt]eilnehmer(in)?\s+[A-ZÄÖÜ][a-zäöüß]+\b/.test(all) || /erfahrungsbericht/i.test(all))
    W.push("Möglicher Erfahrungsbericht oder Zitat – nur mit echter, belegter Quelle verwenden");
  if (/garantiert|100\s*%|immer neue freunde|beste[nr]? (app|community)|nr\.\s*1/i.test(all)) W.push("Mögliches Versprechen oder Superlativ");
  if (/(apps\.apple\.com|play\.google\.com|bit\.ly|https?:\/\/)/i.test(all) && !/(apps\.apple\.com|play\.google\.com)/i.test(allowed)) W.push("Enthält einen Link, der nicht aus den Fakten stammt");
  if (/\[\s*bitte\s+ergänzen|\[\s*ergänzen|\bTODO\b|\bXX+\b|\[\.\.\.\]|\[…\]/i.test(all)) W.push("Platzhalter noch nicht ausgefüllt ([BITTE ERGÄNZEN …]) – fehlende Angaben bitte selbst eintragen");
  if (/app\s*-?\s*store|play\s*-?\s*store|google\s+play|herunterladen|\bdownload|runterladen|jetzt\s+(in\s+der|die)\s+app\b/i.test(all) && !/app\s*-?\s*store|play\s*-?\s*store|herunterladen|download/i.test(allowed))
    W.push("Hinweis auf App-Download oder App-Store – nur verwenden, wenn in deinen Daten bestätigt (Anmeldung läuft über " + (T.studio.brand.website || "vivalink.me") + ")");
  if (/\b(\d+|hunderte|tausende|dutzende)\s+(mitglieder|nutzer|teilnehmer|leute|menschen)\b/i.test(all) && !/mitglieder|nutzer|teilnehmer/i.test(allowed)) W.push("Angabe zur Zahl von Mitgliedern oder Teilnehmenden – nur mit belegten Daten");
  if (p.pillar === "rueckblick" && !p.confirmed && !F.some((f) => f.kind === "meetup-wissen")) W.push("Rückblick: Angaben bitte selbst bestätigen („Angaben geprüft“ unter „Termin“)");
  if (p.pillar === "meetup" && !F.some((f) => f.kind === "meetup")) W.push("Meetup-Beitrag ohne bestätigtes Meetup in den Daten");
  const u = T.meetup;
  if (p.pillar === "meetup" && u && u.place && u.date >= today() && !all.toLowerCase().includes(u.place.toLowerCase()))
    W.push("Ort des Meetups („" + u.place + "“) fehlt oder weicht ab");
  if (String(p.caption || "").length > 2200) W.push("Caption länger als 2.200 Zeichen – Instagram lässt das nicht zu");
  const dup = T.studio.posts.find((q) => q.id !== p.id && !q.deleted && (similar(q.hook, p.hook) >= 0.8 || similar(q.title, p.title) >= 0.9));
  if (dup) W.push("Ähnlich wie bereits vorhandener Beitrag: „" + dup.title + "“");
  return W;
}
function normSlides(type, slides) {
  let L = (Array.isArray(slides) ? slides : [])
    .slice(0, 10)
    .map((s) => ({ template: TEMPLATES.includes(s && s.template) ? s.template : "", title: str(s && s.title, 200), text: str(s && s.text, 600), details: str(s && s.details, 200) }))
    .filter((s) => s.title || s.text || s.details);
  if (!L.length) L = [{ template: "cover", title: "", text: "", details: "" }];
  if (type === "karussell") {
    L.forEach((s, i) => {
      if (!s.template) s.template = i === 0 ? "cover" : i === L.length - 1 ? "abschluss" : "tipp";
    });
  } else {
    L = [L[0]];
    if (!L[0].template) L[0].template = "cover";
  }
  return L;
}
function makePost(x, source, T = S) {
  const type = PTYPES[x.type] ? x.type : "einzelbild";
  const p = {
    id: uid(),
    status: "entwurf",
    source,
    date: typeof x.date === "string" && DATE_RE.test(x.date) ? x.date : "",
    time: /^\d{2}:\d{2}$/.test(x.time || "") ? x.time : T.studio.settings.time,
    pillar: PILLARS.some((q) => q.id === x.pillar) ? x.pillar : "community",
    type,
    title: str(x.title || x.hook, 120) || "Beitrag",
    hook: str(x.hook, 300),
    slides: normSlides(type, x.slides),
    caption: str(x.caption, 6000), // nicht abschneiden: zu lange Captions meldet die Prüfung
    hashtags: [...new Set((Array.isArray(x.hashtags) ? x.hashtags : String(x.hashtags || "").split(/[\s,]+/)).map(cleanTag).filter(Boolean))].slice(0, 8),
    facts: Array.isArray(x.facts) ? x.facts.map((f) => str(f, 10)).slice(0, 20) : [],
    story: str(x.story, 300),
    reel: type === "reel" && x.reel ? { script: str(x.reel.script, 3000), shots: (Array.isArray(x.reel.shots) ? x.reel.shots : []).map((s) => str(s, 300)).slice(0, 20) } : null,
    metrics: null,
    createdAt: Date.now(),
    meetupDate: x.meetupDate || "",
    kind: KINDS[x.kind] ? x.kind : PILLAR_KIND[PILLARS.some((q) => q.id === x.pillar) ? x.pillar : "community"],
    angle: str(x.angle, 120),
  };
  if (IS_TEST) p.demo = true; // Testversion: jeder Beitrag ist künstlich und wird in der echten App abgelehnt
  if (p.pillar === "meetup" && !p.meetupDate && T.meetup && T.meetup.date && p.date && p.date <= T.meetup.date) p.meetupDate = T.meetup.date;
  // Art eines Meetup-Beitrags ohne Angabe: bis 3 Tage vorher Erinnerung, sonst Ankündigung
  if (p.pillar === "meetup" && !KINDS[x.kind] && p.meetupDate && p.date) p.kind = Math.round((new Date(p.meetupDate + "T12:00") - new Date(p.date + "T12:00")) / 864e5) <= 3 ? "erinnerung" : "ankuendigung";
  p.variant = Number.isInteger(x.variant) && x.variant >= 0 && x.variant < DESIGNS.length ? x.variant : pickVariant(p.date, T);
  checkPost(p, T);
  touch(p);
  return p;
}
function parsePlanAnswer(text) {
  let t = String(text || "").trim();
  const a = t.indexOf("{"),
    b = t.lastIndexOf("}");
  if (a < 0 || b < a) return { ok: false, error: "Keine gültige Antwort: Es wurde kein JSON gefunden." };
  let j;
  try {
    j = JSON.parse(t.slice(a, b + 1));
  } catch (e) {
    return { ok: false, error: "Die Antwort ist unvollständig oder fehlerhaft (JSON). Bitte die komplette Antwort einfügen." };
  }
  const list = Array.isArray(j) ? j : j && Array.isArray(j.posts) ? j.posts : null;
  if (!list) return { ok: false, error: "Die Antwort enthält keine Beiträge (posts)." };
  return { ok: true, items: list.filter((x) => x && typeof x === "object").slice(0, 60) };
}
/* Übernimmt geprüfte Beiträge als Entwürfe (ersetzt nichts, löscht nichts). */
function importPlan(text, T = S, source = "ki") {
  const r = parsePlanAnswer(text);
  if (!r.ok) return r;
  const added = [];
  let dupes = 0;
  const key = (p) => [p.date, p.pillar, (p.hook || "").trim().toLowerCase(), (p.caption || "").trim().toLowerCase()].join("|");
  const have = new Set(T.studio.posts.filter((p) => !p.deleted).map(key));
  for (const x of r.items) {
    const p = makePost(x, source, T);
    if (!p.caption && !p.slides.some((s) => s.title || s.text)) continue;
    polishPost(p, T); // formale Kleinigkeiten automatisch, transparent vermerkt
    // Dieselbe Antwort zweimal eingefügt → keine doppelten Beiträge; Meetup-Erinnerung/-Ankündigung nicht doppelt
    const sameMeetup = p.pillar === "meetup" && p.meetupDate && T.studio.posts.some((q) => !q.deleted && q.status !== "abgelehnt" && q.pillar === "meetup" && q.meetupDate === p.meetupDate && (q.kind || q.auto) === p.kind);
    if (have.has(key(p)) || sameMeetup) {
      dupes++;
      continue;
    }
    have.add(key(p));
    T.studio.posts.push(p);
    added.push(p);
  }
  return { ok: true, added, dupes, warned: added.filter((p) => p.warnings.length).length };
}

/* ---------- Selbstständig erkannte Anlässe: Entwürfe ohne KI, nur aus Fakten ---------- */
/* Mehrere Formulierungen, damit automatische Beiträge nicht immer gleich klingen. Keine erfundenen Angaben:
   nur Datum, Ort, Anmeldeweg und die vom Gründer beschriebenen Besonderheiten. */
const AUTO_TEXT = {
  ankuendigung: [
    (w, o, c) => `Neue Leute kennenlernen, ohne wochenlang zu schreiben: Beim nächsten Meetup triffst du Menschen direkt – in kleiner Runde, mit Zeit für echte Gespräche.\n\n📅 ${w}\n📍 ${o}\n\n${c}`,
    (w, o, c) => `Am ${w} treffen wir uns wieder.\n\nOrt: ${o}\n\nPersönlich statt nur online: Lerne Menschen kennen, die ähnliche Interessen haben, und nimm dir Zeit für ein richtiges Gespräch.\n\n${c}`,
    (w, o, c) => `Manchmal braucht es nur einen Anlass, um mit jemandem ins Gespräch zu kommen.\n\nUnser nächstes Meetup: ${w}, ${o}. Wir treffen uns in kleiner Runde, damit jeder zu Wort kommt.\n\n${c}`,
  ],
  erinnerung: [
    (w, o, c, d) => `${d === 0 ? "Heute ist es so weit" : d === 1 ? "Morgen ist es so weit" : "Nur noch wenige Tage"}: unser Meetup am ${w}.\n\nOrt: ${o}\n\n${c}`,
    (w, o, c) => `Kurze Erinnerung: Am ${w} treffen wir uns – ${o}.\n\nKleine Runde, echte Gespräche, neue Gesichter.\n\n${c}`,
    (w, o, c) => `Falls du noch überlegst: Das nächste Meetup ist am ${w} (${o}).\n\nEin entspannter Rahmen, um Menschen persönlich kennenzulernen.\n\n${c}`,
  ],
  rueckblick: [
    (w, o, c) => `Rückblick auf unser Meetup am ${w} (${o}).\n\n[BITTE ERGÄNZEN: Was ist euch in Erinnerung geblieben? Nur echte Eindrücke, keine Zahlen ohne Beleg.]\n\nDas nächste Treffen kündigen wir hier an. ${c}`,
    (w, o, c) => `So war unser Meetup am ${w} – Ort: ${o}.\n\n[BITTE ERGÄNZEN: zwei, drei ehrliche Sätze zum Abend, z. B. worüber gesprochen wurde.]\n\n${c}`,
  ],
};
const AUTO_TAGS = ["#NeueLeuteKennenlernen", "#EchteGespräche", "#Begegnungen", "#GemeinsamStattEinsam", "#Freizeit", "#Freundefinden"];
function autoCta(b, k) {
  // Immer der eingetragene Anmeldeweg (keine anderen Behauptungen über den Ablauf)
  const way = b.signup || "Anmeldung über " + b.website;
  const L = [way + ".", `Lust bekommen? ${way}.`, `Mehr Infos auf ${b.website} · ${way}.`];
  return L[k % L.length];
}
const hashN = (s) => [...String(s)].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);
function autoDrafts(T = S) {
  const st = T.studio,
    u = T.meetup,
    b = st.brand,
    out = [];
  if (!u || !u.date || !u.place) return out;
  const days = Math.round((new Date(u.date + "T12:00") - new Date(today() + "T12:00")) / 864e5);
  if (days > 21 || days < -6) return out;
  const cov = meetupCoverage(T);
  const when = fmtLong(u.date);
  // Formulierung je Anlass wechseln: andere Variante als beim letzten automatischen Beitrag derselben Art
  const pick = (k) => {
    const L = AUTO_TEXT[k],
      last = st.posts.filter((p) => p.auto === k && Number.isInteger(p.autoText)).sort((x, y) => (y.createdAt || 0) - (x.createdAt || 0))[0];
    let n = hashN(u.date + k) % L.length;
    if (last && last.autoText === n) n = (n + 1) % L.length;
    return n;
  };
  const tags = (k) => {
    const r = b.region ? cleanTag(b.region.split(/[ ,/]/)[0]) : "";
    const h = hashN(u.date + k);
    return ["#Vivalink", "#Meetup", r, AUTO_TAGS[h % AUTO_TAGS.length], AUTO_TAGS[(h + 2) % AUTO_TAGS.length]].filter(Boolean);
  };
  if (days >= 1 && !cov.announce) {
    const n = pick("ankuendigung");
    const date = days > 4 ? addDays(today(), 1) : today();
    out.push({
      auto: "ankuendigung",
      autoText: n,
      x: {
        date,
        time: st.settings.time,
        pillar: "meetup",
        kind: "ankuendigung",
        type: "einzelbild",
        title: "Meetup-Ankündigung " + fmt(u.date),
        hook: ["Neue Leute kennenlernen – persönlich", "Am " + when + " treffen wir uns wieder", "Manchmal braucht es nur einen Anlass"][n],
        slides: [{ template: "ankuendigung", title: ["Nächstes Meetup", "Lass uns treffen", "Persönlich kennenlernen"][n % 3], text: "Kleine Runde, echte Gespräche.", details: `${when}\n${u.place}` }],
        caption: AUTO_TEXT.ankuendigung[n](when, u.place, autoCta(b, n)),
        hashtags: tags("a"),
        facts: ["meetup"],
        story: `Nächstes Meetup: ${when} – ${u.place}`,
        meetupDate: u.date,
      },
    });
  }
  if (days >= 0 && days <= 3 && !cov.remind) {
    const n = pick("erinnerung");
    out.push({
      auto: "erinnerung",
      autoText: n,
      x: {
        date: today(),
        time: st.settings.time,
        pillar: "meetup",
        kind: "erinnerung",
        type: "story",
        title: "Meetup-Erinnerung " + fmt(u.date),
        hook: "Bald ist es so weit",
        slides: [{ template: "erinnerung", title: "Bald ist es so weit", text: "Wir freuen uns auf dich.", details: `${when}\n${u.place}` }],
        caption: AUTO_TEXT.erinnerung[n](when, u.place, autoCta(b, n + 1), days),
        hashtags: tags("r"),
        facts: ["meetup"],
        meetupDate: u.date,
      },
    });
  }
  // Nach dem Meetup: Rückblick als Entwurf mit Platzhaltern – blockiert die Freigabe, bis echte Angaben eingetragen sind
  if (days < 0 && !cov.recap) {
    const n = pick("rueckblick");
    out.push({
      auto: "rueckblick",
      autoText: n,
      x: {
        date: addDays(today(), 1),
        time: st.settings.time,
        pillar: "rueckblick",
        kind: "rueckblick",
        type: "einzelbild",
        title: "Rückblick Meetup " + fmt(u.date),
        hook: "Rückblick auf unser Meetup",
        slides: [{ template: "rueckblick", title: "Rückblick: Meetup am " + fmt(u.date), text: "[BITTE ERGÄNZEN: ein Satz zum Abend]" }],
        caption: AUTO_TEXT.rueckblick[n](when, u.place, autoCta(b, n + 2)),
        hashtags: tags("b"),
        facts: ["meetup"],
        meetupDate: u.date,
      },
    });
  }
  return out;
}
function runAutomations(T = S) {
  const made = [];
  for (const d of autoDrafts(T)) {
    const p = makePost(d.x, "regel", T);
    p.auto = d.auto;
    p.autoText = d.autoText;
    T.studio.posts.push(p);
    made.push(p);
  }
  return made;
}

/* ---------- Freigabe, Veröffentlichung, Auswertung ---------- */
const livePosts = (T = S) => T.studio.posts.filter((p) => !p.deleted);
function approveWeek(wk, includeWarned = false, T = S) {
  const L = livePosts(T).filter((p) => p.status === "entwurf" && p.date && weekKey(p.date) === wk && (includeWarned || !p.warnings || !p.warnings.length));
  for (const p of L) approvePost(p); // merkt sich den freigegebenen Inhalt (Änderung → erneute Freigabe nötig)
  if (L.length) logAction("post.approve", "gruender", true, L.length + " Beiträge (Wochenfreigabe)");
  return L.length;
}
function setStatus(p, status) {
  if (status === "freigegeben") return approvePost(p);
  if (status === "veroeffentlicht") return markPublishedManually(p);
  p.status = status;
  if (status === "entwurf") p.approvedHash = null;
  touch(p);
}
const engagement = (m) => (m && m.reach > 0 ? ((m.likes || 0) + (m.comments || 0) + (m.saves || 0) + (m.shares || 0)) / m.reach : null);
/* Lernt aus eingetragenen Ergebnissen, welche Bereiche/Formate besser ankommen (Annahme bei wenigen Daten). */
function learn(T = S) {
  const P = livePosts(T).filter((p) => p.status === "veroeffentlicht" && engagement(p.metrics) != null);
  const by = (key) => {
    const g = {};
    for (const p of P) (g[p[key]] = g[p[key]] || []).push(engagement(p.metrics));
    return Object.entries(g)
      .map(([k, v]) => ({ k, n: v.length, avg: v.reduce((a, b) => a + b, 0) / v.length }))
      .sort((a, b) => b.avg - a.avg);
  };
  const pil = by("pillar"),
    typ = by("type");
  const pct = (x) => (x * 100).toFixed(1).replace(".", ",") + " %";
  T.studio.learned = {
    at: Date.now(),
    n: P.length,
    pillars: pil,
    types: typ,
    order: pil.filter((x) => x.n >= 2).map((x) => x.k),
    summary: P.length
      ? `Interaktionsrate je Bereich: ${pil.map((x) => `${x.k} ${pct(x.avg)} (${x.n} Beiträge)`).join(", ")}. Je Format: ${typ.map((x) => `${PTYPES[x.k] || x.k} ${pct(x.avg)} (${x.n})`).join(", ")}.`
      : "",
  };
  return T.studio.learned;
}
/* Anzeige-Status: unterscheidet geplant (freigegeben, Termin in der Zukunft) und fällig */
function postState(p, t = today()) {
  if (p.status === "freigegeben") return p.date && p.date > t ? { k: "geplant", n: "Geplant" } : { k: "faellig", n: "Fällig" };
  return { k: p.status, n: PSTATUS[p.status] || p.status };
}
/* Wichtigkeit: Meetup-Beiträge und automatisch erkannte Anlässe zuerst */
const postPrio = (p) => (p.pillar === "meetup" || p.auto ? 2 : p.type === "karussell" ? 1 : 0);

/* Stilprüfung (blockiert die Freigabe nicht): Lesbarkeit, Länge, Handlungsaufforderung, Wiederholungen */
function styleCheck(p, T = S) {
  const b = T.studio.brand,
    H = [];
  const wc = (s) => String(s || "").split(/\s+/).filter(Boolean).length;
  const cw = wc(p.caption);
  if (p.type !== "story" && cw < 25) H.push("Caption sehr kurz (" + cw + " Wörter) – 60–150 Wörter funktionieren meist besser");
  if (cw > 220) H.push("Caption sehr lang (" + cw + " Wörter) – kürzen verbessert die Lesbarkeit");
  (p.slides || []).forEach((s, i) => {
    if (wc(s.title) > 10) H.push(`Folie ${i + 1}: Titel zu lang für mobile Lesbarkeit (${wc(s.title)} Wörter, ideal ≤ 8)`);
    if (wc(s.text) > 40) H.push(`Folie ${i + 1}: Folientext zu lang (${wc(s.text)} Wörter, ideal ≤ 30)`);
  });
  const tags = (p.hashtags || []).length;
  if (p.type !== "story" && tags < 3) H.push("Wenige Hashtags (" + tags + ") – 5–8 passende Hashtags empfohlen");
  const emo = (String(p.caption || "").match(/\p{Extended_Pictographic}/gu) || []).length;
  if (emo > 3) H.push(emo + " Emojis – vereinbart sind höchstens 1–2");
  if (/\b[A-ZÄÖÜ]{6,}\b/.test(p.caption || "")) H.push("Großbuchstaben-Wörter wirken laut – lieber normal schreiben");
  const site = (b.website || "vivalink.me").toLowerCase();
  if (p.type !== "story" && !String(p.caption || "").toLowerCase().includes(site) && !(b.signup && String(p.caption || "").includes(b.signup)))
    H.push("Keine Handlungsaufforderung mit „" + (b.website || "vivalink.me") + "“ – Ziel Nr. 1 sind Registrierungen");
  const low = [p.caption, p.hook, ...(p.slides || []).flatMap((s) => [s.title, s.text])].join(" \n ").toLowerCase();
  const word = (x) => new RegExp("(^|[^a-zäöüß])" + x.replace(/[.*+?^${}()|[\]\\!]/g, "\\$&") + "($|[^a-zäöüß])");
  const fl = STOCK.filter((x) => word(x).test(low));
  if (fl.length) H.push("Floskel: " + fl.slice(0, 3).map((x) => "„" + x + "“").join(", ") + " – konkreter formulieren");
  if (LOUD_EMOJI.test(p.caption || "")) H.push("Laute Emojis (z. B. 🔥 🚀 💯) passen nicht zum ruhigen Ton – lieber 🙂 ☕ 📍");
  const paras = String(p.caption || "").split(/\n+/).filter((x) => x.trim());
  if (paras.length >= 3 && paras.every((x) => /^\p{Extended_Pictographic}/u.test(x.trim()))) H.push("Jeder Absatz beginnt mit einem Emoji – wirkt unruhig");
  const sentences = (x) =>
    String(x || "")
      .toLowerCase()
      .split(/(?<=[.!?])\s+|\n+/)
      .map((z) => z.replace(/[^a-zäöüß0-9 ]/g, "").trim())
      .filter((z) => z.split(" ").length >= 6);
  const mine = sentences(p.caption);
  if (new Set(mine).size < mine.length) H.push("Ein Satz kommt in der Caption doppelt vor");
  const other = new Set(T.studio.posts.filter((q) => q.id !== p.id && !q.deleted && (q.date || "") >= addDays(today(), -60)).flatMap((q) => sentences(q.caption)));
  const rep2 = mine.filter((z) => other.has(z));
  if (rep2.length) H.push(rep2.length + " Satz/Sätze wörtlich wie in einem Beitrag der letzten 60 Tage");
  if (p.photo && p.photo.id && !p.photo.consent) H.push("Foto ohne bestätigte Bildrechte/Einwilligung – wird nicht verwendet");
  const start = (s) => String(s || "").toLowerCase().split(/\s+/).slice(0, 3).join(" ");
  const st = start(p.hook || p.caption);
  if (st.split(" ").length === 3 && T.studio.posts.some((q) => q.id !== p.id && !q.deleted && q.date >= addDays(today(), -60) && start(q.hook || q.caption) === st))
    H.push("Beginnt wie ein Beitrag der letzten 60 Tage („" + st + " …“)");
  return H;
}
function checkPost(p, T = S) {
  p.warnings = factCheck(p, T);
  p.hints = styleCheck(p, T);
}

/* Automatische Feinarbeit an KI-Entwürfen: nur formale, eindeutige Korrekturen (Inhalt bleibt unverändert).
   Jede Änderung wird im Beitrag vermerkt („Automatisch angepasst“). */
function polishPost(p, T = S) {
  const b = T.studio.brand,
    done = [];
  const site = (b.website || "vivalink.me").toLowerCase();
  let c = String(p.caption || "");
  const c0 = c;
  c = c.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (LOUD_EMOJI.test(c)) {
    c = c.replace(new RegExp(LOUD_EMOJI.source, "gu"), "").replace(/ {2,}/g, " ");
    done.push("laute Emojis entfernt");
  }
  let n = 0;
  const before = c;
  c = c.replace(/\p{Extended_Pictographic}\uFE0F?/gu, (m) => (++n > 2 ? "" : m)).replace(/ {2,}/g, " ");
  if (c !== before) done.push("Emojis auf 2 begrenzt");
  if (p.type !== "story" && c && !c.toLowerCase().includes(site) && !(b.signup && c.includes(b.signup))) {
    const way = b.signup || "Mehr auf " + b.website;
    c += "\n\n" + (/[.!?]$/.test(way) ? way : way + ".");
    done.push("Anmelde-Hinweis ergänzt");
  }
  if (c !== c0 && !done.length) done.push("Leerzeilen bereinigt");
  p.caption = c;
  const tags = p.hashtags || [];
  if (p.type !== "story" && !tags.some((t) => t.toLowerCase() === "#vivalink")) {
    p.hashtags = ["#Vivalink", ...tags].slice(0, 8);
    done.push("#Vivalink ergänzt");
  }
  if (done.length) p.polished = done;
  checkPost(p, T);
  return done;
}
/* Freigabebereit: Entwurf ohne Prüfhinweis, höchstens ein Stilhinweis, Termin heute oder später */
const postReady = (p, t = today()) => p.status === "entwurf" && !p.demo && !(p.warnings || []).length && (p.hints || []).length <= 1 && (!p.date || p.date >= t);

/* Kurzer Text zum Teilen: Caption + Hashtags */
const postText = (p) => (p.caption || "").trim() + (p.hashtags && p.hashtags.length ? "\n\n" + p.hashtags.join(" ") : "");
