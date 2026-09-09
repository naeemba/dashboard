import {
  addChildCard,
  cardAt,
  cardById,
  childrenOf,
  flightParts,
  selectionOf,
  type Board,
  type Card,
  type Change,
  type Selection,
} from './board';
import { relativeAge } from './age';
import { clampIndex } from './clamp-index';
import { openOverlay } from './overlay';
import { isModified } from './shortcuts';

export type CardDetailOptions = {
  board: Board;
  // The card to open.
  selection: Selection;
  makeId(): string;
  // Adding a child changes the board, and the board is written to disk on every change everywhere
  // else — so the dialog hands each change straight out rather than batching them until it closes.
  // The board that comes back is the one the dialog keeps drawing from, so this must apply the change
  // and return the result synchronously. Return the board from before the change and the next subtask
  // is built on a board missing this one.
  onChange(change: Change): Board;
};

// The line under the card's title: what it is, what it belongs to, what it is in flight as, and how
// old it is. Exported and pure so the rules in it are pinned by a test — the same reason help.ts
// hands out helpSections rather than only a dialog.
export function cardMeta(board: Board, card: Card, now?: number): string {
  const parent = card.parent === null ? null : cardById(board, card.parent);
  // A card written before timestamps existed has none, and a hand-written date the clock cannot read
  // says nothing rather than "Invalid Date". Both come back null and drop out of the line.
  const added = card.createdAt === undefined ? null : relativeAge(card.createdAt, now);
  const edited = card.updatedAt === undefined ? null : relativeAge(card.updatedAt, now);
  return [
    card.priority,
    parent ? `subtask of ${parent.title}` : null,
    ...flightParts(card),
    added === null ? null : `added ${added}`,
    // The words, not the stamps: a card is stamped when `n` makes it and again when you finish
    // typing its title, so no card ever carries two equal stamps to compare.
    edited === null || edited === added ? null : `edited ${edited}`,
  ].filter((part): part is string => part !== null).join(' · ');
}

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

    function render(): void {
      const card = cardAt(board, options.selection);
      if (!card) return close(options.selection);
      const children = childrenOf(board, card.id);
      highlighted = clampIndex(highlighted, children.length - 1);

      const heading = document.createElement('h2');
      heading.textContent = card.title;

      const meta = document.createElement('p');
      meta.className = 'card-detail-meta';
      meta.textContent = cardMeta(board, card);

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
        const at = selectionOf(board, child.id);
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
        // A subtask titled in Persian turns the box round as you type.
        input.dir = 'auto';
        // onkeydown rather than addEventListener, for the same reason board-view.ts uses it: the tag
        // declares it as taking a KeyboardEvent, which the listener overloads do not.
        input.onkeydown = (event) => {
          if (isModified(event)) return;
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
      // Nothing else claims a modified key here: renderer.ts hands every key typed inside
      // .card-detail to this dialog, so without this Ctrl+N opens the subtask box instead of nvim.
      if (isModified(event)) return;
      const card = cardAt(board, options.selection);
      const children = card ? childrenOf(board, card.id) : [];
      switch (event.key) {
        case 'Escape':
          event.preventDefault();
          return close(options.selection);
        case 'ArrowDown':
          event.preventDefault();
          highlighted = clampIndex(highlighted + 1, children.length - 1);
          return render();
        case 'ArrowUp':
          event.preventDefault();
          highlighted = clampIndex(highlighted - 1, children.length - 1);
          return render();
        case 'Enter': {
          event.preventDefault();
          const child = children[highlighted];
          if (!child) return;
          return close(selectionOf(board, child.id) ?? options.selection);
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
