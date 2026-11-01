// GET /api/feed?f=status|social|ledger — serves the dashboard feeds to the HUD, Social, Hub, and LEDGER pages on Vercel.
// The repo (and therefore GitHub Pages) only ever holds the AES-256-GCM envelopes; this function decrypts them
// server-side with the MW4_FEED_PASS project env var (MW4_LEDGER_PASS for f=ledger when set).
// The whole Vercel deployment is behind Vercel Authentication,
// so after Vercel sign-in there's no second code, and nothing readable is ever committed or served by Pages.
const fs = require('node:fs');
const path = require('node:path');
const { webcrypto: wc } = require('node:crypto');

// literal paths so Vercel's file tracing bundles the feeds with the function
const FILES = {
  status: path.join(__dirname, '../c85352c42452f0db1e1c5e56f60e5128/status.json'),
  social: path.join(__dirname, '../c85352c42452f0db1e1c5e56f60e5128/social/metrics.json'),
  ledger: path.join(__dirname, '../c85352c42452f0db1e1c5e56f60e5128/ledger/feed.json'),
};
const keys = new Map(); // `${feed}|${salt}|${iter}` -> CryptoKey; PBKDF2 is slow, derive once per warm instance

function feedPass(which) {
  const ledger = String(process.env.MW4_LEDGER_PASS || '').replace(/[\r\n]+$/, '');
  const shared = String(process.env.MW4_FEED_PASS || '').replace(/[\r\n]+$/, '');
  if (which === 'ledger' && ledger) return ledger;
  return shared;
}

async function keyFor(env, which) {
  const id = which + '|' + env.salt + '|' + env.iter;
  if (!keys.has(id)) {
    const pass = feedPass(which);
    if (!pass) throw new Error('feed key not configured');
    const km = await wc.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
    keys.set(id, await wc.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: Buffer.from(env.salt, 'base64'), iterations: env.iter },
      km, { name: 'AES-GCM', length: 256 }, false, ['decrypt']));
  }
  return keys.get(id);
}

async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const f = new URL(req.url, 'http://x').searchParams.get('f') || 'status';
  const file = FILES[f];
  if (!file) { res.statusCode = 404; return res.end('{"error":"unknown feed"}'); }
  try {
    const env = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!env || !env.ct) throw new Error('feed is not an encrypted envelope');
    const pt = await wc.subtle.decrypt({ name: 'AES-GCM', iv: Buffer.from(env.iv, 'base64') }, await keyFor(env, f), Buffer.from(env.ct, 'base64'));
    res.statusCode = 200;
    return res.end(Buffer.from(pt));
  } catch (err) {
    res.statusCode = 500;
    return res.end(JSON.stringify({ error: String((err && err.message) || err).slice(0, 80) }));
  }
}
module.exports = handler;
