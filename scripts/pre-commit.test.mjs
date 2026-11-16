import { describe, expect, it } from 'vitest';
import { filesToCheck } from './pre-commit.mjs';

describe('filesToCheck', () => {
  it('keeps the staged code files', () => {
    expect(filesToCheck(['src/main/main.ts', 'scripts/release.mjs', 'eslint.config.mjs'])).toEqual([
      'src/main/main.ts',
      'scripts/release.mjs',
      'eslint.config.mjs',
    ]);
  });

  it('skips a board-only commit, so the board never waits on tsc', () => {
    expect(filesToCheck(['.dashboard/board/cards/e3659878.json', '.dashboard/notes.md'])).toEqual([]);
  });

  it('skips a commit that touches no code', () => {
    expect(filesToCheck(['docs/workflow/README.md', 'package.json', '.githooks/pre-commit'])).toEqual([]);
  });
});
