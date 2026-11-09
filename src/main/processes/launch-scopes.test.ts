import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { temporaryFolder } from '../testing/temporary-folder';
import { probe, stopScope, writeNew } from './launch-scopes';
import { scopeRefusal } from './scope-support';

describe.skipIf(process.platform === 'win32')('probe', () => {
  it('answers what a command printed, trimmed', async () => {
    await expect(probe('sh', ['-c', 'echo " running "'])).resolves.toBe('running');
  });

  it('answers what a failing command printed, as is-system-running prints degraded', async () => {
    await expect(probe('sh', ['-c', 'echo degraded; exit 1'])).resolves.toBe('degraded');
  });

  it('answers nothing for a program that is not there', async () => {
    await expect(probe('no-such-program-for-a-scope-probe', [])).resolves.toBeNull();
  });
});

describe('writeNew', () => {
  it('writes a file and its folder, and never over one that is there', () => {
    const file = path.join(temporaryFolder('slices-'), 'systemd', 'user', 'agents.slice');
    expect(writeNew(file, 'first')).toBe(true);
    expect(writeNew(file, 'second')).toBe(false);
    expect(readFileSync(file, 'utf8')).toBe('first');
  });
});

// A unit that is not loaded is the one answer here that touches no live unit: stopping a real scope is
// the hand check in docs/processes/README.md.
// Only where a user manager answers: a CI runner's Linux has no session bus to ask.
const managerUp = process.platform === 'linux'
  && scopeRefusal('present', await probe('systemctl', ['--user', 'is-system-running'])) === null;

describe.skipIf(!managerUp)('stopScope', () => {
  it('takes a scope that is already gone as stopped', async () => {
    await expect(stopScope('no-such-unit-for-a-scope-stop-test.scope')).resolves.toBeUndefined();
  });
});
