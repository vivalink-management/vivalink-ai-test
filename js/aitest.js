/* KI-Test: eigener Speicherplatz, berührt keine Unternehmensdaten */
const RL = ["Lief stabil", "Tempo", "Deutsch", "Instagram-Ideen", "Problemanalyse", "Gedächtnis"];
const PROMPTS = [
  [
    "Deutsch und Stil",
    "Erkläre in 4 einfachen deutschen Sätzen, was ein Meetup-Organisator tun sollte, damit neue Teilnehmer wiederkommen.",
  ],
  [
    "Instagram-Ideen",
    "Du bist Social-Media-Berater für „Vivalink“, ein Unternehmen, das Meetups organisiert. Entwickle 5 verschiedene Instagram-Beitragsideen auf Deutsch. Für jede: Thema, Format (Karussell, Reel oder Einzelbild), ein Hook-Satz und eine kurze Caption. Die Ideen sollen sich deutlich voneinander unterscheiden.",
  ],
  [
    "Problemanalyse",
    "Problem: Die Anmeldungen für unser nächstes Meetup liegen 40 % unter dem Plan. Nenne die 3 wahrscheinlichsten Ursachen, wie ich jede prüfen kann, und eine konkrete Maßnahme pro Ursache für die nächste Woche. Antworte auf Deutsch.",
  ],
];
function memPrompt() {
  const act = S.memory.filter((m) => m.active);
  const ctx = (
    act.length
      ? act
          .map(
            (m) =>
              `- [${m.cat}, ${stl(m.status).slice(2)}, ${m.date}] ${m.title}: ${m.text}${m.reason ? " Begründung: " + m.reason : ""}${m.result ? " Ergebnis: " + m.result : ""}`,
          )
          .join("\n")
      : "(noch keine Einträge)"
  ).slice(0, 3000);
  return `Du bist der Unternehmensassistent von Vivalink. Nutze NUR die folgenden Informationen. Wenn etwas fehlt, sage ausdrücklich „Das weiß ich nicht“. Unterscheide bestätigte Fakten von Einschätzungen.\n\nUnternehmensgedächtnis:\n${ctx}\n\nAufgabe: Fasse zusammen, was du über Vivalink weißt, und nenne 3 Dinge, die dir noch fehlen. Danach: Was sollte ich als Nächstes verbessern? Begründe es mit den Einträgen oben.`;
}
const aiLoad = async () => (await kvGet("aitest")) || [];
const aiSave = async (l) => {
  const ok = await kvPut("aitest", l);
  if (!ok) {
    logEvent("error", "storage.aitest", "KI-Testergebnis nicht gespeichert");
    toast("Speichern auf diesem Gerät nicht möglich");
  }
  return ok;
};
async function gpuInfo() {
  if (!("gpu" in navigator)) return "WebGPU nicht verfügbar";
  try {
    const a = await navigator.gpu.requestAdapter();
    if (!a) return "WebGPU ohne Grafikadapter";
    return (
      "WebGPU ok · f16: " +
      (a.features.has("shader-f16") ? "ja" : "nein") +
      " · max. Puffer: " +
      Math.round(a.limits.maxBufferSize / 1048576) +
      " MB"
    );
  } catch (e) {
    return "WebGPU-Fehler";
  }
}
async function aiSheet() {
  const g = await gpuInfo(),
    l = await aiLoad(),
    P = PROMPTS.concat([["Unternehmensgedächtnis", memPrompt()]]);
  sheet(
    `<h1>KI-Test</h1><div class="card">${esc(g)}</div><p class="mut">Öffne chat.webllm.ai in Safari, lade ein Modell, kopiere die vier Testfragen von hier hinein und trage unten dein Ergebnis ein.</p>` +
      P.map(
        (p, i) =>
          `<div class="card"><b>${i + 1}. ${p[0]}</b><textarea id="pt${i}" readonly>${esc(p[1])}</textarea><button class="s" data-a="cpy" data-id="${esc(i)}">Kopieren</button></div>`,
      ).join("") +
      `<h2>Ergebnis festhalten</h2><label>Gerät</label><select id="a-dev">${opts(["iPhone 16 Pro", "iPad (A16)"])}</select><label>Modellname (wie in der Auswahl angezeigt)</label><input id="a-mod"><label>Sekunden bis das Modell geladen war</label><input id="a-load" inputmode="decimal"><label>Sekunden bis die Instagram-Antwort komplett war</label><input id="a-ans" inputmode="decimal"><label>Tokens pro Sekunde (falls angezeigt)</label><input id="a-tps" inputmode="decimal">` +
      RL.map(
        (n, i) =>
          `<label>${n} (1 schlecht, 5 sehr gut)</label><select id="a-r${i}">${opts(["–", "1", "2", "3", "4", "5"])}</select>`,
      ).join("") +
      `<label>Notizen</label><textarea id="a-note"></textarea><div class="row"><button class="p" data-a="saveAi">Ergebnis speichern</button><button data-a="close">Schließen</button></div><h2>Gespeicherte Ergebnisse</h2>` +
      (l.length
        ? l
            .map(
              (x) =>
                `<div class="card"><b>${esc(x.device)} · ${esc(x.model)}</b><div class="mut">Laden ${esc(x.load)} s · Antwort ${esc(x.ans)} s · ${esc(x.tps)} Tokens/s</div><div>${RL.map((n, i) => n + " " + esc(x.r[i])).join(" · ")}</div>${x.note ? `<div class="mut">${esc(x.note)}</div>` : ""}</div>`,
            )
            .join("") + '<button data-a="cpAi">Alle Ergebnisse kopieren</button>'
        : '<p class="mut">Noch keine Ergebnisse.</p>'),
  );
}
