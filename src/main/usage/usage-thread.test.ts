import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { NO_USAGE } from '../../shared/usage/usage';
import { requestSweep, usageThread, type SweepRequest } from './usage-thread';

const request: SweepRequest = { root: '/logs', now: 0, projects: [], paneSessions: new Map() };

// A thread that answers each request with whatever the test says, as a Worker would.
function thread(answer: (emitter: EventEmitter) => void) {
  const emitter = Object.assign(new EventEmitter(), { postMessage: () => answer(emitter) });
  return emitter;
}

describe('requestSweep', () => {
  it('resolves with the snapshot the thread sends back', async () => {
    const fake = thread((emitter) => emitter.emit('message', { snapshot: NO_USAGE }));
    expect(await requestSweep(fake, request)).toBe(NO_USAGE);
    // None left behind, so the next sweep is answered once.
    expect(fake.listenerCount('message') + fake.listenerCount('error') + fake.listenerCount('exit')).toBe(0);
  });

  it('rejects with the error a sweep that threw sends back', async () => {
    const fake = thread((emitter) => emitter.emit('message', { error: new Error('EACCES') }));
    await expect(requestSweep(fake, request)).rejects.toThrow('EACCES');
  });

  // Pending forever would stop every later sweep, since each is chained on the one before.
  it('rejects when the thread stops before answering', async () => {
    const fake = thread((emitter) => emitter.emit('exit', 1));
    await expect(requestSweep(fake, request)).rejects.toThrow('exit code 1');
  });

  it('rejects with the error the thread raises', async () => {
    const fake = thread((emitter) => emitter.emit('error', new Error('out of memory')));
    await expect(requestSweep(fake, request)).rejects.toThrow('out of memory');
  });
});

describe('usageThread', () => {
  // Kept after it died, every later sweep would wait on a thread that never answers.
  it('starts a new thread for the sweep after one stopped', async () => {
    const dead = thread((emitter) => emitter.emit('exit', 1));
    const alive = thread((emitter) => emitter.emit('message', { snapshot: NO_USAGE }));
    const started = [dead, alive];
    const sweep = usageThread(() => started.shift()!);
    await expect(sweep(request)).rejects.toThrow('exit code 1');
    expect(await sweep(request)).toBe(NO_USAGE);
    expect(started).toHaveLength(0);
  });

  it('keeps a thread that is still running', async () => {
    let starts = 0;
    const sweep = usageThread(() => { starts++; return thread((emitter) => emitter.emit('message', { snapshot: NO_USAGE })); });
    await sweep(request);
    await sweep(request);
    expect(starts).toBe(1);
  });
});
