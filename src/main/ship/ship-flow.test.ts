import { mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { addCard, emptyBoard } from '../../shared/board/board';
import type { WorktreeEntry } from '../../shared/app/bridge';
import { BOARD_FOLDER_PATH, writeBoard } from '../board/board-store';
import { shipFlow } from './ship-flow';

// The ship move is a committed write, so its read must not salvage: a rename would leave the second
// run a clean board, and `git add -A` would commit the card as deleted.

describe('a resumed ship over a card file that does not parse', () => {
  it('refuses on every run and leaves the file under its own name', async () => {
    const worktreePath = mkdtempSync(join(tmpdir(), 'ship-flow-'));
    writeBoard(worktreePath, addCard(emptyBoard(), { column: 1, card: 0 }, 'card', 'the card').board);
    const cards = join(worktreePath, BOARD_FOLDER_PATH, 'cards');
    writeFileSync(join(cards, 'broken.json'), '{ "id": "broken", }');
    const entry: WorktreeEntry = {
      cardId: 'card', title: 'the card', projectPath: worktreePath, branch: 'work', worktreePath, pane: null,
      startedAt: new Date().toISOString(), reviewing: false,
    };
    const shipCard = shipFlow({
      worktrees: () => [entry],
      recordWorktree: (recorded) => recorded,
      makeWorktree: () => { throw new Error('a resumed ship makes no worktree'); },
      attachPane: () => { throw new Error('a refused ship attaches no pane'); },
      agentRunsIn: () => false,
      dropDeadWorktrees: () => undefined,
      forgetReview: () => undefined,
      queue: (_, run) => run(),
    });
    for (let run = 0; run < 2; run += 1) {
      const result = await shipCard({ projectPath: worktreePath, cardId: 'card', title: 'the card', slot: 0 });
      expect(result).toEqual({ ok: false, message: expect.stringContaining(join(cards, 'broken.json')) });
    }
    expect(readdirSync(cards).filter((name) => name.startsWith('broken'))).toEqual(['broken.json']);
  });
});
