import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { existingProjects, readRecentPaths, RECENTS_FILE } from '../app/projects';
import { readSession, SESSION_FILE } from '../app/session';
import { failureLine } from '../command/failure-line';
import { askAppFromPane } from '../workers/session-socket';
import { type KnownFolders, runProjectCommand } from './project-cli';
import { readProjectsFile } from './projects-file';

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
// it for init, print the answer, or hand open and close to the app over the socket the `pane` noun
// uses. `dashboard project` is its one door.
export async function runProjectProgram(commandArguments: readonly string[]): Promise<number> {
  try {
    const { text, filePath } = readProjectsFile();
    const answer = runProjectCommand(commandArguments, text, filePath, knownFolders, homedir());
    if ('ask' in answer) return await askAppFromPane(answer.ask);
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
