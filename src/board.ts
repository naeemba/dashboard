import type { Direction } from './terminals';

// Highest first: this is the order `p` cycles through, and the order a sorted column ends up in.
export const PRIORITIES = ['urgent', 'high', 'medium', 'low'] as const;
export type Priority = typeof PRIORITIES[number];
// What a new card gets. Every card has one rather than an optional none, so a column can always be
// sorted and a card always draws its colour.
export const DEFAULT_PRIORITY: Priority = 'medium';

export type Card = {
  id: string;
  title: string;
  notes: string;
  priority: Priority;
  // The id of the card this one belongs to, or null. This single field is the whole relation: a
  // parent keeps no list of its children, because two halves that have to agree eventually will not.
  parent: string | null;
};
export type Column = { name: string; cards: Card[] };
export type Board = { columns: Column[] };

// Where the keyboard is. An empty column still selects row zero, so every operation has to cope with
// a selection pointing at a card that is not there.
export type Selection = { column: number; card: number };

// Every operation answers with both, because a card that moves takes the selection with it.
export type Change = { board: Board; selection: Selection };

// An empty column still selects row zero, so this is undefined as often as not. Everything that reads
// the selected card goes through here rather than spelling the two lookups out again.
export function cardAt(board: Board, selection: Selection): Card | undefined {
  return board.columns[selection.column]?.cards[selection.card];
}

// The two ways to reach a card by id, kept next to cardAt because they are its inverse: cardAt asks
// where, these ask who and where-is. A subtask names its parent by id and can sit in any column, so
// nothing that draws or opens one can assume it knows the column already.
export function cardById(board: Board, id: string): Card | undefined {
  return allCards(board).find((card) => card.id === id);
}

export function selectionOf(board: Board, id: string): Selection | null {
  for (const [column, entry] of board.columns.entries()) {
    const card = entry.cards.findIndex((candidate) => candidate.id === id);
    if (card !== -1) return { column, card };
  }
  return null;
}

const DEFAULT_COLUMNS = ['Todo', 'Doing', 'Done'];

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
  const cards = [...board.columns[selection.column].cards, { id, title, notes: '', priority: DEFAULT_PRIORITY, parent: null }];
  return {
    board: replaceColumn(board, selection.column, cards),
    selection: { column: selection.column, card: cards.length - 1 },
  };
}

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

// Rename, notes and priority all change one field of the selected card and leave the selection where
// it is, so they are one operation with the field passed in.
function editCard(board: Board, selection: Selection, fields: Partial<Card>): Change {
  const cards = board.columns[selection.column].cards;
  if (cards.length === 0) return { board, selection };
  return {
    board: replaceColumn(board, selection.column, cards.map((card, at) => (at === selection.card ? { ...card, ...fields } : card))),
    selection,
  };
}

export function renameCard(board: Board, selection: Selection, title: string): Change {
  return editCard(board, selection, { title });
}

export function setNotes(board: Board, selection: Selection, notes: string): Change {
  return editCard(board, selection, { notes });
}

// Cycles rather than sets, so one key reaches all four. Wraps from the bottom back to the top.
export function cyclePriority(board: Board, selection: Selection): Change {
  const card = cardAt(board, selection);
  if (!card) return { board, selection };
  const next = PRIORITIES[(PRIORITIES.indexOf(card.priority) + 1) % PRIORITIES.length];
  return editCard(board, selection, { priority: next });
}

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
  if (attachmentRing(board, selection)) return { board, selection };
  return editCard(board, selection, { parent: above.id });
}

// The card above, when attaching to it would make a ring, and null when Tab would go through. The
// view prints a message about this one refusal and attachToCardAbove acts on it, so both ask here
// rather than each re-deriving the test: a message decided apart from the refusal drifts from it.
export function attachmentRing(board: Board, selection: Selection): Card | null {
  const card = cardAt(board, selection);
  const above = board.columns[selection.column]?.cards[selection.card - 1];
  if (!card || !above) return null;
  return isDescendantOf(board, above.id, card.id) ? above : null;
}

// Whether blanking this card's title would strand a family. commitTitle refuses on it and the view
// says why on it, for the same reason attachmentRing exists.
export function hasSubtasks(board: Board, selection: Selection): boolean {
  const card = cardAt(board, selection);
  return card !== undefined && childrenOf(board, card.id).length > 0;
}

// Shift+Tab. The card keeps its own children: they point at its id, and nothing about that changed.
export function detachCard(board: Board, selection: Selection): Change {
  const card = cardAt(board, selection);
  if (!card || card.parent === null) return { board, selection };
  return editCard(board, selection, { parent: null });
}

// Sorts the selected column, urgent first. Stable, so cards of equal priority keep the order you put
// them in with Shift+up and Shift+down — sorting is a thing you ask for, not a rule the column enforces.
// A column already in order hands back the same board, which is what keeps the undo step and the file
// alone when the key changed nothing.
export function sortColumn(board: Board, selection: Selection): Change {
  const cards = board.columns[selection.column].cards;
  if (cards.length === 0) return { board, selection };
  const rank = (card: Card): number => PRIORITIES.indexOf(card.priority);
  const sorted = [...cards].sort((left, right) => rank(left) - rank(right));
  if (sorted.every((card, at) => card === cards[at])) return { board, selection };
  const selected = cards[selection.card];
  return {
    board: replaceColumn(board, selection.column, sorted),
    // The selection follows the card it was on rather than the row, so sorting never moves your cursor
    // onto someone else's card.
    selection: { column: selection.column, card: Math.max(0, sorted.indexOf(selected)) },
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
  // Cards above the selected one can be descendants too, and those shift everything below them up.
  // Counting the survivors above is the only reading of "where the cursor was" that survives that.
  const survivorsAbove = board.columns[selection.column].cards
    .slice(0, selection.card)
    .filter((entry) => !doomed.has(entry.id)).length;
  const remaining = columns[selection.column].cards.length;
  return {
    board: withColumns(board, columns),
    selection: { column: selection.column, card: clamp(survivorsAbove, Math.max(0, remaining - 1)) },
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

// Every card on the board, columns left to right and rows top to bottom. That order is what children
// are read in, so a subtask's place in the list is the place you already put it with Shift+Up.
export function allCards(board: Board): Card[] {
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
