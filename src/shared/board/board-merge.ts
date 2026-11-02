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
      if (found && !moved) {
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

// The nearest card above `id` in `ids` that is one of `stayed`, or null for none.
function stayedAbove(ids: readonly string[], id: string, stayed: ReadonlySet<string>): string | null {
  for (let at = ids.indexOf(id) - 1; at >= 0; at -= 1) {
    if (stayed.has(ids[at])) return ids[at];
  }
  return null;
}
