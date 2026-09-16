export type NotesOptions = {
  projectPath: string;
  read(projectPath: string): Promise<string>;
  write(projectPath: string, text: string): Promise<void>;
  // The status bar's error span. A write that lands clears whatever it replaces, the way the board's
  // does — nothing else knows the message has gone stale.
  onError(message: string): void;
};

export type NotesView = {
  element: HTMLElement;
  // Arriving: whatever has not been written yet goes to disk first, then the file is read back. The
  // flush is what stops a quick Ctrl+B and straight back landing on the page from before your last
  // sentence.
  open(): Promise<void>;
  focus(): void;
};

// How long the box waits after you stop typing before it writes. The board saves on every change
// because a keystroke there is a whole card moving; here a keystroke is a letter, and writing the
// file on each one is a write per character.
//
// Nothing is lost by waiting. The timer holds the box itself, not the page, so a project closed a
// keystroke later still writes what you typed into it; and the quit dialog asks before the window
// goes, which is far longer than this.
const SAVE_DELAY_MS = 400;

// One page of free text per project, kept in .dashboard/notes.md. A textarea and nothing else: there
// is no key of its own on this screen, so every keystroke that is not somebody's shortcut is a
// character, and no handler here reads event.key — which is why there is no isModified guard to get
// wrong. The window's one lookup still answers Ctrl+B and the rest, because the box is not a dialog
// and OVERLAY_SELECTOR does not name it.
export function createNotesView(options: NotesOptions): NotesView {
  const element = document.createElement('div');
  element.className = 'view view-notes';

  const area = document.createElement('textarea');
  area.className = 'notes-text';
  area.placeholder = 'Notes for this project. Saved to .dashboard/notes.md as you type.';
  area.spellcheck = false;
  // Every box you type into carries this. Without it a Persian note runs away from the caret, ending
  // punctuation lands on the wrong side, and Home and End go to the opposite ends of what you see.
  area.dir = 'auto';
  element.append(area);

  let pending: number | undefined;

  function write(): Promise<void> {
    return options.write(options.projectPath, area.value).then(
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

  area.addEventListener('input', () => {
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
      // so until something here has the keyboard a character typed straight after the mode key lands
      // nowhere.
      area.focus();
      await flush();
      area.value = await options.read(options.projectPath);
    },
    focus(): void {
      area.focus();
    },
  };
}
