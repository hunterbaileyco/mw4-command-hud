/* Glass v3 painters. Numbers come from the feeds the theater already polls.
   A missing series stays off the chart. Nothing numeric is filled in. */
(function (w) {
  'use strict';

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));

  const OPS = () => (w.MW4Roster && w.MW4Roster.OPS) ||
    ['Price', 'Ghost', 'Cho', 'West', 'Ko', 'Park', 'Jae', 'Ju Kwon', 'Soap', 'Gaz', 'Kal', 'Laswell'];

  function faceFile(op) {
    if (w.MW4Roster && w.MW4Roster.faceFile) return w.MW4Roster.faceFile(op);
    return String(op || '').toLowerCase().replace(/\s+/g, '-');
  }
  function slugOf(op) {
    if (w.MW4Roster && w.MW4Roster.slugOf) return w.MW4Roster.slugOf(op);
    return String(op || '').toLowerCase().replace(/\s+/g, '-');
  }
  function initials(op) {
    if (op === 'Ju Kwon') return 'JK';
    if (op === 'Hunter') return 'HB';
    return String(op || '').slice(0, 2).toUpperCase();
  }
  function mission(c) {
    if (c && c.short) return c.short;
    if (w.MW4Roster && w.MW4Roster.missionText) return w.MW4Roster.missionText(c);
    return String((c && c.name) || '—');
  }
  function boardName(code) {
    return code === 'KAL' ? 'Trading' : 'Command';
  }
  function standing(c) {
    if (w.MW4Action && w.MW4Action.isStanding) return w.MW4Action.isStanding(c);
    const name = String((c && c.name) || '');
    const short = String((c && c.short) || '');
    return /\(\s*standing\s*\)/i.test(name) || /\(\s*standing\s*\)/i.test(short) || /\bstanding\b/i.test(name);
  }
  function trello(u) {
    return /^https:\/\/trello\.com\//.test(u || '') ? u : '';
  }
  function httpsUrl(u) {
    return /^https:\/\//.test(u || '') ? u : '';
  }

  function laneOf(c, fb) {
    const ops = OPS();
    if (/^duo$/i.test(c.lane || '')) return 'Ko';
    if (c.lane) {
      const hit = ops.find((o) => o.toLowerCase() === String(c.lane).toLowerCase());
      return hit || c.lane;
    }
    const name = String(c.name || '');
    const multi = ops.find((o) => /\s/.test(o) && new RegExp('^\\s*' + o.replace(/\s+/g, '\\s+') + '\\b', 'i').test(name));
    if (multi) return multi;
    const m = /^\s*([A-Za-z]+)/.exec(name);
    if (m && /^duo$/i.test(m[1])) return 'Ko';
    const hit = m && ops.find((o) => o.toLowerCase() === m[1].toLowerCase());
    return hit || fb || '';
  }

  function cardsOf(d) {
    const out = [];
    if (!d) return out;
    for (const [board, B, fb] of [['CMD', d.command, ''], ['KAL', d.kal, 'Ghost']]) {
      const lists = (B && B.lists) || {};
      for (const list of ['doing', 'waiting', 'backlog', 'done']) {
        for (const c of lists[list] || []) {
          const lane = laneOf(c, fb);
          out.push(Object.assign({}, c, { lane, list, board }));
        }
      }
    }
    return out;
  }

  function holdAge(card, events) {
    const hits = (events || []).filter((e) => e.kind === 'hold' && (
      (card.id && e.card === card.id) ||
      (e.op === card.lane && e.mission && (e.mission === card.short || e.mission === card.name))
    ));
    if (!hits.length) return null;
    const t = Math.max.apply(null, hits.map((e) => Date.parse(e.t)).filter((n) => !isNaN(n)));
    return Number.isFinite(t) ? Date.now() - t : null;
  }
  function fmtAge(ms) {
    const m = Math.max(0, Math.round(ms / 60000));
    if (m < 60) return m + 'm';
    const h = Math.floor(m / 60);
    if (h < 48) return h + 'h' + (m % 60 ? (m % 60) + 'm' : '');
    return Math.floor(h / 24) + 'd' + (h % 24) + 'h';
  }

  function ptParts(iso, opts) {
    const d = new Date(iso);
    if (!iso || isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('en-US', Object.assign({ timeZone: 'America/Los_Angeles' }, opts)).format(d);
  }
  function syncLine(iso) {
    const date = ptParts(iso, { weekday: 'long', month: 'short', day: 'numeric' });
    const time = ptParts(iso, { hour: 'numeric', minute: '2-digit' });
    if (!date) return 'Not synced yet';
    return date + ' · synced ' + time;
  }
  function syncShort(iso) {
    const date = ptParts(iso, { month: 'short', day: 'numeric' });
    const time = ptParts(iso, { hour: 'numeric', minute: '2-digit' });
    if (!date) return 'Not synced yet';
    return date + ' · ' + time + ' PT';
  }

  function money(n) {
    const L = w.MW4Ledger;
    if (L && L.format) return L.format.moneyFull(n);
    const v = Number(n) || 0;
    const body = '$' + String(Math.round(Math.abs(v))).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (v < 0 ? '−' : '') + body;
  }
  function compact(v) {
    if (v == null || !Number.isFinite(Number(v))) return '—';
    const n = Number(v);
    const sign = n < 0 ? '−' : '';
    const a = Math.abs(n);
    if (a >= 1e6) return sign + (a / 1e6).toFixed(1) + 'M';
    if (a >= 1e4) return sign + Math.round(a / 1e3) + 'K';
    if (a >= 1e3) return sign + (a / 1e3).toFixed(1) + 'K';
    return sign + String(Math.round(a));
  }

  function avatar(base, op, cls) {
    const ini = initials(op);
    return '<img class="' + cls + '" alt="" src="' + esc(base) + 'avatars/' + esc(faceFile(op)) + '.png" data-ini="' + esc(ini) + '" onerror="var s=document.createElement(\'span\');s.className=this.className+\' ini\';s.textContent=this.getAttribute(\'data-ini\');this.replaceWith(s)">';
  }
  function logo(word) {
    return '<span class="g-logo"><i>KI</i>' + (word === false ? '' : 'KINSORA') + '</span>';
  }

  function nav(opts) {
    const o = opts || {};
    const home = o.home || (o.base || '') + './';
    const settings = (o.base || '') + 'settings/';
    const who = o.who ? avatar(o.base || '', o.who, '') : '';
    const sound = o.sound
      ? '<button type="button" class="g-ic" data-sound-face aria-label="Toggle sound" aria-pressed="true">🔊</button>'
      : (who ? '<a class="g-mini" href="' + esc((o.base || '') + 'files/#' + esc(slugOf(o.who))) + '" aria-label="' + esc(o.who) + '">' + who + '</a>' : '');
    const profile = o.profile === false ? '' : '<a class="g-mini ini" href="' + esc(settings) + '" aria-label="Settings">HB</a>';
    return '<div class="g g-nav"><a class="g-brand" href="' + esc(home) + '">' + logo(!o.title) +
      (o.title ? '<span>' + esc(o.title) + '</span>' : '') + '</a><span class="g-nav-r">' +
      sound + profile + '<span data-hud-mode></span></span></div>';
  }

  function shell(inner) {
    return '<div class="g-wrap">' + inner + '</div>';
  }

  let last = null;

  function rootEl() {
    return document.getElementById('glass');
  }

  function show(page, data, opts) {
    last = { page: page, data: data, opts: opts || {} };
    paint();
  }

  function paint() {
    const root = rootEl();
    if (!root || !last) return;
    const page = last.page;
    const data = last.data;
    const opts = last.opts || {};
    let html = '';
    if (page === 'command') html = paintCommand(data, opts);
    else if (page === 'ledger') html = paintLedger(data, opts);
    else if (page === 'social') html = paintSocial(data, opts);
    else if (page === 'care') html = paintCare(data, opts);
    else if (page === 'orbat') html = paintOrbat(data, opts);
    else if (page === 'settings') html = paintSettings(opts);
    else html = shell(nav(opts) + '<div class="g-hero"><h1>Glass</h1></div>');
    const y = window.scrollY;
    root.innerHTML = html;
    if (w.MW4Mode) w.MW4Mode.mount(root);
    bind(root, page);
    if (page === 'settings') fillSettings(opts);
    if (y) window.scrollTo(0, y);
  }

  function bind(root, page) {
    root.querySelectorAll('button[data-sound-face]').forEach((btn) => {
      if (btn.dataset.bound === '1') return;
      btn.dataset.bound = '1';
      btn.addEventListener('click', () => {
        const snd = document.getElementById('snd');
        if (snd) snd.click();
        else if (w.MW4Mode) w.MW4Mode.setSound(!w.MW4Mode.soundOn());
      });
    });
    if (page !== 'settings') return;
    const sound = root.querySelector('[data-sound-switch]');
    if (sound) sound.addEventListener('click', () => {
      if (!w.MW4Mode) return;
      w.MW4Mode.setSound(!w.MW4Mode.soundOn());
    });
    const refresh = root.querySelector('[data-refresh-face]');
    if (refresh) refresh.addEventListener('click', () => {
      if (!w.MW4Mode) return;
      w.MW4Mode.setRefresh(!w.MW4Mode.refreshOn());
    });
    const lock = root.querySelector('[data-lock]');
    if (lock) lock.addEventListener('click', () => { location.reload(); });
  }

  function paintCommand(d, opts) {
    const base = opts.base || '';
    const cards = cardsOf(d);
    const events = (d && d.events) || [];
    const waiting = cards.filter((c) => c.list === 'waiting').map((c) => Object.assign({ age: holdAge(c, events) }, c))
      .sort((a, b) => (b.age || 0) - (a.age || 0));
    const doing = cards.filter((c) => c.list === 'doing' && !standing(c));
    const queued = cards.filter((c) => c.list === 'backlog');
    const cc = (d && d.command && d.command.counts) || {};
    const kc = (d && d.kal && d.kal.counts) || {};
    const shipped = (cc.doneToday || 0) + (kc.doneToday || 0);
    const lanes = new Set(doing.map((c) => c.lane).filter(Boolean));
    const busy = new Set(waiting.map((c) => c.lane).concat(doing.map((c) => c.lane)));
    const roster = OPS().concat(['Dunn']);
    const idle = roster.filter((op, i) => roster.indexOf(op) === i && !busy.has(op));
    const faces = [];
    waiting.concat(doing).forEach((c) => {
      if (c.lane && faces.indexOf(c.lane) < 0 && faces.length < 8) faces.push(c.lane);
    });
    const nWait = waiting.length;
    const err = opts.error ? '<p class="g-quiet">' + esc(opts.error) + '</p>' : '';
    const when = d && d.updatedAt ? syncLine(d.updatedAt) : (opts.error ? 'Feed unavailable' : 'Syncing…');
    if (d && d.updatedAt && w.MW4Mode) w.MW4Mode.markSynced(d.updatedAt);

    const rowWait = (c) => {
      const thumb = httpsUrl(c.image || c.thumb || c.photo);
      const href = trello(c.url) || (base + 'files/#' + slugOf(c.lane));
      return '<div class="g-row">' + avatar(base, c.lane, 'g-av') +
        '<span class="g-x"><b>' + esc(mission(c)) + '</b><i>' + esc(c.lane || 'Lane') + ' · ' + esc(boardName(c.board)) +
        (c.age != null ? ' · ' + esc(fmtAge(c.age)) : '') + '</i></span>' +
        (thumb ? '<img class="g-pr" alt="" src="' + esc(thumb) + '">' : '') +
        '<a class="g-btn" href="' + esc(href) + '"' + (trello(c.url) ? ' target="_blank" rel="noopener"' : '') + '>Review</a></div>';
    };
    const rowDo = (c) => {
      const thumb = httpsUrl(c.image || c.thumb || c.photo);
      return '<a class="g-row" href="' + esc(trello(c.url) || (base + 'files/#' + slugOf(c.lane))) + '">' +
        avatar(base, c.lane, 'g-av') + '<span class="g-x"><b>' + esc(mission(c)) + '</b><i>' + esc(c.lane || '') + '</i></span>' +
        (thumb ? '<img class="g-pr" alt="" src="' + esc(thumb) + '">' : '') +
        '<span class="g-dot" aria-hidden="true"></span></a>';
    };

    const team = ['Price', 'Kal', 'Ghost', 'Ju Kwon'].map((op) => avatar(base, op, '')).join('');
    return shell(
      nav({ base: base, home: opts.home || (base + './'), sound: true, profile: true }) +
      '<div class="g-hero"><small>' + esc(when) + '</small>' +
      '<h1><span class="g-need">' + nWait + '</span> need you.</h1>' +
      '<p>' + doing.length + ' in progress · ' + shipped + ' shipped today</p>' +
      (faces.length ? '<div class="g-faces">' + faces.map((op) => avatar(base, op, '')).join('') + '</div>' : '') +
      err + '</div>' +
      '<div class="g g-kpi"><div><b>' + doing.length + '</b><span>Active</span></div>' +
      '<div><b>' + nWait + '</b><span>Waiting</span></div>' +
      '<div><b>' + queued.length + '</b><span>Queued</span></div>' +
      '<div><b>' + shipped + '</b><span>Shipped</span></div></div>' +
      '<div class="g-cols">' +
      '<section class="g g-card"><h2>Waiting on you</h2><div class="g-sub">Tap to decide</div>' +
      (waiting.length ? waiting.map(rowWait).join('') : '<p class="g-quiet">Nothing is waiting on you.</p>') +
      '</section>' +
      '<section class="g g-card"><h2>In progress</h2><div class="g-sub">' + lanes.size + (lanes.size === 1 ? ' lane active' : ' lanes active') + '</div>' +
      (doing.length ? doing.map(rowDo).join('') : '<p class="g-quiet">No lanes are in progress.</p>') +
      '</section></div>' +
      '<div class="g-sec">Overview</div>' +
      '<div class="g-tiles">' +
      tile(base + 'ledger/', 'Ledger', 'Books') +
      tile(base + 'social/', 'Social', 'Posts') +
      '<a class="g g-tile" href="' + esc(base + 'care/') + '">' + avatar(base, 'Laswell', 'shot') + '<span>Care · Laswell</span><b>Inbox</b></a>' +
      '<a class="g g-tile" href="' + esc(base + 'orbat/') + '"><div class="team">' + team + '</div><span>Team</span><b>' + OPS().length + ' lanes</b></a>' +
      '</div>' +
      '<div class="g-sec">Standing by</div>' +
      '<div class="g-idle">' + idle.map((op) =>
        '<a class="g g-chip" href="' + esc(base + 'files/#' + slugOf(op)) + '">' + avatar(base, op, '') + esc(plainRole(op)) + '</a>'
      ).join('') + '</div>'
    );
  }

  function tile(href, label, big) {
    return '<a class="g g-tile" href="' + esc(href) + '"><span>' + esc(label) + '</span><b>' + esc(big) + '</b></a>';
  }

  function plainRole(op) {
    const map = {
      Hunter: 'Hunter · Owner',
      Kal: 'Kal · Intake',
      Price: 'Price · Dispatch',
      Cho: 'Cho · Creative',
      West: 'West · Retention',
      Jae: 'Jae · Social',
      Park: 'Park · SEO',
      Gaz: 'Gaz · Ads',
      'Ju Kwon': 'Ju Kwon · Ops',
      Ko: 'Ko · Build',
      Soap: 'Soap · Media',
      Laswell: 'Laswell · Care',
      Ghost: 'Ghost · Trading',
      Dunn: 'Dunn',
    };
    return map[op] || op;
  }

  function dayLabel(index, count, month) {
    const name = month && month.name ? String(month.name).slice(0, 1) + String(month.name).slice(1).toLowerCase() : '';
    if (month && month.day && count === month.day) return (name || 'Day') + ' ' + (index + 1);
    return 'D' + (index + 1);
  }

  let svgN = 0;

  function sparkSvg(values, color) {
    const nums = values.map((v) => Number(v) || 0);
    if (!nums.length) return '';
    const W = 120, baseY = 36, top = 6;
    const max = Math.max.apply(null, nums.concat([1]));
    const x = (i) => nums.length <= 1 ? W / 2 : (i * W) / (nums.length - 1);
    const y = (v) => baseY - (Math.max(0, v) / max) * (baseY - top);
    const line = nums.map((v, i) => x(i).toFixed(1) + ',' + y(v).toFixed(1)).join(' ');
    const id = 'gs' + (++svgN);
    return '<svg class="g-spark" viewBox="0 0 120 44" role="img"><defs><linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + color + '" stop-opacity=".55"/><stop offset="1" stop-color="' + color + '" stop-opacity="0"/></linearGradient></defs>' +
      '<polygon points="0,' + baseY + ' ' + line + ' ' + W + ',' + baseY + '" fill="url(#' + id + ')"/>' +
      '<polyline points="' + line + '" fill="none" stroke="' + color + '" stroke-width="2.2" stroke-linejoin="round"/>' +
      '<circle cx="' + x(nums.length - 1).toFixed(1) + '" cy="' + y(nums[nums.length - 1]).toFixed(1) + '" r="3" fill="#fff"/></svg>';
  }

  function linesSvg(series, labels) {
    const W = 340, baseY = 110, top = 10;
    const all = [];
    series.forEach((s) => s.values.forEach((v) => { if (v != null) all.push(Number(v) || 0); }));
    const max = Math.max.apply(null, all.concat([1]));
    const n = series.reduce((m, s) => Math.max(m, s.values.length), 0);
    const x = (i) => n <= 1 ? W / 2 : (i * W) / (n - 1);
    const y = (v) => baseY - (Math.max(0, Number(v) || 0) / max) * (baseY - top);
    let body = '<line x1="0" x2="340" y1="' + (baseY * 0.45).toFixed(1) + '" y2="' + (baseY * 0.45).toFixed(1) + '" stroke="rgba(255,255,255,.15)" stroke-width=".5"/>' +
      '<line x1="0" x2="340" y1="' + baseY + '" y2="' + baseY + '" stroke="rgba(255,255,255,.35)" stroke-width=".5"/>';
    series.forEach((s) => {
      let seg = [];
      const flush = () => {
        if (seg.length < 2) { seg = []; return; }
        body += '<polyline points="' + seg.join(' ') + '" fill="none" stroke="' + s.color + '" stroke-width="2.2" stroke-linejoin="round"/>';
        seg = [];
      };
      s.values.forEach((v, i) => {
        if (v == null) flush();
        else seg.push(x(i).toFixed(1) + ',' + y(v).toFixed(1));
      });
      flush();
    });
    const labs = labels.map((lb) => '<text x="' + x(lb.i).toFixed(1) + '" y="124" text-anchor="' + (lb.anchor || 'middle') + '">' + esc(lb.text) + '</text>').join('');
    return '<svg viewBox="0 0 340 132" role="img">' + body + labs + '</svg>';
  }

  function areaSvg(values, color, labels) {
    const W = 340, baseY = 110, top = 10;
    const nums = values.map((v) => Number(v) || 0);
    const max = Math.max.apply(null, nums.concat([1]));
    const min = Math.min.apply(null, nums.concat([0]));
    const span = Math.max(1, max - Math.min(0, min));
    const x = (i) => nums.length <= 1 ? W / 2 : (i * W) / (nums.length - 1);
    const y = (v) => baseY - ((v - Math.min(0, min)) / span) * (baseY - top);
    const line = nums.map((v, i) => x(i).toFixed(1) + ',' + y(v).toFixed(1)).join(' ');
    const fill = line + ' ' + x(nums.length - 1).toFixed(1) + ',' + baseY + ' ' + x(0).toFixed(1) + ',' + baseY;
    const id = 'ga' + (++svgN);
    const labs = labels.map((lb) => '<text x="' + x(lb.i).toFixed(1) + '" y="124" text-anchor="' + (lb.anchor || 'middle') + '">' + esc(lb.text) + '</text>').join('');
    return '<svg viewBox="0 0 340 132" role="img">' +
      '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + color + '" stop-opacity=".55"/><stop offset="1" stop-color="' + color + '" stop-opacity="0"/></linearGradient></defs>' +
      '<line x1="0" x2="340" y1="' + y(max * 0.66).toFixed(1) + '" y2="' + y(max * 0.66).toFixed(1) + '" stroke="rgba(255,255,255,.15)" stroke-width=".5"/>' +
      '<line x1="0" x2="340" y1="' + y(max * 0.33).toFixed(1) + '" y2="' + y(max * 0.33).toFixed(1) + '" stroke="rgba(255,255,255,.15)" stroke-width=".5"/>' +
      '<line x1="0" x2="340" y1="' + baseY + '" y2="' + baseY + '" stroke="rgba(255,255,255,.35)" stroke-width=".5"/>' +
      '<polygon points="' + fill + '" fill="url(#' + id + ')"/>' +
      '<polyline points="' + line + '" fill="none" stroke="' + color + '" stroke-width="2.2" stroke-linejoin="round"/>' +
      '<circle cx="' + x(nums.length - 1).toFixed(1) + '" cy="' + y(nums[nums.length - 1]).toFixed(1) + '" r="4" fill="#fff"/>' +
      labs + '</svg>';
  }

  function barsSvg(groups, colors, labels, signed) {
    const W = 340, baseY = 110, top = 8;
    const flat = groups.reduce((a, g) => a.concat(g), []);
    const max = Math.max.apply(null, flat.map((n) => Math.abs(Number(n) || 0)).concat([1]));
    const n = groups[0] ? groups[0].length : 0;
    const slot = n ? W / n : W;
    const bw = Math.max(4, Math.min(18, (slot * 0.72) / Math.max(1, groups.length)));
    let rects = '';
    groups.forEach((series, s) => {
      series.forEach((v, i) => {
        const num = Number(v) || 0;
        const h = (Math.abs(num) / max) * (baseY - top);
        const x = i * slot + (slot - groups.length * bw) / 2 + s * bw;
        const fill = signed ? (num < 0 ? '#ffb3a8' : '#7dffb0') : colors[s];
        rects += '<rect x="' + x.toFixed(1) + '" y="' + (baseY - h).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + h.toFixed(1) + '" rx="3" fill="' + fill + '" opacity=".9"/>';
      });
    });
    const labs = labels.map((lb) => '<text x="' + ((lb.i + 0.5) * slot).toFixed(1) + '" y="124" text-anchor="middle">' + esc(lb.text) + '</text>').join('');
    return '<svg viewBox="0 0 340 132" role="img"><line x1="0" x2="340" y1="' + baseY + '" y2="' + baseY + '" stroke="rgba(255,255,255,.35)" stroke-width=".5"/>' + rects + labs + '</svg>';
  }

  function paintLedger(model, opts) {
    const base = opts.base || '';
    const head = nav({ base: base, home: opts.home || (base + '../'), title: 'Ledger', who: 'Soap', profile: true });
    if (!model || model.source !== 'live') {
      return shell(head + '<div class="g-hero"><small>Ledger</small><h1>Books</h1><p>The live Shopify, ads, and Mercury feed is not on this page yet.</p></div>');
    }
    const d7 = model.windows && (model.windows.d7 || model.windows.mtd || model.windows.today);
    const mtd = model.mtd || d7;
    const cash = model.mercury ? model.mercury.balance : 0;
    const burn = model.mercury ? model.mercury.netBurn30d : 0;
    const daily = model.daily || [];
    const month = model.month || {};
    const contribCls = d7 && d7.contrib < 0 ? 'g-dn' : 'g-up';
    const hero = d7 ? money(d7.rev) : '—';
    const sub = d7
      ? esc(d7.label === '7D' ? '7-day revenue' : d7.label + ' revenue') + ' · ' + esc(String(d7.orders)) + ' orders · <span class="' + contribCls + '">' + esc(money(d7.contrib)) + ' contribution</span>'
      : '';
    const endLabels = daily.length
      ? [{ i: 0, text: dayLabel(0, daily.length, month), anchor: 'start' },
        { i: Math.floor((daily.length - 1) / 2), text: dayLabel(Math.floor((daily.length - 1) / 2), daily.length, month) },
        { i: daily.length - 1, text: dayLabel(daily.length - 1, daily.length, month), anchor: 'end' }]
      : [];
    const sumCm = daily.reduce((s, row) => s + (Number(row.cm) || 0), 0);
    const windows = (model.order || []).map((id) => model.windows[id]).filter(Boolean);
    const rev = windows.map((view) => view.rev);
    const spend = windows.map((view) => view.spend);
    const wlabs = windows.map((view, i) => ({ i: i, text: view.label }));
    const last = daily.slice(-3);
    const lastLabs = last.map((row, i) => ({ i: i, text: dayLabel(row.day - 1, daily.length, month) }));
    const meta = (model.lanes || []).find((lane) => lane.id === 'meta' && lane.status === 'live');
    const spendNote = meta ? 'Spend is connected ad lanes. Meta is live; other ad lanes stay off this chart until they connect.' : 'Spend is connected ad lanes only.';
    const sellers = (model.cogs && model.cogs.top) || [];
    const gap = model.cogs || {};
    const sellerNote = gap.gapCount
      ? esc(String(gap.gapCount)) + ' SKUs have no unit cost, counted at $0.'
      : 'Unit cost is set on the ' + esc(String(gap.skuCount || sellers.length)) + ' SKUs in this window.';

    return shell(head +
      '<div class="g-hero"><small>Live · Shopify + connected ads + Mercury · ' + esc(w.MW4Ledger && w.MW4Ledger.format ? w.MW4Ledger.format.asOf(model.asOf).replace(/^AS OF /i, 'as of ') : syncShort(model.asOf)) + '</small>' +
      '<h1>' + esc(hero) + '</h1><p>' + sub + '</p></div>' +
      '<div class="g g-kpi"><div><b>' + esc(d7 ? money(d7.spend) : '—') + '</b><span>' + esc(d7 ? d7.label : '') + ' spend</span></div>' +
      '<div><b>' + esc(mtd ? money(mtd.rev) : '—') + '</b><span>MTD rev</span></div>' +
      '<div><b>' + esc(money(cash)) + '</b><span>Cash</span></div>' +
      '<div><b class="' + (burn < 0 ? 'g-dn' : 'g-up') + '">' + esc(money(burn)) + '</b><span>30D net</span></div></div>' +
      '<div class="g-grid two">' +
      (daily.length ? '<section class="g g-ch"><h2>Daily contribution</h2><div class="g-sub">This month · revenue − COGS − spend</div><div class="g-big ' + (sumCm < 0 ? 'g-dn' : 'g-up') + '">' + esc(money(sumCm)) + '</div>' +
        (daily.some((row) => row.cm < 0) ? barsSvg([daily.map((row) => row.cm)], ['#7dffb0'], endLabels, true) : areaSvg(daily.map((row) => row.cm), '#7dffb0', endLabels)) + '</section>' : '') +
      (windows.length ? '<section class="g g-ch"><h2>Revenue vs spend</h2><div class="g-sub">' + esc(spendNote) + '</div>' +
        barsSvg([rev, spend], ['#7fd8ff', '#ffb3a8'], wlabs) +
        '<div class="g-leg"><span><i style="background:#7fd8ff"></i>Net revenue</span><span><i style="background:#ffb3a8"></i>Ad spend</span></div></section>' : '') +
      (last.length && daily.length > 3 ? '<section class="g g-ch"><h2>Latest days</h2><div class="g-sub">Contribution · revenue − COGS − spend</div>' +
        barsSvg([last.map((row) => row.cm)], ['#ffb3a8'], lastLabs, true) +
        '<div class="g-leg">' + last.map((row) => '<span>' + esc(money(row.cm)) + '</span>').join('') + '</div></section>' : '') +
      '<section class="g g-card g-ch"><h2>Top sellers · ' + esc(gap.span || 'MTD') + '</h2><div class="g-sub">' + sellerNote + '</div>' +
      (sellers.length ? sellers.map((sku) => '<div class="g-row"><span class="g-pr ini">' + esc(String(sku.name || sku.sku || '?').slice(0, 1)) + '</span><span class="g-x"><b>' + esc(sku.name || sku.sku) + '</b><i>' + esc(sku.sku) + ' · ' + esc(String(sku.units)) + ' sold · cost ' + esc(w.MW4Ledger && w.MW4Ledger.format ? w.MW4Ledger.format.unit(sku.cost) : String(sku.cost == null ? '—' : sku.cost)) + '</i></span><b>' + esc(money(sku.rev)) + '</b></div>').join('') : '<p class="g-quiet">No SKU rows in this window.</p>') +
      '</section></div>'
    );
  }

  function platformOf(ch) {
    const p = String((ch && (ch.platform || ch.label)) || '').toLowerCase();
    if (p.indexOf('tiktok') >= 0 || (ch && String(ch.key).indexOf('tt') === 0)) return 'TikTok';
    if (p.indexOf('instagram') >= 0 || (ch && ch.key === 'ig')) return 'Instagram';
    if (p.indexOf('pinterest') >= 0 || (ch && ch.key === 'pin')) return 'Pinterest';
    return (ch && (ch.platform || ch.key)) || 'Channel';
  }
  const PLATFORM_COLOR = { TikTok: '#ff6fa8', Instagram: '#ffcf6b', Pinterest: '#7fd8ff' };

  function seriesByDay(D, key) {
    const s = D.series && D.series[key];
    const map = new Map();
    if (s && Array.isArray(s.points)) s.points.forEach((p) => { if (p && p[0]) map.set(p[0], Number(p[1]) || 0); });
    return map;
  }

  function addDays(iso, n) {
    const d = new Date(iso + 'T12:00:00Z');
    if (isNaN(d.getTime())) return '';
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }

  function paintSocial(D, opts) {
    const base = opts.base || '';
    const head = nav({ base: base, home: opts.home || (base + '../'), title: 'Social', who: 'Jae', profile: true });
    if (!D || !Array.isArray(D.channels)) {
      return shell(head + '<div class="g-hero"><small>Social</small><h1>Posts</h1><p>' + esc(opts.error || 'The metrics feed is not on this page yet.') + '</p></div>');
    }
    const today = D.asOfDay || '';
    const start7 = today ? addDays(today, -6) : '';
    const start14 = today ? addDays(today, -13) : '';
    const prevStart = today ? addDays(today, -13) : '';
    const prevEnd = today ? addDays(today, -7) : '';
    const groups = [];
    D.channels.forEach((ch) => {
      const name = platformOf(ch);
      let g = groups.find((row) => row.name === name);
      if (!g) {
        g = { name: name, color: PLATFORM_COLOR[name] || '#fff', keys: [], posts: 0 };
        groups.push(g);
      }
      g.keys.push(ch.key);
    });
    const posts = Array.isArray(D.posts) ? D.posts : [];
    function inRange(day, from, to) {
      if (!day || !from || !to) return false;
      return day >= from && day <= to;
    }
    function sumMap(map, from, to) {
      let n = 0;
      let any = false;
      map.forEach((v, day) => {
        if (!from || inRange(day, from, to)) { n += v; any = true; }
      });
      return any ? n : null;
    }
    const tiles = groups.map((g) => {
      const maps = g.keys.map((key) => seriesByDay(D, key));
      const days = new Map();
      maps.forEach((map) => map.forEach((v, day) => days.set(day, (days.get(day) || 0) + v)));
      const week = sumMap(days, start7, today);
      const prior = sumMap(days, prevStart, prevEnd);
      const postViews = posts.filter((r) => g.keys.indexOf(r[0]) >= 0 && r[4] != null && (!start7 || r[1] >= start7))
        .reduce((s, r) => s + (Number(r[4]) || 0), 0);
      const shown = week != null ? week : postViews;
      const fromSeries = week != null;
      let delta = '';
      if (fromSeries && prior) {
        const pct = Math.round(((week - prior) / prior) * 100);
        delta = '<span class="' + (pct >= 0 ? 'g-up' : 'g-dn') + '">' + (pct >= 0 ? '+' : '') + pct + '% vs prior week</span>';
      }
      g.posts = posts.filter((r) => g.keys.indexOf(r[0]) >= 0).length;
      const sparkDays = [...days.keys()].filter((day) => !start14 || day >= start14).sort();
      const sparkVals = sparkDays.map((day) => days.get(day));
      g.days = days;
      return '<div class="g g-tile"><div class="who"><span>' + esc(g.name) + '</span>' + avatar(base, 'Jae', '') + '</div><b>' +
        esc(compact(shown)) + '</b>' + (delta || '<span>' + (fromSeries && start7 ? 'views this week' : fromSeries ? 'account series' : 'post views') + '</span>') +
        (sparkVals.length ? sparkSvg(sparkVals, g.color) : '') + '</div>';
    }).join('');

    const weekViews = groups.reduce((s, g) => s + (sumMap(g.days, start7, today) || 0), 0);
    const weekPosts = posts.filter((r) => !start7 || r[1] >= start7).length;
    const hasSeries = groups.some((g) => g.days && g.days.size);
    const engRows = posts.filter((r) => r[4] > 0 && (!start7 || r[1] >= start7));
    const engViews = engRows.reduce((s, r) => s + (Number(r[4]) || 0), 0);
    const engActs = engRows.reduce((s, r) => s + (Number(r[5]) || 0) + (Number(r[6]) || 0) + (Number(r[7]) || 0) + (Number(r[8]) || 0), 0);
    const eng = engViews > 0 ? engActs / engViews : null;
    const byDay = new Map();
    engRows.forEach((r) => {
      const cur = byDay.get(r[1]) || { views: 0, acts: 0 };
      cur.views += Number(r[4]) || 0;
      cur.acts += (Number(r[5]) || 0) + (Number(r[6]) || 0) + (Number(r[7]) || 0) + (Number(r[8]) || 0);
      byDay.set(r[1], cur);
    });
    const engDays = [...byDay.keys()].sort();
    const engRates = engDays.map((day) => {
      const row = byDay.get(day);
      return row.views ? (row.acts / row.views) * 100 : 0;
    });

    const allDays = [];
    groups.forEach((g) => g.days.forEach((_, day) => { if (allDays.indexOf(day) < 0) allDays.push(day); }));
    allDays.sort();
    const chartDays = allDays.filter((day) => !start14 || day >= start14);
    const lineSeries = groups.filter((g) => chartDays.some((day) => g.days.has(day))).map((g) => ({
      color: g.color,
      values: chartDays.map((day) => (g.days.has(day) ? g.days.get(day) : null)),
    }));
    const stacked = lineSeries.length
      ? linesSvg(lineSeries, [
        { i: 0, text: chartDays[0].slice(5), anchor: 'start' },
        { i: chartDays.length - 1, text: chartDays[chartDays.length - 1].slice(5), anchor: 'end' },
      ])
      : '';

    const top = posts.filter((r) => r[4] != null).slice().sort((a, b) => (b[4] || 0) - (a[4] || 0)).slice(0, 4);
    const chByKey = {};
    D.channels.forEach((ch) => { chByKey[ch.key] = ch; });

    return shell(head +
      '<div class="g-hero"><small>' + esc(D.asOfDay ? 'Live metrics · as of ' + D.asOfDay : 'Metrics feed') + '</small>' +
      '<h1>' + esc(hasSeries && start7 ? compact(weekViews) + ' views' : compact(posts.reduce((s, r) => s + (Number(r[4]) || 0), 0)) + ' views') + '</h1>' +
      '<p>' + (start7 && hasSeries ? 'This week across ' + groups.length + ' channels' : 'Published post views') + ' · ' + weekPosts + ' posts' +
      (eng != null ? ' · ' + (eng * 100).toFixed(1) + '% engagement' : '') + '</p></div>' +
      '<div class="g-chan">' + tiles + '</div>' +
      '<div class="g-grid two">' +
      (stacked ? '<section class="g g-ch"><h2>Views by channel · 14 days</h2><div class="g-sub">Account series by platform</div>' + stacked +
        '<div class="g-leg">' + groups.map((g) => '<span><i style="background:' + g.color + '"></i>' + esc(g.name) + '</span>').join('') + '</div></section>' : '') +
      (eng != null ? '<section class="g g-ch"><h2>Engagement rate · 7 days</h2><div class="g-sub">Likes + comments + shares + saves ÷ views</div><div class="g-big">' + (eng * 100).toFixed(1) + '%</div>' +
        (engRates.length ? barsSvg([engRates], ['#ff9ad5'], engDays.length > 2 ? [{ i: 0, text: engDays[0].slice(5) }, { i: engDays.length - 1, text: engDays[engDays.length - 1].slice(5) }] : engDays.map((day, i) => ({ i: i, text: day.slice(5) }))) : '') +
        '</section>' : '') +
      '<section class="g g-card g-ch"><h2>Top posts</h2><div class="g-sub">By views</div>' +
      (top.length ? top.map((r) => {
        const ch = chByKey[r[0]] || {};
        const views = Number(r[4]) || 0;
        const acts = (Number(r[5]) || 0) + (Number(r[6]) || 0) + (Number(r[7]) || 0) + (Number(r[8]) || 0);
        const rate = views ? ((acts / views) * 100).toFixed(1) + '%' : '';
        const href = /^https:\/\/(www\.)?(tiktok\.com|instagram\.com|pinterest\.com|pin\.it)\//.test(r[10] || '') ? r[10] : '';
        const name = platformOf(ch);
        const body = avatar(base, 'Jae', 'g-av') + '<span class="g-x"><b>' + esc(r[3] || 'Post') + '</b><i>' + esc(name) + ' · ' + esc(compact(views)) + ' views</i></span>' +
          (rate ? '<b>' + esc(rate) + '</b>' : '');
        return href
          ? '<a class="g-row" href="' + esc(href) + '" target="_blank" rel="noopener">' + body + '</a>'
          : '<div class="g-row">' + body + '</div>';
      }).join('') : '<p class="g-quiet">No post view counts in this feed.</p>') +
      '</section></div>'
    );
  }

  const MIX_COLORS = ['#7fd8ff', '#ffcf6b', '#ff9ad5', '#7dffb0', '#c9b6ff', '#ffb3a8'];

  function ageHours(label) {
    if (!label) return null;
    const days = /(\d+)\s*d/i.exec(label);
    const hours = /(\d+)\s*h/i.exec(label);
    const mins = /(\d+)\s*m/i.exec(label);
    if (!days && !hours && !mins) return null;
    return (days ? Number(days[1]) * 24 : 0) + (hours ? Number(hours[1]) : 0) + (mins ? Number(mins[1]) / 60 : 0);
  }

  function donut(mix) {
    const parts = mix.filter((m) => m && Number(m.pct) > 0);
    const total = parts.reduce((s, m) => s + Number(m.pct), 0) || 1;
    let offset = 0;
    const rings = parts.map((m, i) => {
      const pct = (Number(m.pct) / total) * 100;
      const dash = pct.toFixed(2) + ' ' + (100 - pct).toFixed(2);
      const node = '<circle cx="60" cy="60" r="44" fill="none" stroke="' + MIX_COLORS[i % MIX_COLORS.length] + '" stroke-width="16" pathLength="100" stroke-dasharray="' + dash + '" stroke-dashoffset="' + (-offset).toFixed(2) + '" transform="rotate(-90 60 60)" stroke-linecap="butt"/>';
      offset += pct;
      return node;
    }).join('');
    const legend = parts.map((m, i) => '<div><i style="display:inline-block;width:10px;height:10px;border-radius:3px;background:' + MIX_COLORS[i % MIX_COLORS.length] + ';margin-right:8px"></i>' + esc(m.key) + ' · ' + esc(String(m.pct)) + '%</div>').join('');
    return '<div class="g-mix"><svg viewBox="0 0 120 120" role="img">' + rings + '</svg><div>' + legend + '</div></div>';
  }

  function paintCare(d, opts) {
    const base = opts.base || '';
    const head = nav({ base: base, home: opts.home || (base + '../'), title: 'Care', who: 'Laswell', profile: true });
    const live = w.MW4Care && w.MW4Care.liveModel ? w.MW4Care.liveModel(d) : !!(d && d.source === 'live' && d.lane === 'care' && d.mailbox === 'care@kinsora.co');
    if (!live) {
      return shell(head + '<div class="g-hero"><small>care@kinsora.co · Laswell</small><h1>Inbox</h1><p>The care feed is not live on this page yet. Counts stay off until it is.</p></div>');
    }
    const k = d.kpis || {};
    const spark = d.spark24h || {};
    const bars = Array.isArray(spark.bars) ? spark.bars.filter((b) => b && (b.dir === 'in' || b.dir === 'out') && Number.isFinite(Number(b.h))) : [];
    const mix = Array.isArray(d.mix) ? d.mix.filter((m) => m && m.key) : [];
    const queue = Array.isArray(d.queue) ? d.queue : [];
    const asOf = w.MW4Care && w.MW4Care.asOfLabel ? w.MW4Care.asOfLabel(d) : (d.asOf || '');
    const open = k.open == null ? '—' : String(k.open);
    const onUs = k.waitingOnUs == null ? '—' : String(k.waitingOnUs);
    const oldest = k.oldestLabel || '—';
    const ages = queue.map((item) => ageHours(item.ageLabel)).filter((n) => n != null);
    const maxAge = ages.length ? Math.max.apply(null, ages) : 0;
    const inVals = bars.filter((b) => b.dir === 'in').map((b) => Number(b.h));
    const outVals = bars.filter((b) => b.dir === 'out').map((b) => Number(b.h));
    const paired = [];
    const n = Math.max(inVals.length, outVals.length);
    for (let i = 0; i < n; i++) paired.push([inVals[i] || 0, outVals[i] || 0]);
    const chart = paired.length ? barsSvg([paired.map((p) => p[0]), paired.map((p) => p[1])], ['#7fd8ff', '#7dffb0'], []) : '';

    return shell(head +
      '<div class="g-hero"><small>care@kinsora.co · Laswell' + (asOf ? ' · as of ' + esc(asOf) : '') + '</small>' +
      '<h1>' + esc(open) + ' open</h1><p>' + esc(onUs) + ' waiting on us · oldest ' + esc(oldest) + '</p></div>' +
      '<div class="g g-kpi three"><div><b>' + esc(open) + '</b><span>Open</span></div><div><b>' + esc(onUs) + '</b><span>On us</span></div><div><b class="g-dn">' + esc(oldest) + '</b><span>Oldest</span></div></div>' +
      '<div class="g-grid two">' +
      (chart ? '<section class="g g-ch"><h2>In / out · 24h</h2><div class="g-sub">Inbound ' + esc(spark.in == null ? '—' : String(spark.in)) + ' · replied ' + esc(spark.out == null ? '—' : String(spark.out)) + '</div>' + chart +
        '<div class="g-leg"><span><i style="background:#7fd8ff"></i>Inbound</span><span><i style="background:#7dffb0"></i>Replied</span></div></section>' :
        '<section class="g g-ch"><h2>In / out · 24h</h2><div class="g-sub">No hourly bars in this feed.</div><div class="g-big">' + esc(spark.in == null ? '—' : String(spark.in)) + '</div><p class="g-quiet">Inbound' + (spark.out == null ? '' : ' · ' + esc(String(spark.out)) + ' replied') + '</p></section>') +
      (mix.length ? '<section class="g g-ch"><h2>Topic mix</h2><div class="g-sub">Share of the live queue</div>' + donut(mix) + '</section>' : '') +
      '<section class="g g-card g-ch"><h2>Queue by age</h2><div class="g-sub">Time since the last customer message</div>' +
      (queue.length ? queue.map((item) => {
        const hours = ageHours(item.ageLabel);
        const width = maxAge && hours != null ? Math.max(6, Math.round((hours / maxAge) * 100)) : 0;
        return '<div class="g-row"><span class="g-x"><b>' + esc(item.title || item.id) + '</b><i>care@' + (item.detail ? ' · ' + esc(item.detail) : '') + '</i>' +
          (width ? '<div class="g-bar"><i class="' + (item.hot ? 'hot' : '') + '" style="width:' + width + '%"></i></div>' : '') +
          '</span><b>' + esc(item.ageLabel || '—') + '</b></div>';
      }).join('') : '<p class="g-quiet">The queue is empty.</p>') +
      '</section></div>'
    );
  }

  const ORBAT = {
    chain: [
      { id: 'hunter', name: 'Hunter', role: 'Owner · approves', plain: true },
      { id: 'kal', name: 'Kal', role: 'Intake · reads everything' },
      { id: 'price', name: 'Price', role: 'Sole dispatcher' },
    ],
    gateLead: { id: 'cho', name: 'Cho', role: 'Creative gate' },
    gate: [
      { id: 'west', name: 'West', role: 'Retention · email/SMS' },
      { id: 'jae', name: 'Jae', role: 'Organic social' },
      { id: 'park', name: 'Park', role: 'SEO' },
      { id: 'gaz', name: 'Gaz', role: 'Ads creative' },
      { id: 'ju', name: 'Ju Kwon', role: 'Kinsora ops' },
    ],
    direct: [
      { id: 'ko', name: 'Ko', role: 'Build · Shopify + HUD' },
      { id: 'soap', name: 'Soap', role: 'Media buyer' },
      { id: 'laswell', name: 'Laswell', role: 'Care · care@' },
    ],
    outside: [
      { id: 'ghost', name: 'Ghost', role: 'Trading · own board' },
      { id: 'dunn', name: 'Dunn', role: 'Personal · Hunter only' },
    ],
  };

  function lanePill(name, pack) {
    if (!pack || !pack.ready) return '';
    const op = name;
    const mine = (pack.cards || []).filter((c) => c.lane === op);
    const doing = mine.filter((c) => c.list === 'doing');
    const finite = doing.filter((c) => !standing(c));
    const waiting = mine.filter((c) => c.list === 'waiting');
    let label = 'Standing by';
    let cls = 'g-st';
    if (waiting.length) { label = 'Waiting on you'; cls = 'g-st b'; }
    else if (finite.length || (op === 'Price' && doing.length)) { label = 'Active'; cls = 'g-st a'; }
    else if (doing.length) { label = 'Standing by'; cls = 'g-st'; }
    return '<span class="' + cls + '">' + label + '</span>';
  }

  function node(base, person, pack, hero) {
    const href = person.plain ? (base + 'settings/') : (base + 'files/#' + person.id);
    const face = person.plain
      ? '<span class="ini">HB</span>'
      : avatar(base, person.name, '');
    return '<a class="g g-node' + (hero ? ' hn' : '') + '" href="' + esc(href) + '">' + face +
      '<b>' + esc(person.name) + '</b><i>' + esc(person.role) + '</i>' +
      (person.plain ? '' : lanePill(person.name, pack)) + '</a>';
  }

  function paintOrbat(pack, opts) {
    const base = opts.base || '';
    const head = nav({ base: base, home: opts.home || (base + '../'), title: 'Team', who: 'Price', profile: true });
    const data = pack || { ready: false, cards: [] };
    const block = (people) => '<div class="g-lanes">' + people.map((p) => node(base, p, data, false)).join('') + '</div>';
    return shell(head +
      '<div class="g-hero"><small>Who works for whom</small><h1>Team</h1><p>Kal → Price → lane. Price is the only one who assigns work.</p></div>' +
      '<div class="g-org"><div class="g-solo">' + node(base, ORBAT.chain[0], data, true) + '</div>' +
      '<div class="g-line"></div><div class="g-solo">' + node(base, ORBAT.chain[1], data, false) + '</div>' +
      '<div class="g-line"></div><div class="g-solo">' + node(base, ORBAT.chain[2], data, false) + '</div></div>' +
      '<div class="g-sec">Through Cho’s creative check, then Hunter approves</div>' +
      '<div class="g-solo" style="margin:0 auto 10px">' + node(base, ORBAT.gateLead, data, false) + '</div>' +
      block(ORBAT.gate) +
      '<div class="g-sec">Direct lanes (no Cho gate)</div>' + block(ORBAT.direct) +
      '<div class="g-sec">Outside Price’s wire</div>' + block(ORBAT.outside)
    );
  }

  function paintSettings(opts) {
    const base = opts.base || '';
    const on = w.MW4Mode && w.MW4Mode.soundOn();
    const refresh = !w.MW4Mode || w.MW4Mode.refreshOn();
    const synced = w.MW4Mode ? w.MW4Mode.syncedAt() : '';
    return shell(nav({ base: base, home: opts.home || (base + '../'), title: 'Settings', profile: false }) +
      '<div class="g-hero center"><div class="g-hb">HB</div><h1 style="font-size:40px">Hunter Bailey</h1><p>Owner · Kinsora Command</p></div>' +
      '<section class="g g-card g-set"><div class="g-sub">Account</div>' +
      '<div class="g-row"><span class="g-ic2" style="background:rgba(93,255,154,.45)">🔓</span><span class="g-x"><b>Unlocked</b><i>This device · Vercel session</i></span></div>' +
      '<button type="button" class="g-row" data-lock><span class="g-ic2" style="background:rgba(255,160,140,.5)">🔒</span><span class="g-x"><b>Lock HUD</b><i>Reload to re-check the Vercel session</i></span><span class="g-chev">›</span></button></section>' +
      '<section class="g g-card g-set"><div class="g-sub">Appearance</div>' +
      '<div class="g-row"><span class="g-ic2" style="background:rgba(127,127,255,.6)">◐</span><span class="g-x"><b>Dashboard style</b><i>Remembered on this device</i></span><span data-hud-mode></span></div>' +
      '<div class="g-row"><span class="g-ic2" style="background:rgba(255,207,107,.55)" data-sound-face>' + (on ? '🔊' : '🔇') + '</span><span class="g-x"><b>Sound</b><i>Alert chimes</i></span>' +
      '<button type="button" class="g-sw' + (on ? '' : ' off') + '" data-sound-switch role="switch" aria-checked="' + (on ? 'true' : 'false') + '" aria-label="Sound"></button></div></section>' +
      '<section class="g g-card g-set"><div class="g-sub">Data</div>' +
      '<div class="g-row"><span class="g-ic2" style="background:rgba(127,216,255,.55)">↻</span><span class="g-x"><b>Auto-refresh</b><i>Checks every 20 seconds</i></span>' +
      '<button type="button" class="g-sw' + (refresh ? '' : ' off') + '" data-refresh-face role="switch" aria-checked="' + (refresh ? 'true' : 'false') + '" aria-label="Auto-refresh"></button></div>' +
      '<div class="g-row"><span class="g-ic2" style="background:rgba(127,216,255,.55)">✓</span><span class="g-x"><b>Last sync</b><i data-last-sync>' + esc(synced ? syncShort(synced) : 'Not synced yet') + '</i></span></div>' +
      '<a class="g-row" href="' + esc(base + 'orbat/') + '"><span class="g-ic2" style="background:rgba(255,154,213,.55)">→</span><span class="g-x"><b>How work flows</b><i>Kal → Price → lane</i></span><span class="g-chev">›</span></a></section>' +
      '<section class="g g-card g-set"><div class="g-sub">Boards</div>' +
      '<a class="g-row" data-board="cmd" href="' + esc(opts.home || '../') + '"><span class="g-ic2" style="background:rgba(255,255,255,.25)">▦</span><span class="g-x"><b>Command board</b><i>Trello · Kinsora Command</i></span><span class="g-chev">›</span></a>' +
      '<a class="g-row" data-board="kal" href="' + esc(opts.home || '../') + '"><span class="g-ic2" style="background:rgba(255,255,255,.25)">▦</span><span class="g-x"><b>Kal board</b><i>Trello · Kal Trading</i></span><span class="g-chev">›</span></a></section>'
    );
  }

  let boardsToken = 0;
  function fillSettings(opts) {
    const token = ++boardsToken;
    fetch('/api/feed?f=status&t=' + Date.now(), { cache: 'no-store', credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (token !== boardsToken || !d || d.ct) return;
        if (d.updatedAt && w.MW4Mode) w.MW4Mode.markSynced(d.updatedAt);
        const stamp = document.querySelector('[data-last-sync]');
        if (stamp && d.updatedAt) stamp.textContent = syncShort(d.updatedAt);
        const cmd = trello(d.command && d.command.boardUrl);
        const kal = trello(d.kal && d.kal.boardUrl);
        const cmdA = document.querySelector('[data-board="cmd"]');
        const kalA = document.querySelector('[data-board="kal"]');
        if (cmdA && cmd) { cmdA.href = cmd; cmdA.target = '_blank'; cmdA.rel = 'noopener'; }
        if (kalA && kal) { kalA.href = kal; kalA.target = '_blank'; kalA.rel = 'noopener'; }
      })
      .catch(() => { /* boards stay as in-app links until the feed answers */ });
  }

  w.addEventListener('hudmode', () => { if (last) paint(); });
  w.addEventListener('hudsound', () => {
    if (!last || last.page !== 'settings') return;
    paint();
  });

  w.MW4Glass = { show, paint, cardsOf, plainRole };
})(window);
