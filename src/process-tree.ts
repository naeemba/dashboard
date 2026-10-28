import { commandOutput } from './shell-directory-lookup';

// The process tree, as `ps -eo pid=,ppid=` prints it, or null when `ps` gave no answer. One spelling
// for both sweeps that read it, so the token figures and the worktree sweep see the same tree.
export function processTree(): Promise<string | null> {
  return commandOutput('ps', ['-eo', 'pid=,ppid=']);
}
