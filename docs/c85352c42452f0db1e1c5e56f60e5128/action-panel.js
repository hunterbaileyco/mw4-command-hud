/* In-action panel for an operator who is Doing (across the wire).
   Mission title, brief, lane, and board come only from the feed card.
   The looping scene is chosen from words already on that card. */
(function (root) {
  const OPS = ["Price", "Ghost", "Cho", "West", "Ko", "Park", "Jae", "Dunn", "Soap", "Gaz", "Kal"];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const SCENE = {
    shoot: "CONTENT SHOOT",
    flow: "RETENTION FLOW",
    write: "ON THE PAGE",
    clear: "CLEARING TICKETS",
    creative: "ADS CREATIVE",
    intel: "BUYER INTEL",
    wire: "ON THE WIRE",
  };
  function designator(op) {
    if (op === "Price") return "BRAVO-6";
    const i = OPS.indexOf(op);
    return i < 0 ? "" : "141-" + String(i).padStart(2, "0");
  }
  function sceneFor(text) {
    const s = String(text || "").toLowerCase();
    if (/tiktok|instagram|reel|shoot|content|video|ugc|\bcut\b|social|pinterest|youtube|clip/.test(s)) return "shoot";
    if (/retention|klaviyo|email|sms|\bflow\b|lifecycle|sequence|pulse/.test(s)) return "flow";
    if (/\bseo\b|search|caption|\bcopy\b|write|brief|blog|index/.test(s)) return "write";
    if (/ticket|trello|inbox|triage|intake|clear|support/.test(s)) return "clear";
    if (/\bads?\b|creative|campaign|\bmeta\b|static|still/.test(s)) return "creative";
    if (/buyer|learn|research|audit|intel|clarity/.test(s)) return "intel";
    return "wire";
  }
  function safeUrl(u) { return /^https:\/\/trello\.com\//.test(u || "") ? u : ""; }
  function titleOf(c) { return String((c && (c.name || c.short)) || "").trim(); }
  function briefOf(c) {
    const s = String((c && c.short) || "").trim();
    const n = String((c && c.name) || "").trim();
    if (!s || !n || s === n) return "";
    return s;
  }
  function prop(scene) {
    if (scene === "shoot") return '<i class="vf"></i><i class="rec">REC</i><b></b><b></b><b></b>';
    if (scene === "flow") return '<i></i><i></i><i></i><span class="bolt"></span>';
    if (scene === "write") return '<span></span><span></span><span></span><em></em>';
    if (scene === "clear") return '<span></span><span></span><span></span>';
    if (scene === "creative") return '<b></b><b></b><b></b>';
    if (scene === "intel") return '<i class="ret"></i><i class="sweep"></i>';
    return '<i></i><i></i><i></i><em class="obj"></em>';
  }
  function html(opts) {
    const op = String((opts && opts.op) || "");
    const cards = (opts && opts.cards) || [];
    const doing = cards.filter((c) => !c.list || c.list === "doing");
    const primary = doing[0];
    const des = (opts && opts.des) || designator(op);
    const ini = op.slice(0, 2).toUpperCase();
    const avatar = (opts && opts.avatar) || ("avatars/" + op.toLowerCase() + ".png");
    const close = '<button class="x" type="button">✕ CLOSE</button>';
    if (!primary) {
      return `<div class="hd"><img src="${esc(avatar)}" alt=""><div><div class="nm">${esc(op.toUpperCase())}${des ? " · " + esc(des) : ""}</div><div class="zs">NOT ACROSS THE WIRE</div></div>${close}</div><div class="empty">No Doing card on the feed for this callsign.</div>`;
    }
    const scene = sceneFor([primary.name, primary.short, primary.lane].filter(Boolean).join(" "));
    const title = titleOf(primary);
    const brief = briefOf(primary);
    const lane = String(primary.lane || op || "—");
    const board = String(primary.board || "");
    const url = safeUrl(primary.url);
    const rest = doing.slice(1);
    const face = `<img src="${esc(avatar)}" alt="${esc(op)}" onerror="this.outerHTML='<b class=&quot;ini&quot;>${esc(ini)}</b>'">`;
    return `<div class="actx" data-scene="${scene}">
      <div class="actx-top"><span class="sec">DOING</span><span class="mot">${SCENE[scene]}</span>${close}</div>
      <div class="actx-stage" aria-hidden="true">
        <div class="actx-fig">${face}<i class="arm"></i><i class="rig"></i></div>
        <div class="actx-prop ${scene}">${prop(scene)}<div class="slate">${esc(brief || title)}</div></div>
      </div>
      <div class="actx-read">
        <div class="actx-cs">${esc(op.toUpperCase())}${des ? " <i>" + esc(des) + "</i>" : ""}</div>
        <div class="actx-st">DOING · ACROSS THE WIRE</div>
        <div class="actx-k">MISSION</div>
        <div class="actx-title">${esc(title || "—")}</div>
        ${brief ? `<div class="actx-k">BRIEF</div><div class="actx-brief">${esc(brief)}</div>` : ""}
        <div class="actx-meta"><span>LANE ${esc(lane)}</span>${board ? `<span>${esc(board)}</span>` : ""}<span>STATUS DOING</span></div>
        ${url ? `<a class="actx-go" href="${esc(url)}" target="_blank" rel="noopener noreferrer">OPEN CARD ↗</a>` : ""}
        ${rest.length ? `<div class="actx-k">ALSO DOING</div><ul class="actx-more">${rest.map((c) => `<li>${esc(titleOf(c) || "—")}</li>`).join("")}</ul>` : ""}
      </div>
    </div>`;
  }
  root.MW4Action = { html, sceneFor, designator, SCENE };
})(window);
