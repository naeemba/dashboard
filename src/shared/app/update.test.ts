import { describe, expect, it } from 'vitest';
import { updateNotice, updateRows, updateTitle, type Release } from './update';

const RELEASE: Release = { version: '2.45.0', notes: [], url: '', assets: [] };

describe('the update notice and dialog', () => {
  it('offers what can be done from each state', () => {
    expect(updateRows({ kind: 'none' })).toEqual([]);
    expect(updateRows({ kind: 'available', release: RELEASE })).toEqual(['update', 'whats-new']);
    expect(updateRows({ kind: 'downloading', release: RELEASE })).toEqual(['whats-new']);
    expect(updateRows({ kind: 'staged', release: RELEASE })).toEqual(['restart', 'whats-new']);
  });

  it('says the release on the status bar only when there is something to do', () => {
    expect(updateNotice({ kind: 'available', release: RELEASE }, 'Ctrl+Shift+U')).toBe('Dashboard v2.45.0 is out · Ctrl+Shift+U to update');
    expect(updateNotice({ kind: 'staged', release: RELEASE }, 'Ctrl+Shift+U')).toBe('Dashboard v2.45.0 is ready · Ctrl+Shift+U to restart into it');
    expect(updateNotice({ kind: 'downloading', release: RELEASE }, 'Ctrl+Shift+U')).toBe('');
  });

  it('names the running version without its commit when nothing is newer', () => {
    expect(updateTitle({ kind: 'none' }, '2.44.0+acf504ceef1b')).toBe('Dashboard v2.44.0 is the newest release');
  });
});
