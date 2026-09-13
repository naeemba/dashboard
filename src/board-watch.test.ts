import { describe, expect, it } from 'vitest';
import { isBoardChange, isBoardFile } from './board-watch';

describe('isBoardFile', () => {
  it('is the board', () => {
    expect(isBoardFile('board.json')).toBe(true);
  });

  // Written on every save, right before the rename that replaces board.json.
  it('is not the temporary file the save goes through', () => {
    expect(isBoardFile('board.json.tmp')).toBe(false);
  });

  it('is not the explanation files seeded beside the board', () => {
    expect(isBoardFile('CLAUDE.md')).toBe(false);
  });

  // Some platforms give no name at all. Then the bytes are the only guard left, and they are the one
  // that counts — so an unnamed event has to get as far as reading them.
  it('is the board when the event does not say which file', () => {
    expect(isBoardFile(null)).toBe(true);
  });
});

describe('isBoardChange', () => {
  it('is a change when the file holds something the app did not write', () => {
    expect(isBoardChange('{"a":1}', '{"a":2}')).toBe(true);
  });

  it('is a change when the app has written nothing this run', () => {
    expect(isBoardChange(undefined, '{"a":1}')).toBe(true);
  });

  // Every keystroke on the board saves. Counting those would re-read and redraw the board out from
  // under the selection while you are moving a card.
  it('is not a change when the file holds exactly what the app last wrote', () => {
    expect(isBoardChange('{"a":1}', '{"a":1}')).toBe(false);
  });

  it('is not a change when the file cannot be read', () => {
    expect(isBoardChange('{"a":1}', null)).toBe(false);
  });
});
