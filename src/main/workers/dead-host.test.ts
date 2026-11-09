import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { endDeadHost, hostPidFile, recordedPid } from './dead-host';
import { temporaryFolder } from '../testing/temporary-folder';

function errno(code: string): Error {
  return Object.assign(new Error(code), { code });
}

// A process table of the live pids and the live groups, and every signal sent.
function machine(recorded: number | null, pids: number[], groups: number[]) {
  const sent: string[] = [];
  const ports = {
    recorded: () => recorded,
    forget: () => sent.push('forget'),
    kill(pid: number, signal: NodeJS.Signals | 0) {
      const there = pid < 0 ? groups.includes(-pid) : pids.includes(pid);
      if (!there) throw errno('ESRCH');
      if (signal !== 0) sent.push(`${signal} ${pid}`);
    },
  };
  return { ports, sent };
}

describe('endDeadHost', () => {
  it('kills the group a dead host left running, before anything starts its workers again', () => {
    const { ports, sent } = machine(4100, [], [4100]);
    endDeadHost(ports);
    expect(sent).toEqual(['SIGKILL -4100', 'forget']);
  });

  it('leaves a host that is still alive alone, its sessions with it', () => {
    const { ports, sent } = machine(4100, [4100], [4100]);
    endDeadHost(ports);
    expect(sent).toEqual([]);
  });

  it('counts a pid it may not signal as alive: it is not ours, and neither is its group', () => {
    const sent: number[] = [];
    endDeadHost({ recorded: () => 4100, forget: () => sent.push(0), kill: (pid) => { sent.push(pid); throw errno('EPERM'); } });
    expect(sent).toEqual([4100]);
  });

  it('forgets a dead host that left nothing, and does nothing for no host recorded', () => {
    const nothing = machine(4100, [], []);
    endDeadHost(nothing.ports);
    expect(nothing.sent).toEqual(['forget']);
    const none = machine(null, [], [1]);
    endDeadHost(none.ports);
    expect(none.sent).toEqual([]);
  });
});

describe('recordedPid', () => {
  it('reads the pid the host wrote this boot, and nothing that would signal every process', () => {
    const socket = path.join(temporaryFolder('dead-host-'), 'screens-1.sock');
    expect(recordedPid(hostPidFile(socket), 'boot-b')).toBeNull();
    writeFileSync(hostPidFile(socket), '4100\nboot-b\n');
    expect(recordedPid(hostPidFile(socket), 'boot-b')).toBe(4100);
    expect(recordedPid(hostPidFile(socket), 'boot-c')).toBeNull();
    for (const written of ['1', '0', '-5', 'x', '']) {
      writeFileSync(hostPidFile(socket), `${written}\nboot-b\n`);
      expect(recordedPid(hostPidFile(socket), 'boot-b')).toBeNull();
    }
  });

  it('reads a pid with no boot id only where there is none', () => {
    const socket = path.join(temporaryFolder('dead-host-'), 'screens-1.sock');
    writeFileSync(hostPidFile(socket), '4100\n\n');
    expect(recordedPid(hostPidFile(socket), '')).toBe(4100);
    expect(recordedPid(hostPidFile(socket), 'boot-b')).toBeNull();
  });
});
