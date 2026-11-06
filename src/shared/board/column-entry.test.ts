import { describe, expect, it } from 'vitest';
import { BACKLOG_COLUMN, DONE_COLUMN, REVIEW_COLUMN, SHIP_COLUMN, TODO_COLUMN } from './board';
import { columnEntry, type MoveSource } from './column-entry';

const SOURCES: MoveSource[] = ['user', 'command', 'automatic'];
const COLUMNS = [BACKLOG_COLUMN, TODO_COLUMN, SHIP_COLUMN, 'Doing', REVIEW_COLUMN, DONE_COLUMN];

// Every column, source and setting, written out as the table it is.
function expected(column: string, source: MoveSource, autoLoop: boolean): string {
  if (column === SHIP_COLUMN) return 'ship';
  if (column === REVIEW_COLUMN) return source === 'automatic' && !autoLoop ? 'nothing' : 'review';
  return 'nothing';
}

describe('columnEntry', () => {
  for (const column of COLUMNS) {
    for (const source of SOURCES) {
      for (const autoLoop of [true, false]) {
        it(`${column}, ${source}, autoLoop ${autoLoop ? 'on' : 'off'}`, () => {
          expect(columnEntry({ column, source, autoLoop, projectBoard: true })).toBe(expected(column, source, autoLoop));
        });
      }
    }
  }

  it('starts nothing on a board that is not a project\'s own, whatever the column', () => {
    for (const column of COLUMNS) {
      for (const source of SOURCES) {
        expect(columnEntry({ column, source, autoLoop: true, projectBoard: false })).toBe('nothing');
      }
    }
  });

  it('matches a column written by hand in another case, as `board move` does', () => {
    expect(columnEntry({ column: 'ship', source: 'command', autoLoop: true, projectBoard: true })).toBe('ship');
    expect(columnEntry({ column: 'REVIEW', source: 'command', autoLoop: false, projectBoard: true })).toBe('review');
  });
});
