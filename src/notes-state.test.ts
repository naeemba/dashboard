import { describe, expect, it } from 'vitest';
import {
  isStranded,
  mayRead,
  mayWrite,
  readFailed,
  readLanded,
  UNREAD_NOTES,
  writeLanded,
  type NotesState,
} from './notes-state';

describe('what the notes box may do', () => {
  it('writes nothing out of a box no read has filled', () => {
    // First arrival, the read failed: the box is empty because it was never filled, and the
    // placeholder says this project has never had notes. One character 400ms later would be the file.
    expect(mayWrite(readFailed(UNREAD_NOTES))).toBe(false);
    expect(mayWrite(UNREAD_NOTES)).toBe(false);
  });

  it('writes out of a box a read has filled', () => {
    expect(mayWrite(readLanded('three months of notes\n'))).toBe(true);
  });

  it('stops writing again as soon as a read fails', () => {
    // Second arrival, the read fails. The box still holds the page from before, and typing into it
    // would write that whole page back over a file nobody could read.
    expect(mayWrite(readFailed(readLanded('three months of notes\n')))).toBe(false);
  });

  it('reads on a first arrival and not over a paragraph typed before one landed', () => {
    expect(mayRead(UNREAD_NOTES, '')).toBe(true);
    // The read failed, nothing stopped you typing, and this paragraph is on screen and nowhere else.
    expect(mayRead(readFailed(UNREAD_NOTES), 'typed into a box that was never filled')).toBe(false);
  });

  it('reads over a box the file agrees with, whoever put the text there', () => {
    const read: NotesState = readLanded('friday\n');
    expect(mayRead(read, 'friday\n')).toBe(true);
    expect(mayRead(writeLanded(read, 'friday\nmonday\n'), 'friday\nmonday\n')).toBe(true);
  });

  it('keeps a sentence a write did not take, however long ago the write went out', () => {
    // Type a sentence, the timer fires, the write fails — the share dropped, the folder went
    // read-only. Leave and come back, a second later or ten minutes later: the read would replace the
    // sentence with the older page and it would be gone from the box as well as the file.
    const read: NotesState = readLanded('friday\n');
    expect(mayRead(read, 'friday\nmonday\n')).toBe(false);
    // And a write that did land moves the file on, so the arrival after that one reads again.
    expect(mayRead(writeLanded(read, 'friday\nmonday\n'), 'friday\nmonday\n')).toBe(true);
  });

  it('calls a box stranded when it can neither be read into nor written out', () => {
    // First arrival, the read failed, and nothing stopped you typing. Reading would take the half page
    // off the screen, writing would put it over a file nobody has seen — so neither happens, on this
    // arrival or any after it, and the bar has to say so every time rather than once.
    const typedAfterAFailedFirstRead = readFailed(UNREAD_NOTES);
    expect(isStranded(typedAfterAFailedFirstRead, 'the staging password')).toBe(true);
    // An untouched box on a first arrival is not stranded: it reads.
    expect(isStranded(typedAfterAFailedFirstRead, '')).toBe(false);
    // Nor is a sentence a write did not take. The file was read once, so the box may still be written.
    expect(isStranded(readLanded('friday\n'), 'friday\nmonday\n')).toBe(false);
  });

  it('does not take an empty file for a file nobody has read', () => {
    // Emptying the page is a page: the box and the file agree, so arriving reads.
    expect(mayRead(readLanded(''), '')).toBe(true);
    // Where nothing has been read, the same empty box is the one thing that must not be written out.
    expect(mayWrite(readLanded(''))).toBe(true);
    expect(mayWrite(UNREAD_NOTES)).toBe(false);
  });
});
