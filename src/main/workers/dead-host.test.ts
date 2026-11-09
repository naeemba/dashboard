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
    expect(sent).toEqual(['SIGKILL -4100']);
  });

  it('leaves a host that is still alive alone, its sessions with it', () => {
    const { ports, sent } = machine(4100, [4100], [4100]);
    endDeadHost(ports);
    expect(sent).toEqual([]);
  });

  it('counts a pid it may not signal as alive: it is not ours, and neither is its group', () => {
    const sent: number[] = [];
    endDeadHost({ recorded: () => 4100, kill: (pid) => { sent.push(pid); throw errno('EPERM'); } });
    expect(sent).toEqual([4100]);
  });

  it('does nothing for a dead host that left nothing, or for no host recorded', () => {
    expect(() => endDeadHost(machine(4100, [], []).ports)).not.toThrow();
    const none = machine(null, [], [1]);
    endDeadHost(none.ports);
    expect(none.sent).toEqual([]);
  });
});

describe('recordedPid', () => {
  it('reads the pid the host wrote, and nothing that would signal every process', () => {
    const socket = path.join(temporaryFolder('dead-host-'), 'screens-1.sock');
    expect(recordedPid(hostPidFile(socket))).toBeNull();
    writeFileSync(hostPidFile(socket), '4100\n');
    expect(recordedPid(hostPidFile(socket))).toBe(4100);
    for (const written of ['1', '0', '-5', 'x', '']) {
      writeFileSync(hostPidFile(socket), written);
      expect(recordedPid(hostPidFile(socket))).toBeNull();
    }
  });
});
