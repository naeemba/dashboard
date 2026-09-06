# Board Card Subtasks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let any board card name another card as its parent, so work can be broken into subtasks that are still ordinary cards with their own column, priority and subtasks.

**Architecture:** One new field, `parent: string | null`, on `Card`. There is no children array — children are found by scanning the board for cards that point at an id, so the two halves of the relation can never disagree. Cards stay flat in their columns; the relation shows as a badge on the child, a segmented progress bar on the parent, and a dialog (`o`) that lists a card's children.

**Tech Stack:** TypeScript, Electron, vitest, plain DOM (no framework). Tests run with `npm test`; types with `npx tsc --noEmit`; lint with `npx eslint .`.

**Spec:** `docs/superpowers/specs/2026-09-06-board-card-subtasks-design.md`

## Global Constraints

- **Never rebuild, quit, restart or replace the running Dashboard app.** Building into `out/` or `.vite/` is fine. After the code changes, say the installed app needs a rebuild and restart, and stop. (`CLAUDE.md`)
- **Keyboard first.** Every action must be reachable from the keyboard alone. A control that only responds to a click is unfinished. (`CLAUDE.md`)
- **The help dialog is part of the change.** Any task that adds, removes or changes a key updates `src/help.ts` in the same change. (`CLAUDE.md`)
- **No abbreviations in identifiers.** `descendants`, not `desc`; `column`, not `col`. (`rules/naming.md`)
- **600 lines of code per file, hard ceiling.** `src/board-view.ts` is the one to watch — this is why the detail dialog is its own file. (`rules/file-size.md`)
- Every check must pass before each commit: `npm test`, `npx tsc --noEmit`, `npx eslint .`.
- Comments in this codebase say *why*, in full sentences. Match that; do not add comments that restate the code.

---

### Task 1: `parent` on the card, and finding children

Adds the field and the two read-only lookups everything else is built on. Nothing on screen changes yet.

**Files:**
- Modify: `src/board.ts`
- Modify: `src/board.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `Card` gains `parent: string | null`
  - `export function childrenOf(board: Board, id: string): Card[]`
  - `export function descendantsOf(board: Board, id: string): Card[]`
  - `export function isDescendantOf(board: Board, id: string, ancestorId: string): boolean`
  - `export function childColumns(board: Board, id: string): number[]`

- [ ] **Step 1: Write the failing tests**

In `src/board.test.ts`, the local `board()` helper builds cards without a `parent`. Change it so it compiles against the new type, and add a second helper that can set parents. Replace the existing helper with:

```ts
function board(...columns: string[][]): Board {
  return {
    columns: columns.map((titles, index) => ({
      name: `Column ${index}`,
      cards: titles.map((title) => ({ id: title, title, notes: '', priority: DEFAULT_PRIORITY, parent: null })),
    })),
  };
}

// The test boards use the title as the id, so a relation reads as "b's parent is a".
function withParents(source: Board, parents: Record<string, string>): Board {
  return {
    columns: source.columns.map((column) => ({
      ...column,
      cards: column.cards.map((card) => ({ ...card, parent: parents[card.id] ?? null })),
    })),
  };
}
```

Add `childrenOf`, `descendantsOf`, `isDescendantOf` and `childColumns` to the import list at the top of the file, then append:

```ts
describe('childrenOf', () => {
  const family = withParents(board(['a', 'b'], ['c'], ['d']), { b: 'a', c: 'a', d: 'c' });

  it('finds the cards that name a card as their parent', () => {
    expect(childrenOf(family, 'a').map((card) => card.title)).toEqual(['b', 'c']);
  });

  it('reads children across columns, left to right then top to bottom', () => {
    const spread = withParents(board(['a', 'x'], ['y'], ['z']), { x: 'a', y: 'a', z: 'a' });
    expect(childrenOf(spread, 'a').map((card) => card.title)).toEqual(['x', 'y', 'z']);
  });

  it('is empty for a card nobody points at', () => {
    expect(childrenOf(family, 'd')).toEqual([]);
  });
});

describe('descendantsOf', () => {
  const family = withParents(board(['a', 'b'], ['c'], ['d']), { b: 'a', c: 'a', d: 'c' });

  it('goes all the way down, not just one level', () => {
    expect(descendantsOf(family, 'a').map((card) => card.title)).toEqual(['b', 'c', 'd']);
  });

  it('leaves the card itself out', () => {
    expect(descendantsOf(family, 'a').some((card) => card.id === 'a')).toBe(false);
  });
});

describe('isDescendantOf', () => {
  const family = withParents(board(['a', 'b'], ['c'], ['d']), { b: 'a', c: 'a', d: 'c' });

  it('is true for a grandchild', () => {
    expect(isDescendantOf(family, 'd', 'a')).toBe(true);
  });

  it('is false the other way round', () => {
    expect(isDescendantOf(family, 'a', 'd')).toBe(false);
  });

  it('is false for a card and itself', () => {
    expect(isDescendantOf(family, 'a', 'a')).toBe(false);
  });
});

describe('childColumns', () => {
  it('says which column each child sits in, in the order children are read', () => {
    const spread = withParents(board(['a', 'x'], ['y'], ['z']), { x: 'a', y: 'a', z: 'a' });
    expect(childColumns(spread, 'a')).toEqual([0, 1, 2]);
  });

  it('is empty for a card with no children', () => {
    expect(childColumns(board(['a']), 'a')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npm test -- board.test.ts`
Expected: FAIL — `childrenOf` is not exported from `./board`, and the `board()` helper's cards do not satisfy `Card`.

- [ ] **Step 3: Add the field and the lookups**

In `src/board.ts`, extend the type:

```ts
export type Card = {
  id: string;
  title: string;
  notes: string;
  priority: Priority;
  // The id of the card this one belongs to, or null. This single field is the whole relation: a
  // parent keeps no list of its children, because two halves that have to agree eventually will not.
  parent: string | null;
};
```

`addCard` builds a card literal — give it `parent: null` so it compiles:

```ts
const cards = [...board.columns[selection.column].cards, { id, title, notes: '', priority: DEFAULT_PRIORITY, parent: null }];
```

Append the lookups at the end of the file:

```ts
// Every card on the board, columns left to right and rows top to bottom. That order is what children
// are read in, so a subtask's place in the list is the place you already put it with Shift+Up.
function allCards(board: Board): Card[] {
  return board.columns.flatMap((column) => column.cards);
}

export function childrenOf(board: Board, id: string): Card[] {
  return allCards(board).filter((card) => card.parent === id);
}

// Depth first, so a child is followed by its own children rather than by its next sibling. This is the
// order a card's family is deleted in and the order the detail dialog would show a deep tree in.
export function descendantsOf(board: Board, id: string): Card[] {
  return childrenOf(board, id).flatMap((child) => [child, ...descendantsOf(board, child.id)]);
}

// Asked before Tab attaches a card, because making a card the child of its own descendant is a ring,
// and a ring makes descendantsOf recurse until the stack runs out.
export function isDescendantOf(board: Board, id: string, ancestorId: string): boolean {
  return descendantsOf(board, ancestorId).some((card) => card.id === id);
}

// The column index of each child, in the order childrenOf reads them. The bar on a parent card is
// drawn from this: position, not column name, decides the colour.
export function childColumns(board: Board, id: string): number[] {
  return board.columns
    .flatMap((column, index) => column.cards.map((card) => ({ card, index })))
    .filter((entry) => entry.card.parent === id)
    .map((entry) => entry.index);
}
```

`childColumns` cannot reuse `childrenOf` without a second lookup per child, so it repeats the filter with the index in hand. Two short passes read better than a lookup inside a map.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npm test -- board.test.ts`
Expected: PASS.

Then run the whole suite: `npm test`
Expected: `board-state.test.ts` and `board-store.test.ts` may fail to typecheck where they build card literals without `parent`. Add `parent: null` to any card literal in those files. Do not change what those tests assert.

- [ ] **Step 5: Check types and lint**

Run: `npx tsc --noEmit && npx eslint .`
Expected: both clean.

- [ ] **Step 6: Commit**

```bash
git add src/board.ts src/board.test.ts src/board-state.test.ts src/board-store.test.ts
git commit -m "board: give a card a parent id, and read children back from it"
```

---

### Task 2: Attaching and detaching

`Tab` and `Shift+Tab` as board operations. Still no keys wired up — that is Task 5.

**Files:**
- Modify: `src/board.ts`
- Modify: `src/board.test.ts`

**Interfaces:**
- Consumes: `isDescendantOf`, `Change`, `Selection` from Task 1.
- Produces:
  - `export function attachToCardAbove(board: Board, selection: Selection): Change`
  - `export function detachCard(board: Board, selection: Selection): Change`

- [ ] **Step 1: Write the failing tests**

Add `attachToCardAbove` and `detachCard` to the imports in `src/board.test.ts`, and a helper that reads parents back:

```ts
function parents(result: Board): Record<string, string | null> {
  return Object.fromEntries(result.columns.flatMap((column) => column.cards.map((card) => [card.id, card.parent])));
}
```

Then:

```ts
describe('attachToCardAbove', () => {
  it('makes the selected card a child of the card directly above it', () => {
    const result = attachToCardAbove(board(['a', 'b']), { column: 0, card: 1 });
    expect(parents(result.board).b).toBe('a');
    expect(result.selection).toEqual({ column: 0, card: 1 });
  });

  it('does nothing on the top card of a column', () => {
    const start = board(['a', 'b']);
    expect(attachToCardAbove(start, { column: 0, card: 0 }).board).toBe(start);
  });

  it('does nothing in an empty column', () => {
    const start = board(['a'], []);
    expect(attachToCardAbove(start, { column: 1, card: 0 }).board).toBe(start);
  });

  // a is b's parent, and b sits above a. Attaching a to b would make each the other's ancestor, and
  // descendantsOf would then never finish.
  it('refuses to attach a card to its own descendant', () => {
    const start = withParents(board(['b', 'a']), { b: 'a' });
    expect(attachToCardAbove(start, { column: 0, card: 1 }).board).toBe(start);
  });

  it('moves a card that already has a parent to the new one', () => {
    const start = withParents(board(['a', 'b', 'c']), { c: 'a' });
    expect(parents(attachToCardAbove(start, { column: 0, card: 2 }).board).c).toBe('b');
  });
});

describe('detachCard', () => {
  it('clears the parent and leaves the card where it is', () => {
    const start = withParents(board(['a', 'b']), { b: 'a' });
    const result = detachCard(start, { column: 0, card: 1 });
    expect(parents(result.board).b).toBe(null);
    expect(titles(result.board)).toEqual([['a', 'b']]);
  });

  it('does nothing to a card that has no parent', () => {
    const start = board(['a', 'b']);
    expect(detachCard(start, { column: 0, card: 1 }).board).toBe(start);
  });

  it('does nothing in an empty column', () => {
    const start = board(['a'], []);
    expect(detachCard(start, { column: 1, card: 0 }).board).toBe(start);
  });

  // The children of a detached card follow it: they point at its id, which has not changed.
  it('leaves the detached card its own children', () => {
    const start = withParents(board(['a', 'b', 'c']), { b: 'a', c: 'b' });
    expect(parents(detachCard(start, { column: 0, card: 1 }).board).c).toBe('b');
  });
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npm test -- board.test.ts`
Expected: FAIL — `attachToCardAbove` is not exported from `./board`.

- [ ] **Step 3: Write the operations**

In `src/board.ts`, after `cyclePriority`:

```ts
// Tab. The card above in the same column becomes this card's parent — there is no separate "pick a
// parent" step, because the card you want is nearly always the one you just typed above it.
//
// Three things hand back the same board, which is how a no-op stays out of the undo step: nothing
// selected, nothing above, and an attachment that would make a ring. The ring case is the one that
// matters — a card that is its own ancestor makes descendantsOf recurse forever.
export function attachToCardAbove(board: Board, selection: Selection): Change {
  const card = cardAt(board, selection);
  const above = board.columns[selection.column]?.cards[selection.card - 1];
  if (!card || !above) return { board, selection };
  if (above.id === card.parent) return { board, selection };
  if (isDescendantOf(board, above.id, card.id)) return { board, selection };
  return editCard(board, selection, { parent: above.id });
}

// Shift+Tab. The card keeps its own children: they point at its id, and nothing about that changed.
export function detachCard(board: Board, selection: Selection): Change {
  const card = cardAt(board, selection);
  if (!card || card.parent === null) return { board, selection };
  return editCard(board, selection, { parent: null });
}
```

`editCard` is already in the file and already takes a `Partial<Card>`, so `parent` needs no new plumbing. `isDescendantOf` and `descendantsOf` are defined further down the file; function declarations hoist, so the order is fine.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npm test -- board.test.ts`
Expected: PASS.

- [ ] **Step 5: Check types and lint**

Run: `npx tsc --noEmit && npx eslint .`
Expected: both clean.

- [ ] **Step 6: Commit**

```bash
git add src/board.ts src/board.test.ts
git commit -m "board: attach a card to the one above it, and cut it loose again"
```

---

### Task 3: Deleting a card takes its family

Replaces what `d` does at the model level. The confirmation dialog is Task 6; this task changes the operation only.

**Files:**
- Modify: `src/board.ts`
- Modify: `src/board.test.ts`
- Modify: `src/board-view.ts`

**Interfaces:**
- Consumes: `descendantsOf` from Task 1.
- Produces: `export function deleteCardAndDescendants(board: Board, selection: Selection): Change`

`deleteCard` stays exported and unchanged — `board-state.ts` calls it to drop a card whose title was left blank, and that card can never have children yet.

- [ ] **Step 1: Write the failing tests**

```ts
describe('deleteCardAndDescendants', () => {
  it('takes children in other columns with it', () => {
    const start = withParents(board(['a', 'z'], ['b'], ['c']), { b: 'a', c: 'b' });
    const result = deleteCardAndDescendants(start, { column: 0, card: 0 });
    expect(titles(result.board)).toEqual([['z'], [], []]);
  });

  it('leaves a sibling alone', () => {
    const start = withParents(board(['a', 'b'], ['c']), { c: 'a' });
    const result = deleteCardAndDescendants(start, { column: 0, card: 1 });
    expect(titles(result.board)).toEqual([['a'], ['c']]);
  });

  it('leaves the parent of the deleted card alone', () => {
    const start = withParents(board(['a', 'b']), { b: 'a' });
    expect(titles(deleteCardAndDescendants(start, { column: 0, card: 1 }).board)).toEqual([['a']]);
  });

  it('puts the selection on the card that took its place', () => {
    const result = deleteCardAndDescendants(board(['a', 'b', 'c']), { column: 0, card: 1 });
    expect(result.selection).toEqual({ column: 0, card: 1 });
  });

  it('clamps the selection when the last card of a column goes', () => {
    const result = deleteCardAndDescendants(board(['a', 'b']), { column: 0, card: 1 });
    expect(result.selection).toEqual({ column: 0, card: 0 });
  });

  it('does nothing in an empty column', () => {
    const start = board(['a'], []);
    expect(deleteCardAndDescendants(start, { column: 1, card: 0 }).board).toBe(start);
  });
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npm test -- board.test.ts`
Expected: FAIL — `deleteCardAndDescendants` is not exported from `./board`.

- [ ] **Step 3: Write the operation**

In `src/board.ts`, after `deleteCard`:

```ts
// What `d` does. The descendants are spread across every column, so this rebuilds the whole board
// rather than one column, and it is one Change so `u` brings the whole family back in one press.
export function deleteCardAndDescendants(board: Board, selection: Selection): Change {
  const card = cardAt(board, selection);
  if (!card) return { board, selection };
  const doomed = new Set([card.id, ...descendantsOf(board, card.id).map((entry) => entry.id)]);
  const columns = board.columns.map((column) => ({
    ...column,
    cards: column.cards.filter((entry) => !doomed.has(entry.id)),
  }));
  const remaining = columns[selection.column].cards.length;
  return {
    board: withColumns(board, columns),
    selection: { column: selection.column, card: clamp(selection.card, Math.max(0, remaining - 1)) },
  };
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npm test -- board.test.ts`
Expected: PASS.

- [ ] **Step 5: Point the `d` key at it**

In `src/board-view.ts`, swap the import of `deleteCard` for `deleteCardAndDescendants`, and change the `d` case:

```ts
      case 'd':
        event.preventDefault();
        return change(deleteCardAndDescendants(state.board, state.selection));
```

- [ ] **Step 6: Run everything**

Run: `npm test && npx tsc --noEmit && npx eslint .`
Expected: all clean.

- [ ] **Step 7: Commit**

```bash
git add src/board.ts src/board.test.ts src/board-view.ts
git commit -m "board: deleting a card deletes its subtasks too"
```

---

### Task 4: The file keeps the relation, and repairs a broken one

**Files:**
- Modify: `src/board-store.ts`
- Modify: `src/board-store.test.ts`
- Modify: `.dashboard/CLAUDE.md`

**Interfaces:**
- Consumes: `Card` with `parent` from Task 1.
- Produces: `parseBoard` reads and repairs `parent`. `writeBoard` needs no change — it serialises whatever is on the card.

- [ ] **Step 1: Write the failing tests**

In `src/board-store.test.ts`, the existing "reads a well-formed board" test asserts a whole card object and will fail once `parent` exists — that is the point. Update it and add the repair cases:

```ts
  it('reads a well-formed board', () => {
    const board = parseBoard('{"columns":[{"name":"Later","cards":[{"id":"1","title":"a","notes":"n"}]}]}');
    expect(board.columns)
      .toEqual([{ name: 'Later', cards: [{ id: '1', title: 'a', notes: 'n', priority: 'medium', parent: null }] }]);
  });

  it('keeps a parent that names a card on the board', () => {
    const board = parseBoard('{"columns":[{"name":"Todo","cards":['
      + '{"id":"1","title":"a"},{"id":"2","title":"b","parent":"1"}]}]}');
    expect(board.columns[0].cards.map((card) => card.parent)).toEqual([null, '1']);
  });

  // A board written before subtasks existed. Every card is top-level, which is what it is.
  it('reads a card with no parent field as top-level', () => {
    const board = parseBoard('{"columns":[{"name":"Todo","cards":[{"id":"1","title":"a"}]}]}');
    expect(board.columns[0].cards[0].parent).toBe(null);
  });

  // The parent was deleted by hand, or the id was mistyped. Losing one relationship is the right
  // price; throwing would cost the whole board, which readBoard would then move aside.
  it('drops a parent that names no card', () => {
    const board = parseBoard('{"columns":[{"name":"Todo","cards":[{"id":"1","title":"a","parent":"nobody"}]}]}');
    expect(board.columns[0].cards[0].parent).toBe(null);
  });

  it('drops a parent that is not a string', () => {
    const board = parseBoard('{"columns":[{"name":"Todo","cards":[{"id":"1","title":"a","parent":7}]}]}');
    expect(board.columns[0].cards[0].parent).toBe(null);
  });

  it('refuses to let a card be its own parent', () => {
    const board = parseBoard('{"columns":[{"name":"Todo","cards":[{"id":"1","title":"a","parent":"1"}]}]}');
    expect(board.columns[0].cards[0].parent).toBe(null);
  });

  // Without this, drawing the board or counting a card's children recurses until the stack runs out.
  it('breaks a ring of parents', () => {
    const board = parseBoard('{"columns":[{"name":"Todo","cards":['
      + '{"id":"1","title":"a","parent":"2"},{"id":"2","title":"b","parent":"3"},'
      + '{"id":"3","title":"c","parent":"1"}]}]}');
    const parents = board.columns[0].cards.map((card) => card.parent);
    expect(parents.filter((parent) => parent === null)).toHaveLength(1);
    expect(parents).not.toContain(undefined);
  });
```

And one round-trip test, next to the existing `writeBoard` tests:

```ts
  it('keeps a parent through a write and a read', () => {
    const path = project();
    writeBoard(path, { columns: [{ name: 'Todo', cards: [
      { id: '1', title: 'a', notes: '', priority: 'medium', parent: null },
      { id: '2', title: 'b', notes: '', priority: 'medium', parent: '1' },
    ] }] });
    expect(readBoard(path).board.columns[0].cards[1].parent).toBe('1');
  });
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npm test -- board-store.test.ts`
Expected: FAIL — the well-formed board is missing `parent`, and the repairs do not exist.

- [ ] **Step 3: Read `parent`, then repair the board**

In `src/board-store.ts`, add the field to `parseCard`:

```ts
    // Repaired after the whole board is read, not here: whether an id names a real card cannot be
    // known while the cards are still being parsed one at a time.
    parent: typeof value.parent === 'string' ? value.parent : null,
```

Add the repair pass above `parseBoard`:

```ts
// A hand-edited file can say two things the rest of the code cannot survive: a parent naming a card
// that is not there, and a ring where a card is its own ancestor. Both are repaired rather than
// rejected — throwing would send readBoard down the salvage path and cost someone every card over one
// bad id.
//
// ponytail: walks up from each card, O(cards × depth). A board deep enough for that to show is a
// board nobody can read anyway.
function repairParents(columns: Column[]): Column[] {
  const cards = columns.flatMap((column) => column.cards);
  const byId = new Map(cards.map((card) => [card.id, card]));

  function isSafe(card: Card): boolean {
    const seen = new Set<string>([card.id]);
    let parentId = card.parent;
    while (parentId !== null) {
      if (seen.has(parentId)) return false;
      const parent = byId.get(parentId);
      if (parent === undefined) return false;
      seen.add(parentId);
      parentId = parent.parent;
    }
    return true;
  }

  const broken = new Set(cards.filter((card) => !isSafe(card)).map((card) => card.id));
  if (broken.size === 0) return columns;
  return columns.map((column) => ({
    ...column,
    cards: column.cards.map((card) => (broken.has(card.id) ? { ...card, parent: null } : card)),
  }));
}
```

Then use it in `parseBoard`:

```ts
  if (columns.length === 0) throw new Error('No columns');
  return { columns: repairParents(columns) };
```

Note what the ring test asserts: every card in a three-card ring is unsafe by this rule, so all three lose their parent, and the assertion only requires that at least one did and that the ring is gone. Cutting every card in a ring loose is the honest repair — there is no way to tell which of the three edges was the mistake.

Adjust the ring test to match:

```ts
  it('breaks a ring of parents', () => {
    const board = parseBoard('{"columns":[{"name":"Todo","cards":['
      + '{"id":"1","title":"a","parent":"2"},{"id":"2","title":"b","parent":"3"},'
      + '{"id":"3","title":"c","parent":"1"}]}]}');
    expect(board.columns[0].cards.map((card) => card.parent)).toEqual([null, null, null]);
  });
```

A card whose parent is fine but whose *grandparent* is in a ring is also cut loose by `isSafe`, because walking up from it never terminates either. That is correct: it has no reachable root.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npm test -- board-store.test.ts`
Expected: PASS.

- [ ] **Step 5: Update the format documentation**

`EXPLANATION_FOR_AGENTS` in `src/board-store.ts` is pinned against the checked-in `.dashboard/CLAUDE.md` by a test, so both change together. In the sample JSON, add `"parent": null` after `"priority": "high"`, and add these bullets after the `priority` one:

```
- \`parent\` is the \`id\` of another card, or \`null\`. It is the only thing that makes a card a
  subtask: subtasks are ordinary cards that live in whatever column they are in, and a parent keeps
  no list of its children. A \`parent\` naming a card that is not on the board, or a ring of cards
  that are each other's ancestors, is reset to \`null\` when the app reads the file.
```

Then copy the new text into `.dashboard/CLAUDE.md` so the two match exactly. The test that pins them will tell you if they do not.

- [ ] **Step 6: Run everything**

Run: `npm test && npx tsc --noEmit && npx eslint .`
Expected: all clean.

- [ ] **Step 7: Commit**

```bash
git add src/board-store.ts src/board-store.test.ts .dashboard/CLAUDE.md
git commit -m "board: keep a card's parent in the file, and repair a broken one on read"
```

---

### Task 5: The badge, the bar, and the Tab keys

The first task that changes the screen. There are no DOM tests in this codebase, so this task is verified by the type checker, the linter, and a described manual check the reviewer runs.

**Files:**
- Modify: `src/board-view.ts`
- Modify: `src/index.css`
- Modify: `src/help.ts`

**Interfaces:**
- Consumes: `attachToCardAbove`, `detachCard`, `childColumns`, `childrenOf`, `isDescendantOf` from Tasks 1–2.
- Produces: nothing other tasks depend on.

- [ ] **Step 1: Draw the badge and the bar**

In `src/board-view.ts`, `renderCard(card, selected)` currently builds the title and optionally the notes. It needs the board to look a card's family up, which it already closes over as `state.board`.

Above the title, when the card has a parent that is on the board:

```ts
    // Which piece of work this card belongs to. Invisible from the column otherwise: a subtask is an
    // ordinary card sitting in an ordinary column, and nothing else on it says so.
    const parent = card.parent === null ? undefined : cardById(card.parent);
    if (parent) {
      const badge = document.createElement('p');
      badge.className = 'board-parent';
      badge.textContent = parent.title;
      item.append(badge);
    }
```

`cardById` is a helper to add near the top of `createBoardView`:

```ts
  function cardById(id: string): Card | undefined {
    return state.board.columns.flatMap((column) => column.cards).find((card) => card.id === id);
  }
```

Below the notes, when the card has children:

```ts
    // One segment per child, coloured by the column it is in: the last column is finished, the first
    // has not been started, everything between is under way. Position rather than name, so renaming a
    // column does not change what the bar says.
    const columns = childColumns(state.board, card.id);
    if (columns.length > 0) {
      const last = state.board.columns.length - 1;
      const bar = document.createElement('p');
      bar.className = 'board-progress';
      for (const columnIndex of columns) {
        const segment = document.createElement('span');
        segment.className = columnIndex === last ? 'done' : columnIndex === 0 ? 'waiting' : 'underway';
        bar.append(segment);
      }
      const count = document.createElement('span');
      count.className = 'board-progress-count';
      count.textContent = `${columns.filter((columnIndex) => columnIndex === last).length}/${columns.length}`;
      bar.append(count);
      item.append(bar);
    }
```

- [ ] **Step 2: Style them**

In `src/index.css`, after the `.board-notes` rules:

```css
.board-parent {
  margin: 0 0 4px;
  font-size: 11px;
  opacity: 0.55;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.board-progress {
  display: flex;
  gap: 2px;
  align-items: center;
  margin: 6px 0 0;
}

.board-progress span {
  height: 4px;
  flex: 1;
  border-radius: 2px;
  background: rgb(255 255 255 / 12%);
}

.board-progress span.underway {
  background: #d0a215;
}

.board-progress span.done {
  background: #3fa45b;
}

.board-progress-count {
  flex: 0 0 auto;
  height: auto;
  margin-left: 4px;
  font-size: 11px;
  opacity: 0.55;
  background: none;
}
```

`.board-progress-count` is a `span` inside `.board-progress`, so it inherits the segment rule and has to undo the parts of it that do not apply. Keep the two rules next to each other so that stays obvious.

- [ ] **Step 3: Wire up Tab and Shift+Tab**

In `src/board-view.ts`, the keydown handler returns early for any event with a modifier held, after the arrow block. `Shift+Tab` has to be caught before that check. Put both cases immediately after the arrow-direction block:

```ts
    if (event.key === 'Tab') {
      event.preventDefault();
      if (event.shiftKey) return change(detachCard(state.board, state.selection));
      const above = state.board.columns[state.selection.column]?.cards[state.selection.card - 1];
      const card = cardAt(state.board, state.selection);
      // The one refusal worth explaining. The others — no card above, nothing selected — are obvious
      // from the screen, and a message for those would be noise.
      if (card && above && isDescendantOf(state.board, above.id, card.id)) {
        options.onError(`"${above.title}" is already a subtask of this card`);
        return;
      }
      return change(attachToCardAbove(state.board, state.selection));
    }
```

`Tab` would otherwise move browser focus off the board, which is why `preventDefault` runs on both branches.

- [ ] **Step 4: Update the help dialog**

In `src/help.ts`, add to `BOARD_SHORTCUTS`, after the `Shift+Arrows` row:

```ts
  { keys: 'Tab', action: 'Make this card a subtask of the one above' },
  { keys: 'Shift+Tab', action: 'Cut this card loose from its parent' },
```

And extend the board blurb so it says what a subtask is, not just which keys exist:

```ts
  board: 'A kanban board kept in .dashboard/board.json inside the project. Every change is written '
    + 'straight to disk, so there is no save key and u is the only way back. The file is re-read each '
    + 'time you enter the board, not while you are looking at it. A card can be a subtask of another '
    + 'card: it stays an ordinary card in whatever column you put it in, shows a badge naming its '
    + 'parent, and counts towards the bar on that parent.',
```

- [ ] **Step 5: Run the checks**

Run: `npm test && npx tsc --noEmit && npx eslint .`
Expected: all clean. `help.test.ts` does not pin the board rows by exact list, so adding rows does not break it.

- [ ] **Step 6: Manual check**

Build into `out/` only — **do not** package into `/Applications`, and **do not** quit or restart the running app.

Run: `npm start` if that is safe in this environment; otherwise describe the check for the reviewer to run themselves. What to look for:

- Two cards in a column. Select the lower one, press `Tab`. It gains a badge naming the upper one, and the upper one gains a bar with one empty segment and `0/1`.
- Move the subtask to the last column with `Shift+Right`. The parent's bar segment turns green and reads `1/1`.
- `Shift+Tab` on the subtask. The badge and the parent's bar both go.
- `u` after each of those puts it back.

- [ ] **Step 7: Commit**

```bash
git add src/board-view.ts src/index.css src/help.ts
git commit -m "board: show a card's parent and how far its subtasks have got"
```

---

### Task 6: `d` asks first

**Files:**
- Modify: `src/overlay.ts`
- Modify: `src/board-view.ts`
- Modify: `src/renderer.ts`
- Modify: `src/index.css`
- Modify: `src/help.ts`

**Interfaces:**
- Consumes: `descendantsOf`, `deleteCardAndDescendants` from Tasks 1 and 3.
- Produces: `export function confirmOverlay(message: string): Promise<boolean>` in `src/overlay.ts`.

- [ ] **Step 1: Write the confirmation**

In `src/overlay.ts`, below `openOverlay`:

```ts
// The third thing built on the sheet, after the picker and the help dialog. Enter confirms, Escape
// cancels, and clicking the dark margin cancels — a dialog that appears under your hand must not
// treat a stray click as yes.
export function confirmOverlay(message: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    function close(answer: boolean): void {
      remove();
      resolve(answer);
    }

    const { dialog, remove } = openOverlay('confirm', () => close(false));
    dialog.tabIndex = -1;

    const question = document.createElement('p');
    question.className = 'confirm-question';
    question.textContent = message;
    const keys = document.createElement('p');
    keys.className = 'confirm-keys';
    keys.textContent = 'Enter deletes. Escape keeps it.';
    dialog.append(question, keys);
    dialog.focus();

    dialog.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== 'Escape') return;
      event.preventDefault();
      close(event.key === 'Enter');
    });
  });
}
```

- [ ] **Step 2: Ask before deleting**

In `src/board-view.ts`, replace the `d` case:

```ts
      case 'd':
        event.preventDefault();
        return confirmDelete();
```

and add the function inside `createBoardView`:

```ts
  // The count is descendants, not direct children, because that is how many cards vanish — and most
  // of them are in columns you are not looking at. A leaf card gets the same dialog without the
  // second clause: one key that always behaves the same way is worth more than a saved keystroke.
  function confirmDelete(): void {
    const card = cardAt(state.board, state.selection);
    if (!card) return;
    const family = descendantsOf(state.board, card.id).length;
    const question = family === 0
      ? `Delete "${card.title}"?`
      : `Delete "${card.title}" and its ${family} subtask${family === 1 ? '' : 's'}?`;
    confirmOverlay(question).then((confirmed) => {
      element.focus();
      if (confirmed) change(deleteCardAndDescendants(state.board, state.selection));
    });
  }
```

`element.focus()` runs either way: the board took the keyboard from the dialog, and without this the next keystroke lands nowhere.

- [ ] **Step 3: Keep the global handler out of the dialog**

In `src/renderer.ts`, the capture-phase listener ignores keys typed inside the picker, the help dialog and a card editor. Add the confirmation:

```ts
  if (event.target instanceof Element && event.target.closest('.picker, .help, .confirm, .board-edit')) return;
```

Update the comment above it to name four things rather than three.

- [ ] **Step 4: Style it**

In `src/index.css`, add `.confirm` to the `.picker, .help` selector that paints the sheet, and `.confirm-dialog` to the `.picker-dialog, .help-dialog` selector that boxes it. Then:

```css
.confirm-dialog {
  max-width: 420px;
  padding: 20px 24px;
}

.confirm-question {
  margin: 0 0 12px;
  font-size: 14px;
}

.confirm-keys {
  margin: 0;
  font-size: 12px;
  opacity: 0.6;
}
```

- [ ] **Step 5: Update the help dialog**

In `src/help.ts`, change the `d` row:

```ts
  { keys: 'd', action: 'Delete the card and its subtasks, after a confirmation' },
```

- [ ] **Step 6: Run the checks**

Run: `npm test && npx tsc --noEmit && npx eslint .`
Expected: all clean.

- [ ] **Step 7: Manual check**

- `d` on a card with no subtasks asks `Delete "…"?`; Escape leaves it, Enter removes it.
- `d` on a parent with two subtasks says `and its 2 subtasks`, and Enter removes all three across whatever columns they are in.
- `u` afterwards brings the whole family back.
- After either answer, arrow keys still move the selection — focus came back to the board.

- [ ] **Step 8: Commit**

```bash
git add src/overlay.ts src/board-view.ts src/renderer.ts src/index.css src/help.ts
git commit -m "board: ask before deleting a card and everything under it"
```

---

### Task 7: `o` opens a card

The dialog that shows a card's notes, its parent and its children, and adds children.

**Files:**
- Create: `src/board-detail.ts`
- Modify: `src/board.ts`
- Modify: `src/board.test.ts`
- Modify: `src/board-view.ts`
- Modify: `src/renderer.ts`
- Modify: `src/index.css`
- Modify: `src/help.ts`

**Interfaces:**
- Consumes: `childrenOf`, `Change`, `Selection`, `Board`, `Card` from Task 1; `openOverlay` from `src/overlay.ts`.
- Produces:
  - `export function addChildCard(board: Board, selection: Selection, id: string, title: string): Change` in `src/board.ts`
  - `export type CardDetailOptions` and `export function openCardDetail(options: CardDetailOptions): Promise<Selection>` in `src/board-detail.ts`

- [ ] **Step 1: Write the failing test for adding a child**

In `src/board.test.ts`:

```ts
describe('addChildCard', () => {
  it('adds the card to the parent\'s column, at the bottom, pointing at the parent', () => {
    const result = addChildCard(board(['a'], ['x']), { column: 0, card: 0 }, 'new', 'a subtask');
    expect(titles(result.board)).toEqual([['a', 'a subtask'], ['x']]);
    expect(parents(result.board)['new']).toBe('a');
  });

  it('selects the card it added', () => {
    const result = addChildCard(board(['a']), { column: 0, card: 0 }, 'new', 'a subtask');
    expect(result.selection).toEqual({ column: 0, card: 1 });
  });

  it('does nothing in an empty column', () => {
    const start = board(['a'], []);
    expect(addChildCard(start, { column: 1, card: 0 }, 'new', 'a subtask').board).toBe(start);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test -- board.test.ts`
Expected: FAIL — `addChildCard` is not exported from `./board`.

- [ ] **Step 3: Write it**

In `src/board.ts`, after `addCard`:

```ts
// What `n` does inside an open card. The child lands in the parent's column, at the bottom: a
// subtask starts wherever its parent is, and you move it from there like any other card.
export function addChildCard(board: Board, selection: Selection, id: string, title: string): Change {
  const parent = cardAt(board, selection);
  if (!parent) return { board, selection };
  const cards = [...board.columns[selection.column].cards, { id, title, notes: '', priority: DEFAULT_PRIORITY, parent: parent.id }];
  return {
    board: replaceColumn(board, selection.column, cards),
    selection: { column: selection.column, card: cards.length - 1 },
  };
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npm test -- board.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the dialog**

Create `src/board-detail.ts`:

```ts
import { addChildCard, cardAt, childrenOf, type Board, type Change, type Selection } from './board';
import { openOverlay } from './overlay';

export type CardDetailOptions = {
  board: Board;
  // The card to open.
  selection: Selection;
  makeId(): string;
  // Adding a child changes the board, and the board is written to disk on every change everywhere
  // else — so the dialog hands each change straight out rather than batching them until it closes.
  // The board that comes back is the one the dialog keeps drawing from.
  onChange(change: Change): Board;
};

// Resolves with the card to select when the dialog closes: the one you opened, or the child you
// pressed Enter on.
export function openCardDetail(options: CardDetailOptions): Promise<Selection> {
  return new Promise<Selection>((resolve) => {
    let board = options.board;
    // Which child is highlighted, or -1 when the card has none. Not a Selection: these are rows in
    // this list, not positions on the board.
    let highlighted = 0;
    let adding = false;

    function close(selection: Selection): void {
      remove();
      resolve(selection);
    }

    const { dialog, remove } = openOverlay('card-detail', () => close(options.selection));
    dialog.tabIndex = -1;

    function selectionOf(id: string): Selection | null {
      for (const [column, entry] of board.columns.entries()) {
        const card = entry.cards.findIndex((candidate) => candidate.id === id);
        if (card !== -1) return { column, card };
      }
      return null;
    }

    function render(): void {
      const card = cardAt(board, options.selection);
      if (!card) return close(options.selection);
      const children = childrenOf(board, card.id);
      highlighted = Math.max(0, Math.min(highlighted, children.length - 1));

      const heading = document.createElement('h2');
      heading.textContent = card.title;

      const meta = document.createElement('p');
      meta.className = 'card-detail-meta';
      const parent = card.parent === null ? null : board.columns.flatMap((column) => column.cards)
        .find((candidate) => candidate.id === card.parent);
      meta.textContent = parent
        ? `${card.priority} · subtask of ${parent.title}`
        : card.priority;

      const list = document.createElement('ul');
      list.className = 'card-detail-children';
      list.append(...children.map((child, index) => {
        const row = document.createElement('li');
        if (index === highlighted) row.className = 'highlighted';
        const title = document.createElement('span');
        title.className = 'card-detail-child-title';
        title.textContent = child.title;
        const where = document.createElement('span');
        where.className = 'card-detail-child-where';
        const at = selectionOf(child.id);
        where.textContent = at ? `${board.columns[at.column].name} · ${child.priority}` : child.priority;
        row.append(title, where);
        return row;
      }));

      const parts: HTMLElement[] = [heading, meta];
      if (card.notes !== '') {
        const notes = document.createElement('p');
        notes.className = 'card-detail-notes';
        notes.textContent = card.notes;
        parts.push(notes);
      }
      if (children.length === 0 && !adding) {
        const empty = document.createElement('p');
        empty.className = 'card-detail-empty';
        empty.textContent = 'No subtasks yet. n adds one.';
        parts.push(empty);
      } else {
        parts.push(list);
      }
      if (adding) {
        const input = document.createElement('input');
        input.className = 'card-detail-add';
        input.placeholder = 'Subtask title';
        // onkeydown rather than addEventListener, for the same reason board-view.ts uses it: the tag
        // declares it as taking a KeyboardEvent, which the listener overloads do not.
        input.onkeydown = (event) => {
          if (event.key !== 'Enter' && event.key !== 'Escape') return;
          event.preventDefault();
          event.stopPropagation();
          const title = input.value.trim();
          adding = false;
          // An empty title adds nothing, the same way a blank card is dropped on the board.
          if (event.key === 'Enter' && title !== '') {
            board = options.onChange(addChildCard(board, options.selection, options.makeId(), title));
            highlighted = childrenOf(board, cardAt(board, options.selection)?.id ?? '').length - 1;
          }
          render();
          dialog.focus();
        };
        parts.push(input);
      }

      const footer = document.createElement('p');
      footer.className = 'card-detail-footer';
      footer.textContent = 'Arrows walk the subtasks. Enter goes to one. n adds one. Escape closes.';
      parts.push(footer);

      dialog.replaceChildren(...parts);
      if (adding) dialog.querySelector<HTMLInputElement>('.card-detail-add')?.focus();
      else dialog.focus();
    }

    dialog.addEventListener('keydown', (event) => {
      // The input owns every key while a subtask is being named; its own handler ends that.
      if (adding) return;
      const card = cardAt(board, options.selection);
      const children = card ? childrenOf(board, card.id) : [];
      switch (event.key) {
        case 'Escape':
          event.preventDefault();
          return close(options.selection);
        case 'ArrowDown':
          event.preventDefault();
          highlighted = Math.min(highlighted + 1, children.length - 1);
          return render();
        case 'ArrowUp':
          event.preventDefault();
          highlighted = Math.max(highlighted - 1, 0);
          return render();
        case 'Enter': {
          event.preventDefault();
          const child = children[highlighted];
          if (!child) return;
          return close(selectionOf(child.id) ?? options.selection);
        }
        case 'n':
          event.preventDefault();
          adding = true;
          return render();
      }
    });

    render();
  });
}
```

- [ ] **Step 6: Open it from the board**

In `src/board-view.ts`, add the case:

```ts
      case 'o':
        event.preventDefault();
        return openDetail();
```

and the function inside `createBoardView`:

```ts
  // The dialog changes the board as you add subtasks, so each change goes through apply() as it
  // happens — same undo step, same write to disk as a change made on the board itself. It closes on
  // the card you asked for, or on the subtask you pressed Enter on.
  function openDetail(): void {
    if (!cardAt(state.board, state.selection)) return;
    openCardDetail({
      board: state.board,
      selection: state.selection,
      makeId: () => crypto.randomUUID(),
      onChange: (next) => {
        change(next);
        return state.board;
      },
    }).then((selection) => {
      state = { ...state, selection };
      element.focus();
      render();
    });
  }
```

- [ ] **Step 7: Keep the global handler out of the dialog**

In `src/renderer.ts`:

```ts
  if (event.target instanceof Element && event.target.closest('.picker, .help, .confirm, .card-detail, .board-edit')) return;
```

- [ ] **Step 8: Style it**

In `src/index.css`, add `.card-detail` to the sheet selector and `.card-detail-dialog` to the box selector, next to `.confirm` from Task 6. Then:

```css
.card-detail-dialog {
  max-width: 520px;
}

.card-detail-meta,
.card-detail-footer,
.card-detail-empty {
  font-size: 12px;
  opacity: 0.6;
}

.card-detail-notes {
  margin: 12px 0;
  white-space: pre-wrap;
}

.card-detail-children {
  margin: 12px 0;
  padding: 0;
  list-style: none;
}

.card-detail-children li {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 4px 8px;
  border-radius: 4px;
}

.card-detail-children li.highlighted {
  background: rgb(255 255 255 / 10%);
}

.card-detail-child-where {
  flex: 0 0 auto;
  opacity: 0.6;
}

.card-detail-add {
  width: 100%;
  box-sizing: border-box;
  margin: 8px 0;
}
```

Match the surrounding file: if `.picker-search` sets a font, colour and border for its input, give `.card-detail-add` the same treatment rather than inventing a second look.

- [ ] **Step 9: Update the help dialog**

In `src/help.ts`, add to `BOARD_SHORTCUTS`, after the `e` row:

```ts
  { keys: 'o', action: "Open the card: its notes, its parent, its subtasks" },
```

- [ ] **Step 10: Run the checks**

Run: `npm test && npx tsc --noEmit && npx eslint .`
Expected: all clean.

Also check the file did not outgrow the ceiling:

Run: `wc -l src/board-view.ts src/board-detail.ts`
Expected: both well under 600.

- [ ] **Step 11: Manual check**

- `o` on a card with no subtasks says so and offers `n`.
- `n`, type a title, Enter — the subtask appears in the list, and behind the dialog it is at the bottom of the same column with a badge. Press `n` again straight away and add a second.
- Arrows move the highlight; Enter closes the dialog with the board's selection on that subtask, in whatever column it is in.
- Escape closes the dialog with the selection back on the card you opened.
- After closing either way, arrow keys still move the selection on the board.
- `u` undoes the last subtask you added.

- [ ] **Step 12: Commit**

```bash
git add src/board-detail.ts src/board.ts src/board.test.ts src/board-view.ts src/renderer.ts src/index.css src/help.ts
git commit -m "board: open a card to see and add its subtasks"
```

---

### Task 8: Close the loop

The board card that started this, and a last read of the help dialog against what the code now does.

**Files:**
- Modify: `.dashboard/board.json`
- Modify: `src/help.ts` (only if the read below finds something stale)

- [ ] **Step 1: Read Ctrl+H against the code**

Open `src/help.ts` and `src/board-view.ts` side by side. Every key in the board's `switch` and every key handled before it — arrows, `Shift`+arrows, `Tab`, `Shift+Tab`, `Enter`, `e`, `o`, `p`, `s`, `n`, `d`, `u` — must have a row in `BOARD_SHORTCUTS`, and every row must name a key that works. Fix whichever side is wrong.

Read the board blurb again too. It should say what a subtask is, since that is what changed about the screen, not just which keys are new.

- [ ] **Step 2: Move the card**

In `.dashboard/board.json`, move the card titled "Give board cards subtasks" from the Todo column to the Done column, at the top, and rewrite its notes to say what shipped:

```json
{
  "id": "a350c135-4cf6-4e14-a180-d84e487c653f",
  "title": "Give board cards subtasks",
  "notes": "Any card can name another as its parent. A subtask is an ordinary card with its own column, priority and subtasks. Tab attaches, Shift+Tab detaches, o opens a card to see and add its children, and a parent shows a bar of where its subtasks have got to.",
  "priority": "medium",
  "parent": null
}
```

- [ ] **Step 3: Run everything one last time**

Run: `npm test && npx tsc --noEmit && npx eslint .`
Expected: all clean.

- [ ] **Step 4: Commit**

```bash
git add .dashboard/board.json src/help.ts
git commit -m "board: mark subtasks done"
```

- [ ] **Step 5: Say what is left**

The installed Dashboard in `/Applications` is still running the old build. Say that it needs a rebuild and a restart to pick this up, and stop there — do not package, quit, or relaunch anything.
