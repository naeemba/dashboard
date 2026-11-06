import { randomUUID } from 'node:crypto';
import { chmodSync, closeSync, fchmodSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

// The name a write goes through, beside the file, until the rename. Exported so what watches or commits
// the folder can leave a write still in flight, or one a crash left behind, alone.
export const TEMPORARY_SUFFIX = '.tmp';

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
// The temporary name is new on every write, so two writers in two processes (a board's card files have the
// app and the `board` command, board-rule-1) each rename a whole file of their own and the last rename wins.
// With one fixed name the second writer's open truncates the file the first is about to rename.
//
// The folder is made on the way, because the first write to a project is what creates .dashboard.
//
// `mode`, when given, is set on the temporary file before the rename, so the file is never seen under
// its name without it. Set with fchmod rather than through open, which the umask would narrow.
export function replaceFile(filePath: string, text: string, mode?: number): void {
  mkdirSync(dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}${TEMPORARY_SUFFIX}`;
  const descriptor = openSync(temporaryPath, 'w');
  // One try from the first byte to the rename: a write that fails part way (a full disk) leaves a file
  // under a name no later write reuses, so whatever fails after the open removes it before rethrowing.
  try {
    try {
      writeFileSync(descriptor, text);
      if (mode !== undefined) fchmodSync(descriptor, mode);
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
    renameSync(temporaryPath, filePath);
  } catch (error: unknown) {
    try {
      unlinkSync(temporaryPath);
    } catch {
      // Best effort: the error below is the one that matters.
    }
    throw error;
  }
}

// replaceFile only when the bytes differ, so a launch with nothing new leaves the file alone. A file
// whose bytes match but whose mode does not (its execute bit dropped by a chmod, a restore or a sync)
// is chmodded, not rewritten. Through replaceFile, so a program started mid-write is the old file or
// the new one, never half of one.
export function replaceFileIfChanged(filePath: string, text: string, mode?: number): void {
  let current: string | null = null;
  try {
    current = readFileSync(filePath, 'utf8');
  } catch {
    // Not there yet.
  }
  if (current !== text) replaceFile(filePath, text, mode);
  else if (mode !== undefined && (statSync(filePath).mode & 0o777) !== mode) chmodSync(filePath, mode);
}
