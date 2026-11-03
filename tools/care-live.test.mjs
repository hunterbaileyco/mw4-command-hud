import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { normalizeCareModel } from './care-model.mjs';

const require = createRequire(import.meta.url);
const status = require('../docs/api/live-status.js');
const care = require('../docs/api/live-care.js');
const handler = require('../docs/api/feed.js');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const token = 'c85352c42452f0db1e1c5e56f60e5128';
const PASS = 'test-pass';
const SALT = Buffer.from('0123456789abcdef').toString('base64');
delete process.env.BLOB_READ_WRITE_TOKEN;
delete process.env.MW4_FEED_PASS;
delete process.env.MW4_LEDGER_PASS;
delete process.env.MW4_CARE_DROP;

function memoryStore() {
  let text = null;
  return {
    async read() { return text; },
    async write(next) { text = next; },
    raw() { return text; },
  };
}

function resOf() {
  return {
    statusCode: 0,
    body: '',
    headers: {},
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    end(b) { this.body = b == null ? '' : String(b); },
  };
}

function model(stamp, extra = {}) {
  return {
    source: 'live',
    owner: 'Laswell',
    lane: 'care',
    mailbox: 'care@kinsora.co',
    asOf: extra.asOf === undefined ? stamp : extra.asOf,
    generatedAt: extra.generatedAt === undefined ? stamp : extra.generatedAt,
    kpis: {
      open: extra.open === undefined ? 2 : extra.open,
      waitingOnUs: extra.waitingOnUs === undefined ? 1 : extra.waitingOnUs,
      oldestLabel: extra.oldestLabel === undefined ? '4h12' : extra.oldestLabel,
      medianFirstReplyLabel: extra.medianFirstReplyLabel === undefined ? null : extra.medianFirstReplyLabel,
    },
    spark24h: extra.spark24h || { in: 3, out: 1, bars: [{ dir: 'in', h: 12 }, { dir: 'out', h: 6 }] },
    mix: extra.mix || [{ key: 'WISMO', pct: 41 }],
    queue: extra.queue || [{ id: 'C-1042', title: extra.title || 'Where is the order', detail: 'care@ · 4h12', ageLabel: '4h12', hot: true }],
    notes: extra.notes || [],
  };
}

async function fileEnv(stamp, extra) {
  return status.encryptStatus(model(stamp, extra), PASS, SALT, 1000);
}

function opts(store, env) {
  return { pass: PASS, store, readFileEnv: () => env };
}

assert.equal(care.LIVE_PATH, 'mw4/care-live.json');
assert.equal(care.MAILBOX, 'care@kinsora.co');
assert.equal(
  care.careStamp({ generatedAt: '2026-11-03T05:15:00.000Z', asOf: '2026-11-03T05:00:00.000Z' }),
  '2026-11-03T05:15:00.000Z',
);
assert.equal(
  care.careStamp({ generatedAt: '2026-11-02T21:15:00-08:00', asOf: '2026-11-03T05:00:00.000Z' }),
  '2026-11-03T05:15:00.000Z',
);
assert.ok(
  care.careStamp({ generatedAt: '2026-11-03 01:00 PT', asOf: '2026-11-03T09:00:00.000Z' })
  > care.careStamp({ generatedAt: '2026-11-02 21:15 PT', asOf: '2026-11-03T05:15:00.000Z' }),
);

{
  const built = normalizeCareModel({
    source: 'live',
    owner: 'Laswell',
    lane: 'care',
    mailbox: 'care@kinsora.co',
    asOf: '2026-11-03T17:00:00.000Z',
    generatedAt: '2026-11-03 09:00 PT',
    kpis: { open: 0, waitingOnUs: 4, oldestLabel: '4h12' },
    spark24h: { in: 2, out: null, bars: [{ dir: 'in', h: 30 }, { dir: 'sideways', h: 4 }, { dir: 'out', h: 3 }] },
    mix: [{ key: 'WISMO', pct: 41 }, { key: '', pct: 5 }],
    queue: [{ id: 'C-1', title: 'Hi', detail: 'care@ · 1h', ageLabel: '1h', hot: true }],
    notes: [],
  });
  assert.equal(built.source, 'live');
  assert.equal(built.kpis.open, 0);
  assert.equal(built.kpis.medianFirstReplyLabel, null);
  assert.equal(built.spark24h.out, null);
  assert.deepEqual(built.spark24h.bars, [{ dir: 'in', h: 24 }, { dir: 'out', h: 3 }]);
  assert.equal(built.mix.length, 1);
  assert.equal(JSON.stringify(built).includes('Intercom'), false);
  await assert.rejects(() => Promise.resolve().then(() => normalizeCareModel({ mailbox: 'other@example.com' })), (err) => err.code === 'BAD_MODEL');
}

{
  const env = await fileEnv('2026-11-01T00:00:00.000Z');
  const store = memoryStore();
  care.resetCaches();
  const plain = JSON.parse((await care.readCarePlain(opts(store, env))).toString('utf8'));
  assert.equal(plain.asOf, '2026-11-01T00:00:00.000Z');
  assert.equal(plain.kpis.medianFirstReplyLabel, null);
  assert.equal(store.raw(), null);
}

{
  const env = await fileEnv('2026-11-03T16:00:00.000Z');
  const older = model('2026-11-01T00:00:00.000Z');
  const olderEnv = await status.encryptStatus(older, PASS, SALT, 1000);
  const store = memoryStore();
  await store.write(JSON.stringify({
    meta: { updatedAt: care.careStamp(older), asOf: older.asOf },
    env: olderEnv,
  }));
  care.resetCaches();
  const picked = await care.pickCareEnvelope(opts(store, env));
  assert.equal(picked.iv, env.iv);
  const plain = JSON.parse((await care.readCarePlain(opts(store, env))).toString('utf8'));
  assert.equal(plain.asOf, '2026-11-03T16:00:00.000Z');
}

{
  const env = await fileEnv('2026-11-01T00:00:00.000Z');
  const newer = model('2026-11-03T16:00:00.000Z', { title: 'mw4-care-fixture-sentinel' });
  const store = memoryStore();
  care.resetCaches();
  const published = await care.publishCareModel(newer, { ...opts(store, env), now: Date.parse('2026-11-03T16:00:00.000Z') });
  assert.equal(published.skipped, '');
  assert.equal(published.asOf, '2026-11-03T16:00:00.000Z');
  const saved = JSON.parse(store.raw());
  assert.equal(saved.env.salt, env.salt);
  assert.equal(saved.env.iter, 1000);
  assert.equal(saved.queue, undefined);
  assert.equal(store.raw().includes('mw4-care-fixture-sentinel'), false);
  care.resetCaches();
  const plain = JSON.parse((await care.readCarePlain(opts(store, env))).toString('utf8'));
  assert.equal(plain.queue[0].title, 'mw4-care-fixture-sentinel');
  assert.equal(plain.kpis.medianFirstReplyLabel, null);
  const picked = await care.pickCareEnvelope(opts(store, env));
  assert.equal(picked.iv, saved.env.iv);
}

{
  const env = await fileEnv('2026-11-03T16:00:00.000Z');
  const store = memoryStore();
  care.resetCaches();
  const published = await care.publishCareModel(model('2026-11-01T00:00:00.000Z'), opts(store, env));
  assert.equal(published.skipped, 'not-newer');
  assert.equal(store.raw(), null);
}

{
  const env = await fileEnv('2026-11-01T00:00:00.000Z');
  const store = memoryStore();
  await store.write(JSON.stringify({
    meta: { updatedAt: '2099-01-01T00:00:00.000Z', asOf: '2099-01-01T00:00:00.000Z' },
    env: { ...env, ct: Buffer.from('not-ciphertext').toString('base64') },
  }));
  care.resetCaches();
  const plain = JSON.parse((await care.readCarePlain(opts(store, env))).toString('utf8'));
  assert.equal(plain.asOf, '2026-11-01T00:00:00.000Z');
}

{
  const env = await status.encryptStatus(model('2026-11-01T00:00:00.000Z'), 'other-pass', SALT, 1000);
  const newer = model('2026-11-03T16:00:00.000Z', { title: 'blob-only-sentinel' });
  const store = memoryStore();
  await store.write(JSON.stringify({
    meta: { updatedAt: care.careStamp(newer), asOf: newer.asOf },
    env: await status.encryptStatus(newer, PASS, SALT, 1000),
  }));
  care.resetCaches();
  const plain = JSON.parse((await care.readCarePlain(opts(store, env))).toString('utf8'));
  assert.equal(plain.queue[0].title, 'blob-only-sentinel');
}

{
  const env = await status.encryptStatus(model('2026-11-01T00:00:00.000Z'), 'other-pass', SALT, 1000);
  care.resetCaches();
  await assert.rejects(
    care.readCarePlain(opts(memoryStore(), env)),
    (err) => err.code === 'UNREADABLE',
  );
}

{
  care.resetCaches();
  await assert.rejects(
    care.publishCareModel(model('2026-11-03T00:00:00.000Z'), { pass: PASS, readFileEnv: () => fileEnv('2026-11-01T00:00:00.000Z') }),
    (err) => err.code === 'NO_STORE',
  );
}

{
  const env = await fileEnv('2026-11-01T00:00:00.000Z');
  care.resetCaches();
  await assert.rejects(
    care.publishCareModel({ source: 'sample', lane: 'care', mailbox: 'care@kinsora.co', asOf: '2026-11-03T00:00:00.000Z' }, opts(memoryStore(), env)),
    (err) => err.code === 'BAD_MODEL',
  );
  await assert.rejects(
    care.publishCareModel({ source: 'live', lane: 'care', mailbox: 'care@kinsora.co', kpis: {} }, opts(memoryStore(), env)),
    (err) => err.code === 'NO_STAMP',
  );
}

{
  const orig = care.readCarePlain;
  let calls = 0;
  care.readCarePlain = async () => {
    calls += 1;
    return Buffer.from('{"source":"live","lane":"care","mailbox":"care@kinsora.co","asOf":"2026-11-03T17:00:00.000Z"}');
  };
  try {
    const res = resOf();
    await handler({ url: '/api/feed?f=care' }, res);
    assert.equal(calls, 1);
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['cache-control'], 'private, no-store, max-age=0');
    assert.match(res.body, /"mailbox":"care@kinsora.co"/);
    assert.equal(res.body.includes('"ct"'), false);
  } finally {
    care.readCarePlain = orig;
  }
}

{
  const hub = fs.readFileSync(path.join(root, 'docs', token, 'hub/index.html'), 'utf8');
  const careJs = fs.readFileSync(path.join(root, 'docs', token, 'hub/care.js'), 'utf8');
  const pullFn = hub.slice(hub.indexOf('async function pull()'), hub.indexOf(" $('sync2')"));
  assert.match(pullFn, /get\('care'\)/);
  assert.match(pullFn, /care\(null\)/);
  assert.match(hub, /id="care-desk"/);
  assert.match(hub, /NOT LIVE/);
  assert.match(hub, /src="care\.js"/);
  assert.doesNotMatch(hub, /Intercom/);
  assert.doesNotMatch(careJs, /Intercom/);
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(careJs, context, { filename: 'care.js' });
  const C = context.window.MW4Care;
  assert.equal(C.liveModel({ source: 'sample', lane: 'care', mailbox: 'care@kinsora.co' }), false);
  assert.equal(C.liveModel(model('2026-11-03T17:00:00.000Z', { medianFirstReplyLabel: null })), true);
  const frag = C.fragments(model('2026-11-03T17:04:00.000Z', { medianFirstReplyLabel: null, open: 7 }));
  assert.match(frag.bandMeta, /LIVE/);
  assert.match(frag.kpis, /Median 1st reply/);
  assert.match(frag.kpis, /\u2014/);
  assert.match(frag.kpis, />7</);
  assert.match(frag.spark, /class="o"/);
  assert.match(frag.queue, /C-1042/);
  assert.match(frag.queue, /class="age h"/);
  assert.match(frag.footer, /LIVE/);
  assert.match(frag.footer, /care@kinsora\.co/);
  assert.match(frag.footer, /only/);
  assert.doesNotMatch(frag.footer, /SAMPLE/);
  assert.doesNotMatch(frag.footer, /Intercom/);
  const quiet = C.fragments(model('2026-11-03T17:04:00.000Z', {
    open: null, waitingOnUs: null, oldestLabel: null, medianFirstReplyLabel: null,
    spark24h: { in: null, out: null, bars: [] }, mix: [], queue: [],
  }));
  assert.equal(quiet.spark, '');
  assert.equal(quiet.queue, '');
  assert.match(quiet.kpis, /\u2014/);
}

{
  const statusEnv = JSON.parse(fs.readFileSync(path.join(root, 'docs', token, 'status.json'), 'utf8'));
  const careEnv = JSON.parse(fs.readFileSync(path.join(root, 'docs', token, 'care/feed.json'), 'utf8'));
  assert.equal(careEnv.alg, 'AES-GCM');
  assert.equal(careEnv.kdf, 'PBKDF2-SHA256');
  assert.equal(careEnv.salt, statusEnv.salt);
  assert.equal(careEnv.iter, statusEnv.iter);
  assert.equal(careEnv.queue, undefined);
  assert.ok(careEnv.ct.length > 100);
}

{
  const envBase = { ...process.env };
  delete envBase.MW4_FEED_PASS;
  delete envBase.MW4_LEDGER_PASS;
  delete envBase.BLOB_READ_WRITE_TOKEN;
  delete envBase.MW4_CARE_DROP;
  const script = path.join(root, 'tools/publish-care-live.mjs');
  const absent = path.join(os.tmpdir(), `mw4-care-absent-${process.pid}.json`);
  const quiet = spawnSync(process.execPath, [script, '--in', absent], { cwd: root, encoding: 'utf8', env: envBase });
  assert.equal(quiet.status, 0);
  assert.equal(quiet.stdout, '');
  assert.equal(quiet.stderr, '');

  const drop = path.join(os.tmpdir(), `mw4-care-drop-${process.pid}.json`);
  fs.writeFileSync(drop, JSON.stringify(model('2026-11-03T17:00:00.000Z')));
  const build = path.join(root, 'tools/build-care.mjs');
  try {
    const noisy = spawnSync(process.execPath, [script, '--in', drop], { cwd: root, encoding: 'utf8', env: envBase });
    assert.equal(noisy.status, 1);
    assert.match(noisy.stderr, /feed key not configured|live store not configured|care feed is not readable|care envelope has no salt/);
    assert.equal(noisy.stdout, '');
    const buildQuiet = spawnSync(process.execPath, [build, '--in', absent], { cwd: root, encoding: 'utf8', env: envBase });
    assert.equal(buildQuiet.status, 0);
    assert.equal(buildQuiet.stdout, '');
    assert.equal(buildQuiet.stderr, '');
    const buildNoisy = spawnSync(process.execPath, [build, '--in', drop], { cwd: root, encoding: 'utf8', env: envBase });
    assert.equal(buildNoisy.status, 1);
    assert.match(buildNoisy.stderr, /feed key not configured/);
  } finally {
    fs.unlinkSync(drop);
  }
}

{
  care.resetCaches();
  const res = resOf();
  await handler({ url: '/api/feed?f=care' }, res);
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.source, 'sample');
  assert.equal(body.mailbox, 'care@kinsora.co');
  assert.equal(body.kpis.medianFirstReplyLabel, null);
  assert.equal(body.queue.length, 0);
  assert.equal(res.body.includes('C-1042'), false);
}

console.log('care live checks ok');
