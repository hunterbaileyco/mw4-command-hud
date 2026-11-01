const C = { bg: new Color("#0b0d0a"), coyote: new Color("#8B7355"), amber: new Color("#D4A017"),
            txt: new Color("#d9d4c3"), dim: new Color("#8a8676"), red: new Color("#b4492f") };

async function build() {
  const { d, offline, need } = await loadFeed();
  const w = new ListWidget();
  w.backgroundColor = C.bg; w.url = HUD_URL; w.setPadding(12, 14, 12, 14);
  w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);
  const fam = config.widgetFamily || "large";
  const max = fam === "large" ? 12 : fam === "small" ? 3 : 5;
  const hdr = w.addStack(); hdr.centerAlignContent();
  const h = hdr.addText("⚠ WAITING ON HUNTER"); h.font = Font.heavyMonospacedSystemFont(11); h.textColor = C.amber;
  hdr.addSpacer();
  if (!d) {
    w.addSpacer();
    const e = w.addText(need || "NO SIGNAL"); e.textColor = need === "AUTH NEEDED" ? C.amber : C.red; e.font = Font.heavyMonospacedSystemFont(14);
    if (need === "AUTH NEEDED") { const s = w.addText("Open Scriptable → run “MW4 Waiting” once → enter auth code."); s.textColor = C.dim; s.font = Font.monospacedSystemFont(9); }
    w.addSpacer(); return w;
  }
  const items = [
    ...(((d.command || {}).lists || {}).waiting || []).map((c) => ({ ...c, tag: c.lane || "CMD" })),
    ...(((d.kal || {}).lists || {}).waiting || []).map((c) => ({ ...c, tag: "KAL" })),
  ];
  const n = hdr.addText(String(items.length) + (offline ? " · OFF" : ""));
  n.font = Font.heavyMonospacedSystemFont(11); n.textColor = offline ? C.red : C.amber;
  w.addSpacer(6);
  if (!items.length) { const t = w.addText("All clear."); t.textColor = C.dim; t.font = Font.monospacedSystemFont(12); }
  for (const c of items.slice(0, max)) {
    const r = w.addStack(); r.spacing = 6;
    const tg = r.addText(String(c.tag).toUpperCase().slice(0, 5).padEnd(5, " "));
    tg.font = Font.semiboldMonospacedSystemFont(9); tg.textColor = c.tag === "KAL" ? C.amber : C.coyote;
    const t = r.addText(fam === "large" ? c.name : (c.short || c.name)); t.font = Font.monospacedSystemFont(11); t.textColor = C.txt; t.lineLimit = 1;
    if (c.url) r.url = c.url;
    w.addSpacer(3);
  }
  if (items.length > max) { const m = w.addText(`+${items.length - max} more`); m.font = Font.monospacedSystemFont(9); m.textColor = C.dim; }
  w.addSpacer();
  return w;
}

const widget = await build();
if (config.runsInWidget) Script.setWidget(widget);
else await widget.presentLarge();
Script.complete();
