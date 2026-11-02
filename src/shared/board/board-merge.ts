import { selectionOf, type Board, type Card, type CardComment, type Selection } from './board';

// The app's save, replayed onto the board as it is on disk now. The screen changes the board it last
// read or wrote (`base`) into `next`; between that read and this write the `board` command may have
// moved a card, set a branch or added a comment. Writing `next` whole would put the board from before
// that command back over it: an agent moves its card to Review while you rename another one, and a
// second later the card is in Doing again with nothing on screen saying why.
//
// So the save is treated as the card-by-card difference between `base` and `next`, and that
// difference is applied to `latest`, the board read a moment before the write — the same idea as
// runBoardCommandOnLatest on the command's side. Whatever the save did not touch stays as `latest`
// has it. Where both touched the same field the save wins, since it is the newer of the two.
//
// A `latest` of null is a file that is gone or will not parse: nothing on disk to keep, so `next` is
// written as it is. Replaying onto an empty board instead would drop every card the save did not touch.
//
// ponytail: field-level, last writer wins, with no lock between the read and the write. A card deleted
// on one side and edited on the other stays deleted.
export function rebaseBoardChange(base: Board, next: Board, latest: Board | null): Board {
  if (latest === null || sameBoard(base, latest)) return next;
  const result: Board = { columns: latest.columns.map((column) => ({ ...column, cards: [...column.cards] })) };
  const before = cardsById(base);
  const after = cardsById(next);

  for (const id of before.keys()) {
    const found = after.has(id) ? null : selectionOf(result, id);
    if (found) removeAt(result, found);
  }

  for (const column of next.columns) {
    for (const [index, card] of column.cards.entries()) {
      const was = before.get(card.id);
      const found = selectionOf(result, card.id);
      const onDisk = found && result.columns[found.column].cards[found.card];
      // Deleted on disk since the screen read it: the deletion is the newer word.
      if (was && !found) continue;
      const edited = was && onDisk ? editedCard(was.card, card, onDisk) : card;
      const predecessor = column.cards[index - 1]?.id ?? null;
      const moved = !was || was.column !== column.name || was.predecessor !== predecessor;
      if (found && !moved) {
        result.columns[found.column].cards[found.card] = edited;
        continue;
      }
      if (found) removeAt(result, found);
      insertAfter(result, column.name, nearestKept(result, column.cards, index), edited);
    }
  }
  return result;
}

// Compared as the file would hold them, which is the only equality the two writers share.
export function sameBoard(first: Board, second: Board): boolean {
  return JSON.stringify(first) === JSON.stringify(second);
}

type Placed = { card: Card; column: string; predecessor: string | null };

function cardsById(board: Board): Map<string, Placed> {
  const placed = new Map<string, Placed>();
  for (const column of board.columns) {
    for (const [index, card] of column.cards.entries()) {
      placed.set(card.id, { card, column: column.name, predecessor: column.cards[index - 1]?.id ?? null });
    }
  }
  return placed;
}

function removeAt(board: Board, at: Selection): void {
  board.columns[at.column].cards.splice(at.card, 1);
}

// The fields the save changed, laid over the card as it is on disk. Comments are appended and never
// rewritten, so the save's new ones go after whatever the command added rather than replacing them.
function editedCard(was: Card, now: Card, onDisk: Card): Card {
  const merged: Record<string, unknown> = { ...onDisk };
  for (const key of new Set([...Object.keys(was), ...Object.keys(now)]) as Set<keyof Card>) {
    if (key === 'comments' || JSON.stringify(was[key]) === JSON.stringify(now[key])) continue;
    if (now[key] === undefined) delete merged[key];
    else merged[key] = now[key];
  }
  const added: CardComment[] = (now.comments ?? []).slice(was.comments?.length ?? 0);
  if (added.length > 0) merged.comments = [...(onDisk.comments ?? []), ...added];
  return merged as Card;
}

// The closest card above this one on the screen's board that is still on the merged one, or null for
// the top of the column.
function nearestKept(board: Board, cards: readonly Card[], index: number): string | null {
  for (let at = index - 1; at >= 0; at -= 1) {
    if (selectionOf(board, cards[at].id)) return cards[at].id;
  }
  return null;
}

// A column the disk no longer has keeps nothing: the boards share one set of column names, so this is
// a hand-edited file, and the card goes in the first column rather than off the board.
function insertAfter(board: Board, columnName: string, predecessor: string | null, card: Card): void {
  const column = board.columns.find((entry) => entry.name === columnName) ?? board.columns[0];
  if (!column) return;
  // -1 for a null predecessor too, which is the top of the column.
  const at = column.cards.findIndex((entry) => entry.id === predecessor);
  column.cards.splice(at + 1, 0, card);
}
