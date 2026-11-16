// Two lists holding the same things in the same order, by `same` or by identity. The page asks it of
// the elements it is about to put in a list against the ones already there: putting back the very
// elements a list holds still takes them out and in again, and the window lays the page out afresh.
export function sameItems<T>(first: readonly T[], second: readonly T[], same = (one: T, other: T) => one === other): boolean {
  return first.length === second.length && first.every((item, index) => same(item, second[index]));
}
