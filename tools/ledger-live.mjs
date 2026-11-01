// Map a normalized Shopify + ads + Mercury pull into the LEDGER raw contract
// (the shape MW4Ledger.derive expects, source:"live"). Slot lanes are not added
// into spend. Contribution is derived later: REV − COGS − spend.
//
// Cleartext pulls stay off-repo. tools/build-ledger.mjs encrypts the result.

const TZ = 'America/Los_Angeles';
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function cmPct(rev, cogs, spend) {
  if (!(rev > 0)) return 0;
  return Math.round(((rev - cogs - spend) / rev) * 1000) / 10;
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function parseDate(iso) {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return { y, m, d };
}

function fmtDate(y, m, d) {
  return y + '-' + pad(m) + '-' + pad(d);
}

function addDays(iso, n) {
  const { y, m, d } = parseDate(iso);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return fmtDate(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

function daysInMonth(iso) {
  const { y, m } = parseDate(iso);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function monthStart(iso) {
  const { y, m } = parseDate(iso);
  return fmtDate(y, m, 1);
}

function prevMonthStart(iso) {
  const { y, m } = parseDate(iso);
  const dt = new Date(Date.UTC(y, m - 2, 1));
  return fmtDate(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

function monthName(iso) {
  return MONTHS[parseDate(iso).m - 1];
}

function shortDay(iso) {
  const { m, d } = parseDate(iso);
  return MONTHS[m - 1] + ' ' + d;
}

function rangeLabel(from, to) {
  if (from === to) return shortDay(from);
  return shortDay(from) + '–' + shortDay(to);
}

function ptDate(iso) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(iso));
}

function ptTime(iso) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).format(new Date(iso));
}

function inRange(date, from, to) {
  return date >= from && date <= to;
}

function salesMap(rows) {
  const map = {};
  for (const row of rows || []) {
    map[String(row.date).slice(0, 10)] = {
      orders: num(row.orders),
      gross: num(row.gross),
      discounts: num(row.discounts),
      returns: num(row.returns),
      net: num(row.net)
    };
  }
  return map;
}

function sumSales(map, from, to) {
  const out = { orders: 0, gross: 0, discounts: 0, returns: 0, net: 0 };
  for (const [date, row] of Object.entries(map)) {
    if (!inRange(date, from, to)) continue;
    out.orders += row.orders;
    out.gross += row.gross;
    out.discounts += row.discounts;
    out.returns += row.returns;
    out.net += row.net;
  }
  out.orders = Math.round(out.orders);
  out.gross = round2(out.gross);
  out.discounts = round2(out.discounts);
  out.returns = round2(out.returns);
  out.net = round2(out.net);
  return out;
}

function sumLane(byDay, from, to) {
  let spend = 0;
  let attr = 0;
  for (const row of byDay || []) {
    const date = String(row.date).slice(0, 10);
    if (!inRange(date, from, to)) continue;
    spend += num(row.spend);
    attr += num(row.attrRev);
  }
  return { spend: round2(spend), attrRev: round2(attr) };
}

function cogsOf(rows, costs) {
  let cogs = 0;
  let gapCount = 0;
  let gapRev = 0;
  for (const row of rows || []) {
    if (!row || !row.sku) continue;
    const spec = costs && costs[row.sku];
    const missing = !spec || spec.cost == null || spec.cost === '';
    if (missing) {
      gapCount += 1;
      gapRev += num(row.net);
    } else {
      cogs += num(row.units) * num(spec.cost);
    }
  }
  return { cogs: round2(cogs), gapCount, gapRev: round2(gapRev) };
}

function eachDate(from, to, fn) {
  for (let date = from; date <= to; date = addDays(date, 1)) fn(date);
}

function dayParts(date, sales, spendByDate, cogsByDate) {
  const sale = sales[date] || { orders: 0, gross: 0, discounts: 0, returns: 0, net: 0 };
  const ads = spendByDate[date] || { spend: 0, attrRev: 0 };
  const cogs = round2(num(cogsByDate && cogsByDate[date]));
  return { ...sale, spend: ads.spend, cogs };
}

export function buildLedger(input) {
  const asOf = input && input.asOf;
  const today = ptDate(asOf);
  const day = parseDate(today).d;
  const days = daysInMonth(today);
  const start = monthStart(today);
  const priorStart = prevMonthStart(today);
  const priorEnd = addDays(priorStart, day - 1);
  const ranges = {
    today: [today, today],
    d7: [addDays(today, -6), today],
    mtd: [start, today],
    priorToday: [addDays(today, -1), addDays(today, -1)],
    priorD7: [addDays(today, -13), addDays(today, -7)],
    priorMtd: [priorStart, priorEnd]
  };
  const sales = salesMap(input.salesByDay);
  const lanesIn = (input && input.lanes) || [];
  const spendByDate = {};
  const lanes = lanesIn.map((lane) => {
    if (!lane || lane.status === 'slot') {
      return { id: lane.id, name: lane.name, note: lane.note || 'not connected', status: 'slot' };
    }
    for (const row of lane.byDay || []) {
      const date = String(row.date).slice(0, 10);
      const slot = spendByDate[date] || (spendByDate[date] = { spend: 0, attrRev: 0 });
      slot.spend = round2(slot.spend + num(row.spend));
      slot.attrRev = round2(slot.attrRev + num(row.attrRev));
    }
    const mtd = sumLane(lane.byDay, ranges.mtd[0], ranges.mtd[1]);
    return {
      id: lane.id,
      name: lane.name,
      note: lane.note || '',
      status: 'live',
      spend: mtd.spend,
      attrRev: mtd.attrRev
    };
  });
  const costs = (input && input.costs) || {};
  const skuByWindow = (input && input.skuByWindow) || {};
  const windowCogs = {
    today: cogsOf(skuByWindow.today, costs).cogs,
    d7: cogsOf(skuByWindow.d7, costs).cogs,
    mtd: cogsOf(skuByWindow.mtd, costs).cogs,
    priorToday: cogsOf(skuByWindow.priorToday, costs).cogs,
    priorD7: cogsOf(skuByWindow.priorD7, costs).cogs,
    priorMtd: cogsOf(skuByWindow.priorMtd, costs).cogs
  };
  // Daily chart uses explicit per-day COGS when the pull has it. Window COGS
  // (the hero) comes from the SKU rows, which is the cost × net units total.
  const cogsByDate = (input && input.cogsByDay) || {};

  function windowRaw(id, label, rangeText, cogsKey, priorKey) {
    const [from, to] = ranges[id];
    const sale = sumSales(sales, from, to);
    let spend = 0;
    eachDate(from, to, (date) => { spend += (spendByDate[date] && spendByDate[date].spend) || 0; });
    spend = round2(spend);
    const cogs = windowCogs[cogsKey];
    const prior = windowCogs[priorKey] == null ? null : (() => {
      const [pFrom, pTo] = ranges[priorKey];
      const pSale = sumSales(sales, pFrom, pTo);
      let pSpend = 0;
      eachDate(pFrom, pTo, (date) => { pSpend += (spendByDate[date] && spendByDate[date].spend) || 0; });
      return cmPct(pSale.net, windowCogs[priorKey], round2(pSpend));
    })();
    const cm = cmPct(sale.net, cogs, spend);
    return {
      id,
      label,
      range: rangeText,
      rev: sale.net,
      cogs,
      spend,
      orders: sale.orders,
      priorCmDelta: prior == null ? 0 : round2((cm - prior) / 100)
    };
  }

  const windows = {
    today: windowRaw('today', 'TODAY', 'D-0', 'today', 'priorToday'),
    d7: windowRaw('d7', '7D', rangeLabel(ranges.d7[0], ranges.d7[1]), 'd7', 'priorD7'),
    mtd: windowRaw('mtd', 'MTD', 'D+' + day + ' / ' + days, 'mtd', 'priorMtd')
  };
  const mtdSale = sumSales(sales, ranges.mtd[0], ranges.mtd[1]);
  const mtdUnits = (skuByWindow.mtd || []).reduce((s, row) => s + (row && row.sku ? num(row.units) : 0), 0);
  const loadRows = mtdUnits > 0 ? (skuByWindow.mtd || []) : (skuByWindow.d7 || []);
  const span = mtdUnits > 0 ? 'MTD' : '7D';
  const loadGap = cogsOf(loadRows, costs);
  const catalog = (input && input.catalog) || {};
  const top = loadRows
    .filter((row) => row && row.sku)
    .slice()
    .sort((a, b) => num(b.net) - num(a.net) || num(b.units) - num(a.units))
    .slice(0, 4)
    .map((row) => {
      const spec = costs[row.sku] || {};
      return {
        sku: row.sku,
        name: row.name || spec.name || row.sku,
        units: num(row.units),
        price: spec.price == null ? 0 : num(spec.price),
        cost: spec.cost == null || spec.cost === '' ? null : num(spec.cost)
      };
    });

  const dailyCm = [];
  let thin = null;
  eachDate(start, today, (date) => {
    const part = dayParts(date, sales, spendByDate, cogsByDate);
    const cm = round2(part.net - part.cogs - part.spend);
    dailyCm.push(cm);
    if (!thin || cm < thin.cm) thin = { day: dailyCm.length, cm, rev: part.net, spend: part.spend };
  });
  const dailyNote = thin && thin.rev === 0 && thin.spend > 0
    ? { day: thin.day, text: 'spend, no orders' }
    : null;

  const merc = (input && input.mercury) || {};
  const burnFrom = addDays(today, -29);
  let netBurn = 0;
  const txns = (merc.txns || []).slice().sort((a, b) => String(b.postedAt).localeCompare(String(a.postedAt)));
  for (const txn of txns) {
    if (!txn || !txn.postedAt) continue;
    const date = ptDate(txn.postedAt);
    if (inRange(date, burnFrom, today)) netBurn += num(txn.amount);
  }
  const log = txns.slice(0, 6).map((txn) => {
    const amount = round2(num(txn.amount));
    return {
      time: ptTime(txn.postedAt),
      text: txn.label || 'Mercury',
      amount,
      kind: amount < 0 ? 'out' : amount > 0 ? 'in' : 'mark'
    };
  });

  return {
    source: 'live',
    asOf,
    month: { name: monthName(today), day, days, priorName: monthName(priorStart) },
    windows,
    lanes,
    soap: (input && input.soap) || {
      callsign: 'SOAP',
      des: '141-08',
      note: 'Owns paid · read-only · Google, TikTok, and Pinterest still open'
    },
    cogs: {
      skuCount: num(catalog.skuCount),
      gapCount: catalog.gapCount == null ? loadGap.gapCount : num(catalog.gapCount),
      gapRev: catalog.gapRev == null ? loadGap.gapRev : num(catalog.gapRev),
      span,
      top
    },
    refunds: round2(Math.abs(mtdSale.returns)),
    grossSales: round2(mtdSale.gross),
    discounts: round2(Math.abs(mtdSale.discounts)),
    mercury: {
      balance: round2(num(merc.balance)),
      ops: round2(num(merc.ops)),
      reserve: round2(num(merc.reserve)),
      netBurn30d: round2(netBurn)
    },
    dailyCm,
    dailyNote,
    log
  };
}
