// Whether the reader is at the bottom of a scrolled box, near enough that new lines should keep the
// end in view. The main log and the agent and output sheets all follow by this one distance.
export function nearBottom(box: HTMLElement): boolean {
  return box.scrollHeight - box.scrollTop - box.clientHeight < 40;
}

type FillEntry = Pick<IntersectionObserverEntry, 'isIntersecting' | 'boundingClientRect'>;

// Whether entries the near-screen observer just filled can push the log's end down: only a fill in
// or below the visible log can. One up in the margin re-pinning would snap a reader's first small
// scroll up back to the bottom.
export function fillReachesEnd(entries: readonly FillEntry[], top: number): boolean {
  return entries.some((each) => each.isIntersecting && each.boundingClientRect.bottom > top);
}
