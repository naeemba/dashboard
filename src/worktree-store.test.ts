import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  claimsPane,
  entryForCard,
  entryForPath,
  livingEntries,
  readWorktrees,
  stillLiving,
  parseWorktrees,
  withEntry,
  withoutPanes,
  withoutWorktree,
  worktreesDiffer,
  writeWorktrees,
  type WorktreeEntry,
} from './worktree-store';

const entry: WorktreeEntry = {
  cardId: 'fc2bf7b0-1234-4321-8888-aaaaaaaaaaaa',
  title: 'Panes name themselves',
  projectPath: '/Users/sharp/workspace/personal/dashboard',
  branch: 'panes-name-themselves',
  worktreePath: '/Users/sharp/workspace/personal/dashboard.worktrees/panes-name-themselves',
  pane: 2,
  startedAt: '2026-09-10T09:14:22.104Z',
  reviewing: false,
};

// The file lives in the app's own folder, so a temporary one stands in for it.
function worktreesFile(): string {
  return join(mkdtempSync(join(tmpdir(), 'dashboard-worktrees-')), 'worktrees.json');
}

describe('readWorktrees', () => {
  it('reads back what was written', () => {
    const file = worktreesFile();
    writeWorktrees(file, [entry]);
    expect(readWorktrees(file)).toEqual({ entries: [entry], brokenFile: null });
  });

  // The first run on a machine, and every run before a card has been shipped. Nothing is recorded and
  // nothing is wrong.
  it('reads nothing when the file has never been written', () => {
    expect(readWorktrees(worktreesFile())).toEqual({ entries: [], brokenFile: null });
  });

  it('moves a damaged file aside, reads nothing, and says where it went', () => {
    const file = worktreesFile();
    writeFileSync(file, '{"entries": [');
    const read = readWorktrees(file);
    expect(read.entries).toEqual([]);
    expect(existsSync(file)).toBe(false);
    expect(read.brokenFile).not.toBeNull();
    expect(readFileSync(read.brokenFile ?? '', 'utf8')).toBe('{"entries": [');
  });

  // A folder stands in for every errno that is not ENOENT — EMFILE, EIO, EACCES — because it is the
  // only one a test can make on demand. What an empty list costs the launch is readWorktrees' to say.
  it('throws rather than reading nothing when the file cannot be read', () => {
    const file = worktreesFile();
    mkdirSync(file);
    expect(() => readWorktrees(file)).toThrow(/EISDIR/);
  });

  // A folder where the .broken file has to go: the only way to make the salvage rename fail on demand.
  it('throws when a damaged file cannot be moved aside', () => {
    const file = worktreesFile();
    writeFileSync(file, '{"entries": [');
    mkdirSync(`${file}.broken`);
    expect(() => readWorktrees(file)).toThrow();
  });
});

describe('writeWorktrees', () => {
  // The shape on disk, not the round trip above: parse and write would agree with each other just as
  // well after both had moved off `entries`, and every file an older build wrote would stop being
  // read. That the write leaves no .tmp behind is replaceFile's own promise, pinned in
  // board-store.test.ts.
  it('writes the entries under the key the file has always used', () => {
    const file = worktreesFile();
    writeWorktrees(file, [entry]);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ entries: [entry] });
  });

  // A ship whose branch, folder and agent are all already there must not fail over the one part of it
  // that can be done again.
  it('says nothing when the file cannot be written', () => {
    const file = worktreesFile();
    mkdirSync(file);
    expect(() => writeWorktrees(file, [entry])).not.toThrow();
  });
});

describe('parseWorktrees', () => {
  it('keeps an entry as it was written', () => {
    expect(parseWorktrees({ entries: [entry] })).toEqual([entry]);
  });

  // The flag is on disk for one reason: to outlive a restart. Round-tripping a `false` proves nothing —
  // every test here passes with the field read as `false` outright, and then a restart mid-review has
  // the sweep take the reviewer's own worktree away and start a second review on the card.
  it('keeps a record that was the review marked as one', () => {
    expect(parseWorktrees({ entries: [{ ...entry, reviewing: true }] })[0].reviewing).toBe(true);
  });

  // Every worktrees file written before the field existed. None of them is a review.
  it('reads a record with no reviewing field as not the review', () => {
    const written: Record<string, unknown> = { ...entry };
    delete written.reviewing;
    expect(parseWorktrees({ entries: [written] })[0].reviewing).toBe(false);
  });

  it('reads nothing out of a file that is not a record of worktrees', () => {
    expect(parseWorktrees(null)).toEqual([]);
    expect(parseWorktrees('[]')).toEqual([]);
    expect(parseWorktrees({})).toEqual([]);
    expect(parseWorktrees({ entries: 'no' })).toEqual([]);
  });

  // Every field but the pane names something that has to exist for the entry to mean anything. An
  // entry missing one of them cannot be shown, jumped to or removed, so it is dropped rather than
  // kept as a row that does nothing.
  it('drops an entry missing a field it cannot do without, and keeps the others', () => {
    const stored = { entries: [{ ...entry, worktreePath: '' }, entry, { cardId: 'x' }] };
    expect(parseWorktrees(stored)).toEqual([entry]);
  });

  // A worktree that was made but never got a pane is a real state: it is what the flow leaves behind
  // when every pane in the project has been typed into.
  it('keeps an entry with no pane', () => {
    expect(parseWorktrees({ entries: [{ ...entry, pane: null }] })[0].pane).toBe(null);
    expect(parseWorktrees({ entries: [{ ...entry, pane: 'two' }] })[0].pane).toBe(null);
    expect(parseWorktrees({ entries: [{ ...entry, pane: 1.5 }] })[0].pane).toBe(null);
  });
});

describe('entryForCard', () => {
  it('finds the entry a card is shipped under', () => {
    expect(entryForCard([entry], entry.cardId)).toBe(entry);
    expect(entryForCard([entry], 'nobody')).toBe(undefined);
  });
});

describe('entryForPath', () => {
  it('finds the entry a folder belongs to', () => {
    expect(entryForPath([entry], entry.worktreePath)).toBe(entry);
    expect(entryForPath([entry], '/nowhere')).toBe(undefined);
  });
});

describe('withEntry', () => {
  it('adds an entry that is not there', () => {
    expect(withEntry([], entry)).toEqual([entry]);
  });

  // Taking the pane happens after the worktree is recorded, so the second write replaces the first.
  it('replaces the entry for a card already recorded', () => {
    const withPane = { ...entry, pane: 4 };
    expect(withEntry([entry], withPane)).toEqual([withPane]);
  });
});

describe('withoutWorktree', () => {
  it('drops the entry for a worktree that has been removed', () => {
    expect(withoutWorktree([entry], entry.worktreePath)).toEqual([]);
    expect(withoutWorktree([entry], '/somewhere/else')).toEqual([entry]);
  });
});

describe('livingEntries', () => {
  // A worktree deleted by hand with `git worktree remove` must not leave a card marked in flight
  // forever, with nothing on screen able to clear it.
  it('drops entries whose folder has gone', () => {
    const gone = { ...entry, cardId: 'other', worktreePath: '/gone' };
    expect(livingEntries([entry, gone], (path) => path !== '/gone')).toEqual([entry]);
  });
});

describe('stillLiving', () => {
  // The five-second sweep landing in the gap `git worktree remove` leaves: git has already unlinked the
  // folder, and without this the record is called dead, its pane goes back to the project, and the kill
  // that follows the removal finds nothing — leaving the agent running in a folder that is gone.
  it('keeps a path a removal is part way through, whatever the disk says', () => {
    expect(stillLiving(new Set(['/gone']), () => false)('/gone')).toBe(true);
  });

  it('asks the disk about every other path', () => {
    const living = stillLiving(new Set(), (path) => path === '/here');
    expect(living('/here')).toBe(true);
    expect(living('/gone')).toBe(false);
  });
});

describe('withoutPanes', () => {
  // The launch: no shell outlives the app, so nothing this file says was in pane 2 is in pane 2 a
  // moment later.
  it('takes the pane off every entry when no project is named', () => {
    const other = { ...entry, cardId: 'other', projectPath: '/work/api', pane: 4 };
    expect(withoutPanes([entry, other])).toEqual([{ ...entry, pane: null }, { ...other, pane: null }]);
  });

  // Closing one project is the same event for that project's panes and nobody else's.
  it("leaves another project's entries alone when one is named", () => {
    const other = { ...entry, cardId: 'other', projectPath: '/work/api', pane: 4 };
    expect(withoutPanes([entry, other], entry.projectPath)).toEqual([{ ...entry, pane: null }, other]);
  });
});

describe('claimsPane', () => {
  const other: WorktreeEntry = {
    ...entry,
    cardId: 'aaaaaaaa-1234-4321-8888-bbbbbbbbbbbb',
    title: 'A card in another project',
    projectPath: '/Users/sharp/workspace/personal/api',
    branch: 'a-card-in-another-project',
    worktreePath: '/Users/sharp/workspace/personal/api.worktrees/a-card-in-another-project',
  };

  it('finds the other card holding that pane in that project', () => {
    expect(claimsPane([entry], entry.projectPath, 2, 'some-other-card')?.cardId).toBe(entry.cardId);
  });

  // Pane numbers are per project, so the same number in another project is another pane. Matching it
  // takes the branch off a pane whose agent is still running, two projects over.
  it('leaves the same pane number in another project alone', () => {
    expect(claimsPane([other], entry.projectPath, 2, 'some-other-card')).toBeUndefined();
  });

  it('is undefined for the card taking the pane itself', () => {
    expect(claimsPane([entry], entry.projectPath, 2, entry.cardId)).toBeUndefined();
  });
});

describe('withoutPanes', () => {
  // The shell that was reviewing is dead either way, so the flag describing it goes with the pane.
  it('takes the review mark off a record that gives up its pane', () => {
    expect(withoutPanes([{ ...entry, reviewing: true }])[0]).toMatchObject({ pane: null, reviewing: false });
  });
});

describe('worktreesDiffer', () => {
  const entry: WorktreeEntry = {
    cardId: 'card-1',
    title: 'Ship it',
    projectPath: '/projects/web',
    branch: 'ship-it',
    worktreePath: '/projects/web-ship-it',
    pane: 2,
    startedAt: '2026-09-14T00:00:00.000Z',
    reviewing: false,
  };

  // Closing a project asks every record of that project to give its pane up. One that shipped nothing
  // hands back what it was given, and nothing is written or redrawn for it.
  it('says no when a closing project had no record to give up', () => {
    expect(worktreesDiffer([entry], withoutPanes([entry], '/projects/api'))).toBe(false);
  });

  it('says yes when a record gives up its pane', () => {
    expect(worktreesDiffer([entry], withoutPanes([entry], '/projects/web'))).toBe(true);
  });

  // withEntry moves the card it rewrites to the end, so a re-record that changed nothing still says
  // yes. One redraw too many costs a frame; one too few leaves a card naming a worktree that is gone.
  it('says yes when a re-record only reorders the list', () => {
    const other: WorktreeEntry = { ...entry, cardId: 'card-2', worktreePath: '/projects/web-other' };
    expect(worktreesDiffer([entry, other], withEntry([entry, other], entry))).toBe(true);
  });
});
