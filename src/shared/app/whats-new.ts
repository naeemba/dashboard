import { isRecord } from './is-record';

// One merged pull request, as the build read it from git (vite.changelog.ts). `time` is the merge's
// committer time in ISO 8601 with its offset; `commit` is 12 digits, like the build stamp.
export type ChangelogEntry = { commit: string; time: string; pullRequest: number; title: string };

// What the renderer is built with: newest first. `repository` is `owner/name` on GitHub, null when the
// build had no origin; `release` is the `v<version>` a release build was cut from, null otherwise.
export type Changelog = { repository: string | null; release: string | null; entries: ChangelogEntry[] };

// What the app last showed, kept in userData: the newest entry the last build carried, null for a
// build that carried none. The same build carries the same newest entry, so this alone tells a new
// build that merged something from one that did not.
export type ShownRecord = { newest: Pick<ChangelogEntry, 'commit' | 'time'> | null };

// The record as main reads it at launch. `history` is whether this userData folder had been used
// before (a saved session), which tells the first install apart from an update from a build that
// kept no record yet.
export type LastShown = { shown: ShownRecord | null; history: boolean };

export type DateGroup = { date: string; entries: ChangelogEntry[] };

export function shownRecord(changelog: Changelog): ShownRecord {
  const newest = changelog.entries[0];
  return { newest: newest ? { commit: newest.commit, time: newest.time } : null };
}

// The entries a launch shows: none on the first install, and otherwise those newer than the newest one
// shown last time, which is none for the same build again. That entry is found by its commit; one this
// build no longer carries (past the cap, or a branch that never merged) is passed by time instead, so
// an older build installed over a newer one shows nothing rather than its whole list.
export function entriesToShow(changelog: Changelog, last: LastShown): ChangelogEntry[] {
  const { entries } = changelog;
  if (last.shown === null) return last.history ? entries : [];
  const newest = last.shown.newest;
  if (newest === null) return entries;
  const seen = entries.findIndex((entry) => entry.commit === newest.commit);
  if (seen !== -1) return entries.slice(0, seen);
  const shownAt = Date.parse(newest.time);
  return entries.filter((entry) => Date.parse(entry.time) > shownAt);
}

// Grouped under the day each merged, as the merge's own clock wrote it, in the order given.
export function byDate(entries: readonly ChangelogEntry[]): DateGroup[] {
  return [...Map.groupBy(entries, (entry) => entry.time.slice(0, 10))].map(([date, group]) => ({ date, entries: group }));
}

export function pullRequestUrl(repository: string, pullRequest: number): string {
  return `https://github.com/${repository}/pull/${pullRequest}`;
}

// The record file read back, or null for anything that is not one: a missing or hand-broken file costs
// one popup at most, never the launch.
export function parseShownRecord(value: unknown): ShownRecord | null {
  if (!isRecord(value) || !('newest' in value)) return null;
  const { newest } = value;
  if (isRecord(newest) && typeof newest.commit === 'string' && typeof newest.time === 'string') {
    return { newest: { commit: newest.commit, time: newest.time } };
  }
  return newest === null ? { newest: null } : null;
}

// Whether `current` replaces the record on disk: only when it moves forward. The same build launched
// again writes nothing, and an older build over a newer record leaves it, so the next newer build does
// not show again what was already seen.
export function recordMovesForward(shown: ShownRecord | null, current: ShownRecord): boolean {
  if (shown === null) return true;
  if (current.newest === null) return false;
  if (shown.newest === null) return true;
  return Date.parse(current.newest.time) > Date.parse(shown.newest.time);
}

// The popup's last line: what Enter does, if anything.
export function whatsNewFooter(count: number, repository: string | null): string {
  if (count === 0) return 'No merged pull requests in this build\'s history. Escape closes.';
  if (repository) return 'Enter opens the pull request on GitHub. Escape closes.';
  return 'This build has no GitHub origin to link to. Escape closes.';
}
