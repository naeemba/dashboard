import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { NO_USAGE } from '../../shared/usage/usage';
import { requestSweep, type SweepRequest } from './usage-thread';

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

  it('leaves no listener behind, so the next sweep is answered once', async () => {
    const fake = thread((emitter) => emitter.emit('message', { snapshot: NO_USAGE }));
    await requestSweep(fake, request);
    expect(fake.listenerCount('message') + fake.listenerCount('error') + fake.listenerCount('exit')).toBe(0);
  });
});
