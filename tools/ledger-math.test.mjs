import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { SAMPLE, derive, format, THIN_ROAS } = require('../docs/c85352c42452f0db1e1c5e56f60e5128/ledger/model.js');

const model = derive(SAMPLE);
const mtd = model.mtd;
const today = model.windows.today;
const d7 = model.windows.d7;

test('contribution is rev − cogs − spend and ignores shipping', () => {
  assert.equal(mtd.contrib, 58960 - 12600 - 24500);
  assert.equal(mtd.contrib, 21860);
  assert.equal(today.contrib, 2184 - 462 - 918);
  assert.equal(today.contrib, 804);
  assert.equal(d7.contrib, 15400 - 3265 - 6135);
  assert.equal(d7.contrib, 6000);
  const dirtied = derive({
    ...SAMPLE,
    windows: {
      ...SAMPLE.windows,
      mtd: { ...SAMPLE.windows.mtd, shipping: 4000, fees: 900, apps: 200 }
    }
  });
  assert.equal(dirtied.mtd.contrib, mtd.contrib);
});

test('sample display figures match the approved mock', () => {
  assert.equal(format.moneyFull(mtd.contrib), '$21,860');
  assert.equal(format.moneyK(mtd.contrib), '$21.9k');
  assert.equal(mtd.cm.toFixed(1), '37.1');
  assert.equal(mtd.cogsPct.toFixed(1), '21.4');
  assert.equal(mtd.spendPct.toFixed(1), '41.5');
  assert.equal(mtd.cents.product, 21);
  assert.equal(mtd.cents.ads, 42);
  assert.equal(mtd.cents.kept, 37);
  assert.equal(format.moneyK(mtd.pace), '$24.2k');
  assert.equal(format.roas(mtd.roas), '2.41×');
  assert.equal(format.moneyK(today.rev), '$2.2k');
  assert.equal(format.moneyK(today.contrib), '$804');
  assert.equal(format.roas(today.roas), '2.38×');
  assert.equal(today.cm.toFixed(1), '36.8');
  assert.equal(format.moneyK(d7.contrib), '$6.0k');
  assert.equal(format.roas(d7.roas), '2.51×');
  assert.equal(d7.cm.toFixed(1), '39.0');
  assert.equal(format.moneyK(d7.cogs), '$3.3k');
  assert.equal(format.moneyK(d7.spend), '$6.1k');
  assert.equal(model.aov.toFixed(2), '63.26');
  assert.equal((model.refundPct * 100).toFixed(1), '2.4');
  assert.equal(format.asOf(SAMPLE.asOf), 'AS OF OCT 28 · 21:40 PT');
});

test('breakeven, lanes, and after-COGS use gross margin', () => {
  const gm = 1 - 12600 / 58960;
  assert.ok(Math.abs(model.gm - gm) < 1e-12);
  assert.equal((Math.round(model.gm * 1000) / 10).toFixed(1), '78.6');
  assert.equal(format.roas(model.be), '1.27×');
  const [meta, tiktok, google, pin] = model.lanes;
  assert.equal(format.roas(meta.roas), '2.27×');
  assert.equal(meta.tone, 'ok');
  assert.equal(Math.round(meta.after), Math.round(38900 * gm - 17140));
  assert.equal(format.roas(tiktok.roas), '1.80×');
  assert.equal(tiktok.tone, 'thin');
  assert.ok(tiktok.roas < THIN_ROAS);
  assert.equal(Math.round(tiktok.after), Math.round(8750 * gm - 4860));
  assert.equal(format.roas(google.roas), '3.10×');
  assert.equal(google.tone, 'ok');
  assert.equal(pin.status, 'slot');
  assert.equal(pin.roas, undefined);
  assert.ok(Math.abs(meta.beAt - (model.be / 4)) < 1e-9);
});

test('COGS gaps count as zero and top SKUs keep unit margin', () => {
  assert.equal(model.cogs.gapCount, 3);
  assert.equal(model.cogs.skuCount, 44);
  assert.equal(model.cogs.gapRev, 410);
  const [stack, heart, chain, bundle] = model.cogs.top;
  assert.equal((stack.gm * 100).toFixed(1), '81.6');
  assert.equal(format.moneyK(stack.rev), '$18.9k');
  assert.equal(format.moneyK(stack.gp), '$15.4k');
  assert.equal(format.unit(stack.price), '$89');
  assert.equal(format.unit(stack.cost), '$16.40');
  assert.equal((heart.gm * 100).toFixed(1), '81.5');
  assert.equal((chain.gm * 100).toFixed(1), '81.3');
  assert.equal((bundle.gm * 100).toFixed(1), '80.3');
  assert.equal(format.moneyK(bundle.rev), '$6.9k');
  const missing = derive({
    ...SAMPLE,
    cogs: { ...SAMPLE.cogs, top: [{ sku: 'X', name: 'Gap', units: 2, price: 40, cost: null }] }
  });
  assert.equal(missing.cogs.top[0].gap, true);
  assert.equal(missing.cogs.top[0].gp, 80);
});

test('runway is Mercury balance divided by absolute 30-day net burn', () => {
  assert.equal(model.mercury.balance, 184320);
  assert.equal(model.mercury.netBurn30d, -18600);
  assert.equal(model.runway.months.toFixed(1), '9.9');
  assert.equal(model.runway.label, '~9.9 MO');
  assert.equal(Math.round(model.runway.fuel * 100), 83);
  assert.equal(format.moneyK(model.mercury.balance), '$184.3k');
  assert.equal(format.moneyFull(model.mercury.netBurn30d), '−$18,600');
  const funded = derive({ ...SAMPLE, mercury: { ...SAMPLE.mercury, netBurn30d: 500 } });
  assert.equal(funded.runway.label, 'NO BURN');
  assert.equal(funded.runway.months, null);
});

test('daily rounds cover the sample month and flag the thin day', () => {
  assert.equal(model.daily.length, 28);
  assert.equal(model.daily[16].cm, 41);
  assert.equal(model.dailyNote.day, 17);
  assert.ok(model.dailyAvg > 700 && model.dailyAvg < 850);
});
