# Backlog column, board filter and a sort button

Card: `de4da884-2bdf-4cff-a457-35146369907b`. One pull request for all three.

Todo has turned into a dumping ground on some projects. Work waiting to be
picked goes in a new Backlog column, and Todo holds only what has been chosen.
A filter hides cards by any field so a long column can be read. Sorting by
priority already exists on `s`, but nothing on screen shows it, so each column
heading gets a button for it.

## 1. Backlog

- `BACKLOG_COLUMN = 'Backlog'` in `board.ts`. `DEFAULT_COLUMNS` becomes
  `Backlog, Todo, Ship, Doing, Review, Done`.
- `withBacklogColumn(board)` puts Backlog at index 0 when the board has none,
  through the existing `withColumn`. `board-store.ts` runs it last in the
  read repair: `withBacklogColumn(withReviewColumn(withShipColumn(...)))`.
  Ship's repair inserts at index 1, so running Backlog first would put Ship
  between Backlog and Todo.
- Nothing else changes for new cards. `board add` with no `--column` already
  uses the leftmost column, and `n` adds to the column you are on.
- The subtask progress bar in `board-view.ts` counted only column 0 as
  `waiting`. Backlog and Todo both count as waiting now. The rule goes in
  `board.ts` as `isWaitingColumn(board, index)`, which is true for index 0
  and for the column named Todo, so a board without a Todo column still
  reads its first column as waiting.
- `.dashboard/CLAUDE.md` (the file agents read) describes Backlog.

## 2. Sort button

- Each column heading gets a button showing the sort icon. A click selects
  that column (on the manager, it makes that board active first), then runs
  `board-sort`. The keyboard path is `s`, unchanged.

## 3. Filter

### Model, in `board-filter.ts` (pure, tested)

```ts
type Presence = 'any' | 'has' | 'none';
type Family = 'any' | 'top-level' | 'subtasks' | 'parents';
type Age = 'any' | 'today' | 'week' | 'month' | 'older';
type BoardFilter = {
  text: string;                 // title, notes, comments, branch; case-insensitive substring
  priorities: Priority[];       // empty = any
  family: Family;
  branch: Presence;
  pullRequest: Presence;
  comments: Presence;
  created: Age;
  updated: Age;
};
```

- `emptyFilter()`, `isFilterActive(filter)`.
- `cardMatches(board, card, filter, now)`. Age is measured against `now`.
  `today` is the last 24 hours, `week` the last 7 days, `month` the last 30,
  `older` more than 30 days ago. A card with no timestamp matches only `any`.
- `family`: `top-level` means `parent === null`, `subtasks` means
  `parent !== null`, `parents` means the card has children (`hasSubtasks`).
- `visibleRows(board, filter, now): number[][]`: real card indices per
  column, in order.
- `filterSummary(filter): string`: the strip's text, e.g.
  `urgent, high · has branch · "resize"`.

### Selection over hidden cards

The selection stays a real index into `column.cards`. The rest of
`board.ts` keeps working unchanged.

- `stepSelection(board, visible, selection, direction)`: Up/Down go to the
  neighbouring visible row. Left/Right go to the nearest visible row in the
  next column, keeping the same position among visible rows (clamped).
- `settleSelection(visible, selection)`: when the selected card is hidden,
  the selection moves to the first visible card in that column, or to row 0
  if nothing in the column is visible.
- `moveTarget(visible, selection, 'up' | 'down')`: the real index of the
  neighbouring visible card. The view moves the card there with the existing
  `dropCard`, so Shift+Up/Down while filtered swaps with the next *visible*
  card. Without a filter it is the existing `moveCard`.
- A drag's row comes from the visible list items. `realRow(visible, column,
  visibleRow)` maps it back to a real index (the card at that row, or one past
  the last card when the drop is at the end).

### Dialog, in `filter-dialog.ts`

`openFilterDialog(filter): Promise<BoardFilter>`. It uses `openOverlay` and
settles with the edited filter on Escape or Enter.

Rows, walked with Up/Down:

| Row          | Keys                                            |
| ------------ | ----------------------------------------------- |
| Text         | typing edits it (`<input dir="auto">`)          |
| urgent … low | Space/Enter/Left/Right toggles; one row each    |
| Subtasks     | Left/Right cycle `Family`                       |
| Branch       | Left/Right cycle `Presence`                     |
| Pull request | Left/Right cycle `Presence`                     |
| Comments     | Left/Right cycle `Presence`                     |
| Created      | Left/Right cycle `Age`                          |
| Updated      | Left/Right cycle `Age`                          |
| Reset        | Enter clears every field                        |

- A click on a row selects it, then does what Enter does there.
- Every handler checks `isModified(event)` first. Tab stays inside the dialog,
  as it does in the search box.
- The board behind the dialog redraws as you change values.

### Board wiring, in `board-view.ts`

- A `filter` variable, starting from `emptyFilter()`. It is reset when you
  arrive on the board (`open()`), so it is not kept.
- `render()` draws only visible cards. A heading count reads `visible/total`
  while a filter is on. Above the columns sits a strip with
  `filterSummary`, `x of y cards` and a **Reset** button. The strip is hidden
  (`.board-filter-bar[hidden] { display: none }`) when no filter is on.
- A column with cards but none visible says `No card matches the filter`
  instead of `n adds a card`.
- After every render input changes (a filter edit, a board change, a read),
  the selection goes through `settleSelection`.

### Keys (`actions.ts` rows, read by help and settings)

- `board-filter`: `F`, "Filter the cards".
- `board-filter-reset`: `Shift+F`, "Show every card again".

## Help

`src/help.ts`: the board blurb mentions Backlog, the filter and the sort
button. The key rows come from `actions.ts`.

## Version

`package.json` minor bump.

## Testing

- `board.test.ts`: `withBacklogColumn` (adds at 0, keeps an existing one, the
  order of the read repair), `isWaitingColumn`.
- `board-store.test.ts`: an old board read gains Backlog in front of Todo, and
  Ship stays after Todo.
- `board-filter.test.ts`: every field of `cardMatches`, `visibleRows`,
  `stepSelection`, `settleSelection`, `moveTarget`, `realRow`, `filterSummary`.
- `board-cli.test.ts`: `add` with no column lands in Backlog.
- Existing tests that hard-code the default columns get the new list.

## Out of scope

- Keeping the filter between visits, or saving filters.
- A filter on column (columns are the layout).
