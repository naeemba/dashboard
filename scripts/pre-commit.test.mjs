import { describe, expect, it } from 'vitest';
import { filesToCheck, runsTypecheck } from './pre-commit.mjs';

const installed = { toolsInstalled: true };

describe('filesToCheck', () => {
  it('keeps the staged code files', () => {
    expect(filesToCheck(['src/main/main.ts', 'scripts/release.mjs', 'eslint.config.mjs'], installed)).toEqual([
      'src/main/main.ts',
      'scripts/release.mjs',
      'eslint.config.mjs',
    ]);
  });

  it('lints nothing in a commit that touches no code', () => {
    expect(filesToCheck(['docs/workflow/README.md', 'package.json', '.githooks/pre-commit'], installed)).toEqual([]);
  });

  it('checks nothing in a checkout with no tools installed, even with code staged', () => {
    expect(filesToCheck(['src/main/main.ts'], { toolsInstalled: false })).toEqual([]);
  });
});

describe('runsTypecheck', () => {
  it('runs on staged code', () => {
    expect(runsTypecheck(['src/main/main.ts'], installed)).toBe(true);
  });

  it('runs on a commit that only changes the type settings or the installed types', () => {
    expect(runsTypecheck(['tsconfig.json'], installed)).toBe(true);
    expect(runsTypecheck(['tsconfig.node.json'], installed)).toBe(true);
    expect(runsTypecheck(['package.json', 'pnpm-lock.yaml'], installed)).toBe(true);
  });

  it('skips a board-only commit, so the board never waits on tsc', () => {
    expect(runsTypecheck(['.dashboard/board/cards/e3659878.json', '.dashboard/notes.md'], installed)).toBe(false);
  });

  it('skips a docs-only commit', () => {
    expect(runsTypecheck(['docs/workflow/README.md', '.githooks/pre-commit'], installed)).toBe(false);
  });

  it('skips in a checkout with no tools installed, even with code staged', () => {
    expect(runsTypecheck(['src/main/main.ts'], { toolsInstalled: false })).toBe(false);
  });
});
