// The two answers the notes screen needs, over plain values: may what is in the box be written to the
// file, and may this arrival replace the box with the file. Both come out of one fact — what the file
// is known to hold — which the box cannot be asked for, because the box is what the question is about.
//
// It lives here rather than inline in the view because it is three rules with a branch each, and each
// one of them is a page of notes if it goes: a box that was never filled saved over the file, an old
// page saved over a file nobody could read, a sentence a write did not take replaced by the older page.
export type NotesState = {
  // What the file is known to hold: the page the last read brought back, or the text the last write
  // sent. `undefined` until a read lands, and that is not the same as '' — a file nobody has read yet
  // may hold three months of notes.
  savedText: string | undefined;
  // Whether the box on screen is showing a read that landed. A read that failed leaves whatever was
  // there before it, which on a first arrival is nothing at all.
  showsTheFile: boolean;
};

export const UNREAD_NOTES: NotesState = { savedText: undefined, showsTheFile: false };

export function readLanded(text: string): NotesState {
  return { savedText: text, showsTheFile: true };
}

// A read that failed says nothing about the file, so what is known about it stands. What it does say
// is that the box is not the file: it is the page from before, or on a first arrival an empty box that
// looks exactly like a project that has never had notes.
export function readFailed(state: NotesState): NotesState {
  return { savedText: state.savedText, showsTheFile: false };
}

// A write that landed makes the file hold what was sent. A write that failed has no entry here on
// purpose: nothing is known to have changed, so nothing does.
export function writeLanded(state: NotesState, text: string): NotesState {
  return { savedText: text, showsTheFile: state.showsTheFile };
}

// Only a box that was shown the file may be written back over it.
export function mayWrite(state: NotesState): boolean {
  return state.showsTheFile;
}

// Only a box the file agrees with may be replaced by a fresh read. Anything else in there is text that
// exists nowhere else: a sentence a write did not take, or a paragraph typed into a box whose read
// failed. Reading over it loses it from the box as well as the file.
export function mayRead(state: NotesState, boxText: string): boolean {
  return state.savedText === undefined ? boxText === '' : state.savedText === boxText;
}

// A box that can neither be read into nor written out of: the pair of the two refusals above, asked as
// one question so the message on screen is derived from what the view decides rather than repeating it.
//
// It is a first arrival whose read failed and was then typed into. Nothing is known about the file, so
// reading now would take what you typed off the screen; nothing was ever shown, so writing would put it
// over a file that may hold three months of notes. Every arrival after that one finds it the same way.
export function isStranded(state: NotesState, boxText: string): boolean {
  return !mayRead(state, boxText) && !mayWrite(state);
}
