import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { BOARD_DIRECTORY } from '../board/board-store';
import { failureLine } from '../board/board-cli';
import { runProjectCommand } from './project-cli';

// The whole of the `project` program outside project-cli.ts: read ~/.dashboard/projects.yaml, print
// the answer. `dashboard project` is its one door.
export function runProjectProgram(commandArguments: readonly string[]): number {
  const filePath = join(homedir(), BOARD_DIRECTORY, 'projects.yaml');
  try {
    let text: string | null = null;
    try {
      text = readFileSync(filePath, 'utf8');
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const answer = runProjectCommand(commandArguments, text, filePath);
    if (answer.ok) process.stdout.write(`${answer.output}\n`);
    else process.stderr.write(`${answer.message}\n`);
    return answer.ok ? 0 : 1;
  } catch (error: unknown) {
    process.stderr.write(`${failureLine(error)}\n`);
    return 1;
  }
}
