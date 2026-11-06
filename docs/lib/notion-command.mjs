// Preview reader for the Kinsora Command board on the Notion Tasks data source.
// Kal / Trading is not read here. The API key is NOTION_API_KEY and is only sent
// as an Authorization header. It is never written into errors, rows, or logs.
//
// Preview defaults (Blocked and multi-lane are undecided product rules):
// - Blocked cards are left out of Doing / Waiting / Backlog / Done and listed
//   in warnings with code blocked-excluded.
// - Lane is a multi-select. Exactly one value that matches the roster is used.
//   Several roster matches use LANES order (Ju Kwon, Price, West, Ko, Cho, Jae,
//   Park, Dunn, Ghost, Soap, Gaz, Kal, Laswell) and the card is flagged
//   multi-lane. No roster match leaves the lane blank and flags unmapped-lane.
//   Command never receives the Ghost fallback used for Kal cards.
// - Hold is ignored when choosing a list. Waiting is only status "Waiting on Hunter".
// - Operational rows are Record role "Current work". History, Legacy, and
//   Template prefixes are excluded. Any other role fails the read closed.
//   Notion is a superset of the open Command board. A Current work row whose
//   Trello id is not on that board stays in the feed and is notionOnly in the
//   diff. It is not a failed read.
// - If a Trello card id exists, it is the card id and the Trello Source URL is
//   the url, including cards from other boards. If it does not, the id is
//   `notion:` plus the Notion page id with dashes removed (preview default,
//   pending a product decision). That cannot collide with a 24-character
//   Trello id. The url is the Notion page URL, which the Trello-only link
//   allowlists ignore. The row is flagged no-trello-id.
// - Primary lane (single select) and Completed date (date) are optional.
//   Resolve them by name. MW4_NOTION_PRIMARY_LANE_ID and
//   MW4_NOTION_COMPLETED_DATE_ID select by property id when Price sends them.
//   A set Primary lane that matches the roster overrides the multi-select
//   order. An unknown value warns and falls back to that order. A set
//   Completed date is the Done-entry time. A null Completed date leaves
//   doneToday unknown. Last edited, import time, and Source as-of are never
//   that time.
// - Source as-of, Last edited, Started, and import time are not completion
//   times and are not freshness.

import { LANES, board, hitLane } from '../api/status-model.mjs';
import { trelloIdTail } from './done-ledger.mjs';

export const NOTION_VERSION = '2025-09-03';
export const DATA_SOURCE_ID = '40f16968-1b6f-8076-ad36-000b28dac4ff';
export const PAGE_SIZE = 100;
export const PAGE_CAP = 25;
export const REQUEST_TIMEOUT_MS = 8000;
export const BUDGET_MS = 20000;
export const MAX_429_RETRIES = 3;
export const RETRY_AFTER_CAP_MS = 2000;
// Preview default until a product decision: stable, not a Trello id.
export const NOTION_PAGE_ID_PREFIX = 'notion:';

const STATUS_OPTIONS = ['Backlog', 'Doing', 'Waiting on Hunter', 'Blocked', 'Done'];
const ROLE_PREFIXES = ['history', 'legacy', 'template'];
const REQUIRED_PROPS = ['Status', 'Record role', 'Lane', 'Hold', 'Trello card ID', 'Source URL'];

// operational = Current work. History / Legacy / Template prefixes are archive.
// Anything else, including a blank role, is unknown and must fail closed.
export function classifyRecordRole(role) {
  const text = String(role ?? '').trim();
  if (text === 'Current work') return 'operational';
  const lower = text.toLowerCase();
  if (ROLE_PREFIXES.some((prefix) => lower.startsWith(prefix))) return 'excluded';
  return 'unknown';
}

export function notionPageCardId(pageId) {
  const compact = String(pageId || '').replace(/-/g, '').trim().toLowerCase();
  if (!compact) return '';
  return NOTION_PAGE_ID_PREFIX + compact;
}

export function propertyRefs(env) {
  const source = env || {};
  return {
    primaryLaneId: String(source.MW4_NOTION_PRIMARY_LANE_ID || '').trim(),
    completedDateId: String(source.MW4_NOTION_COMPLETED_DATE_ID || '').trim(),
  };
}

export function notionApiKey(env) {
  const source = env || {};
  return String(source.NOTION_API_KEY == null ? '' : source.NOTION_API_KEY).replace(/[\r\n]+$/g, '').trim();
}

export class NotionReadError extends Error {
  constructor(code) {
    super(code);
    this.name = 'NotionReadError';
    this.code = code;
  }
}

function fail(code) {
  throw new NotionReadError(code);
}

function assertNever(value) {
  void value;
  throw new NotionReadError('config');
}

function listForStatus(status) {
  switch (status) {
    case 'Backlog':
      return 'Backlog';
    case 'Doing':
      return 'Doing';
    case 'Waiting on Hunter':
      return 'Waiting on Hunter';
    case 'Done':
      return 'Done';
    case 'Blocked':
      return null;
    default:
      return null;
  }
}

function blockedMode(mode) {
  switch (mode) {
    case 'exclude':
      return 'exclude';
    default:
      assertNever(mode);
      return 'exclude';
  }
}

function plainRich(items) {
  if (!Array.isArray(items)) return '';
  return items.map((item) => (item && item.plain_text) || '').join('');
}

function propText(prop) {
  if (!prop || typeof prop !== 'object') return '';
  switch (prop.type) {
    case 'title':
      return plainRich(prop.title);
    case 'rich_text':
      return plainRich(prop.rich_text);
    case 'url':
      return prop.url || '';
    case 'status':
      return (prop.status && prop.status.name) || '';
    case 'select':
      return (prop.select && prop.select.name) || '';
    case 'checkbox':
      return prop.checkbox ? 'true' : '';
    case 'date':
      return (prop.date && prop.date.start) || '';
    case 'formula': {
      const formula = prop.formula || {};
      if (formula.type === 'string') return formula.string || '';
      if (formula.type === 'number' && formula.number != null) return String(formula.number);
      return '';
    }
    case 'unique_id': {
      const unique = prop.unique_id || {};
      if (unique.number == null) return '';
      return `${unique.prefix || ''}${unique.number}`;
    }
    default:
      return '';
  }
}

function propMulti(prop) {
  if (!prop || prop.type !== 'multi_select' || !Array.isArray(prop.multi_select)) return [];
  return prop.multi_select.map((item) => (item && item.name) || '').filter(Boolean);
}

function propCheck(prop) {
  return Boolean(prop && prop.type === 'checkbox' && prop.checkbox);
}

function titleOf(properties) {
  const props = properties || {};
  for (const prop of Object.values(props)) {
    if (prop && prop.type === 'title') return plainRich(prop.title).trim();
  }
  return '';
}

function findProp(properties, name, id) {
  if (!properties || typeof properties !== 'object') return null;
  if (id) {
    const byId = Object.values(properties).find((prop) => prop && prop.id === id);
    if (byId) return byId;
  }
  if (properties[name]) return properties[name];
  return Object.values(properties).find((prop) => prop && prop.name === name) || null;
}

export function pageToRow(page, refs = {}) {
  const properties = (page && page.properties) || {};
  const trelloRaw = propText(findProp(properties, 'Trello card ID', ''));
  const sourceUrl = propText(findProp(properties, 'Source URL', '')).trim();
  const primaryProp = findProp(properties, 'Primary lane', refs.primaryLaneId);
  const completedProp = findProp(properties, 'Completed date', refs.completedDateId);
  const row = {
    pageId: (page && page.id) || '',
    pageUrl: (page && page.url) || '',
    trelloIdTail: trelloIdTail(trelloRaw),
    title: titleOf(properties),
    status: propText(findProp(properties, 'Status', '')),
    lanes: propMulti(findProp(properties, 'Lane', '')),
    hold: propCheck(findProp(properties, 'Hold', '')),
    recordRole: propText(findProp(properties, 'Record role', '')),
    sourceUrl,
    sourceAsOf: propText(findProp(properties, 'Source as-of', '')),
    started: propText(findProp(properties, 'Started', '')),
    lastEdited: (page && page.last_edited_time) || '',
  };
  if (primaryProp) row.primaryLane = propText(primaryProp).trim();
  if (completedProp) row.completedDate = propText(completedProp).trim();
  return row;
}

function laneValues(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean);
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return [];
}

export function coerceRow(row) {
  if (row && row.properties) return pageToRow(row);
  const sourceUrl = String((row && (row.sourceUrl || row['Source URL'])) || '').trim();
  const lanes = laneValues(row && (row.lanes || row.Lane));
  const hasPrimary = !!row && (Object.prototype.hasOwnProperty.call(row, 'primaryLane') || Object.prototype.hasOwnProperty.call(row, 'Primary lane'));
  const hasCompleted = !!row && (Object.prototype.hasOwnProperty.call(row, 'completedDate') || Object.prototype.hasOwnProperty.call(row, 'Completed date'));
  const out = {
    pageId: String((row && (row.pageId || row.page_id)) || ''),
    pageUrl: String((row && (row.pageUrl || row.url)) || ''),
    trelloIdTail: trelloIdTail(row && (row.trelloIdTail || row.trelloId || row['Trello card ID'])),
    title: String((row && (row.title || row.name || row.Name)) || ''),
    status: String((row && (row.status || row.Status)) || ''),
    lanes,
    hold: Boolean(row && (row.hold || row.Hold)),
    recordRole: String((row && (row.recordRole || row.role || row['Record role'])) || ''),
    sourceUrl,
    sourceAsOf: String((row && (row.sourceAsOf || row.sourceAsOfTime || row['Source as-of'])) || ''),
    started: String((row && (row.started || row.Started)) || ''),
    lastEdited: String((row && (row.lastEdited || row.lastEditedTime || row['Last edited'])) || ''),
  };
  if (hasPrimary) out.primaryLane = String((row.primaryLane ?? row['Primary lane']) || '').trim();
  if (hasCompleted) {
    const raw = row.completedDate ?? row['Completed date'];
    out.completedDate = raw ? String(raw).trim() : '';
  }
  return out;
}

function optionNames(prop) {
  if (!prop || typeof prop !== 'object') return [];
  const bucket = prop.status || prop.select || prop.multi_select || {};
  const options = bucket.options || prop.options || [];
  return options.map((option) => (typeof option === 'string' ? option : option && option.name)).filter(Boolean);
}

function propByName(properties, name) {
  if (!properties || typeof properties !== 'object') return null;
  if (properties[name]) return properties[name];
  const found = Object.values(properties).find((prop) => prop && prop.name === name);
  return found || null;
}

export function validateDataSource(body, refs = {}) {
  const properties = body && (body.properties || (body.data_source && body.data_source.properties));
  if (!properties || typeof properties !== 'object') fail('schema');
  for (const name of REQUIRED_PROPS) {
    if (!propByName(properties, name)) fail('schema');
  }
  const status = propByName(properties, 'Status');
  if (status.type !== 'status' && status.type !== 'select') fail('schema');
  for (const option of STATUS_OPTIONS) {
    if (!optionNames(status).includes(option)) fail('schema');
  }
  const role = propByName(properties, 'Record role');
  if (role.type !== 'select' && role.type !== 'status') fail('schema');
  const roleNames = optionNames(role);
  const roleKinds = roleNames.map((name) => classifyRecordRole(name));
  if (!roleNames.length || roleKinds.includes('unknown') || !roleKinds.includes('operational')) fail('schema');
  for (const prefix of ROLE_PREFIXES) {
    if (!roleNames.some((name) => name.toLowerCase().startsWith(prefix))) fail('schema');
  }
  const lane = propByName(properties, 'Lane');
  if (lane.type !== 'multi_select') fail('schema');
  const hold = propByName(properties, 'Hold');
  if (hold.type !== 'checkbox') fail('schema');
  const trello = propByName(properties, 'Trello card ID');
  if (!['rich_text', 'title', 'formula', 'unique_id', 'text'].includes(trello.type)) fail('schema');
  const link = propByName(properties, 'Source URL');
  if (!['url', 'rich_text', 'formula'].includes(link.type)) fail('schema');
  const title = Object.values(properties).some((prop) => prop && prop.type === 'title');
  if (!title) fail('schema');
  const primary = findProp(properties, 'Primary lane', refs.primaryLaneId);
  if (refs.primaryLaneId && !primary) fail('schema');
  if (primary && primary.type !== 'select' && primary.type !== 'status') fail('schema');
  const completed = findProp(properties, 'Completed date', refs.completedDateId);
  if (refs.completedDateId && !completed) fail('schema');
  if (completed && completed.type !== 'date') fail('schema');
}

function retryAfterMs(header) {
  const raw = String(header || '').trim();
  if (!raw) return 0;
  const seconds = Number(raw);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const when = Date.parse(raw);
  if (Number.isNaN(when)) return 0;
  return Math.max(0, when - Date.now());
}

function sleep(ms) {
  if (!ms) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function notionFetch(fetchImpl, apiKey, url, init, timeoutMs) {
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json',
  };
  let response;
  try {
    response = await fetchImpl(url, {
      ...init,
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const name = err && (err.name || err.code);
    if (name === 'TimeoutError' || name === 'AbortError') fail('timeout');
    fail('transport');
  }
  return response;
}

function statusCode(response) {
  return response && response.status;
}

async function discard(response) {
  try {
    if (response && response.arrayBuffer) await response.arrayBuffer();
    else if (response && response.text) await response.text();
  } catch { /* ignore body */ }
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    fail('partial');
  }
  return null;
}

async function callNotion(fetchImpl, apiKey, url, init, timeoutMs) {
  let retries = 0;
  while (true) {
    const response = await notionFetch(fetchImpl, apiKey, url, init, timeoutMs);
    const status = statusCode(response);
    if (status === 401) {
      await discard(response);
      fail('unauthorized');
    }
    if (status === 403) {
      await discard(response);
      fail('forbidden');
    }
    if (status === 404) {
      await discard(response);
      fail('not-found');
    }
    if (status === 429) {
      const wait = retryAfterMs(response.headers && response.headers.get && response.headers.get('retry-after'));
      await discard(response);
      if (wait > RETRY_AFTER_CAP_MS || retries >= MAX_429_RETRIES) fail('rate-limit');
      retries += 1;
      await sleep(wait);
      continue;
    }
    if (!response.ok) {
      await discard(response);
      fail('transport');
    }
    return readJson(response);
  }
}

function withinBudget(started, budgetMs, clock) {
  const now = clock();
  if (now - started > budgetMs) fail('timeout');
}

export async function loadNotionCommand(options = {}) {
  const env = options.env || {};
  const apiKey = options.apiKey != null ? String(options.apiKey) : notionApiKey(env);
  if (!apiKey) return { ok: false, reason: 'config', rows: [] };
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const dataSourceId = options.dataSourceId || DATA_SOURCE_ID;
  const pageCap = options.pageCap == null ? PAGE_CAP : options.pageCap;
  const budgetMs = options.budgetMs == null ? BUDGET_MS : options.budgetMs;
  const timeoutMs = options.timeoutMs == null ? REQUEST_TIMEOUT_MS : options.timeoutMs;
  const clock = options.clock || Date.now;
  const started = clock();
  try {
    withinBudget(started, budgetMs, clock);
    const schema = await callNotion(
      fetchImpl,
      apiKey,
      `https://api.notion.com/v1/data_sources/${dataSourceId}`,
      { method: 'GET' },
      timeoutMs,
    );
    const refs = options.propertyRefs || propertyRefs(env);
    validateDataSource(schema, refs);
    const rows = [];
    let cursor = '';
    let pages = 0;
    while (pages < pageCap) {
      withinBudget(started, budgetMs, clock);
      const body = { page_size: PAGE_SIZE };
      if (cursor) body.start_cursor = cursor;
      const page = await callNotion(
        fetchImpl,
        apiKey,
        `https://api.notion.com/v1/data_sources/${dataSourceId}/query`,
        { method: 'POST', body: JSON.stringify(body) },
        timeoutMs,
      );
      if (!page || !Array.isArray(page.results)) fail('partial');
      pages += 1;
      for (const item of page.results) rows.push(pageToRow(item, refs));
      const more = Boolean(page.has_more);
      if (!more) {
        const operational = rows.filter(isOperationalRow);
        if (!operational.length) return { ok: false, reason: 'empty', rows: [] };
        return { ok: true, reason: '', rows };
      }
      if (!page.next_cursor) fail('partial');
      cursor = String(page.next_cursor);
    }
    fail('partial');
  } catch (err) {
    if (err instanceof NotionReadError) return { ok: false, reason: err.code, rows: [] };
    return { ok: false, reason: 'transport', rows: [] };
  }
  return { ok: false, reason: 'partial', rows: [] };
}

function isOperationalRow(row) {
  if (!row) return false;
  const kind = classifyRecordRole(row.recordRole);
  if (kind === 'unknown') fail('role');
  if (kind !== 'operational') return false;
  if (!row.trelloIdTail && !notionPageCardId(row.pageId)) fail('identity');
  return true;
}

function resolveLane(values) {
  const resolved = [];
  for (const value of values || []) {
    const hit = hitLane(value);
    if (hit && !resolved.includes(hit)) resolved.push(hit);
  }
  if (resolved.length === 1) return { lane: resolved[0], codes: [] };
  if (resolved.length > 1) {
    const picked = LANES.find((name) => resolved.includes(name)) || resolved[0];
    return { lane: picked, codes: ['multi-lane'], detail: resolved.join(', ') };
  }
  return { lane: '', codes: values && values.length ? ['unmapped-lane'] : [], detail: (values || []).join(', ') };
}

function trelloLink(url) {
  const text = String(url || '').trim();
  if (/^https:\/\/trello\.com\//.test(text)) return text;
  return '';
}

function ignoredPageUrl(row) {
  const pageUrl = String(row.pageUrl || '').trim();
  if (/^https:\/\//.test(pageUrl) && !/^https:\/\/trello\.com\//.test(pageUrl)) return pageUrl;
  const compact = String(row.pageId || '').replace(/-/g, '').trim();
  if (compact) return `https://www.notion.so/${compact}`;
  return '';
}

// A date-only Completed date is that America/Los_Angeles calendar day.
// 20:00Z is still that date in both PST and PDT.
export function completedInstant(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return `${text}T20:00:00.000Z`;
  return text;
}

export function evaluateCompletedDoneToday(doneCards, now) {
  if (!doneCards.length) return { known: false, count: null };
  if (doneCards.some((card) => !card.completedDate)) return { known: false, count: null };
  const dump = {
    lists: [{
      name: 'Done',
      cards: doneCards.map((card) => ({
        id: card.id,
        name: card.name || card.id,
        desc: '',
        movedToDoneAt: completedInstant(card.completedDate),
      })),
    }],
  };
  return { known: true, count: board(dump, '', 'CMD', now).out.counts.doneToday };
}

function cardFrom(row, lane) {
  const hasTrello = Boolean(row.trelloIdTail);
  const link = hasTrello ? trelloLink(row.sourceUrl) : ignoredPageUrl(row);
  const desc = lane ? `Lane: ${lane}` : '';
  const card = {
    id: hasTrello ? row.trelloIdTail : notionPageCardId(row.pageId),
    name: row.title || 'Untitled',
    desc,
    description: desc,
    shortUrl: hasTrello ? link : '',
    url: link,
    labels: [],
    lastActivityAt: '',
  };
  if (row.completedDate) card.movedToDoneAt = completedInstant(row.completedDate);
  if (Object.prototype.hasOwnProperty.call(row, 'completedDate')) card.completedDate = row.completedDate || '';
  return card;
}

// `rows` are simplified records or Notion pages. Hold does not affect the list.
// Blocked uses the preview default (exclude) unless mapConfig.blocked is passed;
// only "exclude" is accepted.
function chooseLane(row, primaryEnabled) {
  const fallback = resolveLane(row.lanes);
  if (!primaryEnabled) return fallback;
  const primary = String(row.primaryLane || '').trim();
  if (!primary) return fallback;
  const hit = hitLane(primary);
  if (hit) return { lane: hit, codes: [], detail: '' };
  return { lane: fallback.lane, codes: ['primary-lane-unknown', ...fallback.codes], detail: primary };
}

export function mapOperationalRows(rows, mapConfig = {}) {
  const mode = blockedMode(mapConfig.blocked || 'exclude');
  if (mode !== 'exclude') assertNever(mode);
  const list = (Array.isArray(rows) ? rows : []).map(coerceRow);
  const primaryEnabled = mapConfig.primaryLaneEnabled != null
    ? Boolean(mapConfig.primaryLaneEnabled)
    : list.some((row) => Object.prototype.hasOwnProperty.call(row, 'primaryLane'));
  const completedEnabled = mapConfig.completedDateEnabled != null
    ? Boolean(mapConfig.completedDateEnabled)
    : list.some((row) => Object.prototype.hasOwnProperty.call(row, 'completedDate'));
  const buckets = { Backlog: [], Doing: [], 'Waiting on Hunter': [], Done: [] };
  const warnings = [];
  for (const row of list) {
    if (!isOperationalRow(row)) continue;
    const lane = chooseLane(row, primaryEnabled);
    const hasTrello = Boolean(row.trelloIdTail);
    const link = hasTrello ? trelloLink(row.sourceUrl) : '';
    const linkCodes = [];
    if (!hasTrello) linkCodes.push('no-trello-id');
    else if (row.sourceUrl && !link) linkCodes.push('link-not-trello');
    const id = hasTrello ? row.trelloIdTail : notionPageCardId(row.pageId);
    if (row.status === 'Blocked') {
      warnings.push({
        id,
        codes: ['blocked-excluded', ...lane.codes, ...linkCodes],
        status: row.status,
        picked: lane.lane,
        detail: lane.detail || '',
        notionOnly: true,
      });
      continue;
    }
    const listName = listForStatus(row.status);
    if (!listName) {
      warnings.push({
        id,
        codes: ['status-unmapped', ...lane.codes, ...linkCodes],
        status: row.status,
        picked: lane.lane,
        detail: lane.detail || '',
      });
      continue;
    }
    if (lane.codes.length || linkCodes.length) {
      warnings.push({
        id,
        codes: [...lane.codes, ...linkCodes],
        status: row.status,
        picked: lane.lane,
        detail: lane.detail || '',
      });
    }
    buckets[listName].push(cardFrom(row, lane.lane));
  }
  const doneCards = buckets.Done;
  return {
    dump: {
      lists: [
        { name: 'Doing', cards: buckets.Doing },
        { name: 'Waiting on Hunter', cards: buckets['Waiting on Hunter'] },
        { name: 'Backlog', cards: buckets.Backlog },
        { name: 'Done', cards: doneCards },
      ],
    },
    warnings,
    doneTodayStatus: completedEnabled ? evaluateCompletedDoneToday(doneCards, mapConfig.now || Date.now()) : null,
  };
}
