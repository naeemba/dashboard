import { describe, expect, it } from 'vitest';
import { workingPanes, WORKING_FLOOR_MS } from './working-panes';

const PANE = 'terminal-0-3';

describe('workingPanes', () => {
  it('counts a pane the last report named as working', () => {
    const panes = workingPanes();
    panes.report([PANE], 1_000);
    expect(panes.works(PANE, 1_000)).toBe(true);
  });

  // The window that matters: the report is on a timer and Claude Code takes a moment more to draw its
  // first spinner, so an agent started between two reports is in none of them. Read as quiet, its
  // folder is removed out from under it seconds after it started.
  it('counts an agent nobody has reported yet as working', () => {
    const panes = workingPanes();
    panes.started(PANE, 1_000);
    expect(panes.works(PANE, 9_000)).toBe(true);
  });

  // One quiet report is not an answer either — a missed report looks the same, and so does an agent
  // that has stopped to ask you something and had its bell cleared by your looking at it.
  it('holds a pane through the floor after the last report that named it', () => {
    const panes = workingPanes();
    panes.report([PANE], 1_000);
    panes.report([], 6_000);
    expect(panes.works(PANE, 6_000)).toBe(true);
    expect(panes.works(PANE, 1_000 + WORKING_FLOOR_MS)).toBe(false);
  });

  it('says nothing works in a pane no agent was ever started in', () => {
    expect(workingPanes().works(PANE, 1_000)).toBe(false);
  });
});
