import { describe, expect, it } from 'vitest';
import type { Board } from '../../shared/board/board';
import { boardChanges } from './board-changes';
import type { LogDraft } from '../../shared/app/log-entry';

const card = { id: 'a', title: 'Fix login' } as never;
const inTodo: Board = { columns: [{ name: 'Todo', cards: [card] }, { name: 'Doing', cards: [] }] };
const inDoing: Board = { columns: [{ name: 'Todo', cards: [] }, { name: 'Doing', cards: [card] }] };

describe('boardChanges', () => {
  it('logs a move the app wrote, as a card entry', () => {
    const logged: LogDraft[] = [];
    const changes = boardChanges((draft) => logged.push(draft), () => null);
    changes.seen('/work/shop', inTodo);
    changes.wrote('/work/shop', inDoing, () => {});
    expect(logged).toEqual([{ level: 'info', kind: 'card', project: '/work/shop', message: '"Fix login" Todo → Doing' }]);
  });
  it('reads the file for the first write to a board it never saw', () => {
    const logged: LogDraft[] = [];
    const changes = boardChanges((draft) => logged.push(draft), () => inTodo);
    changes.wrote('/work/shop', inDoing, () => {});
    expect(logged).toHaveLength(1);
  });
  it('logs nothing and remembers nothing when the write throws', () => {
    const logged: LogDraft[] = [];
    const changes = boardChanges((draft) => logged.push(draft), () => null);
    changes.seen('/work/shop', inTodo);
    expect(() => changes.wrote('/work/shop', inDoing, () => { throw new Error('EACCES'); })).toThrow('EACCES');
    expect(logged).toEqual([]);
    // Still compared with the board on disk, so the move is logged once it finally lands.
    changes.wrote('/work/shop', inDoing, () => {});
    expect(logged).toHaveLength(1);
  });
  it('reads the file before the write, not after it', () => {
    const logged: LogDraft[] = [];
    let onDisk = inTodo;
    const changes = boardChanges((draft) => logged.push(draft), () => onDisk);
    changes.wrote('/work/shop', inDoing, () => { onDisk = inDoing; });
    expect(logged).toHaveLength(1);
  });
  it('logs a move the board command made, as a board entry', () => {
    const logged: LogDraft[] = [];
    let onDisk = inTodo;
    const changes = boardChanges((draft) => logged.push(draft), () => onDisk);
    changes.seen('/work/shop', inTodo);
    onDisk = inDoing;
    changes.changed('/work/shop');
    expect(logged).toEqual([{
      level: 'info', kind: 'board', project: '/work/shop', message: 'board command moved "Fix login" Todo → Doing',
    }]);
  });
  it('logs nothing for a change to a board it never saw, but remembers it', () => {
    const logged: LogDraft[] = [];
    let onDisk = inTodo;
    const changes = boardChanges((draft) => logged.push(draft), () => onDisk);
    changes.changed('/work/shop');
    onDisk = inDoing;
    changes.changed('/work/shop');
    expect(logged).toHaveLength(1);
  });
});
