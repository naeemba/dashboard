import { describe, expect, it, vi } from 'vitest';
import type { ClosingPane } from '../../shared/panes/close-refusal';
import { PROJECT_REQUEST } from './project-cli';
import { projectRequests, type ProjectRequestPorts } from './project-requests';

// Skipped on Windows, which reads a POSIX path such as /work/api as one on the current drive, D:\work\api, so the paths these expect never come back.
const posixPathsOnly = it.skipIf(process.platform === 'win32');

const idle = (index: number): ClosingPane => ({
  name: `terminal ${index + 1}`, index, exited: false, foreground: 'zsh', shell: '/bin/zsh', command: undefined, inWorktree: false,
});

function setup(open: Record<string, number>, panes: ClosingPane[] = [idle(1)], missingSlots: number[] = []) {
  const ports: ProjectRequestPorts = {
    slotOf: (projectPath) => open[projectPath] ?? -1,
    missingIn: (slot) => missingSlots.includes(slot),
    folderExists: (projectPath) => projectPath !== '/gone',
    open: vi.fn(),
    panesOf: () => panes,
    close: vi.fn(),
    focus: vi.fn(),
  };
  const otherwise = vi.fn(async () => ({ ok: true, output: 'session' }));
  const answer = (...words: string[]) => projectRequests(ports, otherwise)({ directory: '/anywhere', args: [PROJECT_REQUEST, ...words] });
  return { ports, otherwise, answer };
}

describe('projectRequests', () => {
  posixPathsOnly('switches to an open project\'s page, and refuses one that is not open', async () => {
    const { ports, answer } = setup({ '/web': 3 });
    await expect(answer('focus', '/web', 'web')).resolves.toEqual({ ok: true, output: 'switched to web' });
    expect(ports.focus).toHaveBeenCalledWith(3);
    await expect(answer('focus', '/api', 'api')).resolves.toEqual({ ok: false, output: 'api is not open' });
    expect(ports.focus).toHaveBeenCalledOnce();
  });

  it('hands anything that is not a project request to the session command', async () => {
    const { otherwise, ports } = setup({});
    await expect(projectRequests(ports, otherwise)({ directory: '/a', args: ['claim'] })).resolves.toEqual({ ok: true, output: 'session' });
    expect(otherwise).toHaveBeenCalledOnce();
  });

  posixPathsOnly('opens a folder that is not open, and leaves one that is', async () => {
    const { ports, answer } = setup({ '/web': 0 });
    await expect(answer('open', '/api/', 'api')).resolves.toEqual({ ok: true, output: 'opened api' });
    expect(ports.open).toHaveBeenCalledWith('/api');
    await expect(answer('open', '/web', 'web')).resolves.toEqual({ ok: true, output: 'web is already open' });
    expect(ports.open).toHaveBeenCalledOnce();
  });

  // Restored while its drive was unmounted, it sits in its slot reading Directory not found; answering
  // "already open" would leave it dead with the command reporting success.
  posixPathsOnly('opens over a dead page whose folder is back, as the picker does', async () => {
    const { ports, answer } = setup({ '/api': 2 }, [idle(1)], [2]);
    await expect(answer('open', '/api', 'api')).resolves.toEqual({ ok: true, output: 'opened api' });
    expect(ports.open).toHaveBeenCalledWith('/api');
  });

  posixPathsOnly('refuses a dead page whose folder is still gone', async () => {
    const { ports, answer } = setup({ '/gone': 2 }, [idle(1)], [2]);
    await expect(answer('open', '/gone', 'gone')).resolves.toEqual({ ok: false, output: "gone's folder, /gone, does not exist" });
    expect(ports.open).not.toHaveBeenCalled();
  });

  // Opened anyway, it would be a dead page reading Directory not found.
  posixPathsOnly('refuses to open a folder that is not there', async () => {
    const { ports, answer } = setup({});
    await expect(answer('open', '/gone', 'gone')).resolves.toEqual({ ok: false, output: "gone's folder, /gone, does not exist" });
    expect(ports.open).not.toHaveBeenCalled();
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
