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
    // A row in the children list, not a Selection — these are positions in this list, not on the
    // board. Clamped into range on every render, so it reads as 0 on a card with no children.
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
            const id = options.makeId();
            board = options.onChange(addChildCard(board, options.selection, id, title));
            // childrenOf orders by column, not by when a card was added, and addChildCard puts the new
            // card in the parent's column rather than at the end of this list — so the new card's row
            // has to be found by id, the same as any other lookup here, clamped rather than trusted.
            const newRow = childrenOf(board, cardAt(board, options.selection)?.id ?? '')
              .findIndex((child) => child.id === id);
            highlighted = Math.max(0, newRow);
          }
          render();
          dialog.focus();
        };
        // Clicking away from the input leaves it blurred with the dialog focused. Without this the
        // dialog would still think a subtask was being named, and every key after that does nothing.
        input.onblur = () => {
          if (!adding) return;
          adding = false;
          render();
        };
        parts.push(input);
      }

      const footer = document.createElement('p');
      footer.className = 'card-detail-footer';
      footer.textContent = 'Arrows walk the subtasks. Enter goes to one. n adds one. Escape closes.';
      parts.push(footer);

      dialog.replaceChildren(...parts);
      list.children[highlighted]?.scrollIntoView({ block: 'nearest' });
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
