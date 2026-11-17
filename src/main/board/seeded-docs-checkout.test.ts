import { describe, expect, it } from 'vitest';
import { rewritesStaleSeededDocs } from './seeded-docs-checkout';

const onMain = { insideWorkTree: true as const, branch: 'main', head: 'origin/main', hasBranch: () => true };

describe('rewritesStaleSeededDocs', () => {
  it('rewrites on origin\'s default branch', () => {
    expect(rewritesStaleSeededDocs(onMain)).toBe(true);
    expect(rewritesStaleSeededDocs({ ...onMain, branch: 'master', head: null, hasBranch: (name) => name === 'master' })).toBe(true);
  });

  // insta-experiences-mr174: a worker's `git merge` of main refused over the rewritten CLAUDE.md.
  it('leaves a feature branch\'s copy alone', () => {
    expect(rewritesStaleSeededDocs({ ...onMain, branch: 'card-174' })).toBe(false);
  });

  it('leaves a detached checkout and one with no default branch alone', () => {
    expect(rewritesStaleSeededDocs({ ...onMain, branch: null })).toBe(false);
    expect(rewritesStaleSeededDocs({ ...onMain, head: null, hasBranch: () => false })).toBe(false);
  });

  it('rewrites in a folder git does not manage', () => {
    expect(rewritesStaleSeededDocs({ insideWorkTree: false })).toBe(true);
  });
});
