import { singleFlight } from '../app/single-flight';

// The refresh button and key beside the Claude screen's meters: the session's usage read now, rather
// than at the end of the next turn.
//
// - A press while a read is running does nothing, and the button spins until it ends (single-flight.ts).
// - A read that fails, or finds no session running, says so. The meters keep the numbers they had:
//   only a reading that came back replaces them (chat-context-view.ts).
export const NOT_RUNNING = 'Nothing to refresh: the session is not running.';

export function createMeasureRefresh(
  read: () => Promise<unknown>, onBusy: (busy: boolean) => void, say: (message: string) => void, fail: (error: unknown) => void,
): () => void {
  return singleFlight(() => read().then((reading) => { if (reading === null) say(NOT_RUNNING); }, fail), onBusy);
}
