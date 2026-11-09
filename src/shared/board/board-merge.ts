import { neighbourRow, selectionOf, type Board, type Card, type CardComment, type Selection } from './board';

// The app's save, replayed onto the board as it is on disk now. The screen changes the board it last
// read or sent (`base`) into `next`; between that read and this write the `board` command may have
// moved a card, set a branch or added a comment. Writing `next` whole would put the board from before
// that command back over it: an agent moves its card to Review while you rename another one, and a
// second later the card is in Doing again with nothing on screen saying why.
//
// So the save is treated as the card-by-card difference between `base` and `next`, and that
// difference is applied to `latest`, the board read a moment before the write — the same idea as
// runBoardCommandOnLatest on the command's side. Whatever the save did not touch stays as `latest`
// has it. Where both changed the same field of one card, or both moved it, the card with the newer
// `updatedAt` wins that field (the save on a tie), and comments are the union of both trails.
//
// The board's git sync replays a checkout's uncommitted board onto origin's with this too
// (board-sync-git.ts), where `next` can be a copy many commits old: there a save that always won would
// put a stale card's column back over the newer one origin holds (board-decision-5).
//
// A `latest` of null is a file that is gone or will not parse: nothing on disk to keep, so `next` is
// written as it is. Replaying onto an empty board instead would drop every card the save did not touch.
//
// ponytail: field-level, newest card wins, with no lock between the read and the write. A card deleted
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
    const order = column.cards.map((card) => card.id);
    const baseOrder = base.columns.find((entry) => entry.name === column.name)?.cards.map((card) => card.id) ?? [];
    // The cards in this column on both boards. A neighbour the save added, deleted or took to another
    // column does not make the card beside it a move: an agent moves `b` to Review while you delete the
    // `a` above it, and `b` still goes to Review.
    const stayed = new Set(order.filter((id) => before.get(id)?.column === column.name));
    for (const [index, card] of column.cards.entries()) {
      const was = before.get(card.id);
      const found = selectionOf(result, card.id);
      const onDisk = found && result.columns[found.column].cards[found.card];
      // Deleted on disk since the screen read it: the deletion is the newer word.
      if (was && !found) continue;
      const edited = was && onDisk ? editedCard(was.card, card, onDisk) : card;
      // A reorder never beats a column change. Swap `a` and `b` while an agent takes `a` to Review, and
      // both see a new stayed card above them; counting `a` as moved would pull it back into Todo.
      const leftOnDisk = found !== null && result.columns[found.column].name !== column.name;
      const moved = !was || was.column !== column.name
        || (!leftOnDisk && stayedAbove(baseOrder, card.id, stayed) !== stayedAbove(order, card.id, stayed));
      // Both took the card to a different column: the newer move stays where the disk has it.
      const diskMovedLater = Boolean(was && found && onDisk && leftOnDisk
        && result.columns[found.column].name !== was.column && newer(onDisk, card));
      if (found && (!moved || diskMovedLater)) {
        result.columns[found.column].cards[found.card] = edited;
        continue;
      }
      if (found) removeAt(result, found);
      // A column the disk no longer has keeps nothing: the boards share one set of column names, so
      // this is a hand-edited file, and the card goes in the first column rather than off the board.
      const target = result.columns.find((entry) => entry.name === column.name) ?? result.columns[0];
      if (!target) continue;
      const ids = target.cards.map((entry) => entry.id);
      target.cards.splice(neighbourRow(ids, order, card.id) ?? Math.min(index, ids.length), 0, edited);
    }
  }
  return result;
}

// Compared as the file would hold them, which is the only equality the two writers share.
export function sameBoard(first: Board, second: Board): boolean {
  return JSON.stringify(first) === JSON.stringify(second);
}

type Placed = { card: Card; column: string };

function cardsById(board: Board): Map<string, Placed> {
  const placed = new Map<string, Placed>();
  for (const column of board.columns) {
    for (const card of column.cards) placed.set(card.id, { card, column: column.name });
  }
  return placed;
}

function removeAt(board: Board, at: Selection): void {
  board.columns[at.column].cards.splice(at.card, 1);
}

// The fields the save changed, laid over the card as it is on disk. A field the disk changed too goes
// to the newer card, and `updatedAt` is the later of the two.
//
// Comments are appended and never rewritten, so the trail is the disk's with every one of the save's
// it lacks after it, one comment being one (at, body). Counting from the base instead, as this once
// did, adds the save's comments a second time when the disk already has them: the git sync replays a
// checkout's comment onto origin, and until that checkout catches up the next replay would again.
function editedCard(was: Card, now: Card, onDisk: Card): Card {
  const merged: Record<string, unknown> = { ...onDisk };
  const diskWins = newer(onDisk, now);
  for (const key of new Set([...Object.keys(was), ...Object.keys(now)]) as Set<keyof Card>) {
    if (key === 'comments' || key === 'updatedAt' || same(was[key], now[key])) continue;
    if (diskWins && !same(was[key], onDisk[key])) continue;
    if (now[key] === undefined) delete merged[key];
    else merged[key] = now[key];
  }
  if (!diskWins && now.updatedAt !== undefined) merged.updatedAt = now.updatedAt;
  const known = new Set((onDisk.comments ?? []).map(commentKey));
  const added: CardComment[] = (now.comments ?? []).filter((comment) => !known.has(commentKey(comment)));
  if (added.length > 0) merged.comments = [...(onDisk.comments ?? []), ...added];
  return merged as Card;
}

// Whether the disk's card was changed after the save's: ISO strings sort as the times they name. A
// card with no date loses to one with a date, and a tie goes to the save.
function newer(onDisk: Card, now: Card): boolean {
  return (onDisk.updatedAt ?? '') > (now.updatedAt ?? '');
}

function same(first: unknown, second: unknown): boolean {
  return JSON.stringify(first) === JSON.stringify(second);
}

function commentKey(comment: CardComment): string {
  return JSON.stringify([comment.at ?? null, comment.body]);
}

// The nearest card above `id` in `ids` that is one of `stayed`, or null for none.
function stayedAbove(ids: readonly string[], id: string, stayed: ReadonlySet<string>): string | null {
  for (let at = ids.indexOf(id) - 1; at >= 0; at -= 1) {
    if (stayed.has(ids[at])) return ids[at];
  }
  return null;
}
