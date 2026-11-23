import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import type { Refused, WorktreeEntry, WorktreeRemoval } from '../../../shared/app/bridge';
import { baseBranch, git, runProgram } from '../../app/git';
import { loginShellPath } from '../../app/shell-path';
import { startLeftoverSweep } from '../../ship/leftover-sweep';
import { bind, isRefused, type BoundAction } from '../action';
import { INSTALL_TIMEOUT_MS, worktreeMake, type MadeWorktree, type ShipWorktree, type ShipWorktreeRequest } from './make';
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

// The app's own PATH lacks what the shell's startup files add (pnpm under PNPM_HOME, Homebrew's npm) when
// it was started from a launcher, so the install runs on the shell's, read once.
let shellPath: Promise<string> | undefined;

async function install(program: string, programArguments: string[], cwd: string): Promise<string> {
  shellPath ??= loginShellPath(process.env.PATH ?? '');
  const environment = { PATH: await shellPath };
  return runProgram(program, programArguments, cwd, { timeout: INSTALL_TIMEOUT_MS, environment });
}

export function worktreeActions(main: WorktreeRemovePorts) {
  const make = bind(worktreeMake, {
    git, baseBranch, newId: randomUUID, queue: main.queue, exists: existsSync, log: main.log, install,
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
    // The leftover sweep's timers, which main starts (leftover-sweep.ts).
    startLeftoverSweep: (sweep: Omit<Parameters<typeof startLeftoverSweep>[0], 'remove'>) =>
      startLeftoverSweep({ remove, ...sweep }),
  };
}
