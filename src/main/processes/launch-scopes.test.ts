import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { temporaryFolder } from '../testing/temporary-folder';
import { probe, writeNew } from './launch-scopes';

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
