import { PANE_ADDRESS, paneLink } from './pane-link';

// What the app tells main about a worker it dispatched that stopped and stayed stopped without
// reporting (stop-notices.ts). The hook knows nothing of what the worker did, so it names the worker
// and where to look. Main reads it as a prompt; the Claude screen draws it as a status line, since
// nobody typed it. A worker still paused on its own background work at the ceiling has not stopped,
// and saying so would invite main to release it and kill the work it waits on.
export function doneReport(name: string, id: string, paused = false): string {
  const what = paused ? PAUSED : STOPPED;
  return `${name} in pane ${id} (${paneLink(id)}) ${what} \`pane list\` shows where every worker stands.`;
}

// What main is told about a worker the app closed (auto-release.ts) before main read a report from it:
// the close takes back any stop notice, and main would wait on a pane that is gone.
export function closedReport(name: string, id: string, reason: string): string {
  return `${name} in pane ${id} (${paneLink(id)}) was closed by the app, ${reason}, ${UNREPORTED} \`pane list\` shows where every worker stands.`;
}

// How long a pause may last before main is told anyway (stop-notices.ts): a worker that left a dev
// server or a watcher running and forgot to report is never woken, so no later stop would come.
export const PAUSE_CEILING_MS = 30 * 60 * 1000;

const UNREPORTED = 'without sending you a report.';
const STOPPED = `has stopped ${UNREPORTED}`;
const PAUSED = `has been paused for ${PAUSE_CEILING_MS / 60_000} minutes, waiting on its own background work,`
  + ' without sending you a report.';
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The second wording is the one main was sent at every turn end before the grace period, still in
// the conversations saved then.
const DONE_REPORT = new RegExp(`^\\S+ in pane -?\\d+:\\d+ \\(${PANE_ADDRESS.source}\\) `
  + `(?:${escape(STOPPED)}|${escape(PAUSED)}|`
  + `was closed by the app, [^,]+, ${escape(UNREPORTED)}|`
  + 'has finished its turn\\. If it sent you a report, that says what it did;)'
  + ' `pane list` shows where every worker stands\\.$');

// Whether a prompt is one doneReport or closedReport wrote, live or read back from a saved conversation.
export function isDoneReport(text: string): boolean {
  return DONE_REPORT.test(text);
}
