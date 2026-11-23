/* Daten: Migration, Eingangsprüfung, Zusammenführen mit Konflikterkennung, Backup-Format, Integrität */

function migrate(T = S) {
  let ch = false;
  if (!Array.isArray(T.memory)) (T.memory = []), (ch = true);
  if (!Array.isArray(T.tasks)) (T.tasks = []), (ch = true);
  if (!T.dev) (T.dev = uid()), (ch = true);
  if (!T.metrics) (T.metrics = []), (ch = true);
  if (!T.suggest) (T.suggest = {}), (ch = true);
  if (!Array.isArray(T.conflicts)) (T.conflicts = []), (ch = true);
  for (const t of MT) {
    if (!T.metrics.some((m) => m.id === "m_" + t.k)) {
      // Keine Unternehmenswerte im Programmcode: Kennzahlen starten immer leer.
      T.metrics.push({ id: "m_" + t.k, key: t.k, name: t.n, unit: t.u, dir: t.d, goal: "", entries: [], updatedAt: Date.now() });
      ch = true;
    }
  }
  if (!T.meetup) (T.meetup = { date: "", place: "", goal: "", note: "", updatedAt: 0 }), (ch = true);
  if (T.v !== SCHEMA) (T.v = SCHEMA), (ch = true);
  return ch;
}

/* ---------- Eingangsprüfung für Backups (schützt vor beschädigten oder manipulierten Daten) ---------- */
const ID_RE = /^[A-Za-z0-9_-]{1,80}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isId = (x) => typeof x === "string" && ID_RE.test(x);
const str = (x, n = 200000) => (x == null ? "" : String(x).slice(0, n));
const optDate = (x) => (typeof x === "string" && (x === "" || DATE_RE.test(x)) ? x : "");
const optNum = (x) => (typeof x === "number" && isFinite(x) ? x : undefined);
const revList = (x) => (Array.isArray(x) ? x.filter((n) => typeof n === "number" && isFinite(n)).slice(-30) : undefined);

function cleanMemory(r) {
  if (!r || typeof r !== "object" || !isId(r.id)) return null;
  const o = { ...r };
  o.cat = str(r.cat, 60);
  o.title = str(r.title, 500);
  o.text = str(r.text);
  o.reason = str(r.reason);
  o.result = str(r.result);
  o.status = STL[r.status] ? r.status : "unknown";
  o.date = optDate(r.date);
  o.active = r.active !== false;
  o.private = !!r.private;
  o.createdAt = optNum(r.createdAt) || 0;
  o.updatedAt = optNum(r.updatedAt) || 0;
  o.revs = revList(r.revs);
  for (const k of ["supersedes", "supersededBy"]) if (r[k] != null && !isId(r[k])) delete o[k];
  if (r.changeReason != null) o.changeReason = str(r.changeReason);
  return o;
}
function cleanTask(r) {
  if (!r || typeof r !== "object" || !isId(r.id)) return null;
  const o = { ...r };
  o.title = str(r.title, 500);
  o.prio = PR[r.prio] != null ? r.prio : "mittel";
  o.area = str(r.area, 60);
  o.due = optDate(r.due);
  o.done = !!r.done;
  o.doneAt = optNum(r.doneAt) || null;
  o.updatedAt = optNum(r.updatedAt) || 0;
  o.revs = revList(r.revs);
  if (r.fid != null) o.fid = str(r.fid, 80);
  if (r.src != null) o.src = str(r.src, 40);
  return o;
}
function cleanEntry(e) {
  if (!e || typeof e !== "object" || !isId(e.id)) return null;
  const v = Number(e.value);
  if (!isFinite(v)) return null;
  return {
    ...e,
    value: v,
    date: optDate(e.date),
    status: VS[e.status] ? e.status : "estimate",
    src: str(e.src || "manual", 40),
    note: str(e.note, 2000),
    deleted: !!e.deleted,
    updatedAt: optNum(e.updatedAt) || 0,
    revs: revList(e.revs),
  };
}
function cleanMetric(r) {
  if (!r || typeof r !== "object" || !isId(r.id)) return null;
  const entries = [];
  let bad = 0;
  for (const e of Array.isArray(r.entries) ? r.entries : []) {
    const c = cleanEntry(e);
    c ? entries.push(c) : bad++;
  }
  const o = {
    ...r,
    key: str(r.key, 40),
    name: str(r.name, 120),
    unit: str(r.unit, 10),
    dir: ["up", "down", "neutral"].includes(r.dir) ? r.dir : "neutral",
    goal: r.goal == null ? "" : str(r.goal, 30),
    entries,
    updatedAt: optNum(r.updatedAt) || 0,
  };
  o.goalAt = optNum(r.goalAt);
  o.goalRevs = revList(r.goalRevs);
  return { m: o, bad };
}
function cleanMeetup(r) {
  if (!r || typeof r !== "object") return null;
  return {
    date: optDate(r.date),
    place: str(r.place, 200),
    goal: r.goal == null ? "" : str(r.goal, 30),
    note: str(r.note),
    updatedAt: optNum(r.updatedAt) || 0,
    revs: revList(r.revs),
  };
}

/* Erkennt das Format: eigenes Backup-Format (ab 2.1), alte Rohdaten (Version 1/2) oder Kennzahlen-Import. */
function parseBackup(text) {
  let j;
  try {
    j = JSON.parse(String(text || "").trim());
  } catch (e) {
    return { ok: false, error: "Kein gültiges Backup (Text unvollständig oder beschädigt)" };
  }
  if (!j || typeof j !== "object") return { ok: false, error: "Kein gültiges Backup" };
  if (Array.isArray(j.values)) return { ok: true, kind: "values", values: j.values };
  let env = null,
    data = j;
  if (j.format === "vivalink-backup") {
    env = j;
    data = j.data;
  }
  if (!data || !Array.isArray(data.memory) || !Array.isArray(data.tasks))
    return { ok: false, error: "Kein gültiges Backup (Gedächtnis oder Aufgaben fehlen)" };
  return { ok: true, kind: "state", env, data, aitest: env && Array.isArray(env.aitest) ? env.aitest : null, schema: (env && env.schema) || data.v || 1 };
}

function cleanIncoming(data, aitest) {
  const out = { memory: [], tasks: [], metrics: [], meetup: null, suggest: {}, aitest: [], skipped: 0 };
  for (const r of data.memory) {
    const c = cleanMemory(r);
    c ? out.memory.push(c) : out.skipped++;
  }
  for (const r of data.tasks) {
    const c = cleanTask(r);
    c ? out.tasks.push(c) : out.skipped++;
  }
  for (const r of Array.isArray(data.metrics) ? data.metrics : []) {
    const c = cleanMetric(r);
    if (!c) {
      out.skipped++;
      continue;
    }
    out.skipped += c.bad;
    out.metrics.push(c.m);
  }
  out.meetup = cleanMeetup(data.meetup);
  if (data.suggest && typeof data.suggest === "object")
    for (const k in data.suggest) {
      const s = data.suggest[k];
      if (/^[A-Za-z0-9_-]{1,80}$/.test(k) && s && typeof s === "object")
        out.suggest[k] = { until: optDate(s.until), mode: s.mode === "nope" ? "nope" : "later", at: optNum(s.at) || 0 };
    }
  for (const x of Array.isArray(aitest) ? aitest : []) {
    if (x && isId(x.id)) out.aitest.push(x);
    else out.skipped++;
  }
  return out;
}

/* ---------- Zusammenführen ---------- */
const META = ["updatedAt", "revs"];
/* Vergleich des Inhalts: leere Werte (fehlend, null, false, "") gelten als gleich,
   damit ein unverändertes Backup nie als Konflikt erscheint. */
const same = (a, b, ignore = []) => {
  const strip = (o) => {
    const c = { ...o };
    for (const k of META.concat(ignore)) delete c[k];
    for (const k of Object.keys(c)) if (c[k] == null || c[k] === false || c[k] === "") delete c[k];
    return JSON.stringify(Object.keys(c).sort().map((k) => [k, c[k]]));
  };
  return strip(a) === strip(b);
};
/* Liefert: "same" | "keep" (lokal neuer) | "take" (Import neuer, reine Weiterentwicklung)
   | "conflict-local" / "conflict-take" (beide unabhängig geändert; Gewinner = neuerer Stand). */
function compareRec(loc, inc, ignore = []) {
  if (same(loc, inc, ignore)) return "same";
  const lu = loc.updatedAt || 0,
    iu = inc.updatedAt || 0;
  const incNewer = iu > lu;
  const newer = incNewer ? inc : loc,
    older = incNewer ? loc : inc;
  const ff = (older.updatedAt || 0) === 0 || (newer.revs || []).includes(older.updatedAt);
  if (ff) return incNewer ? "take" : "keep";
  return incNewer ? "conflict-take" : "conflict-local";
}
const summary = (coll, r) =>
  coll === "metric-entry"
    ? { value: r.value, date: r.date, status: r.status, deleted: !!r.deleted }
    : coll === "metric-goal"
      ? { goal: r.goal }
      : coll === "meetup"
        ? { date: r.date, place: r.place, goal: r.goal }
        : { title: r.title };
function addConflict(T, rep, c) {
  const key = c.coll + ":" + c.ref + ":" + (c.other.updatedAt || c.other.goalAt || 0);
  if (T.conflicts.some((x) => x.key === key)) return;
  T.conflicts.push({ id: uid(), key, at: Date.now(), resolved: false, ...c });
  rep.conflicts++;
}

function mergeList(T, list, coll, incList, rep, ignore = []) {
  for (const r of incList) {
    const i = list.findIndex((x) => x.id === r.id);
    if (i < 0) {
      list.push(r);
      rep.added++;
      continue;
    }
    const loc = list[i],
      res = compareRec(loc, r, ignore);
    if (res === "same") continue;
    if (res === "take") {
      list[i] = r;
      rep.updated++;
    } else if (res === "conflict-take" || res === "conflict-local") {
      const win = res === "conflict-take" ? r : loc,
        lose = res === "conflict-take" ? loc : r;
      if (res === "conflict-take") list[i] = r;
      addConflict(T, rep, { kind: "record", coll, ref: r.id, mid: rep.mid, kept: clone(win), other: clone(lose) });
      if (res === "conflict-take") rep.updated++;
    }
  }
}

/* Führt einen geprüften Import in T zusammen (T = S oder eine Kopie für die Vorschau). */
function mergeInto(T, inc) {
  const rep = { added: 0, updated: 0, conflicts: 0, skipped: inc.skipped || 0, forks: 0 };
  // Gedächtnis: Inhalt vergleichen; active/supersededBy werden über die Verzweigungserkennung behandelt.
  for (const r of inc.memory) {
    const i = T.memory.findIndex((x) => x.id === r.id);
    if (i < 0) {
      T.memory.push(r);
      rep.added++;
      continue;
    }
    const loc = T.memory[i];
    const res = compareRec(loc, r, ["active", "supersededBy"]);
    if (res === "same") {
      // Gleicher Inhalt: Ersetzungsstatus von beiden Seiten übernehmen (ersetzt bleibt ersetzt).
      if (loc.active !== r.active || loc.supersededBy !== r.supersededBy) {
        const sb = loc.supersededBy || r.supersededBy;
        const changed = loc.active !== (loc.active && r.active) || loc.supersededBy !== sb;
        loc.active = loc.active && r.active;
        loc.supersededBy = sb;
        if (!loc.supersededBy) delete loc.supersededBy;
        loc.updatedAt = Math.max(loc.updatedAt || 0, r.updatedAt || 0);
        if (changed) rep.updated++;
      }
      continue;
    }
    mergeList(T, T.memory, "memory", [r], rep, ["active", "supersededBy"]);
  }
  mergeList(T, T.tasks, "tasks", inc.tasks, rep);
  for (const r of inc.metrics) {
    const m = T.metrics.find((x) => x.id === r.id);
    if (!m) {
      T.metrics.push(r);
      rep.added++;
      continue;
    }
    rep.mid = m.id;
    mergeList(T, m.entries, "metric-entry", r.entries, rep);
    rep.mid = undefined;
    // Ziel getrennt versioniert (goalAt / goalRevs)
    const lg = { goal: m.goal, updatedAt: m.goalAt || (m.goal !== "" && m.goal != null ? m.updatedAt || 0 : 0), revs: m.goalRevs },
      ig = { goal: r.goal, updatedAt: r.goalAt || (r.goal !== "" && r.goal != null ? r.updatedAt || 0 : 0), revs: r.goalRevs };
    const res = compareRec(lg, ig);
    if (res === "take" || res === "conflict-take") {
      if (res === "conflict-take") addConflict(T, rep, { kind: "record", coll: "metric-goal", ref: m.id, kept: { goal: ig.goal, updatedAt: ig.updatedAt }, other: { goal: lg.goal, updatedAt: lg.updatedAt } });
      m.goal = ig.goal;
      m.goalAt = ig.updatedAt;
      m.goalRevs = [...new Set([...(lg.revs || []), ...(ig.revs || []), lg.updatedAt].filter(Boolean))].slice(-30);
      rep.updated++;
    } else if (res === "conflict-local")
      addConflict(T, rep, { kind: "record", coll: "metric-goal", ref: m.id, kept: { goal: lg.goal, updatedAt: lg.updatedAt }, other: { goal: ig.goal, updatedAt: ig.updatedAt } });
    m.updatedAt = Math.max(m.updatedAt || 0, r.updatedAt || 0);
  }
  if (inc.meetup) {
    const loc = T.meetup,
      res = compareRec(loc, inc.meetup);
    if (res === "take") (T.meetup = inc.meetup), rep.updated++;
    else if (res === "conflict-take" || res === "conflict-local") {
      const take = res === "conflict-take";
      addConflict(T, rep, { kind: "record", coll: "meetup", ref: "meetup", kept: clone(take ? inc.meetup : loc), other: clone(take ? loc : inc.meetup) });
      if (take) (T.meetup = inc.meetup), rep.updated++;
    }
  }
  for (const k in inc.suggest) {
    const r = inc.suggest[k];
    if (!T.suggest[k] || (r.at || 0) > (T.suggest[k].at || 0)) T.suggest[k] = r;
  }
  rep.forks = detectForks(T, rep);
  return rep;
}

/* Verzweigung: derselbe Eintrag wurde auf zwei Geräten unterschiedlich geändert → mehrere Nachfolger. */
function detectForks(T, rep) {
  let n = 0;
  const kids = {};
  for (const m of T.memory) if (m.supersedes) (kids[m.supersedes] = kids[m.supersedes] || []).push(m);
  for (const pid in kids) {
    const ks = kids[pid].filter((m) => m.active);
    if (kids[pid].length < 2 || ks.length < 2) continue;
    const key = "fork:" + pid + ":" + ks.map((k) => k.id).sort().join(",");
    if (T.conflicts.some((x) => x.key === key)) continue;
    T.conflicts.push({ id: uid(), key, kind: "fork", coll: "memory", ref: pid, options: ks.map((k) => k.id), at: Date.now(), resolved: false });
    n++;
    if (rep) rep.conflicts++;
  }
  return n;
}

function resolveConflict(id, choice) {
  const c = S.conflicts.find((x) => x.id === id);
  if (!c || c.resolved) return false;
  if (c.kind === "fork") {
    const parent = S.memory.find((m) => m.id === c.ref);
    if (choice !== "both") {
      if (!c.options.includes(choice)) return false;
      for (const oid of c.options) {
        const m = S.memory.find((x) => x.id === oid);
        if (!m) continue;
        m.active = oid === choice;
        if (oid !== choice) m.discarded = "Konflikt " + new Date().toLocaleDateString("de-DE");
        touch(m);
      }
      if (parent) (parent.supersededBy = choice), touch(parent);
    }
  } else if (choice === "other") {
    // Die gewählte Version wird neuer als beide Ausgangsstände und kennt beide als Vorgänger.
    // So entsteht beim erneuten Einlesen desselben Backups kein neuer Konflikt.
    const o = clone(c.other);
    const lift = (x) => {
      x.revs = [...new Set([...(x.revs || []), ...(c.kept.revs || []), c.kept.updatedAt, c.other.updatedAt].filter(Boolean))].slice(-30);
      x.updatedAt = Math.max(x.updatedAt || 0, c.kept.updatedAt || 0);
      touch(x);
      return x;
    };
    if (c.coll === "tasks" || c.coll === "memory") {
      const list = S[c.coll],
        i = list.findIndex((x) => x.id === c.ref);
      lift(o);
      if (i < 0) list.push(o);
      else list[i] = c.coll === "memory" ? { ...o, active: list[i].active, supersededBy: list[i].supersededBy } : o;
    } else if (c.coll === "metric-entry") {
      const m = S.metrics.find((x) => x.id === c.mid);
      if (m) {
        const i = m.entries.findIndex((x) => x.id === c.ref);
        lift(o);
        if (i < 0) m.entries.push(o);
        else m.entries[i] = o;
      }
    } else if (c.coll === "metric-goal") {
      const m = S.metrics.find((x) => x.id === c.ref);
      if (m) {
        m.goalRevs = [...new Set([...(m.goalRevs || []), m.goalAt, c.kept.updatedAt, c.other.updatedAt].filter(Boolean))].slice(-30);
        m.goal = o.goal;
        m.goalAt = Math.max(Date.now(), (m.goalAt || 0) + 1, (c.kept.updatedAt || 0) + 1);
      }
    } else if (c.coll === "meetup") S.meetup = lift(o);
  } else if (choice !== "keep") return false;
  c.resolved = true;
  c.choice = choice;
  c.resolvedAt = Date.now();
  logEvent("info", "conflict.resolved", c.kind + "/" + c.coll + " → " + (choice === "keep" || choice === "other" || choice === "both" ? choice : "version"));
  return true;
}
const openConflicts = (T = S) => (T.conflicts || []).filter((c) => !c.resolved);

/* ---------- Backup-Format mit Prüfsumme ---------- */
async function sha256(text) {
  try {
    if (!(window.crypto && crypto.subtle)) return null;
    const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
  } catch (e) {
    return null;
  }
}
const payloadOf = (data, aitest) => JSON.stringify({ data, aitest });
async function makeBackup() {
  const data = clone(S),
    aitest = (await aiLoad()) || [];
  return {
    format: "vivalink-backup",
    schema: SCHEMA,
    app: APP_VERSION,
    createdAt: new Date().toISOString(),
    device: S.dev,
    sha256: await sha256(payloadOf(data, aitest)),
    data,
    aitest,
  };
}
/* Prüft ein Backup ohne etwas zu verändern. */
async function inspectBackup(text) {
  const p = parseBackup(text);
  if (!p.ok) return p;
  if (p.kind === "values") return { ...p, count: p.values.length };
  let sum = "legacy";
  if (p.env) {
    if (!p.env.sha256) sum = "missing";
    else {
      const h = await sha256(payloadOf(p.env.data, p.env.aitest || []));
      sum = h == null ? "unavailable" : h === p.env.sha256 ? "ok" : "bad";
    }
  }
  const inc = cleanIncoming(p.data, p.aitest);
  const ids = (l) => new Set(l.map((x) => x.id));
  const lm = ids(S.memory),
    lt = ids(S.tasks);
  const allHere =
    inc.memory.every((m) => lm.has(m.id)) &&
    inc.tasks.every((t) => lt.has(t.id)) &&
    inc.metrics.every((m) => {
      const lmx = S.metrics.find((x) => x.id === m.id);
      return lmx && m.entries.every((e) => lmx.entries.some((x) => x.id === e.id));
    });
  const T = clone(S);
  if (!Array.isArray(T.conflicts)) T.conflicts = [];
  const rep = mergeInto(T, clone(inc));
  return {
    ...p,
    sum,
    inc,
    allHere,
    sameDevice: !!(p.env && p.env.device === S.dev),
    createdAt: p.env ? p.env.createdAt : null,
    counts: { memory: inc.memory.length, tasks: inc.tasks.length, values: inc.metrics.reduce((n, m) => n + m.entries.filter((e) => !e.deleted).length, 0), aitest: inc.aitest.length },
    preview: rep,
  };
}

/* ---------- Integritätsprüfung (nur lesen) ---------- */
function integrity(T = S) {
  const out = [];
  const dup = (l, name) => {
    const seen = new Set();
    for (const x of l) {
      if (seen.has(x.id)) out.push({ sev: 2, code: "dup-id", msg: name + ": doppelte ID " + x.id });
      seen.add(x.id);
    }
  };
  dup(T.memory, "Gedächtnis");
  dup(T.tasks, "Aufgaben");
  const mids = new Set(T.memory.map((m) => m.id));
  for (const m of T.memory) {
    if (m.supersedes && !mids.has(m.supersedes)) out.push({ sev: 1, code: "orphan-prev", msg: "Gedächtnis " + m.id + ": Vorgänger fehlt" });
    if (m.supersededBy && !mids.has(m.supersededBy)) out.push({ sev: 2, code: "orphan-next", msg: "Gedächtnis " + m.id + ": Nachfolger fehlt" });
    if (!m.active && !m.supersededBy && !m.discarded) out.push({ sev: 1, code: "inactive-no-next", msg: "Gedächtnis " + m.id + ": ersetzt, aber ohne Nachfolger" });
    if (!STL[m.status]) out.push({ sev: 1, code: "bad-status", msg: "Gedächtnis " + m.id + ": unbekannter Status" });
    if (m.date && !DATE_RE.test(m.date)) out.push({ sev: 1, code: "bad-date", msg: "Gedächtnis " + m.id + ": ungültiges Datum" });
  }
  for (const t of T.tasks) if (t.due && !DATE_RE.test(t.due)) out.push({ sev: 1, code: "bad-date", msg: "Aufgabe " + t.id + ": ungültige Frist" });
  for (const m of T.metrics || [])
    for (const e of m.entries) if (!isFinite(Number(e.value))) out.push({ sev: 2, code: "bad-value", msg: "Kennzahl " + m.id + ": ungültiger Wert" });
  const oc = openConflicts(T).length;
  if (oc) out.push({ sev: 2, code: "conflicts", msg: oc + " offene Datenkonflikte" });
  return out;
}
