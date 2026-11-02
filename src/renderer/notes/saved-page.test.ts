import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TEXT_STRANDED } from './notes-state';
import { createSavedPage, SAVE_DELAY_MS, type SavedPageOptions } from './saved-page';

type Held<T> = { promise: Promise<T>; resolve(value: T): void; reject(error: unknown): void };

function held<T>(): Held<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

// A page held in a string, with a file behind it that answers or fails as a test says. With `held`,
// every read and write waits until the test answers it, so a test can choose the order they land in.
function fakePage(file: { text: string; readFails?: boolean; held?: boolean }) {
  let shown = '';
  let busy = false;
  const errors: string[] = [];
  const writes: string[] = [];
  const loads: Held<string>[] = [];
  const saves: Held<void>[] = [];
  const options: SavedPageOptions = {
    name: 'Notes',
    text: () => shown,
    show: (text) => (text.startsWith('!') ? undefined : (shown = text)),
    load: () => {
      if (file.held) {
        loads.push(held<string>());
        return loads.at(-1)!.promise;
      }
      return file.readFails ? Promise.reject(new Error('gone')) : Promise.resolve(file.text);
    },
    save: (text) => {
      writes.push(text);
      if (file.held) {
        saves.push(held<void>());
        return saves.at(-1)!.promise;
      }
      file.text = text;
      return Promise.resolve();
    },
    busy: () => busy,
    strandedWords: () => TEXT_STRANDED,
    onError: (message) => errors.push(message),
  };
  return {
    page: createSavedPage(options),
    type: (text: string) => (shown = text),
    shown: () => shown,
    setBusy: (value: boolean) => (busy = value),
    errors,
    writes,
    loads,
    saves,
  };
}

describe('createSavedPage', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('reads the file into the page and writes a change once the wait is over', async () => {
    const view = fakePage({ text: 'friday\n' });
    await view.page.read();
    expect(view.shown()).toBe('friday\n');
    view.type('friday\nmonday\n');
    view.page.changed();
    expect(view.writes).toEqual([]);
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    expect(view.writes).toEqual(['friday\nmonday\n']);
  });

  it('writes the waiting change before an arrival reads', async () => {
    const view = fakePage({ text: 'friday\n' });
    await view.page.read();
    view.type('monday\n');
    view.page.changed();
    await view.page.read();
    expect(view.writes).toEqual(['monday\n']);
    expect(view.shown()).toBe('monday\n');
  });

  it('never writes a page whose read failed, and says the page is stranded on the next arrival', async () => {
    const file = { text: 'three months\n', readFails: true };
    const view = fakePage(file);
    await view.page.read();
    expect(view.errors.at(-1)).toContain('Notes not read, so nothing is written: ');
    view.type('typed into the gap');
    view.page.changed();
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    expect(view.writes).toEqual([]);
    file.readFails = false;
    await view.page.read();
    expect(view.shown()).toBe('typed into the gap');
    expect(view.errors.at(-1)).toBe(TEXT_STRANDED.neverRead);
  });

  it('takes a file the page cannot show for a failed read', async () => {
    const view = fakePage({ text: '!hand edited' });
    await view.page.read();
    expect(view.errors.at(-1)).toContain('not in the format this page saves');
    view.type('a stroke');
    view.page.changed();
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    expect(view.writes).toEqual([]);
  });

  it('drops the older of two reads in flight when it comes back last', async () => {
    const view = fakePage({ text: '', held: true });
    const older = view.page.read();
    const newer = view.page.read();
    await vi.advanceTimersByTimeAsync(0);
    view.loads[1].resolve('newer\n');
    await newer;
    view.loads[0].resolve('older\n');
    await older;
    expect(view.shown()).toBe('newer\n');
  });

  it('does not read over a change made while the read was away', async () => {
    const view = fakePage({ text: '', held: true });
    const reading = view.page.read();
    await vi.advanceTimersByTimeAsync(0);
    view.type('typed meanwhile');
    view.loads[0].resolve('the file\n');
    await reading;
    expect(view.shown()).toBe('typed meanwhile');
  });

  it('does not read while a stroke is being drawn, before or after the file answers', async () => {
    const view = fakePage({ text: '', held: true });
    view.setBusy(true);
    await view.page.read();
    expect(view.loads).toEqual([]);
    view.setBusy(false);
    const reading = view.page.read();
    await vi.advanceTimersByTimeAsync(0);
    view.setBusy(true);
    view.loads[0].resolve('the file\n');
    await reading;
    expect(view.shown()).toBe('');
  });

  it('keeps the failed read on the bar when a write lands after it', async () => {
    const view = fakePage({ text: '', held: true });
    const first = view.page.read();
    await vi.advanceTimersByTimeAsync(0);
    view.loads[0].resolve('friday\n');
    await first;
    view.type('monday\n');
    view.page.changed();
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    expect(view.writes).toEqual(['monday\n']);
    // Back to what the file is known to hold, so the next arrival reads, and that read fails.
    view.type('friday\n');
    const second = view.page.read();
    await vi.advanceTimersByTimeAsync(0);
    view.loads[1].reject(new Error('gone'));
    await second;
    view.saves[0].resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(view.errors.at(-1)).toContain('Notes not read, so nothing is written: ');
  });
});
