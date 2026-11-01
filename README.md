# command-hud

Phone-first status page. The live site is the Vercel deployment (`mw4-command-hud.vercel.app`); GitHub Pages is disabled. `docs/` still only holds encrypted envelopes.

- The data feed (`status.json`) is an **encrypted envelope**: `{ v, alg: "AES-GCM", kdf: "PBKDF2-SHA256", iter, salt, iv, ct }`.
  The page derives an AES-256-GCM key in the browser with PBKDF2-SHA256 from the access code and decrypts locally (Web Crypto). No readable data is published.
- `tools/build-status.mjs` builds the cleartext model off-repo, diffs it against the previous snapshot (deploy / rtb / hold / cleared events, ~6 h retained), and encrypts it.
- `tools/mw4crypto.js` is a dependency-free PBKDF2-HMAC-SHA256 + AES-256-GCM decryptor used by the iOS Scriptable widgets (`scriptable/`), assembled by `tools/build-scriptable.mjs`.

## Dashboard hub
- `docs/<token>/hub/` — phone-first index with tiles for the MW4 Command HUD and the Social (Jae) board.
- `docs/<token>/social/` — static "Kinsora social — published metrics" board (TikTok @kinsora.co, TikTok @wearkinsora,
  IG @wearkinsora, Pinterest). Its feed `social/metrics.json` is an encrypted envelope built by `tools/build-social.mjs`
  from the Postiz/Windsor pull, with the same auth code + salt as `status.json`, so one unlock opens both pages in a tab.

## Command suite chrome (v2)
- `docs/<token>/suite.css` — shared TF141 chrome for all three pages: classification band with live PT clock, bottom dock nav (HUB · HUD · SOCIAL · LOCK), corner brackets, rulers.
- HUD: ORBAT roster, wire-heat meter (crossings in the last hour), HOLD cage, sector-coded zones, counter meters, T+ since deploy on AO plates, two-column desktop layout.
- Social: channel tiles with sparklines, segmented range/mode pickers, chart crosshair, top-3 posts, caption filter, view-share bars.
- Hub: inline unlock; once unlocked it decrypts status.json + social/metrics.json in the browser for live counts and a 6 h SITREP. Nothing readable is published.

## Access (no second code on Vercel)
- The Vercel deployment is behind Vercel Authentication. The HUD, Social and Hub pages have **no unlock form**: they fetch
  `GET /api/feed?f=status` / `?f=social` (`docs/api/feed.js`, a Vercel function), which decrypts the committed envelopes
  server-side with the `MW4_FEED_PASS` project env var and returns JSON with `Cache-Control: no-store`.
- The repo still only holds the AES-256-GCM envelopes — `status.json` and `social/metrics.json` are
  unchanged and keep being written encrypted by `build-status.mjs` / `build-social.mjs`. Nothing readable is committed.
- Scriptable widgets fetch the encrypted `status.json` from Vercel and still decrypt on-device with the Keychain auth code (AES-GCM is unchanged). `STATUS_URL` in `scriptable/src/common.js` is the Vercel `status.json` URL plus the Deployment Protection bypass query param. Widgets do not call `/api/feed` (that cleartext endpoint stays SSO-gated). Edit `scriptable/src/*`, then `node tools/build-scriptable.mjs`. After the URL changes, re-paste each built script in Scriptable on the phone, or pull the Raw file after merge — the widget keeps the copy already saved on the device.
- `api/feed.js` at the repo root is a shim that only matters if the Vercel Root Directory is the repo root.
