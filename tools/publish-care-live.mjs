#!/usr/bin/env node
// Publish a care@ clear drop to the private care blob (mw4/care-live.json).
// The 4h box routine (squad cron 0 */4 * * * PT) runs this after it writes the drop.
// Price owns that routine; it is not in this repo. Ko builds the first clear JSON.
//   node tools/publish-care-live.mjs --in /workspace/mw4-hud/cache/care/care-in.clear.json --pass-file .pass
// MW4_CARE_DROP overrides the default drop path. MW4_FEED_PASS is used when --pass-file is omitted.
// BLOB_READ_WRITE_TOKEN writes the blob. If the drop path is missing, exit 0 and write nothing.
// The committed fallback is tools/build-care.mjs (optional; not this script).
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { dropPathFrom, normalizeCareModel, parseArgs } from './care-model.mjs';

const require = createRequire(import.meta.url);
const live = require('../docs/api/live-care.js');

const args = parseArgs(process.argv.slice(2));
const drop = dropPathFrom(args);
if (!drop || !fs.existsSync(drop)) process.exit(0);

try {
  let pass;
  if (Object.prototype.hasOwnProperty.call(args, 'pass-file')) {
    pass = fs.readFileSync(args['pass-file'], 'utf8').replace(/[\r\n]+$/, '');
  }
  const model = normalizeCareModel(JSON.parse(fs.readFileSync(drop, 'utf8')));
  const result = await live.publishCareModel(model, { pass });
  if (!result.skipped) console.error(`care-live: asOf ${result.asOf || '—'} ${result.updatedAt}`);
} catch (err) {
  console.error('care-live: ' + String((err && err.message) || err).slice(0, 120));
  process.exit(1);
}
