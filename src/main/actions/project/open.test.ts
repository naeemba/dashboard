import { describe, expect, it, vi } from 'vitest';
import { bind } from '../action';
import { projectOpen, startsMain, type ProjectOpenPorts } from './open';

// The command's open, main and all, is tested through its door in project-requests.test.ts.
function setUp(open: Record<string, number> = {}) {
  const order: string[] = [];
  const ports: ProjectOpenPorts = {
    ready: vi.fn(async () => { order.push('ready'); }),
    slotOf: (projectPath) => open[projectPath] ?? -1,
    missingIn: () => false,
    folderExists: (projectPath) => projectPath !== '/gone',
    place: vi.fn((projectPath: string) => { order.push('place'); return open[projectPath] ?? 4; }),
    startMain: vi.fn(async () => 'main'),
  };
  return { ports, order, open: bind(projectOpen, ports) };
}

describe('project.open', () => {
  it('starts main only for the command', () => {
    expect(['picker', 'claim', 'command'].filter((from) => startsMain(from as 'picker'))).toEqual(['command']);
  });

  it('opens the picker\'s and a claim\'s project once the hosts are ready, and leaves main to wait', async () => {
    const { ports, order, open } = setUp({ '/web': 2 });
    await expect(open.call({ projectPath: '/api', name: 'api', from: 'picker' })).resolves.toEqual({ output: 'opened api', index: 4 });
    await expect(open.call({ projectPath: '/web', name: 'web', from: 'claim' })).resolves.toEqual({ output: 'web is already open', index: 2 });
    expect(order).toEqual(['ready', 'place', 'ready', 'place']);
    expect(ports.startMain).not.toHaveBeenCalled();
  });

  it('refuses a claim\'s folder that is not there, and an input it cannot read', async () => {
    const { ports, open } = setUp();
    await expect(open.call({ projectPath: '/gone', name: 'gone', from: 'claim' })).resolves.toEqual({ refused: "gone's folder, /gone, does not exist" });
    await expect(open.call({ projectPath: '/api', name: 'api', from: 'sweep' })).resolves.toEqual({ refused: 'the project to open was not one the app could read' });
    expect(ports.place).not.toHaveBeenCalled();
  });
});
