import { appendFileSync, closeSync, openSync, readFileSync, readSync, renameSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import {
  LOG_FILE, LOG_FILE_COUNT, LOG_FILE_LIMIT, logFileNames, needsRotation, parseLogLine,
  type LogDraft, type LogEntry,
} from './log-entry';

// The log on disk: five files of 5 MB, the live one first. Main-process only, and no electron in it, so
// rotation is tested on a real folder. Synchronous on purpose: main is one thread, so two entries can
// never interleave in the file or start the same rotation twice, and an append is microseconds.
export type LogStore = { file: string; log(draft: LogDraft): void; tail(count: number): LogEntry[] };

const NEWLINE = 0x0a;

function sizeOf(file: string): number {
  try {
    return statSync(file).size;
  } catch {
    return 0;
  }
}

function lastByte(file: string, size: number): number {
  const descriptor = openSync(file, 'r');
  try {
    const buffer = Buffer.alloc(1);
    readSync(descriptor, buffer, 0, 1, size - 1);
    return buffer[0];
  } finally {
    closeSync(descriptor);
  }
}

export function logStore(directory: string, onAppended: (entry: LogEntry) => void, limit = LOG_FILE_LIMIT): LogStore {
  const files = logFileNames(path.join(directory, LOG_FILE), LOG_FILE_COUNT);

  // The oldest goes, then every file moves a place down. A file missing from the middle is skipped:
  // there is nothing of it to move. Any other failure stops the rotation and reaches log(), which drops
  // the entry: skipping it would let the live file stay over the limit and shift the history away on
  // every later write.
  function rotate(): void {
    rmSync(files[files.length - 1], { force: true });
    for (let index = files.length - 2; index >= 0; index--) {
      try {
        renameSync(files[index], files[index + 1]);
      } catch (error: unknown) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
  }

  // A crash mid-write leaves the live file without its last newline. The first append after start looks
  // at that one byte, so the next entry starts its own line instead of gluing onto the broken one.
  let liveFileChecked = false;
  function needsLeadingNewline(): boolean {
    if (liveFileChecked) return false;
    const size = sizeOf(files[0]);
    return size !== 0 && lastByte(files[0], size) !== NEWLINE;
  }

  // A write that fails costs that entry and nothing else. Logging is never a reason for the thing being
  // logged to fail, and the terminal the app started from still hears about it.
  function log(draft: LogDraft): void {
    const entry: LogEntry = { ...draft, time: new Date().toISOString() };
    let line = `${JSON.stringify(entry)}\n`;
    try {
      if (needsRotation(sizeOf(files[0]), Buffer.byteLength(line), limit)) rotate();
      else if (needsLeadingNewline()) line = `\n${line}`;
      appendFileSync(files[0], line);
      // Only once the append has landed: a failed one leaves the broken line still unterminated.
      liveFileChecked = true;
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
  // so the usual read is the live file alone. Each file is walked from its end and parsed only as far
  // back as is needed: this runs on every arrival, and parsing a whole 5 MB file each time is most of
  // what an arrival would cost.
  function tail(count: number): LogEntry[] {
    if (count <= 0) return [];
    const newestFirst: LogEntry[] = [];
    for (const file of files) {
      let text: string;
      try {
        text = readFileSync(file, 'utf8');
      } catch {
        continue;
      }
      let end = text.length;
      while (end > 0 && newestFirst.length < count) {
        const start = text.lastIndexOf('\n', end - 1) + 1;
        const entry = parseLogLine(text.slice(start, end));
        if (entry) newestFirst.push(entry);
        end = start - 1;
      }
      if (newestFirst.length >= count) break;
    }
    return newestFirst.reverse();
  }

  return { file: files[0], log, tail };
}
