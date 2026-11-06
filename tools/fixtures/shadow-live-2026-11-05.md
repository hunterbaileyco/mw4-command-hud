# Command shadow diff

Preview only. Notion rows were mapped with the preview defaults. Trello stays the Kal source and is not in this Command comparison.

Blocked cards are excluded from Doing, Waiting, Backlog, and Done, and listed below. Multi-lane uses roster order when more than one callsign matches, and the card is flagged. Hunter and Ops are not roster lanes. A Command card with no roster lane stays blank. It is not given Ghost. Hold does not move a card into Waiting. Operational rows are Record role Current work. Names that start with History, Legacy, or Template are excluded. Any other role fails the read. Source as-of, Last edited, Started, and import time are not `doneAt` and are not `updatedAt`.

- Observed at: 2026-11-05T23:33:23.000Z
- Notion file: notion-rows_204e.json
- Trello file: trello-command_3ea3.json

| | Notion | Trello | |
| --- | --- | --- | --- |
| doing | 7 | 7 | match |
| waiting | 7 | 7 | match |
| backlog | 14 | 14 | match |
| doneToday | unknown | 3 | known gap |

Only Notion ids: none
Only Trello ids: 6ae64acb698ca8c13b440198, 6ae64ad039c1a871db8e456a, 6ae64ad2e33db2f63d7aca87, 6ae64ad342368596a5a0d9a2, 6ae663ff6b882bfb9ba97633, 6ae66438f128f0f5cb197451, 6ae664fef618af8e0e4d02e6, 6ae6662ecce88873805980ea, 6ae666ba35ee808edf34dce7, 6ae66d5c04c25016c5b943fb, 6ae66d5d83293cd54899202c, 6ae66d60ec7d1c4a59ad0985, 6ae66d9d5f46b97dc138bb21, 6ae66d9f317d6c55d5a5a4dc, 6ae66e72b21f85350a335983, 6ae66e7418b24f07eac2f58b, 6ae66e77c40141f2158d63f0, 6ae66e81f70f94e6ad8e7ab2, 6ae66e8b6bb1fc91b4d11391, 6ae689c0ebb88858a80fe2a1, 6ae689c25fab787feef73ce2, 6ae691ebd0de929e6447e3dc, 6ae69e22452785760086ac3a, 6ae6b2bf524024768b80d722, 6ae6b2c1ab8e28bd5eb4d891, 6ae6b2c31b0bb61add46c4c2, 6ae6b37ab46e00c47a3d224f, 6ae6b70c1615db7a75f076ef, 6ae6bc64053564dfb26d2325, 6ae6c75a2a1a6fe9a37ec3c1, 6ae6c921ab549de1c760e2c9, 6ae6c94b15bbca48a3d75d49, 6ae6cbd925cd6229e1f5dbb6, 6ae6d3f89da0ac2dd97fb4ca, 6ae6dc952ef131a01eaec580, 6ae6e72eb1759626abfda6a1, 6ae6ec3185b97b2a9e86f965, 6ae6ee6ff3fe5d658f5df35f, 6ae6f4b525ae19a23d907a13, 6ae6f6a3de0edfcee1024b86, 6ae7556bc15624a9850c3ab9, 6ae7818736b6be79fe873cf4, 6ae7b0ae5c7bb95b1abeddf6, 6ae7b42e09de664532cea26e, 6ae7b46ea008ff1381743fe0, 6ae8b2cb2f786c3d27215839, 6ae8b9f3e332d073989b92fc, 6ae94cff12138b145a2edc29, 6ae94eb18caa43e41f2f92d8, 6ae94f6632ce700362676da0, 6ae959bab07c8c26bd5d4543, 6ae95ba6a3475fef692f22d0, 6ae96d17ed5b8c244d51671d, 6ae96d19cdb66fccfed1c36f, 6ae96ed6124901526fd3fec4, 6ae96f5fbccf44c8ecf744ca, 6aea034b161647e2223828aa, 6aea0c600b5167b091b2a5d1, 6aea0f399b294232cb62f116, 6aea1117741a8d4b0101f3c8, 6aea148b485420cbe9490a95, 6aea14e21a1a58f24e5a8c31, 6aea1508d1301b125d10cd78, 6aeacfea795b45a4e6e99a49

## Status mismatches

None.

## Lane mismatches

- 6ae64acf3d53408bd1560973: Notion Ko, Trello Cho
- 6ae66e78ed08aee0d0a692be: Notion Cho, Trello Jae
- 6ae8b2c848e6d34ca4ec5a70: Notion Price, Trello Cho
- 6aeca73cfccfb0e40898deec: Notion Ju Kwon, Trello (blank)
- 6aeca73f41e63bea345e4f3d: Notion Price, Trello Laswell
- 6aeca74221304a911e30aa69: Notion Laswell, Trello (blank)
- 6aecb113679a0dde21a57f65: Notion Price, Trello Park
- 6aecb1170f6e185db8d1c7cf: Notion Price, Trello Park

## Link mismatches

None.

## Flagged cards

- 6ae64acf3d53408bd1560973: multi-lane (preview lane Ko)
- 6ae66d5fa650d4557247425a: multi-lane (preview lane West)
- 6ae66d6237400946fab8e97d: multi-lane (preview lane West)
- 6ae66e78ed08aee0d0a692be: multi-lane (preview lane Cho)
- 6ae66e7a68af339bfc28fb94: multi-lane (preview lane Ko)
- 6ae8b2c848e6d34ca4ec5a70: multi-lane (preview lane Price)
- 6aeca73d3f922f45e3d9ad40: unmapped-lane
- 6aeca73f41e63bea345e4f3d: multi-lane (preview lane Price)
- 6aecb113679a0dde21a57f65: multi-lane (preview lane Price)
- 6aecb1170f6e185db8d1c7cf: multi-lane (preview lane Price)

## Record role

The rows file is a complete export for this diff. The adapter still pages with has_more and next_cursor, and a page that still has more is not a successful read.
Operational Current work rows in the feed: 28.
Excluded from the feed: History 78, Legacy 70, Template 1.
Excluded rows whose Trello id is not on the open Command board: History 14, Legacy 70, Template 0 (84 total).
Trello-only active ids (Doing, Waiting, Backlog): none.
Trello-only Done ids kept off the Notion operational set: 64.

## Operational lanes

Of 28 operational rows: 0 with zero Lane values, 16 with one, 12 with more than one.
Preview lane is the roster callsign after the default rule. Trello lane is the lane the current feed would show.

- 6ae64acf3d53408bd1560973: lanes [Cho, Ko] → preview Ko / Trello Cho
- 6ae66d5fa650d4557247425a: lanes [Cho, West] → preview West / Trello West
- 6ae66d6237400946fab8e97d: lanes [Cho, West, Hunter] → preview West / Trello West
- 6ae66e78ed08aee0d0a692be: lanes [Cho, Jae] → preview Cho / Trello Jae
- 6ae66e7a68af339bfc28fb94: lanes [Cho, Ko] → preview Ko / Trello Ko
- 6ae8b2c848e6d34ca4ec5a70: lanes [Price, Cho, Hunter] → preview Price / Trello Cho
- 6aea0f3d359ed84d92fb8959: lanes [Soap, Hunter] → preview Soap / Trello Soap
- 6aeca73cfccfb0e40898deec: lanes [Ju Kwon, Ops] → preview Ju Kwon / Trello (blank)
- 6aeca73d3f922f45e3d9ad40: lanes [Hunter] → preview Jae / Trello Jae
- 6aeca73f41e63bea345e4f3d: lanes [Price, Laswell, Hunter] → preview Price / Trello Laswell
- 6aeca74221304a911e30aa69: lanes [Laswell, Hunter] → preview Laswell / Trello (blank)
- 6aecb113679a0dde21a57f65: lanes [Price, Cho, Park, Hunter] → preview Price / Trello Park
- 6aecb1170f6e185db8d1c7cf: lanes [Price, Cho, Park, Hunter] → preview Price / Trello Park

## doneToday

Notion doneToday is unknown, not 0. No Current work row is on Done, and this schema has no completion-date property. A zero would claim that nobody shipped. Trello doneToday counts open Done cards whose latest move into Done falls on the America/Los_Angeles day of this pull.
Trello list-move actions supplied to that count: 11.
