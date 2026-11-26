/* Management-Übersicht: „Heute zu tun“ (geordnet, mit Begründung), „Entscheidungen für dich“, Entwicklungen,
   Aufgaben-Abhängigkeiten und Risiken je Maßnahme. Feste Regeln, keine KI. */

/* ---------- Aufgaben-Abhängigkeiten ---------- */
const liveTasks = (T = S) => T.tasks.filter((x) => !x.deleted);
/* Offene Aufgabe, auf die x wartet (oder null) */
function blockedBy(x, T = S) {
  if (!x.after) return null;
  const y = T.tasks.find((z) => z.id === x.after && !z.deleted);
  return y && !y.done ? y : null;
}
/* Reihenfolge: Priorität und Frist; abhängige Aufgaben direkt nach ihrer Voraussetzung (Schutz vor Kreisen) */
function orderTasks(list, T = S) {
  const base = [...list].sort((a, b) => PR[a.prio] - PR[b.prio] || (a.due || "9").localeCompare(b.due || "9"));
  const ids = new Set(base.map((x) => x.id)),
    out = [],
    seen = new Set();
  const visit = (x, depth = 0) => {
    if (seen.has(x.id) || depth > 20) return;
    const pre = x.after && ids.has(x.after) ? base.find((y) => y.id === x.after) : null;
    if (pre && !seen.has(pre.id)) visit(pre, depth + 1);
    if (seen.has(x.id)) return;
    seen.add(x.id);
    out.push(x);
  };
  for (const x of base) visit(x);
  return out;
}
/* Würde x → after einen Kreis erzeugen? */
function makesCycle(id, after, T = S) {
  let cur = after,
    n = 0;
  while (cur && n++ < 50) {
    if (cur === id) return true;
    const y = T.tasks.find((z) => z.id === cur);
    cur = y && y.after;
  }
  return false;
}

/* ---------- Risiken je Maßnahme (Einschätzung) ---------- */
function measureRisk(m) {
  if (m.r) return m.r;
  const t = m.t.toLowerCase();
  if (m.studio) return "Zu viele Beiträge in kurzer Zeit können aufdringlich wirken";
  if (t.includes("einladung")) return "Nur Personen anschreiben, die dem zugestimmt haben (Datenschutz)";
  if (t.includes("ziel")) return "Geschäftsentscheidung – nur durch dich";
  if (t.includes("tiefenanalyse")) return "Zeitaufwand; Ergebnis bleibt eine Annahme";
  if (t.includes("frist")) return "Zu knappe Fristen führen erneut zu Überfälligkeit";
  if (t.includes("streichen") || t.includes("erledigt")) return "Wichtiges könnte versehentlich wegfallen";
  return "gering";
}

/* ---------- Heute zu tun ---------- */
function todayList(T = S) {
  const t = today(),
    L = [];
  const add = (rank, title, why, a, id, extra = {}) => L.push({ rank, title, why, a, id, ...extra });
  const cf = typeof openConflicts === "function" ? openConflicts().length : 0;
  if (cf) add(100, cf + " Datenkonflikt(e) entscheiden", "Bis zur Entscheidung gilt die neuere Version – die andere bleibt erhalten.", "tab", "more");
  if (T.studio) {
    const P = livePosts(T);
    for (const p of P.filter((x) => x.status === "freigegeben" && x.date && x.date <= t && !x.demo).slice(0, 3))
      add(90, "Veröffentlichen: " + p.title, p.date < t ? `Seit ${fmt(p.date)} fällig – Verzögerung kostet Reichweite.` : `Heute geplant (${p.time} Uhr).`, "stOpenNext", p.id);
    const soon = P.filter((x) => x.status === "entwurf" && x.date && x.date >= t && x.date <= addDays(t, 3));
    if (soon.length > 2) add(80, soon.length + " Beiträge bis " + fmt(addDays(t, 3)) + " freigeben", "Ohne Freigabe wird nichts veröffentlicht; der Rhythmus bricht sonst ab.", "tab", "studio");
    else for (const p of soon) add(80 - (p.date > t ? 1 : 0), "Prüfen und freigeben: " + p.title, `Geplant für ${WD[new Date(p.date + "T12:00").getDay()]} ${fmt(p.date)}${p.warnings && p.warnings.length ? " · " + p.warnings.length + " Prüfhinweis(e)" : ""}.`, "stOpenNext", p.id);
  }
  const open = orderTasks(liveTasks(T).filter((x) => !x.done && !blockedBy(x, T)), T);
  for (const x of open.filter((x) => x.due && x.due <= t).slice(0, 4))
    add(x.due < t ? 70 : 60, x.title, (x.due < t ? `Frist ${fmt(x.due)} überschritten` : "Frist heute") + ` · Priorität ${x.prio}${T.tasks.some((y) => y.after === x.id && !y.done) ? " · andere Aufgaben warten darauf" : ""}.`, "tab", "tasks");
  for (const x of liveTasks(T).filter((y) => y.measure && !y.measure.outcome && y.measure.checkAt <= t).slice(0, 2)) add(50, "Maßnahme auswerten: " + x.title, "Prüftermin erreicht – kurz festhalten, ob es aus deiner Sicht gewirkt hat.", "tab", "tasks");
  if (L.length < 3)
    for (const x of open.filter((y) => !y.due || y.due > t).slice(0, 3 - L.length)) add(20, x.title, `Nächste offene Aufgabe (Priorität ${x.prio}${x.due ? ", Frist " + fmt(x.due) : ""}).`, "tab", "tasks");
  return L.sort((a, b) => b.rank - a.rank).slice(0, 6);
}
/* ---------- Entscheidungen, die nur der Gründer trifft ---------- */
function decisionsList(T = S) {
  const L = [];
  const add = (title, why, a, id) => L.push({ title, why, a, id });
  if (T.studio)
    for (const p of livePosts(T).filter((x) => x.status === "entwurf" && x.date && x.date >= today() && x.warnings && x.warnings.length).slice(0, 3))
      add("Beitrag mit Prüfhinweis: " + p.title, p.warnings[0], "stOpenNext", p.id);
  for (const m of T.memory.filter((x) => x.active && x.cat === "Entscheidung" && x.status === "unknown").slice(0, 3)) add("Offene Entscheidung: " + m.title, "Im Gedächtnis als „unbekannt“ markiert.", "tab", "memory");
  if (typeof PROPOSALS !== "undefined") for (const pr of PROPOSALS) add("KI-Vorschläge prüfen: " + pr.items.length + " Aufgabe(n)", "Aus der Wochenanalyse vom " + new Date(pr.at).toLocaleDateString("de-DE") + " – du wählst aus, was angelegt wird.", "propOpen", pr.id);
  for (const x of liveTasks(T).filter((y) => y.decision && !y.done).slice(0, 3)) add(x.title, x.why || "Geschäftliche Entscheidung – nur durch dich.", "tab", "tasks");
  if (typeof pendingGrants === "function") for (const g of pendingGrants(T)) add("Berechtigung: " + g.title, g.why, "tab", "more");
  return L;
}
/* ---------- Entwicklungen (Vergleich 7 bzw. 30 Tage, ohne Ursachenbehauptung) ---------- */
function developments(T = S) {
  const out = [];
  for (const m of T.metrics) {
    const c = cur(m);
    if (!c) continue;
    const w = cmp(m, 7) || cmp(m, 30);
    if (!w || !w.d) continue;
    const span = cmp(m, 7) ? "7" : "30";
    const def = MT.find((x) => x.k === m.key);
    const dir = def ? def.d : "neutral";
    const good = dir === "neutral" ? null : (w.d > 0) === (dir === "up");
    out.push({ name: m.name, now: num(c.value) + (m.unit ? " " + m.unit : ""), d: w.d, p: w.p, span, good, w: Math.abs(w.p == null ? 100 : w.p) });
  }
  return out.sort((a, b) => b.w - a.w).slice(0, 4);
}
function manageHtml() {
  const L = todayList(),
    D = decisionsList(),
    E = developments();
  const item = (x) =>
    `<div class="row sp todo" data-a="${esc(x.a)}" data-id="${esc(x.id)}" style="flex-wrap:nowrap;padding:6px 0;border-bottom:1px solid var(--bd)"><div style="min-width:0"><div>${esc(x.title)}</div><div class="mut">${esc(x.why)}</div></div><span class="mut">›</span></div>`;
  return `<h2>Heute zu tun</h2><div class="card" id="today">${L.length ? L.map(item).join("") : '<div class="mut">Für heute ist nichts Dringendes offen.</div>'}</div>
${D.length ? `<h2>Entscheidungen für dich</h2><div class="card" id="decide">${D.map(item).join("")}</div>` : ""}
${E.length ? `<h2>Entwicklungen</h2><div class="card" id="devs">${E.map((x) => `<div class="row sp" style="padding:3px 0"><span>${esc(x.name)}</span><span><b>${esc(x.now)}</b> <span style="color:${x.good == null ? "var(--mut)" : x.good ? "var(--ok)" : "var(--bad)"}">${x.d > 0 ? "▲" : "▼"} ${x.p != null ? (x.p > 0 ? "+" : "") + x.p + " %" : (x.d > 0 ? "+" : "") + num(x.d)}</span> <span class="mut">${x.span} T.</span></span></div>`).join("")}<div class="mut" style="font-size:12px;margin-top:4px">Veränderung gegenüber dem Wert vor ${E[0].span} bzw. 30 Tagen. Zeigt Entwicklungen, keine Ursachen.</div></div>` : ""}<div class="row"><button class="s" data-a="report">Wochenbericht</button></div>`;
}

/* ---------- KI-Antwort → Aufgaben (Vorschläge, nur nach Bestätigung angelegt) ---------- */
const ACT_FORMAT = "vivalink-actions";
/* Geschäftliche Entscheidungen (Preise, Zahlungen, bezahlte Werbung, Verträge) werden nie als normale Aufgabe angelegt,
   sondern als „Entscheidung nötig“ markiert. */
const DECISION_RE = /preis|zahlung|erstattung|bezahlte?n? (werbung|anzeigen?)|\bads?\b|\bbudget|\bvertr[aä]g|\bkündig|investier|\bkosten(pflichtig)?\b|\babo(nnement)?\b|\bkredit/i;
function parseActions(text, T = S) {
  const t = String(text || "");
  const i = t.indexOf(ACT_FORMAT);
  if (i < 0) return { ok: false, error: "Kein Aufgabenblock in der Antwort gefunden (Format „" + ACT_FORMAT + "“)" };
  const a = t.lastIndexOf("{", i),
    b = t.indexOf("```", i);
  const end = b > 0 ? t.lastIndexOf("}", b) : t.lastIndexOf("}");
  let j;
  try {
    j = JSON.parse(t.slice(a, end + 1));
  } catch (e) {
    return { ok: false, error: "Der Aufgabenblock ist unvollständig (JSON). Bitte die komplette Antwort einfügen." };
  }
  if (!j || j.format !== ACT_FORMAT || !Array.isArray(j.tasks)) return { ok: false, error: "Der Aufgabenblock enthält keine Aufgaben" };
  const open = liveTasks(T).filter((x) => !x.done);
  const items = j.tasks
    .filter((x) => x && typeof x === "object" && String(x.title || "").trim())
    .slice(0, 8)
    .map((x, n) => {
      const title = String(x.title).trim().slice(0, 200);
      const days = Math.max(0, Math.min(90, Math.round(Number(x.dueDays)) || 0));
      const dup = open.find((y) => similar(y.title, title) >= 0.8);
      return {
        n: n + 1,
        title,
        prio: PR[x.prio] != null ? x.prio : "mittel",
        area: CATS.includes(x.area) ? x.area : "Ziele",
        due: days ? addDays(today(), days) : "",
        why: String(x.why || "").slice(0, 300),
        after: Number.isInteger(x.after) && x.after >= 1 && x.after <= j.tasks.length && x.after !== n + 1 ? x.after : null,
        decision: DECISION_RE.test(title + " " + (x.why || "")),
        dup: dup ? dup.title : null,
      };
    });
  return { ok: true, items };
}
function applyActions(items, chosen, T = S) {
  const ids = {},
    made = [];
  for (const it of items) {
    if (!chosen.includes(it.n)) continue;
    const x = { id: uid(), title: (it.decision ? "Entscheidung: " : "") + it.title, prio: it.prio, area: it.decision ? "Entscheidung" : it.area, due: it.due, done: false, dev: T.dev, src: "ki", why: it.why, decision: it.decision || undefined };
    touch(x);
    T.tasks.push(x);
    ids[it.n] = x.id;
    made.push(x);
  }
  for (const it of items) if (ids[it.n] && it.after && ids[it.after]) T.tasks.find((x) => x.id === ids[it.n]).after = ids[it.after];
  return made;
}
/* Ergänzt Arbeitsaufträge um den maschinenlesbaren Aufgabenblock */
const ACT_INSTRUCTION = `\n5. Ganz am Ende genau ein Block \`\`\`json mit höchstens 5 konkreten Aufgaben aus deinen Empfehlungen:\n{"format":"${ACT_FORMAT}","version":1,"tasks":[{"title":"konkrete Aufgabe (max. 12 Wörter)","prio":"hoch|mittel|niedrig","area":"${CATS.join("|")}","dueDays":7,"why":"kurze Begründung","after":null}]}\n„after“ = Nummer einer Aufgabe dieser Liste, die vorher erledigt sein muss (oder null). Preise, Zahlungen, bezahlte Werbung und Verträge nur als Entscheidungsvorschlag an mich formulieren.`;

/* ---------- Wochenbericht (feste Regeln, keine KI) ----------
   Vergleich mit der Vorwoche, 4-Wochen-Trend je Kennzahl, automatisch erkannte wichtige Entwicklungen,
   priorisierte Empfehlungen und Erfolgskontrolle. Trends beschreiben Veränderungen, keine Ursachen. */
const dayMs = (d) => new Date(d + "T12:00").getTime();
/* Trend einer Kennzahl über „days“ Tage: Steigung je Woche (lineare Regression), relativ zum Mittelwert */
function metricTrend(m, end = today(), days = 28) {
  const from = addDays(end, -days);
  const pts = valid(m).filter((e) => e.date > from && e.date <= end);
  if (pts.length < 3) return null;
  const xs = pts.map((e) => dayMs(e.date) / (7 * 864e5)),
    ys = pts.map((e) => e.value);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length,
    my = ys.reduce((a, b) => a + b, 0) / ys.length;
  const den = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
  if (!den) return null;
  const slope = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / den; // je Woche
  const rel = my ? slope / Math.abs(my) : 0;
  const dir = Math.abs(rel) < 0.05 ? "stabil" : slope > 0 ? "steigend" : "fallend";
  return { n: pts.length, slope, rel, dir, first: pts[0], last: pts[pts.length - 1] };
}
/* Wert zu einem Stichtag (letzter gültiger Wert bis dahin) */
const valueAt = (m, d) => valid(m).filter((e) => e.date <= d).pop() || null;
/* Wichtige Entwicklungen automatisch erkennen und nach Bedeutung ordnen */
function keyDevelopments(T = S, end = today()) {
  const out = [];
  for (const m of T.metrics) {
    const def = MT.find((x) => x.k === m.key),
      dir = def ? def.d : "neutral";
    const tr = metricTrend(m, end);
    const now = valueAt(m, end),
      prev = valueAt(m, addDays(end, -7));
    const goal = m.goal !== "" && m.goal != null && Number(m.goal) > 0 ? Number(m.goal) : null;
    if (tr && tr.dir !== "stabil" && dir !== "neutral") {
      const bad = (tr.dir === "fallend") === (dir === "up");
      out.push({ w: Math.abs(tr.rel) * (bad ? 2 : 1), bad, text: `${m.name}: ${tr.dir} über 4 Wochen (${tr.slope > 0 ? "+" : ""}${num(Math.round(tr.slope * 10) / 10)} je Woche, ${tr.n} Werte)` });
    }
    if (goal && now && dir === "up" && now.value < goal * 0.8) out.push({ w: 1 - now.value / goal, bad: true, text: `${m.name}: ${num(now.value)} von Ziel ${num(goal)} (${Math.round((now.value / goal) * 100)} %)` });
    if (now && prev && prev.value && now.date !== prev.date && dir !== "neutral") {
      const p = (now.value - prev.value) / Math.abs(prev.value);
      if (Math.abs(p) >= 0.2) out.push({ w: Math.abs(p), bad: (p < 0) === (dir === "up"), text: `${m.name}: ${p > 0 ? "+" : ""}${Math.round(p * 100)} % gegenüber der Vorwoche` });
    }
  }
  return out.sort((a, b) => b.w - a.w).slice(0, 5);
}
/* Gewicht je Kennzahl nach der Zielrangfolge des Gründers */
const GOAL_WEIGHT = { reg_total: 3, reg_week: 3, active_users: 2, signups: 2, attend: 2, noshow: 1, invites: 1, invite_rate: 1, ig_fol: 1, ig_reach: 1, web: 1 };
const metricOf = (f) => (f.id.startsWith("mt-") ? "signups" : (f.id.match(/^m-(?:go|tr|7|st)-(.+)$/) || [])[1] || null);
const goalPriority = (f) => f.score + (GOAL_WEIGHT[metricOf(f)] || 0) * 6;
function weeklyReport(T = S, end = today()) {
  const start = addDays(end, -6),
    pStart = addDays(end, -13),
    pEnd = addDays(end, -7);
  const inR = (d, a = start, b = end) => d && d >= a && d <= b;
  const dayOf = (ms) => (ms ? new Date(ms).toLocaleDateString("sv-SE") : "");
  const L = liveTasks(T);
  const done = L.filter((x) => x.done && inR(dayOf(x.doneAt)));
  const doneP = L.filter((x) => x.done && inR(dayOf(x.doneAt), pStart, pEnd));
  const overdue = L.filter((x) => !x.done && x.due && x.due < end);
  const P = T.studio ? livePosts(T) : [];
  const pubOf = (a, b) => P.filter((p) => p.status === "veroeffentlicht" && inR(p.date || dayOf(p.publishedAt), a, b));
  const pub = pubOf(start, end),
    pubP = pubOf(pStart, pEnd);
  const next = P.filter((p) => p.date && p.date > end && p.date <= addDays(end, 7) && p.status !== "abgelehnt");
  const ms = L.filter((x) => x.measure);
  const vs = (a, b) => `${a} (Vorwoche ${b}${a === b ? ", gleich" : a > b ? ", mehr" : ", weniger"})`;
  const trends = T.metrics.map((m) => ({ m, t: metricTrend(m, end) })).filter((x) => x.t);
  const K = keyDevelopments(T, end);
  // Reihenfolge nach Bedeutung für die Ziele (Registrierungen vor Meetup-Anmeldungen vor Bekanntheit), je Kennzahl nur ein Eintrag
  const seenM = new Set();
  const F = findings()
    .filter((f) => f.sev >= 1)
    .map((f) => ({ f, w: goalPriority(f) }))
    .sort((a, b) => b.w - a.w)
    .filter(({ f }) => {
      const k = metricOf(f);
      if (!k) return true;
      if (seenM.has(k)) return false;
      seenM.add(k);
      return true;
    })
    .slice(0, 3)
    .map(({ f }) => enrich(f));
  const u = T.meetup;
  const lines = [
    `Wochenbericht ${fmt(start)} – ${fmt(end)}`,
    "",
    "WICHTIGE ENTWICKLUNGEN (automatisch erkannt, keine Ursachen)",
    K.length ? K.map((k) => `- ${k.bad ? "⚠ " : ""}${k.text}`).join("\n") : "- keine auffälligen Veränderungen (zu wenige oder stabile Werte)",
    "",
    "ERLEDIGT",
    `- Aufgaben erledigt: ${vs(done.length, doneP.length)}`,
    done.length ? done.map((x) => "  · " + x.title).join("\n") : null,
    "",
    "INSTAGRAM",
    `- veröffentlicht: ${vs(pub.length, pubP.length)}${pub.length ? " – " + pub.map((p) => p.title).join(", ") : ""}`,
    `- nächste 7 Tage geplant: ${next.length} (davon freigegeben: ${next.filter((p) => p.status === "freigegeben").length})`,
    pub.filter((p) => !p.metrics).length ? `- ohne eingetragene Ergebnisse: ${pub.filter((p) => !p.metrics).length}` : null,
    "",
    "KENNZAHLEN – TREND ÜBER 4 WOCHEN",
    trends.length ? trends.map((x) => `- ${x.m.name}: ${x.t.dir} (${num(x.t.first.value)} → ${num(x.t.last.value)}, ${x.t.n} Werte)`).join("\n") : "- zu wenige Werte für einen Trend (mindestens 3 in 4 Wochen)",
    "",
    "PRIORISIERTE EMPFEHLUNGEN",
    F.length ? F.map((f, i) => `${i + 1}. ${f.title} → ${f.measures[0] ? f.measures[0].t + " (Priorität " + f.measures[0].prio + ", Risiko: " + measureRisk(f.measures[0]) + ")" : f.action}`).join("\n") : "- kein dringender Handlungsbedarf erkannt",
    "",
    "ERFOLGSKONTROLLE MASSNAHMEN (zeitlicher Zusammenhang, kein Ursachenbeweis)",
    ms.length ? ms.slice(0, 5).map((x) => `- ${x.title}: ${x.measure.outcome ? "Ergebnis " + x.measure.outcome : "läuft, Prüfung " + fmt(x.measure.checkAt)} · ${measureLine(x, T)}`).join("\n") : "- keine Maßnahmen gestartet",
    "",
    "OFFEN",
    `- überfällige Aufgaben: ${overdue.length}`,
    `- Entscheidungen für dich: ${decisionsList(T).length}`,
    u && u.date && u.date >= end ? `- nächstes Meetup: ${fmt(u.date)}` : null,
  ].filter((x) => x != null);
  return { start, end, text: lines.join("\n"), n: { done: done.length, doneP: doneP.length, pub: pub.length, pubP: pubP.length, next: next.length, overdue: overdue.length }, key: K, trends: trends.length };
}
async function reportSheet() {
  const r = weeklyReport();
  sheet(`<h1>Wochenbericht</h1><p class="mut">Automatisch aus deinen Daten erstellt (keine KI, keine Ursachenbehauptungen).</p><textarea id="wr" readonly style="min-height:320px">${esc(r.text)}</textarea><div class="row"><button class="p" data-a="wrCopy">Kopieren</button><button data-a="wrSave">Im Gedächtnis ablegen</button><button data-a="close">Schließen</button></div>`);
}

/* ---------- Selbstreparatur Stufe 1 (mit Rückgängig-Punkt und Protokoll) ---------- */
/* Nur eindeutige, verlustfreie Korrekturen: verwaiste Verweise, ungültige Fristen, exakt doppelte Kennzahl-Einträge
   (als gelöscht markiert, nicht entfernt) und Konflikte zu gelöschten Einträgen. */
function findRepairs(T = S) {
  const R = [];
  const tid = new Set(T.tasks.filter((x) => !x.deleted).map((x) => x.id));
  const pid = new Set(T.studio ? T.studio.posts.filter((p) => !p.deleted).map((p) => p.id) : []);
  for (const x of T.tasks) {
    if (x.after && !tid.has(x.after)) R.push({ msg: "Aufgabe „" + x.title.slice(0, 40) + "“: Verweis auf gelöschte Aufgabe entfernt", fix: () => ((x.after = ""), touch(x)) });
    if (x.due && !DATE_RE.test(x.due)) R.push({ msg: "Aufgabe „" + x.title.slice(0, 40) + "“: ungültige Frist entfernt", fix: () => ((x.due = ""), touch(x)) });
    if (x.measure && x.measure.postId && !pid.has(x.measure.postId)) R.push({ msg: "Maßnahme: Verweis auf gelöschten Beitrag entfernt", fix: () => ((x.measure.postId = null), touch(x)) });
  }
  if (T.studio) for (const p of T.studio.posts) if (p.measureTask && !tid.has(p.measureTask)) R.push({ msg: "Beitrag: Verweis auf gelöschte Maßnahme entfernt", fix: () => ((p.measureTask = null), touch(p)) });
  // Exakt doppelte Kennzahl-Einträge (gleiches Datum, Quelle, Wert, Status): der jüngere wird als gelöscht markiert (bleibt erhalten)
  for (const m of T.metrics) {
    const seen = new Map();
    for (const e of m.entries.filter((x) => !x.deleted && x.date).sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0) || String(a.id).localeCompare(String(b.id)))) {
      const k = [e.date, e.src, e.value, e.status].join("|");
      if (seen.has(k)) R.push({ msg: m.name + ": doppelter Eintrag vom " + fmt(e.date) + " zusammengeführt", fix: () => ((e.deleted = true), touch(e)) });
      else seen.set(k, e);
    }
  }
  // Konflikte, deren Eintrag es nicht mehr gibt (z. B. gelöscht): als erledigt markieren
  const exists = (c) => {
    if (c.kind === "fork") return T.memory.some((m) => m.id === c.ref);
    if (c.coll === "tasks") return T.tasks.some((x) => x.id === c.ref && !x.deleted);
    if (c.coll === "posts") return !T.studio || T.studio.posts.some((x) => x.id === c.ref && !x.deleted);
    if (c.coll === "memory") return T.memory.some((x) => x.id === c.ref);
    return true;
  };
  for (const c of T.conflicts || []) if (!c.resolved && c.ref && !exists(c)) R.push({ msg: "Konflikt zu einem gelöschten Eintrag geschlossen", fix: () => ((c.resolved = true), (c.resolvedAt = Date.now()), (c.auto = "Eintrag gelöscht")) });
  return R;
}
async function autoRepair(T = S) {
  const R = findRepairs(T);
  if (!R.length) return { ok: true, n: 0 };
  return act("repair.auto", "auto", async () => {
    if (!(await makeUndoPoint("Automatische Reparatur"))) return { ok: false, error: "Rückgängig-Punkt nicht möglich – nichts verändert" };
    for (const r of R) r.fix();
    logEvent("info", "repair.auto", R.length + " Datenfehler behoben");
    return { ok: true, n: R.length, detail: R.map((r) => r.msg).join("; ").slice(0, 150) };
  });
}
