// The reference to a pane that `pane run` and main's worker reports print beside the human line, and
// the Claude screen turns into a link to the pane. A pane id is `<slot>:<index>`, the manager's slot
// negative; the address is spelled out so a bare `2:1` in a reply about times or ratios is never one.

const PANE_ADDRESS = /dashboard:\/\/pane\/(-?\d+:\d+)/;

export function paneLink(id: string): string {
  return `dashboard://pane/${id}`;
}

// The text cut at every pane address: the text between them at even places, each address's pane id at
// odd ones. Text with no address in it comes back as itself, alone.
export function splitAtPaneLinks(text: string): string[] {
  return text.split(PANE_ADDRESS);
}
