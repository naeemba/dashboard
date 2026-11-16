import { isRecord } from '../../shared/app/is-record';
import { isWeeklyCap } from '../../shared/settings/settings';
import { readFlagList } from './flags';

// The `budget` noun: the 7-day usage of the Claude account against the cap set once in settings.json
// (budget.weeklyCap), so a long unattended loop can stop itself without the cap being restated. The
// reading is ~/.claude/usage-7d.json, which the user's statusline writes each time it draws
// (command-decision-6). This file holds the decisions; budget-program.ts the files and the terminal.

// Past this a reading says nothing about now: the statusline writes only while some session is on
// screen, and a loop left overnight would otherwise read yesterday's figure as under the cap.
export const STALE_AFTER_MS = 30 * 60_000;

export const BUDGET_USAGE = `budget — the 7-day usage of your Claude account against a cap you set once

  budget              print the share used, the cap and how old the reading is
  budget --cap <n>    set the cap, a percentage above 0 and at most 100, kept in settings.json

budget exits 0 under the cap, 1 at or over it, and 2 when it cannot say: no cap set, or
~/.claude/usage-7d.json missing, broken or older than ${STALE_AFTER_MS / 60_000} minutes. That file is written by
the statusline each time a Claude session draws it, so with no session on screen the reading goes
stale, and a stale reading is never "under". A loop that must stop at the cap runs budget before each
round and stops on anything but 0. Needs no app.`;

export type BudgetCommand = { kind: 'read' } | { kind: 'cap'; cap: number } | { kind: 'refused'; message: string };

// The words after `budget`, `--help` already answered by the router.
export function parseBudgetCommand(commandArguments: readonly string[]): BudgetCommand {
  const read = readFlagList(commandArguments, ['cap']);
  if ('message' in read) return { kind: 'refused', message: `${read.message}\n\n${BUDGET_USAGE}` };
  const cap = read.flags.at(-1);
  if (cap === undefined) return { kind: 'read' };
  if (!isWeeklyCap(cap[1])) return { kind: 'refused', message: `"${cap[1]}" is not a cap: a percentage above 0 and at most 100` };
  return { kind: 'cap', cap: Number(cap[1]) };
}

export type BudgetVerdict = { exitCode: 0 | 1 | 2; line: string };

function ago(milliseconds: number): string {
  const minutes = Math.floor(milliseconds / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 120) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 48 ? `${hours} hours ago` : `${Math.floor(hours / 24)} days ago`;
}

// Under, over, or unknown. `reading` is the file's text, null when there is none. A reading dated in
// the future is a clock out of step, and counts as fresh.
export function budgetVerdict(reading: string | null, cap: number | null, now: number): BudgetVerdict {
  if (cap === null) return { exitCode: 2, line: 'no weekly cap set: set one with `budget --cap <n>` or on the settings screen' };
  if (reading === null) return { exitCode: 2, line: 'no reading: ~/.claude/usage-7d.json is missing; the statusline writes it while a Claude session draws it' };
  let stored: unknown;
  try {
    stored = JSON.parse(reading);
  } catch {
    stored = null;
  }
  const used = isRecord(stored) ? stored.usedPercentage : undefined;
  const at = isRecord(stored) && typeof stored.at === 'string' ? Date.parse(stored.at) : Number.NaN;
  if (typeof used !== 'number' || !Number.isFinite(used) || Number.isNaN(at)) {
    return { exitCode: 2, line: `no reading: ~/.claude/usage-7d.json is not {"usedPercentage": <number>, "at": "<ISO time>"}` };
  }
  const age = Math.max(0, now - at);
  const figures = `${used}% of the 7-day usage used, cap ${cap}%, read ${ago(age)}`;
  if (age > STALE_AFTER_MS) return { exitCode: 2, line: `${figures}: too old to say, no Claude session has drawn its statusline since` };
  return used >= cap
    ? { exitCode: 1, line: `${figures}: at or over the cap` }
    : { exitCode: 0, line: `${figures}: under the cap` };
}
