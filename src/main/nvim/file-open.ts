import { stat } from 'node:fs/promises';
import path from 'node:path';
import { directoriesOf } from '../panes/shell-directory-lookup';
import { isWholePath } from '../../shared/app/whole-path';

// Where a path printed in a pane points. A relative path is relative to whatever printed it, which is
// the folder the pane's shell is standing in now — a `cd` since the pane opened included, and the card's
// worktree for an agent shipped into one. So the live folder is asked first, then the folder the pane
// was started in, then the project; the first that holds a file wins.

// `~`, `~/` and an absolute path name one place whatever folder the pane is in; a relative path names none
// yet (isWholePath, which the picker asks too). Both fileCandidates and findPaneFile ask this, so the
// pane's folder is looked up exactly when it is used. projects.yaml's paths are read by it too, in
// project-named.ts, and a folder typed into the picker, in projects.ts.
export function wholePath(filePath: string, home: string): string | undefined {
  if (!isWholePath(filePath)) return undefined;
  if (filePath === '~') return home;
  return filePath.startsWith('~/') ? path.join(home, filePath.slice(2)) : filePath;
}

// Every place the path could be, in the order they are tried.
export function fileCandidates(filePath: string, directories: readonly (string | undefined)[], home: string): string[] {
  const whole = wholePath(filePath, home);
  if (whole !== undefined) return [whole];
  const known = directories.filter((directory): directory is string => directory !== undefined);
  return [...new Set(known)].map((directory) => path.resolve(directory, filePath));
}

// The first candidate that is a file. A folder is not something to put in an editor window, and a
// path that names neither is the `and/or` file-links.ts lets through.
export async function firstFile(candidates: readonly string[]): Promise<string | undefined> {
  for (const candidate of candidates) {
    try {
      if ((await stat(candidate)).isFile()) return candidate;
    } catch {
      // Not there; try the next.
    }
  }
  return undefined;
}

export type PaneFolders = { pid: number | undefined; startDirectory: string | undefined; projectPath: string | undefined };

// The file a path printed in a pane names, or undefined when there is none. Windows has no way to ask a
// process its folder, so the pane's starting folder stands in there. Only a relative path asks for the
// live folder, which keeps a mac from running `lsof` for a path that is already whole.
export async function findPaneFile(filePath: string, pane: PaneFolders, home: string): Promise<string | undefined> {
  const { pid } = pane;
  const live = pid !== undefined && wholePath(filePath, home) === undefined && process.platform !== 'win32'
    ? (await directoriesOf([pid]))?.get(pid)
    : undefined;
  return firstFile(fileCandidates(filePath, [live, pane.startDirectory, pane.projectPath], home));
}

// What the status bar says when there is no such file, beside the lookup that decided it.
export function noSuchFile(filePath: string): string {
  return `there is no file ${filePath} here`;
}
