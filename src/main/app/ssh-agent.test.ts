import { describe, expect, it } from 'vitest';
import { fromShowEnvironment, sshAgentSocket, type AgentSources } from './ssh-agent';

const LIVE = new Set(['/run/user/1000/gcr/ssh', '/tmp/ssh-own/agent', '/tmp/ssh-shell/agent']);

function sources(systemd: string | undefined, loginShell: string | undefined, asked: string[] = []): AgentSources {
  return {
    systemd: () => { asked.push('systemd'); return systemd; },
    loginShell: () => { asked.push('login shell'); return loginShell; },
    isSocket: (path) => LIVE.has(path),
  };
}

describe('sshAgentSocket', () => {
  it('keeps the app\'s own when its socket is there, asking nothing else', () => {
    const asked: string[] = [];
    expect(sshAgentSocket('/tmp/ssh-own/agent', sources('/run/user/1000/gcr/ssh', undefined, asked))).toBe('/tmp/ssh-own/agent');
    expect(asked).toEqual([]);
  });
  it('takes systemd\'s when the app has none', () => {
    const asked: string[] = [];
    expect(sshAgentSocket(undefined, sources('/run/user/1000/gcr/ssh', '/tmp/ssh-shell/agent', asked))).toBe('/run/user/1000/gcr/ssh');
    expect(asked).toEqual(['systemd']);
  });
  it('takes systemd\'s when the app\'s names a socket that is gone', () => {
    expect(sshAgentSocket('/tmp/ssh-gone/agent', sources('/run/user/1000/gcr/ssh', undefined))).toBe('/run/user/1000/gcr/ssh');
  });
  it('takes the login shell\'s when systemd has none', () => {
    expect(sshAgentSocket(undefined, sources(undefined, '/tmp/ssh-shell/agent'))).toBe('/tmp/ssh-shell/agent');
  });
  it('passes over a systemd socket that is gone', () => {
    expect(sshAgentSocket(undefined, sources('/tmp/ssh-gone/agent', '/tmp/ssh-shell/agent'))).toBe('/tmp/ssh-shell/agent');
  });
  it('is nothing when no socket is live', () => {
    expect(sshAgentSocket('/tmp/ssh-gone/agent', sources('/tmp/ssh-gone/agent', undefined))).toBeUndefined();
  });
});

describe('fromShowEnvironment', () => {
  it('reads the line among the others', () => {
    expect(fromShowEnvironment('HOME=/home/me\nSSH_AUTH_SOCK=/run/user/1000/gcr/ssh\nUSER=me\n')).toBe('/run/user/1000/gcr/ssh');
  });
  it('is nothing when systemd has none', () => expect(fromShowEnvironment('HOME=/home/me\n')).toBeUndefined());
});
