import { baseName } from './base-name';
import { claudeArguments } from './shell';
import { paneLabel } from './terminals';

// How a project's main session and the workers it dispatches into are started: their names, the
// prompt main is given about dispatching, and the hooks that make a worker report back whether or not
// it remembers to. What happens to a running one is session-requests.ts's.

// The project's name as it can go in a session name: SendMessage addresses a session by it, and a
// space or a slash there is one more thing to quote in a message.
function slug(projectPath: string): string {
  return baseName(projectPath).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'project';
}

// `main-<project>` rather than the card's plain `main`: every open project has one, and two sessions
// both called main are two a worker's SendMessage cannot tell apart.
export function mainSessionName(projectPath: string): string {
  return `main-${slug(projectPath)}`;
}

// After its pane, so the name in the title and the label on the pane say the same number.
export function workerSessionName(projectPath: string, index: number): string {
  return `${slug(projectPath)}-${paneLabel(index).replace(' ', '-')}`;
}

// The one line about what a pane is for, as the card has it, and the commands that dispatch one.
// Appended to Claude Code's own system prompt, so main is still an ordinary session otherwise.
export function mainPrompt(projectPath: string): string {
  return [
    `You are the main session of ${baseName(projectPath)}, in the Dashboard app's left-hand pane. The panes`
      + ' on the right are workers: you dispatch tasks into them rather than running them yourself.',
    '',
    'Dispatch rule: a pane is for a task I asked for (do X, review X, research X), never for a lookup you'
      + ' need mid-task; those stay inline or in the Agent tool.',
    '',
    'Dispatch with the session command, `node "$DASHBOARD_SESSION"`:',
    '  claim                  open a worker pane; prints its id',
    '  run <id> [--card <card id> | --worktree] "<prompt>"',
    '                         start Claude in that pane with the prompt',
    '  list                   every pane, and whether its worker is running, blocked or done',
    '  release <id>           close the pane once you have its report',
    '',
    'A card task takes --card: it runs in the worktree the board made when the card moved to Ship. Any'
      + ' other change takes --worktree: a throwaway worktree, removed on release once the worker has'
      + ' committed, pushed and opened its pull request, and kept otherwise. Research takes neither and'
      + ' reads this checkout.',
    '',
    `Each worker is told to SendMessage you, as ${mainSessionName(projectPath)}, when it is done. A worker`
      + ' whose turn ends without doing so is marked done anyway, and `list` says so.',
  ].join('\n');
}

// The hooks a worker runs under, beside whatever the user's own settings hold. Stop is the end of the
// worker's turn, which for a worker given one task is the task finished or given up on — so main
// hears about a worker that crashed or forgot to write. permission_prompt is the one Notification
// that needs a person; the app marks the pane and raises a banner. A prompt submitted, or a tool that
// has run (so any permission was granted), is the worker back at work, which takes either mark off.
// None of them reads the pane's screen.
export function workerSettings(id: string): string {
  const notify = (state: string) => ({ type: 'command', command: `node "$DASHBOARD_SESSION" notify ${id} ${state}` });
  return JSON.stringify({
    hooks: {
      Stop: [{ hooks: [notify('done')] }],
      Notification: [{ matcher: 'permission_prompt', hooks: [notify('blocked')] }],
      UserPromptSubmit: [{ hooks: [notify('running')] }],
      PostToolUse: [{ hooks: [notify('running')] }],
    },
  });
}

// The prompt is the argument, never typed into a session already running: what a live prompt box
// does with pasted text depends on what it was doing when it arrived.
export function workerArguments(shellCommand: string, projectPath: string, id: string, index: number, prompt: string): string[] {
  return claudeArguments(shellCommand, [
    '--name', workerSessionName(projectPath, index),
    '--permission-mode', 'auto',
    '--settings', workerSettings(id),
    `${prompt}\n\nSendMessage to ${mainSessionName(projectPath)} when done, saying what you did.`,
  ]);
}

// A worker main dispatched, resumed after a restart in pane `id`: the same flags it was started with, so
// it still works unasked and its hooks report to the pane it is in now rather than the one it was in.
export function workerResumeArguments(shellCommand: string, id: string, session: string): string[] {
  return claudeArguments(shellCommand, ['--resume', session, '--permission-mode', 'auto', '--settings', workerSettings(id)]);
}
