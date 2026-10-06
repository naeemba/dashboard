# Backlog, Board Filter and Sort Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every board a Backlog column in front of Todo, a filter that hides cards by any field, and a sort button on each column heading.

**Architecture:** Backlog is one more read-time column repair in `board.ts`, run from `parseBoard`. The filter's rules (matching, which rows are visible, how the selection steps over hidden cards) are pure functions in a new `board-filter.ts`. A new `filter-dialog.ts` edits a filter. `board-view.ts` only holds the filter, draws the visible cards, and wires keys and buttons.

**Tech Stack:** TypeScript, Electron renderer DOM, vitest (jsdom), lucide icons.

**Spec:** `docs/superpowers/specs/2026-10-06-board-backlog-filter-sort-design.md`

## Global Constraints

- Every `<input>`/`<textarea>` created gets `dir = 'auto'` in the same change.
- Every dialog key handler checks `if (isModified(event)) return;` first. The exception is Tab, which is swallowed before the guard so focus cannot leave the dialog.
- A class that sets `display` gets a matching `.thing[hidden] { display: none }` next to it.
- New keys are rows in `src/actions.ts` and nothing else. The help, settings and which-key screens read that table.
- `src/help.ts`'s board blurb must describe Backlog, the filter and the sort button.
- No abbreviations in identifiers (`button`, not `btn`).
- `board-view.ts` stays under 600 code lines (now 517).
- Never restart or replace the installed Dashboard app.
- Checks: `npm test`, `npx tsc --noEmit`, `npx eslint .`
- `package.json` version goes from `1.11.0` to `1.12.0`.

## Review Focus

1. A filter that hides every card in the column you are on. Expected: the selection sits on row 0, arrows still cross into other columns, and Enter/`d`/`p` act on nothing hidden. Covered in Task 3 (`settleSelection` with no visible rows) and Task 5 (actions on a hidden selection are refused).
2. An agent's write (board:change) while a filter is on moves the selected card out of the filter. Expected: the selection settles onto a visible card instead of a hidden one being highlighted off screen. Covered in Task 5 (render settles).
3. Shift+Up while filtered, with a hidden card directly above. Expected: the card swaps past the hidden one with the visible card above it. Covered in Task 3 (`reorderRow`).
4. Dropping a dragged card below the last visible card of a filtered column. Expected: it lands right after that card, not at the end of the whole column. Covered in Task 3 (`realRow`).
5. A board file written before Backlog existed, with a hand-made column order. Expected: Backlog goes first and nothing else moves. Ship still lands after the first of the old columns. Covered in Task 1.

---

### Task 1: Backlog column

**Files:**
- Modify: `src/board.ts` (constants near `:87-97`, repairs near `:176-201`)
- Modify: `src/board-store.ts:314`
- Modify: `src/icons.ts` (glyph for backlog)
- Modify: `src/board-view.ts:425` (progress bar)
- Test: `src/board.test.ts`, `src/board-store.test.ts`, `src/board-cli.test.ts`

**Interfaces:**
- Produces: `BACKLOG_COLUMN = 'Backlog'`, `withBacklogColumn(board: Board): Board`, `isWaitingColumn(board: Board, index: number): boolean`.

- [ ] **Step 1: Write the failing tests** in `src/board.test.ts`

```ts
import { BACKLOG_COLUMN, emptyBoard, isWaitingColumn, withBacklogColumn } from './board';

describe('withBacklogColumn', () => {
  it('puts Backlog first on a board without one', () => {
    const board = { columns: [{ name: 'Todo', cards: [] }, { name: 'Done', cards: [] }] };
    expect(withBacklogColumn(board).columns.map((column) => column.name)).toEqual(['Backlog', 'Todo', 'Done']);
  });

  it('hands back the same board when Backlog is already there, wherever it sits', () => {
    const board = { columns: [{ name: 'Todo', cards: [] }, { name: 'backlog', cards: [] }] };
    expect(withBacklogColumn(board)).toBe(board);
  });

  it('is part of a new board', () => {
    expect(emptyBoard().columns.map((column) => column.name))
      .toEqual([BACKLOG_COLUMN, 'Todo', 'Ship', 'Doing', 'Review', 'Done']);
  });
});

describe('isWaitingColumn', () => {
  it('counts Backlog and Todo as waiting, and nothing after', () => {
    const board = emptyBoard();
    expect([0, 1, 2, 3].map((index) => isWaitingColumn(board, index))).toEqual([true, true, false, false]);
  });

  it('counts the first column as waiting on a board with no Todo', () => {
    const board = { columns: [{ name: 'Ideas', cards: [] }, { name: 'Done', cards: [] }] };
    expect(isWaitingColumn(board, 0)).toBe(true);
    expect(isWaitingColumn(board, 1)).toBe(false);
  });
});
```

In `src/board-store.test.ts`, update every expectation listing default columns (lines ~239, 246, 329, 343, 385, 393) so it starts with `'Backlog'`. For example `['Todo', 'Ship', 'Review']` becomes `['Backlog', 'Todo', 'Ship', 'Review']`. Then add:

```ts
it('gives an old board Backlog in front of Todo and keeps Ship after Todo', () => {
  const text = JSON.stringify({ columns: [{ name: 'Todo', cards: [] }, { name: 'Doing', cards: [] }, { name: 'Done', cards: [] }] });
  expect(parseBoard(text).columns.map((column) => column.name))
    .toEqual(['Backlog', 'Todo', 'Ship', 'Doing', 'Review', 'Done']);
});
```

In `src/board-cli.test.ts`, add a test that `add "x"` with no `--column` reports `Backlog`. Copy the shape of the existing `add` test in that file, then assert `result.output` contains `  Backlog  `.

- [ ] **Step 2: Run them, expect failures**

Run: `npx vitest run src/board.test.ts src/board-store.test.ts src/board-cli.test.ts`
Expected: FAIL, with `withBacklogColumn` not exported and the column lists missing Backlog.

- [ ] **Step 3: Implement** in `src/board.ts`

Next to `REVIEW_COLUMN`:

```ts
// Where work waits before anybody has chosen it. Todo is what has been picked; this is everything
// else, so Todo stays short enough to read. Leftmost, so `board add` with no column lands here.
export const BACKLOG_COLUMN = 'Backlog';
```

`const DEFAULT_COLUMNS = [BACKLOG_COLUMN, 'Todo', SHIP_COLUMN, 'Doing', REVIEW_COLUMN, DONE_COLUMN];`

After `withReviewColumn`:

```ts
// The same repair for Backlog: always the first column. Run after the Ship repair, which counts
// from the left, or Ship would land between Backlog and Todo.
export function withBacklogColumn(board: Board): Board {
  return withColumn(board, BACKLOG_COLUMN, 0);
}

// Whether cards in this column have not been started: Backlog and Todo, and on a board with neither
// the first column. The subtask bar draws these as waiting rather than under way.
export function isWaitingColumn(board: Board, index: number): boolean {
  return index === 0 || index === columnNamed(board, 'Todo');
}
```

`src/board-store.ts:314`:
`return withBacklogColumn(withReviewColumn(withShipColumn({ columns: repairCards(columns, makeId) })));`
Add `withBacklogColumn` to the import from `./board`.

`src/board-view.ts:425`:
`segment.className = columnIndex === last ? 'done' : isWaitingColumn(state.board, columnIndex) ? 'waiting' : 'underway';`
Import `isWaitingColumn`.

`src/icons.ts`: import `Inbox` from lucide, add `backlog: Inbox` to `ICONS`, and add `[BACKLOG_COLUMN.toLowerCase()]: 'backlog'` to `COLUMN_GLYPHS` (import `BACKLOG_COLUMN`).

Fix the comment on `landsInShip` ("Ship sits second from the left") to "Ship sits just right of Todo".

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: PASS. If other tests hard-code the default column list or `emptyBoard()` indices (e.g. `{ column: 0 }` assumed to be Todo), update them to the new indices. Do not change behaviour to make them pass.

- [ ] **Step 5: Commit**

```bash
git add -A src && git commit -m "Put a Backlog column in front of Todo on every board"
```

---

### Task 2: Filter model

**Files:**
- Create: `src/board-filter.ts`
- Test: `src/board-filter.test.ts`

**Interfaces:**
- Consumes: `Board`, `Card`, `Priority`, `PRIORITIES`, `childrenOf` from `./board`; `timeOf` from `./age` (`timeOf(iso?: string): number | undefined`).
- Produces:

```ts
export type Presence = 'any' | 'has' | 'none';
export type Family = 'any' | 'top-level' | 'subtasks' | 'parents';
export type Age = 'any' | 'today' | 'week' | 'month' | 'older';
export type BoardFilter = {
  text: string; priorities: Priority[]; family: Family;
  branch: Presence; pullRequest: Presence; comments: Presence; created: Age; updated: Age;
};
export const PRESENCES: readonly Presence[];
export const FAMILIES: readonly Family[];
export const AGES: readonly Age[];
export function emptyFilter(): BoardFilter;
export function isFilterActive(filter: BoardFilter): boolean;
export function cardMatches(board: Board, card: Card, filter: BoardFilter, now: number): boolean;
export function visibleRows(board: Board, filter: BoardFilter, now: number): number[][];
export function filterSummary(filter: BoardFilter): string;
```

- [ ] **Step 1: Write the failing tests** in `src/board-filter.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import type { Board, Card } from './board';
import { cardMatches, emptyFilter, filterSummary, isFilterActive, visibleRows, type BoardFilter } from './board-filter';

const now = Date.parse('2026-10-06T12:00:00Z');
const daysAgo = (days: number): string => new Date(now - days * 86_400_000).toISOString();

function card(fields: Partial<Card>): Card {
  return { id: fields.title ?? 'x', title: 'x', notes: '', priority: 'medium', parent: null, ...fields };
}
function boardOf(...columns: Card[][]): Board {
  return { columns: columns.map((cards, index) => ({ name: `c${index}`, cards })) };
}
function filter(fields: Partial<BoardFilter>): BoardFilter {
  return { ...emptyFilter(), ...fields };
}
function matches(target: Card, fields: Partial<BoardFilter>, board: Board = boardOf([target])): boolean {
  return cardMatches(board, target, filter(fields), now);
}

describe('cardMatches', () => {
  it('matches everything with the empty filter', () => {
    expect(matches(card({}), {})).toBe(true);
    expect(isFilterActive(emptyFilter())).toBe(false);
  });

  it('finds text in the title, notes, comments and branch, ignoring case', () => {
    expect(matches(card({ title: 'Fix Resize' }), { text: 'resize' })).toBe(true);
    expect(matches(card({ notes: 'the resize race' }), { text: 'RESIZE' })).toBe(true);
    expect(matches(card({ comments: [{ body: 'resize again' }] }), { text: 'resize' })).toBe(true);
    expect(matches(card({ branch: 'fix-resize' }), { text: 'resize' })).toBe(true);
    expect(matches(card({ title: 'other' }), { text: 'resize' })).toBe(false);
  });

  it('treats a blank text as no text', () => {
    expect(isFilterActive(filter({ text: '   ' }))).toBe(false);
    expect(matches(card({}), { text: '   ' })).toBe(true);
  });

  it('keeps only the chosen priorities', () => {
    expect(matches(card({ priority: 'urgent' }), { priorities: ['urgent', 'high'] })).toBe(true);
    expect(matches(card({ priority: 'low' }), { priorities: ['urgent', 'high'] })).toBe(false);
  });

  it('tells top-level cards, subtasks and parents apart', () => {
    const parent = card({ id: 'p', title: 'p' });
    const child = card({ id: 'c', title: 'c', parent: 'p' });
    const board = boardOf([parent, child]);
    expect(matches(parent, { family: 'top-level' }, board)).toBe(true);
    expect(matches(child, { family: 'top-level' }, board)).toBe(false);
    expect(matches(child, { family: 'subtasks' }, board)).toBe(true);
    expect(matches(parent, { family: 'parents' }, board)).toBe(true);
    expect(matches(child, { family: 'parents' }, board)).toBe(false);
  });

  it('asks whether a branch, a pull request and comments are there', () => {
    expect(matches(card({ branch: 'b' }), { branch: 'has' })).toBe(true);
    expect(matches(card({}), { branch: 'has' })).toBe(false);
    expect(matches(card({}), { branch: 'none' })).toBe(true);
    expect(matches(card({ pullRequest: 4 }), { pullRequest: 'has' })).toBe(true);
    expect(matches(card({ pullRequest: 4 }), { pullRequest: 'none' })).toBe(false);
    expect(matches(card({ comments: [{ body: 'x' }] }), { comments: 'has' })).toBe(true);
    expect(matches(card({}), { comments: 'none' })).toBe(true);
  });

  it('measures created and updated against now', () => {
    expect(matches(card({ createdAt: daysAgo(0.5) }), { created: 'today' })).toBe(true);
    expect(matches(card({ createdAt: daysAgo(2) }), { created: 'today' })).toBe(false);
    expect(matches(card({ createdAt: daysAgo(6) }), { created: 'week' })).toBe(true);
    expect(matches(card({ createdAt: daysAgo(20) }), { created: 'month' })).toBe(true);
    expect(matches(card({ createdAt: daysAgo(40) }), { created: 'older' })).toBe(true);
    expect(matches(card({ createdAt: daysAgo(20) }), { created: 'older' })).toBe(false);
    expect(matches(card({ updatedAt: daysAgo(1.5) }), { updated: 'week' })).toBe(true);
  });

  it('never places a card with no timestamp on an age', () => {
    expect(matches(card({}), { created: 'older' })).toBe(false);
    expect(matches(card({}), { updated: 'today' })).toBe(false);
    expect(matches(card({}), { created: 'any' })).toBe(true);
  });

  it('needs every field to agree', () => {
    expect(matches(card({ priority: 'urgent', branch: 'b' }), { priorities: ['urgent'], branch: 'none' })).toBe(false);
  });
});

describe('visibleRows', () => {
  it('lists the real index of every matching card, per column', () => {
    const board = boardOf(
      [card({ id: 'a', priority: 'urgent' }), card({ id: 'b' }), card({ id: 'c', priority: 'urgent' })],
      [card({ id: 'd' })],
    );
    expect(visibleRows(board, filter({ priorities: ['urgent'] }), now)).toEqual([[0, 2], []]);
  });
});

describe('filterSummary', () => {
  it('names only the fields that are set', () => {
    expect(filterSummary(filter({ priorities: ['urgent', 'high'], branch: 'has', text: 'resize' })))
      .toBe('"resize" · urgent, high · has branch');
    expect(filterSummary(filter({ family: 'subtasks', created: 'week', comments: 'none' })))
      .toBe('subtasks · no comments · created in 7 days');
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `npx vitest run src/board-filter.test.ts`
Expected: FAIL, module `./board-filter` not found.

- [ ] **Step 3: Implement** `src/board-filter.ts`

```ts
import { timeOf } from './age';
import { childrenOf, PRIORITIES, type Board, type Card, type Priority } from './board';

// What the board is narrowed to. Held by the view while you are on the board and dropped when you
// leave, so nothing here is ever written to the file.
export type Presence = 'any' | 'has' | 'none';
export type Family = 'any' | 'top-level' | 'subtasks' | 'parents';
export type Age = 'any' | 'today' | 'week' | 'month' | 'older';
export type BoardFilter = {
  text: string;
  // Empty means every priority. A list rather than one level, because "urgent or high" is the
  // question a messy Todo is usually asked.
  priorities: Priority[];
  family: Family;
  branch: Presence;
  pullRequest: Presence;
  comments: Presence;
  created: Age;
  updated: Age;
};

// The order Left and Right walk each choice in, and the order the dialog lists them in.
export const PRESENCES: readonly Presence[] = ['any', 'has', 'none'];
export const FAMILIES: readonly Family[] = ['any', 'top-level', 'subtasks', 'parents'];
export const AGES: readonly Age[] = ['any', 'today', 'week', 'month', 'older'];

const DAY = 86_400_000;
const AGE_DAYS: Record<Exclude<Age, 'any'>, number> = { today: 1, week: 7, month: 30, older: 30 };

export function emptyFilter(): BoardFilter {
  return {
    text: '', priorities: [], family: 'any', branch: 'any', pullRequest: 'any', comments: 'any',
    created: 'any', updated: 'any',
  };
}

export function isFilterActive(filter: BoardFilter): boolean {
  return filterSummary(filter) !== '';
}

function present(presence: Presence, has: boolean): boolean {
  return presence === 'any' || (presence === 'has') === has;
}

// A card with no stamp has an unknown age, which is no age at all: it matches only `any`.
function aged(age: Age, stamp: string | undefined, now: number): boolean {
  if (age === 'any') return true;
  const time = timeOf(stamp);
  if (time === undefined) return false;
  const days = (now - time) / DAY;
  return age === 'older' ? days > AGE_DAYS.older : days <= AGE_DAYS[age];
}

function family(board: Board, card: Card, wanted: Family): boolean {
  switch (wanted) {
    case 'any': return true;
    case 'top-level': return card.parent === null;
    case 'subtasks': return card.parent !== null;
    case 'parents': return childrenOf(board, card.id).length > 0;
  }
}

function written(card: Card): string {
  return [card.title, card.notes, card.branch ?? '', ...(card.comments ?? []).map((comment) => comment.body)]
    .join('\n').toLowerCase();
}

export function cardMatches(board: Board, card: Card, filter: BoardFilter, now: number): boolean {
  const text = filter.text.trim().toLowerCase();
  return (text === '' || written(card).includes(text))
    && (filter.priorities.length === 0 || filter.priorities.includes(card.priority))
    && family(board, card, filter.family)
    && present(filter.branch, card.branch !== undefined)
    && present(filter.pullRequest, card.pullRequest !== undefined)
    && present(filter.comments, (card.comments ?? []).length > 0)
    && aged(filter.created, card.createdAt, now)
    && aged(filter.updated, card.updatedAt, now);
}

// The real index of every card the filter keeps, column by column. The selection stays a real index
// so every operation in board.ts works unchanged; this is what the view draws and steps over.
export function visibleRows(board: Board, filter: BoardFilter, now: number): number[][] {
  return board.columns.map((column) => column.cards.flatMap((card, index) => (
    cardMatches(board, card, filter, now) ? [index] : [])));
}

const PRESENCE_WORDS: Record<Exclude<Presence, 'any'>, string> = { has: 'has', none: 'no' };
const AGE_WORDS: Record<Exclude<Age, 'any'>, string> = {
  today: 'today', week: 'in 7 days', month: 'in 30 days', older: 'over 30 days ago',
};

// The strip's sentence: only the fields that narrow anything, in the dialog's order. Empty means
// the filter keeps every card, which is what isFilterActive asks.
export function filterSummary(filter: BoardFilter): string {
  const text = filter.text.trim();
  const parts = [
    text === '' ? '' : `"${text}"`,
    PRIORITIES.filter((priority) => filter.priorities.includes(priority)).join(', '),
    filter.family === 'any' ? '' : filter.family,
    filter.branch === 'any' ? '' : `${PRESENCE_WORDS[filter.branch]} branch`,
    filter.pullRequest === 'any' ? '' : `${PRESENCE_WORDS[filter.pullRequest]} pull request`,
    filter.comments === 'any' ? '' : `${PRESENCE_WORDS[filter.comments]} comments`,
    filter.created === 'any' ? '' : `created ${AGE_WORDS[filter.created]}`,
    filter.updated === 'any' ? '' : `updated ${AGE_WORDS[filter.updated]}`,
  ];
  return parts.filter((part) => part !== '').join(' · ');
}
```

- [ ] **Step 4: Run, expect pass**

Run: `npx vitest run src/board-filter.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/board-filter.ts src/board-filter.test.ts && git commit -m "Add the board filter's matching rules"
```

---

### Task 3: Stepping the selection over hidden cards

**Files:**
- Modify: `src/board-filter.ts`
- Test: `src/board-filter.test.ts`

**Interfaces:**
- Consumes: `Selection`, `Direction` (from `./terminals`), `clampIndex` (`./clamp-index`).
- Produces:

```ts
export function settleSelection(visible: number[][], selection: Selection): Selection;
export function stepSelection(visible: number[][], selection: Selection, direction: Direction): Selection;
export function reorderRow(visible: number[][], selection: Selection, direction: 'up' | 'down'): number | null;
export function realRow(visible: number[][], column: number, visibleRow: number, columnLength: number): number;
```

`reorderRow` answers the `row` to hand `dropCard(board, selection, selection.column, row)`. `dropCard` reads `row` as "insert before the card now at this index", so moving down past real index `n` is `n + 1`. It answers `null` when there is no visible neighbour that way.

- [ ] **Step 1: Write the failing tests** (append to `src/board-filter.test.ts`)

```ts
import { realRow, reorderRow, settleSelection, stepSelection } from './board-filter';

// Column 0 shows real rows 1 and 3; column 1 shows 0, 2 and 4; column 2 shows nothing.
const visible = [[1, 3], [0, 2, 4], []];

describe('settleSelection', () => {
  it('leaves a visible selection alone', () => {
    expect(settleSelection(visible, { column: 0, card: 3 })).toEqual({ column: 0, card: 3 });
  });
  it('moves a hidden selection to the first visible card of its column', () => {
    expect(settleSelection(visible, { column: 0, card: 2 })).toEqual({ column: 0, card: 1 });
  });
  it('rests on row 0 in a column with nothing visible', () => {
    expect(settleSelection(visible, { column: 2, card: 5 })).toEqual({ column: 2, card: 0 });
  });
});

describe('stepSelection', () => {
  it('walks up and down over visible rows only, stopping at the ends', () => {
    expect(stepSelection(visible, { column: 0, card: 1 }, 'down')).toEqual({ column: 0, card: 3 });
    expect(stepSelection(visible, { column: 0, card: 3 }, 'down')).toEqual({ column: 0, card: 3 });
    expect(stepSelection(visible, { column: 0, card: 1 }, 'up')).toEqual({ column: 0, card: 1 });
  });
  it('keeps its place among visible rows across columns', () => {
    expect(stepSelection(visible, { column: 0, card: 3 }, 'right')).toEqual({ column: 1, card: 2 });
    expect(stepSelection(visible, { column: 1, card: 4 }, 'left')).toEqual({ column: 0, card: 3 });
  });
  it('lands on row 0 of a column with nothing visible, and walks on out of it', () => {
    expect(stepSelection(visible, { column: 1, card: 2 }, 'right')).toEqual({ column: 2, card: 0 });
    expect(stepSelection(visible, { column: 2, card: 0 }, 'left')).toEqual({ column: 1, card: 0 });
  });
  it('stops at the outer columns', () => {
    expect(stepSelection(visible, { column: 0, card: 1 }, 'left')).toEqual({ column: 0, card: 1 });
  });
});

describe('reorderRow', () => {
  it('swaps past hidden cards with the visible neighbour', () => {
    expect(reorderRow(visible, { column: 0, card: 3 }, 'up')).toBe(1);
    expect(reorderRow(visible, { column: 0, card: 1 }, 'down')).toBe(4);
  });
  it('has nothing to swap with at the ends', () => {
    expect(reorderRow(visible, { column: 0, card: 1 }, 'up')).toBeNull();
    expect(reorderRow(visible, { column: 0, card: 3 }, 'down')).toBeNull();
  });
});

describe('realRow', () => {
  it('drops before the visible card at that row', () => {
    expect(realRow(visible, 1, 1, 6)).toBe(2);
  });
  it('drops right after the last visible card when aimed past it', () => {
    expect(realRow(visible, 1, 3, 6)).toBe(5);
  });
  it('drops at the end of a column with nothing visible', () => {
    expect(realRow(visible, 2, 0, 7)).toBe(7);
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `npx vitest run src/board-filter.test.ts`
Expected: FAIL, functions not exported.

- [ ] **Step 3: Implement** (append to `src/board-filter.ts`; add `import type { Selection } from './board'`, `import type { Direction } from './terminals'` and `import { clampIndex } from './clamp-index'`)

```ts
// A selection on a card the filter hides moves to the first card it keeps in that column. A column
// keeping nothing rests on row 0, which every operation in board.ts already treats as "no card"
// when the column is empty; the view refuses card actions there (see selectedIsVisible).
export function settleSelection(visible: number[][], selection: Selection): Selection {
  const rows = visible[selection.column] ?? [];
  if (rows.includes(selection.card)) return selection;
  return { column: selection.column, card: rows[0] ?? 0 };
}

// The arrows over a filtered board. Up and down walk the rows the filter keeps; left and right keep
// your place among them in the next column, clamped to how many it shows.
export function stepSelection(visible: number[][], selection: Selection, direction: Direction): Selection {
  const here = visible[selection.column] ?? [];
  const position = Math.max(0, here.indexOf(selection.card));
  if (direction === 'up' || direction === 'down') {
    const next = clampIndex(position + (direction === 'down' ? 1 : -1), here.length - 1);
    return { column: selection.column, card: here[next] ?? selection.card };
  }
  const column = clampIndex(selection.column + (direction === 'right' ? 1 : -1), visible.length - 1);
  if (column === selection.column) return selection;
  const there = visible[column];
  return { column, card: there[clampIndex(position, there.length - 1)] ?? 0 };
}

// Shift+Up and Shift+Down while filtered: the row to hand dropCard so the card trades places with the
// next card you can see, not with one the filter hides. Null when there is none that way.
export function reorderRow(visible: number[][], selection: Selection, direction: 'up' | 'down'): number | null {
  const rows = visible[selection.column] ?? [];
  const neighbour = rows[rows.indexOf(selection.card) + (direction === 'down' ? 1 : -1)];
  if (neighbour === undefined || !rows.includes(selection.card)) return null;
  return direction === 'down' ? neighbour + 1 : neighbour;
}

// A drag measures rows among the cards on screen; dropCard wants a row of the whole column. Past the
// last card shown is just after it, not the end of the column, which may be a run of hidden cards.
export function realRow(visible: number[][], column: number, visibleRow: number, columnLength: number): number {
  const rows = visible[column] ?? [];
  if (visibleRow < rows.length) return rows[visibleRow];
  return rows.length === 0 ? columnLength : rows[rows.length - 1] + 1;
}
```

Check `clampIndex(value, last)`'s behaviour when `last` is `-1` (an empty `here`). Read `src/clamp-index.ts`. If it does not return 0 or -1 there, guard: `here.length === 0 ? selection` for up/down.

- [ ] **Step 4: Run, expect pass**

Run: `npx vitest run src/board-filter.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/board-filter.ts src/board-filter.test.ts && git commit -m "Step the board selection over cards a filter hides"
```

---

### Task 4: Filter dialog

**Files:**
- Create: `src/filter-dialog.ts`
- Test: `src/filter-dialog.test.ts`
- Modify: `src/board.css` (dialog styles at the end)

**Interfaces:**
- Consumes: `openOverlay(name, dismiss)` from `./overlay`; `isModified` from `./shortcuts`; `BoardFilter`, `emptyFilter`, `PRESENCES`, `FAMILIES`, `AGES` from `./board-filter`; `PRIORITIES` from `./board`.
- Produces: `openFilterDialog(start: BoardFilter, onChange: (filter: BoardFilter) => void): Promise<BoardFilter>`. It calls `onChange` on every edit, so the board behind redraws live, and settles with the final filter on Enter (outside the Reset row), on Escape, or on a click on the margin.

Pure row logic is exported for the test: `filterRows(): FilterRow[]` and `applyRowKey(filter, row, key): BoardFilter`.

- [ ] **Step 1: Write the failing test** `src/filter-dialog.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { emptyFilter } from './board-filter';
import { applyRowKey, filterRows } from './filter-dialog';

const rows = filterRows();
const row = (name: string) => rows.find((entry) => entry.label === name)!;

describe('filter rows', () => {
  it('lists text, four priorities, the choices and reset, in that order', () => {
    expect(rows.map((entry) => entry.label)).toEqual([
      'Text', 'urgent', 'high', 'medium', 'low', 'Subtasks', 'Branch', 'Pull request', 'Comments',
      'Created', 'Updated', 'Reset',
    ]);
  });

  it('toggles a priority on Space, Enter, Left and Right', () => {
    const on = applyRowKey(emptyFilter(), row('high'), ' ');
    expect(on.priorities).toEqual(['high']);
    expect(applyRowKey(on, row('high'), 'ArrowRight').priorities).toEqual([]);
  });

  it('cycles a choice both ways and wraps', () => {
    const has = applyRowKey(emptyFilter(), row('Branch'), 'ArrowRight');
    expect(has.branch).toBe('has');
    expect(applyRowKey(emptyFilter(), row('Branch'), 'ArrowLeft').branch).toBe('none');
    expect(applyRowKey(emptyFilter(), row('Created'), 'ArrowRight').created).toBe('today');
  });

  it('clears everything on Reset', () => {
    const busy = { ...emptyFilter(), text: 'x', branch: 'has' as const, priorities: ['low' as const] };
    expect(applyRowKey(busy, row('Reset'), 'Enter')).toEqual(emptyFilter());
  });

  it('ignores keys a row does not take', () => {
    const start = emptyFilter();
    expect(applyRowKey(start, row('Branch'), 'x')).toBe(start);
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `npx vitest run src/filter-dialog.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement** `src/filter-dialog.ts`

```ts
import { PRIORITIES, type Priority } from './board';
import { AGES, emptyFilter, FAMILIES, PRESENCES, type BoardFilter } from './board-filter';
import { openOverlay } from './overlay';
import { isModified } from './shortcuts';

type ChoiceField = 'family' | 'branch' | 'pullRequest' | 'comments' | 'created' | 'updated';

// One line of the dialog. The arrows walk these; what a key does on one depends on its kind.
export type FilterRow =
  | { kind: 'text'; label: 'Text' }
  | { kind: 'priority'; label: Priority }
  | { kind: 'choice'; label: string; field: ChoiceField; values: readonly string[] }
  | { kind: 'reset'; label: 'Reset' };

export function filterRows(): FilterRow[] {
  return [
    { kind: 'text', label: 'Text' },
    ...PRIORITIES.map((priority): FilterRow => ({ kind: 'priority', label: priority })),
    { kind: 'choice', label: 'Subtasks', field: 'family', values: FAMILIES },
    { kind: 'choice', label: 'Branch', field: 'branch', values: PRESENCES },
    { kind: 'choice', label: 'Pull request', field: 'pullRequest', values: PRESENCES },
    { kind: 'choice', label: 'Comments', field: 'comments', values: PRESENCES },
    { kind: 'choice', label: 'Created', field: 'created', values: AGES },
    { kind: 'choice', label: 'Updated', field: 'updated', values: AGES },
    { kind: 'reset', label: 'Reset' },
  ];
}

const TOGGLES = [' ', 'Enter', 'ArrowLeft', 'ArrowRight'];

// What a key does to the filter on this row. The same filter back when the row does not take it, so
// the dialog can tell an edit from a key it should handle itself.
export function applyRowKey(filter: BoardFilter, row: FilterRow, key: string): BoardFilter {
  switch (row.kind) {
    case 'text': return filter;
    case 'reset': return key === 'Enter' || key === ' ' ? emptyFilter() : filter;
    case 'priority': {
      if (!TOGGLES.includes(key)) return filter;
      const on = filter.priorities.includes(row.label);
      return { ...filter, priorities: on ? filter.priorities.filter((p) => p !== row.label) : [...filter.priorities, row.label] };
    }
    case 'choice': {
      if (key !== 'ArrowLeft' && key !== 'ArrowRight') return filter;
      const at = row.values.indexOf(filter[row.field]);
      const next = row.values[(at + (key === 'ArrowRight' ? 1 : -1) + row.values.length) % row.values.length];
      return { ...filter, [row.field]: next };
    }
  }
}

function rowValue(filter: BoardFilter, row: FilterRow): string {
  switch (row.kind) {
    case 'text': return '';
    case 'reset': return 'clear every field';
    case 'priority': return filter.priorities.includes(row.label) ? 'on' : 'off';
    case 'choice': return filter[row.field];
  }
}

export function openFilterDialog(start: BoardFilter, onChange: (filter: BoardFilter) => void): Promise<BoardFilter> {
  const rows = filterRows();
  let filter = start;
  let highlighted = 0;

  return new Promise<BoardFilter>((resolve) => {
    const { dialog, remove } = openOverlay('filter', () => finish());
    function finish(): void {
      remove();
      resolve(filter);
    }

    const text = document.createElement('input');
    text.className = 'filter-text';
    text.dir = 'auto';
    text.placeholder = 'Title, notes, comments or branch';
    text.value = filter.text;
    const list = document.createElement('ul');
    list.className = 'filter-list';
    const keys = document.createElement('p');
    keys.className = 'filter-keys';
    keys.textContent = '↑↓ choose · ←→ change · Space toggles · Enter or Escape closes';
    dialog.append(list, keys);

    function edit(next: BoardFilter): void {
      if (next === filter) return;
      filter = next;
      if (text.value !== filter.text) text.value = filter.text;
      onChange(filter);
      draw();
    }

    function draw(): void {
      list.replaceChildren(...rows.map((row, index) => {
        const item = document.createElement('li');
        item.className = `filter-row${index === highlighted ? ' highlighted' : ''}`;
        const label = document.createElement('span');
        label.className = 'filter-label';
        label.textContent = row.label;
        item.append(label);
        if (row.kind === 'text') item.append(text);
        else {
          const value = document.createElement('span');
          value.className = 'filter-value';
          value.textContent = rowValue(filter, row);
          item.append(value);
        }
        // A click selects the row, then does what Enter does there.
        item.addEventListener('click', () => {
          highlighted = index;
          if (row.kind === 'text') return text.focus();
          edit(applyRowKey(filter, row, row.kind === 'choice' ? 'ArrowRight' : 'Enter'));
          draw();
        });
        return item;
      }));
      if (rows[highlighted].kind === 'text') text.focus();
      else dialog.focus();
    }

    text.addEventListener('input', () => edit({ ...filter, text: text.value }));

    dialog.addEventListener('keydown', (event) => {
      // Nothing outside the dialog may take focus while it is up.
      if (event.key === 'Tab') return event.preventDefault();
      if (isModified(event)) return;
      const row = rows[highlighted];
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        highlighted = (highlighted + (event.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length;
        return draw();
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        return finish();
      }
      // Typing in the text box is the box's; only the arrows and Escape above leave it.
      if (row.kind === 'text') {
        if (event.key === 'Enter') {
          event.preventDefault();
          finish();
        }
        return;
      }
      const next = applyRowKey(filter, row, event.key);
      if (next !== filter || TOGGLES.includes(event.key)) event.preventDefault();
      if (next === filter && event.key === 'Enter') return finish();
      edit(next);
    });

    draw();
  });
}
```

Note: Enter on a priority toggles it, as the spec says, and does not close the dialog. Enter closes from the Text and choice rows. Escape closes from anywhere.

Append to `src/board.css`:

```css
/* The filter dialog: one row per field, the label on the left and its value on the right. */
.filter-list { margin: 0; padding: 0; list-style: none; min-width: 360px; }
.filter-row { display: flex; align-items: center; gap: 12px; padding: 6px 10px; border-radius: var(--radius); }
.filter-row.highlighted { background: var(--hover); }
.filter-label { flex: 0 0 110px; color: var(--muted); }
.filter-value { color: var(--brightWhite); }
.filter-text { flex: 1; }
.filter-keys { margin: 10px 4px 0; color: var(--muted); font-size: 11px; }
```

`.filter-row` sets `display` but nothing hides it with `hidden`, so no `[hidden]` rule is needed. Style `.filter-text` like `.search-input` by reading that rule in the CSS and copying its border, background and padding.

- [ ] **Step 4: Run, expect pass**

Run: `npx vitest run src/filter-dialog.test.ts && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/filter-dialog.ts src/filter-dialog.test.ts src/board.css && git commit -m "Add the board filter dialog"
```

---

### Task 5: Wire filter and sort button into the board

**Files:**
- Modify: `src/actions.ts` (Action union `:8-48`, rows after `board-sort` `:349-352`)
- Modify: `src/board-view.ts`
- Modify: `src/board.css`
- Modify: `src/icons.ts` (`filter: Funnel`, `sort: ArrowDownWideNarrow`, `reset: X`)
- Test: `src/actions.test.ts` (if it lists kinds or keys; otherwise none). The decisions are tested in Tasks 2–3.

**Interfaces:**
- Consumes: everything from `board-filter.ts`, `openFilterDialog`.
- Produces: action kinds `board-filter` and `board-filter-reset`.

- [ ] **Step 1: Add the actions** in `src/actions.ts`

Union: `| { kind: 'board-filter' }` and `| { kind: 'board-filter-reset' }` after `board-sort`.

Rows after `board-sort`:

```ts
  {
    name: 'board-filter', description: 'Filter the cards by any of their fields',
    group: 'board', scope: 'board', action: { kind: 'board-filter' }, mac: 'F', other: 'F',
  },
  {
    name: 'board-filter-reset', description: 'Clear the filter and show every card',
    group: 'board', scope: 'board', action: { kind: 'board-filter-reset' }, mac: 'Shift+F', other: 'Shift+F',
  },
```

Run `npx vitest run src/actions.test.ts src/shortcuts.test.ts`. If a test fails because it enumerates the table (counts, uniqueness), update its expectation. If `Shift+F` collides with another row, the uniqueness test says so; pick `Shift+F` only if it is free.

- [ ] **Step 2: Wire the view** in `src/board-view.ts`

State, next to `let detail`:

```ts
  // What the board is narrowed to. Not kept: arriving on the board starts from every card.
  let filter: BoardFilter = emptyFilter();
  // The rows the filter keeps, worked out once per render, which every key and the drop then read.
  let visible: number[][] = [];
```

In `render()`, before `element.replaceChildren`:

```ts
    visible = visibleRows(state.board, filter, Date.now());
    state = { ...state, selection: settleSelection(visible, state.selection) };
```

`state` is reassigned without touching `previous`. `settleSelection` returns the same selection object when nothing moves. Building a new `state` every render is harmless, because `apply()` compares `next !== state` only for boards it was handed.

Build the columns into a wrapper so a strip can sit above them:

```ts
    const columns = document.createElement('div');
    columns.className = 'board-columns';
    columns.append(...state.board.columns.map((column, columnIndex) => { /* existing body */ }));
    element.replaceChildren(filterBar(), columns);
```

Inside the column body:
- Cards: `list.append(...visible[columnIndex].map((cardIndex) => renderCard(column.cards[cardIndex], columnIndex === state.selection.column && cardIndex === state.selection.card)));`
- Count: `count.textContent = isFilterActive(filter) ? `${visible[columnIndex].length}/${column.cards.length}` : String(column.cards.length);`
- Sort button in the heading, before `count`:

```ts
      const sort = document.createElement('button');
      sort.type = 'button';
      sort.className = 'board-sort';
      sort.title = 'Sort by priority, urgent first (s)';
      sort.append(icon('sort'));
      // Selects the column, then sorts it — what `s` does with the keyboard there.
      sort.addEventListener('click', () => {
        if (busy()) return sayIfUnread();
        state = { ...state, selection: settleSelection(visible, { column: columnIndex, card: state.selection.card }) };
        change(sortColumn(state.board, state.selection));
        element.focus();
      });
      heading.append(icon(columnIcon(column.name)), column.name, sort, count);
```

  On the manager, the `mousedown` on the stacked section (`cards-view.ts:79`) already makes this board active before the click lands.
- Empty text: when `column.cards.length > 0 && visible[columnIndex].length === 0`, show `No card matches the filter` in the `.board-empty` paragraph. Otherwise keep the existing `column.cards.length === 0` branch.

The strip, as a function in the view:

```ts
  function filterBar(): HTMLElement {
    const bar = document.createElement('div');
    bar.className = 'board-filter-bar';
    bar.hidden = !isFilterActive(filter);
    const shown = visible.reduce((sum, rows) => sum + rows.length, 0);
    const total = state.board.columns.reduce((sum, column) => sum + column.cards.length, 0);
    const summary = document.createElement('span');
    summary.className = 'board-filter-summary';
    summary.textContent = filterSummary(filter);
    const count = document.createElement('span');
    count.className = 'board-filter-count';
    count.textContent = `${shown} of ${total} cards`;
    bar.append(icon('filter'), summary, count,
      iconButton('board-filter-reset', 'reset', 'Reset', () => resetFilter()));
    return bar;
  }

  function resetFilter(): void {
    filter = emptyFilter();
    render();
    element.focus();
  }

  function openFilter(): void {
    openFilterDialog(filter, (next) => {
      filter = next;
      render();
    }).then((next) => {
      filter = next;
      element.focus();
      render();
    });
  }
```

Selected card is visible:

```ts
  // Whether the selection is on a card you can see. A column whose cards are all hidden still selects
  // row 0, and a key acting there would act on a card the filter is hiding.
  function selectedIsVisible(): boolean {
    return visible[state.selection.column]?.includes(state.selection.card) ?? false;
  }
```

In `runAction`, after the busy check:

```ts
      const cardKeys = ['board-move', 'board-attach', 'board-detach', 'board-edit', 'board-priority',
        'board-delete', 'board-open'];
      if (cardKeys.includes(action.kind) && cardAt(state.board, state.selection) && !selectedIsVisible()) {
        return options.onError('No card shown here — Shift+F clears the filter');
      }
```

Change these cases:

```ts
        case 'board-select':
          state = { ...state, selection: stepSelection(visible, state.selection, action.direction) };
          return render();
        case 'board-move': {
          if (isFilterActive(filter) && (action.direction === 'up' || action.direction === 'down')) {
            const row = reorderRow(visible, state.selection, action.direction);
            if (row === null) return;
            return change(dropCard(state.board, state.selection, state.selection.column, row));
          }
          return moveThenShip(state.selection, moveCard(state.board, state.selection, action.direction), action.direction);
        }
        case 'board-filter': return openFilter();
        case 'board-filter-reset': return resetFilter();
```

`stepSelection` with no filter on behaves exactly like `moveSelection`, because every row is visible. Check this against the tests in `board.test.ts` for `moveSelection`. If any case differs (a left/right move keeping the row index vs. the position), keep `moveSelection` when `!isFilterActive(filter)`:

```ts
          const selection = isFilterActive(filter)
            ? stepSelection(visible, state.selection, action.direction)
            : moveSelection(state.board, state.selection, action.direction);
```

Use this form. It leaves unfiltered behaviour byte-for-byte as before.

Drop: in `dropOnColumn`, replace `rowUnder(list, event.clientY)` with `realRow(visible, columnIndex, rowUnder(list, event.clientY), state.board.columns[columnIndex].cards.length)`.

Arrival resets the filter. In `open()`, before `await readAgain(true)`: `filter = emptyFilter();`.

Imports: `dropCard` is already imported. Add from `./board-filter`: `emptyFilter, filterSummary, isFilterActive, realRow, reorderRow, settleSelection, stepSelection, visibleRows, type BoardFilter`. Add `openFilterDialog` from `./filter-dialog`, and `iconButton` from `./icons`.

- [ ] **Step 3: CSS** in `src/board.css`

Change `.board` to stack the strip over the columns, and move the row layout to `.board-columns`:

```css
.board {
  display: flex;
  flex-direction: column;
  gap: 10px;
  height: 100%;
  padding: 14px;
  background: var(--background);
  box-sizing: border-box;
  overflow: hidden;
  outline: none;
}

.board-columns {
  display: flex;
  gap: 12px;
  flex: 1;
  min-height: 0;
}

/* Says the board is narrowed and by what, with the way back. */
.board-filter-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 10px;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  color: var(--muted);
  font-size: 12px;
}

/* The bar's own display beats the browser's [hidden]. */
.board-filter-bar[hidden] {
  display: none;
}

.board-filter-summary {
  color: var(--brightWhite);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.board-filter-count {
  margin-left: auto;
}

.board-sort {
  display: inline-flex;
  padding: 2px;
  border: none;
  border-radius: var(--radius);
  background: none;
  color: var(--muted);
  cursor: pointer;
}

.board-sort:hover {
  background: var(--hover);
  color: var(--brightWhite);
}
```

The `.board-count` keeps its `margin-left: auto`, so the sort button sits right after the name. Style `.board-filter-reset` from the existing tab-bar button CSS that `iconButton` is already used with (`grep -n "iconButton(" src` to find a class, then copy its look).

- [ ] **Step 4: Run all checks**

Run: `npm test && npx tsc --noEmit && npx eslint .`
Expected: PASS. Then count code lines in `board-view.ts`: `grep -cvE '^\s*(//|$)' src/board-view.ts`. It must stay under 600. If it does not, move `filterBar` into `src/filter-bar.ts` as `filterBar(filter, visible, board, onReset): HTMLElement`.

Also run the two Hard Rule checks:

```bash
grep -rn "createElement('input')\|createElement('textarea')" src/ | wc -l
grep -rn "dir = 'auto'" src/ | wc -l
```

Expected: equal counts.

- [ ] **Step 5: Commit**

```bash
git add -A src && git commit -m "Filter the board and sort a column from its heading"
```

---

### Task 6: Help, agent docs, version

**Files:**
- Modify: `src/help.ts` (board blurb, `:62-125`)
- Modify: `.dashboard/CLAUDE.md`
- Modify: `package.json` (`1.11.0` → `1.12.0`)
- Test: `src/help.test.ts` if it pins blurb text

- [ ] **Step 1: Help blurb.** Read the full board blurb in `src/help.ts`. Add these sentences next to the existing column and search sentences, in the file's voice:
  - "Backlog is where a card waits until somebody picks it; Todo holds what has been picked. Every board gets Backlog in front of Todo, and `board add` with no column puts a card there."
  - "f filters the board by any field of a card — words in it, priority, subtasks, branch, pull request, comments, when it was made or last changed. Cards that do not match are hidden, a strip above the columns says what is filtered, and its Reset or Shift+F shows every card again. The filter is gone when you leave the board."
  - "s sorts the column urgent first, and so does the button on each column's heading."

  Do not restate key bindings that the table prints.

- [ ] **Step 2: `.dashboard/CLAUDE.md`.** Add a bullet before the `Ship` bullet: "- The `Backlog` column is first on every board. A card nobody has chosen to work on waits there; `Todo` holds what has been picked. `board add` with no `--column` puts a card in Backlog." Update the JSON example's column name only if it claims to show the default order (it does not, so leave it).

- [ ] **Step 3: Version.** `package.json` `"version": "1.12.0"`. Also update `package-lock.json`'s two top `version` fields to match, if present.

- [ ] **Step 4: Run all checks**

Run: `npm test && npx tsc --noEmit && npx eslint .`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/help.ts .dashboard/CLAUDE.md package.json package-lock.json && git commit -m "Describe Backlog, the filter and the sort button, and bump to 1.12.0"
```
