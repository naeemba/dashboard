import { homedir } from 'node:os';
import path from 'node:path';
import { replaceFile } from '../app/replace-file';

// ~/.claude/usage-7d.json, the reading `dashboard budget` decides by (command-decision-6). Two writers
// put the same shape there: the terminal statusline each time it draws, and the app each time a Claude
// screen is measured, so a user working only in the app's screens still leaves a fresh reading.
export const WEEKLY_USAGE_FILE = path.join(homedir(), '.claude', 'usage-7d.json');

// A screen is measured after every turn; a minute between writes is fresher than the 30 minutes budget
// allows, and a busy page does not rewrite the file each turn.
export const RECORD_EVERY_MS = 60_000;

// The file's text when this measure is worth writing, null when the last write is recent enough or the
// session gave no 7-day figure (an API key, or the experimental call gone in a release): then the file
// is left to go stale, and budget says unknown rather than under.
export function weeklyUsageText(percentage: number | undefined, lastWrite: number | null, now: number): string | null {
  if (percentage === undefined || !Number.isFinite(percentage)) return null;
  if (lastWrite !== null && now - lastWrite < RECORD_EVERY_MS) return null;
  return `${JSON.stringify({ usedPercentage: percentage, at: new Date(now).toISOString() })}\n`;
}

let lastWrite: number | null = null;

// Called with each measure's 7-day figure. A failed write is dropped: the reading goes stale, which
// budget already answers as unknown.
export function recordWeeklyUsage(percentage: number | undefined, now: number, file = WEEKLY_USAGE_FILE): void {
  const text = weeklyUsageText(percentage, lastWrite, now);
  if (text === null) return;
  lastWrite = now;
  try {
    replaceFile(file, text);
  } catch {
    // Stale is the answer; see above.
  }
}
