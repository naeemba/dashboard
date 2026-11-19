import { describe, expect, it } from 'vitest';
import { filesToCheck, markdownToCheck, missingToolsRefusal, runsTypecheck } from './pre-commit.mjs';

describe('filesToCheck', () => {
  it('keeps the staged code files', () => {
    expect(filesToCheck(['src/main/main.ts', 'scripts/release.mjs'])).toEqual([
      'src/main/main.ts',
      'scripts/release.mjs',
    ]);
  });

  it('lints nothing in a commit that touches no code', () => {
    expect(filesToCheck(['docs/workflow/README.md', '.githooks/pre-commit'])).toEqual([]);
  });

  it('lints the whole project when the eslint settings or the installed plugins change', () => {
    expect(filesToCheck(['eslint.config.mjs', 'eslint.config.test.ts'])).toEqual(['.']);
    expect(filesToCheck(['package.json', 'pnpm-lock.yaml'])).toEqual(['.']);
  });
});

describe('runsTypecheck', () => {
  it('runs on staged code', () => {
    expect(runsTypecheck(['src/main/main.ts'])).toBe(true);
  });

  it('runs on a commit that only changes the type settings or the installed types', () => {
    expect(runsTypecheck(['tsconfig.json'])).toBe(true);
    expect(runsTypecheck(['tsconfig.node.json'])).toBe(true);
    expect(runsTypecheck(['package.json', 'pnpm-lock.yaml'])).toBe(true);
  });

  it('skips a board-only commit, so the board never waits on tsc', () => {
    expect(runsTypecheck(['.dashboard/board/cards/e3659878.json', '.dashboard/notes.md'])).toBe(false);
  });

  it('skips a docs-only commit', () => {
    expect(runsTypecheck(['docs/workflow/README.md', '.githooks/pre-commit'])).toBe(false);
  });
});

describe('missingToolsRefusal', () => {
  const installed = { toolsInstalled: true };
  const missing = { toolsInstalled: false };

  it('refuses staged code in a checkout with no tools installed, saying to run pnpm install', () => {
    expect(missingToolsRefusal(['src/main/main.ts'], missing)).toContain('Run pnpm install');
    expect(missingToolsRefusal(['tsconfig.json'], missing)).toContain('Run pnpm install');
  });

  it('lets a board-only or docs-only commit through with no tools installed', () => {
    expect(missingToolsRefusal(['.dashboard/board/cards/e3659878.json', 'docs/workflow/README.md'], missing)).toBe('');
  });

  it('refuses nothing once the tools are installed', () => {
    expect(missingToolsRefusal(['src/main/main.ts'], installed)).toBe('');
  });
});

describe('markdownToCheck', () => {
  it('holds the staged docs to the width, not the board or the changelog', () => {
    expect(markdownToCheck(['docs/workflow/README.md', '.dashboard/notes.md', 'CHANGELOG.md', 'src/main/main.ts']))
      .toEqual(['docs/workflow/README.md']);
  });
});
