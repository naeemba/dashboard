import { describe, expect, it } from 'vitest';
import { cardById, columnNamed, emptyBoard, type Board, type Card } from '../../../shared/board/board';
import type { PullRequest } from '../../board/pull-request-column';
import { cardFollow, type CardFollowPorts } from './follow';
import type { CardMoveInput } from './move';

function boardWith(column: string, fields: Partial<Card> = {}): Board {
  const board = emptyBoard();
  board.columns[columnNamed(board, column)].cards.push({ id: 'card', title: 'Fix login', notes: '', priority: 'medium', parent: null, ...fields });
  return board;
}

const OPEN: PullRequest = { number: 12, state: 'OPEN', title: 'Fix the login race', url: 'https://github.com/o/r/pull/12' };

function fakePorts(start: Board, over: Partial<CardFollowPorts> = {}) {
  const seen = { asked: [] as string[], moves: [] as CardMoveInput[] };
  let board = start;
  const ports: CardFollowPorts = {
    read: () => ({ board, brokenFiles: [] }),
    worktreeBranch: () => undefined,
    pullRequestOf: async (_projectPath, branch) => { seen.asked.push(branch); return OPEN; },
    write: (_projectPath, next) => { board = next; },
    move: async (input) => { seen.moves.push(input); return { output: `moved to ${input.column}`, ran: 'nothing', started: '' }; },
    now: () => Date.parse('2026-11-09T12:00:00Z'),
    ...over,
  };
  return { ports, seen, board: () => board };
}

const input = { projectPath: '/work/api', id: 'card' };

describe('card.follow', () => {
  it('records the pull request and moves the card through card.move as the app', async () => {
    const { ports, seen, board } = fakePorts(boardWith('Doing', { branch: 'fix-login' }));
    await expect(cardFollow.run(ports, input)).resolves.toEqual({ output: 'moved to Review' });
    expect(seen.moves).toEqual([{ projectPath: '/work/api', id: 'card', column: 'Review', source: 'automatic' }]);
    expect(cardById(board(), 'card')?.pullRequest).toBe(12);
  });

  it('lands on the board as it is after gh answers, keeping a change made meanwhile', async () => {
    const fake = fakePorts(boardWith('Doing', { branch: 'fix-login' }), {
      pullRequestOf: async () => {
        fake.ports.write('/work/api', boardWith('Doing', { branch: 'fix-login', notes: 'edited during gh' }));
        return OPEN;
      },
    });
    await cardFollow.run(fake.ports, input);
    expect(cardById(fake.board(), 'card')).toMatchObject({ notes: 'edited during gh', pullRequest: 12 });
  });

  it('finds the branch on the worktree record for a card that has none', async () => {
    const { ports, seen } = fakePorts(boardWith('Doing'), { worktreeBranch: () => 'from-the-record' });
    await cardFollow.run(ports, input);
    expect(seen.asked).toEqual(['from-the-record']);
  });

  it('never asks gh about a card without a branch, and writes nothing when gh fails', async () => {
    const quiet = fakePorts(boardWith('Doing'));
    await expect(cardFollow.run(quiet.ports, input)).resolves.toEqual({ output: '"Fix login" is not followed' });
    expect(quiet.seen.asked).toEqual([]);
    const start = boardWith('Doing', { branch: 'fix-login' });
    const offline = fakePorts(start, { pullRequestOf: async () => { throw new Error('offline'); } });
    await expect(cardFollow.run(offline.ports, input)).rejects.toThrow('offline');
    expect(offline.board()).toBe(start);
    expect(offline.seen.moves).toEqual([]);
  });
});
