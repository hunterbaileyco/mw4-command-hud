/* Care desk binding. SAMPLE markup in hub/index.html stays until a live care@ model arrives. */
(function () {
  'use strict';
  const MAILBOX = 'care@kinsora.co';
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const dash = (v) => (v == null || v === '' ? '\u2014' : String(v));

  function liveModel(d) {
    return !!(d && d.source === 'live' && d.lane === 'care' && d.mailbox === MAILBOX);
  }

  function asOfLabel(d) {
    const iso = String((d && d.asOf) || '').trim();
    if (/^\d{4}-\d{2}-\d{2}T/.test(iso)) {
      const t = new Date(iso);
      if (Number.isFinite(t.getTime())) {
        const formatted = new Intl.DateTimeFormat('en-US', {
          timeZone: 'America/Los_Angeles',
          month: 'short',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          hourCycle: 'h23',
        }).format(t);
        return formatted + ' PT';
      }
    }
    const gen = String((d && d.generatedAt) || '').trim();
    return gen || iso;
  }

  function fragments(d) {
    const k = (d && d.kpis) || {};
    const spark = (d && d.spark24h) || {};
    const bars = Array.isArray(spark.bars) ? spark.bars : [];
    const mix = Array.isArray(d && d.mix) ? d.mix : [];
    const queue = Array.isArray(d && d.queue) ? d.queue : [];
    const notes = Array.isArray(d && d.notes) ? d.notes.filter((n) => n != null && String(n).trim() !== '') : [];
    const asOf = asOfLabel(d);
    const cell = (v, label, cls) => `<div><b${cls ? ` class="${cls}"` : ''}>${esc(dash(v))}</b><span>${label}</span></div>`;
    const note = notes.length ? ' · ' + notes.map((n) => esc(n)).join(' · ') : '';
    return {
      bandMeta: `<span class="chip">\u25cf LIVE</span> ${esc(asOf)}`,
      chip: '\u25cf LIVE',
      asOf,
      kpis: [
        cell(k.open, 'Open', 'a'),
        cell(k.waitingOnUs, 'Waiting on us', 'h'),
        cell(k.oldestLabel, 'Oldest', 'h'),
        cell(k.medianFirstReplyLabel, 'Median 1st reply', ''),
      ].join(''),
      spark: bars.map((b) => {
        if (!b || (b.dir !== 'in' && b.dir !== 'out')) return '';
        const h = Number(b.h);
        if (!Number.isFinite(h)) return '';
        const px = Math.max(0, Math.min(24, h));
        return `<i${b.dir === 'out' ? ' class="o"' : ''} style="height:${px}px"></i>`;
      }).join(''),
      sparkl: `<span>care@ last 24h \u00b7 <b style="color:var(--olive2)">\u25a0</b> in ${esc(dash(spark.in))} \u00b7 <b style="color:var(--tan)">\u25a0</b> out ${esc(dash(spark.out))}</span><span>LIVE</span>`,
      mix: mix.map((m) => {
        const pct = !m || m.pct == null || m.pct === '' ? '\u2014' : esc(String(m.pct)) + '%';
        return `<div>${esc(m && m.key)}<b>${pct}</b></div>`;
      }).join(''),
      queue: queue.map((item) => {
        const hot = !!(item && item.hot === true);
        return `<div><span class="id">${esc(item && item.id)}</span><span class="sub">${esc(item && item.title)}<small>${esc(item && item.detail)}</small></span><span class="age${hot ? ' h' : ''}">\u23f1 ${esc(dash(item && item.ageLabel))}</span></div>`;
      }).join(''),
      footer: 'LIVE \u00b7 <b>care@kinsora.co</b> only. Owner: Laswell.' + note,
    };
  }

  window.MW4Care = { liveModel, fragments, asOfLabel, dash };
})();
