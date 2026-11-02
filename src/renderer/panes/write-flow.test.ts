import { describe, expect, it } from 'vitest';
import { HIGH_WATER, LOW_WATER, RENEW_MS, writeFlow } from './write-flow';

describe('writeFlow', () => {
  it('asks for nothing while the queue stays under the high mark', () => {
    const asked: boolean[] = [];
    const flow = writeFlow((paused) => asked.push(paused));
    flow.queued(HIGH_WATER);
    flow.parsed(HIGH_WATER);
    expect(asked).toEqual([]);
  });

  it('pauses past the high mark, renews only once half a lease has gone, and resumes under the low mark', () => {
    const asked: boolean[] = [];
    let clock = 0;
    const flow = writeFlow((paused) => asked.push(paused), () => clock);
    flow.queued(HIGH_WATER + 1);
    flow.queued(10);
    expect(asked).toEqual([true]);
    clock = RENEW_MS;
    flow.queued(10);
    expect(asked).toEqual([true, true]);
    flow.parsed(HIGH_WATER + 21 - LOW_WATER);
    expect(asked).toEqual([true, true]);
    flow.parsed(1);
    expect(asked).toEqual([true, true, false]);
    flow.parsed(LOW_WATER - 1);
    expect(asked).toEqual([true, true, false]);
  });
});
