import { readdir } from 'node:fs/promises';
import path from 'node:path';
import type { DocEntry } from '../../shared/drawer/drawer';

// The markdown files under a project's docs/ folder, which the drawer lists. A project with no docs/
// lists none rather than failing.

// The order the rows print in: by folder, each folder's README before the rest of it, so the index of a
// feature leads the feature.
export function docOrder(one: string, other: string): number {
  const key = (name: string): string => name.replace(/(^|\/)README\.md$/i, '$1');
  return key(one).localeCompare(key(other));
}

export async function listDocs(projectPath: string): Promise<DocEntry[]> {
  const root = path.join(projectPath, 'docs');
  let names: string[];
  try {
    names = await readdir(root, { recursive: true });
  } catch {
    return [];
  }
  return names
    .filter((name) => name.toLowerCase().endsWith('.md'))
    .map((name) => name.split(path.sep).join('/'))
    .sort(docOrder)
    .map((name) => ({ path: path.join(root, name), name }));
}
