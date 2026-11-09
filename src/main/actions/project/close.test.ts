import { describe, expect, it, vi } from 'vitest';
import type { PaneUse } from '../../../shared/panes/pane-reading';
import { bind } from '../action';
import { projectClose, type ProjectClosePorts } from './close';

const idle: PaneUse = { index: 1, exited: false, foreground: 'zsh', shell: '/bin/zsh', command: undefined, inWorktree: false };

// The command's close is tested through its door in project-requests.test.ts.
function setUp(panes: PaneUse[], units: string[] = [], stopScope: (unit: string) => Promise<void> = async () => undefined) {
  const stops = vi.fn(stopScope);
  const ports: ProjectClosePorts = {
    isOpen: (slot) => slot === 4,
    panesOf: () => panes,
    scopesOf: (slot) => (slot === 4 ? units : []),
    close: vi.fn(),
    stopScope: stops,
    log: vi.fn(),
  };
  return { ports, stops, close: bind(projectClose, ports) };
}

describe('project.close', () => {
  it('refuses the close key over a busy pane by the name you gave it', async () => {
    const { ports, close } = setUp([{ ...idle, foreground: 'npm' }]);
    await expect(close.call({ slot: 4, name: 'web', names: [{ index: 1, name: 'tests' }], onlyCheck: false }))
      .resolves.toEqual({ refused: 'web is still running in tests npm — stop it and close again' });
    expect(ports.close).not.toHaveBeenCalled();
  });

  it('answers the key\'s check without closing, then closes', async () => {
    const { ports, close } = setUp([idle]);
    const names = [{ index: 1, name: 'terminal 2' }];
    await expect(close.call({ slot: 4, name: 'web', names, onlyCheck: true })).resolves.toEqual({ output: 'web may close' });
    expect(ports.close).not.toHaveBeenCalled();
    await expect(close.call({ slot: 4, name: 'web', names, onlyCheck: false })).resolves.toEqual({ output: 'closed web' });
    expect(ports.close).toHaveBeenCalledWith(4);
  });

  it('refuses a slot that is not open and a request it cannot read', async () => {
    const { close } = setUp([idle]);
    await expect(close.call({ slot: 9, name: 'web' })).resolves.toEqual({ refused: 'web is not open' });
    await expect(close.call({ slot: 4, name: 'web', names: [{ index: 'one' }] })).resolves.toEqual({ refused: 'the project to close was not one the app could read' });
  });

  it('stops every scope its panes ran in once the project is closed, and only then', async () => {
    const { ports, stops, close } = setUp([idle], ['pane-web-1-a.scope', 'pane-web--1-b.scope']);
    stops.mockImplementation(async () => { expect(ports.close).toHaveBeenCalled(); });
    await expect(close.call({ slot: 4, name: 'web' })).resolves.toEqual({ output: 'closed web' });
    expect(stops.mock.calls).toEqual([['pane-web-1-a.scope'], ['pane-web--1-b.scope']]);
  });

  it('says which scope it could not stop, and still closes and stops the rest', async () => {
    const { ports, close } = setUp([idle], ['pane-web-1-a.scope', 'pane-web-2-b.scope'], async (unit) => {
      if (unit === 'pane-web-1-a.scope') throw new Error('timed out');
    });
    await expect(close.call({ slot: 4, name: 'web' })).resolves.toEqual({ output: 'closed web; pane-web-1-a.scope was not stopped: timed out' });
    expect(ports.close).toHaveBeenCalledWith(4);
    expect(ports.stopScope).toHaveBeenCalledWith('pane-web-2-b.scope');
    expect(ports.log).toHaveBeenCalledExactlyOnceWith({
      level: 'warn', kind: 'project', action: 'project.close', message: 'pane-web-1-a.scope was not stopped: timed out', context: { slot: 4 },
    });
  });

  it('stops nothing when it refuses or only checks', async () => {
    const { ports, close } = setUp([{ ...idle, foreground: 'npm' }], ['pane-web-1-a.scope']);
    await close.call({ slot: 4, name: 'web' });
    await close.call({ slot: 4, name: 'web', names: [], onlyCheck: true });
    expect(ports.stopScope).not.toHaveBeenCalled();
  });
});
