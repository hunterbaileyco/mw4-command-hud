import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const R = require('../docs/c85352c42452f0db1e1c5e56f60e5128/roster.js');

const by = Object.fromEntries(R.FILES.map((f) => [f.id, f]));
const ids = (ends) => ends.map((e) => e.id).filter(Boolean);
const labels = (ends) => ends.map((e) => e.label).filter(Boolean);

assert.equal(R.FILES.length, 12, 'twelve operator files');
for (const name of ['Price', 'Ghost', 'Cho', 'West', 'Ko', 'Park', 'Jae', 'Dunn', 'Soap', 'Gaz', 'Kal', 'Ju Kwon']) {
  assert.ok(R.FILES.some((f) => f.name === name), name);
}

assert.deepEqual(ids(by.cho.from).sort(), ['jae', 'ju', 'park', 'west']);
assert.ok(labels(by.cho.to).includes('SHIP') && labels(by.cho.to).includes('SEND BACK'));
assert.equal(ids(by.cho.to).length, 0, 'Cho does not assign people');
for (const id of ['west', 'jae', 'park', 'ju']) {
  assert.ok(ids(by[id].to).includes('cho'), id + ' flows to the Cho gate');
  assert.ok(ids(by[id].from).includes('price'), id + ' is dispatched by Price');
  assert.ok(!ids(by[id].from).includes('cho'), id + ' is not managed by Cho');
}
assert.deepEqual(ids(by.kal.to), ['price']);
assert.equal(ids(by.kal.to).length, 1);
assert.ok(labels(by.price.to).includes('ALL 9 LANES'));
assert.equal(ids(by.price.to).length, 0, 'Price file does not draw a management tree');
assert.ok(ids(by.price.from).includes('kal'));
assert.ok(!ids(by.ghost.from).includes('price') && !ids(by.ghost.to).includes('price'));
assert.equal(by.kal.role.startsWith('Intake'), true);
assert.equal(by.ghost.map, 'Trading');
assert.equal(by.ju.map, 'Kinsora ops');
assert.equal(by.dunn.map, 'Personal');
assert.equal(/ops/i.test(by.dunn.role + by.dunn.unit + by.dunn.stamp + by.dunn.map), false);
assert.ok(by.dunn.off && !R.OPS.includes('Dunn'));
assert.ok(!by.ju.off && R.OPS.includes('Ju Kwon'));
assert.match(by.cho.not, /manage, assign or re-prioritise/);
assert.doesNotMatch(by.cho.not, /assign work to/);

const text = R.missionText({ name: 'West — BFCM email/SMS — 3-touch early-access sequence + onsite popup copy', short: 'BFCM email/SMS', lane: 'West' });
assert.ok(!text.endsWith('…'), 'mission text is not the short clamp');
assert.ok(text.length > 28);
assert.equal(R.missionText({ name: 'Ghost: AM intake (standing)', short: 'AM intake (standing)' }).includes('(standing)'), false);

function box(l, t, w, h) { return { l, t, r: l + w, b: t + h }; }
function layout(W) {
  const nw = Math.min(124, Math.floor((W - 70) / 2));
  const left = 22;
  const right = W - 22 - nw;
  return {
    hunter: box(right, 8, nw, 88),
    kal: box(left, 118, nw, 104),
    price: box(right, 112, nw, 112),
    cho: box((W - nw) / 2, 292, nw, 96),
    west: box(left, 430, nw - 8, 96),
    jae: box(right + 8, 430, nw - 8, 96),
    park: box(left, 560, nw - 8, 96),
    ju: box(right + 8, 560, nw - 8, 96),
    ko: box(left + 6, 710, nw - 10, 92),
    gaz: box(right - 20, 710, Math.floor(nw * 0.62), 92),
    soap: box(right + Math.floor(nw * 0.48), 710, Math.floor(nw * 0.5), 92),
    ghost: box(left, 860, nw, 88),
    dunn: box(right, 860, nw, 88),
  };
}
for (const width of [390, 430]) {
  const sample = layout(width);
  const segs = R.routeOrbat(sample, width);
  const cross = R.crossings(segs);
  const hits = R.interiorHits(segs, sample);
  assert.deepEqual(cross, [], 'crossings at ' + width + ': ' + cross.join(','));
  assert.deepEqual(hits, [], 'interior hits at ' + width + ': ' + hits.join(','));
  const wired = new Set(segs.flatMap((s) => s.cls === 'disp' ? ['disp'] : [s.cls]));
  assert.ok(wired.has('disp') && segs.some((s) => s.cls === 'intake') && segs.some((s) => s.cls === 'review'));
  const blob = JSON.stringify(segs);
  assert.equal(blob.includes('kal') , false);
}

const hudCss = readFileSync(new URL('../docs/c85352c42452f0db1e1c5e56f60e5128/theater.css', import.meta.url), 'utf8');
const filesHtml = readFileSync(new URL('../docs/c85352c42452f0db1e1c5e56f60e5128/files/index.html', import.meta.url), 'utf8');
assert.match(hudCss, /--lap:18px/, 'theater plates overlap the box by the ORBAT lap');
assert.match(hudCss, /margin-bottom:calc\(var\(--lap\) \* -1\)/, 'avatar sits on the plate, not above it');
assert.match(hudCss, /\.tok\.s-hold \.pl\{[\s\S]*?repeating-linear-gradient\(-45deg,var\(--amber\)/, 'HOLD plates keep the Cho hazard stripe');
assert.match(hudCss, /\.rt \.face img\{[^}]*object-position:center top;transform:scale\(1\.35\);transform-origin:center top\}/, 'FILES callsign crop stays top-anchored');
assert.match(filesHtml, /class="face"/, 'FILES rail still wraps the callsign photo');
assert.doesNotMatch(hudCss, /margin-bottom:4px/, 'Doing ring is not lifted clear of the plate');

console.log('hud elevate checks ok');
