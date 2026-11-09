import { describe, expect, it } from 'vitest';
import { retargeted, scopedCommand, scopeSlug, sliceOf, type ScopeSupport } from './scope';

// A support that hands out the suffixes given, in order, and calls the names given taken.
function support(suffixes: string[], taken: string[] = []): ScopeSupport {
  return { available: true, suffix: () => suffixes.shift() ?? 'none', taken: (unit) => taken.includes(unit) };
}

const ZSH = { file: '/bin/zsh', args: ['-ilc', 'claude'] };

describe('scopedCommand', () => {
  it('starts an agent under agents.slice with its own memory caps', () => {
    expect(scopedCommand({ kind: 'agent', id: 'dashboard-3', ...ZSH }, support(['k4f2']))).toEqual({
      file: 'systemd-run',
      args: [
        '--user', '--scope', '--collect', '--quiet', '--slice=agents.slice', '--unit=agent-dashboard-3-k4f2.scope',
        '-p', 'MemoryHigh=6G', '-p', 'MemoryMax=8G', '--', '/bin/zsh', '-ilc', 'claude',
      ],
      unit: 'agent-dashboard-3-k4f2.scope',
    });
  });

  it("starts a manager's task under agents.slice with an agent's caps, named apart", () => {
    const scoped = scopedCommand({ kind: 'task', id: 'shop', file: '/bin/zsh', args: ['-c', 'pnpm test'] }, support(['x9q0']));
    expect(scoped.unit).toBe('task-shop-x9q0.scope');
    expect(scoped.args).toEqual(expect.arrayContaining(['--slice=agents.slice', 'MemoryMax=8G']));
  });

  it('starts a shell under panes.slice with no cap of its own', () => {
    expect(scopedCommand({ kind: 'shell', id: 'dashboard-0', file: '/bin/zsh', args: [] }, support(['a1b2']))).toEqual({
      file: 'systemd-run',
      args: ['--user', '--scope', '--collect', '--quiet', '--slice=panes.slice', '--unit=pane-dashboard-0-a1b2.scope', '--', '/bin/zsh'],
      unit: 'pane-dashboard-0-a1b2.scope',
    });
  });

  it('leaves the command as it was when scopes are unavailable', () => {
    expect(scopedCommand({ kind: 'agent', id: 'dashboard-3', ...ZSH }, { ...support(['k4f2']), available: false }))
      .toEqual({ ...ZSH, unit: null });
  });

  it('tries a second suffix when the first name is taken', () => {
    expect(scopedCommand({ kind: 'shell', id: 'p-1', ...ZSH }, support(['aaaa', 'bbbb'], ['pane-p-1-aaaa.scope'])).unit)
      .toBe('pane-p-1-bbbb.scope');
  });

  it('runs unscoped when the second name is taken as well', () => {
    const scoped = scopedCommand({ kind: 'shell', id: 'p-1', ...ZSH }, support(['aaaa', 'bbbb', 'cccc'], ['pane-p-1-aaaa.scope', 'pane-p-1-bbbb.scope']));
    expect(scoped).toEqual({ ...ZSH, unit: null });
  });
});

describe('retargeted', () => {
  const scope = scopedCommand({ kind: 'agent', id: 'main-shop', file: '/sdk/claude', args: [] }, support(['k4f2']));

  it("runs another command after systemd-run's options, in the same unit", () => {
    expect(retargeted(scope, 'node', ['/sdk/cli.js', '--verbose']).args.slice(-5))
      .toEqual(['MemoryMax=8G', '--', 'node', '/sdk/cli.js', '--verbose']);
    expect(retargeted(scope, 'node', []).args).toContain('--unit=agent-main-shop-k4f2.scope');
  });

  it('is the command alone when there is no scope', () => {
    expect(retargeted({ file: '/sdk/claude', args: [], unit: null }, 'node', ['cli.js'])).toEqual({ file: 'node', args: ['cli.js'], unit: null });
  });
});

describe('scopeSlug', () => {
  it('keeps letters, digits and dashes, lowercased', () => {
    expect(scopeSlug('Dashboard 3')).toBe('dashboard-3');
    expect(scopeSlug('2:3')).toBe('2-3');
  });

  it('trims what a unit name would show as stray dashes', () => {
    expect(scopeSlug('.my_project!-')).toBe('my-project');
  });

  it('cuts a long id to forty characters', () => {
    expect(scopeSlug('a'.repeat(60))).toHaveLength(40);
  });

  it('names an id with nothing usable in it', () => {
    expect(scopeSlug('日本')).toBe('unnamed');
  });
});

describe('sliceOf', () => {
  it('reads the slice back off a name this file hands out', () => {
    expect(sliceOf('agent-shop-3-k4f2.scope')).toBe('agents.slice');
    expect(sliceOf('task-shop-x9q0.scope')).toBe('agents.slice');
    expect(sliceOf('pane-shop-0-a1b2.scope')).toBe('panes.slice');
  });

  it('knows nothing of a unit it did not name', () => {
    expect(sliceOf('app-dashboard-12.scope')).toBeNull();
    expect(sliceOf('agent-shop.service')).toBeNull();
  });
});
