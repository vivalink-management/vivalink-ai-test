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
const TEMPLATES = ["cover", "tipp", "info", "frage", "ankuendigung", "rueckblick", "abschluss"];
const WD = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const PLAN_FORMAT = "vivalink-studio-plan";

/* Markenfarben aus dem offiziellen Logo (vorläufig, bis der Gründer sie bestätigt). */
const BRAND_DEFAULT = {
  name: "Vivalink",
  website: "vivalink.me",
  region: "",
  handle: "",
  signup: "",
  colors: { pink: "#FA0372", violet: "#6203DD", orange: "#FE6603", magenta: "#AC01B7", text: "#000000" },
  colorsConfirmed: false,
  font: "Nunito",
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
  if (b.signup) add("marke", `So meldet man sich an: ${b.signup}`, "brand");
  if (b.handle) add("marke", `Instagram-Konto: ${b.handle}`, "brand");
  const u = T.meetup;
  if (u && u.date && u.place && u.date >= today()) add("meetup", `Nächstes Meetup: ${fmtLong(u.date)} (${u.date}), Ort: ${u.place}.`, "meetup");
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
  return { announce: L.some((p) => p.auto === "ankuendigung" || diff(p) >= 4), remind: L.some((p) => p.auto === "erinnerung" || (diff(p) >= 0 && diff(p) <= 3)) };
}

/* ---------- Planung: Termine und Themenverteilung ---------- */
function planSlots(ym, T = S) {
  const st = T.studio,
    set = st.settings,
    F = studioFacts(T);
  const days = monthDays(ym).filter((d) => set.days.includes(new Date(d + "T12:00").getDay()) && d >= today());
  const avail = PILLARS.filter((p) => !p.needs || (p.needs === "meetup" ? false : p.needs === "appfacts" ? hasFacts(F, ["app"]) : hasFacts(F, ["meetup-wissen"])));
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
  for (const d of days) {
    if (meet.has(d)) {
      slots.push({ date: d, time: set.time, pillar: "meetup", type: "einzelbild" });
      continue;
    }
    const p = order[i++ % order.length];
    let type = p.type;
    if (reels > 0 && i % 4 === 0) (type = "reel"), reels--;
    slots.push({ date: d, time: set.time, pillar: p.id, type });
  }
  return slots;
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
    .map((p) => `- ${p.date || "ohne Datum"} [${p.pillar}] ${p.title}${p.hook ? " – " + p.hook : ""}`)
    .slice(-40);
  const learned = st.learned && st.learned.summary ? st.learned.summary : "";
  const pName = (id) => (PILLARS.find((p) => p.id === id) || {}).name || id;
  return `Du bist Social-Media-Redakteur für „${b.name}“. Erstelle ${only ? "die folgenden Instagram-Beiträge" : "den Instagram-Redaktionsplan für " + ym} – vollständig und direkt veröffentlichbar.

ÜBER ${b.name.toUpperCase()}
- Zielgruppe: ${b.audience}${b.region ? ", Schwerpunkt " + b.region + " und Umgebung" : ""}.
- Ziele (Reihenfolge = Priorität): ${b.goals.join("; ")}.
- Tonalität: ${b.tone}.
- Website: ${b.website}${b.signup ? "; Anmeldung: " + b.signup : ""}.${b.avoid ? "\n- Niemals erwähnen: " + b.avoid : ""}

STRIKTE REGELN
1. Verwende ausschließlich die Fakten F1–F${F.length} unten. Erfinde KEINE Veranstaltungen, Orte, Termine, Teilnehmerzahlen, Erfahrungsberichte, Zitate, Preise, App-Funktionen, Auszeichnungen oder Versprechen.
2. Zahlen, Daten und Uhrzeiten nur, wenn sie in den Fakten oder im Termin des Beitrags stehen. Keine Preise.
3. Bei „Orte und Aktivitäten“: nur allgemeine Arten von Orten und Aktivitäten (z. B. „ein gemütliches Café“), keine konkreten Namen, außer sie stehen in den Fakten.
4. Bei „So funktioniert Vivalink“ nur beschreiben, was in den Fakten steht.
5. Handlungsaufforderung: ${b.signup ? "auf den Anmeldeweg aus den Fakten verweisen" : "auf die Website " + b.website + " verweisen"}. Keine App-Store-Links erfinden.
6. Keine Wiederholung der bisherigen Beiträge (Liste unten); Hooks und Themen deutlich unterschiedlich.
7. Captions: 60–150 Wörter, Du-Ansprache, kurze Absätze, starker erster Satz, am Ende die Handlungsaufforderung. Höchstens 2 Emojis.
8. 5–8 passende Hashtags (deutsch, ohne Leerzeichen)${b.hashtags ? ", immer dabei: " + b.hashtags : ""}.
9. Interne Fakten (Typ „intern“) nur sinngemäß und nur, wenn sie für die Öffentlichkeit geeignet sind.

FAKTEN
${F.map((f) => `${f.id} (${f.kind}): ${f.text}`).join("\n")}

TERMINE (je ein Beitrag)
${slots.map((s, i) => `${i + 1}. ${s.date} (${WD[new Date(s.date + "T12:00").getDay()]}) ${s.time} – Bereich: ${pName(s.pillar)} – Format: ${PTYPES[s.type]}`).join("\n")}

BISHERIGE BEITRÄGE (nicht wiederholen)
${prev.length ? prev.join("\n") : "(noch keine)"}
${learned ? "\nBISHERIGE ERGEBNISSE (Annahme, kleine Datenbasis)\n" + learned + "\n" : ""}
FORMAT DER FOLIEN
- Einzelbild: genau 1 Folie. Vorlagen: "frage" (Community-Frage), "ankuendigung" (Meetup, Feld "details" mit Datum und Ort aus den Fakten), "rueckblick", "cover".
- Karussell: 4–6 Folien: zuerst "cover", dann "tipp" oder "info", zuletzt "abschluss" (Handlungsaufforderung).
- Reel: 1 Folie "cover" als Titelbild, zusätzlich "reel" mit Skript und Szenenliste.
- Folientexte kurz: Titel höchstens 8 Wörter, Text höchstens 30 Wörter.

ANTWORTE NUR MIT DIESEM JSON (ohne weitere Erklärungen):
{"format":"${PLAN_FORMAT}","version":1,"posts":[{"date":"JJJJ-MM-TT","time":"HH:MM","pillar":"${PILLARS.map((p) => p.id).join("|")}","type":"einzelbild|karussell|reel","title":"interner Kurztitel","hook":"erster Satz","slides":[{"template":"cover|tipp|info|frage|ankuendigung|rueckblick|abschluss","title":"…","text":"…","details":"…"}],"caption":"…","hashtags":["#…"],"facts":["F1"],"reel":{"script":"…","shots":["…"]},"story":"kurzer Story-Text (optional)"}]}`;
}

/* ---------- KI-Antwort prüfen und übernehmen ---------- */
const cleanTag = (h) => {
  const t = String(h || "")
    .trim()
    .replace(/^#*/, "")
    .replace(/[^0-9A-Za-zÄÖÜäöüß_]/g, "");
  return t ? "#" + t : "";
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
  if (/„[^“"]{12,}[“"]\s*[–—-]\s*[A-ZÄÖÜ]|\b(sagt|erzählt|berichtet|meint)\s+[A-ZÄÖÜ][a-zäöüß]+\b|erfahrungsbericht|teilnehmerin\s+[A-ZÄÖÜ]|teilnehmer\s+[A-ZÄÖÜ]/i.test(all))
    W.push("Möglicher Erfahrungsbericht oder Zitat – nur mit echter, belegter Quelle verwenden");
  if (/garantiert|100\s*%|immer neue freunde|beste[nr]? (app|community)|nr\.\s*1/i.test(all)) W.push("Mögliches Versprechen oder Superlativ");
  if (/(apps\.apple\.com|play\.google\.com|bit\.ly|https?:\/\/)/i.test(all) && !/(apps\.apple\.com|play\.google\.com)/i.test(allowed)) W.push("Enthält einen Link, der nicht aus den Fakten stammt");
  if (p.pillar === "meetup" && !F.some((f) => f.kind === "meetup")) W.push("Meetup-Beitrag ohne bestätigtes Meetup in den Daten");
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
    caption: str(x.caption, 2200),
    hashtags: [...new Set((Array.isArray(x.hashtags) ? x.hashtags : String(x.hashtags || "").split(/[\s,]+/)).map(cleanTag).filter(Boolean))].slice(0, 8),
    facts: Array.isArray(x.facts) ? x.facts.map((f) => str(f, 10)).slice(0, 20) : [],
    story: str(x.story, 300),
    reel: type === "reel" && x.reel ? { script: str(x.reel.script, 3000), shots: (Array.isArray(x.reel.shots) ? x.reel.shots : []).map((s) => str(s, 300)).slice(0, 20) } : null,
    metrics: null,
    createdAt: Date.now(),
    meetupDate: x.meetupDate || "",
  };
  if (p.pillar === "meetup" && !p.meetupDate && T.meetup && T.meetup.date && p.date && p.date <= T.meetup.date) p.meetupDate = T.meetup.date;
  p.warnings = factCheck(p, T);
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
function importPlan(text, T = S) {
  const r = parsePlanAnswer(text);
  if (!r.ok) return r;
  const added = [];
  for (const x of r.items) {
    const p = makePost(x, "ki", T);
    if (!p.caption && !p.slides.some((s) => s.title || s.text)) continue;
    T.studio.posts.push(p);
    added.push(p);
  }
  return { ok: true, added, warned: added.filter((p) => p.warnings.length).length };
}

/* ---------- Selbstständig erkannte Anlässe: Entwürfe ohne KI, nur aus Fakten ---------- */
function autoDrafts(T = S) {
  const st = T.studio,
    u = T.meetup,
    b = st.brand,
    out = [];
  if (!u || !u.date || !u.place) return out;
  const days = Math.round((new Date(u.date + "T12:00") - new Date(today() + "T12:00")) / 864e5);
  if (days < 1 || days > 21) return out;
  const cta = b.signup ? b.signup : `Mehr Infos und Anmeldung: ${b.website}`;
  const cov = meetupCoverage(T);
  const has = (k) => (k === "ankuendigung" ? cov.announce : cov.remind);
  const when = fmtLong(u.date);
  if (!has("ankuendigung")) {
    const date = days > 4 ? addDays(today(), 1) : today();
    out.push({
      auto: "ankuendigung",
      x: {
        date,
        time: st.settings.time,
        pillar: "meetup",
        type: "einzelbild",
        title: "Meetup-Ankündigung " + fmt(u.date),
        hook: "Lust, neue Leute kennenzulernen?",
        slides: [{ template: "ankuendigung", title: "Nächstes Meetup", text: "Neue Menschen kennenlernen – entspannt und in kleiner Runde.", details: `${when}\n${u.place}` }],
        caption: `Lust, neue Leute kennenzulernen? 👋\n\nUnser nächstes Meetup findet am ${when} statt – Ort: ${u.place}.\n\nKomm vorbei und lerne in entspannter Atmosphäre neue Menschen kennen.\n\n${cta}`,
        hashtags: ["#Vivalink", "#Meetup", "#NeueLeuteKennenlernen", "#Freundschaft"],
        facts: ["meetup"],
        story: `Nächstes Meetup: ${when} – ${u.place}`,
        meetupDate: u.date,
      },
    });
  }
  if (days <= 3 && !has("erinnerung")) {
    out.push({
      auto: "erinnerung",
      x: {
        date: today(),
        time: st.settings.time,
        pillar: "meetup",
        type: "story",
        title: "Meetup-Erinnerung " + fmt(u.date),
        hook: "Bald ist es so weit!",
        slides: [{ template: "ankuendigung", title: "Bald ist es so weit", text: "Wir freuen uns auf dich!", details: `${when}\n${u.place}` }],
        caption: `Bald ist es so weit: Unser Meetup am ${when} – ${u.place}.\n\n${cta}`,
        hashtags: ["#Vivalink", "#Meetup"],
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
    T.studio.posts.push(p);
    made.push(p);
  }
  return made;
}

/* ---------- Freigabe, Veröffentlichung, Auswertung ---------- */
const livePosts = (T = S) => T.studio.posts.filter((p) => !p.deleted);
function approveWeek(wk, includeWarned = false, T = S) {
  const L = livePosts(T).filter((p) => p.status === "entwurf" && p.date && weekKey(p.date) === wk && (includeWarned || !p.warnings || !p.warnings.length));
  for (const p of L) {
    p.status = "freigegeben";
    p.approvedAt = Date.now();
    touch(p);
  }
  return L.length;
}
function setStatus(p, status) {
  p.status = status;
  if (status === "freigegeben") p.approvedAt = Date.now();
  if (status === "veroeffentlicht") p.publishedAt = Date.now();
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
/* Kurzer Text zum Teilen: Caption + Hashtags */
const postText = (p) => (p.caption || "").trim() + (p.hashtags && p.hashtags.length ? "\n\n" + p.hashtags.join(" ") : "");
