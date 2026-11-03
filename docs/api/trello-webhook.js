// HEAD /api/trello-webhook — 200 so Trello can register the callback.
// POST — verify X-Trello-Webhook, then refetch both boards and store a new encrypted status.
// Query board=command|trading selects the callback URL and the idModel.
// GET — whether a live envelope is stored. No card names, no secrets.
const { signTrello, signaturesMatch, callbackFor } = require('./trello-sig');
const live = require('./live-status');

const BOARDS = new Set(['command', 'trading']);

function boardOf(url) {
  try { return new URL(url, 'http://x').searchParams.get('board') || ''; }
  catch { return ''; }
}

function headerSig(req) {
  if (req.headers && typeof req.headers.get === 'function') return req.headers.get('x-trello-webhook') || '';
  const value = req.headers && req.headers['x-trello-webhook'];
  if (Array.isArray(value)) return '';
  return value || '';
}

function readRaw(req) {
  if (req.rawBody != null) return Promise.resolve(Buffer.isBuffer(req.rawBody) ? req.rawBody : Buffer.from(req.rawBody));
  if (Buffer.isBuffer(req.body)) return Promise.resolve(req.body);
  if (typeof req.body === 'string') return Promise.resolve(Buffer.from(req.body));
  if (req.body && typeof req.body === 'object') {
    const err = new Error('parsed body');
    err.code = 'PARSED_BODY';
    return Promise.reject(err);
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 1_000_000) {
        reject(new Error('body'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(body == null ? '' : body);
}

const JSON_HEADERS = {
  'cache-control': 'private, no-store, max-age=0',
  'x-robots-tag': 'noindex, nofollow',
  'content-type': 'application/json; charset=utf-8',
};

function webResult(status, body) {
  return new Response(body == null ? null : body, { status, headers: JSON_HEADERS });
}

// Rest args keep function.length at 0 so the Vercel Node runtime passes a Web
// Request (raw body). Tests still call handler(req, res).
async function handler(...args) {
  if (args[1] && typeof args[1].end === 'function') return nodeHandler(args[0], args[1]);
  return webHandler(args[0]);
}

async function finishPost(board, raw, sig, reply) {
  const secret = String(process.env.TRELLO_SECRET || '').replace(/[\r\n]+$/, '');
  const callbackURL = callbackFor(board);
  const expected = secret && callbackURL ? signTrello(secret, raw, callbackURL) : '';
  if (!signaturesMatch(expected, sig)) return reply(401, '{"error":"unauthorized"}');

  let payload = {};
  try { payload = JSON.parse(raw.toString('utf8') || '{}'); } catch { payload = {}; }
  const modelId = payload.model && payload.model.id;
  if (modelId && modelId !== live.BOARDS[board].id) return reply(200, '{"ok":true,"skipped":"model"}');

  try {
    const result = await live.refreshLive({ actionId: (payload.action && payload.action.id) || '', board });
    return reply(200, JSON.stringify({ ok: true, skipped: result.skipped || '' }));
  } catch (err) {
    const code = err && err.code === 'NO_STORE' ? 'store' : 'refresh';
    return reply(500, JSON.stringify({ error: code }));
  }
}

async function webHandler(request) {
  const method = request.method || 'GET';
  const board = boardOf(request.url || '/');
  if (method === 'HEAD') return webResult(200, null);
  if (method === 'GET') {
    if (board && !BOARDS.has(board)) return webResult(400, '{"error":"board"}');
    const state = await live.publicState(board);
    return webResult(200, JSON.stringify(state));
  }
  if (method !== 'POST') return webResult(405, '{"error":"method"}');
  if (!BOARDS.has(board)) return webResult(400, '{"error":"board"}');
  const raw = Buffer.from(await request.arrayBuffer());
  const sig = request.headers.get('x-trello-webhook') || '';
  return finishPost(board, raw, sig, (status, body) => webResult(status, body));
}

async function nodeHandler(req, res) {
  const method = req.method || 'GET';
  const board = boardOf(req.url || '/');
  if (method === 'HEAD') return send(res, 200, '');
  if (method === 'GET') {
    if (board && !BOARDS.has(board)) return send(res, 400, '{"error":"board"}');
    const state = await live.publicState(board);
    return send(res, 200, JSON.stringify(state));
  }
  if (method !== 'POST') return send(res, 405, '{"error":"method"}');
  if (!BOARDS.has(board)) return send(res, 400, '{"error":"board"}');
  let raw;
  try { raw = await readRaw(req); }
  catch (err) {
    const names = Object.getOwnPropertyNames(req).slice(0, 40);
    return send(res, err && err.code === 'PARSED_BODY' ? 500 : 400, JSON.stringify({
      error: err && err.code === 'PARSED_BODY' ? 'raw body' : 'body',
      names,
      bodyType: req.body == null ? 'null' : (Buffer.isBuffer(req.body) ? 'buffer' : typeof req.body),
    }));
  }
  return finishPost(board, raw, headerSig(req), (status, body) => send(res, status, body));
}

handler.config = { api: { bodyParser: false } };
module.exports = handler;
module.exports.config = handler.config;
