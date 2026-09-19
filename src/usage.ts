// What Claude Code's own logs say a reply cost, and the three totals the app shows from them.
//
// Nothing here reads a file or knows where the logs are: usage-store.ts does that, and main.ts does
// the sweeping. This is the arithmetic and the two window boundaries, which is the part with branches
// in it — a week that starts on the wrong Monday and a prune that throws away a sample the five-hour
// figure still needs are both silent, and both are pinned by the tests beside this file.

// The four counters on an assistant line, spelled the way Claude Code spells them. Every one is
// optional: the shape has grown fields over time and an old line is missing the newer ones.
export type TokenUsage = {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
};

// All four counted, not just input and output. A cached read is cheaper than a fresh one but it is
// not free, and it is far and away the biggest of the four — leave it out and a project that has been
// worked on all day reads as barely touched.
export function tokensOf(usage: TokenUsage): number {
  return (usage.input_tokens ?? 0)
    + (usage.output_tokens ?? 0)
    + (usage.cache_creation_input_tokens ?? 0)
    + (usage.cache_read_input_tokens ?? 0);
}

// One reply: when it happened and what it cost. Kept only while it is inside one of the two windows,
// which is what retainFrom decides.
export type Sample = { at: number; tokens: number };

export type Totals = { fiveHours: number; week: number; allTime: number };

// A project the sweep has nothing for yet, which every project is until the first sweep has run.
export const NO_TOTALS: Totals = { fiveHours: 0, week: 0, allTime: 0 };

export const FIVE_HOURS = 5 * 60 * 60 * 1000;

// Midnight local time on the Monday of the week `now` is in. Local, not UTC, because the week you
// mean is the one your Monday morning starts in — count from UTC midnight and everything you did
// before 03:30 on a Monday in Tehran lands in the week before.
//
// Through setDate rather than subtracting milliseconds, so the clock going forward or back over the
// weekend does not move the boundary off midnight.
export function weekStart(now: number): number {
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  // getDay counts from Sunday. Monday has to be day nought, or every Sunday counts as the start of
  // the week that is just about to end.
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return date.getTime();
}

// The oldest sample still worth keeping. The earlier of the two boundaries, never just the week's:
// at two in the morning on a Monday the week starts two hours ago and the five-hour window reaches
// back into Sunday night, so pruning to the week would throw away three hours of work that the
// five-hour figure is still supposed to be counting — and it would read as a quiet morning after a
// long night.
export function retainFrom(now: number): number {
  return Math.min(weekStart(now), now - FIVE_HOURS);
}

// One file's contribution, which is how the store keeps them: a running all-time count that never has
// to be recomputed, and the recent samples the two windows are summed from.
export type FileUsage = {
  // Bytes of the file already counted. The store reads from here on the next sweep.
  size: number;
  // The folder the session ran in, taken from the log's own `cwd` rather than from the folder name
  // Claude Code stores it under: that name is the path with every slash turned into a dash, which
  // cannot be turned back on a path that has a dash in it.
  directory: string;
  // The session this file belongs to. A subagent writes its own file under the session's folder, so
  // several files can name one session and the agent's own cost is counted with the pane it ran in.
  session: string;
  allTime: number;
  samples: Sample[];
};

function sum(samples: readonly Sample[], from: number): number {
  return samples.reduce((total, sample) => (sample.at >= from ? total + sample.tokens : total), 0);
}

export function totalsOf(files: Iterable<FileUsage>, now: number): Totals {
  // Both boundaries worked out once. weekStart builds a Date and walks it back to Monday, and the
  // loop below runs over every log on the machine for every open project.
  const week = weekStart(now);
  const fiveHours = now - FIVE_HOURS;
  const totals = { fiveHours: 0, week: 0, allTime: 0 };
  for (const file of files) {
    totals.allTime += file.allTime;
    totals.week += sum(file.samples, week);
    totals.fiveHours += sum(file.samples, fiveHours);
  }
  return totals;
}

// Whether a session ran in a project. Its own checkout, anything underneath it, and the worktrees the
// ship makes beside it — which are a sibling folder, not a child, so a plain prefix test would drop
// every card an agent worked. worktreesRoot in ship.ts is the one spelling of where they go.
export function ranInProject(directory: string, projectPath: string, worktrees: string): boolean {
  return directory === projectPath
    || directory.startsWith(`${projectPath}/`)
    || directory.startsWith(`${worktrees}/`);
}

const UNITS = [
  { at: 1e9, suffix: 'B' },
  { at: 1e6, suffix: 'M' },
  { at: 1e3, suffix: 'K' },
];

// A token count short enough to sit at the end of a row. Billions are ordinary here — a week of
// agents is thousands of millions — so the full number would be fifteen characters of digits that
// nobody reads past the first three of.
export function formatTokens(total: number): string {
  for (const unit of UNITS) {
    if (total < unit.at) continue;
    // One decimal, and a trailing nought dropped: `2B` rather than `2.0B`, because the point of the
    // decimal is to separate 2.1 from 2.9 and there is nothing to separate when it is not there.
    return `${Number((total / unit.at).toFixed(1))}${unit.suffix}`;
  }
  return `${total}`;
}

// What crosses to the renderer: the three figures for each open project, and one figure for each pane
// running an agent right now.
//
// A pane gets its session's whole cost rather than the three windows. The question a pane row answers
// is "what has this agent cost me", and an agent that has been going for six hours would read as
// nought against a five-hour window it started before.
export type UsageSnapshot = { projects: Record<string, Totals>; panes: Record<string, number> };

export function snapshotOf(
  files: Iterable<FileUsage>,
  projects: readonly { path: string; worktrees: string }[],
  paneSessions: ReadonlyMap<string, string>,
  now: number,
): UsageSnapshot {
  const all = [...files];
  const bySession = new Map<string, number>();
  for (const file of all) bySession.set(file.session, (bySession.get(file.session) ?? 0) + file.allTime);
  return {
    projects: Object.fromEntries(projects.map((project) => [
      project.path,
      totalsOf(all.filter((file) => ranInProject(file.directory, project.path, project.worktrees)), now),
    ])),
    panes: Object.fromEntries([...paneSessions].map(([pane, session]) => [pane, bySession.get(session) ?? 0])),
  };
}

export const NO_USAGE: UsageSnapshot = { projects: {}, panes: {} };

// Whether a sweep found anything worth telling the screen about. Almost every sweep reads the same
// numbers back — nobody is working in most of the open projects — and a message for those is a redraw
// of every row on the manager, every half minute. worktreesDiffer holds the same line over the
// worktree records.
//
// Order counts, the way it does there, and for the same cheap trade: the pane keys come off a Map that
// a shell closing and reopening reorders. That says yes with no figure moved, and the manager writes
// its rows in place, so a false yes costs one rewrite of text already on screen.
export function usageDiffers(previous: UsageSnapshot, next: UsageSnapshot): boolean {
  return JSON.stringify(previous) !== JSON.stringify(next);
}

// What each of the three figures is, named once above the list rather than on every row. Beside the
// function that prints them, so a fourth window added below is a column with a name on it rather than
// a fourth unlabelled number — the test beside this file fails if the two lists stop matching.
export const TOKEN_COLUMNS = ['5h', 'week', 'all'] as const;

// The three figures a project row prints: the five-hour window, the week and all time, soonest to
// widest, so the number that moves while you watch is nearest the rest of the row.
//
// One string per column rather than the three joined into one. Joined, they are three numbers of
// different widths in a single box — `40.9M  774M  3.1B` over `466.1M  2.4B  8B` — and nothing down
// the list lines up, so there is no column to read and no place to put a name. Always three, even for
// a project nothing has been spent on: the row keeps its columns and prints nothing in them, rather
// than three noughts or a row that has lost its shape.
export function projectTokens(totals: Totals): string[] {
  if (totals.allTime === 0) return TOKEN_COLUMNS.map(() => '');
  return [totals.fiveHours, totals.week, totals.allTime].map(formatTokens);
}

// Every open project's figures added together, which is what the line at the foot of the list prints.
// The same three windows, so a column means the same thing at the bottom as it does up the list.
export function sumTotals(totals: readonly Totals[]): Totals {
  return totals.reduce((all, one) => ({
    fiveHours: all.fiveHours + one.fiveHours,
    week: all.week + one.week,
    allTime: all.allTime + one.allTime,
  }), NO_TOTALS);
}

// The one figure a pane prints, and the other half of the same rule: nought is printed as nothing at
// all. Here beside projectTokens rather than at each of the three places that draw one — the first
// draw of a manager row, the timer's redraw of it, and the status bar — because "is this figure worth
// showing" is the same question in all three and a copy of it in a drawing file is a copy nobody
// thinks to grep. Teach this one that a pane under a thousand tokens is startup noise worth hiding,
// and all three go quiet together.
export function paneTokens(tokens: number): string {
  return tokens === 0 ? '' : formatTokens(tokens);
}
