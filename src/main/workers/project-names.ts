import { baseName } from '../../shared/app/base-name';
import { slug } from '../../shared/app/slug';
import { uniqueName } from '../projects/projects-first';
import { MANAGER_FOLDER } from '../manager/manager-terminals';

// The name each open project's sessions go by (`main-api-2`), unique among the open ones and held
// until the project closes (workers decisions.md, "`<project>` is unique among the open projects").

// The folder's last segment as it can go in a session name: a space or a slash there is one more thing
// to quote in a message.
function folderSlug(projectPath: string): string {
  return slug(baseName(projectPath)) || 'project';
}

// The manager's folder is `.dashboard`, which would slug to the same `dashboard` as a checkout of this
// app. It is never opened or closed as a project, so it holds `manager` for good.
const held = new Map([[MANAGER_FOLDER, 'manager']]);

// The project at `projectPath` opened: its name, held until it closes. Opened again, it keeps it.
export function holdProjectName(projectPath: string): string {
  const name = held.get(projectPath) ?? uniqueName(folderSlug(projectPath), new Set(held.values()));
  held.set(projectPath, name);
  return name;
}

export function releaseProjectName(projectPath: string): void {
  held.delete(projectPath);
}

// A path that is not open, a worktree's or a task's, goes by its folder.
export function projectName(projectPath: string): string {
  return held.get(projectPath) ?? folderSlug(projectPath);
}
