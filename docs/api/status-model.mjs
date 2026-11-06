// Shared MW4 status model. The box (tools/build-status.mjs) and the Trello webhook
// both build cleartext through composeStatus, then encrypt. No filesystem, no network.

export const LANES = ['Ju Kwon', 'Price', 'West', 'Ko', 'Cho', 'Jae', 'Park', 'Dunn', 'Ghost', 'Soap', 'Gaz', 'Kal', 'Laswell'];
// Role labels. Dunn is Personal — never "Dunn Ops". Price is the only dispatcher. Flow: Kal → Price → lane.
// Laswell owns care@ only. Ju Kwon stays Kinsora ops back-office. Intercom is not a care owner.
const ROSTER = [
  { name: 'Price', role: 'Dispatcher' },
  { name: 'Kal', role: 'Intake' },
  { name: 'Ghost', role: 'Trading' },
  { name: 'Ju Kwon', role: 'Kinsora ops' },
  { name: 'Laswell', role: 'Care' },
  { name: 'Dunn', role: 'Personal' },
];
const FLOW = 'Kal → Price → lane';
const TZ = 'America/Los_Angeles';
const EVENT_TTL_MS = 6 * 3600 * 1000;
const dayKey = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(d));
// Duo is the fold device (Duo-primary / Duo width), not a callsign. HUD cards tagged Lane: Duo
// belong to Ko. Leaving the token unmatched used to drop the lane (blank plate, or TF141 on events).
const LANE_ALIAS = { duo: 'Ko' };
export function hitLane(w) {
  const s = String(w || '').trim().toLowerCase();
  if (LANE_ALIAS[s]) return LANE_ALIAS[s];
  const first = s.split(/\s+/)[0];
  if (LANE_ALIAS[first]) return LANE_ALIAS[first];
  return LANES.find((x) => x.toLowerCase() === s)
    || LANES.find((x) => !x.includes(' ') && x.toLowerCase() === first);
}

function listAfterName(action) {
  if (!action || typeof action !== 'object') return '';
  const data = action.data && typeof action.data === 'object' ? action.data : {};
  const raw = action.listAfter || data.listAfter || (data.list && data.list.after);
  if (typeof raw === 'string') return raw;
  if (raw && raw.name) return String(raw.name);
  return '';
}

function isDoneMove(action) {
  const after = listAfterName(action).trim();
  const key = String((action && (action.displayKey || action.type)) || '');
  return /^done$/i.test(after) || key === 'action_move_card_to_done';
}

function cardKeys(card) {
  const keys = [];
  const push = (v) => {
    const s = String(v || '').trim();
    if (s && !keys.includes(s)) keys.push(s);
  };
  if (!card || typeof card !== 'object') return keys;
  push(card.shortLink);
  push(card.id);
  push(String(card.id || '').split('/').pop());
  for (const u of [card.shortUrl, card.url]) {
    const m = /\/c\/([A-Za-z0-9]+)/.exec(String(u || ''));
    if (m) push(m[1]);
  }
  return keys;
}

function actionCardKeys(action) {
  const data = action && action.data && typeof action.data === 'object' ? action.data : {};
  const card = { ...(data.card || {}), ...(action && action.card || {}) };
  if (!card.id && action && action.idCard) card.id = action.idCard;
  return cardKeys(card);
}

export function normalizeActivity(activity) {
  if (!activity || activity instanceof Map || typeof activity !== 'object') return [];
  if (Array.isArray(activity)) return activity;
  if (Array.isArray(activity.activities)) return activity.activities;
  if (Array.isArray(activity.activity)) return activity.activity;
  if (Array.isArray(activity.actions)) return activity.actions;
  return [];
}

// Latest move into Done, keyed by card id tail and short link. Comments are not entries.
export function doneMoveIndex(activity) {
  const idx = new Map();
  for (const action of normalizeActivity(activity)) {
    if (!isDoneMove(action)) continue;
    const t = String(action.date || action.t || '');
    if (!t) continue;
    for (const id of actionCardKeys(action)) {
      if (t > (idx.get(id) || '')) idx.set(id, t);
    }
  }
  return idx;
}

function lookupMove(card, index) {
  if (!index || !index.size) return '';
  let best = '';
  for (const k of cardKeys(card)) {
    const t = index.get(k) || '';
    if (t > best) best = t;
  }
  return best;
}

export function activityOf(dump, extra) {
  return [
    ...normalizeActivity(extra),
    ...normalizeActivity(dump && dump.activities),
    ...normalizeActivity(dump && dump.activity),
    ...normalizeActivity(dump && dump.actions),
  ];
}

// When the card entered the Done list. Not lastActivityAt. `moves` is a doneMoveIndex
// or a board activity list/wrapper used when the card itself has no stamp.
export function doneAtOf(card, moves) {
  if (!card || typeof card !== 'object') return null;
  let best = '';
  for (const key of ['completedAt', 'dateCompleted', 'movedToDoneAt']) {
    const t = card[key] ? String(card[key]) : '';
    if (t > best) best = t;
  }
  const acts = Array.isArray(card.actions) ? card.actions : Array.isArray(card.activity) ? card.activity : [];
  for (const action of acts) {
    if (!isDoneMove(action)) continue;
    const t = String(action.date || action.t || '');
    if (t > best) best = t;
  }
  const index = moves instanceof Map ? moves : doneMoveIndex(moves);
  const fromBoard = lookupMove(card, index);
  if (fromBoard > best) best = fromBoard;
  return best || null;
}

// Gap 5: lanes for cards (incl. Done cards) that carry no lane prefix. Order: label → "Lane: X" in
// description (explicit wins) → name prefix → keyword map.
const LANE_KEYWORDS = [
  [/\bATC\b/i, 'Ko'], [/^\s*HUD\b/i, 'Ko'], [/News I07/i, 'Park'], [/P0 picker/i, 'West'], [/\bCart [A-E]\b/i, 'West'],
  [/\b(avatar|portrait)s?\b/i, 'Dunn'], [/\btheme\b|\bClarity\b/i, 'Ko'], [/\bSEO\b/i, 'Park'],
  [/Postiz|Reels?|TikTok|Windsor/i, 'Jae'], [/retention|BFCM email/i, 'West'], [/packaging/i, 'Cho'],
];
export function laneOf(card, fallback = '') {
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

export function listsOf(dump) {
  const by = {};
  for (const l of (dump && dump.lists) || []) by[String(l.name || '').trim().toLowerCase()] = l.cards || [];
  const get = (...names) => names.map((n) => by[n]).find(Boolean) || [];
  return { doing: get('doing'), waiting: get('waiting on hunter', 'waiting'), backlog: get('backlog'), done: get('done') };
}

export function board(dump, fb, tag, now = Date.now(), moves) {
  const { doing, waiting, backlog, done } = listsOf(dump);
  const today = dayKey(now);
  const index = doneMoveIndex(activityOf(dump, moves));
  const snap = {};
  for (const [list, arr] of [['doing', doing], ['waiting', waiting], ['backlog', backlog], ['done', done]])
    for (const c of arr) { const s = slim(c, fb); snap[s.id] = { list, op: s.lane || 'TF141', short: s.short, board: tag }; }
  return {
    snap,
    out: {
      lists: { doing: doing.map((c) => slim(c, fb)), waiting: waiting.map((c) => slim(c, fb)), backlog: backlog.map((c) => slim(c, fb)),
        done: [...done].sort((a, b) => String(b.lastActivityAt || '').localeCompare(String(a.lastActivityAt || ''))).slice(0, 8)
          .map((c) => ({ ...slim(c, fb), doneAt: doneAtOf(c, index) })) },
      counts: { doing: doing.length, waiting: waiting.length, backlog: backlog.length,
        doneToday: done.filter((c) => { const at = doneAtOf(c, index); return at && dayKey(at) === today; }).length },
    },
  };
}

export function glanceFor(cmd, kal) {
  const W = (cmd.counts.waiting || 0) + (kal.counts.waiting || 0);
  const nextWait = (cmd.lists.waiting || [])[0] || (kal.lists.waiting || [])[0];
  const nowCard = (cmd.lists.doing || [])[0] || (kal.lists.doing || [])[0];
  return {
    line1: `${(cmd.counts.doing || 0) + (kal.counts.doing || 0)} doing · ${W} waiting on you`,
    line2: nextWait ? `Next: ${nextWait.short}` : (nowCard ? `Now: ${nowCard.short}` : 'All clear'),
    badge: W ? `${W} WAIT` : 'CLEAR',
  };
}

// An --extra glance blob must not put Command-only waiting back into line1 or the badge.
export function glanceMerged(extra, cmd, kal) {
  const base = glanceFor(cmd, kal);
  const over = extra && extra.glance;
  if (!over) return base;
  let line1 = String(over.line1 || base.line1);
  if (/\bwaiting on you\b/i.test(line1)) line1 = line1.replace(/\d+(?=\s+waiting on you\b)/i, String((cmd.counts.waiting || 0) + (kal.counts.waiting || 0)));
  return { ...base, ...over, line1, badge: base.badge };
}

export function ptDayStartIso(now) {
  const day = dayKey(now);
  for (const off of ['-07:00', '-08:00']) {
    const ms = Date.parse(`${day}T00:00:00.000${off}`);
    if (Number.isNaN(ms) || dayKey(ms) !== day || dayKey(ms - 1) === day) continue;
    return new Date(ms).toISOString();
  }
  return new Date(`${day}T08:00:00.000Z`).toISOString();
}

// Previous published status (or { snap, events }) -> the snapshot map the box stores in prev-status.
export function snapFromStatus(status) {
  if (status && status.snap && !status.command) return status.snap;
  const snap = {};
  if (!status) return snap;
  for (const [B, tag] of [[status.command, 'CMD'], [status.kal, 'KAL']]) {
    for (const k of ['doing', 'waiting', 'backlog', 'done']) {
      for (const c of (B && B.lists && B.lists[k]) || []) {
        snap[c.id] = {
          list: k,
          op: c.lane || (tag === 'KAL' ? 'Ghost' : 'TF141'),
          short: c.short || shortOf(c.name, c.lane),
          board: tag,
        };
      }
    }
  }
  return snap;
}

// Same cleartext the box writes before encryption. `prev` is the box snapshot
// { snap, events } or a previous cleartext status (legacy).
export function composeStatus({ commandDump, kalDump, commandMoves = [], kalMoves = [], prev = null, extra = null, now = Date.now() } = {}) {
  const C = board(commandDump, '', 'CMD', now, commandMoves);
  const Kb = board(kalDump, 'Ghost', 'KAL', now, kalMoves);
  const cmd = C.out, kal = Kb.out;
  const extraObj = extra || {};
  const snap = { ...C.snap, ...Kb.snap };

  let prevSnap = prev && prev.snap;
  if (prev && !prevSnap && prev.command) prevSnap = snapFromStatus(prev);
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
      else if (n === 'done' && p) { if (p === 'waiting') add('cleared', p, n); add('deploy', p, 'doing'); add('rtb', 'doing', n); }
      else if (n === 'waiting') add('hold', p, n);
      else if (p === 'waiting') add('cleared', p, n);
    }
  }
  const ORDER = { cleared: 0, deploy: 1, hold: 2, rtb: 3 };
  fresh.sort((a, b) => a.card.localeCompare(b.card) || ORDER[a.kind] - ORDER[b.kind]);
  const stamped = fresh.map((e, i) => ({ t: new Date(now + i).toISOString(), ...e }));
  const events = [...((prev && prev.events) || []), ...stamped].filter((e) => now - Date.parse(e.t) < EVENT_TTL_MS).slice(-60);

  const lanes = LANES.filter((n) => n !== 'Price').map((name) => {
    const src = name === 'Ghost' ? kal : cmd;
    const d = src.lists.doing.filter((c) => c.lane === name), w = src.lists.waiting.filter((c) => c.lane === name);
    const status = w.length ? 'blocked' : d.length ? 'active' : 'idle';
    return { name, status, note: w.length ? `${w.length} waiting on Hunter` : d.length ? d[0].short : '' };
  });
  const alerts = [];
  const W = cmd.counts.waiting + kal.counts.waiting;
  if (W) alerts.push({ level: 'warn', text: `${W} card${W > 1 ? 's' : ''} waiting on Hunter (${cmd.counts.waiting} Command · ${kal.counts.waiting} Ghost)` });
  const shipped = (cmd.counts.doneToday || 0) + (kal.counts.doneToday || 0);
  if (shipped) alerts.push({ level: 'go', text: `${shipped} shipped today` });
  if (!cmd.counts.doing) alerts.push({ level: 'info', text: 'Nothing in Doing on Command' });

  const status = {
    updatedAt: new Date(now).toISOString(),
    source: 'kinsora-command',
    command: { boardUrl: 'https://trello.com/b/JcLDGY59/kinsora-command', ...cmd },
    kal: { boardUrl: 'https://trello.com/b/9zrVdX34/kal-trading', ...kal },
    lanes: extraObj.lanes || lanes,
    alerts: extraObj.alerts || alerts,
    roster: ROSTER,
    flow: FLOW,
    glance: glanceMerged(extraObj, cmd, kal),
    events,
  };
  return { status, snap, stamped };
}
