import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { buildSocialModel } from './social-model.mjs';

const require = createRequire(import.meta.url);
const status = require('../docs/api/live-status.js');
const social = require('../docs/api/live-social.js');
const handler = require('../docs/api/feed.js');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PASS = 'test-pass';
const SALT = Buffer.from('0123456789abcdef').toString('base64');
delete process.env.BLOB_READ_WRITE_TOKEN;
delete process.env.MW4_FEED_PASS;
delete process.env.MW4_LEDGER_PASS;
delete process.env.MW4_SOCIAL_METRICS;

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

function model(day, generatedAt, extra = {}) {
  return {
    generatedAt: generatedAt === undefined ? day + 'T12:00:00.000Z' : generatedAt,
    asOfDay: day,
    channels: [{ key: 'ig', published: 1 }],
    series: { ig: { source: 'fixture', metric: 'views', points: [[day, 1]] } },
    posts: [['ig', day, '', extra.hook || 'hook', 1, null, null, null, null, 'W', '']],
    notes: [],
    errors: [],
    sources: [],
  };
}

async function fileEnv(day, generatedAt) {
  return status.encryptStatus(model(day, generatedAt), PASS, SALT, 1000);
}

function opts(store, env) {
  return { pass: PASS, store, readFileEnv: () => env };
}

assert.equal(social.LIVE_PATH, 'mw4/social-live.json');
assert.equal(
  social.socialStamp({ generatedAt: '2026-11-03T05:15:00.000Z', asOfDay: '2026-11-02' }),
  '2026-11-03T05:15:00.000Z',
);
assert.equal(
  social.socialStamp({ generatedAt: '2026-11-02T21:15:00-08:00', asOfDay: '2026-11-02' }),
  '2026-11-03T05:15:00.000Z',
);
assert.ok(
  social.socialStamp({ generatedAt: '2026-11-03 01:00 PT', asOfDay: '2026-11-03' })
  > social.socialStamp({ generatedAt: '2026-11-02T21:15:00.000Z', asOfDay: '2026-11-02' }),
);
assert.ok(
  social.socialStamp({ generatedAt: '2026-11-02 22:00 PT', asOfDay: '2026-11-02' })
  > social.socialStamp({ generatedAt: '2026-11-02 21:15 PT', asOfDay: '2026-11-02' }),
);

{
  const built = buildSocialModel({
    generated_at: '2026-11-03T12:00:00.000Z',
    channels: [{ key: 'ig', platform: 'instagram', handle: '@wearkinsora', published_count: 2, earliest_post_pt: '2026-05-21', totals: { views: 4 } },
      { key: 'pin', platform: 'pinterest', handle: 'wearkinsora', published_count: 1, postiz_queue: 3 }],
    platform_series: [
      { ch: 'ig', usable: true, source: 'Windsor instagram', metric: 'views', points: [['2026-11-01', 4]] },
      { ch: 'ig', usable: true, source: 'ignored duplicate', metric: 'views', points: [['2026-11-09', 9]] },
      { ch: 'pin', usable: false, source: 'nope', metric: 'impressions', points: [['2026-12-01', 1]] },
    ],
    posts: [
      { ch: 'ig', date: '2026-11-02', ts: '2026-11-02T00:00:00Z', slot: 'a', hook: 'h', views: 4, src: 'Windsor', url: '' },
      { ch: 'pin', date: '2026-11-02', ts: '2026-11-02T01:00:00Z', slot: 'b', hook: 'p', clicks: 7, src: 'Postiz analytics', url: '' },
    ],
  }, { queue: { ig: 5 } });
  assert.equal(built.generatedAt, '2026-11-03T12:00:00.000Z');
  assert.equal(built.asOfDay, '2026-11-02');
  assert.equal(built.channels[0].published, 2);
  assert.equal(built.channels[0].queue, 5);
  assert.equal(built.channels[1].queue, 3);
  assert.equal(built.series.ig.points.length, 1);
  assert.equal(built.series.pin, undefined);
  assert.equal(built.posts[0][0], 'pin');
  assert.equal(built.posts[0][7], 7);
  assert.equal(built.posts[1][4], 4);
  assert.equal(built.posts.some((row) => String(row).includes('2026-12-01') || String(row).includes('2026-11-09')), false);
}

{
  const env = await fileEnv('2026-11-01');
  const store = memoryStore();
  social.resetCaches();
  const plain = JSON.parse((await social.readSocialPlain(opts(store, env))).toString('utf8'));
  assert.equal(plain.asOfDay, '2026-11-01');
  assert.equal(store.raw(), null);
}

{
  const env = await fileEnv('2026-11-03');
  const older = model('2026-11-01');
  const olderEnv = await status.encryptStatus(older, PASS, SALT, 1000);
  const store = memoryStore();
  await store.write(JSON.stringify({
    meta: { updatedAt: social.socialStamp(older), asOfDay: '2026-11-01' },
    env: olderEnv,
  }));
  social.resetCaches();
  const picked = await social.pickSocialEnvelope(opts(store, env));
  assert.equal(picked.iv, env.iv);
  const plain = JSON.parse((await social.readSocialPlain(opts(store, env))).toString('utf8'));
  assert.equal(plain.asOfDay, '2026-11-03');
}

{
  const env = await fileEnv('2026-11-01');
  const newer = model('2026-11-03', '2026-11-03T16:00:00.000Z', { hook: 'mw4-social-fixture-sentinel' });
  const store = memoryStore();
  social.resetCaches();
  const published = await social.publishSocialModel(newer, { ...opts(store, env), now: Date.parse('2026-11-03T16:00:00.000Z') });
  assert.equal(published.skipped, '');
  assert.equal(published.asOfDay, '2026-11-03');
  const saved = JSON.parse(store.raw());
  assert.equal(saved.env.salt, env.salt);
  assert.equal(saved.env.iter, 1000);
  assert.equal(saved.meta.asOfDay, '2026-11-03');
  assert.equal(saved.channels, undefined);
  assert.equal(store.raw().includes('mw4-social-fixture-sentinel'), false);
  social.resetCaches();
  const plain = JSON.parse((await social.readSocialPlain(opts(store, env))).toString('utf8'));
  assert.equal(plain.asOfDay, '2026-11-03');
  assert.equal(plain.posts[0][3], 'mw4-social-fixture-sentinel');
  const picked = await social.pickSocialEnvelope(opts(store, env));
  assert.equal(picked.iv, saved.env.iv);
}

{
  const env = await fileEnv('2026-11-03');
  const store = memoryStore();
  social.resetCaches();
  const published = await social.publishSocialModel(model('2026-11-01'), opts(store, env));
  assert.equal(published.skipped, 'not-newer');
  assert.equal(store.raw(), null);
}

{
  const earlier = model('2026-11-02', '2026-11-02 21:15 PT');
  const env = await status.encryptStatus(earlier, PASS, SALT, 1000);
  const store = memoryStore();
  social.resetCaches();
  const sameDay = await social.publishSocialModel(model('2026-11-02', '2026-11-02 22:00 PT'), opts(store, env));
  assert.equal(sameDay.skipped, '');
  social.resetCaches();
  const nextDay = model('2026-11-03', '2026-11-03 01:00 PT');
  const rolled = await social.publishSocialModel(nextDay, opts(store, env));
  assert.equal(rolled.skipped, '');
  social.resetCaches();
  const plain = JSON.parse((await social.readSocialPlain(opts(store, env))).toString('utf8'));
  assert.equal(plain.asOfDay, '2026-11-03');
  assert.equal(plain.generatedAt, '2026-11-03 01:00 PT');
}

{
  const env = await fileEnv('2026-11-01');
  const newest = model('2026-11-03');
  const store = memoryStore();
  await store.write(JSON.stringify({
    meta: { updatedAt: social.socialStamp(newest), asOfDay: '2026-11-03' },
    env: await status.encryptStatus(newest, PASS, SALT, 1000),
  }));
  const before = store.raw();
  social.resetCaches();
  const published = await social.publishSocialModel(model('2026-11-02'), opts(store, env));
  assert.equal(published.skipped, 'not-newer');
  assert.equal(store.raw(), before);
}

{
  const env = await fileEnv('2026-11-01');
  const store = memoryStore();
  await store.write(JSON.stringify({
    meta: { updatedAt: '2099-01-01T00:00:00.000Z', asOfDay: '2099-01-01' },
    env: { ...env, ct: Buffer.from('not-ciphertext').toString('base64') },
  }));
  social.resetCaches();
  const plain = JSON.parse((await social.readSocialPlain(opts(store, env))).toString('utf8'));
  assert.equal(plain.asOfDay, '2026-11-01');
}

{
  social.resetCaches();
  await assert.rejects(
    social.publishSocialModel(model('2026-11-03'), { pass: PASS, readFileEnv: () => fileEnv('2026-11-01') }),
    (err) => err.code === 'NO_STORE',
  );
}

{
  const env = await fileEnv('2026-11-01');
  social.resetCaches();
  await assert.rejects(
    social.publishSocialModel({ generatedAt: '2026-11-03T00:00:00.000Z', asOfDay: '2026-11-03' }, opts(memoryStore(), env)),
    (err) => err.code === 'EMPTY',
  );
  await assert.rejects(
    social.publishSocialModel({ channels: [{ key: 'ig' }], posts: [], series: {} }, opts(memoryStore(), env)),
    (err) => err.code === 'NO_STAMP',
  );
}

{
  const orig = social.readSocialPlain;
  let calls = 0;
  social.readSocialPlain = async () => {
    calls += 1;
    return Buffer.from('{"asOfDay":"2026-11-03","channels":[]}');
  };
  try {
    const res = resOf();
    await handler({ url: '/api/feed?f=social' }, res);
    assert.equal(calls, 1);
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['cache-control'], 'private, no-store, max-age=0');
    assert.match(res.body, /"asOfDay":"2026-11-03"/);
    assert.equal(res.body.includes('"ct"'), false);
  } finally {
    social.readSocialPlain = orig;
  }
}

{
  const res = resOf();
  await handler({ url: '/api/feed?f=nope' }, res);
  assert.equal(res.statusCode, 404);
}
{
  const res = resOf();
  await handler({ url: '/api/feed?f=ledger' }, res);
  assert.equal(res.statusCode, 500);
  assert.match(res.body, /feed key not configured/);
}

{
  const envBase = { ...process.env };
  delete envBase.MW4_FEED_PASS;
  delete envBase.MW4_LEDGER_PASS;
  delete envBase.BLOB_READ_WRITE_TOKEN;
  delete envBase.MW4_SOCIAL_METRICS;
  const script = path.join(root, 'tools/publish-social-live.mjs');
  const absent = path.join(os.tmpdir(), `mw4-social-absent-${process.pid}.json`);
  const quiet = spawnSync(process.execPath, [script, '--metrics', absent], { cwd: root, encoding: 'utf8', env: envBase });
  assert.equal(quiet.status, 0);
  assert.equal(quiet.stdout, '');
  assert.equal(quiet.stderr, '');

  const drop = path.join(os.tmpdir(), `mw4-social-drop-${process.pid}.json`);
  fs.writeFileSync(drop, JSON.stringify({
    generated_at: '2026-11-03T12:00:00.000Z',
    channels: [{ key: 'ig', platform: 'instagram', handle: '@wearkinsora', published_count: 1 }],
    platform_series: [{ ch: 'ig', usable: true, source: 'Windsor instagram', metric: 'views', points: [['2026-11-03', 1]] }],
    posts: [],
  }));
  try {
    const noisy = spawnSync(process.execPath, [script, '--metrics', drop], { cwd: root, encoding: 'utf8', env: envBase });
    assert.equal(noisy.status, 1);
    assert.match(noisy.stderr, /feed key not configured/);
    assert.equal(noisy.stdout, '');
  } finally {
    fs.unlinkSync(drop);
  }
}

console.log('social live checks ok');
