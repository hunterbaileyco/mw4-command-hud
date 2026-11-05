#!/usr/bin/env node
// Compare a Notion Command row dump with a Trello Command dump.
// Writes a report only. Does not read NOTION_API_KEY, does not write the
// status blob, and does not edit status.json.
//
//   node tools/shadow-diff.mjs --notion rows.json --trello command.json --out report.md [--now ISO]
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { composeStatus } from '../docs/api/status-model.mjs';
import { coerceRow, mapOperationalRows } from '../docs/lib/notion-command.mjs';
import { movesFromEntries, noteTransitions } from '../docs/lib/done-ledger.mjs';

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

export function indexCommand(board) {
  const out = new Map();
  const lists = (board && board.lists) || {};
  for (const list of LISTS) {
    for (const card of lists[list] || []) {
      if (!card || !card.id) continue;
      out.set(card.id, {
        id: card.id,
        list,
        lane: card.lane || '',
        url: card.url || '',
        doneAt: card.doneAt || null,
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
    if (card.url !== other.url) links.push({ id, notion: card.url, trello: other.url });
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
    doneToday: { notion: nc.doneToday || 0, trello: tc.doneToday || 0 },
    doing: { notion: nc.doing || 0, trello: tc.doing || 0 },
    backlog: { notion: nc.backlog || 0, trello: tc.backlog || 0 },
    warnings: (warnings || []).slice().sort((a, b) => String(a.id).localeCompare(String(b.id))),
  };
}

export function shadowFromDumps({ notionDump, trelloDump, now = Date.now(), ledgerEntries = [], previousDump = null }) {
  const rows = notionRows(notionDump);
  const mapped = mapOperationalRows(rows);
  const noted = noteTransitions({
    previousDump,
    nextDump: mapped.dump,
    at: new Date(now).toISOString(),
    entries: ledgerEntries,
  });
  const emptyKal = { lists: [] };
  const notion = composeStatus({
    commandDump: mapped.dump,
    kalDump: emptyKal,
    commandMoves: movesFromEntries(noted.entries),
    now,
  }).status;
  const trello = composeStatus({
    commandDump: trelloDump,
    kalDump: emptyKal,
    now,
  }).status;
  return {
    notion,
    trello,
    warnings: mapped.warnings,
    added: noted.added,
    diff: diffCommand(notion, trello, mapped.warnings),
  };
}

function line(label, notion, trello) {
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
    'Blocked cards are excluded from Doing, Waiting, Backlog, and Done, and listed below. Multi-lane uses roster order when more than one callsign matches, and the card is flagged. A Command card with no roster lane stays blank. It is not given Ghost. Hold does not move a card into Waiting. History, Legacy, Template, and rows without a Trello card id are excluded. Source as-of, Last edited, Started, and import time are not `doneAt` and are not `updatedAt`.',
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
    `Only Notion ids: ${diff.onlyNotion.join(', ') || 'none'}`,
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
  if (!notionFile || !trelloFile || !outFile) {
    console.error('usage: node tools/shadow-diff.mjs --notion rows.json --trello command.json --out report.md [--now ISO]');
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
