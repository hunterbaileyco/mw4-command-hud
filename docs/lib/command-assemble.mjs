// Preview assembly for a Notion Command read plus a Trello Kal read.
// The two legs are planned separately. A failed or empty leg reuses its last
// good dump and does not advance that leg's sourceObservedAt. It does not
// replace the other leg with an empty board. Nothing in this module writes
// the status blob or a status file. persist is always false.

import { composeStatus } from '../api/status-model.mjs';
import { mapOperationalRows } from './notion-command.mjs';
import { movesFromEntries, noteTransitions } from './done-ledger.mjs';

function iso(ms) {
  return new Date(ms).toISOString();
}

function earlierIso(a, b) {
  if (!a) return b || '';
  if (!b) return a;
  return a < b ? a : b;
}

export function freshLeg({ dump, actions, now, warnings, source }) {
  return {
    ok: true,
    reused: false,
    dump,
    actions: actions || [],
    observedAt: iso(now),
    warnings: warnings || [],
    source,
    reason: '',
  };
}

export function reuseLeg(seed, reason) {
  if (!seed || !seed.dump) {
    return {
      ok: false,
      reused: true,
      dump: null,
      actions: [],
      observedAt: '',
      warnings: [],
      source: 'last-good',
      reason: reason || 'missing',
    };
  }
  return {
    ok: true,
    reused: true,
    dump: seed.dump,
    actions: seed.actions || [],
    observedAt: seed.observedAt || '',
    warnings: seed.warnings || [],
    source: 'last-good',
    reason: reason || '',
  };
}

function packLeg(leg) {
  return {
    dump: leg.dump,
    actions: leg.actions || [],
    observedAt: leg.observedAt || '',
    warnings: leg.warnings || [],
  };
}

export function planCommandLeg({ apiKeyPresent, notion, trello, seed, now, ledgerEntries, mapConfig }) {
  const entries = Array.isArray(ledgerEntries) ? ledgerEntries : [];
  if (!apiKeyPresent) {
    if (trello && trello.ok && trello.dump) {
      return {
        leg: freshLeg({ dump: trello.dump, actions: trello.actions, now, source: 'trello-fallback' }),
        entries,
        added: [],
        commandSource: 'trello-fallback',
      };
    }
    return { leg: reuseLeg(seed, 'command-failed'), entries, added: [], commandSource: 'trello-fallback' };
  }
  if (!notion || !notion.ok) {
    return {
      leg: reuseLeg(seed, (notion && notion.reason) || 'transport'),
      entries,
      added: [],
      commandSource: 'notion',
    };
  }
  let mapped;
  try {
    mapped = mapOperationalRows(notion.rows || [], mapConfig);
  } catch {
    return { leg: reuseLeg(seed, 'config'), entries, added: [], commandSource: 'notion' };
  }
  const noted = noteTransitions({
    previousDump: seed && seed.dump,
    nextDump: mapped.dump,
    at: iso(now),
    entries,
  });
  return {
    leg: freshLeg({
      dump: mapped.dump,
      actions: movesFromEntries(noted.entries),
      now,
      warnings: mapped.warnings,
      source: 'notion',
    }),
    entries: noted.entries,
    added: noted.added,
    commandSource: 'notion',
  };
}

export function planKalLeg({ trello, seed, now }) {
  if (trello && trello.ok && trello.dump) {
    return { leg: freshLeg({ dump: trello.dump, actions: trello.actions, now, source: 'trello' }) };
  }
  return { leg: reuseLeg(seed, 'kal-failed') };
}

function decisionOf(leg) {
  if (leg && leg.ok && !leg.reused) return 'fresh';
  if (leg && leg.ok && leg.reused) return 'reuse';
  return 'missing';
}

function keepPolicy(kind) {
  switch (kind) {
    case 'fresh':
      return 'replace';
    case 'reuse':
      return 'reuse';
    case 'missing':
      return 'hold';
    default: {
      const exhaustive = kind;
      throw new Error(`unknown leg decision ${String(exhaustive)}`);
    }
  }
}

export function assemblePreview({ now, commandLeg, kalLeg, prev }) {
  const commandKind = decisionOf(commandLeg);
  const kalKind = decisionOf(kalLeg);
  if (keepPolicy(commandKind) === 'hold' || keepPolicy(kalKind) === 'hold') {
    const reason = keepPolicy(commandKind) === 'hold'
      ? ((commandLeg && commandLeg.reason) || 'command-failed')
      : ((kalLeg && kalLeg.reason) || 'kal-failed');
    return { ok: false, persist: false, reason, status: null, reused: false };
  }
  const reused = commandKind === 'reuse' || kalKind === 'reuse';
  const stamp = earlierIso(commandLeg.observedAt, kalLeg.observedAt);
  const composeNow = reused && stamp ? Date.parse(stamp) : now;
  const { status } = composeStatus({
    commandDump: commandLeg.dump,
    kalDump: kalLeg.dump,
    commandMoves: commandLeg.actions || [],
    kalMoves: kalLeg.actions || [],
    prev: prev || null,
    now: Number.isFinite(composeNow) ? composeNow : now,
  });
  status.command = { ...status.command, sourceObservedAt: commandLeg.observedAt || '' };
  status.kal = { ...status.kal, sourceObservedAt: kalLeg.observedAt || '' };
  if (reused && stamp) status.updatedAt = stamp;
  return {
    ok: true,
    persist: false,
    reason: '',
    status,
    reused,
    warnings: commandLeg.warnings || [],
  };
}

export function runPreviewCycle(state, input) {
  const current = state || { command: null, kal: null, entries: [] };
  const commandPlan = planCommandLeg({
    apiKeyPresent: input.apiKeyPresent,
    notion: input.notion,
    trello: input.commandTrello,
    seed: current.command,
    now: input.now,
    ledgerEntries: current.entries,
    mapConfig: input.mapConfig,
  });
  const kalPlan = planKalLeg({ trello: input.kalTrello, seed: current.kal, now: input.now });
  const next = {
    command: keepPolicy(decisionOf(commandPlan.leg)) === 'replace' ? packLeg(commandPlan.leg) : current.command,
    kal: keepPolicy(decisionOf(kalPlan.leg)) === 'replace' ? packLeg(kalPlan.leg) : current.kal,
    entries: commandPlan.entries,
  };
  const assembled = assemblePreview({
    now: input.now,
    commandLeg: commandPlan.leg,
    kalLeg: kalPlan.leg,
    prev: input.prev || null,
  });
  return {
    ...assembled,
    persist: false,
    next,
    added: commandPlan.added,
    commandSource: commandPlan.commandSource,
    commandReason: commandPlan.leg.reason || '',
    kalReason: kalPlan.leg.reason || '',
  };
}

function dumpFromPublished(board) {
  if (!board || !board.lists) return null;
  const names = [['doing', 'Doing'], ['waiting', 'Waiting on Hunter'], ['backlog', 'Backlog'], ['done', 'Done']];
  return {
    lists: names.map(([key, name]) => ({
      name,
      cards: (board.lists[key] || []).map((card) => {
        const lane = card && card.lane ? `Lane: ${card.lane}` : '';
        return {
          id: card.id,
          name: card.name,
          desc: lane,
          description: lane,
          shortUrl: card.url || '',
          url: card.url || '',
          labels: [],
          lastActivityAt: '',
          movedToDoneAt: card.doneAt || '',
        };
      }),
    })),
  };
}

export function seedFromStatus(status) {
  const at = (status && status.updatedAt) || '';
  const pack = (board) => {
    const dump = dumpFromPublished(board);
    if (!dump) return null;
    const actions = [];
    for (const card of (board.lists && board.lists.done) || []) {
      if (!card || !card.doneAt) continue;
      actions.push({ date: card.doneAt, listAfter: { name: 'Done' }, card: { id: card.id } });
    }
    return { dump, actions, observedAt: at, warnings: [] };
  };
  return {
    command: pack(status && status.command),
    kal: pack(status && status.kal),
  };
}

export function produceTrelloStatus(input) {
  return composeStatus(input).status;
}
