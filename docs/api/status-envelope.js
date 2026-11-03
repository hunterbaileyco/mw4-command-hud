// GET /api/status-envelope — the encrypted status.json the widgets already decrypt.
// Prefers a webhook-built blob envelope when its updatedAt is newer than the committed file.
// Ciphertext only. The salt stays the one shipped in git so cached phone keys still open it.
const live = require('./live-status');

async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-MW4-Feed', 'envelope');
  if (req.method === 'HEAD') { res.statusCode = 200; return res.end(); }
  if (req.method !== 'GET') { res.statusCode = 405; return res.end('{"error":"method"}'); }
  try {
    const env = await live.pickStatusEnvelope();
    res.statusCode = 200;
    return res.end(JSON.stringify(env));
  } catch {
    res.statusCode = 500;
    return res.end('{"error":"feed"}');
  }
}

module.exports = handler;
