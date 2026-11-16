import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { endQuietlyWhenOutputCloses } from './closed-output';

function writeFailure(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(`write ${code}`), { code });
}

describe('endQuietlyWhenOutputCloses', () => {
  // `board list | head`: head has read its ten lines and gone.
  it('ends with exit 0 when the reader closes the pipe', () => {
    const output = new EventEmitter();
    const exit = vi.fn();
    endQuietlyWhenOutputCloses(output, exit);
    output.emit('error', writeFailure('EPIPE'));
    expect(exit).toHaveBeenCalled();
  });

  // A full disk under `board list > cards.txt` is a failure, not a reader that left.
  it('throws any other write failure', () => {
    const output = new EventEmitter();
    const exit = vi.fn();
    endQuietlyWhenOutputCloses(output, exit);
    expect(() => output.emit('error', writeFailure('ENOSPC'))).toThrow('write ENOSPC');
    expect(exit).not.toHaveBeenCalled();
  });
});
