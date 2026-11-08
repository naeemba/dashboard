import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { leftoverTemporaryEntries } from './vitest.temporary-folder-leftovers';

// The whole run gets a temporary folder of its own: TMPDIR (TEMP and TMP on Windows) is pointed at it
// before any test file starts, so every os.tmpdir() — in a test, in the code it tests, in a git or node
// it spawns — lands inside it. At the end the run fails naming whatever was left there, then the folder
// goes either way, so a leak fails the run instead of filling /tmp. Nothing is put back: the process
// running this teardown is about to exit.
export default function setup(): () => void {
  const folder = mkdtempSync(join(tmpdir(), 'vitest-'));
  for (const name of ['TMPDIR', 'TEMP', 'TMP']) process.env[name] = folder;
  return () => {
    const leftovers = leftoverTemporaryEntries(readdirSync(folder));
    rmSync(folder, { recursive: true, force: true });
    if (leftovers.length > 0) {
      throw new Error(`The run left temporary folders behind: ${leftovers.join(', ')}. A test's own folder comes from temporaryFolder() in src/main/testing/temporary-folder.ts; one the code under test made and never removed is a bug in that code, and would stay in a user's /tmp too.`);
    }
  };
}
