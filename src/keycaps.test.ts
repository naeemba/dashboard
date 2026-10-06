import { describe, expect, it } from 'vitest';
import { keyParts } from './keycaps';

describe('keyParts', () => {
  it('splits a chord into its keys', () => {
    expect(keyParts('Ctrl+Shift+B')).toEqual([{ key: 'Ctrl' }, { key: 'Shift' }, { key: 'B' }]);
  });

  it('keeps a plus that is the key itself', () => {
    expect(keyParts('Ctrl++')).toEqual([{ key: 'Ctrl' }, { key: '+' }]);
    expect(keyParts('+')).toEqual([{ key: '+' }]);
  });

  it('puts the joiner of a run between its two ends', () => {
    expect(keyParts('Shift+1…Shift+9')).toEqual([
      { key: 'Shift' }, { key: '1' }, { joiner: '…' }, { key: 'Shift' }, { key: '9' },
    ]);
  });
});
