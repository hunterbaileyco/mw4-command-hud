#!/usr/bin/env node
// Compare a Notion Command row dump with a Trello Command dump.
// Writes a report only. Does not read NOTION_API_KEY, does not write the
// status blob, and does not edit status.json.
//
//   node tools/shadow-diff.mjs --notion rows.json --trello command.json --out report.md [--now ISO]
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { composeStatus, laneOf, listsOf } from '../docs/api/status-model.mjs';
import { classifyRecordRole, coerceRow, mapOperationalRows } from '../docs/lib/notion-command.mjs';
import { movesFromEntries, noteTransitions, trelloIdTail } from '../docs/lib/done-ledger.mjs';

const LISTS = ['doing', 'waiting', 'backlog', 'done'];

function readJson(file) {
  const text = fs.readFileSync(file, 'utf8');
  return JSON.parse(text);
}

function notionRows(dump) {
  if (Array.isArray(dump)) return dump.map(coerceRow);
  if (dump && Array.isArray(dump.rows)) return dump.rows.map(coerceRow);
  if (dump && Array.isArray(dump.results)) return dump.results.map(coerceRow);
  if (dump && Array.isArray(dump.pages)) {
    return dump.pages.flatMap((page) => page.results || []).map(coerceRow);
  }
  throw new Error('notion dump must be { rows } or { results } or { pages }');
}

function trelloCard(card) {
  const id = trelloIdTail(card.objectId || card.id);
  return {
    id,
    name: card.name,
    desc: card.desc || '',
    description: card.description || card.desc || '',
    shortUrl: card.shortUrl || '',
    url: card.shortUrl || card.url || '',
    labels: card.labels || [],
    lastActivityAt: card.dateLastActivity || card.lastActivityAt || '',
    movedToDoneAt: card.movedToDoneAt || '',
  };
}

// Accepts the builder's list dump or a flat open-card export { cards, lists }.
export function trelloCommandDump(dump) {
  if (dump && Array.isArray(dump.lists) && dump.lists.some((list) => Array.isArray(list.cards))) return dump;
  const cards = dump && Array.isArray(dump.cards) ? dump.cards : [];
  const by = new Map();
  for (const card of cards) {
    const name = card.listName || 'Backlog';
    if (!by.has(name)) by.set(name, []);
    by.get(name).push(trelloCard(card));
  }
  const order = ['Doing', 'Waiting on Hunter', 'Backlog', 'Done'];
  const names = order.filter((name) => by.has(name)).concat([...by.keys()].filter((name) => !order.includes(name)));
  return { lists: names.map((name) => ({ name, cards: by.get(name) })) };
}

export function trelloMoves(actionsDump) {
  const actions = Array.isArray(actionsDump) ? actionsDump : (actionsDump && actionsDump.actions) || [];
  return actions.map((action) => ({
    date: action.date,
    type: action.type,
    displayKey: action.display || action.displayKey,
    listBefore: { name: typeof action.listBefore === 'string' ? action.listBefore : (action.listBefore && action.listBefore.name) || '' },
    listAfter: { name: typeof action.listAfter === 'string' ? action.listAfter : (action.listAfter && action.listAfter.name) || '' },
    card: { id: trelloIdTail(action.cardObjectId || action.cardId || (action.card && action.card.id)) },
  }));
}

function shortLinkOf(url) {
  const match = /\/c\/([A-Za-z0-9]+)/.exec(String(url || ''));
  return match ? match[1] : '';
}

// Full lists, including every Done card. composeStatus shows only eight Done cards.
export function indexDump(dump, fallback = '') {
  const lists = listsOf(dump || {});
  const out = new Map();
  for (const list of LISTS) {
    for (const card of lists[list] || []) {
      const id = trelloIdTail(card.id);
      if (!id) continue;
      const url = card.shortUrl || card.url || '';
      out.set(id, {
        id,
        list,
        lane: laneOf(card, fallback) || '',
        url,
        link: shortLinkOf(url),
      });
    }
  }
  return out;
}

export function indexCommand(board) {
  const out = new Map();
  const lists = (board && board.lists) || {};
  for (const list of LISTS) {
    for (const card of lists[list] || []) {
      if (!card || !card.id) continue;
      const url = card.url || '';
      out.set(card.id, {
        id: card.id,
        list,
        lane: card.lane || '',
        url,
        link: shortLinkOf(url),
      });
    }
  }
  return out;
}

export function diffCommand(notionStatus, trelloStatus, warnings) {
  const notion = indexCommand(notionStatus && notionStatus.command);
  const trello = indexCommand(trelloStatus && trelloStatus.command);
  const onlyNotion = [];
  const onlyTrello = [];
  const status = [];
  const lane = [];
  const links = [];
  for (const [id, card] of notion) {
    const other = trello.get(id);
    if (!other) {
      onlyNotion.push(id);
      continue;
    }
    if (card.list !== other.list) status.push({ id, notion: card.list, trello: other.list });
    if (card.lane !== other.lane) lane.push({ id, notion: card.lane, trello: other.lane });
    if ((card.link || card.url) !== (other.link || other.url)) links.push({ id, notion: card.url, trello: other.url });
  }
  for (const id of trello.keys()) {
    if (!notion.has(id)) onlyTrello.push(id);
  }
  const sortId = (a, b) => String(a.id || a).localeCompare(String(b.id || b));
  onlyNotion.sort();
  onlyTrello.sort();
  status.sort(sortId);
  lane.sort(sortId);
  links.sort(sortId);
  const nc = (notionStatus.command && notionStatus.command.counts) || {};
  const tc = (trelloStatus.command && trelloStatus.command.counts) || {};
  return {
    onlyNotion,
    onlyTrello,
    status,
    lane,
    links,
    waiting: { notion: nc.waiting || 0, trello: tc.waiting || 0 },
    doneToday: {
      notion: nc.doneToday || 0,
      trello: tc.doneToday || 0,
    },
    doing: { notion: nc.doing || 0, trello: tc.doing || 0 },
    backlog: { notion: nc.backlog || 0, trello: tc.backlog || 0 },
    warnings: (warnings || []).slice().sort((a, b) => String(a.id).localeCompare(String(b.id))),
  };
}

function roleBucket(role) {
  const lower = String(role || '').trim().toLowerCase();
  if (lower.startsWith('history')) return 'history';
  if (lower.startsWith('legacy')) return 'legacy';
  if (lower.startsWith('template')) return 'template';
  return 'other';
}

function auditRows(rows, notionBoard, trelloBoard) {
  const notion = indexCommand(notionBoard);
  const trello = indexCommand(trelloBoard);
  const trelloIds = new Set(trello.keys());
  const excluded = { history: 0, legacy: 0, template: 0 };
  const excludedOffBoard = { history: 0, legacy: 0, template: 0 };
  let operational = 0;
  let zeroLane = 0;
  let multiLane = 0;
  let singleLane = 0;
  const laneCompare = [];
  for (const row of rows) {
    const kind = classifyRecordRole(row.recordRole);
    if (kind === 'excluded') {
      const bucket = roleBucket(row.recordRole);
      if (excluded[bucket] != null) excluded[bucket] += 1;
      if (row.trelloIdTail && !trelloIds.has(row.trelloIdTail) && excludedOffBoard[bucket] != null) excludedOffBoard[bucket] += 1;
      continue;
    }
    if (kind !== 'operational' || !row.trelloIdTail) continue;
    operational += 1;
    const count = row.lanes.length;
    if (count === 0) zeroLane += 1;
    else if (count > 1) multiLane += 1;
    else singleLane += 1;
    const preview = notion.get(row.trelloIdTail);
    const live = trello.get(row.trelloIdTail);
    const propertyMatchesPreview = count === 1 && !!preview && row.lanes[0] === preview.lane;
    if (count !== 1 || !preview || !live || preview.lane !== live.lane || !propertyMatchesPreview) {
      laneCompare.push({
        id: row.trelloIdTail,
        raw: row.lanes.join(', '),
        preview: preview ? preview.lane : '',
        trello: live ? live.lane : '',
        list: preview ? preview.list : '',
      });
    }
  }
  laneCompare.sort((a, b) => a.id.localeCompare(b.id));
  return { operational, zeroLane, multiLane, singleLane, laneCompare, excluded, excludedOffBoard };
}

export function shadowFromDumps({ notionDump, trelloDump, activities = null, now = Date.now(), ledgerEntries = [], previousDump = null }) {
  const rows = notionRows(notionDump);
  const mapped = mapOperationalRows(rows, { now });
  const noted = noteTransitions({
    previousDump,
    nextDump: mapped.dump,
    at: new Date(now).toISOString(),
    entries: ledgerEntries,
  });
  const emptyKal = { lists: [] };
  const commandDump = trelloCommandDump(trelloDump);
  const commandMoves = activities ? trelloMoves(activities) : [];
  const notion = composeStatus({
    commandDump: mapped.dump,
    kalDump: emptyKal,
    commandMoves: movesFromEntries(noted.entries),
    now,
  }).status;
  const trello = composeStatus({
    commandDump,
    kalDump: emptyKal,
    commandMoves,
    now,
  }).status;
  const notionFull = { lists: Object.fromEntries(LISTS.map((list) => [list, [...indexDump(mapped.dump).values()].filter((card) => card.list === list)])) };
  const trelloFull = { lists: Object.fromEntries(LISTS.map((list) => [list, [...indexDump(commandDump).values()].filter((card) => card.list === list)])) };
  const diff = diffCommand({ command: notionFull }, { command: trelloFull }, mapped.warnings);
  diff.doing = { notion: notionFull.lists.doing.length, trello: trelloFull.lists.doing.length };
  diff.waiting = { notion: notionFull.lists.waiting.length, trello: trelloFull.lists.waiting.length };
  diff.backlog = { notion: notionFull.lists.backlog.length, trello: trelloFull.lists.backlog.length };
  const trelloDoneToday = trello.command.counts.doneToday || 0;
  if (mapped.doneTodayStatus) {
    diff.doneToday = mapped.doneTodayStatus.known
      ? { notion: mapped.doneTodayStatus.count, trello: trelloDoneToday }
      : { notion: null, trello: trelloDoneToday, gap: true };
  } else {
    diff.doneToday = { notion: notion.command.counts.doneToday || 0, trello: trelloDoneToday };
    const doneCards = ((mapped.dump.lists || []).find((list) => list.name === 'Done') || {}).cards || [];
    const completionOnOperational = rows.some((row) => classifyRecordRole(row.recordRole) === 'operational' && row.completionDate);
    if (!doneCards.length && !completionOnOperational && !noted.entries.length) {
      diff.doneToday = { notion: null, trello: trelloDoneToday, gap: true };
    }
  }
  diff.notionOnly = diff.onlyNotion;
  const trelloIndex = indexDump(commandDump);
  diff.activeOnlyTrello = diff.onlyTrello.filter((id) => trelloIndex.get(id) && trelloIndex.get(id).list !== 'done');
  diff.doneOnlyTrello = diff.onlyTrello.filter((id) => trelloIndex.get(id) && trelloIndex.get(id).list === 'done');
  return {
    notion,
    trello,
    warnings: mapped.warnings,
    added: noted.added,
    diff,
    audit: auditRows(rows, notionFull, trelloFull),
    moveCount: commandMoves.length,
  };
}

function line(label, notion, trello) {
  if (notion == null) return `| ${label} | unknown | ${trello} | known gap |`;
  const mark = notion === trello ? 'match' : 'DIFF';
  return `| ${label} | ${notion} | ${trello} | ${mark} |`;
}

export function renderReport(result, meta = {}) {
  const diff = result.diff;
  const flagged = diff.warnings.filter((warning) => (warning.codes || []).length);
  const rows = [
    '# Command shadow diff',
    '',
    'Preview only. Notion rows were mapped with the preview defaults. Trello stays the Kal source and is not in this Command comparison.',
    '',
    'Blocked cards are excluded from Doing, Waiting, Backlog, and Done, and listed below. Multi-lane uses roster order when more than one callsign matches, and the card is flagged. Hunter and Ops are not roster lanes. A Command card with no roster lane stays blank. It is not given Ghost. Hold does not move a card into Waiting. Operational rows are Record role Current work. Names that start with History, Legacy, or Template are excluded. Any other role fails the read. Source as-of, Last edited, Started, and import time are not `doneAt` and are not `updatedAt`.',
    '',
    `- Observed at: ${meta.now || ''}`,
    `- Notion file: ${meta.notion || ''}`,
    `- Trello file: ${meta.trello || ''}`,
    '',
    '| | Notion | Trello | |',
    '| --- | --- | --- | --- |',
    line('doing', diff.doing.notion, diff.doing.trello),
    line('waiting', diff.waiting.notion, diff.waiting.trello),
    line('backlog', diff.backlog.notion, diff.backlog.trello),
    line('doneToday', diff.doneToday.notion, diff.doneToday.trello),
    '',
    `notionOnly (informational, not a failed read): ${(diff.notionOnly || diff.onlyNotion).join(', ') || 'none'}`,
    `Trello-only active mismatch: ${(diff.activeOnlyTrello || []).join(', ') || 'none'}`,
    `Only Trello ids: ${diff.onlyTrello.join(', ') || 'none'}`,
    '',
    '## Status mismatches',
    '',
  ];
  if (!diff.status.length) rows.push('None.');
  for (const item of diff.status) rows.push(`- ${item.id}: Notion ${item.notion}, Trello ${item.trello}`);
  rows.push('', '## Lane mismatches', '');
  if (!diff.lane.length) rows.push('None.');
  for (const item of diff.lane) rows.push(`- ${item.id}: Notion ${item.notion || '(blank)'}, Trello ${item.trello || '(blank)'}`);
  rows.push('', '## Link mismatches', '');
  if (!diff.links.length) rows.push('None.');
  for (const item of diff.links) rows.push(`- ${item.id}: Notion ${item.notion || '(none)'}, Trello ${item.trello || '(none)'}`);
  rows.push('', '## Flagged cards', '');
  if (!flagged.length) rows.push('None.');
  for (const warning of flagged) {
    rows.push(`- ${warning.id}: ${(warning.codes || []).join(', ')}${warning.picked ? ` (preview lane ${warning.picked})` : ''}`);
  }
  if (result.audit) {
    const audit = result.audit;
    const off = audit.excludedOffBoard;
    rows.push('', '## Record role', '');
    rows.push('The rows file is a complete export for this diff. The adapter still pages with has_more and next_cursor, and a page that still has more is not a successful read.');
    rows.push(`Operational Current work rows in the feed: ${audit.operational}.`);
    rows.push(`Excluded from the feed: History ${audit.excluded.history}, Legacy ${audit.excluded.legacy}, Template ${audit.excluded.template}.`);
    rows.push(`Excluded rows whose Trello id is not on the open Command board: History ${off.history}, Legacy ${off.legacy}, Template ${off.template} (${off.history + off.legacy + off.template} total).`);
    rows.push(`Trello-only active ids (Doing, Waiting, Backlog): ${diff.activeOnlyTrello.length ? diff.activeOnlyTrello.join(', ') : 'none'}.`);
    rows.push(`Trello-only Done ids kept off the Notion operational set: ${diff.doneOnlyTrello.length}.`);
    rows.push('', '## Operational lanes', '');
    rows.push(`Of ${audit.operational} operational rows: ${audit.zeroLane} with zero Lane values, ${audit.singleLane} with one, ${audit.multiLane} with more than one.`);
    rows.push('Preview lane is the roster callsign after the default rule. Trello lane is the lane the current feed would show.');
    rows.push('');
    if (!audit.laneCompare.length) rows.push('No operational lane exceptions.');
    for (const item of audit.laneCompare) {
      rows.push(`- ${item.id}: lanes [${item.raw || 'none'}] → preview ${item.preview || '(blank)'} / Trello ${item.trello || '(blank)'}`);
    }
  }
  if (diff.doneToday && diff.doneToday.gap) {
    rows.push('', '## doneToday', '');
    rows.push('Notion doneToday is unknown, not 0. No Current work row is on Done, and this schema has no completion-date property. A zero would claim that nobody shipped. Trello doneToday counts open Done cards whose latest move into Done falls on the America/Los_Angeles day of this pull.');
    if (result.moveCount != null) rows.push(`Trello list-move actions supplied to that count: ${result.moveCount}.`);
  }
  rows.push('');
  return rows.join('\n');
}

function argValue(name) {
  const index = process.argv.indexOf(name);
  if (index === -1 || !process.argv[index + 1]) return '';
  return process.argv[index + 1];
}

function main() {
  const notionFile = argValue('--notion');
  const trelloFile = argValue('--trello');
  const outFile = argValue('--out');
  const nowArg = argValue('--now');
  const activityFile = argValue('--activity');
  if (!notionFile || !trelloFile || !outFile) {
    console.error('usage: node tools/shadow-diff.mjs --notion rows.json --trello command.json --out report.md [--activity moves.json] [--now ISO]');
    process.exit(2);
  }
  const now = nowArg ? Date.parse(nowArg) : Date.now();
  if (Number.isNaN(now)) {
    console.error('invalid --now');
    process.exit(2);
  }
  const result = shadowFromDumps({
    notionDump: readJson(notionFile),
    trelloDump: readJson(trelloFile),
    activities: activityFile ? readJson(activityFile) : null,
    now,
  });
  const report = renderReport(result, {
    now: new Date(now).toISOString(),
    notion: path.basename(notionFile),
    trello: path.basename(trelloFile),
  });
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, report);
  const diff = result.diff;
  console.log(`shadow: doing ${diff.doing.notion}/${diff.doing.trello} waiting ${diff.waiting.notion}/${diff.waiting.trello} backlog ${diff.backlog.notion}/${diff.backlog.trello} doneToday ${diff.doneToday.notion}/${diff.doneToday.trello} flagged ${diff.warnings.length} -> ${outFile}`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) main();
