// Map Jae's multi-channel metrics pull into the Social board model.
// Numbers are copied from the source files. Nothing is invented here except sort order and field trim.
const COPY = {
  tt_kco: { label: '@kinsora.co TikTok', short: 'TT KCO', reach: 'Views',
    calendarNote: "Daily account video views from Windsor (TikTok organic). TikTok only lets Windsor read the last 60 days, so the line starts Sep 1, not at the first post (Jun 8). The latest day isn't reported yet, so it's left off.",
    postedNote: 'Each column adds up the current lifetime views of the posts that went up that day (PT), back to the first post on Jun 8.' },
  tt_wk: { label: '@wearkinsora TikTok', short: 'TT WK', reach: 'Views',
    calendarNote: '',
    postedNote: "Each column adds up the current lifetime views of the posts that went up that day (PT). Windsor's daily account series reads 0 every day for @wearkinsora, so there's no calendar line for this channel." },
  ig: { label: 'Instagram @wearkinsora', short: 'IG', reach: 'Views',
    calendarNote: 'Daily account views from Windsor (Instagram user insights), from the first post on May 21 PT. Account-level, so it includes Stories and any boosted reach and runs above the sum of post views.',
    postedNote: 'Each column adds up the current lifetime views of the posts that went up that day (PT), back to the first post on May 21.' },
  pin: { label: 'Pinterest wearkinsora', short: 'PIN', reach: 'Impressions',
    calendarNote: "Daily account impressions from Postiz platform analytics. Pinterest only shares the last 90 days, so the line starts Aug 3, not at the first pin.",
    postedNote: "Each column adds up the impressions each pin got over the last 90 days, grouped by the day it was pinned (PT). Pinterest doesn't share lifetime pin totals." },
};

export function buildSocialModel(M, D = {}) {
  const channels = (M.channels || []).map((c) => ({
    key: c.key, platform: c.platform, handle: c.handle, ...(COPY[c.key] || { label: c.handle, short: c.key, reach: 'Views' }),
    published: c.published_count, queue: c.postiz_queue ?? (D.queue || {})[c.key] ?? 0,
    firstPost: c.earliest_post_pt, totals: c.totals,
  }));

  const series = {};
  for (const s of M.platform_series || []) if (s.usable && !series[s.ch]) series[s.ch] = { source: s.source, metric: s.metric, points: s.points };

  const posts = [...(M.posts || [])].sort((a, b) => (a.ts < b.ts ? 1 : -1)).map((p) => [
    p.ch, p.date, p.slot, p.hook || '', p.views ?? null, p.likes ?? null, p.comments ?? null, (p.ch === 'pin' ? p.clicks : p.shares) ?? null, p.saves ?? null, // pin: index 7 = 90d clicks
    /^Postiz \(no/.test(p.src) ? 'X' : /^Postiz/.test(p.src) ? 'P' : 'W', p.url || '']);

  const lastSeriesDay = Object.values(series).flatMap((s) => s.points.map((p) => p[0])).sort().pop() || null;
  const lastPostDay = posts.reduce((a, r) => (r[1] > a ? r[1] : a), '');
  return {
    generatedAt: M.generated_at, asOfDay: [lastSeriesDay, lastPostDay].filter(Boolean).sort().pop(),
    channels, series, posts, notes: M.notes || [], errors: M.errors || [],
    sources: ['Postiz: posts:list, analytics:post, analytics:platform', 'Windsor.ai: tiktok_organic, instagram, pinterest_organic'],
  };
}
