import { existsSync } from 'node:fs';
import { basename } from 'node:path';

export type Project = { name: string; path: string; missing: boolean };

export function parseProjects(
  environment: Record<string, string | undefined>,
  directoryExists: (path: string) => boolean = existsSync,
): Project[] {
  return (environment.PROJECTS ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((path) => ({ name: basename(path), path, missing: !directoryExists(path) }));
}
