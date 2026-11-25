/* Autonomie: Zyklus (erfassen → analysieren → Aufgaben → Maßnahmen → Entwürfe → Freigaben → ausführen → prüfen),
   widerrufbare Berechtigungen und der Aufgaben-Kanal für geplante KI-Aufgaben.
   Grundsätze: Stufe 3 nie automatisch. Stufe 2 automatisch nur mit einer aktiven, befristeten, begrenzten Berechtigung,
   die der Gründer erteilt und jederzeit widerrufen kann. Jede Handlung steht im Aktionsprotokoll. */

/* ---------- Berechtigungen ---------- */
const GRANTABLE = {
  "post.approve": { n: "Instagram-Beiträge ohne Prüfhinweis automatisch freigeben", cond: "Nur Entwürfe ohne Prüfhinweis mit Termin in den nächsten 7 Tagen; nie Demo-Beiträge." },
  "post.publish": { n: "Freigegebene Beiträge automatisch veröffentlichen", cond: "Wirkt erst, wenn Instagram angebunden ist; nur unverändert freigegebene Beiträge, nie doppelt." },
};
const liveGrants = (T = S) => (T.grants || []).filter((g) => !g.revokedAt && (!g.until || g.until >= today()));
const activeGrant = (name, T = S) => liveGrants(T).find((g) => g.action === name) || null;
function grantUsed(g) {
  const since = g.per === "tag" ? new Date(today() + "T00:00").getTime() : Date.now() - 7 * 864e5;
  return ACTIONS.filter((a) => a.ok && a.by === "auto" && a.at >= since && a.grant === g.id).length + (GRANT_PENDING[g.id] || 0);
}
/* Wird von mayRun für Stufe-2-Handlungen ohne Gründer aufgerufen */
function grantAllows(name) {
  const g = activeGrant(name);
  if (!g) return { ok: false, why: "Stufe 2: braucht deine Freigabe (keine aktive Berechtigung)" };
  if (grantUsed(g) >= g.max) return { ok: false, why: `Berechtigung ausgeschöpft (${g.max} pro ${g.per === "tag" ? "Tag" : "Woche"})` };
  return { ok: true, g };
}
function addGrant(action, until, max, per = "woche", T = S) {
  if (!GRANTABLE[action]) return { ok: false, error: "Diese Handlung kann nicht automatisch erlaubt werden" };
  if (!DATE_RE.test(until || "") || until < today()) return { ok: false, error: "Bitte ein Ablaufdatum in der Zukunft wählen" };
  if (until > addDays(today(), 92)) return { ok: false, error: "Höchstens 3 Monate – danach bewusst verlängern" };
  for (const g of liveGrants(T).filter((x) => x.action === action)) (g.revokedAt = Date.now()), touch(g); // ersetzt eine bestehende
  const g = { id: uid(), action, until, max: Math.max(1, Math.min(50, Math.round(Number(max) || 1))), per: per === "tag" ? "tag" : "woche", note: "", createdAt: Date.now(), revokedAt: null };
  touch(g);
  T.grants.push(g);
  return { ok: true, g, detail: `${GRANTABLE[action].n} bis ${fmt(until)}, max. ${g.max}/${g.per}` };
}
function revokeGrant(id, T = S) {
  const g = (T.grants || []).find((x) => x.id === id);
  if (!g || g.revokedAt) return { ok: false, error: "Nicht aktiv" };
  g.revokedAt = Date.now();
  touch(g);
  return { ok: true, detail: "Widerrufen: " + GRANTABLE[g.action].n };
}
/* Vorschlag an den Gründer (unter „Entscheidungen für dich“), wenn er oft dasselbe manuell freigibt */
function pendingGrants(T = S) {
  if ((T.grants || []).some((g) => g.action === "post.approve")) return [];
  const n = ACTIONS.filter((a) => a.name === "post.approve" && a.by === "gruender" && a.ok && a.at > Date.now() - 30 * 864e5).length;
  return n >= 4 ? [{ title: "Automatische Freigabe erlauben?", why: `Du hast in 30 Tagen ${n}-mal Beiträge freigegeben. Eine befristete, jederzeit widerrufbare Berechtigung für Beiträge ohne Prüfhinweis spart Zeit.` }] : [];
}

/* ---------- Zyklus ---------- */
const CYCLE = [
  ["erfassen", "Daten erfassen"],
  ["analysieren", "Analysieren"],
  ["aufgaben", "Aufgaben erkennen"],
  ["massnahmen", "Maßnahmen entwickeln"],
  ["entwuerfe", "Entwürfe erstellen"],
  ["freigaben", "Freigaben einholen"],
  ["ausfuehren", "Freigegebenes ausführen"],
  ["pruefen", "Ergebnisse prüfen"],
];
let CYCLE_BUSY = null;
/* Nie zwei Durchläufe gleichzeitig (z. B. Start und Wiederöffnen): der zweite wartet auf den ersten */
async function runCycle(reason = "start", T = S) {
  while (CYCLE_BUSY) await CYCLE_BUSY.catch(() => {});
  CYCLE_BUSY = cycleOnce(reason, T);
  try {
    return await CYCLE_BUSY;
  } finally {
    CYCLE_BUSY = null;
  }
}
async function cycleOnce(reason, T) {
  const rep = { at: Date.now(), reason, steps: [] };
  const step = (k, n, note) => rep.steps.push({ k, n, note });
  const t = today();
  // 1. Daten: lokal, optional Synchronisierung und Verwaltung (je nach Anbindung)
  // Eindeutige Datenfehler selbst beheben (Stufe 1: mit Rückgängig-Punkt und Protokoll)
  const rp = await autoRepair(T);
  const tk = await taskAuto();
  step("erfassen", rp.n || null, [syncUrl() ? "Synchronisierung angebunden" : "Synchronisierung nicht angebunden", window.VL_KPI_URL ? "Verwaltung angebunden" : "Kennzahlen manuell", rp.n ? rp.n + " Datenfehler behoben" : null, tk].filter(Boolean).join(" · "));
  // 2. Analyse (Regelmotor)
  const F = findings();
  step("analysieren", F.length, F.filter((f) => f.sev >= 2).length + " davon dringend");
  // 3. Aufgaben
  const td = todayList(T);
  step("aufgaben", td.length, td.length ? "unter „Heute zu tun“" : "nichts Dringendes");
  // 4. Maßnahmen (nur Vorschläge – Start bleibt Stufe 2)
  const ms = F.filter((f) => f.sev >= 1).reduce((n, f) => n + enrich(f).measures.length, 0);
  step("massnahmen", ms, "vorgeschlagen – Start nur nach deiner Freigabe");
  // 5. Entwürfe aus bestätigten Fakten (Stufe 0)
  // nur protokollieren, wenn tatsächlich ein Anlass besteht (kein Protokoll-Rauschen bei jedem Start)
  const d = autoDrafts(T).length
    ? await act("studio.autoDraft", "auto", () => {
        const made = runAutomations(T);
        return { ok: true, made, detail: made.length + " Entwurf/Entwürfe" };
      })
    : { made: [] };
  step("entwuerfe", (d.made || []).length, (d.made || []).map((p) => p.title).join(", ") || "keine neuen Anlässe");
  // 6. Freigaben: automatisch nur mit aktiver Berechtigung, sonst warten sie auf dich
  let auto = 0;
  if (activeGrant("post.approve", T))
    for (const p of livePosts(T).filter((x) => x.status === "entwurf" && !x.demo && x.date && x.date >= t && x.date <= addDays(t, 7))) {
      checkPost(p, T);
      if (p.warnings.length) continue;
      const r = await act("post.approve", "auto", () => (approvePost(p), { ok: true, detail: p.title }));
      if (!r.ok) break;
      auto++;
    }
  const waiting = livePosts(T).filter((p) => p.status === "entwurf" && p.date && p.date >= t).length;
  step("freigaben", auto, (auto ? auto + " automatisch freigegeben (Berechtigung) · " : "") + waiting + " warten auf deine Freigabe");
  // 7. Ausführen: Veröffentlichung ist noch nicht angebunden → als fällig melden
  const due = livePosts(T).filter((p) => p.status === "freigegeben" && p.date && p.date <= t).length;
  step("ausfuehren", due, due ? "fällig – bitte teilen (Instagram noch nicht angebunden)" : "nichts fällig");
  // 8. Prüfen: Maßnahmen mit erreichtem Prüftermin
  const rev = T.tasks.filter((x) => x.measure && !x.deleted && !x.measure.outcome && x.measure.checkAt <= t).length;
  step("pruefen", rev, rev ? "Maßnahmen auswerten" : "nichts offen");
  // Wochenbericht einmal je Woche ablegen (die letzten 8)
  const wk = weekKey(t);
  const reps = (await kvGet("reports")) || [];
  if (!reps.some((r) => r.wk === wk)) {
    const w = weeklyReport(T);
    await kvPut("reports", [{ wk, at: Date.now(), text: w.text }, ...reps].slice(0, 8));
  }
  await kvPut("cycle-last", rep);
  return rep;
}

/* ---------- Aufgaben-Postfach für geplante Claude-Aufgaben ----------
   Die App legt einen Auftrag im Postfach „out“ ab:
   - Instagram: freie Termine der nächsten 14 Tage, Regeln, nur öffentliche Fakten
   - Wochenanalyse: Wochenbericht, zusammengefasste Kennzahlen, Aufgaben, Befunde (ohne vertrauliche Einträge, ohne Personendaten)
   Die geplante Claude-Aufgabe holt ihn (scripts/ki-aufgabe.mjs), schreibt Entwürfe, Analyse und Aufgabenvorschläge und
   legt das Ergebnis im Postfach „in“ ab. Die App übernimmt Beiträge nur als Entwürfe, die Analyse als Einschätzung und
   Aufgaben nur als Vorschläge, die du bestätigst.
   Zugang: zufälliges Token (256 Bit). In der App gespeichert; in der Claude-Umgebung als geschützter Netzwerkschlüssel,
   den der Proxy einsetzt – die Claude-Sitzung sieht es nie. Das Token öffnet nur diese beiden Postfächer, nie den Daten-Tresor. */
const TASK_FORMAT = "vivalink-task",
  TASK_RESULT = "vivalink-task-result";
const taskCfg = async () => {
  const c = await kvGet("task-config");
  return c && /^[0-9a-f]{64}$/.test(c.token || "") ? c : null; // ältere Entwurfs-Konfiguration ohne Token wird ignoriert
};
function taskHttp(base, token) {
  const u = (box) => base.replace(/\/$/, "") + "/v1/task/" + box;
  const h = (x) => ({ "x-vl-task-token": token, ...(x || {}) });
  return {
    async get(box) {
      const r = await fetch(u(box), { headers: h(), cache: "no-store" });
      if (r.status === 404) return null;
      if (!r.ok) throw Object.assign(new Error("Server " + r.status), { status: r.status });
      return r.json();
    },
    async put(box, body, expected) {
      const r = await fetch(u(box), { method: "PUT", headers: h({ "content-type": "application/json" }), body: JSON.stringify({ body, expected }) });
      if (r.status === 409) return { conflict: true, ...(await r.json()) };
      if (!r.ok) throw Object.assign(new Error("Server " + r.status), { status: r.status });
      return r.json();
    },
    async del(box) {
      await fetch(u(box), { method: "DELETE", headers: h() });
    },
  };
}
async function taskSetup() {
  const token = hexOfBytes(rnd(32));
  await kvPut("task-config", { token, since: Date.now(), lastOut: 0, lastIn: 0, done: [] });
  return { ok: true, token, detail: "Aufgaben-Postfach eingerichtet" };
}
/* Wochenanalyse-Auftrag aus dem vorhandenen Arbeitsauftrag „Wochenplan“ (ohne vertrauliche Einträge) */
function analysisPrompt() {
  const keep = ai;
  ai = { k: "week", extra: "", compact: false, tasks: true, priv: false, cats: [...TC.week] };
  try {
    return buildPrompt();
  } finally {
    ai = keep;
  }
}
function taskPackage(T = S) {
  const pub = { ...T, memory: T.memory.filter((m) => m.cat !== "Geschäftsmodell") };
  const ym = today().slice(0, 7);
  const lim = addDays(today(), 14);
  const slots = planSlots(ym, pub)
    .concat(planSlots(nextMonth(ym), pub))
    .filter((s) => s.date <= lim);
  return {
    format: TASK_FORMAT,
    version: 2,
    id: uid(),
    createdAt: new Date().toISOString(),
    studio: { slots, prompt: slots.length ? studioPrompt(ym, pub, slots) : "", answerFormat: PLAN_FORMAT },
    analyse: { report: weeklyReport(T).text, prompt: analysisPrompt(), answerFormat: ACT_FORMAT },
  };
}
async function taskPublish(api = null) {
  const c = await taskCfg();
  if (!c) return { ok: false, error: "Aufgaben-Postfach nicht eingerichtet" };
  const A = api || taskHttp(syncUrl(), c.token);
  const pkg = taskPackage();
  for (let i = 0; i < 3; i++) {
    const cur = await A.get("out");
    const r = await A.put("out", JSON.stringify(pkg), cur ? cur.version : 0);
    if (r.conflict) continue;
    c.lastOut = Date.now();
    await kvPut("task-config", c);
    return { ok: true, n: pkg.studio.slots.length, id: pkg.id, detail: "Auftrag bereitgestellt (" + pkg.studio.slots.length + " Termine, Wochenanalyse)" };
  }
  return { ok: false, error: "Postfach belegt – später erneut" };
}
let PROPOSALS = [];
const loadProposals = async () => (PROPOSALS = (await kvGet("proposals")) || []);
async function taskFetch(api = null) {
  const c = await taskCfg();
  if (!c) return { ok: false, error: "Aufgaben-Postfach nicht eingerichtet" };
  const A = api || taskHttp(syncUrl(), c.token);
  const cur = await A.get("in");
  if (!cur) return { ok: true, added: 0, detail: "keine Ergebnisse" };
  let o;
  try {
    o = JSON.parse(cur.body);
  } catch (e) {
    return { ok: false, error: "Ergebnis nicht lesbar – nichts übernommen" };
  }
  if (!o || o.format !== TASK_RESULT || !isId(o.id)) return { ok: false, error: "Unbekanntes Ergebnisformat – nichts übernommen" };
  if ((c.done || []).includes(o.id)) return { ok: true, added: 0, detail: "bereits übernommen" };
  const rep = { added: 0, warned: 0, analysis: false, proposals: 0 };
  if (o.posts) {
    const r = importPlan(typeof o.posts === "string" ? o.posts : JSON.stringify(o.posts), S, "ki-aufgabe");
    if (r.ok) (rep.added = r.added.length), (rep.warned = r.warned);
  }
  const an = o.analysis && typeof o.analysis === "object" ? o.analysis : null;
  if (an && typeof an.text === "string" && an.text.trim()) {
    const title = "KI-Wochenanalyse " + fmt(today());
    if (!S.memory.some((m) => m.active && m.title === title)) {
      const n = { id: uid(), cat: "Ziele", title, text: an.text.trim().slice(0, 8000), status: "estimate", date: today(), reason: "Geplante Claude-Aufgabe – Einschätzung, bitte prüfen", result: "", private: false, active: true, createdAt: Date.now(), dev: S.dev, src: "ki-aufgabe" };
      touch(n);
      S.memory.push(n);
      rep.analysis = true;
    }
  }
  if (an && an.actions) {
    const pa = parseActions(typeof an.actions === "string" ? an.actions : JSON.stringify(an.actions));
    if (pa.ok && pa.items.length) {
      PROPOSALS = [{ id: o.id, at: Date.now(), items: pa.items }, ...PROPOSALS.filter((p) => p.id !== o.id)].slice(0, 5);
      await kvPut("proposals", PROPOSALS);
      rep.proposals = pa.items.length;
    }
  }
  c.done = [...(c.done || []), o.id].slice(-50);
  c.lastIn = Date.now();
  await kvPut("task-config", c);
  await save();
  await A.del("in").catch(() => {});
  return { ok: true, ...rep, detail: `${rep.added} Entwürfe${rep.analysis ? ", Wochenanalyse" : ""}${rep.proposals ? ", " + rep.proposals + " Aufgabenvorschläge" : ""} übernommen` };
}
/* Im Zyklus: Ergebnisse abholen (Stufe 0), Auftrag höchstens alle 20 Stunden erneuern (Stufe 1) */
async function taskAuto() {
  const c = await taskCfg();
  if (!c || !syncUrl() || navigator.onLine === false) return null;
  const out = [];
  try {
    const f = await act("task.fetch", "auto", () => taskFetch());
    if (f.ok && (f.added || f.analysis || f.proposals)) out.push(f.detail);
    if (Date.now() - (c.lastOut || 0) > 20 * 3600e3) {
      const p = await act("task.publish", "auto", () => taskPublish());
      if (p.ok) out.push("Auftrag erneuert");
    }
  } catch (e) {
    logEvent("warn", "task.auto", e.message);
  }
  return out.join(" · ") || null;
}

/* ---------- Oberfläche („Mehr › Autonomie“) ---------- */
async function autonomySheet(extra = "") {
  const last = await kvGet("cycle-last"),
    tc = await taskCfg();
  const G = liveGrants();
  const lvl = (k) => (POLICY[k] ? POLICY[k].lvl : 3);
  sheet(`<h1>Autonomie</h1><p class="mut">Die App arbeitet in einem festen Ablauf. Was sie selbst darf, regeln Stufen und deine Berechtigungen. Geschäftliche und strategische Entscheidungen bleiben immer bei dir.</p>${extra}
<h2>Ablauf</h2><div class="card" id="cycle">${
    last
      ? CYCLE.map(([k, n], i) => {
          const s = last.steps.find((x) => x.k === k) || {};
          return `<div class="row sp" style="padding:3px 0;flex-wrap:nowrap"><span>${i + 1}. ${n}</span><span class="mut" style="text-align:right">${s.n != null ? "<b>" + esc(s.n) + "</b> · " : ""}${esc(s.note || "")}</span></div>`;
        }).join("") + `<div class="mut" style="margin-top:4px">Zuletzt: ${new Date(last.at).toLocaleString("de-DE")}</div>`
      : '<div class="mut">Noch nicht gelaufen.</div>'
  }<button class="s" data-a="auCycle" style="margin-top:6px">Jetzt durchlaufen</button></div>
<h2>Berechtigungen</h2><div class="card">${
    G.length
      ? G.map((g) => `<div class="row sp" style="flex-wrap:nowrap"><div><b>${esc(GRANTABLE[g.action].n)}</b><div class="mut">bis ${fmt(g.until)} · höchstens ${g.max} pro ${g.per === "tag" ? "Tag" : "Woche"} · bisher ${grantUsed(g)} genutzt</div></div><button class="s" data-a="auRevoke" data-id="${esc(g.id)}">Widerrufen</button></div>`).join("")
      : '<div class="mut">Keine aktiven Berechtigungen. Alles mit Stufe 2 wartet auf deine Freigabe.</div>'
  }
<details style="margin-top:8px"><summary>Neue Berechtigung erteilen</summary><label>Handlung</label><select id="au-act">${Object.keys(GRANTABLE).map((k) => `<option value="${k}">${esc(GRANTABLE[k].n)}</option>`).join("")}</select><div class="mut" id="au-cond">${esc(GRANTABLE["post.approve"].cond)}</div>
<div class="row"><div style="flex:1"><label>Gültig bis</label><input type="date" id="au-until" value="${addDays(today(), 30)}"></div><div style="flex:1"><label>Höchstens</label><input id="au-max" inputmode="numeric" value="3"></div><div style="flex:1"><label>pro</label><select id="au-per"><option value="woche">Woche</option><option value="tag">Tag</option></select></div></div><button class="p" data-a="auGrant">Berechtigung erteilen</button></details></div>
<h2>Stufen</h2><div class="card">${Object.keys(POLICY)
    .sort((a, b) => lvl(a) - lvl(b))
    .map((k) => `<div class="row sp" style="flex-wrap:nowrap"><span>${esc(POLICY[k].n)}</span><span class="chip">${LVL[lvl(k)]}${activeGrant(k) ? " · Berechtigung aktiv" : ""}</span></div>`)
    .join("")}</div>
<h2>Geplante KI-Aufgaben</h2><div class="card">${
    !syncUrl()
      ? '<div class="mut">Vorbereitet. Braucht den Synchronisierungs-Server (Entscheidung offen). Bis dahin: Monatsplan im Studio per „Auftrag kopieren“.</div>'
      : tc
        ? `<div class="mut">Eingerichtet seit ${new Date(tc.since).toLocaleDateString("de-DE")} · Auftrag zuletzt bereitgestellt: ${tc.lastOut ? new Date(tc.lastOut).toLocaleString("de-DE") : "nie"} · Ergebnisse zuletzt übernommen: ${tc.lastIn ? new Date(tc.lastIn).toLocaleString("de-DE") : "nie"}</div><div class="row" style="margin-top:6px"><button class="s" data-a="auTaskOut">Auftrag bereitstellen</button><button class="s" data-a="auTaskIn">Ergebnisse abholen</button></div>`
        : '<div class="mut">Wöchentlich: Instagram-Entwürfe, Wochenanalyse und Aufgabenvorschläge durch eine geplante Claude-Aufgabe (im Pro-Abo). Ein eigener Schlüssel öffnet nur das Auftrags-Postfach, nie deine Daten. Ergebnisse kommen nur als Entwürfe und Vorschläge.</div><button class="s" data-a="auTaskSetup" style="margin-top:6px">Einrichten</button>'
  }</div><button data-a="close">Schließen</button>`);
}
async function autonomyAction(a, id) {
  if (a === "auto") return autonomySheet();
  if (a === "auCycle") {
    await runCycle("manuell");
    await save();
    render();
    return autonomySheet();
  }
  if (a === "auGrant") {
    const r = await act("grant.manage", "gruender", () => addGrant(val("au-act"), val("au-until"), val("au-max"), val("au-per")));
    if (!r.ok) return toast(r.error);
    await save();
    toast("Berechtigung erteilt – jederzeit widerrufbar");
    return autonomySheet();
  }
  if (a === "auRevoke") {
    const r = await act("grant.manage", "gruender", () => revokeGrant(id));
    if (!r.ok) return toast(r.error);
    await save();
    toast("Berechtigung widerrufen");
    return autonomySheet();
  }
  if (a === "auTaskSetup") {
    const r = await act("task.setup", "gruender", () => taskSetup());
    await act("task.publish", "auto", () => taskPublish()).catch(() => null);
    return autonomySheet(`<div class="card rec warn"><b>Aufgaben-Schlüssel</b><p>Nur jetzt sichtbar. Kopiere ihn und füge ihn in Claude in das sichere Formular „Netzwerkschlüssel“ ein, wenn Claude danach fragt. Nicht in den Chat einfügen. Er öffnet nur das Auftrags-Postfach.</p><textarea readonly id="auTk" rows="2" style="font-family:ui-monospace,monospace;font-size:15px;min-height:0;resize:none">${esc(r.token)}</textarea><button class="s" data-a="auTkCopy">Kopieren</button></div>`);
  }
  if (a === "auTkCopy") {
    try {
      await navigator.clipboard.writeText(val("auTk"));
      return toast("Kopiert – jetzt in das sichere Formular einfügen");
    } catch (e) {
      $("#auTk").select();
      return toast("Markiert. Bitte manuell kopieren.");
    }
  }
  if (a === "auTaskOut") {
    const r = await act("task.publish", "auto", () => taskPublish());
    toast(r.ok ? r.detail : r.error);
    return autonomySheet();
  }
  if (a === "auTaskIn") {
    const r = await act("task.fetch", "auto", () => taskFetch());
    toast(r.ok ? r.detail + (r.warned ? ` · ${r.warned} mit Prüfhinweis` : "") : r.error);
    render();
    return autonomySheet();
  }
}
document.addEventListener("change", (e) => {
  if (e.target && e.target.id === "au-act" && $("#au-cond")) $("#au-cond").textContent = GRANTABLE[e.target.value].cond;
});
