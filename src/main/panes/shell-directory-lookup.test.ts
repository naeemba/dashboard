import { describe, expect, it, vi } from 'vitest';
import { shellLiveness } from './shell-directory-lookup';

describe('shellLiveness', () => {
  const shells = new Map([['0-1', { pid: 10 }]]);
  const opened = new Map([['0-1', { directory: '/code/api' }]]);

  it('answers yes from the opened folder without asking a process', async () => {
    const ask = vi.fn();
    const lives = shellLiveness({ shells, opened, shellsIn: () => ['0-1'], ask });
    await expect(lives('/code/api-wt')).resolves.toBe(true);
    expect(ask).not.toHaveBeenCalled();
  });

  it('asks where the shell is now when none was opened there', async () => {
    const ask = vi.fn().mockResolvedValue(new Map([[10, ['/code/api-wt']]]));
    const lives = shellLiveness({ shells, opened, shellsIn: () => [], ask });
    await expect(lives('/code/api-wt')).resolves.toBe(true);
    expect(ask).toHaveBeenCalledWith([10]);
  });

  it('treats no answer as someone standing there', async () => {
    const lives = shellLiveness({ shells, opened, shellsIn: () => [], ask: async () => null });
    await expect(lives('/code/api-wt')).resolves.toBe(true);
  });
});
