/* MW4 // LEDGER feed contract.
   A live GET /api/feed?f=ledger may later return this same shape with source:"live".
   Until Shopify revenue/orders/COGS, ad spend, and Mercury cash are wired, the page
   loads SAMPLE below (source:"sample") and labels every figure SAMPLE.

   Locked math (do not fold extra costs in here):
   - contribution = rev − cogs − spend
   - rev is Shopify net sales (discounts and refunds already netted; shipping and tax out)
   - cogs is Shopify cost-per-item × units; a SKU with no cost counts as $0 (see cogs.gapCount)
   - spend is Meta + TikTok + Google only
   - shipping, payment fees, Shopify apps, and 3PL are NOT subtracted
   - breakeven ROAS = 1 / gross margin, gross margin = 1 − cogs/rev
   - lane after-COGS $ = attributed rev × gross margin − spend
   - runway months = Mercury balance ÷ |last-30-day net burn| (no burn → not a month count)
   Platform-reported lane revenue over-counts. It is not added into REV. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.MW4Ledger = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const THIN_ROAS = 1.9;
  const SCALE_MAX = 4;
  const RUNWAY_FULL_MONTHS = 12;

  const SAMPLE = {
    source: 'sample',
    asOf: '2026-10-28T21:40:00-07:00',
    month: { name: 'OCT', day: 28, days: 31, priorName: 'SEP' },
    windows: {
      today: { id: 'today', label: 'TODAY', range: 'D-0', rev: 2184, cogs: 462, spend: 918, orders: 34, priorCmDelta: -0.08 },
      d7: { id: 'd7', label: '7D', range: 'OCT 22–28', rev: 15400, cogs: 3265, spend: 6135, orders: 241, priorCmDelta: 0.08 },
      mtd: { id: 'mtd', label: 'MTD', range: 'D+28 / 31', rev: 58960, cogs: 12600, spend: 24500, orders: 932, priorCmDelta: 0.06 }
    },
    lanes: [
      { id: 'meta', name: 'META', note: 'ASC + 2 prospecting', spend: 17140, attrRev: 38900, status: 'live' },
      { id: 'tiktok', name: 'TIKTOK', note: 'Spark ads · UGC v3', spend: 4860, attrRev: 8750, status: 'live' },
      { id: 'google', name: 'GOOGLE', note: 'Brand + PMax', spend: 2480, attrRev: 7690, status: 'live' },
      { id: 'pinterest', name: 'PINTEREST', note: 'placeholder lane', status: 'slot' }
    ],
    soap: {
      callsign: 'SOAP',
      des: '141-08',
      note: 'Owns paid · lanes are placeholders until Soap’s handoff · read-only'
    },
    cogs: {
      skuCount: 44,
      gapCount: 3,
      gapRev: 410,
      top: [
        { sku: 'KN-STK-01', name: 'The Everyday Stack', units: 212, price: 89, cost: 16.4 },
        { sku: 'KN-PND-04', name: 'Love Note Heart Pendant', units: 268, price: 48, cost: 8.9 },
        { sku: 'KN-CHN-02', name: 'Snake Chain 18"', units: 231, price: 38, cost: 7.1 },
        { sku: 'KN-BND-07', name: 'Cable + Love Note Bundle', units: 96, price: 72, cost: 14.2 }
      ]
    },
    refunds: 1400,
    grossSales: 58333,
    discounts: 3900,
    mercury: { balance: 184320, ops: 142110, reserve: 42210, netBurn30d: -18600 },
    dailyCm: [847, 471, 1053, 584, 986, 449, 655, 881, 977, 1142, 765, 655, 716, 1021, 1076, 590, 41, 725, 621, 1024, 644, 865, 649, 656, 575, 1099, 1064, 1029],
    dailyNote: { day: 17, text: 'meta test burn' },
    log: [
      { time: '21:12', text: 'Shopify payout batch landed — Mercury ops', amount: 6840, kind: 'in' },
      { time: '18:40', text: 'Meta daily spend settled', amount: -612, kind: 'out' },
      { time: '15:05', text: 'Best hour today: 14:00 · 7 orders', amount: 441, kind: 'mark' },
      { time: '11:30', text: 'Refund · order #4412 (Dunn)', amount: -62, kind: 'out' },
      { time: '09:00', text: 'TikTok daily spend settled', amount: -171, kind: 'out' }
    ]
  };

  function num(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  function round1(n) {
    return Math.round(n * 10) / 10;
  }

  function grouped(n) {
    return String(Math.round(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function moneyFull(n) {
    return (n < 0 ? '−' : '') + '$' + grouped(n);
  }

  function moneyK(n) {
    const neg = n < 0;
    const a = Math.abs(n);
    const body = a >= 1000
      ? '$' + (Math.round(a / 100) / 10).toFixed(1) + 'k'
      : '$' + grouped(a);
    return (neg ? '−' : '') + body;
  }

  function unitMoney(n) {
    if (n == null || !Number.isFinite(Number(n))) return '—';
    const neg = n < 0;
    const a = Math.abs(Number(n));
    const body = Math.abs(a - Math.round(a)) < 1e-9
      ? '$' + grouped(a)
      : '$' + a.toFixed(2);
    return (neg ? '−' : '') + body;
  }

  function pct1(part, whole) {
    if (!whole) return 0;
    return round1((part / whole) * 100);
  }

  function roasText(v) {
    if (v == null || !Number.isFinite(v)) return '—';
    return v.toFixed(2) + '×';
  }

  function windowView(w, month) {
    const rev = num(w.rev);
    const cogs = num(w.cogs);
    const spend = num(w.spend);
    const contrib = rev - cogs - spend;
    const gm = rev > 0 ? 1 - cogs / rev : 0;
    const cm = pct1(contrib, rev);
    const cogsPct = pct1(cogs, rev);
    const spendPct = round1(100 - cogsPct - cm);
    const orders = num(w.orders);
    const roas = spend > 0 ? rev / spend : null;
    const day = month && month.day ? month.day : 0;
    const days = month && month.days ? month.days : 0;
    const pace = w.id === 'mtd' && day > 0 ? (contrib / day) * days : null;
    return {
      id: w.id,
      label: w.label,
      range: w.range,
      rev: rev,
      cogs: cogs,
      spend: spend,
      orders: orders,
      contrib: contrib,
      gm: gm,
      cm: cm,
      cogsPct: cogsPct,
      spendPct: spendPct,
      keptPct: cm,
      roas: roas,
      priorCmDelta: num(w.priorCmDelta),
      pace: pace,
      cents: {
        product: Math.round(cogsPct),
        ads: Math.round(spendPct),
        kept: Math.round(cm)
      }
    };
  }

  function laneView(lane, gm) {
    if (!lane || lane.status === 'slot') {
      return {
        id: lane.id,
        name: lane.name,
        note: lane.note || 'placeholder lane',
        status: 'slot'
      };
    }
    const spend = num(lane.spend);
    const attrRev = num(lane.attrRev);
    const roas = spend > 0 ? attrRev / spend : null;
    const after = attrRev * gm - spend;
    let tone = 'ok';
    if (roas == null) tone = 'slot';
    else if (roas < THIN_ROAS) tone = 'thin';
    const fill = roas == null ? 0 : Math.max(0, Math.min(1, roas / SCALE_MAX));
    return {
      id: lane.id,
      name: lane.name,
      note: lane.note || '',
      status: 'live',
      spend: spend,
      attrRev: attrRev,
      roas: roas,
      after: after,
      tone: tone,
      fill: fill
    };
  }

  function skuView(row, rank) {
    const units = num(row.units);
    const price = num(row.price);
    const cost = row.cost == null || row.cost === '' ? null : num(row.cost);
    const unitCost = cost == null ? 0 : cost;
    const rev = units * price;
    const gp = units * (price - unitCost);
    const gm = price > 0 ? (price - unitCost) / price : 0;
    return {
      rank: rank,
      sku: row.sku,
      name: row.name,
      units: units,
      price: price,
      cost: cost,
      rev: rev,
      gp: gp,
      gm: gm,
      gap: cost == null
    };
  }

  function runwayView(mercury) {
    const balance = num(mercury && mercury.balance);
    const net = num(mercury && mercury.netBurn30d);
    if (net >= 0) {
      return { balance: balance, months: null, label: 'NO BURN', fuel: 1, net: net };
    }
    const months = balance / Math.abs(net);
    return {
      balance: balance,
      months: months,
      label: '~' + months.toFixed(1) + ' MO',
      fuel: Math.min(1, months / RUNWAY_FULL_MONTHS),
      net: net
    };
  }

  function derive(raw) {
    const src = raw && raw.source === 'live' ? 'live' : 'sample';
    const month = (raw && raw.month) || { name: '', day: 0, days: 0, priorName: '' };
    const windowsIn = (raw && raw.windows) || {};
    const order = ['today', 'd7', 'mtd'];
    const windows = {};
    order.forEach(function (id) {
      if (windowsIn[id]) windows[id] = windowView(Object.assign({ id: id }, windowsIn[id]), month);
    });
    const mtd = windows.mtd || windowView({ id: 'mtd', label: 'MTD', rev: 0, cogs: 0, spend: 0 }, month);
    const gm = mtd.gm;
    const be = gm > 0 ? 1 / gm : null;
    const lanes = ((raw && raw.lanes) || []).map(function (lane) { return laneView(lane, gm); });
    lanes.forEach(function (lane) {
      lane.be = be;
      lane.beAt = be == null ? 0 : Math.max(0, Math.min(1, be / SCALE_MAX));
    });
    const cogs = (raw && raw.cogs) || {};
    const top = (cogs.top || []).map(function (row, i) { return skuView(row, i + 1); });
    const runway = runwayView(raw && raw.mercury);
    const refunds = num(raw && raw.refunds);
    const gross = num(raw && raw.grossSales);
    const daily = (raw && raw.dailyCm) || [];
    const dailyMax = daily.reduce(function (m, v) { return Math.max(m, num(v)); }, 0);
    const dailyAvg = daily.length ? daily.reduce(function (s, v) { return s + num(v); }, 0) / daily.length : 0;
    return {
      source: src,
      asOf: raw && raw.asOf,
      month: month,
      windows: windows,
      order: order.filter(function (id) { return windows[id]; }),
      mtd: mtd,
      gm: gm,
      be: be,
      lanes: lanes,
      soap: (raw && raw.soap) || null,
      cogs: {
        skuCount: num(cogs.skuCount),
        gapCount: num(cogs.gapCount),
        gapRev: num(cogs.gapRev),
        top: top
      },
      aov: mtd.orders > 0 ? mtd.rev / mtd.orders : 0,
      refunds: refunds,
      refundPct: gross > 0 ? refunds / gross : 0,
      discounts: num(raw && raw.discounts),
      mercury: raw && raw.mercury ? {
        balance: num(raw.mercury.balance),
        ops: num(raw.mercury.ops),
        reserve: num(raw.mercury.reserve),
        netBurn30d: num(raw.mercury.netBurn30d)
      } : { balance: 0, ops: 0, reserve: 0, netBurn30d: 0 },
      runway: runway,
      daily: daily.map(function (v, i) {
        return { day: i + 1, cm: num(v), height: dailyMax > 0 ? num(v) / dailyMax : 0 };
      }),
      dailyAvg: dailyAvg,
      dailyNote: (raw && raw.dailyNote) || null,
      log: (raw && raw.log) || []
    };
  }

  function asOfLabel(iso) {
    if (!iso) return 'AS OF —';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return 'AS OF —';
    const date = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric' }).format(d);
    const time = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
    return 'AS OF ' + date.toUpperCase() + ' · ' + time + ' PT';
  }

  return {
    SAMPLE: SAMPLE,
    THIN_ROAS: THIN_ROAS,
    SCALE_MAX: SCALE_MAX,
    derive: derive,
    format: {
      moneyFull: moneyFull,
      moneyK: moneyK,
      unit: unitMoney,
      int: grouped,
      roas: roasText,
      asOf: asOfLabel
    }
  };
});
