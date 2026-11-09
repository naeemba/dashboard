import { readdirSync } from 'node:fs';
import path from 'node:path';

// Every non-test `.ts` file under a folder, as a forward-slash path from the repository root, for the
// tests that hold the source to a rule by reading it.
export function sourceFiles(folder: string): string[] {
  return readdirSync(folder, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'))
    .map((file) => path.join(folder, file).split(path.sep).join('/'));
}
