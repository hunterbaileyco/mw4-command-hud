// ===== Waiting — the HOLD cage: hazard rail, HOLD plates (Command lanes coyote, Kal amber) =====
function cageRow(w, c, fam) {
  const kal = c.tag === "KAL";
  const r = w.addStack(); r.centerAlignContent(); r.spacing = 6;
  r.backgroundColor = col("panel", 0.94); r.borderColor = col(kal ? "amber" : "hold", kal ? 0.55 : 0.9); r.borderWidth = 1;
  r.setPadding(3, 6, 3, 6);
  mountFace(r, opFromLane(c), fam === "small" ? 16 : 22);
  const bar = r.addStack(); bar.size = new Size(3, 14); bar.backgroundColor = col(kal ? "amber" : "holdink");
  const tg = r.addStack(); tg.size = new Size(fam === "small" ? 34 : 46, 0);
  txt(tg, LANE_TAG(c).slice(0, 6), F.h(fam === "small" ? 7.5 : 8), col(kal ? "amber" : "tan"), 1); tg.addSpacer();
  txt(r, c.short || c.name, F.m(fam === "small" ? 8.5 : 9.5), col("ink"), 1);
  r.addSpacer();
  if (c.url && fam !== "small") txt(r, "↗", F.b(8), col("dim"), 1);
  if (c.url) r.url = c.url;
  return r;
}

async function build() {
  const { d, offline, need } = await loadFeed();
  const fam = config.widgetFamily || "large";
  const max = fam === "large" || fam === "extraLarge" ? 12 : fam === "small" ? 3 : 5;
  const w = newTheaterWidget(fam, { hazard: 7, bracket: "amber" });
  w.setPadding(fam === "small" ? 14 : 15, fam === "small" ? 11 : 14, fam === "small" ? 10 : 12, fam === "small" ? 11 : 14);
  const hdr = w.addStack(); hdr.centerAlignContent(); hdr.spacing = 5;
  hazardChip(hdr, "⚠", 8);
  txt(hdr, fam === "small" ? "HOLD CAGE" : "HOLD CAGE · WAITING ON HUNTER", F.h(fam === "small" ? 9.5 : 10.5), col("amber"), 1);
  hdr.addSpacer();
  if (!d) { softFail(w, need || "NO SIGNAL", "Waiting"); return w; }
  const cmdW = ((d.command || {}).lists || {}).waiting || [], kalW = ((d.kal || {}).lists || {}).waiting || [];
  const items = [...cmdW.map((c) => ({ ...c, tag: "CMD" })), ...kalW.map((c) => ({ ...c, tag: "KAL", lane: c.lane || "Kal" }))];
  chip(hdr, String(items.length), col("holdink"), col("hold", 0.45), 10, col("holdink", 0.8));

  w.addSpacer(3);
  const sub = w.addStack(); sub.centerAlignContent(); sub.spacing = 4;
  if (fam !== "small") { txt(sub, `CMD ${cmdW.length}`, F.sb(7.5), col("tan"), 1); txt(sub, "·", F.sb(7.5), col("dim"), 1); txt(sub, `KAL ${kalW.length}`, F.sb(7.5), col("amber"), 1); }
  sub.addSpacer();
  const stale = offline || Date.now() - new Date(d.updatedAt).getTime() > 30 * 60 * 1000;
  txt(sub, (offline ? "OFFLINE · " : stale ? "STALE · " : "") + ago(d.updatedAt), F.sb(7.5), stale ? col("holdink") : col("dim"), 1);
  w.addSpacer(5);

  if (!items.length) {
    w.addSpacer();
    const e = w.addStack(); e.addSpacer(); e.backgroundColor = col("panel", 0.9); e.borderColor = col("olive"); e.borderWidth = 1; e.setPadding(7, 8, 7, 8);
    txt(e, "✓ ", F.h(11), col("ship"), 1); txt(e, fam === "small" ? "ALL CLEAR" : "NOTHING ON HUNTER · ALL CLEAR", F.sb(fam === "small" ? 9 : 10), col("dim"), 1); e.addSpacer();
    w.addSpacer(); return w;
  }
  const shown = items.slice(0, max);
  await preloadAvatars(shown);
  shown.forEach((c, i) => {
    if (i && c.tag === "KAL" && shown[i - 1].tag !== "KAL" && fam === "large") { w.addSpacer(2); zoneLabel(w, "KAL BOARD", "amber", "amber", 7); w.addSpacer(2); }
    cageRow(w, c, fam); w.addSpacer(2);
  });
  w.addSpacer();
  const more = items.length - shown.length;
  if (fam === "small") { if (more > 0) txt(w, `+${more} MORE ON HUNTER`, F.sb(7.5), col("holdink"), 1); return w; }
  const f = w.addStack(); f.centerAlignContent();
  txt(f, more > 0 ? `+${more} MORE IN THE CAGE` : "CAGE SECURE", F.sb(7.5), more > 0 ? col("holdink") : col("dim"), 1);
  f.addSpacer(); txt(f, "TAP ▸ LIVE HUD", F.sb(7.5), col("dim"), 1);
  return w;
}

const widget = await build();
if (config.runsInWidget) Script.setWidget(widget);
else await widget.presentLarge();
Script.complete();
