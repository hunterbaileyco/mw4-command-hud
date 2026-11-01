/* TF141 operator files + ORBAT wire router.
   Cho is a creative checkpoint, not a manager. Price is the only dispatcher.
   Flow is Kal → Price → lane. Do not add reporting lines.
   Kal = intake. Ghost = trading. Ju Kwon = Kinsora ops. Dunn = personal (no Ops suffix). */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.MW4Roster = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const OPS = ['Price', 'Ghost', 'Cho', 'West', 'Ko', 'Park', 'Jae', 'Ju Kwon', 'Soap', 'Gaz', 'Kal'];
  const DES = {
    Price: 'BRAVO-6', Ghost: '141-01', Cho: '141-02', West: '141-03', Ko: '141-04',
    Park: '141-05', Jae: '141-06', Dunn: '141-07', Soap: '141-08', Gaz: '141-09', Kal: '141-10',
    'Ju Kwon': 'EXT-01',
  };

  const p = (id) => ({ id });
  const lab = (label) => ({ label });

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
      to: [lab('ALL 9 LANES')],
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
      to: [lab('KAL BOARD')],
      map: 'Trading',
    },
    {
      id: 'cho', name: 'Cho', des: '141-02', unit: 'CREATIVE GATE', board: 'CMD', stamp: 'CREATIVE GATE',
      role: 'Creative gate — the checkpoint West, Jae, Park and Ju Kwon’s creative passes before it ships',
      does: [
        'Reviews CF / creative output from West, Jae, Park and Ju Kwon',
        'Passes it or sends it back with notes — brand + voice are the bar',
        'One checkpoint on the way out, not a reporting line',
      ],
      not: 'Doesn’t manage, assign or re-prioritise West / Jae / Park / Ju Kwon. Price dispatches them.',
      from: [p('west'), p('jae'), p('park'), p('ju')],
      to: [lab('SHIP'), lab('SEND BACK')],
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
      map: 'Media buy',
    },
    {
      id: 'gaz', name: 'Gaz', des: '141-09', unit: 'PAID · CREATIVE', board: 'CMD', stamp: 'ADS CREATIVE',
      role: 'Ads creative — hooks, UGC edits, statics, variants',
      does: [
        'Builds paid creative: hooks, UGC cuts, statics',
        'Feeds tested variants to Soap',
        'Iterates off Soap’s performance reads',
      ],
      not: 'Doesn’t set budgets or buy media (Soap).',
      from: [p('price'), lab('SOAP READS')],
      to: [p('soap')],
      map: 'Ads creative',
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
      map: 'Intake → Price',
    },
    {
      id: 'ju', name: 'Ju Kwon', des: 'EXT-01', unit: 'KINSORA OPS', board: 'CMD', stamp: 'KINSORA OPS',
      role: 'Kinsora ops — Intercom, refunds, order exceptions',
      does: [
        'Intercom queue, replies, refunds per policy',
        'Order exceptions, fulfilment issues, stock checks',
        'Customer-facing macro copy clears Cho’s gate',
      ],
      not: 'Doesn’t build site fixes — routes them to Ko through Price.',
      from: [p('price'), lab('CUSTOMERS')],
      to: [{ id: 'cho', name: 'CHO GATE' }, lab('RESOLVED')],
      map: 'Kinsora ops',
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

  /* Orthogonal wires. Dispatch stays on the outer rails and enters each lane from the top.
     Cho's review channels sit on the inner edges and run up to the gate. They do not cross. */
  function routeOrbat(box, width) {
    const W = width || 368;
    const segs = [];
    const add = (cls, pts) => segs.push({ cls, pts });
    const cx = (b) => (b.l + b.r) / 2;
    const midY = (b) => (b.t + b.b) / 2;
    const hunter = box.hunter, price = box.price, intake = box.kal, cho = box.cho;
    if (!hunter || !price || !intake || !cho) return segs;

    const yCmd = Math.min(hunter.b + 12, price.t - 6);
    add('cmd', [[cx(hunter), hunter.b], [cx(hunter), yCmd], [cx(price), yCmd], [cx(price), price.t]]);

    const overlapT = Math.max(intake.t, price.t) + 14;
    const overlapB = Math.min(intake.b, price.b) - 10;
    const yIn = overlapT < overlapB ? (overlapT + overlapB) / 2 : midY(price);
    add('intake', [[intake.r + 1, yIn], [price.l - 1, yIn]]);

    const railL = 7;
    const railR = W - 7;
    const gapTop = cho.t - price.b;
    const busY = gapTop > 16 ? price.b + Math.min(18, gapTop * 0.45) : price.b + 12;
    add('disp', [[cx(price), price.b], [cx(price), Math.min(busY, cho.t - 4)]]);
    const busDraw = Math.min(busY, cho.t - 4);
    add('disp', [[railL, busDraw], [railR, busDraw]]);
    if (cho.t > busDraw + 2) add('disp', [[cx(cho), busDraw], [cx(cho), cho.t]]);

    const taps = [
      ['west', railL], ['park', railL], ['ko', railL],
      ['jae', railR], ['ju', railR], ['gaz', railR], ['soap', railR],
    ];
    const tapYs = taps.map(([id]) => box[id] && (box[id].t - 7)).filter((y) => y != null);
    if (tapYs.length) {
      const railBottom = Math.max(...tapYs);
      add('disp', [[railL, busDraw], [railL, railBottom]]);
      add('disp', [[railR, busDraw], [railR, railBottom]]);
    }
    for (const [id, railX] of taps) {
      const node = box[id];
      if (!node) continue;
      const y = node.t - 7;
      add('disp', [[railX, y], [cx(node), y], [cx(node), node.t]]);
    }

    const leftEdge = Math.max(box.west ? box.west.r : 0, box.park ? box.park.r : 0);
    const rightEdge = Math.min(box.jae ? box.jae.l : W, box.ju ? box.ju.l : W);
    const gutter = rightEdge - leftEdge;
    const xL = gutter > 12 ? leftEdge + Math.min(10, gutter * 0.3) : leftEdge + 6;
    const xR = gutter > 12 ? rightEdge - Math.min(10, gutter * 0.3) : rightEdge - 6;
    const yJoin = cho.b + 3;
    function review(node, xChan, fromRight) {
      if (!node) return;
      const y = midY(node);
      const x0 = fromRight ? node.l : node.r;
      const xMeet = fromRight ? Math.min(cho.r - 8, Math.max(xChan, cx(cho) + 8)) : Math.max(cho.l + 8, Math.min(xChan, cx(cho) - 8));
      add('review', [[x0, y], [xChan, y], [xChan, yJoin], [xMeet, yJoin]]);
    }
    review(box.west, xL, false);
    review(box.park, xL, false);
    review(box.jae, xR, true);
    review(box.ju, xR, true);

    if (box.gaz && box.soap) {
      const yFeed = (midY(box.gaz) + midY(box.soap)) / 2;
      add('feed', [[box.gaz.r + 1, yFeed], [box.soap.l - 1, yFeed]]);
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

  return {
    OPS, DES, FILES, BY_ID, missionText, slugOf, routeOrbat, crossings, interiorHits, flowPersonIds,
  };
});
