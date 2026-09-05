# Dashboard Modes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each project page three modes — the current five-shell grid, a full-window nvim, and a keyboard-driven kanban board — switched with Ctrl+T, Ctrl+N and Ctrl+B.

**Architecture:** A page stops being a grid and becomes a container holding three stacked views, one visible. The mode lives on the page, so each project remembers its own. Nvim is a sixth pty per project reusing the existing pane machinery. The board is built in the renderer over pure data functions, stored as `board.json` in a `.dashboard/` folder inside the project.

**Tech Stack:** Electron 44, TypeScript 6, vitest 5, xterm 6, node-pty 1.1. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-05-dashboard-modes-design.md`

## Global Constraints

- **Never restart the running app.** Do not run `npm run package`, `open -a Dashboard`, `pkill`, or `osascript ... quit`. Building into `out/` or `.vite/` is fine. When the work is done, say the installed app needs a rebuild and restart to pick it up, and stop. (`CLAUDE.md`)
- **Keyboard first.** Every action must be reachable from the keyboard alone. A control that only responds to a click is unfinished. (`CLAUDE.md`)
- **No abbreviations in identifiers.** `configuration`, not `config`; `directory`, not `dir`. Established spellings like `id`, `url`, `json` are fine.
- **600 lines of code per file, hard ceiling.** Comments and blank lines do not count.
- **Checks:** `npm test`, `npx tsc --noEmit`, `npx eslint .` — all three must pass before every commit.
- **No self-reference in commits.** Do not mention Claude, Anthropic, or any AI tooling in commit messages, code comments, or documentation. No `Co-Authored-By` trailer.
- **Comment style:** this codebase explains *why*, not *what*, in full sentences above the code. Match it.
- **Test style:** vitest, `describe`/`it`, tests live beside the source as `src/<name>.test.ts`. There is no DOM test environment — pure logic is tested, DOM code is not (see `picker.ts` / `picker.test.ts` for the established split).

---

## File Structure

**Create:**

| File | Responsibility |
|---|---|
| `src/modes.ts` | The `Mode` type and the key-to-mode table. Nothing else. |
| `src/board.ts` | Pure card operations over a board plus a selection. No DOM, no fs. |
| `src/board.test.ts` | Tests for the above. |
| `src/board-store.ts` | Main-process reading, writing and seeding of `.dashboard/`. |
| `src/board-store.test.ts` | Tests for the above, against a temporary directory. |
| `src/board-view.ts` | The board's DOM and keyboard. Renderer only. |

**Modify:**

| File | Change |
|---|---|
| `src/shortcuts.ts` | Three mode keys; `mapShortcut` takes the current mode; pane keys go quiet outside terminals mode. |
| `src/shortcuts.test.ts` | Cases for all of the above. |
| `src/renderer.ts` | Three views per page, mode switching, the nvim pane, the status label. |
| `src/main.ts` | Register the nvim pty; board IPC handlers. |
| `src/bridge.ts` | `readBoard` / `writeBoard` on the bridge type. |
| `src/preload.ts` | Wire those two to IPC. |
| `src/index.css` | View stacking; the nvim pane; board layout. |

---

## Task 1: Mode type and mode keys

**Files:**
- Create: `src/modes.ts`
- Modify: `src/shortcuts.ts`
- Test: `src/shortcuts.test.ts`

**Interfaces:**
- Consumes: `TERMINAL_COUNT`, `Direction` from `src/terminals.ts` (already imported by `shortcuts.ts`).
- Produces:
  - `type Mode = 'terminals' | 'nvim' | 'board'` from `src/modes.ts`
  - `const MODE_KEYS: Record<string, Mode>` from `src/modes.ts`
  - `Action` gains `{ kind: 'mode-set'; mode: Mode }`
  - `mapShortcut(input: KeyInput, isMac: boolean, mode?: Mode): Action | null` — third parameter defaults to `'terminals'`

- [ ] **Step 1: Create the mode module**

Create `src/modes.ts`:

```ts
// A page shows one of these at a time. Terminals is what a project opens as.
export type Mode = 'terminals' | 'nvim' | 'board';

// Ctrl+T, Ctrl+N, Ctrl+B. Lowercase keys: an uppercase letter here is Caps Lock, which does not
// set shiftKey, so the lookup normalises rather than listing both spellings.
export const MODE_KEYS: Record<string, Mode> = { t: 'terminals', n: 'nvim', b: 'board' };
```

- [ ] **Step 2: Write the failing tests**

Add to `src/shortcuts.test.ts`, after the existing `describe` blocks:

```ts
describe('mode keys', () => {
  it('switches mode with Ctrl+T, Ctrl+N and Ctrl+B', () => {
    expect(mapShortcut(key({ key: 'n', ctrlKey: true }), true, 'terminals'))
      .toEqual({ kind: 'mode-set', mode: 'nvim' });
    expect(mapShortcut(key({ key: 'b', ctrlKey: true }), true, 'terminals'))
      .toEqual({ kind: 'mode-set', mode: 'board' });
    expect(mapShortcut(key({ key: 't', ctrlKey: true }), true, 'board'))
      .toEqual({ kind: 'mode-set', mode: 'terminals' });
  });

  // The whole point of the rule: Ctrl+N is nvim's autocomplete, so nvim keeps it.
  it('leaves the key for the current mode to whatever is running there', () => {
    expect(mapShortcut(key({ key: 'n', ctrlKey: true }), true, 'nvim')).toBeNull();
    expect(mapShortcut(key({ key: 't', ctrlKey: true }), true, 'terminals')).toBeNull();
    expect(mapShortcut(key({ key: 'b', ctrlKey: true }), true, 'board')).toBeNull();
  });

  it('reads a Caps Lock letter as the same key', () => {
    expect(mapShortcut(key({ key: 'B', ctrlKey: true }), true, 'terminals'))
      .toEqual({ kind: 'mode-set', mode: 'board' });
  });

  it('assumes terminals when no mode is given', () => {
    expect(mapShortcut(key({ key: 'b', ctrlKey: true }), true))
      .toEqual({ kind: 'mode-set', mode: 'board' });
  });

  it('ignores Ctrl+Shift+letter', () => {
    expect(mapShortcut(key({ key: 'b', ctrlKey: true, shiftKey: true }), true, 'terminals')).toBeNull();
  });
});

describe('keys that only mean something in terminals mode', () => {
  it('drops Cmd+digit outside terminals mode', () => {
    expect(mapShortcut(key({ code: 'Digit1', key: '1', metaKey: true }), true, 'board')).toBeNull();
    expect(mapShortcut(key({ code: 'Digit1', key: '1', metaKey: true }), true, 'nvim')).toBeNull();
  });

  it('drops the pane movement keys outside terminals mode', () => {
    expect(mapShortcut(key({ code: 'KeyJ', altKey: true }), true, 'board')).toBeNull();
    expect(mapShortcut(key({ key: 'ArrowRight', metaKey: true }), true, 'nvim')).toBeNull();
    expect(mapShortcut(key({ key: 'Backspace', metaKey: true }), true, 'board')).toBeNull();
  });

  // Project keys are how you get out of a mode, so they answer from all three.
  it('keeps the project keys working from every mode', () => {
    expect(mapShortcut(key({ key: ']', metaKey: true }), true, 'board')).toEqual({ kind: 'project-next' });
    expect(mapShortcut(key({ code: 'Digit2', key: '2', ctrlKey: true }), true, 'nvim'))
      .toEqual({ kind: 'project-jump', index: 1 });
    expect(mapShortcut(key({ key: 's', ctrlKey: true }), true, 'board')).toEqual({ kind: 'project-picker' });
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/shortcuts.test.ts`
Expected: FAIL — `mapShortcut` takes two arguments, and none of the mode cases are handled.

- [ ] **Step 4: Rewrite `src/shortcuts.ts`**

Replace the whole file:

```ts
import { MODE_KEYS, type Mode } from './modes';
import { TERMINAL_COUNT, type Direction } from './terminals';

export type Action =
  | { kind: 'project-next' }
  | { kind: 'project-previous' }
  | { kind: 'project-jump'; index: number }
  | { kind: 'project-move'; index: number }
  | { kind: 'project-picker' }
  | { kind: 'project-last' }
  | { kind: 'mode-set'; mode: Mode }
  | { kind: 'terminal-focus'; index: number }
  | { kind: 'terminal-next' }
  | { kind: 'terminal-previous' }
  | { kind: 'terminal-move'; direction: Direction }
  | { kind: 'terminal-input'; data: string };

export type KeyInput = {
  key: string;
  code: string;
  shiftKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
};

// Option+H/J/K/L moves between panes. `code` because Option changes `key` on macOS ("h" becomes "˙").
const VIM_DIRECTIONS: Record<string, Direction> = { KeyH: 'left', KeyJ: 'down', KeyK: 'up', KeyL: 'right' };

// 1..9 count from zero here. `code`, not `key`: Shift turns "1" into "!", and a layout can move the
// character but not the number row. Zero is not a project or a terminal, so it has no index.
function digitIndex(code: string): number | null {
  const digit = /^Digit([1-9])$/.exec(code);
  return digit ? Number(digit[1]) - 1 : null;
}

// Keys that address a pane. They only mean something while panes are on screen: in nvim and board mode
// there is no grid to focus into and nothing to move between.
function paneShortcut(input: KeyInput, isMac: boolean): Action | null {
  if (input.altKey && !input.metaKey && !input.ctrlKey && !input.shiftKey) {
    const direction = VIM_DIRECTIONS[input.code];
    return direction ? { kind: 'terminal-move', direction } : null;
  }

  const modifier = isMac ? input.metaKey : input.ctrlKey;
  if (!modifier || input.altKey || input.shiftKey) return null;

  const terminal = digitIndex(input.code);
  if (terminal !== null) return terminal < TERMINAL_COUNT ? { kind: 'terminal-focus', index: terminal } : null;

  // `key`, not `code`, so the arrows and brackets follow the character on Dvorak and Colemak.
  switch (input.key) {
    case 'ArrowRight': return { kind: 'terminal-next' };
    case 'ArrowLeft': return { kind: 'terminal-previous' };
    // Ghostty sends Ctrl+U for Cmd+Backspace, so the shell clears the line — zsh binds ^U to
    // kill-whole-line, so anything after the cursor goes too. xterm.js sends a plain backspace,
    // which eats one character. Elsewhere Ctrl+U already reaches the shell on its own, so there is
    // nothing to stand in for.
    case 'Backspace': return isMac ? { kind: 'terminal-input', data: '\x15' } : null;
    default: return null;
  }
}

export function mapShortcut(input: KeyInput, isMac: boolean, mode: Mode = 'terminals'): Action | null {
  // Everything about projects and modes is plain Ctrl on every platform, macOS included, so the set
  // stays one gesture. The shell never sees these: no XOFF, no emacs reverse search, no readline
  // operate-and-get-next. An uppercase letter is Caps Lock, which does not set shiftKey.
  if (input.ctrlKey && !input.metaKey && !input.altKey) {
    const project = digitIndex(input.code);
    if (project !== null) {
      return input.shiftKey ? { kind: 'project-move', index: project } : { kind: 'project-jump', index: project };
    }
    if (input.shiftKey) return null;
    if (input.key === 's' || input.key === 'S') return { kind: 'project-picker' };
    if (input.key === 'o' || input.key === 'O') return { kind: 'project-last' };
    const wanted = MODE_KEYS[input.key.toLowerCase()];
    // The key naming the mode you are already in belongs to whatever runs there. Ctrl+N completes a
    // word in nvim and Ctrl+T transposes characters in the shell; taking those would cost more than
    // the shortcut is worth. You leave a mode by naming a different one.
    if (wanted !== undefined) return wanted === mode ? null : { kind: 'mode-set', mode: wanted };
  }

  // Cycling projects answers from every mode, so a board is never a dead end.
  const modifier = isMac ? input.metaKey : input.ctrlKey;
  if (modifier && !input.altKey && !input.shiftKey) {
    if (input.key === ']') return { kind: 'project-next' };
    if (input.key === '[') return { kind: 'project-previous' };
  }

  return mode === 'terminals' ? paneShortcut(input, isMac) : null;
}
```

- [ ] **Step 5: Run the full test suite**

Run: `npm test && npx tsc --noEmit && npx eslint .`
Expected: all pass. The existing `shortcuts.test.ts` cases call `mapShortcut` with two arguments and must still pass on the `'terminals'` default.

- [ ] **Step 6: Commit**

```bash
git add src/modes.ts src/shortcuts.ts src/shortcuts.test.ts
git commit -m "Map Ctrl+T, Ctrl+N and Ctrl+B to the three modes"
```

---

## Task 2: Board data operations

**Files:**
- Create: `src/board.ts`
- Test: `src/board.test.ts`

**Interfaces:**
- Consumes: `Direction` from `src/terminals.ts`.
- Produces, all from `src/board.ts`:
  - `type Card = { id: string; title: string; notes: string }`
  - `type Column = { name: string; cards: Card[] }`
  - `type Board = { columns: Column[] }`
  - `type Selection = { column: number; card: number }`
  - `type Change = { board: Board; selection: Selection }`
  - `const DEFAULT_COLUMNS: string[]`
  - `emptyBoard(): Board`
  - `moveSelection(board: Board, selection: Selection, direction: Direction): Selection`
  - `addCard(board: Board, selection: Selection, id: string, title: string): Change`
  - `renameCard(board: Board, selection: Selection, title: string): Change`
  - `deleteCard(board: Board, selection: Selection): Change`
  - `moveCard(board: Board, selection: Selection, direction: Direction): Change`

- [ ] **Step 1: Write the failing tests**

Create `src/board.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { addCard, deleteCard, emptyBoard, moveCard, moveSelection, renameCard, type Board } from './board';

function board(...columns: string[][]): Board {
  return {
    columns: columns.map((titles, index) => ({
      name: `Column ${index}`,
      cards: titles.map((title) => ({ id: title, title, notes: '' })),
    })),
  };
}

function titles(result: Board): string[][] {
  return result.columns.map((column) => column.cards.map((card) => card.title));
}

describe('emptyBoard', () => {
  it('opens with three empty columns', () => {
    expect(emptyBoard().columns.map((column) => column.name)).toEqual(['Todo', 'Doing', 'Done']);
    expect(emptyBoard().columns.every((column) => column.cards.length === 0)).toBe(true);
  });
});

describe('moveSelection', () => {
  const three = board(['a', 'b'], ['c'], []);

  it('walks cards within a column and stops at the ends', () => {
    expect(moveSelection(three, { column: 0, card: 0 }, 'down')).toEqual({ column: 0, card: 1 });
    expect(moveSelection(three, { column: 0, card: 1 }, 'down')).toEqual({ column: 0, card: 1 });
    expect(moveSelection(three, { column: 0, card: 0 }, 'up')).toEqual({ column: 0, card: 0 });
  });

  it('walks columns and stops at the edges', () => {
    expect(moveSelection(three, { column: 0, card: 0 }, 'right')).toEqual({ column: 1, card: 0 });
    expect(moveSelection(three, { column: 2, card: 0 }, 'right')).toEqual({ column: 2, card: 0 });
    expect(moveSelection(three, { column: 0, card: 0 }, 'left')).toEqual({ column: 0, card: 0 });
  });

  // Moving from the second card of a full column into a shorter one must land on a card that exists.
  it('clamps the row when the next column is shorter', () => {
    expect(moveSelection(three, { column: 0, card: 1 }, 'right')).toEqual({ column: 1, card: 0 });
  });

  it('sits at row zero of an empty column', () => {
    expect(moveSelection(three, { column: 1, card: 0 }, 'right')).toEqual({ column: 2, card: 0 });
  });
});

describe('addCard', () => {
  it('adds at the bottom of the column and selects it', () => {
    const result = addCard(board(['a'], []), { column: 0, card: 0 }, 'new', 'b');
    expect(titles(result.board)).toEqual([['a', 'b'], []]);
    expect(result.selection).toEqual({ column: 0, card: 1 });
  });

  it('leaves the board it was given alone', () => {
    const original = board(['a']);
    addCard(original, { column: 0, card: 0 }, 'new', 'b');
    expect(titles(original)).toEqual([['a']]);
  });
});

describe('renameCard', () => {
  it('replaces the title and keeps the id and notes', () => {
    const start: Board = { columns: [{ name: 'Todo', cards: [{ id: 'x', title: 'old', notes: 'why' }] }] };
    const result = renameCard(start, { column: 0, card: 0 }, 'new');
    expect(result.board.columns[0].cards[0]).toEqual({ id: 'x', title: 'new', notes: 'why' });
  });

  it('does nothing on an empty column', () => {
    const start = board([]);
    expect(renameCard(start, { column: 0, card: 0 }, 'new').board).toEqual(start);
  });
});

describe('deleteCard', () => {
  it('removes the card and selects the one that takes its place', () => {
    const result = deleteCard(board(['a', 'b', 'c']), { column: 0, card: 1 });
    expect(titles(result.board)).toEqual([['a', 'c']]);
    expect(result.selection).toEqual({ column: 0, card: 1 });
  });

  it('steps back when the last card goes', () => {
    const result = deleteCard(board(['a', 'b']), { column: 0, card: 1 });
    expect(result.selection).toEqual({ column: 0, card: 0 });
  });

  it('does nothing on an empty column', () => {
    const start = board([]);
    expect(deleteCard(start, { column: 0, card: 0 })).toEqual({ board: start, selection: { column: 0, card: 0 } });
  });
});

describe('moveCard', () => {
  it('swaps with the card above or below', () => {
    const result = moveCard(board(['a', 'b', 'c']), { column: 0, card: 2 }, 'up');
    expect(titles(result.board)).toEqual([['a', 'c', 'b']]);
    expect(result.selection).toEqual({ column: 0, card: 1 });
  });

  it('stays put at the top and the bottom', () => {
    const start = board(['a', 'b']);
    expect(moveCard(start, { column: 0, card: 0 }, 'up')).toEqual({ board: start, selection: { column: 0, card: 0 } });
    expect(moveCard(start, { column: 0, card: 1 }, 'down'))
      .toEqual({ board: start, selection: { column: 0, card: 1 } });
  });

  // A card sent sideways keeps its row rather than dropping to the bottom of the next column.
  it('sends a card to the next column at the same row', () => {
    const result = moveCard(board(['a', 'b', 'c'], ['x', 'y', 'z']), { column: 0, card: 1 }, 'right');
    expect(titles(result.board)).toEqual([['a', 'c'], ['x', 'b', 'y', 'z']]);
    expect(result.selection).toEqual({ column: 1, card: 1 });
  });

  it('lands at the end when the next column is shorter', () => {
    const result = moveCard(board(['a', 'b', 'c'], ['x']), { column: 0, card: 2 }, 'right');
    expect(titles(result.board)).toEqual([['a', 'b'], ['x', 'c']]);
    expect(result.selection).toEqual({ column: 1, card: 1 });
  });

  it('stays put at the outer columns', () => {
    const start = board(['a'], ['b']);
    expect(moveCard(start, { column: 0, card: 0 }, 'left')).toEqual({ board: start, selection: { column: 0, card: 0 } });
    expect(moveCard(start, { column: 1, card: 0 }, 'right'))
      .toEqual({ board: start, selection: { column: 1, card: 0 } });
  });

  it('does nothing on an empty column', () => {
    const start = board([], ['a']);
    expect(moveCard(start, { column: 0, card: 0 }, 'right')).toEqual({ board: start, selection: { column: 0, card: 0 } });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/board.test.ts`
Expected: FAIL — `Failed to resolve import "./board"`.

- [ ] **Step 3: Write `src/board.ts`**

```ts
import type { Direction } from './terminals';

export type Card = { id: string; title: string; notes: string };
export type Column = { name: string; cards: Card[] };
export type Board = { columns: Column[] };

// Where the keyboard is. An empty column still selects row zero, so every operation has to cope with
// a selection pointing at a card that is not there.
export type Selection = { column: number; card: number };

// Every operation answers with both, because a card that moves takes the selection with it.
export type Change = { board: Board; selection: Selection };

export const DEFAULT_COLUMNS = ['Todo', 'Doing', 'Done'];

export function emptyBoard(): Board {
  return { columns: DEFAULT_COLUMNS.map((name) => ({ name, cards: [] })) };
}

function clamp(value: number, limit: number): number {
  return Math.max(0, Math.min(value, limit));
}

function lastRow(column: Column | undefined): number {
  return Math.max(0, (column?.cards.length ?? 1) - 1);
}

// Operations copy rather than mutate so the caller can keep the previous board as its undo step.
function withColumns(board: Board, columns: Column[]): Board {
  return { ...board, columns };
}

function replaceColumn(board: Board, index: number, cards: Card[]): Board {
  return withColumns(board, board.columns.map((column, at) => (at === index ? { ...column, cards } : column)));
}

export function moveSelection(board: Board, selection: Selection, direction: Direction): Selection {
  if (direction === 'up' || direction === 'down') {
    const step = direction === 'down' ? 1 : -1;
    return { ...selection, card: clamp(selection.card + step, lastRow(board.columns[selection.column])) };
  }
  const step = direction === 'right' ? 1 : -1;
  const column = clamp(selection.column + step, board.columns.length - 1);
  return { column, card: clamp(selection.card, lastRow(board.columns[column])) };
}

export function addCard(board: Board, selection: Selection, id: string, title: string): Change {
  const cards = [...board.columns[selection.column].cards, { id, title, notes: '' }];
  return {
    board: replaceColumn(board, selection.column, cards),
    selection: { column: selection.column, card: cards.length - 1 },
  };
}

export function renameCard(board: Board, selection: Selection, title: string): Change {
  const cards = board.columns[selection.column].cards;
  if (cards.length === 0) return { board, selection };
  return {
    board: replaceColumn(board, selection.column, cards.map((card, at) => (at === selection.card ? { ...card, title } : card))),
    selection,
  };
}

export function deleteCard(board: Board, selection: Selection): Change {
  const cards = board.columns[selection.column].cards;
  if (cards.length === 0) return { board, selection };
  const remaining = cards.filter((_card, at) => at !== selection.card);
  return {
    board: replaceColumn(board, selection.column, remaining),
    selection: { column: selection.column, card: clamp(selection.card, Math.max(0, remaining.length - 1)) },
  };
}

export function moveCard(board: Board, selection: Selection, direction: Direction): Change {
  const cards = board.columns[selection.column].cards;
  if (cards.length === 0) return { board, selection };
  const card = cards[selection.card];

  if (direction === 'up' || direction === 'down') {
    const target = selection.card + (direction === 'down' ? 1 : -1);
    if (target < 0 || target >= cards.length) return { board, selection };
    const reordered = [...cards];
    reordered[selection.card] = reordered[target];
    reordered[target] = card;
    return {
      board: replaceColumn(board, selection.column, reordered),
      selection: { column: selection.column, card: target },
    };
  }

  const target = selection.column + (direction === 'right' ? 1 : -1);
  if (target < 0 || target >= board.columns.length) return { board, selection };
  // The card keeps its row in the column it arrives at, or goes last if that column is shorter, so a
  // card sent sideways stays roughly where your eye left it.
  const row = Math.min(selection.card, board.columns[target].cards.length);
  const arriving = [...board.columns[target].cards];
  arriving.splice(row, 0, card);
  const leaving = cards.filter((_entry, at) => at !== selection.card);
  const columns = board.columns.map((column, at) => {
    if (at === selection.column) return { ...column, cards: leaving };
    if (at === target) return { ...column, cards: arriving };
    return column;
  });
  return { board: withColumns(board, columns), selection: { column: target, card: row } };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/board.test.ts`
Expected: PASS, all cases.

- [ ] **Step 5: Run every check**

Run: `npm test && npx tsc --noEmit && npx eslint .`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/board.ts src/board.test.ts
git commit -m "Add the board's card operations"
```

---

## Task 3: The board file store

**Files:**
- Create: `src/board-store.ts`
- Test: `src/board-store.test.ts`

**Interfaces:**
- Consumes: `Board`, `emptyBoard` from `src/board.ts`.
- Produces, all from `src/board-store.ts`:
  - `const BOARD_DIRECTORY = '.dashboard'`
  - `parseBoard(text: string, makeId?: () => string): Board`
  - `readBoard(projectPath: string): Board`
  - `writeBoard(projectPath: string, board: Board): void` — throws if the write fails
  - `seedBoardDirectory(projectPath: string): void`

- [ ] **Step 1: Write the failing tests**

Create `src/board-store.test.ts`:

```ts
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BOARD_DIRECTORY, parseBoard, readBoard, seedBoardDirectory, writeBoard } from './board-store';

function project(): string {
  return mkdtempSync(join(tmpdir(), 'dashboard-board-'));
}

function writeRaw(projectPath: string, text: string): void {
  mkdirSync(join(projectPath, BOARD_DIRECTORY), { recursive: true });
  writeFileSync(join(projectPath, BOARD_DIRECTORY, 'board.json'), text);
}

const columnNames = (board: { columns: { name: string }[] }) => board.columns.map((column) => column.name);

describe('parseBoard', () => {
  it('reads a well-formed board', () => {
    const board = parseBoard('{"columns":[{"name":"Later","cards":[{"id":"1","title":"a","notes":"n"}]}]}');
    expect(board.columns).toEqual([{ name: 'Later', cards: [{ id: '1', title: 'a', notes: 'n' }] }]);
  });

  // A file edited by hand or by an agent must never stop the board opening.
  it('falls back to an empty board on anything it cannot read', () => {
    expect(columnNames(parseBoard('not json at all'))).toEqual(['Todo', 'Doing', 'Done']);
    expect(columnNames(parseBoard('[]'))).toEqual(['Todo', 'Doing', 'Done']);
    expect(columnNames(parseBoard('{"columns":"nope"}'))).toEqual(['Todo', 'Doing', 'Done']);
    expect(columnNames(parseBoard('{"columns":[]}'))).toEqual(['Todo', 'Doing', 'Done']);
  });

  it('drops a column with no name and a card with no title', () => {
    const board = parseBoard('{"columns":[{"cards":[]},{"name":"Todo","cards":[{"id":"1"},{"id":"2","title":"a"}]}]}');
    expect(columnNames(board)).toEqual(['Todo']);
    expect(board.columns[0].cards.map((card) => card.title)).toEqual(['a']);
  });

  it('fills in a missing cards array and missing notes', () => {
    const board = parseBoard('{"columns":[{"name":"Todo"},{"name":"Doing","cards":[{"id":"1","title":"a"}]}]}');
    expect(board.columns[0].cards).toEqual([]);
    expect(board.columns[1].cards[0].notes).toBe('');
  });

  // An agent writing a card by hand will forget the id, and losing the card would be worse than
  // giving it one.
  it('gives a card without an id one of its own', () => {
    const board = parseBoard('{"columns":[{"name":"Todo","cards":[{"title":"a"}]}]}', () => 'generated');
    expect(board.columns[0].cards[0]).toEqual({ id: 'generated', title: 'a', notes: '' });
  });
});

describe('readBoard', () => {
  it('returns an empty board when the project has no .dashboard folder', () => {
    expect(columnNames(readBoard(project()))).toEqual(['Todo', 'Doing', 'Done']);
  });

  it('reads back what writeBoard wrote', () => {
    const path = project();
    writeBoard(path, { columns: [{ name: 'Later', cards: [{ id: '1', title: 'a', notes: '' }] }] });
    expect(columnNames(readBoard(path))).toEqual(['Later']);
  });

  it('survives a damaged file', () => {
    const path = project();
    writeRaw(path, '{"columns": [');
    expect(columnNames(readBoard(path))).toEqual(['Todo', 'Doing', 'Done']);
  });
});

describe('writeBoard', () => {
  it('creates the folder and writes readable json', () => {
    const path = project();
    writeBoard(path, { columns: [{ name: 'Todo', cards: [] }] });
    const text = readFileSync(join(path, BOARD_DIRECTORY, 'board.json'), 'utf8');
    expect(text).toContain('\n  "columns"');
    expect(text.endsWith('\n')).toBe(true);
  });

  it('throws when the board cannot be written', () => {
    // A file where the folder should be: the write cannot succeed, and must say so rather than
    // pretend the cards were saved.
    const path = project();
    writeFileSync(join(path, BOARD_DIRECTORY), 'in the way');
    expect(() => writeBoard(path, { columns: [] })).toThrow();
  });
});

describe('seedBoardDirectory', () => {
  it('writes the two explanation files', () => {
    const path = project();
    seedBoardDirectory(path);
    expect(readFileSync(join(path, BOARD_DIRECTORY, 'CLAUDE.md'), 'utf8')).toContain('board.json');
    expect(readFileSync(join(path, BOARD_DIRECTORY, 'README.md'), 'utf8')).toContain('.dashboard');
  });

  it('never overwrites files that are already there', () => {
    const path = project();
    seedBoardDirectory(path);
    writeFileSync(join(path, BOARD_DIRECTORY, 'CLAUDE.md'), 'mine');
    seedBoardDirectory(path);
    expect(readFileSync(join(path, BOARD_DIRECTORY, 'CLAUDE.md'), 'utf8')).toBe('mine');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/board-store.test.ts`
Expected: FAIL — `Failed to resolve import "./board-store"`.

- [ ] **Step 3: Write `src/board-store.ts`**

```ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { emptyBoard, type Board, type Card, type Column } from './board';

// The project's own corner of its repository. Everything the dashboard keeps about a project lives
// here, so there is one thing to commit or to ignore.
export const BOARD_DIRECTORY = '.dashboard';
const BOARD_FILE = 'board.json';

const EXPLANATION_FOR_AGENTS = `# .dashboard

This folder holds the project's kanban board, shown in the Dashboard app under Ctrl+B.

## board.json

    {
      "columns": [
        {
          "name": "Todo",
          "cards": [
            { "id": "0f6a2c5e-...", "title": "Fix the resize race", "notes": "" }
          ]
        }
      ]
    }

- \`columns\` is ordered. The first column is the leftmost on screen.
- \`cards\` is ordered. The first card is at the top of its column.
- \`id\` is a UUID. Keep it stable when you edit a card. A card written without one is given an id
  the next time the app reads the file.
- \`title\` is one line. A card with no \`title\` is dropped when the app reads the file.
- \`notes\` is free text. The app keeps it but has no editor for it yet.

Edit this file directly if you like. The app re-reads it whenever the board is opened, so switch
away from the board and back to see your changes. The app rewrites the whole file on every edit and
drops any field not listed above.
`;

const EXPLANATION_FOR_PEOPLE = `# .dashboard

Project state for the Dashboard app. \`board.json\` holds this project's kanban board.

Commit it if the board belongs to the team; add \`.dashboard/\` to \`.gitignore\` if it is yours alone.

\`CLAUDE.md\` beside this file describes the format.
`;

function boardPath(projectPath: string): string {
  return join(projectPath, BOARD_DIRECTORY, BOARD_FILE);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseCard(value: unknown, makeId: () => string): Card | null {
  if (!isRecord(value) || typeof value.title !== 'string') return null;
  return {
    id: typeof value.id === 'string' ? value.id : makeId(),
    title: value.title,
    notes: typeof value.notes === 'string' ? value.notes : '',
  };
}

function parseColumn(value: unknown, makeId: () => string): Column | null {
  if (!isRecord(value) || typeof value.name !== 'string') return null;
  const cards = Array.isArray(value.cards) ? value.cards : [];
  return {
    name: value.name,
    cards: cards.map((card) => parseCard(card, makeId)).filter((card): card is Card => card !== null),
  };
}

// The board is written by the app, by hand, and by agents working in the repository, so reading it
// keeps whatever it can and never throws. A file it cannot make sense of reads as a fresh board —
// the alternative is a board that refuses to open because one card lost its title.
export function parseBoard(text: string, makeId: () => string = () => crypto.randomUUID()): Board {
  let stored: unknown;
  try {
    stored = JSON.parse(text);
  } catch {
    return emptyBoard();
  }
  if (!isRecord(stored) || !Array.isArray(stored.columns)) return emptyBoard();
  const columns = stored.columns
    .map((column) => parseColumn(column, makeId))
    .filter((column): column is Column => column !== null);
  return columns.length > 0 ? { columns } : emptyBoard();
}

export function readBoard(projectPath: string): Board {
  try {
    return parseBoard(readFileSync(boardPath(projectPath), 'utf8'));
  } catch {
    return emptyBoard();
  }
}

// Unlike reading, a failed write is reported. Swallowing it would show cards on screen that are not
// on disk, and the next launch would silently lose them.
export function writeBoard(projectPath: string, board: Board): void {
  mkdirSync(join(projectPath, BOARD_DIRECTORY), { recursive: true });
  writeFileSync(boardPath(projectPath), `${JSON.stringify(board, null, 2)}\n`);
}

// Written once, when the folder first appears. Neither file is regenerated, so an edited CLAUDE.md
// stays edited.
export function seedBoardDirectory(projectPath: string): void {
  mkdirSync(join(projectPath, BOARD_DIRECTORY), { recursive: true });
  for (const [name, contents] of [
    ['CLAUDE.md', EXPLANATION_FOR_AGENTS],
    ['README.md', EXPLANATION_FOR_PEOPLE],
  ] as const) {
    const file = join(projectPath, BOARD_DIRECTORY, name);
    if (!existsSync(file)) writeFileSync(file, contents);
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/board-store.test.ts`
Expected: PASS, all cases.

- [ ] **Step 5: Run every check**

Run: `npm test && npx tsc --noEmit && npx eslint .`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/board-store.ts src/board-store.test.ts
git commit -m "Read and write a project's board file"
```

---

## Task 4: Three views on a page

Mode switching with real terminals and two empty placeholder views. Nvim and the board arrive in Tasks 5 and 6, so this task is verified by the checks and by the terminals grid still behaving exactly as before.

**Files:**
- Modify: `src/renderer.ts`, `src/index.css`

**Interfaces:**
- Consumes: `Mode` from `src/modes.ts`; `Action` (now with `mode-set`) and `mapShortcut`'s third parameter from `src/shortcuts.ts`.
- Produces (used by Tasks 5 and 6): `Page` gains `mode: Mode`, `views: Record<Mode, HTMLElement>`; `setMode(mode: Mode): void`; `buildPane(view: HTMLElement, id: string, onFocus?: () => void): Pane`.

- [ ] **Step 1: Stack the views in `src/index.css`**

Replace the `.page` and `.page.missing` rules, and add the view rules after them:

```css
.page {
  position: absolute;
  inset: 0;
}

/* One view is on screen at a time. Visibility, not display, for the same reason pages use it: a view
   you have not looked at yet still has a size, so the fit addon can measure its panes. */
.view {
  position: absolute;
  inset: 0;
  background: var(--black);
}

.view[hidden] {
  visibility: hidden;
}

/* The five shells. Six columns divide evenly into two on top and three below. */
.view-terminals {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  grid-template-rows: 2fr 1fr;
  gap: 2px;
}

.page.missing {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--red);
  background: var(--background);
}
```

Leave `.page[hidden] { visibility: hidden; }` where it is. The `.pane:nth-child` rules keep working: the panes are still the direct children of the grid, which is now `.view-terminals`.

- [ ] **Step 2: Give a page its three views in `src/renderer.ts`**

Add the import beside the others:

```ts
import { type Mode } from './modes';
```

Replace the `Page` type:

```ts
type Page = {
  project: Project;
  element: HTMLElement;
  views: Record<Mode, HTMLElement>;
  mode: Mode;
  panes: Pane[];
  focused: number;
  slot: number;
};
```

Change `buildPane` to take the view it belongs to and a focus callback, instead of reaching for `page`. Exactly three lines change; everything between them stays as it is.

Its signature and first three lines become:

```ts
function buildPane(view: HTMLElement, id: string, onFocus?: () => void): Pane {
  const container = document.createElement('div');
  container.className = 'pane';
  view.append(container);
```

(was `page.element.append(container)`.)

Its last lines, replacing the focus listener that used `page` and `terminalIndex`:

```ts
  terminal.textarea?.addEventListener('focus', () => onFocus?.());
  return pane;
}
```

Nothing else in the function moves. The terminal, the fit addon, the web-links addon, `onData`, the drop handler and `onResize` are untouched — none of them referenced `page`.

Replace `buildPage`:

```ts
function buildPage(project: Project, slot: number): Page {
  const element = document.createElement('section');
  element.className = 'page';
  const views: Record<Mode, HTMLElement> = {
    terminals: document.createElement('div'),
    nvim: document.createElement('div'),
    board: document.createElement('div'),
  };
  for (const [mode, view] of Object.entries(views)) {
    view.className = `view view-${mode}`;
    view.hidden = mode !== 'terminals';
  }
  const page: Page = { project, element, views, mode: 'terminals', panes: [], focused: 0, slot };
  // Deliberate insurance against one race: the picker only offers folders that exist, so the sole way here
  // is deleting the folder between the dialog closing and the existence check. Then you get this page
  // instead of a blank one with no shells. A dead project has no views: there is nothing to run nvim in
  // and nowhere to keep a board.
  if (project.missing) {
    element.classList.add('missing');
    element.textContent = `Directory not found: ${project.path}`;
    return page;
  }
  element.append(...Object.values(views));
  for (let terminalIndex = 0; terminalIndex < TERMINAL_COUNT; terminalIndex++) {
    const id = terminalId(slot, terminalIndex);
    const pane = buildPane(views.terminals, id, () => {
      if (page.focused === terminalIndex) return;
      page.focused = terminalIndex;
      renderStatus();
    });
    page.panes.push(pane);
    panesById.set(id, pane);
  }
  return page;
}
```

- [ ] **Step 3: Add `setMode` and teach `showPage` about it**

Add after `focusTerminal`:

```ts
// Switching mode is per page, so each project keeps the view you left it on. A dead project has no
// views to switch between and ignores the keys.
function setMode(mode: Mode): void {
  const page = pages[activeIndex];
  if (page.project.missing) return;
  page.mode = mode;
  for (const [name, view] of Object.entries(page.views)) view.hidden = name !== mode;
  focusMode(page);
}

function focusMode(page: Page): void {
  if (page.mode === 'terminals') return focusTerminal(page.focused);
  renderStatus();
}
```

In `showPage`, replace the last line `focusTerminal(pages[activeIndex].focused);` with `focusMode(pages[activeIndex]);`.

- [ ] **Step 4: Show the mode in the status bar**

In `renderStatus`, replace the last line:

```ts
  statusTerminal.textContent = modeLabel(page);
```

and add above `renderStatus`:

```ts
// The right-hand span says which view you are in, and for terminals which pane has the keyboard.
function modeLabel(page: Page): string {
  if (page.mode === 'nvim') return 'nvim';
  if (page.mode === 'board') return 'board';
  return page.panes.length > 0 ? `terminal ${page.focused + 1}` : '';
}
```

- [ ] **Step 5: Route the action and pass the mode to `mapShortcut`**

In `apply`, add to the switch:

```ts
    case 'mode-set': return setMode(action.mode);
```

In the `keydown` listener, replace the `mapShortcut` call:

```ts
  const action = mapShortcut(event, isMac, pages[activeIndex]?.mode);
```

- [ ] **Step 6: Run every check**

Run: `npm test && npx tsc --noEmit && npx eslint .`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/renderer.ts src/index.css
git commit -m "Give each page three views and a mode"
```

---

## Task 5: Nvim mode

**Files:**
- Modify: `src/main.ts`, `src/renderer.ts`, `src/index.css`

**Interfaces:**
- Consumes: `terminalId`, `TERMINAL_COUNT` from `src/terminals.ts`; `buildPane`, `setMode`, `Page` from Task 4.
- Produces: `EDITOR_INDEX = TERMINAL_COUNT` as the terminal index of a project's nvim pane; `Page` gains `editor: Pane | null` and `editorStarted: boolean`.

- [ ] **Step 1: Let main spawn something other than a shell**

In `src/main.ts`, replace `terminalDirectories` and `spawnShell`:

```ts
// What each terminal id runs and where. The nvim pane is registered here like any other, which is
// what lets the renderer start it later through the ordinary restart path.
const terminalCommands = new Map<string, { command: string; directory: string }>();

function spawnTerminal(id: string): void {
  const entry = terminalCommands.get(id);
  if (entry === undefined) return;
  let terminalProcess: pty.IPty;
  try {
    terminalProcess = pty.spawn(entry.command, [], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: entry.directory,
      env: process.env as Record<string, string>,
    });
  } catch {
    // nvim may simply not be installed. The pane shows the same exit line a dead shell shows,
    // rather than the spawn taking the window down.
    sendToRenderer('pty:exit', id, 127);
    return;
  }
  terminalProcess.onData((data) => sendToRenderer('pty:data', id, data));
  terminalProcess.onExit(({ exitCode }) => {
    shells.delete(id);
    sendToRenderer('pty:exit', id, exitCode);
  });
  shells.set(id, terminalProcess);
}
```

Replace `spawnProject`:

```ts
// The five shells start with the project. The editor is registered but not started: opening nine
// projects should not launch nine editors, each with its own swap files, that you never asked for.
function spawnProject(project: Project, projectIndex: number): void {
  if (project.missing) return;
  for (let terminalIndex = 0; terminalIndex < TERMINAL_COUNT; terminalIndex++) {
    const id = terminalId(projectIndex, terminalIndex);
    terminalCommands.set(id, { command: shellCommand, directory: project.path });
    spawnTerminal(id);
  }
  terminalCommands.set(terminalId(projectIndex, TERMINAL_COUNT), { command: 'nvim', directory: project.path });
}
```

Replace the restart handler:

```ts
ipcMain.on('pty:restart', (_event, id: string) => {
  if (!shells.has(id)) spawnTerminal(id);
});
```

- [ ] **Step 2: Build the nvim pane in the renderer**

In `src/renderer.ts`, add beside the other constants:

```ts
// The editor is a sixth pty for the project, sitting one past the grid's five.
const EDITOR_INDEX = TERMINAL_COUNT;
```

Add to the `Page` type:

```ts
  editor: Pane | null;
  editorStarted: boolean;
```

In `buildPage`, initialise them as `editor: null, editorStarted: false`, and after the loop that builds the five panes:

```ts
  const editorId = terminalId(slot, EDITOR_INDEX);
  page.editor = buildPane(views.nvim, editorId);
  panesById.set(editorId, page.editor);
```

- [ ] **Step 3: Start nvim on first entry to the mode**

Replace `focusMode`:

```ts
function focusMode(page: Page): void {
  if (page.mode === 'terminals') return focusTerminal(page.focused);
  if (page.mode === 'nvim' && page.editor) {
    // Started the first time you ask for it, through the same path a dead pane restarts by. Quit
    // nvim and the pane says so and waits for Enter, exactly like a shell that has exited.
    if (!page.editorStarted) {
      page.editorStarted = true;
      bridge.restart(terminalId(page.slot, EDITOR_INDEX));
      bridge.resize(terminalId(page.slot, EDITOR_INDEX), page.editor.terminal.cols, page.editor.terminal.rows);
    }
    page.editor.terminal.focus();
  }
  renderStatus();
}
```

- [ ] **Step 4: Fit the editor pane too**

In `fitAllPages`, include the editor:

```ts
function fitAllPages(): void {
  for (const page of pages) {
    for (const pane of page.panes) pane.fit.fit();
    page.editor?.fit.fit();
  }
}
```

- [ ] **Step 5: Fill the nvim view with its single pane**

Add to `src/index.css` after the `.view-terminals` rule:

```css
/* One pane, the whole page. Splits are nvim's business, not the dashboard's. */
.view-nvim {
  display: grid;
}
```

- [ ] **Step 6: Run every check**

Run: `npm test && npx tsc --noEmit && npx eslint .`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/main.ts src/renderer.ts src/index.css
git commit -m "Run nvim as a project's sixth terminal"
```

---

## Task 6: The board

**Files:**
- Create: `src/board-view.ts`
- Modify: `src/main.ts`, `src/bridge.ts`, `src/preload.ts`, `src/renderer.ts`, `src/index.css`

**Interfaces:**
- Consumes: everything from `src/board.ts` (Task 2) and `src/board-store.ts` (Task 3); `Direction` from `src/terminals.ts`; `Page`, `setMode`, `report` from Task 4.
- Produces:
  - `bridge.readBoard(projectPath: string): Promise<Board>`
  - `bridge.writeBoard(projectPath: string, board: Board): Promise<void>`
  - `type BoardView = { element: HTMLElement; open(): Promise<void>; columnName(): string }`
  - `createBoardView(options: BoardOptions): BoardView` from `src/board-view.ts`

- [ ] **Step 1: Add the IPC handlers in `src/main.ts`**

Add the import:

```ts
import { readBoard, seedBoardDirectory, writeBoard } from './board-store';
import type { Board } from './board';
```

Add the handlers beside the project ones:

```ts
// Reading also seeds the folder, so the first Ctrl+B on a project is what creates .dashboard.
ipcMain.handle('board:read', (_event, projectPath: string) => {
  seedBoardDirectory(projectPath);
  return readBoard(projectPath);
});
// invoke, not send, so a write that fails rejects in the renderer and reaches the status bar.
ipcMain.handle('board:write', (_event, projectPath: string, board: Board) => writeBoard(projectPath, board));
```

- [ ] **Step 2: Add them to the bridge**

In `src/bridge.ts`, add the import and the two methods:

```ts
import type { Board } from './board';
```

```ts
  readBoard(projectPath: string): Promise<Board>;
  writeBoard(projectPath: string, board: Board): Promise<void>;
```

In `src/preload.ts`:

```ts
  readBoard: (projectPath) => ipcRenderer.invoke('board:read', projectPath),
  writeBoard: (projectPath, board) => ipcRenderer.invoke('board:write', projectPath, board),
```

- [ ] **Step 3: Write `src/board-view.ts`**

```ts
import {
  addCard,
  deleteCard,
  emptyBoard,
  moveCard,
  moveSelection,
  renameCard,
  type Board,
  type Selection,
} from './board';
import type { DashboardBridge } from './bridge';
import type { Direction } from './terminals';

export type BoardOptions = {
  projectPath: string;
  bridge: DashboardBridge;
  // The status bar names the column the selection is in, so it is redrawn whenever that can change.
  onChanged(): void;
  onError(message: string): void;
};

export type BoardView = {
  element: HTMLElement;
  open(): Promise<void>;
  columnName(): string;
};

const ARROW_DIRECTIONS: Record<string, Direction> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
};

export function createBoardView(options: BoardOptions): BoardView {
  const element = document.createElement('div');
  element.className = 'board';
  // The board takes the keyboard as a whole; cards are not separately focusable, so arrow keys move a
  // selection rather than the browser's focus ring.
  element.tabIndex = 0;

  let board: Board = emptyBoard();
  let selection: Selection = { column: 0, card: 0 };
  // One step, held in memory. `d` deletes on a single keystroke, so there has to be a way back from a
  // mis-hit; anything deeper is a feature nobody asked for.
  let previous: Board | null = null;
  let editing = false;

  function save(): void {
    options.bridge.writeBoard(options.projectPath, board).catch((error: unknown) => {
      options.onError(`Board not saved: ${String(error)}`);
    });
  }

  function change(next: { board: Board; selection: Selection }): void {
    previous = board;
    board = next.board;
    selection = next.selection;
    render();
    save();
  }

  function undo(): void {
    if (previous === null) return;
    board = previous;
    previous = null;
    selection = {
      column: Math.min(selection.column, board.columns.length - 1),
      card: 0,
    };
    render();
    save();
  }

  function startEditing(): void {
    const card = board.columns[selection.column]?.cards[selection.card];
    if (!card) return;
    editing = true;
    render();
    const input = element.querySelector('.board-edit');
    if (input instanceof HTMLInputElement) {
      input.focus();
      input.select();
    }
  }

  // Enter and Escape both commit: what you typed is what you meant, and there is no separate save key
  // anywhere else in the app either. A card left with an empty title is dropped rather than kept as a
  // blank row, which is the only way `n` can leave one behind.
  function commitEditing(title: string): void {
    editing = false;
    const trimmed = title.trim();
    change(trimmed === '' ? deleteCard(board, selection) : renameCard(board, selection, trimmed));
    element.focus();
  }

  function renderCard(title: string, selected: boolean): HTMLElement {
    const item = document.createElement('li');
    item.className = selected ? 'board-card selected' : 'board-card';
    if (selected && editing) {
      const input = document.createElement('input');
      input.className = 'board-edit';
      input.value = title;
      input.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== 'Escape') return;
        event.preventDefault();
        commitEditing(input.value);
      });
      input.addEventListener('blur', () => {
        if (editing) commitEditing(input.value);
      });
      item.append(input);
      return item;
    }
    item.textContent = title;
    return item;
  }

  function render(): void {
    element.replaceChildren(...board.columns.map((column, columnIndex) => {
      const section = document.createElement('section');
      section.className = 'board-column';
      const heading = document.createElement('h2');
      heading.textContent = `${column.name} (${column.cards.length})`;
      const list = document.createElement('ul');
      list.append(...column.cards.map((card, cardIndex) =>
        renderCard(card.title, columnIndex === selection.column && cardIndex === selection.card)));
      if (column.cards.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'board-empty';
        empty.textContent = 'n adds a card';
        section.append(heading, list, empty);
        return section;
      }
      section.append(heading, list);
      return section;
    }));
    element.querySelector('.board-card.selected')?.scrollIntoView({ block: 'nearest' });
    options.onChanged();
  }

  element.addEventListener('keydown', (event) => {
    // The input owns every key while a title is being edited; its own handler ends the edit.
    if (editing) return;
    const direction = ARROW_DIRECTIONS[event.key];
    if (direction) {
      event.preventDefault();
      if (event.shiftKey) return change(moveCard(board, selection, direction));
      selection = moveSelection(board, selection, direction);
      return render();
    }
    if (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;
    switch (event.key) {
      case 'Enter':
        event.preventDefault();
        return startEditing();
      case 'n':
        event.preventDefault();
        change(addCard(board, selection, crypto.randomUUID(), ''));
        return startEditing();
      case 'd':
        event.preventDefault();
        return change(deleteCard(board, selection));
      case 'u':
        event.preventDefault();
        return undo();
    }
  });

  return {
    element,
    // ponytail: re-read on entry, no file watcher. An agent editing board.json while you are looking
    // at the board is not picked up until you switch away and back. Watch the file if that bites.
    async open(): Promise<void> {
      board = await options.bridge.readBoard(options.projectPath);
      previous = null;
      editing = false;
      selection = { column: Math.min(selection.column, board.columns.length - 1), card: 0 };
      render();
      element.focus();
    },
    columnName(): string {
      return board.columns[selection.column]?.name ?? '';
    },
  };
}
```

- [ ] **Step 4: Wire the board into the page**

In `src/renderer.ts`, add the import:

```ts
import { createBoardView, type BoardView } from './board-view';
```

Add to the `Page` type:

```ts
  board: BoardView | null;
```

In `buildPage`, initialise `board: null`, and after the editor pane is built:

```ts
  page.board = createBoardView({
    projectPath: project.path,
    bridge,
    onChanged: renderStatus,
    onError: (message) => { statusProjects.textContent = message; },
  });
  views.board.append(page.board.element);
```

In `focusMode`, add the board branch before `renderStatus()`:

```ts
  if (page.mode === 'board' && page.board) report(page.board.open());
```

`report` takes a `Promise<void>` and already writes any failure to the status bar, so a board that cannot be read says so instead of showing a blank page.

In `modeLabel`, replace the board line:

```ts
  if (page.mode === 'board') return `board · ${page.board?.columnName() ?? ''}`;
```

- [ ] **Step 5: Let the card editor keep its keystrokes**

In the `keydown` capture listener, extend the exemption:

```ts
  // The picker and a card being edited own every key typed inside them. xterm's textarea is outside
  // both, so a pane keeps its shortcuts.
  if (event.target instanceof Element && event.target.closest('.picker, .board-edit')) return;
```

- [ ] **Step 6: Style the board in `src/index.css`**

Add after the `.view-nvim` rule:

```css
.board {
  display: flex;
  gap: 2px;
  height: 100%;
  padding: 2px;
  box-sizing: border-box;
  overflow: hidden;
  outline: none;
}

.board-column {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  padding: 8px;
  background: var(--background);
}

.board-column h2 {
  margin: 0 0 8px;
  color: var(--brightWhite);
  font-size: inherit;
}

.board-column ul {
  margin: 0;
  padding: 0;
  list-style: none;
}

.board-card {
  padding: 4px 6px;
  margin-bottom: 4px;
  background: var(--black);
  overflow-wrap: anywhere;
}

/* Where the keyboard is. The board has one selection, not one per column. */
.board-card.selected {
  outline: 1px solid var(--blue);
  outline-offset: -1px;
  background: var(--brightBlack);
  color: var(--brightWhite);
}

.board-edit {
  width: 100%;
  font: inherit;
  color: var(--brightWhite);
  background: none;
  border: none;
  outline: none;
}

.board-empty {
  margin: 0;
  color: var(--brightBlack);
}
```

- [ ] **Step 7: Run every check**

Run: `npm test && npx tsc --noEmit && npx eslint .`
Expected: all pass.

- [ ] **Step 8: Check the file sizes**

Run: `wc -l src/renderer.ts src/board-view.ts src/main.ts`
Expected: all under 600. If `renderer.ts` is close, stop and split the mode handling into its own module rather than committing an oversized file.

- [ ] **Step 9: Commit**

```bash
git add src/board-view.ts src/board.ts src/board-store.ts src/main.ts src/bridge.ts src/preload.ts src/renderer.ts src/index.css
git commit -m "Add the kanban board mode"
```

---

## Task 7: Document the modes

**Files:**
- Modify: `README.md`, `CLAUDE.md`

- [ ] **Step 1: Describe the modes in `README.md`**

Change the opening line from:

```markdown
Keyboard-first terminal dashboard. Each project gets a page with five shells in a fixed grid.
```

to:

```markdown
Keyboard-first terminal dashboard. Each project gets a page, shown three ways: five shells in a fixed grid, a full-window nvim, or a kanban board.
```

Add these rows to the top of the shortcuts table, above "Open the project list":

```markdown
| Terminals mode | Ctrl+T |
| Nvim mode | Ctrl+N |
| Board mode | Ctrl+B |
```

Change the "Focus terminal N" and "Next / previous terminal" rows to say they are terminals-mode only:

```markdown
| Focus terminal N | Mod+1..5 (terminals mode, macOS only — see below) |
| Next / previous terminal | Mod+Right / Mod+Left (terminals mode) |
| Move to the pane left / down / up / right | Option+H / J / K / L (Alt elsewhere, terminals mode) |
```

- [ ] **Step 2: Add a Modes section to `README.md`**

Insert between the shortcuts table and "Known limitations":

```markdown
## Modes

Each project remembers its own mode, so Ctrl+2 lands on project 2 in whatever view you left it in. The project keys work from all three; nothing else does — Mod+1..5 and Option+HJKL only mean something when the terminals are on screen.

The key naming the mode you are already in is passed through to whatever is running there, so Ctrl+N still completes a word inside nvim and Ctrl+T still transposes characters in a shell. You leave a mode by naming a different one.

Nvim starts the first time you press Ctrl+N for that project, not at launch. Quit it and the pane says `[exited 0] press Enter to restart`, like any shell that has exited.

The board lives in `.dashboard/board.json` inside the project, alongside a `README.md` and a `CLAUDE.md` describing the format. The folder is created the first time you open the board. Committing it is your call — nothing touches `.gitignore`.

Inside the board: arrows move the selection, Enter edits a card's title, `n` adds one, `d` deletes it, `u` takes the last change back, and Shift with an arrow moves the card itself. Every change is written straight to disk; there is no save key.

The board is re-read whenever you enter it, so edits made to `board.json` from outside show up when you switch away and back — not while you are looking at it.
```

- [ ] **Step 3: Record the pass-through rule in `CLAUDE.md`**

Add after the "Keyboard first" section:

```markdown
## Mode keys pass through — Hard Rule

Ctrl+T, Ctrl+N and Ctrl+B switch modes, except when they name the mode you are
already in. There they are ignored, and the pane gets the keystroke.

That is not an oversight. Ctrl+N is nvim's autocomplete and Ctrl+T is the
shell's transpose. Take them and pressing Ctrl+N mid-word throws you out to the
terminal grid instead of completing the word. You leave a mode by naming a
different one.
```

- [ ] **Step 4: Run every check**

Run: `npm test && npx tsc --noEmit && npx eslint .`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add README.md CLAUDE.md
git commit -m "Document the three modes"
```

- [ ] **Step 6: Report and stop**

Say the installed app needs a rebuild and restart to pick the change up, and stop there. Do not rebuild it, do not restart it, do not quit it.
