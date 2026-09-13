import { describe, expect, it } from 'vitest';
import { freePaneIndex, planSend, sendSummary, type ProjectPanes } from './free-pane';

const free = { exited: false, busy: false };
const busy = { exited: false, busy: true };
const dead = { exited: true, busy: false };

describe('freePaneIndex', () => {
  it('takes the first pane that is neither dead nor mid-run', () => {
    expect(freePaneIndex([dead, busy, free, free])).toBe(2);
  });

  it('answers -1 when every pane is busy, so the project is skipped rather than interrupted', () => {
    expect(freePaneIndex([busy, busy, dead])).toBe(-1);
  });

  it('answers -1 for a project with no panes at all', () => {
    expect(freePaneIndex([])).toBe(-1);
  });
});

const project = (name: string, panes: ProjectPanes['panes']): ProjectPanes => (
  { name, path: `/work/${name}`, panes }
);

describe('planSend', () => {
  it('sends to one pane per project and names the projects with none', () => {
    const plan = planSend([
      project('web', [busy, free]),
      project('api', [busy, busy]),
      project('cli', [free]),
    ]);
    expect(plan.sends).toEqual([{ path: '/work/web', pane: 1 }, { path: '/work/cli', pane: 0 }]);
    expect(plan.skipped).toEqual(['api']);
  });
});

describe('sendSummary', () => {
  it('counts the panes it reached', () => {
    expect(sendSummary({ sends: [{ path: '/work/web', pane: 0 }], skipped: [] })).toBe('sent to 1 pane');
  });

  it('names every project it could not reach, so a project that got nothing does not read as one that printed nothing', () => {
    const plan = { sends: [{ path: '/work/web', pane: 0 }], skipped: ['api', 'cli'] };
    expect(sendSummary(plan)).toBe('sent to 1 pane · no free pane in api, cli');
  });

  it('says only what was missed when nothing was reached', () => {
    expect(sendSummary({ sends: [], skipped: ['api'] })).toBe('no free pane in api');
  });
});
