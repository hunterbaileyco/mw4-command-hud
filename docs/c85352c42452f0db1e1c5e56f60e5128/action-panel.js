/* Live feed for one operator. Titles, briefs, lane, and board come only from the feed card.
   Standing work is cards whose name or short already says "standing" — not a new feed field. */
(function (root) {
  // Dunn is personal-only. Listed here solely so designator() keeps 141-07 numbering.
  const OPS = ["Price", "Ghost", "Cho", "West", "Ko", "Park", "Jae", "Dunn", "Soap", "Gaz", "Kal", "Ju Kwon"];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  function designator(op) {
    if (op === "Price") return "BRAVO-6";
    if (op === "Ju Kwon") return "EXT-01";
    const i = OPS.indexOf(op);
    return i < 0 ? "" : "141-" + String(i).padStart(2, "0");
  }
  function isStanding(c) {
    const name = String((c && c.name) || "");
    const short = String((c && c.short) || "");
    return /\(\s*standing\s*\)/i.test(name) || /\(\s*standing\s*\)/i.test(short) || /\bstanding\b/i.test(name);
  }
  function safeUrl(u) { return /^https:\/\/trello\.com\//.test(u || "") ? u : ""; }
  function norm(t) {
    let s = String(t || "").toLowerCase().trim();
    const lane = "ju kwon|price|ghost|cho|west|ko|park|jae|dunn|soap|gaz|kal";
    s = s.replace(new RegExp("^(" + lane + ")\\s*[:\\u2014\\u2013-]\\s*"), "");
    s = s.replace(new RegExp("^(" + lane + ")\\s+"), "");
    return s.replace(/[^a-z0-9]+/g, "");
  }
  function linesOf(c) {
    const name = String((c && c.name) || "").trim();
    const short = String((c && c.short) || "").trim();
    const title = short || name || "—";
    const detail = name && short && norm(name) !== norm(short) ? name : "";
    return { title, detail };
  }
  function cardHtml(c, kind) {
    const { title, detail } = linesOf(c);
    const lane = String(c.lane || "—");
    const rawBoard = String(c.board || "");
    const board = rawBoard === "KAL" ? "TRADING" : rawBoard;
    const url = safeUrl(c.url);
    const status = kind === "stand" ? "STANDING" : "DOING";
    const body = `<div class="actx-title">${esc(title)}</div>` +
      (detail ? `<div class="actx-detail">${esc(detail)}</div>` : "") +
      `<div class="actx-meta"><span>${esc(lane)}</span>${board ? `<span>${esc(board)}</span>` : ""}<span>${status}</span>` +
      (url ? `<span class="go">OPEN ↗</span>` : "") + `</div>`;
    if (!url) return `<article class="actx-card ${kind}">${body}</article>`;
    return `<a class="actx-card ${kind}" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${body}</a>`;
  }
  function html(opts) {
    const op = String((opts && opts.op) || "");
    const cards = ((opts && opts.cards) || []).filter((c) => !c.list || c.list === "doing");
    const finite = cards.filter((c) => !isStanding(c));
    const standing = cards.filter(isStanding);
    const des = (opts && opts.des) || designator(op);
    const ini = op === "Ju Kwon" ? "JK" : op.slice(0, 2).toUpperCase();
    const avatar = (opts && opts.avatar) || ("avatars/" + op.toLowerCase() + ".png");
    const face = `<img class="actx-face" src="${esc(avatar)}" alt="" onerror="this.outerHTML='<b class=&quot;actx-face ini&quot;>${esc(ini)}</b>'">`;
    const close = '<button class="x" type="button">CLOSE</button>';
    if (!finite.length && !standing.length) {
      return `<div class="actx actx-empty"><div class="actx-top">${face}<div class="actx-id"><div class="actx-cs">${esc(op.toUpperCase())}${des ? " <i>" + esc(des) + "</i>" : ""}</div><div class="actx-st">NOT ACROSS THE WIRE</div></div>${close}</div><p class="actx-none">No Doing card on the feed for this callsign.</p></div>`;
    }
    const st = finite.length
      ? (finite.length + " finite" + (standing.length ? " · " + standing.length + " standing" : ""))
      : "On station · no finite mission";
    const finiteBlock = finite.length
      ? `<section class="actx-sec"><h3>Doing</h3>${finite.map((c) => cardHtml(c, "finite")).join("")}</section>`
      : `<p class="actx-none">No finite Doing card. This callsign is not across the wire.</p>`;
    const standBlock = standing.length
      ? `<section class="actx-sec stand"><h3>Standing · always on</h3>${standing.map((c) => cardHtml(c, "stand")).join("")}</section>`
      : "";
    return `<div class="actx"><div class="actx-top">${face}<div class="actx-id"><div class="actx-cs">${esc(op.toUpperCase())}${des ? " <i>" + esc(des) + "</i>" : ""}</div><div class="actx-st">${esc(st)}</div></div>${close}</div>${finiteBlock}${standBlock}</div>`;
  }
  root.MW4Action = { html, designator, isStanding };
})(window);
