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
// - Record role History, Legacy, or Template is excluded. A row with no Trello
//   card id is excluded. Card id is the Trello id tail. card.url is kept only
//   when it is already an https://trello.com/ link.
// - Source as-of, Last edited, Started, and import time are not completion
//   times and are not freshness.

import { LANES, hitLane } from './status-model.mjs';
import { trelloIdTail } from './done-ledger.mjs';

export const NOTION_VERSION = '2025-09-03';
export const DATA_SOURCE_ID = '40f16968-1b6f-8076-ad36-000b28dac4ff';
export const PAGE_SIZE = 100;
export const PAGE_CAP = 25;
export const REQUEST_TIMEOUT_MS = 8000;
export const BUDGET_MS = 20000;
export const MAX_429_RETRIES = 3;
export const RETRY_AFTER_CAP_MS = 2000;

const STATUS_OPTIONS = ['Backlog', 'Doing', 'Waiting on Hunter', 'Blocked', 'Done'];
const ROLE_OPTIONS = ['History', 'Legacy', 'Template'];
const REQUIRED_PROPS = ['Status', 'Record role', 'Lane', 'Hold', 'Trello card ID', 'Source URL'];

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

function excludedRole(role) {
  switch (role) {
    case 'History':
    case 'Legacy':
    case 'Template':
      return true;
    default:
      return false;
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

export function pageToRow(page) {
  const properties = (page && page.properties) || {};
  const trelloRaw = propText(properties['Trello card ID']);
  const sourceUrl = propText(properties['Source URL']).trim();
  return {
    trelloIdTail: trelloIdTail(trelloRaw),
    title: titleOf(properties),
    status: propText(properties.Status),
    lanes: propMulti(properties.Lane),
    hold: propCheck(properties.Hold),
    recordRole: propText(properties['Record role']),
    sourceUrl,
    sourceAsOf: propText(properties['Source as-of']),
    started: propText(properties.Started),
    lastEdited: (page && page.last_edited_time) || '',
  };
}

export function coerceRow(row) {
  if (row && row.properties) return pageToRow(row);
  const sourceUrl = String((row && row.sourceUrl) || '').trim();
  const lanes = Array.isArray(row && row.lanes) ? row.lanes.map((lane) => String(lane)) : [];
  return {
    trelloIdTail: trelloIdTail(row && (row.trelloIdTail || row.trelloId)),
    title: String((row && (row.title || row.name)) || ''),
    status: String((row && row.status) || ''),
    lanes,
    hold: Boolean(row && row.hold),
    recordRole: String((row && (row.recordRole || row.role)) || ''),
    sourceUrl,
    sourceAsOf: String((row && (row.sourceAsOf || row.sourceAsOfTime)) || ''),
    started: String((row && row.started) || ''),
    lastEdited: String((row && (row.lastEdited || row.lastEditedTime)) || ''),
  };
}

function optionNames(prop) {
  if (!prop || typeof prop !== 'object') return [];
  const bucket = prop.status || prop.select || prop.multi_select || {};
  const options = bucket.options || [];
  return options.map((option) => option && option.name).filter(Boolean);
}

function propByName(properties, name) {
  if (!properties || typeof properties !== 'object') return null;
  if (properties[name]) return properties[name];
  const found = Object.values(properties).find((prop) => prop && prop.name === name);
  return found || null;
}

export function validateDataSource(body) {
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
  for (const option of ROLE_OPTIONS) {
    if (!optionNames(role).includes(option)) fail('schema');
  }
  const lane = propByName(properties, 'Lane');
  if (lane.type !== 'multi_select') fail('schema');
  const hold = propByName(properties, 'Hold');
  if (hold.type !== 'checkbox') fail('schema');
  const trello = propByName(properties, 'Trello card ID');
  if (!['rich_text', 'title', 'formula', 'unique_id'].includes(trello.type)) fail('schema');
  const link = propByName(properties, 'Source URL');
  if (!['url', 'rich_text', 'formula'].includes(link.type)) fail('schema');
  const title = Object.values(properties).some((prop) => prop && prop.type === 'title');
  if (!title) fail('schema');
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
    validateDataSource(schema);
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
      for (const item of page.results) rows.push(pageToRow(item));
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
  if (!row || !row.trelloIdTail) return false;
  if (excludedRole(row.recordRole)) return false;
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

function cardFrom(row, lane) {
  const link = trelloLink(row.sourceUrl);
  const desc = lane ? `Lane: ${lane}` : '';
  return {
    id: row.trelloIdTail,
    name: row.title || 'Untitled',
    desc,
    description: desc,
    shortUrl: link,
    url: link,
    labels: [],
    lastActivityAt: '',
  };
}

// `rows` are simplified records or Notion pages. Hold does not affect the list.
// Blocked uses the preview default (exclude) unless mapConfig.blocked is passed;
// only "exclude" is accepted.
export function mapOperationalRows(rows, mapConfig = {}) {
  const mode = blockedMode(mapConfig.blocked || 'exclude');
  if (mode !== 'exclude') assertNever(mode);
  const buckets = { Backlog: [], Doing: [], 'Waiting on Hunter': [], Done: [] };
  const warnings = [];
  const list = Array.isArray(rows) ? rows : [];
  for (const raw of list) {
    const row = coerceRow(raw);
    if (!isOperationalRow(row)) continue;
    const lane = resolveLane(row.lanes);
    const linkOk = !row.sourceUrl || trelloLink(row.sourceUrl);
    const linkCodes = linkOk ? [] : ['link-not-trello'];
    if (row.status === 'Blocked') {
      warnings.push({
        id: row.trelloIdTail,
        codes: ['blocked-excluded', ...lane.codes, ...linkCodes],
        status: row.status,
        picked: lane.lane,
        detail: lane.detail || '',
      });
      continue;
    }
    const listName = listForStatus(row.status);
    if (!listName) {
      warnings.push({
        id: row.trelloIdTail,
        codes: ['status-unmapped', ...lane.codes, ...linkCodes],
        status: row.status,
        picked: lane.lane,
        detail: lane.detail || '',
      });
      continue;
    }
    if (lane.codes.length || linkCodes.length) {
      warnings.push({
        id: row.trelloIdTail,
        codes: [...lane.codes, ...linkCodes],
        status: row.status,
        picked: lane.lane,
        detail: lane.detail || '',
      });
    }
    buckets[listName].push(cardFrom(row, lane.lane));
  }
  return {
    dump: {
      lists: [
        { name: 'Doing', cards: buckets.Doing },
        { name: 'Waiting on Hunter', cards: buckets['Waiting on Hunter'] },
        { name: 'Backlog', cards: buckets.Backlog },
        { name: 'Done', cards: buckets.Done },
      ],
    },
    warnings,
  };
}
