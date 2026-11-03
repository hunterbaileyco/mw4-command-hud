#!/usr/bin/env node
// Encrypt a care@ clear drop into the committed Care envelope (AES-256-GCM).
// Salt and iter are copied from status.json so MW4_FEED_PASS opens it with the other feeds.
// The repo holds the envelope only. The 4h path that does not commit is publish-care-live.mjs.
//   node tools/build-care.mjs --in /workspace/mw4-hud/cache/care/care-in.clear.json --pass-file .pass \
//     --out docs/c85352c42452f0db1e1c5e56f60e5128/care/feed.json
// If the drop path is missing, exit 0 and write nothing. MW4_CARE_DROP overrides the default path.
// MW4_FEED_PASS is used when --pass-file is omitted.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { dropPathFrom, normalizeCareModel, parseArgs } from './care-model.mjs';

const require = createRequire(import.meta.url);
const statusLive = require('../docs/api/live-status.js');

const args = parseArgs(process.argv.slice(2));
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const drop = dropPathFrom(args);
if (!drop || !fs.existsSync(drop)) process.exit(0);

try {
  let pass;
  if (Object.prototype.hasOwnProperty.call(args, 'pass-file')) {
    pass = fs.readFileSync(args['pass-file'], 'utf8').replace(/[\r\n]+$/, '');
  } else {
    pass = statusLive.feedPass();
  }
  if (!pass) throw new Error('feed key not configured');
  const model = normalizeCareModel(JSON.parse(fs.readFileSync(drop, 'utf8')));
  if (model.source !== 'live') throw new Error('care drop is not a live care@kinsora.co model');
  const statusPath = args['status-envelope'] || path.join(root, 'docs/c85352c42452f0db1e1c5e56f60e5128/status.json');
  const status = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
  const env = await statusLive.encryptStatus(model, pass, status.salt, status.iter);
  const out = args.out || path.join(root, 'docs/c85352c42452f0db1e1c5e56f60e5128/care/feed.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(env) + '\n');
  const open = model.kpis.open == null ? '—' : String(model.kpis.open);
  console.error(`care: source=live open=${open} queue=${model.queue.length} | ${out} encrypted`);
} catch (err) {
  console.error('care: ' + String((err && err.message) || err).slice(0, 120));
  process.exit(1);
}
