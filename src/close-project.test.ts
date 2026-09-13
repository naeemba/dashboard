import { describe, expect, it } from 'vitest';
import { closeRefusal, runningPanes, type ClosingPane } from './close-project';

const pane = (name: string, use: Partial<ClosingPane> = {}): ClosingPane => (
  { name, exited: false, busy: false, ...use }
);

describe('runningPanes', () => {
  it('names the panes with something running in them', () => {
    expect(runningPanes([pane('terminal 1'), pane('terminal 2', { busy: true })])).toEqual(['terminal 2']);
  });

  it('lets a dead pane go: its shell is gone, so it is holding nothing open', () => {
    expect(runningPanes([pane('terminal 1', { exited: true, busy: true })])).toEqual([]);
  });

  it('holds nothing against a project whose folder went away, which has no panes at all', () => {
    expect(runningPanes([])).toEqual([]);
  });
});

describe('closeRefusal', () => {
  it('says nothing when every pane is idle, which is what lets the close go ahead', () => {
    expect(closeRefusal('web', [pane('terminal 1'), pane('nvim')])).toBe('');
  });

  it('names the project and every pane in the way', () => {
    expect(closeRefusal('web', [pane('terminal 2', { busy: true }), pane('nvim', { busy: true })]))
      .toBe('web is still running in terminal 2, nvim — stop it and close again');
  });
});
