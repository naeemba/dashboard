import { describe, expect, it } from 'vitest';
import { drawsAsKeys, keyParts } from './keycaps';

describe('keyParts', () => {
  it('splits a chord into its keys', () => {
    expect(keyParts('Ctrl+Shift+B')).toEqual([{ key: 'Ctrl' }, { key: 'Shift' }, { key: 'B' }]);
  });

  it('puts the joiner of a run between its two ends', () => {
    expect(keyParts('Shift+1…Shift+9')).toEqual([
      { key: 'Shift' }, { key: '1' }, { joiner: '…' }, { key: 'Shift' }, { key: '9' },
    ]);
  });
});

describe('drawsAsKeys', () => {
  it('draws a binding, and a run of them, as keys', () => {
    expect(drawsAsKeys('Space')).toBe(true);
    expect(drawsAsKeys('Ctrl+Shift+B')).toBe(true);
    expect(drawsAsKeys('Shift+1…Shift+9')).toBe(true);
  });

  it('leaves a sentence about keys as text', () => {
    expect(drawsAsKeys('Everything else')).toBe(false);
    expect(drawsAsKeys('A letter, digit or symbol')).toBe(false);
  });
});
