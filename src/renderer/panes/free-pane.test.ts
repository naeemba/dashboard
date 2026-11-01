import { describe, expect, it } from 'vitest';
import { afterOpening, freePaneIndex, planSend, sendSummary, type ProjectPanes } from './free-pane';
import type { PaneUse } from '../../shared/panes/pane-reading';

// A shell sitting at its own prompt, which is what a pane nobody is using reads as.
const free: PaneUse = {
  index: 1, exited: false, foreground: 'zsh', shell: '/bin/zsh', command: undefined, inWorktree: false,
};
const busy: PaneUse = { ...free, foreground: 'npm' };
const dead: PaneUse = { ...free, exited: true };
// The agent has exited and handed the pane back, so nothing is running in it — but its shell is still
// standing in the card's checkout, which is why a pane of the project goes first.
const finished: PaneUse = { ...free, inWorktree: true };

// Workers in order from the first, the way main lists an unbroken run of them.
function workers(...panes: PaneUse[]): PaneUse[] {
  return panes.map((pane, offset) => ({ ...pane, index: offset + 1 }));
}

describe('freePaneIndex', () => {
  it('takes the first pane that is neither dead nor busy', () => {
    expect(freePaneIndex(workers(dead, busy, free, free))).toBe(3);
  });

  it('answers null when every pane is busy, so the project is skipped rather than interrupted', () => {
    expect(freePaneIndex(workers(busy, busy, dead))).toBe(null);
  });

  it('answers null for a project with no panes at all', () => {
    expect(freePaneIndex([])).toBe(null);
  });

  // The same order a ship takes a pane in, so a line sent to every project does not land in a finished
  // card's checkout while an empty prompt of the project itself sits below it.
  it('takes a pane still standing in a card\'s worktree last, the way a ship does', () => {
    expect(freePaneIndex(workers(finished, free))).toBe(2);
    expect(freePaneIndex(workers(finished, busy))).toBe(1);
    expect(freePaneIndex(workers(dead, finished, free))).toBe(3);
  });
});

const project = (name: string, panes: ProjectPanes['panes']): ProjectPanes => (
  { name, path: `/work/${name}`, missing: false, panes }
);

describe('planSend', () => {
  it('sends to one pane per project, and to a new worker in a project with none free', () => {
    const plan = planSend([
      project('web', workers(busy, free)),
      project('api', workers(busy, busy)),
      project('cli', workers(free)),
    ]);
    expect(plan.sends).toEqual([
      { path: '/work/web', paneIndex: 2 }, { path: '/work/api', paneIndex: null }, { path: '/work/cli', paneIndex: 1 },
    ]);
    expect(plan.skipped).toEqual([]);
    expect(plan.gone).toEqual([]);
  });

  // Every project opens with only its main session, which never takes a line.
  it('does not skip a project that has only its main session', () => {
    const main: PaneUse = { ...free, index: 0 };
    const plan = planSend([project('api', [main])]);
    expect(plan.sends).toEqual([{ path: '/work/api', paneIndex: null }]);
    expect(plan.skipped).toEqual([]);
    expect(plan.gone).toEqual([]);
  });

  it('keeps a project whose folder is gone out of the busy list, so it is not read as one to go and look at', () => {
    const plan = planSend([{ ...project('api', []), missing: true }, project('cli', workers(free))]);
    expect(plan.skipped).toEqual([]);
    expect(plan.gone).toEqual(['api']);
  });
});

describe('sendSummary', () => {
  it('counts the panes it reached', () => {
    const plan = { sends: [{ path: '/work/web', paneIndex: 0 }], skipped: [], gone: [] };
    expect(sendSummary(plan)).toBe('sent to 1 pane');
  });

  it('names every project it could not reach, so a project that got nothing does not read as one that printed nothing', () => {
    const plan = { sends: [{ path: '/work/web', paneIndex: 0 }], skipped: ['api', 'cli'], gone: [] };
    expect(sendSummary(plan)).toBe('sent to 1 pane · no new worker in api, cli');
  });

  it('says only what was missed when nothing was reached', () => {
    expect(sendSummary({ sends: [], skipped: ['api'], gone: [] })).toBe('no new worker in api');
  });

  it('says a gone project is gone rather than busy, and both reasons at once when both happened', () => {
    const plan = { sends: [], skipped: ['web'], gone: ['api', 'cli'] };
    expect(sendSummary(plan)).toBe('no new worker in web · api, cli are gone');
    expect(sendSummary({ sends: [], skipped: [], gone: ['api'] })).toBe('api is gone');
  });
});

describe('afterOpening', () => {
  it('takes a project whose worker could not be opened out of the sends and names it as skipped', () => {
    const plan = { sends: [{ path: '/work/api', paneIndex: null }, { path: '/work/web', paneIndex: 1 }], skipped: [], gone: ['cli'] };
    expect(afterOpening(plan, [{ path: '/work/api', name: 'api' }])).toEqual({
      sends: [{ path: '/work/web', paneIndex: 1 }], skipped: ['api'], gone: ['cli'],
    });
    expect(afterOpening(plan, [])).toEqual(plan);
  });
});
