// ===== MW4 shared (feed + auth) — generated into each script by tools/build-scriptable.mjs =====
const STATUS_URL = "https://hunterbaileyco.github.io/mw4-command-hud/c85352c42452f0db1e1c5e56f60e5128/status.json";
const HUD_URL = STATUS_URL.replace(/status\.json$/, "");
const AUTH_HASH = "0b488216b0f3fff7076b1a9af7ed5abb84e17176fde44fddba9138b0ab08fcc9"; // SHA-256 of the auth code
const KC_CODE = "mw4hud.authcode", KC_KEY = "mw4hud.aeskey";
const RESET = false; // set true, run once in the app to forget the saved auth code, then set back to false

function kcGet(k) { return Keychain.contains(k) ? Keychain.get(k) : null; }
function kcDel(k) { if (Keychain.contains(k)) Keychain.remove(k); }

async function askCode(msg) {
  const a = new Alert();
  a.title = "MW4 HUD · Auth code";
  a.message = msg || "Enter the same auth code you type on the HUD. Saved in the iOS Keychain on this phone only.";
  a.addSecureTextField("Auth code", "");
  a.addAction("Save");
  a.addCancelAction("Cancel");
  if ((await a.presentAlert()) === -1) return null;
  return a.textFieldValue(0).trim();
}

// Returns {key: Uint8Array} or {need: "AUTH NEEDED" | ...}. Prompts only when run inside the Scriptable app.
async function getKey(env) {
  const interactive = config.runsInApp && !config.runsInWidget;
  if (RESET) { kcDel(KC_CODE); kcDel(KC_KEY); }
  const cached = kcGet(KC_KEY);
  if (cached) { try { const c = JSON.parse(cached); if (c.salt === env.salt && c.iter === env.iter) return { key: MW4C.unhex(c.k) }; } catch (e) {} }
  let code = kcGet(KC_CODE), msg = null;
  for (let tries = 0; tries < 3; tries++) {
    if (!code) {
      if (!interactive) return { need: "AUTH NEEDED" };
      code = await askCode(msg);
      if (!code) return { need: "AUTH NEEDED" };
    }
    if (MW4C.hex(MW4C.sha256(MW4C.utf8(code))) === AUTH_HASH) break;
    kcDel(KC_CODE); code = null; msg = "Wrong code — try again.";
  }
  if (!code) return { need: "AUTH NEEDED" };
  Keychain.set(KC_CODE, code);
  const key = MW4C.deriveKey(code, env); // PBKDF2 once per salt; cached below so widgets stay fast
  Keychain.set(KC_KEY, JSON.stringify({ salt: env.salt, iter: env.iter, k: MW4C.hex(key) }));
  return { key };
}

// Loads + decrypts the feed. Caches the ENCRYPTED envelope for offline use (never the cleartext).
async function loadFeed() {
  const fm = FileManager.local();
  const cache = fm.joinPath(fm.cacheDirectory(), "mw4-status.enc.json");
  let env = null, offline = false;
  try {
    const req = new Request(STATUS_URL + "?t=" + Date.now());
    req.timeoutInterval = 15;
    env = JSON.parse(await req.loadString());
    fm.writeString(cache, JSON.stringify(env));
  } catch (e) {
    offline = true;
    if (fm.fileExists(cache)) env = JSON.parse(fm.readString(cache));
  }
  if (!env) return { d: null, offline, need: "NO SIGNAL" };
  if (!env.ct) return { d: env, offline }; // legacy cleartext feed
  const k = await getKey(env);
  if (!k.key) return { d: null, offline, need: k.need };
  try { return { d: MW4C.open(env, k.key), offline }; }
  catch (e) { kcDel(KC_KEY); return { d: null, offline, need: "AUTH NEEDED" }; }
}

// ===== MW4 theater chrome — same palette + zone language as the live HUD (FOB · WIRE · AO · HOLD) =====
// NOTE: only the weight-named monospaced fonts below (regular/medium/semibold/bold/heavy); the generic
// size+weight monospaced constructor crashes on Hunter's iOS.
const P = { bg: "#0B0E0C", panel: "#121612", line: "#2A3328", tan: "#C5A572", olive: "#6B7C3A", amber: "#E8A317",
            hold: "#8B3A2A", holdink: "#E07A5F", ink: "#E8E2D6", dim: "#8a8676", ship: "#9bb05a", dark: "#0d110e" };
const col = (k, a) => new Color(P[k] || k, a == null ? 1 : a);
const F = { r: (s) => Font.regularMonospacedSystemFont(s), m: (s) => Font.mediumMonospacedSystemFont(s),
            sb: (s) => Font.semiboldMonospacedSystemFont(s), b: (s) => Font.boldMonospacedSystemFont(s),
            h: (s) => Font.heavyMonospacedSystemFont(s) };
// Approx. widget size in points (iPhone 6.1–6.7"); background images are aspect-filled, so close is enough.
const FAM_PT = { small: [170, 170], medium: [364, 170], large: [364, 382], extraLarge: [364, 382] };

function ago(iso) {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 1 ? "now" : m < 60 ? m + "m" : m < 1440 ? Math.floor(m / 60) + "h" + (m % 60 ? (m % 60) + "m" : "") : Math.floor(m / 1440) + "d";
}
function hhmm(iso) { const t = new Date(iso); return String(t.getHours()).padStart(2, "0") + String(t.getMinutes()).padStart(2, "0"); }
function txt(stack, s, font, color, lines) {
  const t = stack.addText(String(s == null ? "" : s)); t.font = font; t.textColor = color;
  if (lines) t.lineLimit = lines; t.minimumScaleFactor = 0.7; return t;
}
// Diagonal hazard stripes (HUD HOLD-box top rail): amber bands on near-black.
function drawHazard(dc, x, y, w, h, a) {
  dc.setFillColor(col("dark")); dc.fillRect(new Rect(x, y, w, h));
  dc.setFillColor(col("amber", a == null ? 0.9 : a));
  for (let i = -h; i < w + h; i += 9) {
    const p = new Path();
    p.addLines([new Point(x + i, y + h), new Point(x + i + 4, y + h), new Point(x + i + 4 + h, y), new Point(x + i + h, y)]);
    p.closeSubpath(); dc.addPath(p); dc.fillPath();
  }
  dc.setFillColor(col("bg")); dc.fillRect(new Rect(x - h - 9, y, h + 9, h)); dc.fillRect(new Rect(x + w, y, h + 9, h)); // trim overhang
}
function hazardImg(w, h) {
  const dc = new DrawContext(); dc.size = new Size(w, h); dc.opaque = true; dc.respectScreenScale = true;
  drawHazard(dc, 0, 0, w, h); return dc.getImage();
}
// Barbed-wire rail: amber line with crosshatch "X" barbs (HUD "CROSSING THE WIRE" band).
function wireImg(w, h) {
  const dc = new DrawContext(); dc.size = new Size(w, h); dc.opaque = true; dc.respectScreenScale = true;
  dc.setFillColor(col("bg")); dc.fillRect(new Rect(0, 0, w, h));
  dc.setFillColor(col("amber", 0.12)); dc.fillRect(new Rect(0, 0, w, h));
  const m = h / 2;
  dc.setStrokeColor(col("amber", 0.85)); dc.setLineWidth(1);
  const p = new Path();
  p.move(new Point(0, m - 1.5)); p.addLine(new Point(w, m - 1.5));
  p.move(new Point(0, m + 1.5)); p.addLine(new Point(w, m + 1.5));
  for (let x = 2; x < w; x += 9) { p.move(new Point(x, m - 3.5)); p.addLine(new Point(x + 5, m + 3.5)); p.move(new Point(x + 5, m - 3.5)); p.addLine(new Point(x, m + 3.5)); }
  dc.addPath(p); dc.strokePath();
  return dc.getImage();
}
// Full-widget backdrop: bg, tactical grid, scanlines, vignette, corner brackets, optional hazard rail on top.
function theaterBg(fam, opts) {
  opts = opts || {};
  const [W, H] = FAM_PT[fam] || FAM_PT.medium;
  const dc = new DrawContext(); dc.size = new Size(W, H); dc.opaque = true; dc.respectScreenScale = true;
  dc.setFillColor(col("bg")); dc.fillRect(new Rect(0, 0, W, H));
  dc.setFillColor(col("olive", 0.07)); dc.fillRect(new Rect(0, 0, W, H * 0.55)); // olive haze up top (AO)
  dc.setFillColor(col("line", 0.55));
  for (let x = 18; x < W; x += 18) dc.fillRect(new Rect(x, 0, 0.5, H));
  for (let y = 18; y < H; y += 18) dc.fillRect(new Rect(0, y, W, 0.5));
  dc.setFillColor(new Color("#000000", 0.16));
  for (let y = 0; y < H; y += 3) dc.fillRect(new Rect(0, y, W, 1));
  for (let i = 0; i < 6; i++) { // cheap vignette
    dc.setFillColor(new Color("#000000", 0.07)); const k = i * 3;
    dc.fillRect(new Rect(0, 0, W, 3 + k)); dc.fillRect(new Rect(0, H - 3 - k, W, 3 + k));
    dc.fillRect(new Rect(0, 0, 3 + k, H)); dc.fillRect(new Rect(W - 3 - k, 0, 3 + k, H));
  }
  if (opts.hazard) drawHazard(dc, 0, 0, W, opts.hazard);
  dc.setStrokeColor(col("line")); dc.setLineWidth(1);
  const fr = new Path(); fr.addRect(new Rect(4.5, 4.5, W - 9, H - 9)); dc.addPath(fr); dc.strokePath();
  const L = fam === "small" ? 12 : 16, i0 = 6;
  dc.setStrokeColor(col(opts.bracket || "tan", 0.9)); dc.setLineWidth(2);
  const b = new Path();
  for (const [x, y, sx, sy] of [[i0, i0, 1, 1], [W - i0, i0, -1, 1], [i0, H - i0, 1, -1], [W - i0, H - i0, -1, -1]]) {
    b.move(new Point(x, y + sy * L)); b.addLine(new Point(x, y)); b.addLine(new Point(x + sx * L, y));
  }
  dc.addPath(b); dc.strokePath();
  return dc.getImage();
}
function newTheaterWidget(fam, opts) {
  const w = new ListWidget();
  w.backgroundColor = col("bg"); w.url = HUD_URL;
  try { w.backgroundImage = theaterBg(fam, opts); } catch (e) {}
  w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);
  return w;
}
// "▌ LABEL" zone header like the HUD panels.
function zoneLabel(stack, label, barColor, inkColor, size) {
  const s = stack.addStack(); s.centerAlignContent(); s.spacing = 4;
  const bar = s.addStack(); bar.size = new Size(3, size + 2); bar.backgroundColor = col(barColor);
  txt(s, label, F.h(size), col(inkColor || "tan"), 1);
  return s;
}
// Thin amber wire band with a centered plate.
function wireBar(w, label, h, size) {
  const r = w.addStack(); r.size = new Size(0, h); r.centerAlignContent();
  try { r.backgroundImage = wireImg(360, h); } catch (e) { r.backgroundColor = col("amber", 0.25); }
  r.addSpacer();
  if (label) {
    const p = r.addStack(); p.backgroundColor = col("bg"); p.borderColor = col("amber"); p.borderWidth = 1; p.setPadding(0, 5, 0, 5);
    txt(p, label, F.h(size || 7), col("amber"), 1);
    r.addSpacer();
  }
  return r;
}
// Small chip / pill.
function chip(stack, s, fg, bg, size, border) {
  const c = stack.addStack(); c.backgroundColor = bg; c.setPadding(1, 4, 1, 4); c.cornerRadius = 1;
  if (border) { c.borderColor = border; c.borderWidth = 1; }
  txt(c, s, F.h(size), fg, 1); return c;
}
function hazardChip(stack, s, size) {
  const c = stack.addStack(); c.setPadding(1, 4, 1, 4); c.centerAlignContent();
  try { c.backgroundImage = hazardImg(60, 16); } catch (e) { c.backgroundColor = col("amber"); }
  const inner = c.addStack(); inner.backgroundColor = col("bg", 0.85); inner.setPadding(0, 3, 0, 3);
  txt(inner, s, F.h(size), col("amber"), 1); return c;
}
function softFail(w, need, script) {
  w.addSpacer();
  const auth = need === "AUTH NEEDED";
  const r = w.addStack(); r.centerAlignContent(); r.spacing = 5;
  if (auth) hazardChip(r, "⚠", 9); else chip(r, "✕", col("bg"), col("holdink"), 9);
  txt(r, need || "NO SIGNAL", F.h(14), auth ? col("amber") : col("holdink"), 1);
  w.addSpacer(4);
  txt(w, auth ? `Open Scriptable → run “${script}” (or “MW4 ${script}”) once → enter auth code.` : "Feed unreachable · retrying on next refresh.", F.r(9), col("dim"), 3);
  w.addSpacer();
}
const LANE_TAG = (c) => String(c.lane || (c.tag === "KAL" ? "KAL" : "CMD")).toUpperCase();
