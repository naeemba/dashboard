import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { docOrder, docScope, imageUrls, listDocs, readDoc } from './docs-list';

// Skipped on Windows, which reads a POSIX path such as /work/api as one on the current drive, D:\work\api, so the paths these expect never come back.
const posixPathsOnly = it.skipIf(process.platform === 'win32');

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
    writeFileSync(path.join(project, 'docs', 'board', 'cards.yaml'), '');
    writeFileSync(path.join(project, 'docs', 'board', 'schema.json'), '');
    expect(await listDocs(project, [], [])).toEqual([
      { path: path.join(project, 'docs', 'README.md'), name: 'README.md' },
      { path: path.join(project, 'docs', 'board', 'README.md'), name: 'board/README.md' },
      { path: path.join(project, 'docs', 'board', 'cards.yaml'), name: 'board/cards.yaml' },
      { path: path.join(project, 'docs', 'board', 'schema.json'), name: 'board/schema.json' },
    ]);
  });

  it('lists nothing for a project with no docs folder', async () => {
    expect(await listDocs(mkdtempSync(path.join(tmpdir(), 'docs-list-')), [], [])).toEqual([]);
  });

  it("on the manager's page lists its roots and reads only the folders opened, inside them", async () => {
    const home = mkdtempSync(path.join(tmpdir(), 'docs-home-'));
    mkdirSync(path.join(home, '.claude', 'commands'), { recursive: true });
    mkdirSync(path.join(home, 'Workspace'));
    mkdirSync(path.join(home, 'dotfiles', 'rules'), { recursive: true });
    writeFileSync(path.join(home, '.claude', 'CLAUDE.md'), '');
    writeFileSync(path.join(home, '.claude', 'settings.json'), '');
    writeFileSync(path.join(home, 'dotfiles', 'rules', 'naming.md'), '');
    writeFileSync(path.join(home, 'Workspace', 'notes.md'), '');
    // A folder linked in from a dotfiles repository is a folder; a broken link is left out.
    symlinkSync(path.join(home, 'dotfiles', 'rules'), path.join(home, '.claude', 'rules'));
    symlinkSync(path.join(home, 'gone'), path.join(home, '.claude', 'gone'));
    const roots = [path.join(home, '.dashboard'), path.join(home, '.claude')];
    const tops = [
      { path: path.join(home, '.dashboard'), name: '.dashboard', folder: true },
      { path: path.join(home, '.claude'), name: '.claude', folder: true },
    ];
    expect(await listDocs('', [], roots)).toEqual(tops);
    expect(await listDocs('', ['.claude', '.dashboard', 'Workspace', '.claude/../Workspace', '.claude/rules'], roots)).toEqual([...tops,
      { path: path.join(home, '.claude', 'CLAUDE.md'), name: '.claude/CLAUDE.md' },
      { path: path.join(home, '.claude', 'commands'), name: '.claude/commands', folder: true },
      { path: path.join(home, '.claude', 'rules'), name: '.claude/rules', folder: true },
      { path: path.join(home, '.claude', 'rules', 'naming.md'), name: '.claude/rules/naming.md' },
      { path: path.join(home, '.claude', 'settings.json'), name: '.claude/settings.json' },
    ]);
  });
});

describe('docScope', () => {
  const ROOTS = ['/h/.dashboard', '/h/.claude'];

  posixPathsOnly('takes only markdown, YAML and JSON under the docs folder', () => {
    expect(docScope('/p', '/p/docs/board/README.md', [])).toEqual({ root: '/p/docs', images: '/p' });
    expect(docScope('/p', '/p/docs/board/cards.yml', [])).toEqual({ root: '/p/docs', images: '/p' });
    expect(docScope('/p', '/p/docs/shot.png', [])).toBeNull();
    expect(docScope('/p', '/h/.claude/CLAUDE.md', ROOTS)).toBeNull();
  });

  it('refuses a file outside the docs folder', () => {
    expect(docScope('/p', '/p/docs/../secret.md', [])).toBeNull();
    expect(docScope('/p', '/home/me/.ssh/id_rsa', [])).toBeNull();
  });

  it("on the manager's page takes only markdown, YAML and JSON under ~/.dashboard and ~/.claude", () => {
    expect(docScope('', '/h/.claude/rules/naming.md', ROOTS)).toEqual({ root: '/h/.claude', images: '/h/.claude' });
    expect(docScope('', '/h/.dashboard/notes.md', ROOTS)).toEqual({ root: '/h/.dashboard', images: '/h/.dashboard' });
    expect(docScope('', '/h/.claude/settings.json', ROOTS)).toEqual({ root: '/h/.claude', images: '/h/.claude' });
    for (const file of ['/h/.claude/.credentials', '/h/.claude/../.ssh/x.json', '/h/Workspace/a.md', '/p/docs/README.md']) {
      expect(docScope('', file, ROOTS)).toBeNull();
    }
  });
});

describe('imageUrls', () => {
  const read = new Map([['/p/docs/screenshots/board.png', Buffer.from('png')]]);
  const url = `data:image/png;base64,${Buffer.from('png').toString('base64')}`;

  posixPathsOnly("carries an image inside the project inline, by its address, relative to the doc's folder", () => {
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
    expect(await readDoc(project, path.join(project, 'docs', 'README.md'), []))
      .toEqual({ text: '# Docs ![a](a.png) ![b](gone.png)', images: { 'a.png': `data:image/png;base64,${Buffer.from('png').toString('base64')}` } });
    expect(await readDoc(project, path.join(project, 'secret.md'), [])).toHaveProperty('refused');
  });

  it('reads a YAML or JSON doc as text, with no images looked for', async () => {
    const project = mkdtempSync(path.join(tmpdir(), 'docs-read-'));
    mkdirSync(path.join(project, 'docs'));
    writeFileSync(path.join(project, 'docs', 'a.png'), 'png');
    writeFileSync(path.join(project, 'docs', 'cards.yaml'), 'shot: ![a](a.png)\n');
    expect(await readDoc(project, path.join(project, 'docs', 'cards.yaml'), [])).toEqual({ text: 'shot: ![a](a.png)\n', images: {} });
  });
});
