import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll } from 'vitest';

// A fresh folder under the system's temporary folder, removed when the test file that made it is done.
// A test that needs a folder of its own takes it from here: tests that called mkdtempSync themselves
// and never removed what they made filled a 16G /tmp in a few days of five workers running the suite.
// Removed after the file, not after each test, so a folder made while the file is being collected
// lives through every test that uses it.

const made: string[] = [];

afterAll(() => {
  for (const folder of made.splice(0)) rmSync(folder, { recursive: true, force: true });
});

export function temporaryFolder(prefix: string): string {
  const folder = mkdtempSync(join(tmpdir(), prefix));
  made.push(folder);
  return folder;
}
