// Never below 0, never above the last index. A last index below 0 - an empty list - answers 0, so a
// caller can pass `length - 1` without checking for the empty case first.
export function clampIndex(value: number, lastIndex: number): number {
  return Math.max(0, Math.min(value, lastIndex));
}

// Where a selection lands once the list under it has been rebuilt: on the same thing it was on,
// wherever that has moved to. A thing that is gone leaves the selection at the position it held,
// clamped, rather than throwing it back to the top of the list.
//
// Any key compared with ===: a string for a list whose rows are named, the row's own object for one
// whose rows are not. Undefined is a selection that was on nothing, which holds the position.
export function heldIndex<Key>(keys: readonly Key[], key: Key | undefined, previous: number): number {
  const found = keys.findIndex((each) => each === key);
  return found === -1 ? clampIndex(previous, keys.length - 1) : found;
}
