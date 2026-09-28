import { describe, expect, it, vi } from 'vitest';
import type { DashboardBridge } from './bridge';
import { reportBoardWrites } from './board-writes';

const empty = { columns: [] };

// Runs the write, lets its side chain settle, and returns what went to the process's unhandled
// rejection handler — the window's `unhandledrejection` in the app.
async function unhandledDuring(run: () => Promise<unknown>): Promise<unknown[]> {
  const thrown: unknown[] = [];
  const onRejection = (reason: unknown) => { thrown.push(reason); };
  process.on('unhandledRejection', onRejection);
  try {
    await run();
    await new Promise((resolve) => setTimeout(resolve, 0));
  } finally {
    process.off('unhandledRejection', onRejection);
  }
  return thrown;
}

describe('reportBoardWrites', () => {
  it('names the project once its write has landed', async () => {
    const writeBoard = vi.fn(() => Promise.resolve());
    // Frozen, because the bridge contextBridge hands the page is.
    const writes = reportBoardWrites(Object.freeze({ writeBoard, platform: 'darwin' }) as unknown as DashboardBridge);
    const listener = vi.fn();
    writes.onWrite(listener);
    await writes.bridge.writeBoard('/work/api', empty);
    expect(writeBoard).toHaveBeenCalledWith('/work/api', empty);
    expect(listener).toHaveBeenCalledWith('/work/api');
    expect(writes.bridge.platform).toBe('darwin');
  });

  // The file is as it was, so there is nothing new to read.
  it('says nothing about a write that failed, and still fails it', async () => {
    const writes = reportBoardWrites(Object.freeze({ writeBoard: () => Promise.reject(new Error('disk full')) }) as unknown as DashboardBridge);
    const listener = vi.fn();
    writes.onWrite(listener);
    const thrown = await unhandledDuring(() => expect(writes.bridge.writeBoard('/work/api', empty)).rejects.toThrow('disk full'));
    expect(listener).not.toHaveBeenCalled();
    // Only the caller hears of it, not the window's handler as well.
    expect(thrown).toHaveLength(0);
  });

  // The file was written, so the board must not say it was not.
  it('still resolves the write when a listener throws', async () => {
    const writes = reportBoardWrites(Object.freeze({ writeBoard: () => Promise.resolve() }) as unknown as DashboardBridge);
    writes.onWrite(() => { throw new Error('listener broke'); });
    const thrown = await unhandledDuring(() => expect(writes.bridge.writeBoard('/work/api', empty)).resolves.toBeUndefined());
    expect(thrown).toHaveLength(1);
  });
});
