import { describe, expect, it } from 'vitest';
import { isBoardChange } from './board-watch';

describe('isBoardChange', () => {
  it('is a change when the file holds something the app did not write', () => {
    expect(isBoardChange('board.json', '{"a":1}', '{"a":2}')).toBe(true);
  });

  it('is a change when the app has written nothing this run', () => {
    expect(isBoardChange('board.json', undefined, '{"a":1}')).toBe(true);
  });

  // Every keystroke on the board saves. Counting those would re-read and redraw the board out from
  // under the selection while you are moving a card.
  it('is not a change when the file holds exactly what the app last wrote', () => {
    expect(isBoardChange('board.json', '{"a":1}', '{"a":1}')).toBe(false);
  });

  // Written on every save, right before the rename that replaces board.json.
  it('ignores the temporary file the save goes through', () => {
    expect(isBoardChange('board.json.tmp', '{"a":1}', '{"a":2}')).toBe(false);
  });

  it('ignores the explanation files seeded beside the board', () => {
    expect(isBoardChange('CLAUDE.md', '{"a":1}', '{"a":2}')).toBe(false);
  });

  // Some platforms give no name at all. The bytes still decide, and they are the guard that counts.
  it('falls back to the bytes when the event does not say which file', () => {
    expect(isBoardChange(null, '{"a":1}', '{"a":2}')).toBe(true);
    expect(isBoardChange(null, '{"a":1}', '{"a":1}')).toBe(false);
  });

  it('is not a change when the file cannot be read', () => {
    expect(isBoardChange('board.json', '{"a":1}', null)).toBe(false);
  });
});
