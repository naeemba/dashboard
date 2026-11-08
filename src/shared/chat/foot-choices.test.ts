import { describe, expect, it } from 'vitest';
import { effortRows } from './chat-commands';
import { openingRow } from '../app/fuzzy';
import { footModeRows, footModelRows, footSetting } from './foot-choices';

describe('footSetting', () => {
  it('names the sheet by the piece clicked, and nothing for the rest of the foot', () => {
    expect(footSetting(['chat-foot-model'])).toBe('model');
    expect(footSetting(['chat-foot-mode'])).toBe('mode');
    expect(footSetting(['chat-foot-effort', 'ultrathink'])).toBe('effort');
    expect(footSetting(['chat-foot-state'])).toBeNull();
  });
});

describe('the foot sheets', () => {
  it('list the models the key walks, the one on marked, and open on it', () => {
    const rows = footModelRows('sonnet', '');
    expect(rows.map((row) => row.name)).toEqual(['default', 'opus', '● sonnet', 'haiku']);
    expect(openingRow(rows, 'sonnet')).toBe(2);
  });

  it('list the modes the key walks, auto included, and open on the one on', () => {
    const rows = footModeRows('auto', '');
    expect(rows.map((row) => row.choice)).toEqual(['default', 'acceptEdits', 'plan', 'auto']);
    expect(openingRow(rows, 'auto')).toBe(3);
  });

  it('open on the top row when what is on is not listed', () => {
    expect(openingRow(footModelRows('claude-opus-5-5', ''), 'claude-opus-5-5')).toBe(0);
    expect(openingRow(footModeRows('bypassPermissions', ''), 'bypassPermissions')).toBe(0);
    expect(openingRow(effortRows(undefined, ''), undefined)).toBe(0);
  });

  it('open the effort sheet on the level picked', () => {
    expect(openingRow(effortRows('high', ''), 'high')).toBe(3);
  });
});
