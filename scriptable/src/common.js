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
