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
