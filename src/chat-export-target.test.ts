import { describe, expect, it } from 'vitest';
import { exportTarget } from './chat-export-target';

describe('exportTarget', () => {
  it('keeps the file inside the project folder', () => {
    expect(exportTarget('/work/app', 'notes/a.txt')).toBe('/work/app/notes/a.txt');
    expect(exportTarget('/work/app', '../a.txt')).toBeNull();
    expect(exportTarget('/work/app', '/etc/a.txt')).toBeNull();
  });
});
