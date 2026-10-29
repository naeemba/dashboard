import { describe, expect, it } from 'vitest';
import type { PaneConversation } from './claude-resume';
import { RESUME_GRACE_MS, resumeLedger } from './resume-ledger';
import type { SavedPage } from './session';

const ID = 'ccaaf965-c864-48db-8044-30bf27d93087';
const OTHER = '4a8480d2-4e1d-4dca-8cac-f7a8e29548a3';
const conversation = (session: string, directory = '/work/api'): PaneConversation => ({ session, directory });
const pages: SavedPage[] = [
  { path: '/work/api', mode: 'terminals', focused: 0, names: [], claude: [null, conversation(ID), null, null, null] },
];
const everywhere = (): boolean => true;
const LAUNCH = 1_000_000;

describe('resumeLedger', () => {
  it('hands a pane its saved session once, so a project reopened later in the run starts empty', () => {
    const ledger = resumeLedger(pages, everywhere);
    expect(ledger.take('/work/api', 1, '0:1', LAUNCH)).toEqual(conversation(ID));
    expect(ledger.take('/work/api', 1, '3:1', LAUNCH + 60_000)).toBeNull();
  });

  // What a launch opens workers for, so it names only what take would still hand out.
  it('says which panes are still owed a session, and stops once each is taken', () => {
    const ledger = resumeLedger([{ ...pages[0], claude: [null, conversation(ID), null, conversation(OTHER)] }], everywhere);
    expect(ledger.owed('/work/api')).toEqual([1, 3]);
    ledger.take('/work/api', 1, '0:1', LAUNCH);
    expect(ledger.owed('/work/api')).toEqual([3]);
    expect(ledger.owed('/work/web')).toEqual([]);
  });

  it('owes nothing for a session whose folder has gone', () => {
    expect(resumeLedger(pages, () => false).owed('/work/api')).toEqual([]);
  });

  it('resumes nothing in a pane that had no session, or a project it never saw', () => {
    const ledger = resumeLedger(pages, everywhere);
    expect(ledger.take('/work/api', 0, '0:0', LAUNCH)).toBeNull();
    expect(ledger.take('/work/web', 1, '1:1', LAUNCH)).toBeNull();
  });

  // The folder is gone, so nothing is resumed, and nothing is held for the pane either.
  it('neither resumes nor holds a session whose folder has gone', () => {
    const ledger = resumeLedger(pages, () => false);
    expect(ledger.take('/work/api', 1, '0:1', LAUNCH)).toBeNull();
    expect(ledger.held()).toEqual(new Map());
  });

  it('holds a resumed pane before any reading has come in', () => {
    const ledger = resumeLedger(pages, everywhere);
    ledger.take('/work/api', 1, '0:1', LAUNCH);
    expect(ledger.held()).toEqual(new Map([['0:1', conversation(ID)]]));
  });

  // The first sweep reads every log there is and can take longer than the grace. What it found was
  // found before the resumed Claude wrote its session file, so it must not count as "nothing there".
  it('holds a resumed pane for a reading taken inside the grace, however late it arrives', () => {
    const ledger = resumeLedger(pages, everywhere);
    ledger.take('/work/api', 1, '0:1', LAUNCH);
    ledger.place({ byPane: new Map(), takenAt: LAUNCH + RESUME_GRACE_MS - 1 });
    expect(ledger.held()).toEqual(new Map([['0:1', conversation(ID)]]));
  });

  // A Claude exited after the restart is not resumed on the launch after.
  it('answers with the reading alone once one is taken after the grace', () => {
    const ledger = resumeLedger(pages, everywhere);
    ledger.take('/work/api', 1, '0:1', LAUNCH);
    ledger.place({ byPane: new Map([['0:3', conversation(OTHER)]]), takenAt: LAUNCH + RESUME_GRACE_MS });
    expect(ledger.held()).toEqual(new Map([['0:3', conversation(OTHER)]]));
  });

  // A sweep that read the panes before Quit can finish after it, and must not put back what Quit's
  // own reading replaced: /clear then Quit would resume the conversation from before the /clear.
  it('keeps the newer reading when an older one arrives after it', () => {
    const ledger = resumeLedger([], everywhere);
    ledger.place({ byPane: new Map([['0:1', conversation(OTHER)]]), takenAt: LAUNCH + 90_000 });
    ledger.place({ byPane: new Map([['0:1', conversation(ID)]]), takenAt: LAUNCH + 60_000 });
    expect(ledger.held()).toEqual(new Map([['0:1', conversation(OTHER)]]));
  });

  // A project opened late in the run resumes its own panes; it must not put back a launch pane whose
  // Claude has been exited since, or the launch after brings back a conversation you closed.
  it('times each pane\'s grace from its own resume', () => {
    const ledger = resumeLedger([...pages, { ...pages[0], path: '/work/web', claude: [conversation(OTHER, '/work/web')] }], everywhere);
    ledger.take('/work/api', 1, '0:1', LAUNCH);
    ledger.place({ byPane: new Map(), takenAt: LAUNCH + RESUME_GRACE_MS });
    ledger.take('/work/web', 0, '1:0', LAUNCH + 600_000);
    ledger.place({ byPane: new Map(), takenAt: LAUNCH + 600_000 });
    expect(ledger.held()).toEqual(new Map([['1:0', conversation(OTHER, '/work/web')]]));
  });

  it('answers with the latest reading when nothing was resumed', () => {
    const ledger = resumeLedger(pages, everywhere);
    ledger.place({ byPane: new Map([['0:3', conversation(OTHER)]]), takenAt: LAUNCH });
    expect(ledger.held()).toEqual(new Map([['0:3', conversation(OTHER)]]));
  });
});
