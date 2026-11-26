import { describe, expect, it } from 'vitest';
import { paneCardIn, statusText, type PaneStatus } from './status-lines';
import { emptyBoard, type Board } from '../../shared/board/board';
import type { WorktreeEntry } from '../../shared/app/bridge';
import type { OpenPullRequest } from '../board/merge-request';

const pull = (number: number, branch: string, checks: unknown[]): OpenPullRequest => ({
  branch, pull: { number, state: 'OPEN', title: `title ${number}`, url: '', statusCheckRollup: checks },
});

const card = { id: '443e305a-652e', title: 'Status', column: 'Doing', branch: 'status-branch' };
const cardPane: PaneStatus = { line: '1:2\tW2\trunning', directory: '/w/a', card, report: 'pushed' };
const shellPane: PaneStatus = { line: '1:3\tW3\tidle', directory: '/project', report: '' };

describe('statusText', () => {
  it('puts each card pane beside its pull request and lists the ones no pane holds', () => {
    const text = statusText([cardPane, shellPane], [
      pull(5, 'status-branch', [{ status: 'IN_PROGRESS' }]),
      pull(4, 'other', [{ status: 'COMPLETED', conclusion: 'FAILURE' }]),
    ]);
    expect(text).toBe([
      '1:2\tW2\trunning\t443e305a Doing "Status"\tstatus-branch\t#5 running\tpushed',
      '1:3\tW3\tidle\t/project',
      '',
      'open pull requests no pane holds:',
      '#4 failed\tother\ttitle 4',
    ].join('\n'));
  });

  it('says a card has no open pull request, and adds no section when every one is held', () => {
    const text = statusText([cardPane], [pull(5, 'status-branch', [])]);
    expect(text).toBe('1:2\tW2\trunning\t443e305a Doing "Status"\tstatus-branch\t#5 open\tpushed');
    expect(statusText([{ ...cardPane, card: { ...card, column: null } }], [])).toContain('off the board');
    expect(statusText([cardPane], [])).toContain('no open pr');
  });

  it('still prints the panes when the forge could not answer', () => {
    expect(statusText([shellPane], 'gh: not logged in')).toBe('1:3\tW3\tidle\t/project\n\nopen pull requests unknown: gh: not logged in');
  });
});

describe('paneCardIn', () => {
  const entry: WorktreeEntry = {
    cardId: 'card-1', title: 'Old title', projectPath: '/p', branch: 'fix-it', worktreePath: '/w', pane: 2, startedAt: '', reviewing: false,
  };
  const board: Board = {
    columns: emptyBoard().columns.map((each) => (each.name === 'Review'
      ? { ...each, cards: [{ id: 'card-1', title: 'Fix it', notes: '', priority: 'medium', parent: null }] } : each)),
  };

  it('reads the card the pane\'s record names off the board', () => {
    expect(paneCardIn([entry], '/p', 2, () => board)).toEqual({ id: 'card-1', title: 'Fix it', column: 'Review', branch: 'fix-it' });
  });

  it('keeps the record\'s title for a card off the board, and is undefined for a pane with no record', () => {
    expect(paneCardIn([entry], '/p', 2, () => null)).toEqual({ id: 'card-1', title: 'Old title', column: null, branch: 'fix-it' });
    expect(paneCardIn([entry], '/p', 3, () => board)).toBeUndefined();
    expect(paneCardIn([entry], '/q', 2, () => board)).toBeUndefined();
  });
});
