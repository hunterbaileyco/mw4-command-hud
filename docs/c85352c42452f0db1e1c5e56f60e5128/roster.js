/* Callsign → role. Label data only. Avatars and AES-GCM are untouched.
   Locked roster (2026-11-01): Price is the sole dispatcher.
   Flow is Kal → Price → lane.
   Kal = Intake. Ghost = Trading. Ju Kwon = Kinsora ops.
   Dunn = Personal (no Ops suffix).
   Cho, West, Ko, Park, Jae, Soap, Gaz are unchanged and carry no role string here. */
(function (root) {
  const OPS = ['Price', 'Ghost', 'Cho', 'West', 'Ko', 'Park', 'Jae', 'Dunn', 'Soap', 'Gaz', 'Kal', 'Ju Kwon'];
  const ROLE = {
    Price: 'Dispatcher',
    Kal: 'Intake',
    Ghost: 'Trading',
    'Ju Kwon': 'Kinsora ops',
    Dunn: 'Personal',
  };
  const FLOW = 'Kal → Price → lane';
  function role(op) { return ROLE[op] || ''; }
  function designator(op) {
    if (op === 'Price') return 'BRAVO-6';
    const i = OPS.indexOf(op);
    return i < 0 ? '' : '141-' + String(i).padStart(2, '0');
  }
  function slug(op) { return String(op || '').toLowerCase().replace(/\s+/g, '-'); }
  root.MW4Roster = { OPS: OPS, ROLE: ROLE, FLOW: FLOW, role: role, designator: designator, slug: slug };
})(window);
