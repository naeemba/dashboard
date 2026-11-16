import { PANE_ADDRESS, paneLink } from './pane-link';

// What the app tells main about a worker it dispatched that stopped and stayed stopped without
// reporting (stop-notices.ts). The hook knows nothing of what the worker did, so it names the worker
// and where to look. Main reads it as a prompt; the Claude screen draws it as a status line, since
// nobody typed it. A worker still paused on its own background work at the ceiling has not stopped,
// and saying so would invite main to release it and kill the work it waits on. The tail of the last
// message the worker ended a turn with says what it got to, so main need not read its session log;
// `pane report` prints more of it.
export function doneReport(name: string, id: string, paused = false, lastMessage?: string): string {
  const what = paused ? PAUSED : STOPPED;
  const said = lastMessage === undefined ? '' : ` ${LAST_SAID}${tail(lastMessage.replace(/\s+/g, ' ').trim(), NOTICE_TAIL)}`;
  return `${name} in pane ${id} (${paneLink(id)}) ${what} \`pane list\` shows where every worker stands.${said}`;
}

// How much of a worker's last message the app keeps for `pane report`, and how much a notice carries:
// the end of a message is where a worker says what it did.
export const LAST_MESSAGE_KEPT = 4000;
const NOTICE_TAIL = 600;

export function tail(text: string, characters: number): string {
  return text.length <= characters ? text : `…${text.slice(-characters)}`;
}

// What main is told about a worker the app closed (auto-release.ts) before main read a report from it:
// the close takes back any stop notice, and main would wait on a pane that is gone. The worker may
// have sent a report main has not read yet, and the pane is gone when main reads it, so nothing could
// take this back: it is worded to hold either way.
export function closedReport(name: string, id: string, reason: string): string {
  return `${name} in pane ${id} (${paneLink(id)}) was closed by the app, ${reason}. ${IF_REPORTED} \`pane list\` shows where every worker stands.`;
}

// How long a pause may last before main is told anyway (stop-notices.ts): a worker that left a dev
// server or a watcher running and forgot to report is never woken, so no later stop would come.
export const PAUSE_CEILING_MS = 30 * 60 * 1000;

const UNREPORTED = 'without sending you a report.';
const IF_REPORTED = 'If it sent you a report, that says what it did;';
const LAST_SAID = 'Its last message: ';
const STOPPED = `has stopped ${UNREPORTED}`;
const PAUSED = `has been paused for ${PAUSE_CEILING_MS / 60_000} minutes, waiting on its own background work, ${UNREPORTED}`;
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The last wording is the one main was sent at every turn end before the grace period, still in
// the conversations saved then.
const DONE_REPORT = new RegExp(`^\\S+ in pane -?\\d+:\\d+ \\(${PANE_ADDRESS.source}\\) `
  + `(?:${escape(STOPPED)}|${escape(PAUSED)}|`
  + `was closed by the app, [^,]+\\. ${escape(IF_REPORTED)}|`
  + `has finished its turn\\. ${escape(IF_REPORTED)})`
  + ` \`pane list\` shows where every worker stands\\.(?: ${escape(LAST_SAID)}.*)?$`);

// Whether a prompt is one doneReport or closedReport wrote, live or read back from a saved conversation.
export function isDoneReport(text: string): boolean {
  return DONE_REPORT.test(text);
}
