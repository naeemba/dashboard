import { describe, expect, it } from 'vitest';
import { fileLinksIn, hintLabels } from './file-links';

const paths = (text: string) => fileLinksIn(text).map((link) => link.path);

describe('fileLinksIn', () => {
  it('finds a path with its line and column, spanning all three', () => {
    expect(fileLinksIn('error at src/main.ts:42:7 here')).toEqual([
      { start: 9, end: 25, path: 'src/main.ts', line: 42, column: 7 },
    ]);
  });

  it('finds a path with a line and no column', () => {
    expect(fileLinksIn('src/main.ts:42')).toEqual([{ start: 0, end: 14, path: 'src/main.ts', line: 42 }]);
  });

  it('finds the prefixed forms', () => {
    expect(paths('~/.zshrc ./notes.md ../up/file.ts /etc/hosts')).toEqual([
      '~/.zshrc', './notes.md', '../up/file.ts', '/etc/hosts',
    ]);
  });

  it('finds a bare file name with an extension and a dotted folder', () => {
    expect(paths('edit README.md and .dashboard/board.json')).toEqual(['README.md', '.dashboard/board.json']);
  });

  // The full stop that ends a sentence, and the quote or bracket around a path, are not the path.
  it('leaves out the punctuation around a path', () => {
    expect(paths('See `src/page.ts`.')).toEqual(['src/page.ts']);
    expect(paths('(src/page.ts:3), "a/b.ts"')).toEqual(['src/page.ts', 'a/b.ts']);
  });

  it('passes over words and versions', () => {
    expect(paths('version 1.5.2 hello world')).toEqual([]);
  });

  // webLinksIn has those; underlining their path part as a file would draw two links.
  it('leaves a url to webLinksIn', () => {
    expect(paths('see https://example.com/docs/intro.html now')).toEqual([]);
  });

  it('does not start a path in the middle of a word', () => {
    expect(paths('foo:src/a.ts')).toEqual([]);
    expect(paths('über/x.ts')).toEqual([]);
    expect(paths('key=src/a.ts')).toEqual(['src/a.ts']);
  });

  // The rule is "no slash and no extension", not "is a folder": a folder two deep still underlines, and
  // main finds no file there and says so, the way it does for `and/or`.
  it('passes over a bare word followed by a slash', () => {
    expect(paths('cd src/')).toEqual([]);
    expect(paths('cd src/lib/')).toEqual(['src/lib']);
  });
});

describe('hintLabels', () => {
  it('gives one distinct letter per path, home row first', () => {
    expect(hintLabels(3)).toEqual(['a', 's', 'd']);
  });

  it('stops at the alphabet', () => {
    expect(hintLabels(40)).toHaveLength(26);
  });
});
