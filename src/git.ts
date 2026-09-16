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
  const { stdout } = await runCommand('git', args, { cwd, maxBuffer: 64 * 1024 * 1024 });
  return stdout.trimEnd();
}
