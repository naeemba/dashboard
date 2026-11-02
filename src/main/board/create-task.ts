import { parseArgs } from 'node:util';
import { PRIORITIES, isPriority, type Priority } from '../../shared/board/board';
import { BOARD_FILE_PATH } from './board-store';

// Every decision the create-task program makes. It files one card on a project's board on the
// default branch of a remote and pushes it, without touching the branch it is run from: the card is
// written by the `board` command's own `add`, in a throwaway worktree of the remote's default branch.
// Nothing here runs git or touches a file; create-task-program.ts does, and has no decision in it.
//
// Run as `node <path> --title ... --notes ... --priority ...`, from the /create-task skill and from
// claude-pr-loop through PR_LOOP_CARD_SCRIPT. Those flags are its interface and stay as they are.

export type CreateTaskOptions = {
  title: string;
  notes: string;
  priority: Priority;
  column: string | undefined;
  remote: string;
  seed: boolean;
  dryRun: boolean;
};

export const DEFAULT_REMOTE = 'origin';
const DEFAULT_PRIORITY: Priority = 'medium';

export function parseCreateTaskArguments(argv: readonly string[]): { options: CreateTaskOptions } | { message: string } {
  let values;
  try {
    ({ values } = parseArgs({
      args: [...argv],
      strict: true,
      allowPositionals: false,
      options: {
        title: { type: 'string' },
        notes: { type: 'string' },
        priority: { type: 'string' },
        column: { type: 'string' },
        remote: { type: 'string' },
        seed: { type: 'boolean' },
        'dry-run': { type: 'boolean' },
      },
    }));
  } catch (error: unknown) {
    return { message: (error as Error).message };
  }
  const title = values.title?.trim() ?? '';
  if (title === '') return { message: 'a --title is required' };
  const priority = values.priority ?? DEFAULT_PRIORITY;
  if (!isPriority(priority)) return { message: `--priority must be one of: ${PRIORITIES.join(', ')}` };
  // Nearly always `origin`. Some repos keep GitHub on `origin` and GitLab on a second remote; there,
  // `origin` files the card against a mirror nobody reads. An empty value means the caller's
  // `$GITLAB_REMOTE` never got set: refused, rather than filed on that mirror and answered as filed.
  if (values.remote === '') return { message: '--remote needs a remote name' };
  return {
    options: {
      title,
      notes: values.notes ?? '',
      priority,
      column: values.column,
      remote: values.remote ?? DEFAULT_REMOTE,
      seed: values.seed ?? false,
      dryRun: values['dry-run'] ?? false,
    },
  };
}

// The words handed to the `board` command, so the card carries exactly the fields, column and dates
// one added with `board add` or `n` on the board would.
export function boardAddArguments(options: CreateTaskOptions): string[] {
  return [
    'add', options.title,
    '--notes', options.notes,
    '--priority', options.priority,
    ...(options.column === undefined ? [] : ['--column', options.column]),
  ];
}

// A board missing from the default branch is far more likely a bad merge than an invitation to
// publish whatever stale copy sits in this worktree, so seeding one is a flag of its own.
export function noBoardMessage(remote: string, branch: string): string {
  return `${remote}/${branch} has no ${BOARD_FILE_PATH}. Re-run with --seed to create it there, ` +
    "from this worktree's copy if it has one. Check first that it was not lost in a merge.";
}

export function commitMessage(title: string): string {
  return `board: add "${title}"`;
}
