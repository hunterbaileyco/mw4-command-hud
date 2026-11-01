import assert from 'node:assert/strict';
import { board, glanceFor, glanceMerged, laneOf } from './build-status.mjs';

const now = Date.parse('2026-11-01T21:00:00Z');

const duo = {
  id: 'duo',
  name: 'Duo: Hub LEDGER tile still paints SAMPLE',
  description: 'Lane: Duo',
  lastActivityAt: '2026-11-01T18:17:33.350Z',
  actions: [{
    displayKey: 'action_move_card_from_list_to_list',
    date: '2026-11-01T18:17:32.430Z',
    listBefore: { name: 'Doing' },
    listAfter: { name: 'Done' },
  }],
};
const touched = {
  id: 'old',
  name: 'Ko: older ship',
  description: 'Lane: Ko',
  lastActivityAt: '2026-11-01T16:50:24.329Z',
  actions: [{ date: '2026-10-31T20:00:00.000Z', data: { listAfter: { name: 'Done' } } }],
};
const lateOct = {
  id: 'late',
  name: 'Park: just before midnight PT',
  description: 'Lane: Park',
  lastActivityAt: '2026-11-01T12:00:00.000Z',
  actions: [{ date: '2026-11-01T06:30:00.000Z', listAfter: { name: 'Done' } }],
};
const noStamp = {
  id: 'nostamp',
  name: 'Jae: comment only',
  description: 'Lane: Jae',
  lastActivityAt: '2026-11-01T12:00:00.000Z',
};

const cmd = board({
  lists: [
    { name: 'Doing', cards: [{ id: 'd1', name: 'Ko: HUD accuracy', description: 'Lane: Ko' }] },
    { name: 'Waiting on Hunter', cards: [] },
    { name: 'Done', cards: [duo, touched, lateOct, noStamp] },
  ],
}, '', 'CMD', now);

const duoCard = cmd.out.lists.done.find((c) => c.id === 'duo');
assert.equal(duoCard.lane, 'Ko');
assert.equal(cmd.snap.duo.op, 'Ko');
assert.notEqual(cmd.snap.duo.op, 'TF141');
assert.equal(duoCard.doneAt, '2026-11-01T18:17:32.430Z');
assert.equal(cmd.out.lists.done.find((c) => c.id === 'old').doneAt, '2026-10-31T20:00:00.000Z');
assert.equal(cmd.out.lists.done.find((c) => c.id === 'nostamp').doneAt, null);
assert.equal(cmd.out.counts.doneToday, 1, 'only the move into Done on the PT day counts');
assert.equal(cmd.out.counts.waiting, 0);

assert.equal(laneOf({ name: 'Duo: Hub LEDGER tile', description: '' }), 'Ko');
assert.equal(laneOf({ name: 'Ko: HUD Duo elevate visual bugs', description: 'Lane: Ko' }), 'Ko');
assert.equal(laneOf({ name: 'Meet Kevin', description: 'Lane: Ghost.' }), 'Ghost');
assert.equal(laneOf({ name: 'Price: scrub history', description: 'Lane: Price' }), 'Price');

const kal = board({
  lists: [
    { name: 'Doing', cards: [{ id: 'g1', name: 'FOMO / Dupe — live copy', description: 'Lane: Ghost' }] },
    {
      name: 'Waiting on Hunter',
      cards: [
        { id: 'w1', name: 'Meet Kevin → Robinhood — PAUSED', description: 'Lane: Ghost' },
        { id: 'w2', name: 'Kraken — waiting on API keys', description: 'Lane: Ghost' },
      ],
    },
    { name: 'Done', cards: [] },
  ],
}, 'Ghost', 'KAL', now);

const glance = glanceFor(cmd.out, kal.out);
assert.equal(glance.badge, '2 WAIT');
assert.equal(glance.line1, '2 doing · 2 waiting on you');
assert.equal(glance.line2, 'Next: Meet Kevin PAUSED');
const forced = glanceMerged({ glance: { line1: '9 doing · 0 waiting on you', line2: 'Next: ignore', badge: '0 WAIT' } }, cmd.out, kal.out);
assert.equal(forced.line1, '9 doing · 2 waiting on you');
assert.equal(forced.badge, '2 WAIT');
assert.equal(kal.out.counts.waiting, 2);
assert.equal(cmd.out.counts.waiting + kal.out.counts.waiting, 2);

console.log('status accuracy checks ok');
