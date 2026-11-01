import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { BOARD_DIRECTORY } from '../board/board-store';
import { failureLine } from '../command/failure-line';
import { runProjectCommand } from './project-cli';

// The whole of the `project` program outside project-cli.ts: read ~/.dashboard/projects.yaml, print
// the answer. `dashboard project` is its one door.
export function runProjectProgram(commandArguments: readonly string[]): number {
  try {
    const { text, filePath } = readProjectsFile();
    const answer = runProjectCommand(commandArguments, text, filePath);
    if (answer.ok) process.stdout.write(`${answer.output}\n`);
    else process.stderr.write(`${answer.message}\n`);
    return answer.ok ? 0 : 1;
  } catch (error: unknown) {
    process.stderr.write(`${failureLine(error)}\n`);
    return 1;
  }
}

// ~/.dashboard/projects.yaml's text, or null when there is none. Main reads it the same way to find
// the project a `pane claim --project` names. A file that cannot be read for any other reason throws.
export function readProjectsFile(): { text: string | null; filePath: string } {
  const filePath = join(homedir(), BOARD_DIRECTORY, 'projects.yaml');
  try {
    return { text: readFileSync(filePath, 'utf8'), filePath };
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return { text: null, filePath };
  }
}
