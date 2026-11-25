import { describe, expect, it } from 'vitest';
import { exportTarget } from './chat-export-target';
import { posixPathsOnly } from '../testing/windows-skips';

const none = () => false;

describe('exportTarget', () => {
  posixPathsOnly('keeps the file inside the project folder', () => {
    expect(exportTarget('/work/app', 'notes/a.txt', none)).toEqual({ path: '/work/app/notes/a.txt' });
    expect(exportTarget('/work/app', '..notes.txt', none)).toEqual({ path: '/work/app/..notes.txt' });
  });
  it('refuses a file outside the project folder', () => {
    expect(exportTarget('/work/app', '../a.txt', none)).toEqual({ refused: "../a.txt is outside the project's folder." });
    expect(exportTarget('/work/app', '/etc/a.txt', none)).toEqual({ refused: "/etc/a.txt is outside the project's folder." });
  });
  posixPathsOnly('never overwrites a file already there', () => {
    expect(exportTarget('/work/app', 'notes.md', (file) => file === '/work/app/notes.md'))
      .toEqual({ refused: 'notes.md already exists; pick another name.' });
  });
});
