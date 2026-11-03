/* TF141 operator files + ORBAT wire router.
   Flat chain: Hunter → Kal → Price → lanes. One dispatcher.
   Cho is a creative checkpoint, not a manager. No manager line from Cho to lanes.
   Laswell 141-11 owns care@ only (no Intercom). Ju Kwon is Kinsora ops back-office.
   Ghost = trading. Dunn = personal (no Ops suffix). */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.MW4Roster = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const OPS = ['Price', 'Ghost', 'Cho', 'West', 'Ko', 'Park', 'Jae', 'Ju Kwon', 'Soap', 'Gaz', 'Kal', 'Laswell'];
  const DES = {
    Price: 'BRAVO-6', Ghost: '141-01', Cho: '141-02', West: '141-03', Ko: '141-04',
    Park: '141-05', Jae: '141-06', Dunn: '141-07', Soap: '141-08', Gaz: '141-09', Kal: '141-10',
    Laswell: '141-11', 'Ju Kwon': 'EXT-01',
  };
  /* Price taps these. Ghost and Dunn stay outside the wire. */
  const WIRE_IDS = ['west', 'jae', 'park', 'gaz', 'ju', 'ko', 'soap', 'laswell', 'cho'];
  const GATE_IDS = ['west', 'jae', 'park', 'gaz', 'ju'];

  const p = (id) => ({ id });
  const lab = (label) => ({ label });
  /* FILES §4 reads outbox. from/to stay for ORBAT routing (flowPersonIds). */
  const CHO_GATE_LINE = 'Cho gate → Hunter approve';

  const FILES = [
    {
      id: 'price', name: 'Price', des: 'BRAVO-6', unit: 'COMMAND', board: 'CMD', stamp: 'SOLE DISPATCH',
      role: 'Sole dispatcher — turns Hunter’s intent into cards and assigns every lane',
      does: [
        'Writes and assigns every card — the only operator who dispatches',
        'Runs overwatch from CMD POST; re-routes a lane the moment it stalls',
        'Brings blockers to Hunter as one clean ask each (they land in the HOLD cage)',
      ],
      not: 'Doesn’t do lane work himself — and nobody else assigns work.',
      from: [{ id: 'hunter', name: 'HUNTER', star: true }, p('kal')],
      to: [lab('8 LANES + CHO')],
      outbox: {
        line: 'Dispatch to lanes (sole dispatcher)',
        then: '8 lanes + Cho · nobody else assigns work',
        gate: 'cmd',
      },
      map: 'Sole dispatcher',
    },
    {
      id: 'ghost', name: 'Ghost', des: '141-01', unit: 'TRADING', board: 'KAL', stamp: 'TRADING',
      role: 'Trading — runs the copy-trading desk on its own board',
      does: [
        'Copy-trade signal sweeps (FOMO watch) inside set risk limits',
        'Paper-sizes new signals until the risk check clears',
        'Reports into the HUD; routine runs need no dispatch',
      ],
      not: 'Not a Kinsora store lane. Doesn’t pull squad cards; Price doesn’t dispatch it.',
      from: [lab('OWN SIGNALS'), lab('RISK LIMITS')],
      to: [lab('TRADING BOARD')],
      outbox: {
        line: 'Trading board (own signals · no Price wire)',
        then: 'Paper size until the risk check clears',
        gate: 'off',
      },
      map: 'Trading',
    },
    {
      id: 'cho', name: 'Cho', des: '141-02', unit: 'CREATIVE GATE', board: 'CMD', stamp: 'CREATIVE GATE',
      role: 'Creative gate — the checkpoint West, Jae, Park, Gaz and Ju Kwon pass before it ships',
      does: [
        'Reviews creative from West, Jae, Park, Gaz and Ju Kwon',
        'Passes it or sends it back with notes — brand + voice are the bar',
        'One checkpoint on the way out, not a reporting line',
      ],
      not: 'Doesn’t manage, assign or re-prioritise West / Jae / Park / Gaz / Ju Kwon. Price dispatches them.',
      from: [p('west'), p('jae'), p('park'), p('gaz'), p('ju')],
      to: [lab('SHIP'), lab('SEND BACK')],
      outbox: {
        line: CHO_GATE_LINE,
        then: 'Passes go out on the lane’s live channel · misses go back to the lane with notes',
        gate: 'gate',
        actions: ['ship', 'back'],
      },
      map: 'Creative gate · review',
    },
    {
      id: 'west', name: 'West', des: '141-03', unit: 'GROWTH · RETENTION', board: 'CMD', stamp: 'RETENTION',
      role: 'Retention — Klaviyo email/SMS + onsite capture',
      does: [
        'Email + SMS flows and campaigns (BFCM, welcome, winback)',
        'Onsite capture: popups, offers, Alia quizzes, codes',
        'All creative clears Cho’s gate before send',
      ],
      not: 'Doesn’t run paid acquisition (Soap) or touch theme code (Ko).',
      from: [p('price')],
      to: [{ id: 'cho', name: 'CHO GATE' }, lab('LIVE')],
      outbox: { line: CHO_GATE_LINE, then: 'then live: email / SMS sends', gate: 'gated' },
      map: 'Email/SMS + onsite',
    },
    {
      id: 'ko', name: 'Ko', des: '141-04', unit: 'BUILD', board: 'CMD', stamp: 'BUILD',
      role: 'Engineering — Shopify theme, apps, tooling (incl. this HUD)',
      does: [
        'Theme sections, app wiring, cart + checkout fixes',
        'Mobile QA and site speed before anything goes live',
        'Builds internal tooling — the HUD included',
      ],
      not: 'Doesn’t own copy or creative calls.',
      from: [p('price')],
      to: [lab('LIVE SITE')],
      outbox: {
        line: 'Live site (no Cho gate)',
        then: 'Mobile QA + speed check before it goes live',
        gate: 'none',
      },
      map: 'Theme + tooling',
    },
    {
      id: 'park', name: 'Park', des: '141-05', unit: 'GROWTH · SEO', board: 'CMD', stamp: 'SEO',
      role: 'SEO — keyword briefs, I-series articles, on-page + index health',
      does: [
        'Keyword briefs + News/blog articles (I-series)',
        'On-page SEO, internal links, index health',
        'Monthly re-audit; article copy clears Cho’s gate',
      ],
      not: 'Doesn’t do social (Jae) or paid (Gaz / Soap).',
      from: [p('price')],
      to: [{ id: 'cho', name: 'CHO GATE' }, lab('PUBLISHED')],
      outbox: { line: CHO_GATE_LINE, then: 'then live: published (News / blog)', gate: 'gated' },
      map: 'SEO + articles',
    },
    {
      id: 'jae', name: 'Jae', des: '141-06', unit: 'GROWTH · SOCIAL', board: 'CMD', stamp: 'SOCIAL',
      role: 'Organic social — TikTok, IG, Pinterest',
      does: [
        'Weekly content batch + short-form cuts',
        'Postiz scheduling and the published-metrics board',
        'Creative clears Cho’s gate before it posts',
      ],
      not: 'Doesn’t run paid ads (Gaz makes, Soap buys).',
      from: [p('price')],
      to: [{ id: 'cho', name: 'CHO GATE' }, lab('POSTED')],
      outbox: { line: CHO_GATE_LINE, then: 'then live: posted to social', gate: 'gated' },
      map: 'Organic social',
    },
    {
      id: 'dunn', name: 'Dunn', des: '141-07', unit: 'PERSONAL', board: '—', stamp: 'PERSONAL',
      role: 'Personal — Hunter’s errands, calendar, life admin',
      does: [
        'Hunter’s personal errands, calendar and admin',
        'Kept off Kinsora boards and out of DOING counts',
      ],
      not: 'Doesn’t take Kinsora squad cards or appear in the theater.',
      from: [{ id: 'hunter', name: 'HUNTER', star: true }],
      to: [{ id: 'hunter', name: 'HUNTER', star: true }],
      outbox: {
        line: 'Hunter only (personal · off theater)',
        then: 'Kept off Kinsora boards',
        gate: 'off',
      },
      map: 'Personal',
      off: true,
    },
    {
      id: 'soap', name: 'Soap', des: '141-08', unit: 'PAID · BUY', board: 'CMD', stamp: 'MEDIA BUY',
      role: 'Media buyer — budgets, bids, audiences, pacing',
      does: [
        'Runs paid campaigns and pacing',
        'Reads CPA / ROAS, kills or scales ad sets',
        'Asks Hunter before any budget change',
      ],
      not: 'Doesn’t make the creative (Gaz).',
      from: [p('price'), p('gaz')],
      to: [lab('LIVE AD SETS')],
      outbox: {
        line: 'Live ad sets · Hunter yes on spend',
        then: 'Buys only creative that already cleared Cho (from Gaz)',
        gate: 'none',
      },
      map: 'Media buy',
    },
    {
      id: 'gaz', name: 'Gaz', des: '141-09', unit: 'PAID · CREATIVE', board: 'CMD', stamp: 'ADS CREATIVE',
      role: 'Ads creative — hooks, UGC edits, statics, variants',
      does: [
        'Builds paid creative: hooks, UGC cuts, statics',
        'Feeds tested variants to Soap',
        'Creative clears Cho’s gate before Soap buys it',
      ],
      not: 'Doesn’t set budgets or buy media (Soap).',
      from: [p('price'), lab('SOAP READS')],
      to: [{ id: 'cho', name: 'CHO GATE' }, p('soap')],
      outbox: { line: CHO_GATE_LINE, then: 'then live: Soap buys it', gate: 'gated' },
      map: 'Ads creative ▸ Soap',
    },
    {
      id: 'kal', name: 'Kal', des: '141-10', unit: 'INTAKE', board: 'CMD', stamp: 'INTAKE',
      role: 'Intake — reads everything, hands clean intake to Price',
      does: [
        'Sweeps inbox, Slack and Granola notes in the background — never interrupts',
        'Turns raw asks into dispatch-ready intake for Price',
        'Runs the standing weekday AM intake + Trello triage',
      ],
      not: 'Doesn’t assign or do the work. Intake goes INTO Price, not around him.',
      from: [lab('INBOX'), lab('SLACK'), lab('GRANOLA')],
      to: [p('price')],
      outbox: {
        line: 'Price (intake only)',
        then: 'Never assigns · never does the work',
        gate: 'cmd',
      },
      map: 'Intake → Price',
    },
    {
      id: 'ju', name: 'Ju Kwon', des: 'EXT-01', unit: 'KINSORA OPS', board: 'CMD', stamp: 'KINSORA OPS',
      face: 'ju-kwon',
      role: 'Kinsora ops — back-office order exceptions, fulfilment, stock',
      does: [
        'Order exceptions, fulfilment issues, stock checks',
        'Back-office only — no customer replies',
        'Ops notes clear Cho’s gate on the way out',
      ],
      not: 'Doesn’t own care@ — Laswell does — and doesn’t own Intercom. Doesn’t build site fixes — routes them to Ko through Price.',
      from: [p('price')],
      to: [{ id: 'cho', name: 'CHO GATE' }, lab('RESOLVED')],
      outbox: { line: CHO_GATE_LINE, then: 'then: resolved (back-office)', gate: 'gated' },
      map: 'Kinsora ops · back-office',
    },
    {
      id: 'laswell', name: 'Laswell', des: '141-11', unit: 'CARE', board: 'CMD', stamp: 'CARE',
      role: 'Customer care — owns care@ only',
      does: [
        'Owns care@kinsora.co — replies, returns, refunds',
        'Hands wholesale and site fixes to Price; does not dispatch',
        'Care desk on the hub stays SAMPLE until care@ is wired',
      ],
      not: 'Doesn’t own Intercom. Doesn’t run Kinsora back-office (Ju Kwon) or clear Cho’s gate.',
      from: [p('price'), lab('CARE@')],
      to: [lab('REPLIED')],
      outbox: {
        line: 'Reply to customer (care@) · no Cho gate',
        then: 'Wholesale + site fixes go to Price, not out',
        gate: 'none',
      },
      map: 'Customer care · care@',
    },
  ];

  const BY_ID = Object.fromEntries(FILES.map((f) => [f.id, f]));

  function missionText(c) {
    const name = String((c && (c.name || c.short)) || '').trim();
    let t = name.replace(/^\s*(?:Ju Kwon|[A-Za-z]+)\s*(?::|\u2014|\u2013|-)\s*/i, '');
    t = t.replace(/\s*\((?:Shopify|standing)\)\s*$/i, '').replace(/\s+/g, ' ').trim();
    return t || name || '—';
  }

  function slugOf(op) {
    const hit = FILES.find((f) => f.name.toLowerCase() === String(op || '').toLowerCase() || f.id === String(op || '').toLowerCase());
    return hit ? hit.id : String(op || '').toLowerCase();
  }

  /* Portrait file under avatars/. Ju Kwon's id stays ju; the photo is ju-kwon.png. */
  function faceFile(op) {
    const hit = FILES.find((f) => f.name.toLowerCase() === String(op || '').toLowerCase() || f.id === String(op || '').toLowerCase());
    if (!hit) return String(op || '').toLowerCase().replace(/\s+/g, '-');
    return hit.face || hit.id;
  }

  /* Orthogonal wires only. Mobile: one amber rail down the left gutter, a tap into
     each Price wire. Gated output leaves on the right and drops into Cho.
     Desktop: one horizontal bus, a drop into each card, dotted review down to Cho.
     Cho never draws back toward a lane. Ghost and Dunn are not tapped. */
  function routeOrbat(box, width) {
    const W = width || 368;
    const segs = [];
    const add = (cls, pts) => {
      const clean = [pts[0]];
      for (let i = 1; i < pts.length; i++) {
        const prev = clean[clean.length - 1];
        if (Math.abs(pts[i][0] - prev[0]) < 0.5 && Math.abs(pts[i][1] - prev[1]) < 0.5) continue;
        clean.push(pts[i]);
      }
      if (clean.length > 1) segs.push({ cls, pts: clean });
    };
    const cx = (b) => (b.l + b.r) / 2;
    const midY = (b) => (b.t + b.b) / 2;
    const hunter = box.hunter, price = box.price, intake = box.kal, cho = box.cho;
    if (!hunter || !price || !intake) return segs;

    const yJoin = Math.min(price.t - 4, Math.max(hunter.b + 6, (hunter.b + price.t) / 2));
    if (yJoin <= hunter.b + 1) add('cmd', [[cx(hunter), hunter.b], [cx(price), price.t]]);
    else add('cmd', [[cx(hunter), hunter.b], [cx(hunter), yJoin], [cx(price), yJoin], [cx(price), price.t]]);

    const overlapT = Math.max(intake.t, price.t) + 8;
    const overlapB = Math.min(intake.b, price.b) - 8;
    const yIn = overlapT < overlapB ? (overlapT + overlapB) / 2 : midY(price);
    if (price.l > intake.r + 2) add('intake', [[intake.r + 1, yIn], [price.l - 1, yIn]]);

    const wired = WIRE_IDS.map((id) => box[id]).filter(Boolean);
    const gated = GATE_IDS.map((id) => box[id]).filter(Boolean);
    if (!wired.length) return segs;

    const lanes = wired.filter((n) => n !== cho);
    const lefts = lanes.map((n) => n.l);
    const tops = lanes.map((n) => n.t);
    /* The care column makes the map narrower than the viewport, so width is
       not a layout signal. A row of cards (desktop) spreads in x; a stack
       (phone) spreads in y. */
    const row = lanes.length > 1 && (Math.max(...lefts) - Math.min(...lefts)) > (Math.max(...tops) - Math.min(...tops));
    if (!row) {
      const railX = Math.max(6, Math.min(...wired.map((b) => b.l)) - 14);
      const busY = box.busgap ? (box.busgap.t + box.busgap.b) / 2 : Math.max(price.b, intake.b) + 16;
      const lastY = Math.max(...wired.map(midY));
      add('disp', [[cx(price), price.b], [cx(price), busY], [railX, busY], [railX, lastY]]);
      for (const node of wired) add('disp', [[railX, midY(node)], [node.l - 1, midY(node)]]);
      if (cho && gated.length && gated.every((n) => n.b < cho.t - 6)) {
        const railR = Math.min(W - 4, Math.max(...gated.map((b) => b.r), cho.r) + 8);
        const top = Math.min(...gated.map(midY));
        const yAbove = cho.t - 12;
        for (const node of gated) add('review', [[node.r + 1, midY(node)], [railR, midY(node)]]);
        const xIn = Math.max(cho.l + 16, Math.min(cho.r - 22, railR - 10));
        add('review', [[railR, top], [railR, yAbove], [xIn, yAbove], [xIn, cho.t]]);
      }
      return segs;
    }

    const busY = box.busgap ? (box.busgap.t + box.busgap.b) / 2 : Math.max(price.b, intake.b) + 18;
    const xs = lanes.map(cx);
    let gutter = null;
    if (cho && lanes.length) {
      const probe = cho.l + 14;
      const blocked = lanes.some((n) => probe > n.l + 2 && probe < n.r - 2 && n.t < cho.t);
      gutter = blocked ? Math.max(4, Math.min(...lanes.map((n) => n.l), cho.l) - 12) : null;
    }
    const busXs = xs.slice();
    if (cho) busXs.push(gutter == null ? cho.l + 14 : gutter);
    const busL = Math.min(...busXs, cx(price));
    const busR = Math.max(...busXs, cx(price));
    add('disp', [[cx(price), price.b], [cx(price), busY]]);
    add('disp', [[busL, busY], [busR, busY]]);
    for (const node of lanes) add('disp', [[cx(node), busY], [cx(node), node.t - 1]]);
    if (cho) {
      if (gutter == null) add('disp', [[cho.l + 14, busY], [cho.l + 14, cho.t - 1]]);
      else add('disp', [[gutter, busY], [gutter, midY(cho)], [cho.l - 1, midY(cho)]]);
    }
    if (cho) {
      for (const node of gated) {
        if (node.b < cho.t - 4 && cx(node) > cho.l + 4 && cx(node) < cho.r - 4) {
          add('review', [[cx(node), node.b + 1], [cx(node), cho.t - 1]]);
        }
      }
    }
    return segs;
  }

  function orient(a, b, c) {
    const v = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    if (Math.abs(v) < 0.8) return 0;
    return v > 0 ? 1 : -1;
  }

  function properIntersect(a, b, c, d) {
    const o1 = orient(a, b, c), o2 = orient(a, b, d), o3 = orient(c, d, a), o4 = orient(c, d, b);
    if (o1 === 0 || o2 === 0 || o3 === 0 || o4 === 0) return false;
    return o1 !== o2 && o3 !== o4;
  }

  function flatten(segs) {
    const out = [];
    for (const s of segs) {
      for (let i = 1; i < s.pts.length; i++) out.push({ a: s.pts[i - 1], b: s.pts[i], cls: s.cls });
    }
    return out;
  }

  function crossings(segs) {
    const flat = flatten(segs);
    const hits = [];
    for (let i = 0; i < flat.length; i++) {
      for (let j = i + 1; j < flat.length; j++) {
        if (properIntersect(flat[i].a, flat[i].b, flat[j].a, flat[j].b)) {
          hits.push(flat[i].cls + '×' + flat[j].cls);
        }
      }
    }
    return hits;
  }

  function inside(x, y, n, pad) {
    return x > n.l + pad && x < n.r - pad && y > n.t + pad && y < n.b - pad;
  }

  /* A wire may touch a plate only at the entry edge. Interior hits are a tangle. */
  function interiorHits(segs, box) {
    const hits = [];
    const nodes = Object.entries(box);
    for (const seg of flatten(segs)) {
      for (let t = 0.15; t <= 0.85; t += 0.35) {
        const x = seg.a[0] + (seg.b[0] - seg.a[0]) * t;
        const y = seg.a[1] + (seg.b[1] - seg.a[1]) * t;
        for (const [id, n] of nodes) {
          if (n && inside(x, y, n, 2)) hits.push(seg.cls + ' through ' + id);
        }
      }
    }
    return hits;
  }

  function flowPersonIds(end) {
    return (end || []).map((e) => e.id).filter(Boolean);
  }

  /* Feed key for the trading board stays KAL. Plates and chips say TRADING. */
  function boardTag(code) {
    return code === 'KAL' ? 'TRADING' : (code || '');
  }

  return {
    OPS, DES, FILES, BY_ID, missionText, slugOf, faceFile, routeOrbat, crossings, interiorHits, flowPersonIds, boardTag,
  };
});
