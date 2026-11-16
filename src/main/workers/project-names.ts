import { baseName } from '../../shared/app/base-name';
import { slug } from '../../shared/app/slug';
import { uniqueName } from '../projects/projects-first';
import { MANAGER_FOLDER } from '../manager/manager-terminals';
import { replaceFile } from '../app/replace-file';
import { readStringRecord } from '../app/string-record-file';

// The name each project's sessions go by (`main-api-2`): given the first time its folder opens, kept in
// project-names.json and never given to another folder (workers decisions.md, "`<project>` is the
// folder's own").

// The folder's last segment as it can go in a session name: a space or a slash there is one more thing
// to quote in a message.
function folderSlug(projectPath: string): string {
  return slug(baseName(projectPath)) || 'project';
}

// The manager's folder is `.dashboard`, which would slug to the same `dashboard` as a checkout of this
// app. In every reading, so no folder is ever given its name.
const MANAGER = { [MANAGER_FOLDER]: 'manager' };

let names: Record<string, string> = { ...MANAGER };
let file = '';

// Read once at launch, before any project opens.
export function readProjectNames(from: string): void {
  file = from;
  names = { ...readStringRecord(from), ...MANAGER };
}

// The project at `projectPath` opened: given its name if it has none yet.
// ponytail: every folder ever opened keeps a row, a few bytes each; forget closed ones if it ever matters.
export function holdProjectName(projectPath: string): void {
  if (names[projectPath] !== undefined) return;
  names[projectPath] = uniqueName(folderSlug(projectPath), new Set(Object.values(names)));
  try {
    replaceFile(file, JSON.stringify(names));
  } catch {
    // ponytail: a failed write costs only this launch's new name, given again the next time it opens.
  }
}

// A path never opened, a worktree's or a task's, goes by its folder.
export function projectName(projectPath: string): string {
  return names[projectPath] ?? folderSlug(projectPath);
}
