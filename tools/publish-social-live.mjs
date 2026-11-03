#!/usr/bin/env node
// Publish Jae's metrics drop to the private social blob (mw4/social-live.json).
// The 4h box routine (squad cron 0 */4 * * * PT) runs this. Ko owns that routine; it is not in this repo.
//   node tools/publish-social-live.mjs --metrics /workspace/kinsora-video/multi_channel_metrics_latest.json --pass-file .pass
// Optional --data matches build-social.mjs. MW4_SOCIAL_METRICS overrides the default drop path.
// MW4_FEED_PASS is used when --pass-file is omitted. BLOB_READ_WRITE_TOKEN writes the blob.
// If the drop path is missing, exit 0 and write nothing.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { buildSocialModel } from './social-model.mjs';

const require = createRequire(import.meta.url);
const live = require('../docs/api/live-social.js');

const DEFAULT_METRICS = '/workspace/kinsora-video/multi_channel_metrics_latest.json';
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) =>
  v.startsWith('--') ? [...a, [v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : '']] : a, []));

function metricsPath() {
  if (Object.prototype.hasOwnProperty.call(args, 'metrics')) return args.metrics;
  const fromEnv = String(process.env.MW4_SOCIAL_METRICS || '').trim();
  if (fromEnv) return fromEnv;
  return DEFAULT_METRICS;
}

const drop = metricsPath();
if (!drop || !fs.existsSync(drop)) process.exit(0);

try {
  let pass;
  if (Object.prototype.hasOwnProperty.call(args, 'pass-file')) {
    pass = fs.readFileSync(args['pass-file'], 'utf8').replace(/[\r\n]+$/, '');
  }
  const data = args.data && fs.existsSync(args.data) ? JSON.parse(fs.readFileSync(args.data, 'utf8')) : {};
  const model = buildSocialModel(JSON.parse(fs.readFileSync(drop, 'utf8')), data);
  const result = await live.publishSocialModel(model, { pass });
  if (!result.skipped) console.error(`social-live: asOf ${result.asOfDay || '—'} ${result.updatedAt}`);
} catch (err) {
  console.error('social-live: ' + String((err && err.message) || err).slice(0, 120));
  process.exit(1);
}
