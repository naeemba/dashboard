import type { Board } from './board';
import { filterSummary, isFilterActive, type BoardFilter } from './board-filter';
import { icon, iconButton } from './icons';

// The two controls the board draws around its cards: the strip over the columns saying what the
// filter keeps, and the sort button on each column's heading. DOM only; the view decides what they do.

// Says the board is narrowed and by what, with the way back. Hidden while every card is shown.
export function filterBar(filter: BoardFilter, visible: number[][], board: Board, onReset: () => void): HTMLElement {
  const bar = document.createElement('div');
  bar.className = 'board-filter-bar';
  bar.hidden = !isFilterActive(filter);
  const shown = visible.reduce((sum, rows) => sum + rows.length, 0);
  const total = board.columns.reduce((sum, column) => sum + column.cards.length, 0);
  const summary = document.createElement('span');
  summary.className = 'board-filter-summary';
  summary.textContent = filterSummary(filter);
  const count = document.createElement('span');
  count.className = 'board-filter-count';
  count.textContent = `${shown} of ${total} cards`;
  bar.append(icon('filter'), summary, count, iconButton('board-filter-reset', 'reset', 'Reset', onReset));
  return bar;
}

export function sortButton(onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'board-sort';
  button.title = 'Sort by priority, urgent first';
  button.append(icon('sort'));
  button.addEventListener('click', onClick);
  return button;
}
