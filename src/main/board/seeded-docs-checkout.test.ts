import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { temporaryFolder } from '../testing/temporary-folder';
import { rewritesStaleSeededDocs, rewritesStaleSeededDocsAt } from './seeded-docs-checkout';

const onMain = { insideWorkTree: true as const, branch: 'main', defaultBranch: 'main' };

describe('rewritesStaleSeededDocs', () => {
  it('rewrites on origin\'s default branch', () => {
    expect(rewritesStaleSeededDocs(onMain)).toBe(true);
  });

  // insta-experiences-mr174: a worker's `git merge` of main refused over the rewritten CLAUDE.md.
  it('leaves a feature branch\'s copy alone', () => {
    expect(rewritesStaleSeededDocs({ ...onMain, branch: 'card-174' })).toBe(false);
  });

  it('leaves a detached checkout alone', () => {
    expect(rewritesStaleSeededDocs({ ...onMain, branch: null })).toBe(false);
  });

  // No origin remote, or a default branch git cannot name: nothing will ever bring main's copy.
  it('rewrites in a repository with no origin default branch, on any branch', () => {
    expect(rewritesStaleSeededDocs({ ...onMain, defaultBranch: null })).toBe(true);
    expect(rewritesStaleSeededDocs({ ...onMain, branch: 'card-174', defaultBranch: null })).toBe(true);
    expect(rewritesStaleSeededDocs({ ...onMain, branch: null, defaultBranch: null })).toBe(true);
  });

  it('rewrites in a folder git does not manage', () => {
    expect(rewritesStaleSeededDocs({ insideWorkTree: false })).toBe(true);
  });
});

describe('rewritesStaleSeededDocsAt', () => {
  // A folder the answer was asked of, then made a checkout on a feature branch of a repository whose
  // origin has main: the kept answer holds for a minute, so a board read every five seconds does not
  // ask git each time, and git is asked again after.
  it('keeps the answer a minute', () => {
    const folder = temporaryFolder('seeded-docs-');
    expect(rewritesStaleSeededDocsAt(folder, 0)).toBe(true);
    const run = (...gitArguments: string[]) => execFileSync('git', ['-c', 'user.name=test', '-c', 'user.email=test@example.com', ...gitArguments], { cwd: folder });
    run('init', '--quiet', '--initial-branch', 'feature');
    run('commit', '--quiet', '--allow-empty', '-m', 'start');
    run('update-ref', 'refs/remotes/origin/main', 'HEAD');
    expect(rewritesStaleSeededDocsAt(folder, 59_999)).toBe(true);
    expect(rewritesStaleSeededDocsAt(folder, 60_000)).toBe(false);
  });
});
