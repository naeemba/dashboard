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
  dropCard,
  hasSubtasks,
  landsInShip,
  moveCard,
  moveCardToColumn,
  flightParts,
  moveSelection,
  pullRequestFrom,
  selectionOf,
  sortColumn,
  type Card,
  type Change,
  type MoveGesture,
  type Selection,
} from './board';
import type { Action } from './actions';
import { openCardDetail, type CardDetail } from './board-detail';
import { dropRow } from './board-drag';
import { putEditBack, takeEdit } from './carried-edit';
import {
  addBlankCard,
  applyAutomaticChange,
  applyChange,
  boardIsBusy,
  commitBranch,
  commitComment,
  commitNotes,
  commitPullRequest,
  commitTitle,
  initialBoardState,
  isUnreadForGood,
  loadBoard,
  reloadBoard,
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
  // Everything in flight, asked for on every render rather than fetched and held here. One copy of
  // worktrees.json in the renderer, so a worktree removed from the Ctrl+Shift+W list cannot leave a
  // card on the board behind it still reading `shipped · <branch> · terminal 3`.
  worktrees(): readonly WorktreeEntry[];
};

export type BoardView = {
  element: HTMLElement;
  open(): Promise<void>;
  // The file changed under you: read it again and redraw, without moving the keyboard or the
  // selection. The path is passed because the manager shows every open project's board at once and
  // only one of them wrote; a board whose project this is not does nothing.
  reload(projectPath: string): void;
  // What the status bar says about the board: the column the selection is in, and the priority of the
  // card it is on. The colour down a card's edge is the fast read; this is the one that names it.
  statusLabel(): string;
  // The board's own keys, once the renderer's own lookup finds them and hands them here instead of
  // this element's own keydown listener answering them.
  runAction(action: Action): void;
  // Draw again from what has not changed here: the record of what is in flight lives in the renderer,
  // and a card's badge comes from it.
  redraw(): void;
};

// Read off the action rather than spelled out again: a field the table can ask for and this file has
// never heard of would otherwise be a key that does nothing.
type EditableField = Extract<Action, { kind: 'board-edit' }>['field'];

// Which commit rule each field ends on. Every one of them hands back the same state when nothing
// changed, which is what keeps opening a field and closing it from spending the undo step.
const COMMITS: Record<EditableField, (state: BoardState, value: string) => BoardState> = {
  title: commitTitle,
  notes: commitNotes,
  comment: commitComment,
  branch: commitBranch,
  pullRequest: commitPullRequest,
};

// Which fields are typed over more than one line. They get a textarea, Enter makes a newline in them
// and Escape is what commits — the other three are one line and end on Enter. Listed once, because a
// field added to the textarea half and forgotten in the commit half is a box you cannot get out of.
const MULTILINE: readonly EditableField[] = ['notes', 'comment'];

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
  // This project's rows of the record, by card, rebuilt once per render. The badge comes from here
  // rather than from the board, because a card's column on main says what has been merged and says
  // nothing about work under way on a branch. A map rather than a scan per card: renderCard runs for
  // every card on the board on every keystroke — the same reason age.ts builds its formatter once.
  let inFlight = new Map<string, WorktreeEntry>();
  // The card carrying the line that says where a dragged card would land, and the frame that will draw
  // it. Held rather than searched for: a dragover fires on every mouse movement, and looking the marked
  // card up by its own class each time walks every node on the board — on the manager that is every
  // open project's cards at once — to find the one node this file put the class on itself.
  let marked: Element | null = null;
  let markFrame = 0;
  // The id of the card a left press landed on, or null. Held by id rather than by node because the
  // press commits an open box, which replaces every card on the board — the node is gone by the time
  // the button comes up, the id is not.
  let pressed: string | null = null;
  // The open card dialog, or null. Held so a write that lands can redraw it: it reads the live board on
  // every key, but nothing tells it the file changed, so the subtasks on screen and the ones Enter acts
  // on would be two different lists.
  let detail: CardDetail | null = null;

  // The one read. `fresh` is an arrival — the selection starts at the top of the column and the undo
  // step is gone, which is what entering a board means. Without it the file simply changed under you
  // and the selection stays on the card it was on.
  //
  // Main's read is synchronous fs, which on a cold or network-mounted folder is comfortably longer
  // than the gap between two keys — so a key typed during the read is dropped rather than applied to
  // the board that is about to be replaced.
  //
  // What it decides (`next`, `message`) stays local until the read has settled, and the one guard
  // below is what a stale call bounces off; a guard per await is the shape that let an old read win a
  // race the first version of this file had already closed.
  //
  // A failed read still has to leave the board on screen usable from the keyboard: render() runs
  // either way, on whatever board is already in memory, with the error in the status bar instead of a
  // fresh board. A control the keyboard can't reach is unfinished.
  async function readAgain(fresh: boolean): Promise<void> {
    const token = ++latestRead;
    let message = '';
    let next = state;
    const boardRead = options.bridge.readBoard(options.projectPath);
    try {
      const read = await boardRead;
      next = fresh ? loadBoard(state, read.board) : reloadBoard(state, read.board);
      // The old file is still on disk under this name, so the cards are not gone — just not shown.
      if (read.brokenFile) message = `Board file was damaged; kept as ${read.brokenFile}`;
    } catch (error: unknown) {
      message = `Board not opened: ${String(error)}`;
    }
    // A read another one has overtaken says nothing: the newer one is the board you asked for.
    if (token !== latestRead) return;
    landedRead = token;
    // An arrival closes any open box: you asked to come here, and this is a different board. A file
    // that changed under you does not close it — what you have half typed is yours, and reloadBoard
    // has already followed your card to wherever the write put it. The redraw throws the box away and
    // builds a new one, so the text and the caret cross over by hand.
    if (fresh) editing = null;
    const wasEditing = editingCardId();
    const carried = editing === null ? null : takeEdit(editorInput());
    state = next;
    // The box only goes back on the card it was opened on. A write that drops that card leaves the
    // selection on the row it held, which is now the next card down — and a box drawn there would be
    // that card's box with your text in it, so pressing Enter renames a card you never opened.
    if (wasEditing !== undefined && cardAt(state.board, state.selection)?.id !== wasEditing) editing = null;
    options.onError(message);
    render();
    // The card you were typing into is not on the new board, so there is no box to put the text back
    // in. Leaving `editing` set here would take every key on this screen for good.
    if (carried && !putEditBack(editorInput(), carried)) {
      editing = null;
      element.focus();
    }
    // The open card dialog reads this board on every key, so it has to be drawn from it too. It closes
    // itself if the write took its card away, and carries a half-typed subtask across if it did not.
    detail?.redraw();
  }

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

  // The open box, whichever tag it was drawn as. One lookup, because three things now want it: opening
  // one, and the two halves of carrying one across a redraw.
  function editorInput(): HTMLInputElement | HTMLTextAreaElement | null {
    const input = element.querySelector('.board-edit');
    return input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement ? input : null;
  }

  // The card the open box belongs to, or undefined when no box is open. Both callers need it because
  // a board that changes under a box has to put that box back on the same card, not on whatever row
  // the selection is now pointing at.
  function editingCardId(): string | undefined {
    return editing === null ? undefined : cardAt(state.board, state.selection)?.id;
  }

  // The keys, the clicks and the drags all bounce off this one answer, so a gesture added later finds
  // it here rather than writing the condition out a fourth time. What counts as busy is board-state's
  // to say, and board-state.test.ts is what pins it.
  function busy(): boolean {
    return boardIsBusy(state, editing !== null, landedRead !== latestRead);
  }

  // A key that bounced has to say so when the bounce outlasts the keystroke. A box being open and a
  // read in flight are both over in a moment and the screen shows both — including the first read,
  // which is the one where a board nobody has read yet is also a board a read is about to fill. A
  // board whose read came back empty-handed shows three empty columns each offering `n adds a card`,
  // and stays that way for the session — so without a word here you press `n`, then `d`, then an
  // arrow, and nothing happens or ever will.
  function sayIfUnread(): void {
    if (isUnreadForGood(state, landedRead !== latestRead)) {
      options.onError('This board was not read, so nothing may be saved over it. Leave this screen and come back to read it again.');
    }
  }

  function startEditing(field: EditableField): void {
    if (!cardAt(state.board, state.selection)) return;
    editing = field;
    render();
    const input = editorInput();
    if (!input) return;
    input.focus();
    // A title, a branch and a pull request number are opened to replace, so they come up selected and
    // one keystroke retypes them. A description is opened to add a line to, and selecting it would let
    // that keystroke wipe what is already there; a comment box comes up empty, so there is nothing to
    // select either way.
    if (MULTILINE.includes(field)) input.setSelectionRange(input.value.length, input.value.length);
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
      MULTILINE.includes(field) ? document.createElement('textarea') : document.createElement('input');
    input.className = 'board-edit';
    input.value = value;
    // The comment box is the one that opens empty, so it is the one that has to say what it is. The
    // others open holding the field they edit.
    if (field === 'comment') input.placeholder = 'Comment';
    // A title or a description typed in Persian turns the box round as you type.
    input.dir = 'auto';
    // onkeydown rather than addEventListener: both tags declare it as taking a KeyboardEvent, which the
    // union of the two does not do for the listener overloads.
    input.onkeydown = (event) => {
      // Returning without preventDefault, so Cmd+A and Cmd+V still do what they do in any text box.
      if (isModified(event)) return;
      const commits = MULTILINE.includes(field) ? event.key === 'Escape' : event.key === 'Enter' || event.key === 'Escape';
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
    const flying = inFlight.get(card.id);
    if (flying) {
      const badge = document.createElement('p');
      badge.className = 'board-shipped';
      const pane = flying.pane === null ? 'no pane' : paneLabel(flying.pane);
      badge.textContent = `shipped · ${flying.branch} · ${pane}`;
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
    // The trail, as a count. The comments themselves are read behind `o`: a card with a long
    // conversation on it would otherwise be a column of its own, and the board is meant to be read at
    // a glance. Without this line nothing on the board says there is anything to open.
    if (selected && editing === 'comment') {
      item.append(renderEditor('comment', ''));
    } else if (card.comments !== undefined) {
      const trail = document.createElement('p');
      trail.className = 'board-comments';
      trail.textContent = card.comments.length === 1 ? '1 comment' : `${card.comments.length} comments`;
      item.append(trail);
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
    // The mouse half of the board, native drag and drop rather than a gesture spelled out of pointer
    // events: Chromium draws the card under the cursor, ends the drag when you let go anywhere, and
    // gives up on Escape, none of which is worth writing again.
    item.draggable = true;
    item.addEventListener('dragstart', (event) => beginDrag(event, card));
    item.addEventListener('dragend', endDrag);
    // A click moves the selection to the card first and then does what Enter does there — read off
    // mouseup rather than click, because pressing on a card while another card's box is open commits
    // that box on blur, which replaces every card on the board. The li the press landed on is detached
    // before the button comes back up, and a click whose two halves have no ancestor left in common is
    // never dispatched at all, so the first press on a card would do nothing and you would have to
    // press it again. The card released over is on screen either way.
    // Paired with the press, because mouseup is dispatched on whatever is under the pointer when the
    // button comes up and bubbles: press on a column heading to select its text, drag down onto the
    // first card, let go, and without this the card's title box opens with the text selected.
    item.addEventListener('mousedown', () => { pressed = card.id; });
    item.addEventListener('mouseup', (event) => {
      const onThisCard = pressed === card.id;
      pressed = null;
      if (event.button === 0 && onThisCard) clickCard(card);
    });
    return item;
  }

  // Puts the keyboard on the card the pointer is on, and says whether it could. Both gestures need it
  // and the answer is the same for both: nothing moves while the board is busy(), and nothing moves
  // onto a card a write has already taken away.
  function selectCard(card: Card): boolean {
    const at = busy() ? null : selectionOf(state.board, card.id);
    if (!at) {
      // The mouse half of the same silence: a click and a grab both bounce off a board nobody read,
      // and neither of them draws a cursor that says so the way a refused drop does.
      sayIfUnread();
      return false;
    }
    state = { ...state, selection: at };
    return true;
  }

  // Enter on a board opens the title, so that is what a click does. A press that lands here while
  // another card's box is open has already closed that box — renderEditor commits on blur, and blur
  // comes with the press — so the keyboard is free by the time this runs and the selection moves on
  // that same press.
  function clickCard(card: Card): void {
    if (selectCard(card)) startEditing('title');
  }

  // Grabbing a card moves the selection onto it, so that when the drag is over — dropped or abandoned —
  // the highlight is on the card the pointer last had hold of rather than wherever it was before.
  //
  // It does not redraw here, and does not move the highlight by hand either. Chromium takes the picture
  // that follows the cursor after this handler returns, and render() replaces every card on the board
  // including this one, so a redraw here hands the picture a node that no longer exists and the drag
  // runs with nothing under the pointer. The redraw happens on dragend instead, which fires however the
  // drag ends; the card under the cursor is what says where you are until then.
  function beginDrag(event: DragEvent, card: Card): void {
    // Nothing to drag: refusing the gesture outright is better than a card that follows the cursor and
    // then will not be let go of anywhere.
    if (!selectCard(card)) return event.preventDefault();
    if (!event.dataTransfer) return;
    // Chromium cancels a drag that carries nothing, and the id is what the drop looks the card up by.
    event.dataTransfer.setData('text/plain', card.id);
    // The board has one drag and it is a move. Left uninitialized, a cancelled dragover gives an
    // operation of copy, and the cursor grows the green plus that says the card stays where it is.
    event.dataTransfer.effectAllowed = 'move';
  }

  // However the drag ended. A drop has already redrawn through change(); this is what puts the
  // highlight on the grabbed card when you let go over nothing, or press Escape.
  //
  // It forgets the press too: a drag ends in dragend and no mouseup, so without this the card you
  // dragged stays recorded, and the next press that starts off a card and releases over it opens its
  // title box — the gesture the pairing above exists to refuse.
  function endDrag(): void {
    pressed = null;
    clearDrop();
    render();
  }

  // Takes the line off whatever is carrying it, and calls off a frame that has not drawn yet — without
  // that, a drag let go of or abandoned a few milliseconds after the last dragover leaves a line on the
  // board pointing at a gap nothing is being dropped into.
  function clearDrop(): void {
    cancelAnimationFrame(markFrame);
    markFrame = 0;
    marked?.classList.remove('drop-above', 'drop-below');
    marked = null;
  }

  // Where the card would land if you let go now, drawn as a line along the top of the card it would sit
  // above — or along the bottom of the last one when the answer is the end of the column. Without it a
  // drag into a column of a dozen cards is a guess: the gap between two cards is four pixels of
  // background and nothing in it says which gap the cursor is in.
  //
  // An empty column gets no line. There is one place the card can go and the column is visibly empty,
  // so there is nothing for a line to tell apart.
  //
  // One frame at a time. A dragover fires on every mouse movement and again every few hundred
  // milliseconds while the cursor sits still, and reading a column's rows reads the box of every card
  // in it — a whole layout each time, forced again by the class this then writes. The line can only be
  // painted once a frame, so measuring more often than that buys a stutter and nothing else.
  function markDropSoon(list: HTMLElement, pointerY: number): void {
    if (markFrame) return;
    markFrame = requestAnimationFrame(() => {
      markFrame = 0;
      clearDrop();
      const cards = list.children;
      const row = rowUnder(list, pointerY);
      // The end of the column is the one landing with no card above it to draw on, so the last card
      // carries the line under itself instead.
      const above = row < cards.length;
      marked = (above ? cards[row] : cards[cards.length - 1]) ?? null;
      marked?.classList.add(above ? 'drop-above' : 'drop-below');
    });
  }

  // Which row of this column the pointer is naming. Measured here and decided in board-drag.ts, so the
  // rule about which gap a pointer is in is somewhere a test can reach — and asked in one place, so the
  // line you were shown and the row you get cannot be two different answers.
  function rowUnder(list: HTMLElement, pointerY: number): number {
    const midpoints = [...list.children].map((item) => {
      const box = item.getBoundingClientRect();
      return box.top + box.height / 2;
    });
    return dropRow(midpoints, pointerY);
  }

  // A move, and the ship it may be. Both gestures that move a card come through here so the second half
  // cannot be taught to one of them alone: teach the keystroke that a failed ship puts the card back and
  // the drag would still be running the old version, with nothing failing until somebody drags a card
  // onto Ship instead of pressing Shift+Right.
  //
  // `from` is where the card was a gesture ago, which is not always the selection — a drag is let go of
  // on a card the keyboard is not on.
  function moveThenShip(from: Selection, next: Change, gesture: MoveGesture): void {
    const moving = cardAt(state.board, from);
    change(next);
    if (moving && landsInShip(state.board, from.column, state.selection, gesture)) ship(moving, from.column);
  }

  // Letting go. The same move Shift+Arrow makes, including the one into Ship that hands the card to an
  // agent: a column means the same thing however the card got there, and a drag that quietly skipped
  // the ship would be a second, silent set of rules for the mouse.
  function dropOnColumn(event: DragEvent, columnIndex: number, list: HTMLElement): void {
    event.preventDefault();
    // Before the row is read, so the line is gone whether or not this board has the card.
    clearDrop();
    if (busy()) return;
    // Found by id rather than taken from this board's selection: the manager stacks every open
    // project's board in one scroller, so the card let go of here may belong to another one of them.
    const id = event.dataTransfer?.getData('text/plain') ?? '';
    // Something dragged in from outside the app carries no card id, and there is nothing to say about
    // it. A dragover cannot read the id, so the column drew a line promising this drop would land —
    // the one refusal you can reach with the mouse, and the only place that knows it was refused.
    if (id === '') return;
    const at = selectionOf(state.board, id);
    if (!at) return options.onError('That card belongs to another project — a card stays on the board it was made on');
    moveThenShip(at, dropCard(state.board, at, columnIndex, rowUnder(list, event.clientY)), 'drop');
  }

  function render(): void {
    inFlight = new Map(options.worktrees()
      .filter((entry) => entry.projectPath === options.projectPath)
      .map((entry) => [entry.cardId, entry]));
    element.replaceChildren(...state.board.columns.map((column, columnIndex) => {
      const section = document.createElement('section');
      section.className = 'board-column';
      const heading = document.createElement('h2');
      heading.textContent = `${column.name} (${column.cards.length})`;
      const list = document.createElement('ul');
      list.append(...column.cards.map((card, cardIndex) =>
        renderCard(card, columnIndex === state.selection.column && cardIndex === state.selection.card)));
      // On the whole column, not the cards in it: a column you can only drop onto by hitting a card is
      // a column you cannot drop into once it is empty, and the heading and the gap under the last card
      // are both places a hand aims at. preventDefault is what makes the column a place a card can be
      // let go of at all — without it the drop never fires and the card springs back.
      section.addEventListener('dragover', (event) => {
        // dropEffect, not a withheld preventDefault: renderer.ts cancels dragover at the window so a
        // file dropped on the page cannot navigate it, and one listener cancelling is enough to allow
        // the drop however this one returns. dropEffect is read after that and does turn the cursor
        // into the one that says no. Without it the card snaps back off dropOnColumn's own busy check
        // with nothing on screen having said the column would not take it.
        if (busy()) {
          if (event.dataTransfer) event.dataTransfer.dropEffect = 'none';
          // A board can go busy mid-drag — a board:change from the command line starts a read — and the
          // line drawn a moment ago would sit there saying the card lands here while the cursor says no.
          clearDrop();
          return;
        }
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
        markDropSoon(list, event.clientY);
      });
      section.addEventListener('drop', (event) => dropOnColumn(event, columnIndex, list));
      // A board the pointer merely crossed never hears dragend — that fires at the card the drag
      // started from, which on the manager's stack of boards can be another project's. Without this,
      // pass over a column until the line appears and then press Escape, and the line stays hard
      // against a card nothing is being dropped into until something else redraws that board, which
      // nothing does. relatedTarget is where the pointer went: still inside this column means it only
      // moved between the cards in it.
      section.addEventListener('dragleave', (event) => {
        if (!(event.relatedTarget instanceof Node) || !section.contains(event.relatedTarget)) clearDrop();
      });
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
      if (!confirmed) return;
      // Found again rather than remembered, the same as ship(): a write that lands while the question
      // is up moves the card off the row it was on, and deleting the row would delete whatever slid
      // into it — "Delete A?" taking B and B's whole family with it.
      const at = selectionOf(state.board, card.id);
      if (at) change(deleteCardAndDescendants(state.board, at));
    });
  }

  // A card that has landed in Ship, and `from` is the column it was in a keystroke ago.
  //
  // A ship that works puts the card back there, carrying its badge: this board is main's, and a
  // column on main says what has been merged. That move writes board.json like any other, and goes
  // through applyAutomaticChange rather than change() because it is the app's move and not yours —
  // board-state.ts holds the reason.
  //
  // A ship that fails changes nothing. The card stays in Ship where you put it and the message says
  // why; the app never silently undoes a move you made.
  //
  // No staleness guard on the result, unlike open(): a board read in flight would replace the whole
  // board, and this only moves one card that it finds again first. Landing after you have left this
  // view is fine too — the write is to this board's own file either way.
  // The move-back itself. A change carries the selection with it, and normally that is right — the
  // highlight follows the card home. Not while a box is open: the selection is then the card you are
  // typing into, and taking the moved card's would commit what you typed onto the card that just
  // shipped and leave the one you were naming blank. Found by id rather than kept as a number, because
  // the move it is riding on has just shifted the rows below it.
  function movedBack(landed: Selection, from: number): Change {
    const moved = moveCardToColumn(state.board, landed, from);
    const editingId = editingCardId();
    if (editingId === undefined) return moved;
    return { ...moved, selection: selectionOf(moved.board, editingId) ?? moved.selection };
  }

  function ship(card: Card, from: number): void {
    options.onError(`shipping "${card.title}"…`);
    options.bridge.shipCard({
      projectPath: options.projectPath,
      cardId: card.id,
      title: card.title,
      slot: options.slot,
    }).then(
      (result) => {
        if (!result.ok) return options.onError(result.message);
        options.onError('');
        // Found again rather than remembered: a ship takes as long as git does, and anything you did
        // to the board while it ran has moved the card off the row it was shipped from.
        const landed = selectionOf(state.board, card.id);
        if (landed) apply(applyAutomaticChange(state, movedBack(landed, from)));
        else render();
      },
      (error: unknown) => options.onError(`ship failed: ${String(error)}`),
    );
  }

  // The dialog changes the board as you add subtasks, so each change goes through apply() as it
  // happens — same undo step, same write to disk as a change made on the board itself. It closes on
  // the card you asked for, or on the subtask you pressed Enter on.
  function openDetail(): void {
    if (!cardAt(state.board, state.selection)) return;
    detail = openCardDetail({
      // The live board, not the one on screen when it opened: a write can land while the dialog is up,
      // and a subtask added to the board from before it would put that board back over the write.
      board: () => state.board,
      selection: state.selection,
      makeId: () => crypto.randomUUID(),
      onChange: change,
    });
    detail.closed.then(({ selection, comment }) => {
      detail = null;
      state = { ...state, selection };
      // `c` in the dialog is a way out to this box rather than a box of its own: the trail is read in
      // there and written here, on the card the dialog was sitting on.
      // The card can be gone by the time this runs — a write landed while the dialog was up — and
      // startEditing does nothing without one. Falling through is what puts the keyboard back on the
      // board; skipping it leaves focus on <body> and no key works until you reach for the mouse.
      if (comment && cardAt(state.board, state.selection)) return startEditing('comment');
      element.focus();
      render();
    });
  }

  return {
    element,
    redraw: render,
    // Focus is taken before the read, not after: the terminals view is already hidden by the time
    // open() runs, so focus is sitting on the body and a keystroke typed straight after Ctrl+B would
    // land nowhere.
    async open(): Promise<void> {
      // preventScroll, because on the manager's board several of these share one scroller and each of
      // them taking the keyboard would drag it to a different project. A project's own board fills its
      // page and has nothing to be scrolled into view, so it costs that screen nothing.
      element.focus({ preventScroll: true });
      await readAgain(true);
    },
    // Somebody else wrote the file — the command line, or a hand edit — and main said so. The
    // keyboard is not touched: you did not ask to come here, you are already here.
    reload(projectPath: string): void {
      if (projectPath !== options.projectPath) return;
      // Read even with a box open. Refusing here dropped the write for good and then let the next
      // keystroke save the board from before it: an agent moves a card to Done while you are naming
      // another one, you press Enter, and the card is back in Doing with nothing on screen saying so.
      // readAgain carries the box across instead.
      void readAgain(false);
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
      if (busy()) return sayIfUnread();
      switch (action.kind) {
        case 'board-select':
          state = { ...state, selection: moveSelection(state.board, state.selection, action.direction) };
          return render();
        case 'board-move':
          // The row the card is leaving, which both halves of a ship need: whether this move is the
          // gesture at all, and where the card goes back to once the ship works.
          return moveThenShip(
            state.selection,
            moveCard(state.board, state.selection, action.direction),
            action.direction,
          );
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
