import { realpathSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { git, useGitTestEnvironment } from '../board/create-task-git-fixture';
import { temporaryFolder } from '../testing/temporary-folder';
import { markThrowaway, throwawaysOf } from './throwaway-marker';

useGitTestEnvironment();

// A real repository: what is pinned is where git keeps a worktree's own folder and what it writes there.
function repository(): { project: string; run: (...gitArguments: string[]) => void } {
  const project = realpathSync(temporaryFolder('dashboard-throwaway-'));
  const run = (...gitArguments: string[]): void => { git(project, ...gitArguments); };
  run('init', '-q');
  run('commit', '-q', '--allow-empty', '-m', 'first');
  return { project, run };
}

// git names a worktree in its own spelling: forward slashes and long names on Windows, where the temporary
// folder is a short 8.3 name. Both sides go through the file system's own real path before comparing.
async function realThrowawaysOf(project: string): Promise<string[]> {
  return (await throwawaysOf(project)).map((worktreePath) => realpathSync.native(worktreePath));
}

describe('throwaway marker', () => {
  it('finds the marked worktrees only, and none once the marked one is removed', async () => {
    const { project, run } = repository();
    const throwaway = join(project, 'research-it');
    const realThrowaway = (): string => realpathSync.native(throwaway);
    run('worktree', 'add', '-q', '-b', 'research-it', throwaway);
    run('worktree', 'add', '-q', '-b', 'card', join(project, 'card'));
    await markThrowaway(throwaway);
    expect(await realThrowawaysOf(project)).toEqual([realThrowaway()]);
    // A worker that checks out another branch keeps the mark: it is the worktree's, not the branch's.
    run('-C', throwaway, 'checkout', '-q', '-b', 'pull-request-12');
    expect(await realThrowawaysOf(project)).toEqual([realThrowaway()]);
    run('worktree', 'remove', throwaway);
    expect(await realThrowawaysOf(project)).toEqual([]);
  });

  it('finds none in a folder that is not a repository', async () => {
    expect(await throwawaysOf(temporaryFolder('dashboard-plain-'))).toEqual([]);
  });
});
