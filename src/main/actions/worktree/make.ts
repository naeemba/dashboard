import { failureText } from '../../../shared/errors/failure';
import type { LogDraft } from '../../../shared/app/log-entry';
import { isRecord } from '../../../shared/app/is-record';
import { action } from '../action';
import { branchNameFor, worktreePathFor } from '../../ship/ship';
import { nearestLockfile } from '../../workflow/package-manager-guard';
import { isFilledText } from '../pane/pane-input';
import type { BaseBranch } from '../../app/base-branch';

// Every worktree the app makes, in the folder beside the project where they all go, made only here, so a ship, a dispatched task and a review cannot come to put their work in different
// places. Three kinds:
//
// - card: a ship's. A new branch off <remote>/<base>, named after the card's title with its id to break a
//   tie. The ship has fetched and holds the project's git queue already.
// - throwaway: `pane run --worktree`'s, named after its prompt with a fresh id. Not recorded with the
//   cards' worktrees, since there is no card to show it on; the manager's list finds it through git, and
//   it goes with its pane unless it holds work (throwaway.ts). Nothing holds the queue for it, so it
//   takes the queue and fetches itself.
// - again: a reviewed card's branch checked out at the same path once more. No new branch and no base:
//   the branch is there with the pull request on it. The review holds the queue already.
//
// Each gets the project's packages installed from its lockfile once it is added, so the agent in it can
// run the checks straight away rather than meeting `vitest: command not found` (workflow-decision-3 says
// what it costs). A failed install is logged; the worktree stays.

export type WorktreeMakeInput =
  | { kind: 'card'; projectPath: string; title: string; cardId: string; base: BaseBranch }
  | { kind: 'throwaway'; projectPath: string; title: string }
  | { kind: 'again'; projectPath: string; worktreePath: string; branch: string };

export type WorktreeMakePorts = {
  git(gitArguments: string[], cwd: string): Promise<string>;
  baseBranch(projectPath: string): Promise<BaseBranch>;
  newId(): string;
  queue<T>(projectPath: string, run: () => Promise<T>): Promise<T>;
  exists(path: string): boolean;
  // The install program, run in the worktree. Throws when it fails, as execFile does.
  install(program: string, programArguments: string[], cwd: string): Promise<unknown>;
  log(draft: LogDraft): void;
};

export type MadeWorktree = { output: string; branch: string; worktreePath: string };

// What card.ship asks for and gets back: the card kind of the input and the answer, so a field added
// here reaches the ship's port without another copy to keep in step.
export type ShipWorktreeRequest = Omit<Extract<WorktreeMakeInput, { kind: 'card' }>, 'kind'>;
export type ShipWorktree = Pick<MadeWorktree, 'branch' | 'worktreePath'>;

function read(raw: Record<string, unknown>): WorktreeMakeInput | null {
  const { kind, projectPath } = raw;
  if (!isFilledText(projectPath)) return null;
  const { base } = raw;
  if (kind === 'card' && isFilledText(raw.title) && isFilledText(raw.cardId) && isRecord(base) && isFilledText(base.remote) && isFilledText(base.branch)) {
    return { kind, projectPath, title: raw.title, cardId: raw.cardId, base: { remote: base.remote, branch: base.branch } };
  }
  if (kind === 'throwaway' && isFilledText(raw.title)) return { kind, projectPath, title: raw.title };
  if (kind === 'again' && isFilledText(raw.worktreePath) && isFilledText(raw.branch)) {
    return { kind, projectPath, worktreePath: raw.worktreePath, branch: raw.branch };
  }
  return null;
}

// The install that writes nothing the lockfile does not already say, by the manager the lockfile names
// (as the package manager guard reads it); null for a folder with no lockfile, or two that disagree.
export function frozenInstall(folder: string, exists: (path: string) => boolean): string[] | null {
  const manager = nearestLockfile(folder, exists)?.manager;
  if (manager === undefined) return null;
  return manager === 'npm' ? ['npm', 'ci'] : [manager, 'install', '--frozen-lockfile'];
}

// A frozen install with the store warm takes a second (workflow-decision-3); a cold npm ci, minutes. The
// ship holds the project's queue meanwhile, so one that hangs is stopped at this, not left to hold it.
export const INSTALL_TIMEOUT_MS = 5 * 60 * 1000;

// Why an install failed: pnpm says it on stdout (`ERR_PNPM_OUTDATED_LOCKFILE …`), npm at the top of stderr
// above its whole help, and execFile's message carries only stderr. So ten lines of both from the first
// that names an error, else their last ten, else the error itself. One killed at the time limit says so
// first, or its last warnings would read as the reason.
export function installFailure(error: unknown): string {
  if (!isRecord(error)) return failureText(error);
  const stopped = error.killed === true ? `stopped after ${INSTALL_TIMEOUT_MS / 60_000} minutes` : '';
  const lines = `${String(error.stdout ?? '')}\n${String(error.stderr ?? '')}`.trim().split('\n');
  if (lines.join('') === '') return stopped || failureText(error);
  const first = lines.findIndex((line) => /\berr(or\b|_)/i.test(line));
  const output = (first === -1 ? lines.slice(-10) : lines.slice(first, first + 10)).join('\n');
  return stopped === '' ? output : `${stopped}: ${output}`;
}

// The project's frozen install in the worktree, if it has a lockfile; a failure is a warning in the log.
async function installed(ports: WorktreeMakePorts, projectPath: string, worktreePath: string): Promise<void> {
  const install = frozenInstall(worktreePath, ports.exists);
  if (install === null) return;
  const [program, ...programArguments] = install;
  try {
    await ports.install(program, programArguments, worktreePath);
  } catch (error) {
    const message = `${install.join(' ')} failed in ${worktreePath}: ${installFailure(error)}`;
    ports.log({ level: 'warn', kind: 'worktree', project: projectPath, message });
  }
}

async function made(ports: WorktreeMakePorts, projectPath: string, branch: string, worktreePath: string): Promise<MadeWorktree> {
  await installed(ports, projectPath, worktreePath);
  return { output: `made ${worktreePath} on ${branch}`, branch, worktreePath };
}

// A new branch off <remote>/<base>, named after the title with `id` to break a tie.
async function newBranch(ports: WorktreeMakePorts, projectPath: string, title: string, id: string, base: BaseBranch): Promise<MadeWorktree> {
  const heads = await ports.git(['for-each-ref', '--format=%(refname:short)', 'refs/heads'], projectPath);
  const branch = branchNameFor(title, id, heads.split('\n').filter((name) => name !== ''));
  const worktreePath = worktreePathFor(projectPath, branch);
  await ports.git(['worktree', 'add', '-b', branch, worktreePath, `${base.remote}/${base.branch}`], projectPath);
  return made(ports, projectPath, branch, worktreePath);
}

export const worktreeMake = action<WorktreeMakePorts, WorktreeMakeInput, MadeWorktree>('worktree.make', {
  words: [],
  input: (raw) => read(raw) ?? { refused: 'the worktree to make was not one the app could read' },
  async run(ports, input) {
    const { projectPath } = input;
    if (input.kind === 'card') return newBranch(ports, projectPath, input.title, input.cardId, input.base);
    if (input.kind === 'throwaway') {
      // The only kind whose caller holds no queue, so the only one that takes it. The queue is not
      // re-entrant: the ship's and the review's taking it again would wait on themselves.
      return ports.queue(projectPath, async () => {
        const base = await ports.baseBranch(projectPath);
        await ports.git(['fetch', base.remote, base.branch], projectPath);
        return newBranch(ports, projectPath, input.title, ports.newId(), base);
      });
    }
    await ports.git(['worktree', 'add', input.worktreePath, input.branch], projectPath);
    return made(ports, projectPath, input.branch, input.worktreePath);
  },
});
