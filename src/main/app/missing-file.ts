import { readFileSync } from 'node:fs';

// A read of something that may not be there: null when it is missing, every other failure thrown. A
// missing file is the ordinary case for anything the app seeds on first write; a file that is there
// and cannot be read is not, and is the caller's to report.
export function orMissing<T>(read: () => T): T | null {
  try {
    return read();
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

export function readText(file: string): string | null {
  return orMissing(() => readFileSync(file, 'utf8'));
}
