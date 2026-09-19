import { describe, expect, it } from 'vitest';
import { freePaneIndex, planSend, sendSummary, type PaneUse, type ProjectPanes } from './free-pane';

// A shell sitting at its own prompt, which is what a pane nobody is using reads as.
const free: PaneUse = {
  exited: false, foreground: 'zsh', shell: '/bin/zsh', command: undefined, inWorktree: false,
};
const busy: PaneUse = { ...free, foreground: 'npm' };
const dead: PaneUse = { ...free, exited: true };
// The agent has exited and handed the pane back, so nothing is running in it — but its shell is still
// standing in the card's checkout, which is why a pane of the project goes first.
const finished: PaneUse = { ...free, inWorktree: true };

describe('freePaneIndex', () => {
  it('takes the first pane that is neither dead nor busy', () => {
    expect(freePaneIndex([dead, busy, free, free])).toBe(2);
  });

  it('answers null when every pane is busy, so the project is skipped rather than interrupted', () => {
    expect(freePaneIndex([busy, busy, dead])).toBe(null);
  });

  it('answers null for a project with no panes at all', () => {
    expect(freePaneIndex([])).toBe(null);
  });

  // The same order a ship takes a pane in, so a line sent to every project does not land in a finished
  // card's checkout while an empty prompt of the project itself sits below it.
  it('takes a pane still standing in a card\'s worktree last, the way a ship does', () => {
    expect(freePaneIndex([finished, free])).toBe(1);
    expect(freePaneIndex([finished, busy])).toBe(0);
  });
});

const project = (name: string, panes: ProjectPanes['panes']): ProjectPanes => (
  { name, path: `/work/${name}`, missing: false, panes }
);

describe('planSend', () => {
  it('sends to one pane per project and names the projects with none', () => {
    const plan = planSend([
      project('web', [busy, free]),
      project('api', [busy, busy]),
      project('cli', [free]),
    ]);
    expect(plan.sends).toEqual([
      { path: '/work/web', paneIndex: 1 }, { path: '/work/cli', paneIndex: 0 },
    ]);
    expect(plan.skipped).toEqual(['api']);
    expect(plan.gone).toEqual([]);
  });

  it('keeps a project whose folder is gone out of the busy list, so it is not read as one to go and look at', () => {
    const plan = planSend([{ ...project('api', []), missing: true }, project('cli', [free])]);
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
    expect(sendSummary(plan)).toBe('sent to 1 pane · no free pane in api, cli');
  });

  it('says only what was missed when nothing was reached', () => {
    expect(sendSummary({ sends: [], skipped: ['api'], gone: [] })).toBe('no free pane in api');
  });

  it('says a gone project is gone rather than busy, and both reasons at once when both happened', () => {
    const plan = { sends: [], skipped: ['web'], gone: ['api', 'cli'] };
    expect(sendSummary(plan)).toBe('no free pane in web · api, cli are gone');
    expect(sendSummary({ sends: [], skipped: [], gone: ['api'] })).toBe('api is gone');
  });
});
