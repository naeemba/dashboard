import { relativeAge, timeOf } from '../../shared/app/age';
import { isRecord } from '../../shared/app/is-record';
import { BUDGET_PERCENTAGE_RANGE, type Settings } from '../../shared/settings/settings';
import { readFlagList } from './flags';

// The `budget` noun: the 7-day usage of the Claude account against the limit set once in settings.json
// (budget), so a long unattended loop can stop itself without the limit being restated. The limit is
// a fixed weekly cap, a pace that grows each day since the weekly reset, or none (command-decision-10).
// The reading is ~/.claude/usage-7d.json, which the user's statusline writes each time it draws and the
// app each time a Claude screen is measured (command-decision-6). This file holds the decisions;
// budget-program.ts the files and the terminal.

// Past this a reading says nothing about now: the file is written only while some session is on
// screen, and a loop left overnight would otherwise read yesterday's figure as under the cap.
export const STALE_AFTER_MS = 30 * 60_000;

// A few minutes of skew between two writers on one machine is a reading from now. More is a clock that
// was wrong when it wrote, and would otherwise count as fresh for as long as it was ahead.
export const AHEAD_ALLOWED_MS = 5 * 60_000;

export const BUDGET_USAGE = `budget — the 7-day usage of your Claude account against a limit you set once

  budget                print the share used, the limit that applies, today's figure and how old
                        the reading is
  budget --cap <n>      hold the usage to a fixed weekly cap, ${BUDGET_PERCENTAGE_RANGE}
  budget --cap none     no limit: budget always exits 0
  budget --pace even    a pace: a seventh of the week for each day begun since the weekly reset,
                        so 5/7 of 100 on the fifth day
  budget --pace <n>     a pace of n% a day since the weekly reset

The limit is kept in settings.json, and the settings screen sets it too. budget exits 0 under the
limit, 1 at or over it, and 2 when it cannot say: no cap set, ~/.claude/usage-7d.json missing, broken,
dated in the future or older than ${STALE_AFTER_MS / 60_000} minutes, or a pace with no reset time in
it ("resetsAt"). That file is written by the statusline each time it draws and by the app after each
turn on a Claude screen, so with no session on screen the reading goes stale, and a stale reading is
never "under". A loop that must stop at the limit runs budget before each round and stops on anything
but 0. Needs no app.`;

export type BudgetCommand =
  | { kind: 'read' }
  | { kind: 'cap'; cap: string }
  | { kind: 'pace'; share: string }
  | { kind: 'refused'; message: string };

// The words after `budget`, `--help` already answered by the router. The last of --cap and --pace wins.
export function parseBudgetCommand(commandArguments: readonly string[]): BudgetCommand {
  const read = readFlagList(commandArguments, ['cap', 'pace']);
  if ('message' in read) return { kind: 'refused', message: `${read.message}\n\n${BUDGET_USAGE}` };
  const last = read.flags.at(-1);
  if (last === undefined) return { kind: 'read' };
  // The word as typed: settings.cap and settings.pace are the one check of it.
  return last[0] === 'cap' ? { kind: 'cap', cap: last[1] } : { kind: 'pace', share: last[1] };
}

export type BudgetVerdict = { exitCode: 0 | 1 | 2; line: string };

const DAY_MS = 24 * 3_600_000;
const WEEK_MS = 7 * DAY_MS;

function parsedRecord(text: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(text);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

// Which day of the 7-day window `now` is in, 1 on the day of the reset that began it. Counted in local
// calendar days, not 24 hours: with a reset on Friday at 15:30, Saturday is day 2 from midnight, and
// Tuesday is day 5. `resetsAt` is when the window ends; one already past began the window now running.
export function paceDay(resetsAt: number, now: number): number {
  const start = new Date(resetsAt > now ? resetsAt - WEEK_MS : resetsAt);
  const today = new Date(now);
  const days = Math.round((Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
    - Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())) / DAY_MS);
  return Math.min(7, Math.max(1, days + 1));
}

// The cap that applies now and the words naming it, or why there is none.
function todaysCap(budget: Settings['budget'], resetsAt: unknown, now: number): { cap: number; named: string } | { line: string } {
  if (budget.limit !== 'pace') {
    return budget.weeklyCap === null
      ? { line: 'no weekly cap set: set one with `budget --cap <n>` or on the settings screen' }
      : { cap: budget.weeklyCap, named: `weekly cap ${budget.weeklyCap}%` };
  }
  const reset = typeof resetsAt === 'string' ? timeOf(resetsAt) : undefined;
  if (reset === undefined) {
    return { line: 'no reset time: the pace counts days since the weekly reset, and ~/.claude/usage-7d.json has no "resetsAt"; a Claude screen in the app writes it, the statusline when it writes rate_limits.seven_day.resets_at' };
  }
  const day = paceDay(reset, now);
  // Rounded before the comparison as well as the line, so the figures printed and the verdict agree.
  const cap = Number(Math.min(100, day * (budget.dailyShare ?? 100 / 7)).toFixed(1));
  return { cap, named: `today's cap ${cap}% (pace, day ${day} of 7 since the reset)` };
}

// Under, over, or unknown. `readReading` gives the file's text, null when there is none, and is not
// called under no limit, so a reading that cannot be read never stops a loop with none set. A reading
// dated a little ahead is a clock out of step and counts as fresh; one dated further ahead is unknown.
export function budgetVerdict(readReading: () => string | null, budget: Settings['budget'], now: number): BudgetVerdict {
  if (budget.limit === 'none') return { exitCode: 0, line: 'no limit set: budget answers under; set one with `budget --cap <n>`, `budget --pace even` or on the settings screen' };
  const reading = readReading();
  if (reading === null) return { exitCode: 2, line: 'no reading: ~/.claude/usage-7d.json is missing; the statusline or a Claude screen in the app writes it' };
  const stored = parsedRecord(reading);
  const used = stored.usedPercentage;
  const at = typeof stored.at === 'string' ? timeOf(stored.at) : undefined;
  if (typeof used !== 'number' || !Number.isFinite(used) || at === undefined) {
    return { exitCode: 2, line: `no reading: ~/.claude/usage-7d.json is not {"usedPercentage": <number>, "at": "<ISO time>"}` };
  }
  if (at - now > AHEAD_ALLOWED_MS) {
    return { exitCode: 2, line: 'no reading: ~/.claude/usage-7d.json is dated in the future; a clock was wrong when it was written' };
  }
  const today = todaysCap(budget, stored.resetsAt, now);
  if ('line' in today) return { exitCode: 2, line: today.line };
  const age = Math.max(0, now - at);
  const figures = `${used}% of the 7-day usage used, ${today.named}, read ${relativeAge(now - age, now)}`;
  if (age > STALE_AFTER_MS) return { exitCode: 2, line: `${figures}: too old to say, no Claude session has reported its usage since` };
  return used >= today.cap
    ? { exitCode: 1, line: `${figures}: at or over the cap` }
    : { exitCode: 0, line: `${figures}: under the cap` };
}
