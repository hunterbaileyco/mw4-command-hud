/* Renders MW4 // LEDGER from MW4Ledger.derive.
   Live path: GET /api/feed?f=ledger with source:"live" (same contract as model.js).
   Until that feed exists, SAMPLE is the page. */
(function () {
  'use strict';

  const L = window.MW4Ledger;
  const F = L.format;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const state = { win: 'mtd', model: null };

  function ringSvg(view, month) {
    const R = 112;
    const C = 2 * Math.PI * R;
    const parts = [
      { pct: view.cogsPct, color: '#9c8256', w: 9 },
      { pct: view.spendPct, color: '#B4472F', w: 9 },
      { pct: view.keptPct, color: '#E8A317', w: 12, glow: true }
    ];
    let acc = 0;
    const arcs = parts.map((p) => {
      const len = (p.pct / 100) * C;
      const node = '<circle cx="125" cy="125" r="112" fill="none" stroke="' + p.color + '" stroke-width="' + p.w
        + '" stroke-dasharray="' + len.toFixed(1) + ' ' + C.toFixed(1) + '" stroke-dashoffset="' + (-acc).toFixed(1)
        + '" transform="rotate(-90 125 125)"' + (p.glow ? ' filter="url(#lgGl)"' : '') + '/>';
      acc += len;
      return node;
    }).join('');
    let ticks = '';
    for (let deg = 0; deg < 360; deg += 10) {
      const y1 = deg % 30 === 0 ? 4 : 7;
      ticks += '<line x1="125" y1="' + y1 + '" x2="125" y2="12" stroke="#C5A572" stroke-opacity=".5" transform="rotate(' + deg + ' 125 125)"/>';
    }
    const R2 = 92;
    const C2 = 2 * Math.PI * R2;
    const monthPct = month.days ? month.day / month.days : 0;
    const mlen = monthPct * C2;
    return '<svg viewBox="0 0 250 250" aria-hidden="true"><defs><filter id="lgGl" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>'
      + '<circle cx="125" cy="125" r="112" fill="none" stroke="#1d241b" stroke-width="12"/>' + arcs + ticks
      + '<circle cx="125" cy="125" r="92" fill="none" stroke="#2A3328" stroke-width="3"/>'
      + '<circle cx="125" cy="125" r="92" fill="none" stroke="#9bb05a" stroke-width="3" stroke-dasharray="' + mlen.toFixed(1) + ' ' + C2.toFixed(1) + '" transform="rotate(-90 125 125)"/>'
      + '<line x1="125" y1="58" x2="125" y2="76" stroke="#C5A572" stroke-opacity=".45"/><line x1="125" y1="174" x2="125" y2="192" stroke="#C5A572" stroke-opacity=".45"/>'
      + '<line x1="58" y1="125" x2="76" y2="125" stroke="#C5A572" stroke-opacity=".45"/><line x1="174" y1="125" x2="192" y2="125" stroke="#C5A572" stroke-opacity=".45"/></svg>';
  }

  function deltaCore(delta) {
    const pts = Math.round(Math.abs(delta) * 100);
    const up = delta >= 0;
    return { up: up, pts: pts, sign: up ? '+' : '−', arrow: up ? '▲' : '▼' };
  }

  function paceHtml(view, month) {
    const d = deltaCore(view.priorCmDelta);
    const prior = '<b class="' + (d.up ? 'up' : 'dn') + '">' + d.sign + d.pts + '%</b>';
    if (view.pace == null) return 'vs prior ' + prior;
    const name = esc((month.name || '').toLowerCase());
    const prev = esc((month.priorName || 'prior').toLowerCase());
    return 'pace <b>' + esc(F.moneyK(view.pace)) + '</b> by ' + name + ' ' + esc(month.days)
      + '<br>vs ' + prev + ' ' + prior;
  }

  function cell(cls, label, value, sub) {
    return '<div class="t ' + cls + '"><div class="l">' + label + '</div><div class="v">' + esc(value) + '</div><div class="s">' + esc(sub) + '</div></div>';
  }

  function paintWindow() {
    const model = state.model;
    const view = model.windows[state.win] || model.mtd;
    const month = model.month;
    document.querySelectorAll('#win button').forEach((btn) => {
      const on = btn.dataset.win === view.id;
      btn.classList.toggle('on', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    document.querySelectorAll('#plates .wp').forEach((el) => el.classList.toggle('on', el.dataset.win === view.id));
    const plates = $('plates');
    const eq = $('eqcol');
    if (plates && eq && plates.parentElement === eq) $('heroShell').appendChild(plates);
    $('heroWin').textContent = view.label;
    $('tgt').innerHTML = ringSvg(view, month)
      + '<div class="core"><div class="k1">CONTRIBUTION · ' + esc(view.label) + '</div>'
      + '<div class="big">' + esc(F.moneyFull(view.contrib)) + '</div>'
      + '<div class="cmp">' + esc(view.cm.toFixed(1)) + '%<em>CM%</em></div>'
      + '<div class="pace">' + paceHtml(view, month) + '</div></div>';
    $('moFrac').textContent = month.day + '/' + month.days;
    const beltLabel = (cls, name, pct) => {
      const show = pct >= 12;
      return '<i class="' + cls + '" style="width:' + pct + '%">' + (show ? '<b>' + name + '</b>' : '') + '</i>';
    };
    $('eqcol').innerHTML = '<div class="eq">'
      + cell('rv', 'REV', F.moneyK(view.rev), F.int(view.orders) + ' ord')
      + '<div class="op">−</div>'
      + cell('cg', 'COGS', F.moneyK(view.cogs), view.cogsPct.toFixed(1) + '%')
      + '<div class="op">−</div>'
      + cell('sp', 'SPEND', F.moneyK(view.spend), view.spendPct.toFixed(1) + '%')
      + '<div class="op">=</div>'
      + cell('cm', 'CONTRIB', F.moneyK(view.contrib), view.cm.toFixed(1) + '%')
      + '</div><div class="belt">'
      + beltLabel('b-cg', 'COGS', view.cogsPct)
      + beltLabel('b-sp', 'AD SPEND', view.spendPct)
      + beltLabel('b-cm', 'KEPT', view.keptPct)
      + '</div><div class="beltk"><span>every $1 of revenue →</span><span>'
      + esc(view.cents.product) + '¢ product · ' + esc(view.cents.ads) + '¢ ads · <b>'
      + esc(view.cents.kept) + '¢ kept</b></span></div>';
    placePlates();
    const thin = model.lanes.filter((lane) => lane.tone === 'thin')
      .map((lane) => esc(lane.name) + ' ' + esc(F.roas(lane.roas))).join(' · ');
    $('aar').innerHTML = '<span><b>CM</b> ' + esc(F.moneyK(view.contrib)) + ' ' + esc(view.label) + ' · ' + esc(view.cm.toFixed(1)) + '%</span>'
      + (view.pace != null ? '<span><b>PACE</b> ' + esc(F.moneyK(view.pace)) + '</span>' : '')
      + (thin ? '<span class="h">THIN · ' + thin + '</span>' : '');
  }

  function placePlates() {
    const desk = window.matchMedia('(min-width: 980px)').matches;
    const plates = $('plates');
    const eq = $('eqcol');
    const shell = $('heroShell');
    if (!plates || !eq || !shell) return;
    if (desk) eq.appendChild(plates);
    else shell.appendChild(plates);
  }

  function paintStatic(model) {
    const today = model.windows.today;
    const fmtPct = (n) => (n * 100).toFixed(1) + '%';
    document.body.classList.toggle('sample', model.source !== 'live');
    $('asof').textContent = F.asOf(model.asOf);
    $('counters').innerHTML = ''
      + '<div class="act"><span class="l">CM</span><span class="sub">contrib · today</span><span class="n">' + esc(F.moneyK(today.contrib)) + '</span></div>'
      + '<div class="q rev"><span class="l">REV</span><span class="sub">' + esc(today.orders) + ' orders</span><span class="n">' + esc(F.moneyK(today.rev)) + '</span></div>'
      + '<div class="hld"><span class="l">SPEND</span><span class="sub">ROAS ' + esc(F.roas(today.roas)) + '</span><span class="n">' + esc(F.moneyK(today.spend)) + '</span></div>'
      + '<div class="shp"><span class="l">CASH</span><span class="sub">mercury</span><span class="n">' + esc(F.moneyK(model.mercury.balance)) + '</span></div>';
    $('win').innerHTML = model.order.map((id) => {
      const w = model.windows[id];
      return '<button type="button" role="tab" data-win="' + esc(id) + '" aria-selected="false">' + esc(w.label) + '<small>' + esc(w.range) + '</small></button>';
    }).join('');
    $('plates').innerHTML = model.order.map((id) => {
      const w = model.windows[id];
      const d = deltaCore(w.priorCmDelta);
      return '<div class="wp" data-win="' + esc(id) + '"><div class="h">' + esc(w.label) + '<em>' + esc(w.range) + '</em></div>'
        + '<div class="c">' + esc(F.moneyK(w.contrib)) + '</div><div class="cl">CONTRIB · ' + esc(w.cm.toFixed(1)) + '%</div>'
        + '<dl><dt>REV</dt><dd>' + esc(F.moneyK(w.rev)) + '</dd><dt>COGS</dt><dd class="t">−' + esc(F.moneyK(w.cogs).replace(/^−/, '')) + '</dd>'
        + '<dt>SPEND</dt><dd class="r">−' + esc(F.moneyK(w.spend).replace(/^−/, '')) + '</dd>'
        + '<dt>ORD</dt><dd>' + esc(F.int(w.orders)) + '</dd><dt>ROAS</dt><dd>' + esc(F.roas(w.roas)) + '</dd></dl>'
        + '<div class="tr ' + (d.up ? 'up' : 'dn') + '">' + d.arrow + ' ' + d.pts + '% <span>CM vs prior</span></div></div>';
    }).join('');
    const gmPct = (Math.round(model.gm * 1000) / 10).toFixed(1);
    $('beRule').innerHTML = '<b>BE ' + esc(F.roas(model.be)) + '</b><span>Breakeven ROAS after COGS (' + esc(gmPct)
      + '% gross margin). Blended ' + esc(F.roas(model.mtd.roas)) + ' clears it; a lane under ~' + L.THIN_ROAS.toFixed(1) + '× is THIN.</span>';
    $('paidTot').textContent = 'MTD · ' + F.moneyK(model.mtd.spend);
    if (model.soap) {
      $('soapTx').innerHTML = '<b>' + esc(model.soap.callsign) + ' · ' + esc(model.soap.des) + '</b>' + esc(model.soap.note);
    }
    $('lanes').innerHTML = model.lanes.map((lane) => {
      if (lane.status === 'slot') {
        return '<div class="lane slot"><div class="r1"><span class="pk">' + esc(lane.name) + '<span class="nt">' + esc(lane.note) + '</span></span><span class="ro">—</span></div>'
          + '<div class="r2">Not wired — slot held for Soap</div></div>';
      }
      const after = Math.round(lane.after);
      return '<div class="lane ' + esc(lane.tone) + '"><div class="r1"><span class="pk">' + esc(lane.name) + '<span class="nt">' + esc(lane.note) + '</span></span>'
        + '<span class="ro">' + esc(F.roas(lane.roas)) + '<small>ROAS</small></span></div>'
        + '<div class="r2"><span>SPEND<b>' + esc(F.moneyFull(lane.spend)) + '</b></span><span>ATTR REV<b>' + esc(F.moneyFull(lane.attrRev)) + '</b></span>'
        + '<span>AFTER COGS<b class="pos">' + (after >= 0 ? '+' : '−') + esc(F.moneyFull(Math.abs(after))) + '</b></span></div>'
        + '<div class="scale"><i class="fill" style="width:' + (lane.fill * 100).toFixed(1) + '%"></i>'
        + '<i class="be" style="left:' + (lane.beAt * 100).toFixed(1) + '%"></i></div></div>';
    }).join('');
    const gap = model.cogs;
    $('gap').innerHTML = '<span class="bd">COGS GAP</span><span>' + esc(gap.gapCount) + ' of ' + esc(gap.skuCount)
      + ' SKUs have no unit cost in Shopify → counted at $0 (≈' + esc(F.moneyK(gap.gapRev))
      + ' MTD rev). Contribution reads slightly high until filled.</span>';
    $('loadout').innerHTML = gap.top.map((sku) => {
      const gm = (sku.gm * 100).toFixed(1) + '%';
      return '<div class="sk"><span class="rk">#' + sku.rank + '</span><div class="nm">' + esc(sku.name) + '</div>'
        + '<div class="id">' + esc(sku.sku) + ' · ' + esc(F.int(sku.units)) + ' UNITS</div>'
        + '<div class="gm"><b>' + gm + '</b><span>UNIT GM</span></div>'
        + '<div class="ln"><em>rev</em>' + esc(F.moneyK(sku.rev)) + '<em>gp</em>' + esc(F.moneyK(sku.gp)) + '</div>'
        + '<div class="ln"><em>price</em>' + esc(F.unit(sku.price)) + '<em>cost</em>' + esc(F.unit(sku.cost)) + '</div></div>';
    }).join('');
    $('side3').innerHTML = '<div><div class="l">AOV</div><div class="v">$' + model.aov.toFixed(2) + '</div><div class="s">MTD</div></div>'
      + '<div><div class="l">REFUNDS</div><div class="v" style="color:var(--holdink)">' + esc(F.moneyK(model.refunds)) + '</div><div class="s">' + fmtPct(model.refundPct) + ' of gross</div></div>'
      + '<div><div class="l">DISCOUNTS</div><div class="v" style="color:var(--tan)">' + esc(F.moneyK(model.discounts)) + '</div><div class="s">already netted</div></div>';
    const run = model.runway;
    $('bal').textContent = F.moneyFull(model.mercury.balance);
    $('runway').textContent = run.label;
    $('fuel').style.width = Math.round(run.fuel * 100) + '%';
    $('accs').innerHTML = '<span>OPS<b>' + esc(F.moneyFull(model.mercury.ops)) + '</b></span>'
      + '<span>RESERVE<b>' + esc(F.moneyFull(model.mercury.reserve)) + '</b></span>'
      + '<span>30D NET<b class="' + (model.mercury.netBurn30d < 0 ? 'neg' : '') + '">'
      + esc(F.moneyFull(model.mercury.netBurn30d)) + '</b></span>';
    const maxH = model.daily.reduce((m, d) => Math.max(m, d.height), 0);
    const avgBottom = maxH > 0 ? (model.dailyAvg / (model.daily.reduce((m, d) => Math.max(m, d.cm), 0) || 1)) * 100 : 0;
    $('bars').innerHTML = model.daily.map((d) => {
      const hot = model.dailyNote && model.dailyNote.day === d.day;
      return '<i style="height:' + Math.max(2, d.height * 100).toFixed(1) + '%" title="' + esc(F.moneyFull(d.cm)) + (hot ? ' · ' + esc(model.dailyNote.text) : '') + '"></i>';
    }).join('') + '<div class="avg" style="bottom:' + avgBottom.toFixed(1) + '%"><span>AVG ' + esc(F.moneyK(model.dailyAvg)) + '</span></div>';
    const note = model.dailyNote;
    $('dayNote').textContent = note ? 'D' + note.day + ' · ' + note.text : '';
    const lastDay = model.month.day || model.daily.length;
    $('dayEnd').textContent = 'D1–D' + lastDay;
    $('daySpan').textContent = 'D' + lastDay;
    $('tresFlag').textContent = model.source === 'live' ? 'LIVE' : 'SAMPLE';
    const chip = $('smp');
    if (chip) chip.textContent = model.source === 'live' ? 'LIVE' : 'SAMPLE';
    $('logCount').textContent = String(model.log.length);
    $('log').innerHTML = model.log.map((row) => {
      const kind = row.kind === 'out' ? 'out' : row.kind === 'mark' ? 'mark' : 'in';
      const n = Math.round(Number(row.amount) || 0);
      const sign = n > 0 ? '+' : n < 0 ? '−' : '';
      return '<li><span class="tm">' + esc(row.time) + '</span><span>' + esc(row.text) + '</span><span class="am ' + kind + '">'
        + sign + esc(F.moneyFull(Math.abs(n))) + '</span></li>';
    }).join('');
    const live = model.source === 'live';
    $('foot').innerHTML = 'feeds (' + (live ? 'live' : 'sample') + '): <b>shopify</b> orders + cost/item · <b>meta/tiktok/google</b> spend · <b>mercury</b> balances<br>'
      + (live ? 'auto-refresh · polls 60s · link up' : 'sample path · live shopify / ads / mercury not wired · <a href="#" id="fsync">sync</a>');
    const sync = $('fsync');
    if (sync) sync.addEventListener('click', (e) => { e.preventDefault(); boot(); });
  }

  async function loadRaw() {
    let r;
    try {
      r = await fetch('/api/feed?f=ledger&t=' + Date.now(), { cache: 'no-store', credentials: 'same-origin', redirect: 'manual' });
    } catch (_) {
      return null;
    }
    if (!r || r.type === 'opaqueredirect' || !r.ok) return null;
    try {
      const data = await r.json();
      if (data && data.source === 'live' && data.windows && data.mercury) return data;
    } catch (_) { /* sample path */ }
    return null;
  }

  async function boot() {
    const live = await loadRaw();
    state.model = L.derive(live || L.SAMPLE);
    if (!state.model.windows[state.win]) state.win = 'mtd';
    paintStatic(state.model);
    paintWindow();
  }

  function clock() {
    const el = $('clk');
    if (!el) return;
    el.textContent = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
    }).format(new Date()) + ' PT';
  }

  $('win').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-win]');
    if (!btn || !state.model || !state.model.windows[btn.dataset.win]) return;
    state.win = btn.dataset.win;
    paintWindow();
  });
  $('dsync').addEventListener('click', (e) => { e.preventDefault(); boot(); });
  window.addEventListener('resize', placePlates);
  clock();
  setInterval(clock, 1000);
  boot();
  setInterval(boot, 60000);
})();
