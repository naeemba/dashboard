import { describe, expect, it } from 'vitest';
import { checkedFile, longLines } from './markdown-width.mjs';

const long = 'word '.repeat(30).trim();

describe('longLines', () => {
  it('names a prose line or a list item over the width, with its number and width', () => {
    expect(longLines(`# Title\n\n${long}\n- ${long}\n`, 100)).toEqual([
      { line: 3, length: 149 },
      { line: 4, length: 151 },
    ]);
  });

  it('passes a line at the width', () => {
    expect(longLines('x'.repeat(100), 100)).toEqual([]);
  });

  it('counts characters, not bytes', () => {
    expect(longLines('→'.repeat(100), 100)).toEqual([]);
  });

  it('exempts a heading, a table row and a line holding a URL', () => {
    expect(longLines(`## ${long}\n\n| ${long} |\n\nSee https://example.com/${long}\n`, 100)).toEqual([]);
  });

  it('exempts a fenced block up to its closing fence, and checks the prose after it', () => {
    expect(longLines(`\`\`\`ts\n${long}\n\`\`\`\n${long}\n`, 100)).toEqual([{ line: 4, length: 149 }]);
  });

  it('keeps a longer fence open past a shorter one inside it', () => {
    expect(longLines(`\`\`\`\`md\n\`\`\`\n${long}\n\`\`\`\n\`\`\`\`\n`, 100)).toEqual([]);
  });

  it('closes a fence only on its own character', () => {
    expect(longLines(`~~~\n\`\`\`\n${long}\n~~~\n${long}\n`, 100)).toEqual([{ line: 5, length: 149 }]);
  });

  it('exempts an indented code block, but not a list item\'s indented second line', () => {
    expect(longLines(`Run it:\n\n    ${long}\n\n    ${long}\n`, 100)).toEqual([]);
    expect(longLines(`- item\n    ${long}\n`, 100)).toEqual([{ line: 2, length: 153 }]);
  });

  it('exempts the front matter', () => {
    expect(longLines(`---\ndescription: ${long}\n---\n\nBody\n`, 100)).toEqual([]);
  });

  it('reads a CRLF file the same, front matter and width', () => {
    expect(longLines(`---\r\ndescription: ${long}\r\n---\r\n\r\n${'x'.repeat(100)}\r\n`, 100)).toEqual([]);
  });
});

describe('checkedFile', () => {
  it('checks the docs and leaves the board and the changelog out', () => {
    expect(checkedFile('docs/workers/README.md')).toBe(true);
    expect(checkedFile('.dashboard/notes.md')).toBe(false);
    expect(checkedFile('CHANGELOG.md')).toBe(false);
    expect(checkedFile('src/main/main.ts')).toBe(false);
  });
});
