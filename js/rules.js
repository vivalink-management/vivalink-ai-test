/* Schritt 2: Regelmotor (feste Regeln, keine KI). kind=fakt: direkt aus deinen Daten. kind=annahme: Richtwert. */
let showAll = false;
/* Verwaltung angebunden und Zugang gültig? (Kennzahlen kommen dann automatisch) */
const KPI_ON = () => typeof KPI_STATE !== "undefined" && !!KPI_STATE && !KPI_STATE.revoked;
/* Strategische Empfehlungen aus Verhältnissen echter Kennzahlen (nur wenn beide Werte aktuell sind, ≤ 10 Tage).
   Schwellen sind Annahmen und als solche gekennzeichnet; Geschäftsentscheidungen bleiben beim Gründer. */
function ratioFindings(add) {
  const val = (k) => {
    const m = S.metrics.find((x) => x.key === k),
      c = m && cur(m);
    return c && ago(c.date) <= 10 ? c : null;
  };
  const q = (a, b) => (a && b && b.value > 0 ? a.value / b.value : null);
  const pct = (x) => Math.round(x * 100) + " %";
  const ns = q(val("noshow"), val("signups"));
  if (ns != null && ns >= 0.25)
    add("q-noshow", "metric", 2, "annahme", `Hohe Absagequote: ${pct(ns)} der Anmeldungen`, "Bestätigung 48 Stunden vorher und eine Erinnerung am Vortag einplanen; Absagegründe beim nächsten Meetup erfragen.", [`Absagen ${num(val("noshow").value)}, Anmeldungen ${num(val("signups").value)}.`, "Richtwert (Annahme): unter 25 %.", "Das Muster ist belegt, der Grund ist unbekannt."], "ai");
  const rf = q(val("refunds"), val("payments"));
  if (rf != null && rf >= 0.15)
    add("q-refund", "metric", 2, "annahme", `Erstattungen bei ${pct(rf)} der Zahlungen (30 Tage)`, "Gründe der Erstattungen prüfen. Eine Änderung der Storno- oder Preisregeln ist deine Entscheidung.", [`Erstattungen ${num(val("refunds").value)} €, Zahlungen ${num(val("payments").value)} €.`, "Richtwert (Annahme): unter 15 %."], "ai");
  const ac = q(val("active_users"), val("reg_total"));
  if (ac != null && ac < 0.3 && val("reg_total").value >= 30)
    add("q-active", "metric", 1, "annahme", `Nur ${pct(ac)} der Registrierten in den letzten 30 Tagen aktiv`, "Reaktivierung planen: Instagram-Beitrag zum nächsten Meetup und eine Einladungsrunde an länger inaktive Mitglieder.", [`Aktiv ${num(val("active_users").value)} von ${num(val("reg_total").value)}.`, "Richtwert (Annahme): mindestens 30 %."], "studio");
  const ir = val("invite_rate");
  if (ir && ir.value < 20)
    add("q-invite", "metric", 1, "annahme", `Annahmequote der Einladungen niedrig (${num(ir.value)} %)`, "Einladungstext, Zeitpunkt und Zielgruppe prüfen; eine Variante testen und in zwei Wochen vergleichen.", ["Richtwert (Annahme): mindestens 20 %."], "ai");
}
function findings() {
  const F = [],
    t = today(),
    now = Date.now(),
    open = S.tasks.filter((x) => !x.done),
    act = S.memory.filter((m) => m.active);
  const add = (id, g, sev, kind, title, action, why, tab) =>
    F.push({ id, g, sev, kind, title, action, why, tab, score: sev * 10 + (kind === "fakt" ? 2 : 0) });
  const wk = new Date(now + 7 * 864e5).toLocaleDateString("sv-SE");
  const od = open.filter((x) => x.due && x.due < t);
  if (od.length)
    add(
      "t-od",
      "task",
      3,
      "fakt",
      od.length + " Aufgabe(n) überfällig",
      "Erledige sie oder setze realistische neue Fristen.",
      od.slice(0, 5).map((x) => `${x.title}: Frist ${fmt(x.due)}, ${ago(x.due)} Tage überschritten`),
      "tasks",
    );
  const hi = open.filter((x) => x.prio === "hoch");
  if (hi.length > 5)
    add(
      "t-focus",
      "task",
      2,
      "fakt",
      "Zu viele Aufgaben mit hoher Priorität",
      "Wähle höchstens 3 aus und stufe den Rest herab.",
      [hi.length + " offene Aufgaben haben die Priorität „hoch“."],
      "tasks",
    );
  const hn = open.filter((x) => x.prio === "hoch" && !x.due);
  if (hn.length)
    add(
      "t-hn",
      "task",
      1,
      "fakt",
      hn.length + " wichtige Aufgabe(n) ohne Frist",
      "Lege Fristen fest.",
      hn.slice(0, 5).map((x) => x.title),
      "tasks",
    );
  const st = open.filter((x) => now - (x.updatedAt || now) > 14 * 864e5);
  if (st.length)
    add(
      "t-st",
      "task",
      1,
      "fakt",
      st.length + " Aufgabe(n) seit über 14 Tagen offen",
      "Erledige, plane oder streiche sie.",
      st.slice(0, 5).map((x) => `${x.title}: ${Math.floor((now - x.updatedAt) / 864e5)} Tage offen`),
      "tasks",
    );
  if (open.length && !open.some((x) => x.due && x.due >= t && x.due <= wk))
    add(
      "t-wk",
      "task",
      1,
      "fakt",
      "Für die nächsten 7 Tage ist nichts geplant",
      "Gib mindestens einer Aufgabe eine Frist in dieser Woche.",
      ["Keine offene Aufgabe hat eine Frist bis " + fmt(wk) + "."],
      "tasks",
    );
  const miss = GAPS.filter((c) => !act.some((m) => m.cat === c));
  if (miss.length)
    add(
      "g-gap",
      "memory",
      miss.length >= 4 ? 2 : 1,
      "fakt",
      "Im Gedächtnis fehlt Wissen",
      "Trage zuerst die wichtigsten Grundlagen ein: " + miss.slice(0, 3).join(", ") + ".",
      ["Keine Einträge in: " + miss.join(", ")],
      "memory",
    );
  const un = act.filter((m) => m.status === "unknown");
  if (un.length)
    add(
      "g-un",
      "memory",
      1,
      "fakt",
      un.length + " Eintrag/Einträge mit unbekanntem Status",
      "Kläre sie und setze ✅ oder 💭.",
      un.slice(0, 5).map((m) => m.title),
      "memory",
    );
  const nr = act.filter((m) => m.cat === "Entscheidung" && !m.result && ago(m.date) > 14);
  if (nr.length)
    add(
      "g-nr",
      "memory",
      2,
      "fakt",
      nr.length + " Entscheidung(en) ohne Ergebnis",
      "Trage ein, was daraus geworden ist. So kann die App später daraus lernen.",
      nr.slice(0, 5).map((m) => `${m.title}: ${ago(m.date)} Tage ohne Ergebnis`),
      "memory",
    );
  const eo = act.filter((m) => m.status === "estimate" && ago(m.date) > 60);
  if (eo.length)
    add(
      "g-eo",
      "memory",
      1,
      "fakt",
      eo.length + " Einschätzung(en) seit über 60 Tagen ungeprüft",
      "Prüfe, ob sie noch stimmen, und bestätige oder ändere sie.",
      eo.slice(0, 5).map((m) => m.title),
      "memory",
    );
  const oo = [],
    nv = [];
  // Kennzahlen, die automatisch aus der Verwaltung kommen (Wert in den letzten 3 Tagen): keine Eingabe-Hinweise
  const used = S.metrics.filter((m) => m.entries.some((e) => !e.deleted && e.status !== "old")).length;
  const autoFed = (m) => !!(KPI_ON() && m.entries.some((e) => !e.deleted && e.src === "verwaltung" && ago(e.date) <= 3));
  for (const m of S.metrics) {
    const c = cur(m),
      o = oldE(m),
      v = valid(m);
    if (!c && KPI_ON() && m.entries.some((e) => !e.deleted && e.src === "verwaltung")) continue; // Verwaltung liefert, nur kurz leer
    if (!c) {
      if (o) oo.push(`${m.name}: nur früherer Stand (${num(o.value)}, ca.)`);
      else if (!m.entries.some((e) => !e.deleted) && m.goal === "" && used >= 3) continue; // nie genutzt, kein Ziel: nicht dauernd nachfragen
      else nv.push(m.name);
      continue;
    }
    const d = ago(c.date);
    if (d > 14 && !autoFed(m))
      add(
        "m-st-" + m.key,
        "metric",
        1,
        "fakt",
        m.name + ": Wert seit " + d + " Tagen nicht aktualisiert",
        "Aktualisiere den Wert.",
        [`Letzter Wert ${num(c.value)} vom ${fmt(c.date)}.`],
        null,
      );
    const g = Number(m.goal);
    if (m.goal !== "" && g > 0 && m.dir === "up" && c.value < g) {
      const gap = Math.round((1 - c.value / g) * 100);
      add(
        "m-go-" + m.key,
        "metric",
        gap > 25 ? 2 : 1,
        "fakt",
        `${m.name}: ${gap} % unter dem Ziel`,
        "Plane eine Maßnahme, die diese Zahl gezielt erhöht.",
        [`Aktuell ${num(c.value)} (${fmt(c.date)}), Ziel ${num(g)}.`],
        null,
      );
    }
    if (m.dir !== "neutral" && v.length >= 4) {
      const l = v.slice(-4).map((e) => e.value),
        dn = l[0] > l[1] && l[1] > l[2] && l[2] > l[3],
        up = l[0] < l[1] && l[1] < l[2] && l[2] < l[3];
      if ((m.dir === "up" && dn) || (m.dir === "down" && up)) {
        add(
          "m-tr-" + m.key,
          "metric",
          2,
          "fakt",
          `${m.name}: ${dn ? "sinkt" : "steigt"} seit 3 Messungen`,
          "Prüfe, was sich in dieser Zeit geändert hat. Für die Ursache nutze die Tiefenanalyse.",
          [`Letzte Werte: ${l.map(num).join(" → ")}.`, "Das Muster ist belegt, der Grund ist unbekannt."],
          "ai",
        );
        continue;
      }
    }
    const c7 = cmp(m, 7);
    if (c7 && c7.p != null && ((m.dir === "up" && c7.p <= -10) || (m.dir === "down" && c7.p >= 20)))
      add(
        "m-7-" + m.key,
        "metric",
        2,
        "fakt",
        `${m.name}: ${cs(c7)} in 7 Tagen`,
        "Prüfe, was sich geändert hat. Für die Ursache nutze die Tiefenanalyse.",
        [
          `Aktuell ${num(c.value)} (${fmt(c.date)}).`,
          `Datenbasis: ${v.length} Werte.`,
          "Das Muster ist belegt, der Grund ist unbekannt.",
        ],
        "ai",
      );
  }
  if (oo.length)
    add(
      "m-old",
      "metric",
      2,
      "fakt",
      oo.length + " Kennzahl(en) nur mit früherem Stand",
      "Trage den aktuellen Wert ein. Später kommt er automatisch aus der Verwaltung.",
      oo,
      null,
    );
  if (nv.length)
    add(
      "m-nv",
      "metric",
      1,
      "fakt",
      nv.length + " Kennzahlen ohne Wert",
      "Trage die wichtigsten ein oder warte auf die automatische Übernahme.",
      nv.slice(0, 6),
      null,
    );
  ratioFindings(add);
  const u = S.meetup,
    su = S.metrics.find((x) => x.key === "signups"),
    sc = su && cur(su);
  if (!u.date && !u.place)
    add(
      "mt-no",
      "meetup",
      1,
      "fakt",
      "Kein nächstes Meetup angelegt",
      "Lege Datum, Ort und Ziel an (Karte auf der Startseite).",
      ["Die Meetup-Karte ist leer."],
      null,
    );
  else {
    const dy = u.date ? Math.round((new Date(u.date + "T12:00") - new Date(t + "T12:00")) / 864e5) : null,
      ms = [!u.date && "Datum", !u.place && "Ort", u.goal === "" && "Ziel"].filter(Boolean);
    if (dy != null && dy < 0)
      add(
        "mt-past",
        "meetup",
        1,
        "fakt",
        "Das eingetragene Meetup liegt in der Vergangenheit",
        "Trage Teilnehmer und Ergebnis ein und lege das nächste Meetup an.",
        ["Datum: " + fmt(u.date) + "."],
        null,
      );
    else {
      if (ms.length)
        add(
          "mt-ms",
          "meetup",
          dy != null && dy <= 30 ? 2 : 1,
          "fakt",
          "Meetup: Angaben fehlen (" + ms.join(", ") + ")",
          "Ergänze die fehlenden Angaben.",
          ["Fehlt: " + ms.join(", ") + "."],
          null,
        );
      const g = Number(u.goal);
      if (dy != null && dy <= 14 && g > 0) {
        if (!sc)
          add(
            "mt-nd",
            "meetup",
            2,
            "fakt",
            `Meetup in ${dy} Tagen: Anmeldezahl unbekannt`,
            "Trage den Wert bei „Anmeldungen pro Meetup“ ein.",
            ["Es liegt kein aktueller Wert vor."],
            null,
          );
        else {
          const nd = dy <= 3 ? 0.9 : dy <= 7 ? 0.75 : 0.5;
          if (sc.value < g * nd)
            add(
              "mt-pace",
              "meetup",
              3,
              "annahme",
              `Meetup in ${dy} Tagen: Anmeldungen hinter dem Richtwert`,
              "Starte jetzt eine gezielte Erinnerung oder Einladungsrunde.",
              [
                `Aktuell ${num(sc.value)} von Ziel ${num(g)} (${fmt(sc.date)}).`,
                `Richtwert: ${Math.round(nd * 100)} % des Ziels bei ${dy <= 3 ? 3 : dy <= 7 ? 7 : 14} Tagen vorher.`,
                "Der Richtwert ist eine Annahme. Mit genug Meetups lernt die App ihn aus deinen Daten.",
              ],
              "ai",
            );
        }
      }
    }
  }
  // Keine Erinnerung an manuelle Backups (Entscheidung des Gründers). Gemeldet wird nur, wenn die automatische Sicherung ausfällt.
  if ((S.memory.length || S.tasks.length) && (!LASTSNAP || ago(LASTSNAP) > 2))
    add("sys-snap", "system", 2, "fakt", "Automatische Sicherung funktioniert nicht", "Öffne „Mehr › Diagnose“ und prüfe den Speichertest.", [LASTSNAP ? "Letzter automatischer Sicherungspunkt: " + fmt(LASTSNAP) + "." : "Noch kein automatischer Sicherungspunkt vorhanden."], "more");
  /* Instagram-Studio: erkennt selbstständig, wann Marketing-Arbeit ansteht */
  if (S.studio) {
    const SP = livePosts(),
      nm = nextMonth(t.slice(0, 7)),
      in7 = addDays(t, 7);
    const miss = brandMissing();
    if (miss.length) add("ig-brand", "studio", 1, "fakt", "Markenprofil für Instagram unvollständig", "Ergänze im Studio: " + miss.join(", ") + ".", ["Ohne diese Angaben verweisen Beiträge nur auf die Website."], "studio");
    if (Number(t.slice(8)) >= 20 && !SP.some((p) => (p.date || "").startsWith(nm)))
      add("ig-plan", "studio", 1, "fakt", "Instagram-Plan für " + new Date(nm + "-15T12:00").toLocaleDateString("de-DE", { month: "long" }) + " fehlt", "Erstelle im Studio den Monatsplan.", ["Für den nächsten Monat ist noch kein Beitrag geplant."], "studio");
    const wait = SP.filter((p) => p.status === "entwurf" && p.date && p.date >= t && p.date <= in7);
    if (wait.length) add("ig-wait", "studio", 2, "fakt", wait.length + " Instagram-Beitrag/Beiträge warten auf Freigabe", "Prüfe und gib sie im Studio frei.", wait.slice(0, 5).map((p) => `${fmt(p.date)}: ${p.title}`), "studio");
    else if (!SP.some((p) => p.date && p.date >= t && p.date <= in7 && p.status !== "abgelehnt"))
      add("ig-none", "studio", 1, "fakt", "Keine Instagram-Beiträge für die nächsten 7 Tage", "Erstelle Beiträge im Studio.", ["Für die nächsten 7 Tage ist nichts geplant."], "studio");
    const due = SP.filter((p) => p.status === "freigegeben" && p.date && p.date <= t);
    if (due.length) add("ig-due", "studio", 2, "fakt", due.length + " freigegebene(r) Beitrag/Beiträge zur Veröffentlichung fällig", "Im Studio öffnen → „Teilen (Instagram)“ → danach „Als veröffentlicht markieren“.", due.slice(0, 5).map((p) => `${fmt(p.date)} ${p.time}: ${p.title}`), "studio");
    const unr = SP.filter((p) => p.status === "veroeffentlicht" && !p.metrics && p.publishedAt && now - p.publishedAt > 3 * 864e5);
    if (unr.length) add("ig-rate", "studio", 1, "fakt", unr.length + " veröffentlichte(r) Beitrag/Beiträge ohne Ergebnisse", "Trage Reichweite und Interaktionen ein – daraus lernt die Planung.", unr.slice(0, 5).map((p) => p.title), "studio");
  }
  /* Technische Selbstüberwachung: Datenkonflikte und Fehler im technischen Protokoll */
  const oc = openConflicts();
  if (oc.length)
    add(
      "sys-cf",
      "system",
      3,
      "fakt",
      oc.length + " Datenkonflikt(e) beim Zusammenführen",
      "Entscheide unter „Mehr › Datenkonflikte“, welche Version gilt. Bis dahin gilt die neuere.",
      ["Derselbe Eintrag wurde auf zwei Geräten unterschiedlich geändert.", "Keine Version wurde gelöscht."],
      "more",
    );
  const errs = LOG.filter((e) => e.level === "error" && now - e.at < 7 * 864e5);
  if (errs.length)
    add(
      "sys-err",
      "system",
      1,
      "fakt",
      errs.length + " technische(r) Fehler in den letzten 7 Tagen",
      "Öffne „Mehr › Diagnose“ und kopiere den Diagnosebericht für einen Reparaturauftrag.",
      errs.slice(-3).map((e) => e.code + ": " + e.msg),
      "more",
    );
  measureFindings(add, t); // Erfolgskontrolle freigegebener Maßnahmen
  // Geplante KI-Aufgaben: ausgeblieben oder Problem gemeldet (nur belegte Zustände)
  for (const a of typeof AUTO_STATE !== "undefined" ? AUTO_STATE : [])
    if (a.state === "ausgeblieben" || a.state === "fehler")
      add("sys-auto-" + a.id, "system", 2, "fakt", "Geplante Aufgabe „" + a.name + "“: " + (a.state === "fehler" ? "Problem gemeldet" : "Ausführung ausgeblieben"), "Unter „Mehr › Autonomie“ ansehen. Häufige Ursache: Kontingent des Claude-Abos erschöpft oder Aufgabe pausiert.", [a.label, a.lastOk ? "Letzter belegter Erfolg: " + new Date(a.lastOk.at).toLocaleDateString("de-DE") : "Noch kein belegter Erfolg"], "more");
  // Anbindung der Verwaltung gestört (nur wenn eingerichtet)
  const kf = typeof kpiFinding === "function" ? kpiFinding() : null;
  if (kf) add("sys-kpi", "system", 2, "fakt", kf.title, kf.detail, ["Mehr › Verwaltung"], "more");
  const md = typeof kpiMeetupFinding === "function" ? kpiMeetupFinding() : null;
  if (md) add("mt-verw", "meetup", 2, "fakt", md.title, md.detail, ["Quelle: Kennzahlen aus der Verwaltung"], null);
  const sg = S.suggest || {},
    hasT = (id) => S.tasks.some((x) => !x.done && x.fid === id);
  return F.filter((f) => {
    const s = sg[f.id];
    // Ausgeblendet bis zum Datum; „Nicht relevant“ zusätzlich nur bei gleicher oder geringerer Dringlichkeit
    const hidden = s && (s.until > t || (s.mode === "nope" && s.sev != null && f.sev <= s.sev));
    return !hidden && !hasT(f.id);
  }).sort((a, b) => b.score - a.score);
}
function pickTop(F) {
  const n = {},
    o = [];
  for (const f of F) {
    if (f.sev < 1) continue; // Hinweise ohne Dringlichkeit nur unter „Alle Hinweise“
    if (o.length >= 3) break;
    if ((n[f.g] || 0) < 2) {
      o.push(f);
      n[f.g] = (n[f.g] || 0) + 1;
    }
  }
  return o;
}
/* fCard (Darstellung eines Befunds) liegt in js/advice.js */
function topHtml() {
  const F = findings(),
    top = pickTop(F);
  return (
    (top.length
      ? top.map(fCard).join("")
      : '<div class="card rec ok">Aktuell kein Handlungsbedarf erkannt.</div>') +
    (F.length > top.length
      ? `<div class="row"><button class="s" data-a="all">${showAll ? "Weniger anzeigen" : "Alle Hinweise (" + F.length + ")"}</button></div>` +
        (showAll
          ? F.filter((f) => !top.includes(f))
              .map(fCard)
              .join("")
          : "")
      : "")
  );
}
