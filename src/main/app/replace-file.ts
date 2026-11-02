import { randomUUID } from 'node:crypto';
import { closeSync, fsyncSync, mkdirSync, openSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

// How every file the dashboard keeps is written, in a project's .dashboard folder and in userData alike:
// to a temporary file beside it first, then renamed over it. A rename within a directory is atomic on
// every platform this app runs on, so a crash or a full disk mid-write leaves either the old file or the
// new one, never a truncated one. Without the rename the app itself would be the main producer of the
// corruption the salvage path in readBoard exists to clean up after, and the notes would come back with
// the second half of a page missing.
//
// The temporary file is flushed to disk before the rename: without that, a power cut can land the rename
// before the bytes, and the next launch finds the new name on an empty file. The flush runs on main's
// thread and is chosen over speed on purpose: on a disk busy with a build in another pane it can hold
// main for tens of milliseconds or more, during which no IPC is answered and no pty output relayed. The
// notes save after each pause in typing and session.json on every layout change, so that is where a
// stall would show; making this async would push that onto every caller.
//
// The temporary name is new on every write, so two writers in two processes (board.json has the app and
// the `board` command, board-rule-1) each rename a whole file of their own and the last rename wins.
// With one fixed name the second writer's open truncates the file the first is about to rename.
//
// The folder is made on the way, because the first write to a project is what creates .dashboard.
export function replaceFile(filePath: string, text: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  const descriptor = openSync(temporaryPath, 'w');
  try {
    writeFileSync(descriptor, text);
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  try {
    renameSync(temporaryPath, filePath);
  } catch (error: unknown) {
    try {
      unlinkSync(temporaryPath);
    } catch {
      // Best effort: the rename error below is the one that matters.
    }
    throw error;
  }
}
