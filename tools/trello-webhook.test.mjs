import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createRequire } from 'node:module';
import { composeStatus } from '../docs/api/status-model.mjs';

const require = createRequire(import.meta.url);
const { signTrello, signaturesMatch } = require('../docs/api/trello-sig.js');
const live = require('../docs/api/live-status.js');
const handler = require('../docs/api/trello-webhook.js');

const SECRET = 'test-secret';
const COMMAND_URL = 'https://mw4-command-hud.vercel.app/api/trello-webhook?board=command&x-vercel-protection-bypass=example';
const TRADING_URL = 'https://mw4-command-hud.vercel.app/api/trello-webhook?board=trading&x-vercel-protection-bypass=example';
process.env.TRELLO_SECRET = SECRET;
process.env.TRELLO_CALLBACK_URL_COMMAND = COMMAND_URL;
process.env.TRELLO_CALLBACK_URL_TRADING = TRADING_URL;

function memoryStore() {
  let text = null;
  return {
    async read() { return text; },
    async write(next) { text = next; },
    raw() { return text ? JSON.parse(text) : null; },
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

function reqOf(method, url, headers, body) {
  const req = Readable.from(body ? [Buffer.from(body)] : []);
  req.method = method;
  req.url = url;
  req.headers = headers || {};
  return req;
}

const raw = Buffer.from(JSON.stringify({ action: { id: 'act-1', type: 'updateCard' }, model: { id: live.BOARDS.command.id } }));
const good = signTrello(SECRET, raw, COMMAND_URL);
assert.equal(signaturesMatch(good, good), true);
assert.equal(signaturesMatch(good, good + 'x'), false);
assert.equal(signaturesMatch(good, ''), false);
assert.equal(signTrello(SECRET, raw, TRADING_URL) === good, false);

{
  const res = resOf();
  await handler(reqOf('HEAD', '/api/trello-webhook?board=command'), res);
  assert.equal(res.statusCode, 200);
}
{
  const head = await handler(new Request('http://x/api/trello-webhook?board=command', { method: 'HEAD' }));
  assert.equal(head.status, 200);
  const denied = await handler(new Request('http://x/api/trello-webhook?board=command', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-trello-webhook': 'bad' },
    body: '{}',
  }));
  assert.equal(denied.status, 401);
}
{
  const res = resOf();
  await handler(reqOf('POST', '/api/trello-webhook?board=nope', { 'x-trello-webhook': good }, raw), res);
  assert.equal(res.statusCode, 400);
}
{
  const res = resOf();
  await handler(reqOf('POST', '/api/trello-webhook?board=command', { 'x-trello-webhook': 'nope' }, raw), res);
  assert.equal(res.statusCode, 401);
}
{
  const res = resOf();
  await handler(reqOf('POST', '/api/trello-webhook?board=trading', { 'x-trello-webhook': good }, raw), res);
  assert.equal(res.statusCode, 401, 'trading verifies against its own callback string');
}
{
  const orig = live.refreshLive;
  let calls = 0;
  live.refreshLive = async () => { calls += 1; return { ok: true, skipped: '' }; };
  try {
    const mismatch = Buffer.from(JSON.stringify({ action: { id: 'x' }, model: { id: 'not-the-board' } }));
    const res = resOf();
    await handler(reqOf('POST', '/api/trello-webhook?board=command', { 'x-trello-webhook': signTrello(SECRET, mismatch, COMMAND_URL) }, mismatch), res);
    assert.equal(res.statusCode, 200);
    assert.match(res.body, /model/);
    assert.equal(calls, 0);
    const ok = resOf();
    await handler(reqOf('POST', '/api/trello-webhook?board=command', { 'x-trello-webhook': good }, raw), ok);
    assert.equal(ok.statusCode, 200);
    assert.match(ok.body, /"ok":true/);
    assert.equal(calls, 1);
  } finally {
    live.refreshLive = orig;
  }
}

delete process.env.BLOB_READ_WRITE_TOKEN;
process.env.MW4_FEED_PASS = 'test-pass';
process.env.TRELLO_KEY = 'test-key';
process.env.TRELLO_TOKEN = 'test-token';
{
  const res = resOf();
  await handler(reqOf('POST', '/api/trello-webhook?board=command', { 'x-trello-webhook': good }, raw), res);
  assert.equal(res.statusCode, 500);
  assert.match(res.body, /store/);
}

function lists(cards) {
  return [{ name: 'Doing', cards }, { name: 'Waiting on Hunter', cards: [] }, { name: 'Done', cards: [] }];
}
const commandLists = lists([{ id: 'c1', name: 'Ko: fixture', desc: 'Lane: Ko', shortUrl: 'https://trello.com/c/fixture1', labels: [] }]);
const tradingLists = [{
  name: 'Waiting on Hunter',
  cards: [{ id: 'k1', name: 'Ghost: fixture', desc: 'Lane: Ghost', shortUrl: 'https://trello.com/c/fixture2', labels: [] }],
}, { name: 'Doing', cards: [] }, { name: 'Done', cards: [] }];

let fetches = 0;
const fetchImpl = async (url) => {
  fetches += 1;
  const u = new URL(url);
  if (u.pathname.endsWith('/lists')) {
    const id = u.pathname.split('/')[3];
    const body = id === live.BOARDS.command.id ? commandLists : tradingLists;
    return { ok: true, status: 200, json: async () => body };
  }
  if (u.pathname.endsWith('/actions')) return { ok: true, status: 200, json: async () => [] };
  return { ok: false, status: 404, json: async () => ({}) };
};

const prev = {
  updatedAt: '2026-11-01T00:00:00.000Z',
  command: { lists: { doing: [], waiting: [], backlog: [], done: [] }, counts: {} },
  kal: { lists: { doing: [], waiting: [], backlog: [], done: [] }, counts: {} },
  events: [{ t: '2026-11-03T11:00:00.000Z', op: 'Ko', kind: 'deploy', mission: 'old', from: 'backlog', to: 'doing', card: 'old', board: 'CMD' }],
};
const fileEnv = await live.encryptStatus(prev, 'test-pass', Buffer.from('0123456789abcdef').toString('base64'), 1000);
const store = memoryStore();
live.resetCaches();
const now = Date.parse('2026-11-03T12:00:00.000Z');
const first = await live.refreshLive({
  actionId: 'act-9',
  board: 'command',
  now,
  pass: 'test-pass',
  auth: { key: 'k', token: 't' },
  fetchImpl,
  store,
  readFileEnv: () => fileEnv,
});
assert.equal(first.skipped, '');
assert.equal(fetches, 4);
const saved = store.raw();
assert.equal(saved.env.salt, fileEnv.salt);
assert.equal(saved.env.iter, 1000);
assert.equal(saved.meta.seen.includes('act-9'), true);
const clear = JSON.parse((await live.decryptEnv(saved.env, 'test-pass')).toString('utf8'));
assert.equal(clear.command.counts.doing, 1);
assert.equal(clear.kal.counts.waiting, 1);
assert.equal(clear.glance.badge, '1 WAIT');
assert.equal(clear.events.some((e) => e.card === 'old'), true);
assert.equal(clear.events.some((e) => e.card === 'c1' && e.kind === 'deploy'), true);

const second = await live.refreshLive({
  actionId: 'act-9',
  board: 'command',
  now,
  pass: 'test-pass',
  auth: { key: 'k', token: 't' },
  fetchImpl,
  store,
  readFileEnv: () => fileEnv,
});
assert.equal(second.skipped, 'duplicate');
assert.equal(fetches, 4, 'a Trello retry of the same action does not refetch');

live.resetCaches();
const picked = await live.pickStatusEnvelope({ pass: 'test-pass', store, readFileEnv: () => fileEnv });
assert.equal(picked.iv, saved.env.iv);
const plain = JSON.parse((await live.readStatusPlain({ pass: 'test-pass', store, readFileEnv: () => fileEnv })).toString('utf8'));
assert.equal(plain.updatedAt, clear.updatedAt);

const moved = composeStatus({
  commandDump: { lists: [{ name: 'Done', cards: [{ id: 'c1', name: 'Ko: fixture', description: 'Lane: Ko' }] }] },
  kalDump: { lists: [] },
  prev: { snap: { c1: { list: 'doing', op: 'Ko', short: 'Fixture', board: 'CMD' } }, events: [] },
  now,
});
assert.equal(moved.status.events.some((e) => e.card === 'c1' && e.kind === 'rtb'), true);

assert.equal(live.storeIdFromToken('vercel_blob_rw_abc123_secret'), 'abc123');
console.log('trello webhook checks ok');
