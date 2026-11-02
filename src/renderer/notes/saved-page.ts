import { failureText } from '../../shared/errors/failure';
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
  type StrandedWords,
} from './notes-state';

// How long a page waits after the last change before it writes. A write per keystroke or per stroke
// would carry the whole page each time; nothing is lost by waiting, because the timer holds the page
// itself, and arriving flushes it first.
export const SAVE_DELAY_MS = 400;

export type SavedPageOptions = {
  // What the bar calls this page: "Notes not saved", "Handwriting not read".
  name: string;
  // The page on screen, in the form it is written.
  text(): string;
  // Put a file that was read on screen. Answers the text the page now holds, in the form `text()`
  // answers it, or `undefined` for a file this page cannot show — which counts as a failed read, so
  // the first change after it cannot replace somebody's file with a page of its own.
  show(text: string): string | undefined;
  load(): Promise<string>;
  save(text: string): Promise<void>;
  // While true, a read would take the page out from under the person changing it, and is skipped.
  busy?(): boolean;
  // The way out of a stranded page, in this page's own words and keys.
  strandedWords(): StrandedWords;
  onError(message: string): void;
};

export type SavedPage = {
  // The page changed on screen: write it once the wait is over.
  changed(): void;
  // Arriving, or another screen wrote this page: the change not yet written goes first, then the file
  // is read back where the page agrees with it. Never rejects; a failure reports through onError.
  read(): Promise<void>;
};

// The saving and reading both notes pages share, over notes-state.ts's rules: a page never shown the
// file is never written over it, a change a write did not take is not read over, and of two reads in
// flight only the newer one lands.
export function createSavedPage(options: SavedPageOptions): SavedPage {
  let pending: ReturnType<typeof setTimeout> | undefined;
  let state: NotesState = UNREAD_NOTES;
  // Which arrival's read is the current one: an older one coming back last would show the older page.
  let latestRead = 0;
  const busy = (): boolean => options.busy?.() ?? false;

  function write(): Promise<void> {
    // Asked here and not only where the timer is set: a read can fail while the wait is running, and
    // the page it shuts is the page this write would send.
    if (!mayWrite(state)) return Promise.resolve();
    // The page as it goes out, not as it is when the write answers: it keeps changing meanwhile.
    const text = options.text();
    return options.save(text).then(
      () => {
        state = writeLanded(state, text);
        // Only while the page is still the file's: a write that lands after a read failed would
        // otherwise wipe the message about a page that is now shut.
        if (mayWrite(state)) options.onError('');
      },
      (error: unknown) => {
        options.onError(`${options.name} not saved: ${failureText(error)}`);
      },
    );
  }

  function flush(): Promise<void> {
    if (pending === undefined) return Promise.resolve();
    clearTimeout(pending);
    pending = undefined;
    return write();
  }

  // Said on every arrival that refuses to read, not once: the bar keeps a message only until something
  // else takes it, and a page nothing can save would be silent from then on.
  function sayIfStranded(): void {
    if (isStranded(state, options.text())) options.onError(strandedMessage(state, options.strandedWords()));
  }

  function refusesRead(): boolean {
    if (mayRead(state, options.text())) return false;
    sayIfStranded();
    return true;
  }

  async function read(): Promise<void> {
    await flush();
    const token = ++latestRead;
    if (busy() || refusesRead()) return;
    const notRead = `${options.name} not read, so nothing is written`;
    let text: string;
    try {
      text = await options.load();
    } catch (error: unknown) {
      if (token === latestRead) {
        state = readFailed(state);
        options.onError(`${notRead}: ${failureText(error)}`);
      }
      return;
    }
    // Asked again: the page can change while the read is away, since arriving takes the keyboard first.
    if (token !== latestRead || busy() || refusesRead()) return;
    const shown = options.show(text);
    if (shown === undefined) {
      state = readFailed(state);
      options.onError(`${notRead}: the file is not in the format this page saves.`);
      return;
    }
    state = readLanded(shown);
    options.onError('');
  }

  return {
    changed(): void {
      clearTimeout(pending);
      pending = setTimeout(() => {
        pending = undefined;
        void write();
      }, SAVE_DELAY_MS);
    },
    read,
  };
}
