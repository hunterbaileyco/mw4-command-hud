# Command shadow diff

Preview only. Notion rows were mapped with the preview defaults. Trello stays the Kal source and is not in this Command comparison.

Blocked cards are excluded from Doing, Waiting, Backlog, and Done, and listed below. Multi-lane uses roster order when more than one callsign matches, and the card is flagged. Hunter and Ops are not roster lanes. A Command card with no roster lane stays blank. It is not given Ghost. Hold does not move a card into Waiting. Operational rows are Record role Current work. Names that start with History, Legacy, or Template are excluded. Any other role fails the read. Source as-of, Last edited, Started, and import time are not `doneAt` and are not `updatedAt`.

- Observed at: 2026-11-05T20:00:00.000Z
- Notion file: notion-shadow-rows.json
- Trello file: trello-shadow-command.json

| | Notion | Trello | |
| --- | --- | --- | --- |
| doing | 1 | 1 | match |
| waiting | 1 | 1 | match |
| backlog | 1 | 1 | match |
| doneToday | 0 | 1 | DIFF |

notionOnly (informational, not a failed read): none
Trello-only active mismatch: none
Only Trello ids: none

## Status mismatches

None.

## Lane mismatches

- bbb222bbb222bbb222bbb222: Notion Ko, Trello Jae

## Link mismatches

None.

## Flagged cards

- bbb222bbb222bbb222bbb222: multi-lane (preview lane Ko)
- eee555eee555eee555eee555: blocked-excluded (preview lane Cho)

## Record role

The rows file is a complete export for this diff. The adapter still pages with has_more and next_cursor, and a page that still has more is not a successful read.
Operational Current work rows in the feed: 5.
Excluded from the feed: History 1, Legacy 0, Template 1.
Excluded rows whose Trello id is not on the open Command board: History 1, Legacy 0, Template 0 (1 total).
Trello-only active ids (Doing, Waiting, Backlog): none.
Trello-only Done ids kept off the Notion operational set: 0.

## Operational lanes

Of 5 operational rows: 0 with zero Lane values, 4 with one, 1 with more than one.
Preview lane is the roster callsign after the default rule. Trello lane is the lane the current feed would show.

- bbb222bbb222bbb222bbb222: lanes [Jae, Ko] → preview Ko / Trello Jae
- eee555eee555eee555eee555: lanes [Cho] → preview (blank) / Trello (blank)
