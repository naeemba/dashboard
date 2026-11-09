import { describe, expect, it } from 'vitest';
import { cardById, columnNamed, emptyBoard, type Board } from '../../../shared/board/board';
import { cardStart, startedBoard } from './start';

function boardWith(column: string, branch?: string): Board {
  const board = emptyBoard();
  board.columns[columnNamed(board, column)].cards.push({ id: 'card', title: 'Fix login', notes: '', priority: 'medium', parent: null, ...(branch && { branch }) });
  return board;
}

function columnOf(board: Board | null): string | undefined {
  return board?.columns.find((column) => column.cards.some((card) => card.id === 'card'))?.name;
}

describe('startedBoard', () => {
  it('puts a card from Ship or before into Doing with its branch', () => {
    for (const column of ['Backlog', 'Todo', 'Ship']) {
      const started = startedBoard(boardWith(column), 'card', 'fix-login');
      expect(columnOf(started)).toBe('Doing');
      expect(cardById(started!, 'card')?.branch).toBe('fix-login');
    }
  });

  it('leaves a card in Doing or past it where it is, and its own branch alone', () => {
    expect(startedBoard(boardWith('Doing', 'fix-login'), 'card', 'fix-login')).toBeNull();
    expect(startedBoard(boardWith('Review', 'fix-login'), 'card', 'fix-login')).toBeNull();
    const kept = startedBoard(boardWith('Ship', 'by-hand'), 'card', 'fix-login');
    expect(cardById(kept!, 'card')?.branch).toBe('by-hand');
    expect(columnOf(startedBoard(boardWith('Done'), 'card', 'fix-login'))).toBe('Done');
    expect(startedBoard(boardWith('Todo'), 'gone', 'fix-login')).toBeNull();
  });
});

describe('card.start', () => {
  it('writes the started board once, and refuses a start with no branch', async () => {
    const writes: Board[] = [];
    let board = boardWith('Ship');
    const ports = { read: () => ({ board, brokenFiles: [] }), write: (_projectPath: string, next: Board) => { board = next; writes.push(next); } };
    const input = { projectPath: '/work/api', id: 'card', branch: 'fix-login' };
    await expect(cardStart.run(ports, input)).resolves.toEqual({ output: 'card card is in Doing on fix-login' });
    await expect(cardStart.run(ports, input)).resolves.toEqual({ output: 'card card is already under way' });
    expect(writes).toHaveLength(1);
    expect(cardStart.input({ projectPath: '/work/api', id: 'card', branch: ' ' })).toEqual({ refused: 'a started card needs its branch' });
  });
});
