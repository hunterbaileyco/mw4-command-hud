#!/usr/bin/env node
// Build the Social (Jae) feed for the dashboard hub from the Kinsora multi-channel metrics pull, then ENCRYPT it
// with the same scheme/key as the MW4 HUD (AES-256-GCM, key = PBKDF2-SHA256(auth code, salt from kdf.json)),
// so one auth code unlocks both pages. Numbers are copied from the source files; nothing is computed here
// except sorting and trimming fields.
// Usage:
//   node build-social.mjs --metrics /workspace/kinsora-video/multi_channel_metrics_latest.json \
//     --data /workspace/kinsora-video/multi/data.json --kdf cache/kdf.json --pass-file .pass \
//     --out docs/<token>/social/metrics.json
// TODO(Price→Jae): do not hand-edit social/metrics.json. The committed envelope is the 2026-10-31
// pull (hub as-of day 2026-10-30) and stays SNAPSHOT until this command is run with a real metrics
// file. This environment has no kinsora-video pull, no cache/kdf.json, and no MW4_FEED_PASS.
// Postiz can list posts but not view counts. Windsor is connected for tiktok_organic, instagram,
// and pinterest_organic; the series + per-post assembler lives in that off-repo pull. Inventing
// numbers here would ship a false LIVE board and a key /api/feed cannot open.
import fs from 'node:fs';
import path from 'node:path';
import { webcrypto as wc } from 'node:crypto';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) =>
  v.startsWith('--') ? [...a, [v.slice(2), arr[i + 1]]] : a, []));
const readJSON = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const M = readJSON(args.metrics);
const D = args.data && fs.existsSync(args.data) ? readJSON(args.data) : {};

// Per-channel copy mirrors the "Kinsora social — published metrics" page (chart notes describe the data sources).
const COPY = {
  tt_kco: { label: '@kinsora.co TikTok', short: 'TT KCO', reach: 'Views',
    calendarNote: "Daily account video views from Windsor (TikTok organic). TikTok only lets Windsor read the last 60 days, so the line starts Sep 1, not at the first post (Jun 8). The latest day isn't reported yet, so it's left off.",
    postedNote: 'Each column adds up the current lifetime views of the posts that went up that day (PT), back to the first post on Jun 8.' },
  tt_wk: { label: '@wearkinsora TikTok', short: 'TT WK', reach: 'Views',
    calendarNote: '',
    postedNote: "Each column adds up the current lifetime views of the posts that went up that day (PT). Windsor's daily account series reads 0 every day for @wearkinsora, so there's no calendar line for this channel." },
  ig: { label: 'Instagram @wearkinsora', short: 'IG', reach: 'Views',
    calendarNote: 'Daily account views from Windsor (Instagram user insights), from the first post on May 21 PT. Account-level, so it includes Stories and any boosted reach and runs above the sum of post views.',
    postedNote: 'Each column adds up the current lifetime views of the posts that went up that day (PT), back to the first post on May 21.' },
  pin: { label: 'Pinterest wearkinsora', short: 'PIN', reach: 'Impressions',
    calendarNote: "Daily account impressions from Postiz platform analytics. Pinterest only shares the last 90 days, so the line starts Aug 3, not at the first pin.",
    postedNote: "Each column adds up the impressions each pin got over the last 90 days, grouped by the day it was pinned (PT). Pinterest doesn't share lifetime pin totals." },
};

const channels = (M.channels || []).map((c) => ({
  key: c.key, platform: c.platform, handle: c.handle, ...(COPY[c.key] || { label: c.handle, short: c.key, reach: 'Views' }),
  published: c.published_count, queue: c.postiz_queue ?? (D.queue || {})[c.key] ?? 0,
  firstPost: c.earliest_post_pt, totals: c.totals,
}));

const series = {};
for (const s of M.platform_series || []) if (s.usable && !series[s.ch]) series[s.ch] = { source: s.source, metric: s.metric, points: s.points };

const posts = [...(M.posts || [])].sort((a, b) => (a.ts < b.ts ? 1 : -1)).map((p) => [
  p.ch, p.date, p.slot, p.hook || '', p.views ?? null, p.likes ?? null, p.comments ?? null, (p.ch === 'pin' ? p.clicks : p.shares) ?? null, p.saves ?? null, // pin: index 7 = 90d clicks
  /^Postiz \(no/.test(p.src) ? 'X' : /^Postiz/.test(p.src) ? 'P' : 'W', p.url || '']);

const lastSeriesDay = Object.values(series).flatMap((s) => s.points.map((p) => p[0])).sort().pop() || null;
const lastPostDay = posts.reduce((a, r) => (r[1] > a ? r[1] : a), '');
const model = {
  generatedAt: M.generated_at, asOfDay: [lastSeriesDay, lastPostDay].filter(Boolean).sort().pop(),
  channels, series, posts, notes: M.notes || [], errors: M.errors || [],
  sources: ['Postiz: posts:list, analytics:post, analytics:platform', 'Windsor.ai: tiktok_organic, instagram, pinterest_organic'],
};

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
console.error(`social: ${channels.length} channels, ${posts.length} posts, series ${Object.keys(series).join(',')} | generated ${model.generatedAt} | ${args.out} encrypted ${ct.length}B`);
