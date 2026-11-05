# Command shadow diff

Preview only. Notion rows were mapped with the preview defaults. Trello stays the Kal source and is not in this Command comparison.

Blocked cards are excluded from Doing, Waiting, Backlog, and Done, and listed below. Multi-lane uses roster order when more than one callsign matches, and the card is flagged. A Command card with no roster lane stays blank. It is not given Ghost. Hold does not move a card into Waiting. History, Legacy, Template, and rows without a Trello card id are excluded. Source as-of, Last edited, Started, and import time are not `doneAt` and are not `updatedAt`.

- Observed at: 2026-11-05T20:00:00.000Z
- Notion file: notion-shadow-rows.json
- Trello file: trello-shadow-command.json

| | Notion | Trello | |
| --- | --- | --- | --- |
| doing | 1 | 1 | match |
| waiting | 1 | 1 | match |
| backlog | 1 | 1 | match |
| doneToday | 0 | 1 | DIFF |

Only Notion ids: none
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
