// Never below 0, never above the last index. A last index below 0 - an empty list - answers 0, so a
// caller can pass `length - 1` without checking for the empty case first.
export function clampIndex(value: number, lastIndex: number): number {
  return Math.max(0, Math.min(value, lastIndex));
}
