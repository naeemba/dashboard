import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { exportTarget } from './chat-export-target';

const none = () => false;
const app = path.resolve('/work/app');

describe('exportTarget', () => {
  it('keeps the file inside the project folder', () => {
    expect(exportTarget(app, 'notes/a.txt', none)).toEqual({ path: path.join(app, 'notes', 'a.txt') });
    expect(exportTarget(app, path.join('notes', 'a.txt'), none)).toEqual({ path: path.join(app, 'notes', 'a.txt') });
    expect(exportTarget(app, '..notes.txt', none)).toEqual({ path: path.join(app, '..notes.txt') });
  });
  it('refuses a file outside the project folder', () => {
    expect(exportTarget(app, '../a.txt', none)).toEqual({ refused: "../a.txt is outside the project's folder." });
    expect(exportTarget(app, path.join('..', 'a.txt'), none))
      .toEqual({ refused: `${path.join('..', 'a.txt')} is outside the project's folder.` });
    expect(exportTarget(app, '/etc/a.txt', none)).toEqual({ refused: "/etc/a.txt is outside the project's folder." });
  });
  it('never overwrites a file already there', () => {
    expect(exportTarget(app, 'notes.md', (file) => file === path.join(app, 'notes.md')))
      .toEqual({ refused: 'notes.md already exists; pick another name.' });
  });
});
