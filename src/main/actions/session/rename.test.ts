import { describe, expect, it, vi } from 'vitest';
import { bind } from '../action';
import { sessionRename, type SessionRenamePorts } from './rename';

function setUp(retitle: SessionRenamePorts['retitle'] = async () => undefined) {
  const labels: Record<string, string> = { abc: 'api-1' };
  const ports = {
    onScreen: (slot: number): string | null => (slot === 1 ? 'abc' : null),
    projectPath: () => '/api',
    directoryOf: (sessionId: string) => (sessionId in labels ? '/api.worktrees/card' : undefined),
    relabel: vi.fn((sessionId: string, label: string) => {
      if (!(sessionId in labels)) return 'That session is not in the drawer any more';
      labels[sessionId] = label.trim();
      return null;
    }),
    retitle: vi.fn(retitle),
  };
  return { ports, labels, rename: bind(sessionRename, ports) };
}

describe('session.rename', () => {
  it('names the conversation in /resume and in the drawer from /rename', async () => {
    const { ports, labels, rename } = setUp();
    await expect(rename.call({ slot: 1, title: ' login fix ' })).resolves.toEqual({ output: 'Renamed to login fix.' });
    expect(ports.retitle).toHaveBeenCalledWith('abc', 'login fix', '/api');
    expect(labels.abc).toBe('login fix');
    await expect(rename.call({ slot: 2, title: 'x' })).resolves.toEqual({ refused: 'No conversation to rename yet. Send a prompt first.' });
  });

  it('names it in the drawer and in /resume from the drawer, in the folder it ran in', async () => {
    const { ports, labels, rename } = setUp();
    await expect(rename.call({ id: 'abc', label: ' login fix ' })).resolves.toEqual({ output: 'Renamed to login fix.' });
    expect(labels.abc).toBe('login fix');
    expect(ports.retitle).toHaveBeenCalledWith('abc', 'login fix', '/api.worktrees/card');
    await expect(rename.call({ id: 'gone', label: 'x' })).resolves.toEqual({ refused: 'That session is not in the drawer any more' });
    expect(ports.retitle).toHaveBeenCalledTimes(1);
  });

  it('says so when the drawer has the name and the transcript would not take it', async () => {
    const { labels, rename } = setUp(async () => { throw new Error('no transcript'); });
    await expect(rename.call({ id: 'abc', label: 'login fix' })).resolves.toEqual({
      refused: 'Renamed to login fix in the drawer, but /resume still lists it by its old name: no transcript',
    });
    expect(labels.abc).toBe('login fix');
  });

  it('says nothing was renamed when /rename has no drawer row and the transcript would not take it', async () => {
    const { ports, rename } = setUp(async () => { throw new Error('no transcript'); });
    ports.onScreen = () => 'gone';
    await expect(rename.call({ slot: 1, title: 'login fix' })).resolves.toEqual({ refused: 'Could not rename to login fix: no transcript' });
  });
});
