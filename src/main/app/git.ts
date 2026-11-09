import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { defaultBranch, noDefaultBranchMessage } from './default-branch';

const runCommand = promisify(execFile);

// execFile, never a shell, so a card titled with a quote in it cannot become a command. Awaited
// rather than sync: main is the process every pane's bytes flow through, and a fetch on a slow
// network would otherwise stop all five shells painting until it returned.
//
// trimEnd, never trim. git's porcelain formats put fixed-width status columns before each path, and a
// change that is not staged leaves the leading column blank. A leading trim takes that blank away on
// the first line only, which shifts its path one character left — and a reader that counts columns
// then gets a path that is not the one git named. Only the trailing newline is ours to drop.
//
// `timeout` kills git after that many milliseconds, for a fetch or a push that would otherwise wait on
// a dead network for minutes; `environment` is laid over the process's own.
export type GitOptions = { timeout?: number; environment?: Record<string, string> };

export async function git(gitArguments: string[], cwd: string, options: GitOptions = {}): Promise<string> {
  return runProgram('git', gitArguments, cwd, options);
}

// The same for another program, which so far is gh asking whether a branch has a pull request.
export async function runProgram(program: string, programArguments: string[], cwd: string, options: GitOptions = {}): Promise<string> {
  const { stdout } = await runCommand(program, programArguments, {
    cwd,
    maxBuffer: 64 * 1024 * 1024,
    timeout: options.timeout,
    env: options.environment === undefined ? undefined : { ...process.env, ...options.environment },
  });
  return stdout.trimEnd();
}

// The project's files: git's tracked ones and the untracked it does not ignore, less the tracked ones
// deleted from the working tree but not yet staged as deleted. -z, so a path in any language comes back
// as written rather than C-quoted. A folder that is not a repository lists none rather than walking
// node_modules.
export async function projectFiles(projectPath: string): Promise<string[]> {
  const listed = (listArguments: string[]) => git(['ls-files', '-z', ...listArguments], projectPath).then((list) => list.split('\0').filter(Boolean));
  return Promise.all([listed(['--cached', '--others', '--exclude-standard']), listed(['--deleted'])]).then(([files, deleted]) => {
    const gone = new Set(deleted);
    return files.filter((file) => !gone.has(file));
  }, () => []);
}

// origin's default branch, by defaultBranch's rule: origin/HEAD is not set in every clone.
export async function baseBranch(projectPath: string): Promise<string> {
  const answer = (gitArguments: string[]) => git(gitArguments, projectPath).then((out) => out, () => null);
  const [head, main, master] = await Promise.all([
    answer(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']),
    answer(['rev-parse', '--verify', '--quiet', 'refs/remotes/origin/main']),
    answer(['rev-parse', '--verify', '--quiet', 'refs/remotes/origin/master']),
  ]);
  const branch = defaultBranch('origin', head, (name) => (name === 'main' ? main : master) !== null);
  if (branch === null) throw new Error(noDefaultBranchMessage('origin'));
  return branch;
}
