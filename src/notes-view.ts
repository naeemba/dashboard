import type { DashboardBridge } from './bridge';
import {
  mayRead,
  mayWrite,
  readFailed,
  readLanded,
  UNREAD_NOTES,
  writeLanded,
  type NotesState,
} from './notes-state';

export type NotesOptions = {
  bridge: DashboardBridge;
  projectPath: string;
  // The status bar's error span. A write that lands clears whatever it replaces, the way the board's
  // does — nothing else knows the message has gone stale.
  onError(message: string): void;
};

export type NotesView = {
  element: HTMLTextAreaElement;
  // Arriving: whatever has not been written yet goes to disk first, then the file is read back. The
  // flush is what stops a quick Ctrl+B and straight back landing on the page from before your last
  // sentence. The read only happens where the file agrees with the box — a sentence no write took,
  // whether it was the flush just now or one that failed ten minutes ago, is kept instead of being
  // replaced by the older page. Never rejects — a read or a write that fails reports itself through
  // onError — so the caller has nothing to catch.
  open(): Promise<void>;
};

// How long the box waits after you stop typing before it writes. The board saves on every change
// because a keystroke there is a whole card moving; here a keystroke is a letter, and writing the
// file on each one is a write per character.
//
// Nothing is lost by waiting. The timer holds the box itself, not the page, so a project closed a
// keystroke later still writes what you typed into it; and the quit dialog asks before the window
// goes, which is far longer than this.
const SAVE_DELAY_MS = 400;

// One page of free text per project, kept in .dashboard/notes.md. A textarea and nothing else — it is
// the view's whole element, the way nvim is the whole of its own screen — so there is no key of its
// own here and every keystroke that is not somebody's shortcut is a character. The window's one lookup
// still answers Ctrl+B and the rest, because the box is not a dialog and OVERLAY_SELECTOR does not
// name it. Tab is the single exception, and the listener below says why.
export function createNotesView(options: NotesOptions): NotesView {
  const element = document.createElement('textarea');
  element.className = 'notes-text';
  element.placeholder = 'Notes for this project. Saved to .dashboard/notes.md as you type.';
  element.spellcheck = false;
  // Every box you type into carries this. Without it a Persian note runs away from the caret, ending
  // punctuation lands on the wrong side, and Home and End go to the opposite ends of what you see.
  element.dir = 'auto';

  // Nothing else on this screen is focusable and Tab is bound to nothing here, so the browser's own
  // Tab would take the keyboard out of the box with nothing on screen saying where it went — and the
  // mode key cannot bring it back, because it names the mode you are already on. Shift+Tab the same
  // way, which is why this comes before any question about modifiers.
  element.addEventListener('keydown', (event) => {
    if (event.key === 'Tab') event.preventDefault();
  });

  let pending: number | undefined;

  // What the file is known to hold, and whether the box was ever shown it. notes-state.ts is where
  // both questions this screen asks of that are answered, and where they are tested.
  let state: NotesState = UNREAD_NOTES;

  // Which arrival's read is the current one. Two arrivals close together leave two reads in flight,
  // and the older one coming back last would put the older page in the box.
  let latestRead = 0;

  function write(): Promise<void> {
    // The text as it goes out, not as it is by the time the write answers: you keep typing while it
    // is away, and what the file ends up holding is what was sent.
    const text = element.value;
    return options.bridge.writeNotes(options.projectPath, text).then(
      () => {
        state = writeLanded(state, text);
        options.onError('');
      },
      (error: unknown) => {
        options.onError(`Notes not saved: ${String(error)}`);
      },
    );
  }

  // Whatever the timer was holding, now, so arriving can wait for it. Whether it landed is not
  // answered here — a write that failed before the timer was even set is just as much a reason to
  // leave the box alone, and only what the file is known to hold can tell the two apart.
  function flush(): Promise<void> {
    if (pending === undefined) return Promise.resolve();
    window.clearTimeout(pending);
    pending = undefined;
    return write();
  }

  element.addEventListener('input', () => {
    if (!mayWrite(state)) return;
    window.clearTimeout(pending);
    pending = window.setTimeout(() => {
      pending = undefined;
      void write();
    }, SAVE_DELAY_MS);
  });

  return {
    element,
    async open(): Promise<void> {
      // Focus before the read, the way the board takes it: the view you came from is already hidden,
      // so until the box has the keyboard a character typed straight after the mode key lands nowhere.
      element.focus();
      await flush();
      const token = ++latestRead;
      // The box holds something the file does not: a sentence a write never took, or a paragraph
      // typed into a box a read never filled. Reading would replace it with the older page and it
      // would be gone from the box as well as the file. The message from the failure is already up.
      if (!mayRead(state, element.value)) return;
      let text: string;
      try {
        text = await options.bridge.readNotes(options.projectPath);
      } catch (error: unknown) {
        // Said out loud rather than thrown. The box keeps whatever it was showing, which is the last
        // thing that was on disk, so a folder that has gone unreadable does not also blank the page in
        // front of you and then save the blank back over it. On a first arrival it was showing
        // nothing, so the box stays shut for typing until a read lands, and the message says so.
        if (token === latestRead) {
          state = readFailed(state);
          options.onError(`Notes not read, so nothing is written: ${String(error)}`);
        }
        return;
      }
      // A read another one has overtaken says nothing: the newer one is the page you asked for. And
      // the box is asked again because you have the keyboard while the read is away — the focus above
      // is taken before it on purpose — so a character typed into the gap is text like any other.
      if (token !== latestRead || !mayRead(state, element.value)) return;
      element.value = text;
      state = readLanded(text);
      // A read that lands clears the failure it replaces; nothing else knows the message is stale.
      options.onError('');
    },
  };
}
