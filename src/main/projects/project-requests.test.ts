import { describe, expect, it, vi } from 'vitest';
import type { ClosingPane } from '../../shared/panes/close-refusal';
import { projectActions, type ProjectActionsMain } from '../actions/project/project-actions';
import { MAIN_START_MS } from '../actions/project/open';
import { PROJECT_REQUEST } from './project-cli';
import { projectRequests } from './project-requests';

// Skipped on Windows, which reads a POSIX path such as /work/api as one on the current drive, D:\work\api, so the paths these expect never come back.
const posixPathsOnly = it.skipIf(process.platform === 'win32');

// The command's door and the project actions behind it, on main's ports faked.
const idle = (index: number): ClosingPane => ({
  name: `terminal ${index + 1}`, index, exited: false, foreground: 'zsh', shell: '/bin/zsh', command: undefined, inWorktree: false,
});

function setup(open: Record<string, number>, panes: ClosingPane[] = [idle(1)], missingSlots: number[] = []) {
  const ports = {
    ready: async () => undefined,
    slotOf: (projectPath: string) => open[projectPath] ?? -1,
    missingIn: (slot: number) => missingSlots.includes(slot),
    folderExists: (projectPath: string) => projectPath !== '/gone',
    place: vi.fn((projectPath: string) => open[projectPath] ?? 7),
    startMain: vi.fn(async (slot: number) => `main-${slot}`),
    isOpen: (slot: number) => Object.values(open).includes(slot),
    panesOf: () => panes,
    close: vi.fn(),
    land: vi.fn(),
  } satisfies ProjectActionsMain;
  const otherwise = vi.fn(async () => ({ ok: true, output: 'session' }));
  const door = projectRequests({ slotOf: ports.slotOf, ...projectActions(ports) }, otherwise);
  const answer = (...words: string[]) => door({ directory: '/anywhere', args: [PROJECT_REQUEST, ...words] });
  return { ports, otherwise, door, answer };
}

describe('projectRequests', () => {
  posixPathsOnly('switches to an open project\'s page, and refuses one that is not open', async () => {
    const { ports, answer } = setup({ '/web': 3 });
    await expect(answer('focus', '/web', 'web')).resolves.toEqual({ ok: true, output: 'switched to web' });
    expect(ports.land).toHaveBeenCalledWith('3:0');
    await expect(answer('focus', '/api', 'api')).resolves.toEqual({ ok: false, output: 'api is not open' });
    expect(ports.land).toHaveBeenCalledOnce();
  });

  it('hands anything that is not a project request to the session command', async () => {
    const { otherwise, door } = setup({});
    await expect(door({ directory: '/a', args: ['claim'] })).resolves.toEqual({ ok: true, output: 'session' });
    expect(otherwise).toHaveBeenCalledOnce();
  });

  // A manager opens a project to hand it to that project's main, which has to be running to be told.
  posixPathsOnly('opens a folder that is not open with its main, and starts the main of one that is', async () => {
    const { ports, answer } = setup({ '/web': 0 });
    await expect(answer('open', '/api/', 'api')).resolves.toEqual({ ok: true, output: 'opened api; main-7 is running' });
    expect(ports.place).toHaveBeenCalledWith('/api');
    expect(ports.startMain).toHaveBeenCalledWith(7);
    await expect(answer('open', '/web', 'web')).resolves.toEqual({ ok: true, output: 'web is already open; main-0 is running' });
    expect(ports.startMain).toHaveBeenLastCalledWith(0);
  });

  posixPathsOnly('refuses when main fails to start, and when it does not answer in time', async () => {
    const { ports, answer } = setup({});
    vi.mocked(ports.startMain).mockRejectedValueOnce(new Error('claude not found'));
    await expect(answer('open', '/api', 'api'))
      .resolves.toEqual({ ok: false, output: 'opened api, but its main session did not start: claude not found' });
    vi.useFakeTimers();
    try {
      vi.mocked(ports.startMain).mockReturnValueOnce(new Promise(() => undefined));
      const reply = answer('open', '/api', 'api');
      await vi.advanceTimersByTimeAsync(MAIN_START_MS);
      await expect(reply).resolves.toEqual({ ok: false, output: 'opened api, but its main session did not start: nothing answered within 60 seconds' });
    } finally {
      vi.useRealTimers();
    }
  });

  // Restored while its drive was unmounted, it sits in its slot reading Directory not found; answering
  // "already open" would leave it dead with the command reporting success.
  posixPathsOnly('opens over a dead page whose folder is back, as the picker does', async () => {
    const { ports, answer } = setup({ '/api': 2 }, [idle(1)], [2]);
    await expect(answer('open', '/api', 'api')).resolves.toEqual({ ok: true, output: 'opened api; main-2 is running' });
    expect(ports.place).toHaveBeenCalledWith('/api');
  });

  posixPathsOnly('refuses a dead page whose folder is still gone', async () => {
    const { ports, answer } = setup({ '/gone': 2 }, [idle(1)], [2]);
    await expect(answer('open', '/gone', 'gone')).resolves.toEqual({ ok: false, output: "gone's folder, /gone, does not exist" });
    expect(ports.place).not.toHaveBeenCalled();
    expect(ports.startMain).not.toHaveBeenCalled();
  });

  // Opened anyway, it would be a dead page reading Directory not found.
  posixPathsOnly('refuses to open a folder that is not there', async () => {
    const { ports, answer } = setup({});
    await expect(answer('open', '/gone', 'gone')).resolves.toEqual({ ok: false, output: "gone's folder, /gone, does not exist" });
    expect(ports.place).not.toHaveBeenCalled();
  });

  posixPathsOnly('closes a quiet project with no question', async () => {
    const { ports, answer } = setup({ '/web': 3 });
    await expect(answer('close', '/web', 'web')).resolves.toEqual({ ok: true, output: 'closed web' });
    expect(ports.close).toHaveBeenCalledWith(3);
  });

  posixPathsOnly('refuses to close while a pane is running something, naming it as the close key does', async () => {
    const { ports, answer } = setup({ '/web': 3 }, [idle(1), { ...idle(2), foreground: 'npm' }]);
    await expect(answer('close', '/web', 'web'))
      .resolves.toEqual({ ok: false, output: 'web is still running in terminal 3 npm — stop it and close again' });
    expect(ports.close).not.toHaveBeenCalled();
  });

  it('refuses to close a project that is not open, and a request it cannot read', async () => {
    const { answer } = setup({});
    await expect(answer('close', '/web', 'web')).resolves.toEqual({ ok: false, output: 'web is not open' });
    await expect(answer('rename', '/web', 'web')).resolves.toEqual({ ok: false, output: 'the project request was not one the app could read' });
  });
});
