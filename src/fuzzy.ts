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
