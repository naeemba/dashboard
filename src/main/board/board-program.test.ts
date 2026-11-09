import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { addCard, emptyBoard } from '../../shared/board/board';
import { BOARD_FOLDER_PATH, readBoard, seedBoardDirectory, writeBoard } from './board-store';
import { guardAnswer, runBoardProgram } from './board-program';
import { temporaryFolder } from '../testing/temporary-folder';
import { syncBoard } from './board-sync-git';
import { boardOn, clone, git, remote, useGitTestEnvironment } from './create-task-git-fixture';

// The `board` command's write is committed, so its read must not salvage: a rename would leave the
// second run a clean board, and the next `git add -A` would commit the card as deleted.

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
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

describe('the board command on a board git tracks', { timeout: 60_000 }, () => {
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

  // A checkout with code changes is left where it is, so the comment is written there too. The same
  // comment, timestamp and all: one written again would go up as a second on the next sync.
  it('writes the same change into a checkout it cannot move, and the next sync adds nothing', async () => {
    const bare = remote();
    const checkout = clone(bare, false);
    git(checkout, 'checkout', '--quiet', 'main');
    writeBoard(checkout, addCard(emptyBoard(), { column: 1, card: 0 }, 'card', 'the card').board);
    writeFileSync(join(checkout, 'code.txt'), 'one\n');
    git(checkout, 'add', '-A');
    git(checkout, 'commit', '--quiet', '-m', 'board');
    git(checkout, 'push', '--quiet', 'origin', 'main');
    writeFileSync(join(checkout, 'code.txt'), 'two\n');
    vi.spyOn(process, 'cwd').mockReturnValue(checkout);
    vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    expect(await runBoardProgram(['comment', 'card', 'hello'])).toBe(0);
    await syncBoard(checkout);
    const card = boardOn(bare)?.columns.flatMap((column) => column.cards).find((entry) => entry.id === 'card');
    expect(card?.comments?.map((comment) => comment.body)).toEqual(['hello']);
  });

  // A sync that throws for a reason nobody planned for is one more way of not reaching origin: the
  // change is written here, with the warning, rather than refused.
  it('writes the change here when the sync throws, and warns', async () => {
    const bare = remote();
    const checkout = clone(bare, false);
    git(checkout, 'checkout', '--quiet', 'main');
    writeBoard(checkout, addCard(emptyBoard(), { column: 1, card: 0 }, 'card', 'the card').board);
    git(checkout, 'add', '-A');
    git(checkout, 'commit', '--quiet', '-m', 'board');
    git(checkout, 'push', '--quiet', 'origin', 'main');
    // The sync's scratch folder goes under the temp folder; one that does not exist makes mkdtempSync
    // throw. TMPDIR is what os.tmpdir() reads off Windows, TEMP and TMP what it reads on it.
    const missing = join(temporaryFolder('board-program-missing-'), 'missing');
    for (const name of ['TMPDIR', 'TEMP', 'TMP']) vi.stubEnv(name, missing);
    vi.spyOn(process, 'cwd').mockReturnValue(checkout);
    vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    expect(await runBoardProgram(['comment', 'card', 'hello'])).toBe(0);
    expect(String(stderr.mock.calls.at(-1)?.[0])).toContain('not on origin');
    const card = readBoard(checkout, false).board.columns.flatMap((column) => column.cards).find((entry) => entry.id === 'card');
    expect(card?.comments?.map((comment) => comment.body)).toEqual(['hello']);
  });
});

describe('board guard', () => {
  const noProcess = () => null;
  const write = JSON.stringify({ tool_name: 'Write', tool_input: { file_path: '/p/.dashboard/board/cards/a.json' } });

  it('names $DASHBOARD_BOARD in a pane the app opened, and its own path outside one', () => {
    expect(guardAnswer(write, '/app/board.js', '/home/me/.claude/dashboard/board.js', noProcess)).toContain('node \\"$DASHBOARD_BOARD\\"');
    expect(guardAnswer(write, undefined, '/home/me/.claude/dashboard/board.js', noProcess)).toContain('node \\"/home/me/.claude/dashboard/board.js\\"');
  });

  it('prints nothing for a call it lets through', () => {
    expect(guardAnswer(JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'cat .dashboard/board/cards/a.json' } }), undefined, 'board.js', noProcess)).toBe('');
  });

  it('refuses killing the running app, with its own reason', () => {
    const kill = JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'kill 4242' } });
    const app = () => [{ pid: 4242, names: ['Dashboard'], commandLine: '/home/me/.local/opt/dashboard/Dashboard --type=renderer' }];
    expect(JSON.parse(guardAnswer(kill, undefined, 'board.js', app)).hookSpecificOutput.permissionDecisionReason).toContain('rebuild');
    expect(guardAnswer(kill, undefined, 'board.js', noProcess)).toBe('');
  });
});
