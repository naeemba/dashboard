// Where each card sits in its column, as the number written into its own file. A board kept one file
// per card has nowhere else to put the order, and the number is chosen so that a move rewrites only
// the card that moved: two branches that each move a different card then touch different files, and
// git merges them without asking anybody.
//
// `previous` is the number the card's file holds now, or undefined when the card is new to this column.
// The cards whose numbers are already in the right order keep them — the longest such run, so as many
// files as possible stay byte for byte what they were — and every other card is given a number between
// its kept neighbours. Ties are broken by id, the same way a read sorts them, so two cards two branches
// both added at the top with the same number read back in one order everywhere.
//
// ponytail: halving a gap runs out after about fifty inserts into the same spot, and an insert between
// two tied cards has no room at all. Both renumber the whole column 0, 1, 2…, which rewrites every card
// in it once. Fine at the rate people move cards; strings that sort between any two (fractional
// indexing) are the upgrade if it ever shows up as merge conflicts.
export type OrderedCard = { id: string; previous: number | undefined };

function before(first: OrderedCard, second: OrderedCard): boolean {
  if (first.previous === undefined || second.previous === undefined) return false;
  return first.previous < second.previous || (first.previous === second.previous && first.id < second.id);
}

// The cards that keep their number: the longest run already in order. O(n²), and a column is short.
function keptCards(cards: readonly OrderedCard[]): Set<number> {
  const length: number[] = [];
  const back: number[] = [];
  let best = -1;
  cards.forEach((card, index) => {
    length[index] = card.previous === undefined ? 0 : 1;
    back[index] = -1;
    if (card.previous === undefined) return;
    for (let earlier = 0; earlier < index; earlier += 1) {
      if (length[earlier] > 0 && length[earlier] + 1 > length[index] && before(cards[earlier], card)) {
        length[index] = length[earlier] + 1;
        back[index] = earlier;
      }
    }
    if (best === -1 || length[index] > length[best]) best = index;
  });
  const kept = new Set<number>();
  for (let index = best; index !== -1; index = back[index]) kept.add(index);
  return kept;
}

export function cardOrders(cards: readonly OrderedCard[]): number[] {
  const kept = keptCards(cards);
  const orders = cards.map((card, index) => (kept.has(index) ? card.previous ?? index : Number.NaN));
  for (let start = 0; start < cards.length;) {
    if (kept.has(start)) {
      start += 1;
      continue;
    }
    let end = start;
    while (end < cards.length && !kept.has(end)) end += 1;
    const low = start > 0 ? orders[start - 1] : undefined;
    const high = end < cards.length ? orders[end] : undefined;
    const count = end - start;
    for (let step = 0; step < count; step += 1) {
      if (low === undefined && high === undefined) orders[start + step] = start + step;
      else if (low === undefined) orders[start + step] = (high as number) - (count - step);
      else if (high === undefined) orders[start + step] = low + step + 1;
      else orders[start + step] = low + ((high - low) * (step + 1)) / (count + 1);
    }
    start = end;
  }
  // A number that landed on a neighbour — the gap was used up, or there was none between two tied
  // cards — would read back in the wrong place. Equal is fine only for two kept cards, whose ids
  // already put them in order.
  for (let index = 1; index < orders.length; index += 1) {
    const tiedAndKept = orders[index] === orders[index - 1] && kept.has(index) && kept.has(index - 1);
    if (!(orders[index] > orders[index - 1]) && !tiedAndKept) return cards.map((_card, position) => position);
  }
  return orders;
}
