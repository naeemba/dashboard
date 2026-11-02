import { readFileSync, statSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { replaceFile } from '../board/board-store';
import type { Project } from '../../shared/app/bridge';

function isDirectory(path: string): boolean {
  return statSync(path, { throwIfNoEntry: false })?.isDirectory() ?? false;
}

// Resolve here so a picked folder and a stored recent compare equal: a trailing slash or a relative
// path must not turn one directory into two projects.
export function projectFromPath(path: string, directoryExists: (path: string) => boolean = isDirectory): Project {
  const directory = resolve(path);
  return { name: basename(directory), path: directory, missing: !directoryExists(directory) };
}

// The projects among these paths whose folder is still there, so neither the picker nor `project init`
// offers one that has gone away.
export function existingProjects(paths: readonly string[]): Project[] {
  return paths.map((entry) => projectFromPath(entry)).filter((project) => !project.missing);
}

// A pick fills an empty slot, and upgrades a dead page to the live one once its folder is back. It never
// overwrites a project that already works — including with a missing pick, which only happens if the
// folder is deleted between the dialog closing and the existence check.
export function replacesProject(existing: Project | undefined, picked: Project): boolean {
  return !existing || (existing.missing && !picked.missing);
}

// The recently opened projects, in the app's userData folder; main and `project init` both read it.
export const RECENTS_FILE = 'recents.json';

// How many recently opened projects the picker offers.
const RECENT_LIMIT = 20;

// Most recent first, each path once.
export function withRecentPath(paths: string[], projectPath: string): string[] {
  return [projectPath, ...paths.filter((entry) => entry !== projectPath)].slice(0, RECENT_LIMIT);
}

// The history is a convenience, not state to recover, reading and writing alike: a missing or damaged file
// just means no history yet, and a write that fails must not take down whatever the caller was doing.
export function readRecentPaths(file: string): string[] {
  try {
    const stored: unknown = JSON.parse(readFileSync(file, 'utf8'));
    return Array.isArray(stored) ? stored.filter((entry) => typeof entry === 'string') : [];
  } catch {
    return [];
  }
}

export function rememberRecentPath(file: string, projectPath: string): void {
  try {
    replaceFile(file, JSON.stringify(withRecentPath(readRecentPaths(file), projectPath)));
  } catch {
    // No history entry this time.
  }
}
