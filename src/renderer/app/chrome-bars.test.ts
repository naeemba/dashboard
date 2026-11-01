import { describe, expect, it } from 'vitest';
import { showsAddPane, tabShape, type Tab } from './chrome-bars';

const tab = (name: string, marks: Partial<Tab> = {}): Tab =>
  ({ name, active: false, waiting: false, manager: false, ...marks });

describe('tabShape', () => {
  it('changes when two tabs swap places, so the buttons are rebuilt in the new order', () => {
    expect(tabShape([tab('web'), tab('api')])).not.toBe(tabShape([tab('api'), tab('web')]));
  });

  it('stays the same when only the marks change, so the buttons are kept', () => {
    expect(tabShape([tab('web'), tab('api')]))
      .toBe(tabShape([tab('web', { active: true }), tab('api', { waiting: true })]));
  });
});

describe('showsAddPane', () => {
  it('shows on a project\'s terminals view, where its workers are', () => {
    expect(showsAddPane('terminals', true)).toBe(true);
  });

  it('hides on any other view, and on a page with no worker list', () => {
    expect(showsAddPane('board', true)).toBe(false);
    expect(showsAddPane('terminals', false)).toBe(false);
  });
});
