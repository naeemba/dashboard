# Ship a Card Into a Worktree — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Moving a board card into a new `Ship` column creates a git worktree off a freshly fetched base branch, takes a pane you have never typed into, and starts `claude "/work-card <id>"` in it.

**Architecture:** A new column name in `board.ts`; the pure decisions (branch name, worktree path, free pane, blocking dirt) in a new `ship.ts` with a test beside it; a local `worktrees.json` in userData through a new `worktree-store.ts`; three new IPC channels whose handlers run `git` asynchronously in the main process; and a `Ctrl+W` overlay to remove worktrees. `renderer.ts` gains nothing — it is already over the 600-line limit.

**Tech Stack:** TypeScript, Electron, node-pty, vitest, xterm.js. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-10-ship-a-card-into-a-worktree-design.md`

## Global Constraints

- **Never rebuild, restart, quit or replace the running Dashboard app.** Building into `out/` or `.vite/` is fine. After changes, run the tests and say the installed app needs a rebuild to pick them up.
- **No abbreviations in identifiers.** `configuration` not `config`, `repository` not `repo`, `message` not `msg`. Established acronyms (`id`, `url`, `json`, `api`, `uid`) are fine.
- **No source file over 600 lines of code.** `renderer.ts` is already at 744 — it may be edited but must not get longer.
- **Every new `<input>` or `<textarea>` gets `element.dir = 'auto'`** in the same change that adds it.
- **Every dialog that reads `event.key` starts with `if (isModified(event)) return;`** — see `src/overlay.ts` and `src/picker.ts` for the pattern.
- **A refusal is explained where it is decided.** Export the predicate from the file that enforces it and call it from the file that prints the message. Never write the condition twice.
- **IPC channels are `<noun>:<verb>`** — `worktree:create`, not `create:worktree`.
- **`src/help.ts` is part of every change** that adds or alters a key, a mode, or what a screen does.
- **No mention of Claude, Anthropic, or any AI tool** in commit messages, code comments, or documentation. (The literal command `claude` that the pane runs is a program name and is fine.)
- **No `Co-Authored-By` or "Generated with" trailers** in commits.
- Checks that must pass before every commit: `npm test`, `npx tsc --noEmit`, `npx eslint .`

---

### Task 1: The Ship column

A fourth column named `Ship`, second from the left. New boards ship with it; every board that already exists gets an empty one inserted when it is read, so nobody hand-edits a file. Plus the board operation the ship needs: move a card straight to a column, rather than one step at a time.

**Files:**
- Modify: `src/board.ts` (add `SHIP_COLUMN`, change `DEFAULT_COLUMNS`, add `shipColumnIndex`, `withShipColumn`, `moveCardToColumn`)
- Modify: `src/board-store.ts:202-210` (`parseBoard` applies `withShipColumn`), and `EXPLANATION_FOR_AGENTS` at line 28
- Modify: `src/board.test.ts:59`, `src/board-store.test.ts:191,205,231`
- Modify: `.dashboard/CLAUDE.md`, `.dashboard/README.md` (regenerated from the constants — a test pins them)
- Test: `src/board.test.ts`, `src/board-store.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `SHIP_COLUMN: string` (the literal `'Ship'`)
  - `shipColumnIndex(board: Board): number` — index of the Ship column, or `-1`
  - `withShipColumn(board: Board): Board` — same object when it already has one
  - `moveCardToColumn(board: Board, selection: Selection, target: number): Change`

- [ ] **Step 1: Write the failing tests**

Add to `src/board.test.ts`. Replace the existing assertion on line 59 rather than adding a second one:

```typescript
import {
  SHIP_COLUMN,
  emptyBoard,
  moveCardToColumn,
  shipColumnIndex,
  withShipColumn,
} from './board';

describe('the Ship column', () => {
  it('is second from the left on a new board', () => {
    expect(emptyBoard().columns.map((column) => column.name)).toEqual(['Todo', 'Ship', 'Doing', 'Done']);
  });

  it('finds Ship whatever case it is written in', () => {
    expect(shipColumnIndex(emptyBoard())).toBe(1);
    expect(shipColumnIndex({ columns: [{ name: 'ship', cards: [] }] })).toBe(0);
    expect(shipColumnIndex({ columns: [{ name: 'Todo', cards: [] }] })).toBe(-1);
  });

  it('inserts an empty Ship second into a board that has none', () => {
    const old = { columns: [{ name: 'Todo', cards: [] }, { name: 'Doing', cards: [] }] };
    expect(withShipColumn(old).columns.map((column) => column.name)).toEqual(['Todo', 'Ship', 'Doing']);
    expect(withShipColumn(old).columns[1].cards).toEqual([]);
  });

  // The same object back, so a board that already has one neither burns an undo step nor is rewritten.
  it('hands back the same board when Ship is already there', () => {
    const board = emptyBoard();
    expect(withShipColumn(board)).toBe(board);
  });
});

describe('moveCardToColumn', () => {
  const board = {
    columns: [
      { name: 'Todo', cards: [{ id: 'a', title: 'a', notes: '', priority: 'medium' as const, parent: null }] },
      { name: 'Ship', cards: [] },
      { name: 'Doing', cards: [] },
    ],
  };

  it('moves a card straight to a column two along, and lands it last', () => {
    const moved = moveCardToColumn(board, { column: 0, card: 0 }, 2);
    expect(moved.board.columns[0].cards).toEqual([]);
    expect(moved.board.columns[2].cards.map((card) => card.id)).toEqual(['a']);
    expect(moved.selection).toEqual({ column: 2, card: 0 });
  });

  it('ages the card, because a column change is a change to the work', () => {
    const moved = moveCardToColumn(board, { column: 0, card: 0 }, 1);
    expect(moved.board.columns[1].cards[0].updatedAt).toEqual(expect.any(String));
  });

  it('hands back the same board when there is nothing to do', () => {
    expect(moveCardToColumn(board, { column: 0, card: 0 }, 0).board).toBe(board);
    expect(moveCardToColumn(board, { column: 0, card: 0 }, 9).board).toBe(board);
    expect(moveCardToColumn(board, { column: 1, card: 0 }, 2).board).toBe(board);
  });
});
```

Update the three assertions in `src/board-store.test.ts` (lines 191, 205, 231) from `['Todo', 'Doing', 'Done']` to `['Todo', 'Ship', 'Doing', 'Done']`, and add:

```typescript
it('gives a three-column board read from disk its Ship column', () => {
  const path = project();
  writeFileSync(join(path, BOARD_DIRECTORY, 'board.json'), JSON.stringify({
    columns: [{ name: 'Todo', cards: [] }, { name: 'Doing', cards: [] }, { name: 'Done', cards: [] }],
  }));
  expect(columnNames(readBoard(path).board)).toEqual(['Todo', 'Ship', 'Doing', 'Done']);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/board.test.ts src/board-store.test.ts`
Expected: FAIL — `shipColumnIndex is not a function`, and the column-name assertions do not match.

- [ ] **Step 3: Write the implementation**

In `src/board.ts`, replace the `DEFAULT_COLUMNS` line (currently line 61):

```typescript
// The column you move a card into to start it: the app makes a worktree, takes a pane you have not
// been typing in, and starts an agent there. Named rather than positioned, because an index moves the
// moment somebody adds a column and the name is what board.json actually carries.
export const SHIP_COLUMN = 'Ship';

const DEFAULT_COLUMNS = ['Todo', SHIP_COLUMN, 'Doing', 'Done'];
```

Add below `replaceColumn` (after line 78):

```typescript
// Where Ship is, or -1. Case-insensitive, the same way create-task.js matches a --column, so a board
// written by hand with "ship" is not a board the feature quietly refuses to work on.
export function shipColumnIndex(board: Board): number {
  return board.columns.findIndex((column) => column.name.toLowerCase() === SHIP_COLUMN.toLowerCase());
}

// Every board written before Ship existed has three columns, and getting the fourth should not mean
// hand-editing a file. Inserted second, where it belongs, and empty, so a project that never ships a
// card pays nothing for it. The same board back when it already has one, so reading a board is not a
// change to it.
export function withShipColumn(board: Board): Board {
  if (shipColumnIndex(board) !== -1) return board;
  const columns = [...board.columns];
  columns.splice(1, 0, { name: SHIP_COLUMN, cards: [] });
  return withColumns(board, columns);
}
```

Add below `moveCard` (after line 313):

```typescript
// Straight to a column, wherever the card is now. moveCard walks one column at a time, which is what
// a keystroke means and not what a ship means: the worktree's board has the card wherever the last
// merge left it, and the ship has to put it in Ship in one go from any of them.
//
// It lands last in the column it arrives at rather than keeping its row, because the caller is not a
// cursor and has no row to keep.
export function moveCardToColumn(board: Board, selection: Selection, target: number): Change {
  const cards = board.columns[selection.column]?.cards ?? [];
  const card = cards[selection.card];
  if (!card || target < 0 || target >= board.columns.length || target === selection.column) {
    return { board, selection };
  }
  const arriving = [...board.columns[target].cards, { ...card, updatedAt: stamp() }];
  const leaving = cards.filter((_entry, at) => at !== selection.card);
  const columns = board.columns.map((column, at) => {
    if (at === selection.column) return { ...column, cards: leaving };
    if (at === target) return { ...column, cards: arriving };
    return column;
  });
  return { board: withColumns(board, columns), selection: { column: target, card: arriving.length - 1 } };
}
```

In `src/board-store.ts`, import `withShipColumn` and change the last line of `parseBoard`:

```typescript
  return withShipColumn({ columns: repairCards(columns, makeId) });
```

In `EXPLANATION_FOR_AGENTS`, after the line that reads ``- \`columns\` is ordered. The first column is the leftmost on screen.``, add:

```
- The \`Ship\` column is not an ordinary one. Moving a card into it asks the
  Dashboard app to make a git worktree for that card, check out a branch named
  after it, and start an agent in one of the project's panes. Put a card there
  only when you mean to start it.
- A card's column on the \`main\` branch says what has been merged. While work
  is in flight the card's column lives on that work's own branch, and arrives
  here when the pull request does.
```

- [ ] **Step 4: Regenerate this repo's own `.dashboard` docs**

A test pins `.dashboard/CLAUDE.md` and `.dashboard/README.md` against the two constants, and `seedBoardDirectory` only writes a file that is not there. So delete and re-seed:

```bash
rm .dashboard/CLAUDE.md .dashboard/README.md
node -e "require('tsx/cjs'); require('./src/board-store.ts').seedBoardDirectory('.')" 2>/dev/null \
  || echo "no tsx — copy the constants by hand instead"
```

If that fails, open `src/board-store.ts` and copy the two template literals into the files verbatim, resolving the `\`` escapes to plain backticks. Verify with `npx vitest run src/board-store.test.ts`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test && npx tsc --noEmit && npx eslint .`
Expected: PASS. If `board-state.test.ts` or `manager.test.ts` fail, read the failure — they build their own boards through a helper and should be untouched. Any test that failed because it counted on three columns gets its expectation updated, never the production code bent back.

- [ ] **Step 6: Commit**

```bash
git add src/board.ts src/board-store.ts src/board.test.ts src/board-store.test.ts .dashboard/CLAUDE.md .dashboard/README.md
git commit -m "board: a Ship column, and a way to send a card straight to one"
```

---

### Task 2: ship.ts — the decisions

Every branch in this feature that is not git's or Electron's, in one module with a test beside it, the way `waiting.ts` and `session.ts` already are.

**Files:**
- Create: `src/ship.ts`
- Test: `src/ship.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `branchNameFor(title: string, cardId: string, taken: readonly string[]): string`
  - `worktreePathFor(projectPath: string, branch: string): string`
  - `freePane(typedIn: readonly number[], count: number): number | null`
  - `blockingChanges(porcelain: string): string[]`
  - `BOARD_FILE_PATH: string` (the literal `'.dashboard/board.json'`)

- [ ] **Step 1: Write the failing test**

Create `src/ship.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { blockingChanges, branchNameFor, freePane, worktreePathFor } from './ship';

const cardId = 'fc2bf7b0-1234-4321-8888-aaaaaaaaaaaa';

describe('branchNameFor', () => {
  it('makes a branch out of the title', () => {
    expect(branchNameFor('Panes name themselves', cardId, [])).toBe('panes-name-themselves');
  });

  it('collapses punctuation and trims the hyphens off both ends', () => {
    expect(branchNameFor('  Fix "Open a new project…" doing nothing!  ', cardId, []))
      .toBe('fix-open-a-new-project-doing-nothing');
  });

  // A title with no Latin letters in it slugifies to nothing. A branch has to be called something.
  it('falls back to the card id when the title leaves nothing behind', () => {
    expect(branchNameFor('کارت جدید', cardId, [])).toBe('card-fc2b');
    expect(branchNameFor('!!!', cardId, [])).toBe('card-fc2b');
    expect(branchNameFor('', cardId, [])).toBe('card-fc2b');
  });

  it('never ends on a hyphen, even when the cut lands on one', () => {
    const long = 'a'.repeat(46) + ' and then some more words after it';
    expect(branchNameFor(long, cardId, []).endsWith('-')).toBe(false);
    expect(branchNameFor(long, cardId, []).length).toBeLessThanOrEqual(48);
  });

  it('adds four characters of the card id when the name is taken', () => {
    expect(branchNameFor('Panes name themselves', cardId, ['panes-name-themselves']))
      .toBe('panes-name-themselves-fc2b');
  });

  it('counts up when even that is taken', () => {
    const taken = ['panes-name-themselves', 'panes-name-themselves-fc2b'];
    expect(branchNameFor('Panes name themselves', cardId, taken)).toBe('panes-name-themselves-fc2b-2');
  });
});

describe('worktreePathFor', () => {
  // Beside the project, never inside it: nothing to gitignore, and a search in the real checkout
  // never walks into it.
  it('puts the worktree in a sibling folder named after the project', () => {
    expect(worktreePathFor('/Users/sharp/workspace/personal/dashboard', 'panes-name-themselves'))
      .toBe('/Users/sharp/workspace/personal/dashboard.worktrees/panes-name-themselves');
  });

  it('is not confused by a trailing slash on the project path', () => {
    expect(worktreePathFor('/Users/sharp/work/api/', 'bump-deps'))
      .toBe('/Users/sharp/work/api.worktrees/bump-deps');
  });
});

describe('freePane', () => {
  it('takes the lowest pane nobody has typed into', () => {
    expect(freePane([], 5)).toBe(0);
    expect(freePane([0, 1], 5)).toBe(2);
    expect(freePane([1, 3], 5)).toBe(0);
  });

  it('answers null when every pane has been used', () => {
    expect(freePane([0, 1, 2, 3, 4], 5)).toBe(null);
  });
});

describe('blockingChanges', () => {
  // board.json is the app's own file: it is rewritten on every keystroke and put back to HEAD as the
  // ship's first step, so counting it would mean the ship refuses itself.
  it('ignores the board file on its own', () => {
    expect(blockingChanges(' M .dashboard/board.json\n')).toEqual([]);
    expect(blockingChanges('')).toEqual([]);
  });

  it('names every other changed file', () => {
    const porcelain = ' M src/board.ts\n M .dashboard/board.json\n?? docs/notes.md\n';
    expect(blockingChanges(porcelain)).toEqual(['src/board.ts', 'docs/notes.md']);
  });

  it('reads a rename as its new name', () => {
    expect(blockingChanges('R  src/old.ts -> src/new.ts\n')).toEqual(['src/new.ts']);
  });

  it('strips the quotes git puts round a path with a space in it', () => {
    expect(blockingChanges(' M "src/two words.ts"\n')).toEqual(['src/two words.ts']);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/ship.test.ts`
Expected: FAIL — `Failed to resolve import "./ship"`.

- [ ] **Step 3: Write the implementation**

Create `src/ship.ts`:

```typescript
import { basename, dirname, join } from 'node:path';

// Every decision the ship makes that is not git's or Electron's. The handlers in main.ts run the
// commands; what to call things, which pane to take and what counts as being in the way is here,
// where a test can pin it.

// The project's board, relative to the project. Spelled here as well as in board-store.ts because
// this is the path git reports and git compares, not a path anything joins.
export const BOARD_FILE_PATH = '.dashboard/board.json';

// How long a branch name may get. Past this the card id on the end pushes it out of what a shell
// prompt shows, and a branch you cannot read is a branch you check out by mistake.
const BRANCH_LIMIT = 48;
// How many characters of the card id disambiguate two cards with the same title.
const ID_LENGTH = 4;

function slug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, BRANCH_LIMIT)
    // Again after the cut: slicing mid-word can land the last character on a hyphen, and git accepts
    // a branch ending in one while nothing else about it reads as a name.
    .replace(/-+$/, '');
}

// The branch a card's work goes on. The title, or the card id when the title has no Latin letters in
// it — a card written in Persian slugifies to nothing, and a branch has to be called something.
//
// `taken` is every branch the repository already has. A second card with the same title gets four
// characters of its id; two cards whose titles slugify the same and whose ids also share those four
// characters get a number, which is as far as this bothers to go.
export function branchNameFor(title: string, cardId: string, taken: readonly string[]): string {
  const short = cardId.replace(/-/g, '').slice(0, ID_LENGTH);
  const base = slug(title) || `card-${short}`;
  if (!taken.includes(base)) return base;
  const withId = `${base}-${short}`;
  if (!taken.includes(withId)) return withId;
  for (let attempt = 2; attempt < 100; attempt += 1) {
    const candidate = `${withId}-${attempt}`;
    if (!taken.includes(candidate)) return candidate;
  }
  throw new Error(`a hundred branches are already called ${base}`);
}

// Beside the project, never inside it. Nothing to add to a .gitignore, nvim and ripgrep in the real
// checkout never walk into it, and a delete under dashboard.worktrees/ cannot reach dashboard/.
export function worktreePathFor(projectPath: string, branch: string): string {
  // Through basename and dirname rather than string work, so a trailing slash does not turn
  // /Users/sharp/work/api/ into a folder called ".worktrees".
  const name = basename(projectPath);
  return join(dirname(projectPath), `${name}.worktrees`, branch);
}

// The lowest-numbered pane nobody has typed into, or null when every one has been used. Never typed
// in is the only signal there is: main sees every keystroke sent to a pty and nothing at all about
// what is running in one. A pane running a startup command you did not type reads as free, which is
// a true statement about a pane nobody has touched and not one about what is in it.
export function freePane(typedIn: readonly number[], count: number): number | null {
  for (let index = 0; index < count; index += 1) {
    if (!typedIn.includes(index)) return index;
  }
  return null;
}

// The changed files that stop a ship, read from `git status --porcelain`. The refusal and the message
// that explains it both call this, so the count on screen is exactly the list that caused it.
//
// board.json is the one exemption. The app rewrites it on every keystroke and the ship's first step
// puts it back to HEAD, so counting it would mean the ship always refuses itself.
export function blockingChanges(porcelain: string): string[] {
  return porcelain
    .split('\n')
    // `XY path`, so the path starts at column 3. A rename is `XY old -> new`.
    .filter((line) => line.length > 3)
    .map((line) => line.slice(3).split(' -> ').pop() ?? '')
    // git quotes a path with a space or a non-ASCII character in it.
    .map((path) => path.replace(/^"|"$/g, ''))
    .filter((path) => path !== '' && path !== BOARD_FILE_PATH);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/ship.test.ts && npx tsc --noEmit && npx eslint .`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ship.ts src/ship.test.ts
git commit -m "ship: branch names, worktree paths, free panes and what blocks a ship"
```

---

### Task 3: worktree-store.ts — what is in flight

`worktrees.json` in userData, beside `session.json` and `recents.json`. Local state about local checkouts: never in git, so it can never conflict, and — like the session — a damaged file means nothing is recorded rather than the app failing to start.

**Files:**
- Create: `src/worktree-store.ts`
- Test: `src/worktree-store.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type WorktreeEntry = { cardId: string; title: string; projectPath: string; branch: string; worktreePath: string; pane: number | null; startedAt: string }`
  - `parseWorktrees(stored: unknown): WorktreeEntry[]`
  - `readWorktrees(file: string): WorktreeEntry[]`
  - `writeWorktrees(file: string, entries: WorktreeEntry[]): void`
  - `entryForCard(entries: readonly WorktreeEntry[], cardId: string): WorktreeEntry | undefined`
  - `withEntry(entries: readonly WorktreeEntry[], entry: WorktreeEntry): WorktreeEntry[]`
  - `withoutWorktree(entries: readonly WorktreeEntry[], worktreePath: string): WorktreeEntry[]`
  - `livingEntries(entries: readonly WorktreeEntry[], exists: (path: string) => boolean): WorktreeEntry[]`

- [ ] **Step 1: Write the failing test**

Create `src/worktree-store.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import {
  entryForCard,
  livingEntries,
  parseWorktrees,
  withEntry,
  withoutWorktree,
  type WorktreeEntry,
} from './worktree-store';

const entry: WorktreeEntry = {
  cardId: 'fc2bf7b0-1234-4321-8888-aaaaaaaaaaaa',
  title: 'Panes name themselves',
  projectPath: '/Users/sharp/workspace/personal/dashboard',
  branch: 'panes-name-themselves',
  worktreePath: '/Users/sharp/workspace/personal/dashboard.worktrees/panes-name-themselves',
  pane: 2,
  startedAt: '2026-09-10T09:14:22.104Z',
};

describe('parseWorktrees', () => {
  it('keeps an entry as it was written', () => {
    expect(parseWorktrees({ entries: [entry] })).toEqual([entry]);
  });

  it('reads nothing out of a file that is not a record of worktrees', () => {
    expect(parseWorktrees(null)).toEqual([]);
    expect(parseWorktrees('[]')).toEqual([]);
    expect(parseWorktrees({})).toEqual([]);
    expect(parseWorktrees({ entries: 'no' })).toEqual([]);
  });

  // Every field but the pane names something that has to exist for the entry to mean anything. An
  // entry missing one of them cannot be shown, jumped to or removed, so it is dropped rather than
  // kept as a row that does nothing.
  it('drops an entry missing a field it cannot do without, and keeps the others', () => {
    const stored = { entries: [{ ...entry, worktreePath: '' }, entry, { cardId: 'x' }] };
    expect(parseWorktrees(stored)).toEqual([entry]);
  });

  // A worktree that was made but never got a pane is a real state: it is what the flow leaves behind
  // when every pane in the project has been typed into.
  it('keeps an entry with no pane', () => {
    expect(parseWorktrees({ entries: [{ ...entry, pane: null }] })[0].pane).toBe(null);
    expect(parseWorktrees({ entries: [{ ...entry, pane: 'two' }] })[0].pane).toBe(null);
    expect(parseWorktrees({ entries: [{ ...entry, pane: 1.5 }] })[0].pane).toBe(null);
  });
});

describe('entryForCard', () => {
  it('finds the entry a card is shipped under', () => {
    expect(entryForCard([entry], entry.cardId)).toBe(entry);
    expect(entryForCard([entry], 'nobody')).toBe(undefined);
  });
});

describe('withEntry', () => {
  it('adds an entry that is not there', () => {
    expect(withEntry([], entry)).toEqual([entry]);
  });

  // Taking the pane happens after the worktree is recorded, so the second write replaces the first.
  it('replaces the entry for a card already recorded', () => {
    const withPane = { ...entry, pane: 4 };
    expect(withEntry([entry], withPane)).toEqual([withPane]);
  });
});

describe('withoutWorktree', () => {
  it('drops the entry for a worktree that has been removed', () => {
    expect(withoutWorktree([entry], entry.worktreePath)).toEqual([]);
    expect(withoutWorktree([entry], '/somewhere/else')).toEqual([entry]);
  });
});

describe('livingEntries', () => {
  // A worktree deleted by hand with `git worktree remove` must not leave a card marked in flight
  // forever, with nothing on screen able to clear it.
  it('drops entries whose folder has gone', () => {
    const gone = { ...entry, cardId: 'other', worktreePath: '/gone' };
    expect(livingEntries([entry, gone], (path) => path !== '/gone')).toEqual([entry]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/worktree-store.test.ts`
Expected: FAIL — `Failed to resolve import "./worktree-store"`.

- [ ] **Step 3: Write the implementation**

Create `src/worktree-store.ts`:

```typescript
import { readFileSync, writeFileSync } from 'node:fs';

// What is in flight right now: one entry per worktree the app has made. Kept beside session.json and
// recents.json in the app's own folder rather than in the project, because it describes checkouts on
// this machine. Nothing here is ever committed, so it can never take part in a merge.
//
// The board on main says what has been merged. This file is what stops that being the whole truth on
// screen: a card whose work is under way draws its badge from here.
export type WorktreeEntry = {
  cardId: string;
  title: string;
  projectPath: string;
  branch: string;
  worktreePath: string;
  // The pane running the agent, or null when the worktree was made and every pane was already in
  // use. Null is a real state, not a missing field.
  pane: number | null;
  startedAt: string;
};

const TEXT_FIELDS = ['cardId', 'title', 'projectPath', 'branch', 'worktreePath', 'startedAt'] as const;

function isPane(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

// Every field but the pane names something the entry cannot do without: which card, which folder,
// which branch. One of them missing leaves a row that cannot be drawn, jumped to or removed, so the
// entry goes rather than sitting there doing nothing.
function toEntry(stored: unknown): WorktreeEntry | null {
  const record = (stored ?? {}) as Record<string, unknown>;
  if (TEXT_FIELDS.some((field) => typeof record[field] !== 'string' || record[field] === '')) return null;
  return {
    cardId: record.cardId as string,
    title: record.title as string,
    projectPath: record.projectPath as string,
    branch: record.branch as string,
    worktreePath: record.worktreePath as string,
    pane: isPane(record.pane) ? record.pane : null,
    startedAt: record.startedAt as string,
  };
}

export function parseWorktrees(stored: unknown): WorktreeEntry[] {
  const { entries } = (stored ?? {}) as { entries?: unknown };
  return (Array.isArray(entries) ? entries : []).flatMap((entry) => toEntry(entry) ?? []);
}

// Like the session and the recents, this is a convenience rather than state to recover: a missing or
// damaged file means nothing is recorded, and a write that fails must not take down the ship that was
// otherwise finished.
export function readWorktrees(file: string): WorktreeEntry[] {
  try {
    return parseWorktrees(JSON.parse(readFileSync(file, 'utf8')));
  } catch {
    return [];
  }
}

export function writeWorktrees(file: string, entries: WorktreeEntry[]): void {
  try {
    writeFileSync(file, JSON.stringify({ entries }, null, 2));
  } catch {
    // Nothing recorded this time.
  }
}

export function entryForCard(
  entries: readonly WorktreeEntry[],
  cardId: string,
): WorktreeEntry | undefined {
  return entries.find((entry) => entry.cardId === cardId);
}

// One entry per card. The ship writes twice — once when the worktree exists, again when a pane has
// taken it — and the second write must replace the first rather than making a second row.
export function withEntry(entries: readonly WorktreeEntry[], entry: WorktreeEntry): WorktreeEntry[] {
  const others = entries.filter((existing) => existing.cardId !== entry.cardId);
  return [...others, entry];
}

export function withoutWorktree(
  entries: readonly WorktreeEntry[],
  worktreePath: string,
): WorktreeEntry[] {
  return entries.filter((entry) => entry.worktreePath !== worktreePath);
}

// A worktree removed by hand — `git worktree remove`, or an `rm -rf` — must not leave its card marked
// as in flight forever, refusing every later ship of it with nothing on screen able to clear it.
export function livingEntries(
  entries: readonly WorktreeEntry[],
  exists: (path: string) => boolean,
): WorktreeEntry[] {
  return entries.filter((entry) => exists(entry.worktreePath));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/worktree-store.test.ts && npx tsc --noEmit && npx eslint .`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/worktree-store.ts src/worktree-store.test.ts
git commit -m "worktrees: a local record of what is in flight"
```

---

### Task 4: shell.ts — starting the agent in a pane

The agent runs through the same login-and-interactive shell nvim gets, for the same reason: an app launched from the Dock has almost no PATH, and `claude` lives wherever the user's shell puts it.

**Files:**
- Modify: `src/shell.ts` (add `agentArguments` below `editorArguments`)
- Test: `src/shell.test.ts`

**Interfaces:**
- Consumes: `quoteForShell`, `isPowerShell` (both already in `shell.ts`)
- Produces: `agentArguments(shellCommand: string, prompt: string): string[]`

- [ ] **Step 1: Write the failing test**

Add to `src/shell.test.ts`:

```typescript
import { agentArguments } from './shell';

describe('agentArguments', () => {
  it('runs claude through a login and interactive shell, as nvim does', () => {
    expect(agentArguments('/bin/zsh', '/work-card fc2bf7b0'))
      .toEqual(['-lic', 'exec claude /work-card fc2bf7b0']);
  });

  // The prompt reaches the shell as a word. A card id is plain, but the quoting is what stops a
  // prompt from ever being read as syntax.
  it('quotes a prompt with a space or a quote in it', () => {
    expect(agentArguments('/bin/zsh', "/work-card it's here"))
      .toEqual(['-lic', "exec claude '/work-card it'\\''s here'"]);
  });

  it('uses PowerShell quoting when PowerShell will receive it', () => {
    expect(agentArguments('powershell.exe', "/work-card it's here"))
      .toEqual(['-Command', "claude '/work-card it''s here'"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/shell.test.ts`
Expected: FAIL — `agentArguments is not a function`.

- [ ] **Step 3: Write the implementation**

Append to `src/shell.ts`:

```typescript
// The agent pane runs `claude` through the same shell the editor pane runs nvim through, and for the
// same reason spelled out above editorArguments: an app launched from the Dock inherits almost no
// PATH, and claude is installed wherever the user's shell manager put it. `exec` leaves claude as the
// pane's only process rather than parking a shell above it for as long as the work takes.
//
// PowerShell gets no `exec` — it has none — so the shell stays as claude's parent there.
export function agentArguments(shellCommand: string, prompt: string): string[] {
  const quoted = quoteForShell(prompt, shellCommand);
  return isPowerShell(shellCommand)
    ? ['-Command', `claude ${quoted}`]
    : ['-lic', `exec claude ${quoted}`];
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/shell.test.ts && npx tsc --noEmit && npx eslint .`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shell.ts src/shell.test.ts
git commit -m "shell: start an agent in a pane with the PATH the terminals have"
```

---

### Task 5: main.ts — the ship itself

The git sequence, the pane hand-over, and the channel the renderer calls. Handlers stay inline and untested under the exemption already written down for the quit guard: what could break here is git's and Electron's plumbing, and a test of those is a test of mocks. Every decision they call into is in `ship.ts` and `board.ts`, which are tested.

**Every git call is awaited.** Main is the single process every pane's bytes flow through — a synchronous `git fetch` on a slow network stops all five shells painting until it returns, which reads as the app having hung.

**Files:**
- Modify: `src/main.ts`
- Modify: `src/preload.ts`
- Modify: `src/bridge.ts`

**Interfaces:**
- Consumes: `branchNameFor`, `worktreePathFor`, `freePane`, `blockingChanges`, `BOARD_FILE_PATH` (Task 2); `readWorktrees`, `writeWorktrees`, `withEntry`, `entryForCard`, `livingEntries`, `type WorktreeEntry` (Task 3); `agentArguments` (Task 4); `shipColumnIndex`, `withShipColumn`, `moveCardToColumn`, `selectionOf` (Task 1 and existing `board.ts`)
- Produces on the bridge:
  - `type ShipRequest = { projectPath: string; cardId: string; title: string; slot: number }`
  - `type ShipResult = { ok: true; entry: WorktreeEntry } | { ok: false; message: string }`
  - `shipCard(request: ShipRequest): Promise<ShipResult>`
  - `listWorktrees(): Promise<WorktreeEntry[]>`

- [ ] **Step 1: Add the imports and the module state**

At the top of `src/main.ts`, add to the imports:

```typescript
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { BOARD_FILE_PATH, blockingChanges, branchNameFor, freePane, worktreePathFor } from './ship';
import {
  entryForCard,
  livingEntries,
  readWorktrees,
  withEntry,
  writeWorktrees,
  type WorktreeEntry,
} from './worktree-store';
import { moveCardToColumn, selectionOf, shipColumnIndex, withShipColumn } from './board';
import { agentArguments, editorArguments, pickShell } from './shell';
```

(`editorArguments` and `pickShell` are already imported from `./shell` — extend that line rather than adding a second import of the same module.)

Below the `sessionFile` line, add:

```typescript
const worktreesFile = path.join(app.getPath('userData'), 'worktrees.json');
// Dropped on read, so a worktree removed by hand outside the app does not leave its card marked as in
// flight forever with nothing able to clear it.
let worktrees = livingEntries(readWorktrees(worktreesFile), existsSync);
// Which panes you have typed into. The only signal there is about a pane being free: main sees every
// keystroke sent to a pty and nothing at all about what is running in one.
const typedPanes = new Set<string>();
const runCommand = promisify(execFile);
```

- [ ] **Step 2: Record every keystroke sent to a pane**

Replace the existing `pty:input` handler (currently `src/main.ts:171`):

```typescript
ipcMain.on('pty:input', (_event, id: string, data: string) => {
  typedPanes.add(id);
  shells.get(id)?.write(data);
});
```

- [ ] **Step 3: Add the git helper and the base-branch guess**

Add above `createWindow`:

```typescript
// execFile, never a shell, so a card titled with a quote in it cannot become a command. Awaited
// rather than sync: main is the process every pane's bytes flow through, and a fetch on a slow
// network would otherwise stop all five shells painting until it returned.
async function git(args: string[], cwd: string): Promise<string> {
  const { stdout } = await runCommand('git', args, { cwd, maxBuffer: 64 * 1024 * 1024 });
  return stdout.trim();
}

// origin/HEAD, then main, then master. The same three-step guess create-task.js makes, and for the
// same reason: origin/HEAD is not set in every clone.
async function baseBranch(projectPath: string): Promise<string> {
  try {
    const head = await git(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], projectPath);
    return head.replace(/^origin\//, '');
  } catch {
    // Not set in this clone; try the usual names.
  }
  for (const candidate of ['main', 'master']) {
    try {
      await git(['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${candidate}`], projectPath);
      return candidate;
    } catch {
      // Try the next one.
    }
  }
  throw new Error('cannot tell which branch on origin is the main one');
}
```

- [ ] **Step 4: Add the pane hand-over**

Add below `spawnProject`:

```typescript
// Point a pane at a worktree and start the agent in it. The pane keeps its id — it is still terminal
// 3 of that project — and only what it runs and where changes, which is exactly what terminalCommands
// exists to say. The old shell is killed first: retargeting a pane that is still running one would
// leave two processes writing to the same id.
function startAgent(id: string, worktreePath: string, cardId: string): void {
  terminalCommands.set(id, {
    args: agentArguments(shellCommand, `/work-card ${cardId}`),
    directory: worktreePath,
  });
  shells.get(id)?.kill();
  shells.delete(id);
  spawnTerminal(id);
}
```

- [ ] **Step 5: Add the three handlers**

Add below the `board:write` handler:

`ShipRequest` and `ShipResult` are declared in `src/bridge.ts` in Step 6 below. Import them here rather than declaring a second copy — two spellings of one shape is how the renderer and main come to disagree about what a refusal looks like:

```typescript
import type { ShipRequest, ShipResult } from './bridge';
```

```typescript
function recordWorktree(entry: WorktreeEntry): WorktreeEntry {
  worktrees = withEntry(worktrees, entry);
  writeWorktrees(worktreesFile, worktrees);
  return entry;
}

// Give the worktree a pane, if there is one going. Split out because it is also the whole of a second
// ship of a card whose worktree exists but never got one.
function attachPane(entry: WorktreeEntry, slot: number): ShipResult {
  const typedIn = Array.from({ length: TERMINAL_COUNT }, (_value, index) => index)
    .filter((index) => typedPanes.has(terminalId(slot, index)));
  const pane = freePane(typedIn, TERMINAL_COUNT);
  if (pane === null) {
    return {
      ok: false,
      message: `every pane in ${path.basename(entry.projectPath)} is in use — free one and ship again`,
    };
  }
  startAgent(terminalId(slot, pane), entry.worktreePath, entry.cardId);
  return { ok: true, entry: recordWorktree({ ...entry, pane }) };
}

// The whole ship, in the order the design doc sets out. Each step's failure stops the flow and comes
// back as a message the board's status bar prints; everything before it is left as it was.
ipcMain.handle('worktree:create', async (_event, request: ShipRequest): Promise<ShipResult> => {
  const { projectPath, cardId, title, slot } = request;
  worktrees = livingEntries(worktrees, existsSync);

  // Already shipped. A record with a pane on it means an agent is working, and a second worktree for
  // the same card is the mistake the record exists to catch. One with no pane is a ship that ran out
  // of panes, and finishing it is the one re-ship that is allowed.
  const existing = entryForCard(worktrees, cardId);
  if (existing) {
    if (existing.pane !== null) {
      return { ok: false, message: `"${title}" is already shipped on ${existing.branch}` };
    }
    return attachPane(existing, slot);
  }

  try {
    const dirty = blockingChanges(await git(['status', '--porcelain'], projectPath));
    if (dirty.length > 0) {
      const count = `${dirty.length} file${dirty.length === 1 ? '' : 's'}`;
      return { ok: false, message: `${count} uncommitted — commit or stash them first` };
    }

    // Undo the Ship move on main, and any Ship column the app inserted when it read the board. The
    // card id is already in hand, so throwing the file away costs nothing.
    try {
      await git(['checkout', '--', BOARD_FILE_PATH], projectPath);
    } catch {
      // A project whose board.json is not committed yet has nothing to restore.
    }

    const base = await baseBranch(projectPath);
    await git(['fetch', 'origin', base], projectPath);
    // The checkout itself is only fast-forwarded when it is sitting on the base branch and can be.
    // A checkout on some other branch is left alone — the worktree comes off origin/<base> either
    // way, so it does not need the local branch to have caught up.
    try {
      const head = await git(['rev-parse', '--abbrev-ref', 'HEAD'], projectPath);
      if (head === base) await git(['merge', '--ff-only', `origin/${base}`], projectPath);
    } catch {
      // Diverged, or mid-rebase. The worktree is what matters and it comes off the remote.
    }

    const heads = await git(['for-each-ref', '--format=%(refname:short)', 'refs/heads'], projectPath);
    const branch = branchNameFor(title, cardId, heads.split('\n').filter((name) => name !== ''));
    const worktreePath = worktreePathFor(projectPath, branch);
    await git(['worktree', 'add', '-b', branch, worktreePath, `origin/${base}`], projectPath);

    // The card's Ship move, on the branch. The only board write that belongs to one; the agent makes
    // every move after it.
    const board = withShipColumn(readBoard(worktreePath).board);
    const from = selectionOf(board, cardId);
    if (from) {
      const moved = moveCardToColumn(board, from, shipColumnIndex(board));
      writeBoard(worktreePath, moved.board);
      await git(['add', BOARD_FILE_PATH], worktreePath);
      await git(['commit', '-m', `board: ship "${title}"`], worktreePath);
    }

    // Recorded before the pane, so a worktree that exists on disk is always one Ctrl+W can show you
    // and remove. An orphan worktree nothing knows about is the thing that piles up unseen.
    const entry = recordWorktree({
      cardId, title, projectPath, branch, worktreePath, pane: null, startedAt: new Date().toISOString(),
    });
    return attachPane(entry, slot);
  } catch (error: unknown) {
    return { ok: false, message: `ship failed: ${error instanceof Error ? error.message : String(error)}` };
  }
});

ipcMain.handle('worktree:list', () => {
  worktrees = livingEntries(worktrees, existsSync);
  writeWorktrees(worktreesFile, worktrees);
  return worktrees;
});
```

- [ ] **Step 6: Widen the bridge and the preload**

In `src/bridge.ts`, add the imports and the three members:

```typescript
import type { WorktreeEntry } from './worktree-store';

export type ShipRequest = { projectPath: string; cardId: string; title: string; slot: number };
export type ShipResult = { ok: true; entry: WorktreeEntry } | { ok: false; message: string };
```

and inside `DashboardBridge`:

```typescript
  // Moving a card into Ship: the worktree, the branch, the pane and the agent. Answers with the
  // record it wrote, or with the message saying which step refused and why.
  shipCard(request: ShipRequest): Promise<ShipResult>;
  // Every worktree the app has made, with the dead ones already dropped.
  listWorktrees(): Promise<WorktreeEntry[]>;
```

In `src/preload.ts`, add to the bridge object:

```typescript
  shipCard: (request) => ipcRenderer.invoke('worktree:create', request),
  listWorktrees: () => ipcRenderer.invoke('worktree:list'),
```

- [ ] **Step 7: Verify it compiles and nothing regressed**

Run: `npm test && npx tsc --noEmit && npx eslint .`
Expected: PASS. Nothing tests these handlers — the exemption in `CLAUDE.md` covers them — so this step is about the types lining up and the existing suite still being green.

- [ ] **Step 8: Commit**

```bash
git add src/main.ts src/preload.ts src/bridge.ts
git commit -m "ship: make the worktree, take a pane, start the agent in it"
```

---

### Task 6: board-view.ts — the Ship landing and the badge

The half you can see. A card that lands in Ship starts the flow; a card that has been shipped says so under its title, so it cannot sit in Todo looking untouched and get shipped twice.

**Files:**
- Modify: `src/board-view.ts`
- Modify: `src/renderer.ts:486-493` (pass `slot` into `createBoardView` — one changed line, no new ones)
- Test: none new; `board-view.ts` is DOM wiring and the decisions it calls are tested in Tasks 1–3.

**Interfaces:**
- Consumes: `shipCard`, `listWorktrees` (Task 5); `shipColumnIndex` (Task 1); `type WorktreeEntry` (Task 3)
- Produces: `BoardOptions` gains `slot: number`

- [ ] **Step 1: Widen the options and hold the records**

In `src/board-view.ts`, add `slot` to `BoardOptions`:

```typescript
export type BoardOptions = {
  projectPath: string;
  // Which page this board belongs to, because shipping a card takes one of that page's five panes.
  slot: number;
  bridge: DashboardBridge;
  onChanged(): void;
  onError(message: string): void;
};
```

Beside the other module-level state inside `createBoardView` (below `landedRead`):

```typescript
  // What this project has in flight, refreshed whenever the board is read. The badge on a card comes
  // from here rather than from the board, because a card's column on main says what has been merged
  // and says nothing about work that is under way on a branch.
  let shipped: WorktreeEntry[] = [];
```

- [ ] **Step 2: Draw the badge**

In `renderCard`, directly after the `board-parent` badge block and before the title is appended:

```typescript
    // What this card has in flight on this machine. Not on the board and not in git: the card's
    // column on main is about what has merged, so without this a card an agent is working on sits in
    // Todo looking untouched — and gets shipped a second time.
    const inFlight = shipped.find((entry) => entry.cardId === card.id);
    if (inFlight) {
      const badge = document.createElement('p');
      badge.className = 'board-shipped';
      const pane = inFlight.pane === null ? 'no pane' : paneLabel(inFlight.pane);
      badge.textContent = `shipped · ${inFlight.branch} · ${pane}`;
      item.append(badge);
    }
```

Add `import { paneLabel } from './terminals';` at the top.

- [ ] **Step 3: Refresh the records when the board is read**

In `open()`, after `landedRead = token;` and before `render()`:

```typescript
      // Cheap and local — a JSON file in the app's own folder — so it is re-read with the board
      // rather than kept in step by hand.
      shipped = (await options.bridge.listWorktrees())
        .filter((entry) => entry.projectPath === options.projectPath);
```

Wrap the call in its own `try`/`catch` that leaves `shipped` as it was, so a failure to read the record never costs you the board.

- [ ] **Step 4: Start the ship when a card lands in Ship**

Add a function inside `createBoardView`, below `confirmDelete`:

```typescript
  // A card that has landed in Ship. The board is written first, so the card is where you put it even
  // if the ship then refuses — the app never silently undoes a move you made. Main puts board.json
  // back to HEAD as its own first step, which is what makes that safe.
  function ship(card: Card): void {
    options.onError(`shipping "${card.title}"…`);
    options.bridge.shipCard({
      projectPath: options.projectPath,
      cardId: card.id,
      title: card.title,
      slot: options.slot,
    }).then(
      (result) => {
        if (!result.ok) return options.onError(result.message);
        shipped = [...shipped.filter((entry) => entry.cardId !== card.id), result.entry];
        options.onError('');
        render();
      },
      (error: unknown) => options.onError(`ship failed: ${String(error)}`),
    );
  }
```

In `runAction`, replace the `board-move` case:

```typescript
        case 'board-move': {
          const moving = cardAt(state.board, state.selection);
          change(moveCard(state.board, state.selection, action.direction));
          // Asked after the move, of the board the move produced: landing in Ship is the gesture, and
          // a card already in Ship that is merely reordered has not landed in it again.
          const landed = state.selection.column === shipColumnIndex(state.board);
          if (moving && landed && action.direction === 'right') ship(moving);
          return;
        }
```

Add `shipColumnIndex` to the existing import from `./board`, and `type WorktreeEntry` from `./worktree-store`.

- [ ] **Step 5: Pass the slot in from the renderer**

In `src/renderer.ts`, the `createBoardView({` call at line 486 gains one line inside the object it already passes:

```typescript
      slot,
```

- [ ] **Step 6: Style the badge**

In `index.css`, beside the existing `.board-flight` rule, add:

```css
.board-shipped {
  color: var(--shipped);
  font-size: 11px;
  margin: 2px 0 0;
}
```

Add `--shipped` to the theme's variable block with the same value the flight line uses, or reuse `.board-flight`'s colour directly if the theme has no spare name. Check `src/theme.ts` for how colours reach the CSS before inventing a variable.

- [ ] **Step 7: Verify**

Run: `npm test && npx tsc --noEmit && npx eslint .`
Expected: PASS. `board-view.ts` has no test of its own; the suite must still be green.

- [ ] **Step 8: Commit**

```bash
git add src/board-view.ts src/renderer.ts index.css src/theme.ts
git commit -m "board: a card landing in Ship starts it, and says so afterwards"
```

---

### Task 7: the pane says which checkout it is on

Five panes all reading `terminal 3` with two of them in worktrees is how a command lands in the wrong checkout. This takes the narrow slice the ship needs and leaves the rest to the "Panes name themselves" card.

**Files:**
- Modify: `src/terminals.ts` (`paneLabel` takes an optional branch)
- Modify: `src/renderer.ts:139` (one changed line)
- Test: `src/terminals.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `paneLabel(index: number, branch?: string): string`

- [ ] **Step 1: Write the failing test**

Add to `src/terminals.test.ts`:

```typescript
describe('paneLabel', () => {
  it('names a pane by its number', () => {
    expect(paneLabel(0)).toBe('terminal 1');
    expect(paneLabel(2)).toBe('terminal 3');
  });

  // The numbering stays, because the focus keys are numbered. The branch is added to it, not swapped
  // for it.
  it('adds the branch when the pane is on a worktree', () => {
    expect(paneLabel(2, 'panes-name-themselves')).toBe('terminal 3 · panes-name-themselves');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/terminals.test.ts`
Expected: FAIL — the second case returns `terminal 3`.

- [ ] **Step 3: Write the implementation**

In `src/terminals.ts`, replace `paneLabel`:

```typescript
// The one spelling of a pane's name. The status bar and the bell's notification both say it, and a
// second literal in either place is a name that goes stale the day the panes are renamed.
//
// A pane running an agent in a worktree says which branch it is on. The number stays in front of it —
// lose the numbering and the focus keys stop making sense — so the branch is added, never swapped in.
export function paneLabel(index: number, branch?: string): string {
  const name = `terminal ${index + 1}`;
  return branch === undefined ? name : `${name} · ${branch}`;
}
```

- [ ] **Step 4: Say it in the status bar**

In `src/renderer.ts`, line 139 currently reads:

```typescript
  return page.panes.length > 0 ? paneLabel(page.focused) : '';
```

Change it to pass the branch, reading it from the page's shipped records. The page needs one field to read from — add `worktrees: WorktreeEntry[]` to the page type beside `board`, fill it in the same place `board` is filled, and refresh it whenever the board is read. If that would add lines to `renderer.ts`, put the lookup in `ship.ts` instead as:

```typescript
// The branch a pane is on, or undefined when it is on the project itself.
export function branchOfPane(
  entries: readonly { pane: number | null; branch: string }[],
  pane: number,
): string | undefined {
  return entries.find((entry) => entry.pane === pane)?.branch;
}
```

with its own test, so `renderer.ts` gains a call and not a loop.

- [ ] **Step 5: Verify**

Run: `npm test && npx tsc --noEmit && npx eslint . && wc -l src/renderer.ts`
Expected: PASS, and `renderer.ts` no longer than it was.

- [ ] **Step 6: Commit**

```bash
git add src/terminals.ts src/terminals.test.ts src/renderer.ts src/ship.ts src/ship.test.ts
git commit -m "terminals: a pane on a worktree says which branch"
```

---

### Task 8: Ctrl+W — the worktree list

Nothing is removed automatically. This is the screen you remove from.

An overlay rather than a section on the manager page, for the reason in `CLAUDE.md`: on the manager a bare `d` is a letter that can no longer reach a waiting pane's shell. Inside an overlay no pane can receive a keystroke, so bare keys are free there.

**Files:**
- Create: `src/worktree-view.ts`
- Modify: `src/main.ts` (add the `worktree:remove` handler), `src/preload.ts`, `src/bridge.ts`
- Modify: `src/actions.ts` (one row), `src/renderer.ts` (one case in the action switch)
- Modify: `index.css`
- Test: `src/actions.test.ts` (the new row is bound and unique)

**Interfaces:**
- Consumes: `listWorktrees` (Task 5); `openOverlay`, `confirmOverlay` (existing `overlay.ts`); `isModified` (existing `shortcuts.ts`); `clampIndex` (existing); `age` (existing `age.ts`)
- Produces:
  - `removeWorktree(worktreePath: string, force: boolean): Promise<{ ok: boolean; message: string; dirty: string[] }>` on the bridge
  - `openWorktrees(bridge: DashboardBridge): Promise<string | undefined>` — resolves with the worktree path to jump to, or undefined

- [ ] **Step 1: Add the removal handler in main**

In `src/main.ts`, below `worktree:list`:

```typescript
// Refused once for a dirty worktree, and only once: the changes in it exist nowhere else, so the
// question is worth asking, and refusing forever would mean the only way out is the command line.
ipcMain.handle('worktree:remove', async (_event, worktreePath: string, force: boolean) => {
  const entry = worktrees.find((candidate) => candidate.worktreePath === worktreePath);
  if (!entry) return { ok: false, message: 'no such worktree', dirty: [] };
  try {
    const dirty = blockingChanges(await git(['status', '--porcelain'], worktreePath));
    if (dirty.length > 0 && !force) return { ok: false, message: '', dirty };
    await git(['worktree', 'remove', ...(force ? ['--force'] : []), worktreePath], entry.projectPath);
    worktrees = withoutWorktree(worktrees, worktreePath);
    writeWorktrees(worktreesFile, worktrees);
    return { ok: true, message: `removed ${entry.branch}`, dirty: [] };
  } catch (error: unknown) {
    return {
      ok: false,
      message: `not removed: ${error instanceof Error ? error.message : String(error)}`,
      dirty: [],
    };
  }
});
```

Add `withoutWorktree` to the existing `./worktree-store` import. The branch is deliberately left behind — the pull request may still be open on it.

Add to `src/bridge.ts` inside `DashboardBridge`:

```typescript
  // Removing a worktree. A dirty one comes back refused, with the files listed, so the dialog can ask
  // a second time naming them rather than deciding on its own what "dirty enough" means.
  removeWorktree(worktreePath: string, force: boolean): Promise<{ ok: boolean; message: string; dirty: string[] }>;
```

and to `src/preload.ts`:

```typescript
  removeWorktree: (worktreePath, force) => ipcRenderer.invoke('worktree:remove', worktreePath, force),
```

- [ ] **Step 2: Write the overlay**

Create `src/worktree-view.ts`, built the way `picker.ts` is:

```typescript
import { clampIndex } from './clamp-index';
import type { DashboardBridge } from './bridge';
import { confirmOverlay, openOverlay } from './overlay';
import { isModified } from './shortcuts';
import { paneLabel } from './terminals';
import type { WorktreeEntry } from './worktree-store';

// Every worktree the app has made, and the one screen they are removed from. Nothing here removes
// anything on its own: a worktree whose branch has merged is still a folder you may have something
// in, and a squash-merged branch does not read as merged anyway.
//
// An overlay rather than a row on the manager page, because on the manager a bare `d` is a letter
// that can no longer reach a waiting pane's shell. A dialog owns the keyboard, so bare keys are free
// here.
export function openWorktrees(bridge: DashboardBridge): Promise<string | undefined> {
  let entries: WorktreeEntry[] = [];
  let highlighted = 0;

  return new Promise<string | undefined>((resolve) => {
    function finish(choice: string | undefined): void {
      remove();
      resolve(choice);
    }

    const { dialog, remove } = openOverlay('worktrees', () => finish(undefined));
    const heading = document.createElement('h2');
    heading.className = 'worktrees-heading';
    const list = document.createElement('ul');
    list.className = 'worktrees-list';
    const keys = document.createElement('p');
    keys.className = 'worktrees-keys';
    keys.textContent = 'Enter goes to its pane.  d removes it.  Escape closes.';
    dialog.append(heading, list, keys);
    dialog.focus();

    function render(): void {
      heading.textContent = `Worktrees (${entries.length})`;
      highlighted = clampIndex(highlighted, entries.length - 1);
      list.replaceChildren(...entries.map((entry, index) => {
        const item = document.createElement('li');
        if (index === highlighted) item.classList.add('highlighted');
        const branch = document.createElement('span');
        branch.className = 'worktrees-branch';
        branch.textContent = entry.branch;
        const detail = document.createElement('span');
        detail.className = 'worktrees-detail';
        const pane = entry.pane === null ? 'no pane' : paneLabel(entry.pane);
        detail.textContent = `${entry.title} · ${pane}`;
        item.append(branch, detail);
        // A click moves the selection to the row and then does what Enter does there, so the pointer
        // and the keyboard never name two different rows.
        item.addEventListener('click', () => {
          highlighted = index;
          render();
          finish(entry.worktreePath);
        });
        return item;
      }));
      if (entries.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'worktrees-empty';
        empty.textContent = 'Nothing in flight. Move a card into Ship to start one.';
        list.replaceChildren(empty);
      }
      list.children[highlighted]?.scrollIntoView({ block: 'nearest' });
    }

    async function refresh(): Promise<void> {
      entries = await bridge.listWorktrees();
      render();
    }

    // Asked twice for a dirty worktree, and the second question names the files: the changes in it
    // exist nowhere else. main decides what counts as dirty and hands the list back, so the question
    // on screen cannot name one thing while the removal refuses on another.
    async function removeHighlighted(): Promise<void> {
      const entry = entries[highlighted];
      if (!entry) return;
      const first = await confirmOverlay(`Remove the worktree for "${entry.title}"?`,
        'Enter removes it. Escape keeps it. The branch stays either way.');
      dialog.focus();
      if (!first) return;
      const attempt = await bridge.removeWorktree(entry.worktreePath, false);
      if (!attempt.ok && attempt.dirty.length > 0) {
        const files = attempt.dirty.slice(0, 3).join(', ');
        const more = attempt.dirty.length > 3 ? ` and ${attempt.dirty.length - 3} more` : '';
        const forced = await confirmOverlay(`${entry.branch} has uncommitted changes: ${files}${more}.`,
          'Enter removes it and loses them. Escape keeps it.');
        dialog.focus();
        if (forced) await bridge.removeWorktree(entry.worktreePath, true);
      }
      await refresh();
    }

    dialog.addEventListener('keydown', (event) => {
      // A modified key belongs to whatever the window bound it to, not to this list.
      if (isModified(event)) return;
      switch (event.key) {
        case 'Escape': return finish(undefined);
        case 'Enter': return finish(entries[highlighted]?.worktreePath);
        case 'ArrowDown':
          event.preventDefault();
          highlighted += 1;
          return render();
        case 'ArrowUp':
          event.preventDefault();
          highlighted -= 1;
          return render();
        case 'd':
          event.preventDefault();
          void removeHighlighted();
          return;
      }
    });

    render();
    void refresh();
  });
}
```

- [ ] **Step 3: Add the key**

In `src/actions.ts`, add to the `Action` union:

```typescript
  | { kind: 'worktrees' }
```

and a row in `ACTIONS`, in the `app` group beside `help` and `settings`:

```typescript
  {
    name: 'worktrees', description: 'List the worktrees cards were shipped into',
    group: 'app', scope: 'global',
    action: { kind: 'worktrees' }, mac: 'Ctrl+W', other: 'Ctrl+W',
  },
```

In `src/renderer.ts`, add one case beside the existing `help` case in the action switch:

```typescript
      case 'worktrees': return void openWorktrees(bridge);
```

Import `openWorktrees` on the existing import block. (Jumping to the pane the overlay resolves with is not wired in this task — the resolve value is there for it, and `Enter` closing the dialog is already useful. If wiring it costs `renderer.ts` new lines, leave it and add a `ponytail:` comment on the resolve saying so.)

- [ ] **Step 4: Style it**

In `index.css`, beside the `.picker` rules, add `.worktrees-dialog`, `.worktrees-list`, `.worktrees-branch`, `.worktrees-detail`, `.worktrees-keys`, `.worktrees-empty` and a `.highlighted` rule, copying the shape the picker already uses so the two dialogs look like one app.

- [ ] **Step 5: Verify**

Run: `npm test && npx tsc --noEmit && npx eslint .`
Expected: PASS. `actions.test.ts` checks every row has a unique name and that defaults do not collide — if `Ctrl+W` clashes with an existing binding, the test says so; pick another key and change the row.

- [ ] **Step 6: Commit**

```bash
git add src/worktree-view.ts src/actions.ts src/renderer.ts src/main.ts src/preload.ts src/bridge.ts index.css
git commit -m "worktrees: a list you can remove from, on Ctrl+W"
```

---

### Task 9: the help dialog, and the agent's instructions

A change is not done until `Ctrl+H` tells the truth about it. The keys print themselves from the action table; the blurbs do not.

**Files:**
- Modify: `src/help.ts` (the `board` and `app` blurbs)
- Modify: `src/help.test.ts` if it pins blurb text
- Create: `~/.claude/commands/work-card.md` (outside this repository — in the dotfiles checkout at `/Users/sharp/workspace/dotfiles/claude/commands/work-card.md`)

**Interfaces:**
- Consumes: everything above.
- Produces: nothing code depends on.

- [ ] **Step 1: Update the board blurb**

In `src/help.ts`, add to the end of the `board` blurb, before the sentence about the manager's board:

```
'The board has a Ship column second from the left. Moving a card into it hands '
+ 'that card to an agent: the app makes a git worktree beside the project, branches it off a '
+ 'freshly fetched main, moves the card into Ship on that branch, and starts an agent in a pane '
+ 'you have not been typing in. The card on your own board goes back to where it was, carrying a '
+ 'line saying which branch and which pane it is on — a card\'s column here says what has been '
+ 'merged, and the work in flight lives on its own branch until the pull request lands. A '
+ 'checkout with uncommitted files in it refuses the ship and says so. '
```

- [ ] **Step 2: Update the app blurb**

Add to the end of the `app` blurb:

```
'The worktree list shows every card that has been shipped, which branch it went to and which '
+ 'pane is on it. Nothing is ever removed on its own; that list is where you remove one, and it '
+ 'asks twice if the worktree has uncommitted changes in it. '
```

- [ ] **Step 3: Run the help tests**

Run: `npx vitest run src/help.test.ts`
Expected: PASS. `help.test.ts` checks that every mode has a blurb and every action a row — if it pins exact blurb text, update the expectation.

- [ ] **Step 4: Write the agent's skill**

Create `/Users/sharp/workspace/dotfiles/claude/commands/work-card.md`:

```markdown
---
description: Work the board card with this id: branch, build it, test it, open the PR
argument-hint: <card id>
---

Work the card whose id is $ARGUMENTS, in this worktree, start to finish.

You are already on the right branch and in the right folder. The app made this
worktree for this card and started you in it.

## Read the card first

The card is in `.dashboard/board.json` in this worktree. Find the object whose
`id` starts with the id you were given. Read its `title`, its `notes`, its
`priority`, and every card whose `parent` is this card's id — those are its
subtasks and they are part of the job.

Read `CLAUDE.md` at the top of the repository before you write anything. It is
not optional and it is not a summary of the code; it is the rules this project
is held to.

## Move the card as you go

Edit `.dashboard/board.json` **in this worktree only**. Never touch the board in
any other checkout, and never push to the main branch.

1. Before your first edit to any other file, move the card to `Doing` and commit
   that on its own: `board: start "<title>"`.
2. When the pull request is open, move the card to `Done`, put the branch name in
   its `branch` field and the pull request number in its `pullRequest` field, and
   commit and push that: `board: "<title>" is ready`.

A card's column on this branch is a claim about this branch. It arrives on the
main branch when this work does.

## Then do the work

- Build what the card asks for. Follow the project's own rules.
- Run every check the project has. In this repository that is `npm test`,
  `npx tsc --noEmit` and `npx eslint .`. All three must pass.
- Run `/simplify` and fold what it changed into your summary.
- Commit in small pieces with messages that say what changed and why.
- Push the branch and open the pull request with `gh pr create`.

## What not to do

- Do not quit, kill, restart or rebuild any running app.
- Do not touch the main branch, or any file outside this worktree.
- Do not remove this worktree when you are finished. That is done by hand from
  the app's worktree list.
- If the card turns out to be wrong or impossible, stop, say so in a comment on
  the pull request, and leave the card in `Doing`.
```

- [ ] **Step 5: Verify the whole thing**

Run: `npm test && npx tsc --noEmit && npx eslint .`
Expected: PASS.

Then say — do not do — that the installed app needs a rebuild and a restart to pick these changes up.

- [ ] **Step 6: Commit**

```bash
git add src/help.ts src/help.test.ts
git commit -m "help: the Ship column, and the worktree list"
```

The skill file lives in the dotfiles checkout and is committed there separately.

---

## Self-review

**Spec coverage.** Ship column → Task 1. Branch names, worktree paths, free pane, blocking dirt → Task 2. `worktrees.json` → Task 3. Agent launch through a login shell → Task 4. The eight-step git flow, the typed-pane tracking, the IPC → Task 5. The Ship landing and the badge → Task 6. The pane saying its branch → Task 7. Ctrl+W and removal → Task 8. Help blurbs and `/work-card` → Task 9.

**One thing the spec asks for that no task fully covers:** the design says a failed ship "reaches the status bar naming the step". Task 5 returns one message per refusal and Task 6 prints it, but the message for a failure inside the `try` is the raw git error behind `ship failed:`. That matches the spec's error table for `git worktree add` and is looser than it for the fetch. Left as is — a git error names its own step better than a wrapper would.

**Two things deliberately left to the implementer's judgement**, both flagged in the task text rather than hidden: the exact colour variable for `.board-shipped` in Task 6 Step 6, and whether wiring "Enter jumps to the pane" into `renderer.ts` in Task 8 Step 3 would push that file longer.

**Type consistency.** `WorktreeEntry` is defined once in Task 3 and imported everywhere after. `ShipRequest` and `ShipResult` were declared twice on the first draft — in `bridge.ts` and again in `main.ts` — and that is fixed above: `bridge.ts` owns them and `main.ts` imports them. `paneLabel` has one signature, added in Task 7 and used by Tasks 6 and 8. `blockingChanges` is called from three places in `main.ts` and defined once in `ship.ts`.

**Key collision.** `Ctrl+W` is not taken by any existing row in `ACTIONS` — the bound set is Ctrl+S, Ctrl+O, Ctrl+H, Ctrl+comma, Ctrl+T, Ctrl+N, Ctrl+B, Ctrl+1..9, Ctrl+Shift+1..9, the Cmd tab and pane keys, Alt+HJKL, and the bare board and manager letters. `actions.test.ts` will say so either way.
