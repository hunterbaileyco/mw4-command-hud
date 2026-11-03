# command-hud

Phone-first status page. The live site is the Vercel deployment (`mw4-command-hud.vercel.app`); GitHub Pages is disabled. `docs/` still only holds encrypted envelopes.

- The data feed (`status.json`) is an **encrypted envelope**: `{ v, alg: "AES-GCM", kdf: "PBKDF2-SHA256", iter, salt, iv, ct }`.
  The page derives an AES-256-GCM key in the browser with PBKDF2-SHA256 from the access code and decrypts locally (Web Crypto). No readable data is published.
- `tools/build-status.mjs` builds the cleartext model off-repo, diffs it against the previous snapshot (deploy / rtb / hold / cleared events, ~6 h retained), and encrypts it. Glance `line1` waiting and the badge both count Waiting on Hunter on Command and Kal Trading. `doneToday` counts a move into Done on the America/Los_Angeles day, not `lastActivityAt`. When the list dump has no completion stamp, the builder reads board list-move activity (dump `activities` / sidecar `<dump>.activity.json` / `--command-activity`, or Trello `updateCard:idList` when `TRELLO_KEY` and `TRELLO_TOKEN` are set). A comment is not a move. `Lane: Duo` (the fold device) maps to Ko.
- `tools/mw4crypto.js` is a dependency-free PBKDF2-HMAC-SHA256 + AES-256-GCM decryptor used by the iOS Scriptable widgets (`scriptable/`), assembled by `tools/build-scriptable.mjs`.

## Scriptable install (paste once)

Hunter pastes two short loaders. After that, widget updates ship with a merge to `main`. Do not paste `scriptable/MW4 Glance.js` or `scriptable/MW4 Waiting.js` onto the phone.

1. Install Scriptable from the App Store.
2. Open the existing **Glance** script, select all, paste `scriptable/MW4 Glance Loader.js`, and keep the name **Glance**. Do the same for **Waiting** with `scriptable/MW4 Waiting Loader.js`.
3. If those scripts are already gone: create a script, paste the loader, rename it to Glance or Waiting, then point the Home Screen widget at that name.
4. Home Screen → long-press the widget → Edit Widget → Script: **Glance** or **Waiting**. Glance is small or medium. Waiting is small, medium, or large. Tapping a widget still opens the live HUD.
5. Run each loader once with ▶ only if the widget says AUTH NEEDED. The HUD code is saved in the iOS Keychain (`mw4hud.authcode`) and is reused from the scripts already on the phone.

Each run downloads the matching built script from GitHub Raw (`main`) and runs it. The last copy that compiled is stored on the phone (`FileManager.local()`, documents directory). If the download fails, that copy runs. If there is no copy yet, the widget shows **NO SCRIPT**.

Developers: edit `scriptable/src/*`, run `node tools/build-scriptable.mjs`, merge to `main`. The build rewrites the full widgets and both loaders. Loaders do not contain the feed URL. The widget they run still requests the encrypted Vercel `status.json` (bypass query included) and decrypts it on the phone. It does not call `/api/feed`.

## Dashboard hub
- `docs/<token>/hub/` — phone-first index with tiles for the MW4 Command HUD, LEDGER, and the Social (Jae) board. The Care desk tile (Laswell, care@ only) stays SAMPLE until care@kinsora.co is wired. Intercom is not on that desk.
- `docs/<token>/social/` — static "Kinsora social — published metrics" board (TikTok @kinsora.co, TikTok @wearkinsora,
  IG @wearkinsora, Pinterest). The page reads `GET /api/feed?f=social`. `social/metrics.json` is the committed
  AES-GCM fallback, built by `tools/build-social.mjs` from the Postiz/Windsor pull, with the same auth code + salt as `status.json`.

## Command suite chrome (v2)
- `docs/<token>/suite.css` — shared TF141 chrome for the suite pages: classification band with live PT clock, bottom dock nav (HUB · HUD · LEDGER · ORBAT · FILES), corner brackets, rulers.
- HUD: ORBAT roster, wire-heat meter (crossings in the last hour), HOLD cage, sector-coded zones, counter meters, T+ since deploy on AO plates, two-column desktop layout.
- Social: channel tiles with sparklines, segmented range/mode pickers, chart crosshair, top-3 posts, caption filter, view-share bars. Under DAILY VIEWS, an ACCOUNTS chip row (2×2) overlays TT @kinsora.co, TT @wearkinsora, IG @wearkinsora, and PIN wearkinsora. Chips are independent of the channel tile, at least one stays on, and the choice is kept in localStorage (first visit: @kinsora.co only). PIN on that chart stays Postiz impressions; the other lines are Windsor views.
- Hub: inline unlock; once unlocked it decrypts status.json + social/metrics.json in the browser for live counts and a 6 h SITREP. Nothing readable is published.
- LEDGER (`docs/<token>/ledger/`): sales / spend / contribution. Hero is REV − COGS − SPEND. A live `GET /api/feed?f=ledger` payload with `source: "live"` drops the MOCK/SAMPLE badges. `ledger/model.js` SAMPLE is the fallback only when that envelope is missing or not live. Shipping, payment fees, and app costs are not subtracted. COGS gaps count as $0 and stay flagged. Runway is Mercury balance ÷ |30-day net burn|. The top strip CM / REV / SPEND follow the TODAY / 7D / MTD chip. CASH stays the Mercury balance (on hand), which is not a period flow.

## Social feed
`GET /api/feed?f=social` decrypts with `MW4_FEED_PASS` and serves the newer envelope: a private Vercel Blob at `mw4/social-live.json` (`BLOB_READ_WRITE_TOKEN`), or the committed `social/metrics.json` when the blob is missing, older, or will not decrypt. A deploy with no blob still serves the git snapshot. Freshness is `generatedAt` when that value is ISO-8601; otherwise it is `asOfDay` plus the raw `generatedAt` string, so a later day wins and a same-day rebuild still orders.

Jae owns the Windsor/Postiz pull and drops the metrics JSON on the box. The 4h routine (squad board cron `0 */4 * * *` PT) is Ko's and lives outside this repo. After merge it should run:

```
node tools/publish-social-live.mjs --metrics /workspace/kinsora-video/multi_channel_metrics_latest.json --pass-file .pass
```

`--data` is optional and matches `build-social.mjs`. `MW4_SOCIAL_METRICS` overrides the default drop path; `MW4_FEED_PASS` is used when `--pass-file` is omitted. If the drop path is missing, the command exits 0 and writes nothing. If the drop is present and newer than both the blob and the committed file, the tool builds the same model as `build-social.mjs`, encrypts it with the salt already in `social/metrics.json`, and puts `{ meta, env }` on the blob. Cleartext is not written to git. `build-social.mjs --out docs/<token>/social/metrics.json` is still how the committed fallback is refreshed.

## LEDGER feed
`ledger/model.js` is the contract. `tools/ledger-live.mjs` maps a normalized Shopify + ads + Mercury pull into that shape and sets `source` to `"live"`. `tools/build-ledger.mjs` encrypts it (AES-256-GCM, salt reused from `status.json`) and writes `ledger/feed.json`. The repo holds the envelope only — never the cleartext books. `/api/feed?f=ledger` tries `MW4_LEDGER_PASS` first, then `MW4_FEED_PASS`, so the box rebuild (`build-ledger.mjs --pass-file .pass`, same pass as status) opens on Vercel either way. The page derives contribution, CM%, breakeven ROAS, after-COGS dollars, and runway.

Connected on the current envelope: Shopify net sales, orders, and unit-cost COGS; Meta (Kinsora Redemption; Main has no spend in the window); Mercury checking + savings. Google Ads, TikTok Ads, and Pinterest Ads are slots until those accounts are connected, and they are not added into SPEND. Platform-reported lane revenue is not added into REV. Soap stays a dashed placeholder. Rebuild the envelope to refresh the numbers; the page polls the feed every 60s.

## Access (no second code on Vercel)
- The Vercel deployment is behind Vercel Authentication. The HUD, Social and Hub pages have **no unlock form**: they fetch
  `GET /api/feed?f=status` / `?f=social` / `?f=ledger` (`docs/api/feed.js`, a Vercel function), which decrypts
  server-side with the `MW4_FEED_PASS` project env var and returns JSON with `Cache-Control: no-store`.
  `f=status` and `f=social` each prefer a newer private blob when one is stored, and otherwise serve the committed file.
- The repo still only holds AES-256-GCM envelopes for the ops, social, and ledger feeds — `status.json`, `social/metrics.json`,
  and `ledger/feed.json` are written encrypted by `build-status.mjs` / `build-social.mjs` / `build-ledger.mjs`. LEDGER sample dollars in `ledger/model.js` are invented figures labeled SAMPLE, used only when the live envelope is absent.
- Scriptable widgets fetch the encrypted `status.json` from Vercel and still decrypt on-device with the Keychain auth code (AES-GCM is unchanged). `STATUS_URL` in `scriptable/src/common.js` is the Vercel `status.json` URL plus the Deployment Protection bypass query param. Widgets do not call `/api/feed` (that cleartext endpoint stays SSO-gated). Phone install is the two loaders above; do not re-paste the full scripts after a merge.
- `api/feed.js` at the repo root is a shim that only matters if the Vercel Root Directory is the repo root.

## Trello webhooks
`HEAD /api/trello-webhook` returns 200 so Trello can register the callback. `POST /api/trello-webhook?board=command|trading` checks `X-Trello-Webhook`, which is base64 HMAC-SHA1 of the raw body concatenated with the exact callback URL, keyed by `TRELLO_SECRET`. The callback strings live in `TRELLO_CALLBACK_URL_COMMAND` and `TRELLO_CALLBACK_URL_TRADING` (character for character, including the deployment-protection bypass query). A missing or bad signature is 401.

A new action id refetches both boards with `TRELLO_KEY` and `TRELLO_TOKEN`, rebuilds the status model (`docs/api/status-model.mjs`, the same one `tools/build-status.mjs` uses), and encrypts it with `MW4_FEED_PASS` and the salt already in the committed `status.json`. The ciphertext is stored in a private Vercel Blob (`BLOB_READ_WRITE_TOKEN`, pathname `mw4/status-live.json`). The same action id is a no-op, so Trello retries do not refetch. Cleartext is not written to disk or git.

`GET /api/feed?f=status` and `GET /api/status-envelope` serve the envelope with the later `updatedAt` — the blob copy, or the committed file when that file is newer. Routing middleware sends the widget `status.json` path to `/api/status-envelope`, so Glance and Waiting still decrypt the same salt. `GET /api/trello-webhook?board=command|trading` reports `live` and `updatedAt` only.

The hourly box build is still the reconcile that commits `status.json`. It can run less often for HUD freshness once a delivery has set `live: true`: the open HUD polls `/api/feed` every 20s, and widgets pick up the envelope on their next refresh. Keep a slower pass so a blob miss still has a recent file. When the box does run, it should fetch Trello at the start of that run; the feed treats the later `updatedAt` as the newer snapshot. Register hooks (ids only, callbacks redacted) with `node tools/register-trello-webhooks.mjs` after production `HEAD` is 200. An existing hook for the same callback is reused.
