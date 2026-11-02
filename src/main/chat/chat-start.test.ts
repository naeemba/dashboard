import { describe, expect, it } from 'vitest';
import { sessionToMeasure, startsAtOpen } from './chat-start';

describe('startsAtOpen', () => {
  it('starts a page whose main dispatched a worker, wherever the worker runs', () => {
    expect(startsAtOpen('/work/api', ['/work/web', '/work/api'])).toBe(true);
  });

  it('waits on a page whose main dispatched none of the workers', () => {
    expect(startsAtOpen('/work/api', ['/work/web'])).toBe(false);
    expect(startsAtOpen('/work/api', [])).toBe(false);
  });

  // The manager's page has the empty path.
  it('starts the manager when it dispatched one', () => {
    expect(startsAtOpen('', ['', '/work/web'])).toBe(true);
  });
});

describe('sessionToMeasure', () => {
  const running = Promise.resolve('running');

  it('starts the session for a first show', async () => {
    let started = 0;
    await expect(sessionToMeasure(true, () => { started++; return Promise.resolve('new'); }, undefined)).resolves.toBe('new');
    expect(started).toBe(1);
  });

  // A model picked after the session crashed must not start another CLI.
  it('reads the running session, or none, without starting one', () => {
    let started = 0;
    const starting = (): Promise<string> => { started++; return Promise.resolve('new'); };
    expect(sessionToMeasure(false, starting, running)).toBe(running);
    expect(sessionToMeasure(false, starting, undefined)).toBeUndefined();
    expect(started).toBe(0);
  });
});
