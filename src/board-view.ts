import {
  cardAt,
  cyclePriority,
  deleteCardAndDescendants,
  moveCard,
  moveSelection,
  sortColumn,
  type Card,
  type Change,
} from './board';
import {
  addBlankCard,
  applyChange,
  commitNotes,
  commitTitle,
  initialBoardState,
  loadBoard,
  undoChange,
  type BoardState,
} from './board-state';
import type { DashboardBridge } from './bridge';
import type { Direction } from './terminals';

export type BoardOptions = {
  projectPath: string;
  bridge: DashboardBridge;
  // The status bar names the column the selection is in and the priority of the card it is on, so it
  // is redrawn whenever either can change.
  onChanged(): void;
  // The empty string clears this board's last message — a board that reads cleanly, or a write that
  // lands, must not leave its own previous failure sitting on screen. Another producer's message is
  // not this board's to clear, which the renderer enforces.
  onError(message: string): void;
};

export type BoardView = {
  element: HTMLElement;
  open(): Promise<void>;
  // What the status bar says about the board: the column the selection is in, and the priority of the
  // card it is on. The colour down a card's edge is the fast read; this is the one that names it.
  statusLabel(): string;
};

const ARROW_DIRECTIONS: Record<string, Direction> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
};

type EditableField = 'title' | 'notes';

export function createBoardView(options: BoardOptions): BoardView {
  const element = document.createElement('div');
  element.className = 'board';
  // The board takes the keyboard as a whole; cards are not separately focusable, so arrow keys move a
  // selection rather than the browser's focus ring.
  element.tabIndex = 0;

  // Every rule about undo, the `n` pairing and no-op changes lives in board-state.ts, which hands back
  // the same object when nothing happened. This file is the DOM and the keys.
  let state: BoardState = initialBoardState();
  // Which field the card is open on, or null. Two fields edit in place now, and they commit on
  // different keys: a title has no newline to make, a description does.
  let editing: EditableField | null = null;
  // One number per read, because Ctrl+B Ctrl+T Ctrl+B can leave two reads running at once. The keys are
  // dead until the newest read lands (`landedRead !== latestRead`), and a read that is no longer the
  // newest throws its result away. A single flag let the first read clear it, the keys go live, and the
  // second, older result then put back a card deleted in between — with `previous` nulled, so undo could
  // not get it back either.
  let latestRead = 0;
  let landedRead = 0;

  function save(): void {
    options.bridge.writeBoard(options.projectPath, state.board).then(
      // A write that lands clears the failure it replaces; nothing else knows the message is stale.
      () => options.onError(''),
      (error: unknown) => options.onError(`Board not saved: ${String(error)}`),
    );
  }

  // Redraws either way — a keystroke that changed nothing still has to put the screen back, such as
  // Escape out of an edit — but only writes the file when the board actually moved.
  function apply(next: BoardState): void {
    if (next !== state) {
      state = next;
      save();
    }
    render();
  }

  function change(next: Change): void {
    apply(applyChange(state, next));
  }

  function startEditing(field: EditableField): void {
    if (!cardAt(state.board, state.selection)) return;
    editing = field;
    render();
    const input = element.querySelector('.board-edit');
    if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)) return;
    input.focus();
    // A title is opened to replace, so it comes up selected and one keystroke retypes it. A description
    // is opened to add a line to, and selecting it would let that keystroke wipe what is already there.
    if (field === 'title') input.select();
    else input.setSelectionRange(input.value.length, input.value.length);
  }

  function commitEditing(field: EditableField, value: string): void {
    editing = null;
    apply(field === 'title' ? commitTitle(state, value) : commitNotes(state, value));
    element.focus();
  }

  // Both editors are the same control with a different tag and a different commit key, so they are one
  // function: a title is one line and Enter ends it, a description is many and Enter is a newline in it.
  function renderEditor(field: EditableField, value: string): HTMLElement {
    const input: HTMLInputElement | HTMLTextAreaElement =
      field === 'title' ? document.createElement('input') : document.createElement('textarea');
    input.className = 'board-edit';
    input.value = value;
    // onkeydown rather than addEventListener: both tags declare it as taking a KeyboardEvent, which the
    // union of the two does not do for the listener overloads.
    input.onkeydown = (event) => {
      const commits = field === 'title' ? event.key === 'Enter' || event.key === 'Escape' : event.key === 'Escape';
      if (!commits) return;
      event.preventDefault();
      // The board listens on the element this input sits inside, and the key that ends the edit would
      // carry on up to it. Enter would land on the branch that starts an edit and re-open the title you
      // just committed, with the whole thing selected and the next letter you type replacing it.
      event.stopPropagation();
      commitEditing(field, input.value);
    };
    input.onblur = () => {
      if (editing === field) commitEditing(field, input.value);
    };
    return input;
  }

  function renderCard(card: Card, selected: boolean): HTMLElement {
    const item = document.createElement('li');
    // The priority rides on the card as a class so index.css owns which colour each one is.
    item.className = `board-card priority-${card.priority}${selected ? ' selected' : ''}`;
    item.append(selected && editing === 'title' ? renderEditor('title', card.title) : card.title);
    // A description shows on the card rather than behind a keystroke: the point of writing one down is
    // reading it without asking. A card with none takes no room for it.
    if (selected && editing === 'notes') {
      item.append(renderEditor('notes', card.notes));
    } else if (card.notes !== '') {
      const notes = document.createElement('p');
      notes.className = 'board-notes';
      notes.textContent = card.notes;
      item.append(notes);
    }
    return item;
  }

  function render(): void {
    element.replaceChildren(...state.board.columns.map((column, columnIndex) => {
      const section = document.createElement('section');
      section.className = 'board-column';
      const heading = document.createElement('h2');
      heading.textContent = `${column.name} (${column.cards.length})`;
      const list = document.createElement('ul');
      list.append(...column.cards.map((card, cardIndex) =>
        renderCard(card, columnIndex === state.selection.column && cardIndex === state.selection.card)));
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
    if (editing || landedRead !== latestRead) return;
    const direction = ARROW_DIRECTIONS[event.key];
    if (direction) {
      event.preventDefault();
      if (event.shiftKey) return change(moveCard(state.board, state.selection, direction));
      state = { ...state, selection: moveSelection(state.board, state.selection, direction) };
      return render();
    }
    if (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;
    switch (event.key) {
      case 'Enter':
        event.preventDefault();
        return startEditing('title');
      case 'e':
        event.preventDefault();
        return startEditing('notes');
      case 'p':
        event.preventDefault();
        return change(cyclePriority(state.board, state.selection));
      case 's':
        event.preventDefault();
        return change(sortColumn(state.board, state.selection));
      case 'n':
        event.preventDefault();
        apply(addBlankCard(state, crypto.randomUUID()));
        return startEditing('title');
      case 'd':
        event.preventDefault();
        return change(deleteCardAndDescendants(state.board, state.selection));
      case 'u':
        event.preventDefault();
        return apply(undoChange(state));
    }
  });

  return {
    element,
    // ponytail: re-read on entry, no file watcher. An agent editing board.json while you are looking
    // at the board is not picked up until you switch away and back. Watch the file if that bites.
    //
    // Focus is taken before the read, not after: the terminals view is already hidden by the time
    // open() runs, so focus is sitting on the body and a keystroke typed straight after Ctrl+B would
    // land nowhere. Main's read is synchronous fs, which on a cold or network-mounted folder is
    // comfortably longer than the gap between two keys — so a key typed during the read is dropped
    // rather than applied to the board that is about to be replaced.
    //
    // A failed read still has to leave the board on screen usable from the keyboard — render() runs
    // either way, on whatever board is already in memory, with the error in the status bar instead of
    // a fresh board. A control the keyboard can't reach is unfinished.
    async open(): Promise<void> {
      element.focus();
      const token = ++latestRead;
      let message = '';
      let next = state;
      try {
        const read = await options.bridge.readBoard(options.projectPath);
        next = loadBoard(state, read.board);
        // The old file is still on disk under this name, so the cards are not gone — just not shown.
        if (read.brokenFile) message = `Board file was damaged; kept as ${read.brokenFile}`;
      } catch (error: unknown) {
        message = `Board not opened: ${String(error)}`;
      }
      // A read another open() has overtaken says nothing: the newer one is the board you asked for.
      if (token !== latestRead) return;
      landedRead = token;
      state = next;
      editing = null;
      options.onError(message);
      render();
    },
    statusLabel(): string {
      const column = state.board.columns[state.selection.column];
      if (!column) return '';
      const card = cardAt(state.board, state.selection);
      return card ? `${column.name} · ${card.priority}` : column.name;
    },
  };
}
