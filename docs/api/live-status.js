// Webhook refresh: pull both boards, rebuild with the shared status model, encrypt
// with the committed envelope's salt + MW4_FEED_PASS, and store the ciphertext in
// a private Vercel Blob. /api/feed and /api/status-envelope serve whichever copy
// has the later updatedAt. Cleartext is never written to disk or git.
const fs = require('node:fs');
const path = require('node:path');
const { webcrypto: wc } = require('node:crypto');

const STATUS_FILE = path.join(__dirname, '../c85352c42452f0db1e1c5e56f60e5128/status.json');
const LIVE_PATH = 'mw4/status-live.json';
const BOARDS = {
  command: { id: '6ae64abb54c2ef96077bf42b', shortLink: 'JcLDGY59' },
  trading: { id: '6ae66e1e3971cb59726d178f', shortLink: '9zrVdX34' },
};
const SEEN_MAX = 80;

const keyCache = new Map();
let fileCache = { sig: '', env: null, plain: null, updatedAt: '' };
let plainCache = { sig: '', buf: null };
const inflight = new Map();

function feedPass(override) {
  return String(override != null ? override : (process.env.MW4_FEED_PASS || '')).replace(/[\r\n]+$/, '');
}

function blobToken() {
  return String(process.env.BLOB_READ_WRITE_TOKEN || '').trim();
}

function storeIdFromToken(token) {
  return String(token || '').split('_')[3] || '';
}

function trelloAuth() {
  const key = String(process.env.TRELLO_KEY || '').trim();
  const token = String(process.env.TRELLO_TOKEN || '').trim();
  if (!key || !token) return null;
  return { key, token };
}

async function cryptoKey(env, pass, usages) {
  const id = usages.join(',') + '|' + env.salt + '|' + env.iter + '|' + pass;
  if (!keyCache.has(id)) {
    const km = await wc.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
    keyCache.set(id, await wc.subtle.deriveKey(
      { name: 'PBKDF2', hash: 'SHA-256', salt: Buffer.from(env.salt, 'base64'), iterations: env.iter },
      km, { name: 'AES-GCM', length: 256 }, false, usages,
    ));
  }
  return keyCache.get(id);
}

async function decryptEnv(env, pass) {
  if (!pass) throw new Error('feed key not configured');
  if (!env || !env.ct) throw new Error('feed is not an encrypted envelope');
  const key = await cryptoKey(env, pass, ['decrypt']);
  return Buffer.from(await wc.subtle.decrypt(
    { name: 'AES-GCM', iv: Buffer.from(env.iv, 'base64') }, key, Buffer.from(env.ct, 'base64'),
  ));
}

async function encryptStatus(status, pass, salt, iter) {
  const env = { salt, iter };
  const key = await cryptoKey(env, pass, ['encrypt']);
  const iv = wc.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await wc.subtle.encrypt(
    { name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(status)),
  ));
  return {
    v: 1, alg: 'AES-GCM', kdf: 'PBKDF2-SHA256', iter, salt,
    iv: Buffer.from(iv).toString('base64'), ct: Buffer.from(ct).toString('base64'),
  };
}

function readFileEnv(readFileEnv) {
  if (readFileEnv) return readFileEnv();
  return JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8'));
}

async function loadFile(pass, readFile) {
  const env = readFileEnv(readFile);
  const sig = String(env.ct || '').slice(-32);
  if (fileCache.sig === sig && fileCache.plain) return fileCache;
  const plain = await decryptEnv(env, pass);
  let updatedAt = '';
  try { updatedAt = JSON.parse(plain.toString('utf8')).updatedAt || ''; } catch { /* ignore */ }
  fileCache = { sig, env, plain, updatedAt };
  return fileCache;
}

function blobStoreFor(pathname) {
  const token = blobToken();
  if (!token) return null;
  return {
    async read() { return blobGet(token, pathname); },
    async write(text) { await blobPut(token, pathname, text); },
  };
}

function blobStore() {
  return blobStoreFor(LIVE_PATH);
}

async function blobPut(token, pathname, body) {
  const storeId = storeIdFromToken(token);
  if (!storeId) throw new Error('blob store');
  const endpoint = 'https://vercel.com/api/blob/?' + new URLSearchParams({ pathname }).toString();
  const res = await fetch(endpoint, {
    method: 'PUT',
    headers: {
      authorization: 'Bearer ' + token,
      'x-api-version': '13',
      'x-vercel-blob-store-id': storeId,
      'x-vercel-blob-access': 'private',
      'x-content-type': 'application/json',
      'x-add-random-suffix': '0',
      'x-allow-overwrite': '1',
    },
    body,
  });
  if (!res.ok) throw new Error('blob put failed');
  await res.arrayBuffer().catch(() => null);
}

async function blobGet(token, pathname) {
  const storeId = storeIdFromToken(token);
  if (!storeId) throw new Error('blob store');
  const url = `https://${storeId}.private.blob.vercel-storage.com/${pathname}?cache=0`;
  const res = await fetch(url, { headers: { authorization: 'Bearer ' + token } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('blob get failed');
  return res.text();
}

async function readRecord(store) {
  if (!store) return null;
  try {
    const text = await store.read();
    if (!text) return null;
    const rec = JSON.parse(text);
    if (!rec || !rec.env || !rec.env.ct || !rec.meta) return null;
    return rec;
  } catch {
    return null;
  }
}

async function pickStatusEnvelope(options = {}) {
  const pass = feedPass(options.pass);
  const file = await loadFile(pass, options.readFileEnv);
  const rec = await readRecord(options.store || blobStore());
  const newer = rec && rec.meta && rec.meta.updatedAt && rec.meta.updatedAt > file.updatedAt;
  if (!newer) return file.env;
  const sig = String(rec.env.ct || '').slice(-48);
  if (plainCache.sig === sig && plainCache.buf) return rec.env;
  try {
    const buf = await decryptEnv(rec.env, pass);
    plainCache = { sig, buf };
    return rec.env;
  } catch {
    return file.env;
  }
}

async function readStatusPlain(options = {}) {
  const pass = feedPass(options.pass);
  const env = await pickStatusEnvelope(options);
  const sig = String(env && env.ct || '').slice(-48);
  if (plainCache.sig === sig && plainCache.buf) return plainCache.buf;
  const file = await loadFile(pass, options.readFileEnv);
  if (file.plain && String(file.env.ct || '').slice(-48) === sig) return file.plain;
  const buf = await decryptEnv(env, pass);
  plainCache = { sig, buf };
  return buf;
}

function dumpFromLists(lists, shortLink) {
  return {
    board: { shortLink },
    lists: (Array.isArray(lists) ? lists : []).map((list) => ({
      name: list.name,
      cards: (list.cards || []).map((card) => ({
        id: card.id,
        name: card.name,
        desc: card.desc || '',
        description: card.desc || '',
        shortUrl: card.shortUrl || '',
        url: card.url || '',
        shortLink: card.shortLink || '',
        labels: card.labels || [],
        lastActivityAt: card.dateLastActivity || '',
      })),
    })),
  };
}

async function trelloJson(fetchImpl, auth, pathname, params) {
  const url = new URL('https://api.trello.com/1' + pathname);
  for (const [k, v] of Object.entries(params)) if (v) url.searchParams.set(k, v);
  url.searchParams.set('key', auth.key);
  url.searchParams.set('token', auth.token);
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error('trello ' + res.status);
  return res.json();
}

async function fetchBoard(fetchImpl, auth, board, sinceIso) {
  const spec = BOARDS[board];
  const lists = await trelloJson(fetchImpl, auth, `/boards/${spec.id}/lists`, {
    cards: 'open',
    filter: 'open',
    fields: 'name',
    card_fields: 'name,desc,shortUrl,url,shortLink,labels,dateLastActivity,id',
  });
  const actions = [];
  let before = '';
  for (let page = 0; page < 3; page++) {
    const batch = await trelloJson(fetchImpl, auth, `/boards/${spec.shortLink}/actions`, {
      filter: 'updateCard:idList',
      since: sinceIso,
      limit: '1000',
      before,
    });
    if (!Array.isArray(batch) || !batch.length) break;
    actions.push(...batch);
    if (batch.length < 1000) break;
    before = batch[batch.length - 1] && batch[batch.length - 1].id;
    if (!before) break;
  }
  return { dump: dumpFromLists(lists, spec.shortLink), actions };
}

async function refreshLiveInner(options) {
  const pass = feedPass(options.pass);
  if (!pass) throw new Error('feed key not configured');
  const auth = options.auth || trelloAuth();
  if (!auth) throw new Error('trello auth not configured');
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const store = options.store || blobStore();
  if (!store) {
    const err = new Error('live store not configured');
    err.code = 'NO_STORE';
    throw err;
  }
  const actionId = String(options.actionId || '');
  const existing = await readRecord(store);
  const seen = (existing && existing.meta && existing.meta.seen) || [];
  if (actionId && seen.includes(actionId)) return { ok: true, skipped: 'duplicate', updatedAt: existing.meta.updatedAt || '' };

  const { composeStatus, ptDayStartIso, snapFromStatus } = await import('./status-model.mjs');
  const now = options.now || Date.now();
  const since = ptDayStartIso(now);
  const [command, trading] = await Promise.all([
    fetchBoard(fetchImpl, auth, 'command', since),
    fetchBoard(fetchImpl, auth, 'trading', since),
  ]);
  const file = await loadFile(pass, options.readFileEnv);
  let basePlain = file.plain;
  if (existing && existing.meta && existing.meta.updatedAt && existing.meta.updatedAt > file.updatedAt) {
    try { basePlain = await decryptEnv(existing.env, pass); }
    catch { /* keep the committed file as the previous snapshot */ }
  }
  const base = JSON.parse(Buffer.from(basePlain).toString('utf8'));
  const { status, snap } = composeStatus({
    commandDump: command.dump,
    kalDump: trading.dump,
    commandMoves: command.actions,
    kalMoves: trading.actions,
    prev: { snap: snapFromStatus(base), events: base.events || [] },
    now,
  });
  const env = await encryptStatus(status, pass, file.env.salt, file.env.iter);
  const nextSeen = actionId ? [...seen, actionId].slice(-SEEN_MAX) : seen.slice(-SEEN_MAX);
  const record = {
    meta: {
      updatedAt: status.updatedAt,
      fetchedAt: new Date(now).toISOString(),
      board: options.board || '',
      action: actionId,
      seen: nextSeen,
    },
    env,
  };
  await store.write(JSON.stringify(record));
  plainCache = { sig: String(env.ct).slice(-48), buf: Buffer.from(JSON.stringify(status)) };
  return { ok: true, skipped: '', updatedAt: status.updatedAt, snapKeys: Object.keys(snap).length };
}

async function refreshLive(options = {}) {
  const actionId = String(options.actionId || '');
  if (actionId && inflight.has(actionId)) return inflight.get(actionId);
  const job = refreshLiveInner(options).finally(() => { if (actionId) inflight.delete(actionId); });
  if (actionId) inflight.set(actionId, job);
  return job;
}

function resetCaches() {
  fileCache = { sig: '', env: null, plain: null, updatedAt: '' };
  plainCache = { sig: '', buf: null };
  keyCache.clear();
  inflight.clear();
}

async function publicState(board) {
  const rec = await readRecord(blobStore());
  return {
    ok: true,
    board: board || '',
    live: Boolean(rec && rec.meta && rec.meta.updatedAt),
    updatedAt: (rec && rec.meta && rec.meta.updatedAt) || '',
    stored: rec ? 'blob' : (blobToken() ? 'empty' : 'unconfigured'),
  };
}

module.exports = {
  BOARDS,
  LIVE_PATH,
  storeIdFromToken,
  blobStoreFor,
  readLiveRecord: readRecord,
  feedPass,
  pickStatusEnvelope,
  readStatusPlain,
  refreshLive,
  publicState,
  resetCaches,
  encryptStatus,
  decryptEnv,
};
