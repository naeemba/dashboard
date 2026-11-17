import { mkdirSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { temporaryFolder } from '../testing/temporary-folder';
import { reviewLoopMissing, reviewLoopNotice, reviewLoopStaleness, type ReviewLoopGit } from './review-loop-install';

const NOW = Date.UTC(2026, 10, 17);

// A checkout the way install.sh leaves one: commands linked, the workflow copied, fetched an hour ago.
function installed(): { claude: string; checkout: string } {
  const root = temporaryFolder('review-loop-');
  const checkout = path.join(root, 'claude-pr-loop');
  const claude = path.join(root, '.claude');
  for (const folder of ['commands', 'workflows', '.git']) mkdirSync(path.join(checkout, folder), { recursive: true });
  for (const folder of ['commands', 'workflows']) mkdirSync(path.join(claude, folder), { recursive: true });
  for (const name of ['pr-loop.md', 'pr-review.md']) {
    writeFileSync(path.join(checkout, 'commands', name), name);
    symlinkSync(path.join(checkout, 'commands', name), path.join(claude, 'commands', name));
  }
  writeFileSync(path.join(checkout, 'workflows', 'pr-loop.js'), 'v1');
  writeFileSync(path.join(claude, 'workflows', 'pr-loop.js'), 'v1');
  writeFileSync(path.join(checkout, '.git', 'FETCH_HEAD'), '');
  utimesSync(path.join(checkout, '.git', 'FETCH_HEAD'), new Date(NOW - 3_600_000), new Date(NOW - 3_600_000));
  return { claude, checkout };
}

// Answers `behind` to the count, and keeps the subcommands it was asked for.
function fakeGit(behind: string): { git: ReviewLoopGit; asked: string[] } {
  const asked: string[] = [];
  const git: ReviewLoopGit = async ([subcommand]) => {
    asked.push(subcommand);
    return subcommand === 'rev-list' ? behind : '';
  };
  return { git, asked };
}

describe('reviewLoopMissing', () => {
  it('lets a review start when pr-loop.md is installed', () => {
    expect(reviewLoopMissing(installed().claude)).toBeNull();
  });

  it('refuses with the install line when it is not, or links to a checkout that has gone', () => {
    const { claude, checkout } = installed();
    rmSync(checkout, { recursive: true });
    expect(reviewLoopMissing(claude)).toContain('./install.sh');
    expect(reviewLoopMissing(temporaryFolder('no-claude-'))).toContain('/pr-loop is not installed');
  });
});

describe('reviewLoopStaleness', () => {
  it('finds nothing wrong with a current install and does not fetch again within the day', async () => {
    const { claude, checkout } = installed();
    const git = fakeGit('0');
    const staleness = await reviewLoopStaleness(claude, git.git, NOW);
    expect(staleness).toEqual({ checkout, behind: 0, workflows: [], dangling: [] });
    expect(git.asked).not.toContain('fetch');
    expect(reviewLoopNotice(staleness)).toBeNull();
  });

  it('fetches once a day has passed, and counts the commits behind', async () => {
    const { claude } = installed();
    const git = fakeGit('3');
    const staleness = await reviewLoopStaleness(claude, git.git, NOW + 2 * 86_400_000);
    expect(git.asked).toContain('fetch');
    expect(staleness?.behind).toBe(3);
  });

  it('names a workflow copy that differs or is missing, and a command link to nothing', async () => {
    const { claude, checkout } = installed();
    writeFileSync(path.join(checkout, 'workflows', 'pr-loop.js'), 'v2');
    writeFileSync(path.join(checkout, 'workflows', 'mr-loop.js'), 'v1');
    rmSync(path.join(checkout, 'commands', 'pr-review.md'));
    const staleness = await reviewLoopStaleness(claude, fakeGit('0').git, NOW);
    expect(staleness?.workflows.sort()).toEqual(['mr-loop.js', 'pr-loop.js']);
    expect(staleness?.dangling).toEqual(['pr-review.md']);
  });

  it('counts a git that fails as not behind', async () => {
    const { claude } = installed();
    const failing: ReviewLoopGit = () => Promise.reject(new Error('offline'));
    expect((await reviewLoopStaleness(claude, failing, NOW + 2 * 86_400_000))?.behind).toBe(0);
  });

  it('has nothing to ask of a pr-loop.md that is a plain file', async () => {
    const claude = temporaryFolder('copied-');
    mkdirSync(path.join(claude, 'commands'));
    writeFileSync(path.join(claude, 'commands', 'pr-loop.md'), '');
    expect(await reviewLoopStaleness(claude, fakeGit('5').git, NOW)).toBeNull();
  });
});

describe('reviewLoopNotice', () => {
  it('says pull and install when behind, install alone when only the copies are off', () => {
    const base = { checkout: '/c', behind: 0, workflows: [], dangling: [] };
    expect(reviewLoopNotice({ ...base, behind: 1 })).toBe("/pr-loop is out of date: the checkout is 1 commit behind origin. Run `cd '/c' && git pull && ./install.sh`");
    expect(reviewLoopNotice({ ...base, workflows: ['pr-loop.js'], dangling: ['old.md'] })).toBe(
      "/pr-loop is out of date: the installed pr-loop.js differs from the checkout's; old.md in ~/.claude/commands links to nothing. Run `cd '/c' && ./install.sh`",
    );
  });
});
