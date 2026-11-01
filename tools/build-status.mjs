#!/usr/bin/env node
// Build the MW4 HUD feed from Trello "list_by_board" dumps, diff against the previous snapshot to emit
// deploy/rtb/hold/cleared events, then ENCRYPT it (AES-256-GCM, key = PBKDF2-SHA256(auth code, salt)).
// Usage:
//   node build-status.mjs --command cache/command.json --kal cache/kal.json [--extra cache/extra.json] \
//     --prev cache/prev-status.json --clear cache/status.clear.json --kdf cache/kdf.json \
//     --pass-file .pass --out docs/<token>/status.json [--now ISO]
// Writes (all box-only except --out):
//   <clear>.next        cleartext model (for build scripts / debugging; never committed)
//   <prev>.next         next snapshot {at, snap, events}; caller renames both .next files after a push
//   --out               public envelope {v,alg,kdf,iter,salt,iv,ct} — no readable card data
// Prints "SAME" when the cleartext (ignoring updatedAt) equals <clear>, else "CHANGED".
import fs from 'node:fs';
import path from 'node:path';
import { webcrypto as wc } from 'node:crypto';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) =>
  v.startsWith('--') ? [...a, [v.slice(2), arr[i + 1]]] : a, []));
const readJSON = (p) => { const t = fs.readFileSync(p, 'utf8'); return JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1)); };
const NOW = args.now ? new Date(args.now).getTime() : Date.now();

const LANES = ['Ju Kwon', 'Price', 'West', 'Ko', 'Cho', 'Jae', 'Park', 'Dunn', 'Ghost', 'Soap', 'Gaz', 'Kal'];
// Role labels. Dunn is Personal — never "Dunn Ops". Price is the only dispatcher. Flow: Kal → Price → lane.
const ROSTER = [
  { name: 'Price', role: 'Dispatcher' },
  { name: 'Kal', role: 'Intake' },
  { name: 'Ghost', role: 'Trading' },
  { name: 'Ju Kwon', role: 'Kinsora ops' },
  { name: 'Dunn', role: 'Personal' },
];
const FLOW = 'Kal → Price → lane';
const TZ = 'America/Los_Angeles';
const EVENT_TTL_MS = 6 * 3600 * 1000;
const dayKey = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(d));
const hitLane = (w) => {
  const s = String(w || '').trim().toLowerCase();
  return LANES.find((x) => x.toLowerCase() === s)
    || LANES.find((x) => !x.includes(' ') && x.toLowerCase() === s.split(/\s+/)[0]);
};

// Gap 5: lanes for cards (incl. Done cards) that carry no lane prefix. Order: label → "Lane: X" in
// description (explicit wins) → name prefix → keyword map.
const LANE_KEYWORDS = [
  [/\bATC\b/i, 'Ko'], [/News I07/i, 'Park'], [/P0 picker/i, 'West'], [/\bCart [A-E]\b/i, 'West'],
  [/\b(avatar|portrait)s?\b/i, 'Dunn'], [/\btheme\b|\bClarity\b/i, 'Ko'], [/\bSEO\b/i, 'Park'],
  [/Postiz|Reels?|TikTok|Windsor/i, 'Jae'], [/retention|BFCM email/i, 'West'], [/packaging/i, 'Cho'],
];
function laneOf(card, fallback = '') {
  const name = card.name || '';
  for (const l of card.labels || []) { const m = LANES.find((x) => (l.name || '').toLowerCase().includes(x.toLowerCase())); if (m) return m; }
  const m2 = /Lane:\s*([A-Za-z]+(?:\s+[A-Za-z]+)?)/i.exec(card.description || card.desc || '');
  if (m2 && hitLane(m2[1])) return hitLane(m2[1]);
  const multi = LANES.find((x) => x.includes(' ') && new RegExp('^\\s*' + x.replace(/ /g, '\\s+') + '\\b', 'i').test(name));
  if (multi) return multi;
  const m1 = /^\s*([A-Za-z]+)\s*(?:[:—–\-]|\s—)/.exec(name);
  if (m1 && hitLane(m1[1])) return hitLane(m1[1]);
  if (fallback) return fallback;
  for (const [re, lane] of LANE_KEYWORDS) if (re.test(card.name || '')) return lane;
  return '';
}

// Gap 4: short callsigns for AO plates / Mission Log (matches the Cursor Page list).
const SHORTS = [
  [/Build Better Brands/i, 'BBA LEARN FIRST'], [/Week 1 .*Postiz queue/i, 'W1 Postiz queue'], [/FOMO \/ Dupe/i, 'FOMO / Dupe live'],
  [/Cart D — Travel Pouch/i, 'Cart D pouch filter'], [/Cart E — Alia KIN10/i, 'Alia KIN10 reuse'], [/Cart C — promote/i, 'Cart C promote TeDcYe'],
  [/Cart B — seed HOLD/i, 'Cart B seed HOLD'], [/Cart A — measurement/i, 'Cart A Nov 7'], [/Checkout E2 remakes|Email 2 remakes/i, 'E2 remakes HOLD'],
  [/Nov 7 measurement/i, 'Cart v2 Nov 7 re-check'], [/BTS gift-reel v4/i, 'BTS reel v4 Drive HOLD'],
  [/Jewlry typo/i, 'Jewlry + Welcome'], [/KIN10 orphan deactivate/i, 'KIN10 deactivate'], [/Redeemed-flag/i, 'Redeemed-flag pack'],
  [/Theme slot cleanup/i, 'Theme slot deletes'], [/News index \(main-blog\)/i, 'News index parked'], [/AKM redesign/i, 'AKM theme watch'],
  [/Clarity daily/i, 'Clarity daily'], [/Weekly audit self-improve/i, 'Weekly audit'], [/Monthly site re-audit/i, 'Monthly re-audit'],
  [/Lifestyle stills/i, 'Lifestyle → ads'], [/BTS gift-reel/i, 'BTS gift-reel BFCM'], [/Windsor to Week 2/i, 'Windsor → W2'],
  [/Weekly content batch/i, 'Weekly content'], [/Cut\/clip short-form/i, 'Cut/clip short-form'],
  [/Meet Kevin/i, 'Meet Kevin PAUSED'], [/Kraken — waiting on API/i, 'Kraken API keys'], [/Cameron \/ Wolf Pack/i, 'Cameron / Wolf Pack'],
  [/BFCM packaging/i, 'BFCM packaging HOLD'], [/weekday morning intake/i, 'AM intake (standing)'], [/post-meeting light checks/i, 'Post-meet checks'],
  [/SEO briefs I01/i, 'SEO briefs I01–I22'], [/Standing SEO routines/i, 'SEO routines'], [/BFCM email\/SMS/i, 'BFCM email/SMS'],
  [/daily retention pulse/i, 'Daily pulse'], [/weekly retention plan/i, 'Weekly plan'],
  [/P0 picker/i, 'P0 + Cart D LIVE'], [/ATC timeout/i, 'ATC flake fixed'], [/News I07 published/i, 'News I07 LIVE'],
  [/Ghost avatar LIVE/i, 'Ghost gear v4'], [/Soap \+ Gaz avatars LIVE/i, 'Soap + Gaz LIVE'], [/remake Ghost avatar/i, 'Ghost avatar remake'],
  [/portraits REGEN/i, 'Soap + Gaz regen'],
];
const MAX_SHORT = 28;
function shortOf(name, lane) {
  const n = String(name || '');
  for (const [re, s] of SHORTS) if (re.test(n)) return s;
  let t = n.replace(new RegExp('^\\s*(' + LANES.join('|') + ')\\s*(?::|—|–|-)\\s*', 'i'), '');
  t = t.replace(/\s*\((?:Shopify|standing)\)\s*$/i, '').replace(/\s+—\s+/g, ' ').replace(/\s+/g, ' ').trim();
  t = t.charAt(0).toUpperCase() + t.slice(1);
  if (t.length <= MAX_SHORT) return t;
  const cut = t.slice(0, MAX_SHORT - 1), sp = cut.lastIndexOf(' ');
  return (sp > 14 ? cut.slice(0, sp) : cut).replace(/[\s,;:+/·—–-]+$/, '') + '…';
}

const slim = (c, fb) => { const lane = laneOf(c, fb); return { id: (c.id || '').split('/').pop(), name: c.name, short: shortOf(c.name, lane), lane, url: c.shortUrl || c.url || '' }; };

function board(dump, fb, tag) {
  const by = {};
  for (const l of dump.lists || []) by[l.name.trim().toLowerCase()] = l.cards || [];
  const get = (...names) => names.map((n) => by[n]).find(Boolean) || [];
  const doing = get('doing'), waiting = get('waiting on hunter', 'waiting'), backlog = get('backlog'), done = get('done');
  const today = dayKey(NOW);
  const snap = {};
  for (const [list, arr] of [['doing', doing], ['waiting', waiting], ['backlog', backlog], ['done', done]])
    for (const c of arr) { const s = slim(c, fb); snap[s.id] = { list, op: s.lane || 'TF141', short: s.short, board: tag }; }
  return {
    snap,
    out: {
      lists: { doing: doing.map((c) => slim(c, fb)), waiting: waiting.map((c) => slim(c, fb)), backlog: backlog.map((c) => slim(c, fb)),
        done: [...done].sort((a, b) => String(b.lastActivityAt || '').localeCompare(String(a.lastActivityAt || ''))).slice(0, 8)
          .map((c) => ({ ...slim(c, fb), doneAt: c.lastActivityAt || null })) },
      counts: { doing: doing.length, waiting: waiting.length, backlog: backlog.length,
        doneToday: done.filter((c) => c.lastActivityAt && dayKey(c.lastActivityAt) === today).length },
    },
  };
}

const C = board(readJSON(args.command), '', 'CMD');
const Kb = board(readJSON(args.kal), 'Ghost', 'KAL');
const cmd = C.out, kal = Kb.out;
const extra = args.extra && fs.existsSync(args.extra) ? readJSON(args.extra) : {};
const snap = { ...C.snap, ...Kb.snap };

// ---------- Gap 3: events from previous snapshot ----------
let prev = null;
if (args.prev && fs.existsSync(args.prev)) prev = readJSON(args.prev);
let prevSnap = prev && prev.snap;
if (prev && !prevSnap && prev.command) { // legacy: previous published cleartext status.json
  prevSnap = {};
  for (const [B, tag] of [[prev.command, 'CMD'], [prev.kal, 'KAL']]) for (const k of ['doing', 'waiting', 'backlog', 'done'])
    for (const c of (B && B.lists && B.lists[k]) || []) prevSnap[c.id] = { list: k, op: c.lane || (tag === 'KAL' ? 'Ghost' : 'TF141'), short: c.short || shortOf(c.name, c.lane), board: tag };
}
const fresh = [];
if (prevSnap) {
  const ids = new Set([...Object.keys(prevSnap), ...Object.keys(snap)]);
  for (const id of ids) {
    const p = prevSnap[id] && prevSnap[id].list, n = snap[id] && snap[id].list;
    if (p === n) continue;
    const info = snap[id] || prevSnap[id];
    const add = (kind, from, to) => fresh.push({ op: info.op, kind, mission: info.short, from: from || 'new', to: to || 'archived', card: id, board: info.board });
    if (n === 'doing') { if (p === 'waiting') add('cleared', p, n); add('deploy', p, n); }
    else if (p === 'doing') { if (n === 'waiting') add('hold', p, n); else add('rtb', p, n); }
    else if (n === 'done' && p) { if (p === 'waiting') add('cleared', p, n); add('deploy', p, 'doing'); add('rtb', 'doing', n); } // shipped between polls
    else if (n === 'waiting') add('hold', p, n);
    else if (p === 'waiting') add('cleared', p, n);
  }
}
const ORDER = { cleared: 0, deploy: 1, hold: 2, rtb: 3 };
fresh.sort((a, b) => a.card.localeCompare(b.card) || ORDER[a.kind] - ORDER[b.kind]);
// keep per-card order (cleared → deploy → rtb) but give every event a unique, increasing timestamp
const stamped = fresh.map((e, i) => ({ t: new Date(NOW + i).toISOString(), ...e }));
const events = [...((prev && prev.events) || []), ...stamped].filter((e) => NOW - Date.parse(e.t) < EVENT_TTL_MS).slice(-60);

// ---------- lanes / alerts / glance ----------
const lanes = LANES.filter((n) => n !== 'Price').map((name) => {
  const src = name === 'Ghost' ? kal : cmd;
  const d = src.lists.doing.filter((c) => c.lane === name), w = src.lists.waiting.filter((c) => c.lane === name);
  const status = w.length ? 'blocked' : d.length ? 'active' : 'idle';
  return { name, status, note: w.length ? `${w.length} waiting on Hunter` : d.length ? d[0].short : '' };
});
const alerts = [];
const W = cmd.counts.waiting + kal.counts.waiting;
if (W) alerts.push({ level: 'warn', text: `${W} card${W > 1 ? 's' : ''} waiting on Hunter (${cmd.counts.waiting} Command · ${kal.counts.waiting} Ghost)` });
if (cmd.counts.doneToday) alerts.push({ level: 'go', text: `${cmd.counts.doneToday} shipped today` });
if (!cmd.counts.doing) alerts.push({ level: 'info', text: 'Nothing in Doing on Command' });

const status = {
  updatedAt: new Date(NOW).toISOString(),
  source: 'kinsora-command',
  command: { boardUrl: 'https://trello.com/b/JcLDGY59/kinsora-command', ...cmd },
  kal: { boardUrl: 'https://trello.com/b/9zrVdX34/kal-trading', ...kal },
  lanes: extra.lanes || lanes,
  alerts: extra.alerts || alerts,
  roster: ROSTER,
  flow: FLOW,
  glance: extra.glance || {
    line1: `${cmd.counts.doing} doing · ${cmd.counts.waiting} waiting on you`,
    line2: cmd.lists.waiting[0] ? `Next: ${cmd.lists.waiting[0].short}` : (cmd.lists.doing[0] ? `Now: ${cmd.lists.doing[0].short}` : 'All clear'),
    badge: W ? `${W} WAIT` : 'CLEAR',
  },
  events,
};

// ---------- write cleartext (box only) + compare ----------
const strip = (o) => JSON.stringify({ ...o, updatedAt: null });
const clearPath = args.clear || 'cache/status.clear.json';
let same = false;
if (fs.existsSync(clearPath)) try { same = strip(JSON.parse(fs.readFileSync(clearPath, 'utf8'))) === strip(status); } catch { /* ignore */ }
fs.mkdirSync(path.dirname(clearPath), { recursive: true });
fs.writeFileSync(clearPath + '.next', JSON.stringify(status, null, 2) + '\n');
if (args.prev) fs.writeFileSync(args.prev + '.next', JSON.stringify({ at: status.updatedAt, snap, events }, null, 1) + '\n');

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
console.error(`built: command doing=${cmd.counts.doing} waiting=${cmd.counts.waiting} backlog=${cmd.counts.backlog} doneToday=${cmd.counts.doneToday} | kal doing=${kal.counts.doing} waiting=${kal.counts.waiting} | +${stamped.length} events (${events.length} kept) | ${out} encrypted ${ct.length}B`);
console.log(same ? 'SAME' : 'CHANGED');
