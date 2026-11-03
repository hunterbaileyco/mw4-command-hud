import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const R = require('../docs/c85352c42452f0db1e1c5e56f60e5128/roster.js');

const by = Object.fromEntries(R.FILES.map((f) => [f.id, f]));
const ids = (ends) => ends.map((e) => e.id).filter(Boolean);
const labels = (ends) => ends.map((e) => e.label).filter(Boolean);

assert.equal(R.FILES.length, 13, 'thirteen operator files');
for (const name of ['Price', 'Ghost', 'Cho', 'West', 'Ko', 'Park', 'Jae', 'Dunn', 'Soap', 'Gaz', 'Kal', 'Ju Kwon', 'Laswell']) {
  assert.ok(R.FILES.some((f) => f.name === name), name);
}

assert.deepEqual(ids(by.cho.from).sort(), ['gaz', 'jae', 'ju', 'park', 'west']);
assert.ok(labels(by.cho.to).includes('SHIP') && labels(by.cho.to).includes('SEND BACK'));
assert.equal(ids(by.cho.to).length, 0, 'Cho does not assign people');
for (const id of ['west', 'jae', 'park', 'ju', 'gaz']) {
  assert.ok(ids(by[id].to).includes('cho'), id + ' flows to the Cho gate');
  assert.ok(ids(by[id].from).includes('price'), id + ' is dispatched by Price');
  assert.ok(!ids(by[id].from).includes('cho'), id + ' is not managed by Cho');
}
assert.deepEqual(ids(by.kal.to), ['price']);
assert.equal(ids(by.kal.to).length, 1);
assert.ok(labels(by.price.to).includes('8 LANES + CHO'));
assert.equal(ids(by.price.to).length, 0, 'Price file does not draw a management tree');
assert.ok(ids(by.price.from).includes('kal'));
assert.ok(!ids(by.ghost.from).includes('price') && !ids(by.ghost.to).includes('price'));
assert.equal(by.kal.role.startsWith('Intake'), true);
assert.equal(by.kal.board, 'CMD');
assert.equal(by.ghost.board, 'KAL', 'trading feed key stays KAL');
assert.equal(by.ghost.stamp, 'TRADING');
assert.equal(R.boardTag('KAL'), 'TRADING');
assert.equal(R.boardTag('CMD'), 'CMD');
assert.ok(labels(by.ghost.to).includes('TRADING BOARD'));
assert.equal(labels(by.ghost.to).includes('KAL BOARD'), false);
assert.equal(by.ghost.map, 'Trading');
assert.equal(by.ju.map, 'Kinsora ops · back-office');
assert.equal(by.ju.face, 'ju-kwon');
assert.equal(R.faceFile('Ju Kwon'), 'ju-kwon');
assert.equal(R.faceFile('Laswell'), 'laswell');
assert.equal(by.laswell.des, '141-11');
assert.equal(by.laswell.stamp, 'CARE');
assert.ok(ids(by.laswell.from).includes('price'));
assert.ok(!ids(by.laswell.to).includes('cho') && !ids(by.laswell.from).includes('cho'));
assert.ok(!by.laswell.off && R.OPS.includes('Laswell'));
assert.match(by.laswell.role + by.laswell.does.join(' '), /care@/);
assert.doesNotMatch(by.laswell.role + by.laswell.does.join(' '), /intercom/i);
assert.match(by.laswell.not, /Intercom/);
assert.doesNotMatch(by.ju.role + by.ju.does.join(' '), /intercom/i);
assert.match(by.ju.not, /Intercom/);
assert.ok(ids(by.gaz.to).includes('soap'));
assert.equal(by.dunn.map, 'Personal');
assert.equal(/ops/i.test(by.dunn.role + by.dunn.unit + by.dunn.stamp + by.dunn.map), false);
assert.ok(by.dunn.off && !R.OPS.includes('Dunn'));
assert.ok(!by.ju.off && R.OPS.includes('Ju Kwon'));
assert.match(by.cho.not, /manage, assign or re-prioritise/);
assert.doesNotMatch(by.cho.not, /assign work to/);

const OUTBOX = {
  cho: { gate: 'gate', line: 'Cho gate → Hunter approve', then: 'Passes go out on the lane’s live channel · misses go back to the lane with notes', actions: ['ship', 'back'] },
  west: { gate: 'gated', line: 'Cho gate → Hunter approve', then: 'then live: email / SMS sends' },
  jae: { gate: 'gated', line: 'Cho gate → Hunter approve', then: 'then live: posted to social' },
  park: { gate: 'gated', line: 'Cho gate → Hunter approve', then: 'then live: published (News / blog)' },
  gaz: { gate: 'gated', line: 'Cho gate → Hunter approve', then: 'then live: Soap buys it' },
  ju: { gate: 'gated', line: 'Cho gate → Hunter approve', then: 'then: resolved (back-office)' },
  ko: { gate: 'none', line: 'Live site (no Cho gate)', then: 'Mobile QA + speed check before it goes live' },
  soap: { gate: 'none', line: 'Live ad sets · Hunter yes on spend', then: 'Buys only creative that already cleared Cho (from Gaz)' },
  laswell: { gate: 'none', line: 'Reply to customer (care@) · no Cho gate', then: 'Wholesale + site fixes go to Price, not out' },
  price: { gate: 'cmd', line: 'Dispatch to lanes (sole dispatcher)', then: '8 lanes + Cho · nobody else assigns work' },
  kal: { gate: 'cmd', line: 'Price (intake only)', then: 'Never assigns · never does the work' },
  ghost: { gate: 'off', line: 'Trading board (own signals · no Price wire)', then: 'Paper size until the risk check clears' },
  dunn: { gate: 'off', line: 'Hunter only (personal · off theater)', then: 'Kept off Kinsora boards' },
};
assert.deepEqual(Object.keys(OUTBOX).sort(), R.FILES.map((f) => f.id).sort(), 'every file has an outbox spec');
for (const f of R.FILES) {
  const spec = OUTBOX[f.id];
  assert.equal(f.outbox.line, spec.line, f.id + ' outbox line');
  assert.equal(f.outbox.then, spec.then, f.id + ' outbox then');
  assert.equal(f.outbox.gate, spec.gate, f.id + ' outbox gate');
  assert.deepEqual(f.outbox.actions || [], spec.actions || [], f.id + ' outbox actions');
}
assert.deepEqual(R.FILES.filter((f) => f.outbox.actions).map((f) => f.id), ['cho'], 'SHIP / SEND BACK are Cho only');

const text = R.missionText({ name: 'West — BFCM email/SMS — 3-touch early-access sequence + onsite popup copy', short: 'BFCM email/SMS', lane: 'West' });
assert.ok(!text.endsWith('…'), 'mission text is not the short clamp');
assert.ok(text.length > 28);
assert.equal(R.missionText({ name: 'Ghost: AM intake (standing)', short: 'AM intake (standing)' }).includes('(standing)'), false);

function box(l, t, w, h) { return { l, t, r: l + w, b: t + h }; }
function layoutMobile(W) {
  const laneL = 48;
  const laneW = W - 78;
  const row = (y) => box(laneL, y, laneW, 58);
  return {
    hunter: box(W - 180, 10, 140, 86),
    kal: box(16, 118, 120, 96),
    price: box(W - 190, 112, 160, 108),
    west: row(270),
    jae: row(344),
    park: row(418),
    gaz: row(492),
    ju: row(566),
    cho: box(laneL, 650, laneW, 70),
    ko: row(760),
    soap: row(834),
    laswell: row(908),
    ghost: box(16, 1040, (W - 48) / 2, 64),
    dunn: box(W / 2, 1040, (W - 48) / 2, 64),
  };
}
function layoutDesktop(W) {
  const card = (x, y) => box(x, y, 96, 110);
  const y = 300;
  return {
    hunter: box(W / 2 - 70, 8, 140, 90),
    kal: box(80, 120, 120, 100),
    price: box(W / 2 - 80, 116, 170, 112),
    west: card(40, y),
    jae: card(148, y),
    park: card(256, y),
    gaz: card(364, y),
    ju: card(472, y),
    cho: box(36, 440, 540, 64),
    ko: card(640, y),
    soap: card(748, y),
    laswell: card(856, y),
    ghost: box(40, 560, 140, 80),
    dunn: box(200, 560, 140, 80),
  };
}
function nearPlate(segs, n) {
  const hits = [];
  for (const s of segs) {
    for (let i = 1; i < s.pts.length; i++) {
      for (const p of [s.pts[i - 1], s.pts[i]]) {
        if (p[0] > n.l + 1 && p[0] < n.r - 1 && p[1] > n.t + 1 && p[1] < n.b - 1) hits.push(s.cls);
      }
    }
  }
  return hits;
}
for (const width of [390, 430, 1180]) {
  const sample = width >= 900 ? layoutDesktop(width) : layoutMobile(width);
  const segs = R.routeOrbat(sample, width);
  const cross = R.crossings(segs);
  const hits = R.interiorHits(segs, sample);
  assert.deepEqual(cross, [], 'crossings at ' + width + ': ' + cross.join(','));
  assert.deepEqual(hits, [], 'interior hits at ' + width + ': ' + hits.join(','));
  assert.deepEqual(nearPlate(segs, sample.ghost), [], 'ghost wired at ' + width);
  assert.deepEqual(nearPlate(segs, sample.dunn), [], 'dunn wired at ' + width);
  const wired = new Set(segs.flatMap((s) => s.cls === 'disp' ? ['disp'] : [s.cls]));
  assert.ok(wired.has('disp') && segs.some((s) => s.cls === 'intake') && segs.some((s) => s.cls === 'review'));
  const blob = JSON.stringify(segs);
  assert.equal(blob.includes('kal'), false);
  const tapped = (n) => segs.some((s) => s.cls === 'disp' && s.pts.some((p) => {
    const midY = (n.t + n.b) / 2;
    const cx = (n.l + n.r) / 2;
    return (Math.abs(p[0] - (n.l - 1)) < 2 && Math.abs(p[1] - midY) < 2)
      || (Math.abs(p[1] - (n.t - 1)) < 2 && Math.abs(p[0] - cx) < 2);
  }));
  assert.ok(tapped(sample.laswell), 'laswell gets a Price wire at ' + width);
  assert.ok(tapped(sample.cho), 'cho gets a Price wire at ' + width);
  assert.ok(!tapped(sample.ghost) && !tapped(sample.dunn), 'outside the wire at ' + width);
}
const desk = layoutDesktop(1180);
const narrow = R.routeOrbat(desk, 828);
assert.deepEqual(R.crossings(narrow), [], 'desktop row on a narrow map: ' + R.crossings(narrow).join(','));
assert.deepEqual(R.interiorHits(narrow, desk), [], 'desktop row interior: ' + R.interiorHits(narrow, desk).join(','));
const phone = layoutMobile(430);
const widePhone = R.routeOrbat(phone, 1100);
assert.deepEqual(R.interiorHits(widePhone, phone), [], 'stacked lanes stay on the side rail');

const hudCss = readFileSync(new URL('../docs/c85352c42452f0db1e1c5e56f60e5128/theater.css', import.meta.url), 'utf8');
const filesHtml = readFileSync(new URL('../docs/c85352c42452f0db1e1c5e56f60e5128/files/index.html', import.meta.url), 'utf8');
assert.match(hudCss, /--lap:18px/, 'theater plates overlap the box by the ORBAT lap');
assert.match(hudCss, /margin-bottom:calc\(var\(--lap\) \* -1\)/, 'avatar sits on the plate, not above it');
assert.match(hudCss, /\.tok\.s-hold \.pl\{[\s\S]*?repeating-linear-gradient\(-45deg,var\(--amber\)/, 'HOLD plates keep the Cho hazard stripe');
assert.match(hudCss, /\.rt \.face img\{[^}]*object-position:center top;transform:scale\(1\.35\);transform-origin:center top\}/, 'FILES callsign crop stays top-anchored');
assert.match(filesHtml, /class="face"/, 'FILES rail still wraps the callsign photo');
assert.match(filesHtml, /<span>§4<\/span>Flow/, '§4 header stays Flow');
assert.match(filesHtml, /outboxBlock\(f\)/, 'FILES §4 renders the outbox');
assert.match(filesHtml, /f\.from\.map\(chip\)/, 'IN chips stay the live from list');
assert.match(filesHtml, /THIS IS THE CHO GATE/);
assert.match(filesHtml, /PASSES CHO GATE/);
assert.match(filesHtml, /NO CHO GATE/);
assert.match(filesHtml, /COMMAND CHAIN/);
assert.match(filesHtml, /OFF THE PRICE WIRE/);
assert.match(filesHtml, /✓ SHIP/);
assert.match(filesHtml, /SEND BACK/);
assert.match(filesHtml, /two calls on every piece/);
assert.doesNotMatch(filesHtml, /wirearrow/, 'FILES no longer draws the FROM wire');
assert.doesNotMatch(filesHtml, /class="self"/, 'FILES no longer draws the self ring');
assert.doesNotMatch(hudCss, /margin-bottom:4px/, 'Doing ring is not lifted clear of the plate');
assert.doesNotMatch(hudCss, /rotate\(/, 'stamps stay axis-aligned');
const orbatHtml = readFileSync(new URL('../docs/c85352c42452f0db1e1c5e56f60e5128/orbat/index.html', import.meta.url), 'utf8');
assert.match(orbatHtml, /data-pin="laswell"/);
assert.match(orbatHtml, /data-pin="gaz"/);
assert.match(orbatHtml, /NOT A MANAGER/);
assert.match(orbatHtml, /ju-kwon\.png/);
assert.doesNotMatch(orbatHtml, /rotate\(/);

const actionSrc = readFileSync(new URL('../docs/c85352c42452f0db1e1c5e56f60e5128/action-panel.js', import.meta.url), 'utf8');
const actionCtx = vm.createContext({ window: {} });
vm.runInContext(actionSrc, actionCtx);
const A = actionCtx.window.MW4Action;
assert.equal(A.designator('Ju Kwon'), 'EXT-01');
assert.equal(A.designator('Ghost'), '141-01');
assert.equal(A.designator('Kal'), '141-10');
assert.equal(A.designator('Price'), 'BRAVO-6');
assert.equal(A.designator('Laswell'), '141-11');
const juHtml = A.html({ op: 'Ju Kwon', cards: [{ name: 'Ju Kwon: Intercom refunds', short: 'Intercom refunds', lane: 'Ju Kwon', board: 'CMD', list: 'doing', url: 'https://trello.com/c/jurefund' }] });
assert.match(juHtml, /EXT-01/);
assert.match(juHtml, /JU KWON/);
assert.doesNotMatch(juHtml, /141-/);
const hubHtml = readFileSync(new URL('../docs/c85352c42452f0db1e1c5e56f60e5128/hub/index.html', import.meta.url), 'utf8');
assert.match(hubHtml, /Ju Kwon/);
assert.match(hubHtml, /ju-kwon/);
assert.match(hubHtml, /CARE DESK/);
assert.match(hubHtml, /Laswell/);
assert.match(hubHtml, /NOT LIVE/);
assert.doesNotMatch(hubHtml, /Intercom/);
assert.match(hubHtml, /TRADING BOARD/);
assert.doesNotMatch(hubHtml, /KAL BOARD/);
assert.doesNotMatch(hubHtml, /'Dunn'/);
const commonSrc = readFileSync(new URL('../scriptable/src/common.js', import.meta.url), 'utf8');
const waitingSrc = readFileSync(new URL('../scriptable/src/waiting.body.js', import.meta.url), 'utf8');
const glanceSrc = readFileSync(new URL('../scriptable/src/glance.body.js', import.meta.url), 'utf8');
assert.match(commonSrc, /return "Ghost"/);
assert.match(commonSrc, /"TRADING"/);
assert.doesNotMatch(commonSrc, /return "Kal"/);
assert.match(waitingSrc, /TRADING BOARD/);
assert.match(waitingSrc, /lane: c\.lane \|\| "Ghost"/);
assert.doesNotMatch(waitingSrc, /KAL BOARD/);
assert.match(glanceSrc, /\^ghost\$\/i/);
assert.doesNotMatch(glanceSrc, /\^kal\$\/i/);
assert.match(glanceSrc, /waiting on you/);
assert.match(glanceSrc, /kc\.waiting/);
assert.match(hubHtml, /<b>LIVE<\/b>/);
assert.match(hubHtml, /⚠ SNAPSHOT/);
assert.match(hubHtml, /TODO\(Price→Jae\)/);
const hudHtml = readFileSync(new URL('../docs/c85352c42452f0db1e1c5e56f60e5128/index.html', import.meta.url), 'utf8');
assert.match(hudHtml, /\^duo\$\/i\.test\(m\[1\]\)\) return 'Ko'/);
assert.doesNotMatch(hudHtml, /ob-box/, 'theater layout is not the FILES outbox');
assert.doesNotMatch(hudHtml, /class="ob"/, 'theater layout is not the FILES outbox');

console.log('hud elevate checks ok');
