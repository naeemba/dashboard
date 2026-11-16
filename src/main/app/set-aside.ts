import { existsSync } from 'node:fs';

// What a JSON store's file that will not parse is renamed to, beside where it was.
export const BROKEN_SUFFIX = '.broken';

// Where a damaged file is set aside: `<file>.broken`, or `<file>.2.broken` and on when that is taken, so
// a card, a board.json or a worktrees.json that breaks twice keeps both damaged copies, and the first may
// be the one still holding the data. The first copy always has the plain name, which is what
// isCardSetAside in board-files.ts looks for.
export function setAsidePath(file: string): string {
  let candidate = `${file}${BROKEN_SUFFIX}`;
  for (let count = 2; existsSync(candidate); count += 1) candidate = `${file}.${count}${BROKEN_SUFFIX}`;
  return candidate;
}
