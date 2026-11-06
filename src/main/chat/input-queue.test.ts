import { describe, expect, it } from 'vitest';
import { inputQueue } from './input-queue';

describe('inputQueue', () => {
  it('hands over what was pushed before and after the reader started, in order, until closed', async () => {
    const queue = inputQueue<string>();
    queue.push('first');
    const read: string[] = [];
    const reading = (async () => { for await (const each of queue) read.push(each); })();
    await Promise.resolve();
    queue.push('second');
    queue.push('third');
    queue.close();
    await reading;
    expect(read).toEqual(['first', 'second', 'third']);
  });

  it('still hands over what was pushed just before the close', async () => {
    const queue = inputQueue<string>();
    queue.push('last');
    queue.close();
    const read: string[] = [];
    for await (const each of queue) read.push(each);
    expect(read).toEqual(['last']);
  });
});
