import { describe, expect, it } from 'vitest';
import { byDate, entriesToShow, parseShownBuild, shownBuild, type Changelog, type ChangelogEntry } from './whats-new';

function entry(pullRequest: number, time: string): ChangelogEntry {
  return { commit: `commit${pullRequest}`, time, pullRequest, title: `Pull request ${pullRequest}` };
}

const newest = entry(3, '2026-11-06T12:00:00+03:30');
const middle = entry(2, '2026-11-05T18:00:00+03:30');
const oldest = entry(1, '2026-11-05T09:00:00+03:30');
const changelog: Changelog = { repository: 'owner/name', release: null, entries: [newest, middle, oldest] };
const build = '2.41.4+aaaaaaaaaaaa';

describe('entriesToShow', () => {
  it('shows nothing on the very first install, so the app only remembers the build', () => {
    expect(entriesToShow(changelog, { shown: null, history: false }, build)).toEqual([]);
  });

  it('shows everything when the app was used before any build kept a record', () => {
    expect(entriesToShow(changelog, { shown: null, history: true }, build)).toEqual([newest, middle, oldest]);
  });

  it('shows nothing when the same build launches again', () => {
    const shown = shownBuild(build, changelog);
    expect(entriesToShow(changelog, { shown, history: true }, build)).toEqual([]);
  });

  it('shows only what merged after the newest entry shown last time', () => {
    const shown = { build: '2.41.4+bbbbbbbbbbbb', newest: { commit: oldest.commit, time: oldest.time } };
    expect(entriesToShow(changelog, { shown, history: true }, build)).toEqual([newest, middle]);
  });

  it('shows nothing for a new build that merged nothing new, such as a board commit on main', () => {
    const shown = { build: '2.41.4+bbbbbbbbbbbb', newest: { commit: newest.commit, time: newest.time } };
    expect(entriesToShow(changelog, { shown, history: true }, build)).toEqual([]);
  });

  it('passes an entry this build no longer carries by time, so a downgrade shows nothing', () => {
    const later = { commit: 'gone', time: '2026-11-07T10:00:00+03:30' };
    expect(entriesToShow(changelog, { shown: { build: 'x', newest: later }, history: true }, build)).toEqual([]);
    const earlier = { commit: 'gone', time: '2026-11-05T12:00:00+03:30' };
    expect(entriesToShow(changelog, { shown: { build: 'x', newest: earlier }, history: true }, build)).toEqual([newest, middle]);
  });

  it('shows everything when the last build shown carried no entries at all', () => {
    expect(entriesToShow(changelog, { shown: { build: 'x', newest: null }, history: true }, build)).toEqual([newest, middle, oldest]);
  });
});

describe('byDate', () => {
  it('groups entries under the day each merged, keeping their order', () => {
    expect(byDate([newest, middle, oldest])).toEqual([
      { date: '2026-11-06', entries: [newest] },
      { date: '2026-11-05', entries: [middle, oldest] },
    ]);
  });
});

describe('parseShownBuild', () => {
  it('reads back what shownBuild wrote', () => {
    const shown = shownBuild(build, changelog);
    expect(parseShownBuild(JSON.parse(JSON.stringify(shown)))).toEqual(shown);
  });

  it('reads a record that is not one as none', () => {
    expect(parseShownBuild(null)).toBeNull();
    expect(parseShownBuild({ newest: null })).toBeNull();
    expect(parseShownBuild({ build, newest: { commit: 3 } })).toEqual({ build, newest: null });
  });
});
