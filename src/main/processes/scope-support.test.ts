import { describe, expect, it } from 'vitest';
import { processScopes, scopeRefusal, type ProcessScopesPorts } from './scope-support';

const SHELL = { kind: 'shell' as const, id: 'dashboard-0', file: '/bin/zsh', args: [] };

// A Linux machine whose probes print what is given, with suffixes handed out in order.
function scopes(answers: Record<string, string | null>, more: Partial<ProcessScopesPorts> = {}) {
  const warnings: string[] = [];
  const suffixes = ['aaaa', 'aaaa', 'bbbb'];
  const made = processScopes({
    platform: 'linux',
    probe: async (file) => answers[file] ?? null,
    prepare: async () => undefined,
    warn: (message) => { warnings.push(message); },
    suffix: () => suffixes.shift() ?? 'none',
    ...more,
  });
  return { ...made, warnings };
}

const WORKING = { 'systemd-run': 'systemd 257 (257.9)', systemctl: 'degraded' };

describe('scopeRefusal', () => {
  it('takes a running or degraded user manager', () => {
    expect(scopeRefusal('systemd 257', 'running')).toBeNull();
    expect(scopeRefusal('systemd 257', 'degraded')).toBeNull();
  });

  it('says why when systemd-run is missing or the manager is not up', () => {
    expect(scopeRefusal(null, 'running')).toBe('systemd-run is not installed');
    expect(scopeRefusal('systemd 257', 'offline')).toBe('the systemd user manager is not taking units (offline)');
    expect(scopeRefusal('systemd 257', null)).toBe('the systemd user manager is not taking units (no answer)');
  });
});

describe('processScopes', () => {
  it('runs everything unscoped until the check has answered', async () => {
    const made = scopes(WORKING);
    expect(made.scoped(SHELL).unit).toBeNull();
    await made.ready;
    expect(made.scoped(SHELL).unit).toBe('pane-dashboard-0-aaaa.scope');
  });

  it('never hands out a name twice', async () => {
    const made = scopes(WORKING);
    await made.ready;
    made.scoped(SHELL);
    expect(made.scoped(SHELL).unit).toBe('pane-dashboard-0-bbbb.scope');
  });

  it('warns once and falls back when the check fails', async () => {
    const made = scopes({ 'systemd-run': null, systemctl: 'running' });
    await made.ready;
    expect(made.scoped(SHELL).unit).toBeNull();
    expect(made.scoped(SHELL).unit).toBeNull();
    expect(made.warnings).toEqual(['Panes and agents run without systemd scopes: systemd-run is not installed']);
  });

  it('says nothing and asks nothing off Linux', async () => {
    const asked: string[] = [];
    const made = scopes(WORKING, { platform: 'darwin', probe: async (file) => { asked.push(file); return null; } });
    await made.ready;
    expect(made.scoped(SHELL).unit).toBeNull();
    expect([asked, made.warnings]).toEqual([[], []]);
  });

  it('still scopes when the slices could not be written, and says so', async () => {
    const made = scopes(WORKING, { prepare: async () => { throw new Error('read-only file system'); } });
    await made.ready;
    expect(made.scoped(SHELL).unit).toBe('pane-dashboard-0-aaaa.scope');
    expect(made.warnings).toEqual(['The agents and panes slices were not installed, so they run uncapped: read-only file system']);
  });
});
