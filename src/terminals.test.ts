import { describe, expect, it } from 'vitest';
import { EDITOR_INDEX, TERMINAL_COUNT, modeOfPane, neighbor, paneFromId, paneLabel, terminalId } from './terminals';

describe('neighbor', () => {
  it('moves along a row and stops at the edge', () => {
    expect(neighbor(0, 'right')).toBe(1);
    expect(neighbor(1, 'right')).toBe(1);
    expect(neighbor(3, 'left')).toBe(2);
    expect(neighbor(2, 'left')).toBe(2);
  });

  it('moves between rows by horizontal position', () => {
    expect(neighbor(0, 'down')).toBe(2);
    expect(neighbor(1, 'down')).toBe(4);
    expect(neighbor(2, 'up')).toBe(0);
    expect(neighbor(4, 'up')).toBe(1);
    expect(neighbor(0, 'up')).toBe(0);
    expect(neighbor(3, 'down')).toBe(3);
  });
});

describe('paneLabel', () => {
  it('names panes from one, the way the grid is read', () => {
    expect(paneLabel(0)).toBe('terminal 1');
    expect(paneLabel(4)).toBe('terminal 5');
  });
});

describe('paneFromId', () => {
  it('reads back what terminalId wrote', () => {
    expect(paneFromId(terminalId(3, 2))).toEqual({ slot: 3, index: 2 });
    expect(paneFromId(terminalId(12, 5))).toEqual({ slot: 12, index: 5 });
  });
});

describe('modeOfPane', () => {
  it('puts the grid on terminals and the editor on nvim', () => {
    expect(modeOfPane(0)).toBe('terminals');
    expect(modeOfPane(TERMINAL_COUNT - 1)).toBe('terminals');
    expect(modeOfPane(EDITOR_INDEX)).toBe('nvim');
  });
});
