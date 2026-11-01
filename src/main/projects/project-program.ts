import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { BOARD_DIRECTORY } from '../board/board-store';
import { failureLine } from '../command/failure-line';
import { askAppFromPane } from '../workers/session-socket';
import { runProjectCommand } from './project-cli';

// The whole of the `project` program outside project-cli.ts: read ~/.dashboard/projects.yaml, print
// the answer, or hand open and close to the app over the socket the `pane` noun uses. `dashboard
// project` is its one door.
export async function runProjectProgram(commandArguments: readonly string[]): Promise<number> {
  const filePath = join(homedir(), BOARD_DIRECTORY, 'projects.yaml');
  try {
    let text: string | null = null;
    try {
      text = readFileSync(filePath, 'utf8');
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const answer = runProjectCommand(commandArguments, text, filePath, homedir());
    if ('ask' in answer) return await askAppFromPane(answer.ask);
    if (answer.ok) process.stdout.write(`${answer.output}\n`);
    else process.stderr.write(`${answer.message}\n`);
    return answer.ok ? 0 : 1;
  } catch (error: unknown) {
    process.stderr.write(`${failureLine(error)}\n`);
    return 1;
  }
}
