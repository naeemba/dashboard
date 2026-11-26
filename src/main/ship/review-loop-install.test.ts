import { mkdirSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { temporaryFolder } from '../testing/temporary-folder';
import { checkReviewLoop, reviewLoopMissing, reviewLoopNotice, reviewLoopStaleness, type ReviewLoopGit } from './review-loop-install';

const NOW = Date.UTC(2026, 10, 17);

// A checkout the way install.sh leaves one: commands linked, the workflow copied, fetched an hour ago.
function installed(): { claude: string; checkout: string } {
  const root = temporaryFolder('review-loop-');
  const checkout = path.join(root, 'claude-pr-loop');
  const claude = path.join(root, '.claude');
  for (const folder of ['commands', 'scripts', 'workflows', '.git']) mkdirSync(path.join(checkout, folder), { recursive: true });
  for (const folder of ['commands', 'scripts', 'workflows']) mkdirSync(path.join(claude, folder), { recursive: true });
  for (const name of ['commands/pr-loop.md', 'commands/pr-review.md', 'scripts/x.sh']) {
    writeFileSync(path.join(checkout, name), name);
    symlinkSync(path.join(checkout, name), path.join(claude, name));
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

  // The review calls the workflow copy by path, so a stale one would run old rounds unnoticed.
  it('refuses a workflow copy that differs from the checkout\'s or is missing, naming install.sh', () => {
    const { claude, checkout } = installed();
    writeFileSync(path.join(checkout, 'workflows', 'pr-loop.js'), 'v2');
    expect(reviewLoopMissing(claude)).toContain(`cd '${checkout}' && ./install.sh`);
    rmSync(path.join(claude, 'workflows', 'pr-loop.js'));
    expect(reviewLoopMissing(claude)).toContain('is missing or differs');
  });

  it('asks a copied install, with no checkout to compare with, only that the workflow is there', () => {
    const claude = temporaryFolder('copied-');
    for (const name of ['commands/pr-loop.md', 'workflows/pr-loop.js']) {
      mkdirSync(path.dirname(path.join(claude, name)), { recursive: true });
      writeFileSync(path.join(claude, name), name);
    }
    expect(reviewLoopMissing(claude)).toBeNull();
    rmSync(path.join(claude, 'workflows', 'pr-loop.js'));
    expect(reviewLoopMissing(claude)).toContain('git clone');
  });
});

describe('reviewLoopStaleness', () => {
  it('finds nothing wrong with a current install and does not fetch again within the day', async () => {
    const { claude, checkout } = installed();
    const git = fakeGit('0');
    const staleness = await reviewLoopStaleness(claude, git.git, NOW);
    expect(staleness).toEqual({ checkout, behind: 0, workflows: [], unlinked: [], dangling: [] });
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

  it('names a workflow copy that differs or is missing, a file not linked, and a link to nothing', async () => {
    const { claude, checkout } = installed();
    writeFileSync(path.join(checkout, 'workflows', 'pr-loop.js'), 'v2');
    writeFileSync(path.join(checkout, 'workflows', 'mr-loop.js'), 'v1');
    rmSync(path.join(checkout, 'commands', 'pr-review.md'));
    rmSync(path.join(claude, 'scripts', 'x.sh'));
    mkdirSync(path.join(checkout, 'review'));
    writeFileSync(path.join(checkout, 'review', 'standard.md'), '');
    const staleness = await reviewLoopStaleness(claude, fakeGit('0').git, NOW);
    expect(staleness?.workflows.sort()).toEqual(['mr-loop.js', 'pr-loop.js']);
    expect(staleness?.unlinked.sort()).toEqual(['review/standard.md', 'scripts/x.sh']);
    expect(staleness?.dangling).toEqual(['commands/pr-review.md']);
  });

  it('leaves a link into a checkout that has gone to the refusal', async () => {
    const { claude, checkout } = installed();
    rmSync(checkout, { recursive: true });
    expect(await reviewLoopStaleness(claude, fakeGit('0').git, NOW)).toBeNull();
  });

  it('still names the checkout when only pr-loop.md has gone from it', async () => {
    const { claude, checkout } = installed();
    rmSync(path.join(checkout, 'commands', 'pr-loop.md'));
    const staleness = await reviewLoopStaleness(claude, fakeGit('0').git, NOW);
    expect(staleness?.dangling).toEqual(['commands/pr-loop.md']);
    expect(reviewLoopNotice(staleness)).toContain(`cd '${checkout}'`);
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
    const base = { checkout: '/c', behind: 0, workflows: [], unlinked: [], dangling: [] };
    expect(reviewLoopNotice({ ...base, behind: 1 })).toBe("/pr-loop is out of date: the checkout is 1 commit behind origin. Run `cd '/c' && git pull && ./install.sh`");
    expect(reviewLoopNotice({ ...base, workflows: ['pr-loop.js'], unlinked: ['scripts/new.sh'], dangling: ['commands/old.md'] })).toBe(
      "/pr-loop is out of date: the installed pr-loop.js differs from the checkout's; scripts/new.sh is not in ~/.claude; ~/.claude/commands/old.md links to nothing. Run `cd '/c' && ./install.sh`",
    );
  });
});

describe('checkReviewLoop', () => {
  it('shares a check under way, checks again once it is done, and takes the line down when fixed', async () => {
    const { claude, checkout } = installed();
    const git = fakeGit('0');
    const said: string[] = [];
    const say = (notice: string): void => { said.push(notice); };
    writeFileSync(path.join(checkout, 'workflows', 'pr-loop.js'), 'v2');
    const first = checkReviewLoop(say, claude, git.git, () => NOW);
    const second = checkReviewLoop(say, claude, git.git, () => NOW);
    expect(second).toBe(first);
    await first;
    expect(git.asked).toEqual(['rev-list']);
    expect(said).toHaveLength(1);
    expect(said[0]).toContain('pr-loop.js differs');
    writeFileSync(path.join(claude, 'workflows', 'pr-loop.js'), 'v2');
    await checkReviewLoop(say, claude, git.git, () => NOW);
    expect(git.asked).toEqual(['rev-list', 'rev-list']);
    expect(said[1]).toBe('');
  });
});
