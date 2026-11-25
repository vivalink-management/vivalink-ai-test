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
${E.length ? `<h2>Entwicklungen</h2><div class="card" id="devs">${E.map((x) => `<div class="row sp" style="padding:3px 0"><span>${esc(x.name)}</span><span><b>${esc(x.now)}</b> <span style="color:${x.good == null ? "var(--mut)" : x.good ? "var(--ok)" : "var(--bad)"}">${x.d > 0 ? "▲" : "▼"} ${x.p != null ? (x.p > 0 ? "+" : "") + x.p + " %" : (x.d > 0 ? "+" : "") + num(x.d)}</span> <span class="mut">${x.span} T.</span></span></div>`).join("")}<div class="mut" style="font-size:12px;margin-top:4px">Veränderung gegenüber dem Wert vor ${E[0].span} bzw. 30 Tagen. Zeigt Entwicklungen, keine Ursachen.</div></div>` : ""}`;
}
