import type { Board } from '../../shared/board/board';

// The board screen's saves, sent one at a time. Each save goes out beside the board this screen last
// read or sent (`base`), so main can replay only what the screen changed onto the file as it is now;
// board-merge.ts says why.
//
// One at a time, and `base` picked when the save goes out rather than when it was asked for: a save
// that fails leaves the file as it was, so the next one has to carry that change too. Sent side by
// side, the second would go out on the first's board before the first had failed, and you rename a
// card, move another, the first write hits a busy file, and the rename is quietly gone.
//
// A save that lands makes the board it sent the next base, never the board main answered with. The
// screen builds its next board from the one it sent, so main's merged answer as base would read the
// change main kept as one the screen undid: an agent moves `b` to Review, you rename `a` twice before
// the re-read lands, and the second save puts `b` back in Todo. The answer reaches the screen through
// the re-read, and `read` makes it the base then.
//
// A read that lands while a save is out wins over that save's board: the screen is rebuilt from the
// read, so the save's board as base would make the next save undo it. You rename `a` twice, the re-read
// after the first rename lands while the second is out, and renaming `b` next would put `a` back.
export type BoardSaves = {
  // A board just read from the file.
  read(board: Board): void;
  // Settles with the board main wrote when it differs from `board`, else null; rejects when the write
  // failed.
  save(board: Board): Promise<Board | null>;
};

export function createBoardSaves(
  write: (base: Board, board: Board) => Promise<Board | null>,
  initial: Board,
): BoardSaves {
  let base = initial;
  let reads = 0;
  let previous: Promise<unknown> = Promise.resolve();
  return {
    read: (board) => { base = board; reads += 1; },
    save: (board) => {
      let readsWhenSent = 0;
      const sent = previous.then(() => { readsWhenSent = reads; return write(base, board); });
      previous = sent.then(() => { if (reads === readsWhenSent) base = board; }, () => undefined);
      return sent;
    },
  };
}
