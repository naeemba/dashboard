import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TEXT_STRANDED } from './notes-state';
import { createSavedPage, SAVE_DELAY_MS, type SavedPageOptions } from './saved-page';

// A page held in a string, with a file behind it that answers or fails as a test says.
function fakePage(file: { text: string; readFails?: boolean }) {
  let shown = '';
  const errors: string[] = [];
  const writes: string[] = [];
  const options: SavedPageOptions = {
    name: 'Notes',
    text: () => shown,
    show: (text) => (text.startsWith('!') ? undefined : (shown = text)),
    load: () => (file.readFails ? Promise.reject(new Error('gone')) : Promise.resolve(file.text)),
    save: (text) => {
      writes.push(text);
      file.text = text;
      return Promise.resolve();
    },
    strandedWords: () => TEXT_STRANDED,
    onError: (message) => errors.push(message),
  };
  return { page: createSavedPage(options), type: (text: string) => (shown = text), shown: () => shown, errors, writes };
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
});
