import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { addCard, emptyBoard } from '../../shared/board/board';
import { BOARD_FOLDER_PATH, seedBoardDirectory, writeBoard } from './board-store';
import { runBoardProgram } from './board-program';
import { temporaryFolder } from '../testing/temporary-folder';
import { boardOn, clone, git, remote, useGitTestEnvironment } from './create-task-git-fixture';

// The `board` command's write is committed, so its read must not salvage: a rename would leave the
// second run a clean board, and the next `git add -A` would commit the card as deleted.

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the board command over a card file that does not parse', () => {
  it('refuses on every run and leaves the file under its own name', async () => {
    const project = temporaryFolder('board-program-');
    writeBoard(project, addCard(emptyBoard(), { column: 1, card: 0 }, 'card', 'the card').board);
    const cards = join(project, BOARD_FOLDER_PATH, 'cards');
    writeFileSync(join(cards, 'broken.json'), '{ "id": "broken", }');
    vi.spyOn(process, 'cwd').mockReturnValue(project);
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    for (let run = 0; run < 2; run += 1) {
      // A file edit: move, ship and review are the app's, and card.move refuses the same way there.
      expect(await runBoardProgram(['set', 'card', '--priority', 'high'])).toBe(1);
      expect(String(stderr.mock.calls.at(-1)?.[0])).toContain(join(cards, 'broken.json'));
    }
    expect(readdirSync(cards).filter((name) => name.startsWith('broken'))).toEqual(['broken.json']);
  });
});

describe('the board command on a board git tracks', () => {
  useGitTestEnvironment();

  // Doing, not Review or Ship: a move into those asks the running app, and no test may.
  it('moves the card on origin from a worktree, and leaves the worktree as it was', async () => {
    const bare = remote();
    const checkout = clone(bare, false);
    git(checkout, 'checkout', '--quiet', 'main');
    seedBoardDirectory(checkout);
    writeBoard(checkout, addCard(emptyBoard(), { column: 1, card: 0 }, 'card', 'the card').board);
    git(checkout, 'add', '-A');
    git(checkout, 'commit', '--quiet', '-m', 'board');
    git(checkout, 'push', '--quiet', 'origin', 'main');
    const worktree = join(temporaryFolder('board-program-worktrees-'), 'card');
    git(checkout, 'worktree', 'add', '--quiet', '-b', 'card', worktree);
    vi.spyOn(process, 'cwd').mockReturnValue(worktree);
    const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    expect(await runBoardProgram(['move', 'card', 'Doing'])).toBe(0);
    expect(String(stdout.mock.calls.at(-1)?.[0])).toBe('the card  →  Doing\n');
    const onOrigin = boardOn(bare);
    expect(onOrigin?.columns.find((column) => column.name === 'Doing')?.cards.map((card) => card.id)).toEqual(['card']);
    expect(git(worktree, 'status', '--porcelain')).toBe('');
    expect(git(worktree, 'log', '-1', '--format=%s')).toBe('board');
  });
});
