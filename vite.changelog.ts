import { version } from './package.json';
import { attempt, git } from './vite.build-version';
import type { Changelog, ChangelogEntry } from './src/shared/app/whats-new';

// The what's-new popup's list, read from git when the renderer is built, so a local rebuild.sh and a
// release build carry the same thing: the pull requests merged into the line the build was made from,
// newest first. `--first-parent` keeps to that line's own merges, not the commits each one brought in.
// Capped, because the bundle carries it whole and nobody scrolls past a few months of it.
const CHANGELOG_LIMIT = 200;

// Fields and records are split on ASCII unit and record separators, which no title contains.
const FIELD = '\x1f';
const RECORD = '\x1e';
const MERGE_SUBJECT = /^Merge pull request #(\d+) from /;

// GitHub writes the pull request's title as the first line of the merge commit's body; a merge made
// without one falls back to the subject, which at least names the branch.
export function parseMerges(log: string): ChangelogEntry[] {
  return log.split(RECORD).flatMap((record) => {
    const [commit, time, subject, body] = record.trim().split(FIELD);
    const number = MERGE_SUBJECT.exec(subject ?? '');
    if (!commit || !time || !number) return [];
    const title = body?.split('\n').map((line) => line.trim()).find((line) => line !== '') ?? subject;
    return [{ commit: commit.slice(0, 12), time, pullRequest: Number(number[1]), title }];
  });
}

// `owner/name` out of whatever origin is spelled as: an ssh alias (`git@github.com-p:owner/name.git`)
// or an https URL alike. Null when there is no origin, and the popup's rows then link nowhere.
export function repositoryOf(remote: string): string | null {
  const match = /[:/]([^/:]+\/[^/]+?)(?:\.git)?\/?$/.exec(remote.trim());
  return match ? match[1] : null;
}

// Outside a git checkout every part is empty rather than a failed build, the same as the version stamp.
// A release is a build of the commit its `v<version>` tag names, which is what the release workflow
// checks out; any other build has no version heading.
export function readChangelog(): Changelog {
  const log = attempt(() => git(
    // The grep is git's basic regex, so the subject's anchor only; parseMerges reads the number.
    'log', '--first-parent', '--merges', '--grep=^Merge pull request #', '-n', String(CHANGELOG_LIMIT),
    `--format=%H${FIELD}%cI${FIELD}%s${FIELD}%b${RECORD}`,
  ), '');
  const tags = attempt(() => git('tag', '--points-at', 'HEAD').split('\n').map((tag) => tag.trim()), []);
  return {
    repository: attempt(() => repositoryOf(git('remote', 'get-url', 'origin')), null),
    release: tags.includes(`v${version}`) ? `v${version}` : null,
    entries: parseMerges(log),
  };
}
