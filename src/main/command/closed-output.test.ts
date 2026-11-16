import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { endQuietlyWhenOutputCloses } from './closed-output';

function writeFailure(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(`write ${code}`), { code });
}

describe('endQuietlyWhenOutputCloses', () => {
  // `board list | head`: head has read its ten lines and gone.
  it('swallows the failure when the reader closes the pipe', () => {
    const output = new EventEmitter();
    endQuietlyWhenOutputCloses(output);
    expect(() => output.emit('error', writeFailure('EPIPE'))).not.toThrow();
  });

  // A full disk under `board list > cards.txt` is a failure, not a reader that left.
  it('throws any other write failure', () => {
    const output = new EventEmitter();
    endQuietlyWhenOutputCloses(output);
    expect(() => output.emit('error', writeFailure('ENOSPC'))).toThrow('write ENOSPC');
  });
});
