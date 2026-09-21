import type { DashboardBridge } from './bridge';
import {
  isStranded,
  mayRead,
  mayWrite,
  readFailed,
  readLanded,
  strandedMessage,
  UNREAD_NOTES,
  writeLanded,
  type NotesState,
} from './notes-state';

export type NotesOptions = {
  bridge: DashboardBridge;
  projectPath: string;
  // What an empty box says, which is the one thing that differs between the two pages that have one:
  // a project's notes sit in that project's folder, the manager's sit in the home directory. Handed
  // in rather than worked out from the path here, because which folder a path means is
  // dashboard-folder.ts's answer, and a second reading of it here is a second sentence to keep true.
  placeholder: string;
  // The status bar's error span. A write or a read that lands clears whatever it replaces, the way the
  // board's does — nothing else knows the message has gone stale.
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

// One page of free text per page that has one: a project's, kept in .dashboard/notes.md inside the
// project, and the manager's, kept under that same name in the home directory.
// A textarea and nothing else — it is
// the view's whole element, the way nvim is the whole of its own screen — so there is no key of its
// own here and every keystroke that is not somebody's shortcut is a character. The window's one lookup
// still answers Ctrl+B and the rest, because the box is not a dialog and OVERLAY_SELECTOR does not
// name it. Tab is the single exception, and the listener below says why.
export function createNotesView(options: NotesOptions): NotesView {
  const element = document.createElement('textarea');
  element.className = 'notes-text';
  element.placeholder = options.placeholder;
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
    // Asked here and not only at the keystroke that set the timer. A read can fail while the 400ms is
    // running — you are typing into the box the whole time the read is away — and the box it shuts is
    // the box this write would send. Both ways in go through here: the timer and the arrival's flush.
    if (!mayWrite(state)) return Promise.resolve();
    // The text as it goes out, not as it is by the time the write answers: you keep typing while it
    // is away, and what the file ends up holding is what was sent.
    const text = element.value;
    return options.bridge.writeNotes(options.projectPath, text).then(
      () => {
        state = writeLanded(state, text);
        // Only while the box is still the file's. A write sent before an arrival's read failed lands
        // after it, and clearing then would wipe the message about a box that is now shut.
        if (mayWrite(state)) options.onError('');
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

  // Said on every arrival that refuses to read, not once at the failure that started it: showError
  // keeps a message only while the owner matches, so the one posted at the failure is gone as soon as
  // anything else has taken the span, and the box that nothing can save would be silent from then on.
  function sayIfStranded(): void {
    if (isStranded(state, element.value)) options.onError(strandedMessage(state));
  }

  element.addEventListener('input', () => {
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
      // would be gone from the box as well as the file.
      if (!mayRead(state, element.value)) {
        sayIfStranded();
        return;
      }
      let text: string;
      try {
        text = await options.bridge.readNotes(options.projectPath);
      } catch (error: unknown) {
        // Said out loud rather than thrown. The box keeps whatever it was showing, which is the last
        // thing that was on disk, so a folder that has gone unreadable does not also blank the page in
        // front of you and then save the blank back over it. On a first arrival it was showing
        // nothing, so the box is shut for writing from here on, and type into it before a read lands
        // and it is shut for reading too — sayIfStranded is what keeps saying so.
        if (token === latestRead) {
          state = readFailed(state);
          options.onError(`Notes not read, so nothing is written: ${String(error)}`);
        }
        return;
      }
      // A read another one has overtaken says nothing: the newer one is the page you asked for. And
      // the box is asked again because you have the keyboard while the read is away — the focus above
      // is taken before it on purpose — so a character typed into the gap is text like any other.
      if (token !== latestRead) return;
      if (!mayRead(state, element.value)) {
        sayIfStranded();
        return;
      }
      element.value = text;
      state = readLanded(text);
      // A read that lands clears the failure it replaces; nothing else knows the message is stale.
      options.onError('');
    },
  };
}
