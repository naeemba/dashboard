import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Board } from '../../shared/board/board';
import { rebaseBoardChange, sameBoard } from '../../shared/board/board-merge';
import { failureText } from '../../shared/errors/failure';
import { isManagerPath } from '../../shared/manager/manager';
import { baseBranch, git } from '../app/git';
import { realPath } from '../app/real-path';
import { BOARD_PATHSPECS, peekBoard, readBoard, writeBoard } from './board-store';
import {
  FETCH_TIMEOUT,
  PUSH_ATTEMPTS,
  PUSH_TIMEOUT,
  checkoutStep,
  notSyncedWarning,
  publishesCheckout,
  syncCommitMessage,
  type CheckoutStep,
} from './board-sync';
import { lostRace, NO_HOOKS } from './create-task';

// The board's git sync: every write to a board git tracks lands on origin's default branch, and the
// project's checkout is brought up to it. The decisions are board-sync.ts's; this is the git and the
// files, and nothing in it decides. docs/board/README.md says what it does and board-decision-5 why.
//
// One path for every writer. The `board` command hands its edit in; the app has written its edit
// already and hands in none, so what goes up is the checkout's uncommitted board. Either way the board
// committed is origin's as just fetched, with the checkout's own board edits replayed onto it
// (rebaseBoardChange), with the edit on top — never the checkout's copy written whole, which is how a
// copy 19 commits old once put cards back in columns they had left.
//
// The commit is made in a scratch folder holding only origin's board files, with an index of its own
// read from origin's tip: the checkout's branch, HEAD, index and working tree are not touched by it, a
// board change never rides in a feature branch, and nothing is left registered with `git worktree` if
// the program is killed half way.

const REMOTE = 'origin';

export type BoardEdit = (board: Board) => Board;

// What a write ends in. Synced: the board is on origin now, and `checkout` says where that leaves the
// folder asked about: `current`, it holds that board on disk too (it was up to date or was
// fast-forwarded); `stale`, it is the project's checkout but could not be moved (checkoutStep says
// why), so a caller with an edit writes it there as well; `elsewhere`, it is a worktree, whose board is
// its branch's and is left alone. Not synced: the caller
// writes the board where it is, as before there was a sync, and says the warning when there is one.
// A board git does not track has no warning: there is nothing for it to be in step with.
export type BoardSync = { synced: true; checkout: 'current' | 'stale' | 'elsewhere' } | { synced: false; warning: string | null };

export async function syncBoard(folder: string, edit: BoardEdit = (board) => board): Promise<BoardSync> {
  if (isManagerPath(folder)) return { synced: false, warning: null };
  const top = await answer(['rev-parse', '--show-toplevel'], folder);
  if (top === null) return { synced: false, warning: null };
  const [tracked, branch, checkout, gitDirectory] = await Promise.all([
    answer(['ls-files', '--', ...BOARD_PATHSPECS], top),
    baseBranch(top).catch((error: unknown) => new Error(failureText(error))),
    checkoutOf(top),
    git(['rev-parse', '--absolute-git-dir'], top),
  ]);
  if ((tracked ?? '') === '') return { synced: false, warning: null };
  if (branch instanceof Error) return notSynced(branch.message);

  for (let attempt = 1; ; attempt += 1) {
    try {
      await git(['fetch', '--quiet', REMOTE, branch], top, { timeout: FETCH_TIMEOUT });
    } catch (error: unknown) {
      return notSynced(`cannot fetch ${REMOTE}/${branch}: ${gitMessage(error)}`);
    }
    const tip = await git(['rev-parse', '--verify', `refs/remotes/${REMOTE}/${branch}^{commit}`], top);
    const scratch = mkdtempSync(join(tmpdir(), 'board-sync-'));
    try {
      const origin = await boardAt(gitDirectory, tip, join(scratch, 'origin'));
      if ('refusal' in origin) return notSynced(origin.refusal);
      const pending = await checkoutPending(checkout, gitDirectory, branch, tip, origin.board, join(scratch, 'base'));
      const next = edit(pending === null ? origin.board : rebaseBoardChange(pending.base, pending.local, origin.board));
      let target = tip;
      if (!sameBoard(origin.board, next)) {
        const commit = await commitBoard(origin.scratch, next, tip, syncCommitMessage(origin.board, next));
        try {
          await git([...NO_HOOKS, 'push', '--quiet', REMOTE, `${commit}:refs/heads/${branch}`], top, { timeout: PUSH_TIMEOUT });
        } catch (error: unknown) {
          if (lostRace(gitMessage(error)) && attempt < PUSH_ATTEMPTS) continue;
          return notSynced(`the push to ${REMOTE}/${branch} was refused: ${gitMessage(error)}`);
        }
        target = commit;
      }
      const step = await updateCheckout(checkout, branch, target);
      return { synced: true, checkout: checkout !== top ? 'elsewhere' : typeof step === 'string' ? 'current' : 'stale' };
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  }
}

function notSynced(reason: string): BoardSync {
  return { synced: false, warning: notSyncedWarning(reason) };
}

async function answer(gitArguments: string[], cwd: string): Promise<string | null> {
  return git(gitArguments, cwd).catch(() => null);
}

// git's own sentence when it gave one, which is what lostRace reads.
function gitMessage(error: unknown): string {
  const stderr = (error as { stderr?: unknown } | null)?.stderr;
  return typeof stderr === 'string' && stderr.trim() !== '' ? stderr.trim() : failureText(error);
}

// The checkout whose board the app shows: the repository's main working tree, which for a card's
// worktree or a throwaway one is the project the worktree was made from. A bare repository has none, so
// a worktree of one is its own checkout. `git worktree list` names the main working tree first.
async function checkoutOf(top: string): Promise<string> {
  const list = await answer(['worktree', 'list', '--porcelain'], top);
  const [first] = (list ?? '').split('\n\n');
  const main = /^worktree (.*)$/m.exec(first ?? '')?.[1];
  if (main === undefined || /^bare$/m.test(first)) return top;
  return realPath(main) === realPath(top) ? top : main;
}

// A scratch work tree and index of its own, against the repository's objects and refs, and git run there.
type Scratch = { work: string; git(gitArguments: string[]): Promise<string> };

// The board at `ref`, read the way the app reads any board, from its files written into `folder`.
async function boardAt(gitDirectory: string, ref: string, folder: string): Promise<{ board: Board; scratch: Scratch } | { refusal: string }> {
  const work = join(folder, 'work');
  mkdirSync(work, { recursive: true });
  const environment = { GIT_DIR: gitDirectory, GIT_WORK_TREE: work, GIT_INDEX_FILE: join(folder, 'index') };
  const scratch: Scratch = { work, git: (gitArguments) => git(gitArguments, work, { environment }) };
  await scratch.git(['read-tree', ref]);
  if ((await scratch.git(['ls-files', '--', ...BOARD_PATHSPECS])) === '') return { refusal: `${ref.slice(0, 8)} has no board` };
  await scratch.git(['checkout', '--quiet', '--', ...BOARD_PATHSPECS]);
  const read = readBoard(work, false);
  if (read.brokenFiles.length > 0) return { refusal: `board files at ${ref.slice(0, 8)} do not parse` };
  return { board: read.board, scratch };
}

// The commit of `board` on top of `parent`, made in the scratch folder its parent's board was read
// into. -A, so a card removed or a board leaving board.json is a removal in the commit.
async function commitBoard(scratch: Scratch, board: Board, parent: string, message: string): Promise<string> {
  writeBoard(scratch.work, board);
  await scratch.git(['add', '-A', '--', ...BOARD_PATHSPECS]);
  const tree = await scratch.git(['write-tree']);
  return scratch.git(['commit-tree', tree, '-p', parent, '-m', message]);
}

// The checkout's own board edits, as the base its board was edited from (the board at its HEAD) and the
// board in its working tree; null when there are none or they are not the default branch's to publish.
async function checkoutPending(
  checkout: string, gitDirectory: string, branch: string, tip: string, origin: Board, folder: string,
): Promise<{ base: Board; local: Board } | null> {
  const [onBranch, head] = await Promise.all([answer(['symbolic-ref', '--short', '-q', 'HEAD'], checkout), answer(['rev-parse', 'HEAD'], checkout)]);
  if (!publishesCheckout(onBranch, branch)) return null;
  const local = peekBoard(checkout);
  if (local === null || head === null) return null;
  const base = head === tip ? { board: origin } : await boardAt(gitDirectory, head, folder);
  if ('refusal' in base || sameBoard(base.board, local)) return null;
  return { base: base.board, local };
}

// The checkout brought up to `target`, when checkoutStep says it may be. What git says of it is asked
// first; the fast-forward itself is synchronous, so in the app no save from the screen lands between
// putting the board's files back to HEAD and laying the checkout's own edits over the new one.
//
// No stash: the board's files are the only ones touched. They are put back as HEAD has them (restore,
// and clean for a card file git does not know yet), the fast-forward then has nothing in its way, and
// the edits the checkout had are replayed onto what it lands on. A fast-forward that fails anyway puts
// the checkout's board back as it was.
async function updateCheckout(checkout: string, branch: string, target: string): Promise<CheckoutStep> {
  const [head, onBranch, porcelain, behind] = await Promise.all([
    answer(['rev-parse', 'HEAD'], checkout),
    answer(['symbolic-ref', '--short', '-q', 'HEAD'], checkout),
    answer(['status', '--porcelain'], checkout),
    // Exit 0, nothing printed, when HEAD is an ancestor of the target.
    answer(['merge-base', '--is-ancestor', 'HEAD', target], checkout),
  ]);
  const step = checkoutStep({
    branch: onBranch,
    defaultBranch: branch,
    current: head === target,
    behind: head !== null && behind !== null,
    porcelain: porcelain ?? '',
  });
  if (step !== 'fast-forward') return step;
  const local = peekBoard(checkout);
  if (local === null) return { stay: 'its board files do not parse' };
  try {
    gitNow(['restore', '--source=HEAD', '--staged', '--worktree', '--', ...BOARD_PATHSPECS], checkout);
    gitNow(['clean', '-f', '-q', '--', ...BOARD_PATHSPECS], checkout);
    const base = peekBoard(checkout);
    gitNow([...NO_HOOKS, 'merge', '--ff-only', '--quiet', target], checkout);
    const landed = peekBoard(checkout);
    const merged = base === null || landed === null ? local : rebaseBoardChange(base, local, landed);
    if (landed === null || !sameBoard(merged, landed)) writeBoard(checkout, merged);
    return step;
  } catch (error: unknown) {
    writeBoard(checkout, local);
    return { stay: `the fast-forward failed: ${gitMessage(error)}` };
  }
}

function gitNow(gitArguments: string[], cwd: string): string {
  return execFileSync('git', gitArguments, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trimEnd();
}
