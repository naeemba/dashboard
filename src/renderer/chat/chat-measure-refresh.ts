import { singleFlight } from '../app/single-flight';

// The refresh button and key beside the Claude screen's meters: the session's usage read now, rather
// than at the end of the next turn.
//
// - A press while a read is running does nothing, and the button spins until it ends (single-flight.ts).
// - A read that fails, or finds no session running, says so. The meters keep the numbers they had:
//   only a reading that came back replaces them (chat-context-view.ts). A reading that lands, from this
//   key or from a turn ending (`landed`), clears what a press put up and nothing else; a message
//   written over it before the next reading goes too, since this cannot see who wrote the bar last.
// - `null` from `chatMeasure` means no session to measure and nothing else (bridge.ts); a new reason
//   for main to answer null changes that contract and this sentence with it.
export const NOT_RUNNING = 'Nothing to refresh: the session is not running.';

export type MeasureRefresh = {
  refresh: () => void;
  // A reading came back from any ask: clear what a press left on the bar, if anything.
  landed: () => void;
};

export function createMeasureRefresh(
  read: () => Promise<unknown>, onBusy: (busy: boolean) => void, say: (message: string) => void, fail: (error: unknown) => void,
): MeasureRefresh {
  let posted = false;
  const post = (message: string): void => {
    posted = message !== '';
    say(message);
  };
  const failed = (error: unknown): void => {
    posted = true;
    fail(error);
  };
  const landed = (): void => {
    if (posted) post('');
  };
  return {
    refresh: singleFlight(() => read().then((reading) => (reading === null ? post(NOT_RUNNING) : landed()), failed), onBusy),
    landed,
  };
}
