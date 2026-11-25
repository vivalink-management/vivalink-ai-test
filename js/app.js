document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-a]");
  if (!b) return;
  const a = b.dataset.a,
    id = b.dataset.id;
  if (a === "tab") {
    tab = id;
    render();
    scrollTo(0, 0);
  } else if (a === "close") close();
  else if (a === "newTask") taskForm();
  else if (a === "editTask") taskForm(S.tasks.find((y) => y.id === id));
  else if (a === "delTask") {
    const x = S.tasks.find((y) => y.id === taskEdit);
    if (!x) return;
    if (window._tdel !== x.id) {
      window._tdel = x.id;
      return toast("Nochmal tippen, um die Aufgabe zu löschen");
    }
    window._tdel = null;
    x.deleted = true; // Löschvermerk (für Synchronisierung), abhängige Aufgaben werden frei
    x.done = true;
    for (const y of S.tasks.filter((z) => z.after === x.id)) (y.after = ""), touch(y);
    touch(x);
    close();
    await save();
    render();
    toast("Aufgabe gelöscht");
  } else if (a === "saveTask") {
    const t = val("t-t").trim();
    if (!t) return toast("Bitte eine Aufgabe eingeben");
    const ex = taskEdit && S.tasks.find((y) => y.id === taskEdit);
    if (ex) {
      Object.assign(ex, { title: t, prio: val("t-p"), area: val("t-a"), due: val("t-d"), after: makesCycle(ex.id, val("t-after")) ? "" : val("t-after") });
      touch(ex);
      close();
      await save();
      render();
      return toast("Aufgabe gespeichert");
    }
    const x = {
      id: uid(),
      title: t,
      prio: val("t-p"),
      area: val("t-a"),
      due: val("t-d"),
      after: val("t-after"),
      done: false,
      dev: S.dev,
    };
    touch(x);
    S.tasks.push(x);
    close();
    await save();
    tab = "tasks";
    render();
  } else if (a === "toggle") {
    const x = S.tasks.find((y) => y.id === id);
    if (!x) return;
    x.done = !x.done;
    x.doneAt = x.done ? Date.now() : null;
    touch(x);
    await save();
    render();
  } else if (a === "doneToggle") {
    showDone = !showDone;
    render();
  } else if (a === "newMem") memForm();
  else if (a === "editMem") memForm(S.memory.find((m) => m.id === id));
  else if (a === "saveMem") {
    const t = val("f-title").trim();
    if (!t) return toast("Bitte einen Titel eingeben");
    const n = {
      id: uid(),
      cat: val("f-cat"),
      title: t,
      text: val("f-text"),
      status: val("f-st"),
      date: val("f-date") || today(),
      reason: val("f-re"),
      result: val("f-res"),
      private: $("#f-pv").checked,
      active: true,
      createdAt: Date.now(),
      dev: S.dev,
    };
    if (editId) {
      const cr = val("f-cr").trim();
      if (!cr) return toast("Bitte den Grund der Änderung angeben");
      const o = S.memory.find((m) => m.id === editId);
      n.supersedes = o.id;
      n.changeReason = cr;
      o.active = false;
      o.supersededBy = n.id;
      touch(o);
    }
    if (!n.private && pw(n.title + " " + n.text + " " + n.reason + " " + n.result)) {
      n.private = true;
      toast("Personenbezogene Daten erkannt. Eintrag als vertraulich markiert.");
    }
    touch(n);
    S.memory.push(n);
    close();
    await save();
    tab = "memory";
    render();
  } else if (a === "hist") histView(id);
  else if (a === "cat") {
    mf.cat = id;
    render();
  } else if (a === "all") {
    showAll = !showAll;
    render();
  } else if (a === "mk") {
    const f = findings().find((x) => x.id === id);
    if (!f) return;
    const G = { task: "Ziele", memory: "Ziele", metric: "Marketing", meetup: "Meetup", system: "Ziele", studio: "Instagram" },
      off = f.sev >= 3 ? 3 : f.sev === 2 ? 7 : 14,
      due = new Date(Date.now() + off * 864e5).toLocaleDateString("sv-SE");
    const x = {
      id: uid(),
      title: (f.title + ": " + f.action).slice(0, 140),
      prio: f.sev >= 3 ? "hoch" : f.sev === 2 ? "mittel" : "niedrig",
      area: G[f.g] || "Ziele",
      due,
      done: false,
      dev: S.dev,
      fid: f.id,
      src: "regelmotor",
    };
    touch(x);
    S.tasks.push(x);
    await save();
    render();
    toast("Aufgabe angelegt (Frist " + fmt(due) + ")");
  } else if (a === "later" || a === "nope") {
    S.suggest = S.suggest || {};
    const f = findings().find((x) => x.id === id),
      prev = S.suggest[id];
    // „Später“ wiederholt: Abstand verdoppelt sich (7, 14, 28 Tage); „Nicht relevant“: erst wieder bei Verschärfung
    const n = prev && prev.mode === a ? Math.min((prev.n || 1) + 1, 4) : 1;
    const days = a === "later" ? 7 * 2 ** (n - 1) : 180;
    S.suggest[id] = { until: addDays(today(), days), mode: a, at: Date.now(), sev: f ? f.sev : 3, n };
    await save();
    render();
    toast(a === "later" ? `Für ${days} Tage ausgeblendet` : "Als nicht relevant markiert – erscheint nur wieder, wenn es dringender wird");
  } else if (a === "met") metSheet(id);
  else if (a === "meet") meetForm();
  else if (a === "saveMeet") {
    const prev = S.meetup || {};
    S.meetup = {
      date: val("u-d"),
      place: val("u-p").trim(),
      goal: val("u-g").trim(),
      note: val("u-n"),
      updatedAt: prev.updatedAt || 0,
      revs: prev.revs,
    };
    touch(S.meetup);
    close();
    await save();
    render();
  } else if (a === "saveVal") {
    const r = val("v-v").trim().replace(",", ".");
    if (r === "" || isNaN(r)) return toast("Bitte eine Zahl eingeben");
    const st = val("v-s"),
      d = val("v-d");
    if (st !== "old" && !d) return toast("Bitte ein Datum angeben");
    addVal(id, { date: d, value: Number(r), status: st, src: "manual", note: val("v-n").trim() });
    await save();
    metSheet(id);
    render();
  } else if (a === "saveGoal") {
    const m = S.metrics.find((x) => x.id === id);
    const g = val("v-g").trim().replace(",", ".");
    if (m.goalAt) m.goalRevs = [...(m.goalRevs || []), m.goalAt].slice(-30);
    m.goal = g;
    m.goalAt = Math.max(Date.now(), (m.goalAt || 0) + 1);
    m.updatedAt = Date.now();
    await save();
    metSheet(id);
    render();
    toast("Ziel gespeichert");
  } else if (a === "delVal") {
    const m = S.metrics.find((x) => x.id === id),
      e = m.entries.find((x) => x.id === b.dataset.v);
    e.deleted = true;
    touch(e);
    m.updatedAt = Date.now();
    await save();
    metSheet(id);
    render();
  } else if (a === "restore") {
    if (!SAFE) return;
    if (!window._rs) {
      window._rs = 1;
      toast("Nochmal tippen, um wiederherzustellen");
      return;
    }
    window._rs = 0;
    if (!(await makeUndoPoint("Vor Wiederherstellung"))) return toast("Rückgängig-Punkt nicht möglich. Nichts verändert.");
    S = clone(SAFE.data);
    migrate();
    await save();
    logEvent("info", "restore.safety", "Sicherheitskopie wiederhergestellt");
    render();
    toast("Stand vor dem Update wiederhergestellt");
  } else if (a === "tpl") {
    ai.k = id;
    ai.extra = "";
    ai.cats = [...TC[id]];
    render();
    scrollTo(0, 0);
  } else if (a === "acat") {
    const i = ai.cats.indexOf(id);
    if (i < 0) ai.cats.push(id);
    else ai.cats.splice(i, 1);
    render();
  } else if (a === "discard") {
    $("#ans").value = "";
    toast("Antwort verworfen. Es wurde nichts gespeichert.");
  } else if (a === "aiBack") {
    ai.k = null;
    render();
  } else if (a === "cpPv") {
    const t = $("#pv");
    try {
      await navigator.clipboard.writeText(t.value);
      toast("Auftrag kopiert");
    } catch (x) {
      t.select();
      toast("Markiert. Bitte manuell kopieren.");
    }
  } else if (a === "saveAns") {
    const r = val("ans").trim();
    if (!r) return toast("Bitte zuerst die Antwort einfügen");
    if (id === "confirmed" && !$("#ok").checked)
      return toast("Bitte zuerst bestätigen, dass du den Inhalt geprüft hast");
    const T = TPL.find((t) => t.k === ai.k);
    const n = {
      id: uid(),
      cat: val("s-cat"),
      title: "KI-Antwort: " + T.name + " (" + fmt(today()) + ")",
      text: r + " (Quelle: " + val("s-src") + ")",
      status: id,
      private: pw(r) !== "",
      date: today(),
      reason: "",
      result: "",
      active: true,
      createdAt: Date.now(),
      dev: S.dev,
    };
    touch(n);
    S.memory.push(n);
    await save();
    ai.k = null;
    tab = "memory";
    render();
    toast(id === "confirmed" ? "Als bestätigt übernommen" : "Als Einschätzung gespeichert");
  } else if (a === "aiTest") aiSheet();
  else if (a === "cpy") {
    const t = $("#pt" + id);
    try {
      await navigator.clipboard.writeText(t.value);
      toast("Kopiert");
    } catch (x) {
      t.select();
      toast("Markiert. Bitte manuell kopieren.");
    }
  } else if (a === "saveAi") {
    const x = {
      id: uid(),
      date: today(),
      device: val("a-dev"),
      model: val("a-mod").trim(),
      load: val("a-load"),
      ans: val("a-ans"),
      tps: val("a-tps"),
      r: RL.map((_, i) => val("a-r" + i)),
      note: val("a-note").trim(),
    };
    const l = await aiLoad();
    l.push(x);
    await aiSave(l);
    toast("Ergebnis gespeichert");
    aiSheet();
  } else if (a === "cpAi") {
    const l = await aiLoad();
    const t = l
      .map(
        (x) =>
          `${x.device} | ${x.model} | Laden ${x.load}s | Antwort ${x.ans}s | ${x.tps} Tokens/s | ` +
          RL.map((n, i) => n + " " + x.r[i]).join(", ") +
          (x.note ? " | " + x.note : ""),
      )
      .join("\n");
    try {
      await navigator.clipboard.writeText(t);
      toast("Kopiert. Füge es im Chat mit Claude ein.");
    } catch (e) {
      toast("Kopieren nicht möglich");
    }
  } else if (a === "exp") {
    const j = JSON.stringify(await makeBackup());
    try {
      await navigator.clipboard.writeText(j);
      S.lastBackup = today();
      await save();
      logEvent("info", "backup.copy", "Backup in die Zwischenablage kopiert");
      render();
      toast("Backup kopiert. Jetzt in eine gesperrte Notiz einfügen.");
    } catch (x) {
      logEvent("warn", "backup.clipboard", (x && x.name) || "Zwischenablage nicht verfügbar");
      $("#imp").value = j;
      $("#imp").select();
      toast("Text markiert. Bitte manuell kopieren und danach mit „Backup prüfen“ bestätigen.");
    }
  } else if (a === "expFile") {
    const j = JSON.stringify(await makeBackup(), null, 1);
    const name = "vivalink-backup-" + today() + ".json";
    let file = null;
    try {
      file = new File([j], name, { type: "application/json" });
    } catch (x) {}
    try {
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: name });
      } else {
        const u = URL.createObjectURL(new Blob([j], { type: "application/json" }));
        const l = document.createElement("a");
        l.href = u;
        l.download = name;
        document.body.appendChild(l);
        l.click();
        l.remove();
        setTimeout(() => URL.revokeObjectURL(u), 4000);
      }
      S.lastBackup = today();
      await save();
      logEvent("info", "backup.file", "Backup als Datei gesichert");
      render();
      toast("Backup-Datei erstellt");
    } catch (x) {
      if (x && x.name === "AbortError") return toast("Abgebrochen. Es wurde kein Backup gespeichert.");
      logEvent("warn", "backup.file", (x && x.name) || "Datei-Export fehlgeschlagen");
      toast("Datei konnte nicht erstellt werden. Nutze „Backup kopieren“.");
    }
  } else if (a === "chkImp") {
    const r = await inspectBackup(val("imp"));
    $("#impRes").innerHTML = inspectHtml(r);
    if (r.ok && r.kind === "state" && r.sameDevice && r.sum === "ok" && r.allHere && r.createdAt) {
      const d = new Date(r.createdAt).toLocaleDateString("sv-SE");
      if (!S.lastBackup || d > S.lastBackup) {
        S.lastBackup = d;
        await save();
        logEvent("info", "backup.verified", "Backup geprüft und bestätigt");
      }
      toast("Backup geprüft und bestätigt");
    }
  } else if (a === "imp") {
    const t = val("imp"),
      r = await inspectBackup(t);
    if (!r.ok) {
      logEvent("warn", "import.invalid", r.error);
      return toast(r.error);
    }
    if (r.sum === "bad") {
      logEvent("warn", "import.checksum", "Prüfsumme falsch, Import abgelehnt");
      $("#impRes").innerHTML = inspectHtml(r);
      return toast("Backup verändert oder beschädigt. Es wurde nichts übernommen.");
    }
    PENDING = t;
    if (r.kind === "values") {
      const T = clone(S);
      const n = r.values.filter((x) => x && ingest(x.key, x.date, x.value, x.source, T)).length;
      r.preview = { added: n, updated: 0, conflicts: 0, skipped: r.values.length - n };
    }
    importSheet(r);
  } else if (a === "impGo") {
    if (!PENDING) return close();
    const res = await applyImport(PENDING);
    PENDING = null;
    close();
    if (!res.ok) return toast(res.error);
    render();
    toast(res.n + " Einträge übernommen" + (res.conflicts ? " · " + res.conflicts + " Konflikt(e) zu entscheiden" : "") + (res.skipped ? " · " + res.skipped + " ungültig übersprungen" : ""));
  } else if (a === "undoImp") {
    if (!PREIMP) return;
    if (!window._ru) {
      window._ru = 1;
      return toast("Nochmal tippen, um den Stand vom " + new Date(PREIMP.at).toLocaleString("de-DE") + " wiederherzustellen");
    }
    window._ru = 0;
    S = clone(PREIMP.data);
    migrate();
    await aiSave(PREIMP.aitest || []);
    if (!(await save())) return;
    await kvPut("pre-import", null);
    PREIMP = null;
    logEvent("info", "undo.import", "Rückgängig gemacht");
    render();
    toast("Stand vor dem letzten Import wiederhergestellt");
  } else if (a === "cfx") {
    if (resolveConflict(id, b.dataset.v)) {
      await save();
      render();
      toast("Konflikt entschieden");
    }
  } else if (a.startsWith("demo") && IS_TEST && typeof demoAction === "function") demoAction(a);
  else if (a.startsWith("st")) studioAction(a, id, b);
  else if (a === "snaps") snapSheet();
  else if (a === "report") reportSheet();
  else if (a === "wrCopy") {
    try {
      await navigator.clipboard.writeText(val("wr"));
      toast("Wochenbericht kopiert");
    } catch (x) {
      $("#wr").select();
      toast("Markiert. Bitte manuell kopieren.");
    }
  } else if (a === "wrSave") {
    const r = weeklyReport();
    if (S.memory.some((m) => m.active && m.title === "Wochenbericht " + fmt(r.start) + " – " + fmt(r.end))) return toast("Dieser Wochenbericht ist bereits gespeichert");
    const n = { id: uid(), cat: "Ziele", title: "Wochenbericht " + fmt(r.start) + " – " + fmt(r.end), text: r.text, status: "confirmed", date: today(), reason: "Automatisch aus den App-Daten erstellt", result: "", private: false, active: true, createdAt: Date.now(), dev: S.dev };
    touch(n);
    S.memory.push(n);
    await save();
    close();
    render();
    toast("Wochenbericht im Gedächtnis abgelegt");
  } else if (a === "ansTasks") {
    const r = parseActions(val("ans"));
    if (!r.ok) return toast(r.error);
    window._acts = r.items;
    window._prop = null;
    sheet(`<h1>Aufgaben übernehmen</h1><p class="mut">Vorschläge aus der KI-Antwort. Angehakte werden als Aufgaben angelegt. Geschäftliche Entscheidungen (Preise, Zahlungen, Werbung, Verträge) erscheinen unter „Entscheidungen für dich“.</p>${r.items
      .map(
        (it) =>
          `<label class="card" style="display:flex;gap:10px;align-items:flex-start"><input type="checkbox" data-act="${it.n}" ${it.dup ? "" : "checked"} style="width:auto;margin-top:4px"><span><b>${it.n}. ${esc(it.title)}</b><span class="mut" style="display:block">${esc(it.prio)} · ${esc(it.decision ? "Entscheidung nötig" : it.area)}${it.due ? " · Frist " + fmt(it.due) : ""}${it.after ? " · nach Nr. " + it.after : ""}</span>${it.why ? `<span class="mut" style="display:block">${esc(it.why)}</span>` : ""}${it.dup ? `<span class="mut" style="display:block;color:var(--warn)">Ähnliche Aufgabe vorhanden: „${esc(it.dup)}“</span>` : ""}</span></label>`,
      )
      .join("")}<div class="row"><button class="p" data-a="ansApply">Übernehmen</button><button data-a="close">Abbrechen</button></div>`);
  } else if (a === "propOpen") {
    const pr = PROPOSALS.find((x) => x.id === id);
    if (!pr) return toast("Vorschlag nicht mehr vorhanden");
    window._acts = pr.items;
    window._prop = pr.id;
    sheet(`<h1>KI-Vorschläge</h1><p class="mut">Aus der geplanten Wochenanalyse (Einschätzung). Angehakte werden als Aufgaben angelegt; geschäftliche Entscheidungen erscheinen gesondert.</p>${pr.items.map((it) => `<label class="card" style="display:flex;gap:10px;align-items:flex-start"><input type="checkbox" data-act="${it.n}" ${it.dup ? "" : "checked"} style="width:auto;margin-top:4px"><span><b>${it.n}. ${esc(it.title)}</b><span class="mut" style="display:block">${esc(it.prio)} · ${esc(it.decision ? "Entscheidung nötig" : it.area)}${it.due ? " · Frist " + fmt(it.due) : ""}${it.after ? " · nach Nr. " + it.after : ""}</span>${it.why ? `<span class="mut" style="display:block">${esc(it.why)}</span>` : ""}${it.dup ? `<span class="mut" style="display:block;color:var(--warn)">Ähnliche Aufgabe vorhanden: „${esc(it.dup)}“</span>` : ""}</span></label>`).join("")}<div class="row"><button class="p" data-a="ansApply">Übernehmen</button><button data-a="propDrop">Verwerfen</button><button data-a="close">Später</button></div>`);
  } else if (a === "propDrop") {
    PROPOSALS = PROPOSALS.filter((x) => x.id !== window._prop);
    await kvPut("proposals", PROPOSALS);
    close();
    render();
    toast("Vorschläge verworfen");
  } else if (a === "ansApply") {
    const chosen = [...document.querySelectorAll("[data-act]")].filter((e) => e.checked).map((e) => +e.dataset.act);
    if (!chosen.length) return toast("Nichts ausgewählt");
    const r = await act("ai.tasks", "gruender", () => {
      const made = applyActions(window._acts || [], chosen);
      return { ok: true, made, detail: made.length + " Aufgabe(n) aus KI-Antwort" };
    });
    if (window._prop) {
      PROPOSALS = PROPOSALS.filter((x) => x.id !== window._prop);
      await kvPut("proposals", PROPOSALS);
      window._prop = null;
    }
    await save();
    close();
    tab = "tasks";
    render();
    toast(r.made.length + " Aufgabe(n) angelegt");
  } else if (a === "sync" || a.startsWith("sy")) syncAction(a);
  else if (a === "auto" || a.startsWith("au")) autonomyAction(a, id);
  else if (a === "kpi" || a.startsWith("kp")) kpiAction(a);
  else if (a === "msr") {
    const x = await act("measure.start", "gruender", () => startMeasure(id, Number(b.dataset.v)));
    if (!x || x.ok === false) return toast((x && x.error) || "Befund nicht mehr aktuell");
    await save();
    render();
    toast("Maßnahme freigegeben · Prüfung am " + fmt(x.measure.checkAt) + (x.measure.postId ? " · Instagram-Entwurf im Studio" : ""));
  } else if (a === "msrOut") {
    if (finishMeasure(id, b.dataset.v)) {
      await save();
      render();
      toast("Ergebnis festgehalten (im Gedächtnis als Einschätzung)");
    }
  } else if (a === "allMet") {
    showAllMet = !showAllMet;
    render();
  }
  else if (a === "snapRestore") snapRestore(id);
  else if (a === "diag") diagSheet();
  else if (a === "cpDiag") {
    const t = $("#diagTxt");
    try {
      await navigator.clipboard.writeText(t.value);
      toast("Diagnosebericht kopiert");
    } catch (x) {
      t.select();
      toast("Markiert. Bitte manuell kopieren.");
    }
  } else if (a === "clrLog") {
    LOG = [];
    await kvPut("log", LOG);
    diagSheet();
    toast("Protokoll geleert");
  }
});
document.addEventListener("input", (e) => {
  if (e.target.id === "a-x") {
    ai.extra = e.target.value;
    gen();
  }
  if (e.target.id === "pv") chk();
  if (e.target.id === "q") {
    mf.q = e.target.value;
    $("#list").innerHTML = memList();
  }
  if (e.target.id === "ac") {
    S.accent = e.target.value;
    document.documentElement.style.setProperty("--ac", S.accent);
    save();
  }
});
document.addEventListener("change", (e) => {
  if (e.target.id === "a-m") {
    ai.compact = e.target.value === "k";
    gen();
  }
  if (e.target.id === "a-t") {
    ai.tasks = e.target.checked;
    gen();
  }
  if (e.target.id === "a-p") {
    ai.priv = e.target.checked;
    gen();
  }
  if (e.target.id === "hist") {
    mf.hist = e.target.checked;
    $("#list").innerHTML = memList();
  }
});


/* Start: Daten laden, vor jedem Datenversions-Update eine geprüfte Sicherheitskopie anlegen, migrieren. */
(async () => {
  await loadLog();
  await loadActions();
  await loadProposals();
  await loadAutoState();
  try {
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  } catch (e) {}
  let raw = await load();
  // Beschädigte Gerätedaten: Original aufbewahren, reparieren oder letzten intakten Sicherungspunkt verwenden
  const health = checkState(raw);
  if (health.bad || health.junk) {
    await kvPut("corrupt-last", { at: Date.now(), raw });
    if (health.bad) {
      let restored = null;
      for (const d of (await kvGet("snaps")) || []) {
        const s = await kvGet("snap-" + d);
        if (s && s.data && !checkState(s.data).bad) {
          raw = repairState(clone(s.data));
          restored = d;
          break;
        }
      }
      if (!restored) raw = null;
      logEvent("error", "storage.corrupt", restored ? "Daten beschädigt – Sicherungspunkt " + restored + " verwendet" : "Daten beschädigt – kein Sicherungspunkt");
      setTimeout(() => toast(restored ? "Gespeicherte Daten waren beschädigt. Stand vom " + fmt(restored) + " wiederhergestellt (Original aufbewahrt)." : "Gespeicherte Daten waren beschädigt und wurden aufbewahrt. Bitte Diagnose öffnen."), 900);
    } else {
      raw = repairState(raw);
      logEvent("warn", "storage.repair", health.junk + " beschädigte Einträge entfernt");
      setTimeout(() => toast(health.junk + " beschädigte Einträge entfernt (Original aufbewahrt)"), 900);
    }
    if (raw) await kvPut("state", raw);
  }
  const from = raw ? raw.v || 1 : SCHEMA;
  if (raw && from < SCHEMA) {
    const key = "safety-v" + from;
    if (!(await kvGet(key))) {
      const ok = await kvPut(key, { at: Date.now(), from, to: SCHEMA, data: raw });
      const chk = ok && (await kvGet(key));
      if (!chk || JSON.stringify(chk.data) !== JSON.stringify(raw)) {
        logEvent("error", "migration.safety", "Sicherheitskopie nicht bestätigt");
        setTimeout(() => toast("Achtung: Sicherheitskopie nicht bestätigt. Bitte jetzt ein Backup kopieren."), 800);
      }
    }
    logEvent("info", "migration", "Datenversion " + from + " → " + SCHEMA);
  }
  for (let v = SCHEMA - 1; v >= 1 && !SAFE; v--) SAFE = await kvGet("safety-v" + v);
  PREIMP = await kvGet("pre-import");
  S = raw || { v: SCHEMA, dev: uid(), memory: [], tasks: [], accent: "", lastBackup: "" };
  let ch = migrate();
  if (detectForks(S)) ch = true;
  // Autonomie-Zyklus: Entwürfe aus bestätigten Fakten, Freigaben nur mit Berechtigung, Bericht unter „Mehr › Autonomie“
  try {
    const cyc = await runCycle("start");
    const n = (k) => (cyc.steps.find((s) => s.k === k) || {}).n || 0;
    if (n("entwuerfe")) (ch = true), logEvent("info", "studio.auto", n("entwuerfe") + " Entwurf/Entwürfe automatisch erstellt");
    if (n("freigaben")) ch = true;
  } catch (e) {
    logEvent("error", "cycle", (e && e.message) || "Zyklus fehlgeschlagen");
  }
  if (ch) await save();
  await autoSnapshot();
  LASTSNAP = ((await kvGet("snaps")) || [])[0] || null;
  try {
    render();
  } catch (e) {
    // Notfallansicht: Daten bleiben unberührt; Wiederherstellung und Diagnose bleiben erreichbar
    logEvent("error", "render", (e && e.message) || "Anzeige fehlgeschlagen");
    $("#app").innerHTML = '<h1>Vivalink Management AI</h1><div class="card rec bad">Die Ansicht konnte nicht angezeigt werden. Deine Daten sind gespeichert.</div><div class="row"><button class="p" data-a="snaps">Sicherungspunkt wiederherstellen</button><button data-a="diag">Diagnose</button></div>';
  }
  syncSoon(1500);
  window.VL_READY = true; // Start vollständig abgeschlossen (für Tests und Diagnose)
  // Wieder geöffnet (App lag im Hintergrund): Zyklus höchstens alle 6 Stunden erneut
  document.addEventListener("visibilitychange", async () => {
    if (document.visibilityState !== "visible") return;
    const last = await kvGet("cycle-last");
    if (last && Date.now() - last.at < 6 * 3600e3) return;
    try {
      await runCycle("wieder geöffnet");
      await save();
      if ($("#sheet").hidden) render();
    } catch (e) {
      logEvent("error", "cycle", (e && e.message) || "Zyklus fehlgeschlagen");
    }
  });
  if ("serviceWorker" in navigator)
    navigator.serviceWorker.register("sw.js").catch((e) => logEvent("warn", "sw.register", (e && e.message) || "Registrierung fehlgeschlagen"));
})();
