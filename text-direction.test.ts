import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { sourceFiles } from './src/main/testing/source-files';

// conventions-rule-2: every <input> and <textarea> gets dir = 'auto' in the change that adds it, or a
// Persian title typed into it runs away from the caret. Each box is found by the variable it is
// assigned to, and that same variable must set dir = 'auto' in the same file, so a dir set on a
// wrapper or on a second box does not count for the first.
const CREATES_BOX = /createElement\(['"](?:input|textarea)['"]\)/g;
// `const name = …createElement('input')`, also across lines (the ternary in card-editor.ts).
const NAMED_BOX = /(?:const|let)\s+(\w+)\b[^;=]*=[^;]*?createElement\(['"](?:input|textarea)['"]\)[^;]*/g;

function boxesWithoutDirection(): string[] {
  const problems: string[] = [];
  for (const name of sourceFiles('src')) {
    const source = readFileSync(name, 'utf8');
    let named = 0;
    for (const [declaration, variable] of source.matchAll(NAMED_BOX)) {
      named += declaration.match(CREATES_BOX)?.length ?? 0;
      if (!source.includes(`${variable}.dir = 'auto'`)) problems.push(`${name}: ${variable}`);
    }
    const created = source.match(CREATES_BOX)?.length ?? 0;
    if (created > named) problems.push(`${name}: ${created - named} box(es) not assigned to a variable`);
  }
  return problems;
}

describe('text boxes', () => {
  it('set dir = auto on every input or textarea they create', () => {
    expect(boxesWithoutDirection()).toEqual([]);
  });

  it('finds the boxes the app has, so an empty scan cannot pass', () => {
    const files = sourceFiles('src').filter((file) => readFileSync(file, 'utf8').match(CREATES_BOX));
    expect(files).not.toHaveLength(0);
  });
});
