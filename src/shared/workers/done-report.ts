import { PANE_ADDRESS, paneLink } from './pane-link';

// What the app tells main about a worker it dispatched that stopped and stayed stopped without
// reporting (stop-notices.ts). The hook knows nothing of what the worker did, so it names the worker
// and where to look. Main reads it as a prompt; the Claude screen draws it as a status line, since
// nobody typed it.
export function doneReport(name: string, id: string): string {
  return `${name} in pane ${id} (${paneLink(id)}) has stopped without sending you a report.`
    + ' `pane list` shows where every worker stands.';
}

// The second wording is the one main was sent at every turn end before the grace period, still in
// the conversations saved then.
const DONE_REPORT = new RegExp(`^\\S+ in pane -?\\d+:\\d+ \\(${PANE_ADDRESS.source}\\) `
  + '(?:has stopped without sending you a report\\.|has finished its turn\\. If it sent you a report, that says what it did;)'
  + ' `pane list` shows where every worker stands\\.$');

// Whether a prompt is one doneReport wrote, live or read back from a saved conversation.
export function isDoneReport(text: string): boolean {
  return DONE_REPORT.test(text);
}
