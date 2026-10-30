// How much of a streaming block the Claude screen shows on the next frame. Text arrives in bursts, a
// sentence at a time, and drawn as it lands it jumps; shown a few characters a frame it flows, the
// way claude.ai writes. Each frame takes an eighth of what is still to show, so a burst is caught up
// in a few frames and nothing lags far behind, and at least a few characters, so the tail does not
// crawl.
const MINIMUM_STEP = 3;
const SHARE = 8;

export function revealed(shown: string, target: string): string {
  // A new block, or one that was replaced, starts again from nothing.
  const start = target.startsWith(shown) ? shown.length : 0;
  const step = Math.max(MINIMUM_STEP, Math.ceil((target.length - start) / SHARE));
  return target.slice(0, start + step);
}
