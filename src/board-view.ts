import {
  addCard,
  deleteCard,
  emptyBoard,
  moveCard,
  moveSelection,
  renameCard,
  type Board,
  type Change,
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

  function change(next: Change): void {
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
      const read = await options.bridge.readBoard(options.projectPath);
      board = read.board;
      previous = null;
      editing = false;
      selection = { column: Math.min(selection.column, board.columns.length - 1), card: 0 };
      render();
      element.focus();
      // The old file is still on disk under this name, so the cards are not gone — just not shown.
      if (read.brokenFile) options.onError(`Board file was damaged; kept as ${read.brokenFile}`);
    },
    columnName(): string {
      return board.columns[selection.column]?.name ?? '';
    },
  };
}
