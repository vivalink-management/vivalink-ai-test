/* Instagram-Grafiken: zeichnet fertige Beitragsbilder (Feed 1080×1350, Story 1080×1920)
   mit dem offiziellen Logo, den Markenfarben und der Schrift Nunito (lokal, offline, ohne Fremdserver). */
const SIZE = { feed: [1080, 1350], story: [1080, 1920] };
let ASSETS = null;
function brandAssets() {
  if (ASSETS) return ASSETS;
  const img = (src) =>
    new Promise((ok) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => {
        logEvent("warn", "studio.asset", src);
        ok(null);
      };
      i.src = src;
    });
  const font = async (w) => {
    try {
      const f = new FontFace("Nunito", `url(brand/nunito-latin-${w}-normal.woff2)`, { weight: String(w) });
      document.fonts.add(await f.load());
    } catch (e) {
      logEvent("warn", "studio.font", "Schrift " + w + " nicht geladen");
    }
  };
  ASSETS = Promise.all([img("brand/vivalink-logo.png"), img("brand/vivalink-logo-weiss.png"), img("brand/vivalink-symbol.png"), img("brand/vivalink-symbol-weiss.png"), font(400), font(700), font(800)]).then(
    ([logo, logoW, sym, symW]) => ({ logo, logoW, sym, symW }),
  );
  return ASSETS;
}

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
    if (lines.length * s * lh <= maxH && lines.every((l) => ctx.measureText(l).width <= maxW)) return { s, lines, lh };
  }
  ctx.font = FF(weight, min);
  return { s: min, lines: wrap(ctx, text, maxW), lh };
}
function draw(ctx, f, x, y, color, weight, align = "left") {
  ctx.font = FF(weight, f.s);
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "top";
  f.lines.forEach((l, i) => ctx.fillText(l, x, y + i * f.s * f.lh));
  return y + f.lines.length * f.s * f.lh;
}
const blockH = (f) => f.lines.length * f.s * f.lh;
/* Verlauf wie im Logo: Pink → Magenta → Violett → Rosé → Orange */
function grad(ctx, W, H, c) {
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, c.pink);
  g.addColorStop(0.25, c.magenta || c.pink);
  g.addColorStop(0.5, c.violet);
  g.addColorStop(0.72, c.rose || c.orange);
  g.addColorStop(1, c.orange);
  return g;
}
/* Hintergrund je Gestaltungsvariante (nur Markenfarben, Weiß und Schwarz) */
function bg(ctx, W, H, c, v) {
  if (v === 1) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, c.violet);
    g.addColorStop(1, c.magenta || c.violet);
    return g;
  }
  return grad(ctx, W, H, c);
}
function rr(ctx, x, y, w, h, r) {
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
  ctx.drawImage(im, align === "center" ? x - w / 2 : x, y, w, h);
  return h;
}

/* ---------- Vorlagen ---------- */
function renderSlide(post, i, A, story = false) {
  const [W, H] = SIZE[story ? "story" : "feed"];
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext("2d");
  const b = (typeof S !== "undefined" && S.studio && S.studio.brand) || BRAND_DEFAULT;
  const c = b.colors,
    dark = "#14121a",
    grey = "#4a4752";
  const sl = post.slides[i] || post.slides[0] || {},
    n = post.slides.length;
  const tpl = sl.template || "cover";
  const v = Number(post.variant) || 0;
  const P = 88,
    top = story ? 240 : 96,
    bottom = story ? H - 260 : H - 96;
  const site = b.website || "vivalink.me";
  const counter = (col) => {
    if (n < 2) return;
    ctx.font = FF(700, 34);
    ctx.fillStyle = col;
    ctx.textAlign = "right";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(`${i + 1}/${n}`, W - P, bottom);
  };
  const footer = (light) => {
    img(ctx, light ? A.symW : A.sym, P, bottom - 58, 170);
    ctx.font = FF(700, 34);
    ctx.fillStyle = light ? "#ffffff" : grey;
    ctx.textAlign = n > 1 ? "center" : "right";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(site, n > 1 ? W / 2 : W - P, bottom);
    counter(light ? "rgba(255,255,255,.85)" : grey);
  };
  // Variante 2: helle Titelfolie mit farbigem Logo und Verlaufsakzent
  if (tpl === "cover" && v === 2) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = grad(ctx, W, 24, c);
    ctx.fillRect(0, 0, W, 24);
    img(ctx, A.sym, P, top, 230);
    const t = fit(ctx, sl.title || post.hook, W - 2 * P, H * 0.45, 124, 56, 800, 1.1);
    let y = draw(ctx, t, P, top + 300, dark, 800);
    ctx.fillStyle = grad(ctx, 260, 14, c);
    rr(ctx, P, y + 26, 260, 14, 7);
    ctx.fill();
    if (sl.text) draw(ctx, fit(ctx, sl.text, W - 2 * P, 300, 54, 32, 700), P, y + 80, grey, 700);
    ctx.font = FF(800, 38);
    ctx.fillStyle = c.violet;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(site, P, bottom);
    if (n > 1 && !story) {
      ctx.textAlign = "right";
      ctx.fillText("Wischen →", W - P, bottom);
    }
    return cv;
  }
  if (tpl === "cover" || tpl === "frage" || tpl === "abschluss") {
    ctx.fillStyle = bg(ctx, W, H, c, v);
    ctx.fillRect(0, 0, W, H);
    if (tpl === "abschluss") {
      const lh = img(ctx, A.logoW, W / 2, top + 40, 560, "center");
      const t = fit(ctx, sl.title, W - 2 * P, 300, 96, 48, 800);
      let y = draw(ctx, t, W / 2, top + lh + 140, "#fff", 800, "center");
      if (sl.text) y = draw(ctx, fit(ctx, sl.text, W - 2 * P, 260, 52, 30, 700), W / 2, y + 30, "rgba(255,255,255,.95)", 700, "center");
      ctx.font = FF(800, 46);
      const pw = Math.min(W - 2 * P, ctx.measureText(site).width + 120);
      ctx.fillStyle = "#fff";
      rr(ctx, W / 2 - pw / 2, y + 70, pw, 110, 55);
      ctx.fill();
      ctx.fillStyle = c.violet;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(site, W / 2, y + 125);
      counter("rgba(255,255,255,.85)");
      return cv;
    }
    if (tpl === "frage") {
      ctx.globalAlpha = 0.12;
      ctx.font = FF(800, 420);
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText("?", W / 2, story ? top + 60 : top - 70);
      ctx.globalAlpha = 1;
      const t = fit(ctx, sl.title, W - 2 * P, H * 0.42, 104, 52, 800);
      const tx = sl.text ? fit(ctx, sl.text, W - 2 * P, 260, 50, 30, 700) : null;
      const total = blockH(t) + (tx ? blockH(tx) + 40 : 0);
      let y = (H - total) / 2 - 20;
      y = draw(ctx, t, W / 2, y, "#fff", 800, "center");
      if (tx) draw(ctx, tx, W / 2, y + 40, "rgba(255,255,255,.95)", 700, "center");
      img(ctx, A.logoW, W / 2, bottom - 150, 300, "center");
      return cv;
    }
    img(ctx, A.symW, P, top, 230);
    const t = fit(ctx, sl.title || post.hook, W - 2 * P, H * 0.45, 124, 56, 800, 1.1);
    const tx = sl.text ? fit(ctx, sl.text, W - 2 * P, 300, 54, 32, 700) : null;
    let y = top + 300;
    y = draw(ctx, t, P, y, "#fff", 800);
    if (tx) draw(ctx, tx, P, y + 36, "rgba(255,255,255,.95)", 700);
    ctx.font = FF(800, 38);
    ctx.fillStyle = "#fff";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(site, P, bottom);
    if (n > 1 && !story) {
      ctx.textAlign = "right";
      ctx.fillText("Wischen →", W - P, bottom);
    }
    return cv;
  }
  // Helle Vorlagen
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = grad(ctx, W, 24, c);
  ctx.fillRect(0, 0, W, 24);
  if (tpl === "ankuendigung") {
    const lh = img(ctx, A.logo, W / 2, top, 420, "center");
    const cy = top + lh + 70;
    const label = fit(ctx, sl.title || "Nächstes Meetup", W - 4 * P, 120, 64, 40, 800);
    const det = fit(ctx, sl.details || "", W - 4 * P, story ? 420 : 300, 70, 38, 800, 1.25);
    const ch = 90 + blockH(label) + 40 + blockH(det) + 90;
    ctx.fillStyle = grad(ctx, W, ch, c);
    rr(ctx, P, cy, W - 2 * P, ch, 48);
    ctx.fill();
    let y = draw(ctx, label, W / 2, cy + 90, "rgba(255,255,255,.92)", 800, "center");
    draw(ctx, det, W / 2, y + 40, "#fff", 800, "center");
    let ty = cy + ch + 60;
    if (sl.text) ty = draw(ctx, fit(ctx, sl.text, W - 2 * P, 200, 50, 30, 700), W / 2, ty, dark, 700, "center");
    ctx.font = FF(800, 42);
    const cta = "Infos & Anmeldung: " + site;
    const pw = Math.min(W - 2 * P, ctx.measureText(cta).width + 110);
    const py = story ? Math.min(bottom - 140, ty + 120) : bottom - 140;
    ctx.fillStyle = grad(ctx, W, H, c);
    rr(ctx, W / 2 - pw / 2, py, pw, 110, 55);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(cta, W / 2, py + 55);
    return cv;
  }
  if (tpl === "rueckblick") {
    ctx.strokeStyle = grad(ctx, W, H, c);
    ctx.lineWidth = 28;
    rr(ctx, 40, 40, W - 80, H - 80, 60);
    ctx.stroke();
  }
  // Inhalt größer setzen und im freien Bereich vertikal mittig ausrichten
  const avail = bottom - 130 - (top + 20);
  const t = fit(ctx, sl.title, W - 2 * P, avail * 0.42, 104, 52, 800, 1.12);
  const items =
    tpl === "info"
      ? String(sl.text || "")
          .split(/\n|•/)
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
  const fi = items.map((it) => fit(ctx, it, W - 2 * P - 76, 260, 58, 34, 700));
  const tx = tpl !== "info" && sl.text ? fit(ctx, sl.text, W - 2 * P, avail * 0.5, 62, 34, 400, 1.35) : null;
  const numH = tpl === "tipp" ? 190 : 0;
  const total = numH + blockH(t) + (tx ? 48 + blockH(tx) : 0) + fi.reduce((a, f) => a + blockH(f) + 40, fi.length ? 30 : 0);
  let y = Math.max(top + 30, top + 20 + (avail - total) / 2);
  if (tpl === "tipp") {
    const num = Math.max(1, i);
    ctx.fillStyle = grad(ctx, 150, 150, c);
    ctx.beginPath();
    ctx.arc(P + 72, y + 72, 72, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = FF(800, 76);
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(num), P + 72, y + 76);
    y += numH;
  }
  y = draw(ctx, t, P, y, dark, 800);
  if (fi.length) {
    y += 30;
    for (const f of fi) {
      ctx.fillStyle = grad(ctx, W, H, c);
      ctx.beginPath();
      ctx.arc(P + 18, y + f.s * 0.62, 18, 0, Math.PI * 2);
      ctx.fill();
      y = draw(ctx, f, P + 66, y, grey, 700) + 40;
    }
  } else if (tx) draw(ctx, tx, P, y + 48, grey, 400);
  footer(false);
  return cv;
}
async function renderPost(post, story = false) {
  const A = await brandAssets();
  return post.slides.map((_, i) => renderSlide(post, i, A, story));
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
