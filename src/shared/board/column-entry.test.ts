import { describe, expect, it } from 'vitest';
import { BACKLOG_COLUMN, DONE_COLUMN, REVIEW_COLUMN, SHIP_COLUMN, TODO_COLUMN } from './board';
import { MANAGER_PROJECT } from '../manager/manager';
import { columnEntry, MOVE_SOURCES, screenMoveEntry, type ColumnEntry, type MoveSource } from './column-entry';

// The table written out, one row per column, source and setting, so a wrong rule fails here rather
// than being computed the same wrong way twice.
const ROWS: [string, MoveSource, boolean, ColumnEntry][] = [
  [SHIP_COLUMN, 'user', true, 'ship'],
  [SHIP_COLUMN, 'user', false, 'ship'],
  [SHIP_COLUMN, 'command', true, 'ship'],
  [SHIP_COLUMN, 'command', false, 'ship'],
  [SHIP_COLUMN, 'automatic', true, 'ship'],
  [SHIP_COLUMN, 'automatic', false, 'ship'],
  [REVIEW_COLUMN, 'user', true, 'review'],
  [REVIEW_COLUMN, 'user', false, 'review'],
  [REVIEW_COLUMN, 'command', true, 'review'],
  [REVIEW_COLUMN, 'command', false, 'review'],
  [REVIEW_COLUMN, 'automatic', true, 'review'],
  [REVIEW_COLUMN, 'automatic', false, 'nothing'],
];
const QUIET_COLUMNS = [BACKLOG_COLUMN, TODO_COLUMN, 'Doing', DONE_COLUMN];

describe('columnEntry', () => {
  for (const [column, source, autoLoop, entry] of ROWS) {
    it(`${column}, ${source}, autoLoop ${autoLoop ? 'on' : 'off'}: ${entry}`, () => {
      expect(columnEntry({ column, source, autoLoop, projectBoard: true })).toBe(entry);
    });
  }

  it('starts nothing entering any other column', () => {
    for (const column of QUIET_COLUMNS) {
      for (const source of MOVE_SOURCES) {
        for (const autoLoop of [true, false]) {
          expect(columnEntry({ column, source, autoLoop, projectBoard: true })).toBe('nothing');
        }
      }
    }
  });

  it('starts nothing on a board that is not a project\'s own, whatever the column', () => {
    for (const column of [SHIP_COLUMN, REVIEW_COLUMN, ...QUIET_COLUMNS]) {
      for (const source of MOVE_SOURCES) {
        expect(columnEntry({ column, source, autoLoop: true, projectBoard: false })).toBe('nothing');
      }
    }
  });

  it('matches a column written by hand in another case, as `board move` does', () => {
    expect(columnEntry({ column: 'ship', source: 'command', autoLoop: true, projectBoard: true })).toBe('ship');
    expect(columnEntry({ column: 'REVIEW', source: 'command', autoLoop: false, projectBoard: true })).toBe('review');
  });
});

describe('screenMoveEntry', () => {
  it('asks about a step right or a drop into Ship and Review', () => {
    expect(screenMoveEntry('/work/api', SHIP_COLUMN, 1, 2, 'right')).toBe('ship');
    expect(screenMoveEntry('/work/api', SHIP_COLUMN, 3, 2, 'drop')).toBe('ship');
    expect(screenMoveEntry('/work/api', REVIEW_COLUMN, 3, 4, 'right')).toBe('review');
  });

  it('asks nothing for a step left, so walking a card back past Ship or Review starts nothing', () => {
    expect(screenMoveEntry('/work/api', SHIP_COLUMN, 3, 2, 'left')).toBe('nothing');
    expect(screenMoveEntry('/work/api', REVIEW_COLUMN, 5, 4, 'left')).toBe('nothing');
  });

  it('asks nothing for a card that stayed in its column', () => {
    expect(screenMoveEntry('/work/api', SHIP_COLUMN, 2, 2, 'up')).toBe('nothing');
    expect(screenMoveEntry('/work/api', SHIP_COLUMN, 2, 2, 'right')).toBe('nothing');
    expect(screenMoveEntry('/work/api', SHIP_COLUMN, 2, 2, 'drop')).toBe('nothing');
  });

  it('asks nothing for another column or on the manager\'s board', () => {
    expect(screenMoveEntry('/work/api', 'Doing', 2, 3, 'right')).toBe('nothing');
    expect(screenMoveEntry(MANAGER_PROJECT.path, SHIP_COLUMN, 1, 2, 'right')).toBe('nothing');
  });
});
