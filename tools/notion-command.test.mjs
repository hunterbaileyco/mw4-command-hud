import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { board, composeStatus } from '../docs/api/status-model.mjs';
import {
  DATA_SOURCE_ID, NOTION_VERSION, loadNotionCommand, mapOperationalRows, notionApiKey,
} from '../docs/api/notion-command.mjs';
import {
  MemoryLedgerStore, createLedgerStore, movesFromEntries, noteTransitions,
} from '../docs/api/done-ledger.mjs';
import { produceTrelloStatus, runPreviewCycle } from '../docs/api/command-assemble.mjs';
import { diffCommand, renderReport, shadowFromDumps } from './shadow-diff.mjs';

const require = createRequire(import.meta.url);
const { commandSourceMode } = require('../docs/api/command-flag.js');
const live = require('../docs/api/live-status.js');

const SECRET = 'ntn_test_secret_should_not_leak_zzz';
let checks = 0;
function check(cond, message) {
  assert.equal(cond, true, message);
  checks += 1;
}

function jsonResponse(status, body, headers = {}) {
  const lower = {};
  for (const [key, value] of Object.entries(headers)) lower[key.toLowerCase()] = value;
  const raw = JSON.stringify(body == null ? {} : body);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => lower[String(name).toLowerCase()] || null },
    json: async () => body,
    text: async () => raw,
    arrayBuffer: async () => Buffer.from(raw),
  };
}

function schemaBody(mutate) {
  const properties = {
    Name: { name: 'Name', type: 'title', title: {} },
    Status: {
      name: 'Status',
      type: 'status',
      status: { options: ['Backlog', 'Doing', 'Waiting on Hunter', 'Blocked', 'Done'].map((name) => ({ name })) },
    },
    'Record role': {
      name: 'Record role',
      type: 'select',
      select: { options: ['History', 'Legacy', 'Template', 'Active'].map((name) => ({ name })) },
    },
    Lane: { name: 'Lane', type: 'multi_select', multi_select: { options: [] } },
    Hold: { name: 'Hold', type: 'checkbox', checkbox: {} },
    'Trello card ID': { name: 'Trello card ID', type: 'rich_text', rich_text: {} },
    'Source URL': { name: 'Source URL', type: 'url', url: {} },
  };
  if (mutate) mutate(properties);
  return { object: 'data_source', id: DATA_SOURCE_ID, properties };
}

function pageOf(row) {
  const rich = (text) => ({ type: 'rich_text', rich_text: [{ plain_text: text }] });
  return {
    object: 'page',
    id: `page-${row.trelloId || 'none'}`,
    url: 'https://www.notion.so/should-not-become-the-card-link',
    last_edited_time: row.lastEdited || '2012-12-12T12:12:12.000Z',
    properties: {
      Name: { type: 'title', title: [{ plain_text: row.title || '' }] },
      Status: { type: 'status', status: row.status ? { name: row.status } : null },
      'Record role': { type: 'select', select: row.recordRole ? { name: row.recordRole } : null },
      Lane: { type: 'multi_select', multi_select: (row.lanes || []).map((name) => ({ name })) },
      Hold: { type: 'checkbox', checkbox: Boolean(row.hold) },
      'Trello card ID': rich(row.trelloId || ''),
      'Source URL': { type: 'url', url: row.sourceUrl || null },
      'Source as-of': { type: 'date', date: row.sourceAsOf ? { start: row.sourceAsOf } : null },
      Started: { type: 'date', date: row.started ? { start: row.started } : null },
    },
  };
}

function queryBody(rows, { more = false, cursor = null } = {}) {
  return { object: 'list', results: rows.map(pageOf), has_more: more, next_cursor: cursor };
}

function notionFetch(pages, { schemaStatus = 200, schemaHeaders = {}, failSchema = null, schemaBodyOverride = null } = {}) {
  const calls = [];
  let query = 0;
  const fetchImpl = async (url, init) => {
    const href = String(url);
    calls.push({ href, method: (init && init.method) || 'GET', headers: (init && init.headers) || {}, body: init && init.body });
    check(!href.includes(SECRET), 'api key must stay out of the URL');
    check(!(init && init.headers && JSON.stringify(init.headers).includes('undefined')), 'headers present');
    if (failSchema) throw failSchema;
    if (!href.includes('/query')) {
      if (schemaStatus !== 200) return jsonResponse(schemaStatus, { leaked: SECRET }, schemaHeaders);
      return jsonResponse(200, schemaBodyOverride || schemaBody());
    }
    const page = pages[query] || pages[pages.length - 1];
    query += 1;
    return jsonResponse(200, page);
  };
  return { fetchImpl, calls };
}

function row(id, status, lane, extra = {}) {
  return {
    trelloId: id,
    title: extra.title || id,
    status,
    lanes: extra.lanes || (lane ? [lane] : []),
    hold: Boolean(extra.hold),
    recordRole: extra.recordRole == null ? 'Active' : extra.recordRole,
    sourceUrl: extra.sourceUrl == null ? `https://trello.com/c/${id.slice(0, 8)}` : extra.sourceUrl,
    sourceAsOf: extra.sourceAsOf || '',
    lastEdited: extra.lastEdited || '',
    started: extra.started || '',
  };
}

function counts(rows, now = Date.parse('2026-11-05T20:00:00.000Z'), moves = []) {
  const mapped = mapOperationalRows(rows);
  const built = board(mapped.dump, '', 'CMD', now, moves);
  return { mapped, built };
}

// --- flag ---
check(commandSourceMode({}) === 'trello', 'unset flag is Trello');
check(commandSourceMode({ MW4_COMMAND_SOURCE: '' }) === 'trello', 'empty flag is Trello');
check(commandSourceMode({ MW4_COMMAND_SOURCE: 'yes' }) === 'trello', 'invalid flag is Trello');
check(commandSourceMode({ MW4_COMMAND_SOURCE: ' notion ' }) === 'notion', 'notion flag enables');
check(notionApiKey({}) === '', 'missing key is empty');
check(notionApiKey({ NOTION_API_KEY: ' abc \n' }) === 'abc', 'key is trimmed and not logged here');

// --- filters and 14/7/7 ---
const active = [];
for (let i = 0; i < 14; i += 1) active.push(row(`b${String(i).padStart(2, '0')}b${String(i).padStart(2, '0')}b${String(i).padStart(2, '0')}bbbb`, 'Backlog', 'Park'));
for (let i = 0; i < 7; i += 1) active.push(row(`d${String(i).padStart(2, '0')}d${String(i).padStart(2, '0')}d${String(i).padStart(2, '0')}dddd`, 'Doing', 'Ko'));
for (let i = 0; i < 7; i += 1) active.push(row(`w${String(i).padStart(2, '0')}w${String(i).padStart(2, '0')}w${String(i).padStart(2, '0')}wwww`, 'Waiting on Hunter', 'Jae', { hold: true }));
const withNoise = active.concat([
  row('', 'Doing', 'Ko', { title: 'Template sample', recordRole: 'Template', sourceUrl: '' }),
  row('hist1hist1hist1hist1hist1', 'Done', 'West', { recordRole: 'History' }),
  row('leg1leg1leg1leg1leg1leg1', 'Done', 'West', { recordRole: 'Legacy' }),
]);
const bulk = counts(withNoise);
check(bulk.built.out.counts.backlog === 14, 'backlog 14');
check(bulk.built.out.counts.doing === 7, 'doing 7');
check(bulk.built.out.counts.waiting === 7, 'waiting 7 and Hold does not add or remove');
check(bulk.built.out.counts.doneToday === 0, 'no completion stamps on the active set');
check(!JSON.stringify(bulk.built.out).includes('Template sample'), 'template row excluded');
check(!JSON.stringify(bulk.built.out).includes('hist1hist1'), 'history row excluded');

// --- blocked, multi-lane, blank lane, links, id tail ---
const tail = 'abcdef1234567890abcdef12';
const special = counts([
  row(`ari:cloud:trello::card/ws/${tail}`, 'Doing', 'Ko', { title: 'Tail card', sourceUrl: 'https://trello.com/c/tailcard' }),
  row('blockblockblockblockblock1', 'Blocked', 'Cho', { title: 'Blocked card' }),
  row('multimultimultimultimulti1', 'Waiting on Hunter', '', { title: 'Two lanes', lanes: ['Jae', 'Ko'] }),
  row('opsopsopsopsopsopsopsops1', 'Doing', '', { title: 'Quarterly ops note', lanes: ['Ops'] }),
  row('nolaneolaneolaneolaneolane', 'Backlog', '', { title: 'No lane yet' }),
  row('holdholdholdholdholdhold1', 'Doing', 'West', { title: 'Held doing', hold: true }),
  row('ghostghostghostghostghost1', 'Doing', 'Ghost', { title: 'Named ghost' }),
  row('badlinkbadlinkbadlinkbad1', 'Doing', 'Park', { title: 'Notion link', sourceUrl: 'https://www.notion.so/private-page' }),
], Date.parse('2026-11-05T20:00:00.000Z'));
const ids = new Map();
for (const list of ['doing', 'waiting', 'backlog', 'done']) {
  for (const card of special.built.out.lists[list]) ids.set(card.id, { ...card, list });
}
check(ids.has(tail), 'card id is the Trello id tail');
check(ids.get(tail).url === 'https://trello.com/c/tailcard', 'trello source URL is kept');
check(!ids.has('blockblockblockblockblock1'), 'Blocked is excluded from lists');
check(special.mapped.warnings.some((w) => w.id === 'blockblockblockblockblock1' && w.codes.includes('blocked-excluded')), 'Blocked is flagged');
check(ids.get('multimultimultimultimulti1').lane === 'Ko', 'multi-lane preview precedence picks Ko before Jae');
check(special.mapped.warnings.some((w) => w.id === 'multimultimultimultimulti1' && w.codes.includes('multi-lane')), 'multi-lane is flagged');
check(ids.get('opsopsopsopsopsopsopsops1').lane === '', 'Ops is not a roster lane');
check(special.mapped.warnings.some((w) => w.id === 'opsopsopsopsopsopsopsops1' && w.codes.includes('unmapped-lane')), 'unmapped lane is flagged');
const composed = composeStatus({ commandDump: special.mapped.dump, kalDump: { lists: [] }, now: Date.parse('2026-11-05T20:00:00.000Z') });
check(composed.status.command.lists.backlog.find((c) => c.id === 'nolaneolaneolaneolaneolane').lane === '', 'blank Command lane');
check(composed.snap.nolaneolaneolaneolaneolane.op !== 'Ghost', 'Command does not invent Ghost');
check(ids.get('holdholdholdholdholdhold1').list === 'doing', 'Hold on a Doing card does not move it to waiting');
check(ids.get('ghostghostghostghostghost1').lane === 'Ghost', 'an explicit Ghost lane is kept');
check(ids.get('badlinkbadlinkbadlinkbad1').url === '', 'non-trello URL is not the card link');
check(special.mapped.warnings.some((w) => w.codes.includes('link-not-trello')), 'non-trello URL is flagged');
check(!JSON.stringify(composed.status).includes('2011-11-11') && !JSON.stringify(special.mapped.dump).includes('2012-12-12'), 'source as-of and last edited are not copied');

// --- ledger semantics ---
const noon = Date.parse('2026-11-05T20:00:00.000Z');
const cardId = 'done1111done1111done1111';
function doneDump(listName) {
  return { lists: [{ name: listName, cards: [{ id: cardId, name: 'Ship', desc: 'Lane: West' }] }] };
}
let entries = [];
let noted = noteTransitions({ previousDump: null, nextDump: doneDump('Done'), at: new Date(noon).toISOString(), entries });
check(noted.added.length === 0, 'first-seen already Done writes no entry');
const firstSeen = board(doneDump('Done'), '', 'CMD', noon, movesFromEntries(noted.entries));
check(firstSeen.out.lists.done[0].doneAt == null, 'first-seen doneAt is null');
check(firstSeen.out.counts.doneToday === 0, 'first-seen does not count');
noted = noteTransitions({ previousDump: doneDump('Doing'), nextDump: doneDump('Done'), at: new Date(noon).toISOString(), entries });
entries = noted.entries;
check(noted.added.length === 1, 'Doing to Done records one entry');
const shipped = board(doneDump('Done'), '', 'CMD', noon, movesFromEntries(entries));
check(shipped.out.counts.doneToday === 1, 'observed completion today counts once');
const again = noteTransitions({ previousDump: doneDump('Done'), nextDump: doneDump('Done'), at: new Date(noon + 60000).toISOString(), entries });
check(again.added.length === 0 && again.entries.length === 1, 'duplicate observation does not advance');
check(again.entries[0].at === new Date(noon).toISOString(), 'original entry time stays');
const reopened = board(doneDump('Doing'), '', 'CMD', noon, movesFromEntries(again.entries));
check(reopened.out.counts.doneToday === 0, 'reopen counts 0 while the ledger row remains');
const recompletedAt = noon + 120000;
const recompleted = noteTransitions({
  previousDump: doneDump('Doing'),
  nextDump: doneDump('Done'),
  at: new Date(recompletedAt).toISOString(),
  entries: again.entries,
});
const recount = board(doneDump('Done'), '', 'CMD', noon, movesFromEntries(recompleted.entries));
check(recount.out.counts.doneToday === 1, 'recomplete counts once at the later entry');
check(recount.out.lists.done[0].doneAt === new Date(recompletedAt).toISOString(), 'later entry wins');

const pdtNow = Date.parse('2026-11-01T21:00:00.000Z');
function countAt(at) {
  const dump = doneDump('Done');
  const moves = [{ date: at, listAfter: { name: 'Done' }, card: { id: cardId } }];
  return board(dump, '', 'CMD', pdtNow, moves).out.counts.doneToday;
}
check(countAt('2026-11-01T06:30:00.000Z') === 0, '06:30Z is still the previous PT day');
check(countAt('2026-11-01T07:17:18.633Z') === 1, '07:17Z is Nov 1 PT');
const pstNow = Date.parse('2026-11-05T20:00:00.000Z');
function countPst(at) {
  const moves = [{ date: at, listAfter: { name: 'Done' }, card: { id: cardId } }];
  return board(doneDump('Done'), '', 'CMD', pstNow, moves).out.counts.doneToday;
}
check(countPst('2026-11-05T07:30:00.000Z') === 0, '07:30Z is still Nov 4 PST');
check(countPst('2026-11-05T08:30:00.000Z') === 1, '08:30Z is Nov 5 PST');

const memory = new MemoryLedgerStore();
await memory.append(noted.added);
await memory.append(noted.added);
check((await memory.load()).length === 1, 'memory store dedupes');
assert.throws(() => createLedgerStore({ MW4_DONE_LEDGER_STORE: 'persistent', MW4_DONE_LEDGER_PATH: 'mw4/status-live.json' }), (err) => err.code === 'LEDGER_PATH');
assert.throws(() => createLedgerStore({ MW4_DONE_LEDGER_STORE: 'persistent', MW4_DONE_LEDGER_PATH: 'docs/x/status.json' }), (err) => err.code === 'LEDGER_PATH');
const refusedPath = 'tools/fixtures/preview-ledger-should-not-exist.json';
const refused = createLedgerStore({ MW4_DONE_LEDGER_STORE: 'persistent', MW4_DONE_LEDGER_PATH: refusedPath });
await assert.rejects(refused.append([{ id: 'a', at: '2026-11-05T20:00:00.000Z', into: 'Done' }]), (err) => err.code === 'LEDGER_DISABLED');
check(!fs.existsSync(refusedPath), 'disabled ledger store writes no file');

// --- notion client: pages, errors, schema, secrets ---
{
  const { fetchImpl, calls } = notionFetch([
    queryBody([row('page1page1page1page1page1', 'Doing', 'Ko')], { more: true, cursor: 'c2' }),
    queryBody([row('page2page2page2page2page2', 'Backlog', 'Park')], { more: false }),
  ]);
  const loaded = await loadNotionCommand({ apiKey: SECRET, fetchImpl });
  check(loaded.ok === true, 'two pages are a complete read');
  check(loaded.rows.length === 2, 'short last page is kept');
  check(calls.filter((call) => call.href.endsWith('/query')).length === 2, 'followed next_cursor');
  check(calls[0].headers['Notion-Version'] === NOTION_VERSION, 'pinned Notion version');
  check(calls[0].headers.Authorization === `Bearer ${SECRET}`, 'bearer header');
  check(calls.every((call) => call.href.includes(DATA_SOURCE_ID)), 'data source id');
  check(!JSON.stringify(loaded).includes(SECRET), 'success payload has no key');
}
{
  const { fetchImpl, calls } = notionFetch([queryBody([row('onlyonlyonlyonlyonlyonly1', 'Doing', 'Ko')])]);
  const loaded = await loadNotionCommand({ apiKey: SECRET, fetchImpl });
  check(loaded.ok && loaded.rows.length === 1, 'a short single page is not an error');
  check(calls.filter((call) => call.href.endsWith('/query')).length === 1, 'one query');
}
for (const status of [401, 403]) {
  const { fetchImpl, calls } = notionFetch([], { schemaStatus: status });
  const logs = [];
  const prev = console.error;
  console.error = (...args) => logs.push(args.join(' '));
  const loaded = await loadNotionCommand({ apiKey: SECRET, fetchImpl });
  console.error = prev;
  check(loaded.ok === false, `${status} fails closed`);
  check(loaded.reason === (status === 401 ? 'unauthorized' : 'forbidden'), `${status} reason`);
  check(loaded.rows.length === 0, `${status} returns no rows`);
  check(calls.length === 1, `${status} is not retried`);
  check(!JSON.stringify(loaded).includes(SECRET) && !logs.some((line) => line.includes(SECRET)), `${status} does not leak the key`);
}
{
  let tries = 0;
  const fetchImpl = async (url) => {
    tries += 1;
    if (!String(url).includes('/query') && tries === 1) return jsonResponse(429, { leaked: SECRET }, { 'retry-after': '0' });
    if (!String(url).includes('/query')) return jsonResponse(200, schemaBody());
    return jsonResponse(200, queryBody([row('rate1rate1rate1rate1rate1', 'Doing', 'Ko')]));
  };
  const loaded = await loadNotionCommand({ apiKey: SECRET, fetchImpl });
  check(loaded.ok === true, '429 Retry-After 0 retries then succeeds');
  check(!JSON.stringify(loaded).includes(SECRET), '429 body is not kept');
}
{
  const fetchImpl = async () => jsonResponse(429, { leaked: SECRET }, { 'retry-after': '30' });
  const started = Date.now();
  const loaded = await loadNotionCommand({ apiKey: SECRET, fetchImpl });
  check(loaded.reason === 'rate-limit', 'Retry-After above the cap fails closed');
  check(Date.now() - started < 5000, 'does not sleep the full Retry-After');
  check(!JSON.stringify(loaded).includes(SECRET), 'rate-limit result has no key');
}
{
  const err = new Error(`timeout ${SECRET}`);
  err.name = 'TimeoutError';
  const { fetchImpl, calls } = notionFetch([], { failSchema: err });
  const loaded = await loadNotionCommand({ apiKey: SECRET, fetchImpl });
  check(loaded.reason === 'timeout' && calls.length === 1, 'timeout fails closed without retry');
  check(!JSON.stringify(loaded).includes(SECRET), 'timeout error text is dropped');
}
{
  const { fetchImpl } = notionFetch([], { schemaBodyOverride: schemaBody((props) => { delete props['Record role']; }) });
  const loaded = await loadNotionCommand({ apiKey: SECRET, fetchImpl });
  check(loaded.reason === 'schema' && loaded.rows.length === 0, 'schema drift fails closed');
}
{
  const { fetchImpl } = notionFetch([
    queryBody([row('partialpartialpartialpart1', 'Doing', 'Ko')], { more: true, cursor: 'next' }),
  ]);
  const loaded = await loadNotionCommand({ apiKey: SECRET, fetchImpl, pageCap: 1 });
  check(loaded.reason === 'partial' && loaded.rows.length === 0, 'page cap with has_more is partial and discards rows');
}
{
  const { fetchImpl } = notionFetch([queryBody([])]);
  const loaded = await loadNotionCommand({ apiKey: SECRET, fetchImpl });
  check(loaded.reason === 'empty', 'valid empty read is not a transport error');
}

// --- byte-identical Trello output when the flag is off ---
const commandDump = { lists: [{ name: 'Doing', cards: [{ id: 'c1', name: 'Ko: Gate', desc: 'Lane: Ko', shortUrl: 'https://trello.com/c/c1' }] }] };
const kalDump = { lists: [{ name: 'Waiting on Hunter', cards: [{ id: 'k1', name: 'Ghost: Tape', desc: 'Lane: Ghost', shortUrl: 'https://trello.com/c/k1' }] }] };
const now = Date.parse('2026-11-05T20:00:00.000Z');
const trelloInput = { commandDump, kalDump, commandMoves: [], kalMoves: [], now };
check(JSON.stringify(produceTrelloStatus(trelloInput)) === JSON.stringify(composeStatus(trelloInput).status), 'flag-off composer matches composeStatus');
check(!('sourceObservedAt' in produceTrelloStatus(trelloInput).command), 'Trello status has no preview clock');

// --- isolated legs ---
const t1 = Date.parse('2026-11-05T18:00:00.000Z');
const t2 = Date.parse('2026-11-05T20:00:00.000Z');
const t3 = Date.parse('2026-11-05T21:00:00.000Z');
function notionResult(rows) {
  return { ok: true, reason: '', rows };
}
let state = { command: null, kal: null, entries: [] };
state = runPreviewCycle(state, {
  apiKeyPresent: true,
  notion: notionResult([row('cmd1cmd1cmd1cmd1cmd1cmd1', 'Doing', 'Ko', { title: 'Gate' })]),
  kalTrello: { ok: true, dump: kalDump, actions: [] },
  now: t1,
}).next;
let cycle = runPreviewCycle(state, {
  apiKeyPresent: true,
  notion: notionResult([row('cmd1cmd1cmd1cmd1cmd1cmd1', 'Doing', 'Ko', { title: 'Gate' })]),
  kalTrello: { ok: false },
  now: t2,
});
check(cycle.ok === true, 'kal failure still assembles from last-good kal');
check(cycle.status.kal.counts.waiting === 1, 'kal failure does not zero kal');
check(cycle.status.command.counts.doing === 1, 'command remains');
check(cycle.status.updatedAt === new Date(t1).toISOString(), 'freshness stays on the older leg');
check(cycle.persist === false, 'preview cycle does not persist');
state = cycle.next;
cycle = runPreviewCycle(state, {
  apiKeyPresent: true,
  notion: { ok: false, reason: 'unauthorized', rows: [] },
  kalTrello: { ok: true, dump: { lists: [{ name: 'Waiting on Hunter', cards: [{ id: 'k1', name: 'Ghost: Tape', desc: 'Lane: Ghost' }, { id: 'k2', name: 'Ghost: Second', desc: 'Lane: Ghost' }] }] }, actions: [] },
  now: t3,
});
check(cycle.status.command.counts.doing === 1, 'command failure does not zero command');
check(cycle.status.kal.counts.waiting === 2, 'kal can move while command is held');
check(cycle.commandReason === 'unauthorized', 'unauthorized is distinct');
check(cycle.status.command.sourceObservedAt === new Date(t2).toISOString(), 'failed command clock does not advance');
check(cycle.status.updatedAt === new Date(t2).toISOString(), 'bundle freshness stays on the failed command');
state = cycle.next;
cycle = runPreviewCycle(state, {
  apiKeyPresent: true,
  notion: { ok: false, reason: 'empty', rows: [] },
  kalTrello: { ok: true, dump: kalDump, actions: [] },
  now: t2,
});
check(cycle.commandReason === 'empty', 'empty is distinct from unauthorized');
check(cycle.status.command.counts.doing === 1, 'empty read does not replace last-good command');
check(!JSON.stringify(cycle.status).includes(SECRET), 'assembled status has no key');

const invalidBlocked = runPreviewCycle(state, {
  apiKeyPresent: true,
  notion: notionResult([
    row('cmd1cmd1cmd1cmd1cmd1cmd1', 'Doing', 'Ko', { title: 'Gate' }),
    row('blockblockblockblockblock1', 'Blocked', 'Cho', { title: 'Do not file' }),
  ]),
  kalTrello: { ok: true, dump: kalDump, actions: [] },
  now: t3,
  mapConfig: { blocked: 'waiting' },
});
check(invalidBlocked.commandReason === 'config', 'an unknown Blocked placement is rejected');
check(invalidBlocked.status.command.counts.doing === 1, 'rejected Blocked mode keeps the last good command');
check(!(invalidBlocked.status.command.lists.waiting || []).some((card) => card.id === 'blockblockblockblockblock1'), 'Blocked is not forced into waiting');

// no last-good and both legs down: do not publish zeros
const held = runPreviewCycle({ command: null, kal: null, entries: [] }, {
  apiKeyPresent: true,
  notion: { ok: false, reason: 'partial', rows: [] },
  kalTrello: { ok: false },
  now: t2,
});
check(held.ok === false && held.status == null && held.persist === false, 'no last-good and a failed read publishes nothing');

// --- refreshLive: flag off writes; flag on does not ---
function memoryStore() {
  const store = { writes: 0, text: null };
  store.read = async () => store.text;
  store.write = async (body) => { store.writes += 1; store.text = body; };
  return store;
}
function trelloRouter(commandLists, tradingLists) {
  return async (url) => {
    const href = String(url);
    if (href.includes('/lists')) {
      const id = href.split('/boards/')[1].split('/')[0];
      const body = id === live.BOARDS.command.id ? commandLists : tradingLists;
      return { ok: true, status: 200, json: async () => body };
    }
    if (href.includes('/actions')) return { ok: true, status: 200, json: async () => [] };
    return { ok: false, status: 404, json: async () => ({}) };
  };
}
const commandLists = [{ name: 'Doing', cards: [{ id: 'c1', name: 'Ko: Gate', desc: 'Lane: Ko', shortUrl: 'https://trello.com/c/c1', labels: [] }] }];
const tradingLists = [{ name: 'Waiting on Hunter', cards: [{ id: 'k1', name: 'Ghost: Tape', desc: 'Lane: Ghost', shortUrl: 'https://trello.com/c/k1', labels: [] }] }];
{
  live.resetCaches();
  const store = memoryStore();
  const file = await live.encryptStatus({
    updatedAt: '2026-11-01T00:00:00.000Z',
    command: { lists: { doing: [], waiting: [], backlog: [], done: [] }, counts: {} },
    kal: { lists: { doing: [], waiting: [], backlog: [], done: [] }, counts: {} },
    events: [],
  }, 'test-pass', Buffer.from('0123456789abcdef').toString('base64'), 1000);
  const written = await live.refreshLive({
    now,
    pass: 'test-pass',
    auth: { key: 'k', token: 't' },
    fetchImpl: trelloRouter(commandLists, tradingLists),
    store,
    readFileEnv: () => file,
    env: {},
  });
  check(store.writes === 1 && written.skipped === '', 'unset flag still persists the Trello envelope');
  const clear = JSON.parse((await live.decryptEnv(JSON.parse(store.text).env, 'test-pass')).toString('utf8'));
  const expected = composeStatus({
    commandDump: { lists: commandLists.map((list) => ({ name: list.name, cards: list.cards.map((card) => ({ ...card, description: card.desc, lastActivityAt: '' })) })) },
    kalDump: { lists: tradingLists.map((list) => ({ name: list.name, cards: list.cards.map((card) => ({ ...card, description: card.desc, lastActivityAt: '' })) })) },
    prev: {
      snap: {},
      events: [],
    },
    now,
  }).status;
  // The coupled path rebuilds dumps through dumpFromLists, which copies the same card fields.
  check(clear.command.counts.doing === expected.command.counts.doing, 'coupled command count matches');
  check(clear.kal.counts.waiting === expected.kal.counts.waiting, 'coupled kal count matches');
  check(clear.updatedAt === expected.updatedAt, 'coupled updatedAt matches');
  check(!('sourceObservedAt' in clear.command), 'coupled payload has no Notion clock');
}
{
  live.resetCaches();
  const store = memoryStore();
  const notionPages = [queryBody([row('cmd1cmd1cmd1cmd1cmd1cmd1', 'Doing', 'Ko', { title: 'Gate', sourceUrl: 'https://trello.com/c/gate' })])];
  const { fetchImpl } = notionFetch(notionPages);
  const mixed = async (url, init) => {
    if (String(url).includes('api.notion.com')) return fetchImpl(url, init);
    return trelloRouter(commandLists, tradingLists)(url, init);
  };
  const first = await live.refreshLive({
    now: t1,
    auth: { key: 'k', token: 't' },
    fetchImpl: mixed,
    store,
    seedFromFile: false,
    env: { MW4_COMMAND_SOURCE: 'notion', NOTION_API_KEY: SECRET },
  });
  check(store.writes === 0 && first.persist === false && first.skipped === 'preview-no-persist', 'notion flag does not write the blob');
  check(first.model.command.counts.doing === 1 && first.model.kal.counts.waiting === 1, 'preview model has both legs');
  check(!JSON.stringify(first).includes(SECRET), 'refresh result has no key');
  const secondFetch = async (url, init) => {
    if (String(url).includes('api.notion.com')) return fetchImpl(url, init);
    if (String(url).includes(live.BOARDS.trading.id)) throw Object.assign(new Error('trading down'), { name: 'TimeoutError' });
    return trelloRouter(commandLists, tradingLists)(url, init);
  };
  const second = await live.refreshLive({
    now: t2,
    auth: { key: 'k', token: 't' },
    fetchImpl: secondFetch,
    store,
    seedFromFile: false,
    env: { MW4_COMMAND_SOURCE: 'notion', NOTION_API_KEY: SECRET },
  });
  check(store.writes === 0, 'kal failure still does not write');
  check(second.model.kal.counts.waiting === 1, 'refreshLive kal failure does not zero kal');
  check(second.model.command.counts.doing === 1, 'command survives kal failure');
  const thirdFetch = async (url, init) => {
    if (String(url).includes('api.notion.com') && !String(url).includes('/query')) return jsonResponse(401, { leaked: SECRET });
    return trelloRouter(commandLists, [
      { name: 'Waiting on Hunter', cards: [{ id: 'k1', name: 'Ghost: Tape', desc: 'Lane: Ghost', shortUrl: 'https://trello.com/c/k1', labels: [] }, { id: 'k2', name: 'Ghost: Two', desc: 'Lane: Ghost', shortUrl: 'https://trello.com/c/k2', labels: [] }] },
    ])(url, init);
  };
  const third = await live.refreshLive({
    now: t3,
    auth: { key: 'k', token: 't' },
    fetchImpl: thirdFetch,
    store,
    seedFromFile: false,
    env: { MW4_COMMAND_SOURCE: 'notion', NOTION_API_KEY: SECRET },
  });
  check(third.commandReason === 'unauthorized', 'refreshLive reports unauthorized');
  check(third.model.command.counts.doing === 1, 'unauthorized does not zero command');
  check(third.model.kal.counts.waiting === 2, 'kal updates while command is held');
  check(third.model.updatedAt === new Date(t2).toISOString(), 'bundle freshness does not jump past the failed command');
  check(third.model.command.sourceObservedAt === new Date(t2).toISOString(), 'command observedAt stays on the last good read');
  check(!JSON.stringify(third).includes(SECRET), 'unauthorized refresh has no key');
  const emptyFetch = async (url, init) => {
    if (String(url).includes('api.notion.com')) {
      if (!String(url).includes('/query')) return jsonResponse(200, schemaBody());
      return jsonResponse(200, queryBody([]));
    }
    return trelloRouter(commandLists, tradingLists)(url, init);
  };
  const empty = await live.refreshLive({
    now: t2,
    auth: { key: 'k', token: 't' },
    fetchImpl: emptyFetch,
    store,
    seedFromFile: false,
    env: { MW4_COMMAND_SOURCE: 'notion', NOTION_API_KEY: SECRET },
  });
  check(empty.commandReason === 'empty', 'empty source is labeled empty');
  check(empty.model.command.counts.doing === 1, 'empty source does not wipe command');
}

// fallback to Trello when the flag is notion and the key is absent
{
  live.resetCaches();
  const store = memoryStore();
  let notionCalls = 0;
  const fetchImpl = async (url, init) => {
    if (String(url).includes('api.notion.com')) { notionCalls += 1; return jsonResponse(500, {}); }
    return trelloRouter(commandLists, tradingLists)(url, init);
  };
  const fallback = await live.refreshLive({
    now,
    auth: { key: 'k', token: 't' },
    fetchImpl,
    store,
    seedFromFile: false,
    env: { MW4_COMMAND_SOURCE: 'notion' },
  });
  check(notionCalls === 0, 'absent key does not call Notion');
  check(fallback.commandSource === 'trello-fallback', 'absent key falls back to Trello');
  check(fallback.model.command.counts.doing === 1 && store.writes === 0, 'fallback still does not write the blob');
}

// sample shadow report
{
  const result = shadowFromDumps({
    notionDump: JSON.parse(fs.readFileSync('tools/fixtures/notion-shadow-rows.json', 'utf8')),
    trelloDump: JSON.parse(fs.readFileSync('tools/fixtures/trello-shadow-command.json', 'utf8')),
    now: Date.parse('2026-11-05T20:00:00.000Z'),
  });
  check(result.diff.doneToday.notion === 0 && result.diff.doneToday.trello === 1, 'sample diff keeps a real Trello completion and a null Notion one');
  check(result.diff.lane.some((item) => item.id === 'bbb222bbb222bbb222bbb222'), 'sample diff flags the multi-lane card');
  check(result.diff.warnings.some((warning) => warning.id === 'eee555eee555eee555eee555'), 'sample diff lists the blocked card');
  check(!result.diff.onlyNotion.includes('fff666fff666fff666fff666'), 'history id is not a notion-only feed card');
  const report = renderReport(result, { now: '2026-11-05T20:00:00.000Z', notion: 'notion-shadow-rows.json', trello: 'trello-shadow-command.json' });
  check(!report.includes(SECRET) && !report.includes('2011-11-11') && !report.includes('2012-12-12'), 'sample report omits secrets and ignored clocks');
  check(fs.readFileSync('tools/fixtures/shadow-sample-report.md', 'utf8') === report, 'committed sample report matches the tool');
  check(diffCommand(result.notion, result.trello, result.warnings).waiting.notion === 1, 'waiting count is present');
}

console.log(`notion command checks ok (${checks})`);
