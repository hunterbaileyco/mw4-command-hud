#!/usr/bin/env node
// Build the Social (Jae) feed for the dashboard hub from the Kinsora multi-channel metrics pull, then ENCRYPT it
// with the same scheme/key as the MW4 HUD (AES-256-GCM, key = PBKDF2-SHA256(auth code, salt from kdf.json)),
// so one auth code unlocks both pages. Numbers are copied from the source files; nothing is computed here
// except sorting and trimming fields.
// Usage:
//   node build-social.mjs --metrics /workspace/kinsora-video/multi_channel_metrics_latest.json \
//     --data /workspace/kinsora-video/multi/data.json --kdf cache/kdf.json --pass-file .pass \
//     --out docs/<token>/social/metrics.json
// The 4h blob path (do not commit on that cadence) is tools/publish-social-live.mjs.
// TODO(Price→Jae): do not hand-edit social/metrics.json and do not invent numbers.
// The committed envelope is only the git fallback. Postiz can list posts but not view counts.
// Windsor is connected for tiktok_organic, instagram, and pinterest_organic; the series
// + per-post assembler lives in that off-repo pull.
// DAILY VIEWS chips plot series.tt_kco, series.tt_wk, and series.ig from that pull (Windsor views).
// series.pin stays Postiz platform analytics (impressions, last ~90 days). Do not retarget pin to
// Windsor pin_impression here until that source change is explicitly requested.
import fs from 'node:fs';
import path from 'node:path';
import { webcrypto as wc } from 'node:crypto';
import { buildSocialModel } from './social-model.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) =>
  v.startsWith('--') ? [...a, [v.slice(2), arr[i + 1]]] : a, []));
const readJSON = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const M = readJSON(args.metrics);
const D = args.data && fs.existsSync(args.data) ? readJSON(args.data) : {};
const model = buildSocialModel(M, D);

const pass = fs.readFileSync(args['pass-file'], 'utf8').replace(/[\r\n]+$/, '');
const kdf = readJSON(args.kdf); // reuse the HUD salt so the same derived key opens both feeds
const te = new TextEncoder();
const km = await wc.subtle.importKey('raw', te.encode(pass), 'PBKDF2', false, ['deriveKey']);
const key = await wc.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: Buffer.from(kdf.salt, 'base64'), iterations: kdf.iter },
  km, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
const iv = wc.getRandomValues(new Uint8Array(12));
const ct = new Uint8Array(await wc.subtle.encrypt({ name: 'AES-GCM', iv }, key, te.encode(JSON.stringify(model))));
const env = { v: 1, alg: 'AES-GCM', kdf: 'PBKDF2-SHA256', iter: kdf.iter, salt: kdf.salt,
  iv: Buffer.from(iv).toString('base64'), ct: Buffer.from(ct).toString('base64') };
fs.mkdirSync(path.dirname(args.out), { recursive: true });
fs.writeFileSync(args.out, JSON.stringify(env) + '\n');
console.error(`social: ${model.channels.length} channels, ${model.posts.length} posts, series ${Object.keys(model.series).join(',')} | generated ${model.generatedAt} | ${args.out} encrypted ${ct.length}B`);
