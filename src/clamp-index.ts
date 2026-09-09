// Never below 0, never above the last index. A last index below 0 - an empty list - answers 0, so a
// caller can pass `length - 1` without checking for the empty case first.
export function clampIndex(value: number, lastIndex: number): number {
  return Math.max(0, Math.min(value, lastIndex));
}

// Where a selection lands once the list under it has been rebuilt: on the same thing it was on,
// wherever that has moved to. A thing that is gone leaves the selection at the position it held,
// clamped, rather than throwing it back to the top of the list.
// Both lists that redraw under their own selection ask this - the manager's rows and the boards on its
// board - so a fix to how a selection survives a redraw reaches both.
export function heldIndex(keys: readonly string[], key: string, previous: number): number {
  const found = keys.indexOf(key);
  return found === -1 ? clampIndex(previous, keys.length - 1) : found;
}
