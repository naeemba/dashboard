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
