/* Kennzahlen und nächstes Meetup (Werte kommen nur aus deinen Eingaben oder Importen, nie aus dem Code) */
const MT = [
  { k: "reg_total", n: "Gesamtzahl der Registrierungen", u: "", d: "up" },
  { k: "reg_week", n: "Neue Registrierungen pro Woche", u: "", d: "up" },
  { k: "signups", n: "Anmeldungen pro Meetup", u: "", d: "up" },
  { k: "attend", n: "Tatsächliche Teilnehmer pro Meetup", u: "", d: "up" },
  { k: "noshow", n: "Absagen und Nichterscheinen", u: "", d: "down" },
  { k: "ig_fol", n: "Instagram-Follower", u: "", d: "up" },
  { k: "ig_reach", n: "Instagram-Reichweite", u: "", d: "up" },
  { k: "web", n: "Website-Besucher", u: "", d: "up" },
  { k: "mkt", n: "Marketingausgaben", u: "€", d: "neutral" },
  { k: "inc", n: "Einnahmen", u: "€", d: "up" },
  { k: "exp", n: "Ausgaben", u: "€", d: "neutral" },
  { k: "active_users", n: "Aktive Nutzer (30 Tage)", u: "", d: "up" },
  { k: "invites", n: "Versendete Einladungen", u: "", d: "up" },
  { k: "invite_rate", n: "Annahmequote Einladungen", u: "%", d: "up" },
  { k: "payments", n: "Zahlungen", u: "€", d: "up" },
  { k: "refunds", n: "Erstattungen", u: "€", d: "down" },
];
const VS = { confirmed: "✅ Aktuell", estimate: "💭 Schätzung", old: "🕓 Früherer Stand" };
let SAFE = null;

const valid = (m) =>
  m.entries
    .filter((e) => !e.deleted && e.status !== "old" && e.date)
    .sort((a, b) => a.date.localeCompare(b.date) || a.updatedAt - b.updatedAt);
const cur = (m) => {
  const v = valid(m);
  return v.length ? v[v.length - 1] : null;
};
const oldE = (m) => m.entries.filter((e) => !e.deleted && e.status === "old").pop() || null;
const num = (v) => Number(v).toLocaleString("de-DE");
function cmp(m, days) {
  const v = valid(m);
  if (v.length < 2) return null;
  const L = v[v.length - 1],
    lim = new Date(new Date(L.date + "T12:00") - days * 864e5).toLocaleDateString("sv-SE");
  const P = [...v].reverse().find((e) => e.date <= lim);
  if (!P) return null;
  const d = L.value - P.value;
  return { d, p: P.value ? Math.round((d / P.value) * 100) : null };
}
const cs = (c) =>
  c ? `${c.d > 0 ? "+" : ""}${num(c.d)}${c.p != null ? " (" + (c.d > 0 ? "+" : "") + c.p + " %)" : ""}` : "–";
function addVal(mid, o, T = S) {
  const m = T.metrics.find((x) => x.id === mid);
  const ex =
    o.status !== "old" &&
    m.entries.find(
      (e) => !e.deleted && e.date === o.date && e.src === (o.src || "manual") && e.status !== "old",
    );
  if (ex) {
    if (ex.value === o.value && ex.status === o.status && (!o.note || o.note === ex.note)) return false;
    ex.value = o.value;
    ex.status = o.status;
    ex.note = o.note || ex.note;
    touch(ex);
  } else {
    const e = { id: uid(), date: o.date || "", value: o.value, status: o.status, src: o.src || "manual", note: o.note || "" };
    touch(e);
    m.entries.push(e);
  }
  m.updatedAt = Date.now();
  return true;
}
/* Kennzahlen-Import im Format {"values":[{"key","date","value","source"}]} (später: Verwaltung). */
function ingest(key, date, value, src, T = S) {
  const m = T.metrics.find((x) => x.key === key);
  const v = Number(value);
  if (!m || value === "" || value == null || !isFinite(v) || typeof date !== "string" || !DATE_RE.test(date)) return false;
  addVal(m.id, { date, value: v, status: "confirmed", src: str(src || "import", 40) }, T);
  return true;
}

function mCardHtml(m) {
  const c = cur(m),
    o = oldE(m);
  let v, s;
  if (c) {
    v = num(c.value) + (m.unit ? " " + esc(m.unit) : "");
    s = `${VS[c.status] || ""} · ${fmt(c.date)}`;
  } else if (o) {
    v = num(o.value) + (m.unit ? " " + esc(m.unit) : "");
    s = "🕓 Früherer Stand (ca.), nicht aktuell. Bitte aktualisieren.";
  } else {
    v = "–";
    s = "Noch kein Wert";
  }
  const g = m.goal !== "" && m.goal != null && c ? ` · Ziel ${num(m.goal)}` : "";
  return `<div class="card ${c ? "" : "old"}" data-a="met" data-id="${esc(m.id)}"><div class="row sp"><b>${esc(m.name)}</b><b>${v}</b></div><div class="mut">${s}${g}</div></div>`;
}
function meetupHtml() {
  const u = S.meetup,
    m = S.metrics.find((x) => x.key === "signups"),
    c = m && cur(m);
  const miss = [!u.date && "Datum", !u.place && "Ort", u.goal === "" && "Ziel"].filter(Boolean);
  let h = '<h2>Nächstes Meetup</h2><div class="card" data-a="meet">';
  if (!u.date && !u.place)
    h += '<b>Noch nicht angelegt</b><div class="mut">Tippe hier, um Datum, Ort und Ziel einzutragen.</div>';
  else {
    const d = u.date
      ? Math.round((new Date(u.date + "T12:00") - new Date(today() + "T12:00")) / 864e5)
      : null;
    h += `<div class="row sp"><b>${esc(u.place || "Ort fehlt")}</b><b>${u.date ? fmt(u.date) + (d >= 0 ? " · in " + d + " Tagen" : " · vorbei") : "Datum fehlt"}</b></div><div class="mut">Anmeldungen: ${c ? num(c.value) : "unbekannt"}${u.goal !== "" ? " von Ziel " + num(u.goal) : ""}${miss.length ? " · Es fehlt: " + miss.join(", ") : ""}</div>`;
  }
  return h + "</div>";
}
function meetForm() {
  const u = S.meetup;
  sheet(
    `<h1>Nächstes Meetup</h1><label>Datum</label><input type="date" id="u-d" value="${esc(u.date)}"><label>Ort</label><input id="u-p" value="${esc(u.place)}"><label>Ziel für Anmeldungen</label><input id="u-g" inputmode="numeric" value="${esc(u.goal)}"><label>Notiz</label><textarea id="u-n">${esc(u.note)}</textarea><div class="row"><button class="p" data-a="saveMeet">Speichern</button><button data-a="close">Abbrechen</button></div>`,
  );
}
function metSheet(id) {
  const m = S.metrics.find((x) => x.id === id),
    c = cur(m);
  const L = m.entries
    .filter((e) => !e.deleted)
    .sort((a, b) => (b.date || "").localeCompare(a.date || "") || b.updatedAt - a.updatedAt)
    .slice(0, 12);
  sheet(
    `<h1>${esc(m.name)}</h1>${c ? `<div class="card"><div class="mut">Veränderung</div><div>7 Tage: <b>${cs(cmp(m, 7))}</b></div><div>30 Tage: <b>${cs(cmp(m, 30))}</b></div></div>` : '<p class="mut">Noch kein aktueller Wert. Trage den ersten Wert ein.</p>'}<h2>Neuer Wert</h2><label>Wert</label><input id="v-v" inputmode="decimal"><label>Datum</label><input type="date" id="v-d" value="${today()}"><label>Wie sicher?</label><select id="v-s"><option value="confirmed">✅ Aktuell, geprüft</option><option value="estimate">💭 Schätzung</option><option value="old">🕓 Früherer Stand</option></select><label>Notiz (z. B. Maßnahme dieser Woche)</label><input id="v-n"><button class="p" data-a="saveVal" data-id="${esc(m.id)}">Wert speichern</button><label style="display:block;margin-top:14px">Ziel (optional)</label><input id="v-g" inputmode="decimal" value="${esc(m.goal)}"><button data-a="saveGoal" data-id="${esc(m.id)}">Ziel speichern</button><h2>Verlauf</h2>${L.length ? L.map((e) => `<div class="card row sp ${e.status === "old" ? "old" : ""}"><div><b>${num(e.value)}${m.unit ? " " + esc(m.unit) : ""}</b> · ${e.date ? fmt(e.date) : "ohne Datum"}<div class="mut">${VS[e.status] || ""} · ${esc(e.src)}${e.note ? " · " + esc(e.note) : ""}</div></div><button class="s" data-a="delVal" data-id="${esc(m.id)}" data-v="${esc(e.id)}">Entfernen</button></div>`).join("") : '<p class="mut">Noch keine Werte.</p>'}<button data-a="close">Schließen</button>`,
  );
}
