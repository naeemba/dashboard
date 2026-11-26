import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runProgram } from '../app/git';
import { temporaryFolder } from '../testing/temporary-folder';
import { git, useGitTestEnvironment } from '../board/create-task-git-fixture';
import { boardNotOnOrigin } from './board-on-origin';

describe('boardNotOnOrigin', () => {
  useGitTestEnvironment();

  // A clean checkout whose one unpushed commit moves a card, and no origin to find it on.
  function committedCardOnly(): string {
    const project = join(temporaryFolder('dashboard-board-on-origin-'), 'project');
    mkdirSync(join(project, '.dashboard', 'board', 'cards'), { recursive: true });
    git(project, 'init', '--quiet', '--initial-branch', 'main');
    writeFileSync(join(project, '.dashboard/board/cards/a1.json'), '{"column":"Review"}');
    git(project, 'add', '-A');
    git(project, 'commit', '--quiet', '-m', 'board: move a1');
    return project;
  }

  it('asks nothing of a committed card file when only uncommitted ones count', async () => {
    expect(await boardNotOnOrigin(runProgram, committedCardOnly(), undefined, false)).toBeNull();
  });

  it('keeps a committed card file origin cannot be asked about', async () => {
    expect(await boardNotOnOrigin(runProgram, committedCardOnly())).not.toBeNull();
  });
});
