import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { existingProjects, readRecentPaths, RECENTS_FILE } from '../app/projects';
import { readSession, SESSION_FILE } from '../app/session';
import { BOARD_DIRECTORY } from '../board/board-store';
import { failureLine } from '../command/failure-line';
import { type KnownFolders, runProjectCommand } from './project-cli';

// The folders `project init` starts from: the projects open at the app's last save and the recent
// ones, each a folder that is still there. Both files are the app's own, in the userData folder main
// names in DASHBOARD_USER_DATA; outside a pane there is none.
function knownFolders(): KnownFolders {
  const userData = process.env.DASHBOARD_USER_DATA;
  if (!userData) return null;
  const stillThere = (paths: readonly string[]) => existingProjects(paths).map((project) => project.path);
  return {
    open: stillThere(readSession(join(userData, SESSION_FILE)).pages.map((page) => page.path)),
    recent: stillThere(readRecentPaths(join(userData, RECENTS_FILE))),
  };
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
    const answer = runProjectCommand(commandArguments, text, filePath, knownFolders, homedir());
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
