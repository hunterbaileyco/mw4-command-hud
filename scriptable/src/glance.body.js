const C = { bg: new Color("#0b0d0a"), olive: new Color("#556B2F"), coyote: new Color("#8B7355"),
            amber: new Color("#D4A017"), txt: new Color("#d9d4c3"), dim: new Color("#8a8676"), red: new Color("#b4492f") };

function ago(iso) {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 1 ? "now" : m < 60 ? m + "m" : Math.floor(m / 60) + "h" + (m % 60 ? (m % 60) + "m" : "");
}
function stat(stack, n, label, color) {
  const s = stack.addStack(); s.layoutVertically();
  const t = s.addText(String(n)); t.font = Font.heavyMonospacedSystemFont(26); t.textColor = color;
  const l = s.addText(label); l.font = Font.semiboldMonospacedSystemFont(9); l.textColor = C.dim;
}
function softFail(w, title, sub) {
  w.addSpacer();
  const e = w.addText(title); e.textColor = title === "AUTH NEEDED" ? C.amber : C.red; e.font = Font.heavyMonospacedSystemFont(14);
  const s = w.addText(sub); s.textColor = C.dim; s.font = Font.monospacedSystemFont(9); s.lineLimit = 3;
  w.addSpacer();
}

async function build() {
  const { d, offline, need } = await loadFeed();
  const w = new ListWidget();
  w.backgroundColor = C.bg; w.url = HUD_URL; w.setPadding(12, 12, 12, 12);
  w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);
  const fam = config.widgetFamily || "medium";
  const hdr = w.addStack(); hdr.centerAlignContent();
  const h = hdr.addText("MW4 COMMAND"); h.font = Font.heavyMonospacedSystemFont(11); h.textColor = C.coyote;
  hdr.addSpacer();
  if (!d) { softFail(w, need || "NO SIGNAL", need === "AUTH NEEDED" ? "Open Scriptable → run “MW4 Glance” once → enter auth code." : "Feed unreachable."); return w; }
  const stale = Date.now() - new Date(d.updatedAt).getTime() > 30 * 60 * 1000;
  const a = hdr.addText((offline ? "OFF · " : "") + ago(d.updatedAt)); a.font = Font.mediumMonospacedSystemFont(9);
  a.textColor = stale || offline ? C.red : C.dim;

  w.addSpacer(6);
  const g = d.glance || {};
  if (g.badge) { const b = w.addText(g.badge); b.font = Font.heavyMonospacedSystemFont(10); b.textColor = C.amber; }
  const l1 = w.addText(g.line1 || ""); l1.font = Font.boldMonospacedSystemFont(fam === "small" ? 11 : 13); l1.textColor = C.txt; l1.lineLimit = 2;
  const l2 = w.addText(g.line2 || ""); l2.font = Font.monospacedSystemFont(fam === "small" ? 9 : 11); l2.textColor = C.dim; l2.lineLimit = 2;
  // latest event from the feed (deploy / rtb / hold / cleared) within the last 2 h
  const ev = (d.events || []).filter((e) => Date.now() - Date.parse(e.t) < 2 * 3600 * 1000).slice(-1)[0];
  if (ev && fam !== "small") {
    const tag = { deploy: "▲ DEPLOY", rtb: "✓ RTB", hold: "■ HOLD", cleared: "CLEARED" }[ev.kind] || ev.kind;
    const e = w.addText(`${tag} · ${String(ev.op).toUpperCase()} · ${ev.mission || ""} · ${ago(ev.t)}`);
    e.font = Font.semiboldMonospacedSystemFont(9); e.textColor = ev.kind === "rtb" ? C.olive : ev.kind === "hold" ? C.red : C.amber; e.lineLimit = 1;
  }
  w.addSpacer();
  const cc = (d.command && d.command.counts) || {}, kc = (d.kal && d.kal.counts) || {};
  const row = w.addStack(); row.bottomAlignContent();
  stat(row, cc.doing ?? 0, "DOING", C.txt); row.addSpacer();
  stat(row, cc.waiting ?? 0, "WAIT", C.amber);
  if (fam !== "small") { row.addSpacer(); stat(row, cc.backlog ?? 0, "BACKLOG", C.coyote); row.addSpacer(); stat(row, kc.waiting ?? 0, "KAL WAIT", C.amber); }
  return w;
}

const widget = await build();
if (config.runsInWidget) Script.setWidget(widget);
else await widget.presentMedium();
Script.complete();
