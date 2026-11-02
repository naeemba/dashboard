import type { DashboardBridge } from '../../shared/app/bridge';
import { TEXT_STRANDED } from './notes-state';
import { createSavedPage } from './saved-page';

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
  // Another screen wrote a page of notes. Read again the way open() does, but only when the page is
  // this box's own, and without the keyboard: you did not ask to come here.
  reload(projectPath: string): Promise<void>;
};

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

  // Tab is bound to nothing here, so the browser's own Tab would take the keyboard out of the box.
  // On a project's page that's the whole screen and there is nothing else to land on; on the
  // manager's page the section strip sits above it and its four names are focusable buttons, so Tab
  // would leave the box for one of those with nothing on screen saying where it went — and the mode
  // key cannot bring it back, because it names the mode you are already on. Shift+Tab the same way,
  // which is why this comes before any question about modifiers.
  element.addEventListener('keydown', (event) => {
    if (event.key === 'Tab') event.preventDefault();
  });

  // The wait before a write, the flush on arrival and the rules about when the box may be read over
  // or written out are saved-page.ts's, shared with the handwriting page.
  const page = createSavedPage({
    name: 'Notes',
    text: () => element.value,
    show: (text) => {
      element.value = text;
      return text;
    },
    load: () => options.bridge.readNotes(options.projectPath),
    save: (text) => options.bridge.writeNotes(options.projectPath, text),
    strandedWords: () => TEXT_STRANDED,
    onError: options.onError,
  });

  element.addEventListener('input', () => page.changed());

  return {
    element,
    open(): Promise<void> {
      // Focus before the read, the way the board takes it: the view you came from is already hidden,
      // so until the box has the keyboard a character typed straight after the mode key lands nowhere.
      element.focus();
      return page.read();
    },
    reload: (projectPath) => (projectPath === options.projectPath ? page.read() : Promise.resolve()),
  };
}
