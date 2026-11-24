import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { existingProjects, readRecentPaths, RECENTS_FILE } from '../app/projects';
import { replaceFile } from '../app/replace-file';
import { readSession, SESSION_FILE } from '../app/session';
import { appUserDataFolder } from '../command/app-address';
import { failureLine } from '../command/failure-line';
import { askRunningApp } from '../workers/session-socket';
import { type KnownFolders, runProjectCommand } from './project-cli';
import { readProjectsFile } from './projects-file';
import { projectRemote } from '../app/base-branch';
import { git } from '../app/git';

// The folders `project init` starts from and `project list` marks open: the projects open at the app's
// last save and the recent ones, each a folder that is still there. Both files are the app's own, in
// its userData folder (app-address.ts says which), which is not there until the app has run.
function knownFolders(): KnownFolders {
  const userData = appUserDataFolder();
  if (!existsSync(userData)) return null;
  const stillThere = (paths: readonly string[]) => existingProjects(paths).map((project) => project.path);
  return {
    open: stillThere(readSession(join(userData, SESSION_FILE)).pages.map((page) => page.path)),
    recent: stillThere(readRecentPaths(join(userData, RECENTS_FILE))),
  };
}

// The whole of the `project` program outside project-cli.ts: read ~/.dashboard/projects.yaml, write
// it for init, add, set and remove, point the project's <remote>/HEAD at set's --base, print the answer, or hand open, close and focus to the app over the socket the `pane`
// noun uses. `dashboard project` is its one door.
export async function runProjectProgram(commandArguments: readonly string[]): Promise<number> {
  try {
    const { text, filePath } = readProjectsFile();
    const answer = runProjectCommand(commandArguments, text, filePath, knownFolders, homedir());
    if ('ask' in answer) return await askRunningApp(answer.ask);
    const lines = answer.ok && answer.output !== '' ? [answer.output] : [];
    if (answer.ok && answer.base !== undefined) {
      const { folder, branch } = answer.base;
      const remote = await projectRemote(folder);
      // git refuses a branch it has no remote-tracking ref for, and that refusal is the answer.
      await git(['remote', 'set-head', remote, branch], folder);
      lines.push(`${remote}/HEAD is ${remote}/${branch} in ${folder}: work there is cut from ${branch}`);
    }
    if (answer.ok && answer.file !== undefined && text !== null) replaceFile(filePath, answer.file);
    else if (answer.ok && answer.file !== undefined) {
      mkdirSync(dirname(filePath), { recursive: true });
      // wx: a file written between the read above and now is still never overwritten.
      writeFileSync(filePath, answer.file, { flag: 'wx' });
    }
    if (answer.ok) process.stdout.write(`${lines.join('\n')}\n`);
    else process.stderr.write(`${answer.message}\n`);
    return answer.ok ? 0 : 1;
  } catch (error: unknown) {
    process.stderr.write(`${failureLine(error)}\n`);
    return 1;
  }
}
