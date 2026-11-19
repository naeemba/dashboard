import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import type { Refused, WorktreeEntry, WorktreeRemoval } from '../../../shared/app/bridge';
import { baseBranch, git, runProgram } from '../../app/git';
import { bind, isRefused, type BoundAction } from '../action';
import { worktreeMake, type MadeWorktree, type ShipWorktree, type ShipWorktreeRequest } from './make';
import { worktreeRemove, type WorktreeRemovePorts } from './remove';

// Main's wiring for the worktree actions, and each door's call into them as its port takes it. Out of
// main.ts, which is over its 600-line ceiling. Every decision is in make.ts and remove.ts; a refusal here
// is only ever an input the app wrote itself and could not read, so a make throws it as a failure. Main
// hands over the keeper's removal, the project's git queue and the log.
async function made(result: Promise<MadeWorktree | Refused>): Promise<MadeWorktree> {
  const answer = await result;
  if (isRefused(answer)) throw new Error(answer.refused);
  return answer;
}

async function removed(result: Promise<WorktreeRemoval | Refused>): Promise<WorktreeRemoval> {
  const answer = await result;
  return isRefused(answer) ? { ok: false, message: answer.refused, dirty: [] } : answer;
}

// A frozen install with the store warm takes a second (workflow-decision-3); a cold npm ci, minutes. The
// ship holds the project's queue meanwhile, so one that hangs is stopped here, not left to hold it.
const INSTALL_TIMEOUT_MS = 5 * 60 * 1000;

export function worktreeActions(main: WorktreeRemovePorts) {
  const make = bind(worktreeMake, {
    git, baseBranch, newId: randomUUID, queue: main.queue, exists: existsSync, log: main.log,
    install: (program, programArguments, cwd) => runProgram(program, programArguments, cwd, { timeout: INSTALL_TIMEOUT_MS }),
  });
  const remove: BoundAction<WorktreeRemoval & { output: string }> = bind(worktreeRemove, main);
  return {
    remove,
    // card.ship's, with the project's queue held and origin fetched.
    makeForShip: (request: ShipWorktreeRequest): Promise<ShipWorktree> => made(make.call({ kind: 'card', ...request })),
    // `pane run --worktree`'s.
    async makeThrowaway(projectPath: string, title: string): Promise<string> {
      return (await made(make.call({ kind: 'throwaway', projectPath, title }))).worktreePath;
    },
    // card.review's, with the queue held: the branch checked out again, and the old folder removed.
    makeAgain: ({ projectPath, worktreePath, branch }: WorktreeEntry) => made(make.call({ kind: 'again', projectPath, worktreePath, branch })),
    removeForReview: (worktreePath: string) => removed(remove.call({ worktreePath, from: 'review' })),
    // pane.release's, once unfinishedWork has said there is nothing in it to lose. A refusal is a failure
    // the release reports.
    async removeForRelease(worktreePath: string, projectPath: string): Promise<void> {
      const removal = await removed(remove.call({ worktreePath, projectPath, from: 'release' }));
      if (!removal.ok) throw new Error(removal.message || `${worktreePath} has changes`);
    },
  };
}
