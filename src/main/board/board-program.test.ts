import { mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { addCard, emptyBoard } from '../../shared/board/board';
import { BOARD_FOLDER_PATH, writeBoard } from './board-store';
import { runBoardProgram } from './board-program';

// The `board` command's write is committed, so its read must not salvage: a rename would leave the
// second run a clean board, and the next `git add -A` would commit the card as deleted.

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the board command over a card file that does not parse', () => {
  it('refuses on every run and leaves the file under its own name', async () => {
    const project = mkdtempSync(join(tmpdir(), 'board-program-'));
    writeBoard(project, addCard(emptyBoard(), { column: 1, card: 0 }, 'card', 'the card').board);
    const cards = join(project, BOARD_FOLDER_PATH, 'cards');
    writeFileSync(join(cards, 'broken.json'), '{ "id": "broken", }');
    vi.spyOn(process, 'cwd').mockReturnValue(project);
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    for (let run = 0; run < 2; run += 1) {
      // A file edit: move, ship and review are the app's, and card.move refuses the same way there.
      expect(await runBoardProgram(['set', 'card', '--priority', 'high'])).toBe(1);
      expect(String(stderr.mock.calls.at(-1)?.[0])).toContain(join(cards, 'broken.json'));
    }
    expect(readdirSync(cards).filter((name) => name.startsWith('broken'))).toEqual(['broken.json']);
  });
});
