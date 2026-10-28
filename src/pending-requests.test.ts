import { describe, expect, it } from 'vitest';
import { pendingRequests } from './pending-requests';

describe('pendingRequests', () => {
  it('settles a reply by id with its result', async () => {
    const pending = pendingRequests();
    const answer = new Promise((resolve, reject) => pending.open(1, resolve, reject));
    expect(pending.settle({ id: 1, result: 'ok' })).toBe(true);
    await expect(answer).resolves.toBe('ok');
  });

  it('rejects an error reply with the host\'s text', async () => {
    const pending = pendingRequests();
    const answer = new Promise((resolve, reject) => pending.open(2, resolve, reject));
    pending.settle({ id: 2, error: 'disk full' });
    await expect(answer).rejects.toThrow('disk full');
  });

  it('says so when nobody waits for the id', () => {
    expect(pendingRequests().settle({ id: 9, result: null })).toBe(false);
  });

  it('expires a request naming the host', async () => {
    const pending = pendingRequests();
    const answer = new Promise((resolve, reject) => pending.open(3, resolve, reject));
    pending.expire(3, '10.0.0.2:7777');
    await expect(answer).rejects.toThrow('No answer from 10.0.0.2:7777');
    expect(pending.settle({ id: 3, result: null })).toBe(false);
  });

  it('fails everything open when the socket goes', async () => {
    const pending = pendingRequests();
    const first = new Promise((resolve, reject) => pending.open(4, resolve, reject));
    const second = new Promise((resolve, reject) => pending.open(5, resolve, reject));
    pending.failAll('Lost the host');
    await expect(first).rejects.toThrow('Lost the host');
    await expect(second).rejects.toThrow('Lost the host');
  });
});
