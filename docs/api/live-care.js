// Care refresh: the 4h box routine (squad cron 0 */4 * * * PT) reads a care@ clear
// drop and stores the ciphertext in a private Vercel Blob. /api/feed?f=care serves
// whichever copy has the later freshness stamp. The committed care/feed.json remains
// the fallback when the blob is missing, older, or will not decrypt.
// Cleartext is never written to disk or git. This module does not read Gmail.
const fs = require('node:fs');
const path = require('node:path');
const live = require('./live-status');

const CARE_FILE = path.join(__dirname, '../c85352c42452f0db1e1c5e56f60e5128/care/feed.json');
const LIVE_PATH = 'mw4/care-live.json';
const MAILBOX = 'care@kinsora.co';
const ISO_STAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

let fileCache = { sig: '', env: null, plain: null, stamp: '' };
let plainCache = { sig: '', buf: null };

function careStamp(model) {
  if (!model || typeof model !== 'object') return '';
  const gen = String(model.generatedAt || '').trim();
  const asOf = String(model.asOf || '').trim();
  if (ISO_STAMP.test(gen)) {
    const ms = Date.parse(gen);
    if (Number.isFinite(ms)) return new Date(ms).toISOString();
  }
  if (ISO_STAMP.test(asOf)) {
    const ms = Date.parse(asOf);
    if (Number.isFinite(ms)) return new Date(ms).toISOString() + (gen ? '\t' + gen : '');
  }
  const day = (asOf || gen).slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(day)) return gen ? day + '\t' + gen : day;
  return gen || asOf;
}

function readCommitted(readFile) {
  if (readFile) return readFile();
  return JSON.parse(fs.readFileSync(CARE_FILE, 'utf8'));
}

async function loadFile(pass, readFile) {
  const env = readCommitted(readFile);
  const sig = String(env.ct || '').slice(-32);
  if (fileCache.sig === sig && fileCache.env) return fileCache;
  let plain = null;
  let stamp = '';
  try {
    plain = await live.decryptEnv(env, pass);
    try { stamp = careStamp(JSON.parse(plain.toString('utf8'))); } catch { /* ignore */ }
  } catch {
    plain = null;
    stamp = '';
  }
  fileCache = { sig, env, plain, stamp };
  return fileCache;
}

function blobStore() {
  return live.blobStoreFor(LIVE_PATH);
}

function laterStamp(a, b) {
  if (a && b) return a > b ? a : b;
  return a || b || '';
}

function assertLive(model) {
  if (!model || typeof model !== 'object' || model.source !== 'live' || model.lane !== 'care' || model.mailbox !== MAILBOX) {
    const err = new Error('care drop is not a live care@kinsora.co model');
    err.code = 'BAD_MODEL';
    throw err;
  }
}

async function readableEnv(env, pass) {
  const sig = String(env && env.ct || '').slice(-48);
  if (plainCache.sig === sig && plainCache.buf) return env;
  const buf = await live.decryptEnv(env, pass);
  plainCache = { sig, buf };
  return env;
}

async function pickCareEnvelope(options = {}) {
  const pass = live.feedPass(options.pass);
  const file = await loadFile(pass, options.readFileEnv);
  const rec = await live.readLiveRecord(options.store || blobStore());
  const blobStamp = rec && rec.meta && rec.meta.updatedAt || '';
  const newer = Boolean(blobStamp && blobStamp > file.stamp);
  if (newer) {
    try { return await readableEnv(rec.env, pass); }
    catch { /* blob will not decrypt; use the committed file when it will */ }
  }
  if (file.plain) return file.env;
  if (rec && rec.env) {
    try { return await readableEnv(rec.env, pass); }
    catch { /* neither copy opens */ }
  }
  const err = new Error('care feed is not readable');
  err.code = 'UNREADABLE';
  throw err;
}

async function readCarePlain(options = {}) {
  const pass = live.feedPass(options.pass);
  const env = await pickCareEnvelope(options);
  const sig = String(env && env.ct || '').slice(-48);
  if (plainCache.sig === sig && plainCache.buf) return plainCache.buf;
  const file = await loadFile(pass, options.readFileEnv);
  if (file.plain && String(file.env.ct || '').slice(-48) === sig) return file.plain;
  const buf = await live.decryptEnv(env, pass);
  plainCache = { sig, buf };
  return buf;
}

async function publishCareModel(model, options = {}) {
  const pass = live.feedPass(options.pass);
  if (!pass) {
    const err = new Error('feed key not configured');
    err.code = 'NO_PASS';
    throw err;
  }
  assertLive(model);
  const stamp = careStamp(model);
  if (!stamp) {
    const err = new Error('care drop has no asOf or generatedAt');
    err.code = 'NO_STAMP';
    throw err;
  }
  const store = options.store || blobStore();
  if (!store) {
    const err = new Error('live store not configured');
    err.code = 'NO_STORE';
    throw err;
  }
  const file = await loadFile(pass, options.readFileEnv);
  if (!file.env || !file.env.salt || !file.env.iter) {
    const err = new Error('care envelope has no salt');
    err.code = 'NO_SALT';
    throw err;
  }
  const existing = await live.readLiveRecord(store);
  const current = laterStamp(file.stamp, existing && existing.meta && existing.meta.updatedAt || '');
  if (!(stamp > current)) return { ok: true, skipped: 'not-newer', updatedAt: current, asOf: model.asOf || '' };
  const env = await live.encryptStatus(model, pass, file.env.salt, file.env.iter);
  const record = {
    meta: {
      updatedAt: stamp,
      generatedAt: model.generatedAt || '',
      asOf: model.asOf || '',
      fetchedAt: new Date(options.now || Date.now()).toISOString(),
    },
    env,
  };
  await store.write(JSON.stringify(record));
  plainCache = { sig: String(env.ct).slice(-48), buf: Buffer.from(JSON.stringify(model)) };
  return { ok: true, skipped: '', updatedAt: stamp, asOf: model.asOf || '' };
}

function resetCaches() {
  fileCache = { sig: '', env: null, plain: null, stamp: '' };
  plainCache = { sig: '', buf: null };
}

module.exports = {
  LIVE_PATH,
  CARE_FILE,
  MAILBOX,
  careStamp,
  pickCareEnvelope,
  readCarePlain,
  publishCareModel,
  resetCaches,
};
