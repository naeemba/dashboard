import { readFileSync } from 'node:fs';
import type { FileUsage } from '../../shared/usage/usage';
import { replaceFileIfChanged } from '../app/replace-file';
import { isStale } from '../../shared/app/stale';

// Each log's counts, saved in userData so a launch reads only the logs written since the last run
// rather than every one there has ever been: 4.5 GB and 14 to 18 CPU-seconds on one machine. Which
// saved count a launch may take is sweepUsage's (usage-store.ts); what is here is the file.
//
// Read and written on the sweep's own thread (usage-worker.ts), and nowhere else.

// A file written by a version that counted differently is not this one's: its numbers are read again.
const COUNTS_VERSION = 1;

// How often the counts are written while the app runs. Whatever was counted since the last write is
// read again whole on the next launch, which is a few logs, not a loss.
export const SAVE_EVERY_MS = 10 * 60_000;

type CountsFile = { version: number; files: [string, FileUsage][] };

// What the last run counted, or nothing: a first launch, a file from another version, or a damaged
// one all mean every log is read, which is what a launch did before there were saved counts.
export function loadCounts(file: string): Map<string, FileUsage> {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<CountsFile>;
    if (parsed.version !== COUNTS_VERSION || !Array.isArray(parsed.files)) return new Map();
    return new Map(parsed.files);
  } catch {
    return new Map();
  }
}

// Written only when the bytes differ: an app left open with no session running would otherwise
// rewrite and flush the same few megabytes every ten minutes.
export function saveCounts(file: string, known: ReadonlyMap<string, FileUsage>): void {
  const counts: CountsFile = { version: COUNTS_VERSION, files: [...known] };
  replaceFileIfChanged(file, JSON.stringify(counts));
}

// When the thread loads and saves: loaded for the first sweep that succeeds and never again, saved
// after that sweep and then once every SAVE_EVERY_MS. A save that is due counts as done whether or not
// it then fails, so a disk that refuses is asked again in ten minutes, not every sweep.
export function countsSchedule(): { toLoad(): boolean; swept(): void; dueToSave(now: number): boolean } {
  let swept = false;
  let lastSaved: number | undefined;
  return {
    toLoad: () => !swept,
    swept: () => { swept = true; },
    dueToSave(now) {
      if (!isStale(lastSaved, now, SAVE_EVERY_MS)) return false;
      lastSaved = now;
      return true;
    },
  };
}
