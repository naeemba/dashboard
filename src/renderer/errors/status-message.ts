import { isRepeatFailure } from '../../shared/app/log-entry';

// How long a status-bar message stays, and when an error raises a desktop banner. Many owners never
// clear what they wrote: a refusal from the Claude screen sat on the bar until the app restarted.
// So every message goes by itself, a notice after a short read and an error after a long one, and a
// longer sentence is given the time it takes to read (errors-decision-5).
export const NOTICE_LIFETIME_MS = 8_000;
export const ERROR_LIFETIME_MS = 20_000;
// About fifteen characters a second, read slowly.
const READING_MS_PER_CHARACTER = 70;

export type StatusKind = 'notice' | 'error';

export function messageLifetime(kind: StatusKind, message: string): number {
  const floor = kind === 'error' ? ERROR_LIFETIME_MS : NOTICE_LIFETIME_MS;
  return Math.max(floor, message.length * READING_MS_PER_CHARACTER);
}

// A banner only for an error, only while the window is not in front (you are already looking at the
// bar otherwise), only with settings errors.notify on, and once a minute per sentence: a failure on a
// timer would otherwise raise one every tick. `lastRaised` is recorded only when a banner is due, so
// an error first seen with the window focused still raises one when it repeats after you look away.
export function raisesErrorBanner(
  lastRaised: Map<string, number>, message: string, at: number, windowFocused: boolean, enabled: boolean,
): boolean {
  if (message === '' || windowFocused || !enabled) return false;
  return !isRepeatFailure(lastRaised, message, at);
}
