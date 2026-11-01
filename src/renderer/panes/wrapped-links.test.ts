import { describe, expect, it } from 'vitest';
import { fileLinksIn, webLinksIn } from '../nvim/file-links';
import { linksStartingOn, linksTouching, type WrapBuffer } from './wrapped-links';

// A pane ten cells wide. A row starting with `>` is one the terminal wrapped onto from the row above;
// the `>` itself is not part of the text. A trailing space in a row is one the program wrote: xterm's
// trim keeps those and drops only the cells nothing was written to, which here is the padding.
const COLUMNS = 10;
const buffer = (rows: string[]): WrapBuffer => ({
  baseY: 0,
  length: rows.length,
  getLine: (row) => {
    const raw = rows[row];
    if (raw === undefined) return undefined;
    const text = raw.replace(/^>/, '');
    return {
      isWrapped: raw.startsWith('>'),
      length: COLUMNS,
      translateToString: (trim) => (trim ? text : text.padEnd(COLUMNS)),
      getCell: (column) => ({ getChars: () => text.charAt(column), getWidth: () => 1 }),
    };
  },
});
const paths = (rows: string[], row: number, width = COLUMNS) => linksStartingOn(buffer(rows), row, () => width, fileLinksIn)
  .map(({ link, start, end }) => [link.path, start.row, start.column, end.row, end.column]);

describe('linksStartingOn', () => {
  // Claude Code's fullscreen view writes spaces out to the edge after the cut.
  it('joins a path whose row the program filled with spaces after the cut', () => {
    expect(paths(['- a/b/cd/ ', '  e/f.md  '], 0)).toEqual([['a/b/cd/e/f.md', 0, 2, 1, 8]]);
  });

  it('keeps a path off the row under it when the spaces after it, not the path, reach the edge', () => {
    expect(paths(['- a/b/c/  ', '  d.md    '], 0)).toEqual([['a/b/c', 0, 2, 0, 7]]);
  });

  // How Claude Code prints a path too long for its list item: cut at the edge, the rest indented.
  it('joins a path the program broke at the edge and indented', () => {
    expect(paths(['- a/b/cde/', '  f/g.md.'], 0)).toEqual([['a/b/cde/f/g.md', 0, 2, 1, 8]]);
  });

  it('joins a path the terminal wrapped', () => {
    expect(paths(['see a/b/cd', '>e.ts'], 0)).toEqual([['a/b/cde.ts', 0, 4, 1, 4]]);
  });

  // The second half is not a path of its own, but what follows it on the row is.
  it('leaves the carried half out of the row it lands on', () => {
    expect(paths(['- a/b/cde/', '  f/g x.ts'], 1)).toEqual([['x.ts', 1, 6, 1, 10]]);
  });

  it('joins a path over three rows', () => {
    expect(paths(['- a/b/cde/', '  fgh/ijk/', '  l.md'], 0)).toEqual([['a/b/cde/fgh/ijk/l.md', 0, 2, 2, 6]]);
  });

  // A full row of log output followed by another is two lines, not one.
  it('keeps a full row to itself when the next is not indented', () => {
    expect(paths(['- a/b/cdef', 'g.md'], 0)).toEqual([['a/b/cdef', 0, 2, 0, 10]]);
  });

  // Prose indents every row under its bullet; a word at the edge is not a path cut short.
  it('keeps a prose row ending at the edge off the indented path below it', () => {
    expect(paths(['- edit in', '  src/a.ts'], 1)).toEqual([['src/a.ts', 1, 2, 1, 10]]);
  });

  // Printed at ten cells, then the pane was zoomed wider: each row is measured against the width it had.
  it('joins a path printed before the pane grew', () => {
    const printedAtTen = (row: number) => (row < 2 ? COLUMNS : COLUMNS + 4);
    const links = linksStartingOn(buffer(['- a/b/cde/', '  f/g.md.']), 0, printedAtTen, fileLinksIn);
    expect(links.map(({ link }) => link.path)).toEqual(['a/b/cde/f/g.md']);
  });

  it('keeps a path off the indented row under it when it stops short of the width it was printed at', () => {
    expect(paths(['- a/b/c/', '  d.md'], 0)).toEqual([['a/b/c', 0, 2, 0, 7]]);
    expect(paths(['- a/b/c/', '  d.md'], 0, COLUMNS + 4)).toEqual([['a/b/c', 0, 2, 0, 7]]);
  });

  it('joins a cut row one cell short of its width', () => {
    expect(paths(['- a/b/cd/', '  e.md'], 0)).toEqual([['a/b/cd/e.md', 0, 2, 1, 6]]);
  });

  it('keeps the space a terminal wrap fell after', () => {
    expect(paths(['see this ', '>src/a.ts'], 1)).toEqual([['src/a.ts', 1, 0, 1, 8]]);
  });

  it('with Infinity columns, only a row the terminal wrapped carries on', () => {
    const infinite = (rows: string[]) => linksStartingOn(buffer(rows), 0, () => Infinity, fileLinksIn).map(({ link }) => link.path);
    expect(infinite(['- a/b/cde/', '  f/g.md.'])).toEqual(['a/b/cde']);
    expect(infinite(['see a/b/cd', '>e.ts'])).toEqual(['a/b/cde.ts']);
  });

  it('keeps a row to itself when the next one is blank or starts with a space after a wrap', () => {
    expect(paths(['- a/b/cde/', ''], 0)).toEqual([['a/b/cde', 0, 2, 0, 9]]);
    expect(paths(['see a/b/cd', '> e.ts'], 0)).toEqual([['a/b/cd', 0, 4, 0, 10]]);
  });
});

describe('linksTouching', () => {
  it('gives the middle row of three the link passing through it', () => {
    const links = linksTouching(buffer(['- a/b/cde/', '  fgh/ijk/', '  l.md']), 1, () => COLUMNS, fileLinksIn);
    expect(links.map(({ link }) => link.path)).toEqual(['a/b/cde/fgh/ijk/l.md']);
  });

  // Hovering the second half underlines and opens the whole address, from where it starts.
  it('gives the row below the link that ends on it', () => {
    const links = linksTouching(buffer(['https://ex', '  am.co/a.']), 1, () => COLUMNS, webLinksIn);
    expect(links.map(({ text, start, end }) => [text, start.row, end.row, end.column])).toEqual([
      ['https://exam.co/a', 0, 1, 9],
    ]);
  });
});
