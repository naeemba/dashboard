import { isRecord } from './is-record';

// One merged pull request, as the build read it from git (vite.changelog.ts). `time` is the merge's
// committer time in ISO 8601 with its offset; `commit` is 12 digits, like the build stamp.
export type ChangelogEntry = { commit: string; time: string; pullRequest: number; title: string };

// What the renderer is built with: newest first. `repository` is `owner/name` on GitHub, null when the
// build had no origin; `release` is the `v<version>` a release build was cut from, null otherwise.
export type Changelog = { repository: string | null; release: string | null; entries: ChangelogEntry[] };

// What the app last showed, kept in userData: the build's stamp, and the newest entry that build carried.
export type ShownBuild = { build: string; newest: { commit: string; time: string } | null };

// The record as main reads it at launch. `history` is whether this userData folder had been used
// before (a saved session), which tells the first install apart from an update from a build that
// kept no record yet.
export type LastShown = { shown: ShownBuild | null; history: boolean };

export function shownBuild(build: string, changelog: Changelog): ShownBuild {
  const newest = changelog.entries[0];
  return { build, newest: newest ? { commit: newest.commit, time: newest.time } : null };
}

// The entries a launch shows: none on the first install, none for the same build again, and otherwise
// those newer than the newest one shown last time. That entry is found by its commit; one this build
// no longer carries (past the cap, or a branch that never merged) is passed by time instead, so an
// older build installed over a newer one shows nothing rather than its whole list.
export function entriesToShow(changelog: Changelog, last: LastShown, build: string): ChangelogEntry[] {
  const { entries } = changelog;
  if (last.shown === null) return last.history ? entries : [];
  if (last.shown.build === build) return [];
  const newest = last.shown.newest;
  if (newest === null) return entries;
  const seen = entries.findIndex((entry) => entry.commit === newest.commit);
  if (seen !== -1) return entries.slice(0, seen);
  return entries.filter((entry) => Date.parse(entry.time) > Date.parse(newest.time));
}

// Grouped under the day each merged, as the merge's own clock wrote it, in the order given.
export function byDate(entries: readonly ChangelogEntry[]): { date: string; entries: ChangelogEntry[] }[] {
  const groups: { date: string; entries: ChangelogEntry[] }[] = [];
  for (const entry of entries) {
    const date = entry.time.slice(0, 10);
    const last = groups.at(-1);
    if (last?.date === date) last.entries.push(entry);
    else groups.push({ date, entries: [entry] });
  }
  return groups;
}

export function pullRequestUrl(repository: string, pullRequest: number): string {
  return `https://github.com/${repository}/pull/${pullRequest}`;
}

// The record file read back, or null for anything that is not one: a missing or hand-broken file costs
// one popup at most, never the launch.
export function parseShownBuild(value: unknown): ShownBuild | null {
  if (!isRecord(value) || typeof value.build !== 'string') return null;
  const { newest } = value;
  if (isRecord(newest) && typeof newest.commit === 'string' && typeof newest.time === 'string') {
    return { build: value.build, newest: { commit: newest.commit, time: newest.time } };
  }
  return { build: value.build, newest: null };
}
