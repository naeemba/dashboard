import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { docOrder, imageUrls, isDoc, listDocs, readDoc } from './docs-list';

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

describe('isDoc', () => {
  it('takes only markdown under the docs folder', () => {
    expect(isDoc('/p', '/p/docs/board/README.md')).toBe(true);
    expect(isDoc('/p', '/p/docs/../secret.md')).toBe(false);
    expect(isDoc('/p', '/home/me/.ssh/id_rsa')).toBe(false);
    expect(isDoc('/p', '/p/docs/shot.png')).toBe(false);
  });
});

describe('imageUrls', () => {
  const read = new Map([['/p/docs/screenshots/board.png', Buffer.from('png')]]);
  const url = `data:image/png;base64,${Buffer.from('png').toString('base64')}`;

  it("carries an image inside the project inline, by its address, relative to the doc's folder", () => {
    expect(imageUrls('See ![the board](../screenshots/board.png "t").', '/p/docs/board/README.md', '/p', read))
      .toEqual({ '../screenshots/board.png': url });
  });

  it('leaves out one outside the project, from the web, missing, of another type or badly escaped', () => {
    for (const text of ['![a](../../../etc/x.png)', '![a](https://x.example/a.png)', '![a](gone.png)', '![a](notes.svg)', '![a](50%.png)']) {
      expect(imageUrls(text, '/p/docs/board/README.md', '/p', read)).toEqual({});
    }
  });
});

describe('readDoc', () => {
  it('reads a doc with its images and refuses a file outside the docs folder', async () => {
    const project = mkdtempSync(path.join(tmpdir(), 'docs-read-'));
    mkdirSync(path.join(project, 'docs'));
    writeFileSync(path.join(project, 'docs', 'README.md'), '# Docs ![a](a.png) ![b](gone.png)');
    writeFileSync(path.join(project, 'docs', 'a.png'), 'png');
    writeFileSync(path.join(project, 'secret.md'), 'no');
    expect(await readDoc(project, path.join(project, 'docs', 'README.md')))
      .toEqual({ text: '# Docs ![a](a.png) ![b](gone.png)', images: { 'a.png': `data:image/png;base64,${Buffer.from('png').toString('base64')}` } });
    expect(await readDoc(project, path.join(project, 'secret.md'))).toHaveProperty('refused');
  });
});
