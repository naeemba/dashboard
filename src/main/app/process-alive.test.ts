import { describe, expect, it } from 'vitest';
import { processAlive } from './process-alive';

describe('processAlive', () => {
  // Signal 0 sends nothing: it only asks. EPERM is a process that runs under another user.
  it('reads a process as running unless signalling it finds none', () => {
    const failing = (code: string) => () => { throw Object.assign(new Error(code), { code }); };
    expect(processAlive(41, () => true)).toBe(true);
    expect(processAlive(41, failing('EPERM'))).toBe(true);
    expect(processAlive(41, failing('ESRCH'))).toBe(false);
    expect(processAlive(process.pid)).toBe(true);
  });
});
