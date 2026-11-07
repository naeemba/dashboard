// Which Claude screen in a worker pane is whose (workers-decision-7). One `pane run` started is
// main's worker: it is saved with the folder of the main that dispatched it, keeps the conversation it
// was started on, and its stop is told to that main. One opened by hand with New Claude is yours: it is
// saved with no dispatcher, goes where /clear, /resume, /branch and /rewind take it, and tells nobody
// when its turn ends.
export type ScreenOwner = 'main' | 'you';

// Undefined for a value this app never wrote, so a hand-edited file brings nobody back. A file from
// before New Claude names a dispatcher on every screen, so each one comes back as main's.
export function screenOwner(dispatcherPath: unknown): ScreenOwner | undefined {
  if (dispatcherPath === null) return 'you';
  return typeof dispatcherPath === 'string' ? 'main' : undefined;
}
