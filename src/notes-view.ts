import type { DashboardBridge } from './bridge';

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
  // sentence. Never rejects — a read or a write that fails reports itself through onError — so the
  // caller has nothing to catch.
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

  function write(): Promise<void> {
    return options.bridge.writeNotes(options.projectPath, element.value).then(
      () => options.onError(''),
      (error: unknown) => options.onError(`Notes not saved: ${String(error)}`),
    );
  }

  // Whatever the timer was holding, now. Answers with the write so the read on arrival can wait for
  // it; with nothing pending there is nothing to wait for.
  function flush(): Promise<void> {
    if (pending === undefined) return Promise.resolve();
    window.clearTimeout(pending);
    pending = undefined;
    return write();
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
      try {
        element.value = await options.bridge.readNotes(options.projectPath);
      } catch (error: unknown) {
        // Said out loud rather than thrown. The box keeps whatever it was showing, which is the last
        // thing that was on disk, so a folder that has gone unreadable does not also blank the page in
        // front of you and then save the blank back over it.
        options.onError(`Notes not read: ${String(error)}`);
      }
    },
  };
}
