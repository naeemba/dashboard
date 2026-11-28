import { clockTime } from '../chat/chat-status';
import { PANE_ADDRESS, paneLink } from './pane-link';

// What the app tells main about a worker it dispatched that stopped and stayed stopped without
// reporting (stop-notices.ts). The hook knows nothing of what the worker did, so it names the worker
// and where to look. Main reads it as a prompt; the Claude screen draws it as a status line, since
// nobody typed it. A worker still paused on its own background work at the ceiling has not stopped,
// and saying so would invite main to release it and kill the work it waits on. The tail of the last
// message the worker ended a turn with says what it got to, so main need not read its session log;
// `pane report` prints more of it. `row` is the worker's line as `pane status` prints it, without its
// report (status-lines.ts's paneRow): its state, folder, card, branch and pull request, so main need not
// run pane list and gh pr list after every notice.
export function doneReport(name: string, id: string, row: string, paused = false, lastMessage?: string): string {
  const what = paused ? PAUSED : STOPPED;
  const said = lastMessage === undefined ? '' : ` ${LAST_SAID}${oneLineTail(lastMessage, NOTICE_TAIL)}`;
  return `${name} in pane ${id} (${paneLink(id)}) ${what} ${ROW}${row}.${said}`;
}

// The tool call a stalled worker is still in (stall.ts): its name, what its input says it does (a
// Bash call's description or command, an agent's description), and how long it has run.
export type ToolRunning = { name: string; about: string; minutes: number };

// What main is told, once, of a worker at work that has gone silent (stall.ts): drawn as a status line
// like a stop's, since nobody typed it. A call still running is named, so main can tell a long check
// from a hang before it releases the pane: a release on a bare `no sign of life` once ended a worker's
// run and its replacement did the work again.
export function stallNotice(name: string, id: string, minutes: number, row: string, tool?: ToolRunning): string {
  const what = tool === undefined ? STALLED
    : `${tool.name} has been running ${tool.minutes} minutes${tool.about === '' ? '' : `: ${tool.about}`}. ${TOOL_STALLED}`;
  return `${name} in pane ${id} (${paneLink(id)}) has shown no sign of life for ${minutes} minutes: ${what} ${ROW}${row}.`;
}

// What each main is told, once, in place of its workers' stalls, when they and everything else on the
// machine went silent together (stall.ts): asleep or frozen, not every worker stuck at once.
export function machineSilenceNotice(since: number): string {
  return `${MACHINE_SILENT} ${clockTime(since) ?? ''}. ${MACHINE_WAIT}`;
}

// How much of a worker's last message the app keeps for `pane report`, and how much a notice carries:
// the end of a message is where a worker says what it did.
export const LAST_MESSAGE_KEPT = 4000;
const NOTICE_TAIL = 600;

export function tail(text: string, characters: number): string {
  return text.length <= characters ? text : `…${text.slice(-characters)}`;
}

// The end of a worker's last message on one line, as `pane list --reports` adds it to the pane's line:
// short, so a list of ten workers stays a screen, and with no tab or newline to break the columns.
const LIST_TAIL = 200;
export const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim();
export const oneLineTail = (text: string, characters = LIST_TAIL) => tail(oneLine(text), characters);

// How long a pause may last before main is told anyway (stop-notices.ts): a worker that left a dev
// server or a watcher running and forgot to report is never woken, so no later stop would come.
export const PAUSE_CEILING_MS = 30 * 60 * 1000;

const UNREPORTED = 'without sending you a report.';
const IF_REPORTED = 'If it sent you a report, that says what it did;';
const LAST_SAID = 'Its last message: ';
const ROW = 'Its `pane status` line: ';
const STOPPED = `has stopped ${UNREPORTED}`;
const PAUSED = `has been paused for ${PAUSE_CEILING_MS / 60_000} minutes, waiting on its own background work, ${UNREPORTED}`;
const STALLED = 'no prompt has gone in and no tool has finished. It may be stuck, on a test that never ends '
  + 'for one. It keeps its pane: look at it, send it word or release it.';
const TOOL_STALLED = 'It may be stuck or only slow, a long check for one. It keeps its pane: look at it before you '
  + 'release it, since a release ends that run.';
const MACHINE_SILENT = 'Nothing on the machine has answered since';
const MACHINE_WAIT = 'No worker\'s hook, no main\'s turn and no command: it may have been asleep or frozen. Each '
  + 'worker still silent once something answers is told then.';
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The last wording is the one main was sent at every turn end before the grace period, and the
// `pane list` tail the one every notice ended with before it carried the worker's row, both still in
// the conversations saved then.
const DONE_REPORT = new RegExp(`^\\S+ in pane -?\\d+:\\d+ \\(${PANE_ADDRESS.source}\\) `
  + `(?:${escape(STOPPED)}|${escape(PAUSED)}|has shown no sign of life for \\d+ minutes: (?:${escape(STALLED)}|`
  + `\\S+ has been running \\d+ minutes(?:: .*)?\\. ${escape(TOOL_STALLED)})|`
  + `was closed by the app, [^,]+\\. ${escape(IF_REPORTED)}|`
  + `has finished its turn\\. ${escape(IF_REPORTED)})`
  + ` (?:\`pane list\` shows where every worker stands\\.(?: ${escape(LAST_SAID)}.*)?|${escape(ROW)}.*)$`);
const MACHINE_SILENCE = new RegExp(`^${escape(MACHINE_SILENT)} \\d{1,2}:\\d\\d[ap]m\\. ${escape(MACHINE_WAIT)}$`);

// The line every prompt main hands a worker ends with (workerPrompt in dispatch.ts), and so what a
// worker's prompt hook reads to tell main's prompt from one you typed (prompt-source.ts). It is
// matched on a line of its own anywhere in the prompt, not only at the end: queued prompts may reach
// the hook joined into one, with yours after main's, and a main's prompt read as yours leaves main
// waiting on a worker that finished, while the other mistake costs one extra notice.
const REPORT_ASKED = ' when done, saying what you did.';
export const reportAsk = (mainName: string) => `SendMessage to ${mainName}${REPORT_ASKED}`;
const ASKS_FOR_REPORT = new RegExp(`(?:^|\\n)[ \\t]*SendMessage to \\S+${escape(REPORT_ASKED)}[ \\t]*(?:\\r?\\n|$)`);

export function asksForReport(prompt: string): boolean {
  return ASKS_FOR_REPORT.test(prompt);
}

// Whether a prompt is one doneReport wrote, or the close notice of a build before workers-decision-1
// dropped its timer, live or read back from a saved conversation.
export function isDoneReport(text: string): boolean {
  return DONE_REPORT.test(text) || MACHINE_SILENCE.test(text);
}
