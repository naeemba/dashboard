import { action } from '../action';
import { branchNameFor, worktreePathFor } from '../../ship/ship';
import { isFilledText } from '../pane/pane-input';

// Every worktree the app makes, in the folder beside the project where they all go, with the one git line
// that makes them, so a ship, a dispatched task and a review cannot come to put their work in different
// places. Three kinds:
//
// - card: a ship's. A new branch off origin/<base>, named after the card's title with its id to break a
//   tie. The ship has fetched and holds the project's git queue already.
// - throwaway: `pane run --worktree`'s, named after its prompt with a fresh id. Not recorded with the
//   cards' worktrees, since there is no card to show it on; the manager's list finds it through git, and
//   pane.release removes it once its work is out. Nothing holds the queue for it, so it takes the queue
//   and fetches itself.
// - again: a reviewed card's branch checked out at the same path once more. No new branch and no base:
//   the branch is there with the pull request on it. The review holds the queue already.

export type WorktreeMakeInput =
  | { kind: 'card'; projectPath: string; title: string; cardId: string; base: string }
  | { kind: 'throwaway'; projectPath: string; title: string }
  | { kind: 'again'; projectPath: string; worktreePath: string; branch: string };

export type WorktreeMakePorts = {
  git(gitArguments: string[], cwd: string): Promise<string>;
  baseBranch(projectPath: string): Promise<string>;
  newId(): string;
  queue<T>(projectPath: string, run: () => Promise<T>): Promise<T>;
};

export type MadeWorktree = { output: string; branch: string; worktreePath: string };

// Whether the make takes the project's queue itself: only a throwaway's, whose caller holds nothing.
// The queue is not re-entrant, so the ship's and the review's taking it again would wait on themselves.
export function queuesItself(kind: WorktreeMakeInput['kind']): boolean {
  return kind === 'throwaway';
}

function read(raw: Record<string, unknown>): WorktreeMakeInput | null {
  const { kind, projectPath } = raw;
  if (!isFilledText(projectPath)) return null;
  if (kind === 'card' && isFilledText(raw.title) && isFilledText(raw.cardId) && isFilledText(raw.base)) {
    return { kind, projectPath, title: raw.title, cardId: raw.cardId, base: raw.base };
  }
  if (kind === 'throwaway' && isFilledText(raw.title)) return { kind, projectPath, title: raw.title };
  if (kind === 'again' && isFilledText(raw.worktreePath) && isFilledText(raw.branch)) {
    return { kind, projectPath, worktreePath: raw.worktreePath, branch: raw.branch };
  }
  return null;
}

async function make(ports: WorktreeMakePorts, input: WorktreeMakeInput): Promise<MadeWorktree> {
  const { projectPath } = input;
  let branch: string;
  let worktreePath: string;
  let base: string | null = null;
  if (input.kind === 'again') {
    ({ branch, worktreePath } = input);
  } else {
    base = input.kind === 'card' ? input.base : await ports.baseBranch(projectPath);
    if (input.kind === 'throwaway') await ports.git(['fetch', 'origin', base], projectPath);
    const heads = await ports.git(['for-each-ref', '--format=%(refname:short)', 'refs/heads'], projectPath);
    const id = input.kind === 'card' ? input.cardId : ports.newId();
    branch = branchNameFor(input.title, id, heads.split('\n').filter((name) => name !== ''));
    worktreePath = worktreePathFor(projectPath, branch);
  }
  const branchArguments = base === null ? [worktreePath, branch] : ['-b', branch, worktreePath, `origin/${base}`];
  await ports.git(['worktree', 'add', ...branchArguments], projectPath);
  return { output: `made ${worktreePath} on ${branch}`, branch, worktreePath };
}

export const worktreeMake = action<WorktreeMakePorts, WorktreeMakeInput, MadeWorktree>('worktree.make', {
  words: [],
  input: (raw) => read(raw) ?? { refused: 'the worktree to make was not one the app could read' },
  run: (ports, input) => (queuesItself(input.kind)
    ? ports.queue(input.projectPath, () => make(ports, input))
    : make(ports, input)),
});
