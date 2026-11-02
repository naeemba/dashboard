// The reference to a pane that `pane run` and main's worker reports print beside the human line, and
// the Claude screen turns into a link to the pane. A pane id is `<slot>:<index>`, the manager's slot
// negative; the address is spelled out so a bare `2:1` in a reply about times or ratios is never one.

const PANE_ADDRESS = /dashboard:\/\/pane\/(-?\d+:\d+)/g;

export function paneLink(id: string): string {
  return `dashboard://pane/${id}`;
}

// Where each pane reference sits in the text, as string offsets, end exclusive.
export function paneLinks(text: string): { start: number; end: number; id: string }[] {
  return [...text.matchAll(PANE_ADDRESS)].map((match) => ({ start: match.index, end: match.index + match[0].length, id: match[1] }));
}
