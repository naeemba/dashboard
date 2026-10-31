import { icon, type IconName } from './icons';
import { clampIndex } from './clamp-index';
import { isModified } from './shortcuts';

// The class every sheet built here carries, so that one name means "a dialog owns the keyboard" and
// nobody has to keep a list of the dialogs in step by hand. The box inside it carries the same name
// with `-dialog`, so the shape every dialog shares is one CSS rule and not a list to keep in step either.
const OVERLAY_CLASS = 'overlay';

// Every dialog in this app is the same thing on screen: a dark sheet over the pages with one box
// centred in it. Only what goes in the box, and what the box answers with, differ — so the sheet is here
// and each dialog keeps its own contents. `name` is the dialog's own class, on top of the shared one.
export function openOverlay(name: string, dismiss: () => void): { dialog: HTMLDivElement; remove: () => void } {
  const overlay = document.createElement('div');
  overlay.className = `${OVERLAY_CLASS} ${name}`;
  const dialog = document.createElement('div');
  dialog.className = `${OVERLAY_CLASS}-dialog ${name}-dialog`;
  // Not reachable by Tab, but focusable, so the dialog can take the keyboard while it is up. Every
  // dialog built on this sheet needs it, and one that forgets it is silently unusable by keyboard.
  dialog.tabIndex = -1;
  overlay.append(dialog);
  document.body.append(overlay);

  // Only the dark margin around the dialog dismisses it. Without the check a click meant to select a name
  // or a key closes the dialog under the pointer.
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) dismiss();
  });

  return { dialog, remove: () => overlay.remove() };
}

// Enter and Escape answer every small dialog here, and a modified one answers none: Cmd+Enter is not
// an answer to a question about deleting a card and its whole family, and a capital typed with Shift
// still reaches a box to type in. One copy, so a dialog cannot forget the guard.
function answerKeys(dialog: HTMLElement, answer: (key: 'Enter' | 'Escape') => void): void {
  dialog.addEventListener('keydown', (event) => {
    if (isModified(event)) return;
    if (event.key !== 'Enter' && event.key !== 'Escape') return;
    event.preventDefault();
    answer(event.key);
  });
}

// Built on the same sheet as the picker and the help dialog. Enter confirms, Escape cancels, and
// clicking the dark margin cancels — a dialog that appears under your hand must not treat a stray
// click as yes. The keys line is the caller's to write: this file knows nothing about what is being
// confirmed, and a default here would put the board's delete wording over someone else's question.
export function confirmOverlay(message: string, keysLine: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    function close(answer: boolean): void {
      remove();
      resolve(answer);
    }

    const { dialog, remove } = openOverlay('confirm', () => close(false));

    const question = document.createElement('p');
    question.className = 'confirm-question';
    question.textContent = message;
    const keys = document.createElement('p');
    keys.className = 'confirm-keys';
    keys.textContent = keysLine;
    dialog.append(question, keys);
    dialog.focus();

    answerKeys(dialog, (key) => close(key === 'Enter'));
  });
}

// An image at its full size, or as much of it as the window holds, on the same sheet. Escape, Enter
// or a click anywhere puts it away; the focus goes back to whatever had it.
export function imageOverlay(source: string): void {
  const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  function close(): void {
    remove();
    previous?.focus();
  }
  const { dialog, remove } = openOverlay('image-viewer', close);
  const image = document.createElement('img');
  image.src = source;
  dialog.append(image);
  dialog.addEventListener('click', close);
  answerKeys(dialog, close);
  dialog.focus();
}

// A PDF in Chromium's own viewer, on the same sheet; the window turns plugins on for it. Escape or
// Enter puts it away while the sheet has the keyboard, and the dark margin does once the viewer has
// taken it. A click inside the viewer is the viewer's, so the box does not close on one.
export function pdfOverlay(source: string, closed: () => void): void {
  const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  function close(): void {
    remove();
    closed();
    previous?.focus();
  }
  const { dialog, remove } = openOverlay('pdf-viewer', close);
  const frame = document.createElement('iframe');
  frame.src = source;
  dialog.append(frame);
  answerKeys(dialog, close);
  dialog.focus();
}

// The same sheet with a box to type in instead of a question to answer. Enter takes what you typed,
// Escape and a click on the dark margin leave it alone, through the same answerKeys as confirmOverlay.
//
// Empty and cancelled are different answers. Empty is a thing you typed — for the caller to read as
// "none of mine" — where null is you never meant to open this.
//
// The keys line is the caller's to write, like confirmOverlay's and for the same reason: only the
// caller knows what an empty box means to it, and that is the one thing about this dialog nothing on
// screen would otherwise say.
export function promptOverlay(
  question: string,
  current: string,
  placeholder: string,
  keysLine: string,
): Promise<string | null> {
  return new Promise<string | null>((resolve) => {
    function close(answer: string | null): void {
      remove();
      resolve(answer);
    }

    const { dialog, remove } = openOverlay('prompt', () => close(null));

    const label = document.createElement('p');
    label.className = 'prompt-question';
    label.textContent = question;

    const input = document.createElement('input');
    input.className = 'prompt-input';
    input.value = current;
    input.placeholder = placeholder;
    // Every box you type into carries this: without it a Persian name runs away from the caret, and
    // Home and End go to the opposite ends of what you see.
    input.dir = 'auto';
    const keys = document.createElement('p');
    keys.className = 'prompt-keys';
    keys.textContent = keysLine;
    dialog.append(label, input, keys);
    input.focus();
    input.select();

    answerKeys(dialog, (key) => close(key === 'Enter' ? input.value : null));
  });
}

// One row of a search list: what it is called, what else is worth saying about it, and what choosing
// it answers with. The choice is the caller's own type — a project's path here, a card's id there —
// so nothing about what a row means leaks into the dialog that draws it.
export type SearchRow<Choice> = {
  name: string;
  detail: string;
  choice: Choice;
  // The row's own class, on top of the list's. Only a row that is not one of the things being
  // searched needs one — the picker's line that opens a folder dialog.
  className?: string;
};

// The third sheet: a box to type in with a list under it that the arrows walk, Enter takes the
// highlighted row and Escape leaves. Three dialogs are this — the project picker, the board's card
// search and the Claude screen's /resume conversation picker — and they differ only in what a row
// is and where the rows come from, so the dialog is here and each caller keeps its own rows.
//
// `rows` is asked again each time what has been typed changes rather than given a list once, because
// the list is a function of what has been typed — and because the board can be written under an open
// search, so the caller reads the live board each time it is asked. An arrow key is not a change to
// what has been typed and does not ask again; the list it walks is the one the last keystroke left.
//
// Undefined is the dialog being dismissed, which is not any row's choice. A caller whose rows carry
// undefined as a choice of their own cannot tell the two apart; none does, and a row that means
// "none of these" is better written as a row with a choice that says so.
export function searchOverlay<Choice>(options: {
  // The dialog's own class, which is also the prefix its parts are named with.
  name: string;
  placeholder: string;
  rows: (query: string) => SearchRow<Choice>[];
  // What the list says when nothing matched. A dialog whose list always has a row in it leaves it
  // out, rather than carrying a sentence nothing can show.
  empty?: string;
  // The icon each row leads with, by what the row is.
  glyph: (row: SearchRow<Choice>) => IconName;
}): Promise<Choice | undefined> {
  let rows: SearchRow<Choice>[] = [];
  let highlighted = 0;

  return new Promise<Choice | undefined>((resolve) => {
    function finish(choice: Choice | undefined): void {
      remove();
      resolve(choice);
    }

    const { dialog, remove } = openOverlay(options.name, () => finish(undefined));
    const box = document.createElement('input');
    box.className = 'search-input';
    // A folder or a card with a Persian name is typed right to left, and the box turns round to match.
    box.dir = 'auto';
    box.placeholder = options.placeholder;
    const list = document.createElement('ul');
    list.className = 'search-list';
    dialog.append(box, list);
    box.focus();

    function renderRow(row: SearchRow<Choice>, index: number): HTMLElement {
      const item = document.createElement('li');
      if (index === highlighted) item.classList.add('highlighted');
      if (row.className) item.classList.add(row.className);
      const name = document.createElement('span');
      name.className = 'search-name';
      name.textContent = row.name;
      const detail = document.createElement('span');
      detail.className = 'search-detail';
      detail.textContent = row.detail;
      item.append(icon(options.glyph(row)), name, detail);
      item.addEventListener('click', () => finish(row.choice));
      return item;
    }

    // The list as it stands. Separate from asking for the rows, because an arrow key moves the
    // highlight and nothing else: the board's search reads every card's description and trail to
    // answer a query, and doing that again to move one row down is a whole search per keystroke.
    function draw(): void {
      highlighted = clampIndex(highlighted, rows.length - 1);
      list.replaceChildren(...rows.map(renderRow));
      // Nothing matched, and an empty box under a search reads as a dialog that broke rather than as
      // an answer. Not a row: there is nothing to press Enter on.
      if (rows.length === 0 && options.empty !== undefined) {
        const said = document.createElement('li');
        said.className = 'search-empty';
        said.textContent = options.empty;
        list.append(said);
      }
      list.children[highlighted]?.scrollIntoView({ block: 'nearest' });
    }

    // What has been typed has changed, so the answer has to be asked for again.
    function search(): void {
      rows = options.rows(box.value);
      draw();
    }

    function move(step: number): void {
      if (rows.length === 0) return;
      highlighted = (highlighted + step + rows.length) % rows.length;
      draw();
    }

    box.addEventListener('input', () => {
      highlighted = 0;
      search();
    });
    box.addEventListener('keydown', (event) => {
      // Nothing else in the dialog is focusable, so Tab would drop focus into the pane behind the
      // overlay — and so would Shift+Tab, which is why this comes before the modified keys are
      // handed back.
      if (event.key === 'Tab') return event.preventDefault();
      if (isModified(event)) return;
      switch (event.key) {
        case 'Escape': return finish(undefined);
        // Nothing matched means nothing to take, and a dialog that closes on an Enter that chose
        // nothing is a dialog you have to open again.
        case 'Enter': return rows.length === 0 ? undefined : finish(rows[highlighted].choice);
        case 'ArrowDown': event.preventDefault(); return move(1);
        case 'ArrowUp': event.preventDefault(); return move(-1);
      }
    });
    search();
  });
}

// What "a dialog owns the keyboard" matches, for asking either way round: is this keystroke inside a
// dialog, and is any dialog up at all. It lives here because this is where a sheet gets its class, so
// a new dialog opened through openOverlay is covered without a second list to keep in step.
// .board-edit is spelled out: it is not a sheet, it is an input inside a card (board-view.ts). So is
// .file-hints, the hint key's letters laid over a pane (file-hints.ts), which is no sheet either.
export const OVERLAY_SELECTOR = `.${OVERLAY_CLASS}, .board-edit, .file-hints`;
