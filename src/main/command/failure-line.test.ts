import { describe, expect, it } from 'vitest';
import { failureLine } from './failure-line';

describe('failureLine', () => {
  // A board that cannot be read is the terminal's problem, not a programming mistake: one sentence.
  it('answers an fs failure with its sentence', () => {
    const failure = Object.assign(new Error("EACCES: permission denied, open '.dashboard/board.json'"), { code: 'EACCES' });
    expect(failureLine(failure)).toBe("EACCES: permission denied, open '.dashboard/board.json'");
  });

  // A bug in here is answered with the file and the line, or an agent has nothing to open.
  it('keeps the stack of anything without an errno', () => {
    const bug = new Error("Cannot read properties of undefined (reading 'title')");
    expect(failureLine(bug)).toBe(bug.stack);
  });

  // Nothing thrown is required to be an Error, and a line is still owed.
  it('falls back to what a non-Error prints as', () => {
    expect(failureLine('board.json is gone')).toBe('board.json is gone');
  });
});
