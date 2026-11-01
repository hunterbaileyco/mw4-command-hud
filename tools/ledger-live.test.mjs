import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { buildLedger } from './ledger-live.mjs';

const require = createRequire(import.meta.url);
const { derive } = require('../docs/c85352c42452f0db1e1c5e56f60e5128/ledger/model.js');

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

const pull = {
  asOf: '2026-11-01T18:00:00Z',
  salesByDay: [
    { date: '2026-10-31', orders: 1, gross: 40, discounts: -10, returns: 0, net: 30 },
    { date: '2026-11-01', orders: 2, gross: 80, discounts: -20, returns: -5, net: 55 }
  ],
  lanes: [
    {
      id: 'meta', name: 'META', status: 'live', note: 'Redemption',
      byDay: [
        { date: '2026-10-31', spend: 10, attrRev: 40 },
        { date: '2026-11-01', spend: 20, attrRev: 10 }
      ]
    },
    { id: 'tiktok', name: 'TIKTOK', status: 'slot', note: 'not connected' },
    { id: 'google', name: 'GOOGLE', status: 'slot', note: 'not connected' },
    { id: 'pinterest', name: 'PINTEREST', status: 'slot', note: 'not connected' }
  ],
  costs: {
    'A-1': { price: 40, cost: 4, name: 'Chain' }
  },
  skuByWindow: {
    today: [{ sku: 'A-1', name: 'Chain', units: 2, net: 55 }],
    mtd: [{ sku: 'A-1', name: 'Chain', units: 2, net: 55 }],
    d7: [{ sku: 'A-1', name: 'Chain', units: 3, net: 85 }],
    priorToday: [{ sku: 'A-1', name: 'Chain', units: 1, net: 30 }],
    priorD7: [{ sku: 'A-1', name: 'Chain', units: 1, net: 30 }],
    priorMtd: []
  },
  cogsByDay: { '2026-11-01': 8, '2026-10-31': 4 },
  catalog: { skuCount: 20, gapCount: 0, gapRev: 0 },
  mercury: {
    balance: 86.86, ops: 86.86, reserve: 0,
    txns: [
      { postedAt: '2026-11-01T16:00:00Z', amount: 12.5, label: 'Shopify payout' },
      { postedAt: '2026-10-30T14:47:50Z', amount: -3000, label: 'Transfer to external checking' }
    ]
  }
};

test('live pull contribution is rev − cogs − connected spend', () => {
  const raw = buildLedger(pull);
  const model = derive(raw);
  assert.equal(raw.source, 'live');
  assert.equal(model.source, 'live');
  assert.equal(model.windows.today.rev, 55);
  assert.equal(model.windows.today.cogs, 8);
  assert.equal(model.windows.today.spend, 20);
  assert.equal(model.windows.today.contrib, 55 - 8 - 20);
  assert.equal(model.windows.mtd.contrib, model.windows.today.contrib);
  assert.equal(model.windows.d7.rev, 85);
  assert.equal(model.windows.d7.cogs, 12);
  assert.equal(model.windows.d7.spend, 30);
  assert.equal(model.windows.d7.contrib, 85 - 12 - 30);
  const [meta, tiktok, google, pin] = model.lanes;
  assert.equal(meta.status, 'live');
  assert.equal(meta.spend, 20);
  assert.equal(meta.attrRev, 10);
  assert.equal(tiktok.status, 'slot');
  assert.equal(google.status, 'slot');
  assert.equal(pin.status, 'slot');
  assert.equal(model.cogs.top[0].sku, 'A-1');
  assert.equal(model.cogs.gapCount, 0);
  assert.equal(model.mercury.balance, 86.86);
  assert.equal(model.mercury.netBurn30d, 12.5 - 3000);
  assert.equal(model.refunds, 5);
  assert.equal(model.discounts, 20);
  assert.equal(model.daily.length, 1);
  assert.equal(model.daily[0].cm, 55 - 8 - 20);
});

test('a missing unit cost counts as zero and is flagged on the loadout', () => {
  const raw = buildLedger({
    ...pull,
    catalog: { skuCount: 2, gapCount: 1 },
    costs: { 'A-1': { price: 40, cost: null, name: 'Chain' } },
    skuByWindow: {
      ...pull.skuByWindow,
      mtd: [{ sku: 'A-1', name: 'Chain', units: 2, net: 55 }]
    }
  });
  const model = derive(raw);
  assert.equal(model.windows.mtd.cogs, 0);
  assert.equal(model.cogs.gapCount, 1);
  assert.equal(model.cogs.top[0].gap, true);
  assert.equal(model.cogs.top[0].cost, null);
});

test('the strip painter follows the period chip instead of windows.today', () => {
  const src = fs.readFileSync(path.join(root, 'docs/c85352c42452f0db1e1c5e56f60e5128/ledger/ledger.js'), 'utf8');
  const paintStatic = src.slice(src.indexOf('function paintStatic'), src.indexOf('async function loadRaw'));
  const paintWindow = src.slice(src.indexOf('function paintWindow'), src.indexOf('function placePlates'));
  assert.equal(paintStatic.includes('windows.today'), false);
  assert.match(paintWindow, /paintStrip\(/);
  assert.match(src, /stripMetrics\(model, state\.win\)/);
});
