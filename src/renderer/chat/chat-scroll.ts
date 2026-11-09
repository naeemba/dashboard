// Whether the reader is at the bottom of a scrolled box, near enough that new lines should keep the
// end in view. The main log and the agent and output sheets all follow by this one distance.
export function nearBottom(box: HTMLElement): boolean {
  return box.scrollHeight - box.scrollTop - box.clientHeight < 40;
}
