/* Brand marks for social chrome. Shapes are simplified and inset so they stay
   sharp at 11–16px. One dark glyph on a gold plate — no gradient, no offset copies. */
(function (root) {
  const INK = "#1A140C";
  const GOLD = "#F4E6C4";
  const TITLE = {
    instagram: "Instagram", tiktok: "TikTok", pinterest: "Pinterest",
    x: "X", youtube: "YouTube", facebook: "Facebook", generic: "Channel"
  };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  function kindFrom(ch) {
    const key = String((ch && ch.key) || (typeof ch === "string" ? ch : "")).toLowerCase();
    const plat = String((ch && ch.platform) || "").toLowerCase();
    const blob = (key + " " + plat + " " + String((ch && (ch.label || ch.short || ch.handle)) || "")).toLowerCase();
    if (key === "ig" || key.startsWith("ig_") || plat.includes("instagram") || blob.includes("instagram")) return "instagram";
    if (key.startsWith("tt") || plat.includes("tiktok") || blob.includes("tiktok")) return "tiktok";
    if (key === "pin" || key.startsWith("pin_") || plat.includes("pinterest") || blob.includes("pinterest")) return "pinterest";
    if (key === "yt" || key.startsWith("yt_") || plat.includes("youtube") || blob.includes("youtube")) return "youtube";
    if (key === "x" || key === "tw" || plat === "x" || plat.includes("twitter") || blob.includes("twitter")) return "x";
    if (key === "fb" || key.startsWith("fb_") || plat.includes("facebook") || blob.includes("facebook")) return "facebook";
    return "generic";
  }
  function body(kind) {
    if (kind === "instagram") {
      return `<path fill="${INK}" fill-rule="evenodd" d="M8 4.2h8a3.8 3.8 0 0 1 3.8 3.8v8a3.8 3.8 0 0 1-3.8 3.8H8a3.8 3.8 0 0 1-3.8-3.8V8A3.8 3.8 0 0 1 8 4.2zm4 3.3a4.5 4.5 0 1 0 .01 9 4.5 4.5 0 0 0-.01-9zM16.7 6.5a1.15 1.15 0 1 0 .01 2.3 1.15 1.15 0 0 0-.01-2.3z"/>`;
    }
    if (kind === "tiktok") {
      return `<path fill="${INK}" d="M13.1 4.4h2.1c.15 1.15.7 2.15 1.55 2.85.7.55 1.55.9 2.45 1.05v2.15a6.4 6.4 0 0 1-2.55-.7v5.55c0 .85-.25 1.65-.75 2.3-.85 1.15-2.25 1.85-3.7 1.85-.85 0-1.65-.2-2.35-.6-1.2-.7-2-2-2.1-3.4v-.15c.1-1.15.7-2.2 1.6-2.9 1-.85 2.35-1.2 3.6-.95v2.15c-.55-.15-1.15-.05-1.6.25-.4.25-.65.65-.75 1.1.15.95 1.05 1.7 2.05 1.6.65 0 1.25-.4 1.55-.95.1-.2.2-.4.2-.65V4.4z"/>`;
    }
    if (kind === "pinterest") {
      return `<circle cx="12" cy="12" r="8.2" fill="${INK}"/><path fill="${GOLD}" fill-rule="evenodd" d="M10.15 7.7h2.85c1.6 0 2.6.9 2.6 2.2 0 1.35-.95 2.25-2.55 2.25h-1.2V16.4h-1.7V7.7zm1.7 1.35v1.95h1.05c.7 0 1.1-.35 1.1-.95s-.4-1-1.1-1h-1.05z"/>`;
    }
    if (kind === "x") {
      return `<path fill="${INK}" d="M6.1 5.8h3.05l2.85 3.85L14.9 5.8H18l-4.15 5.55L18.15 18.2h-3.05l-3.05-4.1-3.1 4.1H5.85l4.35-5.7z"/>`;
    }
    if (kind === "youtube") {
      return `<path fill="${INK}" fill-rule="evenodd" d="M5.2 7.6h13.6a2.2 2.2 0 0 1 2.2 2.2v4.4a2.2 2.2 0 0 1-2.2 2.2H5.2a2.2 2.2 0 0 1-2.2-2.2V9.8a2.2 2.2 0 0 1 2.2-2.2zm4.15 1.7v5.4l4.7-2.7z"/>`;
    }
    if (kind === "facebook") {
      return `<circle cx="12" cy="12" r="8.2" fill="${INK}"/><path fill="${GOLD}" d="M12.85 17.6v-3.35h1.15l.25-1.45h-1.4v-.85c0-.45.15-.75.8-.75h.6V9.7c-.15 0-.6-.05-1.15-.05-1.15 0-1.95.7-1.95 2v1.15H10.1v1.45h1.05v3.35h1.7z"/>`;
    }
    return `<circle cx="12" cy="12" r="2.1" fill="${INK}"/><path fill="none" stroke="${INK}" stroke-width="1.7" stroke-linecap="round" d="M8.2 10.6a4.6 4.6 0 0 1 7.6 0M6.3 8.5a8 8 0 0 1 11.4 0"/>`;
  }
  function svg(kind, title) {
    const t = esc(title || TITLE[kind] || TITLE.generic);
    return `<svg viewBox="0 0 24 24" role="img" aria-label="${t}" focusable="false"><title>${t}</title>${body(kind)}</svg>`;
  }
  function markHtml(ch, px) {
    const kind = kindFrom(ch);
    const named = TITLE[kind];
    const title = named === "Channel" && ch && ch.platform ? String(ch.platform) : named;
    const size = px || 14;
    return `<span class="mw4-mark" style="width:${size}px;height:${size}px">${svg(kind, title)}</span>`;
  }
  root.MW4Icons = { kindFrom, svg, markHtml };
})(window);
