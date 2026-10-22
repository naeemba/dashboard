import { describe, expect, it } from 'vitest';
import {
  agentToResume, isPaneConversation, resumable, resumeLine, sessionToWrite, withClaude, type PaneConversation,
} from './claude-resume';
import type { WorktreeEntry } from './worktree-store';

const ID = 'ccaaf965-c864-48db-8044-30bf27d93087';
const OTHER = '4a8480d2-4e1d-4dca-8cac-f7a8e29548a3';
const conversation = (session: string, directory = '/work/api'): PaneConversation => ({ session, directory });

describe('isPaneConversation', () => {
  it('keeps a session id and the folder it ran in', () => {
    expect(isPaneConversation(conversation(ID))).toBe(true);
  });

  // The id is typed into a shell, so anything but a UUID is a command waiting to run.
  it('refuses an id that is not a UUID', () => {
    expect(isPaneConversation(conversation(`${ID}; rm -rf ~`))).toBe(false);
    expect(isPaneConversation(conversation('a'))).toBe(false);
  });

  it('refuses a conversation with no folder, or nothing at all', () => {
    expect(isPaneConversation(conversation(ID, ''))).toBe(false);
    expect(isPaneConversation({ session: ID })).toBe(false);
    expect(isPaneConversation(null)).toBe(false);
    expect(isPaneConversation(7)).toBe(false);
  });
});

describe('withClaude', () => {
  const layout = {
    activeIndex: 1,
    pages: [
      { path: '/work/api', mode: 'terminals' as const, focused: 0, names: [] },
      { path: '/work/web', mode: 'board' as const, focused: 2, names: ['dev'] },
    ],
  };
  const slots: Record<string, number> = { '/work/api': 0, '/work/web': 2 };
  const slotOf = (projectPath: string): number => slots[projectPath] ?? -1;

  it('puts each pane\'s session on its page by slot, one entry per grid pane', () => {
    const held = new Map([['0:1', conversation(ID)], ['2:4', conversation(OTHER, '/work/web')]]);
    expect(withClaude(layout, slotOf, held)).toEqual({
      activeIndex: 1,
      pages: [
        { ...layout.pages[0], claude: [null, conversation(ID), null, null, null] },
        { ...layout.pages[1], claude: [null, null, null, null, conversation(OTHER, '/work/web')] },
      ],
    });
  });

  // The live reading carries the pid; only the two fields a resume needs are written.
  it('writes only the session and the folder', () => {
    const held = new Map([['0:0', { pid: 900, ...conversation(ID) }]]);
    expect(withClaude(layout, slotOf, held).pages[0].claude[0]).toEqual(conversation(ID));
  });

  it('gives a page whose project has no slot no sessions rather than throwing', () => {
    expect(withClaude(layout, () => -1, new Map()).pages[0].claude).toEqual([]);
  });
});

describe('sessionToWrite', () => {
  const layout = { activeIndex: 0, pages: [{ path: '/work/api', mode: 'terminals' as const, focused: 0, names: [] }] };
  const slotOf = (): number => 0;
  const held = new Map([['0:1', conversation(ID)]]);

  // The first sweep can run before the renderer has sent anything: writing then would save no pages,
  // and a crash during startup would come back to an empty window.
  it('writes nothing before the renderer has sent a layout', () => {
    expect(sessionToWrite(null, slotOf, held, '')).toBeNull();
  });

  it('writes nothing when the file would say what the last write said', () => {
    const first = sessionToWrite(layout, slotOf, held, '');
    expect(first?.session).toEqual(withClaude(layout, slotOf, held));
    expect(sessionToWrite(layout, slotOf, held, first?.encoded ?? '')).toBeNull();
  });
});

describe('agentToResume', () => {
  const card: WorktreeEntry = {
    cardId: 'c1', title: 'Fix login', projectPath: '/work/api', branch: 'fix-login',
    worktreePath: '/work/api.worktrees/fix-login', pane: null, startedAt: '2026-10-22', reviewing: false,
  };
  const asGiven = (path: string): string => path;
  const inWorktree = conversation(ID, '/work/api.worktrees/fix-login');

  it('names the card whose worktree the conversation ran in', () => {
    expect(agentToResume([card], inWorktree, '/work/api', asGiven)).toBe(card);
  });

  it('types any other conversation into a shell', () => {
    expect(agentToResume([card], conversation(ID), '/work/api', asGiven)).toBeUndefined();
  });

  // A Claude started by hand in another project's pane, after a `cd` into the worktree: the record's
  // pane counts in the card's own project, so naming it there would point at a plain shell.
  it('leaves a conversation in another project\'s pane a shell', () => {
    expect(agentToResume([card], inWorktree, '/work/web', asGiven)).toBeUndefined();
  });

  // A second Claude in the worktree must not come back as the agent too, or the record names the wrong
  // pane and exiting the one started by hand leaves a dead pane.
  it('leaves a second pane in the worktree a shell once the card has its pane', () => {
    expect(agentToResume([{ ...card, pane: 2 }], inWorktree, '/work/api', asGiven)).toBeUndefined();
  });

  // The project was opened through a symlink, and Claude Code recorded the folder it really is.
  it('matches the worktree through its real path', () => {
    const real = (path: string): string => path.replace('/work/', '/mnt/data/');
    const recorded = conversation(ID, '/mnt/data/api.worktrees/fix-login');
    expect(agentToResume([card], recorded, '/work/api', real)).toBe(card);
  });
});

describe('resumable', () => {
  it('resumes only a conversation whose folder is still there', () => {
    expect(resumable(conversation(ID), () => true)).toBe(true);
    expect(resumable(conversation(ID), () => false)).toBe(false);
    expect(resumable(null, () => true)).toBe(false);
    expect(resumable(undefined, () => true)).toBe(false);
  });
});

describe('resumeLine', () => {
  it('types the resume and presses Enter', () => {
    expect(resumeLine(conversation(ID))).toBe(`claude --resume ${ID}\r`);
  });
});

