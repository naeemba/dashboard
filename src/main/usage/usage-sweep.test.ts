import { describe, expect, it } from 'vitest';
import { usageSweep } from './usage-sweep';

describe('usageSweep placeNow', () => {
  // `ps` timed out or is missing. With no tree every claude started at a prompt has no pane, and an
  // answer of "no sessions anywhere" would be saved over the last reading that knew better.
  it('answers with no reading at all when the process tree is not there', async () => {
    const sweep = usageSweep({
      panePids: () => new Map([[51152, '0:1']]),
      openProjects: () => [],
      processTree: async () => null,
      publish: () => undefined,
      placed: () => undefined,
      sweepFailed: () => undefined,
    });
    expect(await sweep.placeNow()).toBeNull();
  });
});
