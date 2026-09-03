import { statSync } from 'node:fs';
import { basename } from 'node:path';

export type Project = { name: string; path: string; missing: boolean };

function isDirectory(path: string): boolean {
  return statSync(path, { throwIfNoEntry: false })?.isDirectory() ?? false;
}

export function parseProjects(
  environment: Record<string, string | undefined>,
  directoryExists: (path: string) => boolean = isDirectory,
): Project[] {
  return (environment.PROJECTS ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((path) => ({ name: basename(path), path, missing: !directoryExists(path) }));
}
