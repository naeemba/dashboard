import { describe, expect, it, vi } from 'vitest';
import type { DashboardBridge } from './bridge';
import { reportBoardWrites } from './board-writes';

const empty = { columns: [] };

describe('reportBoardWrites', () => {
  it('names the project once its write has landed', async () => {
    const writeBoard = vi.fn(() => Promise.resolve());
    const writes = reportBoardWrites({ writeBoard, platform: 'darwin' } as unknown as DashboardBridge);
    const listener = vi.fn();
    writes.onWrite(listener);
    await writes.bridge.writeBoard('/work/api', empty);
    expect(writeBoard).toHaveBeenCalledWith('/work/api', empty);
    expect(listener).toHaveBeenCalledWith('/work/api');
    expect(writes.bridge.platform).toBe('darwin');
  });

  // The file is as it was, so there is nothing new to read.
  it('says nothing about a write that failed, and still fails it', async () => {
    const writes = reportBoardWrites({ writeBoard: () => Promise.reject(new Error('disk full')) } as unknown as DashboardBridge);
    const listener = vi.fn();
    writes.onWrite(listener);
    await expect(writes.bridge.writeBoard('/work/api', empty)).rejects.toThrow('disk full');
    expect(listener).not.toHaveBeenCalled();
  });
});
