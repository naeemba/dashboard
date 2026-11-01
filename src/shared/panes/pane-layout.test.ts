import { describe, expect, it } from 'vitest';
import { neighborPane, nextPaneIndex, paneAtPosition, stepPane } from './pane-layout';

// Main and three workers, one of which has closed: the numbers say which pane, not where it is drawn.
const open = [0, 1, 3, 4];

describe('paneAtPosition', () => {
  it('counts main first, then down the worker list', () => {
    expect(paneAtPosition(open, 0)).toBe(0);
    expect(paneAtPosition(open, 2)).toBe(3);
  });

  it('lands nowhere past the last worker', () => {
    expect(paneAtPosition(open, 4)).toBeUndefined();
  });
});

describe('stepPane', () => {
  it('walks the panes in drawn order, round the ends', () => {
    expect(stepPane(open, 1, 1)).toBe(3);
    expect(stepPane(open, 4, 1)).toBe(0);
    expect(stepPane(open, 0, -1)).toBe(4);
  });

  it('counts a pane that has gone from the top', () => {
    expect(stepPane(open, 2, 1)).toBe(1);
  });
});

describe('neighborPane', () => {
  it('crosses from main to the top worker and back', () => {
    expect(neighborPane(open, 0, 'right')).toBe(1);
    expect(neighborPane(open, 3, 'left')).toBe(0);
  });

  it('walks the worker list and stops at its ends', () => {
    expect(neighborPane(open, 1, 'down')).toBe(3);
    expect(neighborPane(open, 4, 'down')).toBe(4);
    expect(neighborPane(open, 1, 'up')).toBe(1);
  });

  it('keeps main where it is going up, down or further left', () => {
    expect(neighborPane(open, 0, 'down')).toBe(0);
    expect(neighborPane(open, 0, 'left')).toBe(0);
  });

  it('stays on main when there are no workers to cross to', () => {
    expect(neighborPane([0], 0, 'right')).toBe(0);
  });
});

describe('nextPaneIndex', () => {
  it('reuses the lowest number a closed worker left', () => {
    expect(nextPaneIndex(open)).toBe(2);
  });

  it('never hands out main', () => {
    expect(nextPaneIndex([])).toBe(1);
    expect(nextPaneIndex([0])).toBe(1);
  });
});
