import { baseName } from '../../shared/app/base-name';
import { claudeArguments } from '../../shared/panes/shell';
import { paneLabel } from '../../shared/panes/terminals';
import { projectName } from './project-names';
import { MANAGER_FOLDER } from '../manager/manager-terminals';
import { defaultPaneKind } from './pane-kind';
import { BOARD_GUARD_HOOKS } from '../board/board-guard';
import { reportAsk } from '../../shared/workers/done-report';
import { LONGEST_BACKGROUND_RUN } from '../ship/review';

// How a project's main session and the workers it dispatches into are started: their names, the
// prompt main is given about dispatching, and the hooks that make a worker report back whether or not
// it remembers to. What happens to a running one is session-requests.ts's.

// `main-<project>` rather than the card's plain `main`: every open project has one, and two sessions
// both called main are two a worker's SendMessage cannot tell apart.
export function mainSessionName(projectPath: string): string {
  return `main-${projectName(projectPath)}`;
}

// After its pane, so the name in the title and the label on the pane say the same number.
export function workerSessionName(projectPath: string, index: number): string {
  return `${projectName(projectPath)}-${paneLabel(index).replace(' ', '-')}`;
}

// What every session the app starts is told about the board, appended to Claude Code's own system
// prompt: main's and every worker's. It is here rather than in a CLAUDE.md, where it was a rule each
// agent had to remember (board-decision-8); the guard refuses the hand edit whatever the agent read.
export const BOARD_INSTRUCTIONS = [
  'The project\'s kanban board is changed only through its command, `node "$DASHBOARD_BOARD"`, which prints'
    + ' its usage when run with nothing after it; an edit of the files under .dashboard/board/ is refused.',
  'Record what you found on a card with `board comment <id> "<text>"`; `board set --notes` replaces the'
    + ' card\'s description.',
  'A card with a branch has its column moved by the app from its pull request: Doing when its agent starts,'
    + ' Review when the pull request opens, Done when it merges, Doing again when it closes unmerged. Do not'
    + ' move one yourself or record its pull request; the app finds it from the branch. A card with no'
    + ' branch, such as research, is moved by whoever works it.',
].join('\n');

// The app's own commands, allowed in the settings of every session it starts (main's screen, a worker's
// screen or terminal), so a fresh machine runs them with no rule copied into ~/.claude/settings.json.
// permissions.allow rather than autoMode.allow: Claude Code reads the second from a --settings source
// too, but one there without "$defaults" replaces the classifier's default list on a machine whose own
// settings name none, and an allow rule is decided before the classifier is asked anyway.
const APP_COMMAND_PERMISSIONS = {
  allow: [
    'Bash(node "$DASHBOARD_COMMAND" pane *)',
    'Bash(node "$DASHBOARD_COMMAND" session *)',
    'Bash(node "$DASHBOARD_BOARD" *)',
    // A reading only: `budget --cap` changes the cap, and is asked.
    'Bash(node "$DASHBOARD_COMMAND" budget)',
  ],
};

// What every session the app starts carries in its settings, whatever else its own adds: the board
// guard (board-guard.ts) and the app's commands allowed. One object, so a screen and a terminal worker
// cannot drift apart.
export const APP_SESSION_SETTINGS = { hooks: BOARD_GUARD_HOOKS, permissions: APP_COMMAND_PERMISSIONS };

// The one line about what a pane is for, as the card has it, and the commands that dispatch one.
// Appended to Claude Code's own system prompt, so main is still an ordinary session otherwise.
export function mainPrompt(projectPath: string, platform: string = process.platform): string {
  const manager = projectPath === MANAGER_FOLDER;
  // The manager's folder is in no project, so the board and pr commands are told which.
  const projectFlag = manager ? ' --project <name|aka>' : '';
  // What a plain run starts on this platform, so main is told: pane.dispatch's default.
  const runUsage = defaultPaneKind(platform) === 'screen'
    ? ['  run <id> [--card <card id> | --worktree] [--terminal] "<prompt>"',
      '                         start Claude in that pane with the prompt, as a Claude screen;',
      '                         --terminal runs Claude Code in its terminal instead']
    : ['  run <id> [--card <card id> | --worktree] [--screen] "<prompt>"',
      '                         start Claude Code in that pane\'s terminal with the prompt;',
      '                         --screen runs it as a Claude screen instead'];
  return [
    `You are the main session of ${manager ? 'the Dashboard manager' : baseName(projectPath)}, in the Dashboard`
      + " app's left-hand pane. The panes on the right are workers: you dispatch tasks into them rather"
      + ' than running them yourself.',
    ...(manager ? ['', `You work in ${projectPath}, about no project in particular; projects.yaml there`
      + ' describes every project.'] : []),
    '',
    'Dispatch rule: a pane is for a task I asked for (do X, review X, research X), never for a lookup you'
      + ' need mid-task; those stay inline or in the Agent tool.',
    '',
    'Dispatch with the pane command, `node "$DASHBOARD_COMMAND" pane`:',
    '  claim [--project <name|aka>]',
    '                         open a worker pane; prints its id. --project opens it on the page of',
    '                         the project of that name, opening the project if it is closed',
    ...runUsage,
    '  list [--all]           every pane, and whether its worker is running, blocked or done;',
    '                         --all across every open project',
    '  report <id>            a worker\'s line from list and the last message it ended a turn with',
    '  release <id>           close a worker\'s pane now, before the app would',
    '  finish <id>            release a worker once its card is Done or its branch merged',
    '',
    `A card is dispatched with \`node "$DASHBOARD_BOARD" ship <id>${projectFlag}\`: it makes the card's worktree, a worker`
      + ' pane and its agent. run --card is for a shipped card whose agent has stopped. Any'
      + ' other change takes --worktree: a throwaway worktree, removed on release once the worker has'
      + ' committed, pushed and opened its pull request, and kept otherwise. Research takes neither and'
      + ' reads this checkout.',
    '',
    `Land a pull request you are asked to merge with \`node "$DASHBOARD_COMMAND" pr land <n>${projectFlag}\`, run in the`
      + ` background (${LONGEST_BACKGROUND_RUN}): it waits for its checks and`
      + ' merges the commit they passed on. A land stopped at that time limit has not failed: run it once'
      + ' more, it notes the head again. To wait for anything,'
      + ' run it in the background or schedule a wake-up, never a `sleep` loop to stay awake.',
    '',
    'Check the 7-day usage with `node "$DASHBOARD_COMMAND" budget` before each round of a long unattended'
      + ' loop: it exits 0 under the cap I set once, 1 at or over it, 2 when the reading is missing or'
      + ' stale. Stop on anything but 0, and never ask me for the cap again; `budget --cap <n>` sets it.',
    '',
    `Each worker is told to SendMessage you, as ${mainSessionName(projectPath)}, when it is done. When a`
      + " worker stops with nothing left running and has not written, the app tells you so, with the end of its"
      + ' last message; `list` says done the moment its turn ends, or paused while it waits on its own background'
      + ' work. A turn the user typed into a worker is theirs, and you are told nothing of it. Read a worker\'s'
      + ' state with `report`, never its session log.',
    '',
    'The app closes a finished worker\'s pane itself: once its card is Done or Cancelled, or once you'
      + ' have read its report and sent it nothing for a while. Text you `send` an agent tells it to'
      + ' report to you too.',
    '',
    BOARD_INSTRUCTIONS,
    'So a worker you dispatch on a card is never asked to move it either.',
  ].join('\n');
}

// The hooks a worker runs under, beside whatever the user's own settings hold. Stop is the end of the
// worker's turn, which for a worker given one task is the task finished or given up on — so main
// hears about a worker that crashed or forgot to write — or a pause while its own background work
// runs, which the hook's input tells apart (stop-notices.ts). permission_prompt is the one Notification
// that needs a person; the app marks the pane and raises a banner. A prompt submitted, or a tool that
// has run (so any permission was granted), is the worker back at work, which takes either mark off.
// The prompt hook's input says who put the prompt in, which tells main's turns from yours
// (prompt-source.ts).
// None of them reads the pane's screen. PreToolUse is the board guard (board-guard.ts).
export function workerSettings(id: string): string {
  const notify = (state: string) => ({ type: 'command', command: `node "$DASHBOARD_SESSION" notify ${id} ${state}` });
  // The space after the brace is outside every string, which is what makes Windows PowerShell wrap the
  // word in quotes on its way to claude; every other space here is inside one, and without it the JSON
  // reached claude cut at each of them (windowsPowerShellWraps). JSON does not mind the space.
  return '{ ' + JSON.stringify({
    ...APP_SESSION_SETTINGS,
    hooks: {
      Stop: [{ hooks: [notify('done --stop-input')] }],
      Notification: [{ matcher: 'permission_prompt', hooks: [notify('blocked')] }],
      UserPromptSubmit: [{ hooks: [notify('running --prompt-input')] }],
      PostToolUse: [{ hooks: [notify('running')] }],
      ...APP_SESSION_SETTINGS.hooks,
    },
  }).slice(1);
}

// What a worker is handed, in a terminal or on a Claude screen: the task, and who to tell once it is done.
export function workerPrompt(prompt: string, dispatcherPath: string): string {
  return `${prompt}\n\n${reportAsk(mainSessionName(dispatcherPath))}`;
}

// What a worker runs under, started or resumed: auto mode, its hooks and the board instructions.
function workerFlags(id: string): string[] {
  return ['--permission-mode', 'auto', '--settings', workerSettings(id), '--append-system-prompt', BOARD_INSTRUCTIONS];
}

// The prompt is the argument, never typed into a session already running: what a live prompt box
// does with pasted text depends on what it was doing when it arrived. `dispatcherPath` is the project
// whose main dispatched it, which is another project's when the pane was claimed with --project: the
// worker is named for the page it is on and reports to the main that asked.
export function workerArguments(
  shellCommand: string, projectPath: string, id: string, index: number, prompt: string, dispatcherPath: string, session: string,
): string[] {
  return claudeArguments(shellCommand, [
    '--session-id', session,
    '--name', workerSessionName(projectPath, index),
    ...workerFlags(id),
    workerPrompt(prompt, dispatcherPath),
  ]);
}

// A worker main dispatched, resumed after a restart in pane `id`: the same flags it was started with, so
// it still works unasked and its hooks report to the pane it is in now rather than the one it was in.
export function workerResumeArguments(shellCommand: string, id: string, session: string): string[] {
  return claudeArguments(shellCommand, ['--resume', session, ...workerFlags(id)]);
}
