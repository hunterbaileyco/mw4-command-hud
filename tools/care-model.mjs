// Normalize a care@ clear drop into the hub Care contract.
// Missing KPI fields stay null. Nothing numeric is invented here.
const MAILBOX = 'care@kinsora.co';

function numOrNull(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function strOrNull(v) {
  if (v == null || v === '') return null;
  const s = String(v).trim();
  return s || null;
}

export function normalizeCareModel(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    const err = new Error('care drop is not an object');
    err.code = 'BAD_MODEL';
    throw err;
  }
  const mailbox = String(raw.mailbox || '').trim();
  if (mailbox !== MAILBOX) {
    const err = new Error('care drop mailbox must be care@kinsora.co');
    err.code = 'BAD_MODEL';
    throw err;
  }
  const k = raw.kpis && typeof raw.kpis === 'object' ? raw.kpis : {};
  const spark = raw.spark24h && typeof raw.spark24h === 'object' ? raw.spark24h : {};
  const bars = Array.isArray(spark.bars) ? spark.bars.flatMap((b) => {
    if (!b || (b.dir !== 'in' && b.dir !== 'out')) return [];
    const h = numOrNull(b.h);
    if (h == null) return [];
    return [{ dir: b.dir, h: Math.max(0, Math.min(24, h)) }];
  }) : [];
  const mix = Array.isArray(raw.mix) ? raw.mix.flatMap((m) => {
    if (!m || m.key == null || String(m.key).trim() === '') return [];
    return [{ key: String(m.key).trim(), pct: numOrNull(m.pct) }];
  }) : [];
  const queue = Array.isArray(raw.queue) ? raw.queue.flatMap((item) => {
    if (!item || item.id == null || String(item.id).trim() === '') return [];
    return [{
      id: String(item.id).trim(),
      title: String(item.title || ''),
      detail: String(item.detail || ''),
      ageLabel: strOrNull(item.ageLabel),
      hot: item.hot === true,
    }];
  }) : [];
  const notes = Array.isArray(raw.notes) ? raw.notes.filter((n) => n != null && String(n).trim() !== '').map((n) => String(n)) : [];
  return {
    source: raw.source === 'live' ? 'live' : 'sample',
    owner: strOrNull(raw.owner) || 'Laswell',
    lane: 'care',
    mailbox: MAILBOX,
    asOf: strOrNull(raw.asOf),
    generatedAt: strOrNull(raw.generatedAt),
    kpis: {
      open: numOrNull(k.open),
      waitingOnUs: numOrNull(k.waitingOnUs),
      oldestLabel: strOrNull(k.oldestLabel),
      medianFirstReplyLabel: strOrNull(k.medianFirstReplyLabel),
    },
    spark24h: { in: numOrNull(spark.in), out: numOrNull(spark.out), bars },
    mix,
    queue,
    notes,
  };
}

export const DEFAULT_DROP = '/workspace/mw4-hud/cache/care/care-in.clear.json';

export function dropPathFrom(args, env = process.env) {
  if (args && Object.prototype.hasOwnProperty.call(args, 'in')) return args.in;
  const fromEnv = String(env.MW4_CARE_DROP || '').trim();
  if (fromEnv) return fromEnv;
  return DEFAULT_DROP;
}

export function parseArgs(argv) {
  return Object.fromEntries(argv.reduce((a, v, i, arr) =>
    v.startsWith('--') ? [...a, [v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : '']] : a, []));
}
