// A turn that ends on an API error, a worker's or a main's, sent `continue` again after a wait, a few
// times, and its main told when the app gives up (workers-decision-14). Claude Code's StopFailure
// hook says the turn ended so and why, from every session the app starts (appSessionSettings); before
// it, a dropped connection left the pane idle until somebody typed `continue` by hand.

import { after } from './stop-notices';

// What a StopFailure hook names a failure a wait can outlive. A dropped connection, a stalled stream,
// a timeout and an API at capacity are all `server_error` to Claude Code; `overloaded` is the 529. An
// auth, billing, request or rate limit error comes back the same however long the wait.
const TRANSIENT_ERRORS: ReadonlySet<string> = new Set(['server_error', 'overloaded']);

// The wait before each `continue`, one per try: past the last, the app gives up.
const RESUME_DELAYS_MS = [1, 2, 5, 10].map((minutes) => minutes * 60 * 1000);

// A failure this long after the one before it starts the count again: the outage before is over.
// Longer than the last wait plus a resumed turn failing at once. The cost: a resumed turn that works
// for 20 minutes and then fails counts as the next try, not a first, and its main is told sooner.
const FRESH_AFTER_MS = 30 * 60 * 1000;

// What the app sends a session whose turn failed: what the user typed by hand.
export const RESUME_TEXT = 'continue';

export type TurnFailurePorts = {
  // Runs `run` once after `ms`, unless the answer is called first. A real timer unless a test moves
  // its own clock, which `now` reads.
  after?(ms: number, run: () => void): () => void;
  now?(): number;
  // Sends the pane RESUME_TEXT: main into its queue, a main's worker on main's turn as `pane send`
  // would, and a screen opened by hand or a turn you typed the bare text.
  resume(id: string): void;
  log(id: string, message: string): void;
  // The tries are spent: the pane's main is told. True when the pane stays given up: a failure inside
  // the window after it is only logged, not a fresh first try. Main's own notice is one more turn, and
  // counted fresh it would start the tries over for as long as the outage lasts.
  gaveUp(id: string, apiError: string, tries: number): boolean;
};

export type TurnFailures = {
  // The pane's turn ended on `apiError`, as its StopFailure hook named it.
  failed(id: string, apiError: string): void;
  // The pane began a turn: somebody else resumed it, so the `continue` waiting is called off.
  working(id: string): void;
  // The pane is no longer that worker's.
  forget(id: string): void;
};

const minutes = (ms: number): string => `${ms / 60000} min`;

export function turnFailures(ports: TurnFailurePorts, delays = RESUME_DELAYS_MS, freshAfterMs = FRESH_AFTER_MS): TurnFailures {
  const wait = ports.after ?? after;
  const now = ports.now ?? Date.now;
  // Per pane, the tries spent on the outage it is in, when its last failure came, and whether the app
  // gave up on it for good.
  const outages = new Map<string, { tries: number; at: number; givenUp: boolean }>();
  const pending = new Map<string, () => void>();

  function callOff(id: string): void {
    pending.get(id)?.();
    pending.delete(id);
  }

  return {
    failed(id, apiError) {
      callOff(id);
      if (!TRANSIENT_ERRORS.has(apiError)) {
        outages.delete(id);
        return ports.log(id, `turn ended on an API error (${apiError}), not resumed: waiting would not fix it`);
      }
      const last = outages.get(id);
      const current = last !== undefined && now() - last.at <= freshAfterMs ? last : undefined;
      if (current?.givenUp) {
        outages.set(id, { ...current, at: now() });
        return ports.log(id, `turn ended on an API error (${apiError}) again: given up already, not resumed`);
      }
      const tries = current?.tries ?? 0;
      if (tries >= delays.length) {
        ports.log(id, `turn ended on an API error (${apiError}) after ${tries} tries: given up, its main told`);
        if (ports.gaveUp(id, apiError, tries)) outages.set(id, { tries, at: now(), givenUp: true });
        else outages.delete(id);
        return;
      }
      outages.set(id, { tries: tries + 1, at: now(), givenUp: false });
      const ms = delays[tries];
      ports.log(id, `turn ended on an API error (${apiError}): \`${RESUME_TEXT}\` in ${minutes(ms)}, try ${tries + 1} of ${delays.length}`);
      pending.set(id, wait(ms, () => {
        pending.delete(id);
        ports.log(id, `sent \`${RESUME_TEXT}\`, try ${tries + 1} of ${delays.length}`);
        ports.resume(id);
      }));
    },
    working: callOff,
    forget(id) {
      callOff(id);
      outages.delete(id);
    },
  };
}

// What the pane's main is told when the app gives up on it.
export function gaveUpText(name: string, id: string, apiError: string, tries: number): string {
  return `${name} (${id}) ended its turn on an API error (${apiError}) again after the app sent it`
    + ` \`${RESUME_TEXT}\` ${tries} times, and the app has stopped trying. Send it \`${RESUME_TEXT}\``
    + ' once the API answers again.';
}
