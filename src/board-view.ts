import {
  attachToCardAbove,
  attachmentRing,
  cardAt,
  cardById,
  childColumns,
  cyclePriority,
  deleteCardAndDescendants,
  descendantsOf,
  detachCard,
  hasSubtasks,
  moveCard,
  flightParts,
  moveSelection,
  pullRequestFrom,
  shipColumnIndex,
  sortColumn,
  type Card,
  type Change,
} from './board';
import type { Action } from './actions';
import { openCardDetail } from './board-detail';
import {
  addBlankCard,
  applyChange,
  commitBranch,
  commitNotes,
  commitPullRequest,
  commitTitle,
  initialBoardState,
  loadBoard,
  undoChange,
  type BoardState,
} from './board-state';
import type { DashboardBridge } from './bridge';
import { confirmOverlay } from './overlay';
import { isModified } from './shortcuts';
import { paneLabel } from './terminals';
import type { WorktreeEntry } from './worktree-store';

export type BoardOptions = {
  projectPath: string;
  // Which page this board belongs to, because shipping a card takes one of that page's five panes.
  slot: number;
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
  // The board's own keys, once the renderer's own lookup finds them and hands them here instead of
  // this element's own keydown listener answering them.
  runAction(action: Action): void;
};

// Read off the action rather than spelled out again: a field the table can ask for and this file has
// never heard of would otherwise be a key that does nothing.
type EditableField = Extract<Action, { kind: 'board-edit' }>['field'];

// Which commit rule each field ends on. Every one of them hands back the same state when nothing
// changed, which is what keeps opening a field and closing it from spending the undo step.
const COMMITS: Record<EditableField, (state: BoardState, value: string) => BoardState> = {
  title: commitTitle,
  notes: commitNotes,
  branch: commitBranch,
  pullRequest: commitPullRequest,
};

// The card the keys are on. Exported because the manager's board, which stacks several of these in one
// scroller, has to find it too — and a name that lives in one place cannot be renamed here and left
// behind there, where nothing would fail and the selection would simply stop being scrolled to.
export const SELECTED_CARD = '.board-card.selected';

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
  // What this project has in flight, refreshed whenever the board is read. The badge on a card comes
  // from here rather than from the board, because a card's column on main says what has been merged
  // and says nothing about work that is under way on a branch.
  let shipped: WorktreeEntry[] = [];

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
    // A title, a branch and a pull request number are opened to replace, so they come up selected and
    // one keystroke retypes them. A description is opened to add a line to, and selecting it would let
    // that keystroke wipe what is already there.
    if (field === 'notes') input.setSelectionRange(input.value.length, input.value.length);
    else input.select();
  }

  function commitEditing(field: EditableField, value: string): void {
    editing = null;
    // Clearing the title of a card that has subtasks keeps the card, because two keystrokes with no
    // confirmation must not strand a family. Without a word here the card simply springs back to its
    // old title and nothing says why, which reads as the keyboard having missed the keystroke.
    const card = cardAt(state.board, state.selection);
    if (field === 'title' && value.trim() === '' && card && hasSubtasks(state.board, state.selection)) {
      options.onError(`"${card.title}" has subtasks — delete it with d`);
    }
    // The other refusal worth a word: the card keeps the number it had, and nothing on screen would
    // say so. commitPullRequest asks pullRequestFrom on the same text, so the two agree by construction.
    if (field === 'pullRequest' && value.trim() !== '' && pullRequestFrom(value) === null) {
      options.onError(`"${value.trim()}" is not a pull request number — write 14 or #14`);
    }
    apply(COMMITS[field](state, value));
    element.focus();
  }

  // Both editors are the same control with a different tag and a different commit key, so they are one
  // function: a title is one line and Enter ends it, a description is many and Enter is a newline in it.
  function renderEditor(field: EditableField, value: string): HTMLElement {
    const input: HTMLInputElement | HTMLTextAreaElement =
      field === 'notes' ? document.createElement('textarea') : document.createElement('input');
    input.className = 'board-edit';
    input.value = value;
    // A title or a description typed in Persian turns the box round as you type.
    input.dir = 'auto';
    // onkeydown rather than addEventListener: both tags declare it as taking a KeyboardEvent, which the
    // union of the two does not do for the listener overloads.
    input.onkeydown = (event) => {
      // Returning without preventDefault, so Cmd+A and Cmd+V still do what they do in any text box.
      if (isModified(event)) return;
      const commits = field === 'notes' ? event.key === 'Escape' : event.key === 'Enter' || event.key === 'Escape';
      if (!commits) return;
      event.preventDefault();
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
    // Which piece of work this card belongs to. Invisible from the column otherwise: a subtask is an
    // ordinary card sitting in an ordinary column, and nothing else on it says so.
    const parent = card.parent === null ? undefined : cardById(state.board, card.parent);
    if (parent) {
      const badge = document.createElement('p');
      badge.className = 'board-parent';
      badge.textContent = parent.title;
      item.append(badge);
    }
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
    // What the card is in flight as: the branch, then the pull request it opened. Both are typed in,
    // and a card with neither takes no room for them. Without this the board can list a Doing column
    // and still not say which of those cards has anything on a branch.
    if (selected && (editing === 'branch' || editing === 'pullRequest')) {
      // The number goes into the box bare: you type 14, and flightParts is what puts the # back.
      item.append(renderEditor(editing, String(card[editing] ?? '')));
    } else {
      const flight = flightParts(card);
      if (flight.length > 0) {
        const line = document.createElement('p');
        line.className = 'board-flight';
        line.textContent = flight.join(' · ');
        item.append(line);
      }
    }
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
    element.querySelector(SELECTED_CARD)?.scrollIntoView({ block: 'nearest' });
    options.onChanged();
  }

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
    confirmOverlay(question, 'Enter deletes. Escape keeps it.').then((confirmed) => {
      element.focus();
      if (confirmed) change(deleteCardAndDescendants(state.board, state.selection));
    });
  }

  // A card that has landed in Ship. The board is written first, so the card is where you put it even
  // if the ship then refuses — the app never silently undoes a move you made. Main puts board.json
  // back to HEAD as its own first step, which is what makes that safe.
  //
  // No staleness guard on the result below, unlike open(): a result landing after you have moved off
  // this view only writes this closure's own `shipped` and redraws whatever view is currently
  // attached — there is no board read in flight for it to overwrite, so there is nothing to protect.
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
    // Two things are read, the board and the local ship record, and both are started here before
    // either is awaited — so a second open() landing in between finds one gap to overtake, not two.
    // Everything each read decides (`next`, `message`, `nextShipped`) stays local until both have
    // settled, and the one guard below is what a stale call bounces off; a guard per await is the
    // shape that let an old read win a race the first version of this file had already closed.
    //
    // A failed read still has to leave the board on screen usable from the keyboard — render() runs
    // either way, on whatever board is already in memory, with the error in the status bar instead of
    // a fresh board. A control the keyboard can't reach is unfinished.
    async open(): Promise<void> {
      // preventScroll, because on the manager's board several of these share one scroller and each of
      // them taking the keyboard would drag it to a different project. A project's own board fills its
      // page and has nothing to be scrolled into view, so it costs that screen nothing.
      element.focus({ preventScroll: true });
      const token = ++latestRead;
      let message = '';
      let next = state;
      const boardRead = options.bridge.readBoard(options.projectPath);
      // Cheap and local — a JSON file in the app's own folder — so it is re-read with the board rather
      // than kept in step by hand. The catch is attached here, on the promise itself, not around an
      // await further down — a rejection has to be claimed the moment it is possible, not left to
      // become unhandled while the other read is still in flight.
      const shippedRead = options.bridge.listWorktrees()
        .then((entries) => entries.filter((entry) => entry.projectPath === options.projectPath))
        // A failure to read the local record must never cost you the board; null says "leave it".
        .catch(() => null);
      try {
        const read = await boardRead;
        next = loadBoard(state, read.board);
        // The old file is still on disk under this name, so the cards are not gone — just not shown.
        if (read.brokenFile) message = `Board file was damaged; kept as ${read.brokenFile}`;
      } catch (error: unknown) {
        message = `Board not opened: ${String(error)}`;
      }
      const nextShipped = await shippedRead;
      // A read another open() has overtaken says nothing: the newer one is the board you asked for.
      if (token !== latestRead) return;
      landedRead = token;
      if (nextShipped !== null) shipped = nextShipped;
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
    // Every key on this screen is found by the window's one lookup and handed here. The board keeps no
    // key handling of its own, which is what stops a board key and its help row drifting apart.
    runAction(action: Action): void {
      // A read is in flight and the board on screen is about to be replaced. Applying a keystroke to
      // the board that is going away would be applying it to cards you are not looking at.
      if (editing || landedRead !== latestRead) return;
      switch (action.kind) {
        case 'board-select':
          state = { ...state, selection: moveSelection(state.board, state.selection, action.direction) };
          return render();
        case 'board-move': {
          const moving = cardAt(state.board, state.selection);
          change(moveCard(state.board, state.selection, action.direction));
          // Asked after the move, of the board the move produced: landing in Ship is the gesture, and
          // a card already in Ship that is merely reordered has not landed in it again.
          const landed = state.selection.column === shipColumnIndex(state.board);
          if (moving && landed && action.direction === 'right') ship(moving);
          return;
        }
        case 'board-attach': {
          // The one refusal worth explaining. The others — no card above, nothing selected — are
          // obvious from the screen. attachmentRing decides it on the same call, so the message cannot
          // say one thing while the board does another.
          const ring = attachmentRing(state.board, state.selection);
          if (ring) return options.onError(`"${ring.title}" is already a subtask of this card`);
          return change(attachToCardAbove(state.board, state.selection));
        }
        case 'board-detach': return change(detachCard(state.board, state.selection));
        case 'board-edit': return startEditing(action.field);
        case 'board-priority': return change(cyclePriority(state.board, state.selection));
        case 'board-sort': return change(sortColumn(state.board, state.selection));
        case 'board-add':
          apply(addBlankCard(state, crypto.randomUUID()));
          return startEditing('title');
        case 'board-delete': return confirmDelete();
        case 'board-open': return openDetail();
        case 'board-undo': return apply(undoChange(state));
        // Everything else belongs to the renderer and never gets here.
        default: return;
      }
    },
  };
}
