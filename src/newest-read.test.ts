import { describe, expect, it } from 'vitest';
import { createNewestRead } from './newest-read';

// A read whose result is handed in by the test, so the order reads land in is the test's to choose.
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

describe('createNewestRead', () => {
  it('lands a lone read and answers with what land returns', async () => {
    const reads = createNewestRead<string, boolean>();
    const landed: string[] = [];
    const answer = reads.run(async () => 'board', (outcome) => {
      landed.push(outcome);
      return true;
    });
    expect(reads.pending()).toBe(true);
    await expect(answer).resolves.toBe(true);
    expect(landed).toEqual(['board']);
    expect(reads.pending()).toBe(false);
  });

  it('gives an overtaken read the newer read’s answer and never lands it', async () => {
    const reads = createNewestRead<string, boolean>();
    const first = deferred<string>();
    const second = deferred<string>();
    const landed: string[] = [];
    const land = (outcome: string) => {
      landed.push(outcome);
      return outcome === 'second';
    };
    const firstAnswer = reads.run(() => first.promise, land);
    const secondAnswer = reads.run(() => second.promise, land);
    first.resolve('first');
    await Promise.resolve();
    expect(reads.pending()).toBe(true);
    second.resolve('second');
    await expect(firstAnswer).resolves.toBe(true);
    await expect(secondAnswer).resolves.toBe(true);
    expect(landed).toEqual(['second']);
    expect(reads.pending()).toBe(false);
  });

  it('gives an overtaken read the newer read’s failure too', async () => {
    const reads = createNewestRead<boolean, boolean>();
    const first = deferred<boolean>();
    const second = deferred<boolean>();
    const land = (worked: boolean) => worked;
    const firstAnswer = reads.run(() => first.promise, land);
    reads.run(() => second.promise, land);
    first.resolve(true);
    second.resolve(false);
    await expect(firstAnswer).resolves.toBe(false);
  });

  it('drops an older read that lands after the newer one', async () => {
    const reads = createNewestRead<string, string>();
    const first = deferred<string>();
    const second = deferred<string>();
    const landed: string[] = [];
    const land = (outcome: string) => {
      landed.push(outcome);
      return outcome;
    };
    const firstAnswer = reads.run(() => first.promise, land);
    reads.run(() => second.promise, land);
    second.resolve('second');
    first.resolve('first');
    await expect(firstAnswer).resolves.toBe('second');
    expect(landed).toEqual(['second']);
  });
});
