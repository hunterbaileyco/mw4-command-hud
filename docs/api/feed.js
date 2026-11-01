// GET /api/feed?f=status|social — serves the dashboard feeds to the HUD, Social and Hub pages on Vercel.
// The repo (and therefore GitHub Pages) only ever holds the AES-256-GCM envelopes; this function decrypts them
// server-side with the MW4_FEED_PASS project env var. The whole Vercel deployment is behind Vercel Authentication,
// so after Vercel sign-in there's no second code, and nothing readable is ever committed or served by Pages.
const fs = require('node:fs');
const path = require('node:path');
const { webcrypto: wc } = require('node:crypto');

// literal paths so Vercel's file tracing bundles both feeds with the function
const FILES = {
  status: path.join(__dirname, '../c85352c42452f0db1e1c5e56f60e5128/status.json'),
  social: path.join(__dirname, '../c85352c42452f0db1e1c5e56f60e5128/social/metrics.json'),
  // ledger is not an encrypted envelope yet. The LEDGER page asks for f=ledger and,
  // on 404, renders docs/.../ledger/model.js SAMPLE. Add a ciphertext file here when
  // Shopify / ads / Mercury are wired, and return source:"live" in that cleartext.
};
const keys = new Map(); // `${salt}|${iter}` -> CryptoKey; PBKDF2 is slow, derive once per warm instance

async function keyFor(env) {
  const id = env.salt + '|' + env.iter;
  if (!keys.has(id)) {
    const pass = String(process.env.MW4_FEED_PASS || '').replace(/[\r\n]+$/, '');
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
    const pt = await wc.subtle.decrypt({ name: 'AES-GCM', iv: Buffer.from(env.iv, 'base64') }, await keyFor(env), Buffer.from(env.ct, 'base64'));
    res.statusCode = 200;
    return res.end(Buffer.from(pt));
  } catch (err) {
    res.statusCode = 500;
    return res.end(JSON.stringify({ error: String((err && err.message) || err).slice(0, 80) }));
  }
}
module.exports = handler;
