// X-Trello-Webhook is base64(HMAC-SHA1(secret, rawBody ‖ callbackURL)).
// callbackURL is the exact string registered with Trello, including the query.
const crypto = require('node:crypto');

function signTrello(secret, rawBody, callbackURL) {
  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody), 'utf8');
  return crypto.createHmac('sha1', String(secret)).update(Buffer.concat([body, Buffer.from(String(callbackURL), 'utf8')])).digest('base64');
}

function signaturesMatch(expected, header) {
  if (!expected || !header || typeof header !== 'string') return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(header.trim());
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

const HOST = 'https://mw4-command-hud.vercel.app';

function callbackFor(board) {
  const name = board === 'command' ? 'TRELLO_CALLBACK_URL_COMMAND'
    : board === 'trading' ? 'TRELLO_CALLBACK_URL_TRADING' : '';
  if (!name) return '';
  const explicit = String(process.env[name] || '').replace(/[\r\n]+$/, '').trim();
  if (explicit) return explicit;
  const bypass = String(process.env.VERCEL_AUTOMATION_BYPASS_SECRET || process.env.MW4_PROTECTION_BYPASS || '').replace(/[\r\n]+$/, '').trim();
  if (!bypass) return '';
  return `${HOST}/api/trello-webhook?board=${board}&x-vercel-protection-bypass=${bypass}`;
}

module.exports = { signTrello, signaturesMatch, callbackFor, HOST };
