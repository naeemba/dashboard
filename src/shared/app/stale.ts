// Whether an answer is due to be asked for again. Never read counts as due. Shared by the manager's
// reads in the renderer and the size measuring in main, so it lives in neither.
export function isStale(readAt: number | undefined, now: number, maxAge: number): boolean {
  return readAt === undefined || now - readAt >= maxAge;
}
