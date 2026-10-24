import { appendFileSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import {
  LOG_FILE, LOG_FILE_COUNT, LOG_FILE_LIMIT, logFileNames, needsRotation, parseLogLine,
  type LogDraft, type LogEntry,
} from './log-entry';

// The log on disk: five files of 5 MB, the live one first. Main-process only, and no electron in it, so
// rotation is tested on a real folder. Synchronous on purpose: main is one thread, so two entries can
// never interleave in the file or start the same rotation twice, and an append is microseconds.
export type LogStore = { file: string; log(draft: LogDraft): void; tail(count: number): LogEntry[] };

function sizeOf(file: string): number {
  try {
    return statSync(file).size;
  } catch {
    return 0;
  }
}

export function logStore(directory: string, onAppended: (entry: LogEntry) => void, limit = LOG_FILE_LIMIT): LogStore {
  const files = logFileNames(path.join(directory, LOG_FILE), LOG_FILE_COUNT);

  // The oldest goes, then every file moves a place down. A file missing from the middle is skipped:
  // there is nothing of it to move.
  function rotate(): void {
    rmSync(files[files.length - 1], { force: true });
    for (let index = files.length - 2; index >= 0; index--) {
      try {
        renameSync(files[index], files[index + 1]);
      } catch {
        // Nothing at this place in the list.
      }
    }
  }

  // A write that fails costs that entry and nothing else. Logging is never a reason for the thing being
  // logged to fail, and the terminal the app started from still hears about it.
  function log(draft: LogDraft): void {
    const entry: LogEntry = { time: new Date().toISOString(), ...draft };
    const line = `${JSON.stringify(entry)}\n`;
    try {
      if (needsRotation(sizeOf(files[0]), Buffer.byteLength(line), limit)) rotate();
      appendFileSync(files[0], line);
    } catch (error: unknown) {
      console.error('log entry not written:', error);
      return;
    }
    try {
      onAppended(entry);
    } catch (error: unknown) {
      console.error('log entry not announced:', error);
    }
  }

  // The newest `count`, oldest first. Files are read newest first and stop as soon as there are enough,
  // so the usual read is the live file alone.
  function tail(count: number): LogEntry[] {
    const entries: LogEntry[] = [];
    for (const file of files) {
      let text: string;
      try {
        text = readFileSync(file, 'utf8');
      } catch {
        continue;
      }
      entries.unshift(...text.split('\n').flatMap((line) => parseLogLine(line) ?? []));
      if (entries.length >= count) break;
    }
    return entries.slice(-count);
  }

  return { file: files[0], log, tail };
}
