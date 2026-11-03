#!/usr/bin/env node
// One-shot: HEAD the production callbacks, then create the two Trello webhooks
// if those exact callback URLs are not already registered.
// Reads TRELLO_KEY and TRELLO_TOKEN from the environment. Prints webhook ids and
// redacted callbacks only — never the key, token, secret, or bypass value.
//
//   node tools/register-trello-webhooks.mjs
//
// Callback strings: TRELLO_CALLBACK_URL_COMMAND / TRELLO_CALLBACK_URL_TRADING.
// If those are unset, the script builds the production URL from
// VERCEL_AUTOMATION_BYPASS_SECRET or MW4_PROTECTION_BYPASS, else the bypass
// query already shipped on the Scriptable status URL.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODELS = {
  command: '6ae64abb54c2ef96077bf42b',
  trading: '6ae66e1e3971cb59726d178f',
};

function redact(url) {
  return String(url).replace(/(x-vercel-protection-bypass=)[^&]+/g, '$1<redacted>');
}

function bypassFromRepo() {
  const src = fs.readFileSync(path.join(root, 'scriptable/src/common.js'), 'utf8');
  const match = /x-vercel-protection-bypass=([^"'&\s]+)/.exec(src);
  if (!match) throw new Error('bypass query missing from scriptable status URL');
  return match[1];
}

function callbackFor(board) {
  const envName = board === 'command' ? 'TRELLO_CALLBACK_URL_COMMAND' : 'TRELLO_CALLBACK_URL_TRADING';
  const explicit = String(process.env[envName] || '').trim();
  if (explicit) return explicit;
  const bypass = String(process.env.VERCEL_AUTOMATION_BYPASS_SECRET || process.env.MW4_PROTECTION_BYPASS || '').trim() || bypassFromRepo();
  return `https://mw4-command-hud.vercel.app/api/trello-webhook?board=${board}&x-vercel-protection-bypass=${bypass}`;
}

const key = String(process.env.TRELLO_KEY || '').trim();
const token = String(process.env.TRELLO_TOKEN || '').trim();
if (!key || !token) {
  console.error('TRELLO_KEY and TRELLO_TOKEN are required');
  process.exit(1);
}

const listed = await fetch(`https://api.trello.com/1/tokens/${encodeURIComponent(token)}/webhooks?key=${encodeURIComponent(key)}`);
if (!listed.ok) {
  console.error('list webhooks failed', listed.status);
  process.exit(1);
}
const hooks = await listed.json();
if (!Array.isArray(hooks)) {
  console.error('list webhooks returned an unexpected payload');
  process.exit(1);
}

for (const board of ['command', 'trading']) {
  const callbackURL = callbackFor(board);
  const head = await fetch(callbackURL, { method: 'HEAD' });
  console.log(`${board} HEAD ${head.status} ${redact(callbackURL)}`);
  if (head.status !== 200) {
    console.error(`${board} callback did not return 200; not creating a webhook`);
    process.exitCode = 1;
    continue;
  }
  const found = hooks.find((hook) => hook && hook.callbackURL === callbackURL);
  if (found) {
    console.log(`${board} existing ${found.id} model=${found.idModel}`);
    continue;
  }
  const created = await fetch(`https://api.trello.com/1/webhooks?key=${encodeURIComponent(key)}&token=${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      description: board === 'command' ? 'MW4 HUD command' : 'MW4 HUD trading',
      callbackURL,
      idModel: MODELS[board],
    }),
  });
  if (!created.ok) {
    console.error(`${board} create failed ${created.status}`);
    process.exitCode = 1;
    continue;
  }
  const body = await created.json();
  console.log(`${board} created ${body.id} model=${body.idModel}`);
}
