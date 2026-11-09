import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// conventions-rule-4: eslint's max-lines holds the .ts and .mjs files; it never reads a stylesheet,
// so this counts them the same way: comments and blank lines do not count.
const LIMIT = 600;

function codeLines(stylesheet: string): number {
  return stylesheet
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => line.trim() !== '').length;
}

function stylesheets(): string[] {
  return readdirSync('src', { recursive: true, encoding: 'utf8' }).filter((file) => file.endsWith('.css'));
}

describe('stylesheets', () => {
  it(`stay at or under ${LIMIT} code lines`, () => {
    const over = stylesheets()
      .map((file) => ({ file, lines: codeLines(readFileSync(path.join('src', file), 'utf8')) }))
      .filter(({ lines }) => lines > LIMIT);
    expect(over).toEqual([]);
  });

  it('finds the stylesheets the app has, so an empty scan cannot pass', () => {
    expect(stylesheets()).not.toHaveLength(0);
  });

  it('does not count comments or blank lines', () => {
    expect(codeLines('/* a\n b */\n\n.a { color: red; }\n  \n.b {} /* c */\n')).toBe(2);
  });
});
