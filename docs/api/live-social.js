// Social refresh: the 4h box routine (squad cron 0 */4 * * * PT) builds Jae's metrics
// drop and stores the ciphertext in a private Vercel Blob. /api/feed?f=social serves
// whichever copy has the later freshness stamp. The committed metrics.json remains
// the fallback when the blob is missing, older, or will not decrypt.
// Cleartext is never written to disk or git. This module does not pull Windsor or Postiz.
const fs = require('node:fs');
const path = require('node:path');
const live = require('./live-status');

const SOCIAL_FILE = path.join(__dirname, '../c85352c42452f0db1e1c5e56f60e5128/social/metrics.json');
const LIVE_PATH = 'mw4/social-live.json';
const ISO_STAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

let fileCache = { sig: '', env: null, plain: null, stamp: '' };
let plainCache = { sig: '', buf: null };

function socialStamp(model) {
  if (!model || typeof model !== 'object') return '';
  const gen = String(model.generatedAt || '').trim();
  const day = String(model.asOfDay || '').trim().slice(0, 10);
  if (ISO_STAMP.test(gen)) {
    const ms = Date.parse(gen);
    if (Number.isFinite(ms)) return new Date(ms).toISOString();
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(day)) return gen ? day + '\t' + gen : day;
  return gen;
}

function readCommitted(readFile) {
  if (readFile) return readFile();
  return JSON.parse(fs.readFileSync(SOCIAL_FILE, 'utf8'));
}

async function loadFile(pass, readFile) {
  const env = readCommitted(readFile);
  const sig = String(env.ct || '').slice(-32);
  if (fileCache.sig === sig && fileCache.plain) return fileCache;
  const plain = await live.decryptEnv(env, pass);
  let stamp = '';
  try { stamp = socialStamp(JSON.parse(plain.toString('utf8'))); } catch { /* ignore */ }
  fileCache = { sig, env, plain, stamp };
  return fileCache;
}

function blobStore() {
  return live.blobStoreFor(LIVE_PATH);
}

function modelHasRows(model) {
  const posts = Array.isArray(model.posts) ? model.posts.length : 0;
  const series = model.series && typeof model.series === 'object' ? Object.keys(model.series).length : 0;
  const channels = Array.isArray(model.channels) ? model.channels.length : 0;
  return posts + series + channels > 0;
}

function laterStamp(a, b) {
  if (a && b) return a > b ? a : b;
  return a || b || '';
}

async function pickSocialEnvelope(options = {}) {
  const pass = live.feedPass(options.pass);
  const file = await loadFile(pass, options.readFileEnv);
  const rec = await live.readLiveRecord(options.store || blobStore());
  const blobStamp = rec && rec.meta && rec.meta.updatedAt || '';
  const newer = blobStamp && blobStamp > file.stamp;
  if (!newer) return file.env;
  const sig = String(rec.env.ct || '').slice(-48);
  if (plainCache.sig === sig && plainCache.buf) return rec.env;
  try {
    const buf = await live.decryptEnv(rec.env, pass);
    plainCache = { sig, buf };
    return rec.env;
  } catch {
    return file.env;
  }
}

async function readSocialPlain(options = {}) {
  const pass = live.feedPass(options.pass);
  const env = await pickSocialEnvelope(options);
  const sig = String(env && env.ct || '').slice(-48);
  if (plainCache.sig === sig && plainCache.buf) return plainCache.buf;
  const file = await loadFile(pass, options.readFileEnv);
  if (file.plain && String(file.env.ct || '').slice(-48) === sig) return file.plain;
  const buf = await live.decryptEnv(env, pass);
  plainCache = { sig, buf };
  return buf;
}

async function publishSocialModel(model, options = {}) {
  const pass = live.feedPass(options.pass);
  if (!pass) {
    const err = new Error('feed key not configured');
    err.code = 'NO_PASS';
    throw err;
  }
  if (!model || typeof model !== 'object' || !modelHasRows(model)) {
    const err = new Error('social drop has no channels, posts, or series');
    err.code = 'EMPTY';
    throw err;
  }
  const stamp = socialStamp(model);
  if (!stamp) {
    const err = new Error('social drop has no generatedAt or asOfDay');
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
  const existing = await live.readLiveRecord(store);
  const current = laterStamp(file.stamp, existing && existing.meta && existing.meta.updatedAt || '');
  if (!(stamp > current)) return { ok: true, skipped: 'not-newer', updatedAt: current, asOfDay: model.asOfDay || '' };
  const env = await live.encryptStatus(model, pass, file.env.salt, file.env.iter);
  const record = {
    meta: {
      updatedAt: stamp,
      generatedAt: model.generatedAt || '',
      asOfDay: model.asOfDay || '',
      fetchedAt: new Date(options.now || Date.now()).toISOString(),
    },
    env,
  };
  await store.write(JSON.stringify(record));
  plainCache = { sig: String(env.ct).slice(-48), buf: Buffer.from(JSON.stringify(model)) };
  return { ok: true, skipped: '', updatedAt: stamp, asOfDay: model.asOfDay || '' };
}

function resetCaches() {
  fileCache = { sig: '', env: null, plain: null, stamp: '' };
  plainCache = { sig: '', buf: null };
}

module.exports = {
  LIVE_PATH,
  SOCIAL_FILE,
  socialStamp,
  pickSocialEnvelope,
  readSocialPlain,
  publishSocialModel,
  resetCaches,
};
