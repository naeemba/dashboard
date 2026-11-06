import { realpathSync } from 'node:fs';

// Where a path really is, symlinks followed: git prints real paths, and a project opened through a
// symlink is the same project as one named by its other path. One that cannot be resolved — a folder
// gone — is compared as given.
export function realPath(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}
