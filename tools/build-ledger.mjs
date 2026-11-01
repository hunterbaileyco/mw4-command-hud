#!/usr/bin/env node
// Encrypt a LEDGER pull. The cleartext file is box-only (gitignored); the
// committed artifact is an AES-256-GCM envelope, same pass and salt as status.json.
//   node tools/build-ledger.mjs --in /tmp/ledger-in.json --pass-file .pass \
//     --out docs/c85352c42452f0db1e1c5e56f60e5128/ledger/feed.json
import fs from 'node:fs';
import path from 'node:path';
import { webcrypto as wc } from 'node:crypto';
import { buildLedger } from './ledger-live.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) =>
  v.startsWith('--') ? [...a, [v.slice(2), arr[i + 1]]] : a, []));
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const input = JSON.parse(fs.readFileSync(args.in, 'utf8'));
const model = buildLedger(input);
if (model.source !== 'live' || !model.windows || !model.windows.mtd || !model.mercury) {
  throw new Error('ledger pull did not produce a live contract');
}
const pass = fs.readFileSync(args['pass-file'], 'utf8').replace(/[\r\n]+$/, '');
const statusPath = args['status-envelope'] || path.join(root, 'docs/c85352c42452f0db1e1c5e56f60e5128/status.json');
const status = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
const kdf = { salt: status.salt, iter: status.iter };
const te = new TextEncoder();
const km = await wc.subtle.importKey('raw', te.encode(pass), 'PBKDF2', false, ['deriveKey']);
const key = await wc.subtle.deriveKey(
  { name: 'PBKDF2', hash: 'SHA-256', salt: Buffer.from(kdf.salt, 'base64'), iterations: kdf.iter },
  km, { name: 'AES-GCM', length: 256 }, false, ['encrypt']
);
const iv = wc.getRandomValues(new Uint8Array(12));
const ct = new Uint8Array(await wc.subtle.encrypt({ name: 'AES-GCM', iv }, key, te.encode(JSON.stringify(model))));
const env = {
  v: 1, alg: 'AES-GCM', kdf: 'PBKDF2-SHA256', iter: kdf.iter, salt: kdf.salt,
  iv: Buffer.from(iv).toString('base64'), ct: Buffer.from(ct).toString('base64')
};
const out = args.out || path.join(root, 'docs/c85352c42452f0db1e1c5e56f60e5128/ledger/feed.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(env) + '\n');
const wins = Object.keys(model.windows).join(',');
console.error(`ledger: source=live windows=${wins} lanes=${model.lanes.length} log=${model.log.length} | ${out} encrypted ${ct.length}B`);
