import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const runCommand = promisify(execFile);

// execFile, never a shell, so a card titled with a quote in it cannot become a command. Awaited
// rather than sync: main is the process every pane's bytes flow through, and a fetch on a slow
// network would otherwise stop all five shells painting until it returned.
//
// trimEnd, never trim. git's porcelain formats put fixed-width status columns before each path, and a
// change that is not staged leaves the leading column blank. A leading trim takes that blank away on
// the first line only, which shifts its path one character left — and a reader that counts columns
// then gets a path that is not the one git named. Only the trailing newline is ours to drop.
export async function git(args: string[], cwd: string): Promise<string> {
  return runProgram('git', args, cwd);
}

// The same for another program, which so far is gh asking whether a branch has a pull request.
export async function runProgram(program: string, args: string[], cwd: string): Promise<string> {
  const { stdout } = await runCommand(program, args, { cwd, maxBuffer: 64 * 1024 * 1024 });
  return stdout.trimEnd();
}

// origin/HEAD, then main, then master. The same three-step guess create-task.js makes, and for the
// same reason: origin/HEAD is not set in every clone.
export async function baseBranch(projectPath: string): Promise<string> {
  try {
    const head = await git(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], projectPath);
    return head.replace(/^origin\//, '');
  } catch {
    // Not set in this clone; try the usual names.
  }
  for (const candidate of ['main', 'master']) {
    try {
      await git(['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${candidate}`], projectPath);
      return candidate;
    } catch {
      // Try the next one.
    }
  }
  throw new Error('cannot tell which branch on origin is the main one');
}
