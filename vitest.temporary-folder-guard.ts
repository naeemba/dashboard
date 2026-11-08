import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { leftoverTemporaryEntries } from './vitest.temporary-folder-leftovers';

// The whole run gets a temporary folder of its own: TMPDIR is pointed at it before any test file
// starts, so every os.tmpdir() — in a test, in the code it tests, in a git or node it spawns — lands
// inside it. At the end the run fails naming whatever a test left there, then the folder goes either
// way, so a leak fails the run instead of filling /tmp.
export default function setup(): () => void {
  const previous = process.env.TMPDIR;
  const folder = mkdtempSync(join(tmpdir(), 'vitest-'));
  process.env.TMPDIR = folder;
  return () => {
    const leftovers = leftoverTemporaryEntries(readdirSync(folder));
    rmSync(folder, { recursive: true, force: true });
    if (previous === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = previous;
    if (leftovers.length > 0) {
      throw new Error(`Tests left temporary folders behind; take them from temporaryFolder() in src/main/testing/temporary-folder.ts: ${leftovers.join(', ')}`);
    }
  };
}
