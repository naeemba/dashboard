import { statSync } from 'node:fs';
import { basename, resolve } from 'node:path';

export type Project = { name: string; path: string; missing: boolean };

function isDirectory(path: string): boolean {
  return statSync(path, { throwIfNoEntry: false })?.isDirectory() ?? false;
}

// Resolve here so .env entries and dialog picks compare equal: a trailing slash or a relative
// path must not turn one directory into two projects.
export function projectFromPath(path: string, directoryExists: (path: string) => boolean = isDirectory): Project {
  const directory = resolve(path);
  return { name: basename(directory), path: directory, missing: !directoryExists(directory) };
}

// A pick fills an empty slot, and upgrades a project that was missing at launch to the live one. It never
// overwrites a project that already works — including with a missing pick, which only happens if the
// folder is deleted between the dialog closing and the existence check.
export function replacesProject(existing: Project | undefined, picked: Project): boolean {
  return !existing || (existing.missing && !picked.missing);
}

export function parseProjects(
  environment: Record<string, string | undefined>,
  directoryExists: (path: string) => boolean = isDirectory,
): Project[] {
  return (environment.PROJECTS ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((path) => projectFromPath(path, directoryExists));
}
