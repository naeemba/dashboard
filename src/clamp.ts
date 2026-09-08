// Never below 0, never above the limit. A limit below 0 - an empty list - answers 0, so a caller can
// pass `length - 1` without checking for the empty case first.
export function clamp(value: number, limit: number): number {
  return Math.max(0, Math.min(value, limit));
}
