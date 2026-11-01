import type { Board, Card } from './board';
import { fuzzyScore } from './fuzzy';
import type { SearchRow } from './overlay';

// One card offered by the search, as a row of the same dialog the project picker is: the name is the
// card's title and choosing it answers with the card's id. `detail` is the column the card sits in,
// and — when it was the card's writing rather than its title that matched — the line the query was
// found in, so the list says why a card is in it rather than leaving you to open each one and look.
export type CardRow = SearchRow<string>;

// A card's writing, line by line: the description first, then the trail oldest first, which is the
// order both are read in everywhere else.
function writtenLines(card: Card): string[] {
  return [card.notes, ...(card.comments ?? []).map((comment) => comment.body)]
    .flatMap((text) => text.split('\n'))
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

// The first line of the card's writing holding the query as it was typed. Literal, where a title is
// matched as a subsequence: a description is a paragraph, and a subsequence of letters spread over a
// paragraph matches almost every card there is — a search that answers "all of them" is not a search.
function writtenMatch(card: Card, query: string): string | null {
  return writtenLines(card).find((line) => line.toLowerCase().includes(query)) ?? null;
}

// What the search offers for a query: the cards whose titles match, tightest first, then the cards
// whose description or trail holds it, in board order.
//
// Titles come first whatever the match was worth. Searching a board is nearly always looking for a
// card you already know the name of; a card that merely mentions the word is the second question, and
// putting the two in one ranking would let a loose title match and a solid mention trade places as
// you type.
//
// An empty query offers every card, in board order — fuzzyScore scores a query of no letters as a
// match on everything, and a sort that cannot separate them leaves them as the board has them. So
// opening the search and pressing nothing is the board as a list.
export function cardRows(board: Board, query: string): CardRow[] {
  const written = query.trim().toLowerCase();
  const titles: { row: CardRow; score: number }[] = [];
  const mentions: CardRow[] = [];
  for (const column of board.columns) {
    for (const card of column.cards) {
      const score = fuzzyScore(card.title, query);
      if (score !== null) {
        titles.push({ row: { name: card.title, detail: column.name, choice: card.id }, score });
        continue;
      }
      const line = written === '' ? null : writtenMatch(card, written);
      if (line !== null) mentions.push({ name: card.title, detail: `${column.name} · ${line}`, choice: card.id });
    }
  }
  // Sorting is stable, so cards the query cannot separate stay in the order the board has them.
  return [...titles.sort((first, second) => first.score - second.score).map((entry) => entry.row), ...mentions];
}
