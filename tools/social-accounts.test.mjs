import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const token = 'c85352c42452f0db1e1c5e56f60e5128';

function loadAccounts() {
  const code = fs.readFileSync(path.join(root, 'docs', token, 'social/accounts.js'), 'utf8');
  const prev = global.window;
  global.window = {};
  try {
    vm.runInThisContext(code, { filename: 'accounts.js' });
    return global.window.MW4Accounts;
  } finally {
    if (prev === undefined) delete global.window;
    else global.window = prev;
  }
}

const Acc = loadAccounts();

const posts = [
  ['ig', '2026-05-21', 'Thu 5/21/26 9:00 AM', 'first ig', 10, 0, 0, 0, 0, 'W', ''],
  ['tt_kco', '2026-06-08', 'Mon 6/8/26 9:00 AM', 'first tt', 40, 1, 0, 0, 0, 'W', ''],
  ['tt_wk', '2026-07-01', 'Wed 7/1/26 9:00 AM', 'wk post', 3, 0, 0, 0, 0, 'W', ''],
  ['pin', '2026-08-04', 'Tue 8/4/26 9:00 AM', 'pin', 80, 0, 0, 0, 0, 'P', ''],
  ['tt_kco', '2026-10-30', 'Fri 10/30/26 6:30 PM', 'late', 15, 0, 0, 0, 0, 'W', ''],
  ['ig', '2026-10-30', 'Fri 10/30/26 8:00 PM', 'ig late', 9, 0, 0, 0, 0, 'W', ''],
];
const series = {
  tt_kco: { source: 'Windsor tiktok_organic', metric: 'views', points: [['2026-09-01', 100], ['2026-09-02', 40], ['2026-10-30', 12]] },
  tt_wk: { source: 'Windsor tiktok_organic', metric: 'views', points: [['2026-09-01', 0], ['2026-09-02', 0], ['2026-10-30', 0]] },
  ig: { source: 'Windsor instagram', metric: 'views', points: [['2026-05-21', 20], ['2026-09-02', 50], ['2026-10-30', 8]] },
  pin: { source: 'Postiz pinterest', metric: 'impressions', points: [['2026-08-04', 30], ['2026-09-02', 70], ['2026-10-30', 11]] },
};

function vmOf(keys, mode = 'calendar', range = 'all') {
  return Acc.viewModel({ posts, series, keys, range, today: '2026-11-01', mode });
}

test('first visit is tt_kco alone and a query override is what gets stored', () => {
  assert.deepEqual(Acc.initialKeys(null, null), { keys: ['tt_kco'], persist: false });
  assert.deepEqual(Acc.initialKeys(null, 'ig,tt_wk'), { keys: ['tt_wk', 'ig'], persist: false });
  assert.deepEqual(Acc.initialKeys('pin,bogus', 'tt_kco'), { keys: ['pin'], persist: true });
  assert.deepEqual(Acc.initialKeys('nope', null), { keys: ['tt_kco'], persist: true });
  assert.deepEqual(Acc.initialKeys(null, ''), { keys: ['tt_kco'], persist: false });
});

test('at least one account stays on and the order follows the chip row', () => {
  assert.deepEqual(Acc.toggle(['tt_kco'], 'tt_kco'), ['tt_kco']);
  assert.deepEqual(Acc.toggle(['ig'], 'ig'), ['ig']);
  assert.deepEqual(Acc.toggle(['tt_kco'], 'pin'), ['tt_kco', 'pin']);
  assert.deepEqual(Acc.toggle(['tt_kco', 'ig', 'pin'], 'tt_kco'), ['ig', 'pin']);
  assert.deepEqual(Acc.toggle(['tt_wk', 'pin'], 'nope'), ['tt_wk', 'pin']);
});

test('calendar axis is the union of ON dates and a missing day is 0', () => {
  const one = vmOf(['tt_kco']);
  assert.deepEqual(one.dates, ['2026-09-01', '2026-09-02', '2026-10-30']);
  assert.deepEqual(one.series[0].values, [100, 40, 12]);
  assert.equal(one.series[0].total, 152);
  assert.equal(one.series[0].flat, false);
  assert.equal(one.title, 'Daily views');
  assert.equal(one.source, 'Windsor tiktok_organic');
  assert.equal(one.warnings.length, 0);
  assert.match(one.notes[0], /tiktok_organic/);
  assert.match(one.overlay, /@wearkinsora/);
  assert.match(one.overlay, /PIN/);

  const all = vmOf(['tt_kco', 'tt_wk', 'ig', 'pin']);
  assert.deepEqual(all.dates, ['2026-05-21', '2026-08-04', '2026-09-01', '2026-09-02', '2026-10-30']);
  const byKey = Object.fromEntries(all.series.map((s) => [s.account.key, s]));
  assert.deepEqual(byKey.tt_kco.values, [0, 0, 100, 40, 12]);
  assert.deepEqual(byKey.tt_wk.values, [0, 0, 0, 0, 0]);
  assert.equal(byKey.tt_wk.flat, true);
  assert.deepEqual(byKey.ig.values, [20, 0, 0, 50, 8]);
  assert.deepEqual(byKey.pin.values, [0, 30, 0, 70, 11]);
  assert.equal(all.title, 'Daily views + impr.');
  assert.equal(all.source, 'Windsor + Postiz · TT+IG+PIN');
  assert.equal(all.warnings.length, 2);
  assert.match(all.warnings[0], /Mixed metrics/);
  assert.match(all.warnings[1], /@wearkinsora/);
  assert.equal(all.overlay, '');
  assert.equal(all.plotting, 'TT @kinsora.co + TT @wearkinsora + IG @wearkinsora + PIN wearkinsora');
});

test('single-platform chrome matches the approved titles', () => {
  assert.equal(vmOf(['ig']).source, 'Windsor instagram');
  assert.equal(vmOf(['ig']).title, 'Daily views');
  assert.equal(vmOf(['pin']).title, 'Daily impressions');
  assert.equal(vmOf(['pin']).source, 'Postiz pinterest');
  assert.equal(vmOf(['pin']).warnings.length, 0);
  const bothTt = vmOf(['tt_kco', 'tt_wk']);
  assert.equal(bothTt.source, 'Windsor tiktok_organic');
  assert.equal(bothTt.warnings.length, 1);
  const ttIg = vmOf(['tt_kco', 'ig']);
  assert.equal(ttIg.source, 'Windsor · TT+IG');
  assert.equal(ttIg.warnings.length, 0);
});

test('a near-zero series is flat and a spike is not', () => {
  const flat = Acc.viewModel({
    posts, series: { tt_wk: { points: [['2026-09-01', 0], ['2026-09-02', 19]] } },
    keys: ['tt_wk'], range: 'all', today: '2026-11-01', mode: 'calendar',
  });
  assert.equal(flat.series[0].flat, true);
  const spiked = Acc.viewModel({
    posts, series: { tt_wk: { points: [['2026-09-01', 0], ['2026-09-02', 20]] } },
    keys: ['tt_wk'], range: 'all', today: '2026-11-01', mode: 'calendar',
  });
  assert.equal(spiked.series[0].flat, false);
});

test('since first post uses the earliest ON post and a short range clips the axis', () => {
  const igAndTt = vmOf(['tt_kco', 'ig']);
  assert.equal(igAndTt.cut, '2026-05-21');
  assert.equal(igAndTt.dates[0], '2026-05-21');
  const week = vmOf(['tt_kco', 'ig', 'pin'], 'calendar', '7');
  assert.equal(week.cut, '2026-10-26');
  assert.deepEqual(week.dates, ['2026-10-30']);
});

test('by day posted groups ON accounts and does not warn about mixed calendar metrics', () => {
  const posted = vmOf(['tt_kco', 'ig', 'pin'], 'posted');
  assert.equal(posted.title, 'Views by day posted');
  assert.equal(posted.source, 'per-post lifetime');
  assert.equal(posted.warnings.length, 0);
  assert.deepEqual(posted.dates, ['2026-05-21', '2026-06-08', '2026-08-04', '2026-10-30']);
  const byKey = Object.fromEntries(posted.series.map((s) => [s.account.key, s.values]));
  assert.deepEqual(byKey.tt_kco, [0, 40, 0, 15]);
  assert.deepEqual(byKey.ig, [10, 0, 0, 9]);
  assert.deepEqual(byKey.pin, [0, 0, 80, 0]);
  assert.equal(posted.series.every((s) => s.flat === false), true);
  assert.match(posted.notes.join(' '), /90 days/);
});

test('chip marks use platform colour, not the MW4 gold plate', () => {
  const tt = Acc.brandMark(Acc.ACC[0], 16);
  const ig = Acc.brandMark(Acc.ACC[2], 12);
  const pin = Acc.brandMark(Acc.ACC[3], 16);
  assert.match(tt, /aria-label="TikTok"/);
  assert.match(tt, /#121212/);
  assert.match(tt, /#25F4EE/);
  assert.match(tt, /#FE2C55/);
  assert.match(tt, /width="16"/);
  assert.match(ig, /aria-label="Instagram"/);
  assert.match(ig, /#f09433/);
  assert.match(ig, /#bc1888/);
  assert.match(ig, /width="12"/);
  assert.match(pin, /aria-label="Pinterest"/);
  assert.match(pin, /#E60023/);
  for (const svg of [tt, ig, pin]) {
    assert.doesNotMatch(svg, /#F4E6C4/);
    assert.doesNotMatch(svg, /grayscale/i);
    assert.match(svg, /class="brand-mark"/);
  }
  assert.equal(Acc.ACC.map((a) => a.key).join(), 'tt_kco,tt_wk,ig,pin');
  assert.equal(Acc.ACC[2].wid, '17841478074449578');
});

test('committed feeds stay AES-GCM envelopes and scriptable does not point at Pages', () => {
  for (const rel of [
    `docs/${token}/status.json`,
    `docs/${token}/social/metrics.json`,
    `docs/${token}/ledger/feed.json`,
    `docs/${token}/care/feed.json`,
  ]) {
    const env = JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
    assert.equal(env.alg, 'AES-GCM');
    assert.equal(env.kdf, 'PBKDF2-SHA256');
    assert.equal(typeof env.ct, 'string');
    assert.ok(env.ct.length > 100);
    assert.equal(env.channels, undefined);
    assert.equal(env.posts, undefined);
  }
  const scriptable = fs.readdirSync(path.join(root, 'scriptable'), { recursive: true })
    .filter((name) => String(name).endsWith('.js'))
    .map((name) => fs.readFileSync(path.join(root, 'scriptable', String(name)), 'utf8'))
    .join('\n');
  assert.equal(scriptable.includes('github.io'), false);
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  assert.match(readme, /mw4-command-hud\.vercel\.app/);
  assert.match(readme, /GitHub Pages is disabled/);
});
