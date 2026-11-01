// Subsequence matching, the rule every fuzzy finder uses: the query matches when its letters appear in
// order, not necessarily together. The score is the span the match covers, so the tightest match wins.
export function fuzzyScore(text: string, query: string): number | null {
  const haystack = text.toLowerCase();
  let start = -1;
  let index = -1;
  for (const character of query.toLowerCase()) {
    if (character === ' ') continue;
    index = haystack.indexOf(character, index + 1);
    if (index === -1) return null;
    if (start === -1) start = index;
  }
  return index - start;
}

// The items whose text matches the query, best first; all of them in their own order for an empty
// query, since every one scores 0 and the sort is stable. That case returns early: a picker calls
// this on every keystroke, and /rewind's prompts can be long pasted text not worth lowercasing.
export function ranked<T>(items: T[], textOf: (item: T) => string, query: string): T[] {
  if (query.trim() === '') return [...items];
  return items
    .map((item) => ({ item, score: fuzzyScore(textOf(item), query) }))
    .filter((each): each is { item: T; score: number } => each.score !== null)
    .sort((one, other) => one.score - other.score)
    .map(({ item }) => item);
}

// One row of a search list: what it is called, what else is worth saying about it, and what choosing
// it answers with. The choice is the caller's own type — a project's path in the picker, a card's id
// in the board's search — so nothing about what a row means leaks into overlay.ts's dialog that draws
// it. Here rather than beside that dialog because shared code builds rows too (chat-commands.ts,
// chat-history.ts, chat-mcp.ts, chat-rewind.ts), and ranks them with the functions above.
export type SearchRow<Choice> = {
  name: string;
  detail: string;
  choice: Choice;
  // The row's own class, on top of the list's. Only a row that is not one of the things being
  // searched needs one — the picker's line that opens a folder dialog.
  className?: string;
};
