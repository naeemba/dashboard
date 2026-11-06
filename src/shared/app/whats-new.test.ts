import { describe, expect, it } from 'vitest';
import {
  byDate, entriesToShow, parseShownRecord, recordMovesForward, shownRecord, whatsNewFooter, type Changelog, type ChangelogEntry,
} from './whats-new';

function entry(pullRequest: number, time: string): ChangelogEntry {
  return { commit: `commit${pullRequest}`, time, pullRequest, title: `Pull request ${pullRequest}` };
}

const newest = entry(3, '2026-11-06T12:00:00+03:30');
const middle = entry(2, '2026-11-05T18:00:00+03:30');
const oldest = entry(1, '2026-11-05T09:00:00+03:30');
const changelog: Changelog = { repository: 'owner/name', release: null, entries: [newest, middle, oldest] };

describe('entriesToShow', () => {
  it('shows nothing on the very first install, so the app only remembers the build', () => {
    expect(entriesToShow(changelog, { shown: null, history: false })).toEqual([]);
  });

  it('shows everything when the app was used before any build kept a record', () => {
    expect(entriesToShow(changelog, { shown: null, history: true })).toEqual([newest, middle, oldest]);
  });

  it('shows nothing when the same build, or one that merged nothing new, launches again', () => {
    expect(entriesToShow(changelog, { shown: shownRecord(changelog), history: true })).toEqual([]);
  });

  it('shows only what merged after the newest entry shown last time', () => {
    const shown = { newest: { commit: oldest.commit, time: oldest.time } };
    expect(entriesToShow(changelog, { shown, history: true })).toEqual([newest, middle]);
  });

  it('passes an entry this build no longer carries by time, so a downgrade shows nothing', () => {
    const later = { commit: 'gone', time: '2026-11-07T10:00:00+03:30' };
    expect(entriesToShow(changelog, { shown: { newest: later }, history: true })).toEqual([]);
    const earlier = { commit: 'gone', time: '2026-11-05T12:00:00+03:30' };
    expect(entriesToShow(changelog, { shown: { newest: earlier }, history: true })).toEqual([newest, middle]);
  });

  it('shows everything when the last build shown carried no entries at all', () => {
    expect(entriesToShow(changelog, { shown: { newest: null }, history: true })).toEqual([newest, middle, oldest]);
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

describe('parseShownRecord', () => {
  it('reads back what shownRecord wrote', () => {
    const shown = shownRecord(changelog);
    expect(parseShownRecord(JSON.parse(JSON.stringify(shown)))).toEqual(shown);
    expect(parseShownRecord({ newest: null })).toEqual({ newest: null });
  });

  it('reads a record that is not one as none', () => {
    expect(parseShownRecord(null)).toBeNull();
    expect(parseShownRecord({})).toBeNull();
    expect(parseShownRecord({ newest: { commit: 3 } })).toBeNull();
    expect(parseShownRecord({ newest: { commit: 'abc', time: '' } })).toBeNull();
  });
});

describe('recordMovesForward', () => {
  const newer = shownRecord(changelog);
  const older = { newest: { commit: oldest.commit, time: oldest.time } };

  it('writes a first record, and a newer build over an older one', () => {
    expect(recordMovesForward(null, newer)).toBe(true);
    expect(recordMovesForward(older, newer)).toBe(true);
    expect(recordMovesForward({ newest: null }, newer)).toBe(true);
  });

  it('leaves the record alone for the same build again, and for an older build over a newer record', () => {
    expect(recordMovesForward(newer, newer)).toBe(false);
    expect(recordMovesForward(newer, older)).toBe(false);
    expect(recordMovesForward(newer, { newest: null })).toBe(false);
    expect(recordMovesForward({ newest: null }, { newest: null })).toBe(false);
  });
});

describe('whatsNewFooter', () => {
  it('says Enter links only when there are rows and a GitHub origin', () => {
    expect(whatsNewFooter(0, 'owner/name')).toMatch(/^No merged pull requests/);
    expect(whatsNewFooter(3, 'owner/name')).toMatch(/^Enter opens/);
    expect(whatsNewFooter(3, null)).toMatch(/no GitHub origin/);
  });
});
