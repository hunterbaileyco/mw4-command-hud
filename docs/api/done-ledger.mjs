// Completion ledger for Command cards read from Notion.
// doneToday still comes from status-model: the card is on Done, and the latest
// genuine Done-entry falls on today's America/Los_Angeles date.
// A genuine entry is recorded only when a card we already track moves into Done.
// First sight of a card that is already Done stores nothing (doneAt stays null).
// Reopening leaves the row in the ledger and drops the card off the Done list,
// so the count goes to 0. Completing again appends a later entry, so the count
// is 1. A repeated observation of the same Done state does not append.
//
// This module never writes mw4/status-live.json or a status.json file.
// The persistent store interface is disabled: append refuses.

import { listsOf } from './status-model.mjs';

const PRODUCTION_BLOB = 'mw4/status-live.json';

export function trelloIdTail(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const parts = raw.split('/').filter(Boolean);
  const tail = parts.length ? parts[parts.length - 1] : raw;
  return tail.split('?')[0].split('#')[0];
}

function indexDump(dump) {
  const lists = listsOf(dump || {});
  const out = new Map();
  for (const list of ['doing', 'waiting', 'backlog', 'done']) {
    for (const card of lists[list] || []) {
      const id = trelloIdTail(card.id);
      if (id) out.set(id, list);
    }
  }
  return out;
}

function sameEntry(entry, id, at) {
  return entry && entry.id === id && entry.at === at && entry.into === 'Done';
}

// previousDump is the last good Command dump. nextDump is the dump just mapped.
// `at` is sourceObservedAt of this successful read, never last_edited or Source as-of.
export function noteTransitions({ previousDump, nextDump, at, entries }) {
  const prev = indexDump(previousDump);
  const next = indexDump(nextDump);
  const prior = Array.isArray(entries) ? entries.slice() : [];
  const added = [];
  for (const [id, list] of next) {
    if (list !== 'done') continue;
    if (!prev.has(id)) continue;
    if (prev.get(id) === 'done') continue;
    if (prior.some((entry) => sameEntry(entry, id, at)) || added.some((entry) => sameEntry(entry, id, at))) continue;
    added.push({ id, at, into: 'Done' });
  }
  return { entries: prior.concat(added), added };
}

export function movesFromEntries(entries) {
  return (Array.isArray(entries) ? entries : []).filter((entry) => entry && entry.into === 'Done' && entry.at && entry.id).map((entry) => ({
    date: entry.at,
    listAfter: { name: 'Done' },
    card: { id: entry.id },
  }));
}

export class MemoryLedgerStore {
  constructor(seed) {
    this.entries = Array.isArray(seed) ? seed.slice() : [];
  }

  async load() {
    return this.entries.slice();
  }

  async append(rows) {
    const next = Array.isArray(rows) ? rows : [];
    for (const row of next) {
      if (!row || row.into !== 'Done') continue;
      if (this.entries.some((entry) => sameEntry(entry, row.id, row.at))) continue;
      this.entries.push({ id: row.id, at: row.at, into: 'Done' });
    }
    return this.entries.slice();
  }
}

export class DisabledPersistentLedgerStore {
  constructor(pathname) {
    this.pathname = pathname;
    this.writesEnabled = false;
  }

  async load() {
    return [];
  }

  async append() {
    const err = new Error('ledger writes disabled');
    err.code = 'LEDGER_DISABLED';
    throw err;
  }
}

export function assertLedgerPath(pathname) {
  const path = String(pathname || '').trim();
  const folded = path.replace(/\\/g, '/');
  const base = folded.split('/').filter(Boolean).pop() || '';
  if (!path || folded === PRODUCTION_BLOB || base === 'status.json' || folded.includes('status-live') || base === 'status.clear.json') {
    const err = new Error('ledger path refused');
    err.code = 'LEDGER_PATH';
    throw err;
  }
  return path;
}

// Default is an in-memory store. persistent is a separate interface that still
// refuses writes in this preview, and it refuses the production blob path.
export function createLedgerStore(env) {
  const source = env || {};
  const mode = String(source.MW4_DONE_LEDGER_STORE || 'memory').trim().toLowerCase();
  if (mode === 'persistent') {
    const path = assertLedgerPath(source.MW4_DONE_LEDGER_PATH);
    return new DisabledPersistentLedgerStore(path);
  }
  return new MemoryLedgerStore(source._ledgerSeed);
}
