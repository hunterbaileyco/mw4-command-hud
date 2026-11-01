// ===== Glance — theater HUD in a widget: chrome strip · AO plates · the wire · HOLD · AAR ticker =====
const EV = { deploy: ["▲ DEPLOY", "amber"], rtb: ["✓ RTB", "ship"], hold: ["■ HOLD", "holdink"], cleared: ["◆ CLEARED", "tan"] };

function brand(w, d, offline, small) {
  const r = w.addStack(); r.centerAlignContent(); r.spacing = 4;
  txt(r, small ? "MW4 // CMD" : "MW4 // COMMAND · TF141", F.h(small ? 10 : 10.5), col("tan"), 1);
  r.addSpacer();
  if (!d) return r;
  const stale = offline || Date.now() - new Date(d.updatedAt).getTime() > 30 * 60 * 1000;
  txt(r, "●", F.h(7), stale ? col("holdink") : col("ship"), 1);
  txt(r, (offline ? "OFFLINE · " : stale ? "STALE · " : small ? "" : hhmm(d.updatedAt) + " · ") + ago(d.updatedAt), F.sb(8.5), stale ? col("holdink") : col("dim"), 1);
  return r;
}
function cell(stack, label, n, color, size, note) {
  const c = stack.addStack(); c.centerAlignContent(); c.backgroundColor = col("panel", 0.92);
  c.borderColor = col("line"); c.borderWidth = 1; c.setPadding(3, 5, 3, 5);
  const lab = c.addStack(); lab.layoutVertically();
  txt(lab, label, F.sb(7.5), col("dim"), 1);
  if (note) txt(lab, note, F.sb(6), col("ship"), 1);
  c.addSpacer(); txt(c, String(n), F.h(size), col(color), 1);
  return c;
}
function chromeStrip(w, d, small) {
  const cc = (d.command && d.command.counts) || {}, kc = (d.kal && d.kal.counts) || {};
  const sum = (k) => (cc[k] ?? 0) + (kc[k] ?? 0); // HUD chrome counts both boards (Command + Kal)
  const split = doingSplit(d);
  const stn = !small && split.standing.length ? split.standing.length + " STN" : "";
  const cells = [["ACT", split.finite.length, "amber", stn], ["HOLD", sum("waiting"), "holdink", ""],
                 [small ? "Q" : "QUEUE", sum("backlog"), "tan", ""], [small ? "SHIP" : "SHIPPED", sum("doneToday"), "ship", ""]];
  if (!small) { const r = w.addStack(); r.spacing = 3; for (const [l, n, k, note] of cells) cell(r, l, n, k, 15, note); return; }
  for (const pair of [cells.slice(0, 2), cells.slice(2)]) {
    const r = w.addStack(); r.spacing = 3; for (const [l, n, k] of pair) cell(r, l, n, k, 13); w.addSpacer(3);
  }
}
function intel(w, g, small) {
  const r = w.addStack(); r.centerAlignContent(); r.spacing = 5;
  if (g.badge) chip(r, g.badge, col("bg"), col("amber"), small ? 8 : 8.5);
  if (!small) { txt(r, g.line1 || "", F.b(10), col("ink"), 1); r.addSpacer(); }
  else { r.addSpacer(); w.addSpacer(2); txt(w, g.line1 || "", F.b(9.5), col("ink"), 2); }
}
function latestEvent(d) { return (d.events || []).filter((e) => Date.now() - Date.parse(e.t) < 2 * 3600 * 1000).slice(-1)[0]; }
// AAR ticker (HUD bottom strip): latest deploy/RTB/HOLD/CLEARED within 2 h, else the "Next:" line.
function ticker(w, d, g, small) {
  const ev = latestEvent(d);
  const r = w.addStack(); r.centerAlignContent(); r.spacing = 5; r.backgroundColor = col("panel", 0.92);
  r.borderColor = col("line"); r.borderWidth = 1; r.setPadding(2, 0, 2, 6);
  const [tag, k] = ev ? (EV[ev.kind] || [String(ev.kind).toUpperCase(), "amber"]) : ["NEXT", "tan"];
  chip(r, small ? tag : ev ? "AAR" : "NEXT", col("bg"), col(small ? k : ev ? "olive" : "tan"), small ? 7 : 7.5);
  if (ev) {
    if (!small) { txt(r, tag, F.h(8), col(k), 1); txt(r, String(ev.op || "").toUpperCase(), F.h(8), col("tan"), 1); }
    txt(r, small ? (ev.op ? String(ev.op).toUpperCase() + " · " : "") + (ev.mission || "") : ev.mission || "", F.m(small ? 7.5 : 8.5), col("ink"), small ? 2 : 1);
    r.addSpacer(); if (!small) txt(r, ago(ev.t), F.sb(7.5), col("dim"), 1);
  } else {
    txt(r, String(g.line2 || "Hold steady").replace(/^Next:\s*/i, ""), F.m(small ? 7.5 : 8.5), col("ink"), 1); r.addSpacer();
  }
}
// Zone side-tag (AO / HOLD) like the HUD's left-edge zone labels.
function zoneTag(row, top, n, kind) {
  const z = row.addStack(); z.layoutVertically(); z.size = new Size(38, 0); z.setPadding(2, 2, 2, 2); z.centerAlignContent();
  if (kind === "hold") { try { z.backgroundImage = hazardImg(40, 40); } catch (e) { z.backgroundColor = col("hold"); } }
  else z.backgroundColor = col("olive", 0.85);
  const a = z.addStack(); a.addSpacer(); const ia = a.addStack(); if (kind === "hold") { ia.backgroundColor = col("bg", 0.85); ia.setPadding(0, 2, 0, 2); }
  txt(ia, top, F.h(7), kind === "hold" ? col("amber") : col("ink"), 1); a.addSpacer();
  const b = z.addStack(); b.addSpacer(); const ib = b.addStack(); if (kind === "hold") { ib.backgroundColor = col("bg", 0.85); ib.setPadding(0, 2, 0, 2); }
  txt(ib, String(n), F.h(12), kind === "hold" ? col("holdink") : col("ink"), 1); b.addSpacer();
  return z;
}
function plate(row, c, opts) {
  const p = row.addStack(); p.layoutVertically(); p.backgroundColor = col("panel", 0.95);
  p.borderColor = col(opts.border, 0.75); p.borderWidth = 1; p.setPadding(3, 5, 3, 5); p.spacing = 1;
  const top = p.addStack(); top.centerAlignContent(); top.spacing = 4;
  const bar = top.addStack(); bar.size = new Size(2, 16); bar.backgroundColor = col(opts.border);
  const op = opFromLane(c);
  mountFace(top, op, opts.face || 16, opts.action && op ? hudOpURL(op) : "");
  txt(top, LANE_TAG(c), F.h(7), col(opts.tag), 1); top.addSpacer();
  txt(p, c.short || c.name, F.m(opts.size || 8.5), col("ink"), 2);
  if (c.url) p.url = c.url;
  return p;
}
async function aoRow(w, d, max, vertical) {
  const { finite } = doingSplit(d);
  const r = w.addStack(); r.spacing = 3;
  zoneTag(r, "AO", finite.length, "ao");
  const box = r.addStack(); box.spacing = 3; if (vertical) box.layoutVertically();
  if (!finite.length) {
    const e = box.addStack(); e.backgroundColor = col("panel", 0.9); e.borderColor = col("line"); e.borderWidth = 1; e.setPadding(5, 6, 5, 6);
    txt(e, "NO FINITE MISSION · AO QUIET", F.sb(8), col("dim"), 1); e.addSpacer(); return;
  }
  const shown = finite.length > max ? finite.slice(0, max - 1) : finite;
  await preloadAvatars(shown);
  for (const c of shown) plate(box, c, { border: "amber", tag: /^ghost$/i.test(c.lane) ? "amber" : "tan", face: vertical ? 18 : 15, action: true });
  if (finite.length > max) { const m = box.addStack(); m.backgroundColor = col("panel", 0.9); m.borderColor = col("line"); m.borderWidth = 1; m.setPadding(4, 5, 4, 5); txt(m, "+" + (finite.length - shown.length), F.h(10), col("amber"), 1); }
}
async function standRow(w, standing, max, vertical) {
  if (!standing.length) return;
  const r = w.addStack(); r.spacing = 3;
  zoneTag(r, "STN", standing.length, "stand");
  const box = r.addStack(); box.spacing = 3; if (vertical) box.layoutVertically();
  const shown = standing.slice(0, max);
  await preloadAvatars(shown);
  for (const c of shown) plate(box, c, { border: "olive", tag: "olive", face: vertical ? 18 : 15, action: true });
  if (standing.length > shown.length) {
    const m = box.addStack(); m.backgroundColor = col("panel", 0.9); m.borderColor = col("olive", 0.7); m.borderWidth = 1; m.setPadding(4, 5, 4, 5);
    txt(m, "+" + (standing.length - shown.length), F.h(10), col("ship"), 1);
  }
}
async function holdRow(w, d, max, vertical) {
  const cc = (d.command && d.command.counts) || {}, kc = (d.kal && d.kal.counts) || {};
  const waiting = [...(((d.command || {}).lists || {}).waiting || []), ...((((d.kal || {}).lists || {}).waiting || []).map((c) => ({ ...c, lane: c.lane || "Ghost" })))];
  const n = (cc.waiting ?? 0) + (kc.waiting ?? 0);
  const r = w.addStack(); r.spacing = 3;
  zoneTag(r, "HOLD", n, "hold");
  const box = r.addStack(); box.spacing = 3; if (vertical) box.layoutVertically();
  if (!waiting.length) {
    const e = box.addStack(); e.backgroundColor = col("panel", 0.9); e.borderColor = col("line"); e.borderWidth = 1; e.setPadding(5, 6, 5, 6);
    txt(e, "NOTHING ON HUNTER · ALL CLEAR", F.sb(8), col("dim"), 1); e.addSpacer(); return;
  }
  const shown = waiting.slice(0, max);
  await preloadAvatars(shown);
  for (const c of shown) plate(box, c, { border: "holdink", tag: /^ghost$/i.test(c.lane) ? "amber" : "tan", face: vertical ? 18 : 15 });
  if (waiting.length > shown.length) {
    const m = box.addStack(); m.layoutVertically(); m.backgroundColor = col("hold", 0.35); m.borderColor = col("holdink", 0.6); m.borderWidth = 1; m.setPadding(2, 5, 2, 5);
    txt(m, "+" + (waiting.length - shown.length), F.h(9), col("holdink"), 1); txt(m, "WAITING ▸", F.sb(6.5), col("dim"), 1);
  }
}

async function build() {
  const { d, offline, need } = await loadFeed();
  const fam = config.widgetFamily || "medium";
  const small = fam === "small", large = fam === "large" || fam === "extraLarge";
  const w = newTheaterWidget(fam);
  w.setPadding(small ? 11 : 12, small ? 11 : 14, small ? 11 : 12, small ? 11 : 14);
  brand(w, d, offline, small);
  if (!d) { softFail(w, need || "NO SIGNAL", "Glance"); return w; }
  const g = d.glance || {};
  w.addSpacer(small ? 5 : 5);
  chromeStrip(w, d, small);
  if (small) {
    w.addSpacer(2); intel(w, g, true); w.addSpacer();
    wireBar(w, "", 7); w.addSpacer(4);
    ticker(w, d, g, true);
    return w;
  }
  w.addSpacer(5); intel(w, g, false);
  w.addSpacer(5); await aoRow(w, d, large ? 6 : 3, large);
  const stn = doingSplit(d).standing;
  if (stn.length) { w.addSpacer(4); await standRow(w, stn, large ? 4 : 2, large); }
  w.addSpacer(4); wireBar(w, "── CROSSING THE WIRE ──", 11, 7);
  w.addSpacer(4); await holdRow(w, d, large ? 6 : 2, large);
  w.addSpacer(); w.addSpacer(4);
  ticker(w, d, g, false);
  return w;
}

const widget = await build();
if (config.runsInWidget) Script.setWidget(widget);
else await widget.presentMedium();
Script.complete();
