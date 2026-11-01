import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { docOrder, listDocs } from './docs-list';

describe('docOrder', () => {
  it("puts the index first and each folder's README before the rest of the folder", () => {
    const names = ['board/decisions.md', 'app/README.md', 'board/README.md', 'README.md', 'app/history.md'];
    expect(names.sort(docOrder)).toEqual(['README.md', 'app/README.md', 'app/history.md', 'board/README.md', 'board/decisions.md']);
  });
});

describe('listDocs', () => {
  it('lists the markdown under docs/, with paths the row can print', async () => {
    const project = mkdtempSync(path.join(tmpdir(), 'docs-list-'));
    mkdirSync(path.join(project, 'docs', 'board'), { recursive: true });
    writeFileSync(path.join(project, 'docs', 'README.md'), '');
    writeFileSync(path.join(project, 'docs', 'board', 'README.md'), '');
    writeFileSync(path.join(project, 'docs', 'board', 'shot.png'), '');
    expect(await listDocs(project)).toEqual([
      { path: path.join(project, 'docs', 'README.md'), name: 'README.md' },
      { path: path.join(project, 'docs', 'board', 'README.md'), name: 'board/README.md' },
    ]);
  });

  it('lists nothing for a project with no docs folder', async () => {
    expect(await listDocs(mkdtempSync(path.join(tmpdir(), 'docs-list-')))).toEqual([]);
  });
});
