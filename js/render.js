/* Instagram-Grafiken: zeichnet fertige Beitragsbilder (Feed 1080×1350, Story 1080×1920)
   mit dem offiziellen Logo, dem originalen Logo-Verlauf und der Schrift Nunito (lokal, offline, ohne Fremdserver).
   Story-Vorlagen halten die Bereiche frei, die Instagram mit Profilbild, Fortschrittsbalken und Antwortfeld überdeckt. */
const SIZE = { feed: [1080, 1350], story: [1080, 1920] };
/* Sichere Bereiche (Pixel bei 1080 Breite). Story: oben Profil/Fortschritt, unten Antwortfeld und Reaktionen. */
const ZONES = { feed: { top: 96, bottom: 96, side: 88 }, story: { top: 270, bottom: 400, side: 96 } };
/* Profilraster zeigt Feed-Bilder im Format 3:4 → links und rechts je ca. 34 px abgeschnitten */
const GRID_CROP = 34;
/* Verlauf entlang der Bögen des offiziellen Logos abgetastet (Pink → Magenta → Violett → Rosé → Orange) */
const LOGO_STOPS = [
  [0, "#F70960"],
  [0.1, "#F80A67"],
  [0.2, "#F30988"],
  [0.3, "#B208AF"],
  [0.4, "#7A05CF"],
  [0.5, "#5C0AD7"],
  [0.6, "#9605BE"],
  [0.7, "#EE2278"],
  [0.8, "#FA5930"],
  [0.9, "#FC780E"],
  [1, "#FB7F0C"],
];
const INK = { dark: "#15111c", grey: "#4a4752", tint: "#f6f0ff", night: "#16111f", deep: "#3a0a8c" };

let ASSETS = null;
function brandAssets() {
  if (ASSETS) return ASSETS;
  const font = async (w) => {
    try {
      const f = new FontFace("Nunito", `url(brand/nunito-latin-${w}-normal.woff2)`, { weight: String(w) });
      document.fonts.add(await f.load());
    } catch (e) {
      logEvent("warn", "studio.font", "Schrift " + w + " nicht geladen");
    }
  };
  ASSETS = Promise.all([loadImg("brand/vivalink-logo.png"), loadImg("brand/vivalink-logo-weiss.png"), loadImg("brand/vivalink-symbol.png"), loadImg("brand/vivalink-symbol-weiss.png"), font(400), font(700), font(800)]).then(
    ([logo, logoW, sym, symW]) => ({ logo, logoW, sym, symW }),
  );
  return ASSETS;
}
function loadImg(src) {
  return new Promise((ok) => {
    const i = new Image();
    i.onload = () => ok(i);
    i.onerror = () => {
      logEvent("warn", "studio.asset", String(src).slice(0, 40));
      ok(null);
    };
    i.src = src;
  });
}

/* ---------- Eigene Fotos: nur auf diesem Gerät, verkleinert, nicht im Backup ---------- */
const PHOTOS = new Map();
async function savePhoto(file) {
  const url = URL.createObjectURL(file);
  try {
    const im = await loadImg(url);
    if (!im || !im.width) return { ok: false, error: "Das Bild konnte nicht gelesen werden" };
    const k = Math.min(1, 1600 / Math.max(im.width, im.height));
    const c = document.createElement("canvas");
    c.width = Math.round(im.width * k);
    c.height = Math.round(im.height * k);
    c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
    const d = c.toDataURL("image/jpeg", 0.86);
    const id = "ph-" + uid();
    if (!(await kvPut("media:" + id, { d, w: c.width, h: c.height, at: Date.now() }))) return { ok: false, error: "Speicher voll – Bild nicht gespeichert" };
    PHOTOS.delete(id);
    return { ok: true, id, w: c.width, h: c.height };
  } finally {
    URL.revokeObjectURL(url);
  }
}
async function loadPhoto(id) {
  if (!id) return null;
  if (!PHOTOS.has(id))
    PHOTOS.set(
      id,
      kvGet("media:" + id).then((m) => (m && typeof m.d === "string" && m.d.startsWith("data:image/") ? loadImg(m.d) : null)),
    );
  return PHOTOS.get(id);
}
async function delPhoto(id) {
  PHOTOS.delete(id);
  await kvPut("media:" + id, null);
}
/* Foto nur verwenden, wenn die Einwilligung bestätigt ist */
const photoOk = (p) => !!(p && p.photo && p.photo.id && p.photo.consent);

/* ---------- Zeichenhilfen ---------- */
const FF = (w, s) => `${w} ${s}px Nunito, -apple-system, "Helvetica Neue", Arial, sans-serif`;
function wrap(ctx, text, maxW) {
  const out = [];
  for (const para of String(text || "").split("\n")) {
    let line = "";
    for (const w of para.split(/\s+/).filter(Boolean)) {
      const t = line ? line + " " + w : w;
      if (ctx.measureText(t).width > maxW && line) {
        out.push(line);
        line = w;
      } else line = t;
    }
    out.push(line);
  }
  return out;
}
/* Größte Schrift, bei der der Text in den Rahmen passt */
function fit(ctx, text, maxW, maxH, max, min, weight, lh = 1.18) {
  for (let s = max; s >= min; s -= 2) {
    ctx.font = FF(weight, s);
    const lines = wrap(ctx, text, maxW);
    if (lines.length * s * lh <= maxH && lines.every((l) => ctx.measureText(l).width <= maxW)) return { s, lines, lh, w: weight };
  }
  ctx.font = FF(weight, min);
  return { s: min, lines: wrap(ctx, text, maxW), lh, w: weight };
}
function draw(ctx, f, x, y, color, weight, align = "left") {
  ctx.font = FF(weight || f.w, f.s);
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "top";
  f.lines.forEach((l, i) => ctx.fillText(l, x, y + i * f.s * f.lh));
  return y + f.lines.length * f.s * f.lh;
}
const blockH = (f) => (f ? f.lines.length * f.s * f.lh : 0);
const isDefaultColors = (c) => c && c.pink === BRAND_DEFAULT.colors.pink && c.violet === BRAND_DEFAULT.colors.violet && c.orange === BRAND_DEFAULT.colors.orange;
/* Verlauf wie im Logo. Eigene (geänderte) Markenfarben ersetzen die abgetasteten Töne. */
function grad(ctx, x0, y0, x1, y1, c) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  const stops = isDefaultColors(c) ? LOGO_STOPS : [[0, c.pink], [0.3, c.magenta || c.pink], [0.5, c.violet], [0.72, c.rose || c.pink], [1, c.orange]];
  for (const [o, col] of stops) g.addColorStop(o, col);
  return g;
}
function rr(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function img(ctx, im, x, y, w, align = "left") {
  if (!im) return 0;
  const h = (im.height / im.width) * w;
  ctx.drawImage(im, align === "center" ? x - w / 2 : align === "right" ? x - w : x, y, w, h);
  return h;
}
/* Bild füllend zuschneiden (wie CSS object-fit: cover) */
function coverImg(ctx, im, x, y, w, h) {
  const k = Math.max(w / im.width, h / im.height),
    sw = w / k,
    sh = h / k;
  ctx.drawImage(im, (im.width - sw) / 2, (im.height - sh) / 2, sw, sh, x, y, w, h);
}
/* Dekorative Bögen in Anlehnung an das Logo */
function ring(ctx, cx, cy, r, lw, alpha, c) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = grad(ctx, cx - r, cy - r, cx + r, cy + r, c);
  ctx.lineWidth = lw;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}
function pill(ctx, text, cx, y, maxW, fill, color, size = 44) {
  ctx.font = FF(800, size);
  let s = size;
  while (ctx.measureText(text).width + 110 > maxW && s > 30) ctx.font = FF(800, (s -= 2));
  const w = Math.min(maxW, ctx.measureText(text).width + 110),
    h = Math.round(s * 2.4);
  ctx.fillStyle = fill;
  rr(ctx, cx - w / 2, y, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, cx, y + h / 2 + 2);
  return h;
}

/* ---------- Gestaltungen ---------- */
/* hero = farbige Flächen (Titel, Frage, Abschluss); sonst helle bzw. dunkle Inhaltsfolien */
function theme(G, hero) {
  const { ctx, W, H, c, A } = G,
    v = G.v;
  const dark = v === 3 || (hero && (v === 0 || v === 1));
  const t = { dark, fg: dark ? "#ffffff" : INK.dark, sub: dark ? "rgba(255,255,255,.92)" : INK.grey, logo: dark ? A.logoW : A.logo, sym: dark ? A.symW : A.sym };
  t.accent = grad(ctx, 0, 0, W, H, c);
  t.pillFill = dark && v !== 3 ? "#ffffff" : t.accent;
  t.pillText = dark && v !== 3 ? c.violet : "#ffffff";
  t.paint = () => {
    if (hero && v === 0) {
      ctx.fillStyle = grad(ctx, 0, 0, W, H, c);
      ctx.fillRect(0, 0, W, H);
      ring(ctx, W * 0.92, H * 0.1, W * 0.36, 70, 0.16, { ...c, pink: "#ffffff", violet: "#ffffff", orange: "#ffffff", magenta: "#ffffff", rose: "#ffffff" });
    } else if (hero && v === 1) {
      const g = ctx.createLinearGradient(0, 0, W * 0.4, H);
      g.addColorStop(0, c.violet);
      g.addColorStop(1, INK.deep);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ring(ctx, W * 1.02, H * 0.92, W * 0.5, 90, 0.85, c);
    } else if (v === 3) {
      ctx.fillStyle = INK.night;
      ctx.fillRect(0, 0, W, H);
      ring(ctx, -W * 0.08, H * 0.08, W * 0.32, 60, 0.9, c);
      ring(ctx, W * 1.05, H * 0.96, W * 0.42, 60, 0.5, c);
    } else if (v === 1) {
      ctx.fillStyle = INK.tint;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = grad(ctx, 0, 0, 0, H, c);
      ctx.fillRect(0, 0, 22, H);
    } else if (v === 2) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, W, H);
      ring(ctx, W * 0.98, H * 0.02, W * 0.3, 54, 0.95, c);
    } else {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = grad(ctx, 0, 0, W, 0, c);
      ctx.fillRect(0, 0, W, 24);
    }
  };
  return t;
}

/* ---------- Vorlagen ---------- */
function renderSlide(post, i, A, story = false, opt = {}) {
  const [W, H] = SIZE[story ? "story" : "feed"];
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext("2d");
  const b = (typeof S !== "undefined" && S.studio && S.studio.brand) || BRAND_DEFAULT;
  const z = ZONES[story ? "story" : "feed"];
  const sl = post.slides[i] || post.slides[0] || {};
  const G = {
    ctx,
    W,
    H,
    A,
    c: b.colors,
    story,
    post,
    sl,
    i,
    n: story ? 1 : post.slides.length,
    v: Math.max(0, Math.min(DESIGNS.length - 1, Number(post.variant) || 0)),
    P: z.side,
    top: z.top,
    bottom: H - z.bottom,
    site: b.website || "vivalink.me",
    photo: photoOk(post) ? opt.photo || null : null,
  };
  G.min = story ? 40 : 32; // Mindestschrift für Lesbarkeit auf dem Telefon
  let tpl = sl.template || "cover";
  if (tpl === "foto" && !G.photo) tpl = "cover";
  (SLIDE_TPL[tpl] || SLIDE_TPL.cover)(G);
  if (opt.guides) guides(G);
  return cv;
}
/* Fußzeile: Symbol, Website, Foliennummer */
function footer(G, t) {
  const { ctx, W, P, bottom, n, i, site } = G;
  img(ctx, t.sym, P, bottom - 58, 150);
  ctx.font = FF(700, G.story ? 40 : 34);
  ctx.fillStyle = t.sub;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = n > 1 ? "center" : "right";
  ctx.fillText(site, n > 1 ? W / 2 : W - P, bottom);
  if (n > 1) {
    ctx.textAlign = "right";
    ctx.fillText(`${i + 1}/${n}`, W - P, bottom);
  }
}
/* Mehrere Textblöcke senkrecht mittig im freien Bereich anordnen */
function stack(G, blocks, y0, y1, align = "left") {
  let k2 = 1;
  const gap = (b) => (b.gap != null ? b.gap : 36) * k2;
  const sum = () => blocks.reduce((a, b, k) => a + b.h + (k ? gap(b) : 0), 0);
  // Zu wenig Platz: zuerst entbehrliche Elemente (z. B. Logo) weglassen, dann Abstände verkleinern
  while (sum() > y1 - y0 && blocks.some((b) => b.optional)) blocks.splice(blocks.findIndex((b) => b.optional), 1);
  while (sum() > y1 - y0 && k2 > 0.3) k2 -= 0.1;
  const total = sum();
  let y = y0 + Math.max(0, (y1 - y0 - total) / 2);
  blocks.forEach((b, k) => {
    if (k) y += gap(b);
    b.paint(y, align);
    y += b.h;
  });
  return y;
}
const textBlock = (G, f, color, x, align) => ({ h: blockH(f), paint: (y) => draw(G.ctx, f, x != null ? x : align === "center" ? G.W / 2 : G.P, y, color, f.w, align) });

const SLIDE_TPL = {
  cover(G) {
    const { ctx, W, P, top, bottom, sl, post, story, n } = G;
    const t = theme(G, true);
    t.paint();
    const cw = W - 2 * P;
    img(ctx, t.sym, P, top, story ? 210 : 190);
    const ti = fit(ctx, sl.title || post.hook, cw, (bottom - top) * 0.5, story ? 132 : 124, story ? 64 : 56, 800, 1.08);
    const tx = sl.text ? fit(ctx, sl.text, cw, story ? 360 : 280, story ? 60 : 54, G.min, 700, 1.25) : null;
    const bar = { h: 16, gap: 34, paint: (y) => ((ctx.fillStyle = t.dark ? "#ffffff" : t.accent), rr(ctx, P, y, 240, 16, 8), ctx.fill()) };
    const blocks = [textBlock(G, ti, t.fg), bar];
    if (tx) blocks.push(textBlock(G, tx, t.sub));
    stack(G, blocks, top + 260, bottom - 120);
    ctx.font = FF(800, story ? 44 : 38);
    ctx.fillStyle = t.fg;
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    ctx.fillText(G.site, P, bottom);
    if (n > 1) {
      ctx.textAlign = "right";
      ctx.fillText("Wischen →", W - P, bottom);
    }
  },
  frage(G) {
    const { ctx, W, P, top, bottom, sl, story } = G;
    const t = theme(G, true);
    t.paint();
    ctx.save();
    ctx.globalAlpha = t.dark ? 0.14 : 1;
    ctx.font = FF(800, story ? 520 : 440);
    ctx.fillStyle = t.dark ? "#ffffff" : t.accent;
    if (!t.dark) ctx.globalAlpha = 0.18;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText("?", W / 2, top - (story ? 0 : 60));
    ctx.restore();
    const ti = fit(ctx, sl.title, W - 2 * P, (bottom - top) * 0.45, story ? 116 : 104, story ? 60 : 52, 800, 1.1);
    const tx = sl.text ? fit(ctx, sl.text, W - 2 * P, story ? 320 : 240, story ? 58 : 50, G.min, 700, 1.25) : null;
    const blocks = [textBlock(G, ti, t.fg, null, "center")];
    if (tx) blocks.push(textBlock(G, tx, t.sub, null, "center"));
    if (story) blocks.push({ h: 90, gap: 60, paint: (y) => pill(ctx, "Antworte uns ↓", W / 2, y, W - 2 * P, t.pillFill, t.pillText, 38) });
    const lh = t.logo ? (t.logo.height / t.logo.width) * 280 : 0;
    stack(G, blocks, top + 40, bottom - lh - 60, "center");
    img(ctx, t.logo, W / 2, bottom - lh, 280, "center");
  },
  abschluss(G) {
    const { ctx, W, P, top, bottom, sl, story } = G;
    const t = theme(G, true);
    t.paint();
    const lw = story ? 600 : 540;
    const lh = t.logo ? (t.logo.height / t.logo.width) * lw : 0;
    const ti = fit(ctx, sl.title || "Lerne neue Menschen kennen", W - 2 * P, 320, story ? 100 : 92, story ? 56 : 48, 800);
    const tx = sl.text ? fit(ctx, sl.text, W - 2 * P, 260, story ? 56 : 50, G.min, 700, 1.25) : null;
    const blocks = [{ h: lh, paint: (y) => img(ctx, t.logo, W / 2, y, lw, "center") }, { ...textBlock(G, ti, t.fg, null, "center"), gap: 80 }];
    if (tx) blocks.push(textBlock(G, tx, t.sub, null, "center"));
    blocks.push({ h: 110, gap: 70, paint: (y) => pill(ctx, G.site, W / 2, y, W - 2 * P, t.pillFill, t.pillText, 46) });
    stack(G, blocks, top, bottom - 40, "center");
    if (G.n > 1) {
      ctx.font = FF(700, 34);
      ctx.fillStyle = t.sub;
      ctx.textAlign = "right";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(`${G.i + 1}/${G.n}`, W - P, bottom);
    }
  },
  tipp(G) {
    contentSlide(G, "tipp");
  },
  info(G) {
    contentSlide(G, "info");
  },
  rueckblick(G) {
    if (G.photo) return SLIDE_TPL.foto(G);
    contentSlide(G, "rueckblick");
  },
  ankuendigung(G) {
    meetupCard(G, false);
  },
  erinnerung(G) {
    meetupCard(G, true);
  },
  foto(G) {
    const { ctx, W, H, P, top, bottom, sl, story, photo, post } = G;
    const t = theme(G, false);
    const split = !story && G.v % 2 === 1;
    if (split) {
      t.paint();
      const ph = Math.round(H * 0.56);
      coverImg(ctx, photo, 0, 0, W, ph);
      ctx.fillStyle = grad(ctx, 0, 0, W, 0, G.c);
      ctx.fillRect(0, ph, W, 14);
      const ti = fit(ctx, sl.title || post.hook, W - 2 * P, 260, 92, 48, 800, 1.1);
      const tx = sl.text ? fit(ctx, sl.text, W - 2 * P, 200, 48, G.min, 400, 1.3) : null;
      const blocks = [textBlock(G, ti, t.fg)];
      if (tx) blocks.push(textBlock(G, tx, t.sub));
      stack(G, blocks, ph + 50, bottom - 90);
      footer(G, t);
      return;
    }
    coverImg(ctx, photo, 0, 0, W, H);
    const g = ctx.createLinearGradient(0, H * 0.35, 0, H);
    g.addColorStop(0, "rgba(10,6,20,0)");
    g.addColorStop(1, "rgba(10,6,20,.82)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    const tg = ctx.createLinearGradient(0, 0, 0, top + 200);
    tg.addColorStop(0, "rgba(10,6,20,.45)");
    tg.addColorStop(1, "rgba(10,6,20,0)");
    ctx.fillStyle = tg;
    ctx.fillRect(0, 0, W, top + 200);
    img(ctx, G.A.logoW, P, top, story ? 300 : 260);
    const ti = fit(ctx, sl.title || post.hook, W - 2 * P, story ? 420 : 340, story ? 104 : 96, story ? 56 : 48, 800, 1.1);
    const tx = sl.text ? fit(ctx, sl.text, W - 2 * P, story ? 260 : 200, story ? 54 : 46, G.min, 700, 1.25) : null;
    const hh = blockH(ti) + (tx ? 30 + blockH(tx) : 0);
    let y = bottom - 110 - hh;
    ctx.fillStyle = grad(ctx, 0, 0, W, 0, G.c);
    rr(ctx, P, y - 44, 200, 14, 7);
    ctx.fill();
    y = draw(ctx, ti, P, y, "#ffffff", 800);
    if (tx) draw(ctx, tx, P, y + 30, "rgba(255,255,255,.94)", 700);
    ctx.font = FF(800, story ? 44 : 38);
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(G.site, P, bottom);
    if (G.n > 1) {
      ctx.textAlign = "right";
      ctx.fillText(`${G.i + 1}/${G.n}`, W - P, bottom);
    }
  },
};
/* Inhaltsfolien: Tipp (Nummer), Info (Liste), Rückblick (Rahmen) */
function contentSlide(G, kind) {
  const { ctx, W, H, P, top, bottom, sl, story } = G;
  const t = theme(G, false);
  t.paint();
  if (kind === "rueckblick") {
    ctx.strokeStyle = grad(ctx, 0, 0, W, H, G.c);
    ctx.lineWidth = 26;
    rr(ctx, 40, 40, W - 80, H - 80, 60);
    ctx.stroke();
  }
  const y0 = top + 30,
    y1 = bottom - 120,
    avail = y1 - y0,
    cw = W - 2 * P;
  const ti = fit(ctx, sl.title, cw, avail * 0.4, story ? 112 : 104, story ? 58 : 52, 800, 1.12);
  const items =
    kind === "info"
      ? String(sl.text || "")
          .split(/\n|•/)
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 6)
      : [];
  const fi = items.map((it) => fit(ctx, it, cw - 76, story ? 300 : 240, story ? 62 : 56, G.min, 700, 1.22));
  const tx = kind !== "info" && sl.text ? fit(ctx, sl.text, cw, avail * 0.5, story ? 66 : 60, G.min, 400, 1.35) : null;
  const blocks = [];
  if (kind === "tipp") {
    const num = String(Math.max(1, G.i));
    blocks.push({
      h: 150,
      paint: (y) => {
        ctx.fillStyle = t.accent;
        ctx.beginPath();
        ctx.arc(P + 72, y + 72, 72, 0, Math.PI * 2);
        ctx.fill();
        ctx.font = FF(800, 76);
        ctx.fillStyle = "#fff";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(num, P + 72, y + 78);
      },
    });
  }
  blocks.push({ ...textBlock(G, ti, t.fg), gap: 44 });
  if (fi.length)
    blocks.push({
      gap: 44,
      h: fi.reduce((a, f) => a + blockH(f), 0) + (fi.length - 1) * 38,
      paint: (y) => {
        for (const f of fi) {
          ctx.fillStyle = t.accent;
          ctx.beginPath();
          ctx.arc(P + 18, y + f.s * 0.62, 18, 0, Math.PI * 2);
          ctx.fill();
          y = draw(ctx, f, P + 66, y, t.sub, 700) + 38;
        }
      },
    });
  if (tx) blocks.push({ ...textBlock(G, tx, t.sub), gap: 44 });
  stack(G, blocks, y0, y1);
  footer(G, t);
}
/* Meetup-Ankündigung und -Erinnerung: Datum und Ort nur aus den Folien-Details (aus den Meetup-Daten) */
function meetupCard(G, remind) {
  const { ctx, W, P, top, bottom, sl, story, post } = G;
  const t = theme(G, false);
  t.paint();
  const cw = W - 2 * P;
  const blocks = [];
  const lw = story ? 400 : 360;
  const lh = t.logo ? (t.logo.height / t.logo.width) * lw : 0;
  blocks.push({ h: lh, optional: true, paint: (y) => img(ctx, t.logo, W / 2, y, lw, "center") });
  if (remind) {
    const d = post.meetupDate && post.date ? Math.round((new Date(post.meetupDate + "T12:00") - new Date(post.date + "T12:00")) / 864e5) : null;
    const big = d === 0 ? "Heute" : d === 1 ? "Morgen" : d > 1 && d < 15 ? `In ${d} Tagen` : sl.title || "Bald ist es so weit";
    const f = fit(ctx, big, cw, 260, story ? 150 : 132, 64, 800, 1.05);
    blocks.push({
      h: blockH(f),
      gap: 60,
      paint: (y) => {
        ctx.font = FF(800, f.s);
        ctx.fillStyle = t.dark ? "#ffffff" : grad(ctx, P, 0, W - P, 0, G.c);
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        f.lines.forEach((l, k) => ctx.fillText(l, W / 2, y + k * f.s * f.lh));
      },
    });
    if (sl.title && big !== sl.title) blocks.push(textBlock(G, fit(ctx, sl.title, cw, 140, 60, 40, 800), t.fg, null, "center"));
  }
  const label = remind ? null : fit(ctx, sl.title || "Nächstes Meetup", cw - 2 * P, 130, story ? 70 : 64, 40, 800);
  const det = fit(ctx, sl.details || "", cw - 2 * P, story ? 420 : 300, story ? 76 : 70, 40, 800, 1.25);
  const ch = 80 + (label ? blockH(label) + 36 : 0) + blockH(det) + 80;
  blocks.push({
    h: ch,
    gap: remind ? 40 : 70,
    paint: (y) => {
      ctx.fillStyle = grad(ctx, P, y, W - P, y + ch, G.c);
      rr(ctx, P, y, cw, ch, 48);
      ctx.fill();
      let yy = y + 80;
      if (label) yy = draw(ctx, label, W / 2, yy, "rgba(255,255,255,.92)", 800, "center") + 36;
      draw(ctx, det, W / 2, yy, "#fff", 800, "center");
    },
  });
  if (sl.text) blocks.push({ ...textBlock(G, fit(ctx, sl.text, cw, 200, story ? 56 : 50, G.min, 700, 1.25), t.sub, null, "center"), gap: 50 });
  const cta = "Infos & Anmeldung: " + G.site;
  blocks.push({ h: 106, gap: 60, paint: (y) => pill(ctx, cta, W / 2, y, cw, t.accent, "#ffffff", 42) });
  stack(G, blocks, top, bottom, "center");
}
/* Hilfslinien nur für die Vorschau (nie im exportierten Bild) */
function guides(G) {
  const { ctx, W, H, top, bottom, story } = G;
  ctx.save();
  ctx.fillStyle = "rgba(255,0,60,.22)";
  ctx.strokeStyle = "rgba(255,0,60,.9)";
  ctx.setLineDash([18, 12]);
  ctx.lineWidth = 4;
  ctx.font = FF(800, 34);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (story) {
    ctx.fillRect(0, 0, W, top);
    ctx.fillRect(0, bottom, W, H - bottom);
    ctx.strokeRect(2, top, W - 4, bottom - top);
    ctx.fillStyle = "#fff";
    ctx.fillText("Profil und Fortschritt (frei halten)", W / 2, top / 2);
    ctx.fillText("Antwortfeld und Reaktionen (frei halten)", W / 2, bottom + (H - bottom) / 2);
  } else {
    ctx.fillRect(0, 0, GRID_CROP, H);
    ctx.fillRect(W - GRID_CROP, 0, GRID_CROP, H);
    ctx.strokeRect(GRID_CROP, 2, W - 2 * GRID_CROP, H - 4);
  }
  ctx.restore();
}
async function renderPost(post, story = false, opt = {}) {
  const A = await brandAssets();
  const photo = photoOk(post) ? await loadPhoto(post.photo.id) : null;
  return post.slides.map((_, i) => renderSlide(post, i, A, story, { ...opt, photo }));
}
const toBlob = (cv, type = "image/png") => new Promise((ok) => cv.toBlob((b) => ok(b), type, 0.92));
/* type "image/jpeg": für die Instagram-Schnittstelle (verlangt JPEG); Teilen/Speichern nutzt PNG */
async function postFiles(post, story = false, type = "image/png") {
  const cvs = await renderPost(post, story);
  const base = `vivalink-${post.date || today()}-${(post.title || "beitrag").toLowerCase().replace(/[^a-z0-9äöüß]+/g, "-").replace(/^-|-$/g, "").slice(0, 40)}${story ? "-story" : ""}`;
  const out = [];
  for (let i = 0; i < cvs.length; i++) {
    const b = await toBlob(cvs[i], type);
    out.push(new File([b], `${base}${cvs.length > 1 ? "-" + (i + 1) : ""}.${type === "image/jpeg" ? "jpg" : "png"}`, { type }));
  }
  return out;
}
