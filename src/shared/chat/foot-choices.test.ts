import { describe, expect, it } from 'vitest';
import { footModeRows, footSetting } from './foot-choices';

describe('footSetting', () => {
  it('names the sheet by the piece clicked, and nothing for the rest of the foot', () => {
    expect(footSetting(['chat-foot-model'])).toBe('model');
    expect(footSetting(['chat-foot-mode'])).toBe('mode');
    expect(footSetting(['chat-foot-effort', 'ultrathink'])).toBe('effort');
    expect(footSetting(['chat-foot-state'])).toBeNull();
  });
});

describe('footModeRows', () => {
  it('lists the modes the edits key walks, auto included, and marks only the one on', () => {
    const rows = footModeRows('auto', '');
    expect(rows.map((row) => row.choice)).toEqual(['default', 'acceptEdits', 'plan', 'auto']);
    expect(rows.filter((row) => row.name.startsWith('●')).map((row) => row.name)).toEqual(['● auto mode']);
  });

  it('narrows by label as you type', () => {
    expect(footModeRows('auto', 'plan').map((row) => row.choice)).toEqual(['plan']);
  });
});
