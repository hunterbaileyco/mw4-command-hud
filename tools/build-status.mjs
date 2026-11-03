#!/usr/bin/env node
// Build the MW4 HUD feed from Trello "list_by_board" dumps, diff against the previous snapshot to emit
// deploy/rtb/hold/cleared events, then ENCRYPT it (AES-256-GCM, key = PBKDF2-SHA256(auth code, salt)).
// Usage:
//   node build-status.mjs --command cache/command.json --kal cache/kal.json [--extra cache/extra.json] \
//     [--command-activity cache/command.activity.json] [--kal-activity cache/kal.activity.json] \
//     --prev cache/prev-status.json --clear cache/status.clear.json --kdf cache/kdf.json \
//     --pass-file .pass --out docs/<token>/status.json [--now ISO]
// Sidecars cache/command.activity.json and cache/kal.activity.json are read when present.
// Activity is a Trello action list or { activities | activity | actions }.
// Writes (all box-only except --out):
//   <clear>.next        cleartext model (for build scripts / debugging; never committed)
//   <prev>.next         next snapshot {at, snap, events}; caller renames both .next files after a push
//   --out               public envelope {v,alg,kdf,iter,salt,iv,ct} — no readable card data
// Prints "SAME" when the cleartext (ignoring updatedAt) equals <clear>, else "CHANGED".
// Done cards count as shipped today only when they moved into Done on today's
// America/Los_Angeles date. A touch (lastActivityAt) or a comment does not count.
// Stamps on the card (actions into Done, completedAt / dateCompleted / movedToDoneAt)
// are used when the dump has them. When it does not, list-move activity is read from
// the dump (activities / activity / actions), a sidecar <dump>.activity.json,
// --command-activity / --kal-activity, or Trello updateCard:idList when
// TRELLO_KEY and TRELLO_TOKEN (or cache/trello-auth.json) are set.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { webcrypto as wc } from 'node:crypto';
import {
  activityOf, composeStatus, doneAtOf, doneMoveIndex, listsOf, normalizeActivity, ptDayStartIso,
} from '../docs/api/status-model.mjs';

export {
  hitLane, doneMoveIndex, activityOf, doneAtOf, laneOf, board, glanceFor, glanceMerged,
} from '../docs/api/status-model.mjs';

const BOARD_SHORT = { CMD: 'JcLDGY59', KAL: '9zrVdX34' };

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) =>
  v.startsWith('--') ? [...a, [v.slice(2), arr[i + 1]]] : a, []));
const readJSON = (p) => {
  const t = fs.readFileSync(p, 'utf8');
  const obj = t.indexOf('{');
  const arr = t.indexOf('[');
  const start = [obj, arr].filter((n) => n >= 0).sort((a, b) => a - b)[0];
  const end = t.lastIndexOf(t[start] === '[' ? ']' : '}');
  return JSON.parse(t.slice(start, end + 1));
};
const NOW = args.now ? new Date(args.now).getTime() : Date.now();

function boardShort(dump, tag) {
  const url = (dump && dump.board && dump.board.url) || (dump && dump.url) || '';
  const m = /\/b\/([A-Za-z0-9]+)/.exec(url);
  if (m) return m[1];
  if (dump && dump.board && dump.board.shortLink) return String(dump.board.shortLink);
  return BOARD_SHORT[tag] || '';
}

function readActivity(p) {
  if (!p || !fs.existsSync(p)) return [];
  try { return normalizeActivity(readJSON(p)); } catch { return []; }
}

function sidecarFor(dumpPath) {
  if (!dumpPath) return [];
  const stem = dumpPath.replace(/\.json$/i, '');
  return [...readActivity(`${stem}.activity.json`), ...readActivity(`${stem}.actions.json`)];
}

function trelloAuth() {
  const key = process.env.TRELLO_KEY || process.env.TRELLO_API_KEY || '';
  const token = process.env.TRELLO_TOKEN || process.env.TRELLO_API_TOKEN || '';
  if (key && token) return { key, token };
  const p = args['trello-auth'] || 'cache/trello-auth.json';
  if (!fs.existsSync(p)) return null;
  try {
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (j.key && j.token) return { key: String(j.key), token: String(j.token) };
  } catch { /* ignore */ }
  return null;
}

async function fetchListMoves(shortLink, sinceIso) {
  const auth = trelloAuth();
  if (!auth || !shortLink) return [];
  const out = [];
  let before = '';
  for (let page = 0; page < 10; page++) {
    const url = new URL(`https://api.trello.com/1/boards/${shortLink}/actions`);
    url.searchParams.set('filter', 'updateCard:idList');
    url.searchParams.set('since', sinceIso);
    url.searchParams.set('limit', '1000');
    url.searchParams.set('key', auth.key);
    url.searchParams.set('token', auth.token);
    if (before) url.searchParams.set('before', before);
    let res;
    try { res = await fetch(url); } catch { return out; }
    if (!res.ok) return out;
    let batch;
    try { batch = await res.json(); } catch { return out; }
    if (!Array.isArray(batch) || !batch.length) break;
    out.push(...batch);
    if (batch.length < 1000) break;
    before = batch[batch.length - 1] && batch[batch.length - 1].id;
    if (!before) break;
  }
  return out;
}

async function extraMoves(dumpPath, dump, tag, explicitPath) {
  const extra = [...readActivity(explicitPath), ...sidecarFor(dumpPath)];
  const index = doneMoveIndex(activityOf(dump, extra));
  const missing = listsOf(dump).done.some((c) => !doneAtOf(c, index));
  if (!missing) return extra;
  const fetched = await fetchListMoves(boardShort(dump, tag), ptDayStartIso(NOW));
  return fetched.length ? [...extra, ...fetched] : extra;
}

async function main() {
const commandDump = readJSON(args.command);
const kalDump = readJSON(args.kal);
const commandMoves = await extraMoves(args.command, commandDump, 'CMD', args['command-activity']);
const kalMoves = await extraMoves(args.kal, kalDump, 'KAL', args['kal-activity']);
const extra = args.extra && fs.existsSync(args.extra) ? readJSON(args.extra) : {};
let prev = null;
if (args.prev && fs.existsSync(args.prev)) prev = readJSON(args.prev);
const { status, snap, stamped } = composeStatus({
  commandDump, kalDump, commandMoves, kalMoves, prev, extra, now: NOW,
});
const cmd = status.command, kal = status.kal;

// ---------- write cleartext (box only) + compare ----------
const strip = (o) => JSON.stringify({ ...o, updatedAt: null });
const clearPath = args.clear || 'cache/status.clear.json';
let same = false;
if (fs.existsSync(clearPath)) try { same = strip(JSON.parse(fs.readFileSync(clearPath, 'utf8'))) === strip(status); } catch { /* ignore */ }
fs.mkdirSync(path.dirname(clearPath), { recursive: true });
fs.writeFileSync(clearPath + '.next', JSON.stringify(status, null, 2) + '\n');
if (args.prev) fs.writeFileSync(args.prev + '.next', JSON.stringify({ at: status.updatedAt, snap, events: status.events }, null, 1) + '\n');

// ---------- encrypt ----------
const pass = fs.readFileSync(args['pass-file'], 'utf8').replace(/[\r\n]+$/, '');
const kdfPath = args.kdf || 'cache/kdf.json';
let kdf = fs.existsSync(kdfPath) ? JSON.parse(fs.readFileSync(kdfPath, 'utf8')) : null;
if (!kdf) { // stable salt so phones can cache the derived key; new salt only if this file is deleted
  kdf = { salt: Buffer.from(wc.getRandomValues(new Uint8Array(16))).toString('base64'), iter: 150000 };
  fs.writeFileSync(kdfPath, JSON.stringify(kdf) + '\n', { mode: 0o600 });
}
const te = new TextEncoder();
const km = await wc.subtle.importKey('raw', te.encode(pass), 'PBKDF2', false, ['deriveKey']);
const key = await wc.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: Buffer.from(kdf.salt, 'base64'), iterations: kdf.iter },
  km, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
const iv = wc.getRandomValues(new Uint8Array(12));
const ct = new Uint8Array(await wc.subtle.encrypt({ name: 'AES-GCM', iv }, key, te.encode(JSON.stringify(status))));
const env = { v: 1, alg: 'AES-GCM', kdf: 'PBKDF2-SHA256', iter: kdf.iter, salt: kdf.salt,
  iv: Buffer.from(iv).toString('base64'), ct: Buffer.from(ct).toString('base64') };
const out = args.out || 'status.json';
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(env) + '\n');
const W = (cmd.counts.waiting || 0) + (kal.counts.waiting || 0);
console.error(`built: command doing=${cmd.counts.doing} waiting=${cmd.counts.waiting} backlog=${cmd.counts.backlog} doneToday=${cmd.counts.doneToday} moves=${commandMoves.length} | kal doing=${kal.counts.doing} waiting=${kal.counts.waiting} doneToday=${kal.counts.doneToday} moves=${kalMoves.length} | glance waiting=${W} | +${stamped.length} events (${status.events.length} kept) | ${out} encrypted ${ct.length}B`);
console.log(same ? 'SAME' : 'CHANGED');
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) await main();
