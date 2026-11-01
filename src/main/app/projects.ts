import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

export type Project = { name: string; path: string; missing: boolean };

function isDirectory(path: string): boolean {
  return statSync(path, { throwIfNoEntry: false })?.isDirectory() ?? false;
}

// Resolve here so a picked folder and a stored recent compare equal: a trailing slash or a relative
// path must not turn one directory into two projects.
export function projectFromPath(path: string, directoryExists: (path: string) => boolean = isDirectory): Project {
  const directory = resolve(path);
  return { name: basename(directory), path: directory, missing: !directoryExists(directory) };
}

// A pick fills an empty slot, and upgrades a dead page to the live one once its folder is back. It never
// overwrites a project that already works — including with a missing pick, which only happens if the
// folder is deleted between the dialog closing and the existence check.
export function replacesProject(existing: Project | undefined, picked: Project): boolean {
  return !existing || (existing.missing && !picked.missing);
}

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
    writeFileSync(file, JSON.stringify(withRecentPath(readRecentPaths(file), projectPath)));
  } catch {
    // No history entry this time.
  }
}
