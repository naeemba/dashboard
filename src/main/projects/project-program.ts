import { failureLine } from '../command/failure-line';
import { runProjectCommand } from './project-cli';
import { readProjectsFile } from './projects-file';

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

