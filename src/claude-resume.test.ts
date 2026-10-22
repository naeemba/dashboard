import { describe, expect, it } from 'vitest';
import {
  RESUME_GRACE_MS, heldSlots, isClaudeSlot, resumable, resumeLine, withClaude, type ClaudeSlot,
} from './claude-resume';

const ID = 'ccaaf965-c864-48db-8044-30bf27d93087';
const OTHER = '4a8480d2-4e1d-4dca-8cac-f7a8e29548a3';
const slot = (session: string, directory = '/work/api'): ClaudeSlot => ({ session, directory });

describe('isClaudeSlot', () => {
  it('keeps a session id and the folder it ran in', () => {
    expect(isClaudeSlot(slot(ID))).toBe(true);
  });

  // The id is typed into a shell, so anything but a UUID is a command waiting to run.
  it('refuses an id that is not a UUID', () => {
    expect(isClaudeSlot(slot(`${ID}; rm -rf ~`))).toBe(false);
    expect(isClaudeSlot(slot('a'))).toBe(false);
  });

  it('refuses a slot with no folder, or no slot at all', () => {
    expect(isClaudeSlot(slot(ID, ''))).toBe(false);
    expect(isClaudeSlot({ session: ID })).toBe(false);
    expect(isClaudeSlot(null)).toBe(false);
    expect(isClaudeSlot(7)).toBe(false);
  });
});

describe('heldSlots', () => {
  const resumed = new Map([['0:1', slot(ID)], ['0:3', slot(OTHER)]]);

  // A resumed Claude has not written its session file yet when the first sweep runs, and a crash then
  // must not cost the next launch every pane.
  it('keeps a resumed pane until the grace runs out, with a live reading winning', () => {
    const live = new Map([['0:3', slot(ID, '/work/api-tree')]]);
    expect(heldSlots(live, resumed, RESUME_GRACE_MS - 1))
      .toEqual(new Map([['0:1', slot(ID)], ['0:3', slot(ID, '/work/api-tree')]]));
  });

  // A Claude exited after the restart must not come back on the launch after.
  it('answers with the live reading alone once the grace is over', () => {
    const live = new Map([['0:3', slot(OTHER)]]);
    expect(heldSlots(live, resumed, RESUME_GRACE_MS)).toEqual(live);
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
    const held = new Map([['0:1', slot(ID)], ['2:4', slot(OTHER, '/work/web')]]);
    expect(withClaude(layout, slotOf, held)).toEqual({
      activeIndex: 1,
      pages: [
        { ...layout.pages[0], claude: [null, slot(ID), null, null, null] },
        { ...layout.pages[1], claude: [null, null, null, null, slot(OTHER, '/work/web')] },
      ],
    });
  });

  // The live reading carries the pid; only the two fields a resume needs are written.
  it('writes only the session and the folder', () => {
    const held = new Map([['0:0', { pid: 900, ...slot(ID) }]]);
    expect(withClaude(layout, slotOf, held).pages[0].claude[0]).toEqual(slot(ID));
  });

  it('gives a page whose project has no slot no sessions rather than throwing', () => {
    expect(withClaude(layout, () => -1, new Map()).pages[0].claude).toEqual([]);
  });
});

describe('resumable', () => {
  it('resumes only a slot whose folder is still there', () => {
    expect(resumable(slot(ID), () => true)).toBe(true);
    expect(resumable(slot(ID), () => false)).toBe(false);
    expect(resumable(null, () => true)).toBe(false);
    expect(resumable(undefined, () => true)).toBe(false);
  });
});

describe('resumeLine', () => {
  it('types the resume and presses Enter', () => {
    expect(resumeLine(slot(ID))).toBe(`claude --resume ${ID}\r`);
  });
});
