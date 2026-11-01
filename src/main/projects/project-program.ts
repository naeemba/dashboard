import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { existingProjects, readRecentPaths, RECENTS_FILE } from '../app/projects';
import { readSession, SESSION_FILE } from '../app/session';
import { BOARD_DIRECTORY } from '../board/board-store';
import { failureLine } from '../command/failure-line';
import { projectInit, runProjectCommand } from './project-cli';

// The folders `project init` starts from: the projects open at the app's last save, then the recent
// ones, each a folder that is still there. Both files are the app's own, in the userData folder main
// names in DASHBOARD_USER_DATA; outside a pane there is none, and init writes the header alone.
function knownProjectPaths(): string[] {
  const userData = process.env.DASHBOARD_USER_DATA;
  if (!userData) return [];
  const open = readSession(join(userData, SESSION_FILE)).pages.map((page) => page.path);
  return existingProjects([...open, ...readRecentPaths(join(userData, RECENTS_FILE))]).map((project) => project.path);
}

// The whole of the `project` program outside project-cli.ts: read ~/.dashboard/projects.yaml, write
// it for init, print the answer. `dashboard project` is its one door.
export function runProjectProgram(commandArguments: readonly string[]): number {
  const filePath = join(homedir(), BOARD_DIRECTORY, 'projects.yaml');
  try {
    let text: string | null = null;
    try {
      text = readFileSync(filePath, 'utf8');
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const [verb, ...rest] = commandArguments;
    const answer = verb === 'init'
      ? projectInit(rest, text, knownProjectPaths, homedir(), filePath)
      : runProjectCommand(commandArguments, text, filePath);
    if (answer.ok && answer.file !== undefined) {
      mkdirSync(dirname(filePath), { recursive: true });
      // wx: a file written between the read above and now is still never overwritten.
      writeFileSync(filePath, answer.file, { flag: 'wx' });
    }
    if (answer.ok) process.stdout.write(`${answer.output}\n`);
    else process.stderr.write(`${answer.message}\n`);
    return answer.ok ? 0 : 1;
  } catch (error: unknown) {
    process.stderr.write(`${failureLine(error)}\n`);
    return 1;
  }
}
