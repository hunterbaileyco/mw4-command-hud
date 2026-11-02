/* DAILY VIEWS account filter. Channel tiles stay on MW4Icons gold marks and are
   not driven by this module. Chip marks are authentic platform colours. */
(function (root) {
  const ACC = [
    { key: 'tt_kco', pfx: 'TT', platform: 'TikTok', chip: '@kinsora.co', sub: 'KCO · VERIFIED LINE', color: '#E8A317', conn: 'tiktok_organic', wid: '_000I8zvdHN8R2g63MzOYK3RITf9ypoDGFR_', source: 'Windsor tiktok_organic' },
    { key: 'tt_wk', pfx: 'TT', platform: 'TikTok', chip: '@wearkinsora', sub: 'WK · CAL OFTEN 0', color: '#9bb05a', conn: 'tiktok_organic', wid: '_000Egp7KTZI8rRRhbocZ-Bj1odrxcs_gjIT', source: 'Windsor tiktok_organic' },
    { key: 'ig', pfx: 'IG', platform: 'Instagram', chip: '@wearkinsora', sub: 'IG · WINDSOR VIEWS', color: '#C5A572', conn: 'instagram', wid: '17841478074449578', source: 'Windsor instagram' },
    { key: 'pin', pfx: 'PIN', platform: 'Pinterest', chip: 'wearkinsora', sub: 'PIN · IMPRESSIONS', color: '#7BA3C9', conn: 'pinterest_organic', wid: 'wearkinsora', source: 'Postiz pinterest' },
  ];
  const LS_KEY = 'mw4.social.accounts';
  const FLAT_UNDER = 20;
  const CAL_NOTES = {
    TT: 'TT: daily account video views from Windsor tiktok_organic (last 60 days only).',
    IG: 'IG: daily account views from Windsor Instagram user insights.',
    PIN: 'PIN: daily impressions, not views (live feed = Postiz, last 90 days).',
  };

  function brandMark(a, px) {
    const p = (a.platform || '').toLowerCase();
    let svg = '';
    let lab = '';
    if (p.includes('tiktok')) {
      lab = 'TikTok';
      const n = 'M13.6 4.2v8.9a2.9 2.9 0 1 1-2.5-2.9v-2.6a5.5 5.5 0 1 0 5.1 5.5V9a5.6 5.6 0 0 0 3.2 1V7.4a3.3 3.3 0 0 1-3.2-3.2z';
      svg = `<rect width="24" height="24" rx="5.5" fill="#121212"/><path d="${n}" transform="translate(-0.9 -0.7)" fill="#25F4EE"/><path d="${n}" transform="translate(0.9 0.7)" fill="#FE2C55"/><path d="${n}" fill="#FFFFFF"/>`;
    } else if (p.includes('instagram')) {
      lab = 'Instagram';
      const g = 'igG' + px;
      svg = `<defs><linearGradient id="${g}" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#f09433"/><stop offset=".25" stop-color="#e6683c"/><stop offset=".5" stop-color="#dc2743"/><stop offset=".75" stop-color="#cc2366"/><stop offset="1" stop-color="#bc1888"/></linearGradient></defs><rect width="24" height="24" rx="6" fill="url(#${g})"/><rect x="5" y="5" width="14" height="14" rx="4.2" fill="none" stroke="#fff" stroke-width="1.9"/><circle cx="12" cy="12" r="3.4" fill="none" stroke="#fff" stroke-width="1.9"/><circle cx="16.4" cy="7.6" r="1.1" fill="#fff"/>`;
    } else if (p.includes('pinterest')) {
      lab = 'Pinterest';
      svg = `<circle cx="12" cy="12" r="12" fill="#E60023"/><path d="M12.3 4.6c-4.2 0-6.4 2.9-6.4 5.4 0 1.5.6 2.8 1.8 3.3.2.1.4 0 .4-.2l.2-.7c.1-.2 0-.3-.1-.5-.4-.4-.6-1-.6-1.8 0-2.3 1.7-4.4 4.5-4.4 2.5 0 3.8 1.5 3.8 3.5 0 2.6-1.2 4.9-2.9 4.9-.9 0-1.6-.8-1.4-1.7.3-1.1.8-2.4.8-3.2 0-.7-.4-1.4-1.2-1.4-1 0-1.7 1-1.7 2.3 0 .8.3 1.4.3 1.4l-1.1 4.8c-.3 1.4 0 3.2 0 3.4 0 .1.1.1.2.1.1-.1 1.2-1.5 1.6-2.9l.6-2.4c.3.6 1.2 1.1 2.2 1.1 2.9 0 4.8-2.6 4.8-6.1 0-2.7-2.3-5.2-5.8-5.2z" fill="#fff"/>`;
    } else {
      return '';
    }
    return `<span class="brand-mark" style="width:${px}px;height:${px}px"><svg viewBox="0 0 24 24" width="${px}" height="${px}" role="img" aria-label="${lab}">${svg}</svg></span>`;
  }

  function keysFrom(raw) {
    const want = new Set(String(raw || '').split(',').map((s) => s.trim()).filter(Boolean));
    return ACC.filter((a) => want.has(a.key)).map((a) => a.key);
  }

  // search wins over stored. Empty or unknown input falls back to tt_kco.
  // persist is true only when a query override should be written through.
  function initialKeys(search, stored) {
    const fromSearch = search != null && String(search) !== '';
    const raw = fromSearch ? search : (stored == null ? '' : stored);
    const keys = keysFrom(raw);
    return { keys: keys.length ? keys : ['tt_kco'], persist: fromSearch };
  }

  function toggle(keys, key) {
    if (!ACC.some((a) => a.key === key)) return keys.slice();
    const set = new Set(keys);
    if (set.has(key)) {
      if (set.size <= 1) return keys.slice();
      set.delete(key);
    } else {
      set.add(key);
    }
    return ACC.filter((a) => set.has(a.key)).map((a) => a.key);
  }

  function daysBefore(iso, n) {
    return new Date(new Date(iso + 'T12:00:00Z').getTime() - n * 86400000).toISOString().slice(0, 10);
  }

  function rangeCut(posts, keys, range, today) {
    if (range !== 'all') {
      const n = Number(range);
      if (!today || !Number.isFinite(n)) return '0000-01-01';
      return daysBefore(today, n - 1);
    }
    let first = '';
    const want = new Set(keys);
    for (const row of posts || []) {
      if (!want.has(row[0]) || !row[1]) continue;
      if (!first || row[1] < first) first = row[1];
    }
    return first || '0000-01-01';
  }

  function actOf(keys) {
    const want = new Set(keys);
    return ACC.filter((a) => want.has(a.key));
  }

  function pack(account, values, flat) {
    return {
      account,
      values,
      total: values.reduce((sum, v) => sum + v, 0),
      flat: !!flat,
    };
  }

  function calendarSeries(series, act, cut) {
    const dates = [...new Set(act.flatMap((a) => ((series && series[a.key] && series[a.key].points) || []).map((p) => p[0])))]
      .filter((d) => d >= cut)
      .sort();
    const rows = act.map((a) => {
      const map = new Map((series && series[a.key] && series[a.key].points) || []);
      const values = dates.map((d) => map.get(d) ?? 0);
      const flat = values.length > 0 && Math.max(...values) < FLAT_UNDER;
      return pack(a, values, flat);
    });
    return { dates, series: rows };
  }

  function postedSeries(posts, act, cut) {
    const maps = act.map((a) => {
      const map = new Map();
      for (const row of posts || []) {
        if (row[0] !== a.key || row[4] == null || row[1] < cut) continue;
        map.set(row[1], (map.get(row[1]) || 0) + row[4]);
      }
      return map;
    });
    const dates = [...new Set(maps.flatMap((map) => [...map.keys()]))].sort();
    return {
      dates,
      series: act.map((a, i) => pack(a, dates.map((d) => maps[i].get(d) ?? 0), false)),
    };
  }

  function calendarChrome(act) {
    const pins = act.some((a) => a.key === 'pin');
    const others = act.some((a) => a.key !== 'pin');
    const title = pins && others ? 'Daily views + impr.' : pins ? 'Daily impressions' : 'Daily views';
    const pf = [...new Set(act.map((a) => a.pfx))];
    let source;
    if (pf.length === 1 && pf[0] === 'TT') source = 'Windsor tiktok_organic';
    else if (pf.length === 1 && pf[0] === 'IG') source = 'Windsor instagram';
    else if (pf.length === 1) source = 'Postiz pinterest';
    else source = (pins ? 'Windsor + Postiz' : 'Windsor') + ' · ' + pf.join('+');
    return { title, source };
  }

  function postedChrome() {
    return { title: 'Views by day posted', source: 'per-post lifetime' };
  }

  function postedNotes(act) {
    const notes = [];
    if (act.some((a) => a.pfx === 'TT')) notes.push('TT: each column adds up the current lifetime views of the posts that went up that day (PT).');
    if (act.some((a) => a.pfx === 'IG')) notes.push('IG: each column adds up the current lifetime views of the posts that went up that day (PT).');
    if (act.some((a) => a.pfx === 'PIN')) notes.push('PIN: each column adds up the impressions each pin got over the last 90 days, grouped by the day it was pinned (PT).');
    return notes;
  }

  function viewModel({ posts, series, keys, range, today, mode }) {
    const safeMode = mode === 'posted' ? 'posted' : 'calendar';
    const act = actOf(keys);
    const cut = rangeCut(posts, act.map((a) => a.key), range, today);
    const built = safeMode === 'posted' ? postedSeries(posts, act, cut) : calendarSeries(series, act, cut);
    const chrome = safeMode === 'posted' ? postedChrome() : calendarChrome(act);
    const warnings = [];
    if (safeMode === 'calendar') {
      if (act.some((a) => a.key === 'pin') && act.length > 1) {
        warnings.push('⚠ Mixed metrics: PIN line is impressions; the others are views. Same scale.');
      }
      if (act.some((a) => a.key === 'tt_wk')) {
        warnings.push('⚠ Windsor calendar series often 0 for TT @wearkinsora — line sits flat until Windsor has data. Try BY DAY POSTED.');
      }
    }
    const notes = safeMode === 'posted'
      ? postedNotes(act)
      : [...new Set(act.map((a) => a.pfx))].map((pfx) => CAL_NOTES[pfx]);
    const on = new Set(act.map((a) => a.key));
    return {
      cut,
      dates: built.dates,
      series: built.series,
      title: chrome.title,
      source: chrome.source,
      plotting: act.map((a) => a.pfx + ' ' + a.chip).join(' + '),
      count: act.length,
      total: ACC.length,
      notes,
      warnings,
      overlay: ACC.filter((a) => !on.has(a.key)).map((a) => a.pfx + ' · ' + a.chip).join(', '),
    };
  }

  root.MW4Accounts = {
    ACC,
    LS_KEY,
    FLAT_UNDER,
    brandMark,
    initialKeys,
    toggle,
    viewModel,
  };
})(typeof window !== 'undefined' ? window : globalThis);
