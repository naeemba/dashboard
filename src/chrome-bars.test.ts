import { describe, expect, it } from 'vitest';
import { tabShape, type Tab } from './chrome-bars';

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
