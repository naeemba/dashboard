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
  const totals = { fiveHours: 0, week: 0, allTime: 0 };
  for (const file of files) {
    totals.allTime += file.allTime;
    totals.week += sum(file.samples, weekStart(now));
    totals.fiveHours += sum(file.samples, now - FIVE_HOURS);
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

// The three figures as one string, which is what a project row prints. Spaced rather than punctuated:
// the row already uses `·` between a pane's state and its age, and three numbers joined with it read
// as one sentence instead of three columns.
export function projectTokens(totals: Totals | undefined): string {
  if (totals === undefined || totals.allTime === 0) return '';
  return [totals.fiveHours, totals.week, totals.allTime].map(formatTokens).join('  ');
}
